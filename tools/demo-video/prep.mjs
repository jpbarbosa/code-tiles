// One pass through every project before the take: VS Code restores a workspace's editors and
// panel when it is reopened, so each tile comes back with its files open and nothing to dismiss.
import { CTRL, META, Page, sleep, waitFor } from './cdp.mjs';

import { CODE } from './world.mjs';
import { doNotDisturb } from './dnd.mjs';
const PROJECTS = {
  orbit: { files: ['test/rate-limit.test.ts', 'src/rate-limit.ts'], terminal: true },
  fern: { files: ['src/hooks/useWatering.ts', 'src/components/PlantCard.tsx'] },
  tidepool: { files: ['tidepool/transform.py', 'tidepool/ingest.py'] },
  atlas: { files: ['astro.config.mjs', 'src/content/docs/getting-started.md'] },
  lumen: { files: ['src/main.rs', 'src/render.rs'] },
};
const only = process.argv.slice(2);

const shell = await Page.open((target) => target.url.startsWith('file://') && target.url.endsWith('/shell/index.html'));
for (const name of Object.keys(PROJECTS)) {
  await shell.eval(`window.ct.call('project:open', { folder: ${JSON.stringify(CODE + name)} })`);
}
shell.close();

async function quickOpen(tile, text) {
  await tile.key('p', META);
  await sleep(500);
  await tile.type(text, { perKey: 8 });
  await sleep(900);
  await tile.key('Enter');
  await sleep(900);
}

for (const [name, setup] of Object.entries(PROJECTS)) {
  if (only.length && !only.includes(name)) continue;
  const tile = await Page.open((target) => decodeURIComponent(target.url).includes(`/code/${name}`), { timeout: 120000 });
  await tile.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await waitFor(() => tile.eval(`Boolean(document.querySelector('.monaco-workbench .part.editor'))`), { timeout: 120000 });
  await sleep(4000);
  await doNotDisturb(tile);
  await quickOpen(tile, '>View: Close All Editors');
  for (const file of setup.files) await quickOpen(tile, file);
  if (setup.terminal) {
    await tile.key('`', CTRL);
    await sleep(2000);
  }
  await quickOpen(tile, '>Notifications: Clear All Notifications');
  // A window a strip press missed keeps the side bar the Claude stage shut; its own toggle brings it back.
  if (await tile.eval(`document.querySelector('.monaco-workbench').classList.contains('nosidebar')`)) await tile.key('b', META);
  console.log(name, await tile.eval(`[...document.querySelectorAll('.part.editor .tab .label-name')].map((el) => el.textContent).join(', ')`));
  tile.close();
}
