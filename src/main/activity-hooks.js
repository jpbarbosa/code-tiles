import fs from 'node:fs';
import path from 'node:path';

import { pythonCandidates } from './platform.js';
import { writeAtomic } from './json.js';

// The half of the Claude signal that WRITES: the hook script on disk, and the entries in your own
// ~/.claude/settings.json that call it. Its own file because it shares nothing with the reader
// beside it - that one watches a directory and derives a state per project, and never writes.
// This runs once, at start, and is idempotent: the entries it adds are the entries it strips.

// The states are the hooks' own. `working`: a turn is running. `attention`: it is waiting on you,
// and it stays until the hook that follows says otherwise, because looking at a tile is not
// answering it. `finished`: a turn ended that you have not looked at, which focusing the project
// clears. `active`: a session is open with nothing to say. A project with no session has no state
// at all, which is what `idle` means everywhere else in the app.
const EVENTS = [
  ['SessionStart', 'active'],
  ['UserPromptSubmit', 'working'],
  // Interactive tools block on you without raising a Notification, so the turn would read as
  // working while it is really waiting for an answer.
  ['PreToolUse', 'attention', 'AskUserQuestion|ExitPlanMode'],
  // Which is also what resumes the ring after you approve a permission prompt mid-turn.
  ['PostToolUse', 'working'],
  // A permission prompt raises this the moment the dialog opens and a Notification for the same
  // prompt some seconds later, so both are wired and whichever lands first turns the ring.
  ['PermissionRequest', 'attention'],
  ['Notification', 'attention'],
  ['Stop', 'finished'],
  ['SessionEnd', 'end'],
];

// Rewriting settings.json is only ever adding and removing OUR entries, and this is what marks
// one. The basename, never the path: the app's data directory is not a constant, and a marker
// carrying one prefix does not recognise the entries written under another - so every launch from
// a different checkout would append one more live copy of every hook instead of replacing it.
const HOOK_MARKER = 'activity-hook.py';

// Where the installed hooks WRITE, for an instance that owns none of them. One hook script
// serves every instance, so its markers are the only ones on this machine; the command names
// that script, and it writes into the `activity` beside itself. Null where nothing of ours is
// installed at all, which is a machine where no instance has ever run and nobody has rings.
export function hooksWriteInto(file) {
  let settings;
  try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
  const commands = Object.values(settings?.hooks || {})
    .flat()
    .flatMap((group) => group?.hooks || [])
    .map((hook) => hook?.command)
    .filter((command) => typeof command === 'string' && command.includes(HOOK_MARKER));
  // The script is one of the command's quoted arguments, quoted by `installHooks` below.
  for (const command of commands) {
    const script = [...command.matchAll(/"([^"]+)"/g)]
      .map(([, value]) => value)
      .find((value) => value.endsWith(HOOK_MARKER));
    if (script) return path.join(path.dirname(script), 'activity');
  }
  return null;
}

// The interpreter is named absolutely: a hook runs in your login shell's environment, where a
// version manager can put anything on PATH. WHERE it is, is the host's answer - `platform.js`
// keeps that - and the first of those that exists is the one the hooks are written against.
function findPython() {
  return pythonCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

// The script, then the entries that call it: a hook naming a script that is not there yet fails
// on every event of every session until it is.
export function installHooks({ dir, script, settings: file }) {
  // An instance that does not own them. ~/.claude/settings.json is the one path this app writes
  // outside its own data directory, so --user-data-dir does not isolate it and two instances
  // would trade the other's rings away by starting.
  if (!file) return void console.log(`[activity] another instance owns the hooks; reading its markers from ${dir}`);
  const python = findPython();
  if (!python) {
    console.error(`[activity] no python3 at ${pythonCandidates().join(' or ')}, so no hooks and no Claude state`);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, hookScript(dir));
    fs.chmodSync(script, 0o755);
  } catch (error) {
    return void console.error('[activity] hook script:', error.message);
  }

  let raw = null;
  let settings = {};
  try {
    if (fs.existsSync(file)) {
      raw = fs.readFileSync(file, 'utf8');
      settings = JSON.parse(raw);
    }
  } catch (error) {
    // Comments are legal in that file and would not survive the round trip, and it is yours.
    return void console.error('[activity] ~/.claude/settings.json is not plain JSON, leaving it alone:', error.message);
  }

  const hooks = strip(settings.hooks || {});
  for (const [event, mode, matcher] of EVENTS) {
    // The interpreter is quoted like the script: off macOS it is found under a user directory,
    // and a home named for two words would otherwise be two arguments.
    const command = `${JSON.stringify(python)} ${JSON.stringify(script)} ${mode}`;
    const group = { hooks: [{ type: 'command', command }] };
    if (matcher) group.matcher = matcher;
    (hooks[event] = hooks[event] || []).push(group);
  }
  if (JSON.stringify(hooks) === JSON.stringify(settings.hooks || {})) return;

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const backup = `${file}.ct-backup`;
    if (raw !== null && !fs.existsSync(backup)) fs.writeFileSync(backup, raw);
    writeAtomic(file, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`);
    console.log('[activity] Claude hooks installed');
  } catch (error) {
    console.error('[activity] could not write ~/.claude/settings.json:', error.message);
  }
}

// Ours out of every event, at the HOOK level rather than the group's: we write one hook per
// group, but a group of yours could hold one of ours beside your own, and dropping the group
// would take the stranger with it.
function strip(hooks) {
  const kept = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const left = [];
    for (const group of groups || []) {
      const ours = (candidate) => typeof candidate.command === 'string' && candidate.command.includes(HOOK_MARKER);
      const rest = (group.hooks || []).filter((candidate) => !ours(candidate));
      if (rest.length) left.push(rest.length === (group.hooks || []).length ? group : { ...group, hooks: rest });
    }
    if (left.length) kept[event] = left;
  }
  return kept;
}

// Written rather than shipped, because it carries the directory it writes into: the app's data
// directory is not a constant, and a script that guessed at it would record a state nobody reads.
function hookScript(dir) {
  return `#!/usr/bin/env python3
# Managed by Code Tiles. Records one Claude session's state, for the ring on the project's badge.
# argv[1]: active | working | attention | finished | end
#
# Prints nothing on purpose: a hook's stdout is fed back to Claude on some events.
import json, os, sys, time

DIR = ${JSON.stringify(dir)}
mode = sys.argv[1] if len(sys.argv) > 1 else "working"

try:
    event = json.load(sys.stdin)
except Exception:
    sys.exit(0)

session = "".join(c for c in str(event.get("session_id") or "unknown") if c.isalnum() or c in "-_")
marker = os.path.join(DIR, session + ".json")

if mode == "end":
    try:
        os.remove(marker)
    except Exception:
        pass
    sys.exit(0)

# The folder the session STARTED in, not the one a Bash \`cd\` left it in: the first cwd recorded
# for a session is the one that says which project it belongs to.
cwd = event.get("cwd") or ""
try:
    with open(marker) as f:
        cwd = json.load(f).get("cwd") or cwd
except Exception:
    pass

record = {"state": mode, "cwd": cwd, "ts": time.time(),
          "transcript": event.get("transcript_path") or ""}
try:
    os.makedirs(DIR, exist_ok=True)
    temporary = marker + ".tmp"
    with open(temporary, "w") as f:
        json.dump(record, f)
    # A rename, so a reader woken by the write never sees half a record.
    os.replace(temporary, marker)
except Exception:
    pass
sys.exit(0)
`;
}
