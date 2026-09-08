import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';
import { matchCount } from '../shape.cjs';

// The seams' other on-disk part. A `settings` entry asks the editor for something it already
// offers; a `patch` is for the far rarer case where the editor HAS the thing and offers no way
// in - the side bar's footer area is one - and it is declared by the seam that needs it, so a
// seam is still one file with every part of it in view.
//
// Applied before the server is spawned, and idempotent: the marker the seam names is the whole
// bookkeeping, so a version bump - which replaces the tree - is patched again on the next start
// and nothing has to remember that it happened.
export function patchServer(bin) {
  const patches = declaredPatches(seams);
  if (!patches.length) return [];

  const root = serverRoot(bin);
  if (!root) {
    console.error(`[patch] no server tree under ${bin} - nothing patched`);
    return [];
  }
  const done = [];
  for (const { name, patch } of patches) {
    const file = path.join(root, patch.file);
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      console.error(`[patch] ${name}: no ${patch.file} under ${root} - not patched`);
      continue;
    }
    if (source.includes(patch.marker)) continue;

    // Refusing beats a half-patched bundle: the shape is minified code matched by its structure,
    // and a release that moves it must be re-derived rather than guessed at. The seam that
    // declared this says what it degrades to when the patch is missing.
    const hits = matchCount(source, patch.find);
    if (hits !== 1) {
      console.error(`[patch] ${name}: shape matched ${hits} times, expected 1 - not patched`);
      continue;
    }
    fs.writeFileSync(file, source.replace(patch.find, patch.replace));
    done.push(name);
  }
  return done;
}

// The directory every patch's file is written under, and so the mark of the server's own tree.
const BUNDLE = ['lib', 'vscode', 'out'];

// Where that tree begins, which is not a fixed distance from the binary. coder's release is
// `<root>/bin/code-server`, and an npm install on macOS or Linux is a symlink into
// `<root>/out/node/entry.js` - two levels up from either, which is what this used to count. npm
// on Windows writes a `.cmd` shim instead: a real file that sits BESIDE the tree it runs rather
// than inside it, and two levels up from one is a directory holding no server at all. So the
// tree is looked for rather than counted to, which asks nothing about which host this is.
export function serverRoot(bin) {
  let dir;
  try { dir = path.dirname(fs.realpathSync(bin)); } catch { return null; }
  // `path.dirname` of a filesystem root is itself, which is what ends the walk.
  for (let last = null; dir !== last; last = dir, dir = path.dirname(dir)) {
    if (holdsBundle(dir)) return dir;
    const packaged = path.join(dir, 'node_modules', 'code-server');
    if (holdsBundle(packaged)) return packaged;
  }
  return null;
}

function holdsBundle(dir) {
  return fs.existsSync(path.join(dir, ...BUNDLE));
}

// A seam declares one patch or several - `dark` owns two, the bundle's light-first fallback and
// the webview frame's own canvas - and they are applied the same way either way.
export function declaredPatches(list) {
  return list.flatMap((seam) => [seam.patch].flat()
    .filter(Boolean)
    .map((patch) => ({ name: seam.name, patch })));
}
