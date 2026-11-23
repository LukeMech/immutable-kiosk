#!/bin/bash
# Runs last (build.sh calls it after every shared and variant hook).

set -ouex pipefail

# Package names drift between releases; a missing one isn't worth a failure.
remove_if_installed() {
    local pkg
    for pkg in "$@"; do
        if rpm -q "${pkg}" >/dev/null 2>&1; then
            dnf -y remove "${pkg}"
        fi
    done
}

# No NFS; rpc.statd would fail on every boot.
remove_if_installed nfs-utils

# Firmware for hardware these devices don't have. Intel GPU/audio and
# Realtek/Broadcom Wi-Fi firmware stay.
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

# General-purpose extras nothing here requires (~430 MB): AWS SDK,
# qemu-user-static, toolbox, rpm-ostree (bootc updates), fwupd, nvme-cli,
# Atheros/MediaTek Wi-Fi firmware (supported tablets use Realtek/Broadcom; a
# panel PC with those cards needs them back in its variant).
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

# Leaf packages a kiosk never uses (~79 MB), each checked to remove alone
# (autoremove then takes their dependencies): unused filesystems, LVM/disk
# tools, admin comforts, SSH, avahi, sssd backends, kdump, fwupd leftovers,
# cloud/VM bits, modem libs, iio-sensor-proxy (rotation is set in Settings),
# Python libs only removed tools used (dnf stays).
# sudo stays (dnf protects it); so does os-prober: grub2-tools requires it and
# --nodeps would break every later dnf.
remove_if_installed \
    sos xfsprogs f2fs-tools nilfs-utils udftools ntfsprogs ntfs-3g \
    ntfs-3g-system-compression exfatprogs quota \
    lvm2 kpartx udisks2 sg3_utils \
    man-db bash-completion lsof net-tools bind-utils iproute-tc socat 7zip \
    unzip wcurl vim-data nano-default-editor gawk-all-langpacks mkpasswd \
    openssh-server openssh-clients avahi sssd-ipa sssd-ad sssd-ldap sssd-krb5 \
    adcli cracklib-dicts \
    kdump-utils memstrack stalld criu-libs passim libxmlb fwupd-efi \
    flatpak-session-helper elfutils-debuginfod-client \
    NetworkManager-cloud-setup NetworkManager-tui WALinuxAgent-udev \
    console-login-helper-messages-profile console-login-helper-messages-issuegen \
    iptables-services nfs-client-utils clevis-dracut \
    libqmi ModemManager-glib intel-npu-firmware iio-sensor-proxy openssl \
    python3-libdnf5 python3-dateutil python3-requests python3-jmespath \
    python3-urllib3+socks python3-file-magic python3-html2text \
    rpm-ostree-libs polkit-pkla-compat

# Leaves only: removed if nothing installed requires them, so a removal can't
# take wanted packages with it (a skipped one is logged, not an error).
remove_leaves() {
    local pkg req
    for pkg in "$@"; do
        rpm -q "${pkg}" >/dev/null 2>&1 || continue
        req=$(dnf -q repoquery --installed --whatrequires "${pkg}" --qf '%{name}\n' 2>/dev/null |
            grep -vx "${pkg}" | sort -u | tr '\n' ' ' || true)
        if [[ -n "${req}" ]]; then
            echo "keeping ${pkg}: required by ${req}"
            continue
        fi
        dnf -y remove "${pkg}"
    done
}

# Tools for things this image never does: chunkah (CI's rechunker, not the
# device's), LUKS/TPM unlocking (clevis, tpm2-tools, luksmeta), software RAID,
# kexec/kdump, NFS's rpcbind/gssproxy, MOK management (no Secure Boot keys
# are enrolled), logrotate (nothing logs to files: the journal rotates
# itself), irqbalance (no gain on a 4-core Atom). Dependents first.
remove_leaves \
    chunkah \
    clevis-luks clevis-systemd clevis-pin-tpm2 clevis-dracut clevis luksmeta tpm2-tools \
    mdadm kexec-tools makedumpfile rpcbind gssproxy mokutil logrotate irqbalance \
    console-login-helper-messages
# Firmware for server NICs, TV tuners and old Wi-Fi this hardware doesn't
# have (split out of linux-firmware; only some may be installed).
remove_leaves \
    netronome-firmware liquidio-firmware mlxsw_spectrum-firmware mrvlprestera-firmware \
    qed-firmware dvb-firmware libertas-firmware iwlegacy-firmware

dnf -y autoremove
dnf -y clean all

# Where the firmware space goes (for future pruning; informational).
du -sh /usr/lib/firmware/* 2>/dev/null | sort -h | tail -15 || true

# Removals take dependents with them: make sure nothing needed went.
for pkg in bootc bootupd ostree skopeo podman kernel-core NetworkManager NetworkManager-wifi \
    cage wlr-randr python3 python3-gobject gtk4 webkitgtk6.0 mesa-dri-drivers \
    shim-ia32 grub2-efi-ia32 grub2-tools efibootmgr btrfs-progs e2fsprogs dosfstools gdisk \
    cloud-utils-growpart zstd plymouth plymouth-plugin-script plymouth-plugin-label policycoreutils \
    chrony; do
    rpm -q "${pkg}" >/dev/null || { echo "error: ${pkg} was removed" >&2; exit 1; }
done

# Translations except Polish/English (~142 MB), docs, man and info pages.
# Licenses stay.
find /usr/share/locale -mindepth 1 -maxdepth 1 -type d \
    ! -name 'pl' ! -name 'pl_*' ! -name 'en' ! -name 'en_*' -exec rm -rf {} +
# Files only: scriptlets still link into these directories (e.g. alternatives
# into man1). /usr/share/doc/bootc stays: `bootc container lint` checks
# against its baseimage/ tree. (-delete implies -depth, so no -prune.)
find /usr/share/doc /usr/share/man /usr/share/info -mindepth 1 \
    ! -type d ! -path '/usr/share/doc/bootc/*' -delete
# Same rules for future installs (usroverlay, derived images).
mkdir -p /etc/rpm
printf '%%_install_langs pl:pl_PL:en:en_US\n%%_excludedocs 1\n' > /etc/rpm/macros.image-language-conf

# ldconfig.service is masked (05-base.sh): the image's /etc/ld.so.cache must
# be current for what's installed now.
ldconfig
test -s /etc/ld.so.cache
