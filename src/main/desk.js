import { app, dialog, screen } from 'electron';

import { METRICS, gridResize, gridSplitters, rectAt, shapeKey, tileRects } from './layout.js';
import { badgeFor } from './dock.js';
import { groundShares } from '../guest/manifest-settings.js';
import { learn } from './icon.js';
import { IS_WINDOWS } from './platform.js';

// The parts the strip's layout control flips, and what a window shows before anyone has chosen:
// the editor's own defaults, once the chrome seam has had its say on the secondary side bar.
const LAYOUT_PARTS = ['sideBar', 'panel', 'secondarySideBar'];
const LAYOUT_DEFAULTS = { sideBar: true, panel: false, secondarySideBar: false };

// How often the cursor is read while a tile is being dragged. A gesture bounded by a press being
// held is a hand followed at 33Hz, not a loop waiting for the workbench to agree with itself.
const DRAG_MS = 30;

// The one place that turns "what is open, in what order, focused where" into views on screen and
// a picture for the shell. Everything else asks it to render; nothing else places a view.
export class Desk {
  #window;
  #projects;
  #tiles;
  #activity;
  #preferences;
  #ground = null;
  // null is "nobody has chosen for this part yet", which leaves every window the layout it
  // remembers. Not persisted: a fresh launch follows the windows rather than the last session.
  #layout = { sideBar: null, panel: null, secondarySideBar: null };
  #parts = new Map();
  // What the dock is currently saying, so it is only ever written when the answer changes.
  #badge = null;
  // A rearrangement in progress: which window's grip is held, and the order to put back if the
  // gesture is abandoned. Nothing about it is persisted - it lives and dies with the press.
  #drag = null;

  constructor({ window, projects, tiles, activity = null, preferences = null }) {
    this.#window = window;
    this.#projects = projects;
    this.#tiles = tiles;
    this.#activity = activity;
    this.#preferences = preferences;
  }

  get projects() {
    return this.#projects;
  }

  render() {
    const { open, focused, mode, master, shape, sizes, rects } = this.#placement();
    const projects = this.#projects.all();

    // Whether a window is one of SEVERAL tiles, which is what both of the app's own controls
    // inside it hang on: the item that widens this one, and the grip that moves it among the
    // rest. Single view, or a lone project, has neither to offer.
    const tiled = mode !== 'single' && open.length > 1;
    // Which of the two dials this window is on is answered HERE, so a window is handed the one
    // rung that applies to it and never the preference itself.
    const levels = this.#preferences?.levels || {};

    this.#tiles.sync(
      open.map((project) => ({
        ...project,
        focused: project.folder === focused,
        tint: project.folder === focused ? levels.focused : levels.quiet,
        tiled,
        maximized: mode === 'master' && project.folder === master,
        layout: this.#layout,
      })),
      rects,
    );
    this.#send({
      ground: this.#ground,
      parts: this.#shownParts(focused),
      mode: this.#projects.mode,
      // What each tile's ground is worth, from the seam that owns the rungs: the shell paints a
      // tile's rect before that tile has a window, and both have to arrive at one colour.
      grounds: groundShares(levels),
      strip: METRICS.strip,
      gap: METRICS.gap,
      focused,
      projects,
      rects,
      splitters: gridSplitters({ ...shape, sizes }),
    });
    this.#dock(badgeFor(projects));
  }

  // A folder that has never been here has no favicon read yet, so it draws on its path's hue and
  // is drawn again once the decoder has had it. One extra render per new project, never a loop:
  // `learn` answers a folder once and says whether it found anything to change.
  #learn() {
    learn(this.#projects.all().map((project) => project.folder))
      .then((learned) => { if (learned) this.render(); })
      .catch((error) => console.error('[icon] sampling failed:', error.message));
  }

  // The one part of the Claude signal that reaches you with the app behind something else. Set on
  // CHANGE only: a gutter drag renders sixty times a second, and a taskbar is not something to
  // write to sixty times a second.
  //
  // macOS takes a string and Linux a count; Windows has neither, and its own idiom for "this
  // window wants you" is the taskbar button flashing, which stops as soon as you look at it.
  #dock(badge) {
    if (badge === this.#badge) return;
    this.#badge = badge;
    if (IS_WINDOWS) this.#window.flashFrame(Boolean(badge));
    else if (app.dock) app.dock.setBadge(badge);
    else app.setBadgeCount(badge ? Number(badge) : 0);
  }

  // Where every tile is, and the few facts the answer is made of. One place, because the drag
  // below hit-tests against the same rects the views were placed from - a second copy of this
  // arithmetic is a drop that lands somewhere the eye never saw.
  #placement() {
    const open = this.#projects.open();
    const focused = this.#projects.focused;
    const master = this.#projects.maximized;
    const [width, height] = this.#window.getContentSize();
    const mode = this.#shape(open.length);
    const shape = { width, height, count: open.length, mode };
    const sizes = this.#sizes(open.length);
    return {
      open,
      focused,
      mode,
      master,
      shape,
      sizes,
      rects: tileRects({
        ...shape,
        sizes,
        focusedIndex: Math.max(0, open.findIndex((project) => project.folder === focused)),
        masterIndex: Math.max(0, open.findIndex((project) => project.folder === master)),
      }),
    };
  }

  // Reported by the ground seam, from whichever window last read its theme. One server means one
  // theme, so any window's answer is every window's answer.
  setGround(ground) {
    if (ground === this.#ground) return;
    this.#ground = ground;
    this.render();
  }

  // The layout control: one part, every window, whether it is on screen or not.
  setLayout(part, visible) {
    if (!LAYOUT_PARTS.includes(part)) return;
    this.#layout = { ...this.#layout, [part]: Boolean(visible) };
    this.render();
  }

  // A window saying what its own parts are doing, on change only. It is what the buttons show, so
  // a Cmd+B pressed inside a tile moves them rather than leaving them stale.
  reportParts(folder, parts) {
    this.#parts.set(folder, parts);
    if (folder === this.#projects.focused) this.render();
  }

  #shownParts(focused) {
    const reported = this.#parts.get(focused);
    return Object.fromEntries(LAYOUT_PARTS.map((part) =>
      [part, reported?.[part] ?? this.#layout[part] ?? LAYOUT_DEFAULTS[part]]));
  }

  focus(folder) {
    this.#projects.focused = folder;
    // Landing on a project is what clears a turn that finished while you were elsewhere. Both
    // ways in say so, because a click into a window is as much an answer as the strip is.
    this.#activity?.seen(folder);
    this.render();
    this.#tiles.focus(folder);
  }

  // A click inside a window. The native focus is already there, so only the app's own idea of it
  // has to catch up - focusing the view back would be a loop.
  adoptFocus(folder) {
    // A press in another window could not have happened while a grip was still held in this one,
    // so it is also the answer to a drag whose release was never reported.
    this.endDrag(false);
    if (folder === this.#projects.focused) return;
    this.#projects.focused = folder;
    this.#activity?.seen(folder);
    this.render();
  }

  focusByIndex(index) {
    const open = this.#projects.open();
    if (index >= 0 && index < open.length) this.focus(open[index].folder);
  }

  // The maximized grid moves the COLUMN too, because a stacked tile is 30% wide and focus alone
  // would hand you a project you cannot work in. A click into one still moves only the focus.
  cycle(step) {
    const open = this.#projects.open();
    if (open.length < 2) return;
    const current = open.findIndex((project) => project.folder === this.#projects.focused);
    const next = open[(current + step + open.length) % open.length].folder;
    if (this.#shape(open.length) === 'master') this.#projects.maximized = next;
    this.focus(next);
  }

  // The folder dialog, which is how a folder that has never been open here gets in. The picker
  // is the other way, and it offers this as its last row.
  async browse() {
    const picked = await dialog.showOpenDialog(this.#window, {
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open project',
    });
    if (picked.canceled || !picked.filePaths.length) return;
    this.open(picked.filePaths[0]);
  }

  open(folder) {
    this.#projects.add(folder);
    this.render();
    this.#learn();
  }

  // A window that re-pointed itself, reported by the view that did it. Taking the move is the
  // list's call; what is here is that the view has to be re-keyed BEFORE anything renders, or the
  // sync that follows destroys the very window that navigated and opens a fresh one beside it.
  follow(from, to) {
    const { folder, moved } = this.#projects.rebind(from, to);
    if (moved) {
      this.#tiles.rekey(from, folder);
      // What the window last said its parts were doing belonged to the workbench it just left. It
      // says so again as it boots, and holding the old answer would put it on the buttons the day
      // that folder is opened again.
      this.#parts.delete(from);
      this.render();
      this.#learn();
      return;
    }
    // Refused, so the tile goes back to the folder it holds. Where the refusal was another window
    // already standing on that folder, the focus goes there: it is still what was asked for, and
    // that is where it is open.
    const open = this.#projects.open();
    this.#tiles.reload(open.find((project) => project.folder === from));
    if (open.some((project) => project.folder === folder)) this.focus(folder);
  }

  close(folder) {
    this.#projects.close(folder);
    this.#parts.delete(folder);
    this.render();
  }

  closeFocused() {
    const focused = this.#projects.focused;
    if (focused) this.close(focused);
  }

  // Devtools in a window of their own. Docked, they are part of the PAGE, and every tile is a
  // native view painted above it - so the pane opens under the grid and there is no size to give
  // it: main lays the tiles out from the window's content area, which docking does not change.
  // The focused project's window is the usual target, since that is where a seam runs.
  inspect(scope) {
    const contents = scope === 'shell'
      ? this.#window.webContents
      // With no project open the shell is the only thing on screen, so it is the honest target.
      : this.#tiles.contentsFor(this.#projects.focused) || this.#window.webContents;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: 'detach' });
  }

  reloadShell() {
    this.#window.webContents.reload();
  }

  // Every window at once rather than the one you are in: the tiles are the app's text, and one
  // tile larger than the rest is a thing nobody asked for.
  zoom(step) {
    this.#tiles.zoom(step);
  }

  setMode(mode) {
    this.#projects.mode = mode;
    this.render();
  }

  // The maximize item inside a window: this project takes the master cell, or - on the one that
  // already holds it - the even grid comes back. The item sends what it will DO rather than what
  // it is, so the window's own state is the only copy of it.
  //
  // The focus is not touched. The press that reached the item already claimed it through the
  // `focus` seam, and a click anywhere else in a stacked window claims it too WITHOUT moving the
  // column - which is the difference between saying where you are and saying what is wide.
  maximize(folder, maximized) {
    this.#projects.maximized = maximized ? folder : null;
    this.render();
  }

  // A tile picked up by its grip. The press can only have happened INSIDE a window - a view
  // swallows every event in its own rect and the shell's page never sees one - so the seam says
  // that the gesture began and nothing more. The pointer is followed here, read off the OS rather
  // than reported by a window: every number then stays in the space the rects are already in, and
  // a zoomed tile has nothing to scale.
  startDrag(folder) {
    this.endDrag(false);
    if (!this.#projects.open().some((project) => project.folder === folder)) return;
    this.#drag = {
      folder,
      order: this.#projects.open().map((project) => project.folder),
      master: this.#projects.maximized,
      timer: setInterval(() => this.#dragTick(), DRAG_MS),
    };
  }

  // Released, or abandoned with Esc. A release applies nothing: the grid has been rearranging
  // under the hand the whole way, which is the only drop feedback a tree that may not draw over a
  // tile can give. Abandoning is the one that has work to do.
  endDrag(cancel) {
    if (!this.#drag) return;
    const { order, master } = this.#drag;
    clearInterval(this.#drag.timer);
    this.#drag = null;
    if (!cancel) return;
    this.#projects.maximized = master;
    this.#projects.restore(order);
    this.render();
  }

  #dragTick() {
    const held = this.#drag.folder;
    const { open, master, rects } = this.#placement();
    // The two ways a gesture ends with nobody left to report the release: the project closing
    // under it, and the window that took the press no longer being the app's.
    if (!this.#window.isFocused() || !open.some((project) => project.folder === held)) {
      return void this.endDrag(false);
    }

    const cursor = screen.getCursorScreenPoint();
    const bounds = this.#window.getContentBounds();
    const over = open[rectAt(rects, cursor.x - bounds.x, cursor.y - bounds.y)]?.folder;
    if (!over || over === held) return;

    // The wide column is a slot like any other: the two trade slots, and whichever of them lands
    // in the master's holds it - so a tile dropped on the master promotes itself and demotes the
    // one that was there into the row it came from.
    if (master === over) this.#projects.maximized = held;
    else if (master === held) this.#projects.maximized = over;
    this.#projects.swap(held, over);
    this.render();
  }

  // A gutter dragged. The shell reports the pointer; the geometry is still decided in one place.
  resizeGrid({ axis, index, position }) {
    const count = this.#projects.open().length;
    const [width, height] = this.#window.getContentSize();
    this.#remember(count, gridResize({
      width, height, count, mode: this.#shape(count), sizes: this.#sizes(count), axis, index, position,
    }));
    this.render();
  }

  // Back to the shape's own split - equal shares, or the master's own: one axis for a
  // double-click on its gutter, both for the menu item.
  resetGrid(axis) {
    const count = this.#projects.open().length;
    const kept = axis
      ? Object.fromEntries(Object.entries(this.#sizes(count)).filter(([key]) => key !== axis))
      : {};
    this.#remember(count, kept);
    this.render();
  }

  // Which shape the grid is in. Maximized is the grid wearing another set of tracks rather than
  // a third view: the strip's control still says grid, and single view keeps the maximized grid
  // waiting behind it.
  #shape(count) {
    const mode = this.#projects.mode;
    return mode === 'grid' && this.#projects.maximized && count > 1 ? 'master' : mode;
  }

  #sizes(count) {
    return this.#projects.sizes[shapeKey(count, this.#shape(count))] || {};
  }

  // Against the grid's shape, so closing one of four projects lands back on the proportions the
  // 2x2 already had. A shape back at equal shares keeps no entry at all.
  #remember(count, sizes) {
    const key = shapeKey(count, this.#shape(count));
    const all = { ...this.#projects.sizes };
    if (Object.keys(sizes).length) all[key] = sizes;
    else delete all[key];
    this.#projects.sizes = all;
  }

  #send(state) {
    if (this.#window.isDestroyed()) return;
    this.#window.webContents.send('ct:event', { type: 'state', payload: state });
  }
}
