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
  /* How much of the theme's own colour survives the hue, wherever the hue lands on a surface. */
  --ct-wash: 74%;
  /* The same hue over the whole of a part rather than over its chrome, at a quarter of the
     strength: enough that a side bar reads as this project's, little enough that the plate
     below still reads as a plate on top of it. */
  --ct-veil: 93%;
  --ct-plate: color-mix(in oklab, var(--vscode-sideBar-background) var(--ct-wash), var(--ct-brand));

  /* The surfaces, which the modern UI paints from the theme's own variables and with an
     !important of its own - so the tint is those variables rewritten and no selector of ours,
     and every pane header, section header and list row inside a part follows, because they read
     the same names.
     The capture is on the workbench and the rewrite on its children because a custom property
     cannot reference ITSELF on one element: that is a cycle, and the property computes to nothing
     at all. Read on the parent, spent on the child, is the whole of it. */
  --ct-source-sidebar: var(--vscode-sideBar-background);
  --ct-source-editor: var(--vscode-editor-background);
  --ct-source-panel: var(--vscode-panel-background);

  & > * {
    --vscode-sideBar-background: color-mix(in oklab, var(--ct-source-sidebar) var(--ct-veil), var(--ct-brand));
    --vscode-editor-background: color-mix(in oklab, var(--ct-source-editor) var(--ct-veil), var(--ct-brand));
    --vscode-panel-background: color-mix(in oklab, var(--ct-source-panel) var(--ct-veil), var(--ct-brand));
  }

  /* Every part writes its background INLINE, as a literal, from JS. The modern UI's own
     !important re-reads the variable for most of them and so carries the tint with it; the editor
     has no such rule, and only !important outranks an inline style. The value is the rewritten
     variable, so the editor arrives where the others do. */
  & .part.editor > .content,
  & .part.editor .editor-container {
    background-color: var(--vscode-editor-background) !important;
  }

  /* The activity bar is SHELL, not a card: it wears the ground the parts float on, which is what
     it showed before a theme with an activityBar.background of its own made it opaque and
     dropped it out. Neither veil nor plate is the colour - the ground is, and it is the ground
     that makes the strip read as continuous with the gaps around every part. Following the ground
     means following focus with it, which is the point of the ground. */
  & .part.activitybar {
    background-color: var(--modern-ui-shell-background) !important;
  }

  /* The active tab wears the hue too, wherever there is one: a file, a Claude session, the view
     switcher's own active item, and the terminal tabs the terminals seam mirrors. All of them
     read these two variables and nothing else, so this is the one place it is said - and the
     unfocused-group variants derive from the first, so they follow with nothing added here.
     The hover washes are left alone: they are the theme's translucent white over whatever is
     under them, which is now a tinted tab. */
  &.modern-ui-tabs {
    --modern-ui-editor-tab-active-background:
      color-mix(in oklab, var(--vscode-modernEditorTab-activeBackground) var(--ct-wash), var(--ct-brand));
    --modern-ui-tab-active-background:
      color-mix(in oklab, var(--vscode-modernTab-activeBackground) var(--ct-wash), var(--ct-brand));
  }

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
