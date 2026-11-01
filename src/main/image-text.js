import { spawn } from 'node:child_process';

// The first read on a Mac compiles Vision's model, 23 s here and more under memory pressure, and a
// read killed before that ends throws the work away, so the next one starts over. Hence a limit no
// normal read comes near, and no cancelling when the preview that asked has closed.
const LIMIT_MS = 5 * 60 * 1000;

let turn = Promise.resolve();

function read(binary, image) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'], timeout: LIMIT_MS });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stdin.on('error', reject);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) return reject(new Error(`read-image-text ended with ${signal ?? code}`));
      try { resolve(JSON.parse(Buffer.concat(chunks))); } catch (error) { reject(error); }
    });
    child.stdin.end(image);
  });
}

// One at a time, so two previews on a cold Mac share one compile rather than running two. The image
// travels on stdin because a screenshot of someone's screen has no business in a temp file.
export function readImageText(binary, image) {
  if (!binary) return [];
  const result = turn.then(() => read(binary, image));
  turn = result.catch(() => {});
  return result;
}
