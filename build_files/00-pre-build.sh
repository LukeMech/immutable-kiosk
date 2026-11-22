#!/bin/bash

set -ouex pipefail

# No weak dependencies: no room on a 2 GiB / 32 GiB tablet.
sed -i '/^\[main\]/a install_weak_deps=False' /etc/dnf/dnf.conf
