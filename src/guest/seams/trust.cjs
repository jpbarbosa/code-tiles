'use strict';

// Restricted mode, off. Every folder a tile shows was opened through this app's own picker, on
// this machine, by the person looking at it - there is no untrusted author in the story.
//
// It is not cosmetic. An extension that declares `untrustedWorkspaces.supported: false` is
// DISABLED outright in a workspace that has not been trusted, and Claude Code declares exactly
// that, so a tile that was never trusted simply has no Claude in it. The prompt that would fix
// it is a modal in a window with no title bar and no status bar to raise it from.
//
// The trade this makes: a folder's tasks and extensions run in a tile without the restricted
// mode guard. That is the same trade as trusting the folder by hand, taken once for all of them.
module.exports = {
  name: 'trust',
  settings: {
    'security.workspace.trust.enabled': false,
  },
};
