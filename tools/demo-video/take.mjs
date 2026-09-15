// What every take shares: the recorder, the marks build.mjs turns into the cut, the narrator, and
// handles on the app (its shell page, each tile, the main process through its inspector). A take
// reads as its storyboard: `const t = await take(import.meta.url)`, stage off camera, `t.record()`,
// the beats, `t.finish()`. usage: node take-<name>.mjs [name] [--dry]
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { META, Page, sleep, waitFor } from './cdp.mjs';
import { line, spokenLines } from './voice.mjs';
import { WORK } from './world.mjs';

export const WINDOW = { width: 1920, height: 1080 };

export const center = (box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

// A 16:9 camera region around a box, in window points, kept inside the window.
export function framing(box, pad = 40) {
  const w = Math.min(WINDOW.width, Math.round(Math.max(box.width + pad * 2, ((box.height + pad * 2) * 16) / 9)));
  const h = (w * 9) / 16;
  const inside = (value, max) => Math.round(Math.max(0, Math.min(max, value)));
  return { x: inside(box.x + box.width / 2 - w / 2, WINDOW.width - w), y: inside(box.y + box.height / 2 - h / 2, WINDOW.height - h), w };
}

// Bounded, because a native menu held open can keep the main thread from ever answering.
async function inspector() {
  const [target] = await (await fetch('http://127.0.0.1:9335/json/list')).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let next = 0;
  return (expression, timeout = 8000) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => reject(new Error(`main did not answer: ${expression.slice(0, 60)}`)), timeout);
    socket.addEventListener('message', function answer(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', answer);
      clearTimeout(timer);
      resolve(message.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression } }));
  });
}

export async function take(source) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const name = args.find((arg) => !arg.startsWith('--')) || path.basename(new URL(source).pathname, '.mjs').replace(/^take-/, '');
  for (const text of spokenLines(fs.readFileSync(new URL(source), 'utf8'))) line(text);

  const raw = `${WORK}raw/`;
  const chimes = `${WORK}data/chimes.log`;
  const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
  const main = await inspector();
  const marks = [];
  let firstWall = null;
  let recorder = null;

  const t = {
    name,
    shell,
    main,
    call: (type, payload = {}) => shell.eval(`window.ct.call(${JSON.stringify(type)}, ${JSON.stringify(payload)})`),

    mark(kind, data = {}) {
      const wall = Date.now() / 1000;
      marks.push({ kind, wall, ...data });
      const { file, ...shown } = data;
      console.log(`${(wall - (firstWall ?? wall)).toFixed(1).padStart(6)} ${kind} ${JSON.stringify(shown)}`);
    },

    // A narrated line: its caption and its sound start now, and the promise settles as it ends.
    say(text) {
      const { file, seconds } = line(text);
      t.mark('say', { text, file, seconds });
      return sleep(seconds * 1000);
    },

    async record() {
      fs.mkdirSync(raw, { recursive: true });
      fs.rmSync(chimes, { force: true });
      if (dry) {
        firstWall = Date.now() / 1000;
      } else {
        const pid = execFileSync('pgrep', ['-f', 'MacOS/Electron .*demo-main.mjs']).toString().trim().split('\n')[0];
        recorder = spawn(`${WORK}bin/ctdemo`, ['record', pid, `${raw}${name}.mov`, '60']);
        recorder.stdout.on('data', (chunk) => {
          for (const entry of chunk.toString().split('\n').filter(Boolean)) {
            const event = JSON.parse(entry);
            if (event.event === 'first-frame') firstWall = event.wall;
          }
        });
        recorder.stderr.on('data', (chunk) => process.stderr.write(chunk));
        await waitFor(async () => firstWall, { timeout: 15000 });
      }
      t.mark('start');
    },

    async finish() {
      t.mark('end');
      if (recorder) {
        recorder.kill('SIGINT');
        await once(recorder, 'exit');
      }
      const heard = fs.existsSync(chimes) ? fs.readFileSync(chimes, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
      const record = { firstWall, window: [WINDOW.width, WINDOW.height], marks, chimes: heard };
      fs.writeFileSync(`${raw}${name}.json`, JSON.stringify(record, null, 2));
      console.log('wrote', `${raw}${name}.json`, `${heard.length} chime(s)`);
    },

    // Keyboard shortcuts are menu accelerators, which only macOS key handling reaches: the take
    // fires the same item by label and shows the keys as keycaps.
    async shortcut(keys, label) {
      t.mark('keys', { text: keys });
      await main(`globalThis.demoMenu(${JSON.stringify(label)})`);
    },

    // Open projects in the app's own order, read off the chips, which are drawn even while hidden.
    openOrder: () => shell.eval(`[...document.querySelectorAll('#chips .chip')].map((chip) => chip.dataset.folder.split('/').pop())`),

    // Each open project's tile, in window points, by name; in single view, the one on stage.
    async grounds() {
      const names = await t.openOrder();
      const boxes = await shell.eval(`[...document.querySelectorAll('#grounds .ground')].map((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      })`);
      return boxes.length === names.length ? Object.fromEntries(names.map((name, index) => [name, boxes[index]])) : { stage: boxes[0] };
    },

    async tile(project) {
      const pattern = new RegExp(`/code/${project}(&|$)`);
      const page = await Page.open((target) => pattern.test(decodeURIComponent(target.url)), { timeout: 90000 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      return page;
    },
    loaded: (page) => waitFor(() => page.eval(`document.querySelectorAll('.part.editor .tab').length > 0`), { timeout: 90000 }),

    async shellClick(css, options) {
      const at = center(await shell.rect(css));
      t.mark('click', at);
      await shell.click(at.x, at.y, options);
      return at;
    },

    async tileClick(page, rect, x, y) {
      t.mark('click', { x: Math.round(rect.x + x), y: Math.round(rect.y + y) });
      await page.click(x, y);
    },

    async quickOpen(page, text) {
      await page.key('p', META);
      await sleep(500);
      await page.type(text, { perKey: 10 });
      await sleep(900);
      await page.key('Enter');
      await sleep(900);
    },

    // Where a label names a tile: just right of the project's icon, in window points.
    async badge(page, rect) {
      const icon = await page.rect('.part.activitybar .menubar .menubar-menu-button');
      return { x: Math.round(rect.x + icon.x + icon.width + 6), y: Math.round(rect.y + icon.y + icon.height / 2) };
    },
  };
  return t;
}
