import { rgbFor } from './icon.js';

// A project's colour as its folder says it: the hue its favicon - or the image chosen for its mark
// - is mostly made of, and the hash of its path when there is none to take one from. A hue chosen
// from the project's menu is laid over this by src/main/projects.js and never reaches here.
// Nothing is memoised, which is load-bearing rather than an omission: the sample arrives
// asynchronously, and a folder answered before it landed would keep its path's hue for the run.
export function hueFor(folder, image = null) {
  const rgb = rgbFor(folder, image);
  if (!rgb) return hueOfPath(folder);
  return oklchHue(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

// The plate a window draws an initial on, `oklch(0.62 0.15 <hue>)`, as the sRGB bytes a native
// swatch is painted in: said a third time, after src/shell/format.js and the identity seam. sRGB
// cannot hold every hue at that chroma - yellows and teals fall outside - so the chroma comes down
// until it fits, keeping the hue and the lightness, which are what a swatch is read by.
const PLATE_LIGHTNESS = 0.62;
const PLATE_CHROMA = 0.15;

export function plateRgb(hue) {
  const fits = (chroma) => linearRgb(PLATE_LIGHTNESS, chroma, hue).every((c) => c >= 0 && c <= 1);
  let chroma = PLATE_CHROMA;
  if (!fits(chroma)) {
    let [low, high] = [0, chroma];
    for (let step = 0; step < 16; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    chroma = low;
  }
  const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return linearRgb(PLATE_LIGHTNESS, chroma, hue).map((c) => Math.round(encode(c) * 255));
}

function linearRgb(lightness, chroma, hue) {
  const angle = hue * Math.PI / 180;
  const [a, b] = [chroma * Math.cos(angle), chroma * Math.sin(angle)];
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.7076147010 * short,
  ];
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
