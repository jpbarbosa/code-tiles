'use strict';

const STYLE_ID = 'code-tiles-chat-calm';
// What the page is born with, where a tool's markup only arrives with the first tool call.
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// Both rules name what survives a rebuild, since the class hash does not. The output's plate is the
// extension's own variable, redefined on the element so its rule spends nothing. The notices go by
// test id: their own × is remembered per announcement, and the startup one is a feed whose next
// item arrives past it. [claude-code 2.1.270]
const CSS = `
[class*="toolResult_"] {
  --app-code-background: transparent;
}

[data-testid="startup-announcement-notice"],
[data-testid="fable5-launch-notice"] {
  display: none;
}
`;

// The Claude panel with less to look at. Its page is a webview, which no workbench sheet reaches,
// so the rules are said inside that document - on the root rather than in <head>, so the sheet
// stays after anything the page adds to its head later.
module.exports = {
  name: 'chat-calm',
  // The extension's own switch, which takes the header's Learn button with the checklist. The
  // checklist's "Hide onboarding" writes it into a mirrored profile, which the next start writes
  // over from the desktop file - so from inside a tile it never held.
  defaults: {
    'claudeCode.hideOnboarding': true,
  },
  init(api) {
    api.eachDocument((document) => {
      const root = document.documentElement;
      if (!root || !document.querySelector(CLAUDE_PAGE)) return;
      let element = document.getElementById(STYLE_ID);
      if (!element) {
        element = document.createElement('style');
        element.id = STYLE_ID;
        element.textContent = CSS;
      }
      if (element.parentElement !== root) root.appendChild(element);
    });
  },
};
