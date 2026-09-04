import { nativeImage } from 'electron';

import { iconFor } from './icon.js';

// A project's colour is a fact about its folder, never a stored preference: the hue its own
// favicon is mostly made of, and the hash of its path when there is no favicon to take one from.
// Nothing is written down either way, so there is no field to migrate when this rule changes and
// no colour to reconcile when a folder moves.
//
// Read once per folder per run, like the favicon it is sampled from: an icon that changes shows
// up the next time the app starts.
const answers = new Map();

export function hueFor(folder) {
  if (!answers.has(folder)) answers.set(folder, hueOfIcon(iconFor(folder)) ?? hueOfPath(folder));
  return answers.get(folder);
}

function hueOfPath(folder) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < folder.length; i += 1) {
    hash ^= folder.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

// The icon, downsampled to a hue rather than to a picture.
const SIZE = 16;
// Below this alpha the pixel is whatever is behind the icon, not the icon.
const SHOWING = 128;
// …and below this spread it is a grey - the white of a letterform, the black of an outline, the
// plate a logo sits on - which would drag the average toward no hue at all.
const COLOURFUL = 24;

// The average of the pixels that carry a colour. Averaging is what makes this a hue and not a
// palette: a two-colour icon lands between its two, which is the colour the pair reads as from
// across a room, and that is the distance a tile is looked at from.
function hueOfIcon(icon) {
  if (!icon) return null;
  // The bytes come off someone's disk, so decoding them is the one step here that can throw, and
  // this runs for every project on every list: a project with a malformed favicon takes the hue
  // its path gives it, not the whole project list with it.
  try { return sampled(icon); } catch { return null; }
}

function sampled(icon) {
  const image = nativeImage.createFromDataURL(icon);
  // A true ICO or an SVG: Electron decodes neither, and the path's hue is already a good answer.
  if (image.isEmpty()) return null;
  const pixels = image.resize({ width: SIZE, height: SIZE }).toBitmap();
  let red = 0, green = 0, blue = 0, taken = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // BGRA, which is the order Chromium keeps a bitmap in on every platform.
    const [b, g, r, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (alpha < SHOWING) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) < COLOURFUL) continue;
    red += r; green += g; blue += b; taken += 1;
  }
  // A black-and-white icon has no hue to take, so the path keeps the answer.
  if (!taken) return null;
  return oklchHue(red / taken / 255, green / taken / 255, blue / taken / 255);
}

// The angle an `oklch()` will read back, not the sRGB one: the tint spends this number as
// `oklch(0.62 0.15 <hue>)`, and the same number means a different colour in the two spaces -
// sRGB's 240 is blue where OKLCH's is closer to cyan.
function oklchHue(red, green, blue) {
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * long - 2.4285922050 * medium + 0.4505937099 * short;
  const bAxis = 0.0259040371 * long + 0.7827717662 * medium - 0.8086757660 * short;
  return Math.round((Math.atan2(bAxis, a) * 180 / Math.PI + 360) % 360);
}
