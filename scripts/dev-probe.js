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
    // VS Code appends the profile's name to the title whenever it is not the default one, so
    // this is the window's own answer to "which profile am I", not the host's.
    title: document.title,
    // What the window actually loaded, rather than what the mirror asked for: an extension that
    // contributes nothing to the activity bar will not show, but a missing one never does.
    activityBar: [...document.querySelectorAll('.part.activitybar .composite-bar .action-item')]
      .map((item) => item.querySelector('.action-label')?.getAttribute('aria-label') || item.title)
      .filter(Boolean),
    workbenchClasses: workbench ? workbench.className.split(' ').filter((c) => c.startsWith('no') || c.includes('floating') || c.startsWith('modern')).join(' ') : null,
    themeKind: workbench ? ['vs-dark', 'hc-black', 'hc-light', 'vs'].find((kind) => workbench.classList.contains(kind)) ?? null : null,
    documentColorScheme: getComputedStyle(document.documentElement).colorScheme,
    editorBackground: workbench ? getComputedStyle(workbench).getPropertyValue('--vscode-editor-background').trim() : null,
    sidebarRadius: (() => {
      const el = document.querySelector('.part.sidebar');
      return el ? getComputedStyle(el).borderRadius : null;
    })(),
    // The layout seam's effect, read the way the seam itself reads it: the workbench's own
    // classes, never a rect.
    parts: workbench ? {
      sideBar: !workbench.classList.contains('nosidebar'),
      panel: !workbench.classList.contains('nopanel'),
      secondarySideBar: !workbench.classList.contains('noauxiliarybar'),
    } : null,
    // What the runtime's sweep reaches, walked the way it walks: every document a press could
    // land in for the focus seam, and what each one paints its canvas with for the dark seam. A
    // window with a webview open - the Claude panel - has more than one, and a "normal" in this
    // list is a white column waiting to show through.
    documentColorSchemes: (() => {
      const schemes = [];
      const walk = (doc) => {
        schemes.push(doc.defaultView.getComputedStyle(doc.documentElement).colorScheme);
        let frames;
        try { frames = doc.querySelectorAll('iframe'); } catch { return; }
        for (const frame of frames) {
          try { if (frame.contentDocument) walk(frame.contentDocument); } catch { /* cross-origin */ }
        }
      };
      walk(document);
      return schemes;
    })(),
    // The identity seam's badge: the project's favicon in place of the hamburger's glyph. The
    // whole data URL IS the icon, so only its head is worth reading back.
    badge: (() => {
      const el = document.querySelector('.part.activitybar .menubar .menubar-menu-button > .menubar-menu-title');
      if (!el) return null;
      const before = getComputedStyle(el, '::before');
      return { size: [before.width, before.height], image: before.backgroundImage.slice(0, 34) };
    })(),
    // The branch seam: what the pills say, and whether the side bar gave them real room - the
    // pane area ending above them is the whole difference between a footer and an overlay.
    branch: (() => {
      const footer = document.querySelector('.part.sidebar > .ct-footer');
      const content = document.querySelector('.part.sidebar > .content');
      if (!footer) return { pills: [], adopted: null };
      return {
        pills: [...footer.children].map((el) => el.textContent.trim()),
        adopted: footer.classList.contains('footer'),
        clear: content
          ? Math.round(content.getBoundingClientRect().bottom) <= Math.round(footer.getBoundingClientRect().top)
          : null,
      };
    })(),
    titlebar: box(titlebar),
    statusbar: box(statusbar),
    auxiliarybar: box(document.querySelector('.part.auxiliarybar')),
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
    // The card seam: the window's own corner. What shows in the corner it stops painting is the
    // shell's, and no page can see that, so the radius is the half a window can answer for.
    cardRadius: workbench ? getComputedStyle(workbench).borderRadius : null,
    // The terminals seam: the panel's header taken over, and what the strip says. Armed only
    // where the editor's own <select> is, so a false here and a setting that never landed read
    // the same - which is the point.
    terminals: (() => {
      const title = document.querySelector('.part.panel > .composite.title');
      if (!title) return null;
      const strip = title.querySelector(':scope > .ct-terminals');
      const names = title.querySelector('.composite-bar .action-item:not(.icon)');
      return {
        armed: title.classList.contains('ct-terminals-on'),
        tabs: [...(strip ? strip.querySelectorAll('.ct-terminals-name') : [])].map((el) => el.textContent),
        viewNames: names ? getComputedStyle(names).display : null,
      };
    })(),
    // The tint on the active tab, read off a painted tab rather than off the variable behind it:
    // an editor tab and the terminal strip's own are the same colour by construction, and this
    // says whether that colour is the theme's or the project's.
    activeTabBg: (() => {
      const fill = document.querySelector('.part.editor .tabs-container > .tab.active > .tab-fill');
      return fill ? getComputedStyle(fill).backgroundColor : null;
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
