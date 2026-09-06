import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const files = {
  shellPage: path.join(ROOT, 'src/shell/index.html'),
  usagePage: path.join(ROOT, 'src/shell/usage.html'),
  pickerPage: path.join(ROOT, 'src/shell/picker.html'),
  preferencesPage: path.join(ROOT, 'src/shell/preferences.html'),
  shellPreload: path.join(ROOT, 'src/shell/preload.cjs'),
  guestRuntime: path.join(ROOT, 'src/guest/runtime.cjs'),
};

// One session for every tile, which is what makes one GitHub login serve all of them. The
// profile registry lives in this partition too, so the seed has to be written into it.
export const PARTITION = 'persist:projects';

// Your own VS Code install. Read for the profiles it defines and never written to.
export function desktopPaths() {
  const home = os.homedir();
  return {
    user: path.join(home, 'Library/Application Support/Code/User'),
    extensions: path.join(home, '.vscode/extensions/extensions.json'),
  };
}

export function userPaths() {
  const base = app.getPath('userData');
  return {
    base,
    state: path.join(base, 'state.json'),
    serverData: path.join(base, 'server'),
    settings: path.join(base, 'server', 'User', 'settings.json'),
    keybindings: path.join(base, 'server', 'User', 'keybindings.json'),
    profiles: path.join(base, 'server', 'User', 'profiles'),
    extensions: path.join(base, 'extensions'),
    // One marker per live Claude session, written by the hook script beside it. Both are the
    // app's own, so a second checkout writing its own pair is two apps sharing nothing.
    activity: path.join(base, 'activity'),
    activityHook: path.join(base, 'activity-hook.py'),
    // Our own OAuth grant for the usage meter, encrypted. Never the CLI's keychain item.
    usageToken: path.join(base, 'usage-token.enc'),
    // Ids Open VSX did not have. Cached because it will not have grown them since, and asking
    // again is a 404 per extension on every start. Delete it to make the app retry.
    missCache: path.join(base, 'unavailable-extensions.json'),
    pidfile: path.join(base, 'server.pid'),
  };
}

// Claude Code's own dotfiles. Its settings file is the one path outside the app's data that the
// app WRITES, and it writes nothing there but its own hooks.
export function claudePaths() {
  return { settings: path.join(os.homedir(), '.claude', 'settings.json') };
}

// The server binary is a dependency, not part of the tree: an explicit path wins, then a
// vendored build, then whatever is on PATH. Nothing else in the app knows where it came from.
export function resolveCodeServer() {
  const onPath = (process.env.PATH || '').split(':').map((dir) => path.join(dir, 'code-server'));
  // Packaged, the vendored server rides as an extra resource beside the app rather than under ROOT.
  const packaged = app.isPackaged && path.join(process.resourcesPath, 'code-server/bin/code-server');
  const candidates = [
    process.env.CODE_TILES_CODE_SERVER,
    packaged,
    path.join(ROOT, 'vendor/code-server/bin/code-server'),
    ...onPath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* next */ }
  }
  return null;
}
