'use strict';

// Dark is decided here rather than left to the editor: in web the workbench's default theme is
// the LIGHT one - the default is picked by isWeb, not by the OS - so a window told nothing at
// all comes up white. Auto-detect goes off with it, or the browser's colour scheme wins it back.
//
// `color-scheme` is the document's own half, and nothing in the workbench sets it: without it
// the page a tile shows before the theme has painted is Chromium's white canvas.
module.exports = {
  name: 'dark',
  settings: {
    'workbench.colorTheme': 'Dark 2026',
    'window.autoDetectColorScheme': false,
  },
  css: () => `
:root {
  color-scheme: dark;
}
`,
  // The same half said again INSIDE every webview, which the stylesheet cannot reach: the
  // editor's own default styles make a webview's body transparent, so a frame with no scheme of
  // its own paints that white canvas through every pixel the extension's page leaves uncovered.
  // Only the document inside the frame decides it - docs/CONSTRAINTS.md, code-server 4.135.0.
  init(api) {
    api.eachDocument((document) => {
      const root = document.documentElement;
      if (root && root.style.colorScheme !== 'dark') root.style.colorScheme = 'dark';
    });
  },
};
