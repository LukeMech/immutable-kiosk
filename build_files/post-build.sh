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

# fedora-bootc's general-purpose extras nothing here requires (checked with
# rpm -e --test against the v45.20261121.1 image, ~430 MB installed):
#   - AWS SDK (python3-botocore alone is 121 MB) -- no dependents at all;
#   - qemu-user-static-*: podman's foreign-architecture containers (~150 MB);
#   - toolbox, rpm-ostree (bootc does updates), fwupd + plugins (firmware
#     updates from LVFS -- none for these tablets), nvme-cli (eMMC only);
#   - Wi-Fi firmware for Atheros/Qualcomm and MediaTek cards (~78 MB): the
#     supported tablets have Realtek or Broadcom SDIO Wi-Fi (images/x86).
#     A panel PC with one of those cards needs them back in its variant.
remove_if_installed \
    python3-boto3 \
    python3-s3transfer \
    python3-botocore \
    toolbox \
    rpm-ostree \
    fwupd \
    nvme-cli \
    atheros-firmware \
    mt7xxx-firmware
# shellcheck disable=SC2046
remove_if_installed $(rpm -qa --qf '%{NAME}\n' 'qemu-user-static*')

dnf5 -y autoremove
dnf5 -y clean all

# dnf5 remove also removes whatever depends on what's removed: make sure
# nothing the kiosk needs went with it.
for pkg in bootc ostree skopeo podman kernel-core NetworkManager NetworkManager-wifi \
    cage wlr-randr python3 python3-gobject gtk4 webkitgtk6.0 mesa-dri-drivers \
    shim-ia32 grub2-efi-ia32 btrfs-progs cloud-utils-growpart zstd; do
    rpm -q "${pkg}" >/dev/null || { echo "error: ${pkg} was removed" >&2; exit 1; }
done

# Files, not packages: translations for ~860 languages (142 MB) where the
# kiosk speaks Polish (and English for logs), plus docs, man and info pages
# nobody reads on a panel. Licenses stay.
find /usr/share/locale -mindepth 1 -maxdepth 1 -type d \
    ! -name 'pl' ! -name 'pl_*' ! -name 'en' ! -name 'en_*' -exec rm -rf {} +
# Files only: the directories stay, because package scriptlets still link
# into them (xorriso's alternatives -> /usr/share/man/man1/; with man1 gone
# its %post failed and so did the installer image's dnf transaction).
# /usr/share/doc/bootc stays whole: its baseimage/ tree is the reference
# `bootc container lint` checks the image against (ostree -> sysroot/ostree,
# prepare-root.conf) -- emptied, the lint fails "Missing ostree link".
# (A condition, not -prune: -delete implies -depth, which disables -prune.)
find /usr/share/doc /usr/share/man /usr/share/info -mindepth 1 \
    ! -type d ! -path '/usr/share/doc/bootc/*' -delete
# Future package installs (bootc usroverlay, derived images): same rules.
mkdir -p /etc/rpm
printf '%%_install_langs pl:pl_PL:en:en_US\n%%_excludedocs 1\n' > /etc/rpm/macros.image-language-conf
