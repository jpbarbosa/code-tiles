'use strict';

// The editor's own rounded design, on: parts become cards floating on the shell colour, the shape
// a tile already has in the window. Held to the rendition the app was designed on - what 4.143.1
// changed is put back below, each value the one 4.135.0 shipped. Nothing here measures.
module.exports = {
  name: 'modern',
  settings: {
    'workbench.experimental.modernUI': true,
    // Tabs as pills, which the design shipped as. 4.143.1 added `connected` - the active tab
    // joined to its editor by an underline - and made it the default. [code-server 4.143.1]
    'workbench.experimental.modernUIEditorTabStyle': 'pill',
  },

  // [code-server 4.143.1] Selectors mirror the editor's own, so the sheet being last decides.
  css: () => `
.monaco-workbench.floating-panels:not(.modern-ui-compact) {
  /* The activity bar as a column of its own at the tile's edge rather than the left half of the
     side bar's card: no card border, no inset lane for its icons, so the badge sits level with
     the side bar's title row. */
  & .part.activitybar.left {
    margin-left: 0;
    padding-left: var(--vscode-spacing-size60);
    padding-right: var(--vscode-spacing-size20);
    border: 0;
    border-radius: 0 var(--vscode-cornerRadius-medium) var(--vscode-cornerRadius-medium) 0;

    & > .content { left: 0; }
    /* off-ladder(spacing): the editor's own menubar height, 35px, until 4.143.1 */
    & > .content > .menubar.compact { height: 35px; padding-top: 0; }
    & > .content > .composite-bar { margin-top: calc(var(--vscode-spacing-size20) + var(--vscode-strokeThickness)); }
    & > .content > :not(.composite-bar):last-child { margin-bottom: calc(var(--vscode-spacing-size20) + var(--vscode-strokeThickness)); }
  }

  /* Beside the bar itself once the side bar is hidden: its column already holds the 4px gap. */
  &.nosidebar:not(.noactivitybar) > .monaco-grid-view :is(.part.editor, .part.panel) {
    margin-left: 0;
  }

  &:not(.noactivitybar) .part.sidebar.left {
    --modern-ui-floating-card-seam-left-color: var(--modern-ui-floating-card-edge-color);
    border-radius: var(--vscode-cornerRadius-large);
  }

  /* The theme's panel border, which 4.143.1 reads first, outlines this card alone in near black. */
  & .part.panel {
    --modern-ui-floating-card-border-color: var(--vscode-surface-border, var(--vscode-widget-border, transparent));
  }
}

/* A rule between the side bar's views only where the theme names one, as before 4.143.1 fell
   back to the surface border. */
.modern-ui :is(.part.sidebar, .part.auxiliarybar) .monaco-pane-view .pane > .pane-header::before {
  background-color: var(--vscode-sideBarSectionHeader-border, transparent);
}

/* Every tab's close button in the active group, and at half strength in the others. */
.modern-ui-tabs.monaco-workbench .part.editor > .content .editor-group-container {
  &.active > .title.tab-actions-reserve-space .tabs-container > .tab:not(.sticky-compact):not(.close-action-off) > .tab-actions .action-label:not(:focus) {
    opacity: 1;
  }

  &:not(.active) > .title.tab-actions-reserve-space .tabs-container > .tab:not(.sticky-compact):not(.close-action-off):not(:hover) > .tab-actions .action-label:not(:focus) {
    opacity: 0.5;
  }
}
`,
};
