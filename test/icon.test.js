import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { forget, iconFor, reread } from '../src/main/icon.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex');

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

test('a sub-app never outranks the project it sits in', () => {
  // Both runtime-tinted marks on this machine - a #000000 mark a Blade template recolours and a
  // prefers-color-scheme swap - are a sub-app's SVG beside a coloured .ico at the root. Taking
  // the nearer directory first is what leaves those two projects their colour.
  const monorepo = folderWith({ 'favicon.ico': PNG, 'frontend/public/favicon.svg': '<svg/>' });
  assert.ok(iconFor(monorepo).startsWith('data:image/png;base64,'));
});

test('within one directory a raster outranks the SVG, and favicon outranks icon', () => {
  const both = folderWith({ 'public/favicon.svg': '<svg/>', 'public/favicon.ico': PNG });
  assert.ok(iconFor(both).startsWith('data:image/png;base64,'));
  const named = folderWith({ 'assets/icon.png': PNG, 'assets/favicon.png': PNG });
  assert.ok(iconFor(named).startsWith('data:image/png;base64,'));
});

test('an empty favicon is not an icon, and does not stop the search', () => {
  // Laravel ships a zero-byte public/favicon.ico. Taken, it makes a well-formed data URL that
  // draws nothing AND shadows whatever would have been found after it.
  assert.equal(iconFor(folderWith({ 'public/favicon.ico': '' })), null);
  const shadowed = folderWith({ 'public/favicon.ico': '', 'public/favicon.png': PNG });
  assert.ok(iconFor(shadowed).startsWith('data:image/png;base64,'));
});

test('the directories a framework actually uses are searched', () => {
  for (const at of ['static/favicon.ico', 'app/favicon.ico', 'src/favicon.ico', 'assets/icon.png',
    'wwwroot/favicon.ico', 'priv/static/favicon.ico', 'packages/web/public/favicon.ico']) {
    assert.ok(iconFor(folderWith({ [at]: PNG })), `not found at ${at}`);
  }
});

test('an icon too big for a command line is no icon until something shrinks it', () => {
  // Read all the same, because a hue is a number whatever it was sampled from. What it cannot do
  // is ride `additionalArguments` unre-encoded, and nothing has re-encoded it here.
  assert.equal(iconFor(folderWith({ 'favicon.png': Buffer.alloc(200 * 1024) })), null);
});

test('a folder is searched once a run, and again when its project is opened', () => {
  const folder = folderWith({ 'index.html': '' });
  assert.equal(iconFor(folder), null);
  fs.writeFileSync(path.join(folder, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(iconFor(folder), null, 'held for the run');
  reread(folder);
  const added = iconFor(folder);
  assert.ok(added.startsWith('data:image/svg+xml;base64,'), 'a favicon added since');
  fs.writeFileSync(path.join(folder, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  reread(folder);
  assert.notEqual(iconFor(folder), added, 'a favicon edited since');
});

// An image chosen from the project's menu, which is read from wherever it is rather than searched
// for - and which may be any picture a browser can name from its bytes, not only a favicon's two.
test('a chosen image is the mark, and the folder keeps its own favicon behind it', () => {
  const folder = folderWith({ 'favicon.svg': '<svg/>', 'art/logo.jpg': JPEG });
  assert.ok(iconFor(folder, path.join(folder, 'art/logo.jpg')).startsWith('data:image/jpeg;base64,'));
  assert.ok(iconFor(folder).startsWith('data:image/svg+xml;base64,'));
});

test('a chosen image that has gone is the favicon again, not no icon at all', () => {
  const folder = folderWith({ 'favicon.ico': PNG });
  assert.ok(iconFor(folder, path.join(folder, 'deleted.png')).startsWith('data:image/png;base64,'));
});

test('a chosen image is typed from its bytes, whatever it is called', () => {
  const kinds = { gif: Buffer.from('GIF89a'), webp: Buffer.from('RIFF\0\0\0\0WEBPVP8 ') };
  for (const [kind, bytes] of Object.entries(kinds)) {
    const folder = folderWith({ 'picture.bin': bytes });
    assert.ok(iconFor(folder, path.join(folder, 'picture.bin')).startsWith(`data:image/${kind};base64,`), kind);
  }
});

test('a chosen image is read once a run, until it is chosen again', () => {
  const folder = folderWith({ 'logo.png': PNG });
  const image = path.join(folder, 'logo.png');
  assert.ok(iconFor(folder, image).startsWith('data:image/png;base64,'));
  fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.ok(iconFor(folder, image).startsWith('data:image/png;base64,'), 'held for the run');
  forget(image);
  assert.ok(iconFor(folder, image).startsWith('data:image/svg+xml;base64,'));
});
