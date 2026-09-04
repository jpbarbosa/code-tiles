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
- The shell: strip, chips, view control, the focused tile's glow, the empty state.
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
- Your VS Code, mirrored: every desktop profile reproduced on the server, its extensions
  installed from Open VSX into one shared directory, and each tile opened on the profile your
  desktop already associates with that folder.
- Twelve seams, verified in a live window rather than from a screenshot:
  `dark` (the dark theme, auto-detect off, and the colour scheme of every document the window
  holds - web's default theme is the light one, and a webview that says nothing shows Chromium's
  white canvas through every pixel its own page leaves uncovered),
  `modern` (the editor's rounded design, so a tile's parts are cards on the shell colour),
  `card` (the window clipped to the radius the shell's glow is already struck for, its corners
  left unpainted over a transparent view, so what is in them is the shell's ground and its glow),
  `chrome` (title bar, status bar and the chat panel gone through the editor's own settings,
  no dead band),
  `trust` (restricted mode off, without which an extension that refuses untrusted workspaces -
  Claude Code - is simply absent),
  `ground` (the theme's shell colour reported back so the app's ground matches it),
  `tint` (the project's hue mixed into the parts, into every active tab, and into the focused
  window's ground),
  `identity` (the project's name on the side bar's title row, and its favicon in place of the
  hamburger's glyph at the top of the activity bar - the button underneath is still the editor's,
  so it still opens the menu),
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

1. **The badge's ring, and its drag.** The icon is drawn: `identity` swaps the hamburger's own
   glyph for the project's favicon, on the band the compact menu bar leaves at `y=0`. The ring
   and the grid's drag handle are more than a pseudo-element can carry, so that is the step where
   the badge becomes a node: one node, kept by an observer, removed with the seam. The monogram a
   project with no favicon should wear belongs to the same step; today it keeps the hamburger.
2. **Claude state.** Hooks in `~/.claude/settings.json` write a marker per project; main watches
   and pushes `claudeState` into the context. The ring is CSS on the badge, four behaviours, one
   hue.
3. **Drag to reorder.** Chip drag in the strip (insert) is host-only. Badge drag in the grid
   (swap) starts in the guest, so the seam reports pointer positions to main, main hit-tests
   against the rects it already owns, and the shell draws nothing over a tile.
4. **Profile upkeep.** The mirror is rewritten at start and restored by a watcher if the
   workbench deletes it. Not yet handled: a desktop profile added while the app is running, and
   an extension whose desktop version moves on.
5. **Chat titles.** The active chat's name per project, read by a seam from the editor tab it
   already lives on, reported like the ground.
6. **The rest of the window**: the trimmed Welcome page.
7. **Packaging**: a signed `.app`, and a fetch of the pinned server into `vendor/`.

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
3. `npm test` is the gate on the one patch: `branch` teaches `Part.create` to adopt the footer it
   draws, matched by SHAPE because every name in that bundle is minified. A shape that no longer
   matches is re-derived from `setFooterArea`, never guessed at. The fetch script re-extracts the
   tree, so the next start patches the new bundle and nothing has to remember that it happened.
4. Try deleting a workaround. Each one names the version it was written against; a bump is the
   only moment anyone will ever check.
