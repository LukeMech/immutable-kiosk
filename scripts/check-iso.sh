#!/bin/bash
# check-iso.sh <installer.iso> <iso.yaml>
# Checks the ISO against iso.yaml (label, kernel/initrd, root squashfs, GRUB
# timeout): exit 1 on mismatch. Missing BOOTIA32.EFI exits 2 so the caller
# decides per device (efi_ia32). Needs: xorriso, mtools.
set -euo pipefail

ISO=${1:?usage: $0 <iso> <iso.yaml>}
YAML=${2:?usage: $0 <iso> <iso.yaml>}
WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT
export MTOOLS_SKIP_CHECK=1

# Must match every boot entry's CDLABEL and fit FAT32's 11 characters
# (Rufus "ISO mode" truncates longer ones).
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

# iso.yaml's grub2.timeout must reach every grub.cfg (an old image-builder
# silently keeps 60 s).
WANT_T=$(sed -n 's/^ *timeout: *\([0-9]*\).*/\1/p' "${YAML}" | head -1)
if [[ -n "${WANT_T}" ]]; then
    for cfg in /EFI/BOOT/grub.cfg /boot/grub2/grub.cfg; do
        grep -qx "${cfg}" "${WORK}/files" || continue
        xorriso -osirrox on -indev "${ISO}" -extract "${cfg}" "${WORK}/grub.cfg" >/dev/null 2>&1
        got=$(sed -n 's/^ *set timeout=\([0-9]*\).*/\1/p' "${WORK}/grub.cfg" | head -1)
        rm -f "${WORK}/grub.cfg"
        if [[ "${got}" != "${WANT_T}" ]]; then
            echo "error: ${cfg} has timeout=${got:-unset}, iso.yaml asks for ${WANT_T} (image-builder too old for grub2.timeout?)" >&2
            exit 1
        fi
        echo "${cfg}: timeout=${got} -- OK"
    done
fi

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
