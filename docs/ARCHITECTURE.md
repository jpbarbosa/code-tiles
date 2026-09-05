# Architecture

Three layers, one rule each. The rules are what keep a customization from leaking into the
app and the app from growing a second copy of the editor.

```
main            src/main/     Electron main process. Owns the server, the window, the
                              geometry of every tile, and the project list.
shell           src/shell/    The window's own page: strip, gutters, focus glow, picker.
                              Draws around the tiles, never on top of one.
guest           src/guest/    Everything that happens INSIDE an editor window. Reaches the
                              document as a preload, and nothing else does.
```

**The rule for `guest/`:** would a stock code-server do this by itself? If yes it is not a
seam and it does not live here. If no, it is a seam, it has a name, and it is declared in
`src/guest/manifest.js`. Delete `src/guest/` and what remains is a working app running stock
editor windows. That is the test, and it is meant to be run.

**The rule for `shell/`:** it may draw in the gutters and the strip, never over a tile. A
`WebContentsView` paints above the page by construction, so anything that has to appear
inside a window is a seam, not an overlay. This is a constraint the old design fought and
this one accepts, and it is why the identity badge is drawn by the guest.

**The rule for `main/`:** it owns geometry and lifecycle and hands the guest **meaning**, not
measurements. It tells a window which project it is, what hue it wears and what Claude is
doing. It never asks a window how tall its title bar is.

## Processes

```
main process ─┬─ code-server child (one, shared, 127.0.0.1:<port>, --auth none on loopback)
              └─ BrowserWindow
                   ├─ shell page          the window's own webContents (strip, gutters, glow)
                   └─ WebContentsView[]   one per project, positioned by main, all on ONE
                                          session partition, so ONE login for every project
```

One server, so settings, keybindings, extensions and the GitHub session are shared without
syncing anything. One partition, because code-server keeps that session browser-side keyed by
origin: same origin plus same partition is what makes the login shared. The port is persisted
and reused so the origin, and therefore the login, survives a restart.

Each view still gets its own editor window: its own terminals, its own extension host, its
own agent session.

## The seam contract

A seam is one file in `src/guest/seams/` with a name and up to a handful of parts. All are
optional, and most seams have one.

```js
export default {
  name: 'identity',
  defaults: { 'workbench.colorTheme': 'Dark 2026' },    // proposed to the editor; your file wins
  settings: { 'workbench.statusBar.visible': false },   // written to disk before the server starts
  keybindings: [{ key, command: '-some.command' }],     // a chord given back, same moment
  patch: { file, marker, find, replace },               // the server's own bundle, same moment
  extension: { id, file, marker, apply },               // an extension's bundle, same moment
  css: (ctx) => `...`,                                  // one stylesheet, appended last
  init: (ctx, api) => { ... },                          // runs in the guest, after the workbench
};
```

- **`settings`** is the first thing to reach for. If the editor already has a switch for what
  you want, take the switch: it reflows the layout properly and it survives version bumps.
  Seams collect their settings in the manifest and `src/guest/disk/settings.js` merges them
  into the server's `settings.json` once, before it starts.
- **`defaults`** is the same list on the other side of your own file: `defaults`, then your
  settings, then `settings`. A seam repairing a web-only default says it here, and your desktop
  keeps the preference. Anything the app's own shape depends on stays in `settings`.
- **`keybindings`** is for a chord the app's own menu needs and the editor holds. A menu
  accelerator loses to a chord the workbench binds, so the way to take one is to give it back:
  the entries land after your own in every profile's `keybindings.json`, and VS Code resolves the
  last matching rule. Removals (`-command`) reach default bindings only, which is what these are.
- **`patch`** is the last door, and there are two. What a seam needs the server's own BUNDLE to
  do, for the case where the editor has the thing and offers no way in: it is matched by shape,
  applied by `src/guest/disk/patch.js` before the server starts, and refused rather than
  half-applied. A seam that declares one says what it degrades to without it.
- **`extension`** is that door on an EXTENSION's bundle, applied by `src/guest/disk/extension.js`
  in the same moment and on the same terms, plus one: an extension replaces itself, so the
  pristine bundle is kept beside it and every patch is applied to that. A shape that stops
  matching restores the stock file rather than leaving an edit nobody can reason about.
- **`css(ctx)`** returns plain CSS. The runtime concatenates every seam's CSS into ONE
  `<style>` element and keeps that element **last in `<head>`**, so our rules win on cascade
  order rather than on `!important`. `!important` in a seam is a smell and should carry a
  comment saying which rule forced it.
- **`init(ctx, api)`** is for behaviour: reading something out of the workbench, drawing the
  badge, forwarding a click. It runs in the preload's isolated world with DOM access, and it
  is handed `api.onContext`, `api.send` and `api.whenReady`.

`ctx` is the project context:
`{ folder, name, hue, icon, claudeState, focused, tiled, maximized, layout }`. It arrives before
the first paint (through `additionalArguments`) and is updated by IPC. A seam reads it and
re-renders; it never asks main for it. `tiled` is the one fact both of the app's own controls in
a window hang on - whether this is one of several tiles - and `maximized` says nothing while it
is false.

### Why a preload, and not injection from the host

The old design pushed CSS and JS into each window from the renderer on every `dom-ready`,
which made three problems permanent: sheets died with the document and had to be re-applied
and re-keyed; injected CSS landed *before* the workbench's own styles, so every rule needed
`!important`; and the host had to know when a document was ready, which it can only guess.

A preload has none of those properties. It is attached to the view once, it is present in
every document of every frame from the first byte, it owns its `<style>` element and can put
it wherever the cascade needs it, and it observes the workbench directly instead of being
told about it.

## Profiles and extensions

code-server is a Code-OSS build with no `configurationSync.store`, so no account will ever pull
your setup down into it. It is reproduced instead, on every start, from the VS Code you already
have - which is read and never written to.

```
src/main/desktop.js     reads your install: which profiles exist, what each enables, which
                         folder uses which. Pure, no side effects, no Electron.
src/main/extensions.js  ONE extensions directory for the app, holding the union of every
                         profile's set. Installs what is missing, prunes what nothing wants.
src/main/profiles.js    the mirror on the server's disk: one directory per profile, holding
                         settings, keybindings, snippets and an extension subset.
src/main/registry.js    the other half of a profile, which is browser state.
```

The ordering is the whole thing, and each step is load-bearing:

1. **Install and prune before the server is spawned.** It scans the extensions directory as it
   boots and will not notice an arrival until a window reloads.
2. **Write the mirror**, layering each profile's own settings between the seams' `defaults` and
   their `settings`. A profile inherits nothing from the default one, so this is the only copy
   of them a tile will read.
3. **Start the server**, then **seed the registry** on its origin - before the first tile, because
   a tile that names an unregistered profile renders blank. If the seed throws, every tile falls
   back to the default profile rather than to a broken one.

A tile then names its profile in the URL (`?folder=…&payload=[["profile","Laravel"]]`), so the
app says which profile a window is on every load rather than depending on an association having
survived somewhere. Which profile a folder gets is derived from your desktop's own association,
the same way a project's name is derived from its path and its hue from its favicon.

Two deliberate one-way streets. Files are **copied**, never linked back: a window may save
whatever it likes into a mirrored profile and the worst outcome is that the next start
overwrites it. And an extension installed from inside a tile is pruned unless a desktop profile
claims it - the desktop is where you add one.

## Geometry

Layout is a pure function, `src/main/layout.js`:

```
tileRects({ width, height, count, mode, focusedIndex, sizes })     -> Rect[]
gridSplitters({ width, height, count, mode, sizes })               -> Handle[]
gridResize({ width, height, count, mode, sizes, axis, index, position }) -> sizes
```

`mode` is `grid`, `single` or `master` - the maximized grid, one wide column and a stack. It is
derived in the desk from the stored view mode and one boolean, never stored as a third mode, and
which project holds the wide column is the focus rather than a field.

No DOM, no Electron, no measurement of a guest. Main calls it on resize and on any change to
the project list or view mode, and applies the rects to the views. The shell page is told the
same rects so it can draw the glow around the focused one, and the handles so it can put a
cursor on each gutter - which is the only reason it knows either.

`rectAt(rects, x, y)` is the same arithmetic answering the other question: which tile a point is
in. A tile dragged by its grip is hit-tested with it, against the rects the views were placed
from and against a cursor main reads from the OS - so a gesture that begins inside a window still
costs no measurement across the boundary.

`sizes` is the one thing about the grid that is a choice rather than a derivation: a share per
column and per row, summing to one. A gutter drag sends main the POINTER's position, never a
rect; `gridResize` turns it into shares, and only the two either side of that gutter move.

Nothing measures across the boundary in either direction. That deletes an entire class of bug
the old version lived with: guest CSS pixels and host CSS pixels differ when a window sits on
a display of another scale, so any number that crossed had to be scaled by a device pixel
ratio, and any number that was pushed back had to be raw.

## State

One store, `src/main/store.js`, one file, atomic writes, a `version` field:

```json
{ "version": 1, "projects": [{ "id": "...", "folder": "/abs/path" }],
  "order": ["id", ...], "focusedId": "id", "mode": "grid", "serverPort": 51234 }
```

What is derivable is not stored. A project's **name** is its folder's basename and its **hue**
is the average of the colourful pixels in its favicon - a hash of its path when there is no
favicon, none Electron can decode (a true ICO, an SVG), or no colour in it. So neither can drift
out of step with the folder, and neither needs a migration when the rule changes.

## IPC

Two channels, not twenty.

- `ct:call` - renderer or guest to main, request and response, with a command name and a
  payload. The command table is in `src/main/ipc.js` and it is the whole surface.
- `ct:event` - main to renderer or guest, broadcast. One shape: `{ type, payload }`. `state` is
  the desk's picture, `context` is what a window is told about itself, `usage` is the
  account's meter, which is on its own type because a reading every five minutes must not
  re-place the views, and `picker` is whether that screen is up, which the shell needs because
  the screen is a window that stops at the strip and the strip's half of its scrim is drawn here.

A new feature adds a command to the table or a type to the event union. It does not add a
channel, and the shell never talks to a guest directly.

## Files

```
src/main/index.js       lifecycle, wiring
src/main/server.js      code-server child: port, spawn, health, pidfile, orphan sweep
src/main/window.js      the BrowserWindow and the shell page
src/main/tiles.js       WebContentsView per project: create, place, focus, destroy
src/main/layout.js      pure geometry, and which tile a point is in
src/main/order.js       pure ordering: what each drag gesture means, and the slots a closed
                        project keeps while the open ones are rearranged around it
src/main/projects.js    the project list and its ordering
src/main/activity.js    Claude's own hooks: installing them, and what each project's state is
src/main/desktop.js     your VS Code install, read-only: profiles, associations, extension ids
src/main/extensions.js  the one shared extensions directory: install, prune
src/main/profiles.js    the profile mirror on the server's disk, and keeping it alive
src/main/registry.js    seeding the profile registry into the tiles' partition
src/main/store.js       persistence
src/main/oauth.js       the usage wire: PKCE, the token endpoint, /api/oauth/usage. No Electron.
src/main/usage.js       the account's one poll: the grant, the five minute floor, the back-off
src/main/popover.js     the usage panel's window: anchored under the widget, sized by its page
src/main/picker.js      the project picker's window: the stage, and the scrim over it
src/main/picker-rows.js what that window lists: the project order, minus what is no longer there
src/main/ipc.js         the command table
src/main/menu.js        the menu and every accelerator

src/shell/index.html    strip, gutters, glow, the empty state
src/shell/shell.js      one module, talks to main through window.ct
src/shell/shell.css
src/shell/usage.html    the usage panel: its own page in its own window, on the same preload
src/shell/picker.html   the project picker: the same, one screen wide
src/shell/format.js     what the pages agree on: the colour ramp, a reset time, and a project's
                        mark - its favicon, or its initial on its own hue
src/shell/preload.cjs   contextBridge: window.ct

src/guest/manifest.js   the seam list. Adding a seam means adding a line here.
src/guest/runtime.cjs   the preload: loads seams, owns the style element, owns the context
src/guest/seams/*.js    one seam per file
src/guest/disk/         the seams' parts that land before the server starts: their settings and
                       keybindings, merged into its files and every profile's, and the patches to
                       the server's own bundle and to an extension's
```
