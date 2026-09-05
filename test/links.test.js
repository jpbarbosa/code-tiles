import test from 'node:test';
import assert from 'node:assert/strict';

import { routeNavigation, routePopup } from '../src/main/links.js';

// A tile is a window of the one code-server, so the origin it is on is where every secret an
// extension writes has to land. That is the whole reason these two answers are not "send it to
// the browser": a sign-in completed anywhere else writes its grant somewhere no tile can read.

test('a popup that keeps its opener stays in this session, sized for a sign-in page', () => {
  const routed = routePopup({ url: 'https://github.com/login/oauth/authorize?x=1', features: '' });
  assert.equal(routed.action, 'allow');
  assert.equal(routed.external, undefined, 'it is not also handed to the browser');
  assert.deepEqual(routed.options, { width: 900, height: 760, center: true });
});

test('a guest that named its own size keeps it', () => {
  const routed = routePopup({ url: 'https://example.com/', features: 'width=520,height=420' });
  assert.equal(routed.action, 'allow');
  assert.deepEqual(routed.options, {}, 'nothing of ours overrides what the guest asked for');
});

// The editor spells every external link `.open(url, '_blank', 'noopener')`, and a window with no
// opener has nothing to hand a result back through - so it is never a handshake in flight.
test('noopener is the whole discriminator, and it means the browser', () => {
  for (const features of ['noopener', 'noopener,noreferrer', 'width=900,noopener']) {
    const routed = routePopup({ url: 'https://example.com/', features });
    assert.equal(routed.action, 'deny', features);
    assert.equal(routed.external, 'https://example.com/', features);
  }
  assert.equal(
    routePopup({ url: 'https://example.com/', features: 'nooponer' }).action,
    'allow',
    'a feature that merely looks like it is not it',
  );
});

test('a mail link is a handoff either way, so it never earns a window here', () => {
  const routed = routePopup({ url: 'mailto:someone@example.com', features: '' });
  assert.equal(routed.action, 'deny');
  assert.equal(routed.external, 'mailto:someone@example.com');
});

test('every other scheme is dropped rather than handed to the OS', () => {
  for (const url of ['slack://open', 'file:///etc/passwd', 'vscode:extension/x', 'not a url']) {
    const routed = routePopup({ url, features: '' });
    assert.equal(routed.action, 'deny', url);
    assert.equal(routed.external, undefined, `${url} is not launched either`);
  }
});

// The other half. A view is loaded once, when it is created, and nothing loads it again - so a
// top frame that leaves the workbench is a tile with no way back.
test('the top frame is held to the origin it is already on', () => {
  const from = 'http://127.0.0.1:8080/?folder=%2FUsers%2Fjp%2FSites%2Fapp';
  assert.equal(routeNavigation({ url: 'http://127.0.0.1:8080/other', from }).action, 'allow');
  const away = routeNavigation({ url: 'https://example.com/', from });
  assert.equal(away.action, 'block');
  assert.equal(away.external, 'https://example.com/', 'and the link still gets where it was going');
});

test('a port or a scheme of its own is another origin', () => {
  const from = 'http://127.0.0.1:8080/';
  assert.equal(routeNavigation({ url: 'http://127.0.0.1:8081/', from }).action, 'block');
  assert.equal(routeNavigation({ url: 'https://127.0.0.1:8080/', from }).action, 'block');
});

test('a blocked navigation to a scheme we would not launch is blocked and nothing more', () => {
  const routed = routeNavigation({ url: 'slack://open', from: 'http://127.0.0.1:8080/' });
  assert.equal(routed.action, 'block');
  assert.equal(routed.external, null);
});

// An opaque origin serialises as the string "null", which is not an origin two documents share,
// so a target carrying one is another place - the direction that matters, since the tile is the
// side that is always on the server.
test('a target with no readable origin is not the workbench either', () => {
  for (const url of ['about:blank', 'data:text/html,<h1>hi', 'slack://open']) {
    assert.equal(routeNavigation({ url, from: 'http://127.0.0.1:8080/' }).action, 'block', url);
  }
});

test('a view that reports no origin is a state this abstains from', () => {
  assert.equal(routeNavigation({ url: 'https://example.com/', from: 'about:blank' }).action, 'allow');
  assert.equal(routeNavigation({ url: 'https://example.com/', from: '' }).action, 'allow');
});
