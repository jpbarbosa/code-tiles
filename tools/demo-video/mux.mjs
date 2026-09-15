// Puts the app's own buzz under a rendered video, at the output times build-timeline worked out from
// the take's chime log: the app played it, muted, at exactly those moments.
// usage: node mux.mjs <timeline.json>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (!process.argv[2]) {
  console.error('usage: node mux.mjs <timeline.json>');
  process.exit(1);
}
const file = path.resolve(process.argv[2]);
const timeline = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = path.dirname(file);
const video = path.resolve(base, timeline.output);
const { file: sound, at = [], volume = 0.7 } = timeline.audio || {};
if (!sound || !at.length) {
  console.log('no sound to add');
  process.exit(0);
}

const silent = video.replace(/\.mp4$/, '.silent.mp4');
// A failed run leaves the render as .silent.mp4 beside a partial video, so start from the render.
if (!fs.existsSync(silent)) fs.renameSync(video, silent);
const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent])
  .toString().trim();
const taps = at.map((_, index) => `[s${index}]`).join('');
// all=1: one delay given to a stereo stream moves the left channel alone, and every buzz then
// also sounds at 0:00 on the right.
const delays = at.map((time, index) => `[s${index}]adelay=delays=${Math.round(time * 1000)}:all=1[d${index}]`).join(';');
const mixed = at.map((_, index) => `[d${index}]`).join('');
// Mixed onto silence as long as the video, never -shortest: with that, ffmpeg 7 ends the whole file
// where the last buzz ends and reports it as "No space left on device". A track that stops early
// is also one an upload site may cut the video down to.
const filter = `[1]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=${volume},asplit=${at.length}${taps};${delays};`
  + `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[bed];`
  + `[bed]${mixed}amix=inputs=${at.length + 1}:duration=first:normalize=0[a]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-i', path.resolve(base, sound),
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-t', duration, video], { stdio: 'inherit' });
fs.rmSync(silent);
console.log(`added ${at.length} buzz${at.length === 1 ? '' : 'es'} to ${video}`);
