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
systemd-tmpfiles --create /usr/lib/tmpfiles.d/immutable-kiosk.conf
passwd -l kiosk

systemctl enable immutable-kiosk-backend.service
systemctl enable immutable-kiosk-cage.service
systemctl set-default graphical.target
