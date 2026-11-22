#!/bin/bash
# The x86 variant's slim initramfs, built last (build.sh runs it after
# post-build.sh). Size costs boot time twice: GRUB ia32 reads the file through
# slow firmware (~8 MB/s off eMMC), then the Atom unpacks it. On top of the
# image's dracut.conf.d:
#   --omit:         storage/network stacks never used here, hwdb (12 MB, only
#                   input devices need it) and i18n;
#   --add-drivers:  i915 for the splash (Plymouth ignores orientation on
#                   simpledrm; probed async via driver_async_probe=i915), and
#                   drivers/pwm: on Bay/Cherry Trail i915 looks the backlight
#                   PWM up once at probe, so it must be bound first
#                   (i915-backlight.conf softdep);
#   --fwdir (empty): no firmware; i915's blobs are ~10 MB and these GPUs run
#                   fine without (newer Atoms just lose DMC power states);
#   --no-early-microcode: the generic cpio has every Intel CPU (16 MB); ours
#                   has only the target Atoms (early_microcode).
#   OMIT_DRIVERS:   modules for hardware/filesystems never booted from here
#                   (their firmware goes with them).
# Other storage (SATA, NVMe, USB) still boots; the build fails if a driver for
# it goes (NEED_KMODS). A bad initramfs falls back via rd.emergency=reboot +
# boot-counter, but the checks below are what keep one from shipping.
#
# Usage: initramfs.sh [extra dracut module...]
# installer/Containerfile runs it with `dmsquash-live` for the live ISO.

set -ouex pipefail

EXTRA=("$@")

OMIT=(
    network network-manager network-legacy ifcfg kernel-network-modules
    nfs iscsi nbd fcoe fcoe-uefi cifs nvmf lunmask
    lvm mdraid dmraid multipath
    crypt crypt-gpg crypt-loop systemd-cryptsetup tpm2-tss systemd-pcrextend
    # fedora-bootc forces clevis; with its dependency omitted dracut fails,
    # so omit it too (omit beats add).
    clevis clevis-pin-file clevis-pin-null clevis-pin-sss clevis-pin-tang clevis-pin-tpm2
    qemu qemu-net biosdevname memstrack resume
    # Cloud/VM/server bits: Azure agent, FIPS, virtiofs, NVDIMM, extra drivers.
    walinuxagent fips fips-crypto-policies openssl nss-softokn
    virtiofs nvdimm kernel-modules-extra
    hwdb i18n
)

# dracut --omit-drivers: each entry is a regex on the whole module name (- read
# as _), compiled as BRE: no +, ?, | or (). None is needed to mount the root;
# the real root loads the rest later.
OMIT_DRIVERS=(
    # Non-Intel GPUs (dracut's drm module packs every KMS driver; amdgpu alone
    # is 6.5 MB). i915 and virtio_gpu (VM testing) stay.
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
    # Hypervisor guests other than KVM's virtio.
    'xen_.*' 'hv_.*' hyperv_keyboard vmw_pvscsi vboxsf
    # Block/RAID/NVMe-over-fabrics.
    aoe brd drbd mtip32xx nbd null_blk rbd 'rnbd_.*' rnull_mod ublk_drv zloop
    bcache dm_multipath nvme_fc nvme_fabrics 'nvmet.*'
    # Filesystems. Kept: btrfs, overlay/erofs (composefs), isofs/squashfs
    # (installer ISO), vfat/exfat/ext4.
    9p '9pnet.*' kafs binfmt_misc cachefiles ceph libceph ecryptfs f2fs fuse
    virtiofs hfs hfsplus jffs2 jfs minix netfs grace 'nfs_.*' xfs ntfs ntfs3
    orangefs romfs 'cifs.*' smb_compress udf zonefs ramoops 'mac_.*'
    'nls_cp[^4].*' nls_euc_jp 'nls_iso8859_[23456789]' 'nls_iso8859_1[345]'
    'nls_koi8_.*'
    # Network and Wi-Fi stacks (SDIO Wi-Fi comes in with the MMC drivers).
    mac80211 cfg80211 rfkill rxrpc sunrpc tls dns_resolver udp_tunnel
    ip6_udp_tunnel 'mt76.*' 'mt79.*' 'mt792x_.*'
    # Crypto accelerators and ciphers only dm-crypt/IPsec/krb5 use.
    'qat_.*' intel_qat 'ccp.*' chcr iaa_crypto 'atmel_.*' 'padlock_.*'
    virtio_crypto 'aegis128.*' 'blowfish.*' 'camellia.*' 'cast[56c].*'
    'serpent.*' 'twofish.*' adiantum hctr2 'krb5.*' ecrdsa_generic
    streebog_generic tcrypt wp512 rmd160 md4 des_generic essiv xctr xcbc
    pcrypt crypto_user 'async_.*' 'idxd.*'
    # Firewire, Thunderbolt, UFS, USB-C muxes and PD controllers.
    'firewire_.*' thunderbolt 'ufshcd.*' cdns_pltfrm 'typec.*' 'tcpci.*' tcpm
    'ucsi.*' cros_ec_ucsi hd3ss3220 fsa4480 gpio_sbu_mux intel_pmc_mux it5205
    nb7vpq904m pi3usb30532 ps883x ptn36502 tusb1046 rt1719 stusb160x fusb302
    tps6598x wusb3801
    # Watchdogs, Chromebook/Surface/ASUS platform drivers.
    '.*_wdt' i6300esb ib700wdt ibmasr hpwdt nv_tco 'pcwd_.*' softdog
    sp5100_tco wdt_pci 'cros_.*' 'surface_.*' asus_wmi
    # Vendor HID, sensor hubs, touch (no input at boot: rd.shell=0).
    # hid, hid_generic, usbhid stay.
    'hid_[^g].*' 'hid_g[^e].*' 'hid_ge[^n].*' amd_sfh 'intel_ish.*'
    'intel_ishtp.*' 'intel_quick.*' intel_thc uhid wacom 'i2c_hid.*'
    applespi charlieplex_keypad cypress_sf 'qt10[57]0' tm2_touchkey rmi_core
    altera_ps2 arc_ps2
    # Card readers other than SDHCI, PATA and old SATA HBAs, USB storage quirk
    # drivers, other SoCs' pin controllers.
    'alcor.*' 'rtsx_.*' 'cb710.*' 'tifm_.*' toshsd via_sdmmc vub300 wbsd ushc
    sdricoh_cs sdhci_xenon_driver sdio_uart 'pata_.*' pdc_adma acard_ahci
    sata_mv sata_nv sata_promise sata_qstor sata_sil sata_sil24 sata_sis
    sata_svw sata_sx4 sata_uli sata_via sata_vsc
    microtek 'ums_.*' 'pinctrl_.*'
)
# Must survive OMIT_DRIVERS (in the initramfs or built in): eMMC, SATA, NVMe,
# USB, the ostree/composefs root, the ISO's isofs/squashfs.
NEED_KMODS=(
    mmc_block 'sdhci[-_]acpi' 'sdhci[-_]pci' sdhci btrfs overlay erofs loop
    ahci nvme 'usb[-_]storage' uas sd_mod isofs squashfs
)

# Early microcode for the target Atoms: Bay Trail, Cherry Trail/Braswell,
# Apollo Lake, Gemini Lake. Other CPUs keep what their firmware loaded.
UCODE_GLOBS=(06-37-* 06-4c-* 06-5c-* 06-7a-*)
UCODE_DIR=/usr/lib/firmware/intel-ucode

# Must survive if the stock initramfs had them: what mounts the root.
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

# In the initramfs or built in. Greps a saved listing: `lsinitrd | grep -q`
# gets SIGPIPE and pipefail turns a hit into a miss.
has_kmod() {
    local listing=$1 pattern=$2
    grep -Eq "/${pattern}\.ko" "${listing}" ||
        grep -Eq "/${pattern}\.ko" "/usr/lib/modules/${KVER}/modules.builtin"
}

# DRACUT_NO_XATTR: no xattrs in a container build. --no-hostonly: never size
# to the build host.
ADD=()
if [[ ${#EXTRA[@]} -gt 0 ]]; then
    ADD=(--add " ${EXTRA[*]} ")
fi
# zstd -19: a few % smaller, same decompression speed.
# Run from an empty dir: dracut word-splits the omit list unquoted, so
# patterns like 'mpt.*' would glob against the cwd.
EMPTY=$(mktemp -d)
NOFW=$(mktemp -d)   # --fwdir: no firmware

# i915 loads from its own unit, not udev's coldplug: loading takes ~2.5 s on
# the Atom and `udevadm settle` would hold the root mount for it. The
# blacklist only stops udev's alias modprobe, not an explicit `modprobe i915`.
# Initramfs only; the real root already has i915 loaded.
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

# Uncompressed early cpio in front of the main archive, same layout as dracut's.
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

# Root drivers the stock initramfs had must not be caught by OMIT_DRIVERS.
for k in "${NEED_KMODS[@]}"; do
    if has_kmod /tmp/initramfs-stock.list "${k}" && ! has_kmod /tmp/initramfs-new.list "${k}"; then
        echo "error: kernel module '${k}' was in the stock initramfs and is gone from ours" >&2
        exit 1
    fi
done
# Bay Trail eMMC: always required.
for k in mmc_block 'sdhci[-_]acpi'; do
    has_kmod /tmp/initramfs-new.list "${k}" || { echo "error: kernel module '${k}' missing from the initramfs" >&2; exit 1; }
done
# Splash: early KMS, backlight PWM, our theme.
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
if grep -q 'usr/lib/firmware/i915/' /tmp/initramfs-new.list; then
    echo "error: i915 firmware ended up in the initramfs (--fwdir ignored?)" >&2
    exit 1
fi
# No pipe into grep -q (SIGPIPE + pipefail).
if grep -aq 'kernel/x86/microcode/GenuineIntel.bin' "${IMG}"; then
    echo "early microcode: present"
else
    echo "early microcode: none"
fi
ls -l "${STOCK}" "${IMG}"
echo "kernel modules: stock $(grep -c '\.ko' /tmp/initramfs-stock.list) -> ours $(grep -c '\.ko' /tmp/initramfs-new.list)"
# Size report (uncompressed, from lsinitrd): by area, then the biggest files.
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
# Via a file: `sort | head` gets sort SIGPIPE'd, failing the build under pipefail.
awk '$1 !~ /^l/ && $5 ~ /^[0-9]+$/ { printf "%8.1f MiB  %s\n", $5 / 1048576, $NF }' /tmp/initramfs-new.list |
    sort -rn > /tmp/initramfs-biggest.list
head -20 /tmp/initramfs-biggest.list
rm -f /tmp/initramfs-biggest.list
rm -f "${STOCK}" /tmp/initramfs-stock.list /tmp/initramfs-new.list
