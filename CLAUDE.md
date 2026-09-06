# CLAUDE.md

## What this is

A macOS Electron app that shows several VS Code projects as live tiles in one window. Every
tile is a window of ONE shared code-server, so all tiles share an origin, a partition and
therefore a login. `README.md` is the product; `docs/ARCHITECTURE.md` is the shape of the code;
`docs/CONSTRAINTS.md` is the list of things that will bite you; `docs/ROADMAP.md` is what is
actually built; `docs/PARITY.md` is that same question asked against `~/Sites/code-tiles-legacy`, the
app this one replaces.

## Commands

```bash
npm start                     # run from source
npm test                      # the pure parts (geometry, so far)
npm run fetch-code-server     # vendor the pinned server
npm run install-app           # package, sign and replace /Applications/Code Tiles.app
CODE_TILES_CODE_SERVER=/path/to/code-server npm start   # run against a server you already have
```

## The boundary, which is the point

Three layers: `src/main/` (server, window, geometry, project list), `src/shell/` (the window's
own page: strip, gutters, glow), `src/guest/` (everything inside an editor window).

- Nothing outside `src/guest/` may touch the inside of an editor window. Deleting that folder
  must leave a working app running stock windows.
- The shell may draw in the gutters and the strip, never over a tile. A `WebContentsView` paints
  above the page, so anything that has to appear inside a window is a seam.
- Main hands a window meaning (which project, what hue, what Claude is doing), never
  measurements, and never asks a window for any.

Adding a change inside a window: one file in `src/guest/seams/`, one line in
`src/guest/manifest.cjs`, and a row in `docs/ROADMAP.md` if it is worth knowing about. Prefer a
`settings` entry over CSS, and CSS over an `init`. A `patch` - the server's own bundle, rewritten
before it starts - is the last door, for a thing the editor has and exposes no way into.

## Module systems

`src/main/` and `src/shell/*.js` are ES modules. `src/guest/` is CommonJS, because the runtime
is an Electron preload and requires its seams off disk. `src/guest/manifest-settings.js` is the
two-line bridge that lets main read the same manifest.

## Verifying a change

Run it, then read the change back out of a live window. `CT_PROBE=1 npm start` loads
`scripts/dev-probe.js`, which brings the app up, reads every seam's effect out of each guest,
writes a screenshot and quits. A new seam adds a line to what that reads. Never verify a seam
from a screenshot alone.

The app is normally already running with live sessions in its tiles; terminals live in the
server, not in the window, so reloading the shell (⇧⌘R) is free and restarting the app is not.
`⌥⌘I` opens devtools on the focused project's window and `⇧⌃⌘I` on the shell, both in a window of
their own: a docked pane is part of the page, and the tiles paint over it.

## House rules that this tree is built on

Read `docs/CONSTRAINTS.md` before adding anything. The short version: take the editor's own
switch before writing CSS, one place per seam, no measurement across the boundary, no
`!important` without a named cause, no settle loops, derive rather than store, and a workaround
dies with its cause.
