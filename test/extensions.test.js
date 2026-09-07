import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Extensions } from '../src/main/extensions.js';
import { readDesktop } from '../src/main/desktop.js';

// `src/main/extensions.js`'s third half: the native payload Open VSX does not ship, taken off
// your own VS Code. Nothing here spawns code-server - install and prune are the server's work,
// and graft is ours, which is the half a test can hold.

const ID = 'ms-python.python';
const PAYLOAD = 'python-env-tools';

// `location.path` is the absolute twin of `relativeLocation` in a real manifest, and it is here
// so a reader that reaches for it lands somewhere a test can see rather than somewhere real.
function manifest(id, version, relativeLocation, at = '/elsewhere') {
  return [{ identifier: { id }, version, relativeLocation, location: { path: path.join(at, relativeLocation) } }];
}

// A shared dir holding the universal build, and a desktop holding the platform one. Version and
// directory name are the caller's, so a test can make them agree or disagree.
function machine({ here = '2026.4.0', there = '2026.4.0', payload = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-extensions-'));

  const shared = path.join(root, 'app-extensions');
  const universal = `${ID}-${here}-universal`;
  fs.mkdirSync(path.join(shared, universal), { recursive: true });
  fs.writeFileSync(path.join(shared, 'extensions.json'), JSON.stringify(manifest(ID, here, universal)));

  const desktop = path.join(root, '.vscode/extensions');
  const platform = `${ID}-${there}-darwin-arm64`;
  fs.mkdirSync(path.join(desktop, platform), { recursive: true });
  fs.writeFileSync(path.join(desktop, 'extensions.json'), JSON.stringify(manifest(ID, there, platform)));
  if (payload) {
    fs.mkdirSync(path.join(desktop, platform, PAYLOAD, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(desktop, platform, PAYLOAD, 'bin', 'pet'), 'binary', { mode: 0o755 });
  }

  return {
    root,
    into: path.join(shared, universal, PAYLOAD, 'bin', 'pet'),
    builds: new Map([[ID, [{ version: there, dir: path.join(desktop, platform) }]]]),
    extensions: new Extensions({ bin: 'unused', dir: shared, missCache: path.join(root, 'missed.json') }),
  };
}

test('graft copies the payload the universal build is missing', () => {
  const { extensions, builds, into } = machine();
  assert.deepEqual(extensions.graft(builds), [`${ID} ${PAYLOAD}`]);
  assert.equal(fs.readFileSync(into, 'utf8'), 'binary');
});

// The binary is spawned, so a copy that drops the mode is a copy that fails the same way the
// missing file did.
test('graft keeps the payload executable', () => {
  const { extensions, builds, into } = machine();
  extensions.graft(builds);
  assert.ok(fs.statSync(into).mode & 0o111);
});

test('graft is a no-op once the payload is there', () => {
  const { extensions, builds } = machine();
  extensions.graft(builds);
  assert.deepEqual(extensions.graft(builds), []);
});

// `pet` answers the extension's own JS over a private protocol, so a version that does not match
// is not a partial fix, it is the same silence with a file present to hide it.
test('graft will not take a payload from another version', () => {
  const { extensions, builds, into } = machine({ here: '2026.4.0', there: '2026.3.0' });
  assert.deepEqual(extensions.graft(builds), []);
  assert.equal(fs.existsSync(into), false);
});

test('graft survives a desktop that has no payload to give, and no desktop at all', () => {
  const { extensions, builds, into } = machine({ payload: false });
  assert.deepEqual(extensions.graft(builds), []);
  assert.equal(fs.existsSync(into), false);
  assert.deepEqual(extensions.graft(new Map()), []);
  assert.deepEqual(extensions.graft(undefined), []);
});

// The whole point of the index: an extension installed inside a profile is in that profile's
// manifest and NOWHERE else, so a root-manifest-only reader finds no build to graft from.
test('readDesktop indexes builds a profile installed, not just the root manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-desktop-'));
  const user = path.join(root, 'User');
  const profile = path.join(user, 'profiles', '1f1dc37a');
  fs.mkdirSync(path.join(user, 'globalStorage'), { recursive: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(user, 'globalStorage', 'storage.json'), '{}');

  const extensions = path.join(root, '.vscode/extensions/extensions.json');
  fs.mkdirSync(path.dirname(extensions), { recursive: true });
  fs.writeFileSync(extensions, JSON.stringify(manifest('esbenp.prettier-vscode', '12.4.0', 'esbenp.prettier-vscode-12.4.0')));
  fs.writeFileSync(path.join(profile, 'extensions.json'), JSON.stringify(manifest(ID, '2026.4.0', `${ID}-2026.4.0-darwin-arm64`)));

  const { builds } = readDesktop({ user, extensions });
  assert.deepEqual(builds.get(ID), [
    { version: '2026.4.0', dir: path.join(root, '.vscode/extensions', `${ID}-2026.4.0-darwin-arm64`) },
  ]);
  assert.equal(builds.has('esbenp.prettier-vscode'), true);
});

// The manifest is data. A path in it that climbs out of the extensions directory is a read
// somewhere else, which is the same argument prune makes about a delete.
test('an escaping relativeLocation indexes nothing and grafts nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-escape-'));
  const user = path.join(root, 'User');
  fs.mkdirSync(path.join(user, 'globalStorage'), { recursive: true });
  fs.writeFileSync(path.join(user, 'globalStorage', 'storage.json'), '{}');
  const extensions = path.join(root, '.vscode/extensions/extensions.json');
  fs.mkdirSync(path.dirname(extensions), { recursive: true });
  fs.writeFileSync(extensions, JSON.stringify([
    { identifier: { id: ID }, version: '1.0.0', relativeLocation: '../../../etc' },
    { identifier: { id: 'a.b' }, version: '1.0.0', relativeLocation: '/etc' },
  ]));
  assert.equal(readDesktop({ user, extensions }).builds.size, 0);

  const shared = path.join(root, 'app-extensions');
  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'extensions.json'), JSON.stringify(manifest(ID, '1.0.0', '../escaped')));
  // A payload that really is there, or the copy is refused for having no source and the guard
  // this test is about goes unread.
  const give = path.join(root, 'give');
  fs.mkdirSync(path.join(give, PAYLOAD), { recursive: true });
  fs.writeFileSync(path.join(give, PAYLOAD, 'pet'), 'binary');
  const app = new Extensions({ bin: 'unused', dir: shared, missCache: path.join(root, 'missed.json') });
  assert.deepEqual(app.graft(new Map([[ID, [{ version: '1.0.0', dir: give }]]])), []);
  assert.equal(fs.existsSync(path.join(root, 'escaped')), false);
});
