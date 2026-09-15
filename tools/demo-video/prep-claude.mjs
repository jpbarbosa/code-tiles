// The stage for the Claude Code take, not filmed: four projects in an even grid, side bars and
// panels shut in every project at once, and a fresh Claude session open as a tab in three of them.
import fs from 'node:fs';

import { META, Page, sleep, waitFor } from './cdp.mjs';
import { dismissNotices, ready } from './claude.mjs';
import { ACTIVITY, CODE } from './world.mjs';

const FOUR = ['orbit', 'fern', 'tidepool', 'atlas'];
const CHATS = { orbit: 'src/rate-limit.ts', fern: 'src/components/PlantCard.tsx', tidepool: 'tidepool/transform.py' };

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const call = (type, payload = {}) => shell.eval(`window.ct.call(${JSON.stringify(type)}, ${JSON.stringify(payload)})`);

await call('mode:set', { mode: 'grid' });
await call('project:maximize', { maximized: false });
for (const name of ['lumen', 'ledger']) await call('project:close', { folder: CODE + name });
for (const name of FOUR) await call('project:open', { folder: CODE + name });
// The basics take swaps two tiles, and the grid keeps its order: put it back, or the take's
// cameras and labels frame the wrong projects.
for (const [index, name] of FOUR.entries()) await call('project:move', { folder: CODE + name, index });
const order = await shell.eval(`[...document.querySelectorAll('#chips .chip')].map((chip) => chip.dataset.folder.split('/').pop())`);
if (order.join() !== FOUR.join()) throw new Error(`tiles are in the order ${order.join(', ')}`);
await call('grid:reset', {});
await call('layout:set', { part: 'sideBar', visible: false });
await call('layout:set', { part: 'panel', visible: false });
await call('layout:set', { part: 'secondarySideBar', visible: false });

async function quickOpen(tile, text) {
  await tile.key('p', META);
  await sleep(500);
  await tile.type(text, { perKey: 8 });
  await sleep(1000);
  await tile.key('Enter');
  await sleep(1000);
}

for (const [name, file] of Object.entries(CHATS)) {
  const pattern = new RegExp(`/code/${name}(&|$)`);
  const tile = await Page.open((target) => pattern.test(decodeURIComponent(target.url)), { timeout: 90000 });
  await tile.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await waitFor(() => tile.eval(`Boolean(document.querySelector('.monaco-workbench .part.editor'))`), { timeout: 90000 });
  await sleep(2500);
  await quickOpen(tile, '>View: Close All Editors');
  await quickOpen(tile, file);
  await quickOpen(tile, '>Claude Code: Open in New Tab');
  await waitFor(() => ready(tile), { timeout: 60000 });
  await sleep(1500);
  await dismissNotices(tile);
  console.log(name, 'chat ready');
  tile.close();
}

// A window that did not take the strip's press shuts its own side bar, so the grid reads as one.
for (const name of FOUR) {
  const pattern = new RegExp(`/code/${name}(&|$)`);
  const tile = await Page.open((target) => pattern.test(decodeURIComponent(target.url)));
  const open = await tile.eval(`!document.querySelector('.monaco-workbench').classList.contains('nosidebar')`);
  if (open) {
    await tile.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await tile.key('b', META);
    console.log(name, 'side bar shut by its own toggle');
  }
  tile.close();
}

// Sessions closed above leave markers the app already ignores; the take starts from none.
for (const file of fs.readdirSync(ACTIVITY)) fs.rmSync(ACTIVITY + file, { force: true });
await call('project:focus', { folder: `${CODE}atlas` });
shell.close();
process.exit(0);
