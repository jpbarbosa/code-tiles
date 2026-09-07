import { BrowserWindow } from 'electron';

import { files } from './paths.js';

// The two Claude signals this app runs on, side by side. `hook` is what main concluded from
// Claude Code's own hooks, which is what the badge ring draws. `icon` is what a window reports
// its chat tab is wearing, which the chat-icon seam writes from inside the extension host.
// Neither can see the other, and a standing disagreement between them is the whole point: a
// spinner that never started leaves no other trace.
const KEPT = 500;
const WIDTH = 620;
const HEIGHT = 460;

export class ClaudeEvents {
  #entries = [];
  #now = new Map();
  #parent;
  #window = null;

  constructor({ parent }) {
    this.#parent = parent;
  }

  get state() {
    return { entries: this.#entries, now: Object.fromEntries(this.#now) };
  }

  // A repeat says nothing. Both sources re-report whenever anything else changes, so without
  // this the log would fill while Claude sat still.
  note(source, folder, value) {
    if (!folder || typeof value !== 'string') return;
    const current = this.#now.get(folder) || {};
    if (current[source] === value) return;
    this.#now.set(folder, { ...current, [source]: value });

    const entry = { at: Date.now(), source, folder, value };
    this.#entries.push(entry);
    if (this.#entries.length > KEPT) this.#entries.splice(0, this.#entries.length - KEPT);
    this.#send({ type: 'claude:event', payload: { entry, now: Object.fromEntries(this.#now) } });
  }

  // What a window says its Claude tabs are wearing, as one line so the repeat check above sees a
  // second tab appearing. No tab at all is worth a row: it is why nothing is spinning.
  icons(folder, icons) {
    if (!Array.isArray(icons)) return;
    this.note('icon', folder, icons.filter(Boolean).join(', ') || 'no chat tab');
  }

  clear() {
    this.#entries = [];
    this.#send({ type: 'claude:cleared', payload: {} });
  }

  // A window rather than a panel in the shell page, for the reason preferences and usage are
  // windows: a WebContentsView paints above that page. Resizable, unlike those two - a log is
  // read at whatever length the thing you are chasing turned out to be.
  open() {
    if (this.#window) return this.#window.focus();

    this.#window = new BrowserWindow({
      parent: this.#parent,
      useContentSize: true,
      width: WIDTH,
      height: HEIGHT,
      show: false,
      title: 'Claude Events',
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#232325',
      webPreferences: { preload: files.shellPreload, contextIsolation: true, sandbox: true },
    });

    this.#window.loadFile(files.eventsPage);
    this.#window.once('ready-to-show', () => this.#window?.show());
    this.#window.on('closed', () => { this.#window = null; });
  }

  #send(message) {
    if (!this.#window || this.#window.isDestroyed()) return;
    this.#window.webContents.send('ct:event', message);
  }
}
