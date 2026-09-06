import test from 'node:test';
import assert from 'node:assert/strict';

import { descendants } from '../src/main/server.js';

// `ps -Ao pid=,ppid=` as the app reads it: the server under launchd, a pty host under the server,
// a shell under that, and a dev server the shell started - the one that used to survive a quit.
const TABLE = `
    1     0
  400     1
  500   400
  600   500
  700   600
  800   500
  900     1
`;

test('every process under the server, however deep', () => {
  assert.deepEqual(new Set(descendants(TABLE, 400)), new Set([500, 600, 700, 800]));
});

test('deepest first, so nothing is killed while it can still spawn', () => {
  const order = descendants(TABLE, 400);
  assert.ok(order.indexOf(700) < order.indexOf(600));
  assert.ok(order.indexOf(600) < order.indexOf(500));
});

test('a process outside the tree is left alone', () => {
  assert.equal(descendants(TABLE, 400).includes(900), false);
  assert.deepEqual(descendants(TABLE, 900), []);
});
