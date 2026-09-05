import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const seams = require('../src/guest/manifest.cjs');
const patches = seams.find((seam) => seam.name === 'secrets').patch;

// The provider as the bundle spells it, with the sealed blob and the auth-session element left
// out: what is under test is the read-modify-write, not the crypto either side of it. `set` and
// `delete` are adjacent and unbroken because that is how the seam anchors on them.
const PROVIDER = `class Provider{
constructor(crypto){this.crypto=crypto;this.storageKey="secrets.provider";this.type="persisted";this.secretsPromise=this.load()}
async load(){let raw=store.get(this.storageKey);return raw?JSON.parse(raw):{}}
async get(key){return(await this.secretsPromise)[key]}async set(key,value){let all=await this.secretsPromise;all[key]=value,this.secretsPromise=Promise.resolve(all),this.save()}async delete(key){let all=await this.secretsPromise;delete all[key],this.secretsPromise=Promise.resolve(all),this.save()}
async keys(){let all=await this.secretsPromise;return Object.keys(all)||[]}
async save(){store.set(this.storageKey,JSON.stringify(await this.secretsPromise))}
}`;

const patched = patches.reduce((source, patch) => {
  assert.equal((source.match(new RegExp(patch.find.source, 'g')) || []).length, 1,
    `${patch.marker}: the stand-in provider does not carry this shape exactly once`);
  return source.replace(patch.find, patch.replace);
}, PROVIDER);

// One localStorage, several windows on it - which is what one code-server on one partition is.
// A write notifies every OTHER window, the way the browser's storage event does.
function machine(source) {
  const data = new Map();
  const tabs = [];
  const open = () => {
    const listeners = [];
    const store = {
      get: (key) => data.get(key),
      set: (key, value) => {
        data.set(key, value);
        for (const tab of tabs) if (tab.listeners !== listeners) tab.notify(key);
      },
    };
    const window = { addEventListener: (type, fn) => { if (type === 'storage') listeners.push(fn); } };
    const Provider = new Function('store', 'window', `${source}\nreturn Provider;`)(store, window);
    const tab = {
      listeners,
      notify: (key) => listeners.forEach((fn) => fn({ key })),
      provider: new Provider({}),
    };
    tabs.push(tab);
    return tab;
  };
  return { open, held: () => JSON.parse(data.get('secrets.provider') || '{}') };
}

// The stock `set` does not await its own save, so the write lands a microtask later.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

test('stock, a second window writing any secret drops the first window\'s', async () => {
  const one = machine(PROVIDER);
  const a = one.open();
  const b = one.open();

  await a.provider.set('alpha', '1');
  await settle();
  await b.provider.set('beta', '2');
  await settle();

  assert.deepEqual(one.held(), { beta: '2' }, 'the bug this seam exists for is not reproduced');
});

test('merged, both windows\' secrets survive', async () => {
  const one = machine(patched);
  const a = one.open();
  const b = one.open();

  await a.provider.set('alpha', '1');
  await b.provider.set('beta', '2');
  await settle();

  assert.deepEqual(one.held(), { alpha: '1', beta: '2' });
});

test('a delete takes one key rather than every key it never saw', async () => {
  const one = machine(patched);
  const a = one.open();
  const b = one.open();

  await a.provider.set('alpha', '1');
  await b.provider.set('beta', '2');
  await a.provider.delete('alpha');
  await settle();

  assert.deepEqual(one.held(), { beta: '2' });
});

// Merging fixes the write; this is the read. Without the listener a window holds the snapshot it
// loaded with, and every tile here is a window that lives for days.
test('a window sees a secret another window wrote after it loaded', async () => {
  const one = machine(patched);
  const a = one.open();
  const b = one.open();

  await a.provider.set('alpha', '1');
  await settle();

  assert.equal(await b.provider.get('alpha'), '1');
});

test('two writes in one window do not interleave', async () => {
  const one = machine(patched);
  const a = one.open();

  await Promise.all([a.provider.set('alpha', '1'), a.provider.set('beta', '2')]);
  await settle();

  assert.deepEqual(one.held(), { alpha: '1', beta: '2' });
});
