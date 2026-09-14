'use strict';

// The × that closes this project, in the corner the window keeps for itself. It is the app's, not
// the editor's, so it is one button per WINDOW rather than an item in a part's toolbar: a tile
// with Claude's chat beside the code is two editor groups, and a close in each group's actions
// would be two ways to close one project, neither of them about the tile. The corner is also the
// one place that is there whether an editor is open or not.
//
// The room it needs is taken from the editor's title row rather than laid over it - one rule,
// because the tab row is what the corner holds in every layout this app puts a window in.
// [code-server 4.135.0]
//
// It is drawn in every view. In single view the chip in the strip carries an × too, and that is a
// duplicate worth having: in the grid there are no chips, so this is the only one there is. The
// tile's other gesture - dragging it among the others - is on the badge, in `identity`.
const BUTTON = 'ct-close';
// The size of the editor's own action buttons, and far enough off the corner that the card's own
// radius has room to curve past it.
const SIZE = 22;
const GLYPH = 16;
const INSET = 10;

module.exports = {
  name: 'close',

  css: () => `
.monaco-workbench {
  --ct-close-room: ${SIZE}px;
}

/* The editor's own actions stop short of the corner rather than sitting under it. Padding on the
   row, so the tabs give the room up too where a group has no actions of its own - and every
   group's row gives it up, not just the one under the corner: which group that is, is a question
   only geometry can answer, and the alternative to a little space at the right of a split group's
   tabs is measuring inside the window on every layout change. */
.monaco-workbench .part.editor .title .tabs-and-actions-container {
  padding-right: calc(var(--ct-close-room) + ${INSET * 2}px);
}

.monaco-workbench .${BUTTON} {
  position: absolute;
  /* The app's own inset from the window's corner, not the editor's from its parts': the title
     row's height moves between versions and nothing here may depend on it. It lands the glyph on
     the same line as that row's own actions in this build, and in any other it is still a button
     in the corner, which is all it has to be. */
  top: ${INSET}px;
  right: ${INSET}px;
  width: ${SIZE}px;
  height: ${SIZE}px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--vscode-cornerRadius-small, 4px);
  /* Red, where every other mark the app puts in a window wears the project's hue: the panel has a
     close of its own in the same column, and this one closes the whole project. The theme's red,
     mixed into the surface under it at rest and on its own under the hand. */
  --ct-close-red: var(--vscode-charts-red, #f14c4c);
  background-color: color-mix(in oklab, var(--vscode-editor-background) 78%, var(--ct-close-red));
  color: color-mix(in oklab, var(--ct-close-red) 85%, var(--vscode-foreground));
  font-size: ${GLYPH}px;
  cursor: default;
  /* Nothing in the workbench sets a z-index on a part, so one is enough to sit over them all -
     and a dialog, a context menu or Quick Open carries its own thousands and still wins. */
  z-index: 1;

  &:hover,
  &:focus-visible {
    background-color: var(--ct-close-red);
    color: #fff;
  }
}
`,

  init(api) {
    api.whenWorkbench((workbench) => {
      const button = build(workbench.ownerDocument, api);
      const keep = () => { if (!button.isConnected) workbench.appendChild(button); };
      keep();
      // The workbench adds and removes parts as they come and go; the button is put back if one
      // of those passes takes it with them. Re-appending is itself a mutation, which the next
      // pass answers with nothing, since by then it is connected.
      new MutationObserver(keep).observe(workbench, { childList: true });
    });
  },
};

// The glyph is the editor's own codicon, taken by class the way its toolbars take theirs - the
// name has an icon registered in this build, which is the thing to check before using another: a
// class the product icon theme has no content for paints an empty slot and blames nothing.
function build(document, api) {
  const button = document.createElement('button');
  button.className = `codicon codicon-close ${BUTTON}`;
  button.type = 'button';
  button.title = 'Close this project';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => api.send('project:close'));
  return button;
}
