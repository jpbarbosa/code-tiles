import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// What the picker draws for what you typed: ONE list, never two. The projects opened here match
// first, and under them come folders on disk that no project has claimed yet - so the same field
// finds a tile you already have and a folder you have never opened. An empty query is the whole
// project list in the app's one project order, which the strip and the number shortcuts already
// read; nothing is sorted by recency, because recency is not derivable from a folder and this
// tree stores nothing it can derive.
//
// Its own file because src/main/picker.js reaches for Electron, and this half is a pure function
// over a list of paths.

const FOLDER_MATCHES = 6;
const PATH_MATCHES = 24;
const PER_DIRECTORY = 512;
// Four levels under $HOME is 2552 folders and 813 reads here - 21 ms warm, which a keystroke can
// pay. Five is 5638 and 92 ms, and no cap at all is 98669 and 4.9 SECONDS. The read budget is the
// backstop for a home directory shaped differently from this one; four levels never reaches it.
const DEPTH = 4;
const READS = 1500;
// $HOME's own system folders. Skipping Library is most of what makes the walk affordable, and it
// is not yours in any sense that matters here; the other two are a package manager's, not a
// project you would open.
const SKIP = new Set(['Library', 'node_modules', 'vendor']);

export function pickerRows(projects, { query = '', home = os.homedir() } = {}) {
  // Deleted or unmounted since it was last open: opening it would hand code-server a path it
  // cannot load. Dropped from the list rather than forgotten, so a volume coming back brings its
  // projects with it.
  const live = projects.filter((project) => isDirectory(project.folder));
  const text = query.trim();
  if (!text) return live.map((project) => projectRow(project, home));
  return isPath(text) ? underPath(text, live, home) : byName(text, live, home);
}

// The one folder every account has, which is where browsing starts when nothing you have opened
// here is what you want. Spelled in main because only main knows what $HOME is.
export function homeRow(home = os.homedir()) {
  return { folder: home, name: path.basename(home) || home };
}

// A query is a path the moment it starts like one. That is what makes the home row a place to
// browse FROM - it seeds `~`, and every `/` after it walks one level down.
const isPath = (text) => text.startsWith(path.sep) || text.startsWith('~');

function underPath(text, projects, home) {
  const full = expand(text, home);
  // A trailing separator asks for what is INSIDE; anything else completes the last segment.
  const inside = text.endsWith('/') || full === path.sep;
  const directory = inside ? full : path.dirname(full);
  const prefix = inside ? '' : path.basename(full).toLowerCase();
  const claimed = new Map(projects.map((project) => [project.folder, project]));

  const keep = (name) => (prefix ? name.toLowerCase().startsWith(prefix) : !name.startsWith('.'));

  return directories(directory, keep)
    .slice(0, PATH_MATCHES)
    .map((name) => path.join(directory, name))
    // A child that is already a project keeps its icon, its OPEN badge and its ×: browsing to a
    // folder and finding it in the list above must not be two different rows.
    .map((folder) => (claimed.has(folder) ? projectRow(claimed.get(folder), home) : folderRow(folder, home)));
}

function byName(text, projects, home) {
  const needle = text.toLowerCase();
  const matched = projects
    .map((project) => [rank(project, needle), project])
    .filter(([score]) => score > 0)
    // Sort is stable, so projects of equal score keep the app's own order.
    .sort((a, b) => b[0] - a[0])
    .map(([, project]) => projectRow(project, home));

  const claimed = new Set(projects.map((project) => project.folder));
  const found = neighbours(projects, needle, home)
    .filter((folder) => !claimed.has(folder))
    .sort(closest(needle))
    .slice(0, FOLDER_MATCHES)
    .map((folder) => folderRow(folder, home));

  return [...matched, ...found];
}

function rank(project, needle) {
  const name = project.name.toLowerCase();
  if (name.startsWith(needle)) return 3;
  if (name.includes(needle)) return 2;
  return project.folder.toLowerCase().includes(needle) ? 1 : 0;
}

// A total order, so the answer does not move around as the scan order does. Shallower is nearer:
// a query that names a folder also matches everything inside it, and the folder itself is the row
// you meant.
function closest(needle) {
  const last = needle.split('/').pop();
  const leads = (folder) => (path.basename(folder).toLowerCase().startsWith(last) ? 1 : 0);
  return (a, b) => (leads(b) - leads(a))
    || (a.split(path.sep).length - b.split(path.sep).length)
    || a.localeCompare(b);
}

// Your own files, and not the disk: $HOME to a fixed depth, plus the parent of any project you
// keep somewhere else. Breadth first, so what is near the top is found even where the walk stops.
function neighbours(projects, needle, home) {
  const roots = [home];
  for (const project of projects) {
    const parent = path.dirname(project.folder);
    // Not one the home walk already covers, and not one that CONTAINS home: $HOME itself is a
    // project on this machine, and its parent is /Users - every other account on the Mac.
    if (within(parent, home) || within(home, parent) || roots.includes(parent)) continue;
    roots.push(parent);
  }

  // Nothing hidden until the query asks for it, by a leading dot or a dot after a separator.
  const hidden = needle.startsWith('.') || needle.includes('/.');
  const keep = (name) => !SKIP.has(name) && (hidden || !name.startsWith('.'));

  // A set, because two roots can nest and one folder is one row however many ways there are to
  // reach it.
  const found = new Set();
  const queue = roots.map((root) => [root, 0]);
  for (let reads = 0; queue.length && reads < READS; reads += 1) {
    const [directory, depth] = queue.shift();
    for (const name of children(directory, keep)) {
      const folder = path.join(directory, name);
      if (fits(folder, name, needle)) found.add(folder);
      if (depth + 1 < DEPTH) queue.push([folder, depth + 1]);
    }
  }
  return [...found];
}

// A query with a separator in it is about the PATH, which is the whole reason `sites/orbit` finds
// a folder that no single name matches. Without one it is a name, and a path would match half
// your files by the directory they happen to sit in.
const fits = (folder, name, needle) => (needle.includes('/')
  ? folder.toLowerCase().includes(needle)
  : name.toLowerCase().includes(needle));

const within = (folder, root) => folder.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

// One directory, listed for a path query. A symlink here is followed - it is a place you navigated
// to, and a symlinked project is a directory to everyone but readdir, which reports the link.
const directories = (directory, keep) => entries(directory, keep)
  .filter((entry) => entry.isDirectory()
    || (entry.isSymbolicLink() && isDirectory(path.join(directory, entry.name))))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b))
  .slice(0, PER_DIRECTORY);

// The walk's own listing, which follows NO link: resolving one can reach a network path, and the
// two deploy symlinks under ~/Sites cost 20 ms EACH - 40 ms of what was a 68 ms keystroke.
const children = (directory, keep) => entries(directory, keep)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// The caller's own test comes first, since it is the cheapest and the most selective.
function entries(directory, keep = () => true) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => keep(entry.name));
  } catch { return []; }
}

function expand(text, home) {
  if (text === '~') return home;
  return text.startsWith(`~${path.sep}`) ? path.join(home, text.slice(2)) : text;
}

const projectRow = (project, home) => ({
  folder: project.folder,
  name: project.name,
  hue: project.hue,
  icon: project.icon,
  open: project.open,
  short: shortPath(project.folder, home),
  project: true,
});

// No hue and no icon: drawing an unclaimed folder as a project promises a tile that is not there.
const folderRow = (folder, home) => ({
  folder,
  name: path.basename(folder) || folder,
  short: shortPath(folder, home),
  project: false,
});

function shortPath(folder, home) {
  const prefix = home.endsWith(path.sep) ? home : home + path.sep;
  return folder.startsWith(prefix) ? `~${path.sep}${folder.slice(prefix.length)}` : folder;
}

// throwIfNoEntry, because a broken symlink is COMMON in a home directory and a statSync that
// throws costs ~3.6 ms to build its error: eleven of them were 40 ms of a 65 ms keystroke.
function isDirectory(folder) {
  try { return fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory() ?? false; } catch { return false; }
}
