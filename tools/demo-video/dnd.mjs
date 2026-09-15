// Do Not Disturb in the demo's workbench: the presenter's switch, so no toast lands on a take.
// It is application state rather than a setting, and its only command TOGGLES it - so a marker in
// the data dir says it has been done, and a second run leaves it on. usage: node dnd.mjs
import fs from 'node:fs';

import { META, Page, sleep } from './cdp.mjs';
import { WORK } from './world.mjs';

const MARKER = `${WORK}data/.do-not-disturb`;

export async function doNotDisturb(tile) {
  if (fs.existsSync(MARKER)) return false;
  await tile.key('p', META);
  await sleep(500);
  await tile.type('>Notifications: Toggle Do Not Disturb Mode', { perKey: 8 });
  await sleep(900);
  await tile.key('Enter');
  await sleep(600);
  fs.writeFileSync(MARKER, `${new Date().toISOString()}\n`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tile = await Page.open((target) => target.url.includes('folder='));
  await tile.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  console.log(await doNotDisturb(tile) ? 'do not disturb: on' : 'do not disturb: already on');
  tile.close();
  process.exit(0);
}
