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

# First boot after every update: units with ConditionNeedsUpdate=/etc run
# before sysinit.target (ostree drops /etc/.updated). On the Atom two of them
# held the boot up for ~18 s:
# - atomic-update-ca-trust (15 s: update-ca-trust writes every bundle format
#   to a slow eMMC). Replaced by immutable-kiosk-ca-trust, which does the same
#   after the kiosk is up, at idle priority, and only when the trust sources
#   actually changed. Until then the previous bundle stays in place.
if [[ -f /usr/lib/systemd/system/atomic-update-ca-trust.service ]]; then
    systemctl mask atomic-update-ca-trust.service
fi
systemctl enable immutable-kiosk-ca-trust.service
# - systemd-hwdb-update (3 s): rebuilds /etc/udev/hwdb.bin. Built into /usr
#   here instead, where the image owns it; with no hwdb in /etc the unit's
#   conditions are false. (tmpfiles removes an /etc copy an installed
#   device regenerated earlier -- immutable-kiosk.conf.)
systemd-hwdb update --usr
rm -f /etc/udev/hwdb.bin
test -s /usr/lib/udev/hwdb.bin
