#!/usr/bin/env bash
set -euo pipefail

BINARY="proc-trace-logger"
IMAGE="golang:1.22-alpine"
VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"

platforms=(
  "linux/amd64"
  "linux/arm64"
)

mkdir -p dist

# Named volume caches Go modules between platform builds.
MODCACHE="proc-trace-logger-modcache"
docker volume create "${MODCACHE}" >/dev/null 2>&1 || true

echo "┌──────────────────────────────────────────┐"
echo "│  proc-trace-logger — Docker build        │"
echo "└──────────────────────────────────────────┘"
echo ""
echo "  binary  : ${BINARY}"
echo "  version : ${VERSION}"
echo "  image   : ${IMAGE}"
echo ""

# Step 1: tidy — resolves all transitive deps and writes go.sum (needs read-write source).
printf "  resolving dependencies (go mod tidy) ...\n"
docker run --rm \
  -v "$(pwd):/src" \
  -v "${MODCACHE}:/go/pkg/mod" \
  -w /src \
  -e CGO_ENABLED=0 \
  "${IMAGE}" \
  go mod tidy
echo "  done"
echo ""

# Step 2: build for each platform (source read-only — go.sum is already complete).
for platform in "${platforms[@]}"; do
  os="${platform%%/*}"
  arch="${platform##*/}"
  out="${BINARY}-${os}-${arch}"
  printf "  building %-36s" "dist/${out} ..."
  docker run --rm \
    -v "$(pwd):/src:ro" \
    -v "$(pwd)/dist:/out" \
    -v "${MODCACHE}:/go/pkg/mod:ro" \
    -w /src \
    -e CGO_ENABLED=0 \
    -e GOOS="${os}" \
    -e GOARCH="${arch}" \
    "${IMAGE}" \
    go build \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o "/out/${out}" .
  size=$(du -sh "dist/${out}" 2>/dev/null | cut -f1)
  echo " [${size}]"
done

echo ""
echo "Done. Binaries in ./dist/:"
ls -lh dist/ | grep "${BINARY}"
