import test from 'node:test';
import assert from 'node:assert/strict';

import { spellingTemplate } from '../src/main/spelling.js';

const flags = { canCut: true, canCopy: false, canPaste: true };
const params = (misspelledWord, dictionarySuggestions = []) => ({ misspelledWord, dictionarySuggestions, editFlags: flags });
const none = { replace: () => {}, learn: () => {} };

test('a right-click on a correct word is left to the window', () => {
  assert.equal(spellingTemplate(params(''), none), null);
});

test('the guesses come first and each replaces the word', () => {
  const replaced = [];
  const template = spellingTemplate(params('burocratic', ['bureaucratic', 'autocratic']), { ...none, replace: (word) => replaced.push(word) });
  assert.deepEqual(template.slice(0, 2).map((item) => item.label), ['bureaucratic', 'autocratic']);
  template[1].click();
  assert.deepEqual(replaced, ['autocratic']);
  assert.deepEqual(template.filter((item) => item.role).map((item) => [item.role, item.enabled]),
    [['cut', true], ['copy', false], ['paste', true]]);
});

test('a word with no guesses says so, and can still be learned', () => {
  const learned = [];
  const template = spellingTemplate(params('qzxv'), { ...none, learn: (word) => learned.push(word) });
  assert.deepEqual(template[0], { label: 'No Guesses Found', enabled: false });
  template.find((item) => item.label === 'Learn Spelling').click();
  assert.deepEqual(learned, ['qzxv']);
});
