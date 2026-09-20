import fs from 'node:fs';
import path from 'node:path';

import { installHooks } from './activity-hooks.js';

// What Claude is doing in each project, taken from the hooks Claude Code fires. A hook writes one
// marker file per session; this reads them, maps each session to the project it started in, and
// answers with a state per project. Nothing here knows what a ring looks like, and nothing here
// writes: installing the hooks that feed it is `activity-hooks.js`, which this only starts.

// A turn older than this is not believed. Nothing writes an "I am still here" marker, so a
// session killed mid-turn would otherwise work forever.
const STALE_MS = 60 * 60 * 1000;
// SessionEnd does not always land, so an idle session's own marker expires sooner.
const OPEN_MS = 15 * 60 * 1000;
// While anything reads as working, the transcript is the only place an ESC shows up, and nothing
// announces it. Bounded by its own condition: no project working, no timer.
const RECHECK_MS = 10 * 1000;

const INTERRUPT = /^\[Request interrupted by user( for tool use)?\]$/;
// A background task names itself when it starts and again when it lands, which is the only place
// a turn that parked on one reads differently from a turn that is over.
const LAUNCHED = /Command running in background with ID: (\w+)/g;
const LANDED = /<task-id>(\w+)<\/task-id>/g;
// The cheap reject that keeps the tail from being parsed line by line for nothing.
const INTERESTING = /Request interrupted by user|running in background with ID|<task-id>/;
// Claude Code's idle Notification, the exact sentence: a permission prompt's message is another.
const IDLE_WAIT = 'Claude is waiting for your input';
const TAIL_BYTES = 64 * 1024;

export class Activity {
  #dir;
  #script;
  #settings;
  #onChange;
  #onWaiting;
  #markers = [];
  #seen = new Map();
  #tails = new Map();
  #watcher = null;
  #debounce = null;
  #recheck = null;
  #signature = '';

  constructor({ dir, script, settings, onChange = () => {}, onWaiting = () => {} }) {
    this.#dir = dir;
    this.#script = script;
    this.#settings = settings;
    this.#onChange = onChange;
    this.#onWaiting = onWaiting;
  }

  start() {
    installHooks({ dir: this.#dir, script: this.#script, settings: this.#settings });
    // A guest reads the owner's directory and leaves it alone. The markers it would sweep are
    // expired ones both instances already ignore, and the owner drops them at its own start.
    if (this.#settings) this.#sweep();
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
      this.#recheck = setTimeout(() => this.#refresh(), RECHECK_MS);
      this.#recheck.unref?.();
    }
  }

  // Every read but the one at start, which is the baseline: a marker already on disk when the app
  // came up is not news.
  #refresh() {
    const was = new Map(this.#markers.map((marker) => [marker.session, marker]));
    this.#read();
    for (const marker of this.#markers) {
      const before = was.get(marker.session);
      // What a hook WROTE, never what a read derived: a park ends on the same marker read again,
      // and the turn it ends was already answered for when that marker arrived.
      if (before && marker.ts === before.ts) continue;
      if (turnedToWait(marker.state, before?.state)) this.#onWaiting(marker);
    }
    this.#publish();
  }

  #marker(file) {
    let record;
    try { record = JSON.parse(fs.readFileSync(path.join(this.#dir, file), 'utf8')); }
    catch { return null; }
    if (!record?.state || !record.cwd) return null;
    const marker = {
      session: path.basename(file, '.json'),
      state: record.state,
      cwd: record.cwd,
      ts: (record.ts || 0) * 1000,
      transcript: record.transcript || '',
      // Only a Notification carries one, and it is what tells the idle one from a permission prompt.
      message: record.message || '',
    };
    // A turn you stopped yourself is over, but its session is still open: it falls back to the
    // steady state rather than to `finished`, which would announce something you already know.
    if (marker.state === 'working' && this.#interrupted(marker)) marker.state = 'active';
    // A turn that ended on a background task it launched is parked, not over: the work is still
    // running, so the state holds where it was and nothing announces anything.
    else if (parkable(marker) && this.#parked(marker)) marker.state = 'working';
    return marker;
  }

  #interrupted(marker) {
    const tail = this.#tail(marker);
    return !!tail && tail.interrupt > marker.ts;
  }

  // Believed for as long as a marker is: a task that never lands - a `tail -f`, a server - would
  // otherwise hold its tile silent for the rest of the session.
  #parked(marker) {
    const tail = this.#tail(marker);
    return !!tail && Date.now() - tail.launched < STALE_MS;
  }

  #tail(marker) {
    if (!marker.transcript) return null;
    let size;
    try { size = fs.statSync(marker.transcript).size; } catch { return null; }
    const cached = this.#tails.get(marker.transcript);
    const tail = cached?.size === size ? cached : { size, ...readTail(marker.transcript, size) };
    this.#tails.set(marker.transcript, tail);
    return tail;
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
        this.#debounce = setTimeout(() => this.#refresh(), 80);
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

}

const ttl = (state) => (state === 'active' ? OPEN_MS : STALE_MS);

const holds = (folder, cwd) => cwd === folder || cwd.startsWith(folder + path.sep);

// On the change only: a permission prompt raises a Notification after its own PermissionRequest,
// and that is one question. So is a finished turn raising Claude Code's idle Notification a minute
// later, which is the same wait said again.
const WAITING = ['finished', 'attention'];

// The two ways a turn parked on a background task reaches here: its Stop, and Claude Code's idle
// Notification a minute later, which suppresses itself for a loop wakeup and for nothing else. A
// permission prompt is a question about the task, not the wait for it, and keeps its ring.
const parkable = (marker) => marker.state === 'finished'
  || (marker.state === 'attention' && marker.message === IDLE_WAIT);

function turnedToWait(state, was) {
  if (!WAITING.includes(state) || state === was) return false;
  return !(state === 'attention' && was === 'finished');
}

function state(total, seen) {
  if (total.working) return 'working';
  if (total.attention) return 'attention';
  if (total.finished > seen) return 'finished';
  return 'active';
}

// Epoch ms of the newest interrupt in a transcript and of the newest background task still
// running, each 0 for none. Only the tail is read: both records are written where they happen,
// and a transcript runs to megabytes. One pass, because one read answers both.
function readTail(file, size) {
  const length = Math.min(size, TAIL_BYTES);
  const started = new Map();
  const landed = new Set();
  let interrupt = 0;
  let handle = null;
  try {
    handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, size - length);
    for (const line of buffer.toString('utf8').split('\n')) {
      // Cheap reject before parsing, and the first line of the tail is usually a clipped one.
      if (!INTERESTING.test(line)) continue;
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      // Claude Code writes all three as a user record: what an assistant says about one is talk.
      if (record?.type !== 'user' || !record.timestamp) continue;
      const at = Date.parse(record.timestamp) || 0;
      const body = text(record);
      // The exact sentence and nothing else: a prompt that quotes it is not an interrupt.
      if (INTERRUPT.test(body.trim())) interrupt = Math.max(interrupt, at);
      for (const [, id] of body.matchAll(LAUNCHED)) started.set(id, at);
      for (const [, id] of body.matchAll(LANDED)) landed.add(id);
    }
  } catch { /* unreadable transcript: nothing to say about either */ } finally {
    if (handle !== null) { try { fs.closeSync(handle); } catch { /* closing a gone fd */ } }
  }
  // Read whole before matched, so a task whose landing the tail holds and whose start it lost is
  // not read as running.
  let launched = 0;
  for (const [id, at] of started) if (!landed.has(id)) launched = Math.max(launched, at);
  return { interrupt, launched };
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

