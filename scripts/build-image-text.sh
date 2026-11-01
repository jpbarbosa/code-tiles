#!/usr/bin/env bash
# Compiles the helper chat-text reads an image with. macOS only: Vision has no other platform, and
# an app without the helper just has no selectable text.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$REPO_ROOT/vendor"
xcrun swiftc -O "$REPO_ROOT/scripts/read-image-text.swift" -o "$REPO_ROOT/vendor/read-image-text"
