// Code Tiles + Claude Code: real sessions in three tiles, and what each ring says about them. Needs
// prep-claude.mjs first. Waits are on what Claude actually does, read off the hook markers, never
// on a guess at how long it takes.
import { sleep, waitFor } from './cdp.mjs';
import { COMPOSER, SEND, button, clickIn, pasteImage, rectIn, selector, states, typeInto } from './claude.mjs';
import { WINDOW, framing, take } from './take.mjs';
import { ACTIVITY, CODE, WORK } from './world.mjs';

const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
const SCREENSHOT = `${WORK}assets/fern-screenshot.png`;
const PROMPTS = {
  orbit: 'Read src/rate-limit.ts and its tests, then list the edge cases the tests miss.',
  tidepool: 'Add a docstring to fill_gaps in tidepool/transform.py. Before editing, use AskUserQuestion to ask me'
    + ' whether it should mention the 6-minute default, with the options "Mention it" and "Leave it out".',
  fern: 'Make this Water button bigger and green.',
};
const stateOf = (name) => states(ACTIVITY, CODE)[name] || new Set();

const t = await take(import.meta.url);
const tiles = {};
for (const name of FOUR) tiles[name] = await t.tile(name);
let rects = await t.grounds();
const badges = {};
for (const name of FOUR) badges[name] = await t.badge(tiles[name], rects[name]);
const CAMERA = {
  whole: { x: 0, y: 0, w: WINDOW.width },
  orbit: framing(rects.orbit),
  fern: framing(rects.fern),
  tidepool: framing(rects.tidepool),
  strip: { x: 0, y: 0, w: 900 },
  usage: { x: WINDOW.width - 640, y: 0, w: 640 },
};

// A point inside a tile's chat, in window coordinates, and the same point in the tile's own.
async function inChat(name, expression, on) {
  const local = await rectIn(tiles[name], expression);
  if (!local) throw new Error(`${name}: nothing at ${expression.slice(0, 80)}`);
  return { x: Math.round(on.x + local.x), y: Math.round(on.y + local.y), local };
}

// A real press, for the clicks that have to move the app's focus: its seam listens for pointerdown.
async function press(name, expression, on = rects[name]) {
  const point = await inChat(name, expression, on);
  t.mark('click', { x: point.x, y: point.y });
  await tiles[name].click(point.local.x, point.local.y);
}

// A click the chat handles itself: the cursor is drawn there and the element clicked directly.
async function tap(name, expression, on = rects[name]) {
  const point = await inChat(name, expression, on);
  t.mark('click', { x: point.x, y: point.y });
  await clickIn(tiles[name], expression);
}

async function drag(name, from, to) {
  const page = tiles[name];
  const on = rects[name];
  t.mark('drag-start', { x: Math.round(on.x + from.x), y: Math.round(on.y + from.y) });
  await page.mouse('mouseMoved', from.x, from.y, { button: 'none' });
  await page.mouse('mousePressed', from.x, from.y, { clickCount: 1, buttons: 1 });
  for (let step = 1; step <= 20; step += 1) {
    const k = step / 20;
    const eased = k * k * (3 - 2 * k);
    await page.mouse('mouseMoved', from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased, { buttons: 1 });
    await sleep(26);
  }
  await page.mouse('mouseReleased', to.x, to.y, { clickCount: 1 });
  t.mark('drag-end', { x: Math.round(on.x + to.x), y: Math.round(on.y + to.y) });
}

await t.record();
t.mark('title', { text: 'Code Tiles + Claude Code', sub: 'What every agent is doing, without opening it.' });
await t.say('Now add Claude Code, and every session shows up on its own tile.');
t.mark('title-off');

// orbit: asked something that takes a while to read and think about.
t.mark('camera', { ...CAMERA.orbit, ease: 0.8 });
let line = t.say('Ask Claude something in one project,');
await sleep(700);
await press('orbit', COMPOSER);
await typeInto(tiles.orbit, PROMPTS.orbit, { words: true, perKey: 50 });
await tap('orbit', SEND);
await line;

// tidepool: asked to ask a question back, which is the "waiting on you" state.
t.mark('camera', { ...CAMERA.tidepool, ease: 0.8 });
line = t.say('and something else in another.');
await sleep(700);
await press('tidepool', COMPOSER);
await line;
t.mark('fast', { seconds: 0.8 });
await typeInto(tiles.tidepool, PROMPTS.tidepool, { words: true, perKey: 20 });
t.mark('normal');
await tap('tidepool', SEND);
await sleep(600);

// The camera stays on tidepool for its ring's three states: in the whole window a ring is a few
// pixels, and the spin, the blink and the breath all read as one orange outline.
t.mark('label', { id: 'tidepool', text: 'working', ...badges.tidepool });
await t.say('While Claude works, its ring spins.');
await sleep(800);
t.mark('fast', { seconds: 1.0 });
await waitFor(async () => stateOf('tidepool').has('attention'), { timeout: 180000, every: 200 });
t.mark('normal');
t.mark('label', { id: 'tidepool', text: 'waiting on you', ...badges.tidepool });
await sleep(600);
await t.say('When it needs you, the ring blinks, and you hear it.');
await sleep(300);
t.mark('labels-off');

// Single view with another project on stage: tidepool's chip carries its ring.
await t.tileClick(tiles.orbit, rects.orbit, Math.round(rects.orbit.width * 0.5), Math.round(rects.orbit.height * 0.4));
await sleep(500);
await t.shortcut('⌃ ⌘ E', 'Single Project');
t.mark('camera', { ...CAMERA.strip, ease: 0.8 });
await t.say('Even with one project on stage, every chip keeps its ring.');
await t.shellClick('.chip[data-folder$="/tidepool"]');
t.mark('camera', { ...CAMERA.whole, ease: 0.8 });
await sleep(1300);
rects = await t.grounds();
line = t.say('Answer it where it asked, and it gets back to work.');
await tap('tidepool', button('Mention it'), rects.stage);
await sleep(600);
await tap('tidepool', button('Submit answers'), rects.stage);
await line;
await waitFor(async () => stateOf('tidepool').has('working'), { timeout: 30000, every: 200 });
await sleep(600);
await t.shortcut('⌃ ⌘ G', 'Grid');
await sleep(1000);
rects = await t.grounds();

// Both finish a turn nobody has read. The camera shows tidepool's: orbit's orange mark drowns its ring.
t.mark('fast', { seconds: 1.0 });
await waitFor(async () => ['orbit', 'tidepool'].every((name) => stateOf(name).has('finished') && !stateOf(name).has('working')), { timeout: 240000, every: 200 });
t.mark('normal');
t.mark('camera', { ...CAMERA.tidepool, ease: 0.8 });
t.mark('label', { id: 'tidepool', text: 'done', ...badges.tidepool });
await sleep(600);
await t.say('Done, and not read yet: the ring breathes until you look.');
await sleep(300);
t.mark('labels-off');

// The plan's usage, from the strip.
t.mark('camera', { ...CAMERA.usage, ease: 0.8 });
line = t.say("Your plan usage sits in the strip: what's left, and how far into each window you are.");
await sleep(1000);
await t.shellClick('#usage');
await line;
await sleep(800);
await t.shellClick('#usage');
await sleep(400);

// fern: a screenshot pasted, marked up, and sent.
t.mark('camera', { ...CAMERA.fern, ease: 0.8 });
line = t.say('Paste a screenshot, and mark it up before it goes.');
await sleep(600);
await press('fern', COMPOSER);
await pasteImage(tiles.fern, SCREENSHOT);
await sleep(1300);
await tap('fern', selector('[class*="attachedFilesContainer_"] img'));
await sleep(1100);
await tap('fern', selector('.ct-marks-edit'));
await line;
line = t.say('Draw on it, and Claude sees exactly what you mean.');
await sleep(300);
const canvas = await rectIn(tiles.fern, selector('.ct-marks canvas'));
const onImage = (x, y) => ({ x: canvas.left + (x * canvas.width) / 1200, y: canvas.top + (y * canvas.height) / 760 });
await drag('fern', onImage(380, 560), onImage(180, 634));
await sleep(400);
await tap('fern', selector('.ct-marks button[title="Box"]'));
await sleep(300);
await drag('fern', onImage(70, 606), onImage(182, 668));
await sleep(500);
await tap('fern', selector('.ct-marks-done'));
await sleep(1000);
await typeInto(tiles.fern, PROMPTS.fern, { words: true, perKey: 90 });
await sleep(300);
await tap('fern', SEND);
await line;
await sleep(1500);

t.mark('camera', { ...CAMERA.whole, ease: 0.8 });
for (const name of FOUR) {
  const now = stateOf(name);
  const text = now.has('working') ? 'working' : now.has('attention') ? 'waiting on you' : now.has('finished') ? 'done' : null;
  if (text) t.mark('label', { id: name, text, ...badges[name] });
}
await t.say("Every agent's state, at a glance.");
await sleep(1500);

await t.finish();
process.exit(0);
