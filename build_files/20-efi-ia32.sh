#!/bin/bash
# 32-bit UEFI on a 64-bit CPU (Intel Bay Trail / Cherry Trail tablets, e.g.
# HP Pro Tablet 408 G1): the firmware only runs EFI/BOOT/BOOTIA32.EFI, never
# BOOTX64.EFI. Fedora still ships the ia32 shim and GRUB; GRUB ia32 then boots
# the normal x86_64 kernel through the EFI handover protocol (Fedora builds
# the kernel with CONFIG_EFI_MIXED=y).
#
# bootupd installs the ESP from /usr/lib/bootupd/updates/, generated from
# /boot/efi when the base image was built -- so after adding EFI packages the
# metadata has to be generated again, or the new files never reach a disk.
#
# Verified after the fact in build-media.yml (scripts/ensure-efi-ia32.sh):
# the disk image must contain EFI/BOOT/BOOTIA32.EFI; if bootupd ever leaves it
# out, that script copies it in, so a release can't ship a tablet-unbootable image.

set -ouex pipefail

# bootc images ship an empty /boot/efi: reinstalling the x64 pieces puts them
# back next to the ia32 ones, so the metadata below covers both.
dnf5 install -y shim-ia32 grub2-efi-ia32
dnf5 reinstall -y shim-x64 grub2-efi-x64

ls -la /boot/efi/EFI/BOOT /boot/efi/EFI/fedora
test -f /boot/efi/EFI/BOOT/BOOTIA32.EFI

bootupctl backend generate-update-metadata

find /usr/lib/bootupd/updates -iname '*ia32*' -print
if ! find /usr/lib/bootupd/updates -iname 'BOOTIA32.EFI' | grep -q .; then
    echo "error: bootupd's update payload has no BOOTIA32.EFI" >&2
    exit 1
fi

# Back to an empty /boot like the base image ships: bootupd installs the ESP
# from /usr/lib/bootupd/updates, never from here. (installer/Containerfile
# repopulates /boot/efi, which the ISO build needs.)
rm -rf /boot/efi/EFI
