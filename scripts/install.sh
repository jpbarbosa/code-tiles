#!/usr/bin/env bash
# Package, sign and install Code Tiles into /Applications.
#
# Signing with a real identity is not cosmetic: an ad-hoc signature makes codesign pin the
# designated requirement to the bundle's cdhash, which every rebuild changes, so macOS sees each
# build as a new app and re-asks for every TCC permission. Pinning the requirement to the team OU
# instead of the certificate's common name survives both rebuilds and a certificate renewal.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO_ROOT/dist/Code Tiles-darwin-arm64/Code Tiles.app"
DEST="/Applications/Code Tiles.app"
BUNDLE_ID="io.jp7.codetiles"
TEAM_ID="${CODE_TILES_TEAM_ID:-W2S39EUVG8}"
SIGN_IDENTITY="${CODE_TILES_SIGN_IDENTITY:-Apple Development: Joao Pedro Barbosa (QAQ53D6VB7)}"

running="$DEST/Contents/MacOS/Code Tiles"
if pgrep -f "$running" >/dev/null 2>&1; then
  echo "${running##*/} is running; quit it first (ditto over a live bundle corrupts it)." >&2
  exit 1
fi

echo "==> packaging"
(cd "$REPO_ROOT" && npm run package)

# electron-packager rewrites vendor/code-server's relative node_modules/.bin links to absolute
# paths in the source tree, so an installed app would read from ~/Sites and fail to sign.
echo "==> dereferencing links that escape the bundle"
escaped=0
while IFS= read -r link; do
  target="$(readlink "$link")"
  case "$target" in /*) ;; *) continue ;; esac
  case "$target" in "$APP"/*) continue ;; esac
  if [ ! -e "$target" ]; then
    echo "broken link: $link -> $target" >&2
    exit 1
  fi
  rm "$link"
  cp -R "$target" "$link"
  escaped=$((escaped + 1))
done < <(find "$APP" -type l)
echo "    dereferenced $escaped"

# --deep leaves the Electron framework's own seal stale ("nested code is modified or invalid"),
# so nested code is signed explicitly, innermost first.
echo "==> signing as $SIGN_IDENTITY"
frameworks="$APP/Contents/Frameworks"
sign() { codesign --force --sign "$SIGN_IDENTITY" "$@"; }

sign "$frameworks/Electron Framework.framework/Versions/A/Libraries/"*.dylib
sign "$frameworks/Electron Framework.framework/Versions/A/Helpers/"*
for framework in "$frameworks"/*.framework; do sign "$framework/Versions/A"; done
for helper in "$frameworks"/*.app; do sign "$helper"; done
sign -r="designated => identifier \"$BUNDLE_ID\" and anchor apple generic and certificate leaf[subject.OU] = \"$TEAM_ID\"" "$APP"

signed_team="$(codesign -dvvv "$APP" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
if [ "$signed_team" != "$TEAM_ID" ]; then
  echo "signed under team ${signed_team:-none}, expected $TEAM_ID" >&2
  exit 1
fi
codesign --verify --deep --strict "$APP"
echo "    signature valid"

# ditto MERGES into an existing bundle, so a file the last build shipped and this one does not
# stays behind unsealed - two dropped dylibs in the Electron framework are enough to fail the
# whole signature. The destination goes first, and the installed copy is verified, not the source.
echo "==> installing to $DEST"
rm -rf "$DEST"
ditto "$APP" "$DEST"
codesign --verify --deep --strict "$DEST"
codesign -d -r- "$DEST" 2>&1 | tail -1
echo "installed."
