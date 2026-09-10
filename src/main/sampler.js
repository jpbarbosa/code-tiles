import { BrowserWindow } from 'electron';

// The grid a colour is averaged over. Enough for a hue, and cheap for a hundred projects.
const GRID = 16;
// Below this alpha the pixel is whatever is behind the icon, not the icon.
const SHOWING = 128;
// ...and below this spread it is a grey - the white of a letterform, the black of an outline, the
// plate a logo sits on - which would drag the average toward no hue at all.
const COLOURFUL = 24;
// What a mark too big for the command line is re-encoded to: more than the 24px badge's 48 at 2x.
const MARK = 64;

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
    let mark = null;
    if (shrink) {
      const small = document.createElement('canvas');
      small.width = small.height = ${MARK};
      small.getContext('2d').drawImage(img, 0, 0, ${MARK}, ${MARK});
      mark = small.toDataURL('image/png');
    }
    // A black-and-white icon has no hue to take, and says so rather than averaging to a grey.
    done({ mark, rgb: taken ? [red / taken, green / taken, blue / taken] : null });
  };
  img.src = url;
});
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
