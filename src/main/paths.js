import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const files = {
  shellPage: path.join(ROOT, 'src/shell/index.html'),
  shellPreload: path.join(ROOT, 'src/shell/preload.cjs'),
  guestRuntime: path.join(ROOT, 'src/guest/runtime.cjs'),
};

export function userPaths() {
  const base = app.getPath('userData');
  return {
    base,
    state: path.join(base, 'state.json'),
    serverData: path.join(base, 'server'),
    extensions: path.join(base, 'extensions'),
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
