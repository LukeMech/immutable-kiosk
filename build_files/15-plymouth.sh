#!/bin/bash
# Boot splash: Plymouth with our own theme and nothing else -- the "script"
# plugin running immutable-kiosk.script: the whole screen in the Settings
# background colour, a ring with a fading comet tail turning in the middle
# over a slowly breathing glow. Images are drawn by 16-plymouth-images.py.
# The same on shutdown and reboot. kiosk-shell opens on the same picture
# (cage takes over with `plymouth quit --retain-splash`), so the hand-over to
# the kiosk shows no black screen.
#
# Orientation: Plymouth rotates by the panel's DRM "panel orientation", which
# the x86 variant sets per device from devices.toml (video=<connector>:
# panel_orientation=...). simpledrm -- the firmware framebuffer, which Fedora's
# Plymouth uses until the real GPU driver is up -- has no orientation: the
# splash came up sideways for its first seconds. Off (UseSimpledrm=0 here and
# plymouth.use-simpledrm=0 on the kernel command line): Plymouth waits for
# i915 (in the x86 initramfs, probed asynchronously).

set -ouex pipefail

# Weak dependencies are off for the whole build (00-pre-build.sh): Plymouth's
# own themes, fonts and the label plugin stay out. plymouth-graphics-libs
# hard-requires "system-logos"; left to itself dnf picks fedora-logos (Fedora
# branding, 1.5 MB) -- generic-logos, the unbranded provider meant for
# remixes, is asked for instead. Its files go below all the same.
dnf install -y plymouth plymouth-plugin-script generic-logos
if rpm -q fedora-logos >/dev/null 2>&1; then
    echo "error: fedora-logos came in after all" >&2
    exit 1
fi

THEME=/usr/share/plymouth/themes/immutable-kiosk
mkdir -p "${THEME}"

cat > "${THEME}/immutable-kiosk.plymouth" <<EOF
[Plymouth Theme]
Name=immutable-kiosk
Description=immutable-kiosk boot splash
ModuleName=script

[script]
ImageDir=${THEME}
ScriptFile=${THEME}/immutable-kiosk.script
EOF

# Plymouth script: Window/Sprite/Image API, called 50 times a second.
cat > "${THEME}/immutable-kiosk.script" <<'EOF'
# immutable-kiosk boot splash (build_files/15-plymouth.sh).
# Background: the Settings UI's #10151c over the whole screen -- it also
# covers the firmware's logo, which the firmware draws in the panel's native
# (portrait) orientation.
Window.SetBackgroundTopColor(0.063, 0.082, 0.110);
Window.SetBackgroundBottomColor(0.063, 0.082, 0.110);

ring = Image("ring.png");
glow = Image("glow.png");

cx = Window.GetX() + Window.GetWidth() / 2;
cy = Window.GetY() + Window.GetHeight() / 2;

glow_sprite = Sprite(glow);
glow_sprite.SetPosition(cx - glow.GetWidth() / 2, cy - glow.GetHeight() / 2, 0);
glow_sprite.SetOpacity(0);
ring_sprite = Sprite();
ring_sprite.SetOpacity(0);

t = 0;
fun refresh_callback ()
{
    t = t + 1;
    # One turn per ~1.1 s, with a gentle surge every second turn.
    angle = t * 0.115 + Math.Sin(t * 0.0571) * 0.6;
    rotated = ring.Rotate(angle);
    ring_sprite.SetImage(rotated);
    ring_sprite.SetPosition(cx - rotated.GetWidth() / 2, cy - rotated.GetHeight() / 2, 1);
    # Fade in over the first half second, then the glow breathes.
    fade = Math.Min(t / 25, 1);
    ring_sprite.SetOpacity(fade);
    glow_sprite.SetOpacity(fade * (0.55 + 0.45 * Math.Sin(t * 0.0628)));
}
Plymouth.SetRefreshFunction(refresh_callback);
EOF

# Images (ring.png, glow.png): 16-plymouth-images.py, next.

# No splash delay; wait longer than Fedora's 8 s for the GPU before falling
# back to text (i915 is probed asynchronously and on the Atom comes up
# several seconds into the initramfs); no simpledrm (see the top).
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'EOF'
[Daemon]
Theme=immutable-kiosk
ShowDelay=0
DeviceTimeout=15
UseSimpledrm=0
EOF

# Ours is the only theme: everything else under themes/ goes except
# Plymouth's built-in text fallbacks.
find /usr/share/plymouth/themes -mindepth 1 -maxdepth 1 -type d \
    ! -name immutable-kiosk ! -name text ! -name details -exec rm -rf {} +
# generic-logos' files: the package has to stay installed for the
# dependency above, nothing here shows any of it.
rpm -ql generic-logos | while read -r f; do
    case "${f}" in /usr/share/licenses/*) continue ;; esac
    if [[ -f "${f}" || -L "${f}" ]]; then rm -f "${f}"; fi
done

# Default theme for plymouthd and for dracut's plymouth module (the x86
# initramfs is built later, by initramfs.sh).
plymouth-set-default-theme immutable-kiosk
test "$(plymouth-set-default-theme)" = immutable-kiosk
