import { Menu, app } from 'electron';

// Ctrl+Cmd throughout, so nothing here shadows the editor's own Cmd+1, Cmd+W or Cmd+O inside a
// tile. Cmd+` is the deliberate exception: it is macOS's "next window in this app", and a tile
// is a window.
//
// The editor wins any chord it binds itself, since its dispatcher sees the key before the menu
// does, and Ctrl+Cmd is not the free family it looks like: Ctrl+Cmd+I is Chat and Ctrl+Cmd+1 and
// Ctrl+Cmd+9 move an editor between groups. Devtools sits on Alt+Cmd+I for that reason, which is
// also the chord a browser puts them on. docs/CONSTRAINTS.md says how to check a chord.
export function installMenu(desk) {
  const projectNumbers = Array.from({ length: 9 }, (_, i) => ({
    label: `Project ${i + 1}`,
    accelerator: `Control+Command+${i + 1}`,
    click: () => desk.focusByIndex(i),
  }));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Open Project...', accelerator: 'Control+Command+O', click: () => desk.pick() },
        { label: 'Close Project', accelerator: 'Control+Command+W', click: () => desk.closeFocused() },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Grid', accelerator: 'Control+Command+G', click: () => desk.setMode('grid') },
        { label: 'Single Project', accelerator: 'Control+Command+E', click: () => desk.setMode('single') },
        { label: 'Reset Tile Sizes', accelerator: 'Control+Command+0', click: () => desk.resetGrid() },
        { type: 'separator' },
        { label: 'Reload Shell', accelerator: 'Shift+Command+R', click: () => desk.reloadShell() },
        // Not the toggleDevTools role: it opens the SHELL's, docked, which is a pane under the
        // grid. These open detached, and the first one opens the window you are working in.
        { label: 'Developer Tools', accelerator: 'Alt+Command+I', click: () => desk.inspect('project') },
        { label: 'Shell Developer Tools', accelerator: 'Shift+Control+Command+I', click: () => desk.inspect('shell') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Next Project', accelerator: 'Command+`', click: () => desk.cycle(1) },
        { label: 'Previous Project', accelerator: 'Shift+Command+`', click: () => desk.cycle(-1) },
        { type: 'separator' },
        ...projectNumbers,
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
      ],
    },
  ]));

  app.on('will-quit', () => Menu.setApplicationMenu(null));
}
