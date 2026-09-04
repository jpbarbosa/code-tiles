// The shell draws around the tiles: the strip, the empty state, and the focused tile's glow in
// the gutter. It never draws over a tile, because a WebContentsView paints above this page by
// construction - anything that has to appear inside a window is a seam, not an overlay.
import { rampFor } from './format.js';

const chips = document.getElementById('chips');
const glow = document.getElementById('glow');
const empty = document.getElementById('empty');
const stage = document.getElementById('stage');
const usage = document.getElementById('usage');

let state = { projects: [], rects: [], mode: 'grid', focused: null, strip: 36, parts: {} };

const call = (type, payload) => window.ct.call(type, payload).catch((error) => console.error(error));

function render() {
  const open = state.projects.filter((project) => project.open);
  renderChips(open);
  renderGlow(open);
  empty.hidden = open.length > 0;
  for (const segment of document.querySelectorAll('.segment')) {
    segment.setAttribute('aria-pressed', String(segment.dataset.mode === state.mode));
  }
  chips.hidden = state.mode === 'grid';
  for (const button of document.querySelectorAll('.part')) {
    button.setAttribute('aria-pressed', String(Boolean(state.parts?.[button.dataset.part])));
  }
}

// Account-global, so this widget is about the account and not about any tile. Green while there
// is room, red at the cap: the colour is the reading, the length is how far along.
function renderUsage(account) {
  const readings = [account.fiveHour, account.sevenDay];
  const connected = Boolean(account.connected) && !account.needsReauth;
  const shown = (reading) => (reading ? `${Math.round(reading.utilization)}%` : '-');

  usage.dataset.connected = String(connected);
  usage.querySelector('.offer').textContent = account.needsReauth ? 'Reconnect Claude' : 'Connect Claude';
  usage.title = connected
    ? `Claude usage: 5h ${shown(account.fiveHour)}, 7d ${shown(account.sevenDay)}. Click for detail.`
    : 'Connect your Claude account to see usage.';

  document.querySelectorAll('#usage .fill').forEach((fill, index) => {
    const utilization = readings[index]?.utilization || 0;
    fill.style.width = `${utilization}%`;
    fill.style.background = rampFor(utilization);
  });
}

function renderChips(open) {
  chips.replaceChildren(...open.map((project) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.setProperty('--hue', project.hue);
    chip.dataset.folder = project.folder;
    chip.title = project.folder;
    chip.setAttribute('aria-current', String(project.folder === state.focused));

    const ring = document.createElement('span');
    ring.className = 'ring';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = project.name;

    const close = document.createElement('span');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Close project';

    chip.append(ring, name, close);
    return chip;
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

chips.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  if (event.target.classList.contains('close')) call('project:close', { folder: chip.dataset.folder });
  else call('project:focus', { folder: chip.dataset.folder });
});

for (const segment of document.querySelectorAll('.segment')) {
  segment.addEventListener('click', () => call('mode:set', { mode: segment.dataset.mode }));
}

for (const id of ['add', 'empty-add']) {
  document.getElementById(id).addEventListener('click', () => call('project:pick'));
}

// The layout control drives every open project at once, which is the only reason it is here
// rather than in each window's own title bar.
for (const button of document.querySelectorAll('.part')) {
  button.addEventListener('click', () => call('layout:set', {
    part: button.dataset.part,
    visible: button.getAttribute('aria-pressed') !== 'true',
  }));
}

// The panel that opens under the widget is a window of its own, because one drawn in this page
// would sit behind the tiles. Main places it; the only thing it needs from here is where.
usage.addEventListener('click', () => {
  const { right, bottom } = usage.getBoundingClientRect();
  call('usage:popover', { anchor: { right, bottom } });
});

window.ct.onEvent((message) => {
  if (message?.type === 'usage') return void renderUsage(message.payload);
  if (message?.type !== 'state') return;
  state = message.payload;
  document.documentElement.style.setProperty('--strip', `${state.strip}px`);
  if (state.ground) document.documentElement.style.setProperty('--bg', state.ground);
  render();
});

call('state');
