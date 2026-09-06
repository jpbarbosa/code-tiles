import test from 'node:test';
import assert from 'node:assert/strict';

import { CodeServer, descendants } from '../src/main/server.js';

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

// A tile's URL is written by `urlFor` and read back by `folderOf`, because a window can re-point
// itself and the app has to hear which folder it landed on. One shape, so the pair is one test.
const server = new CodeServer({ bin: '', paths: {} });

test('a tile URL reads back as the folder it was written for', () => {
  for (const folder of ['/Users/jp/Sites/code tiles', '/tmp/a&b?c=1', '/tmp/ünïcode']) {
    assert.equal(server.folderOf(`http://127.0.0.1:8080/?folder=${encodeURIComponent(folder)}`), folder);
  }
});

test('a window that closed its own folder is standing on no project', () => {
  assert.equal(server.folderOf('http://127.0.0.1:8080/'), null);
  assert.equal(server.folderOf('http://127.0.0.1:8080/?folder='), null);
  assert.equal(server.folderOf('about:blank'), null, 'and neither is a page with no query at all');
});

test('the profile a tile carries does not disturb the folder in front of it', () => {
  const url = 'http://127.0.0.1:8080/?folder=%2Ftmp%2Fa&payload=%5B%5B%22profile%22%2C%22Web%22%5D%5D';
  assert.equal(server.folderOf(url), '/tmp/a');
});
