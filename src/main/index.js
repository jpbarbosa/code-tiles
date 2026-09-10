import fs from 'node:fs';
import { app, dialog, nativeTheme, session } from 'electron';

import { Activity } from './activity.js';
import { hooksWriteInto } from './activity-hooks.js';
import { CodeServer } from './server.js';
import { Desk } from './desk.js';
import { Extensions } from './extensions.js';
import { ProfileMirror } from './profiles.js';
import { Projects } from './projects.js';
import { learn } from './icon.js';
import { Store } from './store.js';
import { Tiles } from './tiles.js';
import { Usage } from './usage.js';
import { Picker } from './picker.js';
import { Preferences } from './preferences.js';
import { ClaudeEvents } from './events.js';
import { UsagePopover } from './popover.js';
import { createWindow } from './window.js';
import { installIpc } from './ipc.js';
import { installMenu } from './menu.js';
import { readDesktop } from './desktop.js';
import { seedProfileRegistry } from './registry.js';
import { PARTITION, claudePaths, desktopPaths, resolveCodeServer, userPaths } from './paths.js';
import { patchExtensions } from '../guest/disk/extension.js';
import { patchServer } from '../guest/disk/patch.js';
import { writeKeybindings } from '../guest/disk/keybindings.js';
import { writeSettings } from '../guest/disk/settings.js';
import { MOD_KEY } from './platform.js';

if (!app.requestSingleInstanceLock()) app.quit();

let server = null;
let mirror = null;
let usage = null;
let activity = null;
let window = null;

// Everything that means "open the app" once it is up, and the window is what all of it wants.
function raise() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  // Cmd+H hides the APP, which no call on one of its windows undoes.
  window.show();
}

// A Dock or Spotlight launch of a running app starts no process, so this is the ONLY event it
// fires - and with nothing listening, a click on an app whose window has not been made yet does
// nothing at all.
app.on('activate', raise);

// The other half of the lock: the second process has already quit above, and this is the running
// app being told it tried. Only a genuinely new process lands here (`open -n`, the binary, `npm
// start` beside the installed app), which the OS does not bring forward on its own.
app.on('second-instance', () => {
  raise();
  app.focus({ steal: true });
});

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
  extensions.graft(desktop.builds);

  // Seam settings go in before the server reads them, so the first window a tile ever shows is
  // already the shape the product wants. Written every start: the manifest is the source. The
  // mirror writes the same seams into each profile, which does not inherit this file.
  writeSettings(paths.settings);
  // The same idea for the chords the app needs back: a tile on no mirrored profile reads this one.
  writeKeybindings(paths.keybindings, MOD_KEY);
  // The rarer half of the same idea: what a seam needs the server's own bundle to do. Before the
  // spawn, so no window ever loads the unpatched one.
  const patched = patchServer(bin);
  if (patched.length) {
    console.log(`[patch] ${patched.join(', ')}`);
    // The bundle is served for a year under a URL keyed on the server's COMMIT, not on its
    // contents, so a window that already holds it would go on running the unpatched one. The
    // HTTP cache only: the login and every window's layout live in this partition's storage.
    await session.fromPartition(PARTITION).clearCache();
  }
  // The same door, on an extension's own bundle rather than the server's: what an extension does
  // inside a window and offers no way into. Applied here because the extension host reads these
  // files as a window loads, and nothing re-reads them until one does.
  const rewritten = patchExtensions(paths.extensions);
  if (rewritten.length) console.log(`[extension] ${rewritten.join(', ')}`);

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

  // What Claude is doing in each project, from its own hooks. A project asks for its state the
  // way it asks for its hue - derived, never stored - and a marker landing on disk re-renders the
  // desk, which is what carries a new state into the window that has to draw it.
  // Whether this instance owns the hooks. A second one running beside your installed app is
  // started with this off, because the file they are written to is the one thing a separate
  // --user-data-dir does not give it a copy of - see scripts/start.js.
  const ownsHooks = process.env.CODE_TILES_HOOKS !== '0';
  const claudeSettings = claudePaths().settings;
  activity = new Activity({
    // A guest watches the OWNER's markers rather than its own directory, which nothing writes
    // to: one hook script serves every instance on the machine, wherever it was installed from.
    dir: (ownsHooks ? null : hooksWriteInto(claudeSettings)) || paths.activity,
    script: paths.activityHook,
    settings: ownsHooks ? claudeSettings : null,
    // The log gets the conclusion, not the markers: what a project's badge is about to draw is
    // the same thing the tab icon is supposed to agree with, and disagreement is what it is for.
    onChange: () => {
      for (const project of projects.open()) events.note('hook', project.folder, project.claudeState);
      desk.render();
    },
  });

  // The favicons, decoded before the first render rather than after it: a project whose hue
  // arrives late would draw once on its path's hash and again in its own colour.
  await learn(store.state.entries.map((entry) => entry.folder));

  const projects = new Projects(store, { profileFor, claudeStates: (folders) => activity.states(folders) });
  window = createWindow();
  const tiles = new Tiles({ window, server, onFollow: (from, to) => desk.follow(from, to) });
  const preferences = new Preferences({ store, parent: window });
  const desk = new Desk({ window, projects, tiles, activity, preferences });
  const events = new ClaudeEvents({ parent: window });
  activity.start();

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

  const commands = installIpc({
    desk,
    usage,
    preferences,
    popover: new UsagePopover({ parent: window }),
    picker: new Picker({ parent: window }),
    events,
  });
  installMenu({ desk, preferences, pick: commands['project:pick'], events });

  window.webContents.on('did-finish-load', () => desk.render());
  for (const event of ['resize', 'enter-full-screen', 'leave-full-screen']) {
    window.on(event, () => desk.render());
  }
  // The app IS this window, so it dies with it.
  window.on('closed', () => app.quit());

  // Development only. scripts/dev-probe.js is not part of the app and is never loaded without it.
  if (process.env.CT_PROBE) (await import('../../scripts/dev-probe.js')).run({ window });
}).catch((error) => {
  // The window is the last thing startup makes, so a throw before it leaves a live process with
  // nothing to raise: a Dock icon reading "Running in Background" that answers no click, ever.
  dialog.showErrorBox('Code Tiles failed to start', error?.stack ?? String(error));
  app.quit();
});

// Subscribed on purpose, and on purpose does nothing. Electron quits when the last window
// closes unless something is listening, and the registry seed opens a throwaway window on the
// server's origin before the real one exists - closing it would end the app mid-startup. The
// window that matters quits on its own `closed`.
app.on('window-all-closed', () => {});

app.on('before-quit', () => { usage?.stop(); activity?.stop(); mirror?.stop(); server?.stop(); });
process.on('exit', () => server?.stop());
