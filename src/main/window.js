import { BrowserWindow } from 'electron';

import { corners } from '../guest/manifest-settings.js';
import { files } from './paths.js';
import { METRICS } from './layout.js';
import { IS_MAC } from './platform.js';

// The dark theme's own titleBar.activeBackground, so the window behind the tiles matches the
// ground a window reports the moment it has one and nothing steps in between.
const GROUND = '#191a1b';

// The strip IS the title bar, so the window's own controls are drawn INTO it: macOS lays its
// traffic lights over the left, and the other two draw a caption overlay on the right.
const chrome = IS_MAC
  ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 13, y: (METRICS.strip - 14) / 2 } }
  : { titleBarStyle: 'hidden', titleBarOverlay: { color: GROUND, symbolColor: '#c9ccce', height: METRICS.strip } };

export function createWindow({ cornerShape } = {}) {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...chrome,
    backgroundColor: GROUND,
    webPreferences: {
      preload: files.shellPreload,
      contextIsolation: true,
      sandbox: true,
      // The Corners preference for the first paint; the state the desk sends keeps it live.
      additionalArguments: corners.launchArguments(cornerShape),
    },
  });

  window.loadFile(files.shellPage);
  window.once('ready-to-show', () => window.show());
  return window;
}
