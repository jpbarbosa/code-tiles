import { BrowserWindow } from 'electron';

import { files } from './paths.js';
import { METRICS } from './layout.js';

export function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // The strip IS the title bar: the traffic lights sit in it, on the same line as everything
    // else, which is why it is 36px and why nothing else may claim that row.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 13, y: (METRICS.strip - 14) / 2 },
    backgroundColor: '#1b1b1d',
    webPreferences: {
      preload: files.shellPreload,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.loadFile(files.shellPage);
  window.once('ready-to-show', () => window.show());
  return window;
}
