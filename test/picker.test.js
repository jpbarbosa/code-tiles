import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { homeRow, pickerRows } from '../src/main/picker-rows.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ct-picker-'));
const project = (folder, extra = {}) => ({
  folder, name: path.basename(folder), hue: 200, icon: null, open: false, ...extra,
});

test('a folder that is gone is dropped, and the rest keep the order they were given', () => {
  const home = temp();
  const first = path.join(home, 'first');
  const third = path.join(home, 'third');
  fs.mkdirSync(first);
  fs.mkdirSync(third);

  const rows = pickerRows(
    [project(first), project(path.join(home, 'second')), project(third)],
    { home },
  );

  assert.deepEqual(rows.map((row) => row.folder), [first, third]);
});

test('a file where a folder used to be is not a project either', () => {
  const home = temp();
  const file = path.join(home, 'notes.txt');
  fs.writeFileSync(file, '');

  assert.deepEqual(pickerRows([project(file)], { home }), []);
});

test('a path under $HOME is abbreviated, and one outside it is not', () => {
  const home = temp();
  const inside = path.join(home, 'Sites', 'code-tiles');
  fs.mkdirSync(inside, { recursive: true });
  const outside = fs.realpathSync(temp());

  const rows = pickerRows([project(inside), project(outside)], { home });

  assert.equal(rows[0].short, path.join('~', 'Sites', 'code-tiles'));
  assert.equal(rows[1].short, outside);
});

// $HOME itself is a project on this machine, and a prefix test that forgets the separator would
// also abbreviate a sibling directory whose name merely starts with the home directory's.
test('$HOME is not its own prefix, and a sibling starting with its name is left alone', () => {
  const base = temp();
  const home = path.join(base, 'jp');
  const sibling = path.join(base, 'jp7');
  fs.mkdirSync(home);
  fs.mkdirSync(sibling);

  const rows = pickerRows([project(home), project(sibling)], { home });

  assert.equal(rows[0].short, home);
  assert.equal(rows[1].short, sibling);
});

test('what a row carries is what a row draws, and nothing else', () => {
  const home = temp();
  const folder = path.join(home, 'ledger');
  fs.mkdirSync(folder);

  const [row] = pickerRows(
    [project(folder, { hue: 42, icon: 'data:image/png;base64,AA', open: true, profile: 'Laravel' })],
    { home },
  );

  assert.deepEqual(
    Object.keys(row).sort(),
    ['folder', 'hue', 'icon', 'name', 'open', 'project', 'short'],
  );
  assert.equal(row.hue, 42);
  assert.equal(row.open, true);
});

test('a query matches a project by name before it matches one by path', () => {
  const home = temp();
  const sites = path.join(home, 'Sites');
  const app = path.join(sites, 'ledger');
  const other = path.join(sites, 'atlas');
  fs.mkdirSync(app, { recursive: true });
  fs.mkdirSync(other);

  const rows = pickerRows([project(other), project(app)], { home, query: 'ledger' });

  assert.deepEqual(rows.map((row) => row.name), ['ledger']);
});

test('a folder no project has claimed is found beside the ones that are', () => {
  const home = temp();
  const sites = path.join(home, 'Sites');
  const app = path.join(sites, 'ledger');
  const loose = path.join(sites, 'ledger-admin');
  fs.mkdirSync(app, { recursive: true });
  fs.mkdirSync(loose);

  const rows = pickerRows([project(app)], { home, query: 'ledger' });

  assert.deepEqual(rows.map((row) => [row.name, row.project]), [
    ['ledger', true],
    ['ledger-admin', false],
  ]);
  assert.equal(rows[1].short, path.join('~', 'Sites', 'ledger-admin'));
});

// A folder that is already a project must not come back a second time as a bare folder, in either
// reading of the query.
test('a claimed folder is a project row and never also a folder row', () => {
  const home = temp();
  const sites = path.join(home, 'Sites');
  const app = path.join(sites, 'orbit');
  fs.mkdirSync(app, { recursive: true });

  for (const query of ['orbit', '~/Sites/']) {
    const rows = pickerRows([project(app, { open: true })], { home, query });
    assert.deepEqual(rows.map((row) => [row.name, row.project, row.open]), [['orbit', true, true]]);
  }
});

test('a query that starts like a path lists what is inside it, and ~ names the home folder', () => {
  const home = temp();
  const sites = path.join(home, 'Sites');
  fs.mkdirSync(path.join(sites, 'orbit'), { recursive: true });
  fs.mkdirSync(path.join(sites, 'fern'));
  fs.mkdirSync(path.join(home, '.hidden'));

  assert.deepEqual(pickerRows([], { home, query: '~/Sites/' }).map((row) => row.name),
    ['fern', 'orbit']);
  assert.deepEqual(pickerRows([], { home, query: '~/Sites/or' }).map((row) => row.name), ['orbit']);
  // The home row seeds a bare ~, whose one answer is the home folder itself.
  assert.deepEqual(pickerRows([], { home, query: '~' }).map((row) => row.folder), [home]);
  // Nothing hidden until it is asked for by name.
  assert.deepEqual(pickerRows([], { home, query: '~/' }).map((row) => row.name), ['Sites']);
  assert.deepEqual(pickerRows([], { home, query: '~/.h' }).map((row) => row.name), ['.hidden']);
});

test('a path with nothing behind it is an empty list, not a throw', () => {
  const home = temp();
  assert.deepEqual(pickerRows([], { home, query: '~/nowhere/at/all/' }), []);
});

test('the home row is the account folder, named by its last segment', () => {
  assert.deepEqual(homeRow('/Users/jp'), { folder: '/Users/jp', name: 'jp' });
});

// `sites/orbit` names no single folder, so a search that only ever looks at the last segment finds
// nothing at all - which is what it did.
test('a query with a separator in it is matched against the path', () => {
  const home = temp();
  fs.mkdirSync(path.join(home, 'Sites', 'orbit'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Archive', 'orbit'), { recursive: true });

  assert.deepEqual(pickerRows([], { home, query: 'sites/orbit' }).map((row) => row.short),
    [path.join('~', 'Sites', 'orbit')]);
  // Without one it is a name, or every folder would match by the directory it happens to sit in.
  assert.deepEqual(pickerRows([], { home, query: 'orbit' }).map((row) => row.short).sort(),
    [path.join('~', 'Archive', 'orbit'), path.join('~', 'Sites', 'orbit')]);
});

test('the walk goes four levels under $HOME and stops', () => {
  const home = temp();
  fs.mkdirSync(path.join(home, 'a', 'b', 'c', 'deep', 'deeper'), { recursive: true });

  assert.equal(pickerRows([], { home, query: 'deep' }).length, 1);
  assert.deepEqual(pickerRows([], { home, query: 'deeper' }), []);
});

test('what is not yours is not walked', () => {
  const home = temp();
  for (const name of ['Library', 'node_modules', 'vendor', '.hidden']) {
    fs.mkdirSync(path.join(home, name, 'orbit'), { recursive: true });
  }
  fs.mkdirSync(path.join(home, 'Sites', 'orbit'), { recursive: true });

  assert.deepEqual(pickerRows([], { home, query: 'orbit' }).map((row) => row.short),
    [path.join('~', 'Sites', 'orbit')]);
});

// Resolving a link can reach a network path: two deploy symlinks under ~/Sites cost 20 ms each,
// which is a whole keystroke. A link you navigate to yourself is still followed.
test('the walk follows no symlink, and a path query does', () => {
  const home = temp();
  const real = path.join(home, 'Sites', 'orbit');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, path.join(home, 'Sites', 'orbit-link'));

  assert.deepEqual(pickerRows([], { home, query: 'orbit-link' }), []);
  assert.deepEqual(pickerRows([], { home, query: '~/Sites/orbit-link' }).map((row) => row.name),
    ['orbit-link']);
});

test('a project kept outside $HOME still has its neighbours searched', () => {
  const home = temp();
  const elsewhere = fs.realpathSync(temp());
  const kept = path.join(elsewhere, 'orbit');
  fs.mkdirSync(kept);
  fs.mkdirSync(path.join(elsewhere, 'orbit-design'));

  const rows = pickerRows([project(kept)], { home, query: 'orbit' });

  assert.deepEqual(rows.map((row) => [row.name, row.project]), [
    ['orbit', true],
    ['orbit-design', false],
  ]);
});

// $HOME itself is a project on this machine, and its parent is /Users - so a rule that adds every
// project's parent as a root walks every other account on the Mac, and finds each folder twice.
test('a project at $HOME does not make /Users a root', () => {
  const base = temp();
  const home = path.join(base, 'jp');
  const neighbour = path.join(base, 'someone-else');
  fs.mkdirSync(path.join(home, 'Sites', 'orbit'), { recursive: true });
  fs.mkdirSync(path.join(neighbour, 'orbit'), { recursive: true });

  const rows = pickerRows([project(home, { open: true })], { home, query: 'orbit' });

  assert.deepEqual(rows.map((row) => row.folder), [path.join(home, 'Sites', 'orbit')]);
});
