import test from 'node:test';
import assert from 'node:assert/strict';
import { gridResize, gridShape, gridSplitters, rectAt, shapeKey, tileRects, METRICS } from '../src/main/layout.js';

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

test('maximized: the master takes a column of its own and the rest stack beside it', () => {
  const rects = tileRects({ ...window, count: 4, mode: 'master', masterIndex: 1 });
  const [first, master, third, fourth] = rects;

  assert.equal(master.y, METRICS.strip);
  assert.equal(master.height, window.height - METRICS.strip - METRICS.gap);
  assert.ok(master.width > window.width * 0.65, `master ${master.width} is about seven tenths`);

  // The stack keeps the project order, in one column, under the same gaps as any grid.
  for (const tile of [first, third, fourth]) assert.equal(tile.x, master.x + master.width + METRICS.gap);
  assert.equal(first.y, master.y);
  assert.equal(third.y - (first.y + first.height), METRICS.gap);
  assert.equal(fourth.y + fourth.height, window.height - METRICS.gap);
  assert.equal(first.x + first.width, window.width - METRICS.gap);
});

test('maximized with two projects is one row beside the master, and with one it is the grid', () => {
  const pair = tileRects({ ...window, count: 2, mode: 'master', masterIndex: 0 });
  assert.equal(pair[1].height, pair[0].height);
  assert.deepEqual(
    tileRects({ ...window, count: 1, mode: 'master' }),
    tileRects({ ...window, count: 1 }),
  );
});

test('the focus does not move the master column: only the master index places it', () => {
  const shape = { ...window, count: 3, mode: 'master', masterIndex: 2 };
  const wide = (rects) => rects.findIndex((rect) => rect.height === rects[2].height
    && rect.width === Math.max(...rects.map((other) => other.width)));
  // The same master, whichever tile the focus is on.
  for (const focusedIndex of [0, 1, 2]) {
    assert.equal(wide(tileRects({ ...shape, focusedIndex })), 2, `focus on ${focusedIndex}`);
  }
});

test('a maximized shape is remembered apart from the even grid it came from', () => {
  assert.equal(shapeKey(4, 'master'), 'master3');
  assert.notEqual(shapeKey(4, 'master'), shapeKey(4));
  assert.equal(shapeKey(3, 'master'), shapeKey(3, 'master'));
  assert.notEqual(shapeKey(3, 'master'), shapeKey(4, 'master'));
  // Nothing to maximize, nothing to name apart.
  assert.equal(shapeKey(1, 'master'), '1x1');
  assert.deepEqual(gridShape(4, 'master'), { cols: 2, rows: 3 });
});

test('the master runs down every row seam, so those handles stop at the stack', () => {
  const count = 4;
  const splitters = gridSplitters({ ...window, count, mode: 'master' });
  assert.deepEqual(splitters.map((s) => `${s.axis}${s.index}`), ['cols1', 'rows1', 'rows2']);

  const rects = tileRects({ ...window, count, mode: 'master', masterIndex: 0 });
  const [column, ...rows] = splitters;
  assert.equal(column.x, rects[0].x + rects[0].width);
  assert.equal(column.height, rects[0].height, 'the master seam runs the whole height');
  for (const row of rows) {
    assert.equal(row.x, rects[1].x);
    assert.equal(row.width, rects[1].width);
  }

  // One stacked project has no row to divide.
  assert.deepEqual(
    gridSplitters({ ...window, count: 2, mode: 'master' }).map((s) => s.axis),
    ['cols'],
  );
});

test('the master column is dragged from its own default, not from an even one', () => {
  const count = 3;
  const shape = { ...window, count, mode: 'master' };
  const sizes = gridResize({ ...shape, axis: 'cols', index: 1, position: 600 });
  const rects = tileRects({ ...shape, sizes, masterIndex: 0 });
  assert.equal(rects[0].x + rects[0].width + METRICS.gap / 2, 600);

  // Undragged, the split is the master's 2.4 : 1 and not the grid's halves.
  const [master] = tileRects({ ...shape, masterIndex: 0 });
  const even = tileRects({ ...window, count: 4 })[0];
  assert.ok(master.width > even.width * 1.3, `master ${master.width} against an even ${even.width}`);
});

// Where a tile drag lands. Main hit-tests the cursor against the rects it placed the views from,
// so this is the whole of what a drop over a tile means.
test('a point lands in the tile it is over, and in no gutter', () => {
  const rects = tileRects({ ...window, count: 4 });
  rects.forEach((rect, index) => {
    const middle = [rect.x + rect.width / 2, rect.y + rect.height / 2];
    assert.equal(rectAt(rects, ...middle), index, `the middle of tile ${index}`);
    assert.equal(rectAt(rects, rect.x, rect.y), index, `the top left corner of tile ${index}`);
    // The far edge is already the gutter: a tile owning the pixel its neighbour starts on would
    // make a drop over it depend on which of the two was asked first.
    assert.equal(rectAt(rects, rect.x + rect.width, rect.y), -1, `the right edge of tile ${index}`);
    assert.equal(rectAt(rects, rect.x, rect.y + rect.height), -1, `the bottom edge of tile ${index}`);
  });

  assert.equal(rectAt(rects, 0, 0), -1, 'the strip is nobody\'s tile');
  assert.equal(rectAt(rects, window.width, window.height), -1, 'past the last tile');
});

test('a hidden tile is no drop target', () => {
  const rects = tileRects({ ...window, count: 3, mode: 'single', focusedIndex: 1 });
  assert.equal(rectAt(rects, window.width / 2, window.height / 2), 1);
  // Every other rect is the zero one every hidden tile carries, and the origin is inside it.
  assert.equal(rectAt(rects, 0, 0), -1);
});
