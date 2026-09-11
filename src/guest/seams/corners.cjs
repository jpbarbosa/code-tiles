'use strict';

const { SCALE, shapeOf } = require('../corners.cjs');

const STYLE_ID = 'code-tiles-corners';

// The editor's radius tokens and the Claude panel's own, as each ships, restated at SCALE times so
// every gap nested between two of them holds. [code-server 4.135.0, claude-code 2.1.267]
const EDITOR_TOKENS = { xSmall: 2, small: 4, medium: 6, large: 8, xLarge: 12 };
const PANEL_TOKENS = { 'corner-radius-small': 4, 'corner-radius-medium': 6, 'corner-radius-large': 8, 'app-list-border-radius': 4 };

// What is a circle or a pill in either stylesheet, which a squircle would square off: by NAME,
// since CSS cannot ask a box how round it is, and by the part of a class that survives a rebuild.
// The app's own badge and its Claude ring are here too: a masked stroke's inner edge is its radius
// less the stroke, which only a circle keeps even.
const ROUND = [
  '.slider', '.monaco-sash', '.monaco-tl-twistie', '.saturation-selection', '.screencast-mouse',
  '.monaco-custom-toggle.action-list-inline-switch', '.chat-submit-button', '.chat-submit-button > .action-label',
  '[class*="badge" i]', '[class*="pill" i]', '[class*="dot" i]', '[class*="spinner" i]', '[class*="avatar" i]',
  '[class*="radio" i]', '[class*="thumb" i]', '[class*="toggle_"]', '[class*="notch_"]', '[class*="fill_"]',
  '[class*="closeButton_" i]', '[class*="removeButton_"]',
  '[class*="actionButton_"]', '[class*="timelineMessage_"]', '[class*="suggestionBullet_"]',
  '[class*="groupCount_"]', '[class*="mcpStatus_"]',
  '.part.activitybar .menubar', '.part.activitybar .menubar .menubar-menu-title',
].join(', ');

const scaled = (tokens, prefix) => Object.entries(tokens)
  .map(([name, px]) => `  ${prefix}${name}: ${Math.round(px * SCALE * 100) / 100}px;`)
  .join('\n');

const SHAPES = `
*, *::before, *::after { corner-shape: squircle; }
:is(${ROUND}), :is(${ROUND})::before, :is(${ROUND})::after { corner-shape: round; }`;

// Inside a webview page, whose `html` rule the Claude panel's own tokens are written on.
const PAGE_CSS = `:root {\n${scaled(PANEL_TOKENS, '--')}\n}\n${SHAPES}`;

const squircle = (context) => shapeOf(context.corners) === 'squircle';

// The editor's own corners - its parts, tabs, rows and buttons, and every webview page inside it -
// as the Corners preference has them; a literal radius keeps its value and only takes the shape.
// Round writes nothing: the editor's corners are circles as it ships them. Its tokens sit on
// `.monaco-workbench` in a sheet of its own, so the rule restating them is one step more specific.
module.exports = {
  name: 'corners',
  css: (context) => (squircle(context)
    ? `:root .monaco-workbench {\n${scaled(EDITOR_TOKENS, '--vscode-cornerRadius-')}\n}\n${SHAPES}`
    : ''),

  // A webview is a document of its own, which no workbench sheet reaches: the page's rules are said
  // on its root, the way chat-calm says its own, and kept in step with the context on every sweep.
  init(api) {
    api.eachDocument((page) => {
      if (page === document || !page.documentElement) return;
      const css = squircle(api.context) ? PAGE_CSS : '';
      let element = page.getElementById(STYLE_ID);
      if (!css) return void element?.remove();
      if (!element) {
        element = page.createElement('style');
        element.id = STYLE_ID;
      }
      if (element.textContent !== css) element.textContent = css;
      if (element.parentElement !== page.documentElement) page.documentElement.appendChild(element);
    });
  },
};
