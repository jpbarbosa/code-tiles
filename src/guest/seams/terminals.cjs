'use strict';

// The terminals, as tabs across the panel's header. Stock puts one view name there - Terminal,
// and a "..." for the rest - and lists the terminals themselves VERTICALLY down the panel's right
// edge, which takes width from every project at once. This swaps the two.
//
// One setting does both halves of that, which is why the seam starts as a setting rather than as
// CSS: `terminal.integrated.tabs.enabled: false` removes the side list PROPERLY - the editor
// assigns that list its width in JS, so hiding it would leave the dead band a hidden title bar
// leaves - and in exchange it puts a <select> of the open terminals in the header's actions. That
// select is both the model and the switch: its options are the terminals, live-renamed to the
// running process, and `selectedIndex` plus a `change` event is exactly what the editor's own
// dropdown fires. Nothing here touches the real tab list; the strip mirrors that select.
//
// The row is only taken over once the select has been SEEN, so a window whose setting never
// landed keeps the stock header rather than an empty band where the names were. And the names
// are not a one-way loss: a right-click anywhere on the header reopens the editor's own view
// menu, every one of them in it. [code-server 4.135.0]
const STRIP = 'ct-terminals';
const ARMED = 'ct-terminals-on';

module.exports = {
  name: 'terminals',
  settings: {
    'terminal.integrated.tabs.enabled': false,
  },

  css: () => `
.monaco-workbench .part.panel .composite.title.${ARMED} {
  /* The view names. Not the overflow button beside them, which the editor only adds while the
     row is too narrow to fit them all - at any wider size there is none, which is why the
     right-click below is what actually gives those views back. */
  & .composite-bar .action-item:not(.icon) { display: none; }

  /* The select is the model and the switch both, so it stays in the DOM and only stops showing. */
  & .title-actions .action-item.switch-terminal { display: none; }

  /* New Terminal, which the strip's own + now is. The !important is the editor's own: it pins
     this class at \`display: flex !important\`, so nothing quieter takes it off the row. */
  & .title-actions .action-item.monaco-dropdown-with-primary { display: none !important; }
}

/* The editor's own tab, rebuilt from the tokens the editor builds it from: the tab itself stays
   transparent and a pseudo-element carries the paint, so the fill rounds and separates while the
   hit target still fills the row. */
.monaco-workbench .part.panel .composite.title .${STRIP} {
  display: flex;
  align-items: stretch;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;

  & > div {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--vscode-spacing-size40, 4px);
    min-width: 0;
    padding: 0 var(--vscode-spacing-size80, 8px);
    border-block: var(--vscode-spacing-size40, 4px) solid transparent;
    color: var(--vscode-tab-inactiveForeground, var(--vscode-foreground));
    cursor: pointer;
  }

  & .${STRIP}-tab {
    max-width: 180px;
    font-size: var(--vscode-fontSize-body1, 13px);
    font-weight: var(--vscode-fontWeight-semiBold, 600);

    /* Painted before the children in the same stacking context, so the label sits on the fill
       without anyone needing a z-index. */
    &::before {
      content: "";
      position: absolute;
      inset: 0 var(--vscode-spacing-size20, 2px);
      border-radius: var(--vscode-cornerRadius-small, 4px);
    }

    & > * { position: relative; }
    &:hover::before { background: var(--modern-ui-tab-hover-background, var(--vscode-tab-hoverBackground)); }

    &.is-active {
      color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
      /* The tint's tab before the editor's own variable, which also paints the view switcher and
         the branch pills: those stay at a plate's wash, and a tab is louder. */
      &::before {
        background: var(--ct-tab, var(--modern-ui-tab-active-background, var(--vscode-tab-activeBackground)));
      }
    }
  }

  & .${STRIP}-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* On the tab you are pointing at and on the active one, so a row of terminals reads as names
     rather than as a row of buttons. */
  & .${STRIP}-close {
    font-size: 14px;
    border-radius: var(--vscode-cornerRadius-xSmall, 2px);
    opacity: 0;
  }
  & .${STRIP}-tab:hover .${STRIP}-close,
  & .${STRIP}-tab.is-active .${STRIP}-close { opacity: 0.7; }
  & .${STRIP}-close:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground);
  }

  /* A codicon IS its ::before, so the + wears its fill on ::after and the two are ordered by
     hand: a pill on ::before would blank the glyph and leave an empty slot in the row. */
  & .${STRIP}-add {
    font-size: 16px;
    opacity: 0.75;

    &::before { position: relative; z-index: 1; }
    &::after {
      content: "";
      position: absolute;
      z-index: 0;
      inset: 0 var(--vscode-spacing-size20, 2px);
      border-radius: var(--vscode-cornerRadius-small, 4px);
    }

    &:hover { opacity: 1; }
    &:hover::after { background: var(--modern-ui-tab-hover-background, var(--vscode-tab-hoverBackground)); }
  }
}
`,

  init(api) {
    api.whenWorkbench((workbench) => {
      api.whenPresent(workbench, '.part.panel', (panel) => {
        const titleOf = () => panel.querySelector(':scope > .composite.title');
        const selectOf = () => titleOf()?.querySelector('.title-actions .switch-terminal select');
        // Buttons are addressed by CODICON CLASS, never by aria-label: the label carries a
        // localised name and its keybinding ("New Terminal (⇧⌘C)"), the class carries neither.
        const actionOf = (icon) => titleOf()?.querySelector(`.title-actions .action-label.codicon-${icon}`);

        const pick = (index) => {
          const select = selectOf();
          if (!select || select.selectedIndex === index) return false;
          select.selectedIndex = index;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };

        // Kill Terminal kills whatever is ACTIVE, so closing a tab means selecting it first - and
        // that switch is asynchronous. The intent is remembered and spent by the next render that
        // agrees rather than waited for: firing early would kill someone else's terminal, quite
        // possibly a live Claude run, and a switch that never lands simply never fires.
        let pendingKill = null;
        const kill = (index) => {
          if (pick(index)) pendingKill = index;
          else actionOf('trash')?.click();
        };

        // Right-clicking the header is how the hidden views come back. The editor's own handler
        // is on the composite bar's items rather than on their visibility, and answers a
        // synthesised event, so the menu opens at the cursor with every view listed. The actions
        // at the other end of the row carry menus of their own and are left alone.
        const forwardMenu = (event) => {
          const title = titleOf();
          if (!title?.classList.contains(ARMED)) return;
          if (event.target.closest('.title-actions, .global-actions')) return;
          const item = title.querySelector('.composite-bar .action-item');
          if (!item) return;
          event.preventDefault();
          event.stopPropagation();
          item.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, button: 2, clientX: event.clientX, clientY: event.clientY,
          }));
        };

        let drawn = null;
        const render = () => {
          const title = titleOf();
          if (!title) return;
          const select = selectOf();
          title.classList.toggle(ARMED, Boolean(select));
          if (!title.dataset.ctTerminals) {
            title.dataset.ctTerminals = '1';
            title.addEventListener('contextmenu', forwardMenu);
          }
          if (!select) {
            drawn = null;
            title.querySelector(`:scope > .${STRIP}`)?.remove();
            return;
          }

          const names = terminalsOf(select);
          const active = select.selectedIndex;
          if (pendingKill !== null && pendingKill === active) {
            pendingKill = null;
            actionOf('trash')?.click();
          }

          // Rebuilt only on a real change: a strip blown away on every mutation would lose the
          // hover state and the close button under the pointer.
          const state = JSON.stringify([names, active]);
          if (state === drawn) return;
          drawn = state;
          draw(title, names, active, { pick, kill, add: () => actionOf('plus')?.click() });
        };

        // The editor rebuilds the select's options whenever the list changes AND whenever a
        // different terminal becomes active, so a childList observer over the title sees both -
        // which terminal is active is a property write that mutates nothing, and this is what
        // spares the strip a poll. Neither observer reaches the terminal area, where xterm churns
        // on every frame.
        const titleObserver = new MutationObserver(render);
        let observed = null;
        const follow = () => {
          const title = titleOf();
          if (!title || title === observed) return;
          observed = title;
          titleObserver.disconnect();
          titleObserver.observe(title, { childList: true, subtree: true });
        };

        new MutationObserver(() => { follow(); render(); }).observe(panel, { childList: true });
        follow();
        render();
      });
    });
  },
};

// Everything up to the first disabled option is a terminal; the separator and Show Tabs sit past
// it. The "2: " a name comes with is dropped - the tab's own position already says which.
function terminalsOf(select) {
  const names = [];
  for (const option of select.options) {
    if (option.disabled) break;
    names.push(option.text.replace(/^\d+:\s*/, ''));
  }
  return names;
}

function draw(title, names, active, actions) {
  const document = title.ownerDocument;
  let strip = title.querySelector(`:scope > .${STRIP}`);
  if (!strip) {
    strip = document.createElement('div');
    strip.className = STRIP;
    // After the view names rather than before them, so the overflow button keeps the corner the
    // editor gave it and the tabs read as a row starting where the names did.
    const bar = title.querySelector(':scope > .composite-bar-container');
    if (bar) bar.after(strip);
    else title.prepend(strip);
  }

  strip.textContent = '';
  names.forEach((name, index) => {
    const tab = document.createElement('div');
    tab.className = index === active ? `${STRIP}-tab is-active` : `${STRIP}-tab`;
    tab.title = name;
    tab.addEventListener('mousedown', (event) => {
      if (event.button === 1) { event.preventDefault(); actions.kill(index); }
      else actions.pick(index);
    });

    const label = document.createElement('span');
    label.className = `${STRIP}-name`;
    label.textContent = name;

    const close = document.createElement('span');
    close.className = `${STRIP}-close codicon codicon-close`;
    close.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.kill(index);
    });

    tab.append(label, close);
    strip.appendChild(tab);
  });

  const add = document.createElement('div');
  add.className = `${STRIP}-add codicon codicon-plus`;
  add.title = 'New Terminal';
  add.addEventListener('mousedown', (event) => { event.preventDefault(); actions.add(); });
  strip.appendChild(add);
}
