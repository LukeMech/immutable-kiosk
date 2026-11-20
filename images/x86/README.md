# `x86` variant

x86_64 tablets and panel PCs. Package: `ghcr.io/lukemech/immutable-kiosk-x86`.

What it adds on top of the shared image:

- Wi-Fi firmware for the SDIO chips Bay Trail tablets use (Realtek RTL8723BS,
  Broadcom), `intel-gpu-firmware`.
- `thermald`, so a fanless Atom in a warm cabinet throttles gracefully.
- `iio-sensor-proxy` (accelerometer), for automatic rotation later (see ROADMAP).

32-bit UEFI support (`shim-ia32`, `grub2-efi-ia32`) is in the shared
[`build_files/20-efi-ia32.sh`](../../build_files/20-efi-ia32.sh): it costs a
few MB and makes the one image boot on both kinds of firmware.

Devices using it: see [`../devices.toml`](../devices.toml).
