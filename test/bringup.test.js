import test from 'node:test';
import assert from 'node:assert/strict';

import { BringUp } from '../src/main/bringup.js';

// A staircase is a clock and a queue, so the clock is handed to it: the rules are about WHEN each
// window is let go, and a test that measured real milliseconds would only be about this machine.
function bench(gap = 1500) {
  let clock = 10_000;
  const started = [];
  const bringUp = new BringUp({
    gap,
    now: () => clock,
    wait: (ms) => { clock += ms; return Promise.resolve(); },
  });
  return {
    started,
    tick: (ms) => { clock += ms; },
    at: () => clock,
    take: (name, options) => bringUp.take(() => started.push([name, clock]), options),
  };
}

// One turn per await: each queued start is one `.then` deep, and the wait inside it is another.
const settle = async (turns = 8) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };

test('the tile you are looking at never waits behind the ones you are not', async () => {
  const app = bench();
  app.take('a');
  app.take('focused', { first: true });
  assert.deepEqual(app.started, [['focused', 10_000]], 'the queued one has not gone yet');

  await settle();
  assert.deepEqual(app.started[1], ['a', 11_500], 'and the queue spaces off the one that jumped it');
});

test('a burst goes up a staircase, one gap per window', async () => {
  const app = bench();
  for (const name of ['a', 'b', 'c']) app.take(name);
  await settle();
  // The first waits for nothing by the rule below: at a launch there is no burst to be part of yet.
  assert.deepEqual(app.started, [['a', 10_000], ['b', 11_500], ['c', 13_000]]);
});

test('a bring-up long after the last is not part of a burst, and waits for nothing', async () => {
  const app = bench();
  app.take('a', { first: true });
  app.tick(9000);
  app.take('b');
  await settle();
  assert.deepEqual(app.started, [['a', 10_000], ['b', 19_000]]);
});

test('a turn that threw does not wedge the windows behind it', async () => {
  const app = bench();
  const bringUp = new BringUp({ gap: 0 });
  bringUp.take(() => { throw new Error('one window that did not open'); });
  bringUp.take(() => app.started.push(['after', 0]));
  await settle();
  assert.deepEqual(app.started, [['after', 0]]);
});

test('a zero gap is every window at once again, which is the escape hatch', () => {
  const app = bench(0);
  for (const name of ['a', 'b', 'c']) app.take(name);
  assert.deepEqual(app.started.map(([name]) => name), ['a', 'b', 'c'], 'synchronously, no queue');
});
