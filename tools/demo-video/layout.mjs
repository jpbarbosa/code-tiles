// Where everything clickable is, in window points: the tiles from the shell's own grounds, and
// each tile's badge, maximize item and close from inside its window.
import { Page, targets } from './cdp.mjs';

const shell = await Page.open((target) => target.url.endsWith('/shell/index.html'));
const stage = await shell.eval(`(() => {
  const box = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  return {
    grounds: [...document.querySelectorAll('#grounds .ground')].map(box),
    splitters: [...document.querySelectorAll('#splitters .splitter')].map((el) => [el.dataset.axis, el.dataset.index, ...box(el)]),
    add: box(document.getElementById('add')),
    empty: [...document.querySelectorAll('#empty-projects .project-tile')].map((el) => [el.textContent, ...box(el)]),
    emptyAdd: box(document.getElementById('empty-add')),
  };
})()`);
shell.close();
console.log(JSON.stringify(stage));

for (const target of (await targets()).filter((candidate) => candidate.type === 'page' && candidate.url.includes('folder='))) {
  const tile = await Page.open((candidate) => candidate.id === target.id);
  const inside = await tile.eval(`(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return {
      size: [innerWidth, innerHeight],
      badge: box('.part.activitybar .menubar .menubar-menu-button'),
      maximize: box('.part.activitybar .ct-maximize'),
      close: box('.monaco-workbench > .ct-close'),
      terminal: box('.part.panel .terminal-wrapper'),
      editor: box('.part.editor'),
      notifications: document.querySelectorAll('.notification-toast').length,
    };
  })()`);
  console.log(decodeURIComponent(target.url).split('/').pop(), JSON.stringify(inside));
  tile.close();
}
