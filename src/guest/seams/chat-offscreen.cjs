'use strict';

const STYLE_ID = 'code-tiles-chat-offscreen';
// What the page is born with, where a transcript only arrives with the first message.
const CLAUDE_PAGE = 'link[href*="anthropic.claude-code-"]';

// The extension restyles its whole page from its own animation frames whenever the panel changes
// size, so a long session made every switch that moves a tile pay for every message ever said. A
// message off screen now skips style and layout: on a 347-message transcript a restyle went 47 ms to
// 14 and a re-wrap 19 ms to nothing. 120px is that transcript's average message, and `auto` keeps a
// message's real height once it has been seen, so scrolling back up does not jump. The sticky user
// message is left out. [claude-code 2.1.310]
const CSS = `
[class*="turn_"] > [class*="timelineMessage_"] {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
`;

// Said inside the Claude page, which no workbench sheet reaches, on the root as chat-calm does.
module.exports = {
  name: 'chat-offscreen',
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
