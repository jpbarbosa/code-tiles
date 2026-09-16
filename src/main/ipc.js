import { ipcMain } from 'electron';

import { homeRow, pickerRows } from './picker-rows.js';

// The whole surface between the app's three layers: one channel, one table. A new feature adds
// a row here, never a channel, and the shell never talks to a guest directly. The table is
// returned as well as installed: a menu item and the button that does the same thing are one
// behaviour, and the menu is just another caller.
export function installIpc({ desk, usage, popover, picker, preferences, events, patches }) {
  const projects = desk.projects;
  const rows = (query) => pickerRows(projects.all(), { query });
  // The folder dialog, from the picker's last row or in place of a picker with nothing in it.
  // The screen goes first either way: a folder dialog behind a scrim reads as two dialogs.
  const browse = () => { picker.close(); return desk.browse(); };

  // The strip's own buttons, each of them finished the moment it is clicked. The keyboard goes
  // back to the tile BEFORE the command runs, so a screen this opens (the picker, the usage
  // panel) still takes it from there, and the press that dismisses that screen leaves the next
  // keystroke in an editor rather than in the shell page, where it would re-fire the button.
  const STRIP_COMMANDS = new Set(['layout:set', 'mode:set', 'project:menu', 'project:pick', 'sound:set', 'usage:popover']);

  const commands = {
    'state': () => { desk.render(); usage.publish(); picker.publish(); patches.publish(); },
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
    'usage:connect': async () => { popover.pin(); await popover.shown(); return usage.connect(); },
    'usage:code': ({ code }) => usage.submit(code),
    'usage:disconnect': () => usage.disconnect(),
    // The preferences window, which is a window of its own for the reason the other two are. A
    // dial moved re-renders the desk, which is what carries the new rung into every open window.
    'preferences:state': () => preferences.state,
    'preferences:set': ({ dial, rung }) => {
      const state = preferences.set(dial, rung);
      desk.render();
      // Choosing it plays it once, which is silence when the choice was off.
      if (dial === 'sound') desk.chime();
      return state;
    },
    'preferences:height': ({ height }) => preferences.fit(height),
    // The strip's speaker: the Sound row's own command, from where you already are.
    'sound:set': ({ rung }) => commands['preferences:set']({ dial: 'sound', rung }),
    // The Claude Events log, which is a window of its own for the reason the other three are.
    // A window reporting what its own chat tab wears - the one half of that seam the app can see.
    'claude:icon': ({ icons }, folder) => events.icons(folder, icons),
    'events:state': () => events.state,
    'events:clear': () => events.clear(),
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
    // A project's own menu, drawn by main at the cursor: a chip names its project, and the badge
    // inside a window is the sender and says nothing.
    'project:menu': ({ folder }, sender) => desk.projectMenu(folder || sender),
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
    // One list for what was typed: the projects that match, then folders on disk that no project
    // has claimed. The page asks again on every keystroke, since only main has a filesystem.
    'picker:list': ({ query }) => rows(query),
    'picker:home': () => homeRow(),
    'project:browse': browse,
  };

  const dispatch = async (message) => {
    const command = commands[message?.type];
    if (!command) throw new Error(`unknown command: ${message?.type}`);
    if (STRIP_COMMANDS.has(message.type)) desk.returnKeyboard();
    // The sender's folder, for the commands that are a window talking about itself.
    return command(message.payload || {}, message.folder);
  };

  ipcMain.handle('ct:call', (_event, message) => dispatch(message));
  ipcMain.on('ct:call', (_event, message) => {
    dispatch(message).catch((error) => console.error('[code-tiles]', error));
  });

  return commands;
}
