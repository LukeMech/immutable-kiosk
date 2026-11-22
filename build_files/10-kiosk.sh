#!/bin/bash
# The kiosk: cage running kiosk-shell (GTK4 + WebKitGTK: HMI and Settings
# views), plus kioskd, the root-side API behind Settings.

set -ouex pipefail

dnf install -y \
    cage \
    wlr-randr \
    mesa-dri-drivers \
    libinput \
    python3 \
    python3-gobject \
    gtk4 \
    webkitgtk6.0 \
    default-fonts-core-sans

# Executable bits don't survive every checkout (edited on Windows).
chmod 0755 /usr/libexec/immutable-kiosk/*

# Catch syntax errors at build time, not as a black screen on the device.
python3 -m py_compile \
    /usr/libexec/immutable-kiosk/kiosk-shell \
    /usr/libexec/immutable-kiosk/kioskd \
    /usr/libexec/immutable-kiosk/boot-counter \
    /usr/libexec/immutable-kiosk/kiosk-splash
sh -n /usr/libexec/immutable-kiosk/kiosk-session
find /usr/libexec/immutable-kiosk -name '__pycache__' -prune -exec rm -rf {} +

# kiosk account: no password, no sudo, only runs cage; privileged work goes
# through kioskd.
systemd-sysusers /usr/lib/sysusers.d/kiosk.conf
# video/input/render live in /usr/lib/group (nss-altfiles), where sysusers'
# `m` lines silently do nothing: copy them into /etc/group first. (logind
# grants devices to the session anyway; this covers VT switches/debugging.)
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
systemctl enable immutable-kiosk-preload.service
# Automatic rollback when a new version never brings the kiosk up.
systemctl enable immutable-kiosk-boot-counter.service immutable-kiosk-boot-watchdog.service
systemctl set-default graphical.target

# tty1 belongs to the kiosk, never a login prompt (debugging: tty9 debug shell).
# - getty@tty1 is the only getty started at boot (NAutoVTs=0 in logind.conf.d).
# - kmscon (Fedora 45's VT console) holds DRM master on tty1, so cage never
#   gets the screen: removed, with its now-dangling enablement symlinks.
systemctl mask getty@tty1.service
if rpm -q kmscon >/dev/null 2>&1; then
    dnf -y remove kmscon
fi
find /etc/systemd /usr/lib/systemd -lname '*kmscon*' -print -delete

# PRETTY_NAME is what GRUB's menu entries show, so put the release in it
# (tag + commit from CI, "dev" locally). NAME/ID/VERSION_ID stay Fedora's:
# dnf and bootc key off them.
IK_VERSION="${RELEASE_TAG:-dev}${GIT_SHA:+-${GIT_SHA}}"
# A dev build's tag already ends in the commit.
if [[ -n "${GIT_SHA:-}" && "${RELEASE_TAG:-}" == *".${GIT_SHA}" ]]; then
    IK_VERSION="${RELEASE_TAG}"
fi
sed -i -e "s|^PRETTY_NAME=.*|PRETTY_NAME=\"immutable-kiosk ${IK_VERSION}\"|" \
    -e '/^IMAGE_ID=/d' -e '/^IMAGE_VERSION=/d' /usr/lib/os-release
printf 'IMAGE_ID="immutable-kiosk"\nIMAGE_VERSION="%s"\n' "${IK_VERSION}" >> /usr/lib/os-release
grep -q "^PRETTY_NAME=\"immutable-kiosk ${IK_VERSION}\"" /usr/lib/os-release
# Default hostname until one is set in Settings. (/etc/hostname can't be
# written here: podman bind-mounts the host's during RUN.)
sed -i '/^DEFAULT_HOSTNAME=/d' /usr/lib/os-release
echo 'DEFAULT_HOSTNAME="immutable-kiosk"' >> /usr/lib/os-release
