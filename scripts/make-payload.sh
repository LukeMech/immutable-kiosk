#!/bin/bash
# make-payload.sh <disk.raw> <out-dir> <image-ref> <version>
# Installer payload: disk.raw.zst plus payload.json, whose size/sha256 are of
# the *uncompressed* image (progress total, post-write verification).
set -euo pipefail

RAW=${1:?usage: $0 <disk.raw> <out-dir> <image-ref> <version>}
OUT=${2:?}
REF=${3:?}
VERSION=${4:?}

mkdir -p "${OUT}"
SIZE=$(stat -c %s "${RAW}")
SHA=$(sha256sum "${RAW}" | cut -d' ' -f1)
zstd -T0 -10 --force "${RAW}" -o "${OUT}/disk.raw.zst"
jq -n --arg image "${REF}" --arg version "${VERSION}" --argjson size "${SIZE}" --arg sha256 "${SHA}" \
    '{image: $image, version: $version, size: $size, sha256: $sha256}' > "${OUT}/payload.json"
cat "${OUT}/payload.json"
ls -la "${OUT}"
