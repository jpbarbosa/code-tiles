# Code Tiles

Several VS Code projects, live, in one macOS window. Every project is a real editor with a
working terminal, and they are all windows of **one shared code-server**, so one login, one
set of settings and one extension host family serve every tile.

The app exists for the **grid**: a session opens with every project on screen at once, because
the thing it is built for is running an agent in each of them and being able to see, without
switching, which one is working, which one is waiting for you, and which one is done.

> Status: greenfield rewrite. The spec below is the whole product; `docs/ROADMAP.md` says what
> the current tree actually does. The architecture that keeps the two apart is in
> `docs/ARCHITECTURE.md`, and the facts that shape both are in `docs/CONSTRAINTS.md`.

## The window

One window, one flat ground. The top strip, the gutters between tiles and the ground inside
every tile are the same colour, and that colour is not chosen here: it is read from the theme
the editor is running, so a tile edge never shows a step and a theme change carries the whole
window with it.

- **The strip** (36px) holds, on one line: the traffic lights, the view control, the project
  chips, the **+**, the layout control and the usage meter.
- **The grid** fills the rest. `cols = ceil(sqrt(n))`, near square; the last tile stretches
  across any empty trailing cells so the grid is always full.
- **The gutter** is the app's own frame, not the editor's. Whatever inset the editor floats
  its own parts in is neutralised, so a version bump cannot move the tile's edge.
- **The gutters resize it.** Drag the one between two tiles and those two trade space, the rest
  of the grid staying exactly where your eye left it; double-click it to even that axis again,
  or `⌃⌘0` to even both. Sizes are **shares, not pixels**, so a resized window keeps them, and
  they are remembered against the grid's **shape** rather than the project count - three
  projects and four are both a 2x2, so closing one and reopening it lands back where you were.
- **Maximize** gives one project a column of about seven tenths of the width and stacks the
  others live beside it, so you can work in one while still watching the rest. The switch is an
  item at the top of that window's own activity bar, under the badge: on a stacked project it
  offers the column, and on the project that already holds it the same item is lit and hands the
  even grid back. The wide one is always the **focused** project, so it follows `⌘\`` and a click
  into a tile rather than being a second thing to keep track of. The gutters resize the master's
  column and the stack's rows the way they resize any grid, and those proportions are remembered
  against the maximized shape rather than the even one it came from.

## Focus

Exactly one project is focused, in both views. **Clicking into a tile focuses it**, as do the
chip and the keyboard, and focus is shown by **colour on the ground, never by a border**:

- The focused tile's shell takes the project's hue: its margins and the gaps between its own
  panels turn that colour, while every panel inside it stays exactly as the theme painted it.
- Outside the tile the same hue continues as a **glow in the gutter**, at half the alpha of
  the inside, so the two read as one light source and the tile's edge does not cut it off.
- The focused chip in the strip is **filled** with the same hue. An unfocused chip is the
  strip lifted a few percent with a wash of its project's hue in it: enough to tell three
  projects apart, quiet enough that the filled one is the only chip that steps forward.

## Identity

Every project carries its own hue, sampled from the colours its own favicon is mostly made of
and hashed from its path when there is no favicon to take one from - derived either way, so it
is stable across restarts and never stored. The hue appears in six places and nowhere else: the
chip, the focused tile's ground and glow, the sidebar title row inside the window, the branch
pills under its file tree, the ring around the identity badge, and the ACTIVE tab wherever
there is one - a file, a Claude
session, a terminal, the side bar's own view switcher. An inactive tab keeps the theme's colour,
so in every row the hue marks the one thing you are working in.

The **identity badge** sits at the top of the activity bar, inside the window, where the
editor's own title bar used to be. It is the project's favicon, or a monogram, and it is what
you drag to rearrange the grid. It is drawn **by the guest**, not overlaid by the app: it
belongs to the window it names, moves with it, and needs nothing from the host to stay put.

## The Claude signal

A ring around the identity badge reports what Claude is doing in that project. **The state is
the motion, not the colour** - one hue, four behaviours:

| State | Ring |
|---|---|
| working | comet, spinning |
| needs you | ring, blinking fully out on a 2.4s cycle |
| finished | ring, breathing down to a third on a 4.8s cycle |
| idle | no ring |

Finished breathes rather than sitting still: a static ring makes the one state that has to
reach you the least visible of the three. The icon itself never animates.

The signal comes from Claude Code's own hooks, so it works for the CLI and the extension
alike, and it is the same ring on the chip in single view.

## Usage

A 5-hour and a 7-day bar sit at the right of the strip, left of the layout control,
account-global rather than per project, ramping green to amber to orange to red as a window
fills. Click for a panel with exact percentages, reset times and per-model buckets.

Numbers are live or absent. Without a connected account the widget is a single **Connect**
button, and the panel it opens is where you sign in: it sends you to the browser you are already
signed into and takes the code back. There is deliberately no estimate from local transcripts,
because an estimate can only calibrate against your own biggest window ever run and reads 100%
every time you set a new peak.

## The layout control

The three buttons VS Code puts at the right of its own title bar - side bar, panel, secondary
side bar - sit at the right of the strip instead, and here each one drives **every open project
at once**, so one click retiles the whole grid the same way. A project opened afterwards comes
up in the state you chose.

Until you press one, nothing is imposed: every window keeps the layout it remembers. The buttons
show the focused project's own answer, so a ⌘B pressed inside a tile moves them.

## Opening, closing, reordering

**+** opens the picker: every folder ever opened here, newest first, each with the icon its
chip wears and the path that tells two folders of the same name apart. A project that is open
is marked, and clicking it focuses that tile rather than opening a second copy. **Open
folder...** is the last row of that list, not a footer, and it is what **+** does directly
while the list is still empty.

Closing a project takes the tile away and keeps the entry, which is what makes reopening a
click. A folder that has since been deleted is dropped from the list rather than offered.

There is **one project order** behind the strip, the grid, the number shortcuts and the saved
list, and each view offers exactly one gesture to change it:

- **Single view: drag a chip along the strip.** It inserts, the chips it passes shifting
  along, and a gap opens where it will land.
- **Grid: drag a tile's badge onto another tile.** They swap. A grid has nothing to shift
  along, and an insert would shuffle every project in between.

`Esc` abandons a drag. The order is persisted.

## Shortcuts

| Key | Does |
|---|---|
| `⌃⌘1` ... `⌃⌘9` | focus project N (in both views) |
| `⌘\`` / `⇧⌘\`` | focus the next / previous project, wrapping |
| `⌃⌘G` | grid |
| `⌃⌘E` | single view, on the focused project |
| `⌃⌘O` | open a folder |
| `⌃⌘W` | close the focused project |
| `⌃⌘0` | even the tiles out again |

`Ctrl+Cmd` throughout, so nothing shadows the editor's own `⌘1`, `⌘W`, `⌘O` inside a tile.
`⌘\`` is the deliberate exception: it is macOS's "next window in this app", and a tile is a
window.

## Inside a window

What the app changes about a stock editor is small, deliberate, and listed in one place
(`src/guest/manifest.js`). The shape of it:

- **The editor's title bar and status bar are gone**, because the strip already names the
  project and the status bar carries per-file detail nobody reads from a tile they are
  glancing at. Both are turned off through the editor's own settings, not clipped.
- **The window is tinted** with the project's hue: the parts wear it, the ground does not.
- **The identity badge and its ring** are drawn in the activity bar.
- **The branch is put where it can be seen**, under the file tree, since the status bar that
  used to carry it is gone. It is the editor's own entry off that bar, mirrored into a pill the
  side bar makes real room for, so clicking it still checks out or syncs.
- **Terminals are tabbed along the panel header** rather than listed down its right edge,
  which costs width in every tile at once.

Everything else is the editor as it ships. The test for whether something belongs in the
guest layer at all: *would a stock code-server do this by itself?*

## Requirements

macOS on Apple Silicon, Node 20+ for tooling only (Electron ships its own), and a
code-server build in `vendor/` (`npm run fetch-code-server`) or on `PATH`.

## Run

```bash
npm install
npm start
```
