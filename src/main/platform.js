// One place answers "which OS is this", so nothing else carries a process.platform check. Every
// answer is a pure function OF a platform name, this host's being derived at the bottom: the
// other two cannot be run here, so a test is the only evidence they are right.

export const IS_MAC = process.platform === 'darwin';
export const IS_WINDOWS = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';

// The app's chords sit one modifier ABOVE the editor's, so none of them shadows a chord you press
// inside a tile: the editor owns Cmd on macOS and Ctrl everywhere else. Not Ctrl+Shift, which the
// editor spends heavily - Ctrl+Shift+P, +E, +F and +G are all bound out of the box.
export function chordsFor(platform) {
  const mac = platform === 'darwin';
  return {
    // The family the app takes for itself.
    app: mac ? 'Control+Command' : 'Control+Alt',
    // The editor's own modifier, for the few chords the app takes plainly.
    editor: mac ? 'Command' : 'Control',
    // How the editor spells that modifier in a keybindings file.
    mod: mac ? 'cmd' : 'ctrl',
    // macOS cycles an app's windows on Cmd+`; nothing does elsewhere, and Ctrl+` is the terminal.
    cycle: mac ? 'Command+`' : 'Control+Alt+`',
    // The chord the host's own browsers put devtools on.
    devtools: mac ? 'Alt+Command+I' : 'Control+Shift+I',
  };
}

// $HOME's own system folders, which the picker's walk skips: not yours in any sense that matters
// here, and skipping them is most of what makes the walk affordable.
export function homeSkipFor(platform) {
  if (platform === 'darwin') return ['Library'];
  if (platform === 'win32') return ['AppData', 'Application Data', 'Local Settings'];
  return ['.cache', '.local', '.config'];
}

// Where your desktop VS Code keeps the profiles this app mirrors. Only the user directory moves;
// the extensions index is ~/.vscode/extensions on all three.
export function desktopUserDirFor(platform, home, env = {}) {
  if (platform === 'darwin') return `${home}/Library/Application Support/Code/User`;
  if (platform === 'win32') return `${env.APPDATA || `${home}\\AppData\\Roaming`}\\Code\\User`;
  return `${env.XDG_CONFIG_HOME || `${home}/.config`}/Code/User`;
}

// coder ships no Windows build, so a code-server there is one you installed from npm yourself.
export function serverBinariesFor(platform) {
  return platform === 'win32' ? ['code-server.cmd', 'code-server.exe'] : ['code-server'];
}

const chords = chordsFor(process.platform);
export const APP_CHORD = chords.app;
export const EDITOR_CHORD = chords.editor;
export const MOD_KEY = chords.mod;
export const CYCLE_CHORD = chords.cycle;
export const DEVTOOLS_CHORD = chords.devtools;

export const HOME_SKIP = homeSkipFor(process.platform);
export const CODE_SERVER_BIN = serverBinariesFor(process.platform);

export function desktopUserDir(home, env = process.env) {
  return desktopUserDirFor(process.platform, home, env);
}
