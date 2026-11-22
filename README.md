# immutable-kiosk

An immutable [bootc](https://containers.github.io/bootc/) kiosk image: the
device boots straight into a fullscreen web HMI (built for Beckhoff TwinCAT
HMI / TF2000, works with any web HMI), with a touch-first Settings page for
Wi-Fi, IP, the HMI address and system updates. No desktop, no physical
keyboard needed anywhere -- installer included.

Same family as [immutable-sbc](https://github.com/LukeMech/immutable-sbc)
(Fedora bootc, variants/devices, cosign-signed, OTA via `bootc`) and
[lm-server-config](https://github.com/LukeMech/lm-server-config) (installer
ISO from a bootable container). First device: **HP Pro Tablet 408 G1**
(Atom Z3736F, 2 GB RAM, 32 GB eMMC, 64-bit CPU with **32-bit UEFI**).

Planned features: [ROADMAP.md](ROADMAP.md).

## How it looks on the device

```
power on ─► GRUB (BOOTIA32.EFI) ─► Fedora ─► cage (Wayland, one app) ─► kiosk-shell
                                                                          │
                     ┌────────────────────────────────────────────────────┤
                     ▼                                                    ▼
             HMI view (WebKit)                              Settings view (WebKit)
     https://<hmi-ip>:1020/  fullscreen        http://127.0.0.1:8088/  ◄── kioskd (root)
     hold a corner ~2 s ──────────────────────►  HMI · Wi-Fi · Sieć · Ekran · System
     HMI unreachable → error page with ⚙        "← Wróć do HMI"
```

- **kiosk-shell** ([`kiosk-shell`](system_files/usr/libexec/immutable-kiosk/kiosk-shell),
  Python + GTK4 + WebKitGTK): two separate web views, not an iframe (HMI
  servers forbid framing). Accepts the HMI's self-signed certificate for the
  configured HMI host only. Retries the HMI every few seconds while it's down.
  Rotation through `wlr-randr` (landscape by default; per-device defaults in `images/devices.toml`).
- **kioskd** ([`kioskd`](system_files/usr/libexec/immutable-kiosk/kioskd),
  Python stdlib only, root): serves the page and a JSON API on
  `127.0.0.1:8088` -- `nmcli` for Wi-Fi/IP, `bootc` for updates (progress
  from `--progress-fd`, like lm-server's Cockpit page), the installer. Any
  other page (the HMI included) is kept out by a required `X-Kiosk` header
  (no CORS) and a `Host` check.
- **On-screen keyboard** ([`osk.js`](system_files/usr/share/immutable-kiosk/web/osk.js)):
  Polish letters via the `ąę` key, numeric pad for number/IP fields, shadow
  DOM. Used by Settings and injected into the HMI page (switchable), so
  TwinCAT HMI's login can be typed too.
- Destructive actions (reboot, rollback, install, forget network) are
  **hold-to-confirm** buttons, not dialogs.
- No suspend, power key ignored (long press still forces off), Fedora's
  auto-update-and-reboot timer disabled: updates happen from Settings.

## Installing

1. From a [Release](../../releases): `immutable-kiosk-installer-<device>-<tag>.iso`
   (over 2 GiB it comes in parts `…iso.001`, `…iso.002`: open `.001` in 7-Zip / NanaZip and extract, or `cat …iso.0* > …iso`).
2. Write it to a USB stick (Fedora Media Writer, Rufus in DD mode, `dd`).
3. Tablet: USB-OTG hub with the stick (and a charger), boot from USB
   (on HP tablets the startup menu is usually *Volume down* held at
   power-on -- to be confirmed on the 408; Secure Boot can stay on, the
   bootloader is Fedora's signed shim).
4. The installer page lists the disks, internal eMMC preselected → hold
   **Przytrzymaj 3 s, aby zainstalować**. It streams the compressed disk image
   onto the eMMC with a real progress bar (MB/s, time left), reads it back
   to verify, then asks you to pull the stick and reboot.
5. First boot grows the root partition to the whole eMMC and opens Settings
   (no HMI configured yet): Wi-Fi → HMI address → *Zapisz i otwórz HMI*.

## Updates

Settings → **System**: *Sprawdź aktualizacje* / *Aktualizuj* (`bootc upgrade`,
the new image starts after a restart), rollback to the previous image, and
switching to another image (`bootc switch`, e.g. a `testing-<branch>` tag).
The enforced signature policy (from immutable-sbc) only accepts
`ghcr.io/lukemech/*` images signed with the repo's cosign key.

## Building

```bash
just build                 # ghcr-style image immutable-kiosk-x86:latest (local)
just build-raw             # raw disk + installer payload in dist/  (sudo)
just build-iso             # installer ISO in dist/                 (sudo)
just run-vm-ia32           # boot the ISO in QEMU with 32-bit UEFI firmware (edk2-ovmf-ia32)
```

CI: [build.yml](.github/workflows/build.yml) builds, rechunks, pushes and signs
`ghcr.io/lukemech/immutable-kiosk-<variant>` and publishes a release
(`v<fedora>.<date>`); [build-media.yml](.github/workflows/build-media.yml) then
builds the installer ISO per device and attaches it (the raw disk image is only its payload, not a release asset).
Needs the repo secret **`SIGNING_SECRET`** (the same cosign key as
immutable-sbc / lm-server).

## Repository

| Path | What |
|---|---|
| `Containerfile`, `build_files/` | the system image: Fedora bootc 45, numbered hooks as in immutable-sbc. `05-base` network/zram/growroot, `10-kiosk` cage + WebKit + services, `20-efi-ia32` 32-bit UEFI boot (shim/GRUB ia32 + bootupd metadata) |
| `images/variants.toml`, `images/<variant>/` | OS variants (`x86` today: tablet Wi-Fi firmware, thermald, and `initramfs.sh`, run last: a slimmer initramfs without network/LVM/RAID/LUKS/cloud stacks, early KMS or other CPUs' microcode) |
| `images/devices.toml` | physical devices: variant, DMI match, default rotation, whether it needs 32-bit UEFI; shipped into the image for runtime defaults |
| `system_files/` | copied onto `/`: kioskd, kiosk-shell, the web page, systemd units, signature policy |
| `installer/` | the installer image (FROM the system image + payload + installer mode) and the ISO boot menu |
| `scripts/` | `ensure-efi-ia32.sh` (disk image boots on 32-bit UEFI), `iso-add-ia32.sh` (installer ISO boots on 32-bit UEFI), `shrink-raw.sh` (10 GiB disk image → its contents + 256 MiB), `check-iso.sh`, `make-payload.sh`; changelog helpers from immutable-sbc |
