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
    tiled: true, maximized: true, layout: { sideBar: true, panel: true, secondarySideBar: false } },
  // The window that is not one of several: single view, or the only project. Both of the app's
  // own controls inside a window hang on that, so it is a shape every seam is rendered for.
  { folder: '', name: '', hue: 359, icon: null, claudeState: 'working', focused: false,
    tiled: false, maximized: false, layout: { sideBar: null, panel: null, secondarySideBar: null } },
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

test('the badge wears the project favicon, or its initial where there is none', () => {
  const identity = seams.find((seam) => seam.name === 'identity');
  const badge = (context) => identity.css({ ...contexts[0], ...context });

  const icon = badge({ icon: 'data:image/png;base64,AAA', name: 'code-tiles', hue: 30 });
  assert.match(icon, /background-image: url\("data:image\/png;base64,AAA"\)/);
  assert.match(icon, /content: "" !important/, 'a favicon left a letter under it');

  const letter = badge({ icon: null, name: 'code-tiles', hue: 30 });
  assert.match(letter, /content: "C" !important/);
  assert.match(letter, /background: oklch\(0\.62 0\.15 30\)/, 'the plate is not on the project hue');
  assert.doesNotMatch(letter, /background-image/, 'a letter is drawn as an image');

  // A folder whose name is empty still has a badge to draw, and the ring is placed against it.
  assert.match(badge({ icon: null, name: '  ' }), /content: "\?" !important/);
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

// The × is in every window - a tile in the grid has no chip in the strip to close it from - and
// the room it takes out of the editor's title row is its own size said again. The two are what
// cannot drift apart: room for a button that is not there is a hole in the tab row nobody can
// point at, and a plate wider than its room is a plate over the editor's own actions.
test('the corner reserves exactly the room its button takes', () => {
  const close = seams.find((seam) => seam.name === 'close');
  const css = close.css(contexts[0]);
  const room = Number(css.match(/--ct-close-room: (\d+)px/)[1]);
  const width = Number(css.match(/\.ct-close \{[\s\S]*?width: (\d+)px/)[1]);

  assert.equal(room, width);
  assert.equal(close.css(contexts[1]), css, 'and a window that is not one of several has it too');
});

// The badge is the tile's handle only while there are other tiles to move it among. In single
// view, and on a lone project, the press belongs to the menu underneath and nothing may say
// otherwise - a grab cursor over a button that will not drag is the app lying about itself.
test('the badge offers a grab only where there is something to rearrange', () => {
  const identity = seams.find((seam) => seam.name === 'identity');

  assert.match(identity.css({ ...contexts[0], tiled: true }), /menubar-menu-button \{ cursor: grab; \}/);
  assert.doesNotMatch(identity.css({ ...contexts[0], tiled: false }), /cursor: grab/);
});

// The tint dial. Its whole contract is that a rung is a MULTIPLIER on what the seam already
// spent: `medium` has to leave every number exactly where it was before there was a dial, or
// adding the preference silently repaints every window that never asked for one. The other half
// is that a window is handed ONE rung - which of the two dials it came off is the app's business -
// so a rung nobody set, and a rung that is no longer a rung, both land on the middle one.
test('a tint rung scales what the seam spends, and medium spends what it always did', () => {
  const tint = seams.find((seam) => seam.name === 'tint');
  const amounts = (context) => {
    const css = tint.css({ ...contexts[0], ...context });
    return {
      // Each is the share of the THEME in a mix, so more colour is a smaller number.
      ground: Number(css.match(/titleBar-activeBackground\) ([\d.]+)%/)[1]),
      wash: Number(css.match(/--ct-wash: ([\d.]+)%/)[1]),
      veil: Number(css.match(/--ct-veil: ([\d.]+)%/)[1]),
      ink: Number(css.match(/--ct-ink-chroma: ([\d.]+)/)[1]),
    };
  };

  const medium = { ground: 62, wash: 74, veil: 93, ink: 0.05 };
  assert.deepEqual(amounts({ tint: 'medium' }), medium);
  assert.deepEqual(amounts({ tint: 'nonsense' }), medium, 'an unknown rung is the middle one');
  assert.deepEqual(amounts({ tint: undefined }), medium, 'and so is a window told nothing');
  // A quiet tile is quieter at every rung, which is the whole reason focus reads across a grid.
  assert.ok(amounts({ tint: 'medium', focused: false }).ground > medium.ground);

  for (const [rung, louder] of [['subtle', false], ['strong', true]]) {
    const moved = amounts({ tint: rung });
    for (const key of ['ground', 'wash', 'veil']) {
      assert.equal(moved[key] < medium[key], louder, `${rung} moved ${key} the wrong way`);
    }
    assert.equal(moved.ink > medium.ink, louder, `${rung} moved the ink the wrong way`);
  }
});

// The one surface in a window that a mix cannot reach. The theme ships the chat's user turn at
// `input.background`, which it is free to make the very colour of the page behind it - Dark 2026
// does - so tinting both leaves them equal and the bubble stays its own hairline. What the seam
// writes instead is the EXTENSION's own variable, on the bubble alone: the extension's rule spends
// it, and so does its truncation fade and its attachment pills. Two things are then load-bearing
// and neither is visible from the rule: the trailing underscore, without which the same sheet
// paints `userMessageContainer_` and `userMessageAttachments_` as well, and the seam declaring no
// background of its own.
test('the chat paints your own turns, and paints nothing that merely shares their prefix', () => {
  const tint = seams.find((seam) => seam.name === 'tint');
  const raws = {
    '--vscode-editor-background': '#191a1b',
    '--vscode-input-background': '#191a1b',   // the tie, which is the whole reason for the rule
    '--vscode-titleBar-activeBackground': '#191a1b',
  };
  const written = webviewSheet(tint, { hue: 276, focused: true, tint: 'medium' }, raws);

  const rule = written.match(/\[class\*="userMessage_"\] \{([\s\S]*?)\n\}/);
  assert.ok(rule, 'no rule for your own turns');
  assert.match(rule[1], /--app-input-background: oklch\(from color-mix/);
  assert.doesNotMatch(rule[1], /background-color/, 'the extension paints it, not us');
  assert.doesNotMatch(written, /!important;\s*\n\s*border-color/, 'and it needs no !important');
  // The selector is a substring match, so the two siblings are excluded by that underscore alone.
  for (const sibling of ['userMessageContainer_07S1Yg', 'userMessageAttachments_07S1Yg']) {
    assert.ok(!sibling.includes('userMessage_'), `${sibling} would be painted too`);
  }
});

// A document shaped the way a webview's is - the theme written INLINE on its root, a frame chain
// pointing back at the part it is drawn over - driven through the seam's own init, so the test
// exercises the path a window takes rather than a copy of it.
function webviewSheet(seam, context, raws) {
  const names = Object.keys(raws);
  const element = { id: '', textContent: '', parentElement: null };
  const part = { classList: { contains: (name) => name === 'editor' } };
  const root = {
    style: { ...names, length: names.length, getPropertyValue: (name) => raws[name] || '' },
    appendChild: (node) => { node.parentElement = root; },
  };
  const document = {
    documentElement: root,
    defaultView: { frameElement: { closest: () => part } },
    getElementById: () => (element.parentElement ? element : null),
    createElement: () => element,
  };
  seam.init({ context, eachDocument: (visit) => visit(document) });
  assert.equal(element.parentElement, root, 'the sheet has to land on the root, not in <head>');
  return element.textContent;
}
