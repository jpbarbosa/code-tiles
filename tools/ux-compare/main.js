// Renders one project on one server with one guest tree, offscreen, and writes a screenshot plus an
// inventory of the UI's measurements. Run once per side: --port --guest --out.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORT = arg('port'), GUEST = arg('guest'), OUT = arg('out'), FOLDER = arg('folder');
const ctx = { folder: FOLDER, name: path.basename(FOLDER), hue: 195, icon: null, focused: true, tint: 'medium', tiled: true, maximized: false, claudeState: 'idle', layout: {}, corners: 'squircle' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A fresh profile every run: a reused one reopens the last run's editors and scroll positions.
const USER_DATA = path.join(path.dirname(OUT), `ud-${path.basename(OUT)}`);
fs.rmSync(USER_DATA, { recursive: true, force: true });
app.setPath('userData', USER_DATA);
app.on('window-all-closed', () => {});
app.dock?.hide();
app.whenReady().then(async () => {
  const result = { port: PORT, guest: GUEST };
  try {
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, useContentSize: true, webPreferences: {
      offscreen: { deviceScaleFactor: 2 }, preload: path.join(GUEST, 'runtime.cjs'), sandbox: false, contextIsolation: true,
      backgroundThrottling: false, partition: `persist:ux-${path.basename(OUT)}`,
      additionalArguments: [`--ct-context=${encodeURIComponent(JSON.stringify(ctx))}`] } });
    const wc = win.webContents;
    wc.loadURL(`http://127.0.0.1:${PORT}/?folder=${encodeURIComponent(FOLDER)}`).catch(() => {});
    for (let i = 0; i < 60; i++) { await sleep(500); if (await wc.executeJavaScript(`!!document.querySelector('.explorer-folders-view .monaco-list-row')`).catch(() => false)) break; }
    await sleep(2000);
    wc.debugger.attach('1.3');
    const cdp = (method, params) => wc.debugger.sendCommand(method, params);
    const CODES = { B: ['KeyB', 66], P: ['KeyP', 80], Enter: ['Enter', 13], '`': ['Backquote', 192], Escape: ['Escape', 27] };
    const BITS = { alt: 1, control: 2, meta: 4, shift: 8 };
    const key = async (name, modifiers = []) => {
      const [code, vk] = CODES[name];
      const mask = modifiers.reduce((m, k) => m | BITS[k], 0);
      const keyText = name.length === 1 ? (modifiers.includes('shift') ? name : name.toLowerCase()) : name;
      for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: keyText, code, windowsVirtualKeyCode: vk, modifiers: mask });
      await sleep(80);
    };
    const type = async (text) => { await cdp('Input.insertText', { text }); await sleep(300); };
    const focusEditor = async () => {};
    for (const file of ['README.md', 'package.json', 'desk.js', 'ROADMAP.md']) {
      await focusEditor(); await key('P', ['meta']); await sleep(500); await type(file); await sleep(700); await key('Enter'); await sleep(900);
    }
    await key('`', ['control']); await sleep(2500);
    await key('P', ['meta', 'shift']); await sleep(500); await type('Claude Code: Open in New Tab'); await sleep(800); await key('Enter'); await sleep(7000);
    await key('Escape'); await sleep(300);
    if (process.argv.includes('--nosidebar')) { await key('B', ['meta']); await sleep(1200); }
    result.inventory = await wc.executeJavaScript(fs.readFileSync(arg('script') || path.join(__dirname, 'inventory.js'), 'utf8'));
    fs.writeFileSync(`${OUT}.png`, (await wc.capturePage()).toPNG());
  } catch (error) { result.error = String(error?.stack || error); }
  fs.writeFileSync(`${OUT}.json`, JSON.stringify(result, null, 2));
  app.exit(0);
});
