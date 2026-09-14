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
    // this is the window's own answer to "which profile am I", not the host's. Its last segment
    // is the product name, which is the half of the welcome seam a closed welcome tab still says.
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
    // The ring around that badge: what Claude is doing in this project. Read off the animations
    // the document is actually RUNNING rather than off the rule, because a declared animation
    // that never started and a live one are the same string in CSS - and because an animation
    // still running for a project with nothing to say is a frame per tick, forever.
    ring: (() => {
      const el = document.querySelector('.part.activitybar .menubar .menubar-menu-button > .menubar-menu-title');
      if (!el) return null;
      const after = getComputedStyle(el, '::after');
      return {
        drawn: after.content !== 'none',
        size: after.width,
        running: document.getAnimations().map((animation) => animation.animationName)
          .filter((name) => name.startsWith('ct-ring')),
      };
    })(),
    // The maximize seam: the item this app adds to the activity bar, above the editor's own list
    // and never in it, plus the glyph the app's state asked for.
    maximize: (() => {
      const item = document.querySelector('.part.activitybar .composite-bar .ct-maximize');
      if (!item) return null;
      const label = item.querySelector('.action-label');
      const box = item.getBoundingClientRect();
      return {
        aboveList: !item.closest('.actions-container')
          && item.nextElementSibling?.classList.contains('actions-container') === true,
        glyph: [...label.classList].find((name) => name.startsWith('codicon-')) || null,
        checked: item.classList.contains('checked'),
        title: label.title,
        color: getComputedStyle(label).color,
        box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
      };
    })(),
    // The close seam: the app's × in the window's corner, and whether the editor's title row
    // actually gave up the room for it. Actions still reaching past the button's left edge is a
    // close laid OVER the editor's own "..." rather than beside it.
    close: (() => {
      const button = document.querySelector('.monaco-workbench > .ct-close');
      if (!button) return null;
      const actions = document.querySelector('.part.editor .title .editor-actions');
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        title: button.title,
        box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
        clear: actions ? Math.round(actions.getBoundingClientRect().right) <= Math.round(box.left) : null,
        plate: style.backgroundColor,
        ink: style.color,
      };
    })(),
    // The identity seam's other half: the badge is the tile's own drag handle while there are
    // other tiles to move it among, and the cursor is the whole of what says so.
    badgeHandle: (() => {
      const button = document.querySelector('.part.activitybar .menubar .menubar-menu-button');
      return button ? getComputedStyle(button).cursor : null;
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
    // The corners seam: the editor's own radius token as the preference scales it, and the shape
    // its editor part is drawn in.
    corners: workbench ? {
      large: getComputedStyle(workbench).getPropertyValue('--vscode-cornerRadius-large').trim(),
      editorPart: (() => {
        const part = document.querySelector('.part.editor');
        return part ? getComputedStyle(part).getPropertyValue('corner-top-left-shape') : null;
      })(),
    } : null,
    // The webview-clip seam: the wrapper the editor clips a webview with, padded to its part's
    // inner edge and rounded as the part is.
    webviewClip: (() => {
      const wrapper = document.querySelector('.monaco-workbench > div:has(> .webview-overlay-content)');
      if (!wrapper) return null;
      const style = getComputedStyle(wrapper);
      return { padding: style.paddingRight, radius: style.borderBottomRightRadius };
    })(),
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
    // The tint's dial, read where it is spent. The middle rung, which a window told nothing lands
    // on, is 96.15% / 85.7% / 0.0275 / 0.055 on a focused window.
    tintRung: workbench ? ['--ct-veil', '--ct-wash', '--ct-ink-chroma', '--ct-tab-chroma']
      .map((name) => getComputedStyle(workbench).getPropertyValue(name).trim()) : null,
    // What a see-through theme tab was flattened to; empty on a theme whose tab is opaque.
    tabBases: workbench ? ['--ct-editor-tab-base', '--ct-panel-tab-base']
      .map((name) => getComputedStyle(workbench).getPropertyValue(name).trim()) : null,
    // Your own turns in the chat, which are the one surface a mix cannot lift: read as the
    // variable the extension's own rule paints the bubble with, against the page in the same
    // document. Two equal values is the seam's rule not reaching that frame - which is what the
    // theme shipped and what this exists to break. Null while no chat is open.
    chatTurn: (() => {
      const walk = (doc) => {
        const bubble = doc.querySelector('[class*="userMessage_"]');
        if (bubble) {
          const view = doc.defaultView;
          return [view.getComputedStyle(bubble).getPropertyValue('--app-input-background').trim(),
            view.getComputedStyle(doc.documentElement).getPropertyValue('--vscode-input-background').trim()];
        }
        let frames;
        try { frames = doc.querySelectorAll('iframe'); } catch { return null; }
        for (const frame of frames) {
          try { if (frame.contentDocument) { const hit = walk(frame.contentDocument); if (hit) return hit; } }
          catch { /* cross-origin */ }
        }
        return null;
      };
      return walk(document);
    })(),
    // The chat-calm seam, read in the Claude page itself: what a tool's output is painted with,
    // whether onboarding is drawn anywhere, and how each notice displays. A page with no sheet in it
    // is the gate missing it; the output reading is null while no tool has run.
    chatCalm: (() => {
      const walk = (doc) => {
        if (doc.querySelector('link[href*="anthropic.claude-code-"]')) {
          const view = doc.defaultView;
          const output = doc.querySelector('[class*="toolResult_"]');
          return {
            sheet: Boolean(doc.getElementById('code-tiles-chat-calm')),
            output: output ? view.getComputedStyle(output).backgroundColor : null,
            onboarding: Boolean(doc.querySelector(
              '[aria-label="Learn Claude Code"], [class*="milestoneList_"]')),
            notices: [...doc.querySelectorAll('[data-testid$="-notice"]')]
              .map((notice) => notice.dataset.testid + ' ' + view.getComputedStyle(notice).display),
          };
        }
        let frames;
        try { frames = doc.querySelectorAll('iframe'); } catch { return null; }
        for (const frame of frames) {
          try { if (frame.contentDocument) { const hit = walk(frame.contentDocument); if (hit) return hit; } }
          catch { /* cross-origin */ }
        }
        return null;
      };
      return walk(document);
    })(),
    // The activity bar's icons, which are written inline from JS and so are read off the label
    // rather than off a variable. On the focused window every unchecked one carries the hue; the
    // checked one is the theme's, and a column of identical colours means the tie was lost.
    activityBarIcons: [...document.querySelectorAll('.part.activitybar .monaco-action-bar .action-item')]
      .map((item) => {
        const label = item.querySelector('.action-label');
        if (!label) return null;
        const style = getComputedStyle(label);
        return [item.classList.contains('checked') ? 'checked' : 'resting',
          label.classList.contains('uri-icon') ? style.backgroundColor : style.color];
      }).filter(Boolean),
    // Which theme actually landed, now that the dark seam only DEFAULTS one: a theme-scoped
    // colorCustomizations block shows up in this one.
    terminalBackground: workbench ? getComputedStyle(workbench).getPropertyValue('--vscode-terminal-background').trim() : null,
    // The tint over the terminal, which is an overlay because xterm paints from JS. Its colour
    // has to match the panel's tinted background above; null is a window with no terminal open.
    terminalOverlay: (() => {
      const outer = document.querySelector('.part.panel .terminal-outer-container');
      if (!outer) return null;
      const after = getComputedStyle(outer, '::after');
      return [after.backgroundColor, after.mixBlendMode, after.zIndex];
    })(),
    // The tint, read where it is SPENT: the workbench holds the theme's own values and the
    // rewrite lands one level down, so a pair here equal to editorBackground above is a tint
    // that stopped reaching whatever theme is now in front of it.
    tintedBackgrounds: workbench?.firstElementChild ? (() => {
      const style = getComputedStyle(workbench.firstElementChild);
      return ['--vscode-editor-background', '--vscode-panel-background', '--vscode-sideBar-background']
        .map((name) => style.getPropertyValue(name).trim());
    })() : null,
    // What each part actually PAINTS against the literal the workbench wrote inline on it. Equal
    // is a part the tint never reached, and the activity bar is the one that reads as an untinted
    // column beside a tinted side bar in a theme that colours the two differently.
    partBackgrounds: Object.fromEntries([...document.querySelectorAll('.part')].map((part) => {
      const name = [...part.classList].filter((className) => className !== 'part').join('.') || 'part';
      return [name, [getComputedStyle(part).backgroundColor, part.style.backgroundColor || null]];
    })),
    // An empty editor group paints a literal of its own over the editor's, in a theme that names
    // editorGroup.emptyBackground. Equal is the tint not reaching it; null is no empty group, or
    // a theme that names none.
    emptyGroupBackground: (() => {
      const group = document.querySelector('.part.editor .editor-group-container.empty');
      return group && group.style.backgroundColor
        ? [getComputedStyle(group).backgroundColor, group.style.backgroundColor] : null;
    })(),
    // The welcome seam: the page's own two columns, Start and Recent, with no walkthrough list
    // under one and no ad above the other. Null in a window whose welcome tab is closed.
    welcome: (() => {
      const container = document.querySelector('.gettingStartedCategoriesContainer');
      if (!container) return null;
      return [...container.querySelectorAll('.categories-column')]
        .map((column) => [...column.children].map((element) => element.className));
    })(),
  };
})()`;

// The reveal seam draws nothing at rest - it is an item in a context menu - so the explorer's menu
// is opened in the throwaway window to be read. Null where no explorer row is showing.
const REVEAL = `(async () => {
  const row = document.querySelector('.explorer-folders-view .monaco-list-row');
  if (!row) return null;
  const box = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
    clientX: box.x + 10, clientY: box.y + box.height / 2 }));
  await new Promise((resolve) => setTimeout(resolve, 700));
  return [...document.querySelectorAll('.monaco-menu .action-label')]
    .map((label) => label.textContent.trim()).filter(Boolean);
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
  let reveal = null;
  if (first) {
    // Tiled and not the master, which is the shape that draws every control a window can have:
    // the maximize item offering the column, and the grip beside the close in the corner.
    const context = {
      folder: 'probe', name: 'probe', hue: 276, focused: true, claudeState: 'idle',
      tiled: true, maximized: false,
    };
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
    // After the capture, or the picture of the window has the menu open in it.
    reveal = await shot.webContents.executeJavaScript(REVEAL).catch((error) => String(error));
    shot.destroy();
  }
  console.log('PROBE ' + JSON.stringify({ guests: guests.length, bounds: window.getBounds(), report, reveal }, null, 2));
  if (!process.env.CT_PROBE_HOLD) app.exit(0);
}
