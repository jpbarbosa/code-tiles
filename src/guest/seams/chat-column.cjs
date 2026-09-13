'use strict';

const { matchCount } = require('../shape.cjs');

// A Claude session opens in the first editor group, not in a split the extension then locks. No
// setting reaches it: `preferredLocation` picks side bar or editor area. [claude-code 2.1.270]
const MARKER = '__CT_CHAT_COLUMN_2__';

// Anchored on two NAMES, the column-picking method and the key the caller locks on, because
// minification keeps both; the branch between them is no anchor, and its flag went from `!0` to
// `column !== Beside` in 2.1.269. Both or neither: the column alone would lock your own group.
// `1` is `ViewColumn.One` by the API's definition, so no minified namespace is needed.
const PICK_RE = /this\.findUnusedColumn\(\)/;
const FLAG_RE = /return\{startedInNewColumn:[\w$]+/;

function apply(source) {
  for (const [label, re] of [['column pick', PICK_RE], ['lock flag', FLAG_RE]]) {
    const hits = matchCount(source, re);
    if (hits !== 1) return { refused: `the ${label} matches ${hits} times, expected 1` };
  }
  return {
    source: source
      .replace(PICK_RE, `1/*${MARKER}*/`)
      .replace(FLAG_RE, `return{startedInNewColumn:!1/*${MARKER}*/`),
  };
}

module.exports = {
  name: 'chat-column',
  extension: {
    id: /^anthropic\.claude-code-/,
    file: 'extension.js',
    marker: MARKER,
    stamp: /__CT_CHAT_COLUMN_\d+__/,
    degrades: 'a session opens split-right in a column of its own, locked',
    apply,
  },
};
