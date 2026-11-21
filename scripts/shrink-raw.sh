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
# No balance first: it moves chunks towards the end of the device, which
# makes min-dev-size larger, not smaller (tried: 4.0 -> 5.8 GiB).
btrfs filesystem usage -b "${MNT}" | sed -n '1,12p'
# "<bytes> bytes (<human>)"
MIN=$(btrfs inspect-internal min-dev-size "${MNT}" | awk '{print $1}')
CUR=$(blockdev --getsize64 "${PART}")
NEW=$(( (MIN + MARGIN_MIB * MIB + MIB - 1) / MIB * MIB ))
echo "root ${PART}: ${CUR} B now, min ${MIN} B, target ${NEW} B (+${MARGIN_MIB} MiB)"
if (( NEW >= CUR )); then
    echo "nothing to shrink"
    exit 0
fi
btrfs filesystem resize "${NEW}" "${MNT}"
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
