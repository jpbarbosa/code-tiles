# Roadmap

What the tree does today, what comes next, and what to check when the server is bumped.
`README.md` is the product; this file is the only place that says how much of it is real.

## Standing today

- One shared code-server, started on launch, killed with the app, orphan reaped on the next
  start from a pidfile whose command line is checked before anything is signalled.
- One `WebContentsView` per project on one partition, placed by main from pure geometry.
- Grid and single view, focus, open, close, project order, all persisted.
- The shell: strip, chips, view control, the focused tile's glow, the empty state.
- Six seams, verified in a live window rather than from a screenshot:
  `dark` (the dark theme, auto-detect off, and the document's own colour scheme - web's default
  theme is the light one),
  `modern` (the editor's rounded design, so a tile's parts are cards on the shell colour),
  `chrome` (title bar and status bar gone through the editor's own settings, no dead band),
  `ground` (the theme's shell colour reported back so the app's ground matches it),
  `tint` (the project's hue mixed into the parts, and into the focused window's ground),
  `identity` (the project's name on the side bar's title row).

## Next, in order

1. **Identity badge and Claude ring.** The badge belongs at the top of the activity bar, on the
   hamburger band the compact menu bar leaves at `y=0`. It has to be a real element rather than
   a pseudo-element, because it is also the grid's drag handle, so this is the first seam with
   an `init` that owns a node: one node, kept by an observer, removed with the seam.
2. **Claude state.** Hooks in `~/.claude/settings.json` write a marker per project; main watches
   and pushes `claudeState` into the context. The ring is CSS on the badge, four behaviours, one
   hue.
3. **Drag to reorder.** Chip drag in the strip (insert) is host-only. Badge drag in the grid
   (swap) starts in the guest, so the seam reports pointer positions to main, main hit-tests
   against the rects it already owns, and the shell draws nothing over a tile.
4. **Usage bars.** OAuth PKCE in main, token in `safeStorage`, one poll for the app rather than
   one per tile, a five minute floor and a back-off on 429.
5. **Chat titles.** The active chat's name per project, read by a seam from the editor tab it
   already lives on, reported like the ground.
6. **The rest of the window**: terminals along the panel header, the branch under the file tree,
   the trimmed Welcome page.
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
3. Try deleting a workaround. Each one names the version it was written against; a bump is the
   only moment anyone will ever check.
