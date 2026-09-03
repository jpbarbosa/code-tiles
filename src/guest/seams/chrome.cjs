'use strict';

// The editor's title bar and status bar, gone, through the editor's own switches.
//
// In web the workbench decides for itself whether a title bar is needed: it draws one if the
// command center, the layout control, the editor actions or a non-compact menu bar want to live
// in it, and hides it outright when none of them do. Turn those off and the layout reflows with
// no band left behind, which is what CSS could never do here - the parts are placed in JS, so
// display:none leaves the space it was given.
//
// The menu is not lost with it: at "compact" the workbench moves the hamburger to the top of the
// activity bar, which is where the identity seam then draws the badge.
module.exports = {
  name: 'chrome',
  settings: {
    'window.commandCenter': false,
    'workbench.layoutControl.enabled': false,
    'window.menuBarVisibility': 'compact',
    'workbench.statusBar.visible': false,
  },
};
