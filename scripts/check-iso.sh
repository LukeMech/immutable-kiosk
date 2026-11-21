#!/bin/bash
# check-iso.sh <installer.iso> <iso.yaml>
#
# 1. The root squashfs is where iso.yaml's kernel line says it is
#    (rd.live.dir/rd.live.squashimg) -- otherwise the ISO boots into a dracut
#    emergency shell. Hard failure.
# 2. The ISO boots on 32-bit UEFI: BOOTIA32.EFI in its EFI boot image.
#    Exit 2 when missing, so the caller can decide (build-media.yml fails
#    for devices with efi_ia32, ignores it for the rest). scripts/iso-add-ia32.sh
#    adds the files image-builder leaves out.
#
# Needs: xorriso, mtools.
set -euo pipefail

ISO=${1:?usage: $0 <iso> <iso.yaml>}
YAML=${2:?usage: $0 <iso> <iso.yaml>}
WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT
export MTOOLS_SKIP_CHECK=1

# Volume label: the one on the ISO, the one every boot entry looks for, and
# short enough to survive Rufus "ISO mode" (FAT32 labels: 11 characters).
LABEL=$(xorriso -indev "${ISO}" -pvd_info 2>/dev/null | sed -n 's/^Volume Id *: *//p' | head -1)
echo "== volume label: ${LABEL}"
if ((${#LABEL} > 11)); then
    echo "error: label '${LABEL}' is longer than 11 characters -- Rufus ISO mode truncates it and the live boot can't find its root" >&2
    exit 1
fi
for l in $(grep -o 'CDLABEL=[^ "]*' "${YAML}" | cut -d= -f2 | sort -u); do
    if [[ "${l}" != "${LABEL}" ]]; then
        echo "error: iso.yaml boots root=live:CDLABEL=${l}, but the ISO is labelled '${LABEL}'" >&2
        exit 1
    fi
done

echo "== ISO tree (without GRUB's module dirs)"
xorriso -indev "${ISO}" -find / -type f 2>/dev/null | sed "s/^'//; s/'$//" > "${WORK}/files"
grep -v -E '^/boot/grub2/(i386-pc|x86_64-efi|i386-efi|fonts|locale)/' "${WORK}/files" | head -150

# The kernel and initrd every boot entry loads.
missing=0
for p in $(grep -o -E '(linux|initrd): *"[^ "]+' "${YAML}" | sed -E 's/^[a-z]+: *"//' | sort -u); do
    if grep -qx "${p}" "${WORK}/files"; then
        echo "${p} -- OK"
    else
        echo "error: iso.yaml boots ${p}, but the ISO has no such file." >&2
        missing=1
    fi
done
if ((missing)); then
    echo "kernels/initrds on the ISO:" >&2
    grep -E -i 'vmlinuz|initrd' "${WORK}/files" >&2 || true
    exit 1
fi

DIR=$(grep -o 'rd.live.dir=[^ "]*' "${YAML}" | head -1 | cut -d= -f2)
IMG=$(grep -o 'rd.live.squashimg=[^ "]*' "${YAML}" | head -1 | cut -d= -f2)
WANT="/${DIR:-LiveOS}/${IMG:-squashfs.img}"
if ! grep -qx "${WANT}" "${WORK}/files"; then
    echo "error: iso.yaml boots the root from ${WANT}, but the ISO has no such file." >&2
    echo "squashfs-looking files on the ISO:" >&2
    grep -Ei '\.img$|squashfs' "${WORK}/files" >&2 || true
    exit 1
fi
echo "root squashfs: ${WANT} -- OK"

echo "== 32-bit UEFI"
ia32=0
if grep -qi 'BOOTIA32.EFI' "${WORK}/files"; then
    ia32=1
fi
# The El Torito EFI image (a FAT image file, or an appended partition).
while read -r f; do
    xorriso -osirrox on -indev "${ISO}" -extract "${f}" "${WORK}/efiboot.img" >/dev/null 2>&1 || continue
    echo "EFI boot image ${f}:"
    mdir -/ -i "${WORK}/efiboot.img" ::/EFI || true
    if mdir -/ -i "${WORK}/efiboot.img" ::/EFI 2>/dev/null | grep -qi 'BOOTIA32'; then
        ia32=1
    fi
done < <(grep -i 'efiboot.img$' "${WORK}/files" || true)

if ((ia32)); then
    echo "BOOTIA32.EFI present -- boots on 32-bit UEFI"
else
    echo "BOOTIA32.EFI NOT found -- this ISO won't boot on 32-bit UEFI (e.g. HP Pro Tablet 408)" >&2
    exit 2
fi
