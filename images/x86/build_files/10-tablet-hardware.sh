#!/bin/bash
# x86 tablets / panel PCs: Wi-Fi firmware and thermal management.
# Bay Trail tablets mostly use SDIO Wi-Fi: Realtek RTL8723BS, some Broadcom.

set -ouex pipefail

dnf install -y \
    realtek-firmware \
    brcmfmac-firmware \
    intel-gpu-firmware \
    thermald

# Keeps a fanless Atom in a warm cabinet from throttling into lag.
systemctl enable thermald.service
