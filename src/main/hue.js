import { rgbFor } from './icon.js';

// A project's colour is a fact about its folder, never a stored preference: the hue its own
// favicon is mostly made of, and the hash of its path when there is none to take one from. So
// there is no field to migrate when this rule changes and no colour to reconcile when a folder
// moves. Nothing is memoised, which is load-bearing rather than an omission: the sample arrives
// asynchronously, and a folder answered before it landed would keep its path's hue for the run.
export function hueFor(folder) {
  const rgb = rgbFor(folder);
  if (!rgb) return hueOfPath(folder);
  return oklchHue(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

function hueOfPath(folder) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < folder.length; i += 1) {
    hash ^= folder.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
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
