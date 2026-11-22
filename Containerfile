# The kiosk system image: what ends up on the device's own disk and what
# `bootc upgrade` keeps current. The installer ISO is built FROM this image
# (installer/Containerfile), so everything here exists on the ISO too.

# Build scripts referenced without being copied into the final image
FROM scratch AS ctx
COPY build_files /
COPY system_files /system_files
COPY images /images

# Fedora rather than AlmaLinux (lm-server): newer kernel for Bay Trail
# tablets, and Fedora still ships the 32-bit UEFI bootloaders (shim-ia32,
# grub2-efi-ia32) these tablets need -- see build_files/20-efi-ia32.sh.
#
# Floating tag on purpose, same as immutable-sbc: a pinned digest 404'd once
# quay.io GC'd it.
FROM quay.io/fedora/fedora-bootc:45

# Which images/<VARIANT>/ this image builds (see images/variants.toml).
ARG VARIANT=x86
# Release tag and commit (Justfile/CI): the version in os-release, so the
# GRUB entry and Settings show "v45.20261122.1-778b844". Empty locally.
ARG RELEASE_TAG=
ARG GIT_SHA=

RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=cache,dst=/var/cache \
    --mount=type=cache,dst=/var/log \
    --mount=type=tmpfs,dst=/tmp \
    RELEASE_TAG="${RELEASE_TAG}" GIT_SHA="${GIT_SHA}" /ctx/build.sh "${VARIANT}"

RUN bootc container lint
