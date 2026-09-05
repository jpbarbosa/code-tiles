import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// What the picker draws: every folder ever opened here, in the app's one project order, which is
// the order the strip and the number shortcuts already read. Nothing is sorted by recency,
// because recency is not derivable from a folder and this tree stores nothing it can derive.
//
// Its own file because src/main/picker.js reaches for Electron, and this half is a pure function
// over a list of paths.
export function pickerRows(projects, home = os.homedir()) {
  return projects
    // Deleted or unmounted since it was last open: opening it would hand code-server a path it
    // cannot load. Dropped from the list rather than forgotten, so a volume coming back brings
    // its projects with it.
    .filter((project) => isDirectory(project.folder))
    .map((project) => ({
      folder: project.folder,
      name: project.name,
      hue: project.hue,
      icon: project.icon,
      open: project.open,
      // Spelled here because only main knows what $HOME is: the page has no filesystem.
      short: shortPath(project.folder, home),
    }));
}

function shortPath(folder, home) {
  const prefix = home.endsWith(path.sep) ? home : home + path.sep;
  return folder.startsWith(prefix) ? `~${path.sep}${folder.slice(prefix.length)}` : folder;
}

function isDirectory(folder) {
  try { return fs.statSync(folder).isDirectory(); } catch { return false; }
}
