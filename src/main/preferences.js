import { BrowserWindow } from 'electron';

import { files } from './paths.js';
import { rungNames } from '../guest/manifest-settings.js';

// The app's one preference: how much of its own colour a window wears, on the tile you are in and
// on the tiles you are not. Two dials, three rungs each, and the rungs are NAMES here - what a
// name is worth in a mix is the guest's business, which is the same split every other thing a
// window is told about itself is on. Read from there, so a rung this app offers is one a window
// can actually wear.
const RUNGS = rungNames();
const DIALS = ['focused', 'quiet'];
const DEFAULT = 'medium';
const WIDTH = 380;

// A window rather than a panel in the shell page, for the reason the usage panel and the picker
// are windows: a WebContentsView paints above that page, so anything drawn there would sit behind
// the tiles this one is about. It keeps its title bar, unlike those two - it is not a popover
// under a widget, it does not dismiss on blur (clicking a tile to see the dial's effect must not
// shut it), and a window that stays open needs the close button and the ⌘W the OS puts there.
export class Preferences {
  #store;
  #parent;
  #window = null;

  constructor({ store, parent }) {
    this.#store = store;
    this.#parent = parent;
  }

  // Clamped on the way out rather than on the way in: a rung that is no longer a rung, from a
  // state file written by an older build or edited by hand, is one window at `medium` instead of
  // a window with no tint at all.
  get levels() {
    const stored = this.#store.state.tint || {};
    return Object.fromEntries(DIALS.map((dial) =>
      [dial, RUNGS.includes(stored[dial]) ? stored[dial] : DEFAULT]));
  }

  set(dial, rung) {
    if (!DIALS.includes(dial) || !RUNGS.includes(rung)) return this.levels;
    this.#store.update({ tint: { ...this.levels, [dial]: rung } });
    return this.levels;
  }

  open() {
    if (this.#window) return this.#window.focus();

    this.#window = new BrowserWindow({
      parent: this.#parent,
      // The size the page turns out to be, so nothing resizes under the eye on open; `fit` below
      // is the correction, not the measurement.
      useContentSize: true,
      width: WIDTH,
      height: 331,
      show: false,
      title: 'Preferences',
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#232325',
      webPreferences: { preload: files.shellPreload, contextIsolation: true, sandbox: true },
    });

    this.#window.loadFile(files.preferencesPage);
    this.#window.once('ready-to-show', () => this.#window?.show());
    this.#window.on('closed', () => { this.#window = null; });
  }

  // The page says how tall it turned out, the way the usage panel does. Nothing here counts rows.
  fit(height) {
    this.#window?.setContentSize(WIDTH, Math.max(1, Math.round(height)));
  }
}
