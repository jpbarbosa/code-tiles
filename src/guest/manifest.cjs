'use strict';

// Every change this app makes inside an editor window, in the order they are applied. A seam
// that is not on this list does not exist; a change that is not a seam does not belong in
// src/guest/ at all. The question that decides it: would a stock code-server do this itself?
module.exports = [
  require('./seams/dark.cjs'),
  require('./seams/modern.cjs'),
  require('./seams/card.cjs'),
  require('./seams/frame.cjs'),
  require('./seams/chrome.cjs'),
  require('./seams/welcome.cjs'),
  require('./seams/trust.cjs'),
  require('./seams/ground.cjs'),
  require('./seams/tint.cjs'),
  require('./seams/identity.cjs'),
  require('./seams/chat-icon.cjs'),
  require('./seams/branch.cjs'),
  require('./seams/maximize.cjs'),
  require('./seams/terminals.cjs'),
  require('./seams/layout.cjs'),
  require('./seams/focus.cjs'),
  require('./seams/zoom.cjs'),
];
