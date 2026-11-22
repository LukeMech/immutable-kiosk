#!/bin/bash
# Boot splash: Plymouth with only our "orbit" script theme (images from
# 16-plymouth-images.py, which also draws kiosk-splash's frames). At the
# hand-over the script stops in its rest pose, cage's unit deactivates
# plymouth (that frame stays up) and kiosk-splash continues from it.
#
# Orientation comes from the panel's DRM "panel orientation" (devices.toml).
# simpledrm has none, so it's off: Plymouth waits for i915.

set -ouex pipefail

# Weak deps are off (00-pre-build.sh), so no stock themes. system-logos is a
# hard dependency: the package stays, its files go below.
# plymouth-plugin-label is required although nothing draws text: without it
# plymouthd segfaults in ply_console_viewer_hide().
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

# Called 50 times a second. Keep in step with 16-plymouth-images.py, which
# draws kiosk-splash's frames with the same formulas.
cat > "${THEME}/immutable-kiosk.script" <<'EOF'
# immutable-kiosk boot splash, "orbit" (build_files/15-plymouth.sh): a
# breathing glow, a core, an outer arc turning clockwise and an inner one
# twice as fast the other way. One loop = 80 refreshes (1.6 s).
# On "handover" the arcs ease into the rest pose (outer at the top, inner
# at the bottom) at full brightness, over 0.6 s: that frame stays on the
# screen while the kiosk starts, and kiosk-splash continues from it.
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
        level = level_h + (1 - level_h) * e;
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

# No delay; wait up to 15 s for i915 (it comes up late on the Atom).
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'EOF'
[Daemon]
Theme=immutable-kiosk
ShowDelay=0
DeviceTimeout=15
UseSimpledrm=0
EOF

# Ours is the only theme, besides Plymouth's text fallbacks.
find /usr/share/plymouth/themes -mindepth 1 -maxdepth 1 -type d \
    ! -name immutable-kiosk ! -name text ! -name details -exec rm -rf {} +
# The logo package (installed only as a dependency): its files go, the
# license stays, then the directories only it owns, deepest first.
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

# For plymouthd and dracut's plymouth module (x86 initramfs is built later).
plymouth-set-default-theme immutable-kiosk
test "$(plymouth-set-default-theme)" = immutable-kiosk

# plymouth-quit-wait waits until plymouthd exits -- here, when the kiosk has
# drawn (kioskd quits it) -- and multi-user.target waits for it: the boot
# counted as unfinished ~15 s too long. Only gettys need it; tty1 has cage.
systemctl mask plymouth-quit-wait.service
