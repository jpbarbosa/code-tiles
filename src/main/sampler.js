import { BrowserWindow } from 'electron';

// The grid a colour is averaged over. Enough for a hue, and cheap for a hundred projects.
const GRID = 16;
// Below this alpha the pixel is whatever is behind the icon, not the icon.
const SHOWING = 128;
// ...and below this spread it is a grey - the white of a letterform, the black of an outline, the
// plate a logo sits on - which would drag the average toward no hue at all.
const COLOURFUL = 24;
// What a mark is re-encoded to, when the file is too big for the command line or has a margin to
// cut: more than the 24px badge's 48 at 2x.
const MARK = 64;
// The square the ink is found in: twice the mark, so its edge is placed to half a pixel.
const MEASURE = 128;
// Below this alpha a pixel is an edge's anti-aliasing, not where the ink ends.
const INK = 26;
// A margin the badge would draw narrower than one of its 24 pixels, both sides together, is not
// worth a resample of the file.
const SLACK = 1 / 24;

const PAGE = `<!doctype html><meta charset="utf-8"><script>
window.read = (url, shrink) => new Promise((done) => {
  const img = new Image();
  img.onerror = () => done(null);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${GRID};
    const paper = canvas.getContext('2d', { willReadFrequently: true });
    paper.drawImage(img, 0, 0, ${GRID}, ${GRID});
    const pixels = paper.getImageData(0, 0, ${GRID}, ${GRID}).data;
    let red = 0, green = 0, blue = 0, taken = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      if (alpha < ${SHOWING}) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) < ${COLOURFUL}) continue;
      red += r; green += g; blue += b; taken += 1;
    }
    // Contained rather than stretched: a favicon is square, an image you chose need not be.
    const [wide, tall] = [img.naturalWidth || 1, img.naturalHeight || 1];
    const fit = ${MEASURE} / Math.max(wide, tall);
    const placed = [(${MEASURE} - wide * fit) / 2, (${MEASURE} - tall * fit) / 2, wide * fit, tall * fit];
    const square = inkSquare(img, placed);
    let mark = null;
    if (shrink || square) {
      const { x, y, side } = square || { x: 0, y: 0, side: ${MEASURE} };
      const zoom = ${MARK} / side;
      const small = document.createElement('canvas');
      small.width = small.height = ${MARK};
      small.getContext('2d').drawImage(img, (placed[0] - x) * zoom, (placed[1] - y) * zoom,
        placed[2] * zoom, placed[3] * zoom);
      mark = small.toDataURL('image/png');
    }
    // A black-and-white icon has no hue to take, and says so rather than averaging to a grey.
    done({ mark, rgb: taken ? [red / taken, green / taken, blue / taken] : null });
  };
  img.src = url;
});

// A margin inside the file is drawn by every consumer as a smaller mark: lumen's 48px .ico keeps
// 2px clear a side, a plate 2px short of its neighbours on the 24px badge. So the mark is cut to
// the square its ink fills, centred on the ink - or null, where that would gain nothing.
function inkSquare(img, placed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ${MEASURE};
  const paper = canvas.getContext('2d', { willReadFrequently: true });
  paper.drawImage(img, ...placed);
  const pixels = paper.getImageData(0, 0, ${MEASURE}, ${MEASURE}).data;
  let [left, top, right, bottom] = [${MEASURE}, ${MEASURE}, -1, -1];
  for (let y = 0; y < ${MEASURE}; y += 1) {
    for (let x = 0; x < ${MEASURE}; x += 1) {
      if (pixels[(y * ${MEASURE} + x) * 4 + 3] < ${INK}) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  const side = Math.max(right - left, bottom - top) + 1;
  // Nothing drawn at all, or ink that already reaches as far as the canvas does.
  if (right < 0 || side > ${MEASURE * (1 - SLACK)}) return null;
  return { x: (left + right + 1 - side) / 2, y: (top + bottom + 1 - side) / 2, side };
}
</script>`;

// The one place in main that decodes a picture rather than reading one, and a renderer because
// Chromium is the only decoder in the process that reads a true ICO or an SVG. Offscreen, so it
// reaches no screen and no Dock, and under the app's own dark theme, which is the rendering that
// matters to an SVG carrying a prefers-color-scheme block. One window for the whole pass: one
// held open for the life of the app, to answer a question asked once per folder, does nothing.
export async function sample(sources) {
  const window = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await window.loadURL(`data:text/html;base64,${Buffer.from(PAGE).toString('base64')}`);
    const answers = [];
    for (const { url, shrink } of sources) {
      // The bytes came off someone's disk: one malformed favicon costs its own colour, not the
      // whole list's.
      try {
        answers.push(await window.webContents.executeJavaScript(
          `window.read(${JSON.stringify(url)}, ${Boolean(shrink)})`,
        ));
      } catch { answers.push(null); }
    }
    return answers;
  } finally {
    window.destroy();
  }
}
