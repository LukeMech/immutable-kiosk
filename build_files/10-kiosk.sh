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
    /usr/libexec/immutable-kiosk/kioskd \
    /usr/libexec/immutable-kiosk/boot-counter
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
# Automatic rollback when a new version never brings the kiosk up.
systemctl enable immutable-kiosk-boot-counter.service immutable-kiosk-boot-watchdog.service
systemctl set-default graphical.target

# tty1 belongs to the kiosk: no login prompt there, ever -- not even when
# cage is between restarts. Nobody can log in anyway (kiosk and root are
# locked); debugging goes through systemd.debug_shell=1 (tty9).
# - getty@tty1: enabled by default (getty.target), the only getty started
#   at boot. (logind's autovt@ getties are off: NAutoVTs=0 in logind.conf.d.)
# - kmscon: Fedora 45's VT console (Changes/UseKmsconVTConsole) --
#   kmsconvt@tty1 runs agetty on a pts (the "login: (pts/0 (tty1))" prompt)
#   and holds DRM master on tty1, so cage never got the screen. Removed: the
#   kernel console (fbcon) is all a kiosk needs, tty9's debug shell included.
#   Its enablement symlinks (getty.target.wants/kmsconvt@tty1, autovt@ ->
#   kmsconvt@) would dangle, so they go too.
systemctl mask getty@tty1.service
if rpm -q kmscon >/dev/null 2>&1; then
    dnf5 -y remove kmscon
fi
find /etc/systemd /usr/lib/systemd -lname '*kmscon*' -print -delete

# GRUB's menu entry and "Booting ..." line come from PRETTY_NAME (ostree
# writes it into each deployment's BLS entry): the release, e.g.
# "immutable-kiosk v45.20261122.1-778b844" -- which version an entry boots,
# at a glance. CI passes tag and commit (Containerfile ARGs); local builds
# say "dev". IMAGE_ID/IMAGE_VERSION carry the same. NAME/ID/VERSION_ID stay
# Fedora's: dnf, bootc and friends key off those.
IK_VERSION="${RELEASE_TAG:-dev}${GIT_SHA:+-${GIT_SHA}}"
sed -i -e "s|^PRETTY_NAME=.*|PRETTY_NAME=\"immutable-kiosk ${IK_VERSION}\"|" \
    -e '/^IMAGE_ID=/d' -e '/^IMAGE_VERSION=/d' /usr/lib/os-release
printf 'IMAGE_ID="immutable-kiosk"\nIMAGE_VERSION="%s"\n' "${IK_VERSION}" >> /usr/lib/os-release
grep -q "^PRETTY_NAME=\"immutable-kiosk ${IK_VERSION}\"" /usr/lib/os-release
# Hostname until one is set in Settings (hostnamectl -> /etc/hostname, which
# wins): systemd falls back to os-release's DEFAULT_HOSTNAME, not "fedora".
# (/etc/hostname itself can't be touched here: during a RUN step podman
# bind-mounts the build host's -- "Device or resource busy" -- and it never
# ends up in the image anyway.)
sed -i '/^DEFAULT_HOSTNAME=/d' /usr/lib/os-release
echo 'DEFAULT_HOSTNAME="immutable-kiosk"' >> /usr/lib/os-release
