#!/usr/bin/env node
// Runs the app from source. It exists because a terminal INSIDE a tile is the normal place to
// develop this app from, and that terminal's environment stops `electron .` from working at all -
// so the fix belongs in the command rather than in whatever you remember to type in front of it.
//
// `env -u` would say this in one line and only on POSIX; this tree ships for Windows too, where
// npm writes a .cmd shim and there is no `env`.

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import electron from 'electron';

// What a code-server terminal exports, and what each one does to a child launched from it.
// Unsetting one that is not there costs nothing, so this runs the same everywhere.
const INHERITED = [
  // The editor's own: the electron binary runs as plain node and resolves `electron` to the npm
  // CJS shim, so every ESM import in src/main fails naming an export that is genuinely there.
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  // The server's own, and the one that is not obvious: code-server reads these to decide it is
  // its OWN child, then looks for the IPC channel a child is spawned with and exits without one.
  // The app's server child inherits them, so the spawn dies and startup fails on a health poll
  // that only ever learns that nothing answered.
  'CODE_SERVER_PARENT_PID',
  'CODE_SERVER_SESSION_SOCKET',
  // The workbench's handle back to the window this terminal is in.
  'VSCODE_IPC_HOOK_CLI',
];

// A second instance beside your installed app. Its own data directory is what makes it one: every
// path the app uses is derived from `app.getPath('userData')`, so this gives it its own single
// instance lock, its own state, its own server port and its own login partition.
const BESIDE = '--beside';
const DEV_DIR = path.join(os.homedir(), '.code-tiles-dev');

const argv = process.argv.slice(2);
const beside = argv.includes(BESIDE);
const args = ['.', ...argv.filter((arg) => arg !== BESIDE)];

const env = { ...process.env };
for (const name of INHERITED) delete env[name];

if (beside) {
  if (!args.some((arg) => arg.startsWith('--user-data-dir'))) args.push(`--user-data-dir=${DEV_DIR}`);
  // The one thing --user-data-dir does NOT isolate, because it is not under userData:
  // ~/.claude/settings.json. See src/main/index.js.
  env.CODE_TILES_HOOKS = '0';
  console.log(`[start] beside your installed app, on ${DEV_DIR}, not taking the Claude hooks`);
}

spawn(electron, args, { stdio: 'inherit', env })
  .on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
