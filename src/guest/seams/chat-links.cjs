'use strict';

const { matchCount } = require('../shape.cjs');

// A file link in the Claude chat opens whatever the file is, not only text. Filed upstream as
// #37989 and #51015. [claude-code 2.1.270]
const MARKER = '__CT_CHAT_LINKS_1__';

// The bundle opens documents as text in several places; this is the one that goes on to seek a
// location in it, which is what the lookahead on `searchText` keys on.
const OPEN_RE = /([\w$]+)\.window\.showTextDocument\(([\w$]+)\)\.then\(\(?([\w$]+)\)?=>\{(?=if\([\w$]+\?\.searchText\))/;

// Every chat link - a markdown link, a tool row's file name, an @-mention - lands on that open, and
// `showTextDocument` rejects an image, a sound or a video with nothing hung on the rejection, so the
// click does nothing and says nothing. What the text editor refuses goes to `vscode.open`, which
// picks the editor VS Code itself would. That resolves with no editor, so the location step is
// skipped rather than thrown on. A function replacement, because a bare $ in a string is a
// substitution.
function apply(source) {
  const hits = matchCount(source, OPEN_RE);
  if (hits !== 1) return { refused: `the chat's file open matches ${hits} times, expected 1` };
  return {
    source: source.replace(OPEN_RE, (_, vscode, uri, editor) => `${vscode}.window.showTextDocument(${uri})`
      + `.catch(()=>${vscode}.commands.executeCommand("vscode.open",${uri}))`
      + `.then((${editor})=>{/*${MARKER}*/if(!${editor})return;`),
  };
}

module.exports = {
  name: 'chat-links',
  extension: {
    id: /^anthropic\.claude-code-/,
    file: 'extension.js',
    marker: MARKER,
    stamp: /__CT_CHAT_LINKS_\d+__/,
    degrades: 'a chat link to an image, sound or video does nothing when clicked',
    apply,
  },
};
