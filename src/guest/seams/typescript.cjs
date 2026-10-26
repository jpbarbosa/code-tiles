'use strict';

// One TypeScript server per window instead of two, and no type downloads. Each window has its own
// extension host, so each project paid for a syntax-only tsserver beside the semantic one (105 to
// 126 MB apiece, 2026-10-26) and a typingsInstaller fetching @types the projects install already.
// The syntax server only answers while the semantic one is still loading. Defaults: yours win.
module.exports = {
  name: 'typescript',
  defaults: {
    'typescript.tsserver.useSyntaxServer': 'never',
    'typescript.disableAutomaticTypeAcquisition': true,
  },
};
