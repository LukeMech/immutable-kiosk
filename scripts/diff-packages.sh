#!/bin/bash
# Changelog package section: rpm -qa diff of two images (added/removed/updated).
# Scheduled builds grep the output for "No package changes." to skip publishing.
# <output.tsv> (rows for merge-changelogs.sh) is written only when there's a
# previous image; no TSV means "Initial build".
#
# Usage: diff-packages.sh <previous-image-ref> <new-image-ref> <output.md> <output.tsv>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

USAGE="usage: $0 <previous-image-ref> <new-image-ref> <output.md> <output.tsv>"
PREV_IMAGE="${1:?${USAGE}}"
NEW_IMAGE="${2:?${USAGE}}"
OUTPUT="${3:?${USAGE}}"
OUTPUT_TSV="${4:?${USAGE}}"

PREV_PKGS="$(mktemp)"
NEW_PKGS="$(mktemp)"
trap 'rm -f "${PREV_PKGS}" "${NEW_PKGS}"' EXIT

rm -f "${OUTPUT_TSV}"

HAVE_PREV=0
if podman pull --quiet "${PREV_IMAGE}" >/dev/null 2>&1; then
    HAVE_PREV=1
    "${SCRIPT_DIR}/list-packages.sh" "${PREV_IMAGE}" >"${PREV_PKGS}"
else
    : >"${PREV_PKGS}"
fi

"${SCRIPT_DIR}/list-packages.sh" "${NEW_IMAGE}" >"${NEW_PKGS}"

if [[ "${HAVE_PREV}" -eq 1 ]]; then
    # join: name, prev, new ('-' if missing); prefixed with its bucket.
    : >"${OUTPUT_TSV}"
    while IFS=$'\t' read -r name prev new; do
        if [[ "${prev}" == "${new}" ]]; then
            continue
        elif [[ "${prev}" == "-" ]]; then
            kind=added
        elif [[ "${new}" == "-" ]]; then
            kind=removed
        else
            kind=updated
        fi
        printf '%s\t%s\t%s\t%s\n' "${kind}" "${name}" "${prev}" "${new}" >>"${OUTPUT_TSV}"
    done < <(join -t $'\t' -a1 -a2 -e '-' -o 0,1.2,2.2 -j1 "${PREV_PKGS}" "${NEW_PKGS}")

    "${SCRIPT_DIR}/render-package-changes.sh" "${OUTPUT_TSV}" >"${OUTPUT}"
else
    {
        echo "## Initial build"
        echo
        echo "No previous image to diff against."
        echo
    } >"${OUTPUT}"
fi

cat "${OUTPUT}"
