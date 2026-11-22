#!/bin/bash
# Boot splash: Plymouth's script plugin with our "embers" theme, also on
# shutdown/reboot (script and images come from 16-plymouth-images.py). On
# "handover" the embers form the word WAIT and kiosk-splash continues from
# that same picture.
#
# Plymouth rotates by the DRM panel orientation (set per device from
# devices.toml), which simpledrm lacks, so simpledrm is off (UseSimpledrm=0,
# plymouth.use-simpledrm=0) and Plymouth waits for i915.

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

# No delay; wait longer than Fedora's 8 s for i915 (probed async, up several
# seconds into the initramfs on the Atom) before falling back to text.
mkdir -p /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<'EOF'
[Daemon]
Theme=immutable-kiosk
ShowDelay=0
DeviceTimeout=15
UseSimpledrm=0
EOF

# Ours is the only theme, besides the built-in text fallbacks.
find /usr/share/plymouth/themes -mindepth 1 -maxdepth 1 -type d \
    ! -name immutable-kiosk ! -name text ! -name details -exec rm -rf {} +
# The system-logos package (fedora-logos): drop its files except the license,
# then the now-empty directories only it owns, deepest first.
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
