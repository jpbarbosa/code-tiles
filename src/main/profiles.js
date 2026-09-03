import fs from 'node:fs';
import path from 'node:path';

import { settingsFrom } from '../guest/disk/settings.js';

// The desktop's profiles, reproduced on the server's filesystem. code-server is a Code-OSS
// build with no `configurationSync.store`, so no account will ever pull them down; the only
// way to have them is to write them.
//
// Every file here is a COPY, never a link back to the desktop. The desktop is read-only to
// this app: a window can save anything it likes into a mirrored profile and the worst that can
// happen is this app overwrites it again. The previous implementation linked the two and had
// to grow guards against its own healer pushing an empty settings model onto the real file.
export class ProfileMirror {
  #home;
  #profiles;
  #extensions;
  #watcher = null;

  constructor({ home, profiles, extensions }) {
    this.#home = home;
    this.#profiles = profiles;
    this.#extensions = extensions;
  }

  write() {
    const entries = this.#extensions.entries();
    for (const profile of this.#profiles) {
      const dir = path.join(this.#home, profile.location);
      fs.mkdirSync(dir, { recursive: true });

      // Always written, even with no desktop file behind it: a profile does not inherit the
      // default profile's settings, so this is the only copy of the seams the window will see.
      writeIfChanged(path.join(dir, 'settings.json'), settingsFrom(profile.sources.settings));

      if (profile.sources.keybindings) {
        writeIfChanged(path.join(dir, 'keybindings.json'), read(profile.sources.keybindings));
      }
      if (profile.sources.snippets) copyDir(profile.sources.snippets, path.join(dir, 'snippets'));

      writeIfChanged(path.join(dir, 'extensions.json'), manifestFor(profile, entries));
    }
  }

  // The workbench deletes every directory under this one that no REGISTERED profile claims,
  // and it does that in every window - so opening one project can empty the profile another is
  // about to reload into. A window that loads on an emptied profile has no extensions and an
  // empty settings model, which reads as "this tile lost its theme" rather than as a missing
  // file. The registry seed is what normally prevents it; this is what survives the seed being
  // lost. Written against code-server 4.135.0.
  watch() {
    if (this.#watcher) return;
    fs.mkdirSync(this.#home, { recursive: true });
    let pending = null;
    try {
      this.#watcher = fs.watch(this.#home, { recursive: true }, () => {
        clearTimeout(pending);
        pending = setTimeout(() => this.#restore(), 100);
      });
    } catch (error) {
      console.error('[profiles] watching the mirror failed:', error.message);
    }
  }

  stop() {
    this.#watcher?.close();
    this.#watcher = null;
  }

  #restore() {
    // Both files, not one: a profile missing either is a window with no extensions or an empty
    // settings model, and those are the two halves that read as "this tile lost everything".
    const gone = this.#profiles.filter((profile) => (
      !['settings.json', 'extensions.json']
        .every((name) => fs.existsSync(path.join(this.#home, profile.location, name)))
    ));
    if (!gone.length) return;
    console.error(`[profiles] rewriting ${gone.length} profile(s) deleted under a live server`);
    this.write();
  }
}

// A profile's extensions.json is read by the remote scanner AND by the browser's own web
// extension scanner, which treats it as a store of its own. Entries are therefore copied out of
// the shared directory's manifest EXACTLY as they are: `file:` locations the server reads
// natively and the web worker cannot fetch, so it skips them and leaves the file alone. Hand it
// anything fetchable and it adopts every web-capable extension, rewrites this file into its own
// format, and every window nags "N require restart" for good.
function manifestFor(profile, entries) {
  const subset = entries
    .filter((entry) => entry.location?.path && profile.extensionIds.has(entry.identifier?.id))
    .map((entry) => {
      // An application-scoped extension is skipped inside a profile rather than loaded, and a
      // theme that does not load leaves `workbench.colorTheme` naming nothing.
      const metadata = { ...entry.metadata };
      delete metadata.isApplicationScoped;
      return { ...entry, metadata };
    });
  return `${JSON.stringify(subset, null, 2)}\n`;
}

// Rewriting a file with identical content still moves its mtime, and code-server keys its
// extension scan cache off that: an unchanged mirror must not be touched at all.
function writeIfChanged(file, content) {
  if (content === null) return false;
  try { if (fs.readFileSync(file, 'utf8') === content) return false; } catch { /* absent */ }
  fs.writeFileSync(file, content);
  return true;
}

function copyDir(from, to) {
  try { fs.cpSync(from, to, { recursive: true, force: true }); } catch { /* nothing to copy */ }
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
