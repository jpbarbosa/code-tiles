import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

// The seams' third on-disk part, and the last door of all: a `patch` rewrites the SERVER's own
// bundle, this rewrites an EXTENSION's. Same contract - declared by the seam that needs it,
// matched by shape, refused rather than half-applied - and one thing more, because an extension
// is replaced by its own updater rather than by a version bump we perform: the pristine bundle is
// kept beside it, and every patch is applied to THAT, never to whatever is on disk. So a patcher
// that changes cannot patch its own output, and a shape that stops matching restores the stock
// file instead of leaving an old edit no one can reason about.
//
// Applied before the server is spawned, like the rest: the extension host reads these files as
// the window loads, and nothing re-reads them until one does.
const BACKUP = '.ct-orig';

export function patchExtensions(dir) {
  const done = [];
  for (const { name, extension } of declaredExtensions(seams)) {
    for (const folder of folders(dir, extension.id)) {
      const version = path.basename(folder);
      let status;
      try {
        status = patchOne(folder, extension);
      } catch (error) {
        status = { refused: error.message };
      }
      if (status.refused) {
        console.error(`[extension] ${name}: ${version} not patched (${status.refused}) - ${extension.degrades}`);
        continue;
      }
      if (status.wrote) done.push(`${name} in ${version}`);
    }
  }
  return done;
}

export function declaredExtensions(list) {
  return list.filter((seam) => seam.extension).map((seam) => ({ name: seam.name, extension: seam.extension }));
}

function patchOne(folder, extension) {
  const file = path.join(folder, extension.file);
  const backup = `${file}${BACKUP}`;
  const current = read(file);
  if (current === null) return { refused: `no ${extension.file}` };

  // The backup IS the pristine source once it exists. Without one, the file on disk is pristine
  // unless it carries a stamp of ours - which would mean a patch whose original is gone, and
  // nothing here can undo an edit it cannot see the other side of.
  const original = read(backup);
  if (original === null && extension.stamp.test(current)) {
    return { refused: `already patched and ${path.basename(backup)} is missing` };
  }
  const source = original ?? current;

  const result = extension.apply(source);
  if (result.refused) {
    // Stock beats an edit made by a patcher that no longer agrees with this one.
    if (current !== source) write(file, source);
    return { refused: result.refused };
  }

  // Byte for byte what is already there, which is the usual start: it parsed when it was written
  // and nothing has to be spawned to learn that again.
  const wrote = current !== result.source;
  if (wrote) {
    const broken = syntaxError(result.source);
    if (broken) return { refused: `the patched bundle does not parse (${broken})` };
  }

  if (original === null) write(backup, source);
  if (wrote) write(file, result.source);
  // After the code that reads them, never before: resources written for a patch that then refused
  // would be files nothing points at.
  for (const [name, body] of Object.entries(extension.resources || {})) {
    const target = path.join(folder, name);
    if (read(target) === body) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    write(target, body);
  }
  return { wrote };
}

function folders(dir, id) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((name) => id.test(name)).map((name) => path.join(dir, name));
}

// A bundle that does not parse breaks the whole extension with no visible error, so never write
// one. process.execPath is Electron here, which ELECTRON_RUN_AS_NODE turns back into node.
function syntaxError(source) {
  const check = spawnSync(process.execPath, ['--check', '-'], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (check.error) return check.error.message;
  if (check.status === 0) return null;
  // node echoes the offending line, and a line of this bundle is megabytes long.
  const verdict = (check.stderr || '').split('\n').map((line) => line.trim())
    .find((line) => /^\w*Error: /.test(line));
  return (verdict || `exit ${check.status}`).slice(0, 200);
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

// Through a temp file in the same directory: a window that loads a half-written extension.js gets
// no extension at all, and the rename is the only way to be sure it never sees one.
function write(file, body) {
  const temporary = `${file}.ct-tmp`;
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, file);
}
