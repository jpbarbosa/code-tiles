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
};
