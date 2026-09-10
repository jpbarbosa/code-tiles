import { fitPanel, panelWindow } from './panel.js';
import { files } from './paths.js';

// The usage panel is an OS window rather than a panel in the shell page: a WebContentsView paints
// above that page, so anything hanging below the strip would be drawn behind the tiles. One at a
// time, anchored under the widget that opened it, and it dies with the window it belongs to.
const WIDTH = 272;

export class UsagePopover {
  #parent;
  #window = null;
  #shown = null;
  #pinned = false;

  constructor({ parent }) {
    this.#parent = parent;
  }

  // The anchor is the widget's own box, from the only page that knows it.
  toggle(anchor) {
    if (this.#window) return this.close();

    const bounds = this.#parent.getContentBounds();
    this.#window = panelWindow({
      parent: this.#parent,
      page: files.usagePage,
      x: Math.round(bounds.x + anchor.right - WIDTH),
      y: Math.round(bounds.y + anchor.bottom + 6),
      width: WIDTH,
      height: 140,
      frame: false,
      resizable: false,
      movable: false,
    });
    this.#shown = new Promise((resolve) => this.#window.once('show', resolve));
    // Leaving for the browser and coming back with a code is part of signing in, so a pinned
    // panel outlives that blur. Every other blur dismisses it.
    this.#window.on('blur', () => { if (!this.#pinned) this.close(); });
    this.#window.on('closed', () => { this.#window = null; this.#shown = null; this.#pinned = false; });
  }

  fit(height) {
    fitPanel(this.#window, WIDTH, height);
  }

  pin() {
    this.#pinned = true;
  }

  // Showing the panel takes the foreground, so whatever hands it to another app - the consent
  // page - waits for this, or a panel appearing late pulls the app back over the browser.
  shown() {
    return this.#shown;
  }

  close() {
    this.#window?.close();
  }
}
