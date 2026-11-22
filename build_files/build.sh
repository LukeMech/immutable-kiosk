#!/bin/bash
# Shared system_files/ + hooks, then the variant's overlay + hooks, then
# post-build.sh, then the variant's initramfs.sh (if any).

set -ouex pipefail

VARIANT="${1:?usage: $0 <variant>}"
export VARIANT
VARIANT_DIR="/ctx/images/${VARIANT}"

cp -avf "/ctx/system_files"/. /
if [[ -d "${VARIANT_DIR}/system_files" ]]; then
    cp -avf "${VARIANT_DIR}/system_files"/. /
fi

# Hooks: NN-name.sh or NN-name.py, in one sorted order. python3 arrives with
# 10-kiosk.sh, so shared .py hooks must be numbered above 10.
run_hooks() {
    local hook
    for hook in $(printf '%s\n' "$@" | LC_ALL=C sort); do
        [[ -e "${hook}" ]] || continue
        case "$(basename "${hook}")" in
            build.sh | post-build.sh) continue ;;
            *.py) python3 "${hook}" ;;
            *) bash "${hook}" ;;
        esac
    done
}
run_hooks /ctx/*.sh /ctx/*.py
run_hooks "${VARIANT_DIR}/build_files"/*.sh "${VARIANT_DIR}/build_files"/*.py

bash /ctx/post-build.sh

# Last, once every package is in. Hardware-specific, so per variant; without
# one the stock initramfs stays.
if [[ -f "${VARIANT_DIR}/initramfs.sh" ]]; then
    bash "${VARIANT_DIR}/initramfs.sh"
fi
