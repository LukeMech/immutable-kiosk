#!/bin/bash
# 32-bit UEFI on a 64-bit CPU (Intel Bay Trail / Cherry Trail tablets, e.g.
# HP Pro Tablet 408 G1): the firmware only runs EFI/BOOT/BOOTIA32.EFI, never
# BOOTX64.EFI. Fedora still ships the ia32 shim and GRUB; GRUB ia32 then boots
# the normal x86_64 kernel through the EFI handover protocol (Fedora builds
# the kernel with CONFIG_EFI_MIXED=y).
#
# Where bootupd takes the ESP's contents from depends on the Fedora release:
#   - newer: straight from the packages' own files under /usr/lib/efi/
#     (<package>/<version>/EFI/...) -- installing the packages is enough;
#   - older: from /usr/lib/bootupd/updates/, generated from /boot/efi when
#     the base image was built, which then has to be generated again.
# In a container build /boot/efi doesn't exist, so the packages' scriptlets
# that copy into it fail harmlessly ("cannot create directory") -- expected.
#
# Verified after the fact in build-media.yml (scripts/ensure-efi-ia32.sh):
# the disk image must contain EFI/BOOT/BOOTIA32.EFI; if bootupd ever leaves it
# out, that script copies it in, so a release can't ship a tablet-unbootable image.

set -ouex pipefail

dnf5 install -y shim-ia32 grub2-efi-ia32

# Where everything landed -- the log answers "which layout" at a glance.
rpm -ql shim-ia32 grub2-efi-ia32 | grep -i '\.efi$' || true
find /usr/lib/efi /usr/lib/bootupd/updates -maxdepth 6 -iname '*.efi' 2>/dev/null || true

if [[ -d /usr/lib/bootupd/updates/EFI ]] && ! find /usr/lib/bootupd/updates -iname 'BOOTIA32.EFI' | grep -q .; then
    # Old layout: regenerate bootupd's payload so it includes the ia32 files.
    mkdir -p /boot/efi
    dnf5 reinstall -y shim-x64 grub2-efi-x64 shim-ia32 grub2-efi-ia32
    bootupctl backend generate-update-metadata
    rm -rf /boot/efi/EFI
fi

if ! find /usr/lib/efi /usr/lib/bootupd/updates -iname 'BOOTIA32.EFI' 2>/dev/null | grep -q .; then
    echo "error: no BOOTIA32.EFI anywhere bootupd installs from" >&2
    exit 1
fi
