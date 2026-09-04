'use strict';

// The project's colour, worn by the parts and - when this window is the focused one - by the
// ground its parts float on.
//
// Every value is MIXED INTO the theme's own colour rather than set outright, so a light theme
// gets a light chrome and a dark one a dark chrome, and a theme change carries the tint with it
// without anything here being told.
module.exports = {
  name: 'tint',
  css: (context) => `
.monaco-workbench {
  --ct-brand: oklch(0.62 0.15 ${context.hue});
  --ct-plate: color-mix(in oklab, var(--vscode-sideBar-background) 74%, var(--ct-brand));

  & .part.sidebar .composite.title {
    background-color: var(--ct-plate);
  }

  /* The activity bar rounds its own right corners and clips to them, so a square plate reaching
     that far loses a chamfer - and a plate is what this tint makes of the menubar, which nothing
     paints in a stock window. One step in from the part's own radius clears the arc. */
  & .part.activitybar .menubar {
    background-color: var(--ct-plate);
    border-radius: var(--vscode-cornerRadius-small, 4px);
  }
}
${context.focused ? `
/* Focus is the ground: the gaps between this window's own parts take the hue while every part
   inside it stays as the theme painted it. !important because the title bar service writes this
   variable INLINE on the workbench container, which a stylesheet cannot otherwise outrank. */
.monaco-workbench {
  --modern-ui-shell-background:
    color-mix(in oklab, var(--vscode-titleBar-activeBackground) 62%, var(--ct-brand)) !important;
}` : ''}
`,
};
