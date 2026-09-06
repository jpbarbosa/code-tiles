#!/bin/bash
# Rebuilds assets/icon.icns from assets/icon.icon.
#
# Blender renders the layers, ictool composites macOS 26's glass over them, and iconutil packs the
# result. Every step is headless, so none of it touches an open Blender or Icon Composer.
set -euo pipefail

cd "$(dirname "$0")/.."

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ICTOOL="${ICTOOL:-/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool}"
RENDITION="${RENDITION:-Default}"

for tool in "$BLENDER" "$ICTOOL"; do
  [ -x "$tool" ] || { echo "not found: $tool" >&2; exit 1; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "==> Blender: rendering layers"
"$BLENDER" --background --factory-startup --python scripts/build-icon.py -- assets/icon.icon/Assets \
  | grep -E '^wrote' || { echo "Blender rendered nothing" >&2; exit 1; }

# 824 is the content box of a 1024 icon; iconset.swift derives every smaller size from it.
echo "==> ictool: compositing the $RENDITION rendition"
"$ICTOOL" assets/icon.icon --export-image --output-file "$work/composed.png" \
  --platform macOS --rendition "$RENDITION" --width 824 --height 824 --scale 1

echo "==> iconutil: packing assets/icon.icns"
swift scripts/iconset.swift "$work/composed.png" "$work/icon.iconset"
iconutil -c icns "$work/icon.iconset" -o assets/icon.icns

cp "$work/icon.iconset/icon_512x512@2x.png" assets/icon.png

# The app's own tile reads favicon.png the way it reads any project's, so it goes through the same
# 128 KB ceiling src/main/icon.js drops an icon at - silently, which is why this checks rather than
# trusts.
cp "$work/icon.iconset/icon_256x256.png" favicon.png
limit=$((128 * 1024))
size=$(stat -f%z favicon.png)
[ "$size" -le "$limit" ] || { echo "favicon.png is $size bytes, over the $limit the app reads" >&2; exit 1; }

echo "==> done: assets/icon.icns ($(du -h assets/icon.icns | cut -f1)), favicon.png ($size bytes)"
