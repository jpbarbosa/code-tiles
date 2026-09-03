import test from 'node:test';
import assert from 'node:assert/strict';
import { tileRects, METRICS } from '../src/main/layout.js';

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
