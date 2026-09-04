'use strict';

// Which project you are working in, told by the window you clicked into. The shell cannot see
// that click - a view paints above its page - and by the time anything else could notice, the
// window already holds the keyboard, so the app's own idea of focus is the only thing left to
// move. Sent only from a window that is not the focused one, which is a fact it is told rather
// than one it keeps: the answer to the first click stops the rest.
//
// The listener goes on EVERY document in the window, not just the workbench's. A press inside a
// webview - the Claude panel, a preview, a notebook - lands in a sandboxed iframe two frames
// down, and the workbench around it sees no press, no focus and no blur. That sandbox carries
// allow-same-origin, which is how the editor's own wrapper reaches in, so each document
// registers on behalf of the ones below it.
//
// The walk repeats on a timer because a webview is several frames deep and they are built and
// rebuilt as panels open: the press has to find the listener already there, so a document that
// appears between two sweeps has to be caught by the next sweep rather than by anything it
// announces. Repeats are a no-op - a WeakSet of documents already hooked, and a
// querySelectorAll over a handful of tiny documents.
const SWEEP_MS = 1000;

module.exports = {
  name: 'focus',
  init(api) {
    const hooked = new WeakSet();
    const claim = () => {
      if (!api.context.focused) api.send('focus');
    };

    const sweep = (document) => {
      if (!document) return;
      if (!hooked.has(document)) {
        hooked.add(document);
        // Capture: a handler that stops the press cannot hide it from us.
        document.addEventListener('pointerdown', claim, true);
      }
      let frames;
      try { frames = document.querySelectorAll('iframe'); } catch { return; }
      for (const frame of frames) {
        try { sweep(frame.contentDocument); } catch { /* genuinely cross-origin */ }
      }
    };

    sweep(document);
    setInterval(() => sweep(document), SWEEP_MS);
  },
};
