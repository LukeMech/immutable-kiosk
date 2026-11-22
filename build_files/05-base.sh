#!/bin/bash
# Everything a headless-but-networked appliance needs, before any graphics.

set -ouex pipefail

dnf install -y \
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

# Services fedora-bootc enables that nothing on a kiosk uses, each started on
# every boot (on the Atom every one of them costs boot time):
# - sssd: authselect's profile is "local" -- no directory users;
# - LVM/RAID monitoring (lvm2-monitor scans every block device), dm-event,
#   lvmpolld, mdmonitor and its weekly raid-check: btrfs on one eMMC;
# - avahi (mDNS): nothing looks the tablet up as *.local;
# - systemd-homed: no portable home directories;
# - udisks2: started on demand over D-Bus if something asks, not at boot;
# - clevis-luks-askpass: no LUKS;
# - sshd: kiosk and root have no password (10-kiosk.sh) and nobody has keys,
#   so it could never let anyone in -- debugging is the tty9 debug shell.
for unit in sssd.service lvm2-monitor.service lvm-devices-import.path \
    lvm-devices-import.service dm-event.socket lvm2-lvmpolld.socket \
    mdmonitor.service raid-check.timer avahi-daemon.service avahi-daemon.socket \
    systemd-homed.service systemd-homed-activate.service udisks2.service \
    clevis-luks-askpass.path sshd.service; do
    if systemctl list-unit-files "${unit}" >/dev/null 2>&1; then
        systemctl disable "${unit}" || true
    fi
done
# udev starts iio-sensor-proxy as soon as it sees the tablet's accelerometer
# (~1 s at boot); the screen's rotation is set in Settings, never automatic.
if [[ -f /usr/lib/systemd/system/iio-sensor-proxy.service ]]; then
    systemctl mask iio-sensor-proxy.service
fi

# Generators run on every boot before systemd starts a single unit (and
# again after switch-root): on the Atom, between switch-root at 7.0 s and
# the first unit at 13.5 s. Off, by the documented way -- a same-named
# symlink to /dev/null in /etc/systemd/*-generators:
# - podman's quadlet (a 2.4 MB Go binary, run as system AND user generator):
#   no .container/.volume units here;
# - kdump-dep-generator.sh: no kdump; rpc-pipefs-generator: no NFS.
mkdir -p /etc/systemd/system-generators /etc/systemd/user-generators
for g in podman-system-generator kdump-dep-generator.sh rpc-pipefs-generator; do
    if [[ -e /usr/lib/systemd/system-generators/${g} ]]; then
        ln -sf /dev/null "/etc/systemd/system-generators/${g}"
    fi
done
if [[ -e /usr/lib/systemd/user-generators/podman-user-generator ]]; then
    ln -sf /dev/null /etc/systemd/user-generators/podman-user-generator
fi
