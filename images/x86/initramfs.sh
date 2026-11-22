#!/bin/bash
# The x86 variant's own initramfs, rebuilt last (build.sh runs a variant's
# initramfs.sh after post-build.sh; a variant without one keeps the stock one).
# fedora-bootc ships a generic one: network boot (NFS, iSCSI,
# FCoE, NetworkManager), LVM, RAID, multipath, LUKS -- none of which a kiosk
# booting btrfs off its own eMMC uses, yet GRUB ia32 reads all of it through
# a Bay Trail's firmware from a slow eMMC, and an Atom unpacks it, on every
# boot.
#
# Size is boot time twice over: GRUB reads the whole file through the
# tablet's firmware (~8 MB/s from the eMMC -- 77 MB took ~10 s), then the
# Atom unpacks it. On top of the image's own dracut config
# (/usr/lib/dracut/dracut.conf.d -- ostree/bootc modules, compression,
# hostonly=no):
#   --omit:         dracut modules for storage/network stacks never used
#                   here, plus hwdb (udev's 12 MB hardware database -- only
#                   input devices use it, nothing that finds the root) and
#                   i18n (console keymaps and fonts);
#   --omit-drivers: i915 -- no early KMS. With i915 in here, its ~3 s probe
#                   ran inside udev's coldplug and dracut-initqueue's
#                   `udevadm settle` waited for it: the root was found at
#                   6.7 s but mounted only at 10.2 s, after the GPU. From the
#                   real root it loads in parallel with everything else, long
#                   before cage starts; the backlight PWM ordering it needs
#                   is the softdep in /usr/lib/modprobe.d/i915-backlight.conf,
#                   which applies there too. Also xfs: the root is btrfs;
#   --no-early-microcode: dracut's generic early cpio carries every Intel
#                   CPU's microcode (16 MB, uncompressed). Ours carries only
#                   the Atom families this image is for (early_microcode).
#
# Panel PCs with other storage (SATA, NVMe, USB) still boot: kernel driver
# selection (dracut's kernel-modules, hostonly=no) isn't touched.
#
# A bad initramfs can't brick a device: the previous deployment keeps its own,
# and one that can't mount the root reboots (rd.emergency=reboot) until GRUB
# falls back to it (boot-counter) -- but the checks below are what keep one
# from shipping.
#
# Usage: initramfs.sh [extra dracut module...]
# build.sh runs it bare; the installer image (installer/Containerfile) runs it
# from the repo with `dmsquash-live`, so the live ISO boots the system's own
# slim initramfs plus what finding a root on the ISO takes.

set -ouex pipefail

EXTRA=("$@")

OMIT=(
    network network-manager network-legacy ifcfg kernel-network-modules
    nfs iscsi nbd fcoe fcoe-uefi cifs nvmf lunmask
    lvm mdraid dmraid multipath
    crypt crypt-gpg crypt-loop systemd-cryptsetup tpm2-tss systemd-pcrextend
    # fedora-bootc's dracut config forces clevis (LUKS unlock via TPM/tang);
    # forced + its dependency omitted = dracut fails, so omit it too
    # (an omit beats an add).
    clevis clevis-pin-file clevis-pin-null clevis-pin-sss clevis-pin-tang clevis-pin-tpm2
    qemu qemu-net biosdevname memstrack resume plymouth
    # Cloud/VM/server bits fedora-bootc carries for other targets: Azure's
    # agent, FIPS mode (needs fips=1 on the kernel command line anyway),
    # virtiofs root, NVDIMM, and kernel-modules-extra's exotic drivers.
    walinuxagent fips fips-crypto-policies openssl nss-softokn
    virtiofs nvdimm kernel-modules-extra
    hwdb i18n
)

# Microcode loaded at the very start of boot: Bay Trail (06-37), Cherry
# Trail / Braswell (06-4c), Apollo Lake (06-5c) and Gemini Lake (06-7a) --
# the Atom tablets and panel PCs this image is for. Other CPUs keep the
# microcode their firmware loaded.
UCODE_GLOBS=(06-37-* 06-4c-* 06-5c-* 06-7a-*)
UCODE_DIR=/usr/lib/firmware/intel-ucode

# Must survive (when the stock initramfs had them): what finds, mounts and
# switches to the ostree/composefs root on btrfs.
CRITICAL_DRACUT=(
    base systemd systemd-initrd dracut-systemd udev-rules kernel-modules
    rootfs-block fs-lib btrfs ostree bootc
)

mapfile -t KVERS < <(ls /usr/lib/modules)
if [[ ${#KVERS[@]} -ne 1 ]]; then
    echo "error: expected exactly one kernel in /usr/lib/modules, found: ${KVERS[*]}" >&2
    exit 1
fi
KVER="${KVERS[0]}"
IMG="/usr/lib/modules/${KVER}/initramfs.img"
STOCK="/tmp/initramfs-stock.img"
cp "${IMG}" "${STOCK}"

dracut_modules() {
    local list
    list=$(lsinitrd -m "$1" | awk '/^dracut modules:/{f=1;next} f&&/^=+$/{exit} f&&NF{print $1}' | sort -u)
    if [[ -z "${list}" ]]; then
        echo "error: couldn't read the dracut module list of $1 (lsinitrd output changed?)" >&2
        exit 1
    fi
    echo "${list}"
}

# A kernel module counts if the initramfs has it or the kernel has it built in.
# Grepped from a saved file listing, not `lsinitrd | grep -q`: grep -q quits at
# the first match, lsinitrd dies of SIGPIPE, and pipefail turns a hit into a miss.
has_kmod() {
    local listing=$1 pattern=$2
    grep -Eq "/${pattern}\.ko" "${listing}" ||
        grep -Eq "/${pattern}\.ko" "/usr/lib/modules/${KVER}/modules.builtin"
}

# DRACUT_NO_XATTR: a container build can't set xattrs. --no-hostonly: never
# size the initramfs to the build host.
ADD=()
if [[ ${#EXTRA[@]} -gt 0 ]]; then
    ADD=(--add " ${EXTRA[*]} ")
fi
DRACUT_NO_XATTR=1 dracut --force --zstd --reproducible --no-hostonly \
    --no-early-microcode \
    --omit " ${OMIT[*]} " \
    --omit-drivers " i915 xfs " \
    "${ADD[@]}" \
    "${IMG}" "${KVER}"

# Our early cpio: uncompressed, in front of the compressed main archive,
# with kernel/x86/microcode/GenuineIntel.bin -- the layout dracut's own has.
early_microcode() {
    local work g files=()
    shopt -s nullglob
    for g in "${UCODE_GLOBS[@]}"; do files+=("${UCODE_DIR}"/${g}); done
    shopt -u nullglob
    if [[ ${#files[@]} -eq 0 ]]; then
        echo "warning: no Atom microcode under ${UCODE_DIR}: initramfs without early microcode" >&2
        return 0
    fi
    command -v cpio >/dev/null || dnf5 install -y cpio
    work=$(mktemp -d)
    mkdir -p "${work}/kernel/x86/microcode"
    cat "${files[@]}" > "${work}/kernel/x86/microcode/GenuineIntel.bin"
    echo "early microcode: ${#files[@]} files, $(stat -c %s "${work}/kernel/x86/microcode/GenuineIntel.bin") bytes"
    (cd "${work}" && find kernel | LC_ALL=C sort | cpio -o -H newc --reproducible --quiet) > "${work}/early.cpio"
    cat "${work}/early.cpio" "${IMG}" > "${work}/initramfs.img"
    cp "${work}/initramfs.img" "${IMG}"
    rm -rf "${work}"
}
early_microcode

STOCK_MODS=$(dracut_modules "${STOCK}")
NEW_MODS=$(dracut_modules "${IMG}")
lsinitrd "${STOCK}" > /tmp/initramfs-stock.list
lsinitrd "${IMG}" > /tmp/initramfs-new.list

echo "--- dracut modules dropped (expected: the OMIT list and what only it needed):"
comm -23 <(echo "${STOCK_MODS}") <(echo "${NEW_MODS}")
echo "--- dracut modules added:"
comm -13 <(echo "${STOCK_MODS}") <(echo "${NEW_MODS}")

for m in "${EXTRA[@]}"; do
    grep -qx "${m}" <<<"${NEW_MODS}" || { echo "error: requested dracut module '${m}' is not in the initramfs" >&2; exit 1; }
done

for m in "${CRITICAL_DRACUT[@]}"; do
    if grep -qx "${m}" <<<"${STOCK_MODS}" && ! grep -qx "${m}" <<<"${NEW_MODS}"; then
        echo "error: dracut module '${m}' was in the stock initramfs and is gone from ours" >&2
        exit 1
    fi
done

# Root filesystem stack: whatever the stock initramfs had must still be there.
for k in overlay erofs btrfs; do
    if has_kmod /tmp/initramfs-stock.list "${k}" && ! has_kmod /tmp/initramfs-new.list "${k}"; then
        echo "error: kernel module '${k}' was in the stock initramfs and is gone from ours" >&2
        exit 1
    fi
done
# Bay Trail eMMC (sdhci-acpi + mmc_block): always required.
for k in mmc_block 'sdhci[-_]acpi'; do
    has_kmod /tmp/initramfs-new.list "${k}" || { echo "error: kernel module '${k}' missing from the initramfs" >&2; exit 1; }
done
# i915 loads from the real root (see the top); in here it would hold up the
# root mount again.
if grep -Eq '/i915\.ko' /tmp/initramfs-new.list; then
    echo "error: i915 is in the initramfs (early KMS delays the root mount)" >&2
    exit 1
fi
# (No pipe into grep -q here: SIGPIPE + pipefail, see has_kmod.)
if grep -aq 'kernel/x86/microcode/GenuineIntel.bin' "${IMG}"; then
    echo "early microcode: present"
else
    echo "early microcode: none"
fi
ls -l "${STOCK}" "${IMG}"
echo "kernel modules: stock $(grep -c '\.ko' /tmp/initramfs-stock.list) -> ours $(grep -c '\.ko' /tmp/initramfs-new.list)"
# Where the rest of the size is (uncompressed bytes, from lsinitrd's listing):
# per top-level area, then the 20 biggest files -- what to cut next.
echo "--- uncompressed MiB by area:"
awk '$1 !~ /^l/ && $5 ~ /^[0-9]+$/ {
        p = $NF
        if (p ~ /^usr\/lib\/firmware\//) a = "firmware"
        else if (p ~ /^usr\/lib\/modules\//) a = "kernel modules"
        else if (p ~ /^usr\/lib(64)?\/[^\/]*\.so/ || p ~ /^usr\/lib(64)?\/.*\.so[.0-9]*$/) a = "libraries"
        else if (p ~ /^usr\/(s?bin|libexec)\//) a = "programs"
        else a = "other"
        s[a] += $5
     } END { for (a in s) printf "%8.1f  %s\n", s[a] / 1048576, a }' /tmp/initramfs-new.list | sort -rn
echo "--- kernel modules: compressed MiB, count, directory (top 15):"
awk '$1 !~ /^l/ && $5 ~ /^[0-9]+$/ && $NF ~ /\/kernel\/.*\.ko/ {
        n = split($NF, p, "/"); d = ""
        for (i = 1; i < n; i++) if (p[i] == "kernel") { d = p[i + 1] "/" p[i + 2]; break }
        s[d] += $5; c[d]++
     } END { for (d in s) printf "%8.2f  %4d  %s\n", s[d] / 1048576, c[d], d }' /tmp/initramfs-new.list |
    sort -rn > /tmp/initramfs-moddirs.list
head -15 /tmp/initramfs-moddirs.list
rm -f /tmp/initramfs-moddirs.list
echo "--- 20 biggest files:"
# Through a file, not `sort | head`: head exits after 20 lines, sort dies of
# SIGPIPE, and pipefail fails the build (exit 141).
awk '$1 !~ /^l/ && $5 ~ /^[0-9]+$/ { printf "%8.1f MiB  %s\n", $5 / 1048576, $NF }' /tmp/initramfs-new.list |
    sort -rn > /tmp/initramfs-biggest.list
head -20 /tmp/initramfs-biggest.list
rm -f /tmp/initramfs-biggest.list
rm -f "${STOCK}" /tmp/initramfs-stock.list /tmp/initramfs-new.list
