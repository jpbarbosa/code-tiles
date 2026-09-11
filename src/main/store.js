import fs from 'node:fs';

import { writeAtomic } from './json.js';

const VERSION = 1;

const EMPTY = {
  version: VERSION,
  entries: [],        // [{ folder, open, chosen? }] - order IS the project order
  focusedFolder: null,
  mode: 'grid',       // 'grid' | 'single'
  // Which project holds the master column, by folder, or null for the even grid. Not the focus:
  // clicking into a stacked tile moves that and leaves this alone.
  maximized: null,
  // The grid's proportions, per grid SHAPE: { "2x2": { cols: [...], rows: [...] } }. Shares,
  // never pixels, so a resized window keeps them.
  sizes: {},
  // How much of its colour a window wears, one rung per state. `corners` and `sound`, the other two
  // preferences, are absent until chosen: src/guest/corners.cjs holds one default and
  // src/main/preferences.js the other.
  tint: { focused: 'medium', quiet: 'medium' },
  serverPort: null,   // reused so the origin, and so the login, is stable
};

// One file, written whole, replaced atomically. Small enough that a diff would cost more than
// it saves, and a half-written state file is the one failure that loses every project.
export class Store {
  #file;
  #state;

  constructor(file) {
    this.#file = file;
    this.#state = this.#load();
  }

  get state() {
    return this.#state;
  }

  update(patch) {
    this.#state = { ...this.#state, ...patch, version: VERSION };
    this.#flush();
    return this.#state;
  }

  #load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.#file, 'utf8'));
      if (raw.version !== VERSION) return { ...EMPTY };
      return { ...EMPTY, ...raw };
    } catch {
      return { ...EMPTY };
    }
  }

  #flush() {
    writeAtomic(this.#file, JSON.stringify(this.#state, null, 2));
  }
}
