// One timeline on every core. Compose draws frames one at a time in one process, so the video is
// cut into equal stretches, each drawn by its own compose, and the pieces are joined without
// re-encoding. usage: node render.mjs <timeline.json> [jobs]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WORK } from './world.mjs';

if (!process.argv[2]) {
  console.error('usage: node render.mjs <timeline.json> [jobs]');
  process.exit(1);
}
const file = path.resolve(process.argv[2]);
const timeline = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = path.dirname(file);
const out = path.resolve(base, timeline.output);
// Two cores left for everything else, and never a chunk so short that starting a process dominates.
const jobs = Number(process.argv[3]) || Math.max(1, Math.min(8, os.availableParallelism() - 2, Math.floor(timeline.duration / 4)));

const compose = (from, to, target) => new Promise((resolve, reject) => {
  const child = spawn(`${WORK}bin/compose`, [file, '--range', String(from), String(to), target], { stdio: ['ignore', 'ignore', 'inherit'] });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`compose ${from.toFixed(1)}-${to.toFixed(1)} exited ${code}`))));
});

const started = Date.now();
if (jobs < 2) {
  await compose(0, timeline.duration, out);
} else {
  const chunks = Array.from({ length: jobs }, (_, index) => ({
    from: (timeline.duration * index) / jobs,
    to: (timeline.duration * (index + 1)) / jobs,
    file: `${out.replace(/\.mp4$/, '')}.chunk${index}.mp4`,
  }));
  await Promise.all(chunks.map((chunk) => compose(chunk.from, chunk.to, chunk.file)));
  const list = `${out.replace(/\.mp4$/, '')}.chunks.txt`;
  fs.writeFileSync(list, `${chunks.map((chunk) => `file '${chunk.file}'`).join('\n')}\n`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' });
  for (const chunk of chunks) fs.rmSync(chunk.file);
  fs.rmSync(list);
}
console.log(`wrote ${out} (${timeline.duration.toFixed(1)} s on ${jobs} core${jobs === 1 ? '' : 's'}, ${((Date.now() - started) / 1000).toFixed(0)} s)`);
