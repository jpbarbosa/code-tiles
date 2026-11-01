import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readImageText } from '../src/main/image-text.js';

function fakeHelper(t, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-image-text-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const binary = path.join(dir, 'read-image-text');
  fs.writeFileSync(binary, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return binary;
}

test('no helper on this machine reads as no text, not as a failure', () => {
  assert.deepEqual(readImageText(null, new Uint8Array(1)), []);
});

test('the image reaches the helper on stdin and its lines come back', async (t) => {
  const binary = fakeHelper(t, `printf '[{"text":"%s"}]' "$(cat)"`);
  assert.deepEqual(await readImageText(binary, Buffer.from('pixels')), [{ text: 'pixels' }]);
});

test('a helper that fails rejects, and the next read still runs', async (t) => {
  const failing = fakeHelper(t, 'cat >/dev/null; exit 3');
  await assert.rejects(readImageText(failing, Buffer.from('x')), /ended with 3/);
  const working = fakeHelper(t, `cat >/dev/null; echo '[]'`);
  assert.deepEqual(await readImageText(working, Buffer.from('x')), []);
});

test('reads run one at a time, in the order they were asked', async (t) => {
  const log = path.join(path.dirname(fakeHelper(t, '')), 'log');
  const binary = fakeHelper(t, `name=$(cat); echo "start $name" >>"${log}"; sleep 0.1; echo "end $name" >>"${log}"; echo '[]'`);
  await Promise.all([readImageText(binary, Buffer.from('a')), readImageText(binary, Buffer.from('b'))]);
  assert.equal(fs.readFileSync(log, 'utf8'), 'start a\nend a\nstart b\nend b\n');
});
