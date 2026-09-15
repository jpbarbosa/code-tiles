// Just enough of the DevTools protocol, over Node's own WebSocket, to click, type and read a page
// of the demo instance. Every page of it is a target on 127.0.0.1:9334.
const PORT = 9334;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

export async function waitFor(predicate, { timeout = 60000, every = 250 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await predicate().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error('timed out waiting');
    await sleep(every);
  }
}

// Modifier bits as CDP counts them.
export const ALT = 1;
export const CTRL = 2;
export const META = 4;
export const SHIFT = 8;

const KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  '`': { code: 'Backquote', keyCode: 192 },
};

export class Page {
  #socket;
  #next = 0;
  #pending = new Map();
  target;

  static async open(match, options) {
    const target = await waitFor(async () => (await targets()).find((candidate) => candidate.type === 'page' && match(candidate)), options);
    const page = new Page();
    page.target = target;
    await new Promise((resolve, reject) => {
      page.#socket = new WebSocket(target.webSocketDebuggerUrl);
      page.#socket.onopen = resolve;
      page.#socket.onerror = () => reject(new Error(`cannot connect to ${target.url}`));
      page.#socket.onmessage = (event) => page.#receive(JSON.parse(event.data));
    });
    return page;
  }

  #receive(message) {
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(`${message.error.message} ${message.error.data || ''}`));
    else pending.resolve(message.result);
  }

  // Bounded, because an input event to a page that is not painting is never acknowledged: a
  // hidden page, or any page while the screen is locked, would hang the take silently.
  send(method, params = {}, { timeout = 20000 } = {}) {
    const id = ++this.#next;
    this.#socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} got no answer in ${timeout} ms from ${this.target.url.slice(0, 80)}`));
      }, timeout);
      this.#pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  rect(selector) {
    return this.eval(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return width && height ? { x, y, width, height } : null;
    })()`);
  }

  mouse(type, x, y, extra = {}) {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  }

  async click(x, y, { clickCount = 1 } = {}) {
    await this.mouse('mouseMoved', x, y, { button: 'none' });
    await this.mouse('mousePressed', x, y, { clickCount, buttons: 1 });
    await sleep(60);
    await this.mouse('mouseReleased', x, y, { clickCount });
  }

  async key(key, modifiers = 0) {
    const known = KEYS[key] || { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };
    const base = { key, code: known.code, windowsVirtualKeyCode: known.keyCode, modifiers };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(known.text && !modifiers ? { text: known.text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // Human-paced, so a terminal or a search field fills in the way it would under a hand.
  async type(text, { perKey = 55 } = {}) {
    for (const character of text) {
      await this.send('Input.insertText', { text: character });
      await sleep(perKey);
    }
  }

  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }

  close() {
    this.#socket.close();
  }
}
