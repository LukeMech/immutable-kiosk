#!/bin/bash
# ensure-efi-ia32.sh <disk.raw> <efi-dir>
# The ESP must hold EFI/BOOT/BOOTIA32.EFI (all 32-bit firmware runs without an
# NVRAM entry, which dd never creates) plus the ia32 shim/GRUB in EFI/fedora/.
# bootupd normally installs them; any it left out are copied from <efi-dir>
# (extract-efi.sh output). Needs: sfdisk, mtools, jq.
set -euo pipefail

IMG=${1:?usage: $0 <disk.raw> <efi-dir>}
SRC=${2:?usage: $0 <disk.raw> <efi-dir>}

ESP_GUID="C12A7328-F81F-11D2-BA4B-00A0C93EC93B"
read -r START SECTOR < <(sfdisk --json "${IMG}" | jq -r --arg g "${ESP_GUID}" '
    .partitiontable as $t | $t.partitions[] | select(.type == $g) | "\(.start) \($t.sectorsize // 512)"' | head -1)
if [[ -z "${START:-}" ]]; then
    echo "error: no EFI system partition in ${IMG}" >&2
    sfdisk --dump "${IMG}" >&2
    exit 1
fi
ESP="${IMG}@@$((START * SECTOR))"
export MTOOLS_SKIP_CHECK=1

has() { mdir -i "${ESP}" "::/$1" >/dev/null 2>&1; }

echo "ESP of ${IMG} (offset $((START * SECTOR))) before:"
mdir -/ -i "${ESP}" ::/EFI || true

copied=0
while IFS= read -r -d '' f; do
    rel=${f#"${SRC%/}/"}
    if ! has "EFI/${rel}"; then
        dir=$(dirname "EFI/${rel}")
        mmd -D s -i "${ESP}" "::/${dir}" 2>/dev/null || true
        mcopy -i "${ESP}" "${f}" "::/EFI/${rel}"
        echo "added EFI/${rel}"
        copied=$((copied + 1))
    fi
done < <(find "${SRC}" -type f \( -iname '*ia32*' -o -iname 'BOOTIA32.CSV' \) -print0)

for need in EFI/BOOT/BOOTIA32.EFI; do
    if ! has "${need}"; then
        echo "error: ${need} still missing from the ESP (and from ${SRC})" >&2
        exit 1
    fi
done
if ! has EFI/fedora/grub.cfg; then
    echo "warning: EFI/fedora/grub.cfg missing -- grubia32.efi will drop to a GRUB prompt" >&2
fi

if ((copied)); then
    echo "Copied ${copied} ia32 file(s) bootupd had left out. ESP after:"
    mdir -/ -i "${ESP}" ::/EFI
else
    echo "ESP already had every ia32 file -- nothing to add."
fi
