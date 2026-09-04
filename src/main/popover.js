import { BrowserWindow } from 'electron';

import { files } from './paths.js';

// The usage panel is an OS window rather than a panel in the shell page: a WebContentsView paints
// above that page, so anything hanging below the strip would be drawn behind the tiles. One at a
// time, anchored under the widget that opened it, and it dies with the window it belongs to.
const WIDTH = 272;

export class UsagePopover {
  #parent;
  #window = null;
  #pinned = false;

  constructor({ parent }) {
    this.#parent = parent;
  }

  // The anchor is the widget's own box, from the only page that knows it.
  toggle(anchor) {
    if (this.#window) return this.close();

    const bounds = this.#parent.getContentBounds();
    this.#window = new BrowserWindow({
      parent: this.#parent,
      x: Math.round(bounds.x + anchor.right - WIDTH),
      y: Math.round(bounds.y + anchor.bottom + 6),
      width: WIDTH,
      height: 140,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#232325',
      webPreferences: { preload: files.shellPreload, contextIsolation: true, sandbox: true },
    });

    this.#window.loadFile(files.usagePage);
    this.#window.once('ready-to-show', () => this.#window?.show());
    // Leaving for the browser and coming back with a code is part of signing in, so a pinned
    // panel outlives that blur. Every other blur dismisses it.
    this.#window.on('blur', () => { if (!this.#pinned) this.close(); });
    this.#window.on('closed', () => { this.#window = null; this.#pinned = false; });
  }

  // The page says how tall it turned out. Nothing here counts readings and guesses.
  fit(height) {
    this.#window?.setContentSize(WIDTH, Math.max(1, Math.round(height)));
  }

  pin() {
    this.#pinned = true;
  }

  close() {
    this.#window?.close();
  }
}
