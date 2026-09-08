import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Store } from '../src/main/store.js';

// The one file that, half-written or wrongly merged, loses every project you have open. Nothing
// else in the app persists anything.
const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-store-')), 'state.json');

test('a missing file is the empty state rather than a throw', () => {
  const store = new Store(scratch());
  assert.deepEqual(store.state.entries, []);
  assert.equal(store.state.mode, 'grid');
  assert.equal(store.state.serverPort, null);
});

test('an update is written through and read back by the next instance', () => {
  const file = scratch();
  new Store(file).update({ serverPort: 51234, entries: [{ folder: '/tmp/a', open: true }] });
  const reopened = new Store(file);
  assert.equal(reopened.state.serverPort, 51234);
  assert.deepEqual(reopened.state.entries, [{ folder: '/tmp/a', open: true }]);
});

// The version is the whole migration story: a file from another shape is DISCARDED, not merged,
// because a half-understood state is worse than a fresh one.
test('a state file from another version is discarded whole', () => {
  const file = scratch();
  fs.writeFileSync(file, JSON.stringify({ version: 99, entries: [{ folder: '/tmp/a' }], mode: 'single' }));
  const store = new Store(file);
  assert.deepEqual(store.state.entries, []);
  assert.equal(store.state.mode, 'grid');
});

test('garbage on disk is the empty state, not a crash on startup', () => {
  const file = scratch();
  for (const junk of ['', '{', 'null', '[1,2]', 'not json']) {
    fs.writeFileSync(file, junk);
    assert.deepEqual(new Store(file).state.entries, [], `parsed ${JSON.stringify(junk)}`);
  }
});

// A field this build knows and the file does not - anything added since it was written - has to
// arrive at its default rather than as undefined, or every reader needs its own fallback.
test('a field the file predates comes back as its default', () => {
  const file = scratch();
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [{ folder: '/tmp/a', open: true }] }));
  const store = new Store(file);
  assert.deepEqual(store.state.tint, { focused: 'medium', quiet: 'medium' });
  assert.deepEqual(store.state.sizes, {});
  assert.equal(store.state.maximized, null);
});

test('an update merges rather than replaces, and always stamps the version', () => {
  const store = new Store(scratch());
  store.update({ mode: 'single' });
  store.update({ focusedFolder: '/tmp/a' });
  assert.equal(store.state.mode, 'single');
  assert.equal(store.state.focusedFolder, '/tmp/a');
  assert.equal(store.update({ version: 99 }).version, 1);
});

// The directory is made on the way: the app's data directory exists, but a test - and a first run
// against a fresh profile - reaches this before anything else has written there.
test('a state file under a directory that does not exist yet is still written', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-store-')), 'deep', 'state.json');
  new Store(file).update({ mode: 'single' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).mode, 'single');
});

// The temp file is renamed over, never written in place, so a reader is never handed half a file.
test('no temp file is left beside the state', () => {
  const file = scratch();
  new Store(file).update({ mode: 'single' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['state.json']);
});
