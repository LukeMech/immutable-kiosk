#!/bin/bash
# Same shape as immutable-sbc's build.sh: shared system_files/ + numbered
# hooks, then the variant's own overlay + hooks, then post-build.sh, then
# initramfs.sh last.

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

for hook in /ctx/*.sh; do
    [[ -e "${hook}" ]] || continue
    case "$(basename "${hook}")" in
        build.sh | post-build.sh | initramfs.sh) continue ;;
    esac
    bash "${hook}"
done

for hook in "${VARIANT_DIR}/build_files"/*.sh; do
    [[ -e "${hook}" ]] || continue
    bash "${hook}"
done

bash /ctx/post-build.sh

# After every package is in: the initramfs is built from what the image ships.
bash /ctx/initramfs.sh
