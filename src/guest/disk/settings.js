import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';
import { parseJsonc } from './jsonc.js';

// Everything a seam asks the editor for, in one merge, before the server starts. A seam that
// can be a setting is a setting: the layout reflows the way the product intends, and nothing
// here has to keep a hack in step with a version.
//
// A profile does not inherit the default profile's settings - it reads its own file or gets an
// empty model - so every profile the app mirrors is merged separately, over whichever desktop
// file that profile reads. A seam's `settings` win that merge in all of them; its `defaults`
// lose to the file.
export function seamSettings() {
  return Object.assign({}, ...seams.map((seam) => seam.settings || {}));
}

// A seam's `defaults` are what it wants the editor to do when you have said nothing, and they
// lose to your own file rather than winning over it. The distinction is the whole difference
// between a seam that repairs a web-only default and one that takes a preference off you.
export function seamDefaults() {
  return Object.assign({}, ...seams.map((seam) => seam.defaults || {}));
}

// The text a settings file should hold: your own settings between the two seam layers.
// Returns text rather than writing, so a caller can skip a write that changes nothing.
export function settingsFrom(source) {
  const merged = { ...seamDefaults(), ...read(source), ...seamSettings() };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

export function writeSettings(file, source = file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, settingsFrom(source));
}

function read(file) {
  if (!file) return {};
  try { return parseJsonc(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
