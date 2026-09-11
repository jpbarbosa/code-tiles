import { BrowserWindow, app, systemPreferences } from 'electron';

import { corners } from '../guest/manifest-settings.js';
import { hourCycleFor } from './clock.js';
import { files } from './paths.js';
import { IS_MAC } from './platform.js';

// The app draws four windows besides the one holding the tiles - the usage panel, the picker,
// preferences and the Claude Events log - and every one of them is a window for the same reason:
// a WebContentsView paints above the shell page, so anything drawn there would sit behind the
// tiles it is about. What they have in common is here; what makes each one itself is not.
//
// The colour is `--panel` in src/shell/panel.css, which is what the pages paint themselves: the
// frame the OS shows before the first paint is then the panel rather than a white flash on the
// way to one. Two processes, so it is spelled twice; those are the only two.
export const PANEL_GROUND = '#232325';

// Read as each panel opens, so a clock changed in System Settings reaches the next one. macOS
// keeps an explicit 12/24-hour choice apart from the region; elsewhere the locale is all there is.
export function systemHourCycle() {
  const chosen = (key) => IS_MAC && systemPreferences.getUserDefault(key, 'boolean');
  return hourCycleFor({
    force24: chosen('AppleICUForce24HourTime'),
    force12: chosen('AppleICUForce12HourTime'),
    systemLocale: app.getSystemLocale(),
  });
}

// The Corners preference every panel opens with, as launch arguments so its first paint has it. A
// window's arguments are fixed once it exists, so Preferences says here whenever the shape moves.
let cornerArguments = corners.launchArguments();

export function panelCorners(shape) {
  cornerArguments = corners.launchArguments(shape);
}

export function panelWindow({ parent, page, ...options }) {
  const window = new BrowserWindow({
    parent,
    show: false,
    // None of the four is a window you manage: they are opened, read and dismissed.
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: PANEL_GROUND,
    webPreferences: {
      preload: files.shellPreload,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [`--ct-hour-cycle=${systemHourCycle()}`, ...cornerArguments],
    },
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
