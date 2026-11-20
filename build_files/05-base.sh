#!/bin/bash
# Everything a headless-but-networked appliance needs, before any graphics.

set -ouex pipefail

dnf5 install -y \
    glibc-langpack-en \
    glibc-langpack-pl \
    NetworkManager \
    NetworkManager-wifi \
    wpa_supplicant \
    zram-generator \
    cloud-utils-growpart \
    btrfs-progs \
    gdisk \
    zstd \
    jq

systemctl enable NetworkManager.service

# Root grows to fill the disk on first boot (disk images are built small; see
# immutable-sbc, where this service comes from).
systemctl enable immutable-kiosk-growroot.service

# Time zone for the clock in Settings and the journal -- /etc stays writable,
# so a different one is still just `timedatectl set-timezone`.
ln -sf ../usr/share/zoneinfo/Europe/Warsaw /etc/localtime

# A display on a wall never sleeps: no suspend/hibernate at all, whatever
# asks for it (logind's idle/lid/power-key handling is set to ignore too, in
# system_files/usr/lib/systemd/logind.conf.d/).
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target

# fedora-bootc enables bootc-fetch-apply-updates.timer, which pulls AND
# reboots on its own schedule -- a screen in use going dark for a reboot is
# exactly what an HMI panel mustn't do. Updates are started from Settings
# instead (ROADMAP: an optional "download automatically, apply on button").
systemctl disable bootc-fetch-apply-updates.timer || true
