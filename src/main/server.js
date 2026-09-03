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

  urlFor(folder) {
    return `http://127.0.0.1:${this.#port}/?folder=${encodeURIComponent(folder)}`;
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
      if (command.includes('code-server')) process.kill(-record.pid, 'SIGTERM');
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
