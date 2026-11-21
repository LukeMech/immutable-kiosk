set dotenv-filename := "image-template.env"
set dotenv-load

export image_name := env_var("IMAGE_NAME")
export repo_organization := env_var("REPO_ORGANIZATION")
export image_desc := env_var("IMAGE_DESC")
export image_keywords := env_var("IMAGE_KEYWORDS")
export image_logo_url := env_var("IMAGE_LOGO_URL")
export default_tag := env_var("DEFAULT_TAG")

[private]
default:
    @just --list

# Check Just Syntax
[group('Just')]
check:
    #!/usr/bin/env bash
    echo "Checking syntax: Justfile"
    just --unstable --fmt --check -f Justfile

# Fix Just Syntax
[group('Just')]
fix:
    just --unstable --fmt -f Justfile

# Clean Repo
[group('Utility')]
clean:
    #!/usr/bin/env bash
    set -eoux pipefail
    touch _build
    find *_build* -exec rm -rf {} \;
    rm -f previous.manifest.json changelog.md output.env
    rm -rf output/ dist/

# Build the container image ($variant picks images/<variant>/, see images/variants.toml)
[group('Build')]
build $variant="x86" $target_image=(image_name + "-" + variant) $tag=default_tag:
    #!/usr/bin/env bash
    set -euox pipefail

    LABELS=()
    if [[ -z "$(git status -s)" ]]; then
        GIT_SHA=$(git rev-parse --short HEAD)
        LABELS+=("--label" "org.opencontainers.image.source=https://github.com/{{ repo_organization }}/{{ image_name }}/blob/${GIT_SHA}/Containerfile")
        LABELS+=("--label" "org.opencontainers.image.url=https://github.com/{{ repo_organization }}/{{ image_name }}/tree/${GIT_SHA}")
        LABELS+=("--label" "org.opencontainers.image.version={{ default_tag }}.$(date +%Y%m%d)-${GIT_SHA}")
    fi
    LABELS+=("--label" "io.artifacthub.package.keywords={{ image_keywords }}")
    LABELS+=("--label" "io.artifacthub.package.license=Apache-2.0")
    LABELS+=("--label" "org.opencontainers.image.created=$(date -u +%Y\-%m\-%d\T%H\:%M\:%S\Z)")
    LABELS+=("--label" "org.opencontainers.image.description={{ image_desc }}")
    LABELS+=("--label" "org.opencontainers.image.title={{ image_name }}")
    LABELS+=("--label" "org.opencontainers.image.vendor={{ repo_organization }}")

    podman build --build-arg "VARIANT=${variant}" "${LABELS[@]}" \
        --pull=newer --tag "${target_image}:${tag}" --file Containerfile .

# Split the image for smaller updates (same as immutable-sbc)
[group('Build')]
rechunk $target_image=image_name $tag=default_tag:
    #!/usr/bin/env bash
    set -xeuo pipefail
    CHUNKAH_IMAGE="quay.io/coreos/chunkah:latest"
    CHUNKAH_CONFIG_FILE="$(mktemp)"
    CHUNKAH_OUTPUT_DIR="$(mktemp -d ./"${target_image}"_chunkah_XXXXXX)"
    trap 'rm -f "${CHUNKAH_CONFIG_FILE}"; rm -rf "${CHUNKAH_OUTPUT_DIR}"' EXIT
    podman inspect "${target_image}:${tag}" > "${CHUNKAH_CONFIG_FILE}"
    podman run --rm \
      --mount=type=image,src="${target_image}:${tag}",target=/chunkah \
      -v "${CHUNKAH_CONFIG_FILE}:/chunkah-config.json:ro,Z" \
      -v "${CHUNKAH_OUTPUT_DIR}:/run/out:Z" \
      "${CHUNKAH_IMAGE}" \
      build --verbose --compressed --max-layers 128 \
      --prune /sysroot/ \
      --label ostree.commit- --label ostree.final-diffid- \
      --config /chunkah-config.json \
      --output oci:/run/out/chunked
    CHUNKED_IMAGE="$(podman pull "oci:${CHUNKAH_OUTPUT_DIR}/chunked")"
    podman tag "${CHUNKED_IMAGE}" "${target_image}:${tag}"

# Generate Default Tag
[group('Utility')]
generate-default-tag $tag=default_tag:
    #!/usr/bin/env bash
    set -eoux pipefail
    echo "${tag}"

# Generate Tags
[group('Utility')]
generate-build-tags $target_image=image_name $tag=default_tag:
    #!/usr/bin/env bash
    set -eoux pipefail
    DATE=$(date +%Y%m%d)
    BUILD_TAGS=()
    if [[ -z "$(git status -s)" ]]; then
        GIT_SHA=$(git rev-parse --short HEAD)
        BUILD_TAGS+=("${tag}-${GIT_SHA}" "${tag}-${DATE}-${GIT_SHA}" "${DATE}-${GIT_SHA}")
    fi
    BUILD_TAGS+=("${DATE}" "${tag}" "${tag}-${DATE}")
    echo "${BUILD_TAGS[@]}"

# Tag Images
[group('Utility')]
tag-images $target_image=image_name $tag=default_tag tags="":
    #!/usr/bin/env bash
    set -eoux pipefail
    IMAGE=$(podman inspect ${target_image}:${tag} | jq -r .[].Id)
    podman untag ${IMAGE}
    for tag in {{ tags }}; do
        podman tag $IMAGE "${target_image}:${tag}"
    done
    podman images

# Raw disk image of a built image + the installer payload in dist/payload/ (rootful: image-builder)
[group('Media')]
build-raw $variant="x86" $target_image=("localhost/" + image_name + "-" + variant) $tag=default_tag:
    #!/usr/bin/env bash
    set -euox pipefail
    if [[ -z "$(sudo podman images -q "${target_image}:${tag}")" ]]; then
        podman save "${target_image}:${tag}" | sudo podman load
    fi
    rm -rf output
    mkdir -p output dist
    sudo podman run --rm --privileged --pull=newer \
      --security-opt label=type:unconfined_t \
      -v ./output:/output \
      -v /var/lib/containers/storage:/var/lib/containers/storage \
      ghcr.io/osbuild/image-builder-cli:latest \
      build --bootc-ref "${target_image}:${tag}" --bootc-default-fs btrfs raw
    sudo chown -R "$(id -u):$(id -g)" output
    RAW=$(find output -iname '*.raw*' -print -quit)
    case "${RAW}" in
        *.xz) xz -d "${RAW}"; RAW=${RAW%.xz} ;;
        *.zst) zstd -d --rm "${RAW}"; RAW=${RAW%.zst} ;;
    esac
    sudo ./scripts/shrink-raw.sh "${RAW}"
    rm -rf output/efi && ./scripts/extract-efi.sh "${target_image}:${tag}" output/efi
    ./scripts/ensure-efi-ia32.sh "${RAW}" output/efi
    mv "${RAW}" dist/disk.raw
    ./scripts/make-payload.sh dist/disk.raw dist/payload "${target_image}:${tag}" "local-$(date +%Y%m%d)"

# Installer ISO from a built image (run build-raw first: the ISO carries dist/payload/)
[group('Media')]
build-iso $variant="x86" $target_image=("localhost/" + image_name + "-" + variant) $tag=default_tag:
    #!/usr/bin/env bash
    set -euox pipefail
    test -s dist/payload/disk.raw.zst || { echo "no payload: run 'just build-raw' first" >&2; exit 1; }
    INSTALLER="localhost/{{ image_name }}-installer:latest"
    if [[ -z "$(sudo podman images -q "${target_image}:${tag}")" ]]; then
        podman save "${target_image}:${tag}" | sudo podman load
    fi
    sudo podman build --build-arg "BASE_IMAGE=${target_image}:${tag}" \
        --tag "${INSTALLER}" -f installer/Containerfile .
    rm -rf output && mkdir -p output
    sudo podman run --rm --privileged --pull=newer \
      --security-opt label=type:unconfined_t \
      -v ./output:/output \
      -v /var/lib/containers/storage:/var/lib/containers/storage \
      ghcr.io/osbuild/image-builder-cli:latest \
      build --bootc-ref "${INSTALLER}" bootc-generic-iso
    sudo chown -R "$(id -u):$(id -g)" output
    ISO=$(find output -iname '*.iso' -print -quit)
    # image-builder only puts the x64 shim/GRUB on the ISO; add the ia32 ones.
    sudo podman run --rm -v "${PWD}:/w" -w /w "${INSTALLER}" \
        bash scripts/iso-add-ia32.sh "${ISO}" dist/immutable-kiosk-installer.iso
    sudo chown "$(id -u):$(id -g)" dist/immutable-kiosk-installer.iso
    rm -rf output
    ./scripts/check-iso.sh dist/immutable-kiosk-installer.iso installer/iso.yaml
    ls -la dist

# Boot an ISO or disk image in QEMU with 32-bit UEFI firmware -- how the HP Pro Tablet 408 boots.
# Fedora: dnf install qemu-system-x86 edk2-ovmf-ia32. The 64 GiB target disk is created empty.
[group('Media')]
run-vm-ia32 file="dist/immutable-kiosk-installer.iso" ovmf="/usr/share/edk2/ovmf-ia32/OVMF_CODE.fd":
    #!/usr/bin/env bash
    set -euox pipefail
    mkdir -p output
    [[ -f output/emmc.qcow2 ]] || qemu-img create -f qcow2 output/emmc.qcow2 64G
    cp -n "$(dirname "{{ ovmf }}")/OVMF_VARS.fd" output/OVMF_VARS_IA32.fd
    case "{{ file }}" in
        *.iso) MEDIA=(-drive "file={{ file }},format=raw,if=none,id=usb,readonly=on" -device usb-storage,drive=usb,bootindex=0) ;;
        *) MEDIA=() ; cp --reflink=auto "{{ file }}" output/emmc.raw && qemu-img convert -O qcow2 output/emmc.raw output/emmc.qcow2 ;;
    esac
    qemu-system-x86_64 -machine q35,accel=kvm -cpu host -m 2048 -smp 4 \
      -drive if=pflash,format=raw,readonly=on,file="{{ ovmf }}" \
      -drive if=pflash,format=raw,file=output/OVMF_VARS_IA32.fd \
      -device qemu-xhci -device usb-tablet \
      -drive file=output/emmc.qcow2,if=none,id=emmc -device virtio-blk-pci,drive=emmc,bootindex=1 \
      "${MEDIA[@]}" \
      -device virtio-vga-gl -display gtk,gl=on \
      -nic user,model=virtio-net-pci

# Runs shellcheck on all Bash scripts
lint:
    #!/usr/bin/env bash
    set -eoux pipefail
    find . -iname "*.sh" -type f -not -path './.git/*' -exec shellcheck "{}" ';'
