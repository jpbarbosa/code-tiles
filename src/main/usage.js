import fs from 'node:fs';
import path from 'node:path';
import { safeStorage, shell } from 'electron';

import { OAuthError, authorizeUrl, exchange, pkce, readUsage, splitCode } from './oauth.js';

// One account, one poll, for the whole app: usage is account-global, so a per-tile poll would be
// the same number fetched n times into the same 429.
//
// Numbers are live or absent. There is deliberately no estimate from local transcripts, because
// an estimate can only calibrate against your own biggest window ever run, and then reads 100%
// every time you set a new peak.
const TICK_MS = 90 * 1000;
const FLOOR_MS = 5 * 60 * 1000;   // the endpoint 429s if it is asked more often than this
const BACKOFF_MS = 5 * 60 * 1000; // when a 429 arrives without a Retry-After

export class Usage {
  #file;
  #send;
  #token = null;
  #snapshot = null;      // the last reading that came back, kept through a failure
  #verifier = null;      // the PKCE verifier of a login in flight
  #needsReauth = false;
  #lastReadAt = 0;
  #coolUntil = 0;
  #reading = false;
  #timer = null;

  constructor({ file, send }) {
    this.#file = file;
    this.#send = send;
  }

  // Loads the saved grant and publishes it before the first fetch, so a connected launch never
  // flashes the Connect button while the first reading is in flight.
  start() {
    this.#token = this.#load();
    this.publish();
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), TICK_MS);
    this.#timer.unref?.();
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }

  get state() {
    return {
      connected: Boolean(this.#token),
      needsReauth: this.#needsReauth,
      fiveHour: this.#snapshot?.fiveHour || null,
      sevenDay: this.#snapshot?.sevenDay || null,
      sevenDayOpus: this.#snapshot?.sevenDayOpus || null,
      sevenDaySonnet: this.#snapshot?.sevenDaySonnet || null,
    };
  }

  publish() {
    this.#send(this.state);
  }

  async refresh(force = false) {
    const now = Date.now();
    if (this.#reading || !this.#token) return;
    if (!force && (now < this.#coolUntil || now - this.#lastReadAt < FLOOR_MS)) return;
    this.#reading = true;
    this.#lastReadAt = now;
    try {
      this.#apply(await readUsage(this.#token));
    } catch (error) {
      console.error('[usage]', error.message);
    } finally {
      this.#reading = false;
    }
    this.publish();
  }

  // Opens the consent page in the real browser, where you are already signed in. The code comes
  // back by paste: this client's redirect is the console's own callback page, not a loopback.
  connect() {
    const { verifier, challenge } = pkce();
    this.#verifier = verifier;
    shell.openExternal(authorizeUrl(challenge, verifier))
      .catch((error) => console.error('[usage]', error.message));
    return { connecting: true };
  }

  async submit(pasted) {
    if (!this.#verifier) return { ok: false, error: 'Connect first, then paste the code.' };
    const { code, state } = splitCode(pasted);
    if (!code) return { ok: false, error: 'That does not look like a code.' };
    try {
      this.#token = await exchange(code, state || this.#verifier, this.#verifier);
      this.#save();
      this.#verifier = null;
      this.#needsReauth = false;
      this.#snapshot = null;
      this.#coolUntil = 0;
      await this.refresh(true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof OAuthError ? error.message : 'Sign-in failed.' };
    }
  }

  disconnect() {
    this.#forget();
    this.#token = null;
    this.#snapshot = null;
    this.#verifier = null;
    this.#needsReauth = false;
    this.#coolUntil = 0;
    this.publish();
    return { ok: true };
  }

  #apply(result) {
    if (result.rotated) { this.#token = result.rotated; this.#save(); }
    switch (result.kind) {
      case 'usage':
        this.#snapshot = result.usage;
        this.#coolUntil = 0;
        this.#needsReauth = false;
        break;
      case 'rateLimited':
        this.#coolUntil = Date.now() + (result.retryAfter ? result.retryAfter * 1000 : BACKOFF_MS);
        break;
      case 'authRevoked':
        this.#forget();
        this.#token = null;
        this.#snapshot = null;
        this.#needsReauth = true;
        break;
      default:
        break; // transient: the last reading stands rather than the bars emptying
    }
  }

  // Our own grant, encrypted with the OS-derived key rather than left in plaintext next to the
  // project list. A machine with no keychain still runs, with the file readable only by you.
  #load() {
    try {
      const raw = fs.readFileSync(this.#file);
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
      const token = JSON.parse(json);
      return token?.access && token?.expiresAt ? token : null;
    } catch {
      return null;
    }
  }

  #save() {
    try {
      const json = JSON.stringify(this.#token);
      fs.mkdirSync(path.dirname(this.#file), { recursive: true });
      fs.writeFileSync(this.#file,
        safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8'),
        { mode: 0o600 });
    } catch (error) {
      console.error('[usage]', error.message);
    }
  }

  #forget() {
    try { fs.unlinkSync(this.#file); } catch { /* already gone */ }
  }
}
