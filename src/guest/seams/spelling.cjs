'use strict';

// A misspelled word in a webview's text field - the Claude prompt - offers corrections on a
// right-click. The webview host cancels every right-click for the editor's own menu, and Chromium,
// the only thing that knows which word is wrong, hears of no cancelled one. So a field's is stopped
// short of the host's listener on the window, uncancelled; main draws spelling over a misspelling
// and otherwise says not, and the right-click is replayed to the host. [code-server 4.143.1]
const EDITABLE = 'textarea, input';

module.exports = {
  name: 'spelling',
  init(api) {
    let held = null;

    const hold = (event) => {
      // Untrusted is the replay below, and a page that cancels its own right-click wants neither menu.
      if (!event.isTrusted || event.defaultPrevented) return;
      const target = event.target;
      if (!target?.isContentEditable && !target?.closest?.(EDITABLE)) return;
      event.stopPropagation();
      held = event;
    };

    // Main answers every right-click Chromium is allowed to show a menu for, the workbench's own
    // included, so an answer with nothing held is someone else's.
    api.onEvent('context-menu', ({ answered }) => {
      const event = held;
      held = null;
      if (!event || answered) return;
      event.target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, composed: true, button: 2, buttons: event.buttons,
        clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey,
      }));
    });

    // Only a webview's document: the workbench draws its own menus and cancels the event itself.
    // Said again on every sweep, since a webview's document.open() drops every listener on it.
    api.eachDocument((document) => {
      if (document === window.document) return;
      document.addEventListener('contextmenu', hold);
    });
  },
};
