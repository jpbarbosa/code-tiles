// The real app, from source, on the demo's invisible display. Every window is shown without
// activating, so filming never takes the keyboard from whoever is using the Mac.
import fs from 'node:fs';
import { BrowserWindow, Menu, app, screen, shell } from 'electron';

import { WORK } from './world.mjs';

const DISPLAY = Number(process.env.DEMO_DISPLAY);
const SIZE = { width: 1600, height: 900 };
const DATA = `${WORK}data/`;

app.setName('Code Tiles');
app.dock?.hide();
app.focus = () => {};

// The usage sign-in would open a browser tab over whatever you are doing: the consent URL goes to
// a file instead, to be opened when it suits you.
try {
  shell.openExternal = async (url) => {
    fs.writeFileSync(`${DATA}external-url.txt`, `${url}\n`);
    console.log('[demo] openExternal', url);
  };
} catch (error) {
  console.error('[demo] could not take over openExternal:', error.message);
}

// The app's sounds are real but muted here, and every chime is logged, so the soundtrack puts the
// app's own buzz exactly where the app played it.
app.on('web-contents-created', (_event, contents) => {
  contents.setAudioMuted(true);
  const send = contents.send.bind(contents);
  contents.send = (channel, message, ...rest) => {
    if (channel === 'ct:event' && message?.type === 'chime') fs.appendFileSync(`${DATA}chimes.log`, `${Date.now() / 1000}\n`);
    return send(channel, message, ...rest);
  };
});

// Keyboard shortcuts are menu accelerators, which only macOS key handling reaches. The take fires
// the same items by label through the inspector (launch.sh passes --inspect).
globalThis.demoMenu = (label) => {
  const find = (items) => {
    for (const item of items) {
      if (item.label === label) return item;
      const inner = item.submenu && find(item.submenu.items);
      if (inner) return inner;
    }
    return null;
  };
  const item = find(Menu.getApplicationMenu()?.items || []);
  if (!item) throw new Error(`no menu item ${label}`);
  item.click();
  return true;
};

// Two inputs the app reads off the OS rather than off a page, which nothing on this display can
// give it: the cursor, followed while a tile is dragged onto another, and the window's focus, which
// that drag requires. The take sets both through the inspector for the length of the gesture.
// On ready, because Electron refuses the screen module before it - and still ahead of the app's
// own ready handler, which is registered by the import at the bottom.
app.whenReady().then(() => {
  const cursor = screen.getCursorScreenPoint.bind(screen);
  screen.getCursorScreenPoint = () => globalThis.demoCursor ?? cursor();
});
const focused = BrowserWindow.prototype.isFocused;
BrowserWindow.prototype.isFocused = function isFocused() {
  return globalThis.demoFocused ?? focused.call(this);
};

// A context menu opens at the real mouse, which is on another screen: here it opens where the take
// says, on the window it was asked for, and is kept so the take can close it again.
const popup = Menu.prototype.popup;
Menu.prototype.popup = function demoPopup(options = {}) {
  globalThis.demoPopup = this;
  return popup.call(this, { ...options, ...(globalThis.demoMenuAt || {}) });
};

// Where a window's content sits on screen, by the page it shows: the take turns a point inside the
// preferences panel into one on the main window, and a window point into a screen one.
globalThis.demoBounds = (page) => BrowserWindow.getAllWindows()
  .find((window) => !window.isDestroyed() && window.webContents.getURL().endsWith(page))?.getContentBounds() ?? null;

let placed = false;
BrowserWindow.prototype.show = function show() {
  if (!placed && !this.getParentWindow()) {
    placed = true;
    const target = screen.getAllDisplays().find((display) => display.id === DISPLAY);
    if (!target) throw new Error(`no display ${DISPLAY}`);
    this.setBounds({
      x: target.bounds.x + Math.round((target.bounds.width - SIZE.width) / 2),
      y: target.bounds.y + Math.round((target.bounds.height - SIZE.height) / 2),
      ...SIZE,
    });
  }
  this.showInactive();
};

await import(new URL('../../src/main/index.js', import.meta.url).href);
