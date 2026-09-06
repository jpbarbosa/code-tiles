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
  const out = JSON.parse(keybindingsFrom(file, 'cmd'));
  assert.deepEqual(out[0], { key: 'cmd+k', command: 'mine' });
  assert.deepEqual(out.slice(1), seamKeybindings('cmd'));
});

test('with no file of your own the seams are the whole list', () => {
  assert.deepEqual(JSON.parse(keybindingsFrom(null, 'cmd')), seamKeybindings('cmd'));
});

test('the file is JSONC here too', () => {
  const file = source(`[
  // mine
  { "key": "cmd+k", "command": "mine" },
]
`);
  assert.deepEqual(JSON.parse(keybindingsFrom(file, 'cmd'))[0], { key: 'cmd+k', command: 'mine' });
});

// The server's own file is layered over ITSELF on every start. A settings merge is idempotent by
// key; an array is not, so without this the list grows a copy of every seam per launch and the
// file the editor reads gets longer forever.
test('layering the file over itself does not grow it', () => {
  const file = source('[{ "key": "cmd+k", "command": "mine" }]');
  writeKeybindings(file, 'cmd');
  const once = fs.readFileSync(file, 'utf8');
  writeKeybindings(file, 'cmd');
  writeKeybindings(file, 'cmd');
  assert.equal(fs.readFileSync(file, 'utf8'), once);
  assert.equal(JSON.parse(once).length, 1 + seamKeybindings('cmd').length);
});

// Same failure as a settings file that will not parse: silent, and total for the chord it frees.
test('a file that is not a list is ignored rather than thrown over', () => {
  assert.deepEqual(JSON.parse(keybindingsFrom(source('{ "not": "a list" }'), 'cmd')), seamKeybindings('cmd'));
  assert.deepEqual(JSON.parse(keybindingsFrom(source('[ broken'), 'cmd')), seamKeybindings('cmd'));
});

test('the chord the View menu waits on is given back by a seam', () => {
  assert.ok(seamKeybindings('cmd').some((rule) => (
    rule.key === 'cmd+0' && rule.command === '-workbench.action.focusSideBar'
  )));
});

// A seam names the editor's modifier `$mod` because it is the host's answer, not the seam's. A
// token left unexpanded is a rule VS Code silently ignores, so no chord comes back at all.
test('the modifier a seam asks for is the one the host hands it', () => {
  assert.ok(seamKeybindings('ctrl').some((rule) => rule.key === 'ctrl+0'));
  assert.ok(seamKeybindings('ctrl').every((rule) => !rule.key.includes('$mod')));
});
