# Roadmap

What the tree does today, what comes next, and what to check when the server is bumped.
`README.md` is the product; this file is the only place that says how much of it is real.

## Standing today

- One shared code-server, started on launch, killed with the app, orphan reaped on the next
  start from a pidfile whose command line is checked before anything is signalled.
- One `WebContentsView` per project on one partition, placed by main from pure geometry.
- Grid and single view, focus, open, close, project order, all persisted.
- A tile is a WINDOW, so it can re-point itself: File > Open Folder inside one, or a row of its
  welcome page's Recent list, navigates to another `?folder=`. The app follows - the view is
  re-keyed in place rather than torn down, the slot keeps its position in the grid, and the folder
  it left stays in the picker. One folder is one project, so a folder another tile already holds
  is refused: that window goes back to its own and the tile holding it takes the focus.
- Windows are brought up on a staircase rather than all at once, because every tile is a separate
  `claude` reading and writing ONE login, and simultaneous OAuth refreshes rotate the single-use
  refresh token out from under each other. The focused tile never waits; `CODE_TILES_STAGGER_MS=0`
  turns it off. `src/main/bringup.js`.
- Gutter resizing: the gutter between two tiles is the handle, a double-click evens its axis and
  `⌃⌘0` evens both. Shares rather than pixels, kept per grid SHAPE, persisted.
- Maximize: one project takes a column of about seven tenths and the rest stack live beside it,
  from an item at the top of that window's own activity bar. The wide one is CHOSEN and stays
  chosen: clicking into a stacked tile moves the focus ring and leaves the column where it was, so
  the two questions - where you are, what is wide - are answered separately. `⌘\`` is the one
  command that answers both, because walking the order into a tile 30% wide is walking into a
  project you cannot work in. Its column and its stack rows are dragged, evened and remembered
  like any grid's, under a shape key of their own.
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
- That mark found where a framework actually puts one - sixteen directories, from `public/` to a
  monorepo's `packages/web/public/` - and decoded in an offscreen renderer, which is what reads a
  true ICO and an SVG at all. 30 of the 83 projects on this machine now wear their own colour
  where 17 did; the rest of the gain was a zero-byte Laravel placeholder shadowing real icons.
- The layout control: the editor's own three title bar buttons, in the strip, flipping the side
  bar, the panel or the secondary side bar in every open project at once. A part nobody has
  chosen for is left alone, and the buttons show the focused window's own answer, so a Cmd+B
  inside a tile moves them.
- Project colour, the app's one preference (`⌘,`): how much of its hue a window wears, on a dial
  for the tile you are in and a dial for the tiles you are not, three rungs each. A rung is a
  MULTIPLIER on every amount the tint spends - the veil over a part, the wash on a plate, the
  ground, the ink on it, the chat bubble's chroma - and the three are a ratio rather than a spread,
  so a step means the same thing wherever on the dial it is taken. A window is handed the ONE rung
  that applies to it, never the preference, so which dial it came off stays the app's business.
  Persisted, and every open window follows the moment it moves, with no reload.
- The usage meter: a 5-hour and a 7-day bar, live from `/api/oauth/usage` behind the app's own
  PKCE login, one poll for the account with a five minute floor and a back-off on 429. The grant
  is encrypted with `safeStorage`. Clicking opens the panel - exact numbers, reset times,
  per-model buckets, and the sign-in itself - which is a WINDOW of its own, because a panel drawn
  in the shell page would sit behind the tiles. It sizes itself to what it drew and dismisses on
  blur, except while a sign-in is in flight, since that blur is you fetching the code.
- The picker: every folder ever opened here, in the one project order, each with its favicon or
  its initial on its own hue, and the path that tells two of the same name apart. One already open
  is focused rather than opened twice; nothing marks it, because nearly every row is open and a
  badge on each was a word repeated down the column. A folder that is no longer
  there is dropped from the list rather than forgotten, so an unmounted volume brings its projects
  back with it. It is a WINDOW, for the reason the usage panel is one, and it covers the stage
  rather than a box under the +: the scrim is what makes a list of paths readable over four live
  editors, and it is the target that dismisses the thing. Nothing to pick from is not a screen
  worth showing, so an empty list is the folder dialog, which is also the list's last row. Cmd+O
  opens it from the File menu and the strip's + opens it by hand, both through the one command, so
  the empty-list rule has one place to live.
- Typing in the picker searches one list, not two: the projects that match, then folders on disk
  that no project has claimed - four levels under $HOME and beside a project you keep somewhere
  else, skipping `Library`, `node_modules` and `vendor`. A query with a `/` in it is matched
  against the PATH, so `sites/orbit` finds a folder that no single name matches; without one it is
  a name. A query that STARTS like a path is read as one instead, so `~/Sites/` lists what is in
  it and every `/` walks a level down; a child that is already a project keeps its icon and its ×. The field holds the focus the whole time, so the arrows move a selection rather
  than the focus, → at the end of the text steps INTO the selected folder without opening it, and
  the home row above the folder dialog seeds `~` - a place to browse from.
- Links out of a tile, in one policy (`src/main/links.js`, with tests): an external link goes to
  your browser, but a popup that KEEPS its opener stays here, because the grant it is about to
  write belongs on the server's origin in this partition and a sign-in finished in Safari writes
  it where no tile can read it. The discriminator is `noopener`, which the editor puts on every
  external link. The child inherits the view's session and not its preload, so nothing of ours
  runs on a sign-in page. The top frame is held to the origin it is on for the same reason: a
  view is loaded once when it is created, so a tile that navigates away has no way back.
- Your VS Code, mirrored: every desktop profile reproduced on the server, its extensions
  installed from Open VSX into one shared directory, and each tile opened on the profile your
  desktop already associates with that folder.
- What Claude is doing, per project: its own hooks write one marker per session into the app's
  data directory, main watches that directory and answers with a state per project - working, a
  question, a turn that ended you have not seen, or an open session with nothing to say. A
  session belongs to the folder it STARTED in, so a `cd` does not move it, and to the deepest
  open project that holds it. Focusing a project clears a finished turn; a question is only
  cleared by answering it. Drawn three times: the ring on each window's own badge, the dot on the
  chip in the strip, which is where you see a project you are not looking at, and a count on the
  DOCK - the two states that are about you rather than about Claude - which is the only one of
  the three that reaches you with the app behind something else.
- Twenty seams, verified in a live window rather than from a screenshot:
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
  no dead band; and the activity bar down to the four views a project is worked in, the rest moved
  into the editor's own Additional Views overflow by a patch that filters the list the bar is about
  to show while leaving the count it compares that list against whole - which is the state a bar
  with too little room is already in, so the overflow is the editor's from there on),
  `welcome` (the welcome page saying Code Tiles rather than code-server, without Coder's ad for
  their hosted product and without the walkthrough list - the first two are the server's own
  switches, taken at the spawn, and the third is a patch that hands the page no walkthroughs so
  the editor's own empty state moves Recent into the column they had),
  `secrets` (an extension's secret surviving another tile writing one of its own - the server
  keeps every one of them in a single localStorage blob, read at load and rewritten whole, so on
  one origin with several windows the last writer wins with a stale snapshot; the write is taught
  to re-read inside a per-window queue, and a storage listener keeps the read fresh with it),
  `trust` (restricted mode off, without which an extension that refuses untrusted workspaces -
  Claude Code - is simply absent),
  `ground` (the theme's shell colour reported back so the app's ground matches it),
  `tint` (the project's hue mixed into the parts' own surfaces and their chrome, into every
  active tab, into every plate that floats above a part rather than sitting inside one - the
  palette and every quick pick, find, hover, suggest, the code-action list, menus and toasts,
  named one by one because the theme names them one by one, and surfaces only, since half of
  the theme's backgrounds are translucent highlights and a veil under one paints a line where
  the theme asked for nothing - and into the window's ground - which the activity bar wears too,
  being shell rather than a part - at a share of it on a tile nobody is in, so the ground is what
  answers "where am I"; the terminal takes the same colour from a `lighten` overlay, its
  canvas having taken its own at construction and letting no stylesheet in; and the activity
  bar's resting icons are re-derived over that ground, which a theme's own grey is 1.3:1 against -
  the same ink the side bar's title row wears, at half the chroma on a tile nobody is in;
  and a webview under a part - the Claude panel - gets the same mix again inside its own document,
  on every background the theme wrote there rather than the three, its canvas being the surface it
  actually shows, plus the one surface no mix can reach: your own turns, which the theme ships at
  `input.background` and a theme is free to make the very colour of the page, so they are PAINTED -
  the page stepped a tenth of the way toward its own text and rotated to the hue, which is a
  lighter bubble on a dark theme and a darker one on a light theme from the same number. Every
  amount above is a MULTIPLE of the rung the Project colour bullet above sets),
  `identity` (the project's name on the side bar's title row, and its mark in place of the
  hamburger's glyph at the top of the activity bar - the button underneath is still the editor's,
  so it still opens the menu. The mark is that project's favicon, or its initial on its own hue
  where there is none, which is the plate the strip's chip draws at its own size - one box either
  way, so the ring around it fits both. That ring says what Claude is doing here: it
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
  `chat-column` (a Claude session opening in the group you are already in rather than in a locked
  column of its own - one edit to the extension's own fallback, which is what its command reads
  before it runs `workbench.action.lockEditorGroup`; an explicit column and an existing Claude
  group are both left as they were),
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
  sweep reaches, because a press in the Claude panel lands two frames down in a webview),
  `frame` (the inset the editor floats its parts in, halved, so the space beside a tile is the
  app's gutter and not the app's gutter plus the editor's - one share read by the stylesheet and
  the patch alike; see *The frame inside a tile* below),
  `zoom` (Cmd+0 given back off the editor, which binds it to Focus into Primary Side Bar and
  would otherwise swallow the key before the View menu's Actual Size ever saw it).
- macOS, Windows and Linux, from one place: `src/main/platform.js` answers which host this is and
  nothing else in the tree carries a `process.platform` check. Every answer is a pure function OF a
  platform name, with this host's derived from it, because the other two cannot be run here and a
  test is the only evidence they are right. What moves: the chord family (the app sits one modifier
  above the editor's, which is Ctrl+Cmd on macOS and Ctrl+Alt where the editor owns Ctrl), the
  window's own controls (traffic lights laid over the left, or a caption overlay drawn at the
  right, with the strip reserving the end the host uses), your desktop VS Code's profile directory,
  the folders the picker's walk skips under $HOME, and the badge - a count on the Dock, a Unity
  badge, or a flashing taskbar button, Windows having no badge to set. A seam spells the editor's
  modifier `$mod` and `disk/keybindings.js` expands what main hands it, so `pick` and `zoom` give
  back `cmd+o` or `ctrl+o` without either seam knowing which host it is on.
- ⚠ **coder publishes no Windows build of code-server.** Only linux-amd64/arm64 and
  macos-amd64/arm64 exist, so `fetch-code-server` refuses on Windows and a packaged Windows app
  carries no server: it finds one you installed from npm, on PATH or at `CODE_TILES_CODE_SERVER`.
  The vendored server is a NATIVE build, so it is left out of any cross-built app as well.
- Packaging: `npm run install-app` signs a `Code Tiles.app` into `/Applications`, with the pinned
  server beside the app rather than in it. A real identity, so the designated requirement anchors
  to the team instead of to a cdhash that every rebuild changes - which is what keeps the TCC
  grants across builds. The bundle shares its data directory with `npm start`, so the two hold
  the same projects and never run at once.

## Next, in order

1. **Profile upkeep.** The mirror is rewritten at start and restored by a watcher if the
   workbench deletes it. Not yet handled: a desktop profile added while the app is running, and
   an extension whose desktop version moves on.
2. **Chat titles.** The active chat's name per project, read by a seam from the editor tab it
   already lives on, reported like the ground.

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
3. `npm test` is the gate on the server patches, each matched by SHAPE because every name in
   that bundle is minified: `branch` teaches `Part.create` to adopt the footer it draws, `welcome`
   hands the welcome page an empty walkthrough list, `dark` fixes the light-first fallback and the
   webview frame, `frame` scales the editor's own inset, and `secrets` makes an extension secret
   write merge instead of overwrite. A shape that no longer matches is re-derived from the code
   around it - `setFooterArea`, `buildGettingStartedWalkthroughsList` - never guessed at. Every
   patch must also ERASE the shape it matched, which the same test checks: a replacement that
   re-emits its own anchor leaves `find` matching forever, so nothing but the marker can tell a
   patched bundle from an unpatched one. The fetch script re-extracts the tree, so the next start
   patches the new bundle and nothing has to remember that it happened.
4. Try deleting a workaround. Each one names the version it was written against; a bump is the
   only moment anyone will ever check.

## The frame inside a tile

`frame` halves the inset the editor floats its parts in, so the space beside a tile is the app's
gutter plus 4px rather than plus 8px. `FRAME_SHARE` at the top of the seam is the whole knob, read
by both the stylesheet and the patch. Scaling the unit catches the seam BETWEEN a window's own
parts as well, since the editor spells that with the same one, so the seam puts it back: a margin
sideways, where widths reflow, and a margin plus the layout service's own reservation above the
panel, since a part's height is what is left of its slot once that reservation is taken.

The activity bar is the one part the scaling lands unevenly on: the column the layout service
reserves for it shrinks with the unit and the bar's own width does not, so the part beside it gets
a doubled margin to take the difference back. That part is the side bar, or the editor once the
side bar is hidden - which is why the doubled margin is written against both.

## When the Claude Code extension updates

It updates itself, into a fresh versioned directory, so both patches on it - `chat-icon` and
`chat-column` - are gone and the next start applies them again to a bundle nobody has read. They
share the file, so they are spent in ONE pass over one pristine source: patched a seam at a time
from the backup, each would start over and only the last edit would survive. A seam whose shape
has moved is skipped by name and the other still lands.

Nothing has to be done by hand, and nothing is silent about failing: a shape that moved is one
`[extension]` line at startup naming what it could not match and what it degrades to. Each is
required to hit exactly ONCE, so a bundle that grew a second copy is refused rather than guessed
at. The pristine bundle sits beside it as `extension.js.ct-orig`; delete both that and the
patched file to make the app's own installer fetch a clean one.

**Anchor on names the minifier cannot touch.** 2.1.261 replaced the if/else chain that picked a
resting icon with a lookup table, and `chat-icon` broke - because it was anchored on the chain
rather than on what the chain fed. It now anchors on the one assignment to `this.panelTab.iconPath`
and takes the resting name as an EXPRESSION, so a variable and a table lookup both match; the
grammar accepts accessor chains only, never a call, which is what makes reading it twice safe.
Property paths on `this`, VS Code API names and string literals survive minification. Control flow
does not. Both spellings are kept in `test/extension.test.js` so the anchor is held to a family
rather than to whichever one shipped last.

**An anchor that scans to a name must require the syntax it expects there.** The state shape spans
lazily to `this.onSessionStateChanged` and injects the call in front of it, so a guard or a hoist
naming the same property earlier in the body would take the call's place - `if(!spin(),handler)
return` is the guard inverted, valid JavaScript, and invisible to both the exactly-once check and
`node --check`. A one-token lookahead for the call parens is the whole fix.

**A string a patch reads drifts without moving any shape.** `chat-icon` matches session states by
value and translates the extension's resting icons by filename; rename either and the patch still
lands, still parses, and quietly stops animating. There is no refusal to make - the tab rests
where it should spin, which is worse than stock but not broken - so a patch that landed returns
`notes`, printed as the same `[extension]` line a refusal is. What notices the drift in the first
place is a test that runs the anchors against the bundle THIS MACHINE has, rather than only
against the fixtures, and skips where there is none.

**Your own VS Code needs the same two patches, and has no boot hook to apply them.** `npm run
patch-vscode` spends the seams on `~/.vscode/extensions` instead of the app's copy - the same
patchers, so there is one bundle shape to keep alive rather than two - and the
`io.jp7.claude-vscode-patch` LaunchAgent runs it on every write to an `extensions.json`, which VS
Code rewrites on each install and update and the patchers never touch. It is pointed at the app's
extensions directory as well: the app patches on start, but restarting it costs every live session,
so a running build wants the same trigger.
