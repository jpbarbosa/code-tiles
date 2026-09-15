#!/bin/zsh
# The demo instance on the invisible display, clear of this tile's inherited variables and of the
# real $HOME, so the Claude hooks it owns land in the demo home. usage: launch.sh <display-id>
T=${0:A:h}
REPO=${T:h:h}
W=$REPO/.claude/work/demo-video
ELECTRON=$REPO/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
NODE_DIR=${$(command -v node):h}
# The claude CLI, so a tile's terminal can run it: the same hooks light the same ring.
CLAUDE_DIR=${$(command -v claude):h}
exec env -i HOME=/Users/Shared/alex USER="$USER" LOGNAME="$USER" SHELL=/bin/zsh TMPDIR="$TMPDIR" LANG=en_US.UTF-8 \
  PATH="$NODE_DIR:$CLAUDE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  DEMO_DISPLAY="$1" \
  "$ELECTRON" --inspect=127.0.0.1:9335 "$T/demo-main.mjs" --user-data-dir="$W/data" --remote-debugging-port=9334
