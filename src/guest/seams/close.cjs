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
// A plate the size of a chip in the strip, so the app's marks are one size wherever they are, and
// far enough off the corner that the card's own radius has room to curve past it.
const SIZE = 28;
const GLYPH = 22;
const INSET = 7;

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
  border-radius: var(--vscode-cornerRadius-large, 8px);
  /* A plate, the way the branch pills and the side bar's title row are plates: the surface under
     it, lifted by the project's own hue. That surface is the editor's, since this corner is the
     editor's - and it arrives here already tinted, because this button is a child of the
     workbench like every part is. Without the tint seam the mix has nothing to move toward and
     the plate is the surface itself, which is the right way for it to disappear. */
  background-color: color-mix(in oklab,
    var(--vscode-editor-background) var(--ct-wash, 74%),
    var(--ct-brand, var(--vscode-editor-background)));
  /* The ink the activity bar's icons and the side bar's title row wear, so the app's marks in a
     window read as one hand. The theme's own icon colour is what a window without the tint gets. */
  color: var(--ct-ink, var(--vscode-icon-foreground));
  font-size: ${GLYPH}px;
  opacity: 0.65;
  cursor: default;
  /* Nothing in the workbench sets a z-index on a part, so one is enough to sit over them all -
     and a dialog, a context menu or Quick Open carries its own thousands and still wins. */
  z-index: 1;
}

.monaco-workbench .${BUTTON}:hover,
.monaco-workbench .${BUTTON}:focus-visible {
  opacity: 1;
  filter: brightness(1.18);
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
