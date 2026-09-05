import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { declaredExtensions, patchExtensions } from '../src/guest/disk/extension.js';

const require = createRequire(import.meta.url);
const seams = require('../src/guest/manifest.cjs');

// The shapes the chat-icon seam anchors on, in the spellings this minifier produces: the resting
// icon pick, and an update_session_state branch with a body between its decode and its call. Not
// the real bundle - a version that moves these is caught by running the app, not by a test - but
// enough to hold the mechanism and the seam's own edit to their contract.
const BUNDLE = 'class T{applyTabIcon(){let X="claude-logo.svg";'
  + 'if(this.hasPendingPermissions)X="claude-logo-pending.svg";else if(J)X="claude-logo-done.svg";'
  + 'else X="claude-logo.svg";this.panelTab.iconPath=_$.Uri.file(z6.join(this.context.extensionPath,"resources",X))}'
  + 'onMessage($){if($.request.type==="update_session_state"){let J=S1$($.request);'
  + 'if(J){if(J.panelNoLongerHost)this.applyTabIconIfPanel()}this.onSessionStateChanged(J)}}}\n';

function tree(bundle = BUNDLE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extension-'));
  const folder = path.join(dir, 'anthropic.claude-code-9.9.9-darwin-arm64');
  fs.mkdirSync(path.join(folder, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'extension.js'), bundle);
  return { dir, file: path.join(folder, 'extension.js') };
}

const read = (file) => fs.readFileSync(file, 'utf8');

test('the seam declares an extension patch with everything the mechanism needs', () => {
  const declared = declaredExtensions(seams);
  assert.equal(declared.length, 1, 'one extension patch, or this test names the wrong seam');
  const { extension } = declared[0];
  for (const key of ['id', 'file', 'marker', 'stamp', 'degrades', 'apply']) {
    assert.ok(extension[key], `an extension patch without ${key}`);
  }
  assert.ok(Object.keys(extension.resources).length, 'a patch that points at no resources');
});

test('a patch lands once, keeps the original beside it, and is idempotent', () => {
  const { dir, file } = tree();
  const first = patchExtensions(dir);
  assert.equal(first.length, 1, 'nothing was patched');

  const patched = read(file);
  assert.match(patched, /__CT_CHAT_ICON_1__/);
  assert.equal(read(`${file}.ct-orig`), BUNDLE, 'the copy beside it is not the pristine bundle');
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
  const moved = BUNDLE.replace('else X="claude-logo.svg";', 'else X="claude-logo-v2.svg";');
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
  assert.doesNotMatch(read(file), /__CT_CHAT_ICON_1__/);
  assert.ok(!fs.existsSync(`${file}.ct-orig`), 'a refused patch left a copy behind');
});

test('a directory with no such extension in it is not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extension-'));
  assert.deepEqual(patchExtensions(dir), []);
  assert.deepEqual(patchExtensions(path.join(dir, 'not-here')), []);
});
