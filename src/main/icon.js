import fs from 'node:fs';
import path from 'node:path';

// A project's icon is a fact about its folder, read the way the name and the hue are read from
// its path: nothing is stored, and a project with no favicon simply has none.
//
// The root first, then `public/` - which is where most of the projects on this machine keep one.
const CANDIDATES = [
  'favicon.ico', 'favicon.png', 'favicon.svg',
  'public/favicon.ico', 'public/favicon.svg', 'public/favicon.png',
];

// The context rides on the window's COMMAND LINE, so an icon has a ceiling that a file on disk
// does not: a megabyte of base64 in `additionalArguments` is a window that never starts.
const LIMIT = 128 * 1024;

const answers = new Map();

// Read once per folder per run. A favicon added to a project shows up the next time the app
// starts, which is the same bargain the extension mirror already makes.
export function iconFor(folder) {
  if (!answers.has(folder)) answers.set(folder, read(folder));
  return answers.get(folder);
}

function read(folder) {
  for (const candidate of CANDIDATES) {
    const file = path.join(folder, candidate);
    try {
      if (fs.statSync(file).size > LIMIT) continue;
      const bytes = fs.readFileSync(file);
      return `data:${mimeOf(bytes, path.extname(file))};base64,${bytes.toString('base64')}`;
    } catch { /* not there; try the next */ }
  }
  return null;
}

// From the bytes, not from the name: a `favicon.ico` is as often a PNG as an icon, and a browser
// forgives that where a data URL does not.
function mimeOf(bytes, extension) {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  if (bytes.toString('utf8', 0, 200).trimStart().startsWith('<')) return 'image/svg+xml';
  return extension === '.svg' ? 'image/svg+xml' : 'image/png';
}
