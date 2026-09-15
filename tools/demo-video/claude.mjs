// Driving Claude Code's chat inside a tile. Its page is a webview two frames down, same-origin, so
// these walk the frames to it and answer in the tile's own coordinates. Text goes in through
// execCommand, which fires the input events real typing does; a CDP key never reaches the composer.
import fs from 'node:fs';
import path from 'node:path';

import { sleep } from './cdp.mjs';

export const COMPOSER = `doc.querySelector('[aria-label="Message input"]')`;
export const SEND = `[...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Send message')`;
// The most specific clickable thing whose text contains `text`: an option's label and its
// description share one element, and "Submit answers" wears a count in front of it.
export const button = (text) => `[...doc.querySelectorAll('button, [role="button"], [role="option"], [role="radio"], label')]
  .filter((b) => (b.innerText || '').includes(${JSON.stringify(text)}))
  .sort((a, b) => a.innerText.length - b.innerText.length)[0]`;
export const selector = (css) => `doc.querySelector(${JSON.stringify(css)})`;

// `body` is the source of a function taking the Claude document and its offset within the tile.
export function inClaude(tile, body) {
  return tile.eval(`(() => {
    const walk = (doc, x, y) => {
      if (doc.querySelector('link[href*="anthropic.claude-code-"]')) return { doc, x, y };
      for (const frame of doc.querySelectorAll('iframe')) {
        try {
          const box = frame.getBoundingClientRect();
          const found = frame.contentDocument
            && walk(frame.contentDocument, x + box.x + frame.clientLeft, y + box.y + frame.clientTop);
          if (found) return found;
        } catch {}
      }
      return null;
    };
    const found = walk(document, 0, 0);
    return found ? (${body})(found.doc, found.x, found.y) : null;
  })()`);
}

// An element's box in tile coordinates, or null. `expression` is JS in terms of `doc`.
export const rectIn = (tile, expression) => inClaude(tile, `(doc, x, y) => {
  const element = ${expression};
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (!box.width && !box.height) return null;
  return { x: x + box.x + box.width / 2, y: y + box.y + box.height / 2, left: x + box.x, top: y + box.y, width: box.width, height: box.height };
}`);

export const clickIn = (tile, expression) => inClaude(tile, `(doc) => {
  const element = ${expression};
  if (!element) return false;
  element.click();
  return true;
}`);

export const ready = (tile) => inClaude(tile, `(doc) => Boolean(${COMPOSER})`);

export async function typeInto(tile, text, { perKey = 40 } = {}) {
  await inClaude(tile, `(doc) => { ${COMPOSER}.focus(); return true; }`);
  for (const character of text) {
    await inClaude(tile, `(doc) => doc.execCommand('insertText', false, ${JSON.stringify(character)})`);
    await sleep(perKey);
  }
}

// A screenshot pasted into the composer, down the path a real paste takes.
export function pasteImage(tile, file) {
  const base64 = fs.readFileSync(file).toString('base64');
  return inClaude(tile, `(doc) => {
    const realm = doc.defaultView;
    const bytes = realm.Uint8Array.from(realm.atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
    const data = new realm.DataTransfer();
    data.items.add(new realm.File([bytes], ${JSON.stringify(path.basename(file))}, { type: 'image/png' }));
    const input = ${COMPOSER};
    input.focus();
    input.dispatchEvent(new realm.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return true;
  }`);
}

// What Claude is doing in each project, read the way the app reads it: the hook markers, by the
// folder each session started in.
export function states(activity, code) {
  const found = {};
  for (const file of fs.readdirSync(activity).filter((name) => name.endsWith('.json'))) {
    try {
      const marker = JSON.parse(fs.readFileSync(activity + file, 'utf8'));
      const name = marker.cwd.startsWith(code) ? marker.cwd.slice(code.length).split('/')[0] : null;
      if (name) (found[name] ||= new Set()).add(marker.state);
    } catch { /* mid-write */ }
  }
  return found;
}
