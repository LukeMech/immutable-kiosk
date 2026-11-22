#!/bin/bash
# Boot splash: Plymouth with our own theme and nothing else -- the "script"
# plugin running immutable-kiosk.script, "orbit" (see the script below).
# Images are drawn by 16-plymouth-images.py, which draws kiosk-splash's
# frames too. The same on shutdown and reboot. The hand-over to the kiosk:
# the script settles into a dimmed rest pose on "handover", cage's unit
# deactivates plymouth (that still stays up), kiosk-splash wakes up from
# the same picture.
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
# own themes stay out. plymouth-graphics-libs hard-requires "system-logos"
# (dnf brings the release's own, fedora-logos): the package stays for that,
# its files and directories go below.
# plymouth-plugin-label is needed although the script draws no text: the
# script plugin hides its console viewer on every refresh, and without the
# label plugin there is none -- plymouthd segfaulted in
# ply_console_viewer_hide() on the tablet (no splash, a backtrace instead).
dnf install -y plymouth plymouth-plugin-script plymouth-plugin-label

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
# The animation ("orbit") and its images: 16-plymouth-images.py, which
# also draws kiosk-splash's frames from the same shapes and the same
# formulas as here -- keep the two in step.
cat > "${THEME}/immutable-kiosk.script" <<'EOF'
# immutable-kiosk boot splash, "orbit" (build_files/15-plymouth.sh).
# Black (it also covers the firmware's logo, drawn in the panel's native
# portrait orientation): an accent glow breathing, a core with two faint
# tracks, an outer arc turning clockwise with a gentle surge, an inner one
# twice as fast the other way. One loop = 80 refreshes (1.6 s).
#
# `plymouth update --status=handover` (cage's unit, before `plymouth
# deactivate`): the arcs ease back into the rest pose -- outer at the top,
# inner at the bottom -- and everything dims to 35 %, over 0.6 s. That
# still is what stays on the screen while the kiosk starts; kiosk-splash
# wakes up from the same picture.
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

glow = Image("glow.png");
base = Image("base.png");
outer = Image("outer.png");
inner = Image("inner.png");

cx = Window.GetX() + Window.GetWidth() / 2;
cy = Window.GetY() + Window.GetHeight() / 2;
pi = 3.14159265;

glow_s = Sprite(glow);
glow_s.SetPosition(cx - glow.GetWidth() / 2, cy - glow.GetHeight() / 2, 0);
base_s = Sprite(base);
base_s.SetPosition(cx - base.GetWidth() / 2, cy - base.GetHeight() / 2, 1);
outer_s = Sprite();
inner_s = Sprite();
glow_s.SetOpacity(0);
base_s.SetOpacity(0);

t = 0;
handover = -1;
ao = 0; ai = pi; br = 1; level = 0;

fun status_callback (status)
{
    if (status == "handover" && handover < 0)
    {
        handover = t;
        ao_h = ao; ai_h = ai; br_h = br; level_h = level;
        # The next rest angle in each arc's own direction.
        m = ao_h / (2 * pi);
        f = m - Math.Int(m);
        if (f < 0) f = f + 1;
        ao_to = ao_h + (1 - f) * 2 * pi;
        m = (ai_h - pi) / (2 * pi);
        f = m - Math.Int(m);
        if (f < 0) f = f + 1;
        ai_to = ai_h - f * 2 * pi;
    }
}
Plymouth.SetUpdateStatusFunction(status_callback);

fun refresh_callback ()
{
    t = t + 1;
    if (handover < 0)
    {
        p = t / 80;
        ao = 2 * pi * (p + 0.06 * Math.Sin(2 * pi * p));
        ai = pi - 4 * pi * p;
        br = 0.65 + 0.35 * Math.Cos(2 * pi * p);
        level = Math.Min(t / 25, 1);
    }
    else
    {
        u = Math.Min((t - handover) / 30, 1);
        e = 1 - (1 - u) * (1 - u) * (1 - u);
        ao = ao_h + (ao_to - ao_h) * e;
        ai = ai_h + (ai_to - ai_h) * e;
        br = br_h + (1 - br_h) * e;
        level = level_h + (0.35 - level_h) * e;
    }
    o = outer.Rotate(ao);
    outer_s.SetImage(o);
    outer_s.SetPosition(cx - o.GetWidth() / 2, cy - o.GetHeight() / 2, 2);
    i = inner.Rotate(ai);
    inner_s.SetImage(i);
    inner_s.SetPosition(cx - i.GetWidth() / 2, cy - i.GetHeight() / 2, 3);
    outer_s.SetOpacity(level);
    inner_s.SetOpacity(level);
    base_s.SetOpacity(level);
    glow_s.SetOpacity(level * br);
}
Plymouth.SetRefreshFunction(refresh_callback);
EOF

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
# The logo package (whatever provides system-logos -- fedora-logos today):
# installed for the dependency above, nothing here shows any of it. Its files
# go (the license stays), then the directories only it owns, now empty --
# deepest first; one another package shares, or the license's, stays.
LOGOS=$(rpm -q --whatprovides system-logos --qf '%{NAME}\n' | head -1)
rpm -ql "${LOGOS}" | while read -r f; do
    case "${f}" in /usr/share/licenses/*) continue ;; esac
    if [[ -f "${f}" || -L "${f}" ]]; then rm -f "${f}"; fi
done
rpm -ql "${LOGOS}" | sort -r | while read -r d; do
    if [[ -d "${d}" && "$(rpm -qf "${d}" --qf '%{NAME}\n' | sort -u)" == "${LOGOS}" ]]; then
        rmdir "${d}" 2>/dev/null || true
    fi
done

# Default theme for plymouthd and for dracut's plymouth module (the x86
# initramfs is built later, by initramfs.sh).
plymouth-set-default-theme immutable-kiosk
test "$(plymouth-set-default-theme)" = immutable-kiosk
