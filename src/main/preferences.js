import { fitPanel, panelCorners, panelWindow } from './panel.js';
import { files } from './paths.js';
import { corners as shapes, rungNames } from '../guest/manifest-settings.js';

// The app's preferences: how much of its own colour a window wears, on the tile you are in and on
// the tiles you are not, and the shape of every corner it draws. Both are NAMES here - what one is
// worth is the guest's business - read from there, so a rung or a shape this app offers is one a
// window can actually wear.
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
    panelCorners(this.corners);
  }

  // Clamped on the way out rather than on the way in: a rung that is no longer a rung, from a
  // state file written by an older build or edited by hand, is one window at `medium` instead of
  // a window with no tint at all.
  get levels() {
    const stored = this.#store.state.tint || {};
    return Object.fromEntries(DIALS.map((dial) =>
      [dial, RUNGS.includes(stored[dial]) ? stored[dial] : DEFAULT]));
  }

  // Clamped on the way out the same way, by the one module that knows the shapes.
  get corners() {
    return shapes.shapeOf(this.#store.state.corners);
  }

  // What the page is shown and handed back: both dials, the corners, and what those are worth to
  // it - its own corners follow at once, while every other window hears it from the desk.
  get state() {
    return { ...this.levels, corners: this.corners, cornerValues: shapes.cornerValues(this.corners) };
  }

  set(dial, value) {
    if (dial === 'corners' && shapes.SHAPES.includes(value)) {
      this.#store.update({ corners: value });
      panelCorners(value);
    } else if (DIALS.includes(dial) && RUNGS.includes(value)) {
      this.#store.update({ tint: { ...this.levels, [dial]: value } });
    }
    return this.state;
  }

  open() {
    if (this.#window) return this.#window.focus();

    this.#window = panelWindow({
      parent: this.#parent,
      page: files.preferencesPage,
      // The size the page turns out to be, so nothing resizes under the eye on open; `fit` below
      // is the correction, not the measurement.
      useContentSize: true,
      width: WIDTH,
      height: 455,
      title: 'Preferences',
      resizable: false,
    });
    this.#window.on('closed', () => { this.#window = null; });
  }

  fit(height) {
    fitPanel(this.#window, WIDTH, height);
  }
}
