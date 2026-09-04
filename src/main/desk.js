import { dialog } from 'electron';

import { METRICS, gridResize, gridSplitters, shapeKey, tileRects } from './layout.js';

// The parts the strip's layout control flips, and what a window shows before anyone has chosen:
// the editor's own defaults, once the chrome seam has had its say on the secondary side bar.
const LAYOUT_PARTS = ['sideBar', 'panel', 'secondarySideBar'];
const LAYOUT_DEFAULTS = { sideBar: true, panel: false, secondarySideBar: false };

// The one place that turns "what is open, in what order, focused where" into views on screen and
// a picture for the shell. Everything else asks it to render; nothing else places a view.
export class Desk {
  #window;
  #projects;
  #tiles;
  #ground = null;
  // null is "nobody has chosen for this part yet", which leaves every window the layout it
  // remembers. Not persisted: a fresh launch follows the windows rather than the last session.
  #layout = { sideBar: null, panel: null, secondarySideBar: null };
  #parts = new Map();

  constructor({ window, projects, tiles }) {
    this.#window = window;
    this.#projects = projects;
    this.#tiles = tiles;
  }

  get projects() {
    return this.#projects;
  }

  render() {
    const open = this.#projects.open();
    const focused = this.#projects.focused;
    const focusedIndex = Math.max(0, open.findIndex((project) => project.folder === focused));
    const [width, height] = this.#window.getContentSize();

    const shape = { width, height, count: open.length, mode: this.#projects.mode };
    const sizes = this.#sizes(open.length);
    const rects = tileRects({ ...shape, focusedIndex, sizes });

    this.#tiles.sync(
      open.map((project) => ({ ...project, focused: project.folder === focused, layout: this.#layout })),
      rects,
    );
    this.#send({
      ground: this.#ground,
      parts: this.#shownParts(focused),
      mode: this.#projects.mode,
      strip: METRICS.strip,
      gap: METRICS.gap,
      focused,
      projects: this.#projects.all(),
      rects,
      splitters: gridSplitters({ ...shape, sizes }),
    });
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
    this.render();
    this.#tiles.focus(folder);
  }

  // A click inside a window. The native focus is already there, so only the app's own idea of it
  // has to catch up - focusing the view back would be a loop.
  adoptFocus(folder) {
    if (folder === this.#projects.focused) return;
    this.#projects.focused = folder;
    this.render();
  }

  focusByIndex(index) {
    const open = this.#projects.open();
    if (index >= 0 && index < open.length) this.focus(open[index].folder);
  }

  cycle(step) {
    const open = this.#projects.open();
    if (open.length < 2) return;
    const current = open.findIndex((project) => project.folder === this.#projects.focused);
    const next = (current + step + open.length) % open.length;
    this.focus(open[next].folder);
  }

  async pick() {
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

  reloadShell() {
    this.#window.webContents.reload();
  }

  setMode(mode) {
    this.#projects.mode = mode;
    this.render();
  }

  // A gutter dragged. The shell reports the pointer; the geometry is still decided in one place.
  resizeGrid({ axis, index, position }) {
    const count = this.#projects.open().length;
    const [width, height] = this.#window.getContentSize();
    this.#remember(count, gridResize({
      width, height, count, sizes: this.#sizes(count), axis, index, position,
    }));
    this.render();
  }

  // Back to equal shares: one axis for a double-click on its gutter, both for the menu item.
  resetGrid(axis) {
    const count = this.#projects.open().length;
    const kept = axis
      ? Object.fromEntries(Object.entries(this.#sizes(count)).filter(([key]) => key !== axis))
      : {};
    this.#remember(count, kept);
    this.render();
  }

  #sizes(count) {
    return this.#projects.sizes[shapeKey(count)] || {};
  }

  // Against the grid's shape, so closing one of four projects lands back on the proportions the
  // 2x2 already had. A shape back at equal shares keeps no entry at all.
  #remember(count, sizes) {
    const all = { ...this.#projects.sizes };
    if (Object.keys(sizes).length) all[shapeKey(count)] = sizes;
    else delete all[shapeKey(count)];
    this.#projects.sizes = all;
  }

  #send(state) {
    if (this.#window.isDestroyed()) return;
    this.#window.webContents.send('ct:event', { type: 'state', payload: state });
  }
}
