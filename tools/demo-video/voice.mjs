// The narrator: Microsoft's neural voices through edge-tts (`uv tool install edge-tts`).
// A line is synthesized once and kept by its text, voice and rate.
// Override with TTS_VOICE and TTS_RATE (e.g. -5%); a new voice changes every line's length, so
// film again after one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { WORK } from './world.mjs';

export const VOICE = process.env.TTS_VOICE ?? 'en-US-AndrewMultilingualNeural';
export const RATE = process.env.TTS_RATE ?? '+0%';
const CACHE = `${WORK}voice/`;

export function line(text) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = `${CACHE}${createHash('md5').update(`${text}|${VOICE}|${RATE}`).digest('hex')}.mp3`;
  if (!fs.existsSync(file)) {
    // `--rate=` in one argument: a negative rate on its own parses as a flag.
    execFileSync('edge-tts', ['--voice', VOICE, `--rate=${RATE}`, '--text', text, '--write-media', file], { stdio: 'ignore' });
  }
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  return { file, seconds };
}

// Every literal say('…') in a take's source, so all its lines exist before the camera runs.
export function spokenLines(source) {
  const lines = [];
  for (const match of source.matchAll(/\bsay\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (match[1] === '`' && match[2].includes('${')) continue;
    lines.push(match[2].replace(/\\(.)/g, '$1'));
  }
  return lines;
}
