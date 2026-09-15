// "Working the grid": closing three ways and the empty stage, the picker by path, a tile pointed
// elsewhere from inside it, two tiles swapped by their icons, zoom, the branch pill, a project's own
// menu, Preferences and the strip's speaker. Marks for tools/build.mjs.
// usage: node take-extras.mjs [name] [--dry]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';

import { META, Page, sleep, waitFor } from './cdp.mjs';
import { ACTIVITY, CODE, WORK } from './world.mjs';

const DRY = process.argv.includes('--dry');
const NAME = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'extras';
const RAW = `${WORK}raw/`;
const CHIMES = `${WORK}data/chimes.log`;
const FIVE = ['orbit', 'fern', 'tidepool', 'atlas', 'lumen'];

let firstWall = DRY ? Date.now() / 1000 : null;
const marks = [];
function mark(kind, data = {}) {
  marks.push({ kind, wall: Date.now() / 1000, ...data });
  console.log(`${(Date.now() / 1000 - (firstWall || Date.now() / 1000)).toFixed(1).padStart(6)} ${kind} ${JSON.stringify(data)}`);
}
const center = (box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const call = (type, payload = {}) => shell.eval(`window.ct.call(${JSON.stringify(type)}, ${JSON.stringify(payload)})`);

// The main process through its inspector: the app's menu by label, and the wrapper's hooks. Bounded,
// because a native menu held open could keep the main thread from ever answering.
const main = await (async () => {
  const [target] = await (await fetch('http://127.0.0.1:9335/json/list')).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let next = 0;
  return (expression, timeout = 8000) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => reject(new Error(`main did not answer: ${expression.slice(0, 60)}`)), timeout);
    socket.addEventListener('message', function answer(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', answer);
      clearTimeout(timer);
      resolve(message.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression } }));
  });
})();
async function shortcut(keys, label) {
  mark('keys', { text: keys });
  await main(`globalThis.demoMenu(${JSON.stringify(label)})`);
}

// Open projects in the app's own order, read off the chips, which are drawn even while hidden.
const openOrder = () => shell.eval(`[...document.querySelectorAll('#chips .chip')].map((chip) => chip.dataset.folder.split('/').pop())`);
async function grounds() {
  const names = await openOrder();
  const boxes = await shell.eval(`[...document.querySelectorAll('#grounds .ground')].map((el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  })`);
  return Object.fromEntries(names.map((name, index) => [name, boxes[index]]));
}

async function tile(name) {
  const pattern = new RegExp(`/code/${name}(&|$)`);
  const page = await Page.open((target) => pattern.test(decodeURIComponent(target.url)), { timeout: 90000 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return page;
}
const loaded = (page) => waitFor(() => page.eval(`document.querySelectorAll('.part.editor .tab').length > 0
  && Boolean(document.querySelector('.part.sidebar .monaco-list-row'))`), { timeout: 90000 });

async function shellClick(css) {
  const at = center(await shell.rect(css));
  mark('click', at);
  await shell.click(at.x, at.y);
  return at;
}
async function tileClick(page, rect, x, y) {
  mark('click', { x: Math.round(rect.x + x), y: Math.round(rect.y + y) });
  await page.click(x, y);
}
// Key down only, for a key that closes the page it lands in: its key up would never be answered.
const closingKey = (page, key, code, keyCode, text) => page.send('Input.dispatchKeyEvent',
  { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) }, { timeout: 3000 }).catch(() => {});
const enter = (page) => closingKey(page, 'Enter', 'Enter', 13, '\r');
async function pickerPage() {
  const page = await Page.open((target) => target.url.endsWith('/shell/picker.html'), { timeout: 10000 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sleep(700);
  return page;
}
async function quickOpen(page, text) {
  await page.key('p', META);
  await sleep(500);
  await page.type(text, { perKey: 10 });
  await sleep(900);
  await page.key('Enter');
  await sleep(900);
}

// The stage: five projects in the grid, lumen last, orbit focused, and ledger never seen - so the
// picker offers it as a folder on disk rather than as a project.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
await call('mode:set', { mode: 'grid' });
await call('project:maximize', { maximized: false });
await call('project:close', { folder: `${CODE}ledger` });
await call('project:forget', { folder: `${CODE}ledger` });
for (const name of FIVE) await call('project:open', { folder: CODE + name });
await call('grid:reset', {});
await call('layout:set', { part: 'sideBar', visible: true });
await call('layout:set', { part: 'panel', visible: false });
await call('project:focus', { folder: `${CODE}orbit` });
const tiles = {};
for (const name of FIVE) tiles[name] = await tile(name);
await Promise.all(FIVE.map((name) => loaded(tiles[name])));
await sleep(2500);

fs.mkdirSync(RAW, { recursive: true });
fs.rmSync(CHIMES, { force: true });
let recorder = null;
if (!DRY) {
  const pid = execFileSync('pgrep', ['-f', 'MacOS/Electron .*demo-main.mjs']).toString().trim().split('\n')[0];
  recorder = spawn(`${WORK}bin/ctdemo`, ['record', pid, `${RAW}${NAME}.mov`, '60']);
  recorder.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.event === 'first-frame') firstWall = event.wall;
    }
  });
  recorder.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitFor(async () => firstWall, { timeout: 15000 });
}

let rects = await grounds();
mark('start');
mark('title', { text: 'Working the grid', sub: 'Everything else the window does.' });
await sleep(2400);
mark('title-off');

// Closing, three ways, down to the empty stage.
mark('caption', { text: 'Close a project from its corner' });
const corner = center(await tiles.lumen.rect('.monaco-workbench > .ct-close'));
await tileClick(tiles.lumen, rects.lumen, corner.x, corner.y);
await sleep(2000);
mark('caption', { text: 'from its chip, in single view' });
await shortcut('⌃ ⌘ E', 'Single Project');
mark('camera', { x: 0, y: 0, w: 700, ease: 0.8 });
await sleep(1600);
await shellClick('.chip[data-folder$="/atlas"] .close');
await sleep(1500);
mark('camera', { x: 0, y: 0, w: 1600, ease: 0.8 });
await shortcut('⌃ ⌘ G', 'Grid');
await sleep(1400);
mark('caption', { text: 'or from the keyboard' });
for (let press = 0; press < 3; press += 1) {
  await shortcut('⌃ ⌘ W', 'Close Project');
  await sleep(1100);
}
mark('caption', { text: 'Closed ones stay on the list. Double-click one to open just that one' });
await sleep(1500);
const empty = await shell.eval(`Object.fromEntries([...document.querySelectorAll('#empty-projects .project-tile')].map((el) => {
  const { x, y, width, height } = el.getBoundingClientRect();
  return [el.textContent, { x, y, width, height }];
}))`);
const orbitOnStage = center(empty.orbit);
mark('click', orbitOnStage);
await shell.click(orbitOnStage.x, orbitOnStage.y, { clickCount: 1 });
await shell.click(orbitOnStage.x, orbitOnStage.y, { clickCount: 2 });
mark('fast', { seconds: 1.2 });
await sleep(1500);
tiles.orbit = await tile('orbit');
await loaded(tiles.orbit);
mark('normal');
await sleep(1200);

// The picker by path, into a folder and back, and a project with no favicon.
mark('caption', { text: 'Browse from home by path: right steps into a folder, left steps back' });
await shellClick('#add');
let picker = await pickerPage();
await picker.type('~/code/', { perKey: 110 });
await sleep(1300);
const ledgerAt = await picker.eval(`[...document.querySelectorAll('li.row')].findIndex((row) => (row.dataset.into || '').endsWith('/ledger'))`);
for (let step = 0; step < ledgerAt; step += 1) {
  await picker.key('ArrowDown');
  await sleep(280);
}
await sleep(500);
await picker.key('ArrowRight');
await sleep(1600);
await picker.key('ArrowLeft');
await sleep(1200);
mark('caption', { text: 'A project with no favicon wears a steady colour from its path' });
await enter(picker);
mark('fast', { seconds: 1.2 });
tiles.ledger = await tile('ledger');
await loaded(tiles.ledger);
mark('normal');
await sleep(2400);

mark('caption', { text: 'Pick one that is already open and it simply takes the focus' });
await shellClick('#add');
picker = await pickerPage();
await picker.type('orb', { perKey: 130 });
await sleep(1000);
await enter(picker);
await sleep(2000);

// fern and tidepool back on stage for what follows, at speed.
mark('fast', { seconds: 1.6 });
for (const name of ['fern', 'tidepool']) {
  await shellClick('#add');
  picker = await pickerPage();
  await picker.type(name.slice(0, 3), { perKey: 60 });
  await sleep(600);
  await enter(picker);
  tiles[name] = await tile(name);
  await loaded(tiles[name]);
}
mark('normal');
await sleep(1000);

// A tile pointed at another folder from inside it: ledger becomes atlas where it stands.
rects = await grounds();
mark('caption', { text: 'Or point a tile at another folder from inside it' });
await tileClick(tiles.ledger, rects.ledger, Math.round(rects.ledger.width * 0.6), 200);
await sleep(500);
await quickOpen(tiles.ledger, '>File: Open Folder...');
await tiles.ledger.eval(`document.querySelector('.quick-input-box input')?.select(), true`);
await tiles.ledger.type(`${CODE}atlas`, { perKey: 35 });
await sleep(900);
await tiles.ledger.key('Enter');
await sleep(1200);
if (await tiles.ledger.eval(`Boolean(document.querySelector('.quick-input-widget:not([style*="display: none"]) .quick-input-box input'))`).catch(() => false)) {
  await closingKey(tiles.ledger, 'Enter', 'Enter', 13, '\r');
}
await waitFor(async () => (await openOrder()).includes('atlas'), { timeout: 30000 });
tiles.atlas = await tile('atlas');
await loaded(tiles.atlas);
await sleep(2000);

// Two tiles swapped by dragging one's icon onto the other. Main follows the cursor itself during
// that gesture, and the wrapper hands it the take's cursor for as long as it lasts.
rects = await grounds();
const content = JSON.parse(await main(`JSON.stringify(globalThis.demoBounds('/shell/index.html'))`));
const toScreen = (point) => ({ x: Math.round(content.x + point.x), y: Math.round(content.y + point.y) });
mark('caption', { text: 'Drag a tile by its icon onto another to swap them' });
const handle = center(await tiles.orbit.rect('.part.activitybar .menubar .menubar-menu-button'));
const from = { x: Math.round(rects.orbit.x + handle.x), y: Math.round(rects.orbit.y + handle.y) };
const to = center(rects.fern);
await main(`globalThis.demoFocused = true; globalThis.demoCursor = ${JSON.stringify(toScreen(from))}; true`);
mark('drag-start', from);
await tiles.orbit.mouse('mouseMoved', handle.x, handle.y, { button: 'none' });
await tiles.orbit.mouse('mousePressed', handle.x, handle.y, { clickCount: 1, buttons: 1 });
for (let step = 1; step <= 36; step += 1) {
  const t = step / 36;
  const eased = t * t * (3 - 2 * t);
  const point = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
  await main(`globalThis.demoCursor = ${JSON.stringify(toScreen(point))}; true`);
  await tiles.orbit.mouse('mouseMoved', handle.x + point.x - from.x, handle.y + point.y - from.y, { buttons: 1 });
  await sleep(28);
}
await tiles.orbit.mouse('mouseReleased', handle.x + to.x - from.x, handle.y + to.y - from.y, { clickCount: 1 });
mark('drag-end', to);
await main('globalThis.demoCursor = undefined; globalThis.demoFocused = undefined; true');
await sleep(2200);

mark('caption', { text: 'Zoom every tile together' });
await shortcut('⌘ +', 'Zoom In');
await sleep(1100);
await shortcut('⌘ +', 'Zoom In');
await sleep(1600);
await shortcut('⌘ 0', 'Actual Size');
await sleep(1400);

// The branch pill under the file tree is still the editor's own branch picker.
rects = await grounds();
mark('caption', { text: 'The branch sits under the files: click it to switch' });
const pill = center(await tiles.orbit.rect('.part.sidebar > .ct-footer > :first-child'));
await tileClick(tiles.orbit, rects.orbit, pill.x, pill.y);
await sleep(2200);
await tiles.orbit.key('Escape');
await sleep(700);

// A project's own menu. Native, so the wrapper opens it on this window rather than at the real
// mouse, and the choice is made through it once it has been seen.
mark('caption', { text: "Right-click a project's icon to choose its colour or its icon" });
const badge = center(await tiles.fern.rect('.part.activitybar .menubar .menubar-menu-button'));
const onBadge = { x: Math.round(rects.fern.x + badge.x), y: Math.round(rects.fern.y + badge.y) };
await main(`globalThis.demoMenuAt = ${JSON.stringify({ x: onBadge.x + 8, y: onBadge.y + 12 })}; true`);
mark('click', onBadge);
await tiles.fern.mouse('mouseMoved', badge.x, badge.y, { button: 'none' });
await tiles.fern.mouse('mousePressed', badge.x, badge.y, { button: 'right', clickCount: 1, buttons: 2 });
await tiles.fern.mouse('mouseReleased', badge.x, badge.y, { button: 'right', clickCount: 1 });
await sleep(1900);
const colour = await main(`(() => {
  const menu = globalThis.demoPopup;
  if (!menu) return 'no menu';
  menu.closePopup();
  const hues = menu.items.find((item) => item.label === 'Color').submenu.items
    .filter((item) => item.type !== 'separator' && item.label !== 'Automatic');
  const choice = hues.find((item) => /blue|indigo/i.test(item.label)) || hues[Math.floor(hues.length / 2)];
  choice.click();
  return choice.label;
})()`).catch((error) => `menu failed: ${error.message}`);
console.log('colour chosen:', colour);
await sleep(2400);

// Preferences, driven in its own window, with every tile following at once.
mark('caption', { text: 'Preferences: how much colour each tile wears, and every corner' });
await shortcut('⌘ ,', 'Preferences…');
const prefs = await Page.open((target) => target.url.endsWith('/shell/preferences.html'), { timeout: 10000 });
await sleep(1300);
const mainBox = JSON.parse(await main(`JSON.stringify(globalThis.demoBounds('/shell/index.html'))`));
const prefsBox = JSON.parse(await main(`JSON.stringify(globalThis.demoBounds('/shell/preferences.html'))`));
async function rung(dial, face) {
  const find = `[...[...document.querySelectorAll('.dial')].find((row) => row.querySelector('.name').textContent === ${JSON.stringify(dial)})
    .querySelectorAll('label')].find((label) => label.textContent.trim() === ${JSON.stringify(face)})`;
  const box = await prefs.eval(`(() => { const { x, y, width, height } = ${find}.getBoundingClientRect(); return { x, y, width, height }; })()`);
  mark('click', center({ x: box.x + prefsBox.x - mainBox.x, y: box.y + prefsBox.y - mainBox.y, width: box.width, height: box.height }));
  await sleep(350);
  await prefs.eval(`${find}.querySelector('input').click(), true`);
}
await rung('The tile you are in', 'Strong');
await sleep(1500);
await rung('Every other tile', 'Subtle');
await sleep(1800);
await rung('Every corner the app draws', 'Round');
await sleep(1800);
mark('fast', { seconds: 0.9 });
await rung('Every corner the app draws', 'Smooth');
await rung('The tile you are in', 'Medium');
await rung('Every other tile', 'Medium');
mark('normal');
await closingKey(prefs, 'Escape', 'Escape', 27);
await sleep(900);

// The speaker: turning the buzz back on plays it once, which the soundtrack keeps.
mark('caption', { text: "and the strip's speaker turns the buzz off and on" });
await shellClick('#sound');
await sleep(1300);
await shellClick('#sound');
await sleep(2000);
mark('end');

if (recorder) {
  recorder.kill('SIGINT');
  await once(recorder, 'exit');
}
const chimes = fs.existsSync(CHIMES) ? fs.readFileSync(CHIMES, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
fs.writeFileSync(`${RAW}${NAME}.json`, JSON.stringify({ firstWall, window: [1600, 900], marks, chimes }, null, 2));
console.log('wrote', `${RAW}${NAME}.json`, `${chimes.length} chime(s)`);

// Put fern's own colour back for the next take, off camera, through the same menu.
await main(`globalThis.demoMenuAt = { x: 40, y: 60 }; true`);
await call('project:menu', { folder: `${CODE}fern` });
await sleep(800);
await main(`(() => { const menu = globalThis.demoPopup; menu.closePopup();
  menu.items.find((item) => item.label === 'Color').submenu.items.find((item) => item.label === 'Automatic').click(); return true; })()`)
  .catch((error) => console.log('could not restore fern colour:', error.message));
process.exit(0);
