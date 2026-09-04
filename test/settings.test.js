import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { seamDefaults, seamSettings, settingsFrom } from '../src/guest/disk/settings.js';

// A real VS Code settings.json is JSONC, and every shape below appeared in one. Reading it
// wrongly does not throw where you can see it: the parse fails, the reader hands back an empty
// object, and every mirrored profile is written with none of the user's settings in it.
const source = (text) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'settings.json');
  fs.writeFileSync(file, text);
  return file;
};

test('reads JSONC: comments, trailing commas, and both together', () => {
  const file = source(`{
  // a line comment
  "editor.fontSize": 13,
  /* a block
     comment */
  "files.autoSave": "off",
  "nested": {
    "a": true,
  },
}
`);
  const out = JSON.parse(settingsFrom(file));
  assert.equal(out['editor.fontSize'], 13);
  assert.equal(out['files.autoSave'], 'off');
  assert.deepEqual(out.nested, { a: true });
});

test('a comma or a slash inside a string is not punctuation', () => {
  const file = source('{ "a": "x,", "b": "http://example.com", "c": "/* not a comment */" }');
  const out = JSON.parse(settingsFrom(file));
  assert.equal(out.a, 'x,');
  assert.equal(out.b, 'http://example.com');
  assert.equal(out.c, '/* not a comment */');
});

test('an escaped quote does not end the string', () => {
  const file = source('{ "a": "he said \\"hi\\", then left", "b": 1 }');
  const out = JSON.parse(settingsFrom(file));
  assert.equal(out.a, 'he said "hi", then left');
  assert.equal(out.b, 1);
});

test('your settings sit between the two seam layers', () => {
  const pinned = seamSettings();
  const proposed = seamDefaults();
  const wins = Object.keys(pinned)[0];
  const loses = Object.keys(proposed)[0];
  const file = source(JSON.stringify({
    [wins]: '__the desktop value__',
    [loses]: '__the desktop value__',
    'editor.fontSize': 20,
  }));

  const merged = JSON.parse(settingsFrom(file));
  assert.equal(merged[wins], pinned[wins]);
  assert.equal(merged[loses], '__the desktop value__');
  assert.equal(merged['editor.fontSize'], 20);

  // A source that cannot be read gets BOTH layers: the defaults are what keep a profile with no
  // file of its own off web's light theme, which is the whole reason they are written at all.
  const both = { ...proposed, ...pinned };
  assert.deepEqual(JSON.parse(settingsFrom(path.join(os.tmpdir(), 'ct-absent.json'))), both);
  assert.deepEqual(JSON.parse(settingsFrom(null)), both);
});
