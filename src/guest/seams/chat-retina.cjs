'use strict';

const { HEADER_BYTES, targetOf } = require('../retina.cjs');

const STYLE_ID = 'code-tiles-chat-retina';
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// Strings the extension's minifier keeps. test/extension.test.js holds them to the bundle this
// machine has. [claude-code 2.1.282]
const INPUT = '[aria-label="Message input"]';
const COMPOSER = '[class*="inputContainer_"]';
const ATTACHMENTS = '[class*="attachedFilesContainer_"]';
const REMOVE = 'button[title="Remove attachment"]';

// Each halved image under the data URL of either version, since a pill's thumbnail is all that
// says which image it holds - and a pill is keyed by its place in the row, so a removal before it
// hands the same element another image.
const images = new Map();
const watched = new WeakSet();
let passing = false;

const urlOf = (view, blob) => new Promise((resolve, reject) => {
  const reader = new view.FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function halve(doc, file) {
  const target = targetOf(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()));
  if (!target) return null;
  const view = doc.defaultView;
  const bitmap = await view.createImageBitmap(file, {
    resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high',
  });
  const canvas = Object.assign(doc.createElement('canvas'), { width: target.width, height: target.height });
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(`could not encode ${file.name} at ${target.width}x${target.height}`);
  const half = new view.File([blob], file.name, { type: 'image/png', lastModified: file.lastModified });
  return { full: file, half, halfUrl: await urlOf(view, half), fullUrl: null, from: target.from, pending: true };
}

// The composer's own handlers are the only way into its state from outside the page, so what a
// paste or a drop carried goes back through them, files first, the editor's own drag types beside.
function hand(doc, type, target, files, strings = []) {
  const into = target?.isConnected ? target : doc.querySelector(INPUT);
  if (!into) return false;
  watch(doc);
  const view = doc.defaultView;
  const transfer = new view.DataTransfer();
  for (const file of files) transfer.items.add(file);
  for (const [kind, value] of strings) transfer.setData(kind, value);
  const init = { bubbles: true, cancelable: true, composed: true };
  const event = type === 'drop'
    ? new view.DragEvent('drop', { ...init, dataTransfer: transfer })
    : new view.ClipboardEvent('paste', { ...init, clipboardData: transfer });
  passing = true;
  try { into.dispatchEvent(event); } finally { passing = false; }
  return true;
}

async function settle(doc, type, target, files, strings) {
  const made = [];
  const sent = await Promise.all(files.map(async (file) => {
    if (file.type !== 'image/png') return file;
    try {
      const image = await halve(doc, file);
      if (!image) return file;
      made.push(image);
      return image.half;
    } catch (error) {
      console.error('[code-tiles] chat-retina:', error);
      return file;
    }
  }));
  if (!hand(doc, type, target, sent, strings)) return;
  for (const image of made) images.set(image.halfUrl, image);
}

// Held at the DOCUMENT, where the page keeps its own drag listeners - the one that takes down the
// "Drop to attach" overlay among them. Stopped there, those still run, and React's, which sit on
// its root below, see only the copy handed back.
function intercept(event) {
  if (passing) return;
  const transfer = event.type === 'paste' ? event.clipboardData : event.dataTransfer;
  const files = transfer ? [...transfer.files] : [];
  if (!files.some((file) => file.type === 'image/png')) return;
  const strings = [...transfer.types].filter((kind) => kind !== 'Files').map((kind) => [kind, transfer.getData(kind)]);
  event.preventDefault();
  event.stopPropagation();
  settle(event.target.ownerDocument, event.type, event.target, files, strings);
}

async function swap(doc, pill) {
  const source = pill.querySelector('img')?.getAttribute('src');
  const image = source && images.get(source);
  if (!image || image.pending) return;
  const halved = source === image.halfUrl;
  image.pending = true;
  if (halved && !image.fullUrl) {
    image.fullUrl = await urlOf(doc.defaultView, image.full);
    images.set(image.fullUrl, image);
  }
  if (pill.querySelector('img')?.getAttribute('src') !== source) return void (image.pending = false);
  pill.querySelector(REMOVE).click();
  hand(doc, 'paste', null, [halved ? image.full : image.half]);
}

function label(image, halved) {
  const { width, height } = image.from;
  if (!halved) return ['HD', `HD, the full ${width}×${height}. Click to send it in SD, a quarter of the tokens.`];
  return ['SD', `SD, halved from a ${width}×${height} Retina capture. Click to send it in HD.`];
}

// Derived from the thumbnail every time the row changes, never remembered against the element.
function mark(doc) {
  const shown = new Set();
  for (const pill of doc.querySelectorAll(`${ATTACHMENTS} > *`)) {
    const thumbnail = pill.querySelector(':scope > img');
    const remove = pill.querySelector(`:scope > ${REMOVE}`);
    if (!thumbnail || !remove) continue;
    const source = thumbnail.getAttribute('src');
    const image = source && images.get(source);
    let button = pill.querySelector(':scope > .ct-retina');
    if (!image) {
      button?.remove();
      continue;
    }
    shown.add(image);
    image.pending = false;
    if (!button) {
      button = Object.assign(doc.createElement('button'), { type: 'button', className: 'ct-retina' });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        swap(doc, pill);
      });
      thumbnail.after(button);
    }
    const [text, title] = label(image, source === image.halfUrl);
    if (button.textContent !== text) button.textContent = text;
    if (button.title !== title) button.title = title;
  }
  for (const [url, image] of images) if (!image.pending && !shown.has(image)) images.delete(url);
}

// The row sits above or below the input by a setting, both inside the composer. That element is
// kept rather than the document, since the page remounts it with a session.
function watch(doc) {
  const composer = doc.querySelector(INPUT)?.closest(COMPOSER);
  if (!composer || watched.has(composer)) return;
  watched.add(composer);
  new MutationObserver(() => mark(doc)).observe(composer, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
  });
  mark(doc);
}

// Beside the thumbnail, because the pill's × is laid over its right end on hover, 32px wide and
// fading in: a badge there is covered by it, and a click on the badge removes the image. One width
// for both labels, so a swap moves nothing.
const CSS = `
.ct-retina {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: var(--ct-retina-width);
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--app-secondary-foreground) 16%, transparent);
  color: var(--app-secondary-foreground);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--app-secondary-foreground) 30%, transparent);
    color: var(--app-primary-foreground);
  }
}

/* The page's 180px cap, plus the badge and its gap, so the name is cut where it would be on a pill
   without one. [claude-code 2.1.282] */
${ATTACHMENTS} > :has(> .ct-retina) {
  --ct-retina-width: 22px;
  max-width: calc(180px + 4px + var(--ct-retina-width));
}
`;

function style(doc) {
  let sheet = doc.getElementById(STYLE_ID);
  if (!sheet) sheet = Object.assign(doc.createElement('style'), { id: STYLE_ID, textContent: CSS });
  if (sheet.parentElement !== doc.documentElement) doc.documentElement.append(sheet);
}

// A Retina screenshot pasted or dropped into the Claude chat is sent at 1x, a quarter of the
// tokens, with an SD badge on its pill that swaps the full-size one back in. The document rewrite
// wipes listeners, so both are said again on every sweep; the DOM drops the repeat.
module.exports = {
  name: 'chat-retina',
  init(api) {
    api.eachDocument((doc) => {
      if (!doc.documentElement || !doc.querySelector(CLAUDE_PAGE)) return;
      doc.addEventListener('paste', intercept, true);
      doc.addEventListener('drop', intercept, true);
      style(doc);
      watch(doc);
    });
  },
};
