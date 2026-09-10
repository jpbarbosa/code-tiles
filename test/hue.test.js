import assert from 'node:assert/strict';
import test from 'node:test';

import { hueFor, plateRgb } from '../src/main/hue.js';

// A project's colour is derived from its folder and never stored, so this is the only place the
// answer exists. It is spent as `oklch(0.62 0.15 <hue>)`, which is why the angle has to be OKLCH's
// and not sRGB's: the same number is a different colour in the two spaces.

// No favicon has been sampled in this process, so every folder falls to its path's hash.
test('a folder with no sampled favicon still gets a hue, and always the same one', () => {
  const first = hueFor('/Users/jp/Sites/code-tiles');
  assert.ok(Number.isInteger(first) && first >= 0 && first < 360, `got ${first}`);
  assert.equal(hueFor('/Users/jp/Sites/code-tiles'), first);
});

test('two folders that differ at all get their own hue', () => {
  const a = hueFor('/Users/jp/Sites/alpha');
  const b = hueFor('/Users/jp/Sites/beta');
  const c = hueFor('/Users/jp/Sites/alphb');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('the empty path is answered rather than thrown at', () => {
  const hue = hueFor('');
  assert.ok(Number.isInteger(hue) && hue >= 0 && hue < 360, `got ${hue}`);
});

// The spread is what makes a grid of tiles tell itself apart. A hash that clustered would be
// invisible until several projects were open at once, all wearing the same colour.
test('a realistic set of sibling folders spreads across the wheel', () => {
  const names = ['code-tiles', 'orbit', 'fern', 'ledger-admin', 'atlas', 'atlas-intranet',
    'lumen', 'traefik', 'ledger', 'quill'];
  const hues = names.map((name) => hueFor(`/Users/jp/Sites/${name}`));
  assert.equal(new Set(hues).size, names.length, `collision among ${hues.join(', ')}`);
  // At least half the quadrants used, which a clustered hash would fail.
  assert.ok(new Set(hues.map((hue) => Math.floor(hue / 90))).size >= 2, `bunched: ${hues.join(', ')}`);
});

// The other direction, for a native swatch: the plate a window paints, as sRGB bytes. Where sRGB
// holds the plate these are the bytes Chromium's own canvas fills `oklch(0.62 0.15 <hue>)` with.
test('a hue sRGB can hold at the plate chroma comes back as the plate exactly', () => {
  assert.deepEqual(plateRgb(25), [209, 92, 86]);
  assert.deepEqual(plateRgb(145), [64, 157, 72]);
  assert.deepEqual(plateRgb(255), [64, 135, 222]);
});

test('a hue sRGB cannot hold loses chroma rather than putting a channel out of range', () => {
  for (let hue = 0; hue < 360; hue += 5) {
    const rgb = plateRgb(hue);
    assert.ok(rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255), `${hue}: ${rgb}`);
  }
  const [red, green, blue] = plateRgb(95);
  assert.ok(red > blue && green > blue, `yellow is still yellow: ${[red, green, blue]}`);
});
