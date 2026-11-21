#!/bin/bash
# shrink-raw.sh <disk.raw> [margin-MiB]
#
# image-builder makes a 10 GiB disk image, ~8.5 GiB of it an almost empty
# btrfs root -- and the installer writes (and reads back) every byte of it.
# Shrinks the root to what it needs plus <margin-MiB> (default 256: one
# btrfs metadata chunk -- with no unallocated space at all, the first write
# needing a new chunk would fail before growroot runs), then
# the partition and the file to match, backup GPT moved to the new end. The
# installed system grows the root to the whole eMMC on first boot anyway
# (immutable-kiosk-growroot.service).
#
# The root must be the last partition and btrfs (image-builder's layout:
# BIOS boot, ESP, /boot, root). Needs root: loop device + mount.
set -euo pipefail

IMG=${1:?usage: $0 <disk.raw> [margin-MiB]}
MARGIN_MIB=${2:-256}
MIB=$((1024 * 1024))

LOOP=$(losetup --show -fP "${IMG}")
MNT=$(mktemp -d)
cleanup() {
    mountpoint -q "${MNT}" && umount "${MNT}"
    losetup -d "${LOOP}" 2>/dev/null || true
    rmdir "${MNT}"
}
trap cleanup EXIT
udevadm settle 2>/dev/null || true

# The last partition, which must be the btrfs root.
PART=$(lsblk -lnpo NAME,TYPE "${LOOP}" | awk '$2 == "part" {print $1}' | tail -1)
PARTN=$(lsblk -rno PARTN "${PART}")
FSTYPE=$(blkid -o value -s TYPE "${PART}")
if [[ "${FSTYPE}" != btrfs ]]; then
    echo "error: last partition ${PART} is ${FSTYPE:-unknown}, not btrfs" >&2
    lsblk -o NAME,SIZE,FSTYPE "${LOOP}" >&2
    exit 1
fi

mount "${PART}" "${MNT}"
allocated() { btrfs filesystem usage -b "${MNT}" | awk '/Device allocated:/ {print $3}'; }

# btrfs sizes new data chunks at ~10% of the filesystem (max 1 GiB): on the
# 8.5 GiB root they're ~850 MiB, half empty, and moving one during a resize
# needs that much *contiguous* free space below the new end -- shrinking
# stalls at ENOSPC gigabytes above what's used. The smallest chunks the
# kernel allows instead (per-fs chunk_size knob, 6.0+: a multiple of 256 MiB,
# at least 256 MiB; data and metadata only), then a full balance repacks
# everything into them and the resize can get within a chunk or two of the
# data. The installed system's later chunks are sized normally again.
UUID=$(blkid -o value -s UUID "${PART}")
for kind in data metadata; do
    knob="/sys/fs/btrfs/${UUID}/allocation/${kind}/chunk_size"
    if ! echo $(( 256 * MIB )) 2>/dev/null > "${knob}"; then
        echo "note: couldn't set ${knob}, default chunk sizes (shrinks less)"
    fi
done
# Then in rounds: balance, aim at allocated + margin, halfway if that
# doesn't fit; stop when a round gains < 64 MiB. (Not min-dev-size: it
# counts chunk positions and grows after a balance.)
CUR=$(blockdev --getsize64 "${PART}")
ORIG=${CUR}
round_mib() { echo $(( ($1 + MIB - 1) / MIB * MIB )); }
for round in $(seq 1 12); do
    # Near the end there's no room left to repack: that's as far as it goes.
    btrfs balance start -dusage=100 -musage=100 "${MNT}" >/dev/null 2>&1 || break
    ALLOC=$(allocated)
    GOAL=$(round_mib $(( ALLOC + MARGIN_MIB * MIB )))
    if (( GOAL >= CUR - 64 * MIB )); then
        break
    fi
    if btrfs filesystem resize "${GOAL}" "${MNT}" >/dev/null 2>&1; then
        NEXT=${GOAL}
    else
        NEXT=$(round_mib $(( (CUR + GOAL) / 2 )))
        (( NEXT < CUR - 64 * MIB )) || break
        btrfs filesystem resize "${NEXT}" "${MNT}" >/dev/null 2>&1 || break
    fi
    echo "round ${round}: allocated ${ALLOC} B, ${CUR} -> ${NEXT} B"
    CUR=${NEXT}
done
btrfs filesystem usage -b "${MNT}" | sed -n '1,8p'
if (( CUR >= ORIG )); then
    echo "nothing to shrink"
    exit 0
fi
NEW=${CUR}
echo "root ${PART}: ${ORIG} -> ${NEW} B"
# Balancing left old copies of every moved extent in what's now free space:
# discard it (on a loop device that punches holes -- zeros again), or the
# payload compresses ~30% worse (1.19 -> 1.57 GB in testing).
fstrim -v "${MNT}"
umount "${MNT}"
losetup -d "${LOOP}"
trap 'rmdir "${MNT}"' EXIT

# Partition: same start, new size (in sectors).
SECTOR=$(sfdisk --json "${IMG}" | jq -r '.partitiontable.sectorsize // 512')
START=$(sfdisk --json "${IMG}" | jq -r --argjson n "${PARTN}" '.partitiontable.partitions[$n - 1].start')
SECTORS=$(( NEW / SECTOR ))
echo "${START}, ${SECTORS}" | sfdisk --no-reread --no-tell-kernel -N "${PARTN}" "${IMG}"

# File: up to the partition's end plus room for the backup GPT (33 sectors),
# rounded up to a MiB; then the backup GPT goes to the new end.
END_BYTES=$(( (START + SECTORS + 33) * SECTOR ))
truncate -s $(( (END_BYTES + MIB - 1) / MIB * MIB )) "${IMG}"
sgdisk -e "${IMG}"
sgdisk -v "${IMG}"
sfdisk --dump "${IMG}"
echo "${IMG}: $(stat -c %s "${IMG}") B"
