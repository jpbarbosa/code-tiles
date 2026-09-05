import fs from 'node:fs';
import path from 'node:path';
import { hueFor } from './hue.js';
import { iconFor } from './icon.js';
import { arranged, inserted, swapped } from './order.js';

// A project IS its folder. No generated id, no stored name, no stored colour: everything a
// project has is either the path or derived from it, so nothing can fall out of step with the
// folder and there is no field to migrate when a rule changes.
export class Projects {
  #store;
  #profileFor;
  #claudeStates;

  constructor(store, { profileFor = () => null, claudeStates = () => ({}) } = {}) {
    this.#store = store;
    this.#profileFor = profileFor;
    this.#claudeStates = claudeStates;
    this.#write(this.#entries().filter((entry) => fs.existsSync(entry.folder)));
  }

  get mode() {
    return this.#store.state.mode;
  }

  set mode(mode) {
    this.#store.update({ mode });
  }

  // Which project holds the column of its own, or null for the even grid. A choice rather than a
  // derivation, like the sizes below and for the same reason: the focus moves on its own, and a
  // master that followed it would make every click into a promotion. A folder that is not open
  // is no master, so closing the wide one evens the grid rather than leaving a cell nobody holds.
  get maximized() {
    const folder = this.#store.state.maximized;
    if (typeof folder !== 'string') return null;
    return this.#entries().some((entry) => entry.open && entry.folder === folder) ? folder : null;
  }

  set maximized(folder) {
    this.#store.update({ maximized: typeof folder === 'string' ? folder : null });
  }

  // The grid's proportions, the other choice. Keyed by shape; what a key means is the desk's
  // business, not this list's.
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
    return this.#describeAll(this.#entries());
  }

  // The tiles, in the same order.
  open() {
    return this.#describeAll(this.#entries().filter((entry) => entry.open));
  }

  // In one pass, because which project a Claude session belongs to is answered against the whole
  // list at once: a session in a nested folder belongs to the deeper of two open projects.
  #describeAll(entries) {
    const focused = this.focused;
    const claude = this.#claudeStates(entries.map((entry) => entry.folder));
    return entries.map((entry) => this.#describe(entry, focused, claude));
  }

  #describe(entry, focused, claude) {
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
      // What Claude is doing in this folder, or 'idle' where it is doing nothing and where the
      // hooks were never installed. Derived like the rest of this: nothing is stored.
      claudeState: claude[entry.folder] || 'idle',
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

  // The strip's gesture, the grid's, and either of them abandoned. What each one means is in
  // src/main/order.js, with nothing around it; what this list adds is that an order is written
  // once and only ever for the open slots.
  move(folder, index) {
    this.#arrange(inserted(this.#openFolders(), folder, index));
  }

  swap(a, b) {
    this.#arrange(swapped(this.#openFolders(), a, b));
  }

  // A gesture abandoned: the open order as it was when it started.
  restore(folders) {
    this.#arrange(folders);
  }

  #openFolders() {
    return this.#entries().filter((entry) => entry.open).map((entry) => entry.folder);
  }

  #arrange(folders) {
    this.#write(arranged(this.#entries(), folders));
  }

  #entries() {
    return this.#store.state.entries.map((entry) => ({ ...entry }));
  }

  #write(entries) {
    this.#store.update({ entries });
  }
}
