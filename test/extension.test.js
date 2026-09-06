import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { declaredExtensions, patchExtensions } from '../src/guest/disk/extension.js';

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

// `W` is startedInNewColumn and is declared !1 here, which is what makes dropping its assignment
// enough: the caller reads it and locks the group only when it is true.
const COLUMN = 'createPanel($,J,Q){let W=!1,K;if(Q!==void 0)K=Q;'
  + 'else{K=O4.ViewColumn.Beside;let V=ih$();if(V)K=V.viewColumn;else K=this.findUnusedColumn(),W=!0}'
  + 'let U=O4.window.createWebviewPanel("claudeVSCodePanel","Claude Code",K,{});return{startedInNewColumn:W}}';

const BUNDLE = `${STRINGS}class T{${ICON_TABLE}${STATE}${COLUMN}}\n`;

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
  assert.deepEqual(declared.map((entry) => entry.name), ['chat-icon', 'chat-column']);
  for (const { name, extension } of declared) {
    for (const key of ['id', 'file', 'marker', 'stamp', 'degrades', 'apply']) {
      assert.ok(extension[key], `${name}: an extension patch without ${key}`);
    }
  }
  const icon = declared.find((entry) => entry.name === 'chat-icon').extension;
  assert.ok(Object.keys(icon.resources).length, 'a patch that points at no resources');
});

// Two seams, one file. Patched a seam at a time from the backup, each would start over from the
// pristine source and only the last edit would survive - which is silent, because both passes
// report success.
test('two seams on one bundle are spent in one pass and both edits survive', () => {
  const { dir, file } = tree();
  assert.deepEqual(patchExtensions(dir), ['chat-icon + chat-column in anthropic.claude-code-9.9.9-darwin-arm64']);
  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_2__/);
  assert.match(patched, /__CT_CHAT_COLUMN_1__/);
  assert.equal(read(`${file}.ct-orig`), BUNDLE, 'one pristine copy, not one per seam');
});

test('the column fallback becomes the main group and stops asking for the lock', () => {
  const { dir, file } = tree();
  patchExtensions(dir);
  const patched = read(file);
  assert.match(patched, /else K=O4\.ViewColumn\.One/, 'the fallback is not the main group');
  assert.doesNotMatch(patched, /this\.findUnusedColumn\(\),W=!0/, 'the lock flag is still set');
  assert.match(patched, /let W=!1,K;/, 'the flag lost the declaration that leaves it false');
  assert.match(patched, /if\(V\)K=V\.viewColumn/, 'an existing Claude group is no longer reused');
  assert.match(patched, /if\(Q!==void 0\)K=Q;/, 'an explicit column is no longer honoured');
});

// The bump that broke this seam was a refactor of the code AROUND the anchor, not of the anchor
// itself. Holding both spellings is what stops the next one costing an evening.
test('the icon anchor holds a family of spellings, not the one that shipped last', () => {
  for (const [label, icon] of [['lookup table', ICON_TABLE], ['if/else chain', ICON_CHAIN]]) {
    const { dir, file } = tree(`${STRINGS}class T{${icon}${STATE}${COLUMN}}\n`);
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

test('one seam whose shape has moved does not take the other down', () => {
  const { dir, file } = tree(BUNDLE.replace('K=this.findUnusedColumn(),W=!0', 'K=this.pickColumn(),W=!0'));
  assert.deepEqual(patchExtensions(dir), ['chat-icon in anthropic.claude-code-9.9.9-darwin-arm64']);
  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_2__/, 'the seam that still matches was skipped too');
  assert.doesNotMatch(patched, /__CT_CHAT_COLUMN_1__/);
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
    .replace('K=this.findUnusedColumn(),W=!0', 'K=this.pickColumn(),W=!0');
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

test('a directory with no such extension in it is not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extension-'));
  assert.deepEqual(patchExtensions(dir), []);
  assert.deepEqual(patchExtensions(path.join(dir, 'not-here')), []);
});
