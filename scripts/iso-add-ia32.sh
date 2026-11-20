#!/bin/bash
# iso-add-ia32.sh <in.iso> <out.iso>
#
# Makes an image-builder bootc-generic-iso boot on 32-bit UEFI (HP Pro
# Tablet 408): image-builder only puts the x64 shim/GRUB in the ISO, so this
# adds BOOTIA32.EFI (shim ia32), grubia32.efi and mmia32.efi next to them --
# in the EFI boot image (images/efiboot.img, the appended ESP the firmware
# boots from) and in /EFI/BOOT on the ISO itself. grubia32.efi reads the same
# EFI/BOOT/grub.cfg as grubx64.efi and boots the x86_64 kernel through the
# EFI handover protocol.
#
# The ISO is then re-mastered with the same xorrisofs options image-builder
# uses (org.osbuild.xorrisofs: hybrid MBR, GPT-appended ESP, BIOS El Torito)
# and its checksum implanted again (org.osbuild.implantisomd5).
#
# Run INSIDE the installer image (it holds the signed ia32 files in
# /boot/efi/EFI, xorriso, mtools, grub2-pc-modules and isomd5sum):
#   podman run --rm -v "$PWD:/w" -w /w <installer> bash scripts/iso-add-ia32.sh in.iso out.iso
set -euo pipefail

IN=${1:?usage: $0 <in.iso> <out.iso>}
OUT=${2:?usage: $0 <in.iso> <out.iso>}
SRC=/boot/efi/EFI
MBR=/usr/lib/grub/i386-pc/boot_hybrid.img
ESP_GUID=C12A7328-F81F-11D2-BA4B-00A0C93EC93B
DATA_GUID=EBD0A0A2-B9E5-4433-87C0-68B6B72699C7
export MTOOLS_SKIP_CHECK=1

for f in "${SRC}/BOOT/BOOTIA32.EFI" "${SRC}/fedora/grubia32.efi" "${SRC}/fedora/mmia32.efi" "${MBR}"; do
    [[ -s "${f}" ]] || { echo "error: ${f} missing -- run this inside the installer image" >&2; exit 1; }
done

WORK=$(mktemp -d -p "$(dirname "$(realpath "${OUT}")")" iso-ia32.XXXXXX)
trap 'rm -rf "${WORK}"' EXIT
TREE="${WORK}/tree"

LABEL=$(xorriso -indev "${IN}" -pvd_info 2>/dev/null | sed -n 's/^Volume Id *: *//p' | head -1)
[[ -n "${LABEL}" ]] || { echo "error: no volume label in ${IN}" >&2; exit 1; }
echo "== ${IN} (label ${LABEL})"

xorriso -osirrox on -indev "${IN}" -extract / "${TREE}" >/dev/null
chmod -R u+w "${TREE}"
EFIIMG="${TREE}/images/efiboot.img"
[[ -f "${EFIIMG}" && -f "${TREE}/images/eltorito.img" ]] || { echo "error: unexpected ISO layout" >&2; find "${TREE}" -maxdepth 2 >&2; exit 1; }

for f in BOOT/BOOTIA32.EFI fedora/grubia32.efi fedora/mmia32.efi; do
    name=$(basename "${f}")
    mcopy -o -i "${EFIIMG}" "${SRC}/${f}" "::/EFI/BOOT/${name}"
    cp "${SRC}/${f}" "${TREE}/EFI/BOOT/${name}"
done
echo "EFI boot image now:"
mdir -/ -i "${EFIIMG}" ::/EFI/BOOT

rm -f "${OUT}"
xorrisofs -rock -joliet -iso-level 3 -V "${LABEL}" -sysid LINUX \
    --grub2-mbr "${MBR}" -partition_offset 16 \
    -appended_part_as_gpt -append_partition 2 "${ESP_GUID}" "${EFIIMG}" \
    -iso_mbr_part_type "${DATA_GUID}" \
    -b images/eltorito.img -c boot.cat --boot-catalog-hide \
    -no-emul-boot -boot-load-size 4 -boot-info-table --grub2-boot-info \
    -eltorito-alt-boot -e --interval:appended_partition_2:all:: -no-emul-boot \
    -o "${OUT}" "${TREE}"
implantisomd5 "${OUT}"
ls -la "${OUT}"
