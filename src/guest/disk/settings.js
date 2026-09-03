import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

// Everything a seam asks the editor for, in one merge, before the server starts. A seam that
// can be a setting is a setting: the layout reflows the way the product intends, and nothing
// here has to keep a hack in step with a version.
export function writeSettings(serverDataDir) {
  const file = path.join(serverDataDir, 'User', 'settings.json');
  const current = read(file);
  const wanted = Object.assign({}, ...seams.map((seam) => seam.settings || {}));
  const next = { ...current, ...wanted };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return wanted;
}

function read(file) {
  try {
    // VS Code writes JSONC. Comments are stripped rather than preserved: this file is the
    // app's own, and anything a seam needs is re-applied on every start anyway.
    const raw = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
