import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Projects } from '../src/main/projects.js';

// A project IS its folder: no id, no stored name, no stored colour. So what this class owes is
// that everything derived stays derived, and that the two getters which can answer with a folder
// that is no longer open - focus and the master column - never do.

// Real directories, because the list prunes what is not on disk and resolves what is.
function tree(...names) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-projects-')));
  for (const name of names) fs.mkdirSync(path.join(root, name), { recursive: true });
  return root;
}

function store(state = {}) {
  const held = { version: 1, entries: [], focusedFolder: null, mode: 'grid', maximized: null,
    sizes: {}, tint: {}, serverPort: null, ...state };
  return { state: held, update: (patch) => Object.assign(held, patch) };
}

const open = (folder) => ({ folder, open: true });

test('a folder that is gone from disk is dropped as the list is built', () => {
  const root = tree('alpha');
  const held = store({ entries: [open(path.join(root, 'alpha')), open(path.join(root, 'ghost'))] });
  new Projects(held);
  assert.deepEqual(held.state.entries.map((entry) => entry.folder), [path.join(root, 'alpha')]);
});

test('name, hue and Claude state are derived, never read off the entry', () => {
  const root = tree('alpha');
  const folder = path.join(root, 'alpha');
  const projects = new Projects(store({ entries: [{ folder, open: true, name: 'STALE', hue: 999 }] }));
  const [project] = projects.open();
  assert.equal(project.name, 'alpha');
  assert.notEqual(project.hue, 999);
  assert.ok(Number.isInteger(project.hue));
  assert.equal(project.claudeState, 'idle');
});

test('all() is everything ever opened and open() is the tiles', () => {
  const root = tree('a', 'b');
  const projects = new Projects(store({ entries: [
    open(path.join(root, 'a')), { folder: path.join(root, 'b'), open: false },
  ] }));
  assert.deepEqual(projects.all().map((p) => p.name), ['a', 'b']);
  assert.deepEqual(projects.open().map((p) => p.name), ['a']);
});

// Both of these can name a folder that has since closed, and both have to answer as if it had not
// been named at all - or the focus lands on a tile nobody can see and the wide cell is held by
// nothing.
test('focus falls to the first open project when the stored one is not open', () => {
  const root = tree('a', 'b');
  const [a, b] = ['a', 'b'].map((n) => path.join(root, n));
  const projects = new Projects(store({
    entries: [open(a), open(b)], focusedFolder: path.join(root, 'gone'),
  }));
  assert.equal(projects.focused, a);
});

test('focus is null when nothing is open', () => {
  const root = tree('a');
  const projects = new Projects(store({ entries: [{ folder: path.join(root, 'a'), open: false }] }));
  assert.equal(projects.focused, null);
});

test('the master column is null while the folder holding it is not open', () => {
  const root = tree('a', 'b');
  const [a, b] = ['a', 'b'].map((n) => path.join(root, n));
  const held = store({ entries: [open(a), { folder: b, open: false }], maximized: b });
  const projects = new Projects(held);
  assert.equal(projects.maximized, null);
  projects.maximized = a;
  assert.equal(projects.maximized, a);
});

test('adding a folder resolves it, focuses it, and reopens rather than duplicates', () => {
  const root = tree('a');
  const folder = path.join(root, 'a');
  const held = store({ entries: [{ folder, open: false }] });
  const projects = new Projects(held);
  assert.equal(projects.add(folder), folder);
  assert.equal(held.state.entries.length, 1);
  assert.equal(projects.focused, folder);
  assert.equal(projects.open().length, 1);
});

test('closing marks the entry closed and leaves it in the list; forgetting removes it', () => {
  const root = tree('a', 'b');
  const [a, b] = ['a', 'b'].map((n) => path.join(root, n));
  const held = store({ entries: [open(a), open(b)], focusedFolder: a });
  const projects = new Projects(held);
  projects.close(a);
  assert.deepEqual(projects.open().map((p) => p.name), ['b']);
  assert.equal(projects.all().length, 2);
  assert.equal(projects.focused, b);
  projects.forget(a);
  assert.equal(projects.all().length, 1);
});

// A window that re-pointed itself. The tile did not move, so the focus and the wide column have to
// come with it - neither getter answers with a folder that is not open, so left behind they would
// silently become "first project" and "nobody".
test('a tile re-pointed from the inside carries its focus and its column', () => {
  const root = tree('from', 'to');
  const [from, to] = ['from', 'to'].map((n) => path.join(root, n));
  const held = store({ entries: [open(from)], focusedFolder: from, maximized: from });
  const projects = new Projects(held);

  const result = projects.rebind(from, to);
  assert.deepEqual(result, { folder: to, moved: true });
  assert.equal(projects.focused, to);
  assert.equal(projects.maximized, to);
  assert.deepEqual(projects.open().map((p) => p.name), ['to']);
});

test('a rebind onto a folder another tile already holds is refused', () => {
  const root = tree('from', 'to');
  const [from, to] = ['from', 'to'].map((n) => path.join(root, n));
  const projects = new Projects(store({ entries: [open(from), open(to)] }));
  assert.deepEqual(projects.rebind(from, to), { folder: to, moved: false });
  assert.deepEqual(projects.open().map((p) => p.name), ['from', 'to']);
});

// `?folder=` can name anything at all, and a path that is not a directory would be persisted and
// replayed as a tile that cannot load.
test('a rebind onto something that is not a directory is refused with no folder', () => {
  const root = tree('from');
  const from = path.join(root, 'from');
  const projects = new Projects(store({ entries: [open(from)] }));
  assert.deepEqual(projects.rebind(from, path.join(root, 'nothing-here')), { folder: null, moved: false });
});

test('reordering moves the open slots and leaves a closed project where it was', () => {
  const root = tree('a', 'b', 'c');
  const [a, b, c] = ['a', 'b', 'c'].map((n) => path.join(root, n));
  const held = store({ entries: [open(a), { folder: b, open: false }, open(c)] });
  const projects = new Projects(held);

  projects.swap(a, c);
  assert.deepEqual(projects.open().map((p) => p.name), ['c', 'a']);
  // The closed one never left its slot, so the whole list still reads c, b, a.
  assert.deepEqual(projects.all().map((p) => p.name), ['c', 'b', 'a']);

  projects.move(a, 0);
  assert.deepEqual(projects.open().map((p) => p.name), ['a', 'c']);
  projects.restore([c, a]);
  assert.deepEqual(projects.open().map((p) => p.name), ['c', 'a']);
});

// The whole list at once, because a session in a nested folder belongs to the deeper project.
test('Claude state is asked for every folder in one pass', () => {
  const root = tree('a', 'a/api');
  const [a, api] = ['a', 'a/api'].map((n) => path.join(root, n));
  const asked = [];
  const projects = new Projects(store({ entries: [open(a), open(api)] }), {
    claudeStates: (folders) => { asked.push(folders); return { [api]: 'working' }; },
  });
  const states = projects.open().map((p) => p.claudeState);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], [a, api]);
  assert.deepEqual(states, ['idle', 'working']);
});

test('the profile a folder belongs to is derived, like everything else about it', () => {
  const root = tree('a');
  const folder = path.join(root, 'a');
  const projects = new Projects(store({ entries: [open(folder)] }), {
    profileFor: (candidate) => (candidate === folder ? 'Laravel' : null),
  });
  assert.equal(projects.open()[0].profile, 'Laravel');
});
