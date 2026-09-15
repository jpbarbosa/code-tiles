#!/bin/zsh
# The whole video from a quit demo instance, unattended: waits for an unlocked screen, puts the
# invisible display back in its corner, launches, films the four chapters and joins them. Needs the
# virtual display running (README.md) and, once per data dir, the usage meter signed in; the
# demo's Claude Code uses your own login through the demo home's Keychains link.
# usage: pipeline.sh [display-id]
T=${0:A:h}
W=${T:h:h}/.claude/work/demo-video
B=$W/bin
ID=${1:-6}
log() { print -r -- "[$(date +%H:%M:%S)] $*" }
fail() { log "FAILED: $*"; exit 1 }
render() {
  local timeline=$W/timeline-$1${2:+-part}.json
  node $T/build.mjs $1 $2 > $W/build-$1.log || fail "$1 timeline"
  $B/compose $timeline | tail -1
  node $T/mux.mjs $timeline || fail "$1 soundtrack"
}

mkdir -p $B
[[ -x $B/ctdemo && $B/ctdemo -nt $T/ctdemo.swift ]] \
  || swiftc -O -swift-version 5 -import-objc-header $T/VirtualDisplay.h $T/ctdemo.swift -o $B/ctdemo || fail "ctdemo did not compile"
[[ -x $B/compose && $B/compose -nt $T/compose.swift ]] \
  || swiftc -O -swift-version 5 $T/compose.swift -o $B/compose || fail "compose did not compile"

until [[ $($B/ctdemo locked) == 0 ]]; do sleep 5; done
log "screen unlocked"
# The displays wake a moment after the lock screen goes.
for i in {1..30}; do $B/ctdemo displays | grep -q "\"id\":$ID," && break; sleep 1; done
$B/ctdemo displays | grep -q "\"id\":$ID," || fail "virtual display $ID is not active"
$B/ctdemo place $ID -3272 1147 || fail "could not put display $ID back in its corner"

zsh $T/launch.sh $ID > $W/demo.log 2>&1 &
for i in {1..90}; do curl -s http://127.0.0.1:9334/json/list | grep -q shell/index.html && break; sleep 1; done
curl -s http://127.0.0.1:9334/json/list | grep -q shell/index.html || fail "demo instance did not come up (demo.log)"
log "demo instance up"
sleep 6

node $T/prep-claude.mjs > $W/prep-claude.log 2>&1 || fail "prep for the Claude chapter (prep-claude.log)"
node $T/take-claude.mjs claude > $W/take-claude.log 2>&1 || fail "Claude take (take-claude.log)"
render claude --part

node $T/prep.mjs > $W/prep.log 2>&1 || fail "prep for the overview (prep.log)"
# VS Code saves a workspace's open editors on its own schedule, and the take closes every tile
# first: reopened too soon, a tile comes back to its welcome page.
sleep 75
node $T/take-overview.mjs overview > $W/take-overview.log 2>&1 || fail "overview take (take-overview.log)"
render overview --part

node $T/take-extras.mjs extras > $W/take-extras.log 2>&1 || fail "grid take (take-extras.log)"
render extras --part

node $T/take-claude-more.mjs claude-more > $W/take-claude-more.log 2>&1 || fail "CLI take (take-claude-more.log)"
render claude-more

node $T/join.mjs $W/out/code-tiles.mp4 $W/out/part-overview.mp4 $W/out/part-extras.mp4 \
  $W/out/part-claude.mp4 $W/out/code-tiles-claude-more.mp4 || fail "join"
log "rendered $W/out/code-tiles.mp4"
