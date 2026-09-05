# Parity with the previous tree

`~/Sites/code-tiles` is the app this one replaces: 111 commits, ~9,100 lines across a
renderer, a `src/vscode/` boundary and one 799-line main. This tree is ~6,500 lines across
main, shell and guest, with a test suite the old one never had.

This file is the inventory of what carried over, what has not been rebuilt yet, and what was
dropped on purpose. `docs/ROADMAP.md` says what is next in this tree's own terms; this one
says it against the thing it is replacing, which is the only place some of these features are
written down.

**Where it stands: the product is there, the last mile is not.** Every mechanism the old app
proved is rebuilt and several are better founded, and every patch of someone else's bundle the
old tree carried is now carried here. What is left is not a mechanism: half a dozen stylesheets
over the editor's own DOM, one mark inside a window, and a signed `.app`.

Legend: **yes** the same feature, however differently built. **partial** the feature exists
with something named missing from it. **no** not in this tree. **by design** deliberately not
rebuilt, with the reason in the last section.

## The window and the strip

| | old | new | |
|---|---|---|---|
| One flat ground, read from the running theme | yes | yes | `--bg` read from a guest, then the `ground` seam reporting it |
| 36px strip, traffic lights on the same line | yes | yes | |
| Grid, `cols = ceil(sqrt(n))`, last tile spans the empty cells | yes | yes | pure and tested here (`src/main/layout.js`, `test/layout.test.js`) |
| View control: grid or one project | yes | yes | `⌃⌘G` / `⌃⌘E` are new |
| Maximize: one wide column, the rest live beside it | yes | yes | now an item in the editor's own activity bar list, not a host button over a slot cut in CSS |
| Maximizing also makes that project active | yes | **by design** | the column is chosen and stays chosen; focus moves on its own |
| Gutter drag to resize, double-click to even | yes | yes | shares in both, persisted in both. New here: the key is the grid SHAPE rather than the track count, so the 2x2 you dragged with four projects is the one three of them fall back to; the geometry is a pure function with tests; and `⌃⌘0` evens both axes at once |
| Zoom every tile together, `⌘+` / `⌘-` / `⌘0` | no | yes | the old `⌘+` landed on the focused guest alone, which is what `--gpx` and the dpr ratio existed to chase |
| Focus glow in the gutter, tinted ground inside the tile | yes | yes | |
| A close affordance on a tile in the grid | yes | yes | the app's own `×` in the window's top right corner, on a plate of the project's hue, drawn by a seam and given room by the editor's title row - the old one was a host button floated over a slot the guest cut for it, sized from a height measured in the window |
| Empty state | yes | yes | |

## Projects: opening, closing, ordering

| | old | new | |
|---|---|---|---|
| Project list persisted, reopened on launch | yes | yes | |
| A folder that has been deleted drops off the list | yes | yes | |
| The picker: every folder ever opened, icon and path, open ones marked | yes | yes | a window over the stage here, since the shell page draws under the tiles. In the app's one project order rather than newest-first: recency is not derivable from a folder, and this tree stores nothing it can derive |
| **Open folder...** as the last row of that list | yes | yes | `⌃⌘O` from anywhere, and the same dialog when the list is empty |
| `×` on a row to forget a folder | yes | yes | shown on hover and on keyboard focus, which the old one was not |
| Closing keeps the entry so reopening is a click | yes | yes | the entry outlives the tile in both |
| One project order behind strip, grid, numbers and storage | yes | yes | |
| Chip drag along the strip, inserting | yes | yes | same shape: a clone under the hand and the hole it left as the placeholder. The clone rides IN the strip rather than hanging below it, because below the strip is the stage and every pixel of that is a view painted above this page |
| Badge drag onto another tile, swapping | yes | yes | the badge stays a pseudo-element: the listener is on the menu button it is drawn on, delegated off the workbench. The gesture is reported; the CURSOR is followed by main, off the OS, so no position crosses the boundary and the guests are never muted to let a press through |
| A click on the badge still opens the menu | replayed by the host with `sendInputEvent` | yes | replayed inside the document instead: `preventDefault` on the pointerdown suppresses the mousedown the menubar opens on, and a release that never moved dispatches that pair back |
| `Esc` abandons a drag | yes | yes | the open order the press began with, put back - in either view |
| A project's window boots lazily | yes | **no** | a view is created for every open project at startup, visible or not, and all at once rather than staggered |

## Focus and identity

| | old | new | |
|---|---|---|---|
| A hue per project, sampled from its favicon, hashed from the path otherwise | yes | yes | derived and never stored in both |
| Favicon on the chip | yes | yes | the same mark the badge wears inside the window, drawn from one function both the strip and the picker call, with the Claude ring around it - and the project's initial on its own hue where there is no favicon, or where the one there is turns out not to decode |
| A monogram where a project has no favicon | yes | **partial** | the picker draws one; the badge inside the window still keeps the editor's hamburger, which is roadmap item 1 |
| Dragging the badge rearranges the grid | yes | yes | and in single view the press belongs to the menu underneath, as it did there |
| Identity badge at the top of the activity bar | yes | yes | drawn by the guest as a pseudo-element, so nothing is overlaid and nothing is measured |
| Project name on the side bar's title row | yes | yes | |
| Narrow side bar holds its title actions back until hover | yes | **no** | in a tile's Search view the name can still be ellipsised |
| The hue on every active tab | yes | yes | |
| Branch and sync pills under the file tree | yes | yes | both mirror `status.scm.*`; this tree patches `Part.create` where the old one patched `PartLayout.layout` |
| Focus by click into a tile, by chip, by keyboard | yes | yes | |

## Inside an editor window

The old tree's inventory is `docs/VSCODE-CUSTOMIZATIONS.md` in that repo. Row for row:

| | old | new | |
|---|---|---|---|
| Title bar gone | clipped, measured `--tbh` | **setting** | `window.commandCenter` + `workbench.layoutControl.enabled` + compact menu bar, so the workbench reflows itself |
| Status bar gone | clipped, measured `--sbh` | **setting** | `workbench.statusBar.visible` |
| The tile's frame is the app's, not the editor's | yes | yes | `frame`, stylesheet and patch reading one `FRAME_SHARE` |
| Quick Open re-anchored below the clipped edge | yes | **n/a** | nothing is clipped here, so there is nothing to re-anchor |
| Rail and side bar drawn as one card | hand-built from their own edges | **setting** | `workbench.experimental.modernUI` |
| Project tint on the parts' backgrounds | yes | yes | |
| Tint inside the terminal's canvas | `lighten` overlay | yes | same mechanism |
| Tint inside the chat's iframe | yes | yes | same, said again in each frame's own document |
| Tint on the dimmed icons and labels | yes | **partial** | the activity bar's icons, re-derived over the tinted ground, and only in the focused window - plus the side bar's title row, which wears the same ink everywhere. Unselected tab labels, in the editor's row and the terminal strip alike, are left the theme's |
| Tint on the 1px edges of the parts | yes | **no** | |
| Your own turns in the chat painted apart from Claude's | yes | **no** | |
| Status bar painted the project's colour | yes | **n/a** | there is no status bar |
| Terminals as tabs across the panel header | yes | yes | same `<select>` mirror, same select-then-wait close |
| Maximize Panel taken off that header | yes | **no** | it hides the editor part rather than growing the panel, and undoes itself under a Claude chat |
| Run and Debug, Testing and Claude's sessions list off the rail | yes | **no** | |
| The editor toolbar's Run button off | yes | **no** | |
| Welcome page renamed and Coder's ad removed | injected | **flags** | `--app-name`, `--disable-getting-started-override` |
| Welcome page's walkthrough column emptied | CSS | patch | |
| An "Open Claude Code" entry under Start | yes | **no** | |
| Claude opens in the main editor group, never a locked split | extension patch | yes | the same one edit, the fallback column: an explicit column and an existing Claude group are both still honoured, and the flag the caller locks on is left the `!1` its own declaration gave it |
| The chat tab's icon carries Claude's state | extension patch | yes | rebuilt, matched by shape, requires exactly one hit - anchored on the assignment rather than on the pick above it, which is what survives the editor refactoring that pick |
| Extension secrets merged across windows | bundle patch | yes | the write re-reads inside a per-window queue instead of trusting the snapshot it loaded with, and a `storage` listener keeps the read fresh too - which the old tree also carried |
| Side bar / panel / secondary side bar flipped in every window at once | yes | yes | same keybinding dispatch, driven from the strip |
| Restricted mode off | seeded setting | setting | without it there is no Claude Code in a tile at all |
| Dark decided rather than inherited | seeded `colorThemeData` in browser storage | seam + two patches | the web build's default theme is the light one |
| The workbench bundle's HTTP cache dropped when a patch lands | yes | yes | it is served immutable for a year on a URL keyed by the commit |

## The Claude signal

| | old | new | |
|---|---|---|---|
| Hooks reconciled into `~/.claude/settings.json`, other hooks preserved, one backup | yes | yes | |
| Four states, coded as motion on one hue | yes | yes | |
| The ring on the badge inside the window | yes | yes | |
| The same three states on the chat tab's icon | yes | yes | |
| The state on the chip in the strip | yes | yes | |
| A session belongs to the folder it started in, and to the deepest open project | yes | yes | |
| `attention` survives being looked at; `finished` clears on focus | yes | yes | |
| An ESC read out of the transcript, since no hook fires for it | yes | yes | |
| Per-state TTL on the markers | yes | yes | |
| Expired markers swept | at start and every 5 min | **at start only** | a marker that expires mid-session is ignored but not deleted |
| A dock badge counting the projects waiting on you | yes | yes | the two states that are about YOU - a question nobody answered, a turn you have not seen - over the open projects, written only when the number changes |

## Usage

| | old | new | |
|---|---|---|---|
| 5-hour and 7-day bars in the strip, green to red | yes | yes | |
| A panel with exact percentages, reset times, per-model buckets | yes | yes | its own window here, since a panel drawn in the shell page would sit behind the tiles |
| PKCE sign-in in the browser, code pasted back | yes | yes | |
| The grant encrypted with `safeStorage`, never the CLI's keychain item | yes | yes | |
| One poll for the account, 5 minute floor, 429 back-off | yes | yes | |
| Disconnect | yes | yes | |
| No estimate from local transcripts | yes | yes | the same deliberate refusal |

## Settings, profiles, extensions

| | old | new | |
|---|---|---|---|
| One server, one origin, one partition, one login | yes | yes | |
| The port persisted so the origin, and the login, survive a restart | yes | yes | |
| Your desktop settings, keybindings and snippets reused | **symlinked**, two-way, with a self-healing watcher | **copied**, one-way, per profile | see the last section |
| Desktop profiles mirrored, each with its own extension subset | yes | yes | |
| Which profile a folder opens under | seeded associations | **named in the URL** | `?folder=...&payload=[["profile","..."]]`, so the app says it on every load |
| The profile registry seeded into browser storage | yes | yes | before the first tile in both |
| One shared extensions directory, installed from Open VSX, pruned | yes | yes | |
| Per-surface tint strength, six dials, `⌘,` | yes | **by design** | |

## Server, process, lifecycle

| | old | new | |
|---|---|---|---|
| One code-server, `--auth none` on loopback | yes | yes | |
| Its own process group, whole tree killed on quit | yes | yes | |
| Orphan reaped from a pidfile whose command line is checked first | yes | yes | |
| A hardened PATH for the spawned server (Homebrew, fnm, login-shell PATH) | yes | **no** | the vendored server ships its own node, so it starts either way; what an integrated terminal and an extension inherit from a Finder launch is unverified |
| `backgroundThrottling: false` on the guests | yes | **no** | whether a hidden tile's terminal keeps rendering in single view is unverified |
| Single-instance lock | yes | yes | |
| A second launch focuses the running window | yes | **no** | it quits silently instead |
| `activate` re-creates the window | yes | **n/a** | the app is the window and quits with it |
| A `<webview>` per project | yes | **by design** | `WebContentsView`, which is what removed the drag and dpr problems |

## Links out of a tile

| | old | new | |
|---|---|---|---|
| An external link goes to the default browser | yes | yes | |
| A popup that keeps its opener stays in this session | yes | yes | `noopener` is the discriminator in both, and the child inherits the view's session but not its preload, so the grant lands on the server's origin in this partition and no seam runs on a sign-in page |
| `will-navigate` holds the top frame to its origin | yes | yes | main frame only in both, so the editor's webviews still navigate themselves. A target with no readable origin - `about:blank`, a `data:` page - is another place here rather than an abstention |
| Schemes other than http, https and mailto refused | yes | yes | and a bare `mailto:` is handed to your mail client rather than given a window of its own, which the old policy would have tried on a popup that kept its opener |

## Build and tooling

| | old | new | |
|---|---|---|---|
| A test suite | none | **84 tests** | geometry, seams, settings, keybindings, both patch kinds, activity, icon, usage |
| Read a change back out of a live window | by hand | `CT_PROBE=1 npm start` | `scripts/dev-probe.js` reads every seam's effect out of each guest |
| The pinned code-server fetched into `vendor/` | yes | yes | |
| A packaged, signed `Code Tiles.app` | yes | **no** | roadmap item 4. The signing rules the old tree paid for (a real identity so TCC grants survive, no `--deep`, packager rewriting the vendor symlinks) are in that repo's README |
| An app icon | rendered in Blender, `.icns` and dock icon | **no** | |
| The same Claude patches applied to desktop VS Code by a LaunchAgent | yes | **no** | `scripts/patch-vscode-claude.js` and its plist live in the old tree |
| A data-directory migration script | yes | **n/a** | this tree has its own data directory and no history to move |

## What is missing, in the order it will be missed

1. **The badge's monogram.** A project with no favicon keeps the editor's hamburger inside its
   window; the picker and the strip already draw that project's initial, so what is missing is
   one mark in one place.
2. **The chat title**, which is the one thing the old chips carried that no tile does.
3. **A project's window booting lazily.** A view is created for every open project at startup,
   visible or not, so every one of them loads a workbench against the one server at once.
4. **Packaging.** Until then this runs from source, which also means it holds no TCC grants.

## What this tree has that the old one never did

- **Gutter resizing keyed by the grid's SHAPE**, not by its track count, so a 2x2 dragged with four projects is the 2x2 three of them fall back to - and `⌃⌘0`, which evens both axes at once. The old tree had the gesture, in shares and persisted; what it had no key for was the shape.
- **Zoom as one app.** Every tile moves together and a project opened later comes up at the
  same size, because Chromium keeps zoom per host and every tile is a window of one server.
- **A seam contract.** One file per change, declared in `src/guest/manifest.cjs`, with its
  settings, keybindings, patches, CSS and behaviour in the same place. The old tree spread a
  seam across `renderer.js`, a guest module and a disk script.
- **A preload instead of injection.** The stylesheet is last in `<head>`, so cascade order
  wins where the old tree needed `!important` on every rule, and nothing is re-applied on
  `dom-ready` or keyed for removal.
- **No measurement across the boundary.** Main hands a window meaning and never asks it for a
  number, which deletes the whole dpr-scaling class of bug the old tree lived with.
- **A drag over the tiles that mutes nothing.** The old badge drag had to put every webview on
  `pointer-events: none` for as long as the badge was held, since a webview eats every mouse event
  that lands on it, and the click that was not a drag had to be replayed into the guest from the
  host. Here the guest reports the press and the release and main follows the CURSOR off the OS,
  so the tiles stay live under the hand, the drop is hit-tested against the rects the views were
  placed from, and the menu's press is given back inside the document that swallowed it.
- **Geometry as a pure function**, with tests, rather than CSS grid plus `holdGuests`.
- **Patches matched by shape and required to hit exactly once**, refused rather than
  half-applied, each naming what it degrades to.
- **The maximize item is the editor's own**, built from the classes the activity bar builds
  its items with, so it takes the bar's size, hover and accent for free.
- **84 tests and a probe** that reads every seam's effect out of a live window.

## Dropped on purpose

**The tint preferences.** Six dials, four levels, a second window and a persisted matrix, to
answer a question the tint now answers with two tokens. The dials existed because the old
tint rewrote the theme's own variables and could not know what it would land on; this one
mixes over the theme's colour and keeps its lightness, so there is nothing to calibrate per
project. If one dial comes back it is the wash, not the matrix.

**Symlinked desktop settings.** Two-way sharing meant a watcher whose job was to survive VS
Code replacing a symlink with a plain file on every atomic save, and it meant a setting this
app needs (`terminal.integrated.tabs.enabled: false`) reaching into the editor you use for
everything else. Copying is one way: a window may write whatever it likes into a mirrored
profile and the worst outcome is that the next start overwrites it.

**`<webview>` for the tiles.** A webview eats every mouse event that lands on it, which is why
the old badge drag had to mute the guests on pointerdown, and its CSS pixels differ from the
host's on a display of another scale, which is why every measurement crossing the boundary
carried a dpr ratio. `WebContentsView` removes both, at the cost of never being able to draw
over a tile: anything that has to appear inside a window is a seam.

**Maximize following focus.** In the old tree maximizing made a project active and clicking a
stacked tile promoted it, so "where am I" and "what is wide" were one answer. They are two
questions here, and the activity bar item is the only thing that answers the second.

**A per-project `settings.json`.** One server is one settings file. A per-project difference
is a seam or a profile.
