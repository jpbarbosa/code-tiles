'use strict';

// Which project you are working in, told by the window you clicked into. The shell cannot see
// that click - a view paints above its page - and by the time anything else could notice, the
// window already holds the keyboard, so the app's own idea of focus is the only thing left to
// move. Sent only from a window that is not the focused one, which is a fact it is told rather
// than one it keeps: the answer to the first click stops the rest.
//
// The listener goes on EVERY document in the window, not just the workbench's. A press inside a
// webview - the Claude panel, a preview, a notebook - lands in a sandboxed iframe two frames
// down, and the workbench around it sees no press, no focus and no blur.
module.exports = {
  name: 'focus',
  init(api) {
    const claim = () => {
      if (!api.context.focused) api.send('focus');
    };

    api.eachDocument((document) => {
      // Said again on every sweep rather than once per document, because a webview's own
      // document.open() wipes every listener on it while keeping the document OBJECT - so a
      // seam that remembers having hooked it never comes back, and the panel goes deaf. The
      // repeat is free: the DOM drops a second registration of the same type, callback and
      // capture flag.
      document.addEventListener('pointerdown', claim, true);
    });
  },
};
