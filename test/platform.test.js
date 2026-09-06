import test from 'node:test';
import assert from 'node:assert/strict';

import { chordsFor, desktopUserDirFor, homeSkipFor, serverBinariesFor } from '../src/main/platform.js';

const PLATFORMS = ['darwin', 'win32', 'linux'];

// The whole point of the app's family is that it is not one the editor already answers. A chord
// the editor binds never reaches the menu: its dispatcher sees the key first.
test('the app never takes the modifier the editor owns on its own', () => {
  for (const platform of PLATFORMS) {
    const { app, editor } = chordsFor(platform);
    assert.ok(app.includes(editor), `${platform}: the app family should build on ${editor}`);
    assert.notEqual(app, editor, `${platform}: the app family is the editor's own modifier`);
    // Ctrl+Shift is where VS Code keeps Ctrl+Shift+P, +E, +F and +G.
    assert.ok(!app.includes('Shift'), `${platform}: Ctrl+Shift is the editor's, not ours`);
  }
});

// How a seam spells the chord it hands back has to be the editor's own spelling, or the rule is
// one VS Code silently ignores and no chord comes back at all.
test('the keybindings modifier is the one the editor writes in its own files', () => {
  assert.equal(chordsFor('darwin').mod, 'cmd');
  assert.equal(chordsFor('win32').mod, 'ctrl');
  assert.equal(chordsFor('linux').mod, 'ctrl');
});

test('cycling never lands on the terminal chord off macOS', () => {
  assert.equal(chordsFor('darwin').cycle, 'Command+`');
  // Ctrl+` is the editor's own terminal toggle, so the app's family carries it instead.
  for (const platform of ['win32', 'linux']) {
    assert.notEqual(chordsFor(platform).cycle, 'Control+`');
    assert.ok(chordsFor(platform).cycle.endsWith('+`'));
  }
});

test('your desktop VS Code is looked for where each platform actually puts it', () => {
  assert.equal(
    desktopUserDirFor('darwin', '/Users/x'),
    '/Users/x/Library/Application Support/Code/User',
  );
  assert.equal(
    desktopUserDirFor('win32', 'C:\\Users\\x', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }),
    'C:\\Users\\x\\AppData\\Roaming\\Code\\User',
  );
  assert.equal(desktopUserDirFor('linux', '/home/x'), '/home/x/.config/Code/User');
});

// Both are set by the OS rather than by us, and a missing one is a home directory that still has
// to resolve to something rather than to the string "undefined".
test('a missing APPDATA or XDG_CONFIG_HOME falls back to where the OS would have put it', () => {
  assert.equal(desktopUserDirFor('win32', 'C:\\Users\\x', {}), 'C:\\Users\\x\\AppData\\Roaming\\Code\\User');
  assert.equal(desktopUserDirFor('linux', '/home/x', {}), '/home/x/.config/Code/User');
  assert.equal(desktopUserDirFor('linux', '/home/x', { XDG_CONFIG_HOME: '/cfg' }), '/cfg/Code/User');
});

// The walk is affordable only because it never descends into the host's own system folders, and
// each platform hides a different pile of them under $HOME.
test('every platform skips its own system folders under $HOME', () => {
  assert.deepEqual(homeSkipFor('darwin'), ['Library']);
  assert.ok(homeSkipFor('win32').includes('AppData'));
  assert.ok(homeSkipFor('linux').includes('.cache'));
  for (const platform of PLATFORMS) assert.ok(homeSkipFor(platform).length > 0);
});

// coder publishes no Windows build, so there a code-server is one you installed from npm, which
// writes a .cmd shim rather than an extensionless file.
test('Windows looks for the shim npm writes, and the others for the plain name', () => {
  assert.deepEqual(serverBinariesFor('darwin'), ['code-server']);
  assert.deepEqual(serverBinariesFor('linux'), ['code-server']);
  assert.ok(serverBinariesFor('win32').includes('code-server.cmd'));
});
