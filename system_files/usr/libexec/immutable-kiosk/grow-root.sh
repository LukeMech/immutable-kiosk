#!/bin/bash
# Grows the root partition and its btrfs to fill the disk (the installed image
# is smaller than the eMMC). Idempotent. Uses /var: / is composefs+overlay.

set -euo pipefail

# Strip findmnt's "[/subpath]" suffix, which lsblk rejects.
ROOT_SOURCE=$(findmnt -no SOURCE /var | sed -E 's/\[.*\]$//')
# -r: the default output pads numbers (" 4"), which growpart rejects.
ROOT_DISK="/dev/$(lsblk -rno PKNAME "${ROOT_SOURCE}")"
ROOT_PART_NUM=$(lsblk -rno PARTN "${ROOT_SOURCE}")

if [[ -z "${ROOT_DISK}" || "${ROOT_DISK}" == "/dev/" || -z "${ROOT_PART_NUM}" ]]; then
    echo "error: couldn't determine the disk/partition number backing /var (source: ${ROOT_SOURCE})" >&2
    exit 1
fi

# Only a NOCHANGE failure is benign.
GROWPART_OUTPUT=$(growpart "${ROOT_DISK}" "${ROOT_PART_NUM}" 2>&1) || {
    if [[ "${GROWPART_OUTPUT}" != NOCHANGE:* ]]; then
        echo "${GROWPART_OUTPUT}" >&2
        exit 1
    fi
}

btrfs filesystem resize max /var

mkdir -p /var/lib/immutable-kiosk
echo "${ROOT_DISK} partition ${ROOT_PART_NUM}, $(date -Is)" > /var/lib/immutable-kiosk/root-grown
