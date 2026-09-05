import test from 'node:test';
import assert from 'node:assert/strict';

import { arranged, inserted, swapped } from '../src/main/order.js';

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
