#!/bin/bash

set -ouex pipefail

# Never install weak dependencies (Recommends/Supplements) -- a kiosk on a
# 2 GiB / 32 GiB tablet has no room for whatever a package merely suggests.
sed -i '/^\[main\]/a install_weak_deps=False' /etc/dnf/dnf.conf
