import fs from 'node:fs';

import { missingPatches, patchExtensions } from '../guest/disk/extension.js';

// The seams' patches on an extension's own bundle, kept on the copy the server loads. An extension
// updates itself while the app runs, and the server extracts the new version into a hidden folder,
// renames that into place and only then names it in the manifest - so a manifest write is the
// moment a fresh, stock copy has appeared, and the moment to patch it.
const MANIFEST = 'extensions.json';

export class ExtensionPatches {
  #dir;
  #send;
  #watcher = null;
  #debounce = null;

  constructor({ dir, send }) {
    this.#dir = dir;
    this.#send = send;
  }

  apply() {
    const rewritten = patchExtensions(this.#dir);
    if (rewritten.length) console.log(`[extension] ${rewritten.join(', ')}`);
    this.publish();
  }

  // Read off disk each time rather than kept from the last pass: a hand-run `npm run patch-vscode`
  // writes here too, and the strip is about the copy, not about this process.
  publish() {
    this.#send(missingPatches(this.#dir));
  }

  // The directory rather than the file: a file watch follows the inode it started on, and goes deaf
  // the first time a writer replaces the file whole. The pass writes only inside version folders,
  // so it never answers itself.
  watch() {
    try {
      this.#watcher = fs.watch(this.#dir, (_event, name) => {
        if (name && name !== MANIFEST) return;
        clearTimeout(this.#debounce);
        // A single write can arrive as more than one event.
        this.#debounce = setTimeout(() => this.apply(), 250);
      });
    } catch (error) {
      console.error('[extension] not watching, an update runs stock until the next start:', error.message);
    }
  }

  stop() {
    this.#watcher?.close();
    this.#watcher = null;
    clearTimeout(this.#debounce);
  }
}
