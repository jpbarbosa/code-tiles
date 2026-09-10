'use strict';

const { groundShare, rungOf, stateOf, survives } = require('../rungs.cjs');

const STYLE_ID = 'code-tiles-tint';

// The project's share of each mix at `strong`, the rung of 1. The ground's own share is not here:
// the shell paints a tile's ground before that tile has a window, so it lives in `rungs.cjs`
// where both sides read it.
const SHARE = {
  veil: 7,     // over the whole of a part
  wash: 26,    // on a plate: the side bar's title row, the menubar, an active tab
};
// A mark ON that ground is a colour rather than a mix, so its own dial is chroma.
const INK = { focused: 0.05, quiet: 0.025 };
// Your own turn in the chat is a BLOCK in the reading column, so what makes it a bubble is its
// distance from the page rather than its colour: the step is held while the dial moves the
// chroma. TOWARD THE TEXT rather than up, so one number lifts it on a dark theme and drops it on
// a light one.
const TURN = { step: 10, chroma: 0.028 };

const chroma = (amount, rung) => Math.round(amount * rung * 10000) / 10000;

// The tokens, said once and spent in two sheets: a frame shares no cascade with the document
// holding it, so the workbench's block and a webview's own each have to declare them.
const tokens = (context) => `  --ct-brand: oklch(0.62 0.15 ${context.hue});
  /* How much of the theme's own colour survives the hue, wherever the hue lands on a surface. */
  --ct-wash: ${survives(SHARE.wash, rungOf(context))};
  /* The same hue over the whole of a part rather than over its chrome, at a quarter of the
     strength: enough that a side bar reads as this project's, little enough that the plate
     below still reads as a plate on top of it. */
  --ct-veil: ${survives(SHARE.veil, rungOf(context))};`;

const veiled = (source) => `color-mix(in oklab, var(${source}) var(--ct-veil), var(--ct-brand))`;

// Which of the theme's surfaces a webview is drawn over, named by the part it covers.
const SURFACES = {
  auxiliarybar: '--vscode-sideBar-background',
  sidebar: '--vscode-sideBar-background',
  panel: '--vscode-panel-background',
  editor: '--vscode-editor-background',
};

// The plates that float ABOVE the parts rather than inside one, each its own name in the theme:
// the palette and every quick pick, find, hover, suggest, the code-action list, menus, toasts.
const WIDGETS = ['quickInput', 'quickInputTitle', 'editorWidget', 'editorHoverWidget',
  'editorSuggestWidget', 'editorActionList', 'menu', 'notifications'];

// The ground stays exactly as the theme shipped it: the app paints its own strip and gutters that
// colour, so a hue on it is a step at every tile edge - the focused window's ground is derived
// from it in the block below instead.
const GROUND = '--vscode-titleBar-activeBackground';

// A webview is HOISTED out of the part it belongs to, so a tab switch neither reloads it nor
// loses its state: the iframe sits in `.webview-overlay-content` under the workbench and
// `closest('.part')` on it is null. What points back is anchor positioning - the holder names an
// anchor and the part declares that name - so that is what is followed when `closest` finds none.
function anchoredPart(frame) {
  for (let node = frame; node; node = node.parentElement) {
    const anchor = node.style && node.style.positionAnchor;
    if (!anchor) continue;
    const target = node.ownerDocument.querySelector(`[style*="anchor-name: ${anchor}"]`);
    return (target && target.closest('.part')) || null;
  }
  return null;
}

// Up through frames because a webview's own document is two down, and the top document has no
// frame at all, which is how it excludes itself.
function surfaceFor(document) {
  let frame = document.defaultView && document.defaultView.frameElement;
  while (frame) {
    const part = (frame.closest && frame.closest('.part')) || anchoredPart(frame);
    if (part) {
      const name = Object.keys(SURFACES).find((key) => part.classList.contains(key));
      return name ? SURFACES[name] : null;
    }
    const view = frame.ownerDocument && frame.ownerDocument.defaultView;
    frame = view && view.frameElement;
  }
  return null;
}

// The theme's own values, taken from the INLINE properties the editor writes on a webview's root
// and never from the computed ones, which are this seam's own answer by the second sweep. A
// document holding none of them is not a themed webview at all - the extension host's frame, the
// wrapper around the content - and is left alone.
//
// EVERY background, not the three the workbench rewrites: out here a part's own panes read those
// three and follow, but a webview's page resolves its names from the theme one by one - the chat
// input is `--app-input-background: var(--vscode-input-background)` - so anything left out stays
// the colour it was. Foregrounds and syntax tokens are not backgrounds and so are untouched, and
// a semantic colour survives a 7% veil as itself.
function rawsFrom(root) {
  const raws = {};
  for (let i = 0; i < root.style.length; i += 1) {
    const name = root.style[i];
    if (!name.startsWith('--vscode-') || !/background/i.test(name) || name === GROUND) continue;
    const value = root.style.getPropertyValue(name).trim();
    if (value) raws[name] = value;
  }
  return raws;
}

// The mix said against a literal rather than a variable, which is what lets it land on :root: a
// custom property cannot reference itself on one element, and :root is where the editor writes
// the theme and where an extension resolves its own names from it - the Claude panel reads the
// page it paints as `--app-primary-background: var(--vscode-sideBar-background)` there, so a
// rewrite one element down is inherited by nothing it uses.
// !important because those properties are written INLINE, which no stylesheet outranks otherwise.
function frameCss(context, surface, raws) {
  const mixed = (value) => `color-mix(in oklab, ${value} var(--ct-veil), var(--ct-brand))`;
  const lines = Object.keys(raws).map((name) => `  ${name}: ${mixed(raws[name])} !important;`);
  const canvas = raws[surface]
    ? `\n  /* The frame's own canvas, which is the surface a webview showing nothing of its own
     paints: the editor makes its body transparent. */
  background-color: ${mixed(raws[surface])};`
    : '';
  return `
:root {
${tokens(context)}
${lines.join('\n')}
${canvas}
}
${turnCss(context, raws[surface] && mixed(raws[surface]))}`;
}

// YOUR OWN TURNS, painted rather than tinted: the extension paints the bubble with
// `input.background`, which a theme is free to make the very colour of the page behind it - Dark
// 2026 and Monokai Pro both do - and one mix over two equal colours leaves them equal. `page` is
// the tinted surface this frame is drawn over, so the bubble is a step off what the eye meets.
//
// What is redefined is the EXTENSION'S own variable, on the bubble alone, so its own rule spends
// it - and so do the two things that read the variable rather than the element: a collapsed turn's
// truncation fade, and an attachment pill's 85% mix.
//
// The class hash is per build, so the stable half is what is matched, and the trailing underscore
// is load-bearing: it keeps this off `userMessageContainer_` and `userMessageAttachments_`, which
// share the prefix. Claude's own turns wear the same `message_` as yours and so cannot be told
// apart - one painted side is enough. [claude-code 2.1.261]
function turnCss(context, page) {
  if (!page) return '';
  const step = `color-mix(in oklab, ${page} ${100 - TURN.step}%, var(--vscode-foreground, #fff))`;
  return `
[class*="userMessage_"] {
  --app-input-background: oklch(from ${step} l ${chroma(TURN.chroma, rungOf(context))} ${context.hue});
  /* The hairline was the whole separation; on a painted bubble it reads as a second surface. On
     the element rather than on --app-input-border, which the pills inside it also read. */
  border-color: transparent;
}
`;
}

// The project's colour, worn by the parts, by the ground they float on - louder on the tile you
// are in than on the ones you are not, which is what makes focus read across a grid - and by your
// own turns in its chat.
//
// Every value is MIXED INTO the theme's own colour rather than set outright, so a light theme
// gets a light chrome and a dark one a dark chrome, and a theme change carries the tint with it
// without anything here being told. How much of it is worn is the one thing here that is a
// preference rather than a derivation, and it arrives as `tint`: see RUNGS at the top.
module.exports = {
  name: 'tint',
  css: (context) => `
.monaco-workbench {
${tokens(context)}
  --ct-plate: color-mix(in oklab, var(--vscode-sideBar-background) var(--ct-wash), var(--ct-brand));

  /* The surfaces, which the modern UI paints from the theme's own variables and with an
     !important of its own - so the tint is those variables rewritten and no selector of ours,
     and every pane header, section header and list row inside a part follows, because they read
     the same names.
     The capture is on the workbench and the rewrite on its children because a custom property
     cannot reference ITSELF on one element: that is a cycle, and the property computes to nothing
     at all. Read on the parent, spent on the child, is the whole of it. */
  --ct-source-sidebar: var(--vscode-sideBar-background);
  --ct-source-editor: var(--vscode-editor-background);
  --ct-source-panel: var(--vscode-panel-background);
  /* A widget floats over a tinted window, so it wears the same veil. Its SURFACE only: half of
     the theme's backgrounds are translucent highlights, and a veil under one paints a line. */
  ${WIDGETS.map((widget) => `--ct-source-${widget}: var(--vscode-${widget}-background);`).join('\n  ')}
  --ct-source-icon: var(--vscode-activityBar-foreground, var(--vscode-foreground));

  /* What a mark ON the ground is worth, worn by the activity bar's icons and by the name on the
     side bar's title row. A theme picks its foregrounds for its own near-black surfaces, and on
     the ground focus puts there they measure 1.3:1 - a smudge rather than a glyph; walking from
     that ground back toward the theme's own icon colour lands the right way up in a light theme
     too, and the hue arrives at a chroma low enough to read as a wash.
     A quiet tile wears the same mark at half the chroma: the ground under it is already the
     quieter one, so the tie is the only thing left to say more softly. */
  --ct-ink-chroma: ${chroma(INK[stateOf(context)], rungOf(context))};
  --ct-ink: oklch(from color-mix(in oklab, var(--ct-source-icon) 80%, var(--modern-ui-shell-background))
    l var(--ct-ink-chroma) ${context.hue});

  & > * {
    --vscode-sideBar-background: ${veiled('--ct-source-sidebar')};
    --vscode-editor-background: ${veiled('--ct-source-editor')};
    --vscode-panel-background: ${veiled('--ct-source-panel')};
    ${WIDGETS.map((widget) => `--vscode-${widget}-background: ${veiled(`--ct-source-${widget}`)};`).join('\n    ')}

    /* The activity bar's icons follow the ground the bar wears, focused or not, and the ink is
       dimmer than the colour a checked view wears - so the view you are in stays the brightest
       thing in the column. */
    --vscode-activityBar-inactiveForeground: var(--ct-ink);
  }

  /* That variable reaches the menubar's glyph and nothing else, because every view's icon is
     written INLINE on its label from JS: a codicon paints with color, and an extension's own icon
     is a mask that paints with background-color. Held at (0,7,0), below the editor's own checked
     and hover rules, so those two states stay the theme's. */
  & .part.activitybar .monaco-action-bar .action-item {
    & .action-label.codicon { color: var(--vscode-activityBar-inactiveForeground) !important; }
    & .action-label.uri-icon {
      background-color: var(--vscode-activityBar-inactiveForeground) !important;
    }
  }

  /* Every part writes its background INLINE, as a literal, from JS. The modern UI's own
     !important re-reads the variable for most of them and so carries the tint with it; the editor
     has no such rule, and only !important outranks an inline style. The value is the rewritten
     variable, so the editor arrives where the others do. */
  & .part.editor > .content,
  & .part.editor .editor-container {
    background-color: var(--vscode-editor-background) !important;
  }

  /* The terminal takes no variable at all: xterm resolves its colours in JS at construction and
     paints them into an opaque canvas, so the tint goes ON TOP of that canvas as the colour the
     panel already wears. Lighten blending is a per-channel max, so every pixel brighter than a
     7% hue over a near-black comes through byte-identical - which is every glyph a theme puts
     there - and over chrome already tinted the same colour it is the identity. The overlay clears
     .xterm-screen's z-index 31, and positions against the pane body rather than its own box: the
     body is the terminal's whole area and is already relative, so nothing here re-bases the
     absolutely positioned .xterm inside it. */
  & .part.panel .terminal-outer-container::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 40;
    pointer-events: none;
    /* The backdrop in the order the editor resolves it, so the mix starts where xterm started. */
    background: color-mix(in oklab,
      var(--vscode-terminal-background, var(--ct-source-panel)) var(--ct-veil), var(--ct-brand));
    mix-blend-mode: lighten;
  }

  /* The activity bar is SHELL, not a card: it wears the ground the parts float on, which is what
     it showed before a theme with an activityBar.background of its own made it opaque and
     dropped it out. Neither veil nor plate is the colour - the ground is, and it is the ground
     that makes the strip read as continuous with the gaps around every part. Following the ground
     means following focus with it, which is the point of the ground. */
  & .part.activitybar {
    background-color: var(--modern-ui-shell-background) !important;
  }

  /* The active tab wears the hue too, wherever there is one: a file, a Claude session, the view
     switcher's own active item, and the terminal tabs the terminals seam mirrors. All of them
     read these two variables and nothing else, so this is the one place it is said - and the
     unfocused-group variants derive from the first, so they follow with nothing added here.
     The hover washes are left alone: they are the theme's translucent white over whatever is
     under them, which is now a tinted tab. */
  &.modern-ui-tabs {
    --modern-ui-editor-tab-active-background:
      color-mix(in oklab, var(--vscode-modernEditorTab-activeBackground) var(--ct-wash), var(--ct-brand));
    --modern-ui-tab-active-background:
      color-mix(in oklab, var(--vscode-modernTab-activeBackground) var(--ct-wash), var(--ct-brand));
  }

  & .part.sidebar .composite.title {
    background-color: var(--ct-plate);
  }

  /* The activity bar rounds its own right corners and clips to them, so a square plate reaching
     that far loses a chamfer - and a plate is what this tint makes of the menubar, which nothing
     paints in a stock window. Rounded as the identity seam's badge asks, since its ring is this
     plate's edge; without that seam, one step in from the part's own radius clears the arc. */
  & .part.activitybar .menubar {
    background-color: var(--ct-plate);
    border-radius: var(--ct-plate-radius, var(--vscode-cornerRadius-small, 4px));
  }
}

/* Focus is the ground: the gaps between this window's own parts take the hue while every part
   inside it stays as the theme painted it - and a tile nobody is in wears the same ground at a
   fraction of it, so it still reads as this project's without answering "you are here". One
   variable, because it is the one name everything that is ground already reads: the editor paints
   the grid view from it, and the activity bar is pointed at it above. !important because the
   title bar service writes this variable INLINE on the workbench container, which a stylesheet
   cannot otherwise outrank. */
.monaco-workbench {
  --modern-ui-shell-background: color-mix(in oklab,
    var(--vscode-titleBar-activeBackground) ${groundShare(context)},
    var(--ct-brand)) !important;
}
`,
  // The stylesheet stops at a frame, so the same tint is said again inside every webview. The
  // element goes on documentElement rather than head: the editor's own applyStyles runs before a
  // content document has a head, and it clears the INLINE properties there and nothing else.
  init(api) {
    api.eachDocument((document) => {
      const root = document.documentElement;
      if (!root) return;
      const surface = surfaceFor(document);
      const raws = rawsFrom(root);
      if (!surface || !Object.keys(raws).length) return;
      let element = document.getElementById(STYLE_ID);
      if (!element) {
        element = document.createElement('style');
        element.id = STYLE_ID;
      }
      const css = frameCss(api.context, surface, raws);
      if (element.textContent !== css) element.textContent = css;
      if (element.parentElement !== root) root.appendChild(element);
    });
  },
};
