import fs from 'node:fs';
import { app, dialog, nativeTheme } from 'electron';

import { CodeServer } from './server.js';
import { Desk } from './desk.js';
import { Extensions } from './extensions.js';
import { ProfileMirror } from './profiles.js';
import { Projects } from './projects.js';
import { Store } from './store.js';
import { Tiles } from './tiles.js';
import { Usage } from './usage.js';
import { UsagePopover } from './popover.js';
import { createWindow } from './window.js';
import { installIpc } from './ipc.js';
import { installMenu } from './menu.js';
import { readDesktop } from './desktop.js';
import { seedProfileRegistry } from './registry.js';
import { desktopPaths, resolveCodeServer, userPaths } from './paths.js';
import { writeSettings } from '../guest/disk/settings.js';

if (!app.requestSingleInstanceLock()) app.quit();

let server = null;
let mirror = null;
let usage = null;

app.whenReady().then(async () => {
  // The app's half of dark: the traffic lights, the file dialog and every guest's
  // prefers-color-scheme, none of which a setting inside the editor reaches. The editor's half
  // is the `dark` seam.
  nativeTheme.themeSource = 'dark';

  const paths = userPaths();
  fs.mkdirSync(paths.serverData, { recursive: true });

  const bin = resolveCodeServer();
  if (!bin) {
    dialog.showErrorBox('No code-server', 'Run npm run fetch-code-server, or put code-server on PATH.');
    app.quit();
    return;
  }

  // Everything the server reads off disk goes in before it is spawned: it scans the extensions
  // directory and the profile mirror as it boots, and will not see a late arrival until a
  // window reloads.
  const desktop = readDesktop(desktopPaths());
  const extensions = new Extensions({ bin, dir: paths.extensions, missCache: paths.missCache });
  await extensions.install(desktop.wantedIds);
  extensions.prune(desktop.wantedIds);

  // Seam settings go in before the server reads them, so the first window a tile ever shows is
  // already the shape the product wants. Written every start: the manifest is the source. The
  // mirror writes the same seams into each profile, which does not inherit this file.
  writeSettings(paths.settings);
  mirror = new ProfileMirror({ home: paths.profiles, profiles: desktop.profiles, extensions });
  mirror.write();

  const store = new Store(paths.state);
  server = new CodeServer({ bin, paths });
  store.update({ serverPort: await server.start(store.state.serverPort) });

  // Before the first tile, and after the server is up because the registry lives on its origin.
  // A tile whose URL names a profile the registry has not been seeded with renders blank rather
  // than falling back, so nothing may name one until this has returned - and if it throws, every
  // tile stays on the default profile instead of on a broken one.
  let profileFor = () => null;
  if (desktop.profiles.length) {
    try {
      const registered = await seedProfileRegistry({
        port: server.port, home: paths.profiles, profiles: desktop.profiles,
      });
      console.log(`[profiles] ${desktop.profiles.length} mirrored, ${registered} registered`);
      profileFor = desktop.profileFor;
      mirror.watch();
    } catch (error) {
      console.error('[profiles] registry seed failed, tiles run unprofiled:', error.message);
    }
  }

  const projects = new Projects(store, profileFor);
  const window = createWindow();
  const tiles = new Tiles({ window, server });
  const desk = new Desk({ window, projects, tiles });

  // Account-global, so it is the app's poll rather than one per tile, and it publishes on its
  // own channel: a reading every five minutes must not re-place the views.
  usage = new Usage({
    file: paths.usageToken,
    send: (state) => {
      if (window.isDestroyed()) return;
      window.webContents.send('ct:event', { type: 'usage', payload: state });
    },
  });
  usage.start();

  installIpc({ desk, usage, popover: new UsagePopover({ parent: window }) });
  installMenu(desk);

  window.webContents.on('did-finish-load', () => desk.render());
  for (const event of ['resize', 'enter-full-screen', 'leave-full-screen']) {
    window.on(event, () => desk.render());
  }
  // The app IS this window, so it dies with it.
  window.on('closed', () => app.quit());

  // Development only. scripts/dev-probe.js is not part of the app and is never loaded without it.
  if (process.env.CT_PROBE) (await import('../../scripts/dev-probe.js')).run({ window });
});

// Subscribed on purpose, and on purpose does nothing. Electron quits when the last window
// closes unless something is listening, and the registry seed opens a throwaway window on the
// server's origin before the real one exists - closing it would end the app mid-startup. The
// window that matters quits on its own `closed`.
app.on('window-all-closed', () => {});

app.on('before-quit', () => { usage?.stop(); mirror?.stop(); server?.stop(); });
process.on('exit', () => server?.stop());
