import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

// The seams' third on-disk part, and the last door of all: a `patch` rewrites the SERVER's own
// bundle, this rewrites an EXTENSION's. Same contract - declared by the seam that needs it,
// matched by shape, refused rather than half-applied - and one thing more, because an extension is
// replaced by its own updater rather than by a version bump we perform: the pristine bundle is
// kept beside it, and every patch is applied to THAT, never to whatever is on disk. So a patcher
// that changes cannot patch its own output, and a shape that stops matching restores the stock
// file instead of leaving an old edit no one can reason about.
//
// A patch that LANDED can still speak, through `notes`. A shape is not the only thing a patch
// depends on: it also reads the bundle's own strings, and those move without moving any anchor -
// matched, applied, and quietly meaning something else. That has no refusal to make, only a line
// to print.
//
// Applied before the server is spawned, like the rest: the extension host reads these files as
// the window loads, and nothing re-reads them until one does.
const BACKUP = '.ct-orig';

export function patchExtensions(dir) {
  const done = [];
  for (const patches of bundles(declaredExtensions(seams))) {
    for (const folder of folders(dir, patches[0].extension.id)) {
      const version = path.basename(folder);
      let status;
      try {
        status = patchBundle(folder, patches);
      } catch (error) {
        status = { refused: error.message };
      }
      if (status.refused) {
        const names = patches.map((patch) => patch.name).join(' + ');
        console.error(`[extension] ${names}: ${version} not patched (${status.refused})`);
        continue;
      }
      for (const refusal of status.refusals) console.error(`[extension] ${version}: ${refusal}`);
      for (const note of status.notes) console.error(`[extension] ${version}: ${note}`);
      // A pass where every patch refused still WRITES, to put the stock bundle back - but it
      // patched nothing, and saying so would name an edit that is not there.
      if (status.wrote && status.applied.length) done.push(`${status.applied.join(' + ')} in ${version}`);
    }
  }
  return done;
}

// Which declared patches the copy the server LOADS does not carry, read off disk rather than off a
// patcher's report: the app at start, its watcher and `npm run patch-vscode` can all write here,
// and the extension host runs whatever the last of them left. The manifest names that copy; the
// folders beside it are versions the server has already marked obsolete.
export function missingPatches(dir) {
  const missing = [];
  for (const patches of bundles(declaredExtensions(seams))) {
    const { id, file } = patches[0].extension;
    const entry = manifest(dir).find((one) => typeof one?.relativeLocation === 'string'
      && id.test(one.relativeLocation));
    const source = entry && read(path.join(dir, entry.relativeLocation, file));
    // Not installed, or not in place yet: there is no copy for a patch to be missing from.
    if (!source) continue;
    for (const { name, extension } of patches) {
      if (extension.stamp.test(source)) continue;
      missing.push({
        seam: name,
        extension: entry.identifier?.id ?? entry.relativeLocation,
        version: entry.version,
        degrades: extension.degrades,
      });
    }
  }
  return missing;
}

function manifest(dir) {
  try {
    const entries = JSON.parse(read(path.join(dir, 'extensions.json')) ?? '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function declaredExtensions(list) {
  return list.filter((seam) => seam.extension).map((seam) => ({ name: seam.name, extension: seam.extension }));
}

// Several seams can want the same bundle - the Claude tab's icon and the column its session opens
// in are two changes to one file - so they are grouped here and spent in one pass. Patched from
// the backup a seam at a time, each would start from the pristine source and only the last one's
// edit would survive, silently.
export function bundles(list) {
  const groups = new Map();
  for (const entry of list) {
    const key = `${entry.extension.id.source}\u0000${entry.extension.file}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()];
}

function patchBundle(folder, patches) {
  const name = patches[0].extension.file;
  const file = path.join(folder, name);
  const backup = `${file}${BACKUP}`;
  const current = read(file);
  if (current === null) return { refused: `no ${name}` };

  // The backup IS the pristine source once it exists. Without one, the file on disk is pristine
  // unless it carries a stamp of ours - which would mean a patch whose original is gone, and
  // nothing here can undo an edit it cannot see the other side of.
  const original = read(backup);
  if (original === null && patches.some(({ extension }) => extension.stamp.test(current))) {
    return { refused: `already patched and ${path.basename(backup)} is missing` };
  }
  const pristine = original ?? current;

  // Each over what the one before it left. A seam whose shape has moved is skipped with its own
  // reason rather than taking the others with it: they are separate changes that share a file.
  let patched = pristine;
  const applied = [];
  const refusals = [];
  const notes = [];
  const resources = {};
  for (const { name: seam, extension } of patches) {
    const result = extension.apply(patched);
    if (result.refused) {
      refusals.push(`${seam} not applied (${result.refused}) - ${extension.degrades}`);
      continue;
    }
    patched = result.source;
    applied.push(seam);
    for (const note of result.notes || []) notes.push(`${seam}: ${note}`);
    Object.assign(resources, extension.resources || {});
  }

  const wrote = current !== patched;
  // Nothing to check when every patch refused: what goes back is the bundle's own bytes, and
  // stock beats an edit made by a patcher that no longer agrees with this one.
  if (wrote && patched !== pristine) {
    const broken = syntaxError(patched);
    if (broken) return { refused: `the patched bundle does not parse (${broken})` };
  }

  // Only where something landed, or a refused pass would leave a copy of a bundle nobody edited.
  if (original === null && applied.length) write(backup, pristine);
  if (wrote) write(file, patched);
  // After the code that reads them, never before: resources written for a patch that then refused
  // would be files nothing points at.
  for (const [resource, body] of Object.entries(resources)) {
    const target = path.join(folder, resource);
    if (read(target) === body) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    write(target, body);
  }
  return { wrote, applied, refusals, notes };
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
// no extension at all, and the rename is the only way to be sure it never sees one. Named per
// process, since two patchers can answer one manifest write and a shared name lets one of them
// rename the other's half-written file into place.
function write(file, body) {
  const temporary = `${file}.${process.pid}.ct-tmp`;
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, file);
}
