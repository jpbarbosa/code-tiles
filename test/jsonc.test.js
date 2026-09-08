import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJsonc } from '../src/guest/disk/jsonc.js';

// VS Code writes JSONC and JSON.parse accepts neither half of it, so every profile the app mirrors
// goes through this walk. Getting it wrong is silent and total: the parse throws, the caller's
// catch hands back an empty model, and a profile is mirrored with none of your file in it. There
// is no error anywhere and no visible symptom except settings that quietly did not arrive - which
// is why the states below are enumerated rather than sampled.

test('plain JSON is the identity', () => {
  assert.deepEqual(parseJsonc('{"a":1,"b":[1,2],"c":{"d":null}}'), { a: 1, b: [1, 2], c: { d: null } });
});

test('line and block comments are dropped', () => {
  assert.deepEqual(parseJsonc(`{
    // a whole line
    "a": 1, /* between a value and its comma */
    /* several
       lines */
    "b": 2
  }`), { a: 1, b: 2 });
});

test('a trailing comma is dropped before either closer, at any depth', () => {
  assert.deepEqual(parseJsonc('{"a":[1,2,],}'), { a: [1, 2] });
  assert.deepEqual(parseJsonc('{"a":{"b":1,},}'), { a: { b: 1 } });
  assert.deepEqual(parseJsonc('[[1,],]'), [[1]]);
});

// The half a regex cannot do. Each of these is a `//`, a `,` or a `/*` that is DATA, and a
// stripper that does not track strings eats the value around it.
test('a comment opener inside a string is data, not a comment', () => {
  assert.deepEqual(parseJsonc('{"url":"https://example.com/x"}'), { url: 'https://example.com/x' });
  assert.deepEqual(parseJsonc('{"glob":"**/*.ts"}'), { glob: '**/*.ts' });
  assert.deepEqual(parseJsonc('{"a":"/* not a comment */"}'), { a: '/* not a comment */' });
});

test('a comma or a closer inside a string is data', () => {
  assert.deepEqual(parseJsonc('{"a":"x, y","b":"}"}'), { a: 'x, y', b: '}' });
  assert.deepEqual(parseJsonc('{"a":"ends with a comma,"}'), { a: 'ends with a comma,' });
});

// An escaped quote ends the string for a scanner that does not track escapes, and what follows is
// then read as structure. These three are the inputs where that actually shows: most strings
// survive a naive walk unchanged, so a test has to put a comment opener or a closer AFTER the
// escaped quote to tell the two apart at all.
test('an escaped quote does not end the string it is in', () => {
  assert.deepEqual(parseJsonc(String.raw`{"a":"see \"//\" here","b":2}`), { a: 'see "//" here', b: 2 });
  assert.deepEqual(parseJsonc(String.raw`{"a":"open \"/*\" close","b":2}`), { a: 'open "/*" close', b: 2 });
  // The worst of the three, because it does not throw: the comma inside the value is taken for a
  // trailing one and deleted, so the file parses and the setting is quietly a different string.
  assert.deepEqual(parseJsonc(String.raw`{"a":"b\",}","c":3}`), { a: 'b",}', c: 3 });
});

test('ordinary escapes survive', () => {
  assert.deepEqual(parseJsonc(String.raw`{"a":"C:\\","b":2}`), { a: 'C:\\', b: 2 });
  assert.deepEqual(parseJsonc(String.raw`{"a":"tab\there"}`), { a: 'tab\there' });
});

test('a quote inside a comment does not open a string', () => {
  assert.deepEqual(parseJsonc(`{
    // don't let this " open anything
    "a": 1
  }`), { a: 1 });
});

// A comment sitting between the last value and the closer: the comma is trailing but is no longer
// the last thing written when the closer arrives.
test('a trailing comma survives a comment between it and the closer', () => {
  assert.deepEqual(parseJsonc('{\n  "a": 1, // note\n}'), { a: 1 });
  assert.deepEqual(parseJsonc('{\n  "a": 1,\n  /* gone */\n}'), { a: 1 });
});

// The shape the app actually meets, since keybindings.json is an array and settings.json an object.
test('a keybindings file parses as the array it is', () => {
  const parsed = parseJsonc(`// Place your key bindings in this file
[
  { "key": "cmd+k cmd+t", "command": "workbench.action.selectTheme" },
  // one we take back
  { "key": "cmd+0", "command": "-workbench.action.focusSideBar" },
]`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].command, '-workbench.action.focusSideBar');
});

test('an unterminated comment ends the file rather than hanging', () => {
  assert.deepEqual(parseJsonc('{"a":1}\n/* never closed'), { a: 1 });
  assert.deepEqual(parseJsonc('{"a":1}\n// never newlined'), { a: 1 });
});

// It THROWS on real nonsense rather than answering with something. Every caller wraps it in a
// try/catch that falls back to an empty model, which is only correct if a bad file is the only
// thing that reaches it.
test('genuinely malformed input throws, because the callers catch', () => {
  assert.throws(() => parseJsonc('{"a": }'));
  assert.throws(() => parseJsonc('not json at all'));
  assert.throws(() => parseJsonc(''));
});
