import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';

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

// VS Code writes JSONC, and JSON.parse accepts neither half of it: a real settings file has
// comments AND a trailing comma before its last brace. Regexes are not enough - a `//` inside a
// value is not a comment, and a `,` inside a string is not a trailing one - so the text is
// walked once with strings copied whole, which is the only state that matters here.
//
// Getting this wrong is silent and total: the parse throws, the catch above hands back an empty
// object, and every profile is mirrored with none of your settings in it.
function parseJsonc(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char === '"') {
      let end = i + 1;
      while (end < raw.length && raw[end] !== '"') end += raw[end] === '\\' ? 2 : 1;
      out += raw.slice(i, end + 1);
      i = end + 1;
    } else if (char === '/' && raw[i + 1] === '/') {
      const newline = raw.indexOf('\n', i);
      i = newline < 0 ? raw.length : newline;
    } else if (char === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      i = end < 0 ? raw.length : end + 2;
    } else {
      // A comma is only trailing once its closer arrives, so it is dropped from behind.
      if (char === '}' || char === ']') out = out.replace(/,\s*$/, '');
      out += char;
      i += 1;
    }
  }
  return JSON.parse(out);
}
