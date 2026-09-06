import { Menu, app } from 'electron';

import { APP_CHORD, CYCLE_CHORD, DEVTOOLS_CHORD, EDITOR_CHORD, IS_MAC } from './platform.js';

// One modifier above the editor's own, so nothing here shadows a chord you press inside a tile.
// Three deliberate exceptions take the editor's modifier plainly: the cycle chord, Preferences,
// and Open Project - and src/guest/seams/pick.cjs gives that last one back.
//
// The editor wins any chord it binds itself, since its dispatcher sees the key before the menu
// does, and the app's family is not as free as it looks: on macOS Ctrl+Cmd+I is Chat and
// Ctrl+Cmd+1/9 move an editor between groups. docs/CONSTRAINTS.md says how to check a chord.
export function installMenu({ desk, preferences, pick }) {
  const projectNumbers = Array.from({ length: 9 }, (_, i) => ({
    label: `Project ${i + 1}`,
    accelerator: `${APP_CHORD}+${i + 1}`,
    click: () => desk.focusByIndex(i),
  }));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // Not `role: 'appMenu'`, which has no room for a Preferences item. The editor's own modifier
    // is safe to take plainly for `,`: the web build binds it to nothing at all, so the editor's
    // dispatcher lets it through and the item fires from inside a tile as readily as from the
    // strip. The app menu itself is macOS's shape; elsewhere its items belong to File and Help.
    ...(IS_MAC ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: `${EDITOR_CHORD}+,`, click: () => preferences.open() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        // The strip's + and this item are one behaviour, which is why it is the command and not
        // the picker: nothing to pick from is not a screen worth showing.
        { label: 'Open Project...', accelerator: `${EDITOR_CHORD}+O`, click: () => pick() },
        { label: 'Open Folder...', accelerator: `${APP_CHORD}+O`, click: () => desk.browse() },
        { label: 'Close Project', accelerator: `${APP_CHORD}+W`, click: () => desk.closeFocused() },
        ...(IS_MAC ? [] : [
          { type: 'separator' },
          { label: 'Preferences…', accelerator: `${EDITOR_CHORD}+,`, click: () => preferences.open() },
          { type: 'separator' },
          { role: 'quit' },
        ]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Grid', accelerator: `${APP_CHORD}+G`, click: () => desk.setMode('grid') },
        { label: 'Single Project', accelerator: `${APP_CHORD}+E`, click: () => desk.setMode('single') },
        { label: 'Reset Tile Sizes', accelerator: `${APP_CHORD}+0`, click: () => desk.resetGrid() },
        { type: 'separator' },
        // Not the zoomIn/zoomOut/resetZoom roles: a role zooms whichever webContents holds the
        // keyboard, which is the SHELL whenever a gutter or the strip does, and a zoomed shell
        // draws its gutters in CSS pixels that main's rects no longer agree with. Zoom In twice
        // because `Plus` is the shifted key and the unshifted press is the one people make.
        { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => desk.zoom(1) },
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', visible: false, click: () => desk.zoom(1) },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => desk.zoom(-1) },
        // Available only because the `zoom` seam takes it back off the editor, which binds it to
        // Focus into Primary Side Bar and would swallow the key before the menu ever saw it.
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => desk.zoom(0) },
        { type: 'separator' },
        { label: 'Reload Shell', accelerator: `Shift+${EDITOR_CHORD}+R`, click: () => desk.reloadShell() },
        // Not the toggleDevTools role: it opens the SHELL's, docked, which is a pane under the
        // grid. These open detached, and the first one opens the window you are working in.
        { label: 'Developer Tools', accelerator: DEVTOOLS_CHORD, click: () => desk.inspect('project') },
        { label: 'Shell Developer Tools', accelerator: `Shift+${APP_CHORD}+I`, click: () => desk.inspect('shell') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Next Project', accelerator: CYCLE_CHORD, click: () => desk.cycle(1) },
        { label: 'Previous Project', accelerator: `Shift+${CYCLE_CHORD}`, click: () => desk.cycle(-1) },
        { type: 'separator' },
        ...projectNumbers,
        { type: 'separator' },
        { role: 'minimize' },
        ...(IS_MAC ? [{ role: 'zoom' }] : []),
      ],
    },
  ]));

  app.on('will-quit', () => Menu.setApplicationMenu(null));
}
