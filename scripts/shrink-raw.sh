#!/bin/bash
# shrink-raw.sh <disk.raw> [margin-MiB]
# image-builder's 10 GiB image is mostly an empty btrfs root that the installer
# would write and verify byte by byte. Shrinks the root to its use plus
# <margin-MiB> (default 256: one chunk, or the first write fails before
# growroot runs), then the partition and file; GPT backup moved to the end.
# Root must be the last partition, btrfs. Needs root (loop device + mount).
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

# Default chunks are ~10% of the fs (~850 MiB here) and moving one needs that
# much contiguous space, so shrinking stalls at ENOSPC far above usage. Force
# the minimum 256 MiB chunks (kernel 6.0+), then balance repacks into them.
UUID=$(blkid -o value -s UUID "${PART}")
for kind in data metadata; do
    knob="/sys/fs/btrfs/${UUID}/allocation/${kind}/chunk_size"
    if ! echo $(( 256 * MIB )) 2>/dev/null > "${knob}"; then
        echo "note: couldn't set ${knob}, default chunk sizes (shrinks less)"
    fi
done
# Rounds: balance, resize to allocated + margin (or halfway); stop when a
# round gains < 64 MiB. (min-dev-size is unreliable after a balance.)
CUR=$(blockdev --getsize64 "${PART}")
ORIG=${CUR}
round_mib() { echo $(( ($1 + MIB - 1) / MIB * MIB )); }
for round in $(seq 1 12); do
    # No room left to repack: done.
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
# Discard stale extents left by balancing (holes on a loop device), or the
# payload compresses ~30% worse.
fstrim -v "${MNT}"
umount "${MNT}"
losetup -d "${LOOP}"
trap 'rmdir "${MNT}"' EXIT

# Partition: same start, new size (in sectors).
SECTOR=$(sfdisk --json "${IMG}" | jq -r '.partitiontable.sectorsize // 512')
START=$(sfdisk --json "${IMG}" | jq -r --argjson n "${PARTN}" '.partitiontable.partitions[$n - 1].start')
SECTORS=$(( NEW / SECTOR ))
echo "${START}, ${SECTORS}" | sfdisk --no-reread --no-tell-kernel -N "${PARTN}" "${IMG}"

# File: partition end + 33 sectors for the backup GPT, rounded up to a MiB.
END_BYTES=$(( (START + SECTORS + 33) * SECTOR ))
truncate -s $(( (END_BYTES + MIB - 1) / MIB * MIB )) "${IMG}"
sgdisk -e "${IMG}"
sgdisk -v "${IMG}"
sfdisk --dump "${IMG}"
echo "${IMG}: $(stat -c %s "${IMG}") B"
