import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeUrl, decodeToken, decodeUsage, pkce, splitCode } from '../src/main/oauth.js';

test('a usage window the account does not have is absent, not zero', () => {
  const usage = decodeUsage({
    five_hour: { utilization: 42.4, resets_at: '2026-09-03T18:30:00Z' },
    seven_day: { utilization: 0 },
  });
  assert.equal(usage.fiveHour.utilization, 42.4);
  assert.equal(usage.fiveHour.resetsAt, Date.parse('2026-09-03T18:30:00Z'));
  assert.deepEqual(usage.sevenDay, { utilization: 0, resetsAt: null });
  assert.equal(usage.sevenDayOpus, null);
  assert.equal(usage.sevenDaySonnet, null);
});

test('a reading outside 0-100, or missing entirely, never reaches a bar', () => {
  const usage = decodeUsage({ five_hour: { utilization: 140 }, seven_day: { utilization: -3 } });
  assert.equal(usage.fiveHour.utilization, 100);
  assert.equal(usage.sevenDay.utilization, 0);
  assert.deepEqual(decodeUsage(null), {
    fiveHour: null, sevenDay: null, sevenDayOpus: null, sevenDaySonnet: null,
  });
});

test('the pasted code carries the state after a hash, and survives without one', () => {
  assert.deepEqual(splitCode('  abc123#state-xyz \n'), { code: 'abc123', state: 'state-xyz' });
  assert.deepEqual(splitCode('abc123'), { code: 'abc123', state: '' });
  assert.deepEqual(splitCode(null), { code: '', state: '' });
});

test('a token response without an access token is refused, and a refresh token is kept', () => {
  assert.equal(decodeToken({ expires_in: 60 }, 'old'), null);
  assert.equal(decodeToken(null, 'old'), null);

  const kept = decodeToken({ access_token: 'a', expires_in: 60 }, 'old');
  assert.equal(kept.refresh, 'old');
  assert.ok(kept.expiresAt > Date.now());

  const rotated = decodeToken({ access_token: 'a', refresh_token: 'new' }, 'old');
  assert.equal(rotated.refresh, 'new');
});

test('the authorize URL carries the challenge, and PKCE never repeats a verifier', () => {
  const { verifier, challenge } = pkce();
  const url = new URL(authorizeUrl(challenge, verifier));
  assert.equal(url.origin + url.pathname, 'https://claude.ai/oauth/authorize');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), verifier);
  assert.match(url.searchParams.get('redirect_uri'), /^https:\/\//);
  assert.notEqual(pkce().verifier, verifier);
});
