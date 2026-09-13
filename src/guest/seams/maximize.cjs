'use strict';

// Maximize: this project takes a wide column of its own and the rest keep working in a stack
// beside it. On the project that already holds the column, the same item hands the even grid
// back.
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
.monaco-workbench .part.activitybar .${ITEM} {
  /* The editor's gap is a margin on each item that FOLLOWS one, and the first view no longer
     follows this: the same gap, from this side, in the layout that has one. */
  .floating-panels & {
    margin-bottom: var(--activity-bar-action-gap, 0px);
  }

  & .action-label {
    /* Every view icon is handed its resting colour inline, from the theme; this one is not, so it
       says the same thing here. Hover and checked stay the editor's own rules. */
    color: var(--vscode-activityBar-inactiveForeground, var(--vscode-foreground));
  }
}
`,

  init(api) {
    api.whenWorkbench((workbench) => {
      // Beside the editor's list, never in it: the bar places and removes its items by counting
      // the list's children, so a child of ours there moves every later arrival up a slot and
      // makes a removal take its neighbour too. Above it, in the same bar, the editor's rules
      // still size it and paint its hover pill and, on `checked`, an active view's accent. What
      // that costs is room: the bar counts only its own items, so a short window has one item's
      // worth less than the editor believes. [code-server 4.135.0]
      api.whenPresent(workbench, '.part.activitybar .composite-bar .monaco-action-bar', (bar) => {
        let item = null;

        const render = () => {
          if (!api.context.tiled) {
            item?.remove();
            item = null;
            return;
          }
          const state = api.context.maximized;

          if (!item) {
            item = build(bar.ownerDocument, () => api.send('project:maximize', {
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
          if (bar.firstElementChild !== item) bar.prepend(item);
        };

        api.onContext(render);
        render();
      });
    });
  },
};

function build(document, press) {
  const item = document.createElement('div');
  item.className = `action-item icon ${ITEM}`;

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
