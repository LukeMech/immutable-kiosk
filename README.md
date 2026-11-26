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
     https://<hmi-ip>/  fullscreen             http://127.0.0.1:8088/  ◄── kioskd (root)
     hold a corner ~1 s ──────────────────────►  HMI · Network · Display · System
     HMI unreachable → "Connecting…"            "← Back to HMI" (once it answers)
```

- **kiosk-shell** ([`kiosk-shell`](system_files/usr/libexec/immutable-kiosk/kiosk-shell),
  Python + GTK4 + WebKitGTK): two separate web views, not an iframe (HMI
  servers forbid framing). Accepts the HMI's self-signed certificate for the
  configured HMI host only. Retries the HMI every few seconds while it's down.
  Rotation through `wlr-randr` (landscape by default; per-device defaults in `images/devices.toml`).
- **kioskd** ([`kioskd`](system_files/usr/libexec/immutable-kiosk/kioskd),
  Python stdlib only, root): serves the page and a JSON API on
  `127.0.0.1:8088` -- `nmcli` for Wi-Fi/IP, `bootc` for updates (progress
  from `--progress-fd`, like lm-server's Cockpit page; the update check asks
  the registry for the manifest directly, `bootc` verifies the signature
  when it downloads), the installer. Any
  other page (the HMI included) is kept out by a required `X-Kiosk` header
  (no CORS) and a `Host` check.
- **Boot screen**: one progress bar from GRUB to the HMI. GRUB draws its
  first frame (kioskd turns it into glyphs of a GRUB font for the panel's
  rotation, accent and language: `/boot/grub2/console.cfg`); it stays up
  while the kernel starts, Plymouth takes over the same frame once i915 is
  up, and `kiosk-splash` in cage finishes the bar. Restart and power off
  the other way round: `kiosk-splash --shutdown` shows Plymouth's restart
  screen in the kiosk the moment it's asked for; Plymouth's follows.
- **On-screen keyboard** ([`osk.js`](system_files/usr/share/immutable-kiosk/web/osk.js)):
  Polish letters via the `ąę` key, numeric pad for number/IP fields, shadow
  DOM. Used by Settings and injected into the HMI page (switchable), so
  TwinCAT HMI's login can be typed too.
- Destructive actions (reboot, rollback, install, forget network) are
  **hold-to-confirm** buttons, not dialogs.
- **Auto shutdown without power** (System → Power, off by default): the
  charger unplugged for a set time (2 min by default; 30 s – 60 min) puts
  the tablet to sleep -- it wakes when the charger is back, as far as the
  hardware wakes on it, or with the power button -- or powers it off. The
  same corner card counts down over any screen, with *Cancel* (until the
  charger has been back). Woken on battery, it sleeps again after 30 s.
- Never sleeps otherwise (suspend only for the above), power key ignored (long press still forces off), Fedora's
  auto-update-and-reboot timer disabled: kioskd downloads updates itself
  and never restarts on its own (see Updates).

## Installing

1. From a [Release](../../releases): `immutable-kiosk-installer-<device>-<tag>.iso`
   (over 2 GiB it comes in parts `…iso.001`, `…iso.002`: open `.001` in 7-Zip / NanaZip and extract, or `cat …iso.0* > …iso`).
2. Write it to a USB stick (Fedora Media Writer, Rufus in DD mode, `dd`).
3. Tablet: USB-OTG hub with the stick (and a charger), boot from USB
   (on HP tablets the startup menu is usually *Volume down* held at
   power-on -- to be confirmed on the 408; Secure Boot can stay on, the
   bootloader is Fedora's signed shim).
4. The installer page lists the disks, internal eMMC preselected → hold
   **Hold for 3 s to install**. It streams the compressed disk image
   onto the eMMC with a real progress bar (MB/s, time left), checks its
   sha256 as it goes and reads parts of the disk back, then asks you to
   pull the stick and reboot.
5. First boot grows the root partition to the whole eMMC and opens Settings
   (no HMI configured yet): Wi-Fi → HMI address (saved as you go) →
   *← Back to HMI*. Every later start shows Settings until the HMI's server
   answers, then switches to the HMI by itself.

## Updates

Settings → **System**: *Check for updates* / *Update* (`bootc upgrade`, the
new image starts after a restart), the update channel -- *Stable* (`:latest`,
releases) or *Testing* (`:dev`, every build of the `dev` branch) -- rollback
to the previous image, and switching to any other image (`bootc switch`).

**Automatic updates** (System → *Automatic updates*, on by default): kioskd
checks the registry every hour once the boot is confirmed good and, when a
new version is out, downloads and stages it in the background (`bootc
upgrade` at the lowest CPU priority, never `--apply`). A small card over
the HMI, in the corner across from the Settings corner, follows it: the
version found and downloading, one progress bar for the download and the
install, then *Update ready* with *Hold: restart*. Each card has *Hide*
(hidden for that version); tapping the card opens Settings → System.
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
| `images/devices.toml` | physical devices: variant, DMI match, default rotation, panel orientation, whether it needs 32-bit UEFI; build-time only (the build derives the default-rotation table and kernel arguments from it) |
| `system_files/` | copied onto `/`: kioskd, kiosk-shell, the web page, systemd units, signature policy |
| `installer/` | the installer image (FROM the system image + payload + installer mode) and the ISO boot menu |
| `scripts/` | `ensure-efi-ia32.sh` (disk image boots on 32-bit UEFI), `iso-add-ia32.sh` (installer ISO boots on 32-bit UEFI), `shrink-raw.sh` (10 GiB disk image → its contents + 256 MiB), `check-iso.sh`, `make-payload.sh`; changelog helpers from immutable-sbc |

## Commit messages

Every commit subject starts with its type ([Conventional Commits](https://www.conventionalcommits.org/)),
so the release notes can group them -- build.yml lists *Features*, *Fixes* and
*Other changes* from them:

- `feat: ...` -- something new for the user (a setting, a screen, a behaviour);
- `fix: ...` -- something that was broken works again;
- `chore:`, `ci:`, `docs:`, `refactor:`, `perf:` -- anything else (*Other changes*).

A scope is welcome where it helps: `fix(updater): ...`, `feat(settings): ...`.
Development happens on `dev` (the testing channel); `main` is stable, and
merging `dev` into it promotes the tested build ([promote.yml](.github/workflows/promote.yml)).
Everything in the repository -- comments, docs, commit messages -- is in
English; the UI is English by default with Polish as an option
([i18n.js](system_files/usr/share/immutable-kiosk/web/i18n.js)).
