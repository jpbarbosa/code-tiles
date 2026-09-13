import fs from 'node:fs';
import path from 'node:path';

// A project's icon is a fact about its folder, read the way its name and its hue are - unless you
// chose an image for it from its menu, which is then read the same way from wherever it lives.
// Directory-major, project root first, so a sub-app's mark never outranks the project's own - both
// runtime-tinted SVGs on this machine sit under one, beside a coloured .ico at the root. No `dist/`
// or `build/`, ever: a stale build output would shadow the source it came from.
// docs/CONSTRAINTS.md carries the rest.
const DIRS = [
  '',
  'public/',                                  // Laravel, Rails, Vite, CRA, Vue, Nuxt, Astro, Next
  'static/',                                  // SvelteKit, Hugo, Gatsby, Django, Flask
  'app/', 'src/app/',                         // Next.js app router
  'src/',                                     // Angular 16 and older
  'assets/', 'src/assets/',                   // Expo, Electron, Vue
  'www/', 'wwwroot/', 'priv/static/',         // Cordova, ASP.NET Core, Phoenix
  'web/public/', 'frontend/public/', 'client/public/',
  'apps/web/public/', 'packages/web/public/',
];

// Rasters before the SVG, which is wrong on sharpness and right on colour: an SVG favicon is
// often a tintable template. `favicon` before `icon`: an assets `icon.png` is the 1024px app one.
const NAMES = ['favicon.ico', 'favicon.png', 'favicon.svg', 'icon.png', 'icon.svg', 'apple-touch-icon.png'];
const CANDIDATES = DIRS.flatMap((dir) => NAMES.map((name) => dir + name));

// The context rides the window's COMMAND LINE, so a mark has a ceiling a file on disk does not.
// One over it is re-encoded small rather than dropped, which is why the two numbers differ.
const SHIPPABLE = 128 * 1024;
// What a decoder may be handed, which rides nothing: a hue is a number whatever it was read from.
const READABLE = 1024 * 1024;
// ...and for an image you chose, which no search walks into by accident: a 1024px app icon is
// often past a megabyte, and the decoder shrinks it to a mark either way.
export const CHOSEN_LIMIT = 4 * 1024 * 1024;
// What a chosen image may be: the types `mimeOf` can name from the bytes.
export const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'];

// What each folder's search found and each chosen file held, and what a renderer made of each FILE,
// so a project whose image changes is decoded again and nothing else is. A folder is searched at
// start and again whenever its project is opened, which is when a favicon added since shows up.
const found = new Map();
const chosen = new Map();
const decoded = new Map();

// The mark a window and a chip wear: the re-encoded one where the file was too big to ship or had
// a margin to cut, and the file itself otherwise, which is always at least as sharp as a
// downscale of it. `image` is the one chosen from the project's menu, or null for the folder's
// own favicon.
export function iconFor(folder, image = null) {
  const source = sourceFor(folder, image);
  if (!source) return null;
  const mark = decoded.get(source.file)?.mark;
  if (mark) return mark;
  return source.size <= SHIPPABLE ? source.url : null;
}

// The colour that icon is mostly made of: null where nothing has sampled it, null again where it
// has none to give.
export function rgbFor(folder, image = null) {
  const source = sourceFor(folder, image);
  return (source && decoded.get(source.file)?.rgb) || null;
}

// What a renderer makes of those bytes, which is the only thing here that reads a true ICO or an
// SVG. Awaited before the first render; a project added later draws on its path's hue and is
// drawn again when this lands. Takes `{ folder, image }`, the two things the readers above take.
// Imported lazily: the rest of this file is tested outside Electron.
export async function learn(projects) {
  const wanted = new Map();
  for (const { folder, image } of projects) {
    const source = sourceFor(folder, image);
    if (source && !decoded.has(source.file)) wanted.set(source.file, source);
  }
  if (!wanted.size) return false;
  // A favicon is never a reason the app does not start, so this answers false rather than throws.
  let sampled;
  try {
    const { sample } = await import('./sampler.js');
    sampled = await sample([...wanted.values()].map((source) => ({
      url: source.url,
      shrink: source.size > SHIPPABLE,
    })));
  } catch (error) {
    console.error('[icon] sampling failed:', error.message);
    return false;
  }
  [...wanted.keys()].forEach((file, i) => decoded.set(file, sampled[i] || { mark: null, rgb: null }));
  return sampled.some((answer) => answer?.rgb || answer?.mark);
}

// A chosen file read off disk again: choosing one is how you pick up an image edited since.
export function forget(file) {
  chosen.delete(file);
  decoded.delete(file);
}

// A folder searched again, which opening its project does, so a favicon added or edited since the
// app started shows up without a restart. What a renderer made of the old file goes only when its
// bytes changed: dropped on every open, a known favicon would draw on its path's hue first.
export function reread(folder) {
  const before = found.get(folder);
  const after = search(folder);
  found.set(folder, after);
  if (before && before.url !== after?.url) decoded.delete(before.file);
}

// The image you chose while it is still there to read, and the folder's own favicon otherwise.
function sourceFor(folder, image) {
  if (image) {
    if (!chosen.has(image)) chosen.set(image, readImage(image, CHOSEN_LIMIT));
    if (chosen.get(image)) return chosen.get(image);
  }
  if (!found.has(folder)) found.set(folder, search(folder));
  return found.get(folder);
}

function search(folder) {
  for (const candidate of CANDIDATES) {
    const source = readImage(path.join(folder, candidate), READABLE);
    if (source) return source;
  }
  return null;
}

function readImage(file, limit) {
  try {
    const { size } = fs.statSync(file);
    // Laravel ships an EMPTY public/favicon.ico: a data URL that draws nothing, and being a
    // hit it stops the search before anything real is found.
    if (!size || size > limit) return null;
    const bytes = fs.readFileSync(file);
    return { file, size, url: `data:${mimeOf(bytes, path.extname(file))};base64,${bytes.toString('base64')}` };
  } catch {
    return null;
  }
}

// From the bytes, not from the name: a `favicon.ico` is as often a PNG as an icon, and a browser
// forgives that where a data URL does not.
function mimeOf(bytes, extension) {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('utf8', 0, 200).trimStart().startsWith('<')) return 'image/svg+xml';
  return extension === '.svg' ? 'image/svg+xml' : 'image/png';
}
