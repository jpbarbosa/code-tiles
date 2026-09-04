'use strict';

// Which project this window is, said inside the window, because the strip outside it is not
// visible from in here once your eye is in the editor. Twice: the project's own favicon at the
// top of the activity bar, where the title bar used to be, and its name on the side bar's title
// row - the one row every viewlet renders into, so switching to Search keeps it.
//
// Both are pseudo-elements rather than inserted nodes: there is nothing to keep alive when the
// workbench rebuilds a row, and nothing to clean up. The badge is the hamburger's own glyph
// swapped for the icon, so the button underneath is still the editor's and still opens the menu.
module.exports = {
  name: 'identity',
  css: (context) => `
${context.icon ? `
.monaco-workbench .part.activitybar .menubar .menubar-menu-button > .menubar-menu-title::before {
  /* The one !important here, and the rule that forced it: the product icon theme sets this same
     pseudo's glyph with an !important of its own (content: var(--vscode-icon-menu-content)), so
     a plain override loses and the hamburger paints on top of the icon. */
  content: "" !important;
  display: block;
  width: 18px;
  height: 18px;
  background-image: url("${context.icon}");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 3px;
}` : ''}

/* The row wears the ink the activity bar's icons wear - a colour derived from the ground rather
   than mixed into the theme's own foreground, which on a light theme washes the hue out.
   !important because the composite writes the theme's title foreground INLINE on this node from
   JS, which no stylesheet outranks otherwise; the name inherits it from here. */
.monaco-workbench .part.sidebar .composite.title .title-label h2 {
  color: var(--ct-ink) !important;

  &::before {
    content: ${JSON.stringify(`${context.name} ·`)};
    margin-right: 6px;
  }
}
`,
};
