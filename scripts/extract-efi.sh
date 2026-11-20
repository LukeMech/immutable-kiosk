#!/bin/bash
# extract-efi.sh <image-ref> <out-dir>
#
# Copies the EFI files bootupd installs from out of a built image into one
# tree, <out-dir>/BOOT/..., <out-dir>/fedora/... (the layout of an ESP's EFI/
# directory) -- the source ensure-efi-ia32.sh fills gaps from. Handles both
# layouts (see build_files/20-efi-ia32.sh): the packages' own
# /usr/lib/efi/<pkg>/<ver>/EFI/ trees and bootupd's /usr/lib/bootupd/updates/EFI/.
#
# Run with the podman that holds the image (sudo in CI).
set -euo pipefail

IMAGE=${1:?usage: $0 <image-ref> <out-dir>}
OUT=${2:?usage: $0 <image-ref> <out-dir>}
WORK=$(mktemp -d)
CTR=$(podman create "${IMAGE}")
trap 'podman rm -f "${CTR}" >/dev/null; rm -rf "${WORK}"' EXIT

podman cp "${CTR}:/usr/lib/efi" "${WORK}/usr-lib-efi" 2>/dev/null || true
podman cp "${CTR}:/usr/lib/bootupd/updates/EFI" "${WORK}/bootupd-efi" 2>/dev/null || true

mkdir -p "${OUT}"
shopt -s nullglob
for tree in "${WORK}"/usr-lib-efi/*/*/EFI "${WORK}/bootupd-efi"; do
    [[ -d "${tree}" ]] && cp -rn "${tree}/." "${OUT}/"
done
if [[ -z "$(ls -A "${OUT}")" ]]; then
    echo "error: no EFI files in ${IMAGE} (neither /usr/lib/efi nor /usr/lib/bootupd/updates)" >&2
    exit 1
fi
find "${OUT}" -type f | sort
