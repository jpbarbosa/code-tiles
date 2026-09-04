'use strict';

// The three parts the strip's layout control flips - side bar, panel, secondary side bar - in
// every window at once. Which state to be in is the app's to say; getting into it is the window's
// own business, so it happens in here.
//
// The editor offers no page-level way to run a command, so the switch taken is its KEYBINDING: a
// KeyboardEvent carrying `keyCode` in its init dict reaches the workbench's dispatcher from the
// preload's isolated world. Whether a part is showing is read from the workbench's own
// `nosidebar` / `nopanel` / `noauxiliarybar` classes, so nothing here measures anything and one
// attribute observer covers all three. Both facts are in docs/CONSTRAINTS.md, checked against
// code-server 4.135.0.
const PARTS = {
  sideBar: { flag: 'nosidebar', key: 'b', keyCode: 66, alt: false },
  panel: { flag: 'nopanel', key: 'j', keyCode: 74, alt: false },
  secondarySideBar: { flag: 'noauxiliarybar', key: 'b', keyCode: 66, alt: true },
};

module.exports = {
  name: 'layout',
  init(api) {
    api.whenWorkbench((workbench) => {
      const showing = () => Object.fromEntries(Object.entries(PARTS)
        .map(([part, spec]) => [part, !workbench.classList.contains(spec.flag)]));

      // What the strip's buttons read. Sent on change only, so a window that nobody is touching
      // says nothing at all.
      let reported = null;
      const report = () => {
        const parts = showing();
        const signature = JSON.stringify(parts);
        if (signature === reported) return;
        reported = signature;
        api.send('layout', { parts });
      };

      // Act on a CHANGE of instruction, never on its repetition. The context is re-sent on every
      // render, and re-applying it then would undo a Cmd+B pressed inside this window.
      const applied = {};
      const apply = (context) => {
        const parts = showing();
        for (const [part, spec] of Object.entries(PARTS)) {
          const wanted = context.layout?.[part];
          if (typeof wanted !== 'boolean' || wanted === applied[part]) continue;
          applied[part] = wanted;
          if (parts[part] !== wanted) press(spec);
        }
      };

      new MutationObserver(report).observe(workbench, { attributes: true, attributeFilter: ['class'] });
      api.onContext(apply);
      report();
      apply(api.context);
    });
  },
};

function press({ key, keyCode, alt }) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode,
    which: keyCode,
    metaKey: true,
    altKey: alt,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement || document.body).dispatchEvent(event);
}
