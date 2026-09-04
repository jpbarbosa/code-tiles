import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const seams = require('../src/guest/manifest.cjs');

// A seam's CSS is a template literal, so a stray backtick in one of its comments ends the string
// and the file stops parsing. The runtime requires the whole manifest in one go from a preload,
// which means ONE broken seam leaves a window with none of them - a tile that reads as "the app
// lost everything" rather than as a syntax error anyone can see. This is the cheap gate: it runs
// the same require and the same render, off the same list.
const contexts = [
  { folder: '/tmp/probe', name: 'probe', hue: 0, icon: null, claudeState: 'idle', focused: true,
    maximized: true, layout: { sideBar: true, panel: true, secondarySideBar: false } },
  { folder: '', name: '', hue: 359, icon: null, claudeState: 'busy', focused: false,
    maximized: false, layout: { sideBar: null, panel: null, secondarySideBar: null } },
];

test('every seam on the manifest loads and is named', () => {
  assert.ok(seams.length > 0);
  const names = seams.map((seam) => seam.name);
  assert.ok(names.every(Boolean), `unnamed seam among ${names.join(', ')}`);
  assert.equal(new Set(names).size, names.length, `duplicate name among ${names.join(', ')}`);
});

test('every seam renders its CSS for a focused and an unfocused window', () => {
  for (const seam of seams.filter((candidate) => candidate.css)) {
    for (const context of contexts) {
      const css = seam.css(context);
      assert.equal(typeof css, 'string', `${seam.name} returned ${typeof css}`);
      // Braces balance, which is what a truncated template literal or a dropped block breaks.
      const opens = (css.match(/\{/g) || []).length;
      const closes = (css.match(/\}/g) || []).length;
      assert.equal(opens, closes, `${seam.name} has ${opens} { against ${closes} }`);
    }
  }
});

test('a seam declares only the parts a seam has', () => {
  const allowed = new Set(['name', 'defaults', 'settings', 'patch', 'css', 'init']);
  for (const seam of seams) {
    const extra = Object.keys(seam).filter((key) => !allowed.has(key));
    assert.deepEqual(extra, [], `${seam.name} declares ${extra.join(', ')}`);
  }
});
