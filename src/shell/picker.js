// The project picker's page. Its window covers the stage and stops at the strip, so the traffic
// lights and the + stay live under it; main draws the strip's half of the scrim. Everything this
// page knows about the filesystem it asks main for, one call per keystroke.
import { projectMark } from './format.js';

const list = document.getElementById('list');
const none = document.getElementById('none');
const field = document.getElementById('query');
const panel = document.getElementById('panel');
const clear = document.getElementById('clear');
const homeRow = document.getElementById('home');
const browseRow = document.getElementById('browse');

const call = (type, payload) => window.ct.call(type, payload);

// The field owns the focus for as long as the panel is up, so a selection - not focus - is
// what Return acts on, and it walks the found rows and the footer's two as one list.
let active = 0;
let asked = 0;
// The row the next list should land on, when a key already knows which one that is. Consumed by
// the render it was set for; a list that arrives for anything else falls back to the first row.
let wanted = null;

const rows = () => [...list.querySelectorAll('.row'), homeRow, browseRow];

function select(index) {
  const all = rows();
  active = Math.max(0, Math.min(index, all.length - 1));
  all.forEach((node, at) => node.classList.toggle('is-active', at === active));
  all[active]?.scrollIntoView({ block: 'nearest' });
}

function render(found) {
  clear.hidden = !field.value;
  list.replaceChildren(...found.map(row));
  none.hidden = found.length > 0;
  none.textContent = field.value.trim() ? 'Nothing here.' : 'No projects opened yet.';
  const at = wanted ? rows().findIndex((node) => node.dataset.into === wanted) : -1;
  wanted = null;
  select(at < 0 ? 0 : at);
}

// Only main has a filesystem, so every keystroke asks it. Answers can land out of order, and
// the stale one would paint a list for a query nobody is looking at any more.
async function search() {
  const token = ++asked;
  const found = await call('picker:list', { query: field.value });
  if (token === asked) render(found);
}

function row(entry) {
  const item = document.createElement('li');
  item.className = 'row';
  item.dataset.into = entry.short;

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'choose';
  choose.tabIndex = -1;
  choose.title = entry.folder;
  choose.append(
    entry.project ? projectMark(entry) : folderMark(),
    span('name', entry.name),
    span('path', entry.short),
  );
  // An open project is a tile you already have, so it takes the focus rather than a second
  // copy of itself. The app's own list makes opening one that is already open the same thing,
  // but only this way clears a turn that finished while you were looking elsewhere.
  choose.addEventListener('click', async () => {
    await call(entry.open ? 'project:focus' : 'project:open', { folder: entry.folder });
    window.close();
  });
  item.append(choose);

  // Nothing marks an open project. Nearly every project in this list is open, so a badge on
  // each was a word repeated down the column that told you only what the column was.
  if (entry.open) return item;

  // A folder that is not a project yet is not in any list, so there is nothing to forget.
  if (!entry.project) return item;

  const forget = document.createElement('button');
  forget.type = 'button';
  forget.className = 'forget';
  forget.tabIndex = -1;
  forget.innerHTML = '<svg width="10" height="10" aria-hidden="true"><use href="#cross" /></svg>';
  forget.title = 'Remove from this list';
  forget.setAttribute('aria-label', `Remove ${entry.name} from this list`);
  forget.addEventListener('click', async () => {
    await call('project:forget', { folder: entry.folder });
    item.remove();
    none.hidden = list.children.length > 0;
    select(active);
  });
  item.append(forget);
  return item;
}

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function folderMark() {
  const node = document.createElement('span');
  node.className = 'mark';
  node.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">'
    + '<path d="M1.6 12.4V3.6a1 1 0 0 1 1-1h3.2l1.4 1.6h5.2a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1Z"'
    + ' fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>';
  return node;
}

const run = (node) => (node?.classList.contains('row') ? node.querySelector('.choose') : node)?.click();

const caretAtEnd = () => field.selectionStart === field.value.length
  && field.selectionEnd === field.value.length;

function descend() {
  const into = rows()[active]?.dataset.into;
  if (!into) return;
  field.value = into.endsWith('/') ? into : `${into}/`;
  search();
}

// A path only, because in a name query Left is the caret and a text field owes it that. The
// segment dropped is the row to land on up there, so Left and Right are each other's undo
// rather than Left putting you back at the top of a list you just came out of.
function ascend() {
  if (!field.value.startsWith('~') && !field.value.startsWith('/')) return false;
  const cut = field.value.replace(/\/+$/, '');
  const at = cut.lastIndexOf('/');
  if (at < 0) return false;
  wanted = cut;
  field.value = cut.slice(0, at + 1);
  search();
  return true;
}

field.addEventListener('input', search);

field.addEventListener('keydown', (event) => {
  const step = { ArrowDown: 1, ArrowUp: -1, Tab: event.shiftKey ? -1 : 1 }[event.key];
  if (step) {
    event.preventDefault();
    return select(active + step);
  }
  if (event.key === 'Enter') return run(rows()[active]);
  // Right at the END of what you typed has nothing else to do, so it steps INTO the selected
  // folder rather than opening it - the field becomes its path, which is a query already.
  if (event.key === 'ArrowRight' && caretAtEnd()) return descend();
  // And back out of it. The caret is already at the end after either one, so the two walk.
  if (event.key === 'ArrowLeft' && caretAtEnd() && ascend()) return event.preventDefault();
  // The row's own × without reaching for it, which is how a list you type into loses a line.
  if (event.key === 'Backspace' && (event.metaKey || event.altKey)) {
    event.preventDefault();
    rows()[active]?.querySelector?.('.forget')?.click();
  }
});

// A button takes the focus on mousedown, and the field losing it would send the next keystroke
// nowhere - which is exactly what happens after clicking a row's × , the one click that leaves
// the panel up.
panel.addEventListener('mousedown', (event) => {
  if (event.target.closest('button')) event.preventDefault();
});

// Home is a place to browse FROM: it seeds the field with the path, and every `/` after it
// walks one level down. Return on the row that comes back opens the folder itself.
homeRow.dataset.into = '~';
homeRow.addEventListener('click', () => {
  field.value = '~';
  field.focus();
  search();
});

clear.addEventListener('click', () => {
  field.value = '';
  field.focus();
  search();
});

browseRow.addEventListener('click', () => call('project:browse'));
document.getElementById('dismiss').addEventListener('click', () => window.close());

// Hover picks a row, but only once the pointer has MOVED. A list rebuilt under a still pointer
// fires enter events for whatever appeared beneath it, which took the selection straight back
// off the key that rebuilt the list - so a descend landed mid-list instead of on the first row.
panel.addEventListener('pointermove', (event) => {
  const index = rows().indexOf(event.target.closest('.row, .quick'));
  if (index >= 0 && index !== active) select(index);
});

// Anywhere off the panel is the scrim, which is a dismissal like any other sheet's.
document.addEventListener('click', (event) => {
  if (!event.target.closest('#panel')) window.close();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

const home = await call('picker:home');
homeRow.querySelector('.label').textContent = home.name;
homeRow.querySelector('.path').textContent = home.folder;
homeRow.title = home.folder;

render(await call('picker:list'));
field.focus();
