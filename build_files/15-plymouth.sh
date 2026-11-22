#!/bin/bash
# Boot splash: Plymouth with our own theme. The firmware's logo (BGRT -- the
# vendor logo UEFI shows) stays where the firmware drew it, our spinner turns
# below it, from the initramfs until cage takes the screen over
# (immutable-kiosk-cage.service: `plymouth quit --retain-splash`). The same on
# shutdown and reboot. Without a firmware logo: just the spinner on black.
#
# Orientation: Plymouth rotates by the panel's DRM "panel orientation", which
# the x86 variant sets per device from devices.toml (kernel argument
# video=<connector>:panel_orientation=...). It needs the real GPU driver for
# that -- simpledrm has no orientation, and Fedora's Plymouth ignores it --
# so the x86 initramfs has i915 again (probed asynchronously, see there).

set -ouex pipefail

dnf5 install -y plymouth plymouth-plugin-two-step plymouth-theme-spinner

THEME=/usr/share/plymouth/themes/immutable-kiosk
mkdir -p "${THEME}"

# Password/keyboard dialog images two-step loads even if never shown (no
# LUKS here): the spinner theme's.
for f in bullet capslock entry keyboard keymap-render lock; do
    cp "/usr/share/plymouth/themes/spinner/${f}.png" "${THEME}/"
done

# The spinner frames (throbber-NNNN.png): 16-plymouth-frames.py, next.

cat > "${THEME}/immutable-kiosk.plymouth" <<EOF
[Plymouth Theme]
Name=immutable-kiosk
Description=Firmware logo with a spinner below it
ModuleName=two-step

[two-step]
ImageDir=${THEME}
HorizontalAlignment=.5
VerticalAlignment=.78
DialogHorizontalAlignment=.5
DialogVerticalAlignment=.382
Transition=none
TransitionDuration=0.0
BackgroundStartColor=0x000000
BackgroundEndColor=0x000000
MessageBelowAnimation=true
DialogClearsFirmwareBackground=true

[boot-up]
UseEndAnimation=false
UseFirmwareBackground=true

[shutdown]
UseEndAnimation=false
UseFirmwareBackground=true

[reboot]
UseEndAnimation=false
UseFirmwareBackground=true
EOF

# No splash delay; and wait longer than Fedora's 8 s for the GPU before
# falling back to text: i915 is probed asynchronously and on the Atom comes
# up several seconds into the initramfs.
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'EOF'
[Daemon]
Theme=immutable-kiosk
ShowDelay=0
DeviceTimeout=15
EOF

# Default theme for plymouthd and for dracut's plymouth module (the x86
# initramfs is built later, by initramfs.sh).
plymouth-set-default-theme immutable-kiosk
test "$(plymouth-set-default-theme)" = immutable-kiosk
