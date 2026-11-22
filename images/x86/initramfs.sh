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
#   --add-drivers:  i915 (early KMS) for the boot splash -- Plymouth needs the
#                   real GPU driver: simpledrm has no panel orientation and
#                   Fedora's Plymouth ignores it. Its ~3 s probe used to hold
#                   the root mount up (dracut-initqueue's `udevadm settle`
#                   waited for it: root found at 6.7 s, mounted at 10.2 s);
#                   now it's probed asynchronously (driver_async_probe=i915,
#                   images/x86 kargs.d), so it doesn't. Plus drivers/pwm and
#                   i915-backlight.conf: on Bay Trail/Cherry Trail the
#                   backlight is a PWM i915 looks up once, at probe -- without
#                   the PWM driver bound first, no intel_backlight (the softdep
#                   makes sure it is);
#   --fwdir (empty): no firmware at all. Nothing else in here needs any, and
#                   for i915 dracut would pack GuC/HuC/DMC/GSC blobs of every
#                   GPU generation (~10 MB). Bay Trail/Cherry Trail graphics
#                   take none; on newer Atoms i915 runs without DMC (deeper
#                   display power states off), which is fine for a panel
#                   that's always on;
#   --no-early-microcode: dracut's generic early cpio carries every Intel
#                   CPU's microcode (16 MB, uncompressed). Ours carries only
#                   the Atom families this image is for (early_microcode).
#
#   OMIT_DRIVERS:   of the ~700 kernel modules hostonly=no packs (xz-compressed
#                   already, so they're most of the file), the ones for hardware
#                   and filesystems these devices never boot from: server HBAs,
#                   InfiniBand, network filesystems, Wi-Fi, crypto accelerators,
#                   USB-C, watchdogs, vendor HID drivers... Their firmware goes
#                   with them (dracut adds firmware only for included modules).
#
# Panel PCs with other storage (SATA/AHCI, NVMe, USB) still boot: the drivers
# that find a root there stay, and the build fails if one goes (NEED_KMODS).
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
    qemu qemu-net biosdevname memstrack resume
    # Cloud/VM/server bits fedora-bootc carries for other targets: Azure's
    # agent, FIPS mode (needs fips=1 on the kernel command line anyway),
    # virtiofs root, NVDIMM, and kernel-modules-extra's exotic drivers.
    walinuxagent fips fips-crypto-policies openssl nss-softokn
    virtiofs nvdimm kernel-modules-extra
    hwdb i18n
)

# Kernel modules left out (dracut --omit-drivers: each entry is a regex
# matched against the whole module name, with - read as _). Basic regex
# syntax only -- dracut-install compiles them as BRE: no +, ?, | or (). Nothing here is
# needed to find and mount the root; the real root loads whatever the
# hardware needs from /usr/lib/modules later, as usual.
OMIT_DRIVERS=(
    # GPUs other than Intel's: dracut's drm module (Plymouth depends on it)
    # packs every KMS driver -- amdgpu alone is 6.5 MB. i915 stays (added
    # explicitly), so does virtio_gpu (small; for testing in a VM).
    amdgpu amdxcp amdkfd radeon nouveau xe vmwgfx gma500_gfx ast mgag200 qxl
    bochs cirrus_qemu hyperv_drm hyperv_fb vboxvideo vkms vgem udl gud gm12u320
    kvmgt ch7006 sil164 pixpaper sharp_memory 'ili9.*' 'ssd130x.*'
    'st7[0-9].*' 'panel_.*' thinkpad_acpi chromeos_privacy_screen
    # Server/legacy SCSI HBAs, FC, SAS, iSCSI, InfiniBand, SCSI targets.
    '3w_.*' BusLogic a100u2w aacraid advansys 'aic7.*' am53c974 arcmsr atp870u
    bfa bnx2fc csiostor dc395x dmx3191d efct esas2r esp_scsi 'fcoe' 'libfc.*'
    'fdomain.*' fnic hpsa hptiop initio ipr ips isci leapraid libsas lpfc
    'megaraid.*' mpi3mr 'mpt.*' mvsas mvumi myrb myrs pm80xx pmcraid qedf
    'qla.*' raid_class scsi_debug scsi_transport_fc scsi_transport_sas
    scsi_transport_spi scsi_transport_srp scsi_transport_iscsi
    smartpqi snic stex sym53c8xx vmw_pvscsi wd719x 'libiscsi.*'
    iscsi_boot_sysfs 'scsi_dh_.*' tcm_loop 'target_core_.*'
    'ib_.*' iw_cm 'rdma_.*' 'rtrs_.*' 'cnic' 'cxgb.*' 'qed.*'
    # Hypervisor guests other than KVM's virtio (that one stays, for testing).
    'xen_.*' 'hv_.*' hyperv_keyboard vmw_pvscsi vboxsf
    # Block/RAID/NVMe-over-fabrics nobody boots from here.
    aoe brd drbd mtip32xx nbd null_blk rbd 'rnbd_.*' rnull_mod ublk_drv zloop
    bcache dm_multipath nvme_fc nvme_fabrics 'nvmet.*'
    # Filesystems: the root is btrfs (+ overlay/erofs for composefs); the
    # installer ISO needs isofs/squashfs; vfat/exfat/ext4 stay too.
    9p '9pnet.*' kafs binfmt_misc cachefiles ceph libceph ecryptfs f2fs fuse
    virtiofs hfs hfsplus jffs2 jfs minix netfs grace 'nfs_.*' xfs ntfs ntfs3
    orangefs romfs 'cifs.*' smb_compress udf zonefs ramoops 'mac_.*'
    'nls_cp[^4].*' nls_euc_jp 'nls_iso8859_[23456789]' 'nls_iso8859_1[345]'
    'nls_koi8_.*'
    # Network and Wi-Fi stacks (SDIO Wi-Fi came in with the MMC drivers).
    mac80211 cfg80211 rfkill rxrpc sunrpc tls dns_resolver udp_tunnel
    ip6_udp_tunnel 'mt76.*' 'mt79.*' 'mt792x_.*'
    # Crypto accelerators and ciphers only dm-crypt/IPsec/krb5 use.
    'qat_.*' intel_qat 'ccp.*' chcr iaa_crypto 'atmel_.*' 'padlock_.*'
    virtio_crypto 'aegis128.*' 'blowfish.*' 'camellia.*' 'cast[56c].*'
    'serpent.*' 'twofish.*' adiantum hctr2 'krb5.*' ecrdsa_generic
    streebog_generic tcrypt wp512 rmd160 md4 des_generic essiv xctr xcbc
    pcrypt crypto_user 'async_.*' 'idxd.*'
    # Firewire, Thunderbolt, UFS, USB-C/Type-C muxes and PD controllers.
    'firewire_.*' thunderbolt 'ufshcd.*' cdns_pltfrm 'typec.*' 'tcpci.*' tcpm
    'ucsi.*' cros_ec_ucsi hd3ss3220 fsa4480 gpio_sbu_mux intel_pmc_mux it5205
    nb7vpq904m pi3usb30532 ps883x ptn36502 tusb1046 rt1719 stusb160x fusb302
    tps6598x wusb3801
    # Watchdogs (37 of them), Chromebook/Surface/ASUS platform drivers.
    '.*_wdt' i6300esb ib700wdt ibmasr hpwdt nv_tco 'pcwd_.*' softdog
    sp5100_tco wdt_pci 'cros_.*' 'surface_.*' asus_wmi
    # HID: vendor-specific drivers, sensor hubs, touch controllers -- nothing
    # to type into during boot (rd.shell=0). hid, hid_generic, usbhid stay.
    'hid_[^g].*' 'hid_g[^e].*' 'hid_ge[^n].*' amd_sfh 'intel_ish.*'
    'intel_ishtp.*' 'intel_quick.*' intel_thc uhid wacom 'i2c_hid.*'
    applespi charlieplex_keypad cypress_sf 'qt10[57]0' tm2_touchkey rmi_core
    altera_ps2 arc_ps2
    # Card readers other than the SoC's SDHCI; parallel ATA and old SATA HBAs;
    # USB storage quirk drivers for 2000s card readers; pin controllers of
    # other SoCs (none of it finds a root here).
    'alcor.*' 'rtsx_.*' 'cb710.*' 'tifm_.*' toshsd via_sdmmc vub300 wbsd ushc
    sdricoh_cs sdhci_xenon_driver sdio_uart 'pata_.*' pdc_adma acard_ahci
    sata_mv sata_nv sata_promise sata_qstor sata_sil sata_sil24 sata_sis
    sata_svw sata_sx4 sata_uli sata_via sata_vsc
    microtek 'ums_.*' 'pinctrl_.*'
)
# ...and what must still be there (in the initramfs or built in): eMMC on the
# Atom SoCs, SATA/AHCI, NVMe, USB sticks, the ostree/composefs root, and the
# installer ISO's isofs/squashfs.
NEED_KMODS=(
    mmc_block 'sdhci[-_]acpi' 'sdhci[-_]pci' sdhci btrfs overlay erofs loop
    ahci nvme 'usb[-_]storage' uas sd_mod isofs squashfs
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
# zstd -19: a few % smaller than dracut's default level for the same
# decompression speed (only the build takes longer).
# From an empty directory: dracut word-splits the omit list unquoted, so a
# pattern like 'mpt.*' would otherwise glob against files in the cwd.
EMPTY=$(mktemp -d)
NOFW=$(mktemp -d)   # --fwdir: no firmware (see the top)

# i915 off udev's coldplug, onto a unit of its own (initramfs only).
# Loading the module -- ~4.7 MB unpacked from xz and linked, on an Atom --
# takes ~2.5 s, and udev did it inside coldplug: dracut-initqueue's
# `udevadm settle` waited for it, so the root (found at 6.3 s) was mounted
# only at 9.6 s, after "GPU gotowe" at 8.9 s -- even with the probe itself
# asynchronous (driver_async_probe=i915). Now:
#   - "blacklist i915": udev's alias-driven modprobe skips it (a blacklist
#     never stops an explicit `modprobe i915`);
#   - i915-early.service: `modprobe i915` the moment the initramfs starts,
#     beside everything else, waited for by nothing but sysroot's switch.
# The real root has neither: there i915 is already loaded.
TREE=$(mktemp -d)
mkdir -p "${TREE}/etc/modprobe.d" "${TREE}/usr/lib/systemd/system/sysinit.target.wants"
cat > "${TREE}/etc/modprobe.d/i915-initramfs.conf" <<'EOF'
# immutable-kiosk initramfs: loaded by i915-early.service, not udev's coldplug.
blacklist i915
EOF
cat > "${TREE}/usr/lib/systemd/system/i915-early.service" <<'EOF'
[Unit]
Description=Load i915 beside udev's coldplug (immutable-kiosk)
DefaultDependencies=no
ConditionPathExists=/etc/initrd-release
# Done before the initramfs hands over (initrd-cleanup stops everything).
Before=initrd-switch-root.target initrd-cleanup.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=modprobe i915
EOF
ln -s ../i915-early.service "${TREE}/usr/lib/systemd/system/sysinit.target.wants/i915-early.service"

(cd "${EMPTY}" && DRACUT_NO_XATTR=1 dracut --force --reproducible --no-hostonly \
    --compress "zstd -19 -q -T0" \
    --no-early-microcode \
    --fwdir "${NOFW}" \
    --omit " ${OMIT[*]} " \
    --omit-drivers " ${OMIT_DRIVERS[*]} " \
    --add-drivers " i915 =drivers/pwm " \
    --install /usr/lib/modprobe.d/i915-backlight.conf \
    --include "${TREE}" / \
    "${ADD[@]}" \
    "${IMG}" "${KVER}")
rm -rf "${TREE}"
rmdir "${EMPTY}" "${NOFW}"

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
    command -v cpio >/dev/null || dnf install -y cpio
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

# What finds and mounts a root (NEED_KMODS): whatever of it the stock
# initramfs had must still be there -- OMIT_DRIVERS' regexes must not catch it.
for k in "${NEED_KMODS[@]}"; do
    if has_kmod /tmp/initramfs-stock.list "${k}" && ! has_kmod /tmp/initramfs-new.list "${k}"; then
        echo "error: kernel module '${k}' was in the stock initramfs and is gone from ours" >&2
        exit 1
    fi
done
# Bay Trail eMMC (sdhci-acpi + mmc_block): always required.
for k in mmc_block 'sdhci[-_]acpi'; do
    has_kmod /tmp/initramfs-new.list "${k}" || { echo "error: kernel module '${k}' missing from the initramfs" >&2; exit 1; }
done
# Early KMS for the splash, with the backlight PWM bound before i915 probes;
# and the splash itself, with our theme.
for k in i915 'pwm[-_]lpss[-_]platform'; do
    has_kmod /tmp/initramfs-new.list "${k}" || { echo "error: kernel module '${k}' missing from the initramfs" >&2; exit 1; }
done
grep -q 'usr/lib/modprobe.d/i915-backlight.conf' /tmp/initramfs-new.list ||
    { echo "error: i915-backlight.conf (PWM before i915) missing from the initramfs" >&2; exit 1; }
for f in etc/modprobe.d/i915-initramfs.conf usr/lib/systemd/system/i915-early.service \
    usr/lib/systemd/system/sysinit.target.wants/i915-early.service; do
    grep -q "${f}" /tmp/initramfs-new.list || { echo "error: ${f} missing from the initramfs" >&2; exit 1; }
done
grep -qx plymouth <<<"${NEW_MODS}" || { echo "error: dracut's plymouth module is not in the initramfs" >&2; exit 1; }
grep -q 'usr/share/plymouth/themes/immutable-kiosk/outer.png' /tmp/initramfs-new.list ||
    { echo "error: the immutable-kiosk Plymouth theme is not in the initramfs" >&2; exit 1; }
# No firmware (see the top): i915's would be ~10 MB.
if grep -q 'usr/lib/firmware/i915/' /tmp/initramfs-new.list; then
    echo "error: i915 firmware ended up in the initramfs (--fwdir ignored?)" >&2
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
