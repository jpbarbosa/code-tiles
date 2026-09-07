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

// How to hand this platform a code-server command line. Because npm writes a .cmd shim rather
// than a binary, Windows has nothing CreateProcess will take: it refuses a .cmd outright, as
// `spawn EINVAL`, and the call has to go through cmd.exe instead. cmd.exe takes ONE string, which
// node builds by joining argv with spaces and quotes nothing itself - so anything that could hold
// a space arrives already quoted. Everything the app passes can: its own data lives under `Code
// Tiles`, and a project lives wherever you keep it.
export function serverCommandFor(platform, bin, args) {
  if (platform !== 'win32') return { file: bin, args, shell: false };
  return { file: quoteArg(bin), args: args.map(quoteArg), shell: true };
}

// cmd.exe's quoting, which is not a shell's: a quote turns spacing off and on again, and there is
// no escape for one inside a quoted run. Nothing here passes a quote, so nothing tries to keep it.
function quoteArg(arg) {
  return /\s/.test(arg) ? `"${arg.replace(/"/g, '')}"` : arg;
}

// A URI's path is not a filesystem path, on the one host where the two disagree. POSIX spells
// them the same and this is the identity there; Windows spells a path `C:\a\b`, which as the path
// OF a URI has to be `/C:/a/b` - the separator the URI defines, and the leading slash every
// absolute one carries. This is `URI.file`'s own normalisation, and it matters wherever the
// workbench compares a location we wrote against one it built itself: an entry that compares
// equal to nothing is a profile it believes nobody claims, and those it deletes.
export function uriPathFor(platform, fsPath) {
  if (platform !== 'win32') return fsPath;
  const forward = fsPath.replace(/\\/g, '/');
  return forward.startsWith('/') ? forward : `/${forward}`;
}

// Where the Claude hooks' interpreter is, without asking PATH. A hook runs in your login shell's
// environment, where a version manager can put anything on PATH - so it is named absolutely, and
// each host keeps it somewhere else. macOS and Linux ship one at a fixed place. Windows ships
// none: these are the two the python.org installer leaves, `py` first because the launcher is
// installed by default and is the one entry point that knows every version beside it.
export function pythonCandidatesFor(platform, env = {}) {
  if (platform !== 'win32') return ['/usr/bin/python3'];
  const local = env.LOCALAPPDATA || `${env.USERPROFILE || 'C:\\'}\\AppData\\Local`;
  return [
    `${local}\\Programs\\Python\\Launcher\\py.exe`,
    `${env.SystemRoot || 'C:\\Windows'}\\py.exe`,
  ];
}

const chords = chordsFor(process.platform);
export const APP_CHORD = chords.app;
export const EDITOR_CHORD = chords.editor;
export const MOD_KEY = chords.mod;
export const CYCLE_CHORD = chords.cycle;
export const DEVTOOLS_CHORD = chords.devtools;

export const HOME_SKIP = homeSkipFor(process.platform);
export const CODE_SERVER_BIN = serverBinariesFor(process.platform);

export function serverCommand(bin, args) {
  return serverCommandFor(process.platform, bin, args);
}

export function uriPath(fsPath) {
  return uriPathFor(process.platform, fsPath);
}

export function pythonCandidates(env = process.env) {
  return pythonCandidatesFor(process.platform, env);
}

export function desktopUserDir(home, env = process.env) {
  return desktopUserDirFor(process.platform, home, env);
}
