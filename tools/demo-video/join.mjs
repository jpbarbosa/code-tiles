// One video from several renders: each part cross-faded into the next, picture and sound, a part
// with no sound of its own carried on silence. usage: node join.mjs <out.mp4> <part.mp4>...
import { execFileSync } from 'node:child_process';

const FADE = 0.6;
const [out, ...parts] = process.argv.slice(2);
if (!out || parts.length < 2) throw new Error('usage: join.mjs <out.mp4> <part.mp4> <part.mp4>...');

const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type',
  '-of', 'json', file]).toString());
const info = parts.map((file) => {
  const found = probe(file);
  return { file, duration: Number(found.format.duration), audio: found.streams.some((stream) => stream.codec_type === 'audio') };
});

// Every part on one timebase and frame rate first: xfade refuses two inputs that differ, and the
// renders do - compose writes 1/600, a muxed file comes back 1/19200.
const filters = [];
info.forEach((part, index) => {
  filters.push(`[${index}:v]settb=AVTB,fps=60,format=yuv420p,setsar=1[v${index}]`);
  filters.push(part.audio
    ? `[${index}:a]aresample=48000,aformat=channel_layouts=stereo[a${index}]`
    : `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${part.duration}[a${index}]`);
});
let video = 'v0';
let audio = 'a0';
let elapsed = info[0].duration;
for (let index = 1; index < info.length; index += 1) {
  filters.push(`[${video}][v${index}]xfade=transition=fade:duration=${FADE}:offset=${(elapsed - FADE).toFixed(3)}[x${index}]`);
  filters.push(`[${audio}][a${index}]acrossfade=d=${FADE}[y${index}]`);
  video = `x${index}`;
  audio = `y${index}`;
  elapsed += info[index].duration - FADE;
}

execFileSync('ffmpeg', ['-v', 'error', '-y', ...info.flatMap((part) => ['-i', part.file]),
  '-filter_complex', filters.join(';'), '-map', `[${video}]`, '-map', `[${audio}]`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(`wrote ${out}: ${elapsed.toFixed(1)} s from ${info.length} parts`);
