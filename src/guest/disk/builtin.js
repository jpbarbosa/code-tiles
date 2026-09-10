import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

// The seams' fourth on-disk part: an extension of the app's own, placed among the SERVER's
// built-ins before it starts, where every profile has it without an entry in any manifest. Replaced
// whole rather than edited: the server keeps its scan of the built-ins against the mtime of the
// directory holding them, which a file rewritten inside one never moves, so the next window would
// load the manifest from before. [code-server 4.135.0]
const PREFIX = 'code-tiles-';

export function placeBuiltins(root) {
  if (!root) {
    console.error('[builtin] no server tree - nothing placed');
    return [];
  }
  const home = path.join(root, 'lib', 'vscode', 'extensions');
  const wanted = new Map(declaredBuiltins(seams).map(({ name, dir }) => [`${PREFIX}${name}`, dir]));
  const done = [];
  // Every folder under the prefix is the app's, so one no seam declares any more is taken back out:
  // reverting a seam reverts its extension, which a patch written into the same tree cannot promise.
  for (const folder of new Set([...wanted.keys(), ...owned(home)])) {
    const source = wanted.get(folder);
    const target = path.join(home, folder);
    if (source && same(source, target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      if (source) fs.cpSync(source, target, { recursive: true });
      done.push(source ? folder : `-${folder}`);
    } catch (error) {
      console.error(`[builtin] ${folder}: ${error.message}`);
    }
  }
  return done;
}

export function declaredBuiltins(list) {
  return list.filter((seam) => seam.builtin).map((seam) => ({ name: seam.name, dir: seam.builtin }));
}

function owned(home) {
  try { return fs.readdirSync(home).filter((name) => name.startsWith(PREFIX)); } catch { return []; }
}

function same(source, target) {
  const want = files(source);
  const have = files(target);
  if (!want || !have || want.size !== have.size) return false;
  return [...want].every(([name, body]) => have.get(name) === body);
}

function files(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true }); } catch { return null; }
  return new Map(entries.filter((entry) => entry.isFile()).map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    return [path.relative(dir, file), fs.readFileSync(file, 'utf8')];
  }));
}
