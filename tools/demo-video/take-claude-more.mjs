// The CLI in a tile's terminal lighting the same ring the extension does, a link in a chat opening
// an image, and the end card. Filmed after take-claude.mjs, whose grid it keeps; its chat is fresh.
import fs from 'node:fs';

import { CTRL, sleep, waitFor } from './cdp.mjs';
import { COMPOSER, SEND, clickIn, dismissNotices, ready, rectIn, states, typeInto } from './claude.mjs';
import { WINDOW, framing, take } from './take.mjs';
import { ACTIVITY, CODE, HOME } from './world.mjs';

const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
// A PNG, which the text editor refuses: an SVG is text, and would open as its source.
const IMAGE = 'docs/plant-card.png';
const LINK = `[...doc.querySelectorAll('a, [role="link"], button')].filter((el) => el.textContent.includes('plant-card.png')).pop()`;
const stateOf = (name) => states(ACTIVITY, CODE)[name] || new Set();

const t = await take(import.meta.url);

// The stage: the Claude take's grid, its sessions done, orbit already trusted by the CLI (a first
// run in a folder stops on a question), a fresh chat in fern and a fresh shell in orbit: in one a
// previous CLI was stopped in, an interactive start prints a stray character and quits.
const config = JSON.parse(fs.readFileSync(`${HOME}/.claude.json`, 'utf8'));
config.projects = { ...config.projects, [`${CODE}orbit`]: { ...config.projects?.[`${CODE}orbit`], hasTrustDialogAccepted: true } };
fs.writeFileSync(`${HOME}/.claude.json`, `${JSON.stringify(config, null, 2)}\n`);
await t.call('mode:set', { mode: 'grid' });
await t.call('project:maximize', { maximized: false });
for (const name of FOUR) await t.call('project:open', { folder: CODE + name });
for (const [index, name] of FOUR.entries()) await t.call('project:move', { folder: CODE + name, index });
const order = await t.openOrder();
if (order.join() !== FOUR.join()) throw new Error(`tiles are in the order ${order.join(', ')}`);
await t.call('layout:set', { part: 'panel', visible: false });
const tiles = {};
for (const name of FOUR) tiles[name] = await t.tile(name);
await waitFor(async () => !FOUR.some((name) => stateOf(name).has('working') || stateOf(name).has('attention')), { timeout: 240000, every: 500 });
await t.quickOpen(tiles.orbit, '>Terminal: Kill All Terminals');
await t.quickOpen(tiles.fern, '>View: Close All Editors');
await t.quickOpen(tiles.fern, 'src/components/PlantCard.tsx');
await t.quickOpen(tiles.fern, '>Claude Code: Open in New Tab');
await waitFor(() => ready(tiles.fern), { timeout: 60000 });
await sleep(1500);
await dismissNotices(tiles.fern);
// Sessions closed above leave markers the app already ignores; the take starts from none.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
await t.call('project:focus', { folder: `${CODE}atlas` });
const rects = await t.grounds();
const badges = { orbit: await t.badge(tiles.orbit, rects.orbit), fern: await t.badge(tiles.fern, rects.fern) };
await sleep(2500);

await t.record();

// The CLI, in orbit's own terminal.
t.mark('camera', { ...framing(rects.orbit), ease: 0.8 });
let line = t.say('The Claude CLI works too: the same hooks light the same ring.');
await sleep(700);
await t.tileClick(tiles.orbit, rects.orbit, Math.round(rects.orbit.width * 0.6), 200);
await sleep(250);
await tiles.orbit.key('`', CTRL);
await waitFor(() => tiles.orbit.rect('.part.panel .terminal-wrapper'), { timeout: 15000 });
await sleep(1200);
const terminal = await tiles.orbit.rect('.part.panel .terminal-wrapper');
await t.tileClick(tiles.orbit, rects.orbit, Math.round(terminal.x + 140), Math.round(terminal.y + terminal.height / 2));
await sleep(300);
await tiles.orbit.type('claude "Summarize README.md in one sentence"', { perKey: 35 });
await sleep(250);
await tiles.orbit.key('Enter');
await line;
await waitFor(async () => stateOf('orbit').has('working'), { timeout: 60000, every: 200 });
t.mark('label', { id: 'orbit', text: 'working', ...badges.orbit });
await sleep(1500);
t.mark('fast', { seconds: 1.0 });
await waitFor(async () => stateOf('orbit').has('finished') && !stateOf('orbit').has('working'), { timeout: 180000, every: 200 });
t.mark('normal');
t.mark('label', { id: 'orbit', text: 'done', ...badges.orbit });
await sleep(1800);
t.mark('labels-off');

// A link in the chat, to an image, opening it.
t.mark('camera', { ...framing(rects.fern), ease: 0.8 });
line = t.say('And a link in a reply opens images, sound and video right in the editor.');
await sleep(600);
const composer = await rectIn(tiles.fern, COMPOSER);
t.mark('click', { x: Math.round(rects.fern.x + composer.x), y: Math.round(rects.fern.y + composer.y) });
await tiles.fern.click(composer.x, composer.y);
await typeInto(tiles.fern, `Reply with only a markdown link to ${IMAGE}, nothing else.`, { words: true, perKey: 70 });
await sleep(200);
const send = await rectIn(tiles.fern, SEND);
t.mark('click', { x: Math.round(rects.fern.x + send.x), y: Math.round(rects.fern.y + send.y) });
await clickIn(tiles.fern, SEND);
await line;
t.mark('fast', { seconds: 1.0 });
await waitFor(() => rectIn(tiles.fern, LINK), { timeout: 180000, every: 300 });
await sleep(600);
t.mark('normal');
await sleep(500);
const link = await rectIn(tiles.fern, LINK);
t.mark('click', { x: Math.round(rects.fern.x + link.x), y: Math.round(rects.fern.y + link.y) });
await clickIn(tiles.fern, LINK);
await sleep(2600);

t.mark('camera', { x: 0, y: 0, w: WINDOW.width, ease: 0.8 });
await t.say('Every project, and every agent, in one window.');
await sleep(1200);
await t.finish();

// Leave the CLI, off camera, by taking its terminal with it.
await t.quickOpen(tiles.orbit, '>Terminal: Kill All Terminals');
process.exit(0);
