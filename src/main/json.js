import fs from 'node:fs';
import path from 'node:path';

// Reading a file the app does not own: your VS Code's install, its extension index, a marker a
// hook wrote. Absent, truncated and malformed are one answer, because there is nothing to tell
// them apart with and nothing any caller would do differently.
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Through a temp file in the same directory, then a rename: a reader woken by the write never
// sees half a record. The pid is in the name because the rename is what is atomic, not the write
// before it - two processes sharing one temp path would interleave into a file neither wrote.
export function writeAtomic(file, body) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, file);
}
