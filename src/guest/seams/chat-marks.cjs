'use strict';

const STYLE_ID = 'code-tiles-chat-marks';
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// Strings the extension's minifier keeps: labels, titles, and CSS module class prefixes, whose hash
// changes every build. test/extension.test.js holds them to the bundle this machine has.
// [claude-code 2.1.271]
const INPUT = '[aria-label="Message input"]';
const PREVIEW = '[class*="previewOverlay_"]';
const PREVIEW_BOX = '[class*="previewContainer_"]';
const PREVIEW_IMAGE = 'img[class*="previewImage_"]';
const PREVIEW_CLOSE = 'button[title="Close preview (Esc)"]';
const ATTACHMENTS = '[class*="attachedFilesContainer_"]';
const REMOVE = 'button[title="Remove attachment"]';

// Highlighter hues at full saturation, so a mark reads as a mark on any screenshot. Magenta first
// and the default, because the screens this marks up already carry red: diff deletions, error
// squiggles. The rest are for a screenshot with magenta in it, or for marks told apart by name -
// "the green box" - so each is a hue a model names one way, and none sits beside another.
const COLOURS = {
  Magenta: '#ff00ff',
  Red: '#ff0000',
  Orange: '#ff8000',
  Yellow: '#ffff00',
  Green: '#00ff00',
  Cyan: '#00ffff',
};

// A big screenshot is scaled down before the model sees it, so the line is a share of the image that
// is sent - the crop, once there is one - rather than of the screen: a fixed 2px on a full Retina
// capture ends up under a pixel.
const strokeFor = (view) => Math.max(4, Math.round(Math.max(view.width, view.height) / 250));

const markedName = (name) => `${name.replace(/(-marked)?\.[^.]+$/, '')}-marked.png`;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

const rectOf = ({ x0, y0, x1, y1 }) => ({
  x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0),
});

function cropOf({ x0, y0, x1, y1 }) {
  const x = Math.round(Math.min(x0, x1));
  const y = Math.round(Math.min(y0, y1));
  return { shape: 'crop', x, y, width: Math.round(Math.max(x0, x1)) - x, height: Math.round(Math.max(y0, y1)) - y };
}

// Heroicons' outline set, which the panel's own × is drawn from, at the same weight. The set has no
// crop, so that one is drawn to its grid.
const ICONS = {
  pencil: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125',
  crop: 'M6 3v12.75A2.25 2.25 0 0 0 8.25 18H21M18 21V8.25A2.25 2.25 0 0 0 15.75 6H3',
  arrow: 'm4.5 19.5 15-15m0 0H8.25m11.25 0v11.25',
  box: 'M3.75 5.25h16.5v13.5H3.75z',
  circle: 'M20.25 12a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z',
  undo: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
};

const TITLES = { crop: 'Crop', arrow: 'Arrow', box: 'Box', circle: 'Circle' };

const SHAPES = {
  // The tip is the release point and the head is drawn back from it, so the head covers nothing
  // the arrow points at.
  arrow(context, { x0, y0, x1, y1 }, stroke) {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = Math.min(stroke * 4, Math.hypot(x1 - x0, y1 - y0));
    const spread = Math.PI / 7;
    const base = head * Math.cos(spread);
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1 - Math.cos(angle) * base, y1 - Math.sin(angle) * base);
    context.stroke();
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x1 - head * Math.cos(angle - spread), y1 - head * Math.sin(angle - spread));
    context.lineTo(x1 - head * Math.cos(angle + spread), y1 - head * Math.sin(angle + spread));
    context.closePath();
    context.fill();
  },
  box(context, mark) {
    const { x, y, width, height } = rectOf(mark);
    context.strokeRect(x, y, width, height);
  },
  circle(context, mark) {
    const { x, y, width, height } = rectOf(mark);
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    context.stroke();
  },
};

function veil(context, view, rect, stroke) {
  context.fillStyle = 'rgb(0 0 0 / .55)';
  context.beginPath();
  context.rect(view.x, view.y, view.width, view.height);
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.fill('evenodd');
  context.lineWidth = stroke / 2;
  context.setLineDash([stroke * 2, stroke * 1.5]);
  context.strokeStyle = '#ffffff';
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.setLineDash([]);
}

// The Edit button sits beside the preview's own ×, 8px from it, in the same plate. A squircle at 50%
// is a rounded square, so each circle here says so over the corners seam's rule for everything.
// The colours are ONE button, wearing the current one: six swatches would take the bar past the
// width of a Claude panel in a tiled grid, and the bar still wraps between its groups below that.
const CSS = `
.ct-marks-edit {
  position: absolute;
  top: -12px;
  right: 24px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--app-input-border);
  border-radius: 50%;
  corner-shape: round;
  background: var(--app-menu-background);
  color: var(--app-menu-foreground);
  cursor: pointer;
  transition: background-color .15s;

  /* The page's hover colour is translucent and this plate sits over the image, so the tint is laid
     over the menu colour rather than in place of it. */
  &:hover {
    background: linear-gradient(var(--app-list-hover-background), var(--app-list-hover-background)), var(--app-menu-background);
  }

  & svg {
    width: 18px;
    height: 18px;
  }
}

.ct-marks {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #000000d9;
  outline: none;

  & :is(.ct-marks-bar, .ct-marks-palette) {
    padding: 4px;
    border: 1px solid var(--app-menu-border);
    border-radius: var(--corner-radius-large);
    background: var(--app-menu-background);
    color: var(--app-menu-foreground);
  }

  & .ct-marks-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-self: center;
    gap: 4px 12px;
  }

  & .ct-marks-group {
    display: flex;
    gap: 2px;
  }

  & .ct-marks-colour {
    anchor-name: --ct-marks-colour;
  }

  /* A popover, for its light dismiss and the top layer, placed under the button that opens it. The
     UA sheet hides it by display, so the flex is said only while it is open. */
  & .ct-marks-palette {
    position-anchor: --ct-marks-colour;
    position-area: bottom;
    position-try-fallbacks: bottom span-left, bottom span-right;
    inset: auto;
    margin: 6px 0 0;
    gap: 2px;
    box-shadow: 0 4px 16px #00000066;

    &:popover-open {
      display: flex;
    }
  }

  & button {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--corner-radius-medium);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--app-list-hover-background);
    }

    &[aria-pressed="true"] {
      background: var(--app-list-active-background);
      color: var(--app-list-active-foreground);
    }

    &:disabled {
      opacity: .4;
      cursor: default;
    }

    & svg {
      width: 18px;
      height: 18px;
    }
  }

  & .ct-marks-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    corner-shape: round;
    box-shadow: inset 0 0 0 1px rgb(128 128 128 / .5);
  }

  & .ct-marks-text {
    padding: 0 10px;
  }

  & .ct-marks-done {
    background: var(--app-button-background);
    color: var(--app-button-foreground);

    &:hover:not(:disabled) {
      background: var(--app-button-hover-background);
    }
  }

  /* The canvas fills the stage at the view's own ratio, up as well as down, so a crop zooms in:
     container units against the stage, with the ratio handed down on the canvas. */
  & .ct-marks-stage {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }

  & canvas {
    width: min(100cqw, 100cqh * var(--ct-marks-ratio));
    border-radius: var(--corner-radius-large);
    box-shadow: 0 4px 24px #00000080;
    cursor: crosshair;
    touch-action: none;
  }
}
`;

const watched = new WeakSet();

function element(doc, tag, properties = {}, children = []) {
  const node = doc.createElement(tag);
  Object.assign(node, properties);
  node.append(...children);
  return node;
}

function icon(doc, path) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(namespace, 'svg');
  const attributes = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  const shape = doc.createElementNS(namespace, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

// The same preview opens for an image already sent, which has nothing to replace, so the edit is
// offered only for a pill still in the composer with its remove button.
function pillFor(doc, source) {
  for (const image of doc.querySelectorAll(`${ATTACHMENTS} img`)) {
    if (image.src !== source) continue;
    const pill = image.closest(`${ATTACHMENTS} > *`);
    if (pill?.querySelector(REMOVE)) return pill;
  }
  return null;
}

async function edit(doc, source, name, preview) {
  const image = element(doc, 'img', { src: source });
  await image.decode();
  const whole = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  // Marks and crops are one list, so Undo takes back whichever came last. The latest crop is the
  // view, and marks keep the image's coordinates, so what a crop cuts is hidden rather than lost.
  const steps = [];
  const view = () => steps.findLast((step) => step.shape === 'crop') ?? whole;
  let active = 'arrow';
  let shape = 'arrow';
  let colour = COLOURS.Magenta;
  let draft = null;

  const canvas = element(doc, 'canvas');
  const context = canvas.getContext('2d');
  const button = (key) => {
    const tool = element(doc, 'button', { type: 'button', title: TITLES[key] }, [icon(doc, ICONS[key])]);
    tool.dataset.tool = key;
    return tool;
  };
  const crop = button('crop');
  const shapes = Object.keys(SHAPES).map((key) => button(key));
  const tools = [crop, ...shapes];
  const swatches = Object.entries(COLOURS).map(([title, value]) => {
    const dot = element(doc, 'span', { className: 'ct-marks-dot' });
    dot.style.background = value;
    const swatch = element(doc, 'button', { type: 'button', title }, [dot]);
    swatch.dataset.colour = value;
    return swatch;
  });
  const palette = element(doc, 'div', { className: 'ct-marks-palette', popover: 'auto' }, swatches);
  const chosen = element(doc, 'span', { className: 'ct-marks-dot' });
  const picker = element(doc, 'button', {
    type: 'button', className: 'ct-marks-colour', title: 'Color', popoverTargetElement: palette,
  }, [chosen]);
  const undo = element(doc, 'button', { type: 'button', title: 'Undo (⌘Z)' }, [icon(doc, ICONS.undo)]);
  const cancel = element(doc, 'button', { type: 'button', className: 'ct-marks-text', textContent: 'Cancel' });
  const done = element(doc, 'button', { type: 'button', className: 'ct-marks-text ct-marks-done', textContent: 'Done' });
  const group = (...children) => element(doc, 'div', { className: 'ct-marks-group' }, children);
  const bar = element(doc, 'div', { className: 'ct-marks-bar' }, [
    group(crop), group(...shapes, picker, palette), group(undo), group(cancel, done),
  ]);
  const stage = element(doc, 'div', { className: 'ct-marks-stage' }, [canvas]);
  const editor = element(doc, 'div', { className: 'ct-marks', tabIndex: -1 }, [bar, stage]);
  editor.setAttribute('role', 'dialog');
  editor.setAttribute('aria-label', `Mark up ${name}`);

  function paint() {
    const current = view();
    if (canvas.width !== current.width || canvas.height !== current.height) {
      Object.assign(canvas, { width: current.width, height: current.height });
      canvas.style.setProperty('--ct-marks-ratio', String(current.width / current.height));
    }
    const stroke = strokeFor(current);
    context.setTransform(1, 0, 0, 1, -current.x, -current.y);
    context.clearRect(current.x, current.y, current.width, current.height);
    context.drawImage(image, 0, 0);
    Object.assign(context, { lineWidth: stroke, lineCap: 'round', lineJoin: 'round' });
    for (const step of [...steps, draft]) {
      if (!step || step.shape === 'crop') continue;
      context.strokeStyle = context.fillStyle = step.colour;
      SHAPES[step.shape](context, step, stroke);
    }
    if (draft?.shape === 'crop') veil(context, current, rectOf(draft), stroke);
    for (const tool of tools) tool.setAttribute('aria-pressed', String(tool.dataset.tool === active));
    for (const swatch of swatches) swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === colour));
    chosen.style.background = colour;
    undo.disabled = done.disabled = steps.length === 0;
  }

  function at(event) {
    const current = view();
    const bounds = canvas.getBoundingClientRect();
    const x = current.x + (event.clientX - bounds.left) * current.width / bounds.width;
    const y = current.y + (event.clientY - bounds.top) * current.height / bounds.height;
    if (active !== 'crop') return { x, y };
    return { x: clamp(x, current.x, current.x + current.width), y: clamp(y, current.y, current.y + current.height) };
  }

  function close() {
    editor.remove();
    doc.querySelector(INPUT)?.focus();
  }

  async function commit() {
    const input = doc.querySelector(INPUT);
    if (!input || done.disabled) return;
    done.disabled = true;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const realm = doc.defaultView;
    const data = new realm.DataTransfer();
    data.items.add(new realm.File([blob], markedName(name), { type: 'image/png' }));
    pillFor(doc, source)?.querySelector(REMOVE).click();
    // The composer's own paste handler is the only way into its state from outside the page, and it
    // takes the file down the path a real paste takes - so the edit lands at the end of the row.
    input.dispatchEvent(new realm.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    close();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = at(event);
    draft = { shape: active, colour, x0: x, y0: y, x1: x, y1: y };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!draft) return;
    ({ x: draft.x1, y: draft.y1 } = at(event));
    paint();
  });
  canvas.addEventListener('pointerup', () => {
    if (!draft) return;
    const { width, height } = rectOf(draft);
    const least = strokeFor(view()) * 2;
    if (draft.shape !== 'crop' && Math.hypot(width, height) >= least) steps.push(draft);
    // A crop hands back the shape in hand: the next drag is nearly always a mark, and a second crop
    // by accident would cut again.
    if (draft.shape === 'crop' && Math.min(width, height) >= least) {
      steps.push(cropOf(draft));
      active = shape;
    }
    draft = null;
    paint();
  });
  canvas.addEventListener('pointercancel', () => {
    draft = null;
    paint();
  });
  for (const tool of tools) {
    tool.addEventListener('click', () => {
      active = tool.dataset.tool;
      if (active !== 'crop') shape = active;
      paint();
    });
  }
  for (const swatch of swatches) {
    swatch.addEventListener('click', () => {
      colour = swatch.dataset.colour;
      // A colour is picked to draw with, so it takes a crop in progress back to the shape in hand.
      if (active === 'crop') active = shape;
      palette.hidePopover();
      paint();
    });
  }
  undo.addEventListener('click', () => {
    steps.pop();
    paint();
  });
  cancel.addEventListener('click', close);
  done.addEventListener('click', commit);

  // Stopped here, a key never reaches the listener the webview's wrapper keeps on the page's window,
  // which forwards it to the workbench: ⌘Z would otherwise also undo in the file behind the panel.
  // Escape closes the colours first when they are open, and the editor only after.
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && palette.matches(':popover-open')) {
      palette.hidePopover();
    } else if (event.key === 'Escape') {
      close();
    } else if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      steps.pop();
      paint();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  doc.body.append(editor);
  paint();
  editor.focus();
  preview.querySelector(PREVIEW_CLOSE)?.click();
}

function offer(doc, preview) {
  const box = preview.querySelector(PREVIEW_BOX);
  const image = box?.querySelector(PREVIEW_IMAGE);
  if (!image || box.querySelector('.ct-marks-edit') || !pillFor(doc, image.src)) return;
  const button = element(doc, 'button', { type: 'button', className: 'ct-marks-edit', title: 'Mark up' }, [icon(doc, ICONS.pencil)]);
  button.addEventListener('click', () => edit(doc, image.src, image.alt, preview));
  box.append(button);
}

// The preview is a portal straight onto the page's body. Kept against the BODY, which a rewrite of
// the document replaces, so a rewritten page is watched afresh rather than through a detached one.
function watch(doc) {
  const body = doc.body;
  if (!body || watched.has(body)) return;
  watched.add(body);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(PREVIEW)) offer(doc, node);
      }
    }
  }).observe(body, { childList: true });
}

function style(doc) {
  let sheet = doc.getElementById(STYLE_ID);
  if (!sheet) sheet = element(doc, 'style', { id: STYLE_ID, textContent: CSS });
  if (sheet.parentElement !== doc.documentElement) doc.documentElement.append(sheet);
}

// Arrow, box and circle drawn on an image attached to the Claude chat, and a crop, from its own
// preview, so a screenshot can point at what the message is about. The Claude page is a webview no
// workbench sheet reaches, so the rules are said inside it, the way chat-calm says its own.
module.exports = {
  name: 'chat-marks',
  init(api) {
    api.eachDocument((doc) => {
      if (!doc.documentElement || !doc.querySelector(CLAUDE_PAGE)) return;
      style(doc);
      watch(doc);
    });
  },
};
