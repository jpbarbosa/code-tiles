(() => {
  const PROBES = [
    ['workbench', '.monaco-workbench'],
    ['part.activitybar', '.part.activitybar'], ['part.sidebar', '.part.sidebar'], ['part.editor', '.part.editor'], ['part.panel', '.part.panel'],
    ['activity.item', '.part.activitybar .action-item:not(.ct-maximize)'], ['activity.checked', '.part.activitybar .action-item.checked .action-label'],
    ['activity.menubar(badge)', '.part.activitybar .menubar'], ['maximize', '.ct-maximize .action-label'], ['close', '.ct-close'],
    ['sidebar.title', '.part.sidebar > .composite.title'], ['sidebar.titleLabel', '.part.sidebar > .composite.title .title-label h2'],
    ['sidebar.paneHeader', '.part.sidebar .pane-header'], ['explorer.row', '.part.sidebar .explorer-folders-view .monaco-list-row'],
    ['explorer.rowLabel', '.part.sidebar .explorer-folders-view .monaco-list-row .label-name'],
    ['sidebar.footer', '.part.sidebar .pane-composite-footer, .part.sidebar > .footer, .part.sidebar [class*="footer"]'],
    ['branch.pill', '.part.sidebar [class*="footer"] .action-item, .part.sidebar [class*="footer"] .monaco-button'],
    ['tabs.container', '.part.editor .tabs-container'], ['tab', '.part.editor .tab:not(.active)'], ['tab.active', '.part.editor .tab.active'],
    ['tab.label', '.part.editor .tab:not(.active) .label-name'], ['tab.close', '.part.editor .tab.active .tab-actions .action-label'],
    ['editor.titleActions', '.part.editor .editor-actions'], ['editor.breadcrumbs', '.part.editor .breadcrumbs-control'],
    ['editor.lines', '.part.editor .monaco-editor .view-line'], ['editor.margin', '.part.editor .monaco-editor .margin'],
    ['editor.scrollbarSlider', '.part.editor .monaco-editor .scrollbar.vertical .slider'],
    ['panel.title', '.part.panel > .composite.title'], ['panel.terminalStrip', '.part.panel .ct-terminals'],
    ['panel.terminalTab', '.part.panel .ct-terminals-tab'], ['panel.titleActions', '.part.panel > .composite.title .title-actions'],
    ['terminal.xterm', '.part.panel .xterm'], ['sash.vertical', '.monaco-sash.vertical'],
    ['split.view.separator', '.part.editor .monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view'],
  ];
  const STYLES = ['borderRadius', 'cornerShape', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginLeft', 'marginRight', 'marginBottom',
    'height', 'lineHeight', 'fontSize', 'fontWeight', 'fontFamily', 'backgroundColor', 'color', 'borderTopWidth', 'borderTopColor', 'borderBottomWidth', 'boxShadow', 'gap', 'opacity'];
  const wb = document.querySelector('.monaco-workbench').getBoundingClientRect();
  const read = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    const out = { box: [Math.round(r.left - wb.left), Math.round(r.top - wb.top), Math.round(r.width), Math.round(r.height)] };
    for (const k of STYLES) out[k] = s[k];
    return out;
  };
  const inv = {};
  for (const [name, selector] of PROBES) {
    const el = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0);
    inv[name] = el ? read(el) : null;
  }
  inv['sidebar.paneHeaders'] = [...document.querySelectorAll('.part.sidebar .pane-header')].filter((e) => e.offsetHeight).map((e) => { const s = getComputedStyle(e); const p = e.closest('.pane'); const ps = p ? getComputedStyle(p) : null; return `${e.textContent.trim().slice(0, 14)} h${e.offsetHeight} bt${s.borderTopWidth} ${s.borderTopColor} paneBt${ps?.borderTopWidth} ${ps?.borderTopColor}`; });
  inv['tab.count'] = document.querySelectorAll('.part.editor .tab').length;
  // The Claude page, two frames down.
  const chat = (() => { const walk = (d) => { for (const f of d.querySelectorAll('iframe')) { let c; try { c = f.contentDocument; } catch {} if (!c) continue; if (c.querySelector('link[href*="anthropic.claude-code-"]')) return c; const deeper = walk(c); if (deeper) return deeper; } return null; }; return walk(document); })();
  if (chat) {
    const cw = chat.defaultView;
    for (const [name, selector] of [['chat.input', '[aria-label="Message input"]'], ['chat.inputContainer', '[class*="inputContainer_"]'], ['chat.modelPill', '[class*="modelPill_"]'],
      ['chat.send', '[class*="sendButton_"]'], ['chat.header', '[class*="titleText_"]'], ['chat.body', 'body']]) {
      const el = chat.querySelector(selector);
      if (!el) { inv[name] = null; continue; }
      const r = el.getBoundingClientRect(); const s = cw.getComputedStyle(el);
      inv[name] = { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
      for (const k of STYLES) inv[name][k] = s[k];
    }
  } else inv['chat'] = 'no Claude page';
  inv['workbench.classes'] = document.querySelector('.monaco-workbench').className;
  return inv;
})()
