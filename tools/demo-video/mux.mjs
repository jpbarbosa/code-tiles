// The soundtrack under a rendered video: the narrator's lines and the app's own buzz, each at the
// output time build.mjs worked out (the app played the buzz, muted, at exactly those moments),
// then brought to YouTube's -14 LUFS. usage: node mux.mjs <timeline.json>
import { execFileSync, spawnSync } from 'node:child_process';
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
const buzz = timeline.audio || {};
const cues = [
  ...(timeline.voice || []).map((cue) => ({ file: cue.file, at: cue.at, volume: 1 })),
  ...(buzz.at || []).map((at) => ({ file: buzz.file, at, volume: buzz.volume ?? 0.7 })),
];
if (!cues.length) {
  console.log('no sound to add');
  process.exit(0);
}

const silent = video.replace(/\.mp4$/, '.silent.mp4');
const mix = video.replace(/\.mp4$/, '.mix.wav');
// A failed run leaves the render as .silent.mp4 beside a partial video, so start from the render.
if (!fs.existsSync(silent)) fs.renameSync(video, silent);
const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent]).toString().trim();

// all=1: one delay given to a stereo stream moves the left channel alone. Mixed onto silence as long
// as the video, never -shortest: with that, ffmpeg 7 ends the file where the last sound ends and
// reports it as "No space left on device".
const placed = cues.map((cue, index) => `[${index}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=${cue.volume},`
  + `adelay=delays=${Math.round(cue.at * 1000)}:all=1[c${index}]`).join(';');
const filter = `${placed};anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[bed];`
  + `[bed]${cues.map((_, index) => `[c${index}]`).join('')}amix=inputs=${cues.length + 1}:duration=first:normalize=0[a]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...cues.flatMap((cue) => ['-i', path.resolve(base, cue.file)]),
  '-filter_complex', filter, '-map', '[a]', '-t', duration, '-c:a', 'pcm_s16le', mix], { stdio: 'inherit' });

// YouTube turns a louder upload down and never a quieter one up, and edge-tts speaks at about -21.
// Two passes: the first measures, the second applies exactly the gain that asks for.
const LOUDNESS = 'I=-14:TP=-1.5:LRA=11';
const pass = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mix, '-af', `loudnorm=${LOUDNESS}:print_format=json`, '-f', 'null', '-'],
  { encoding: 'utf8' });
const measured = JSON.parse(pass.stderr.slice(pass.stderr.lastIndexOf('{'), pass.stderr.lastIndexOf('}') + 1));
const loudnorm = `loudnorm=${LOUDNESS}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}`
  + `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-af', loudnorm,
  '-c:v', 'copy', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', duration, video], { stdio: 'inherit' });
fs.rmSync(silent);
fs.rmSync(mix);
console.log(`${video}: ${timeline.voice?.length ?? 0} line(s), ${buzz.at?.length ?? 0} buzz(es), -14 LUFS (from ${measured.input_i})`);
