import test from 'node:test';
import assert from 'node:assert/strict';

import { stragglers } from '../src/main/coalition.js';

const BUNDLE = '/Applications/Code Tiles.app/Contents';

// The reader's table for the app as the Dock starts it: first in a coalition of its own, its
// helpers and the server's tree under it, and what left that tree while it ran.
const LAUNCHED = `
100 1 1000 ${BUNDLE}/MacOS/Code Tiles
101 1 1001 ${BUNDLE}/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_handler
110 100 1002 ${BUNDLE}/Frameworks/Code Tiles Helper (GPU).app/Contents/MacOS/Code Tiles Helper (GPU)
200 100 1003 ${BUNDLE}/Resources/code-server/lib/node
210 200 1004 /bin/zsh
300 1 1005 /usr/bin/ssh
400 1 1006 /opt/homebrew/bin/op
410 400 1007 /usr/bin/python3
500 1 1008 /System/Library/PrivateFrameworks/CascadeSets.framework/Versions/A/XPCServices/SetStoreUpdateService.xpc/Contents/MacOS/SetStoreUpdateService
600 1 1009 ${BUNDLE}/Resources/code-server/lib/node
`;

test('what detached from a tile, and whatever that started', () => {
  assert.deepEqual(new Set(stragglers(LAUNCHED, 100)), new Set([300, 400, 410, 600]));
});

test("the app's own tree is left to the walk", () => {
  for (const pid of [100, 110, 200, 210]) assert.equal(stragglers(LAUNCHED, 100).includes(pid), false);
});

test("Apple's services and Electron's own crash handler are not ours to take", () => {
  assert.equal(stragglers(LAUNCHED, 100).includes(500), false);
  assert.equal(stragglers(LAUNCHED, 100).includes(101), false);
});

// `npm start` from a terminal: the app joined the coalition of whatever that terminal is in.
const JOINED = `
50 1 500 /Applications/Visual Studio Code.app/Contents/MacOS/Code
60 50 600 /bin/zsh
100 60 1000 /Users/jp/Sites/code-tiles/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
300 1 700 /usr/bin/caffeinate
`;

test('a coalition the app does not lead is left entirely alone', () => {
  assert.deepEqual(stragglers(JOINED, 100), []);
});

test('an app that cannot find itself in the table takes nothing', () => {
  assert.deepEqual(stragglers('', 100), []);
  assert.deepEqual(stragglers(LAUNCHED, 999), []);
});
