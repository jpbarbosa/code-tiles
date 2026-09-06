import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const HEALTH_TIMEOUT_MS = 40000;

// One code-server for the whole app. Every tile is a window of it, which is what makes the
// login, the settings and the extensions shared without anything syncing them.
export class CodeServer {
  #bin;
  #paths;
  #child = null;
  #port = null;

  constructor({ bin, paths }) {
    this.#bin = bin;
    this.#paths = paths;
  }

  get port() {
    return this.#port;
  }

  // A window resolves its profile from the `profile` entry of the URL's payload, before any
  // stored folder association is consulted - so the app says which profile a tile is, on every
  // load, rather than hoping the right association survived somewhere. Naming a profile the
  // registry has not been seeded with renders the window blank, so this stays null until it has.
  urlFor(folder, profile) {
    const url = `http://127.0.0.1:${this.#port}/?folder=${encodeURIComponent(folder)}`;
    if (!profile) return url;
    return `${url}&payload=${encodeURIComponent(JSON.stringify([['profile', profile]]))}`;
  }

  // The same shape read the other way: which folder a window is standing on. A tile can re-point
  // itself from the inside, so the URL has to be read back as well as written, and one place
  // knows how it is spelled. Null where there is no folder in it, which is a window that closed
  // its own - an empty workbench is not a project.
  folderOf(url) {
    try { return new URL(url).searchParams.get('folder') || null; } catch { return null; }
  }

  async start(preferredPort) {
    this.#reapOrphan();
    this.#port = (await isFree(preferredPort)) ? preferredPort : await freePort();

    // Detached so the child leads its own process group: one kill takes the server and every
    // pty and extension host under it, which a plain kill of the parent does not.
    this.#child = spawn(this.#bin, [
      '--auth', 'none',
      '--bind-addr', `127.0.0.1:${this.#port}`,
      '--disable-telemetry',
      '--disable-update-check',
      // What a window calls the thing it is: code-server serves this flag to the workbench as
      // its `nameLong`, so it names the welcome page, the document title and the About dialog
      // at once. The `welcome` seam is the rest of that page.
      '--app-name', 'Code Tiles',
      // Coder's own "Next Up" panel on the welcome page, which advertises their hosted product.
      '--disable-getting-started-override',
      '--user-data-dir', this.#paths.serverData,
      '--extensions-dir', this.#paths.extensions,
    ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

    this.#child.on('exit', () => { this.#child = null; });
    fs.writeFileSync(this.#paths.pidfile, JSON.stringify({ pid: this.#child.pid, port: this.#port }));

    await this.#waitHealthy();
    return this.#port;
  }

  stop() {
    if (!this.#child) return;
    killDescendants(this.#child.pid);
    try { process.kill(-this.#child.pid, 'SIGTERM'); } catch { /* already gone */ }
    this.#child = null;
    try { fs.unlinkSync(this.#paths.pidfile); } catch { /* never written */ }
  }

  // A crash of the app leaves the server running and holding the port. Its pid is on disk, and
  // the command line is checked before anything is killed: pids are reused.
  #reapOrphan() {
    let record;
    try { record = JSON.parse(fs.readFileSync(this.#paths.pidfile, 'utf8')); } catch { return; }
    try {
      const command = execFileSync('ps', ['-o', 'command=', '-p', String(record.pid)], { encoding: 'utf8' });
      if (command.includes('code-server')) {
        killDescendants(record.pid);
        process.kill(-record.pid, 'SIGTERM');
      }
    } catch { /* not running */ }
    try { fs.unlinkSync(this.#paths.pidfile); } catch { /* ignore */ }
  }

  async #waitHealthy() {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        await get(`http://127.0.0.1:${this.#port}/healthz`);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`code-server did not answer on ${this.#port}: ${lastError?.message}`);
  }
}

// Every process under `root` in a `ps -Ao pid=,ppid=` table, deepest first so nothing is killed
// while it can still spawn. Pure, so the walk is testable without a process tree to kill.
export function descendants(table, root) {
  const children = new Map();
  for (const line of table.trim().split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (parent >= 0 && pid !== parent) children.set(parent, [...(children.get(parent) ?? []), pid]);
  }

  const tree = [];
  const queue = [root];
  while (queue.length) {
    for (const child of children.get(queue.shift()) ?? []) { tree.push(child); queue.push(child); }
  }
  return tree.reverse();
}

// The pty host gives each terminal its own session, so the group signal never reaches what a
// terminal started: a dev server outlives the app, and macOS goes on listing the bundle as
// running - the dim Dock dot whose first click is spent reaping that record, not opening the app.
function killDescendants(root) {
  let table;
  try { table = execFileSync('ps', ['-Ao', 'pid=,ppid='], { encoding: 'utf8' }); } catch { return; }
  // SIGKILL: the app is gone half a second after this, which is not long enough to hold a shell
  // to a SIGTERM, and one survivor is the dot again.
  for (const pid of descendants(table, root)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1500 }, (response) => {
      response.resume();
      if (response.statusCode === 200) resolve();
      else reject(new Error(`status ${response.statusCode}`));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

function isFree(port) {
  if (!port) return Promise.resolve(false);
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
