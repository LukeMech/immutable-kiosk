#!/bin/bash
# Same shape as immutable-sbc's build.sh: shared system_files/ + numbered
# hooks, then the variant's own overlay + hooks, then post-build.sh, then the
# variant's initramfs.sh (if it has one) last.

set -ouex pipefail

VARIANT="${1:?usage: $0 <variant>}"
export VARIANT
VARIANT_DIR="/ctx/images/${VARIANT}"

cp -avf "/ctx/system_files"/. /
if [[ -d "${VARIANT_DIR}/system_files" ]]; then
    cp -avf "${VARIANT_DIR}/system_files"/. /
fi

# Device table, read at runtime by kiosk-shell (default rotation per model).
install -Dm0644 /ctx/images/devices.toml /usr/share/immutable-kiosk/devices.toml

# Hooks: NN-name.sh (bash) or NN-name.py (python3), in one sorted order --
# a .py hook can sit between two .sh ones. python3 comes with 10-kiosk.sh,
# so shared .py hooks need a number above 10 (variant hooks run after all
# shared ones).
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

# After every package is in: the initramfs is built from what the image ships.
# Per variant -- what it drops and requires is hardware-specific (x86: i915,
# Intel eMMC); a variant without one keeps fedora-bootc's stock initramfs.
# installer/Containerfile runs the same script (plus dmsquash-live).
if [[ -f "${VARIANT_DIR}/initramfs.sh" ]]; then
    bash "${VARIANT_DIR}/initramfs.sh"
fi
