import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const files = {
  shellPage: path.join(ROOT, 'src/shell/index.html'),
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
    profiles: path.join(base, 'server', 'User', 'profiles'),
    extensions: path.join(base, 'extensions'),
    // Ids Open VSX did not have. Cached because it will not have grown them since, and asking
    // again is a 404 per extension on every start. Delete it to make the app retry.
    missCache: path.join(base, 'unavailable-extensions.json'),
    pidfile: path.join(base, 'server.pid'),
  };
}

// The server binary is a dependency, not part of the tree: an explicit path wins, then a
// vendored build, then whatever is on PATH. Nothing else in the app knows where it came from.
export function resolveCodeServer() {
  const onPath = (process.env.PATH || '').split(':').map((dir) => path.join(dir, 'code-server'));
  const candidates = [
    process.env.CODE_TILES_CODE_SERVER,
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
