'use strict';

// The parts of an editor window this app does not show, each through the editor's own switch.
//
// The title bar and status bar: in web the workbench decides for itself whether a title bar is
// needed - it draws one if the command center, the layout control, the editor actions or a
// non-compact menu bar want to live in it, and hides it outright when none of them do. Turn
// those off and the layout reflows with no band left behind, which is what CSS could never do
// here: the parts are placed in JS, so display:none leaves the space it was given.
//
// The menu is not lost with it: at "compact" the workbench moves the hamburger to the top of the
// activity bar, which is where the identity seam then draws the badge.
//
// The chat panel: the secondary side bar's default is `visibleInWorkspace`, and a tile always
// has a folder open, so every window came up with Chat showing. Claude lives in the terminal
// here. This is a default, not a lock: Cmd+Alt+B still opens it, and a workspace that stored a
// layout before this setting existed keeps that layout until its key is dropped - see the
// per-workspace layout fact in docs/CONSTRAINTS.md.
module.exports = {
  name: 'chrome',
  settings: {
    'window.commandCenter': false,
    'workbench.layoutControl.enabled': false,
    'window.menuBarVisibility': 'compact',
    'workbench.statusBar.visible': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
  },
};
