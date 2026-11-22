#!/bin/bash
# name<TAB>epoch:version-release per package, sorted; gpg-pubkey pseudo-packages
# dropped (a key rotation isn't a package change).
#
# Usage: list-packages.sh <image-ref>

set -euo pipefail

IMAGE="${1:?usage: $0 <image-ref>}"

podman run --rm --entrypoint rpm "${IMAGE}" -qa --qf '%{NAME}\t%{EPOCH}:%{VERSION}-%{RELEASE}\n' 2>/dev/null \
    | sed 's/\t(none):/\t/' \
    | grep -v $'^gpg-pubkey\t' \
    | sort -k1,1
