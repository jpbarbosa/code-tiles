import { ipcMain } from 'electron';

// The whole surface between the app's three layers: one channel, one table. A new feature adds
// a row here, never a channel, and the shell never talks to a guest directly.
export function installIpc({ desk }) {
  const projects = desk.projects;

  const commands = {
    'state': () => desk.render(),
    'ground': ({ ground }) => desk.setGround(ground),
    'mode:set': ({ mode }) => desk.setMode(mode),
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
    return command(message.payload || {});
  };

  ipcMain.handle('ct:call', (_event, message) => dispatch(message));
  ipcMain.on('ct:call', (_event, message) => {
    dispatch(message).catch((error) => console.error('[code-tiles]', error));
  });
}
