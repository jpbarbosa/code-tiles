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
  { folder: '', name: '', hue: 359, icon: null, claudeState: 'working', focused: false,
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
  const allowed = new Set([
    'name', 'defaults', 'settings', 'keybindings', 'patch', 'extension', 'css', 'init',
  ]);
  for (const seam of seams) {
    const extra = Object.keys(seam).filter((key) => !allowed.has(key));
    assert.deepEqual(extra, [], `${seam.name} declares ${extra.join(', ')}`);
  }
});

// The badge's ring is the only thing in a window that moves on its own, and it is drawn from a
// state the app pushes in. A rule left behind for a project with nothing running is an animation
// on every idle tile, which costs a frame each for as long as the app is open.
test('the badge wears a ring for what Claude is doing, and nothing when it is doing nothing', () => {
  const identity = seams.find((seam) => seam.name === 'identity');
  const ring = (claudeState) => identity.css({ ...contexts[0], claudeState });

  for (const state of ['working', 'attention', 'finished']) {
    assert.match(ring(state), /menubar-menu-title \{/, `${state} draws no ring`);
    assert.match(ring(state), /@keyframes ct-ring-/, `${state} names an animation it does not define`);
  }
  for (const state of ['idle', 'active', undefined]) {
    assert.doesNotMatch(ring(state), /ct-ring-/, `${String(state)} left an animation running`);
  }
});

// A webview rewrites its own document with document.open(), which keeps the Document OBJECT and
// takes every listener registered on it. A seam that remembers having been inside a document
// therefore goes deaf in exactly the frame the Claude panel lives in, and the tile stops
// claiming focus when you click into its chat. So: said again on every sweep, not once.
test('the focus seam registers on every sweep, not once per document', () => {
  const focus = seams.find((seam) => seam.name === 'focus');
  const registered = [];
  const document = {
    addEventListener: (type, listener, capture) => registered.push({ type, listener, capture }),
  };
  focus.init({
    context: { focused: false },
    send: () => {},
    eachDocument: (callback) => { callback(document); callback(document); },
  });

  assert.equal(registered.length, 2, 'the same document was visited twice and hooked once');
  assert.deepEqual(registered.map((entry) => entry.type), ['pointerdown', 'pointerdown']);
  // The DOM only drops the repeat when type, callback AND capture all match.
  assert.equal(registered[0].listener, registered[1].listener);
  assert.deepEqual(registered.map((entry) => entry.capture), [true, true]);
});
