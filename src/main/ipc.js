import { ipcMain } from 'electron';

import { pickerRows } from './picker-rows.js';

// The whole surface between the app's three layers: one channel, one table. A new feature adds
// a row here, never a channel, and the shell never talks to a guest directly.
export function installIpc({ desk, usage, popover, picker }) {
  const projects = desk.projects;
  const rows = () => pickerRows(projects.all());
  // The folder dialog, from the picker's last row or in place of a picker with nothing in it.
  // The screen goes first either way: a folder dialog behind a scrim reads as two dialogs.
  const browse = () => { picker.close(); return desk.browse(); };

  const commands = {
    'state': () => { desk.render(); usage.publish(); picker.publish(); },
    'ground': ({ ground }) => desk.setGround(ground),
    // A window saying it was clicked into. Its own focus is already there.
    'focus': (_payload, folder) => desk.adoptFocus(folder),
    // A window saying what its own parts are doing; the strip choosing for every window at once.
    'layout': ({ parts }, folder) => desk.reportParts(folder, parts),
    'layout:set': ({ part, visible }) => desk.setLayout(part, visible),
    // The panel is a window of its own, so it asks for what it draws and says how tall it got.
    'usage:popover': ({ anchor }) => popover.toggle(anchor),
    'usage:state': () => usage.state,
    'usage:height': ({ height }) => popover.fit(height),
    'usage:connect': () => { popover.pin(); return usage.connect(); },
    'usage:code': ({ code }) => usage.submit(code),
    'usage:disconnect': () => usage.disconnect(),
    'mode:set': ({ mode }) => desk.setMode(mode),
    // A window's maximize item, saying what it will do rather than what it is, so the state has
    // one copy and it is the window's own.
    'project:maximize': ({ maximized }, folder) => desk.maximize(folder, Boolean(maximized)),
    // The gutter drag: where the pointer is, in the window's own coordinates. Main still decides
    // where every tile goes.
    'grid:resize': ({ axis, index, position }) => desk.resizeGrid({ axis, index, position }),
    'grid:reset': ({ axis }) => desk.resetGrid(axis),
    'project:focus': ({ folder }) => desk.focus(folder),
    // The strip names a project; a window closing itself is the sender and says nothing.
    'project:close': ({ folder }, sender) => desk.close(folder || sender),
    // The grid's gesture, which starts on a window's own grip: the seam reports the press and the
    // release, and main follows the cursor in between. Esc in that window abandons it.
    'project:drag': (_payload, folder) => desk.startDrag(folder),
    'project:drop': ({ cancel }) => desk.endDrag(Boolean(cancel)),
    'project:forget': ({ folder }) => { projects.forget(folder); desk.render(); },
    'project:open': ({ folder }) => desk.open(folder),
    // The strip's chip drag, one insertion per chip it passes. The grid's swap has no row here:
    // that gesture is held by main from the press to the release, so it moves the projects itself.
    'project:move': ({ folder, index }) => { projects.move(folder, index); desk.render(); },
    // That gesture abandoned: the open order as it was when the press began, which the strip keeps
    // because the strip is what reordered.
    'project:restore': ({ folders }) => { projects.restore(folders); desk.render(); },
    // The picker, which is a window of its own for the reason the usage panel is. Nothing to
    // pick from is not a screen worth showing, so an empty list goes straight to the dialog.
    'project:pick': () => (rows().length ? picker.toggle() : browse()),
    'picker:list': () => rows(),
    'project:browse': browse,
  };

  const dispatch = async (message) => {
    const command = commands[message?.type];
    if (!command) throw new Error(`unknown command: ${message?.type}`);
    // The sender's folder, for the commands that are a window talking about itself.
    return command(message.payload || {}, message.folder);
  };

  ipcMain.handle('ct:call', (_event, message) => dispatch(message));
  ipcMain.on('ct:call', (_event, message) => {
    dispatch(message).catch((error) => console.error('[code-tiles]', error));
  });
}
