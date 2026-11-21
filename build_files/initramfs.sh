#!/bin/bash
# The image's own initramfs, rebuilt last (build.sh runs it after
# post-build.sh). fedora-bootc ships a generic one: network boot (NFS, iSCSI,
# FCoE, NetworkManager), LVM, RAID, multipath, LUKS -- none of which a kiosk
# booting btrfs off its own eMMC uses, yet GRUB ia32 reads all of it through
# a Bay Trail's firmware from a slow eMMC, and an Atom unpacks it, on every
# boot.
#
# Two changes, both as command-line options ON TOP of the image's own dracut
# config (/usr/lib/dracut/dracut.conf.d -- ostree/bootc modules, compression,
# hostonly=no), not as a drop-in: the installer image (installer/Containerfile)
# regenerates the initramfs with that same config plus dmsquash-live and needs
# USB/ISO/network-agnostic pieces this list drops.
#   --omit:        dracut modules for storage/network stacks never used here;
#   --add-drivers: i915 (early KMS) -- the GPU is up before switch-root
#                  instead of whenever udev loads it from the real root, so
#                  cage doesn't sit in its wait-for-/dev/dri loop.
#
# Panel PCs with other storage (SATA, NVMe, USB) still boot: kernel driver
# selection (dracut's kernel-modules, hostonly=no) isn't touched.
#
# A bad initramfs can't brick a device: the previous deployment keeps its own,
# selectable in the GRUB menu (05_timeout.cfg) -- but the checks below are
# what keep one from shipping.

set -ouex pipefail

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
)

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
DRACUT_NO_XATTR=1 dracut --force --zstd --reproducible --no-hostonly \
    --omit " ${OMIT[*]} " \
    --add-drivers " i915 " \
    "${IMG}" "${KVER}"

STOCK_MODS=$(dracut_modules "${STOCK}")
NEW_MODS=$(dracut_modules "${IMG}")
lsinitrd "${STOCK}" > /tmp/initramfs-stock.list
lsinitrd "${IMG}" > /tmp/initramfs-new.list

echo "--- dracut modules dropped (expected: the OMIT list and what only it needed):"
comm -23 <(echo "${STOCK_MODS}") <(echo "${NEW_MODS}")
echo "--- dracut modules added:"
comm -13 <(echo "${STOCK_MODS}") <(echo "${NEW_MODS}")

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
# Bay Trail eMMC (sdhci-acpi + mmc_block) and early KMS: always required.
for k in mmc_block 'sdhci[-_]acpi' i915; do
    has_kmod /tmp/initramfs-new.list "${k}" || { echo "error: kernel module '${k}' missing from the initramfs" >&2; exit 1; }
done

echo "i915 in stock initramfs: $(has_kmod /tmp/initramfs-stock.list i915 && echo yes || echo no)"
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
echo "--- 20 biggest files:"
awk '$1 !~ /^l/ && $5 ~ /^[0-9]+$/ { printf "%8.1f MiB  %s\n", $5 / 1048576, $NF }' /tmp/initramfs-new.list |
    sort -rn | head -20
rm -f "${STOCK}" /tmp/initramfs-stock.list /tmp/initramfs-new.list
