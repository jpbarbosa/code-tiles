#!/bin/zsh
# The video, unattended: rebuilds the projects Claude edits, waits for an unlocked screen, launches
# the demo instance on the invisible display (or keeps the one running), films the three takes and
# renders them into one. Needs the virtual display and a signed-in usage meter (README.md).
# usage: pipeline.sh <display-id> [--draft]   film and render; --draft renders at 1080p
#        pipeline.sh --render [--draft]         render the last takes again
T=${0:A:h}
W=${T:h:h}/.claude/work/demo-video
B=$W/bin
DRAFT=${@[(r)--draft]}
log() { print -r -- "[$(date +%H:%M:%S)] $*" }
fail() { log "FAILED: $*"; exit 1 }
shell_page() { curl -s http://127.0.0.1:9334/json/list | grep -q shell/index.html }
render() {
  local timeline=$W/timeline-${DRAFT:+draft-}$1${2:+-part}.json
  node $T/build.mjs $1 $2 $DRAFT > $W/build-$1.log || fail "$1 timeline (build-$1.log)"
  grep '^warning' $W/build-$1.log
  $B/compose $timeline | tail -1
  node $T/mux.mjs $timeline || fail "$1 soundtrack"
}

mkdir -p $B
[[ -x $B/ctdemo && $B/ctdemo -nt $T/ctdemo.swift ]] \
  || swiftc -O -swift-version 5 -import-objc-header $T/VirtualDisplay.h $T/ctdemo.swift -o $B/ctdemo || fail "ctdemo did not compile"
[[ -x $B/compose && $B/compose -nt $T/compose.swift ]] \
  || swiftc -O -swift-version 5 $T/compose.swift -o $B/compose || fail "compose did not compile"

if [[ $1 != --render ]]; then
  ID=$1
  [[ $ID == <-> ]] || fail "usage: pipeline.sh <display-id> [--draft], or pipeline.sh --render [--draft]"
  until [[ $($B/ctdemo locked) == 0 ]]; do sleep 5; done
  # The displays wake a moment after the lock screen goes.
  for i in {1..30}; do $B/ctdemo displays | grep -q "\"id\":$ID," && break; sleep 1; done
  $B/ctdemo displays | grep -q "\"id\":$ID," || fail "virtual display $ID is not active"
  $B/ctdemo place $ID -3272 1147 > /dev/null || fail "could not put display $ID back in its corner"
  python3 $T/make-projects.py orbit fern tidepool > $W/make-projects.log || fail "projects (make-projects.log)"
  if ! shell_page; then
    zsh $T/launch.sh $ID > $W/demo.log 2>&1 &
    for i in {1..90}; do shell_page && break; sleep 1; done
    shell_page || fail "demo instance did not come up (demo.log)"
    sleep 6
  fi
  log "demo instance up"
  node --input-type=module -e "
    import { Page } from '$T/cdp.mjs';
    const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
    process.exit(await shell.eval(\"document.getElementById('usage').dataset.connected === 'true'\") ? 0 : 1);
  " || fail "the usage meter is not signed in: Connect Claude in the strip, then open data/external-url.txt"
  for name in basics claude claude-more; do
    [[ $name == claude ]] && { node $T/prep-claude.mjs > $W/prep-claude.log 2>&1 || fail "prep for the Claude take (prep-claude.log)" }
    node $T/take-$name.mjs > $W/take-$name.log 2>&1 || fail "$name take (take-$name.log)"
    log "filmed $name"
  done
fi

render basics --part
render claude --part
render claude-more
OUT=$W/out/${DRAFT:+draft-}
node $T/join.mjs ${OUT}code-tiles.mp4 ${OUT}part-basics.mp4 ${OUT}part-claude.mp4 ${OUT}code-tiles-claude-more.mp4 || fail "join"
log "rendered ${OUT}code-tiles.mp4"
