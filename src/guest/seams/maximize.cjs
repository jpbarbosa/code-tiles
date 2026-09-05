'use strict';

// Maximize: this project takes a wide column of its own and the rest keep working in a stack
// beside it. On the project that already holds the column, the same item hands the even grid
// back.
//
// It is an ITEM in the activity bar's own list, first, under the badge - built from the classes
// the editor builds its own with, so the bar sizes it and the design paints its hover pill and,
// on `checked`, the accent an active view wears. The previous implementation floated a host
// button over a slot CSS cut into the bar, which cost a measurement across the boundary. The
// cost of this side is that the composite bar sizes itself from its own model rather than from
// its children, so a window short enough to run out of room has one item's worth less than the
// editor believes. [code-server 4.135.0]
//
// The press sends what it will DO rather than a toggle for main to work out, so this window's own
// state is the only copy of it. Clicking into a window claims the FOCUS and nothing else: the
// column moves from here and from nowhere else. The item is there only while the window is one of
// several tiles - `context.tiled` - since single view and a lone project have nothing to widen it
// against; the grip in `controls` hangs on the same fact for the same reason.
//
// The lit half is `screen-normal`, not the `panel-restore` its name suggests: that class has no
// icon registered in this build, so its content variable resolves to nothing and the item would
// paint an empty slot. Both glyphs are the editor's own maximize pair either way.
const ITEM = 'ct-maximize';
const LABELS = {
  on: { icon: 'codicon-screen-normal', text: 'Restore the even grid' },
  off: { icon: 'codicon-panel-maximize', text: 'Maximize this project' },
};

module.exports = {
  name: 'maximize',

  css: () => `
.monaco-workbench .part.activitybar .${ITEM} .action-label {
  /* Every view icon is handed its resting colour inline, from the theme; this one is not, so it
     says the same thing here. Hover and checked stay the editor's own rules. */
  color: var(--vscode-activityBar-inactiveForeground, var(--vscode-foreground));
}
`,

  init(api) {
    api.whenWorkbench((workbench) => {
      whenPresent(workbench, '.part.activitybar .composite-bar .actions-container', (list) => {
        let item = null;

        const render = () => {
          if (!api.context.tiled) {
            item?.remove();
            item = null;
            return;
          }
          const state = api.context.maximized;

          if (!item) {
            item = build(list.ownerDocument, () => api.send('project:maximize', {
              maximized: !api.context.maximized,
            }));
          }

          const label = item.querySelector('.action-label');
          const { icon, text } = state ? LABELS.on : LABELS.off;
          item.classList.toggle('checked', state);
          label.classList.toggle(LABELS.on.icon, icon === LABELS.on.icon);
          label.classList.toggle(LABELS.off.icon, icon === LABELS.off.icon);
          label.setAttribute('aria-label', text);
          label.title = text;
          if (list.firstElementChild !== item) list.prepend(item);
        };

        // The bar rebuilds its list whenever a view is added, removed or dragged, and a rebuild
        // clears every child: the item is put back rather than held on to. Re-inserting is itself
        // a mutation, which the next pass answers with nothing, since by then it is first.
        new MutationObserver(render).observe(list, { childList: true });
        api.onContext(render);
        render();
      });
    });
  },
};

function build(document, press) {
  const item = document.createElement('li');
  item.className = `action-item icon ${ITEM}`;
  // The list is a tablist and this is not a tab: the anchor carries the role, the row carries
  // none, so nothing here claims to be a view you can switch to.
  item.setAttribute('role', 'presentation');

  const label = document.createElement('a');
  label.className = 'action-label codicon';
  label.setAttribute('role', 'button');
  label.tabIndex = 0;

  // The editor's design paints the hover pill and the active-item accent on this node, so the
  // item wears both by being built the way an item is.
  const indicator = document.createElement('div');
  indicator.className = 'active-item-indicator';

  item.append(label, indicator);
  item.addEventListener('click', press);
  return item;
}

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
