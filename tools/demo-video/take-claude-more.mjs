// The last Claude Code beats, filmed after the rest: the CLI in a tile's terminal lighting the same
// ring the extension does, and a link in the chat opening an image. Marks for tools/build.mjs.
// usage: node take-claude-more.mjs [name] [--dry]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';

import { CTRL, META, Page, sleep, waitFor } from './cdp.mjs';
import { COMPOSER, SEND, clickIn, rectIn, ready, states, typeInto } from './claude.mjs';
import { ACTIVITY, CODE, HOME, WORK } from './world.mjs';

const DRY = process.argv.includes('--dry');
const NAME = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'claude-more';
const RAW = `${WORK}raw/`;
const CHIMES = `${WORK}data/chimes.log`;
const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
const CAMERA = { whole: { x: 0, y: 0, w: 1600 }, orbit: { x: 0, y: 20, w: 860 }, fern: { x: 740, y: 20, w: 860 } };
const BADGE = { orbit: { x: 56, y: 58 }, fern: { x: 852, y: 58 } };
const LINK = `[...doc.querySelectorAll('a, [role="link"], button')].filter((el) => el.textContent.includes('favicon.svg')).pop()`;

let firstWall = DRY ? Date.now() / 1000 : null;
const marks = [];
function mark(kind, data = {}) {
  marks.push({ kind, wall: Date.now() / 1000, ...data });
  console.log(`${(Date.now() / 1000 - (firstWall || Date.now() / 1000)).toFixed(1).padStart(6)} ${kind} ${JSON.stringify(data)}`);
}
const center = (box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });
const stateOf = (name) => states(ACTIVITY, CODE)[name] || new Set();

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const call = (type, payload = {}) => shell.eval(`window.ct.call(${JSON.stringify(type)}, ${JSON.stringify(payload)})`);
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
const loaded = (page) => waitFor(() => page.eval(`document.querySelectorAll('.part.editor .tab').length > 0`), { timeout: 90000 });
async function tileClick(page, rect, x, y) {
  mark('click', { x: Math.round(rect.x + x), y: Math.round(rect.y + y) });
  await page.click(x, y);
}
async function quickOpen(page, text) {
  await page.key('p', META);
  await sleep(500);
  await page.type(text, { perKey: 10 });
  await sleep(1000);
  await page.key('Enter');
  await sleep(1000);
}

// The stage: four projects, panels shut, a fresh chat in fern, and orbit already trusted by the
// CLI - its first run in a folder otherwise stops on a question the take has no reason to film.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
const config = JSON.parse(fs.readFileSync(`${HOME}/.claude.json`, 'utf8'));
config.projects = { ...config.projects, [`${CODE}orbit`]: { ...config.projects?.[`${CODE}orbit`], hasTrustDialogAccepted: true } };
fs.writeFileSync(`${HOME}/.claude.json`, `${JSON.stringify(config, null, 2)}\n`);
await call('mode:set', { mode: 'grid' });
await call('project:maximize', { maximized: false });
for (const name of ['lumen', 'ledger']) await call('project:close', { folder: CODE + name });
for (const name of FOUR) await call('project:open', { folder: CODE + name });
// The grid's order is kept, and the grid chapter swaps two tiles by their icons: put it back, or the
// camera and the labels below frame the wrong projects.
for (const [index, name] of FOUR.entries()) await call('project:move', { folder: CODE + name, index });
const order = await openOrder();
if (order.join() !== FOUR.join()) throw new Error(`tiles are in the order ${order.join(', ')}`);
await call('grid:reset', {});
await call('layout:set', { part: 'sideBar', visible: true });
await call('layout:set', { part: 'panel', visible: false });
const tiles = {};
for (const name of FOUR) tiles[name] = await tile(name);
await Promise.all(FOUR.map((name) => loaded(tiles[name])));
// A fresh shell for the CLI: in one a previous CLI was stopped in, an interactive start prints a
// stray character and quits before its first hook.
await quickOpen(tiles.orbit, '>Terminal: Kill All Terminals');
await quickOpen(tiles.fern, '>View: Close All Editors');
await quickOpen(tiles.fern, 'src/components/PlantCard.tsx');
await quickOpen(tiles.fern, '>Claude Code: Open in New Tab');
await waitFor(() => ready(tiles.fern), { timeout: 60000 });
await call('project:focus', { folder: `${CODE}atlas` });
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

// The CLI, in orbit's own terminal.
mark('camera', { ...CAMERA.orbit, ease: 1.0 });
await sleep(1100);
mark('caption', { text: 'The CLI works too: the same hooks light the same ring' });
await tileClick(tiles.orbit, rects.orbit, Math.round(rects.orbit.width * 0.6), 160);
await sleep(300);
await tiles.orbit.key('`', CTRL);
await waitFor(() => tiles.orbit.rect('.part.panel .terminal-wrapper'), { timeout: 15000 });
await sleep(1500);
const terminal = await tiles.orbit.rect('.part.panel .terminal-wrapper');
await tileClick(tiles.orbit, rects.orbit, Math.round(terminal.x + 140), Math.round(terminal.y + terminal.height / 2));
await sleep(400);
await tiles.orbit.type('claude "Summarize README.md in one sentence"', { perKey: 45 });
await sleep(300);
await tiles.orbit.key('Enter');
await waitFor(async () => stateOf('orbit').has('working'), { timeout: 60000, every: 200 });
mark('label', { id: 'orbit', text: 'working', ...BADGE.orbit });
await sleep(1800);
mark('fast', { seconds: 1.2 });
await waitFor(async () => stateOf('orbit').has('finished') && !stateOf('orbit').has('working'), { timeout: 180000, every: 200 });
mark('normal');
mark('label', { id: 'orbit', text: 'done', ...BADGE.orbit });
await sleep(2800);
mark('labels-off');

// A link in the chat, to an image, opening it.
mark('camera', { ...CAMERA.fern, ease: 1.0 });
await sleep(1100);
mark('caption', { text: 'A link in the chat opens images, sound and video too' });
const composer = await rectIn(tiles.fern, COMPOSER);
await tileClick(tiles.fern, rects.fern, Math.round(composer.x), Math.round(composer.y));
await typeInto(tiles.fern, 'Reply with only a markdown link to public/favicon.svg, nothing else.', { perKey: 26 });
await sleep(300);
const send = await rectIn(tiles.fern, SEND);
mark('click', { x: Math.round(rects.fern.x + send.x), y: Math.round(rects.fern.y + send.y) });
await clickIn(tiles.fern, SEND);
mark('fast', { seconds: 1.2 });
await waitFor(() => rectIn(tiles.fern, LINK), { timeout: 180000, every: 300 });
await sleep(800);
mark('normal');
await sleep(900);
const link = await rectIn(tiles.fern, LINK);
mark('click', { x: Math.round(rects.fern.x + link.x), y: Math.round(rects.fern.y + link.y) });
await clickIn(tiles.fern, LINK);
await sleep(3200);

mark('camera', { ...CAMERA.whole, ease: 1.0 });
mark('caption', { text: 'Every project, and every agent, in one window' });
await sleep(3400);
mark('end');

if (recorder) {
  recorder.kill('SIGINT');
  await once(recorder, 'exit');
}
const chimes = fs.existsSync(CHIMES) ? fs.readFileSync(CHIMES, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
fs.writeFileSync(`${RAW}${NAME}.json`, JSON.stringify({ firstWall, window: [1600, 900], marks, chimes }, null, 2));
console.log('wrote', `${RAW}${NAME}.json`, `${chimes.length} chime(s)`);

// Leave the CLI, off camera, by taking its terminal with it.
await quickOpen(tiles.orbit, '>Terminal: Kill All Terminals');
process.exit(0);
