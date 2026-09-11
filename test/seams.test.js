import fs from 'node:fs';
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
    'name', 'defaults', 'settings', 'keybindings', 'patch', 'extension', 'builtin', 'css', 'init',
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
// spends, so one name moves the veil, the wash, the ground and the ink together and a rung means
// the same thing on either dial. The other half is that a window is handed ONE rung - which of
// the two dials it came off is the app's business - so a rung nobody set, and a rung that is no
// longer a rung, both land on the middle one, which is what a window with nothing set wears.
test('a tint rung scales every amount the seam spends, and the middle one is the default', () => {
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

  const medium = { ground: 79.1, wash: 85.7, veil: 96.15, ink: 0.0275 };
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

// The chat tab's icon as the workbench actually spells it: the tab carries the panel's view type
// on `data-resource-name`, and the icon is an inline background-image pointing at a remote
// resource whose `path` is percent-encoded. All three are things that can move under the seam,
// and the only symptom would be a log that stays empty - so the markup is a fixture, captured
// from a live window running code-server against Claude Code 2.1.263.
const TAB_MARKUP = {
  resource: 'webview-claudeVSCodePanel-f4a625b3-7037-4f01-9542-e0d1c8ad25f4',
  background: 'url("http://127.0.0.1:57846/stable-de89acbcdce9d9b870008a270c9f6466993d91f4'
    + '/vscode-remote-resource?path=%2FUsers%2Fjp%2FLibrary%2FApplication%20Support%2FCode%20Tiles'
    + '%2Fextensions%2Fanthropic.claude-code-2.1.263-darwin-arm64%2Fresources%2Fct-claude-working.svg'
    + '&tkn=abc")',
};

// The seam's init, driven the way a window drives it, with the observer and the timer stubbed so
// the report is synchronous. Returns every payload it sent.
function chatIconReports(icons) {
  const seam = seams.find((candidate) => candidate.name === 'chat-icon');
  const nodes = icons.map((background) => ({ style: { backgroundImage: background } }));
  const workbench = { querySelectorAll: () => nodes };
  const sent = [];
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} };
  try {
    seam.init({
      whenWorkbench: (callback) => callback(workbench),
      send: (type, payload) => sent.push({ type, payload }),
    });
  } finally {
    globalThis.MutationObserver = previous;
  }
  return sent;
}

test('the chat-icon seam reports the icon file name a live tab carries', () => {
  const sent = chatIconReports([TAB_MARKUP.background]);
  assert.deepEqual(sent, [{ type: 'claude:icon', payload: { icons: ['ct-claude-working.svg'] } }]);
});

test('the chat-icon seam reports an empty list when no Claude tab is open', () => {
  const sent = chatIconReports([]);
  assert.deepEqual(sent, [{ type: 'claude:icon', payload: { icons: [] } }]);
});

// The selector has to name the tab by its view type, or it reports every tab in the window.
test('the chat-icon seam looks the Claude panel up by its view type', () => {
  const seam = seams.find((candidate) => candidate.name === 'chat-icon');
  const asked = [];
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} };
  try {
    seam.init({
      whenWorkbench: (callback) => callback({ querySelectorAll: (selector) => (asked.push(selector), []) }),
      send: () => {},
    });
  } finally {
    globalThis.MutationObserver = previous;
  }
  assert.equal(asked.length, 1);
  assert.match(asked[0], /^\.tab\[data-resource-name\^=/);
  assert.ok(TAB_MARKUP.resource.startsWith(asked[0].match(/\^="([^"]+)"/)[1]),
    `${asked[0]} would not match ${TAB_MARKUP.resource}`);
});

// The shell paints a tile's ground before that tile has a window, so two places draw one colour
// and only one of them owns the rungs. They drifted: the shell held `strong`'s shares as literals
// while the shipped default is `medium`, so every tile's corners - which the card seam leaves
// unpainted - carried a colour no window ever wore. The share the shell is SENT is asserted here
// against the seam's own stylesheet, which is the only place that can still tell them apart.
test('the ground the shell is sent is the ground the tint seam paints', async () => {
  const { groundShares } = await import('../src/guest/manifest-settings.js');
  const tint = seams.find((seam) => seam.name === 'tint');

  for (const rung of ['subtle', 'medium', 'strong']) {
    const shares = groundShares({ focused: rung, quiet: rung });
    for (const [dial, focused] of [['focused', true], ['quiet', false]]) {
      const css = tint.css({ hue: 200, tint: rung, focused });
      assert.ok(
        css.includes(`var(--vscode-titleBar-activeBackground) ${shares[dial]},`),
        `${rung}/${dial}: the seam does not paint the ${shares[dial]} the shell is handed`,
      );
    }
  }
});

// An unreadable rung is one window at the middle setting, never a window with no ground: the
// state file is editable by hand and older builds wrote rungs this one may not know.
test('a rung that is not a rung falls back to medium rather than to nothing', async () => {
  const { groundShares } = await import('../src/guest/manifest-settings.js');
  assert.deepEqual(groundShares({}), groundShares({ focused: 'medium', quiet: 'medium' }));
  assert.deepEqual(groundShares({ focused: 'loud', quiet: null }), groundShares({}));
});

// The editor's own corners follow the same preference: scaled tokens and a squircle default for
// `squircle`, and nothing at all for `round`, which is the editor as it ships.
test('the corners seam scales the editor only when the preference is squircle', () => {
  const corners = seams.find((seam) => seam.name === 'corners');
  const css = corners.css({ ...contexts[0], corners: 'squircle' });
  assert.ok(css.includes('--vscode-cornerRadius-large: 14.72px;'), css);
  assert.ok(css.includes('corner-shape: squircle;') && css.includes('corner-shape: round;'), css);
  assert.equal(corners.css({ ...contexts[0], corners: 'round' }), '');
});

// The tile's corner is said once, in src/guest/corners.cjs: the card seam draws it off the window's
// context, and main hands the same values to the shell, where the glow is struck around them. Every
// shape, and one that is not a shape, which both sides must read as the same default.
test('the card seam draws the corner the shell is handed', () => {
  const corners = require('../src/guest/corners.cjs');
  const card = seams.find((seam) => seam.name === 'card');
  for (const shape of [...corners.SHAPES, 'hexagon', undefined]) {
    const css = card.css({ ...contexts[0], corners: shape });
    const { squircle, tileRadius } = corners.cornerValues(shape);
    assert.ok(css.includes(`border-radius: ${tileRadius}px;`), `${shape}: no ${tileRadius}px corner in\n${css}`);
    assert.ok(css.includes(`corner-shape: ${squircle ? 'squircle' : 'round'};`), `${shape}:\n${css}`);
  }
});

// A seam reaches the runtime through `api` and nothing else, and the two are in different files
// on different module systems - so a seam calling something the preload does not expose fails
// INSIDE a window, at the moment that seam runs, with nothing on any console anyone is reading.
// Read from the source because runtime.cjs requires electron and cannot be loaded here.
test('every api a seam calls is one the runtime hands it', () => {
  const runtime = fs.readFileSync(new URL('../src/guest/runtime.cjs', import.meta.url), 'utf8');
  const literal = runtime.match(/const api = \{([\s\S]*?)\n\};/);
  assert.ok(literal, 'the runtime no longer declares an `api` object literal');
  const offered = new Set([...literal[1].matchAll(/(?:^|\n)\s*(?:get\s+)?([A-Za-z]\w*)[(:,]/g)]
    .map((hit) => hit[1]));

  const dir = new URL('../src/guest/seams/', import.meta.url);
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(new URL(file, dir), 'utf8');
    for (const [, used] of source.matchAll(/\bapi\.(\w+)/g)) {
      assert.ok(offered.has(used), `${file} calls api.${used}, which runtime.cjs does not offer`);
    }
  }
});

// The Claude page is found by the stylesheet it links out of its own install directory. However the
// host spells that resource - a plain path or a percent-encoded `path=` - the id has nothing to
// encode, and a sweep that comes back every second must find its own sheet rather than add another.
test('the chat-calm sheet lands in the Claude page once, and in no other webview', () => {
  const seam = seams.find((candidate) => candidate.name === 'chat-calm');
  const sheetFor = (href) => {
    const element = { id: '', textContent: '', parentElement: null };
    let appends = 0;
    const root = { appendChild: (node) => { node.parentElement = root; appends += 1; } };
    const document = {
      documentElement: root,
      querySelector: (selector) => {
        const needle = selector.match(/^link\[href\*="([^"]+)"\]$/)[1];
        return href && href.includes(needle) ? {} : null;
      },
      getElementById: () => (element.parentElement ? element : null),
      createElement: () => element,
    };
    seam.init({ eachDocument: (visit) => { visit(document); visit(document); } });
    assert.ok(appends <= 1, `${appends} sheets for one page`);
    return element.parentElement === root ? element.textContent : null;
  };

  const plain = sheetFor('https://file+.vscode-resource.vscode-cdn.net/Users/jp/Library'
    + '/Application%20Support/Code%20Tiles/extensions/anthropic.claude-code-2.1.267-darwin-arm64'
    + '/webview/index.css');
  const encoded = sheetFor('http://127.0.0.1:57846/stable-de89/vscode-remote-resource?path=%2FUsers'
    + '%2Fjp%2Fextensions%2Fanthropic.claude-code-2.1.267-darwin-arm64%2Fwebview%2Findex.css');
  assert.ok(plain, 'no sheet in the Claude page');
  assert.equal(encoded, plain);
  assert.equal(sheetFor('https://file+.vscode-resource.vscode-cdn.net/x'
    + '/vscode.markdown-language-features/media/markdown.css'), null, 'a Markdown preview got it');
  assert.equal(sheetFor(null), null, 'the frame wrapping a webview got it');

  const output = plain.match(/\[class\*="toolResult_"\] \{([\s\S]*?)\n\}/);
  assert.ok(output, "no rule for a tool's output");
  assert.match(output[1], /--app-code-background: transparent/);
  assert.doesNotMatch(output[1], /background-color/, 'the extension paints it, not us');
  assert.match(plain, /\[aria-label="Learn Claude Code"\]:not\(:hover, :focus\) \{/,
    'the Learn button has to be dimmed at rest only');
});
