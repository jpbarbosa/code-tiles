'use strict';

const STYLE_ID = 'code-tiles-chat-text';
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// Strings the extension's minifier keeps. test/extension.test.js holds them to the bundle this
// machine has. [claude-code 2.1.316]
const PREVIEW = '[class*="previewOverlay_"]';
const PREVIEW_BOX = '[class*="previewContainer_"]';
const PREVIEW_IMAGE = 'img[class*="previewImage_"]';

// Not system-ui, whose width is not proportional to its size in Chromium on macOS: 411 at 18px
// doubled against 447 at 36px, so a stretch worked out at one size misses at another. Nor
// -apple-system, which Chromium no longer knows: it falls back to Times.
const FAMILY = '"Helvetica Neue", sans-serif';
const REFERENCE_PX = 100;

const watched = new WeakSet();

async function bytesOf(doc, image) {
  const canvas = Object.assign(doc.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
  canvas.getContext('2d').drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// Each line is real text at the height Vision found, stretched to the width it found, so a selection
// covers what is on the image in any font. Everything is a share of the image, so the layer follows
// the preview at any size without being told. The newline is for the copy: an absolute block gets
// none of its own, and lines would run together.
function layerFor(doc, image, lines) {
  const context = doc.createElement('canvas').getContext('2d');
  context.font = `${REFERENCE_PX}px ${FAMILY}`;
  const layer = doc.createElement('div');
  layer.className = 'ct-text';
  for (const { text, x, y, width, height } of lines) {
    const row = doc.createElement('div');
    row.textContent = `${text}\n`;
    const natural = context.measureText(text).width * (height * image.naturalHeight) / REFERENCE_PX;
    Object.assign(row.style, {
      left: `${x * 100}%`, top: `${y * 100}%`, transform: `scaleX(${width * image.naturalWidth / natural})`,
    });
    row.style.setProperty('--ct-text-height', String(height));
    layer.append(row);
  }
  return layer;
}

async function read(api, doc, preview) {
  const image = preview.querySelector(PREVIEW_IMAGE);
  if (!image) return;
  await image.decode();
  const lines = await api.ask('image:text', { image: await bytesOf(doc, image) });
  if (!lines.length || !image.isConnected) return;
  // Before the plates that follow the image, so the ones sitting over its corner stay on top.
  image.after(layerFor(doc, image, lines));
}

const previewImage = (doc) => doc.querySelector(`${PREVIEW} ${PREVIEW_IMAGE}`);

function hasSelection(doc) {
  const field = doc.activeElement;
  if (field && 'selectionStart' in field && field.selectionStart !== field.selectionEnd) return true;
  return !doc.getSelection().isCollapsed;
}

// Chromium fires no copy event over an empty selection, so the webview's Copy item and ⌘C did
// nothing over a preview. With nothing selected they get the picture itself to copy. Focus goes to
// the preview's own dialog box, because the Copy item refocuses the last focused element when the
// body has focus, and refocusing the message box would take the selection with it.
function selectPicture(event) {
  const doc = event.target.ownerDocument;
  const image = previewImage(doc);
  if (!image || hasSelection(doc)) return;
  if (event.type === 'keydown' && !(event.metaKey && event.key === 'c')) return;
  if (event.type === 'contextmenu' && !image.closest(PREVIEW).contains(event.target)) return;
  image.closest(PREVIEW_BOX)?.focus({ preventScroll: true });
  const range = doc.createRange();
  range.selectNode(image);
  doc.getSelection().removeAllRanges();
  doc.getSelection().addRange(range);
}

// A copy event carries only strings, so main puts the picture on the clipboard. Text selected on
// the image's layer or in a field never contains the image, so it still copies as text.
function copyPicture(api) {
  return (event) => {
    const doc = event.target.ownerDocument;
    const image = previewImage(doc);
    const selection = doc.getSelection();
    // Not containsNode: under the page's user-select: none it denies an image selected whole.
    if (!image || !selection.rangeCount || !selection.getRangeAt(0).intersectsNode(image)) return;
    event.preventDefault();
    bytesOf(doc, image)
      .then((bytes) => api.ask('image:copy', { image: bytes }))
      .catch((error) => console.error('[code-tiles] chat-text:', error));
  };
}

// The preview is a portal straight onto the page's body. Kept against the BODY, which a rewrite of
// the document replaces, so a rewritten page is watched afresh rather than through a detached one.
function watch(api, doc) {
  const body = doc.body;
  if (!body || watched.has(body)) return;
  watched.add(body);
  body.addEventListener('contextmenu', selectPicture, true);
  body.addEventListener('keydown', selectPicture, true);
  body.addEventListener('copy', copyPicture(api));
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || !node.matches(PREVIEW)) continue;
        read(api, doc, node).catch((error) => console.error('[code-tiles] chat-text:', error));
      }
    }
  }).observe(body, { childList: true });
}

// An inline image leaves a descender's gap under it in its container, which would stretch the layer
// past the picture. Container units against the image, so the type scales with it.
const CSS = `
${PREVIEW_IMAGE} {
  display: block;
}

.ct-text {
  position: absolute;
  inset: 0;
  overflow: hidden;
  container-type: size;
  user-select: text;

  & div {
    position: absolute;
    width: max-content;
    color: transparent;
    font-family: ${FAMILY};
    font-size: calc(var(--ct-text-height) * 100cqh);
    line-height: 1;
    white-space: pre;
    cursor: text;
    transform-origin: 0 0;

    &::selection {
      background: color-mix(in srgb, Highlight 50%, transparent);
    }
  }
}
`;

function style(doc) {
  let sheet = doc.getElementById(STYLE_ID);
  if (!sheet) sheet = Object.assign(doc.createElement('style'), { id: STYLE_ID, textContent: CSS });
  if (sheet.parentElement !== doc.documentElement) doc.documentElement.append(sheet);
}

// Text in an image selectable in its preview, the way macOS Preview does it, read by Vision through
// main and only when a preview opens. The image shows at once and the text arrives when it is ready,
// so an image with no text, or a Mac with no helper, is the preview as the page drew it.
module.exports = {
  name: 'chat-text',
  init(api) {
    api.eachDocument((doc) => {
      if (!doc.documentElement || !doc.querySelector(CLAUDE_PAGE)) return;
      style(doc);
      watch(api, doc);
    });
  },
};
