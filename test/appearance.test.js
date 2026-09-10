import assert from 'node:assert/strict';
import test from 'node:test';

import { PALETTE, SWATCH, appearanceMenu, swatchBitmap } from '../src/main/appearance.js';

// A project's own menu, as the template main pops: which item carries the check and what a click
// chooses. The popup and the swatch as an image are Electron's, so the swatch is handed in here and
// read back as the hue it was asked for.
const menuFor = (chosen, clicks = []) => appearanceMenu(
  { folder: '/p', name: 'p', chosen: { image: null, initial: false, hue: null, ...chosen } },
  {
    automaticHue: 40,
    swatch: (hue) => `swatch ${hue}`,
    choose: (choice) => clicks.push(choice),
    chooseImage: () => clicks.push('image'),
  },
);
const checked = (submenu) => submenu.filter((item) => item.checked).map((item) => item.label);

test('Automatic carries the check while nothing is chosen', () => {
  const [icon, color] = menuFor({});
  assert.deepEqual([icon.label, color.label], ['Icon', 'Color']);
  assert.deepEqual(checked(icon.submenu), ['Automatic']);
  assert.deepEqual(checked(color.submenu), ['Automatic']);
});

test('a choice moves the check, and a chosen image is listed by its name', () => {
  const [icon, color] = menuFor({ image: '/Users/jp/art/logo.png', hue: 255 });
  assert.deepEqual(checked(icon.submenu), ['logo.png']);
  assert.deepEqual(checked(color.submenu), ['Blue']);
  const [lettered] = menuFor({ image: '/Users/jp/art/logo.png', initial: true });
  assert.deepEqual(checked(lettered.submenu), ['Initial Letter'], 'the letter wins wherever both are on the entry');
});

test('every item says what it chooses, and Automatic is a null', () => {
  const clicks = [];
  const [icon, color] = menuFor({ image: '/x/logo.png' }, clicks);
  for (const item of [...icon.submenu, ...color.submenu]) item.click?.();
  assert.deepEqual(clicks, [
    { image: null, initial: null },
    { image: null, initial: true },
    { image: '/x/logo.png', initial: null },
    'image',
    { hue: null },
    ...PALETTE.map((color) => ({ hue: color.hue })),
  ]);
});

test('Automatic wears the hue it would derive, and every colour its own', () => {
  const [, color] = menuFor({});
  assert.deepEqual(color.submenu.filter((item) => item.icon).map((item) => item.icon),
    ['swatch 40', ...PALETTE.map((entry) => `swatch ${entry.hue}`)]);
});

test('a swatch is the plate colour, centred, and clear in its corners', () => {
  const pixels = swatchBitmap(25);
  const pixel = (x, y) => [...pixels.subarray((y * SWATCH.width + x) * 4, (y * SWATCH.width + x) * 4 + 4)];
  assert.equal(pixels.length, SWATCH.width * SWATCH.height * 4);
  assert.deepEqual(pixel(16, 16), [86, 92, 209, 255], 'BGRA of oklch(0.62 0.15 25)');
  assert.deepEqual(pixel(0, 0), [0, 0, 0, 0]);
  for (let y = 0; y < SWATCH.height; y += 1) {
    for (let x = 0; x < SWATCH.width; x += 1) {
      assert.deepEqual(pixel(x, y), pixel(SWATCH.width - 1 - x, SWATCH.height - 1 - y), `${x},${y}`);
    }
  }
  // Premultiplied: no colour channel is ever brighter than the alpha it sits under.
  for (let i = 0; i < pixels.length; i += 4) {
    assert.ok(Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) <= pixels[i + 3]);
  }
});
