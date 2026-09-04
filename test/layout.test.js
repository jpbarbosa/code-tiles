import test from 'node:test';
import assert from 'node:assert/strict';
import { gridResize, gridShape, gridSplitters, shapeKey, tileRects, METRICS } from '../src/main/layout.js';

const window = { width: 1600, height: 1000 };

test('one project fills the area under the strip', () => {
  const [only] = tileRects({ ...window, count: 1 });
  assert.deepEqual(only, {
    visible: true, x: 8, y: METRICS.strip,
    width: 1600 - 16, height: 1000 - METRICS.strip - 8,
  });
});

test('gaps are equal and tiles never overlap', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
    const rects = tileRects({ ...window, count });
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 1; i < rects.length; i += 1) {
      const a = rects[i - 1];
      const b = rects[i];
      if (i % cols !== 0) assert.equal(b.x - (a.x + a.width), METRICS.gap, `count ${count}, tile ${i}`);
    }
    const right = Math.max(...rects.map((r) => r.x + r.width));
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    assert.equal(right, window.width - METRICS.gap, `count ${count} reaches the right edge`);
    assert.equal(bottom, window.height - METRICS.gap, `count ${count} reaches the bottom edge`);
  }
});

test('the last tile takes the empty cells after it', () => {
  const rects = tileRects({ ...window, count: 3 });
  const last = rects[2];
  assert.equal(last.x, rects[0].x);
  assert.equal(last.width, window.width - METRICS.gap * 2);
});

test('single view places only the focused project', () => {
  const rects = tileRects({ ...window, count: 4, mode: 'single', focusedIndex: 2 });
  assert.deepEqual(rects.map((r) => r.visible), [false, false, true, false]);
});

test('equal shares are the same grid as no shares at all', () => {
  for (const count of [2, 3, 4, 5, 6, 9]) {
    const { cols, rows } = gridShape(count);
    const even = {
      cols: Array.from({ length: cols }, () => 1),
      rows: Array.from({ length: rows }, () => 1),
    };
    assert.deepEqual(tileRects({ ...window, count, sizes: even }), tileRects({ ...window, count }));
  }
});

test('shares set the columns, and the gaps stay equal', () => {
  const rects = tileRects({ ...window, count: 4, sizes: { cols: [3, 1] } });
  assert.equal(rects[0].x, METRICS.gap);
  assert.equal(rects[1].x - (rects[0].x + rects[0].width), METRICS.gap);
  assert.equal(rects[0].x + rects[0].width + METRICS.gap, rects[1].x);
  assert.ok(rects[0].width > rects[1].width * 2.5, 'the wide column really is wide');
  assert.equal(rects[1].x + rects[1].width, window.width - METRICS.gap);
  // The rows are untouched by a column drag.
  assert.equal(rects[0].height, rects[2].height);
});

test('a shape remembers the grid, not the count: three and four share it', () => {
  assert.equal(shapeKey(3), shapeKey(4));
  assert.notEqual(shapeKey(4), shapeKey(5));
  assert.equal(shapeKey(1), '1x1');
});

test('a stretched last tile has no gutter over it', () => {
  // Three projects: 2x2 with the third stretched across the bottom, so the only column gutter
  // is in the top row and there is one row gutter.
  const splitters = gridSplitters({ ...window, count: 3 });
  assert.deepEqual(splitters.map((s) => `${s.axis}${s.index}`), ['cols1', 'rows1']);

  const rects = tileRects({ ...window, count: 3 });
  const [column] = splitters;
  assert.equal(column.x, rects[0].x + rects[0].width);
  assert.equal(column.width, METRICS.gap);
  assert.equal(column.height, rects[0].height);

  // Five projects: 3x2, and the fifth stretches over the third column of the bottom row.
  assert.deepEqual(
    gridSplitters({ ...window, count: 5 }).map((s) => `${s.axis}${s.index}`),
    ['cols1', 'cols2', 'cols1', 'rows1'],
  );
});

test('no gutter to drag when there is nothing to drag it between', () => {
  assert.deepEqual(gridSplitters({ ...window, count: 1 }), []);
  assert.deepEqual(gridSplitters({ ...window, count: 4, mode: 'single' }), []);
});

test('a gutter follows the pointer and moves only its own two shares', () => {
  const count = 9;
  const at = (position) => gridResize({ ...window, count, axis: 'cols', index: 1, position });

  const sizes = at(400);
  const rects = tileRects({ ...window, count, sizes });
  // The gutter's centre lands on the pointer.
  assert.equal(rects[0].x + rects[0].width + METRICS.gap / 2, 400);
  // The third column is exactly where it was.
  assert.equal(rects[2].x, tileRects({ ...window, count })[2].x);
  assert.equal(sizes.cols[2], 1 / 3);
  assert.equal(sizes.cols[0] + sizes.cols[1], 2 / 3);
});

test('a tile can be dragged small but never to nothing', () => {
  const count = 4;
  for (const position of [-4000, 0, 40, 4000]) {
    const sizes = gridResize({ ...window, count, axis: 'cols', index: 1, position });
    const rects = tileRects({ ...window, count, sizes });
    for (const rect of rects) assert.ok(rect.width >= METRICS.min - 1, `width ${rect.width} at ${position}`);
  }
});

test('a drag nobody can make is a grid nobody changed', () => {
  const sizes = { cols: [0.7, 0.3] };
  for (const bad of [{ axis: 'cols', index: 0 }, { axis: 'cols', index: 2 }, { axis: 'nope', index: 1 }]) {
    assert.equal(gridResize({ ...window, count: 4, sizes, position: 500, ...bad }), sizes);
  }
});

test('rows are dragged in window coordinates, under the strip', () => {
  const count = 4;
  const sizes = gridResize({ ...window, count, axis: 'rows', index: 1, position: 300 });
  const rects = tileRects({ ...window, count, sizes });
  assert.equal(rects[0].y + rects[0].height + METRICS.gap / 2, 300);
  assert.equal(rects[0].y, METRICS.strip);
});
