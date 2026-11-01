'use strict';

const STYLE_ID = 'code-tiles-chat-text';
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// Strings the extension's minifier keeps. test/extension.test.js holds them to the bundle this
// machine has. [claude-code 2.1.316]
const PREVIEW = '[class*="previewOverlay_"]';
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

// The overlay closes on a click that lands on it, and a drag begun on the image and released past
// its edge is a click on their common ancestor, which is the overlay. A click that only dismisses
// has no selection left: its press collapsed it.
function keepOpen(event) {
  if (event.target !== event.currentTarget || event.view.getSelection().isCollapsed) return;
  event.stopPropagation();
}

async function read(api, doc, preview) {
  const image = preview.querySelector(PREVIEW_IMAGE);
  if (!image) return;
  await image.decode();
  const lines = await api.ask('image:text', { image: await bytesOf(doc, image) });
  if (!lines.length || !image.isConnected) return;
  // Before the plates that follow the image, so the ones sitting over its corner stay on top.
  image.after(layerFor(doc, image, lines));
  preview.addEventListener('click', keepOpen, true);
}

// The preview is a portal straight onto the page's body. Kept against the BODY, which a rewrite of
// the document replaces, so a rewritten page is watched afresh rather than through a detached one.
function watch(api, doc) {
  const body = doc.body;
  if (!body || watched.has(body)) return;
  watched.add(body);
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
