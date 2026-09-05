# Roadmap

What the tree does today, what comes next, and what to check when the server is bumped.
`README.md` is the product; this file is the only place that says how much of it is real.

## Standing today

- One shared code-server, started on launch, killed with the app, orphan reaped on the next
  start from a pidfile whose command line is checked before anything is signalled.
- One `WebContentsView` per project on one partition, placed by main from pure geometry.
- Grid and single view, focus, open, close, project order, all persisted.
- Gutter resizing: the gutter between two tiles is the handle, a double-click evens its axis and
  `⌃⌘0` evens both. Shares rather than pixels, kept per grid SHAPE, persisted.
- Maximize: one project takes a column of about seven tenths and the rest stack live beside it,
  from an item at the top of that window's own activity bar. The wide one is CHOSEN and stays
  chosen: clicking into a stacked tile moves the focus ring and leaves the column where it was, so
  the two questions - where you are, what is wide - are answered separately and the item is the
  only thing that answers the second. Its column and its stack rows are dragged, evened and
  remembered like any grid's, under a shape key of their own.
- Zoom, as one app: `⌘+`, `⌘-` and `⌘0` move every tile together and a project opened
  afterwards comes up at the same size, as does the next launch - the partition persists it by
  host. The shell is a different origin and stays where it is.
  Not the menu's zoom roles - those move whichever window holds the keyboard, and the shell
  holding it would put its gutters somewhere else than the tiles. `⌘0` is the editor's own Focus
  into Primary Side Bar, so the `zoom` seam gives that chord back in every profile's keybindings.
- Rearranging, one gesture per view and one project order behind both. In the strip a chip is
  dragged along the row and INSERTS: it lifts out as a clone under the hand and the hole it leaves
  is the placeholder it will drop into, reflowing as the others shift around it. In the grid a
  tile is dragged by its own identity BADGE and SWAPS with the one it is let go over - the wide
  column included, which changes hands when a tile is dropped on it. There the tiles are the
  feedback, since nothing outside one can draw on it: they trade places as the cursor crosses.
  That gesture starts INSIDE a window, so the seam reports the press and the release and nothing
  between, and main follows the cursor from the OS and hit-tests the rects it already placed the
  views from - no position crosses the boundary, and a zoomed tile has nothing to scale. The badge
  is the editor's menu button, so a press is HELD rather than taken: `preventDefault` on the
  pointerdown suppresses the mousedown the menu opens on, and a release that never moved gives
  that press back. `Esc` puts back the order the press began with, in either view.
- A close × on every tile, in its top right corner on a plate of the project's own hue: the chips
  are single view's, so the grid had `⌃⌘W` and nothing else.
- The shell: strip, view control, the focused tile's glow, the empty state - and the chips, each
  wearing the same mark its window wears on its badge inside: the project's favicon, or its
  initial on its own hue, with the Claude ring around it either way.
- The layout control: the editor's own three title bar buttons, in the strip, flipping the side
  bar, the panel or the secondary side bar in every open project at once. A part nobody has
  chosen for is left alone, and the buttons show the focused window's own answer, so a Cmd+B
  inside a tile moves them.
- The usage meter: a 5-hour and a 7-day bar, live from `/api/oauth/usage` behind the app's own
  PKCE login, one poll for the account with a five minute floor and a back-off on 429. The grant
  is encrypted with `safeStorage`. Clicking opens the panel - exact numbers, reset times,
  per-model buckets, and the sign-in itself - which is a WINDOW of its own, because a panel drawn
  in the shell page would sit behind the tiles. It sizes itself to what it drew and dismisses on
  blur, except while a sign-in is in flight, since that blur is you fetching the code.
- The picker: every folder ever opened here, in the one project order, each with its favicon or
  its initial on its own hue, the path that tells two of the same name apart, and a mark on the
  ones already open - which a click focuses rather than opening twice. A folder that is no longer
  there is dropped from the list rather than forgotten, so an unmounted volume brings its projects
  back with it. It is a WINDOW, for the reason the usage panel is one, and it covers the stage
  rather than a box under the +: the scrim is what makes a list of paths readable over four live
  editors, and it is the target that dismisses the thing. Nothing to pick from is not a screen
  worth showing, so an empty list is the folder dialog, which is also the list's last row.
- Your VS Code, mirrored: every desktop profile reproduced on the server, its extensions
  installed from Open VSX into one shared directory, and each tile opened on the profile your
  desktop already associates with that folder.
- What Claude is doing, per project: its own hooks write one marker per session into the app's
  data directory, main watches that directory and answers with a state per project - working, a
  question, a turn that ended you have not seen, or an open session with nothing to say. A
  session belongs to the folder it STARTED in, so a `cd` does not move it, and to the deepest
  open project that holds it. Focusing a project clears a finished turn; a question is only
  cleared by answering it. Drawn twice: the ring on each window's own badge, and the dot on the
  chip in the strip, which is where you see a project you are not looking at.
- Sixteen seams, verified in a live window rather than from a screenshot:
  `dark` (your desktop's theme, a dark one only as the fallback under it, auto-detect off, and
  the colour scheme of every document the window holds - web's default theme is the light one,
  and a webview that says nothing shows Chromium's white canvas through every pixel its own page
  leaves uncovered; the two first paints no document can reach are patched instead - the bundle's
  own light-first fallback, on a profile with no theme cached yet, and the webview frame's served
  HTML, which was a fifth of the tile going white for the 31 ms between that frame committing and
  its load),
  `modern` (the editor's rounded design, so a tile's parts are cards on the shell colour),
  `card` (the window clipped to the radius the shell's glow is already struck for, its corners
  left unpainted over a transparent view, so what is in them is the shell's ground and its glow),
  `chrome` (title bar, status bar and the chat panel gone through the editor's own settings,
  no dead band),
  `welcome` (the welcome page saying Code Tiles rather than code-server, without Coder's ad for
  their hosted product and without the walkthrough list - the first two are the server's own
  switches, taken at the spawn, and the third is a patch that hands the page no walkthroughs so
  the editor's own empty state moves Recent into the column they had),
  `trust` (restricted mode off, without which an extension that refuses untrusted workspaces -
  Claude Code - is simply absent),
  `ground` (the theme's shell colour reported back so the app's ground matches it),
  `tint` (the project's hue mixed into the parts' own surfaces and their chrome, into every
  active tab, and into the focused window's ground - which the activity bar wears too, being
  shell rather than a part; the terminal takes the same colour from a `lighten` overlay, its
  canvas having taken its own at construction and letting no stylesheet in; and the activity
  bar's resting icons are re-derived over that ground, which a theme's own grey is 1.3:1 against -
  the same ink the side bar's title row wears;
  and a webview under a part - the Claude panel - gets the same mix again inside its own document,
  on every background the theme wrote there rather than the three, its canvas being the surface it
  actually shows),
  `identity` (the project's name on the side bar's title row, and its favicon in place of the
  hamburger's glyph at the top of the activity bar - the button underneath is still the editor's,
  so it still opens the menu - with a ring around that favicon for what Claude is doing here: it
  turns while a turn runs, pulses while it waits on you, breathes on a turn that ended you have
  not seen, and is absent otherwise. The badge is that one element's `::before` and the ring is
  its `::after`, so neither can fall out of step with the other, and the ring is a rounded
  rectangle concentric with the card - which is why the comet turns by its own angle rather than
  by a transform, a mask being something that turns with the element it masks. The badge is also
  the tile's own drag handle, which costs it no node: the listener goes on the button the badge is
  drawn on, delegated off the workbench because the menubar is rebuilt whenever the menu changes),
  `chat-icon` (the same three states on the Claude chat tab's own icon, which is the extension's
  `panelTab.iconPath` pointed at SVGs that animate themselves - a patch to the extension's bundle,
  since a still image is all VS Code has and stepping one through frames blinks over http),
  `close` (the × that closes this project, in the corner the window keeps for itself, on a plate
  of the project's own hue - the one the branch pills and the side bar's title row already wear,
  so the app's marks in a window read as one hand. One button belonging to the WINDOW rather than
  an item in a part's toolbar: a tile with Claude's chat beside the code is two editor groups, and
  a close in each group's actions would be two ways to close one project, neither of them about
  the tile - with the room for it taken out of the editor's title row rather than laid over it),
  `maximize` (the app's one item in the activity bar's own list, first, under the badge - built
  from the classes the editor builds its items with, so it takes the bar's size, its hover pill
  and the accent an active view wears, and needs no slot cut for it; the restore half is
  `screen-normal`, since `panel-restore` has no icon registered in this build and paints nothing),
  `branch` (the branch and its sync as two pills at the bottom of the side bar, mirrored from the
  status bar entries that hiding the bar leaves alive, so a click still checks out or syncs - in
  a footer the side bar is taught to give REAL room to rather than an overlay over the tree),
  `terminals` (the terminals as tabs across the panel's header, mirrored from the <select> the
  editor puts there once its own tab list is off - which is the setting that also gives the
  panel's width back; a right-click on the header still opens the editor's own view menu),
  `layout` (the three parts the strip's layout control flips, through the editor's own
  keybindings, acting on a change of instruction rather than on every render),
  `focus` (a press inside a window claims focus for its project, since a view paints above the
  shell's page and the shell never sees that press - registered on every document the runtime's
  sweep reaches, because a press in the Claude panel lands two frames down in a webview).

## Next, in order

1. **The badge's monogram.** A project with no favicon keeps the editor's hamburger inside its
   window, where the picker already draws that project's initial on its own hue. The badge and
   its ring are both pseudo-elements of the menu button, which is what keeps them alive through a
   workbench rebuild; the step is whether a monogram can stay one too, or has to be the node the
   badge has so far not needed to be.
2. **Profile upkeep.** The mirror is rewritten at start and restored by a watcher if the
   workbench deletes it. Not yet handled: a desktop profile added while the app is running, and
   an extension whose desktop version moves on.
3. **Chat titles.** The active chat's name per project, read by a seam from the editor tab it
   already lives on, reported like the ground.
4. **Packaging**: a signed `.app`, and a fetch of the pinned server into `vendor/`.

## Not doing

- Measuring anything in a guest for the host to use. If a seam needs a number, it needs a CSS
  variable instead. See `docs/CONSTRAINTS.md`.
- Per-project settings through `settings.json`. One server is one settings file; a per-project
  difference is a seam or a profile.

## When the server is bumped

The pinned version is in `scripts/fetch-code-server.sh`. After a bump, in this order:

1. Run the app and read the seams back out of a window (`CT_PROBE=1` and `scripts/dev-probe.js`).
   Every seam that reports is checked by that pass; a seam that reports nothing needs a line
   added there rather than a look.
2. `chrome` is the seam most likely to break: it depends on the workbench deciding that nothing
   needs a title bar. If a new feature claims that row, the setting for it goes in the seam.
3. `npm test` is the gate on both patches, each matched by SHAPE because every name in that
   bundle is minified: `branch` teaches `Part.create` to adopt the footer it draws, and `welcome`
   hands the welcome page an empty walkthrough list. A shape that no longer matches is re-derived
   from the code around it - `setFooterArea`, `buildGettingStartedWalkthroughsList` - never
   guessed at. The fetch script re-extracts the tree, so the next start patches the new bundle
   and nothing has to remember that it happened.
4. Try deleting a workaround. Each one names the version it was written against; a bump is the
   only moment anyone will ever check.

## The frame inside a tile

`frame` halves the inset the editor floats its parts in, so the space beside a tile is the app's
gutter plus 4px rather than plus 8px. `FRAME_SHARE` at the top of the seam is the whole knob, read
by both the stylesheet and the patch. Scaling the unit catches the seam BETWEEN a window's own
parts as well, since the editor spells that with the same one, so the seam puts it back.

## When the Claude Code extension updates

It updates itself, into a fresh versioned directory, so the `chat-icon` patch is gone and the
next start applies it again to a bundle nobody has read. Nothing has to be done by hand, and
nothing is silent about failing: a shape that moved is one `[extension]` line at startup naming
what it could not match, and the tab wears the extension's own still logo until the anchor is
re-derived from the code around it - `applyTabIcon`, `update_session_state`. Both are matched by
shape and required to hit exactly ONCE, so a bundle that grew a second copy of either is refused
rather than guessed at. The pristine bundle sits beside it as `extension.js.ct-orig`; delete both
that and the patched file to make the app's own installer fetch a clean one.
