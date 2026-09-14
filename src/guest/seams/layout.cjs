'use strict';

// The three parts the strip's layout control flips - side bar, panel, secondary side bar - in
// every window at once, each through the editor's own keybinding: a KeyboardEvent carrying
// `keyCode` in its init dict reaches the workbench's dispatcher from the preload's isolated world.
// Whether a part is showing is the workbench's own `nosidebar` / `nopanel` / `noauxiliarybar`
// class, so one attribute observer covers all three. Both are in docs/CONSTRAINTS.md, checked
// against code-server 4.135.0, and so is the sash reset a part the strip shows is sized by.
const PARTS = {
  sideBar: { flag: 'nosidebar', part: 'sidebar', key: 'b', keyCode: 66, alt: false },
  panel: { flag: 'nopanel', part: 'panel', key: 'j', keyCode: 74, alt: false },
  secondarySideBar: { flag: 'noauxiliarybar', part: 'auxiliarybar', key: 'b', keyCode: 66, alt: true },
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

      // A part the strip shows comes back at its own size, not the one it was dragged to - once it
      // IS showing, since the editor ignores a sash reset on a hidden part and the press that shows
      // one can land a task later. A press older than this document is not one it was open for, so
      // a window opened or reloaded since keeps the sizes it remembers.
      const resets = new Set();
      const reset = () => {
        const parts = showing();
        for (const part of resets) {
          if (!parts[part]) continue;
          resets.delete(part);
          resetSize(workbench, PARTS[part]);
        }
      };

      // Act on a CHANGE of instruction, never on its repetition. The context is re-sent on every
      // render, and re-applying it then would undo a Cmd+B pressed inside this window.
      const applied = {};
      const apply = (context) => {
        const parts = showing();
        for (const [part, spec] of Object.entries(PARTS)) {
          const wanted = context.layout?.[part];
          if (!wanted || wanted.at === applied[part]) continue;
          applied[part] = wanted.at;
          if (parts[part] !== wanted.visible) press(spec);
          if (wanted.visible && wanted.at > performance.timeOrigin) resets.add(part);
          else resets.delete(part);
        }
        reset();
      };

      new MutationObserver(() => {
        report();
        reset();
      }).observe(workbench, { attributes: true, attributeFilter: ['class'] });
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

// The editor's own reset, a double-click on the part's sash: the grid hands the view BEFORE the
// sash its preferred size, or the view after it when that one has none, so the far edge goes first.
// Found by where it sits, because a split view keeps its sashes in the order they were made and its
// views in the order they stand, and moving a view parts the two.
function resetSize(workbench, { part }) {
  const view = workbench.querySelector(`.part.${part}`)?.closest('.split-view-view');
  const splitView = view?.closest('.monaco-split-view2');
  if (!splitView) return;
  const across = splitView.classList.contains('horizontal');
  const box = view.getBoundingClientRect();
  const covers = (sash, edge) => {
    const band = sash.getBoundingClientRect();
    return across ? band.left <= edge && edge <= band.right : band.top <= edge && edge <= band.bottom;
  };
  const sashes = [...splitView.querySelectorAll(':scope > .sash-container > .monaco-sash:not(.disabled)')];
  const edges = across ? [box.right, box.left] : [box.bottom, box.top];
  const sash = edges.map((edge) => sashes.find((candidate) => covers(candidate, edge))).find(Boolean);
  sash?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
}
