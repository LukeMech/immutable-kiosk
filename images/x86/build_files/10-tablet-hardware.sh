#!/bin/bash
# x86 tablets / panel PCs: Wi-Fi firmware and thermal management.
#
# Bay Trail tablets (HP Pro Tablet 408 G1 among them) mostly use SDIO Wi-Fi
# (Realtek RTL8723BS -> rtlwifi/rtl8723bs_nic.bin in realtek-firmware;
# some revisions Broadcom -> brcmfmac). Both drivers are in Fedora's kernel.

set -ouex pipefail

dnf install -y \
    realtek-firmware \
    brcmfmac-firmware \
    intel-gpu-firmware \
    thermald

# thermald keeps a fanless Atom from throttling itself into lag (or worse)
# when the panel sits in a warm cabinet.
systemctl enable thermald.service
