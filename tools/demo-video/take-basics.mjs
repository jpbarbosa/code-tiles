// The basics, quickly: live VS Code tiles, the colour a project takes from its favicon and how to
// change it, the keyboard, single view and its chips, a gutter, the picker and a swap. Stages itself.
import fs from 'node:fs';

import { META, Page, sleep } from './cdp.mjs';
import { doNotDisturb } from './dnd.mjs';
import { center, framing, take } from './take.mjs';
import { ACTIVITY, CODE } from './world.mjs';

const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
const FILES = {
  orbit: ['test/rate-limit.test.ts', 'src/rate-limit.ts'],
  fern: ['src/hooks/useWatering.ts', 'src/components/PlantCard.tsx'],
  tidepool: ['tidepool/transform.py', 'tidepool/ingest.py'],
  atlas: ['astro.config.mjs', 'src/content/docs/getting-started.md'],
};

const t = await take(import.meta.url);

// The stage, off camera: four projects in an even grid on their files, side bars in, panels out, no
// Claude session, and lumen forgotten, so the picker offers it as a folder on disk.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
await t.call('mode:set', { mode: 'grid' });
await t.call('project:maximize', { maximized: false });
for (const name of ['lumen', 'ledger']) await t.call('project:close', { folder: CODE + name });
await t.call('project:forget', { folder: `${CODE}lumen` });
for (const name of FOUR) await t.call('project:open', { folder: CODE + name });
for (const [index, name] of FOUR.entries()) await t.call('project:move', { folder: CODE + name, index });
await t.call('grid:reset', {});
await t.call('layout:set', { part: 'sideBar', visible: true });
await t.call('layout:set', { part: 'panel', visible: false });
const tiles = {};
for (const name of FOUR) tiles[name] = await t.tile(name);
await Promise.all(FOUR.map((name) => t.loaded(tiles[name])));
for (const [name, files] of Object.entries(FILES)) {
  const page = tiles[name];
  await doNotDisturb(page);
  await t.quickOpen(page, '>View: Close All Editors');
  for (const file of files) await t.quickOpen(page, file);
  await t.quickOpen(page, '>Notifications: Clear All Notifications');
  // A window the strip's press missed keeps its side bar shut; its own toggle brings it back.
  if (await page.eval(`document.querySelector('.monaco-workbench').classList.contains('nosidebar')`)) await page.key('b', META);
}
const order = await t.openOrder();
if (order.join() !== FOUR.join()) throw new Error(`tiles are in the order ${order.join(', ')}`);
await t.call('project:focus', { folder: `${CODE}orbit` });
await sleep(2500);

await t.record();
let rects = await t.grounds();
t.mark('title', { text: 'Code Tiles', sub: 'Several VS Code projects, live, in one window.' });
await t.say("Code Tiles puts every project you're working on in one window.");
t.mark('title-off');

let line = t.say("Each tile is a real VS Code, and the one you're in wears its colour.");
await sleep(1000);
await t.tileClick(tiles.fern, rects.fern, Math.round(rects.fern.width * 0.6), 280);
await sleep(1400);
await t.tileClick(tiles.tidepool, rects.tidepool, Math.round(rects.tidepool.width * 0.6), 280);
await line;

// The favicon the colour comes from, big enough to see.
t.mark('camera', { ...framing(rects.tidepool), ease: 0.8 });
await t.say("The colour comes from the project's own favicon.");
await sleep(600);
t.mark('camera', { x: 0, y: 0, w: 1920, ease: 0.7 });
await sleep(700);

line = t.say('Jump to any of them from the keyboard,');
await sleep(300);
await t.shortcut('⌃ ⌘ 1', 'Project 1');
await sleep(1500);
await t.shortcut('⌃ ⌘ 4', 'Project 4');
await line;

line = t.say('or put one on stage, with a chip for each of the others.');
await t.shortcut('⌃ ⌘ E', 'Single Project');
t.mark('camera', { x: 0, y: 0, w: 1120, ease: 0.7 });
await sleep(1500);
await t.shellClick('.chip[data-folder$="/fern"]');
await line;
await sleep(400);
t.mark('camera', { x: 0, y: 0, w: 1920, ease: 0.7 });
await t.shortcut('⌃ ⌘ G', 'Grid');
await sleep(1200);

line = t.say('Drag a gutter to resize them,');
const splitter = await t.shell.eval(`(() => {
  const { x, y, width, height } = [...document.querySelectorAll('#splitters .splitter')].find((el) => el.dataset.axis === 'cols').getBoundingClientRect();
  return { x, y, width, height };
})()`);
const from = center(splitter);
const to = { x: from.x + 180, y: from.y };
t.mark('drag-start', from);
await t.shell.mouse('mouseMoved', from.x, from.y, { button: 'none' });
await t.shell.mouse('mousePressed', from.x, from.y, { clickCount: 1, buttons: 1 });
for (let step = 1; step <= 24; step += 1) {
  const k = step / 24;
  await t.shell.mouse('mouseMoved', Math.round(from.x + (to.x - from.x) * k * k * (3 - 2 * k)), from.y, { buttons: 1 });
  await sleep(26);
}
await t.shell.mouse('mouseReleased', to.x, to.y, { clickCount: 1 });
t.mark('drag-end', to);
await line;

line = t.say('open another by name, and the grid makes room,');
await t.shellClick('#add');
const picker = await Page.open((target) => target.url.endsWith('/shell/picker.html'), { timeout: 10000 });
await picker.send('Emulation.setFocusEmulationEnabled', { enabled: true });
await sleep(600);
await picker.type('lum', { perKey: 110 });
await sleep(700);
// Key down only: Enter opens the row and closes the picker, so its key up would never be answered.
await picker.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, { timeout: 3000 })
  .catch(() => {});
await line;
t.mark('fast', { seconds: 0.8 });
tiles.lumen = await t.tile('lumen');
await t.loaded(tiles.lumen);
await sleep(500);
t.mark('normal');
await sleep(500);

// Main follows the cursor itself while a tile is dragged by its icon, and the wrapper hands it
// the take's cursor for as long as the gesture lasts.
rects = await t.grounds();
line = t.say("or swap two by dragging one's icon onto the other.");
const content = JSON.parse(await t.main(`JSON.stringify(globalThis.demoBounds('/shell/index.html'))`));
const toScreen = (point) => ({ x: Math.round(content.x + point.x), y: Math.round(content.y + point.y) });
const handle = center(await tiles.orbit.rect('.part.activitybar .menubar .menubar-menu-button'));
const grab = { x: Math.round(rects.orbit.x + handle.x), y: Math.round(rects.orbit.y + handle.y) };
const drop = center(rects.fern);
await sleep(600);
await t.main(`globalThis.demoFocused = true; globalThis.demoCursor = ${JSON.stringify(toScreen(grab))}; true`);
t.mark('drag-start', grab);
await tiles.orbit.mouse('mouseMoved', handle.x, handle.y, { button: 'none' });
await tiles.orbit.mouse('mousePressed', handle.x, handle.y, { clickCount: 1, buttons: 1 });
for (let step = 1; step <= 30; step += 1) {
  const k = step / 30;
  const eased = k * k * (3 - 2 * k);
  const point = { x: grab.x + (drop.x - grab.x) * eased, y: grab.y + (drop.y - grab.y) * eased };
  await t.main(`globalThis.demoCursor = ${JSON.stringify(toScreen(point))}; true`);
  await tiles.orbit.mouse('mouseMoved', handle.x + point.x - grab.x, handle.y + point.y - grab.y, { buttons: 1 });
  await sleep(24);
}
await tiles.orbit.mouse('mouseReleased', handle.x + drop.x - grab.x, handle.y + drop.y - grab.y, { clickCount: 1 });
t.mark('drag-end', drop);
await t.main('globalThis.demoCursor = undefined; globalThis.demoFocused = undefined; true');
await line;
await sleep(600);

// A project's own menu, on the one opened last. Native, so the wrapper opens it on this window
// rather than at the real mouse, and the choice is made through it once it has been seen.
rects = await t.grounds();
t.mark('camera', { ...framing(rects.lumen), ease: 0.8 });
line = t.say("Right-click a project's icon to give it another colour, or an icon of your own.");
const badge = center(await tiles.lumen.rect('.part.activitybar .menubar .menubar-menu-button'));
const onBadge = { x: Math.round(rects.lumen.x + badge.x), y: Math.round(rects.lumen.y + badge.y) };
await t.main(`globalThis.demoMenuAt = ${JSON.stringify({ x: onBadge.x + 8, y: onBadge.y + 12 })}; true`);
t.mark('click', onBadge);
await tiles.lumen.mouse('mouseMoved', badge.x, badge.y, { button: 'none' });
await tiles.lumen.mouse('mousePressed', badge.x, badge.y, { button: 'right', clickCount: 1, buttons: 2 });
await tiles.lumen.mouse('mouseReleased', badge.x, badge.y, { button: 'right', clickCount: 1 });
await sleep(2200);
const colour = await t.main(`(() => {
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
await line;
await sleep(1600);
t.mark('camera', { x: 0, y: 0, w: 1920, ease: 0.8 });
await sleep(1500);

await t.finish();

// Put lumen's own colour back for the next take, off camera, through the same menu.
await t.main(`globalThis.demoMenuAt = { x: 40, y: 60 }; true`);
await t.call('project:menu', { folder: `${CODE}lumen` });
await sleep(800);
await t.main(`(() => { const menu = globalThis.demoPopup; menu.closePopup();
  menu.items.find((item) => item.label === 'Color').submenu.items.find((item) => item.label === 'Automatic').click(); return true; })()`)
  .catch((error) => console.log('could not restore lumen colour:', error.message));
process.exit(0);
