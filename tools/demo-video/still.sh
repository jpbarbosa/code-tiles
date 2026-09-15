#!/bin/zsh
# A picture of the demo window as the recorder sees it, window chrome included, off the screen
# nobody is looking at. usage: still.sh <out.png> [max-width]
CTDEMO=${0:A:h:h:h}/.claude/work/demo-video/bin/ctdemo
PID=$(pgrep -f 'MacOS/Electron .*demo-main.mjs' | head -1)
[[ -n $PID ]] || { echo "demo instance not running" >&2; exit 1; }
CLIP=${1:r}.mov
$CTDEMO record $PID $CLIP 30 >/dev/null &
RECORDER=$!
sleep 1.2
kill -INT $RECORDER; wait $RECORDER
# The first frame: a window with nothing moving delivers one or two, so the end holds nothing.
ffmpeg -v error -y -i $CLIP -frames:v 1 -update 1 $1 && rm -f $CLIP
[[ -n $2 ]] && sips -Z $2 $1 >/dev/null
echo $1
