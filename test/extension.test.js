import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { declaredExtensions, missingPatches, patchExtensions } from '../src/guest/disk/extension.js';
import { ExtensionPatches } from '../src/main/patches.js';

const require = createRequire(import.meta.url);
const seams = require('../src/guest/manifest.cjs');

// The spellings the two seams that patch this bundle anchor on. Not the real bundle - a version
// that moves these is caught by running the app, not by a test - but enough to hold the mechanism
// and both seams' edits to their contract.
//
// The resting icon has had TWO spellings, and both are kept on purpose: 2.1.260 wrote an if/else
// chain settling on a variable, 2.1.261 replaced it with a lookup table indexed by a state name.
// Anchoring on the chain is exactly what broke on that bump, so the anchor is held here to the
// family rather than to whichever spelling shipped last.
const ICON_TABLE = 'applyTabIcon(){if(!this.panelTab)return;'
  + 'let s=pick$(this.lastRenameTabFlags,this.tabBadgeAnchor,{});'
  + 'this.panelTab.iconPath=_$.Uri.file(z6.join(this.context.extensionPath,"resources",names$[s]))}';

const ICON_CHAIN = 'applyTabIcon(){let X="claude-logo.svg";'
  + 'if(this.hasPendingPermissions)X="claude-logo-pending.svg";else if(J)X="claude-logo-done.svg";'
  + 'else X="claude-logo.svg";'
  + 'this.panelTab.iconPath=_$.Uri.file(z6.join(this.context.extensionPath,"resources",X))}';

// The state branch as 2.1.261 spells it: a body between the decode and an optional call.
const STATE = 'onMessage($){if($.request.type==="update_session_state"){let Q=decode$($.request);'
  + 'if(Q){let{anchor:X}=badge$(this.tabBadgeAnchor,Q);'
  + 'if(this.tabBadgeAnchor=X,this.onSessionStateChanged?.(Q.sessionId,Q.state))return}}}';

// The same branch with a guard on the property the shape scans lazily for. Landing the injected
// call there instead is valid syntax and inverts the guard, so nothing downstream can catch it.
const STATE_DECOY = STATE.replace('if(Q){let{anchor:X}',
  'if(Q){if(!this.onSessionStateChanged)return;let{anchor:X}');

// The two things this seam reads as strings rather than as shapes. A bundle that still declares
// both is a bundle that is not drifting, which is what the fixtures should model.
const STRINGS = 'var states$=["idle","running","waiting_input"],'
  + 'names$={pending:"claude-logo-pending.svg",done:"claude-logo-done.svg",plain:"claude-logo.svg"};';

// The column pick as 2.1.280 spells it: an existing Claude group, else a group started for it with
// `newGroupRight`. `W` is startedInNewColumn, and the caller locks the group the panel lands in
// whenever it is true.
const COLUMN = 'async createPanel($,J,Q){let W=!1,K;if(Q!==void 0)K=Q;'
  + 'else{let V=O4.window.tabGroups.all,B=ih$(V);if(!B){B=await this.startClaudeGroup()}'
  + 'K=B?.viewColumn??O4.ViewColumn.Active,W=B?.startsClaudeGroup??!1}'
  + 'let U=O4.window.createWebviewPanel("claudeVSCodePanel","Claude Code",K,{});return{startedInNewColumn:W}}'
  + 'startClaudeGroup(){if(this.claudeGroupStart)return this.claudeGroupStart;let $=(async()=>{'
  + 'await O4.commands.executeCommand("workbench.action.newGroupRight");'
  + 'return{viewColumn:O4.window.tabGroups.all.length,startsClaudeGroup:!0}})();'
  + 'this.claudeGroupStart=$;return $}';

// `openFile` as the extension spells it - the file opened as TEXT, then a location sought in it -
// except that this one RETURNS the chain, so a test can see how it ends. The extension drops it,
// which is why a failed open says nothing.
const OPEN = 'openFile($,Q){let z=E$.Uri.file($);return E$.window.showTextDocument(z).then((W)=>{'
  + 'if(Q?.searchText){W.revealRange(Q.searchText)}else if(Q){W.selection=Q}})}';

// The same open as 2.1.274 spells it: show options worked out from the link and passed alongside.
const OPEN_PINNED = OPEN
  .replace('openFile($,Q){', 'openFile($,Q,J){')
  .replace('return E$', 'let G=J?.pinned?{preview:!1}:void 0;return E$')
  .replace('showTextDocument(z)', 'showTextDocument(z,G)');

const BUNDLE = `${STRINGS}class T{${ICON_TABLE}${STATE}${COLUMN}${OPEN}}\n`;

function tree(bundle = BUNDLE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extension-'));
  const folder = path.join(dir, 'anthropic.claude-code-9.9.9-darwin-arm64');
  fs.mkdirSync(path.join(folder, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'extension.js'), bundle);
  return { dir, file: path.join(folder, 'extension.js') };
}

const read = (file) => fs.readFileSync(file, 'utf8');

test('every extension patch declares what the mechanism needs of it', () => {
  const declared = declaredExtensions(seams);
  assert.deepEqual(declared.map((entry) => entry.name), ['chat-icon', 'chat-column', 'chat-links']);
  for (const { name, extension } of declared) {
    for (const key of ['id', 'file', 'marker', 'stamp', 'degrades', 'apply']) {
      assert.ok(extension[key], `${name}: an extension patch without ${key}`);
    }
  }
  const icon = declared.find((entry) => entry.name === 'chat-icon').extension;
  assert.ok(Object.keys(icon.resources).length, 'a patch that points at no resources');
});

// Several seams, one file. Patched a seam at a time from the backup, each would start over from the
// pristine source and only the last edit would survive - which is silent, because every pass
// reports success.
test('the seams on one bundle are spent in one pass and every edit survives', () => {
  const { dir, file } = tree();
  assert.deepEqual(patchExtensions(dir),
    ['chat-icon + chat-column + chat-links in anthropic.claude-code-9.9.9-darwin-arm64']);
  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_2__/);
  assert.match(patched, /__CT_CHAT_COLUMN_3__/);
  assert.match(patched, /__CT_CHAT_LINKS_2__/);
  assert.equal(read(`${file}.ct-orig`), BUNDLE, 'one pristine copy, not one per seam');
});

// The column seam's contract, RUN against a fake API rather than read out of the patched text, so
// a later anchor is free to spell its edit however it likes.
async function openPanel(source, { column, claudeGroup } = {}) {
  const opened = [];
  const commands = [];
  const groups = [{ viewColumn: 1 }];
  const O4 = {
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    window: {
      tabGroups: { all: groups },
      createWebviewPanel: (type, title, at) => { opened.push(at); return {}; },
    },
    commands: {
      executeCommand: async (command) => { commands.push(command); groups.push({ viewColumn: groups.length + 1 }); },
    },
  };
  const T = new Function('O4', 'ih$', `${source}\nreturn T;`)(O4, () => claudeGroup);
  const { startedInNewColumn } = await Object.create(T.prototype).createPanel(undefined, undefined, column);
  return { column: opened[0], locks: startedInNewColumn, commands };
}

const columnSeam = declaredExtensions(seams).find((entry) => entry.name === 'chat-column').extension;

test('a session opens in the first group, unlocked, and starts no group of its own', async () => {
  assert.deepEqual(await openPanel(`class T{${COLUMN}}`),
    { column: 2, locks: true, commands: ['workbench.action.newGroupRight'] },
    'the fixture no longer models the split it exists to stop');
  const { source, refused } = columnSeam.apply(`class T{${COLUMN}}`);
  assert.ok(!refused, refused);
  assert.deepEqual(await openPanel(source), { column: 1, locks: false, commands: [] }, 'a new session');
  assert.deepEqual(await openPanel(source, { column: 3 }), { column: 3, locks: false, commands: [] },
    'an explicit column is no longer honoured');
  assert.deepEqual(await openPanel(source, { claudeGroup: { viewColumn: 2, startsClaudeGroup: false } }),
    { column: 2, locks: false, commands: [] }, 'an existing Claude group is no longer reused');
  // The locks the extension still takes on its own, a lone empty group among them, are its switch.
  const seam = seams.find((one) => one.name === 'chat-column');
  assert.equal(seam.settings['claudeCode.lockEditorGroups'], false);
});

test('a group start the seam cannot find by name is refused, not guessed at', () => {
  const renamed = COLUMN.replace('startClaudeGroup(){', 'openClaudeGroup(){');
  assert.ok(columnSeam.apply(`class T{${renamed}}`).refused);
});

// The link seam's contract, RUN against a fake API whose text editor refuses a binary file the way
// the real one does, with the message the extension host logs.
async function click(source, file, { binary = false, location, link } = {}) {
  const calls = [];
  // Recorded only where there are any, so a fixture that passes none reads as the two-part row it is.
  const call = (kind, at, options) => calls.push(options === undefined ? [kind, at] : [kind, at, options]);
  const E$ = {
    Uri: { file: (at) => at },
    window: {
      showTextDocument: async (at, options) => {
        if (binary) throw new Error(`cannot open ${at}. Detail: File seems to be binary and cannot be opened as text`);
        call('text', at, options);
        return { revealRange: (range) => calls.push(['reveal', range]) };
      },
    },
    commands: { executeCommand: async (command, at, options) => { call(command, at, options); } },
  };
  const T = new Function('E$', `${source}\nreturn T;`)(E$);
  await Object.create(T.prototype).openFile(file, location, link);
  return calls;
}

const linksSeam = declaredExtensions(seams).find((entry) => entry.name === 'chat-links').extension;

test('a chat link the text editor refuses opens in the editor VS Code picks for it', async () => {
  const stock = `class T{${OPEN}}`;
  await assert.rejects(click(stock, '/work/shot.png', { binary: true }), /binary/,
    'the fixture no longer models the link that does nothing');
  const { source, refused } = linksSeam.apply(stock);
  assert.ok(!refused, refused);
  assert.deepEqual(await click(source, '/work/shot.png', { binary: true }), [['vscode.open', '/work/shot.png']]);
  assert.deepEqual(await click(source, '/work/shot.png', { binary: true, location: { searchText: 'x' } }),
    [['vscode.open', '/work/shot.png']], 'a location in a file with no text threw');
  assert.deepEqual(await click(source, '/work/notes.md', { location: { searchText: 'x' } }),
    [['text', '/work/notes.md'], ['reveal', 'x']], 'a text file no longer opens as text, at its location');
});

// The open grew show options in 2.1.274, and `vscode.open` takes the same ones in that position: a
// pinned link that falls through to it has to arrive pinned rather than as a preview tab.
test('the show options the chat open passes reach the editor VS Code picks for what it refuses', async () => {
  const { source, refused } = linksSeam.apply(`class T{${OPEN_PINNED}}`);
  assert.ok(!refused, refused);
  assert.deepEqual(await click(source, '/work/shot.png', { binary: true, link: { pinned: true } }),
    [['vscode.open', '/work/shot.png', { preview: false }]], 'a pinned link fell through unpinned');
  assert.deepEqual(await click(source, '/work/notes.md', { link: { pinned: true } }),
    [['text', '/work/notes.md', { preview: false }]], 'the options stopped reaching the text open');
});

// The bundle opens documents as text in other places too; this one is found by the location it goes
// on to seek, so another text open is neither rewritten nor mistaken for it.
test('the chat open is told from every other text open by the location it seeks', () => {
  const other = 'openConfig(){E$.window.showTextDocument(z).then((W)=>{W.show()})}';
  const { source, refused } = linksSeam.apply(`class T{${other}${OPEN}}`);
  assert.ok(!refused, refused);
  assert.ok(source.includes(other), 'another text open was rewritten');
  assert.ok(linksSeam.apply(`class T{${other}}`).refused, 'a bundle without the chat open was patched');
});

// The server's manifest, naming the one folder it loads for the extension.
function manifest(dir, folder, version) {
  const file = path.join(dir, 'extensions.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify([{
    identifier: { id: 'anthropic.claude-code' }, version, relativeLocation: folder,
  }]));
  fs.renameSync(`${file}.tmp`, file);
}

// An update the way the server lands one: the new folder in place, then the manifest naming it.
function update(dir, version, bundle = BUNDLE) {
  const folder = `anthropic.claude-code-${version}-darwin-arm64`;
  fs.mkdirSync(path.join(dir, folder, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(dir, folder, 'extension.js'), bundle);
  manifest(dir, folder, version);
  return path.join(dir, folder, 'extension.js');
}

const MOVED_COLUMN = BUNDLE.replace('startClaudeGroup(){', 'openClaudeGroup(){');

test('what the loaded copy lacks is read off the disk, from the folder the manifest names', () => {
  const { dir } = tree();
  assert.deepEqual(missingPatches(dir), [], 'a folder no manifest names is not the copy the server runs');
  update(dir, '9.9.10');
  assert.deepEqual(missingPatches(dir).map((entry) => entry.seam), ['chat-icon', 'chat-column', 'chat-links']);
  patchExtensions(dir);
  assert.deepEqual(missingPatches(dir), []);
});

test('a patch that refused is reported by name, against the version the server runs', () => {
  const { dir } = tree();
  update(dir, '9.9.10', MOVED_COLUMN);
  patchExtensions(dir);
  assert.deepEqual(missingPatches(dir), [{
    seam: 'chat-column',
    extension: 'anthropic.claude-code',
    version: '9.9.10',
    degrades: columnSeam.degrades,
  }]);
});

test('an obsolete folder beside the loaded one is not what the strip reports', () => {
  const { dir } = tree(MOVED_COLUMN);
  update(dir, '9.9.10');
  patchExtensions(dir);
  assert.deepEqual(missingPatches(dir), []);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

// Only the watcher can have patched the new folder: it did not exist when the pass at start ran.
test('an update that lands while the app runs is patched, and the strip is told', async (t) => {
  const { dir } = tree();
  const published = [];
  const patches = new ExtensionPatches({ dir, send: (missing) => published.push(missing) });
  t.after(() => patches.stop());
  patches.apply();
  patches.watch();

  const before = published.length;
  const file = update(dir, '9.9.10');
  await settle();
  assert.match(read(file), /__CT_CHAT_ICON_2__/, 'the new version was left stock');
  assert.match(read(file), /__CT_CHAT_COLUMN_3__/, 'the new version was left stock');
  assert.ok(published.length > before, 'the strip was not told');
  assert.deepEqual(published.at(-1), []);

  const passes = published.length;
  await settle();
  assert.equal(published.length, passes, 'the pass answered its own writes into the version folder');

  update(dir, '9.9.11', MOVED_COLUMN);
  await settle();
  assert.deepEqual(published.at(-1).map((entry) => entry.seam), ['chat-column']);
});

// The bump that broke this seam was a refactor of the code AROUND the anchor, not of the anchor
// itself. Holding both spellings is what stops the next one costing an evening.
test('the icon anchor holds a family of spellings, not the one that shipped last', () => {
  for (const [label, icon] of [['lookup table', ICON_TABLE], ['if/else chain', ICON_CHAIN]]) {
    const { dir, file } = tree(`${STRINGS}class T{${icon}${STATE}${COLUMN}${OPEN}}\n`);
    assert.equal(patchExtensions(dir).length, 1, label);
    const patched = read(file);
    assert.match(patched, /__CT_CHAT_ICON_2__/, label);
    // The resting icon is recorded, and only painted while no animated one is up - which is what
    // stops a title change stamping the still logo over the spin.
    assert.match(patched, /this\.__ctRest=/, label);
    assert.match(patched, /this\.__ctIcon\|\|\(this\.panelTab\.iconPath=/, label);
  }
});

// The span from the decode to the call is lazy and bounded, so it lands on the FIRST occurrence
// of the property name inside it. Injecting the call before a guard rather than before the call
// reads as `if(!spin(),handler)return` - the guard inverted, valid syntax, and invisible to both
// the exactly-once check and node --check.
test('the injected call lands on the handler CALL, never on a guard that names it', () => {
  const { dir, file } = tree(BUNDLE.replace(STATE, STATE_DECOY));
  assert.equal(patchExtensions(dir).length, 1, 'the decoy refused the patch outright');
  const patched = read(file);
  assert.match(patched, /\.call\(this,Q\.state\),this\.onSessionStateChanged\?\.\(/);
  assert.doesNotMatch(patched, /\.call\(this,Q\.state\),this\.onSessionStateChanged\)return/,
    'the call landed on the guard, which inverts it');
});

// Neither of these moves a shape: the patch matches, applies and is correct JavaScript. The only
// way either is ever noticed is the note, so the note is the test.
test('a string the seam reads that has moved is reported, not silently obeyed', () => {
  const icon = declaredExtensions(seams).find((entry) => entry.name === 'chat-icon').extension;
  assert.deepEqual(icon.apply(BUNDLE).notes, [], 'a bundle that has not drifted still complained');

  const grown = icon.apply(BUNDLE.replace('"waiting_input"]', '"waiting_input","compacting"]'));
  assert.ok(!grown.refused, 'a new session state refused the patch rather than noting it');
  assert.match(grown.notes.join(' '), /compacting/);

  const renamed = icon.apply(BUNDLE.replace('claude-logo-pending.svg', 'logo-attention.svg'));
  assert.ok(!renamed.refused, 'a renamed resting icon refused the patch rather than noting it');
  assert.match(renamed.notes.join(' '), /claude-logo-pending\.svg/);

  const gone = icon.apply(BUNDLE.replace(STRINGS, ''));
  assert.match(gone.notes.join(' '), /state union has moved/);
});

test('one seam whose shape has moved does not take the others down', () => {
  const { dir, file } = tree(BUNDLE.replace('startClaudeGroup(){', 'openClaudeGroup(){'));
  assert.deepEqual(patchExtensions(dir), ['chat-icon + chat-links in anthropic.claude-code-9.9.9-darwin-arm64']);
  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_2__/, 'the seam that still matches was skipped too');
  assert.doesNotMatch(patched, /__CT_CHAT_COLUMN_3__/);
});

test('a patch lands once, keeps the original beside it, and is idempotent', () => {
  const { dir, file } = tree();
  const first = patchExtensions(dir);
  assert.equal(first.length, 1, 'nothing was patched');

  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_2__/);
  assert.ok(fs.existsSync(path.join(path.dirname(file), 'resources/ct-claude-working.svg')));
  // The animation is the icon: a still SVG here is the whole feature missing.
  assert.match(read(path.join(path.dirname(file), 'resources/ct-claude-working.svg')), /animateTransform/);

  assert.deepEqual(patchExtensions(dir), [], 'the second pass patched again');
  assert.equal(read(file), patched, 'the second pass rewrote the bundle');
});

test('a shape that has moved restores the stock bundle rather than leaving an old edit', () => {
  const { dir, file } = tree();
  patchExtensions(dir);
  // The next version of the extension, patched by the version of this patcher that is now gone.
  const moved = BUNDLE
    .replace('this.panelTab.iconPath=', 'this.panelTab.icon=')
    .replace('startClaudeGroup(){', 'openClaudeGroup(){')
    .replace('if(Q?.searchText)', 'if(Q?.find)');
  fs.writeFileSync(`${file}.ct-orig`, moved);

  assert.deepEqual(patchExtensions(dir), []);
  assert.equal(read(file), moved, 'the bundle was left on an edit made from a source it no longer has');
});

test('a patched bundle whose original is gone is left alone', () => {
  const { dir, file } = tree();
  patchExtensions(dir);
  const patched = read(file);
  fs.unlinkSync(`${file}.ct-orig`);

  assert.deepEqual(patchExtensions(dir), []);
  assert.equal(read(file), patched, 'a patch was applied on top of a patch');
});

test('an anchor that matches twice is refused, because the wrong one is unrecoverable', () => {
  const { dir, file } = tree(BUNDLE + BUNDLE);
  assert.deepEqual(patchExtensions(dir), []);
  assert.doesNotMatch(read(file), /__CT_CHAT_ICON_2__/);
  assert.ok(!fs.existsSync(`${file}.ct-orig`), 'a refused patch left a copy behind');
});

// Every fixture above is a MODEL of the bundle, and a model cannot notice the real one moving -
// which is exactly how 2.1.261 got through. Where this machine has a bundle, hold the anchors to
// that one too, so the next bump costs a red test rather than a window reload and a still logo.
const INSTALLED = [
  path.join(os.homedir(), '.vscode/extensions'),
  path.join(os.homedir(), 'Library/Application Support/Code Tiles/extensions'),
];

// The pristine copy where a patch has already landed, the file itself where none has. A stamped
// bundle with no pristine beside it is skipped: its anchors were spent by a patcher we cannot see.
function installedBundles() {
  const found = [];
  for (const dir of INSTALLED) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const folder of names.filter((name) => /^anthropic\.claude-code-/.test(name))) {
      for (const file of [`${folder}/extension.js.ct-orig`, `${folder}/extension.js`]) {
        let source;
        try { source = fs.readFileSync(path.join(dir, file), 'utf8'); } catch { continue; }
        if (/__CT_CHAT_\w+__/.test(source)) continue;
        found.push([folder, source]);
        break;
      }
    }
  }
  return found;
}

test('every anchor still matches the bundle this machine has, where it has one', (t) => {
  const bundles = installedBundles();
  if (!bundles.length) return t.skip('no Claude Code extension installed here');
  for (const [version, source] of bundles) {
    for (const { name, extension } of declaredExtensions(seams)) {
      const result = extension.apply(source);
      assert.ok(!result.refused, `${name}: ${version} ${result.refused} - ${extension.degrades}`);
      // A note is drift the shapes cannot see, and the whole point of it is to be noticed.
      assert.deepEqual(result.notes || [], [], `${name}: ${version}`);
    }
  }
});

// chat-marks patches nothing - it works in the Claude page's own DOM - so an update that renames
// what it looks for there refuses nothing and prints nothing: the Edit button just stops appearing.
// These are the strings its selectors stand on, held to the page bundle this machine has.
const CHAT_MARKS_ANCHORS = [
  /"aria-label":"Message input"/,
  /title:"Remove attachment"/,
  /title:"Close preview \(Esc\)"/,
  /previewOverlay:"previewOverlay_\w+"/,
  /previewContainer:"previewContainer_\w+"/,
  /previewImage:"previewImage_\w+"/,
  /attachedFilesContainer:"attachedFilesContainer_\w+"/,
  /clipboardData\?\.items/,
];

test('what chat-marks finds in the Claude page is still in the bundle this machine has', (t) => {
  const pages = [];
  for (const dir of INSTALLED) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const folder of names.filter((name) => /^anthropic\.claude-code-/.test(name))) {
      try { pages.push([folder, fs.readFileSync(path.join(dir, folder, 'webview/index.js'), 'utf8')]); } catch { continue; }
    }
  }
  if (!pages.length) return t.skip('no Claude Code extension installed here');
  for (const [version, source] of pages) {
    for (const anchor of CHAT_MARKS_ANCHORS) assert.match(source, anchor, `chat-marks: ${version} has no ${anchor}`);
  }
});

// chat-retina patches nothing either: a rename makes a Retina paste go through at full size, and a
// pill lose its plate, with nothing printed. Its composer is the wrapper both rows of pills sit in,
// the files are what the paste and the drop handlers read, and the plate goes after the thumbnail.
const CHAT_RETINA_ANCHORS = [
  /"aria-label":"Message input"/,
  /title:"Remove attachment"/,
  /inputContainer:"inputContainer_\w+"/,
  /attachedFilesContainer:"attachedFilesContainer_\w+"/,
  /clipboardData\?\.items/,
  /dataTransfer\?\.files/,
  /F\("img",\{src:[\w$]+,alt:"",className:[\w$]+\.thumbIcon\}\)/,
];

test('what chat-retina finds in the Claude page is still in the bundle this machine has', (t) => {
  const pages = [];
  for (const dir of INSTALLED) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const folder of names.filter((name) => /^anthropic\.claude-code-/.test(name))) {
      try { pages.push([folder, fs.readFileSync(path.join(dir, folder, 'webview/index.js'), 'utf8')]); } catch { continue; }
    }
  }
  if (!pages.length) return t.skip('no Claude Code extension installed here');
  for (const [version, source] of pages) {
    for (const anchor of CHAT_RETINA_ANCHORS) assert.match(source, anchor, `chat-retina: ${version} has no ${anchor}`);
  }
});

test('a directory with no such extension in it is not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extension-'));
  assert.deepEqual(patchExtensions(dir), []);
  assert.deepEqual(patchExtensions(path.join(dir, 'not-here')), []);
});
