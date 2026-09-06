'use strict';

// The app zooms every tile at once from its View menu, and Actual Size is Cmd+0 there. A menu
// accelerator loses to a chord the editor binds - the workbench's dispatcher takes the key for
// Focus into Primary Side Bar and the item never fires - so the chord is given back rather than
// fought for. Zoom In and Zoom Out need nothing: the web build binds neither.
module.exports = {
  name: 'zoom',
  keybindings: [{ key: '$mod+0', command: '-workbench.action.focusSideBar' }],
};
