// The Claude Code take: real sessions in three tiles, driven over CDP while ctdemo records. Every
// beat is logged as a mark - camera, caption, label, keys, click, fast/normal - which tools/build.mjs
// turns into the cut. Waits are on what Claude actually does, read off the hook markers, never on a
// guess at how long it takes. usage: node take-claude.mjs [name] [--dry]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';

import { Page, sleep, waitFor } from './cdp.mjs';
import { COMPOSER, SEND, button, clickIn, pasteImage, rectIn, selector, states, typeInto } from './claude.mjs';
import { ACTIVITY, CODE, WORK } from './world.mjs';

const DRY = process.argv.includes('--dry');
const NAME = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'claude';
const RAW = `${WORK}raw/`;
const CHIMES = `${WORK}data/chimes.log`;
const SCREENSHOT = `${WORK}assets/fern-screenshot.png`;
const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];

const PROMPTS = {
  orbit: 'Read src/rate-limit.ts and test/rate-limit.test.ts, then list the edge cases the tests miss.',
  tidepool: 'Add a docstring to fill_gaps in tidepool/transform.py. Before editing, use AskUserQuestion to ask me'
    + ' whether it should mention the 6-minute default, with the options "Mention it" and "Leave it out".',
  fern: 'Make this Water button bigger and green.',
};

// 16:9 regions of the 1600x900 window, and where each badge's label sits, for an even 2x2.
const CAMERA = {
  whole: { x: 0, y: 0, w: 1600 },
  orbit: { x: 0, y: 20, w: 860 },
  fern: { x: 740, y: 20, w: 860 },
  tidepool: { x: 0, y: 416, w: 860 },
  strip: { x: 0, y: 0, w: 700 },
  usage: { x: 980, y: 0, w: 620 },
};
const BADGE = { orbit: { x: 56, y: 58 }, fern: { x: 852, y: 58 }, tidepool: { x: 56, y: 486 }, atlas: { x: 852, y: 486 } };

const marks = [];
function mark(kind, data = {}) {
  marks.push({ kind, wall: Date.now() / 1000, ...data });
  console.log(`${(Date.now() / 1000 - (firstWall || Date.now() / 1000)).toFixed(1).padStart(6)} ${kind} ${JSON.stringify(data)}`);
}
const center = (box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });
const stateOf = (name) => states(ACTIVITY, CODE)[name] || new Set();

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const tiles = {};
for (const name of FOUR) {
  const pattern = new RegExp(`/code/${name}(&|$)`);
  tiles[name] = await Page.open((target) => pattern.test(decodeURIComponent(target.url)));
  await tiles[name].send('Emulation.setFocusEmulationEnabled', { enabled: true });
}

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

// Tiles in window points, off the shell's grounds, in open order - or the one on stage in single view.
async function grounds() {
  const boxes = await shell.eval(`[...document.querySelectorAll('#grounds .ground')].map((el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  })`);
  return boxes.length === FOUR.length ? Object.fromEntries(FOUR.map((name, index) => [name, boxes[index]])) : boxes[0];
}

// A point inside a tile's chat, in window coordinates, and the same point in the tile's own.
async function inChat(name, expression, on) {
  const local = await rectIn(tiles[name], expression);
  if (!local) throw new Error(`${name}: nothing at ${expression.slice(0, 80)}`);
  return { x: Math.round(on.x + local.x), y: Math.round(on.y + local.y), local };
}

// A real press, for the clicks that have to move the app's focus: its seam listens for pointerdown.
async function press(name, expression, on) {
  const point = await inChat(name, expression, on);
  mark('click', { x: point.x, y: point.y });
  await tiles[name].click(point.local.x, point.local.y);
  return point;
}

// A click the chat handles itself, where the cursor is drawn and the element is clicked directly.
async function tap(name, expression, on) {
  const point = await inChat(name, expression, on);
  mark('click', { x: point.x, y: point.y });
  await clickIn(tiles[name], expression);
  return point;
}

async function drag(name, on, from, to) {
  const page = tiles[name];
  mark('drag-start', { x: Math.round(on.x + from.x), y: Math.round(on.y + from.y) });
  await page.mouse('mouseMoved', from.x, from.y, { button: 'none' });
  await page.mouse('mousePressed', from.x, from.y, { clickCount: 1, buttons: 1 });
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    const eased = t * t * (3 - 2 * t);
    await page.mouse('mouseMoved', from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased, { buttons: 1 });
    await sleep(28);
  }
  await page.mouse('mouseReleased', to.x, to.y, { clickCount: 1 });
  mark('drag-end', { x: Math.round(on.x + to.x), y: Math.round(on.y + to.y) });
}

async function shellClick(css) {
  const at = center(await shell.rect(css));
  mark('click', at);
  await shell.click(at.x, at.y);
}

// Recording.
fs.mkdirSync(RAW, { recursive: true });
fs.rmSync(CHIMES, { force: true });
let recorder = null;
let firstWall = DRY ? Date.now() / 1000 : null;
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
mark('title', { text: 'Code Tiles + Claude Code', sub: 'What every agent is doing, without opening it.' });
await sleep(2800);
mark('title-off');

// orbit: asked something that takes a while to read and think about.
mark('camera', { ...CAMERA.orbit, ease: 1.0 });
await sleep(1200);
mark('caption', { text: 'Ask Claude in any project' });
await press('orbit', COMPOSER, rects.orbit);
await sleep(300);
await typeInto(tiles.orbit, PROMPTS.orbit, { perKey: 30 });
await sleep(250);
await tap('orbit', SEND, rects.orbit);
await sleep(1600);

// tidepool: asked to ask a question back, which is the "waiting on you" state.
mark('camera', { ...CAMERA.tidepool, ease: 1.0 });
await sleep(1100);
mark('caption', { text: 'and in another, at the same time' });
await press('tidepool', COMPOSER, rects.tidepool);
mark('fast', { seconds: 1.4 });
await typeInto(tiles.tidepool, PROMPTS.tidepool, { perKey: 8 });
mark('normal');
await tap('tidepool', SEND, rects.tidepool);
await sleep(1200);

mark('camera', { ...CAMERA.whole, ease: 1.0 });
mark('caption', { text: 'The ring spins while Claude works' });
mark('label', { id: 'orbit', text: 'working', ...BADGE.orbit });
mark('label', { id: 'tidepool', text: 'working', ...BADGE.tidepool });
await sleep(3000);
mark('fast', { seconds: 1.2 });
await waitFor(async () => stateOf('tidepool').has('attention'), { timeout: 180000, every: 200 });
mark('normal');
mark('label', { id: 'tidepool', text: 'waiting on you', ...BADGE.tidepool });
mark('caption', { text: 'It blinks, and buzzes, when it needs you' });
await sleep(3400);
mark('labels-off');

// Single view: one project on stage, and the chips carry every ring.
await shortcut('⌃ ⌘ 1', 'Project 1');
await sleep(900);
await shortcut('⌃ ⌘ E', 'Single Project');
mark('camera', { ...CAMERA.strip, ease: 0.9 });
mark('caption', { text: 'One project on stage, and every chip still shows its ring' });
await sleep(3200);
await shellClick('.chip[data-folder$="/tidepool"]');
mark('camera', { ...CAMERA.whole, ease: 0.9 });
await sleep(1800);
rects = await grounds();
mark('caption', { text: 'Answer it where it asked, and it gets back to work' });
await tap('tidepool', button('Mention it'), rects);
await sleep(700);
await tap('tidepool', button('Submit answers'), rects);
await waitFor(async () => stateOf('tidepool').has('working'), { timeout: 30000, every: 200 });
await sleep(2000);
await shortcut('⌃ ⌘ G', 'Grid');
await sleep(1200);
rects = await grounds();

// orbit, meanwhile, finishes a turn nobody has read.
mark('caption', { text: 'Done, and not read yet: it breathes' });
mark('fast', { seconds: 1.2 });
await waitFor(async () => stateOf('orbit').has('finished') && !stateOf('orbit').has('working'), { timeout: 240000, every: 200 });
mark('normal');
mark('label', { id: 'orbit', text: 'done', ...BADGE.orbit });
await sleep(3400);
mark('labels-off');

// The plan's usage, from the strip.
mark('camera', { ...CAMERA.usage, ease: 0.9 });
await sleep(1000);
mark('caption', { text: 'Your plan usage, and how far into each window you are' });
await shellClick('#usage');
await sleep(4200);
await shellClick('#usage');
await sleep(600);

// fern: a screenshot pasted, marked up, and sent.
mark('camera', { ...CAMERA.fern, ease: 1.0 });
await sleep(1100);
mark('caption', { text: 'Paste a screenshot, and mark it up before it goes' });
await press('fern', COMPOSER, rects.fern);
await pasteImage(tiles.fern, SCREENSHOT);
await sleep(1600);
await tap('fern', selector('[class*="attachedFilesContainer_"] img'), rects.fern);
await sleep(1400);
await tap('fern', selector('.ct-marks-edit'), rects.fern);
await sleep(1400);
const canvas = await rectIn(tiles.fern, selector('.ct-marks canvas'));
const onImage = (x, y) => ({ x: canvas.left + x * canvas.width / 1200, y: canvas.top + y * canvas.height / 760 });
await drag('fern', rects.fern, onImage(380, 560), onImage(180, 634));
await sleep(500);
await tap('fern', selector('.ct-marks button[title="Box"]'), rects.fern);
await sleep(300);
await drag('fern', rects.fern, onImage(70, 606), onImage(182, 668));
await sleep(700);
await tap('fern', selector('.ct-marks-done'), rects.fern);
await sleep(1400);
await typeInto(tiles.fern, PROMPTS.fern, { perKey: 34 });
await sleep(300);
await tap('fern', SEND, rects.fern);
await sleep(2200);

mark('camera', { ...CAMERA.whole, ease: 1.0 });
mark('caption', { text: 'Back on the grid, every agent\'s state at a glance' });
for (const name of FOUR) {
  const now = stateOf(name);
  const text = now.has('working') ? 'working' : now.has('attention') ? 'waiting on you' : now.has('finished') ? 'done' : null;
  if (text) mark('label', { id: name, text, ...BADGE[name] });
}
await sleep(3600);
mark('end');

if (recorder) {
  recorder.kill('SIGINT');
  await once(recorder, 'exit');
}
const chimes = fs.existsSync(CHIMES) ? fs.readFileSync(CHIMES, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
fs.writeFileSync(`${RAW}${NAME}.json`, JSON.stringify({ firstWall, window: [1600, 900], marks, chimes }, null, 2));
console.log('wrote', `${RAW}${NAME}.json`, `${chimes.length} chime(s)`);
process.exit(0);
