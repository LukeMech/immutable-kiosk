# The kiosk system image (installed and `bootc upgrade`d); the installer ISO
# is built from it too.

# Build scripts referenced without being copied into the final image
FROM scratch AS ctx
COPY build_files /
COPY system_files /system_files
COPY images /images

# Fedora: newer kernel for Bay Trail, and it still ships the 32-bit UEFI
# bootloaders. Floating tag on purpose: quay.io GCs pinned digests.
FROM quay.io/fedora/fedora-bootc:45

# Which images/<VARIANT>/ this image builds (see images/variants.toml).
ARG VARIANT=x86
# Release tag and commit (from CI) for os-release; empty locally.
ARG RELEASE_TAG=
ARG GIT_SHA=

RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=cache,dst=/var/cache \
    --mount=type=cache,dst=/var/log \
    --mount=type=tmpfs,dst=/tmp \
    RELEASE_TAG="${RELEASE_TAG}" GIT_SHA="${GIT_SHA}" /ctx/build.sh "${VARIANT}"

RUN bootc container lint
