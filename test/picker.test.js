import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { pickerRows } from '../src/main/picker-rows.js';

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
    home,
  );

  assert.deepEqual(rows.map((row) => row.folder), [first, third]);
});

test('a file where a folder used to be is not a project either', () => {
  const home = temp();
  const file = path.join(home, 'notes.txt');
  fs.writeFileSync(file, '');

  assert.deepEqual(pickerRows([project(file)], home), []);
});

test('a path under $HOME is abbreviated, and one outside it is not', () => {
  const home = temp();
  const inside = path.join(home, 'Sites', 'code-tiles');
  fs.mkdirSync(inside, { recursive: true });
  const outside = fs.realpathSync(temp());

  const rows = pickerRows([project(inside), project(outside)], home);

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

  const rows = pickerRows([project(home), project(sibling)], home);

  assert.equal(rows[0].short, home);
  assert.equal(rows[1].short, sibling);
});

test('what a row carries is what a row draws, and nothing else', () => {
  const home = temp();
  const folder = path.join(home, 'ledger');
  fs.mkdirSync(folder);

  const [row] = pickerRows(
    [project(folder, { hue: 42, icon: 'data:image/png;base64,AA', open: true, profile: 'Laravel' })],
    home,
  );

  assert.deepEqual(Object.keys(row).sort(), ['folder', 'hue', 'icon', 'name', 'open', 'short']);
  assert.equal(row.hue, 42);
  assert.equal(row.open, true);
});
