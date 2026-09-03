// Development only: brings the app up, reads the seams back OUT of a live window, writes a
// screenshot of the shell and of each tile, then quits. Loaded only when CT_PROBE is set, so
// nothing here is part of the app.
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, webContents } from 'electron';

import { files } from '../src/main/paths.js';

const OUT = process.env.CT_PROBE_OUT || path.join(process.cwd(), '.claude/img');

const READ = `(() => {
  const workbench = document.querySelector('.monaco-workbench');
  const titlebar = document.querySelector('.part.titlebar');
  const statusbar = document.querySelector('.part.statusbar');
  const box = (element) => element ? element.getBoundingClientRect().toJSON() : null;
  const sheet = document.getElementById('code-tiles-seams');
  const prefix = (() => {
    const h2 = document.querySelector('.part.sidebar .composite.title .title-label h2');
    return h2 ? getComputedStyle(h2, '::before').content : null;
  })();
  return {
    url: location.href,
    workbench: Boolean(workbench),
    workbenchClasses: workbench ? workbench.className.split(' ').filter((c) => c.startsWith('no') || c.includes('floating')).join(' ') : null,
    titlebar: box(titlebar),
    statusbar: box(statusbar),
    activitybarTop: box(document.querySelector('.part.activitybar'))?.y ?? null,
    menubarBox: box(document.querySelector('.part.activitybar .menubar')),
    sheetPresent: Boolean(sheet),
    sheetIsLastInHead: sheet ? document.head.lastElementChild === sheet : null,
    sheetBytes: sheet ? sheet.textContent.length : 0,
    namePrefix: prefix,
    namePrefixColor: (() => {
      const h2 = document.querySelector('.part.sidebar .composite.title .title-label h2');
      return h2 ? getComputedStyle(h2, '::before').color : null;
    })(),
    sidebarTitleBg: (() => {
      const el = document.querySelector('.part.sidebar .composite.title');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    shellGround: workbench ? getComputedStyle(workbench).getPropertyValue('--modern-ui-shell-background').trim() : null,
  };
})()`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run({ window }) {
  fs.mkdirSync(OUT, { recursive: true });
  await wait(Number(process.env.CT_PROBE_WAIT || 14000));

  // capturePage needs a live surface, and macOS gives an occluded window none: the app has to
  // be frontmost, not merely visible.
  app.focus({ steal: true });
  window.show();
  window.moveTop();
  window.focus();
  await wait(2500);

  const guests = webContents.getAllWebContents().filter((contents) => contents.getURL().includes('127.0.0.1'));
  const report = [];
  for (const guest of guests) {
    try {
      report.push(await guest.executeJavaScript(READ));
      const shot = await guest.capturePage().catch(async () => {
        const [width, height] = window.getContentSize();
        return guest.capturePage({ x: 0, y: 0, width, height });
      });
      const name = new URL(guest.getURL()).searchParams.get('folder') || 'guest';
      fs.writeFileSync(path.join(OUT, `tile-${path.basename(name)}.png`), shot.toPNG());
    } catch (error) {
      report.push({ error: String(error) });
    }
  }

  fs.writeFileSync(path.join(OUT, 'shell.png'), (await window.webContents.capturePage()).toPNG());

  // A tile's own surface cannot be captured (Electron 44 gives a WebContentsView no capture
  // surface), so the picture of a window's inside comes from a throwaway BrowserWindow with the
  // SAME preload, partition and context: the same document, in a thing that can be photographed.
  const first = guests[0];
  if (first) {
    const context = { folder: 'probe', name: 'probe', hue: 276, focused: true, claudeState: 'idle' };
    const shot = new BrowserWindow({
      width: 1200, height: 820, show: false,
      webPreferences: {
        preload: files.guestRuntime,
        partition: 'persist:projects',
        contextIsolation: true,
        sandbox: false,
        additionalArguments: [`--ct-context=${encodeURIComponent(JSON.stringify(context))}`],
      },
    });
    await shot.loadURL(first.getURL());
    await wait(12000);
    fs.writeFileSync(path.join(OUT, 'tile.png'), (await shot.webContents.capturePage()).toPNG());
    shot.destroy();
  }
  console.log('PROBE ' + JSON.stringify({ guests: guests.length, bounds: window.getBounds(), report }, null, 2));
  if (!process.env.CT_PROBE_HOLD) app.exit(0);
}
