# ux-compare

One tile rendered on two builds, offscreen at one size, and every measurement that differs. A server
bump moves the editor's design as well as its code, and the patch tests see none of that.

Each run opens four files as tabs, the terminal and a Claude panel, then writes `<out>.png` and
`<out>.json`: the box and the styles of each part, tab, header, row and control, and of the Claude
composer. `--nosidebar` takes the same reading with the side bar hidden.

## Before and after a bump

The old side is the running app's own server with the seams as they were:

```sh
git archive <old-rev> src/guest | tar -x -C /tmp/ux-before
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron tools/ux-compare --folder=$PWD \
  --port=<serverPort from server.pid> --guest=/tmp/ux-before/src/guest --out=/tmp/ux/before
```

The new side is a throwaway server from `vendor/`, on an APFS clone of the app's server data and
extensions so both sides start from the same profile, with the seams' settings written into its
`User/settings.json` the way the app writes them (`seamSettings()` in `src/guest/disk/settings.js`).
Start it with the flags `src/main/server.js` uses, an empty `--config`, and `env -i`, then:

```sh
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron tools/ux-compare --folder=$PWD \
  --port=<throwaway port> --guest=$PWD/src/guest --out=/tmp/ux/after
node tools/ux-compare/diff.mjs /tmp/ux/before.json /tmp/ux/after.json
```

A probe against the running server leaves an extension host there until the server restarts.
