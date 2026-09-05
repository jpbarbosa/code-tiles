import test from 'node:test';
import assert from 'node:assert/strict';

import { badgeFor, waiting } from '../src/main/dock.js';

// A project as `Projects#describe` hands it over: what it is, whether it is open, and what Claude
// is doing in it. The badge reads two of those three.
const project = (claudeState, open = true) => ({ folder: `/p/${claudeState}${open}`, open, claudeState });

test('the badge counts the states that are about you, not the ones about Claude', () => {
  assert.equal(waiting([project('attention'), project('finished')]), 2);
  // `working` is Claude busy and asks nothing; `active` is a session with nothing to say; `idle`
  // is no session at all. Badging any of them would make the dock a thing you learn to ignore.
  assert.equal(waiting([project('working'), project('active'), project('idle')]), 0);
});

test('a closed project is not counted, because there is no tile to answer it in', () => {
  assert.equal(waiting([project('attention', false), project('finished', false)]), 0);
  assert.equal(waiting([project('attention', false), project('attention', true)]), 1);
});

test('nothing waiting is an empty badge rather than a zero', () => {
  assert.equal(badgeFor([]), '');
  assert.equal(badgeFor([project('working')]), '', 'the dock said nothing happened');
});

test('the badge is a string, which is what the dock takes', () => {
  assert.equal(badgeFor([project('attention')]), '1');
  assert.equal(badgeFor([project('attention'), project('finished'), project('working')]), '2');
});

// The states arrive from Activity, which answers 'idle' for a folder it knows nothing about - but
// a project described before the hooks ever ran can carry no state at all.
test('a project with no state at all is not waiting', () => {
  assert.equal(waiting([{ folder: '/p', open: true }]), 0);
  assert.equal(badgeFor([{ folder: '/p', open: true, claudeState: undefined }]), '');
});
