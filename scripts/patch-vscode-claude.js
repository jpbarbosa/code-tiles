#!/usr/bin/env node

// The seams that rewrite an extension's own bundle - `chat-icon` and `chat-column` - applied to a
// VS Code this app does not own: your desktop install. The app spends them on its own server every
// time it starts; desktop VS Code has no such hook, and both edits live INSIDE the versioned
// extension folder, so its self-update lands a fresh unpatched copy and reverts them silently.
//
// The same patchers either way, which is the whole point of the script existing rather than a
// second set of anchors: one bundle shape to keep alive against a minifier. Idempotent, so
// re-running it costs nothing, and every refusal is a line on stderr naming what it degrades to.
//
//   npm run patch-vscode                    ~/.vscode/extensions
//   npm run patch-vscode -- <dir> [<dir>…]  Insiders, a portable install, this app's own

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { declaredExtensions, patchExtensions } from '../src/guest/disk/extension.js';
import seams from '../src/guest/manifest-settings.js';

const dirs = process.argv.slice(2);
if (!dirs.length) dirs.push(path.join(os.homedir(), '.vscode', 'extensions'));

const patchers = declaredExtensions(seams);

// A folder a patcher claims but without the bundle it names. launchd fires on the manifest write,
// which can beat the extraction it announces, so this is an install still landing - the one state
// worth waiting on rather than reporting.
function landing(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return 0; }
  return names.filter((name) => patchers.some(({ extension }) => extension.id.test(name)
    && !fs.existsSync(path.join(dir, name, extension.file)))).length;
}

const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (const dir of dirs) {
  for (let tries = 0; landing(dir) && tries < 5; tries++) wait(2000);
  const pending = landing(dir);
  if (pending) console.warn(`[patch-vscode] ${dir}: ${pending} folder(s) carry no bundle yet`);
  const done = patchExtensions(dir);
  console.log(`[patch-vscode] ${dir}: ${done.length ? done.join(', ') : 'nothing to apply'}`);
}
console.log('[patch-vscode] reload the window (Developer: Reload Window) to pick it up');
