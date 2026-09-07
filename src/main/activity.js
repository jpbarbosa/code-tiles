import fs from 'node:fs';
import path from 'node:path';

import { pythonCandidates } from './platform.js';

// What Claude is doing in each project, taken from the hooks Claude Code fires. A hook writes one
// marker file per session; this reads them, maps each session to the project it started in, and
// answers with a state per project. Nothing here knows what a ring looks like.
//
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

// The interpreter is named absolutely: a hook runs in your login shell's environment, where a
// version manager can put anything on PATH. WHERE it is, is the host's answer - `platform.js`
// keeps that - and the first of those that exists is the one the hooks are written against.
function findPython() {
  return pythonCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

// Rewriting settings.json is only ever adding and removing OUR entries, and this is what marks
// one. The basename, never the path: the app's data directory is not a constant, and a marker
// carrying one prefix does not recognise the entries written under another - so every launch from
// a different checkout would append one more live copy of every hook instead of replacing it.
const HOOK_MARKER = 'activity-hook.py';

// A turn older than this is not believed. Nothing writes an "I am still here" marker, so a
// session killed mid-turn would otherwise work forever.
const STALE_MS = 60 * 60 * 1000;
// SessionEnd does not always land, so an idle session's own marker expires sooner.
const OPEN_MS = 15 * 60 * 1000;
// While anything reads as working, the transcript is the only place an ESC shows up, and nothing
// announces it. Bounded by its own condition: no project working, no timer.
const RECHECK_MS = 10 * 1000;

const INTERRUPT = /^\[Request interrupted by user( for tool use)?\]$/;
const INTERRUPT_TAIL = 64 * 1024;

export class Activity {
  #dir;
  #script;
  #settings;
  #onChange;
  #markers = [];
  #seen = new Map();
  #interrupts = new Map();
  #watcher = null;
  #debounce = null;
  #recheck = null;
  #signature = '';

  constructor({ dir, script, settings, onChange = () => {} }) {
    this.#dir = dir;
    this.#script = script;
    this.#settings = settings;
    this.#onChange = onChange;
  }

  start() {
    this.#installHooks();
    this.#sweep();
    this.#read();
    this.#watch();
  }

  stop() {
    this.#watcher?.close();
    this.#watcher = null;
    clearTimeout(this.#debounce);
    clearTimeout(this.#recheck);
  }

  // One pass for every project at once, because a session belongs to the LONGEST folder that
  // holds it: with `~/Sites/app` and `~/Sites/app/api` both open, a session in the second is not
  // the first one's business.
  states(folders) {
    const deepest = [...folders].sort((a, b) => b.length - a.length);
    const totals = new Map();
    for (const marker of this.#markers) {
      const folder = deepest.find((candidate) => holds(candidate, marker.cwd));
      if (!folder) continue;
      const total = totals.get(folder) || { working: false, attention: false, finished: 0 };
      if (marker.state === 'working') total.working = true;
      else if (marker.state === 'attention') total.attention = true;
      else if (marker.state === 'finished') total.finished = Math.max(total.finished, marker.ts);
      totals.set(folder, total);
    }
    return Object.fromEntries([...totals].map(([folder, total]) => [folder, state(total, this.#seen.get(folder) || 0)]));
  }

  // Focusing a project acknowledges a turn that ended while you were elsewhere. Not `attention`:
  // that one is a question, and reading it is not answering it. Records only - the focus that
  // caused it is already on its way to a render.
  seen(folder) {
    if (!folder) return;
    this.#seen.set(folder, Date.now());
  }

  #read() {
    const now = Date.now();
    this.#markers = this.#files()
      .map((file) => this.#marker(file))
      .filter((marker) => marker && now - marker.ts < ttl(marker.state));
    clearTimeout(this.#recheck);
    // An ESC ends a turn without firing any hook at all, so a marker can say working long after
    // the turn stopped. The transcript is the only trace, and re-reading it is the only way to
    // notice - so this looks again while, and only while, something says working.
    if (this.#markers.some((marker) => marker.state === 'working')) {
      this.#recheck = setTimeout(() => { this.#read(); this.#publish(); }, RECHECK_MS);
      this.#recheck.unref?.();
    }
  }

  #marker(file) {
    let record;
    try { record = JSON.parse(fs.readFileSync(path.join(this.#dir, file), 'utf8')); }
    catch { return null; }
    if (!record?.state || !record.cwd) return null;
    const marker = {
      state: record.state,
      cwd: record.cwd,
      ts: (record.ts || 0) * 1000,
      transcript: record.transcript || '',
    };
    // A turn you stopped yourself is over, but its session is still open: it falls back to the
    // steady state rather than to `finished`, which would announce something you already know.
    if (marker.state === 'working' && this.#interrupted(marker)) marker.state = 'active';
    return marker;
  }

  #interrupted(marker) {
    if (!marker.transcript) return false;
    let size;
    try { size = fs.statSync(marker.transcript).size; } catch { return false; }
    const cached = this.#interrupts.get(marker.transcript);
    const at = cached?.size === size ? cached.at : lastInterrupt(marker.transcript, size);
    this.#interrupts.set(marker.transcript, { size, at });
    return at > marker.ts;
  }

  #files() {
    try { return fs.readdirSync(this.#dir).filter((file) => file.endsWith('.json')); }
    catch { return []; }
  }

  // What the app already ignores, off the disk. At start only: sweeping on every change would
  // answer the watcher with more of its own events.
  #sweep() {
    const now = Date.now();
    for (const file of this.#files()) {
      const full = path.join(this.#dir, file);
      try {
        const record = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (now - (record.ts || 0) * 1000 < ttl(record.state)) continue;
      } catch { /* unreadable is expired too */ }
      try { fs.unlinkSync(full); } catch { /* gone already */ }
    }
  }

  #watch() {
    try { fs.mkdirSync(this.#dir, { recursive: true }); } catch { /* the read below answers */ }
    try {
      this.#watcher = fs.watch(this.#dir, () => {
        clearTimeout(this.#debounce);
        // One turn writes several markers in a row, and a marker arrives as a rename over a temp
        // file, which is two events.
        this.#debounce = setTimeout(() => { this.#read(); this.#publish(); }, 80);
      });
    } catch (error) {
      console.error('[activity] not watching, states will not update:', error.message);
    }
  }

  #publish() {
    const signature = JSON.stringify([this.#markers, [...this.#seen]]);
    if (signature === this.#signature) return;
    this.#signature = signature;
    this.#onChange();
  }

  // The script, then the entries that call it: a hook naming a script that is not there yet fails
  // on every event of every session until it is.
  #installHooks() {
    const python = findPython();
    if (!python) {
      console.error(`[activity] no python3 at ${pythonCandidates().join(' or ')}, so no hooks and no Claude state`);
      return;
    }
    try {
      fs.mkdirSync(path.dirname(this.#script), { recursive: true });
      fs.writeFileSync(this.#script, hookScript(this.#dir));
      fs.chmodSync(this.#script, 0o755);
    } catch (error) {
      return void console.error('[activity] hook script:', error.message);
    }

    let raw = null;
    let settings = {};
    try {
      if (fs.existsSync(this.#settings)) {
        raw = fs.readFileSync(this.#settings, 'utf8');
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
      const command = `${JSON.stringify(python)} ${JSON.stringify(this.#script)} ${mode}`;
      const group = { hooks: [{ type: 'command', command }] };
      if (matcher) group.matcher = matcher;
      (hooks[event] = hooks[event] || []).push(group);
    }
    if (JSON.stringify(hooks) === JSON.stringify(settings.hooks || {})) return;

    try {
      fs.mkdirSync(path.dirname(this.#settings), { recursive: true });
      const backup = `${this.#settings}.ct-backup`;
      if (raw !== null && !fs.existsSync(backup)) fs.writeFileSync(backup, raw);
      const temporary = `${this.#settings}.ct-tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`);
      fs.renameSync(temporary, this.#settings);
      console.log('[activity] Claude hooks installed');
    } catch (error) {
      console.error('[activity] could not write ~/.claude/settings.json:', error.message);
    }
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

const ttl = (state) => (state === 'active' ? OPEN_MS : STALE_MS);

const holds = (folder, cwd) => cwd === folder || cwd.startsWith(folder + path.sep);

function state(total, seen) {
  if (total.working) return 'working';
  if (total.attention) return 'attention';
  if (total.finished > seen) return 'finished';
  return 'active';
}

// Epoch ms of the newest interrupt in a transcript, or 0. Only the tail is read: the record is
// the last thing written when it happens, and a transcript runs to megabytes.
function lastInterrupt(file, size) {
  const length = Math.min(size, INTERRUPT_TAIL);
  let handle = null;
  try {
    handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    for (let index = lines.length - 1; index >= 0; index--) {
      // Cheap reject before parsing, and the first line of the tail is usually a clipped one.
      if (!lines[index].includes('Request interrupted by user')) continue;
      let record;
      try { record = JSON.parse(lines[index]); } catch { continue; }
      // The exact sentence and nothing else: a prompt that quotes it is not an interrupt.
      if (record?.type === 'user' && record.timestamp && INTERRUPT.test(text(record).trim())) {
        return Date.parse(record.timestamp) || 0;
      }
    }
  } catch { /* unreadable transcript: no interrupt */ } finally {
    if (handle !== null) { try { fs.closeSync(handle); } catch { /* closing a gone fd */ } }
  }
  return 0;
}

// A record's text, whether its content is a string, a list of parts or a tool result - the "for
// tool use" interrupt arrives as the last of those.
function text(record) {
  const content = record?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    return part?.text || (typeof part?.content === 'string' ? part.content : '');
  }).join('');
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
