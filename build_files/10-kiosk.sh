#!/bin/bash
# The kiosk itself: cage (single-app Wayland compositor) running kiosk-shell
# (GTK4 + WebKitGTK: one view for the HMI, one for Settings), and kioskd,
# the root-side API behind the Settings page.

set -ouex pipefail

dnf5 install -y \
    cage \
    wlr-randr \
    mesa-dri-drivers \
    libinput \
    python3 \
    python3-gobject \
    gtk4 \
    webkitgtk6.0 \
    default-fonts-core-sans

# Executable bits don't survive every checkout (the repo is edited on Windows).
chmod 0755 /usr/libexec/immutable-kiosk/*

# Python syntax check of our own code at build time -- a typo here would
# otherwise only show up as a black screen on the device.
python3 -m py_compile \
    /usr/libexec/immutable-kiosk/kiosk-shell \
    /usr/libexec/immutable-kiosk/kioskd
find /usr/libexec/immutable-kiosk -name '__pycache__' -prune -exec rm -rf {} +

# The kiosk account: no password, no sudo, no shell login -- it only runs
# cage. Anything privileged goes through kioskd (root, localhost only).
systemd-sysusers /usr/lib/sysusers.d/kiosk.conf
# On Fedora bootc video/input/render live in /usr/lib/group (nss-altfiles),
# which nothing can add members to -- sysusers' `m` lines silently did
# nothing. Copy them into /etc/group first, then add the kiosk user. (logind
# grants a running session the devices anyway; this keeps them reachable
# when it doesn't, e.g. during a VT switch or for debugging as kiosk.)
for g in video input render; do
    if ! grep -q "^${g}:" /etc/group; then
        grep "^${g}:" /usr/lib/group >> /etc/group
    fi
done
usermod -aG video,input,render kiosk
id kiosk | grep -q render
systemd-tmpfiles --create /usr/lib/tmpfiles.d/immutable-kiosk.conf
passwd -l kiosk

systemctl enable immutable-kiosk-backend.service
systemctl enable immutable-kiosk-cage.service
systemctl set-default graphical.target

# tty1 belongs to the kiosk: no login prompt there, ever -- not even when
# cage is between restarts (logind would spawn autovt@tty1 on the VT).
# Nobody can log in anyway (kiosk and root are locked); debugging goes
# through systemd.debug_shell=1 (tty9).
systemctl mask getty@tty1.service autovt@tty1.service

# GRUB's menu entry and "Booting ..." line come from PRETTY_NAME (ostree
# writes it into each deployment's BLS entry). NAME/ID stay Fedora: dnf,
# bootc and friends key off those.
. /usr/lib/os-release
sed -i "s|^PRETTY_NAME=.*|PRETTY_NAME=\"immutable-kiosk (Fedora Linux ${VERSION_ID})\"|" /usr/lib/os-release
grep -q '^PRETTY_NAME="immutable-kiosk' /usr/lib/os-release
# Hostname until one is set in Settings (hostnamectl -> /etc/hostname, which
# wins): systemd falls back to os-release's DEFAULT_HOSTNAME, not "fedora".
sed -i '/^DEFAULT_HOSTNAME=/d' /usr/lib/os-release
echo 'DEFAULT_HOSTNAME="immutable-kiosk"' >> /usr/lib/os-release
rm -f /etc/hostname
