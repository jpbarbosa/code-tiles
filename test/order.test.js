import test from 'node:test';
import assert from 'node:assert/strict';

import { arranged, inserted, rebound, swapped } from '../src/main/order.js';

// One project order stands behind the strip, the grid, ⌃⌘1…⌃⌘9 and the saved list, and the two
// drag gestures are the only things that rewrite it. Both speak for the projects that are OPEN,
// which is the only part of the order a hand can see - so the thing worth pinning down is what
// happens to the rest of it.
const order = ['a', 'b', 'c', 'd'];

test('the strip inserts: the dragged project lands at an index and the rest shift along', () => {
  assert.deepEqual(inserted(order, 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(inserted(order, 'd', 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(inserted(order, 'b', 1), order, 'landing where it already is changes nothing');
});

test('a hand that runs off either end of the row keeps the project', () => {
  assert.deepEqual(inserted(order, 'a', 99), ['b', 'c', 'd', 'a']);
  assert.deepEqual(inserted(order, 'd', -5), ['d', 'a', 'b', 'c']);
  assert.deepEqual(inserted(order, 'z', 0), order, 'a project that is not open holds no slot');
});

test('the grid swaps: two tiles trade slots and nothing between them moves', () => {
  assert.deepEqual(swapped(order, 'a', 'd'), ['d', 'b', 'c', 'a']);
  assert.deepEqual(swapped(order, 'a', 'a'), order, 'a tile dropped on itself is not a move');
  assert.deepEqual(swapped(order, 'a', 'z'), order);
});

// The half that only a stored list can get wrong. The picker lists every folder ever opened here,
// so the order holds closed entries too - and they are on nobody's screen to have been dragged.
test('a closed entry keeps the slot it already had', () => {
  const entries = [
    { folder: 'a', open: true },
    { folder: 'b', open: false },
    { folder: 'c', open: true },
    { folder: 'd', open: true },
  ];

  // Three chips in the strip - a, c, d - and the first dragged past the last.
  assert.deepEqual(
    arranged(entries, inserted(['a', 'c', 'd'], 'a', 2)).map((entry) => entry.folder),
    ['c', 'b', 'd', 'a'],
  );
  assert.deepEqual(
    arranged(entries, swapped(['a', 'c', 'd'], 'a', 'd')).map((entry) => entry.folder),
    ['d', 'b', 'c', 'a'],
  );
  assert.equal(arranged(entries, ['c', 'a', 'd'])[1].open, false, 'and stays closed in it');
});

test('an order that no longer names every open project is dropped whole', () => {
  const entries = order.map((folder) => ({ folder, open: true }));
  const folders = (result) => result.map((entry) => entry.folder);

  // The snapshot a drag took before one of the four was closed under it. Applying the part that
  // still fits would leave the project it does not name with no slot at all.
  assert.deepEqual(folders(arranged(entries, ['d', 'a', 'b'])), order);
  assert.deepEqual(folders(arranged(entries, ['d', 'a', 'b', 'b'])), order, 'nor the same one twice');
  assert.deepEqual(folders(arranged(entries, ['d', 'c', 'b', 'a'])), ['d', 'c', 'b', 'a']);
});

// A tile is a WINDOW, and a window can be re-pointed from the inside - File > Open Folder, a row
// of the welcome page's Recent list. The project standing in that slot changes folder, and the
// thing worth pinning down is that the slot itself does not move.
const shown = (entries) => entries.filter((entry) => entry.open).map((entry) => entry.folder);

test('a window that re-points itself keeps the slot it was already in', () => {
  const entries = order.map((folder) => ({ folder, open: true }));
  const next = rebound(entries, 'b', 'x');

  assert.deepEqual(shown(next), ['a', 'x', 'c', 'd'], 'the tile did not move, so neither did it');
  assert.deepEqual(entries.map((entry) => entry.folder), order, 'and the list handed in is untouched');
});

test('the folder it left is one this app has seen, which is what the picker lists', () => {
  const next = rebound([{ folder: 'a', open: true }], 'a', 'x');

  assert.deepEqual(next, [{ folder: 'x', open: true }, { folder: 'a', open: false }]);
});

test('a folder another tile already holds is refused: one folder is one project', () => {
  const entries = [{ folder: 'a', open: true }, { folder: 'b', open: true }];

  assert.equal(rebound(entries, 'a', 'b'), null);
  assert.equal(rebound(entries, 'a', 'a'), null, 'and a window that went nowhere is no move');
  assert.equal(rebound(entries, 'z', 'x'), null, 'nor is a folder that holds no slot');
});

test('a closed entry is not a second project, so the tile takes its folder', () => {
  const entries = [{ folder: 'a', open: true }, { folder: 'b', open: false }];
  const next = rebound(entries, 'a', 'b');

  assert.deepEqual(shown(next), ['b']);
  assert.deepEqual(next.map((entry) => entry.folder), ['b', 'a'], 'one entry per folder, still');
});

test('what was chosen for a project goes with its folder, not with the slot', () => {
  const entries = [
    { folder: 'a', open: true, chosen: { hue: 25 } },
    { folder: 'b', open: false, chosen: { hue: 255 } },
  ];
  assert.deepEqual(rebound(entries, 'a', 'b'), [
    { folder: 'b', open: true, chosen: { hue: 255 } },
    { folder: 'a', open: false, chosen: { hue: 25 } },
  ]);
  assert.deepEqual(rebound([entries[0]], 'a', 'x'), [
    { folder: 'x', open: true },
    { folder: 'a', open: false, chosen: { hue: 25 } },
  ], 'a folder never seen here starts with nothing chosen');
});
