import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// One extensions directory for the whole app, holding the union of every mirrored profile's
// set. A profile shows a subset of it; nothing here decides what a window sees.
//
// Both halves run BEFORE the server is spawned: it scans this directory as it boots and will
// not notice an arrival or a removal until a window reloads.

// Asking for these is a network round trip to a 404 on every single start. They are proprietary
// Microsoft builds that refuse to run outside official VS Code, and the remote ones would mean
// nothing inside code-server anyway.
const NEVER_INSTALLABLE = [
  /^ms-python\.vscode-pylance$/,
  /^github\.copilot/,
  /^ms-vscode-remote\./,
  /^ms-vscode\.remote-/,
];

export class Extensions {
  #bin;
  #dir;
  #missCache;

  constructor({ bin, dir, missCache }) {
    this.#bin = bin;
    this.#dir = dir;
    this.#missCache = missCache;
  }

  // The manifest code-server keeps of what is installed here. Profiles copy entries out of it
  // verbatim, so this is the only place that reads it.
  entries() {
    return readJson(path.join(this.#dir, 'extensions.json'), []) || [];
  }

  installed() {
    return new Set(this.entries().map((entry) => entry?.identifier?.id).filter(Boolean));
  }

  async install(wanted) {
    const installed = this.installed();
    const missed = new Set(readJson(this.#missCache, []) || []);
    const missing = [...wanted].filter((id) => (
      !installed.has(id) && !missed.has(id) && !NEVER_INSTALLABLE.some((re) => re.test(id))
    ));
    if (!missing.length) return { installed: [], unavailable: [] };

    console.log(`[extensions] installing ${missing.length}: ${missing.join(', ')}`);
    await this.#run(missing.flatMap((id) => ['--install-extension', id]));

    // The exit code is not the answer: one bad id makes the whole batch exit non-zero while
    // every good id still lands. Read the manifest back and believe that instead.
    const now = this.installed();
    const unavailable = missing.filter((id) => !now.has(id));
    if (unavailable.length) {
      for (const id of unavailable) missed.add(id);
      write(this.#missCache, `${JSON.stringify([...missed].sort(), null, 2)}\n`);
      console.log(`[extensions] not on Open VSX: ${unavailable.sort().join(', ')}`);
    }
    return { installed: missing.filter((id) => now.has(id)), unavailable };
  }

  // Nothing above ever uninstalls, so without this the directory only grows: an extension
  // dropped from the desktop, or a whole profile deleted, would stay here forever and keep
  // being offered to every profile that inherits the installed set.
  prune(wanted) {
    const entries = this.entries();
    if (!entries.length || !wanted.size) return [];
    const drop = entries.filter((entry) => !wanted.has(entry?.identifier?.id));
    if (!drop.length) return [];

    for (const entry of drop) {
      const dir = entry.location?.path;
      // Only ever delete inside this directory: the manifest is data, and a stray path in it
      // must not become an rm somewhere else.
      if (dir && dir.startsWith(this.#dir + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
    }
    write(
      path.join(this.#dir, 'extensions.json'),
      JSON.stringify(entries.filter((entry) => wanted.has(entry?.identifier?.id)), null, 2),
    );
    const ids = drop.map((entry) => entry?.identifier?.id).sort();
    console.log(`[extensions] pruned ${ids.length} nothing wants: ${ids.join(', ')}`);
    return ids;
  }

  #run(args) {
    return new Promise((resolve) => {
      const child = spawn(this.#bin, ['--extensions-dir', this.#dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', (chunk) => process.stderr.write(`[extensions] ${chunk}`));
      child.on('exit', resolve);
      child.on('error', (error) => {
        console.error('[extensions] install failed:', error.message);
        resolve();
      });
    });
  }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
