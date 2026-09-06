#!/bin/sh
# Run patch-vscode-claude.js under launchd, which is the only reason this wrapper exists: launchd
# hands a job PATH=/usr/bin:/bin:/usr/sbin:/sbin, and node here is fnm-managed behind a shim that
# resolves in an interactive shell and nowhere else. So find a real interpreter the way a login
# shell would have, and say so on stderr rather than exiting silently when there is none.
set -e

here=$(cd "$(dirname "$0")" && pwd)

node=$(command -v node || true)
[ -n "$node" ] || node=$(ls -d "$HOME"/.local/share/fnm/node-versions/v*/installation/bin/node 2>/dev/null | sort -V | tail -1)
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$node" ] && break
  [ -x "$candidate" ] && node=$candidate
done

if [ -z "$node" ]; then
  echo "[patch-vscode] no node on PATH, in fnm or in homebrew - the desktop patch did not run" >&2
  exit 1
fi

echo "[patch-vscode] $(date '+%Y-%m-%dT%H:%M:%S%z') $node"
exec "$node" "$here/patch-vscode-claude.js" "$@"
