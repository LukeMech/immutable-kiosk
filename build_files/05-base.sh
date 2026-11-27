#!/bin/bash
# Everything a headless-but-networked appliance needs, before any graphics.

set -ouex pipefail

dnf install -y \
    glibc-langpack-en \
    glibc-langpack-pl \
    NetworkManager \
    NetworkManager-wifi \
    wpa_supplicant \
    cloud-utils-growpart \
    btrfs-progs \
    gdisk \
    zstd \
    jq

systemctl enable NetworkManager.service
systemctl enable immutable-kiosk-zram.service

# Root grows to fill the disk on first boot (images are built small).
systemctl enable immutable-kiosk-growroot.service

# /etc stays writable: `timedatectl set-timezone` still works.
ln -sf ../usr/share/zoneinfo/Europe/Warsaw /etc/localtime

# A wall display never sleeps on its own (logind ignores idle/lid/power key
# too: logind.conf.d). Suspend stays possible for kioskd's auto shutdown
# (the charger unplugged, Settings > System > Power), and only for that.
systemctl mask hibernate.target hybrid-sleep.target suspend-then-hibernate.target

# This timer pulls AND reboots on its own; a kiosk must not go dark in use.
# Updates are started from Settings instead.
systemctl disable bootc-fetch-apply-updates.timer || true

# ConditionNeedsUpdate=/etc units run before sysinit.target on the first boot
# after each update, and on the Atom two of them cost ~18 s:
# - atomic-update-ca-trust (15 s on eMMC): replaced by immutable-kiosk-ca-trust,
#   which runs after the kiosk is up, at idle priority, only on real changes.
if [[ -f /usr/lib/systemd/system/atomic-update-ca-trust.service ]]; then
    systemctl mask atomic-update-ca-trust.service
fi
systemctl enable immutable-kiosk-ca-trust.service
# - systemd-hwdb-update (3 s): hwdb is built into /usr instead, so the unit's
#   conditions are false (tmpfiles removes a stale /etc copy).
systemd-hwdb update --usr
rm -f /etc/udev/hwdb.bin
test -s /usr/lib/udev/hwdb.bin
# - ldconfig.service (13-20 s on the 408): rebuilds /etc/ld.so.cache, which
#   the image already ships current (post-build.sh runs ldconfig last, and
#   bootc's /etc merge brings each update's).
systemctl mask ldconfig.service

# Fedora units that run at every boot for nothing here:
# - bootloader-update (bootupd, F45): updates GRUB on the ESP unattended --
#   failed on the 408, and a kiosk's bootloader shouldn't change under it;
# - authselect-apply-changes: re-applies the PAM/nsswitch profile;
# - dnf makecache timers: package metadata a bootc system never installs from;
# - podman's auto-update/restart: no containers run here.
for unit in bootloader-update.service authselect-apply-changes.service \
    dnf-makecache.timer dnf5-makecache.timer \
    podman-auto-update.timer podman-restart.service podman-clean-transient.service; do
    if systemctl list-unit-files "${unit}" >/dev/null 2>&1; then
        systemctl mask "${unit}"
    fi
done

# fedora-bootc services a kiosk never uses (each costs boot time on the Atom):
# no directory users (sssd), no LVM/RAID, no mDNS, no homed, udisks2 on demand
# only, no LUKS, and sshd could never let anyone in (no passwords, no keys;
# debugging is the tty9 debug shell).
for unit in sssd.service lvm2-monitor.service lvm-devices-import.path \
    lvm-devices-import.service dm-event.socket lvm2-lvmpolld.socket \
    mdmonitor.service raid-check.timer avahi-daemon.service avahi-daemon.socket \
    systemd-homed.service systemd-homed-activate.service udisks2.service \
    clevis-luks-askpass.path sshd.service; do
    if systemctl list-unit-files "${unit}" >/dev/null 2>&1; then
        systemctl disable "${unit}" || true
    fi
done

# Generators run on every boot before any unit (seconds on the Atom); masked
# with /dev/null symlinks in /etc:
# - podman quadlet (system + user): no quadlet units here;
# - kdump-dep-generator.sh, rpc-pipefs-generator: no kdump, no NFS;
# - zram-generator: its swap sits in swap.target, which every tmpfs mount
#   (incl. the kiosk's /run/user) waits for. immutable-kiosk-zram.service sets
#   up the same swap without blocking.
mkdir -p /etc/systemd/system-generators /etc/systemd/user-generators
for g in podman-system-generator kdump-dep-generator.sh rpc-pipefs-generator zram-generator; do
    if [[ -e /usr/lib/systemd/system-generators/${g} ]]; then
        ln -sf /dev/null "/etc/systemd/system-generators/${g}"
    fi
done
if [[ -e /usr/lib/systemd/user-generators/podman-user-generator ]]; then
    ln -sf /dev/null /etc/systemd/user-generators/podman-user-generator
fi
