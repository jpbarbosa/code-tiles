// A take's marks, turned into what compose reads: which stretches play and how fast, where the
// camera and the cursor go, what the captions, labels and keycaps say, and when the buzz sounds.
// Source times are seconds from the take's first frame. --part leaves the end card off, for a
// render that tools/join.mjs will put in the middle of a longer one.
// usage: node build.mjs <name> [--part]
import fs from 'node:fs';

import { WORK } from './world.mjs';

const NAME = process.argv[2];
const PART = process.argv.includes('--part');
const take = JSON.parse(fs.readFileSync(`${WORK}raw/${NAME}.json`, 'utf8'));
const marks = take.marks.map((entry) => ({ ...entry, t: entry.wall - take.firstWall }));
const at = (kind) => marks.find((entry) => entry.kind === kind).t;
const start = at('start');
const end = at('end');

// Everything plays in real time except a fast/normal pair, squeezed to the seconds it asks for.
const segments = [];
let from = start;
let squeeze = null;
for (const entry of marks) {
  if (entry.kind === 'fast') {
    if (entry.t > from) segments.push({ from, to: entry.t, speed: 1 });
    from = entry.t;
    squeeze = entry;
  } else if (entry.kind === 'normal' && squeeze) {
    segments.push({ from, to: entry.t, speed: Math.max(1, (entry.t - from) / (squeeze.seconds ?? 1.5)) });
    from = entry.t;
    squeeze = null;
  }
}
segments.push({ from, to: end, speed: 1 });
const kept = segments.filter((segment) => segment.to - segment.from > 0.01);

const outputOf = (source) => {
  let running = 0;
  for (const segment of kept) {
    if (source < segment.from) return running;
    if (source <= segment.to) return running + (source - segment.from) / segment.speed;
    running += (segment.to - segment.from) / segment.speed;
  }
  return running;
};

const texts = [];
let caption = null;
let title = null;
const labels = new Map();
const close = (text, t) => { if (text) texts.push({ ...text, until: t }); };
for (const entry of marks) {
  const { kind, t } = entry;
  if (kind === 'caption') { close(caption, t); caption = { at: t, text: entry.text }; }
  if (kind === 'caption-off') { close(caption, t); caption = null; }
  if (kind === 'title') { title = { at: t, text: entry.text, sub: entry.sub, style: 'title' }; }
  if (kind === 'title-off') { close(title, t); title = null; }
  if (kind === 'label') {
    close(labels.get(entry.id), t);
    labels.set(entry.id, { at: t, text: entry.text, style: 'label', x: entry.x, y: entry.y });
  }
  if (kind === 'labels-off') { for (const label of labels.values()) close(label, t); labels.clear(); }
  if (kind === 'keys') texts.push({ at: t, until: t + (entry.hold ?? 1.4), text: entry.text, style: 'keys' });
}
close(caption, end);
close(title, end);
for (const label of labels.values()) close(label, end);

// A camera mark is where the move STARTS; compose eases each key in over the time before it.
const camera = marks.filter((entry) => entry.kind === 'camera')
  .map((entry) => ({ t: entry.t + (entry.ease ?? 0.9), x: entry.x, y: entry.y, w: entry.w, ease: entry.ease ?? 0.9 }));

const cursor = marks.filter((entry) => entry.x !== undefined && ['click', 'move', 'drag-start', 'drag-end'].includes(entry.kind))
  .map((entry) => ({ t: entry.t, x: entry.x, y: entry.y, ...(entry.kind === 'click' || entry.kind === 'drag-start' ? { click: true } : {}) }));

const chimes = (take.chimes || []).map((wall) => wall - take.firstWall).filter((t) => t >= start && t <= end);

const timeline = {
  source: `raw/${NAME}.mov`,
  output: PART ? `out/part-${NAME}.mp4` : `out/code-tiles-${NAME}.mp4`,
  window: take.window,
  fps: 60,
  segments: kept,
  texts,
  cursor,
  camera,
  audio: { file: new URL('../../src/shell/buzz.wav', import.meta.url).pathname, at: chimes.map(outputOf), volume: 0.7 },
  outro: PART ? null : {
    duration: 3.6,
    title: 'Code Tiles',
    subtitle: 'See which project needs you, without cycling through windows.',
    icon: new URL('../../assets/icon.png', import.meta.url).pathname,
  },
};
const file = `${WORK}timeline-${NAME}${PART ? '-part' : ''}.json`;
fs.writeFileSync(file, `${JSON.stringify(timeline, null, 2)}\n`);

console.log(`${file}: video ${outputOf(end).toFixed(1)} s${PART ? '' : ` + outro ${timeline.outro.duration} s`}, ${chimes.length} buzz(es) at ${timeline.audio.at.map((t) => t.toFixed(1)).join(', ')}`);
for (const entry of marks.filter((mark) => !['click', 'drag-start', 'drag-end', 'move'].includes(mark.kind))) {
  console.log(outputOf(entry.t).toFixed(2).padStart(7), entry.kind.padEnd(11), entry.text || '');
}
