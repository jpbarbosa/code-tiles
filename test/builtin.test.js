import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import seams from '../src/guest/manifest-settings.js';
import { declaredBuiltins, placeBuiltins } from '../src/guest/disk/builtin.js';

const builtins = declaredBuiltins(seams);

// A server tree as far as this part can see one, with one stock built-in it must never touch.
function serverTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-builtin-'));
  fs.mkdirSync(path.join(root, 'lib', 'vscode', 'extensions', 'git'), { recursive: true });
  return root;
}

const extensionsOf = (root) => path.join(root, 'lib', 'vscode', 'extensions');

test('every declared built-in is placed, and a second start places nothing', () => {
  const root = serverTree();
  assert.deepEqual(placeBuiltins(root), builtins.map(({ name }) => `code-tiles-${name}`));
  for (const { name, dir } of builtins) {
    const placed = path.join(extensionsOf(root), `code-tiles-${name}`, 'package.json');
    assert.equal(fs.readFileSync(placed, 'utf8'), fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  }
  assert.deepEqual(placeBuiltins(root), []);
});

test('a built-in that differs from its source is replaced whole', () => {
  const root = serverTree();
  placeBuiltins(root);
  const [{ name }] = builtins;
  const folder = path.join(extensionsOf(root), `code-tiles-${name}`);
  fs.writeFileSync(path.join(folder, 'extension.js'), '// stale');
  fs.writeFileSync(path.join(folder, 'left-behind.js'), '');

  assert.deepEqual(placeBuiltins(root), [`code-tiles-${name}`]);
  assert.equal(fs.existsSync(path.join(folder, 'left-behind.js')), false);
});

test('a built-in no seam declares is taken back out, and nothing else is touched', () => {
  const root = serverTree();
  fs.mkdirSync(path.join(extensionsOf(root), 'code-tiles-retired'));
  placeBuiltins(root);
  assert.equal(fs.existsSync(path.join(extensionsOf(root), 'code-tiles-retired')), false);
  assert.equal(fs.existsSync(path.join(extensionsOf(root), 'git')), true);
});

test('no server tree places nothing', () => {
  assert.deepEqual(placeBuiltins(null), []);
});

// A menu entry naming a command nobody declared is an item that silently never appears, and two
// for one host is the same item twice.
test('each host is offered exactly one reveal command, in every menu', () => {
  const reveal = builtins.find(({ name }) => name === 'reveal');
  const { contributes } = JSON.parse(fs.readFileSync(path.join(reveal.dir, 'package.json'), 'utf8'));
  const declared = new Set(contributes.commands.map(({ command }) => command));
  for (const [menu, entries] of Object.entries(contributes.menus)) {
    for (const host of ['isMac', 'isWindows', 'isLinux']) {
      const offered = entries.filter(({ when }) => when.split(' && ').includes(host));
      assert.equal(offered.length, 1, `${menu} offers ${offered.length} commands on ${host}`);
      assert.ok(declared.has(offered[0].command), `${menu} names ${offered[0].command}`);
      assert.match(offered[0].when, /resourceScheme == vscode-remote/);
    }
  }
});
