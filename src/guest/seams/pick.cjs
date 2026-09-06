'use strict';

// The app's own File menu opens the picker on the editor's own modifier + O. A menu accelerator
// loses to a chord the editor binds - its dispatcher sees the key first and the item never fires -
// so the chord is given back rather than fought for. Three commands hold that binding in the
// bundle, each behind its own `when`, and which one is live depends on the build: all three are
// returned, since a `-command` for a binding that is not active costs nothing.
//
// `$mod` is whichever modifier the editor owns on this host; disk/keybindings.js spells it out.
module.exports = {
  name: 'pick',
  keybindings: [
    { key: '$mod+o', command: '-workbench.action.files.openFile' },
    { key: '$mod+o', command: '-workbench.action.files.openFolderViaWorkspace' },
    { key: '$mod+o', command: '-workbench.action.files.openFileFolder' },
  ],
};
