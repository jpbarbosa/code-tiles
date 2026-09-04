'use strict';

// The whole customization layer's way in. Attached once to every project view, so it is present
// in every document that view ever loads: no re-application after a reload, no key to remember,
// no host guessing when a document is ready.
//
// It does four things and nothing else: hold the project context, keep ONE style element last
// in <head>, give the seams a ready workbench to work against, and hand them every document the
// window holds.

const { ipcRenderer } = require('electron');

const seams = require('./manifest.cjs');
const STYLE_ID = 'code-tiles-seams';
const SWEEP_MS = 1000;

let context = readContext();
const contextListeners = new Set();
const documentListeners = new Set();

function readContext() {
  const prefix = '--ct-context=';
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) return { folder: '', name: '', hue: 0, icon: null, claudeState: 'idle', focused: false };
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

// Every document the window holds, not just the workbench's: a webview - the Claude panel, a
// preview, a notebook - is an iframe holding a sandboxed one, and neither a stylesheet nor an
// event crosses that boundary. The sandbox carries allow-same-origin, which is how the editor's
// own wrapper reaches in, so the chain can be walked.
//
// It repeats on a timer because those frames are built and rebuilt as panels open: a seam has to
// be there already, so a document that appears between two sweeps is caught by the next one
// rather than by anything it announces. Making a repeat cheap is the seam's own business.
function sweep(document) {
  if (!document) return;
  for (const listener of documentListeners) {
    try { listener(document); } catch (error) { console.error('[code-tiles] document listener:', error); }
  }
  let frames;
  try { frames = document.querySelectorAll('iframe'); } catch { return; }
  for (const frame of frames) {
    try { sweep(frame.contentDocument); } catch { /* genuinely cross-origin */ }
  }
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
  onContext(callback) { contextListeners.add(callback); return () => contextListeners.delete(callback); },
  whenWorkbench,
  eachDocument(callback) { documentListeners.add(callback); sweep(document); },
  send(type, payload) { ipcRenderer.send('ct:call', { type, payload, folder: context.folder }); },
};

ipcRenderer.on('ct:event', (_event, message) => {
  if (message?.type !== 'context') return;
  context = { ...context, ...message.payload };
  render();
  for (const listener of contextListeners) listener(context);
});

function start() {
  render();
  new MutationObserver(() => styleElement()).observe(document.head, { childList: true });
  for (const seam of seams) {
    if (typeof seam.init !== 'function') continue;
    try { seam.init(api); } catch (error) { console.error(`[code-tiles] seam ${seam.name}:`, error); }
  }
  setInterval(() => { if (documentListeners.size) sweep(document); }, SWEEP_MS);
}

if (document.head) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
