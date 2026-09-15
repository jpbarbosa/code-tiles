// Signs the demo's Claude Code in from its chat tab. With no argument it starts the subscription
// login and prints the URL to authorize; with the pasted `code#state` it fills the manual-code field
// the way React listens for it (a typed key never reaches that input) and submits. A code is
// single-use and expires within minutes, so submit it as soon as it arrives.
// usage: node claude-login.mjs [code#state]
import { Page, sleep } from './cdp.mjs';

const code = process.argv[2];
const tile = await Page.open((target) => /code\/tidepool(&|$)/.test(decodeURIComponent(target.url)));
const inClaude = (body) => tile.eval(`(() => {
  const walk = (doc) => {
    if (doc.querySelector('link[href*="anthropic.claude-code-"]')) return (${body})(doc);
    for (const frame of doc.querySelectorAll('iframe')) {
      try { const found = frame.contentDocument && walk(frame.contentDocument); if (found !== null && found !== undefined) return found; } catch {}
    }
    return null;
  };
  return walk(document);
})()`);

if (!code) {
  await inClaude(`(doc) => { [...doc.querySelectorAll('button')].find((el) => el.innerText.includes('Claude.ai Subscription'))?.click(); return true; }`);
  await sleep(4000);
  console.log(await inClaude(`(doc) => [...doc.querySelectorAll('input')].map((el) => el.value).find((value) => value.startsWith('https://')) || 'no login URL on the page'`));
  process.exit(0);
}

console.log(await inClaude(`(doc) => {
  const field = doc.querySelector('input[placeholder^="0123"]');
  if (!field) return 'no code field: start the login first';
  Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(code)});
  field.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
  const submit = doc.querySelector('input[type=submit]');
  if (submit.disabled) return 'submit stayed disabled';
  submit.click();
  return 'submitted';
}`));
for (let attempt = 0; attempt < 16; attempt += 1) {
  await sleep(2500);
  const state = JSON.parse(await inClaude(`(doc) => JSON.stringify({ signedIn: Boolean(doc.querySelector('[aria-label="Message input"]')), text: doc.body.innerText.replace(/\\s+/g, ' ').slice(0, 200) })`));
  if (state.signedIn) { console.log('signed in'); process.exit(0); }
  if (!state.text.includes('paste your authorization code')) { console.log(state.text); process.exit(1); }
}
console.log('no answer after 40 s');
process.exit(1);
