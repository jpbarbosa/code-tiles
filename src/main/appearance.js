import path from 'node:path';

import { plateRgb } from './hue.js';

// The hues the Color menu offers: Finder's own tag colours plus the teal and the pink it lacks, as
// the angle an oklch() reads. The plate's lightness and chroma do the rest, so each reads as its
// name on the badge, the glow and the tint alike.
export const PALETTE = [
  { name: 'Red', hue: 25 },
  { name: 'Orange', hue: 55 },
  { name: 'Yellow', hue: 95 },
  { name: 'Green', hue: 145 },
  { name: 'Teal', hue: 185 },
  { name: 'Blue', hue: 255 },
  { name: 'Purple', hue: 305 },
  { name: 'Pink', hue: 350 },
];

// A project's own menu, as a template: the mark its badge wears and the hue it is painted in, with
// Automatic as the derivation. Checkboxes, not radios: Electron checks the FIRST radio of a group
// that has none, so a palette with nothing chosen from it would claim to be Red.
export function appearanceMenu(project, { automaticHue, swatch, choose, chooseImage }) {
  const { image, initial, hue } = project.chosen;
  const item = (label, checked, choice, icon) => ({
    label, type: 'checkbox', checked, ...(icon ? { icon } : {}), click: () => choose(choice),
  });
  return [
    {
      label: 'Icon',
      submenu: [
        item('Automatic', !image && !initial, { image: null, initial: null }),
        item('Initial Letter', initial, { image: null, initial: true }),
        // Chosen again, it is read again: the way to pick up an image edited since.
        ...(image ? [item(path.basename(image), !initial, { image, initial: null })] : []),
        { type: 'separator' },
        { label: 'Choose Image…', click: chooseImage },
      ],
    },
    {
      label: 'Color',
      submenu: [
        item('Automatic', hue === null, { hue: null }, swatch(automaticHue)),
        { type: 'separator' },
        ...PALETTE.map((color) => item(color.name, hue === color.hue, { hue: color.hue }, swatch(color.hue))),
      ],
    },
  ];
}

// A disc of the plate's colour, the way Finder draws a tag in a menu: 12pt across, centred on the
// 16pt square macOS gives an item's image, at 2x. Premultiplied BGRA, which is what a bitmap is to
// `nativeImage.createFromBitmap`.
export const SWATCH = { width: 32, height: 32, scaleFactor: 2 };
const RADIUS = 12;

export function swatchBitmap(hue) {
  const [red, green, blue] = plateRgb(hue);
  const { width, height } = SWATCH;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // How much of this pixel the disc covers, from its centre's distance to the edge: the
      // one-pixel ramp is the antialiasing.
      const cover = Math.min(1, Math.max(0, RADIUS + 0.5 - Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2)));
      const at = (y * width + x) * 4;
      pixels[at] = Math.round(blue * cover);
      pixels[at + 1] = Math.round(green * cover);
      pixels[at + 2] = Math.round(red * cover);
      pixels[at + 3] = Math.round(255 * cover);
    }
  }
  return pixels;
}
