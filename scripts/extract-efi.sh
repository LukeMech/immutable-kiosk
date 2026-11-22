#!/bin/bash
# extract-efi.sh <image-ref> <out-dir>
# Copies an image's bootupd EFI files into one ESP-style EFI/ tree for
# ensure-efi-ia32.sh; handles both layouts (see 20-efi-ia32.sh).
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
