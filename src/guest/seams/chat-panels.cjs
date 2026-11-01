'use strict';

const { matchCount } = require('../shape.cjs');

// A Claude tab closed as it starts no longer blanks every later Claude tab in its window.
// [claude-code 2.1.316]
const MARKER = '__CT_CHAT_PANELS_1__';

// Anchored on the two reads that open the panel's binding, past the branches that bind nothing: the
// last word of a closing panel still has to reach the session list.
const BIND_RE = /let [\w$]+=this\.sessionPanels\.get\([\w$]+\)===([\w$]+),[\w$]+=this\.panelLastReportedSession\.get\(/;

// A panel's report can land after its dispose handler ran, and the binding below it writes the panel
// back with no check. `persistPanelSessions` then throws on that panel's title, and it runs inside
// every `init`, so each new tab dies before it asks for a session. `panelComms` is what the handler
// clears, so being absent from it is what closed means here.
function apply(source) {
  const hits = matchCount(source, BIND_RE);
  if (hits !== 1) return { refused: `the panel's session binding matches ${hits} times, expected 1` };
  return {
    source: source.replace(BIND_RE, (bind, panel) => `/*${MARKER}*/if(!this.panelComms.has(${panel}))return;${bind}`),
  };
}

module.exports = {
  name: 'chat-panels',
  extension: {
    id: /^anthropic\.claude-code-/,
    file: 'extension.js',
    marker: MARKER,
    stamp: /__CT_CHAT_PANELS_\d+__/,
    degrades: 'a Claude tab closed as it starts can leave every new tab in that window blank',
    apply,
  },
};
