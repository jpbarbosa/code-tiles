import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { keybindingsFrom, seamKeybindings, writeKeybindings } from '../src/guest/disk/keybindings.js';

const source = (text) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'keybindings.json');
  fs.writeFileSync(file, text);
  return file;
};

test('a seam is written after your own rules, which is what makes it win', () => {
  const file = source('[{ "key": "cmd+k", "command": "mine" }]');
  const out = JSON.parse(keybindingsFrom(file));
  assert.deepEqual(out[0], { key: 'cmd+k', command: 'mine' });
  assert.deepEqual(out.slice(1), seamKeybindings());
});

test('with no file of your own the seams are the whole list', () => {
  assert.deepEqual(JSON.parse(keybindingsFrom(null)), seamKeybindings());
});

test('the file is JSONC here too', () => {
  const file = source(`[
  // mine
  { "key": "cmd+k", "command": "mine" },
]
`);
  assert.deepEqual(JSON.parse(keybindingsFrom(file))[0], { key: 'cmd+k', command: 'mine' });
});

// The server's own file is layered over ITSELF on every start. A settings merge is idempotent by
// key; an array is not, so without this the list grows a copy of every seam per launch and the
// file the editor reads gets longer forever.
test('layering the file over itself does not grow it', () => {
  const file = source('[{ "key": "cmd+k", "command": "mine" }]');
  writeKeybindings(file);
  const once = fs.readFileSync(file, 'utf8');
  writeKeybindings(file);
  writeKeybindings(file);
  assert.equal(fs.readFileSync(file, 'utf8'), once);
  assert.equal(JSON.parse(once).length, 1 + seamKeybindings().length);
});

// Same failure as a settings file that will not parse: silent, and total for the chord it frees.
test('a file that is not a list is ignored rather than thrown over', () => {
  assert.deepEqual(JSON.parse(keybindingsFrom(source('{ "not": "a list" }'))), seamKeybindings());
  assert.deepEqual(JSON.parse(keybindingsFrom(source('[ broken'))), seamKeybindings());
});

test('the chord the View menu waits on is given back by a seam', () => {
  assert.ok(seamKeybindings().some((rule) => (
    rule.key === 'cmd+0' && rule.command === '-workbench.action.focusSideBar'
  )));
});
