// The overview take: from the empty stage to five live tiles, through focus, the keyboard, the
// layout buttons, single view, maximize, a gutter and the picker. Every beat is a mark for
// tools/build.mjs. Needs tools/prep.mjs first, for the files each tile reopens on.
// usage: node take-overview.mjs [name] [--dry]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';

import { Page, sleep, waitFor } from './cdp.mjs';
import { ACTIVITY, CODE, WORK } from './world.mjs';

const DRY = process.argv.includes('--dry');
const NAME = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'overview';
const RAW = `${WORK}raw/`;
const FIRST_FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
const ALL = [...FIRST_FOUR, 'lumen'];

let firstWall = DRY ? Date.now() / 1000 : null;
const marks = [];
function mark(kind, data = {}) {
  marks.push({ kind, wall: Date.now() / 1000, ...data });
  console.log(`${(Date.now() / 1000 - (firstWall || Date.now() / 1000)).toFixed(1).padStart(6)} ${kind} ${JSON.stringify(data)}`);
}
const center = (box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const call = (type, payload = {}) => shell.eval(`window.ct.call(${JSON.stringify(type)}, ${JSON.stringify(payload)})`);

// The app's menu, through the main process's inspector: a shortcut's own handler, shown as keycaps.
const inspector = await (async () => {
  const [target] = await (await fetch('http://127.0.0.1:9335/json/list')).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let next = 0;
  return (expression) => new Promise((resolve) => {
    const id = ++next;
    socket.addEventListener('message', function answer(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', answer);
      resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression } }));
  });
})();
async function shortcut(keys, label) {
  mark('keys', { text: keys });
  await inspector(`globalThis.demoMenu(${JSON.stringify(label)})`);
}

async function grounds(names) {
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
const columnSplitter = () => shell.eval(`(() => {
  const el = [...document.querySelectorAll('#splitters .splitter')].find((node) => node.dataset.axis === 'cols');
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
})()`);

// The stage the take starts on: nothing open, lumen never seen, side bars in, panels out, an even
// 2x2 waiting behind the empty stage, and no Claude session to put a ring on anything.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
await call('mode:set', { mode: 'grid' });
await call('project:maximize', { maximized: false });
await call('project:close', { folder: `${CODE}lumen` });
for (const name of FIRST_FOUR) await call('project:open', { folder: CODE + name });
await call('grid:reset', {});
await call('layout:set', { part: 'sideBar', visible: true });
await call('layout:set', { part: 'panel', visible: false });
for (const name of ALL) await call('project:close', { folder: CODE + name });
await call('project:forget', { folder: `${CODE}lumen` });
await sleep(3000);

fs.mkdirSync(RAW, { recursive: true });
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

mark('start');
mark('title', { text: 'Code Tiles', sub: 'Several VS Code projects, live, in one window.' });
await sleep(2600);
mark('title-off');

// The empty stage: tick four recent projects and open them together.
const empty = await shell.eval(`Object.fromEntries([...document.querySelectorAll('#empty-projects .project-tile')].map((el) => {
  const { x, y, width, height } = el.getBoundingClientRect();
  return [el.textContent, { x, y, width, height }];
}))`);
mark('caption', { text: 'Pick the projects you are working on' });
for (const name of FIRST_FOUR) {
  const at = center(empty[name]);
  mark('click', at);
  await shell.click(at.x, at.y);
  await sleep(700);
}
await sleep(300);
await shellClick('#empty-add');
mark('fast', { seconds: 2.4 });
const tiles = {};
for (const name of FIRST_FOUR) tiles[name] = await tile(name);
await Promise.all(FIRST_FOUR.map((name) => loaded(tiles[name])));
// A window reopens on the panel it remembers, and a press made while it was closed does not reach
// it: orbit comes back with its terminal up, which turns the strip's panel button into a close.
await call('layout:set', { part: 'panel', visible: false });
await sleep(1200);
mark('normal');
mark('caption', { text: 'Every tile is a real VS Code, all on one server' });
await sleep(2600);

let rects = await grounds(FIRST_FOUR);
mark('caption', { text: 'Click into one and it wears its colour' });
await tileClick(tiles.fern, rects.fern, 520, 250);
await sleep(1500);
await tileClick(tiles.tidepool, rects.tidepool, 520, 250);
await sleep(1600);

mark('caption', { text: 'or go straight to one from the keyboard' });
await shortcut('⌃ ⌘ 1', 'Project 1');
await sleep(1400);
await shortcut('⌃ ⌘ 4', 'Project 4');
await sleep(1400);
await shortcut('⌘ `', 'Next Project');
await sleep(1600);

mark('caption', { text: 'One project at a time, with a chip for each' });
await shortcut('⌃ ⌘ E', 'Single Project');
mark('camera', { x: 0, y: 0, w: 1000, ease: 0.9 });
await sleep(2200);
await shellClick('.chip[data-folder$="/fern"]');
await sleep(1800);
await shellClick('.chip[data-folder$="/atlas"]');
await sleep(1600);
mark('camera', { x: 0, y: 0, w: 1600, ease: 0.9 });
await shortcut('⌃ ⌘ G', 'Grid');
await sleep(1800);
rects = await grounds(FIRST_FOUR);

mark('caption', { text: 'Maximize one and keep an eye on the rest' });
const maximize = center(await tiles.orbit.rect('.part.activitybar .ct-maximize'));
await tileClick(tiles.orbit, rects.orbit, maximize.x, maximize.y);
await sleep(2600);
rects = await grounds(FIRST_FOUR);
await tileClick(tiles.fern, rects.fern, Math.min(330, rects.fern.width - 60), 160);
await sleep(2000);
rects = await grounds(FIRST_FOUR);
await tileClick(tiles.orbit, rects.orbit, maximize.x, maximize.y);
await sleep(2000);

mark('caption', { text: 'Drag a gutter to resize, double-click it to even out' });
const from = center(await columnSplitter());
const to = { x: from.x + 190, y: from.y };
mark('drag-start', from);
await shell.mouse('mouseMoved', from.x, from.y, { button: 'none' });
await shell.mouse('mousePressed', from.x, from.y, { clickCount: 1, buttons: 1 });
for (let step = 1; step <= 30; step += 1) {
  const t = step / 30;
  await shell.mouse('mouseMoved', Math.round(from.x + (to.x - from.x) * t * t * (3 - 2 * t)), from.y, { buttons: 1 });
  await sleep(30);
}
await shell.mouse('mouseReleased', to.x, to.y, { clickCount: 1 });
mark('drag-end', to);
await sleep(1800);
const moved = center(await columnSplitter());
mark('click', moved);
await shell.click(moved.x, moved.y, { clickCount: 1 });
await shell.click(moved.x, moved.y, { clickCount: 2 });
await sleep(1800);

mark('caption', { text: 'Open another by name, and the grid makes room' });
await shellClick('#add');
const picker = await Page.open((target) => target.url.endsWith('/shell/picker.html'), { timeout: 10000 });
await picker.send('Emulation.setFocusEmulationEnabled', { enabled: true });
await sleep(900);
await picker.type('lum', { perKey: 140 });
await sleep(1100);
// Key down only: Enter opens the row and closes the picker, so its key up would never be answered.
await picker.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, { timeout: 3000 })
  .catch(() => {});
mark('fast', { seconds: 1.4 });
tiles.lumen = await tile('lumen');
await loaded(tiles.lumen);
await sleep(800);
mark('normal');
await sleep(2200);

// Last, so nothing after it can bring a panel back: in the first cut they reopened by the
// maximize beat, which no single step of it reproduces on its own.
mark('caption', { text: 'The panel, in every project at once' });
await shellClick('.part[data-part="panel"]');
await sleep(2800);
await shellClick('.part[data-part="panel"]');
await sleep(1500);
const open = [];
for (const name of ALL) {
  if (!await tiles[name].eval(`document.querySelector('.monaco-workbench').classList.contains('nopanel')`)) open.push(name);
}
if (open.length) console.log('panels still open after the second press:', open.join(', '));
await sleep(500);
mark('end');

if (recorder) {
  recorder.kill('SIGINT');
  await once(recorder, 'exit');
}
fs.writeFileSync(`${RAW}${NAME}.json`, JSON.stringify({ firstWall, window: [1600, 900], marks, chimes: [] }, null, 2));
console.log('wrote', `${RAW}${NAME}.json`);
process.exit(0);
