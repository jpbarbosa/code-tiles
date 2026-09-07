import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chordsFor, desktopUserDirFor, homeSkipFor, pythonCandidatesFor, serverBinariesFor,
  serverCommandFor, uriPathFor,
} from '../src/main/platform.js';

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

// The shim is not a binary: CreateProcess refuses a .cmd, and `spawn` says EINVAL rather than
// anything about shells. Going through cmd.exe is the only way to run one.
test('only Windows needs a shell to run the server binary at all', () => {
  assert.equal(serverCommandFor('darwin', '/usr/local/bin/code-server', ['--x']).shell, false);
  assert.equal(serverCommandFor('linux', '/usr/local/bin/code-server', ['--x']).shell, false);
  assert.equal(serverCommandFor('win32', 'C:\\npm\\code-server.cmd', ['--x']).shell, true);
});

// A shell means cmd.exe gets one string, which node builds by joining argv with spaces. Every
// path the app hands the server has a space in it - its own data sits under `Code Tiles` - so an
// unquoted argument is a directory named `C:\...\Code` and a stray argument `Tiles\server`.
test('what the shell is handed keeps a path with a space in it one argument', () => {
  const { file, args } = serverCommandFor(
    'win32',
    'C:\\Program Files\\npm\\code-server.cmd',
    ['--user-data-dir', 'C:\\Users\\x\\AppData\\Roaming\\Code Tiles\\server', '--install-extension', 'vendor.name'],
  );
  assert.equal(file, '"C:\\Program Files\\npm\\code-server.cmd"');
  assert.deepEqual(args, [
    '--user-data-dir',
    '"C:\\Users\\x\\AppData\\Roaming\\Code Tiles\\server"',
    '--install-extension',
    'vendor.name',
  ]);
});

// The registry names a profile's directory as the path of a URI, and the workbench compares that
// against one it built itself. Equality is the whole of it: a location matching nothing is a
// profile the workbench believes nobody claims, and it deletes those - in every window it opens.
test('a profile location is spelled as a URI path, not as a path on disk', () => {
  assert.equal(
    uriPathFor('win32', 'C:\\Users\\x\\AppData\\Roaming\\Code Tiles\\server\\User\\profiles'),
    '/C:/Users/x/AppData/Roaming/Code Tiles/server/User/profiles',
  );
});

// Off Windows the two spellings are one, so this has to be the identity rather than a conversion:
// a POSIX path already IS the path of its URI, and a second leading slash would name a host.
test('the two hosts that spell it the same are left alone', () => {
  for (const platform of ['darwin', 'linux']) {
    const posix = '/Users/x/Library/Application Support/Code Tiles/server/User/profiles';
    assert.equal(uriPathFor(platform, posix), posix);
  }
});

// A hook is a command line Claude Code runs in your login shell, so PATH is whatever a version
// manager left there - the interpreter has to be absolute, and every candidate here is.
test('the hooks name their interpreter absolutely, on every host', () => {
  for (const platform of PLATFORMS) {
    const candidates = pythonCandidatesFor(platform, { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' });
    assert.ok(candidates.length, `${platform}: nowhere to look for an interpreter`);
    for (const candidate of candidates) {
      assert.ok(/^([A-Za-z]:\\|\/)/.test(candidate), `${platform}: ${candidate} is not an absolute path`);
    }
  }
});

// Windows ships no python at all, so the answer is wherever its own installer put one. The `py`
// launcher first: it is installed by default and is the entry point that knows every version.
test('Windows looks for the launcher its installer leaves, and the others for the system one', () => {
  const windows = pythonCandidatesFor('win32', {
    LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local', SystemRoot: 'C:\\Windows',
  });
  assert.equal(windows[0], 'C:\\Users\\x\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe');
  assert.ok(windows.includes('C:\\Windows\\py.exe'));
  for (const platform of ['darwin', 'linux']) {
    assert.deepEqual(pythonCandidatesFor(platform), ['/usr/bin/python3']);
  }
});

// The other two spawn the file itself, where a quote would be part of the name.
test('nowhere else is an argument rewritten on its way to the server', () => {
  const args = ['--user-data-dir', '/Users/x/Library/Application Support/Code Tiles/server'];
  for (const platform of ['darwin', 'linux']) {
    const command = serverCommandFor(platform, '/usr/local/bin/code-server', args);
    assert.equal(command.file, '/usr/local/bin/code-server');
    assert.deepEqual(command.args, args);
  }
});
