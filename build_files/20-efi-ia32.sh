#!/bin/bash
# 32-bit UEFI on a 64-bit CPU (Bay Trail / Cherry Trail tablets): the firmware
# only runs EFI/BOOT/BOOTIA32.EFI. GRUB ia32 boots the x86_64 kernel via the
# EFI handover protocol (CONFIG_EFI_MIXED=y).
#
# bootupd's ESP source depends on the release: newer ones read /usr/lib/efi/
# straight from the packages; older ones /usr/lib/bootupd/updates/, which must
# be regenerated. Scriptlets failing to copy into the missing /boot/efi are
# harmless. build-media.yml checks the disk image again (ensure-efi-ia32.sh).

set -ouex pipefail

dnf install -y shim-ia32 grub2-efi-ia32

# Log where everything landed (which layout).
rpm -ql shim-ia32 grub2-efi-ia32 | grep -i '\.efi$' || true
find /usr/lib/efi /usr/lib/bootupd/updates -maxdepth 6 -iname '*.efi' 2>/dev/null || true

if [[ -d /usr/lib/bootupd/updates/EFI ]] && ! find /usr/lib/bootupd/updates -iname 'BOOTIA32.EFI' | grep -q .; then
    # Old layout: regenerate bootupd's payload so it includes the ia32 files.
    mkdir -p /boot/efi
    dnf reinstall -y shim-x64 grub2-efi-x64 shim-ia32 grub2-efi-ia32
    bootupctl backend generate-update-metadata
    rm -rf /boot/efi/EFI
fi

if ! find /usr/lib/efi /usr/lib/bootupd/updates -iname 'BOOTIA32.EFI' 2>/dev/null | grep -q .; then
    echo "error: no BOOTIA32.EFI anywhere bootupd installs from" >&2
    exit 1
fi
