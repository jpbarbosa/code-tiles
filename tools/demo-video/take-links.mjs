// A link in a chat opening an image, and the end card. Filmed after take-claude.mjs, whose grid it
// keeps; its chat is a fresh one, so nothing of the last answer is on screen.
import fs from 'node:fs';

import { META, sleep, waitFor } from './cdp.mjs';
import { COMPOSER, SEND, clickIn, dismissNotices, ready, rectIn, states, typeInto } from './claude.mjs';
import { WINDOW, framing, take } from './take.mjs';
import { ACTIVITY, CODE } from './world.mjs';

const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
// A PNG, which the text editor refuses: an SVG is text, and would open as its source.
const IMAGE = 'docs/plant-card.png';
const LINK = `[...doc.querySelectorAll('a, [role="link"], button')].filter((el) => el.textContent.includes('plant-card.png')).pop()`;
const stateOf = (name) => states(ACTIVITY, CODE)[name] || new Set();

const t = await take(import.meta.url);

// The stage the Claude take ends on, which the basics take has since left open, resized and with
// its side bars out: four projects in an even grid, side bars in, sessions done, a fresh chat in fern.
await t.call('mode:set', { mode: 'grid' });
await t.call('project:maximize', { maximized: false });
for (const name of ['lumen', 'ledger']) await t.call('project:close', { folder: CODE + name });
for (const name of FOUR) await t.call('project:open', { folder: CODE + name });
for (const [index, name] of FOUR.entries()) await t.call('project:move', { folder: CODE + name, index });
const order = await t.openOrder();
if (order.join() !== FOUR.join()) throw new Error(`tiles are in the order ${order.join(', ')}`);
await t.call('grid:reset', {});
await t.call('layout:set', { part: 'sideBar', visible: false });
await t.call('layout:set', { part: 'panel', visible: false });
const tiles = {};
for (const name of FOUR) tiles[name] = await t.tile(name);
// A window that did not take the strip's press shuts its own side bar, so the grid reads as one.
for (const name of FOUR) {
  if (await tiles[name].eval(`!document.querySelector('.monaco-workbench').classList.contains('nosidebar')`)) await tiles[name].key('b', META);
}
await waitFor(async () => !FOUR.some((name) => stateOf(name).has('working') || stateOf(name).has('attention')), { timeout: 240000, every: 500 });
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
await sleep(2500);

await t.record();

t.mark('camera', { ...framing(rects.fern), ease: 0.8 });
const line = t.say('And a link in a reply opens images, sound and video right in the editor.');
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
process.exit(0);
