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
const watchedRoots = new WeakSet();
const wiredFrames = new WeakSet();

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
// A document is reached the moment it exists rather than at the next tick, because until a seam
// has been inside it the frame paints Chromium's white canvas: a panel opened between two ticks
// blinks white for as long as the wait. The timer below stays as the backstop, so making a
// repeat cheap is still the seam's own business.
function sweep(document) {
  if (!document) return;
  watch(document);
  for (const listener of documentListeners) {
    try { listener(document); } catch (error) { console.error('[code-tiles] document listener:', error); }
  }
  let frames;
  try { frames = document.querySelectorAll('iframe'); } catch { return; }
  for (const frame of frames) {
    wire(frame);
    try { sweep(frame.contentDocument); } catch { /* genuinely cross-origin */ }
  }
}

// The two halves of "the moment it exists": a frame is announced by the document that appends
// it, and the document it will actually hold is announced by the frame. Only an iframe is worth
// a sweep, and no seam appends one, so the observer cannot answer its own writes.
//
// Kept against the ROOT rather than the document, because a webview rewrites itself with
// document.open(): the document object survives and its documentElement does not, so an observer
// remembered against the document is left watching a detached tree - and the frames appended to
// the live one, which is where a webview puts its content, are announced by nothing.
function watch(document) {
  const root = document.documentElement;
  if (!root || watchedRoots.has(root)) return;
  watchedRoots.add(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.tagName === 'IFRAME' || node.getElementsByTagName('iframe').length) return void sweep(document);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

// Navigating replaces a frame's document, and with it everything a seam wrote into the one
// before: the frame is swept again on every load rather than once when it was found.
function wire(frame) {
  if (wiredFrames.has(frame)) return;
  wiredFrames.add(frame);
  frame.addEventListener('load', () => {
    try { sweep(frame.contentDocument); } catch { /* genuinely cross-origin */ }
  });
}

// The workbench builds itself in pieces, so most of what a seam wants to attach to is not there
// when it runs. Called back once, with the first element to match, and then done watching.
function whenPresent(root, selector, callback) {
  const found = () => root.querySelector(selector);
  if (found()) return void callback(found());
  const observer = new MutationObserver(() => {
    const element = found();
    if (!element) return;
    observer.disconnect();
    callback(element);
  });
  observer.observe(root, { childList: true, subtree: true });
}

// The one every seam starts from, named because it is the root the others are found under.
const whenWorkbench = (callback) => whenPresent(document.documentElement, '.monaco-workbench', callback);

const api = {
  get context() { return context; },
  onContext(callback) { contextListeners.add(callback); return () => contextListeners.delete(callback); },
  whenWorkbench,
  whenPresent,
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
