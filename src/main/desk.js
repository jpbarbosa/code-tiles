import { dialog } from 'electron';

import { METRICS, tileRects } from './layout.js';

// The one place that turns "what is open, in what order, focused where" into views on screen and
// a picture for the shell. Everything else asks it to render; nothing else places a view.
export class Desk {
  #window;
  #projects;
  #tiles;
  #ground = null;

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

    const rects = tileRects({
      width,
      height,
      count: open.length,
      mode: this.#projects.mode,
      focusedIndex,
    });

    this.#tiles.sync(open.map((project) => ({ ...project, focused: project.folder === focused })), rects);
    this.#send({
      ground: this.#ground,
      mode: this.#projects.mode,
      strip: METRICS.strip,
      gap: METRICS.gap,
      focused,
      projects: this.#projects.all(),
      rects,
    });
  }

  // Reported by the ground seam, from whichever window last read its theme. One server means one
  // theme, so any window's answer is every window's answer.
  setGround(ground) {
    if (ground === this.#ground) return;
    this.#ground = ground;
    this.render();
  }

  focus(folder) {
    this.#projects.focused = folder;
    this.render();
    this.#tiles.focus(folder);
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

  #send(state) {
    if (this.#window.isDestroyed()) return;
    this.#window.webContents.send('ct:event', { type: 'state', payload: state });
  }
}
