import { METRICS } from './layout.js';
import { panelWindow } from './panel.js';
import { files } from './paths.js';

// The picker is an OS window for the same reason the usage panel is one: a WebContentsView paints
// above the shell page, so a screen drawn there would sit behind the tiles it is meant to cover.
//
// It takes the whole STAGE rather than a box under the + that opened it. The scrim is what makes
// a list of paths readable over four live editors, and it is also the click target that dismisses
// the thing. The strip is left uncovered, so the traffic lights and the + still work.
export class Picker {
  #parent;
  #window = null;
  #follow = null;

  constructor({ parent }) {
    this.#parent = parent;
  }

  toggle() {
    if (this.#window) return this.close();

    this.#window = panelWindow({
      ...this.#stage(),
      parent: this.#parent,
      page: files.pickerPage,
      frame: false,
      // The page paints its own scrim, so the window itself carries no colour and no shadow: an
      // opaque one would be a grey slab over the grid, and a shadow would ring the whole stage.
      transparent: true,
      hasShadow: false,
      // A cover, not a card: macOS rounds a frameless window's corners by default, and the top two
      // land in the middle of the stage - two wedges of tile the scrim then cannot reach. Square
      // here, and the page puts the BOTTOM pair back, where they coincide with the parent's own.
      roundedCorners: false,
      resizable: false,
      movable: false,
      // The one panel that carries no ground of its own, because it covers live tiles.
      backgroundColor: '#00000000',
    });
    this.publish();

    // It covers the stage, so it goes where the stage goes. Deliberately NOT dismissed on blur,
    // unlike the usage panel: the + that opened it is still live under a picker that covers only
    // the stage, and a blur-close would fire on the press that reaches it - so the click that
    // should shut the picker would shut it and open it again in the same gesture.
    this.#follow = () => this.#window?.setBounds(this.#stage());
    this.#parent.on('resize', this.#follow);
    this.#parent.on('move', this.#follow);

    this.#window.on('closed', () => {
      this.#parent.off('resize', this.#follow);
      this.#parent.off('move', this.#follow);
      this.#window = null;
      this.#follow = null;
      this.publish();
    });
  }

  close() {
    this.#window?.close();
  }

  // The strip is not covered by this window - the traffic lights have to stay reachable - so the
  // shell dims that row itself, and needs telling. Said again on the shell's own `state` call, so
  // a reloaded page comes back to the screen that is actually up.
  publish() {
    if (this.#parent.isDestroyed()) return;
    this.#parent.webContents.send('ct:event', { type: 'picker', payload: { open: Boolean(this.#window) } });
  }

  #stage() {
    const { x, y, width, height } = this.#parent.getContentBounds();
    return { x, y: y + METRICS.strip, width, height: Math.max(1, height - METRICS.strip) };
  }
}
