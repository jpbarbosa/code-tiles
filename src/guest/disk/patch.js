import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

// The seams' other on-disk part. A `settings` entry asks the editor for something it already
// offers; a `patch` is for the far rarer case where the editor HAS the thing and offers no way
// in - the side bar's footer area is one - and it is declared by the seam that needs it, so a
// seam is still one file with every part of it in view.
//
// Applied before the server is spawned, and idempotent: the marker the seam names is the whole
// bookkeeping, so a version bump - which replaces the tree - is patched again on the next start
// and nothing has to remember that it happened.
export function patchServer(bin) {
  const patches = seams.filter((seam) => seam.patch);
  if (!patches.length) return [];

  const root = path.resolve(fs.realpathSync(bin), '../..');
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
    const hits = source.match(new RegExp(patch.find.source, 'g')) || [];
    if (hits.length !== 1) {
      console.error(`[patch] ${name}: shape matched ${hits.length} times, expected 1 - not patched`);
      continue;
    }
    fs.writeFileSync(file, source.replace(patch.find, patch.replace));
    done.push(name);
  }
  return done;
}
