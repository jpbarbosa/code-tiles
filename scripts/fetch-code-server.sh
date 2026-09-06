#!/usr/bin/env bash
# Fetch the pinned code-server standalone build into vendor/.
#
# The standalone tarball ships its own node, so the app depends on no system node at all. The
# version is pinned on purpose: a bump is a decision, taken with docs/ROADMAP.md's checklist
# open, not something that happens during an install.

set -euo pipefail

VERSION="${CODE_SERVER_VERSION:-4.135.0}"

# coder publishes a standalone build for macOS and Linux and none at all for Windows, where a
# code-server is one you installed from npm yourself and the app finds on PATH.
OS="${CODE_SERVER_OS:-$(uname -s)}"
case "$OS" in
  Darwin) TARGET_OS="macos" ;;
  Linux) TARGET_OS="linux" ;;
  *)
    echo "no standalone code-server is published for $OS." >&2
    echo "install one (npm install -g code-server) and the app will find it on PATH," >&2
    echo "or point CODE_TILES_CODE_SERVER at it." >&2
    exit 1
    ;;
esac

ARCH="${CODE_SERVER_ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64) TARGET_ARCH="arm64" ;;
  x86_64|amd64) TARGET_ARCH="amd64" ;;
  *) echo "unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
TARBALL="code-server-$VERSION-$TARGET_OS-$TARGET_ARCH.tar.gz"
URL="https://github.com/coder/code-server/releases/download/v$VERSION/$TARBALL"

if [ -x "$VENDOR/code-server/bin/code-server" ] \
  && "$VENDOR/code-server/bin/code-server" --version 2>/dev/null | grep -q "^$VERSION"; then
  echo "code-server $VERSION already vendored"
  exit 0
fi

mkdir -p "$VENDOR"
echo "fetching $URL"
curl -fL --progress-bar "$URL" -o "$VENDOR/$TARBALL"
rm -rf "$VENDOR/code-server"
tar -xzf "$VENDOR/$TARBALL" -C "$VENDOR"
mv "$VENDOR/code-server-$VERSION-$TARGET_OS-$TARGET_ARCH" "$VENDOR/code-server"
rm "$VENDOR/$TARBALL"
"$VENDOR/code-server/bin/code-server" --version
