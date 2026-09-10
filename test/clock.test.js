import assert from 'node:assert/strict';
import test from 'node:test';

import { hourCycleFor } from '../src/main/clock.js';

test('the clock comes from the region, so English in Brazil is 24-hour though ICU formats en-BR as 12', () => {
  assert.equal(hourCycleFor({ systemLocale: 'en-BR' }), 'h23');
  assert.equal(hourCycleFor({ systemLocale: 'en-US' }), 'h12');
  assert.equal(hourCycleFor({ systemLocale: 'pt-BR' }), 'h23');
});

test('an explicit 12 or 24-hour choice outranks the region, and a tag Intl cannot read is 12-hour', () => {
  assert.equal(hourCycleFor({ force12: true, systemLocale: 'en-BR' }), 'h12');
  assert.equal(hourCycleFor({ force24: true, systemLocale: 'en-US' }), 'h23');
  assert.equal(hourCycleFor({ systemLocale: '' }), 'h12');
});
