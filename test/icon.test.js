import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { iconFor } from '../src/main/icon.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function folderWith(files) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-icon-'));
  for (const [name, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    fs.writeFileSync(path.join(folder, name), bytes);
  }
  return folder;
}

test('the type comes from the bytes, not from the name', () => {
  // Half the favicon.ico files on this machine are PNGs. A data URL is not as forgiving as an
  // <img>: declare image/x-icon over PNG bytes and the browser draws nothing.
  const icon = iconFor(folderWith({ 'favicon.ico': PNG }));
  assert.ok(icon.startsWith('data:image/png;base64,'));
});

test('an SVG is read as one however it is named', () => {
  const icon = iconFor(folderWith({ 'favicon.ico': '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  assert.ok(icon.startsWith('data:image/svg+xml;base64,'));
});

test('the root wins over public/, and a project with neither has no icon', () => {
  const both = folderWith({ 'favicon.svg': '<svg/>', 'public/favicon.ico': PNG });
  assert.ok(iconFor(both).startsWith('data:image/svg+xml;base64,'));
  assert.equal(iconFor(folderWith({ 'index.html': '' })), null);
});

test('an icon too big for a command line is no icon at all', () => {
  assert.equal(iconFor(folderWith({ 'favicon.png': Buffer.alloc(200 * 1024) })), null);
});
