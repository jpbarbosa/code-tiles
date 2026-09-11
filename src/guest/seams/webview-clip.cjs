'use strict';

// An editor webview clipped by its part's inner edge, like everything else in the part.
module.exports = {
  name: 'webview-clip',

  // Floating panels lay a part's contents out at its full width, both 1px borders included; the
  // part hides the 2px overhang from all but a webview, drawn in a layer of its own by a wrapper the
  // editor clips to the part's OUTER box - so it covered the right border. Padded by that border,
  // the wrapper's content box is the part's inner edge, rounded as the part is, and the webview meets
  // the tabs square, as text does. A side bar's webview view is clipped to its pane's scroller
  // instead, and left as it ships. [code-server 4.135.0]
  css: () => `
.monaco-workbench.floating-panels > div[style*="clip-path"]:has(> .webview-overlay-content > iframe:not([src*="purpose=webviewView"])) {
  box-sizing: border-box;
  padding: 1px;
  border-radius: var(--vscode-cornerRadius-large);

  & > .webview-overlay-content { border-radius: 0; }
}
`,
};
