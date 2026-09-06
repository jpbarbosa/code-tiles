#!/usr/bin/env node
// Rebuilds assets/icon.ico from assets/icon.png, which is what Windows packaging asks for.
//
// An .ico is a directory of whole images rather than one bitmap, and every size in it is one
// Windows picks between: 16 and 32 are the taskbar and the title bar, 48 the desktop, 256 the
// large view. Shipping only 256 makes Windows downscale it itself, which is visibly worse at 16.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = path.join(ROOT, 'assets/icon.png');
const TARGET = path.join(ROOT, 'assets/icon.ico');
const SIZES = [16, 32, 48, 64, 128, 256];

// sips is macOS's, like the Blender and Icon Composer steps in icon.sh: the icons are built on
// this machine and committed, so no other host ever needs the tool.
function resize(size, work) {
  const out = path.join(work, `${size}.png`);
  execFileSync('sips', ['-z', String(size), String(size), SOURCE, '--out', out], { stdio: 'ignore' });
  return fs.readFileSync(out);
}

// Header, then one 16-byte entry per image, then the images themselves. A side of 256 is written
// as 0, the field being one byte wide.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ico-'));
try {
  const images = SIZES.map((size) => ({ size, data: resize(size, work) }));
  fs.writeFileSync(TARGET, ico(images));
  console.log(`wrote ${path.relative(ROOT, TARGET)} (${SIZES.join(', ')})`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
