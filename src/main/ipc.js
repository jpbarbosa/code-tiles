import { ipcMain } from 'electron';

// The whole surface between the app's three layers: one channel, one table. A new feature adds
// a row here, never a channel, and the shell never talks to a guest directly.
export function installIpc({ desk, usage, popover }) {
  const projects = desk.projects;

  const commands = {
    'state': () => { desk.render(); usage.publish(); },
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
    // A window's maximize item, saying what it will do rather than what it is: the same press
    // claims the focus, and the master IS the focused project.
    'project:maximize': ({ maximized }, folder) => desk.maximize(folder, Boolean(maximized)),
    // The gutter drag: where the pointer is, in the window's own coordinates. Main still decides
    // where every tile goes.
    'grid:resize': ({ axis, index, position }) => desk.resizeGrid({ axis, index, position }),
    'grid:reset': ({ axis }) => desk.resetGrid(axis),
    'project:focus': ({ folder }) => desk.focus(folder),
    'project:close': ({ folder }) => desk.close(folder),
    'project:forget': ({ folder }) => { projects.forget(folder); desk.render(); },
    'project:open': ({ folder }) => desk.open(folder),
    'project:move': ({ folder, index }) => { projects.move(folder, index); desk.render(); },
    'project:swap': ({ a, b }) => { projects.swap(a, b); desk.render(); },
    'project:pick': () => desk.pick(),
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
