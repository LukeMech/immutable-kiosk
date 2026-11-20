#!/bin/bash
# Runs last (build.sh calls it explicitly, after every shared and variant hook).

set -ouex pipefail

# Removed only if present: package names drift between Fedora releases, and a
# missing one isn't worth failing the build over.
remove_if_installed() {
    local pkg
    for pkg in "$@"; do
        if rpm -q "${pkg}" >/dev/null 2>&1; then
            dnf5 -y remove "${pkg}"
        fi
    done
}

# Never does a kernel NFS mount; rpc.statd fails at every boot otherwise
# (same as immutable-sbc).
remove_if_installed nfs-utils

# Firmware for hardware no x86 tablet/panel PC of this kind has. Intel GPU,
# audio and Realtek/Broadcom Wi-Fi firmware stay.
remove_if_installed \
    amd-gpu-firmware \
    amd-ucode-firmware \
    nvidia-gpu-firmware \
    nxpwireless-firmware \
    qcom-wwan-firmware \
    tiwilink-firmware \
    cirrus-audio-firmware \
    intel-vsc-firmware

remove_if_installed vim-minimal

dnf5 -y autoremove
dnf5 -y clean all
