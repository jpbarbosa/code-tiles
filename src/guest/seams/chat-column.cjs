'use strict';

const { matchCount } = require('../shape.cjs');

// A Claude session opens in the editor group you are already in, rather than in a locked column
// of its own.
//
// Given no column, the extension takes the first FREE one - a fresh split beside your code - and
// reports `startedInNewColumn`, which is what makes its own command then run
// `workbench.action.lockEditorGroup` on the group it just made. In a tile that is half the window
// spent and a group nothing else can be put in. No setting reaches it: `preferredLocation` only
// chooses between the side bar and the editor area.
//
// The FALLBACK is the edit and the only edit, so an explicit column is still honoured and a
// Claude group that already exists is still reused. The flag is simply not set, which leaves it
// the `!1` its own declaration gave it a few characters earlier - so nothing locks, and the
// caller needs no patch of its own. [claude-code 2.1.261]
//
// Unpatched, a session opens split-right and locked, exactly as a machine that never ran this
// app shows it.
const MARKER = '__CT_CHAT_COLUMN_1__';

// The whole else-branch of the column pick, which is what ties the three names together. Anchored
// on `findUnusedColumn` - a class method, so it survives minification under its own name - and on
// the `ViewColumn.Beside` seed above it, which appears five times in this bundle alone and
// exactly once in this shape. The backreference pins the fallback's target to the same local the
// branch above assigns, so a shape that merely looks like this cannot match.
//
// Every identifier class is [\w$] and never \w: $ is a legal identifier character and this
// minifier does use it - the reuse lookup here is called `ih$`.
const COLUMN_RE = /(=([\w$]+)\.ViewColumn\.Beside;let ([\w$]+)=[\w$]+\(\);if\(\3\)([\w$]+)=\3\.viewColumn;else )\4=this\.findUnusedColumn\(\),[\w$]+=!0/;

function apply(source) {
  const hits = matchCount(source, COLUMN_RE);
  if (!hits) return { refused: 'the column fallback has moved' };
  // Refused rather than guessed at: the two would be indistinguishable and the wrong one is not
  // recoverable from the outside.
  if (hits !== 1) return { refused: `the column fallback matches ${hits} times, expected 1` };

  // A function, because the anchors are minified source and a bare $ in a replacement string
  // would be read as a $& or $' substitution.
  return {
    source: source.replace(COLUMN_RE, (match, head, vscode, local, column) =>
      `${head}${column}=${vscode}.ViewColumn.One/*${MARKER}*/`),
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
