#!/usr/bin/env node
// Packages the app for this host's platform, or for the one named as an argument. Cross-packaging
// works because nothing here is compiled; what does not cross is signing, which is why macOS has
// scripts/install.sh beside this one and the other two do not.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packager } from '@electron/packager';

import { placeBuiltins } from '../src/guest/disk/builtin.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Everything that is not the app: build output, the sources an icon is baked from, the docs and
// the tests, and the vendored server - which rides as a resource instead, so the bundle carries
// one copy rather than two.
const IGNORE = [/^\/dist/, /^\/assets\/icon\.icon/, /^\/vendor/, /^\/docs/, /^\/test/, /^\/\.claude/];

const ICONS = { darwin: 'assets/icon.icns', win32: 'assets/icon.ico', linux: 'assets/icon.png' };

const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
if (!ICONS[platform]) {
  console.error(`unknown platform: ${platform} (darwin, win32 or linux)`);
  process.exit(1);
}

// The vendored server is a NATIVE build, and the one in vendor/ is this host's: carrying it into
// an app for another platform ships a server that cannot run. So it rides along only when the
// target is the host, and every other build finds a code-server on PATH or at
// CODE_TILES_CODE_SERVER instead - which is also the only way Windows can work, coder publishing
// no build for it at all.
const vendored = path.join(ROOT, 'vendor/code-server');
const native = platform === process.platform && arch === process.arch;
const carriesServer = native && fs.existsSync(vendored);
if (!carriesServer) {
  const why = native ? 'nothing vendored yet - run npm run fetch-code-server' : `built for ${process.platform}`;
  console.warn(`carrying no server (${why}); the app will look on PATH`);
}

// Every start places the seams' built-ins into the server it runs, and a start writing into the app
// it was packaged in breaks that bundle's seal - so the vendored tree is brought up to date first.
if (carriesServer) {
  const placed = placeBuiltins(vendored);
  if (placed.length) console.log(`placed ${placed.join(', ')} into the vendored server`);
}

const paths = await packager({
  dir: ROOT,
  out: path.join(ROOT, 'dist'),
  overwrite: true,
  platform,
  arch,
  icon: path.join(ROOT, ICONS[platform]),
  appBundleId: 'io.jp7.codetiles',
  // Without it macOS never offers the app Local Network access, and every tool in a tile gets
  // "No route to host" for LAN addresses (docs/CONSTRAINTS.md).
  extendInfo: {
    NSLocalNetworkUsageDescription:
      'Terminals and tools in your projects connect to devices on your local network, such as ssh to another computer.',
  },
  ignore: IGNORE,
  ...(carriesServer ? { extraResource: [vendored] } : {}),
});

for (const built of paths) console.log(`packaged ${path.relative(ROOT, built)}`);
