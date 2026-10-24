// node tools/ux-compare/diff.mjs <before.json> <after.json> - every measured value that differs.
import fs from 'node:fs';

const [before, after] = process.argv.slice(2).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).inventory);
for (const name of Object.keys(before)) {
  const [was, now] = [before[name], after[name]];
  if (JSON.stringify(was) === JSON.stringify(now)) continue;
  if (!was || !now || typeof was !== 'object') {
    console.log(`${name}: ${JSON.stringify(was)} -> ${JSON.stringify(now)}`);
    continue;
  }
  const changed = Object.keys(was).filter((key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]));
  console.log(`${name}\n${changed.map((key) => `  ${key}: ${JSON.stringify(was[key])} -> ${JSON.stringify(now[key])}`).join('\n')}`);
}
