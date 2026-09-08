import { BrowserWindow } from 'electron';

import { files } from './paths.js';

// The app draws four windows besides the one holding the tiles - the usage panel, the picker,
// preferences and the Claude Events log - and every one of them is a window for the same reason:
// a WebContentsView paints above the shell page, so anything drawn there would sit behind the
// tiles it is about. What they have in common is here; what makes each one itself is not.
//
// The colour is `--panel` in src/shell/panel.css, which is what the pages paint themselves: the
// frame the OS shows before the first paint is then the panel rather than a white flash on the
// way to one. Two processes, so it is spelled twice; those are the only two.
export const PANEL_GROUND = '#232325';

export function panelWindow({ parent, page, ...options }) {
  const window = new BrowserWindow({
    parent,
    show: false,
    // None of the four is a window you manage: they are opened, read and dismissed.
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: PANEL_GROUND,
    webPreferences: { preload: files.shellPreload, contextIsolation: true, sandbox: true },
    ...options,
  });

  window.loadFile(page);
  // Shown only once it has something to show, which is what keeps an empty frame off the screen.
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
  return window;
}

// The page says how tall it turned out and the window takes it. Nothing on this side counts rows:
// a panel that measured its own content would be a second layout engine disagreeing with the one
// that already ran.
export function fitPanel(window, width, height) {
  window?.setContentSize(width, Math.max(1, Math.round(height)));
}
