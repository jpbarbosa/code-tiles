#!/usr/bin/env bash
# Fetch the pinned code-server standalone build into vendor/.
#
# The standalone tarball ships its own node, so the app depends on no system node at all. The
# version is pinned on purpose: a bump is a decision, taken with docs/ROADMAP.md's checklist
# open, not something that happens during an install.

set -euo pipefail

VERSION="${CODE_SERVER_VERSION:-4.135.0}"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TARGET_ARCH="arm64" ;;
  x86_64) TARGET_ARCH="amd64" ;;
  *) echo "unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
TARBALL="code-server-$VERSION-macos-$TARGET_ARCH.tar.gz"
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
mv "$VENDOR/code-server-$VERSION-macos-$TARGET_ARCH" "$VENDOR/code-server"
rm "$VENDOR/$TARBALL"
"$VENDOR/code-server/bin/code-server" --version
