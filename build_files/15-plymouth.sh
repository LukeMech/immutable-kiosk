#!/bin/bash
# Boot splash: Plymouth with only our script theme, a progress bar with the
# boot's stage (16-plymouth-images.py writes the script and its images, and
# kiosk-splash's copy of the bar). At the hand-over the bar settles,
# cage's unit deactivates plymouth (that frame stays up) and kiosk-splash
# continues it.
#
# Orientation comes from the panel's DRM "panel orientation" (devices.toml).
# simpledrm has none, so it's off: Plymouth waits for i915.

set -ouex pipefail

# Weak deps are off (00-pre-build.sh), so no stock themes. system-logos is a
# hard dependency: the package stays, its files go below.
# plymouth-plugin-label is required although nothing draws text: without it
# plymouthd segfaults in ply_console_viewer_hide().
dnf install -y plymouth plymouth-plugin-script plymouth-plugin-label
# For 16-plymouth-images.py, which renders the labels with Pango.
dnf install -y python3-gobject python3-cairo gobject-introspection pango google-noto-sans-vf-fonts

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

# The script and its images: 16-plymouth-images.py (runs next).

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
