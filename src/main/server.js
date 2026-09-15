import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import { IS_WINDOWS, serverCommand } from './platform.js';

const HEALTH_TIMEOUT_MS = 40000;
const RELEASE_TIMEOUT_MS = 5000;

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
    this.#port = (await waitUntilFree(preferredPort)) ? preferredPort : await freePort();

    // Detached so the child leads its own process group: one kill takes the server and every
    // pty and extension host under it, which a plain kill of the parent does not. Windows has no
    // process groups to lead, so it opts out and `killDescendants` takes the tree there instead.
    const command = serverCommand(this.#bin, [
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
    ]);
    this.#child = spawn(command.file, command.args, {
      ...(IS_WINDOWS ? { windowsHide: true } : { detached: true }),
      shell: command.shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // A server that refuses to start says why on its stderr and then exits, and the health poll
    // that follows only ever learns that nothing answered - which is the port's name and none of
    // the reason. The startup dialog is the one place a failure is ever read, so what the server
    // said has to reach it.
    let complaint = '';
    this.#child.stderr.on('data', (chunk) => {
      complaint = `${complaint}${chunk}`.slice(-2000);
      process.stderr.write(`[code-server] ${chunk}`);
    });
    // Its own exit is the answer arriving early: nothing is going to bind that port now, and
    // waiting out the timeout only delays the same failure by forty seconds.
    const exited = new Promise((resolve) => this.#child.on('exit', (code) => {
      this.#child = null;
      resolve(code);
    }));
    fs.writeFileSync(this.#paths.pidfile, JSON.stringify({ pid: this.#child.pid, port: this.#port }));

    await this.#waitHealthy(exited, () => complaint.trim());
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

  async #waitHealthy(exited, complaint) {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        await get(`http://127.0.0.1:${this.#port}/healthz`);
        return;
      } catch (error) {
        lastError = error;
        if (!this.#child) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const said = complaint();
    // Only here is the exit code worth waiting on: the child is already gone, and it is all
    // there is to say about a server that failed without a word.
    if (!this.#child) throw new Error(`code-server quit instead of starting:\n${said || `exit ${await exited}`}`);
    throw new Error(`code-server did not answer on ${this.#port}: ${lastError?.message}\n${said}`.trim());
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
  // taskkill takes the tree itself, which is the only way to reach it without process groups.
  if (IS_WINDOWS) {
    try { execFileSync('taskkill', ['/pid', String(root), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    return;
  }
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

// The saved port IS the tiles' origin: their login, every extension's secrets and each window's
// layout are keyed by it, so any other port opens them all on an empty browser profile. What holds
// it at a start is nearly always our own server, killed a moment earlier and still letting go -
// polled, because a process that is not our child has no exit to await.
export async function waitUntilFree(port, timeout = RELEASE_TIMEOUT_MS) {
  if (!port) return false;
  const deadline = Date.now() + timeout;
  while (!(await isFree(port))) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

// Who is listening, as `ps` names it, for the warning a stand-in port raises. Null wherever that
// cannot be told, Windows included: there is no lsof to ask.
export function portHolder(port) {
  try {
    const pid = execFileSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .trim().split('\n')[0];
    const command = execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).trim();
    return `${command.slice(0, 160)} (pid ${pid})`;
  } catch {
    return null;
  }
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
