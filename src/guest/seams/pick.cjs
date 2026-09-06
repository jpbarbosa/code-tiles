'use strict';

// The app's own File menu opens the picker on Cmd+O. A menu accelerator loses to a chord the
// editor binds - its dispatcher sees the key first and the item never fires - so the chord is
// given back rather than fought for. Three commands hold `primary:2093` in the bundle, each
// behind its own `when`, and which one is live depends on the build: all three are returned,
// since a `-command` for a binding that is not active costs nothing.
module.exports = {
  name: 'pick',
  keybindings: [
    { key: 'cmd+o', command: '-workbench.action.files.openFile' },
    { key: 'cmd+o', command: '-workbench.action.files.openFolderViaWorkspace' },
    { key: 'cmd+o', command: '-workbench.action.files.openFileFolder' },
  ],
};
