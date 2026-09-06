import fs from 'node:fs';
import path from 'node:path';

import seams from '../manifest-settings.js';
import { parseJsonc } from './jsonc.js';

// The chords a seam takes back off the editor, written after yours: VS Code resolves the LAST
// matching rule, so a seam's entry outranks the default it names and your own file keeps
// everything it says about every other key.
//
// A seam spells the editor's own modifier `$mod`, because which key that is belongs to the host
// and this side of the fence is handed it rather than asking.
export function seamKeybindings(mod) {
  return seams.flatMap((seam) => seam.keybindings || [])
    .map((rule) => ({ ...rule, key: rule.key.replaceAll('$mod', mod) }));
}

// The text a keybindings file should hold: your own rules, then the seams'. A seam's own entries
// are dropped from what is read first, because the server's file is layered over ITSELF on every
// start and an array, unlike a settings merge, would otherwise grow a copy per launch.
export function keybindingsFrom(source, mod) {
  const mine = seamKeybindings(mod);
  const yours = read(source).filter((rule) => (
    !mine.some((seamRule) => seamRule.key === rule.key && seamRule.command === rule.command)
  ));
  return `${JSON.stringify([...yours, ...mine], null, 2)}\n`;
}

export function writeKeybindings(file, mod, source = file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, keybindingsFrom(source, mod));
}

function read(file) {
  if (!file) return [];
  try {
    const parsed = parseJsonc(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
