'use strict';

// Which project this window is, said inside the window, because the strip outside it is not
// visible from in here once your eye is in the editor.
//
// The name is a pseudo-element on the side bar's title row rather than an inserted node: there
// is nothing to keep alive when the workbench rebuilds that row, and nothing to clean up.
module.exports = {
  name: 'identity',
  css: (context) => `
.monaco-workbench .part.sidebar .composite.title .title-label h2::before {
  content: ${JSON.stringify(`${context.name} ·`)};
  /* Mixed into the row's own foreground rather than set from the hue alone: on a light theme a
     bright tint of the hue is invisible against the band it sits on. */
  color: color-mix(in oklab,
    var(--vscode-sideBarTitle-foreground, var(--vscode-foreground)) 55%,
    oklch(0.62 0.15 ${context.hue}));
  margin-right: 6px;
}
`,
};
