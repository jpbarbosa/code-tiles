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
    installHooks({ dir: this.#dir, script: this.#script, settings: this.#settings });
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

