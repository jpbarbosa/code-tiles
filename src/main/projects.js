import fs from 'node:fs';
import path from 'node:path';
import { hueFor } from './hue.js';
import { iconFor } from './icon.js';

// A project IS its folder. No generated id, no stored name, no stored colour: everything a
// project has is either the path or derived from it, so nothing can fall out of step with the
// folder and there is no field to migrate when a rule changes.
export class Projects {
  #store;
  #profileFor;

  constructor(store, profileFor = () => null) {
    this.#store = store;
    this.#profileFor = profileFor;
    this.#write(this.#entries().filter((entry) => fs.existsSync(entry.folder)));
  }

  get mode() {
    return this.#store.state.mode;
  }

  set mode(mode) {
    this.#store.update({ mode });
  }

  // Whether the grid gives one project a column of its own. Which project that is stays derived:
  // it is the focused one, so a project cannot be the master and unfocused at once.
  get maximized() {
    return Boolean(this.#store.state.maximized);
  }

  set maximized(maximized) {
    this.#store.update({ maximized: Boolean(maximized) });
  }

  // The one thing about the grid that is a choice rather than a derivation, so the one thing
  // here that is stored. Keyed by shape; what a key means is the desk's business, not this list's.
  get sizes() {
    return this.#store.state.sizes || {};
  }

  set sizes(sizes) {
    this.#store.update({ sizes });
  }

  get focused() {
    const open = this.#entries().filter((entry) => entry.open);
    const wanted = this.#store.state.focusedFolder;
    if (open.some((entry) => entry.folder === wanted)) return wanted;
    return open.length ? open[0].folder : null;
  }

  set focused(folder) {
    this.#store.update({ focusedFolder: folder });
  }

  // Everything ever opened here, in project order: the picker's list.
  all() {
    const focused = this.focused;
    return this.#entries().map((entry) => this.#describe(entry, focused));
  }

  // The tiles, in the same order.
  open() {
    const focused = this.focused;
    return this.#entries().filter((entry) => entry.open).map((entry) => this.#describe(entry, focused));
  }

  #describe(entry, focused) {
    return {
      folder: entry.folder,
      name: path.basename(entry.folder),
      hue: hueFor(entry.folder),
      icon: iconFor(entry.folder),
      // Which of your VS Code profiles this folder belongs to. Derived from the same place the
      // name and the hue are - the path - so nothing here can fall out of step with the desktop.
      profile: this.#profileFor(entry.folder),
      open: Boolean(entry.open),
      focused: entry.folder === focused,
    };
  }

  add(folder) {
    const resolved = fs.realpathSync(folder);
    const entries = this.#entries();
    const existing = entries.find((entry) => entry.folder === resolved);
    if (existing) existing.open = true;
    else entries.push({ folder: resolved, open: true });
    this.#write(entries);
    this.focused = resolved;
    return resolved;
  }

  close(folder) {
    const entries = this.#entries();
    const entry = entries.find((item) => item.folder === folder);
    if (entry) entry.open = false;
    this.#write(entries);
    if (this.#store.state.focusedFolder === folder) this.focused = this.focused;
    return this.open();
  }

  forget(folder) {
    this.#write(this.#entries().filter((entry) => entry.folder !== folder));
  }

  // Single view's gesture: the dragged project lands at an index and the rest shift along.
  move(folder, index) {
    const entries = this.#entries();
    const from = entries.findIndex((entry) => entry.folder === folder);
    if (from < 0) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(Math.max(0, Math.min(entries.length, index)), 0, entry);
    this.#write(entries);
  }

  // The grid's gesture: two tiles trade slots and nothing else moves.
  swap(a, b) {
    const entries = this.#entries();
    const i = entries.findIndex((entry) => entry.folder === a);
    const j = entries.findIndex((entry) => entry.folder === b);
    if (i < 0 || j < 0) return;
    [entries[i], entries[j]] = [entries[j], entries[i]];
    this.#write(entries);
  }

  #entries() {
    return this.#store.state.entries.map((entry) => ({ ...entry }));
  }

  #write(entries) {
    this.#store.update({ entries });
  }
}
