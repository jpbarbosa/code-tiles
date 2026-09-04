'use strict';

// Dark is decided here rather than left to the editor: in web the workbench's default theme is
// the LIGHT one - the default is picked by isWeb, not by the OS - so a window told nothing at
// all comes up white. Auto-detect goes off with it, or the browser's colour scheme wins it back.
//
// The theme is a DEFAULT and the auto-detect a setting, which is the difference between the two
// halves: only the second is a web-only default being repaired. A desktop that names a theme
// keeps it, and every theme-scoped `workbench.colorCustomizations` block keeps it too - those
// apply under their own theme and under no other, so pinning one here silently emptied them.
//
// `color-scheme` is the document's own half, and nothing in the workbench sets it: without it
// the page a tile shows before the theme has painted is Chromium's white canvas.
module.exports = {
  name: 'dark',
  defaults: {
    'workbench.colorTheme': 'Dark 2026',
  },
  settings: {
    'window.autoDetectColorScheme': false,
  },
  // The FIRST paint, before any of the above can be resolved. The theme service takes the theme
  // cached in profile storage, then the workbench's `initialColorTheme` option, then a base
  // scheme, and on a profile's first window all three fall through to the last - which is
  // `isWeb ? light : dark`. So it wears the light theme for the second and a half that scanning
  // extensions to find the real one costs.
  //
  // The bundle is the only way in: the placeholder's DOM class is plain `vs`, the same class a
  // light theme someone actually chose would carry, so nothing in the document tells the two
  // apart and no stylesheet can act on it. The option is set where code-server builds the
  // workbench config rather than here, and the setting above closes the only other branch.
  //
  // Unpatched, a profile's first window blinks light. [code-server 4.135.0]
  patch: {
    file: 'lib/vscode/out/vs/workbench/workbench.web.main.internal.js',
    marker: 'ct:dark-first',
    find: /getPreferredColorScheme\(\)\?\?\([A-Za-z_$][\w$]*\?"light":"dark"\)/,
    replace: 'getPreferredColorScheme()??("dark"/* ct:dark-first */)',
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
