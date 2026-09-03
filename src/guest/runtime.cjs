'use strict';

// The whole customization layer's way in. Attached once to every project view, so it is present
// in every document that view ever loads: no re-application after a reload, no key to remember,
// no host guessing when a document is ready.
//
// It does three things and nothing else: hold the project context, keep ONE style element last
// in <head>, and give the seams a ready workbench to work against.

const { ipcRenderer } = require('electron');

const seams = require('./manifest.cjs');
const STYLE_ID = 'code-tiles-seams';

let context = readContext();
const listeners = new Set();

function readContext() {
  const prefix = '--ct-context=';
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) return { folder: '', name: '', hue: 0, claudeState: 'idle', focused: false };
  return JSON.parse(decodeURIComponent(argument.slice(prefix.length)));
}

// Last in <head> is the whole trick: our rules then win on cascade order, and a seam needs
// !important only where something genuinely out-argues that. VS Code adds sheets as it loads
// parts, so the position is held rather than set once.
function styleElement() {
  let element = document.getElementById(STYLE_ID);
  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ID;
  }
  if (document.head.lastElementChild !== element) document.head.appendChild(element);
  return element;
}

function render() {
  if (!document.head) return;
  styleElement().textContent = seams
    .filter((seam) => typeof seam.css === 'function')
    .map((seam) => `/* seam: ${seam.name} */\n${seam.css(context)}`)
    .join('\n\n');
}

function whenWorkbench(callback) {
  const found = () => document.querySelector('.monaco-workbench');
  if (found()) return void callback(found());
  const observer = new MutationObserver(() => {
    const workbench = found();
    if (!workbench) return;
    observer.disconnect();
    callback(workbench);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

const api = {
  get context() { return context; },
  onContext(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  whenWorkbench,
  send(type, payload) { ipcRenderer.send('ct:call', { type, payload, folder: context.folder }); },
};

ipcRenderer.on('ct:event', (_event, message) => {
  if (message?.type !== 'context') return;
  context = { ...context, ...message.payload };
  render();
  for (const listener of listeners) listener(context);
});

function start() {
  render();
  new MutationObserver(() => styleElement()).observe(document.head, { childList: true });
  for (const seam of seams) {
    if (typeof seam.init !== 'function') continue;
    try { seam.init(api); } catch (error) { console.error(`[code-tiles] seam ${seam.name}:`, error); }
  }
}

if (document.head) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
