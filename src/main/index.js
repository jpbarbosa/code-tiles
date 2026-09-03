import fs from 'node:fs';
import { app, dialog } from 'electron';

import { CodeServer } from './server.js';
import { Desk } from './desk.js';
import { Projects } from './projects.js';
import { Store } from './store.js';
import { Tiles } from './tiles.js';
import { createWindow } from './window.js';
import { installIpc } from './ipc.js';
import { installMenu } from './menu.js';
import { resolveCodeServer, userPaths } from './paths.js';
import { writeSettings } from '../guest/disk/settings.js';

if (!app.requestSingleInstanceLock()) app.quit();

let server = null;

app.whenReady().then(async () => {
  const paths = userPaths();
  fs.mkdirSync(paths.serverData, { recursive: true });

  const bin = resolveCodeServer();
  if (!bin) {
    dialog.showErrorBox('No code-server', 'Run npm run fetch-code-server, or put code-server on PATH.');
    app.quit();
    return;
  }

  // Seam settings go in before the server reads them, so the first window a tile ever shows is
  // already the shape the product wants. Written every start: the manifest is the source.
  writeSettings(paths.serverData);

  const store = new Store(paths.state);
  const projects = new Projects(store);

  server = new CodeServer({ bin, paths });
  store.update({ serverPort: await server.start(store.state.serverPort) });

  const window = createWindow();
  const tiles = new Tiles({ window, server });
  const desk = new Desk({ window, projects, tiles });

  installIpc({ desk });
  installMenu(desk);

  window.webContents.on('did-finish-load', () => desk.render());
  for (const event of ['resize', 'enter-full-screen', 'leave-full-screen']) {
    window.on(event, () => desk.render());
  }
  window.on('closed', () => app.quit());

  // Development only. scripts/dev-probe.js is not part of the app and is never loaded without it.
  if (process.env.CT_PROBE) (await import('../../scripts/dev-probe.js')).run({ window });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => server?.stop());
process.on('exit', () => server?.stop());
