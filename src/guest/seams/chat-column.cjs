'use strict';

const { matchCount } = require('../shape.cjs');

// A Claude session opens in the first editor group, not in a split the extension starts for it. No
// setting reaches the split: `preferredLocation` picks side bar or editor area. [claude-code 2.1.280]
const MARKER = '__CT_CHAT_COLUMN_3__';

// Anchored on the method's NAME, which minification keeps, rather than on its one caller: every
// path that would run `newGroupRight` for Claude gets the first group instead. It says it starts
// no group, so the caller never locks it - group one is where your code is. `1` is
// `ViewColumn.One` by the API's definition, so no minified namespace is needed.
const START_RE = /(?<![\w$.])startClaudeGroup\(\)\{/;

function apply(source) {
  const hits = matchCount(source, START_RE);
  if (hits !== 1) return { refused: `the group start matches ${hits} times, expected 1` };
  return {
    source: source.replace(START_RE,
      `$&return Promise.resolve({viewColumn:1,startsClaudeGroup:!1})/*${MARKER}*/;`),
  };
}

module.exports = {
  name: 'chat-column',
  // The extension's own switch for the lock. A lone empty group still counts as one Claude starts,
  // and locked, the next file you open splits right.
  settings: {
    'claudeCode.lockEditorGroups': false,
  },
  extension: {
    id: /^anthropic\.claude-code-/,
    file: 'extension.js',
    marker: MARKER,
    stamp: /__CT_CHAT_COLUMN_\d+__/,
    degrades: 'a session opens split-right in a group of its own',
    apply,
  },
};
