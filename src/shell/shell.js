// The shell draws around the tiles: the strip, the empty state, and the focused tile's glow in
// the gutter. It never draws over a tile, because a WebContentsView paints above this page by
// construction - anything that has to appear inside a window is a seam, not an overlay.
import { USAGE_WINDOWS, elapsedFraction, projectMark, rampFor } from './format.js';

const chips = document.getElementById('chips');
const grounds = document.getElementById('grounds');
const glow = document.getElementById('glow');
const empty = document.getElementById('empty');
const emptyProjects = document.getElementById('empty-projects');
const emptyAdd = document.getElementById('empty-add');
const stage = document.getElementById('stage');
const usage = document.getElementById('usage');
const sound = document.getElementById('sound');
const patches = document.getElementById('patches');
const splitters = document.getElementById('splitters');
const stripScrim = document.getElementById('strip-scrim');

let state = { projects: [], rects: [], splitters: [], mode: 'grid', focused: null, strip: 36, parts: {},
  grounds: {} };
let drag = null;
let sorting = null;
// Which tiles in the empty state are ticked. The page's own, not the app's: it is a selection
// being made, and it is gone the moment the projects it names are open.
const selected = new Set();
const EMPTY_TILES = 8;

const call = (type, payload) => window.ct.call(type, payload).catch((error) => console.error(error));

function render() {
  const open = state.projects.filter((project) => project.open);
  renderChips(open);
  renderGrounds(open);
  renderGlow(open);
  renderSplitters();
  renderEmpty(open);
  for (const segment of document.querySelectorAll('.segment')) {
    segment.setAttribute('aria-pressed', String(segment.dataset.mode === state.mode));
  }
  chips.hidden = state.mode === 'grid';
  for (const button of document.querySelectorAll('.part')) {
    button.setAttribute('aria-pressed', String(Boolean(state.parts?.[button.dataset.part])));
  }
  sound.setAttribute('aria-pressed', String(state.sound === 'on'));
}

// The stage with nothing on it: the projects this app already knows, offered as tiles, and one
// button under them. In the app's one project order, which is the order the picker's empty query
// answers with and the only one this tree has - nothing here is sorted by recency, because
// recency is not derivable from a folder and nothing stores it.
function renderEmpty(open) {
  empty.hidden = open.length > 0;
  if (empty.hidden) {
    selected.clear();
    return;
  }
  const shown = state.projects.slice(0, EMPTY_TILES);
  // A project forgotten while its tile was ticked would otherwise be opened by a button counting
  // a row that is no longer on screen.
  const folders = new Set(shown.map((project) => project.folder));
  for (const folder of selected) if (!folders.has(folder)) selected.delete(folder);

  // Rebuilt only when the LIST changes, never when a tick does: replacing the button the keyboard
  // is on drops the focus to the body, and the tile after it then costs a walk back through the
  // strip. The icon is in the signature because a favicon arrives one render late.
  const signature = shown.map((project) => `${project.folder}\u0000${project.icon || ''}`).join('\n');
  if (signature !== emptyProjects.dataset.signature) {
    emptyProjects.dataset.signature = signature;
    emptyProjects.replaceChildren(...shown.map(emptyTile));
  }
  emptyProjects.hidden = shown.length === 0;
  for (const tile of emptyProjects.children) {
    tile.setAttribute('aria-pressed', String(selected.has(tile.dataset.folder)));
  }
  emptyAdd.textContent = selected.size
    ? `Open ${selected.size} Selected Project${selected.size > 1 ? 's' : ''}`
    : 'Open Project';
}

// The same mark the chip and the picker row wear, at this page's own size. A button rather than
// a link, so the keyboard ticks one with Space for nothing; which tiles are ticked is written
// above, on every render, because a tile outlives the tick it is wearing.
function emptyTile(project) {
  const tile = document.createElement('button');
  tile.className = 'project-tile';
  tile.style.setProperty('--hue', project.hue);
  tile.dataset.folder = project.folder;
  tile.title = project.folder;

  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.append(projectMark(project));

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = project.name;

  tile.append(mark, name);
  return tile;
}

// Account-global, so this widget is about the account and not about any tile. Green while there
// is room, red at the cap: the colour is the reading, the length is how far along.
function renderUsage(account) {
  const connected = Boolean(account.connected) && !account.needsReauth;
  const shown = (reading) => (reading ? `${Math.round(reading.utilization)}%` : '-');

  usage.dataset.connected = String(connected);
  usage.querySelector('.offer').textContent = account.needsReauth ? 'Reconnect Claude' : 'Connect Claude';
  usage.title = connected
    ? `Claude usage: 5h ${shown(account.fiveHour)}, 7d ${shown(account.sevenDay)}. Click for detail.`
    : 'Connect your Claude account to see usage.';

  // No clock of its own: the mark moves when a reading is published, every five minutes, which is
  // about two pixels on the 5h bar and far less on the 7d.
  usage.querySelectorAll('.bar').forEach((bar) => {
    const reading = account[bar.dataset.window];
    const utilization = reading?.utilization || 0;
    const fill = bar.querySelector('.fill');
    fill.style.width = `${utilization}%`;
    fill.style.background = rampFor(utilization);

    const elapsed = elapsedFraction(USAGE_WINDOWS[bar.dataset.window], reading);
    const mark = bar.querySelector('.now');
    mark.hidden = elapsed === null;
    mark.style.setProperty('--at', elapsed ?? 0);
  });
}

// Most often an extension that updated itself and moved an anchor. Nothing to press: the tooltip
// says what the window does instead, and the suite holds every anchor to this machine's bundle.
function renderPatches(missing = []) {
  patches.hidden = missing.length === 0;
  const lines = missing.map(({ seam, extension, version, degrades }) =>
    `${extension} ${version} is running without ${seam}: ${degrades}.`);
  const label = [...lines, 'npm test checks every anchor against this bundle.'].join('\n');
  patches.title = label;
  patches.setAttribute('aria-label', label);
}

function renderChips(open) {
  chips.replaceChildren(...open.map((project) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.setProperty('--hue', project.hue);
    chip.dataset.folder = project.folder;
    chip.title = project.folder;
    chip.setAttribute('aria-current', String(project.folder === state.focused));

    // The same mark the window wears inside itself: the project's favicon, or its initial on its
    // own hue where there is no favicon to take one from. One glance then matches a chip to a
    // tile, which is the whole job of this row in single view - where the tile it names is the one
    // you cannot see.
    const mark = document.createElement('span');
    mark.className = 'mark';
    // And what Claude is doing there, as a ring around that mark - the badge's own arrangement,
    // one size down.
    mark.dataset.claude = project.claudeState;
    mark.append(projectMark(project));

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = project.name;

    const close = document.createElement('span');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Close project';

    // The chip being dragged is not in the row any more - a clone is following the hand - so what
    // is left here is the placeholder it will drop into.
    chip.toggleAttribute('data-dragging', project.folder === sorting?.folder);

    chip.append(mark, name, close);
    return chip;
  }));
}

// A tile's colour is the app's to draw before its window exists to draw it: main places the views
// over these rects, and until each one has painted, this is what fills it. Under the glow, which
// goes on saying which tile is focused.
function renderGrounds(open) {
  grounds.replaceChildren(...open.flatMap((project, index) => {
    const rect = state.rects[index];
    if (!rect || !rect.visible) return [];
    const ground = document.createElement('div');
    ground.className = 'ground';
    ground.style.setProperty('--hue', project.hue);
    const share = state.grounds?.[project.folder === state.focused ? 'focused' : 'quiet'];
    if (share) ground.style.setProperty('--survives', share);
    ground.style.left = `${rect.x}px`;
    ground.style.top = `${rect.y - state.strip}px`;
    ground.style.width = `${rect.width}px`;
    ground.style.height = `${rect.height}px`;
    return [ground];
  }));
}

function renderGlow(open) {
  const index = open.findIndex((project) => project.folder === state.focused);
  const rect = state.rects[index];
  if (!rect || !rect.visible || open.length < 2) {
    glow.hidden = true;
    return;
  }
  const bleed = 3;
  glow.hidden = false;
  glow.style.setProperty('--hue', open[index].hue);
  glow.style.left = `${rect.x - bleed}px`;
  glow.style.top = `${rect.y - state.strip - bleed}px`;
  glow.style.width = `${rect.width + bleed * 2}px`;
  glow.style.height = `${rect.height + bleed * 2}px`;
}

// The handles are REPLACED only when the grid changes shape, never while one is being dragged:
// a rebuilt element is a lost pointer capture, and the shape cannot change under a drag anyway.
function renderSplitters() {
  const wanted = state.splitters || [];
  const signature = wanted.map((splitter) => `${splitter.axis}${splitter.index}`).join(',');
  if (signature !== splitters.dataset.signature) {
    splitters.dataset.signature = signature;
    splitters.replaceChildren(...wanted.map((splitter) => {
      const handle = document.createElement('div');
      handle.className = 'splitter';
      handle.dataset.axis = splitter.axis;
      handle.dataset.index = splitter.index;
      handle.title = splitter.axis === 'cols'
        ? 'Drag to resize columns, double-click to even them'
        : 'Drag to resize rows, double-click to even them';
      return handle;
    }));
  }
  [...splitters.children].forEach((handle, index) => {
    const splitter = wanted[index];
    handle.style.left = `${splitter.x}px`;
    handle.style.top = `${splitter.y - state.strip}px`;
    handle.style.width = `${splitter.width}px`;
    handle.style.height = `${splitter.height}px`;
  });
}

// Delegated, so a rebuild between two grids never drops the listeners. The pointer's position is
// all that is reported: main owns every rect, here and in the views.
splitters.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.splitter');
  if (!handle || event.button !== 0) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  handle.dataset.dragging = '';
  document.body.dataset.resizing = '';
  drag = { handle, axis: handle.dataset.axis, index: Number(handle.dataset.index), position: null, frame: 0 };
});

splitters.addEventListener('pointermove', (event) => {
  if (!drag) return;
  drag.position = drag.axis === 'cols' ? event.clientX : event.clientY;
  // One call per frame at most. The pending one reads the latest position when it fires, so
  // nothing queues up behind a hand moving faster than the views can follow.
  if (drag.frame) return;
  drag.frame = requestAnimationFrame(() => {
    drag.frame = 0;
    call('grid:resize', { axis: drag.axis, index: drag.index, position: drag.position });
  });
});

for (const kind of ['pointerup', 'pointercancel']) {
  splitters.addEventListener(kind, () => {
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    if (drag.position !== null) {
      call('grid:resize', { axis: drag.axis, index: drag.index, position: drag.position });
    }
    delete drag.handle.dataset.dragging;
    delete document.body.dataset.resizing;
    drag = null;
  });
}

splitters.addEventListener('dblclick', (event) => {
  const handle = event.target.closest('.splitter');
  if (handle) call('grid:reset', { axis: handle.dataset.axis });
});

chips.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  if (event.target.classList.contains('close')) call('project:close', { folder: chip.dataset.folder });
  else call('project:focus', { folder: chip.dataset.folder });
});

// The project's own menu, the one its badge opens inside the window. Main draws it, at the cursor.
chips.addEventListener('contextmenu', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  event.preventDefault();
  call('project:menu', { folder: chip.dataset.folder });
});

// The strip's own gesture: a chip dragged along the row INSERTS, the chips it passes shifting
// along, the way a row of tabs behaves everywhere else. The grid's is the other one, and it starts
// inside a window - the two never contend, because the row is only shown in single view.
//
// The pointer is captured by the ROW rather than by the chip, and only once the drag has actually
// begun. By the row, because every render replaces the chips and a captured node that is replaced
// drops the drag - on the first reorder, which is the reorder the gesture exists to make. Only
// then, because a capture retargets the click that ends the press to the capturing element: taken
// on the press, it leaves every chip in the strip unclickable.
const SORT_THRESHOLD = 4;

chips.addEventListener('pointerdown', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || event.button !== 0 || event.target.classList.contains('close')) return;
  sorting = { folder: chip.dataset.folder, from: event.clientX, order: openFolders(), moved: false };
});

chips.addEventListener('pointermove', (event) => {
  if (!sorting) return;
  // Horizontal intent only, and only past a few pixels: the row runs one way, and the wobble on
  // the way to a click must not lift a chip out of it.
  if (!sorting.moved && Math.abs(event.clientX - sorting.from) < SORT_THRESHOLD) return;
  if (!sorting.moved) {
    sorting.moved = true;
    chips.setPointerCapture(event.pointerId);
    lift(event);
    document.body.dataset.sorting = '';
    render();
  }
  carry(event);
  const index = slotAt(event.clientX, sorting.folder);
  const current = [...chips.children].findIndex((chip) => chip.dataset.folder === sorting.folder);
  if (index !== current) call('project:move', { folder: sorting.folder, index });
});

// The chip leaves the row: a clone follows the hand, and what stays behind - emptied out, still
// holding its width - is the PLACEHOLDER it will drop into, which reflows through the row as the
// others shift around it. The clone is what carries the lift, because #chips is a scroll
// container and clips anything a chip paints outside its own box.
//
// It is cloned before the render that empties the original, or the clone is a hole too. And it
// rides IN the strip rather than hanging below it the way the old app's did: below the strip is
// the stage, and every pixel of that is a native view painted above this page.
function lift(event) {
  const chip = [...chips.children].find((child) => child.dataset.folder === sorting.folder);
  if (!chip) return;
  const box = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true);
  ghost.id = 'chip-ghost';
  ghost.removeAttribute('data-folder');
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  ghost.style.top = `${box.top}px`;
  document.body.append(ghost);
  // Held where you took hold of it, so the clone does not jump under the hand at the first move.
  sorting.ghost = ghost;
  sorting.grab = event.clientX - box.left;
}

function carry(event) {
  if (!sorting.ghost) return;
  // Clamped to the row, so a hand that runs off the end leaves the clone at the end rather than
  // over the traffic lights. Only x decides where it lands; there is nowhere for a y to go.
  const row = chips.getBoundingClientRect();
  const width = sorting.ghost.offsetWidth;
  const left = Math.min(Math.max(event.clientX - sorting.grab, row.left), row.right - width);
  sorting.ghost.style.left = `${left}px`;
}

for (const kind of ['pointerup', 'pointercancel']) {
  chips.addEventListener(kind, () => endSort(false));
}

// Abandoning a gesture is the same everywhere: the order the press began with, put back.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') endSort(true);
});

function endSort(cancel) {
  if (!sorting) return;
  const { moved, order, ghost } = sorting;
  sorting = null;
  ghost?.remove();
  // A press that never became a drag is a click, and a render here would REPLACE the chip
  // between its press and its release - which is a click that never fires and a project that
  // never gets focused.
  if (!moved) return;
  delete document.body.dataset.sorting;
  if (cancel) call('project:restore', { folders: order });
  render();
}

// Where the hand says the chip goes: how many of the OTHERS it has passed the middle of. Leaving
// the dragged chip out of that count is what makes a chip change places when the pointer passes
// its neighbour's centre rather than when it passes its own.
function slotAt(x, folder) {
  return [...chips.children].filter((chip) => {
    if (chip.dataset.folder === folder) return false;
    const box = chip.getBoundingClientRect();
    return box.left + box.width / 2 < x;
  }).length;
}

function openFolders() {
  return state.projects.filter((project) => project.open).map((project) => project.folder);
}

for (const segment of document.querySelectorAll('.segment')) {
  segment.addEventListener('click', () => call('mode:set', { mode: segment.dataset.mode }));
}

document.getElementById('add').addEventListener('click', () => call('project:pick'));

emptyProjects.addEventListener('click', (event) => {
  const folder = event.target.closest('.project-tile')?.dataset.folder;
  if (!folder) return;
  // The second click of a double one opens, leaving the tick where the first put it. Not a
  // dblclick listener: that fires after both clicks have toggled, so the tile blinks off first.
  if (event.detail > 1) {
    if (event.detail === 2) call('project:open', { folder });
    return;
  }
  if (!selected.delete(folder)) selected.add(folder);
  render();
});

// Nothing ticked leaves the button what it was: the picker, which is the only way to reach a
// folder this app has never opened. The ticks are dropped before the calls, so the state that
// comes back cannot re-tick a project that is now a tile on the stage.
emptyAdd.addEventListener('click', () => {
  if (!selected.size) return void call('project:pick');
  const folders = [...selected];
  selected.clear();
  for (const folder of folders) call('project:open', { folder });
});

// The layout control drives every open project at once, which is the only reason it is here
// rather than in each window's own title bar.
for (const button of document.querySelectorAll('.part')) {
  button.addEventListener('click', () => call('layout:set', {
    part: button.dataset.part,
    visible: button.getAttribute('aria-pressed') !== 'true',
  }));
}

// One level for the whole app, so the strip sends a step and main puts it on every tile. Nothing
// here reads a level back: Chromium keeps it per host and every tile is that one host.
for (const button of document.querySelectorAll('.zoom')) {
  button.addEventListener('click', () => call('zoom:step', { step: Number(button.dataset.step) }));
}

sound.addEventListener('click', () => call('sound:set', {
  rung: sound.getAttribute('aria-pressed') === 'true' ? 'off' : 'on',
}));

// The panel that opens under the widget is a window of its own, because one drawn in this page
// would sit behind the tiles. Main places it; the only thing it needs from here is where.
usage.addEventListener('click', () => {
  const { right, bottom } = usage.getBoundingClientRect();
  call('usage:popover', { anchor: { right, bottom } });
});

// AwakeBar's sound/buzz.aiff at the gain it plays by default, as WAV: Chromium decodes no AIFF.
const buzz = new Audio('buzz.wav');
buzz.volume = 0.5;

window.ct.onEvent((message) => {
  if (message?.type === 'usage') return void renderUsage(message.payload);
  if (message?.type === 'patches') return void renderPatches(message.payload);
  // Rewound rather than a new element per play, so two sessions landing together are one sound.
  if (message?.type === 'chime') {
    buzz.currentTime = 0;
    return void buzz.play().catch((error) => console.error('[chime]', error.message));
  }
  // The picker's window covers the stage and stops at the strip, so this row's half of its scrim
  // is drawn here.
  if (message?.type === 'picker') return void (stripScrim.hidden = !message.payload.open);
  if (message?.type !== 'state') return;
  state = message.payload;
  document.documentElement.style.setProperty('--strip', `${state.strip}px`);
  if (state.ground) document.documentElement.style.setProperty('--bg', state.ground);
  // The Corners preference, live: the launch arguments only had it for the first paint.
  if (state.corners) {
    document.documentElement.style.setProperty('--squircle', state.corners.squircle);
    document.documentElement.style.setProperty('--tile-radius', `${state.corners.tileRadius}px`);
  }
  render();
});

call('state');
