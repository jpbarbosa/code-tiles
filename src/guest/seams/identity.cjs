'use strict';

// Which project this window is, said inside the window, because the strip outside it is not
// visible from in here once your eye is in the editor. Twice: the project's own mark - its
// favicon, or its initial on its own hue where there is none - at the top of the activity bar,
// where the title bar used to be, and its name on the side bar's title row - the one row every
// viewlet renders into, so switching to Search keeps it.
//
// Both are pseudo-elements rather than inserted nodes: there is nothing to keep alive when the
// workbench rebuilds a row, and nothing to clean up. The badge is the hamburger's own glyph
// swapped for that mark, so the button underneath is still the editor's and still opens the menu.
// A third thing rides on the badge, for the same reason it is where a glance lands: what Claude
// is doing here, as a ring around it. The badge is the ::before of that one element and the ring
// is its ::after, so the two cannot fall out of step with each other.
//
// A fourth: the badge is what you take hold of to move this tile among the others. The card the
// project's mark sits on is the honest handle for the project itself, and it costs the badge
// nothing - a pseudo-element cannot carry a listener, but the button it is drawn on can, and the
// gesture is delegated off the workbench anyway, since the menubar is rebuilt whenever the menu
// changes. What it costs is the PRESS: the menubar opens on `mousedown`, and the only way to know
// whether a press is a drag is to hold it until the hand moves. `preventDefault` on `pointerdown`
// suppresses the compatibility mousedown the menu would have opened on, and a release that never
// became a drag gives the press back by dispatching the pair the menubar listens for - a
// synthetic `click` alone does not open it. [code-server 4.135.0]
const HUE = '#d97757';
const CLEAR = 'rgba(217, 119, 87, 0)';

// The plate a project with no favicon wears instead: its initial, on the same colour the strip's
// own chip draws it on - src/shell/format.js, said there in the page's units and here in the
// window's, since neither side may read the other's.
const MARK_LIGHTNESS = 0.62;
const MARK_CHROMA = 0.15;

function initial(name) {
  return (name.trim()[0] || '?').toUpperCase();
}

// The badge, and the button it is drawn on: the editor's menu button at the top of the activity
// bar, which the compact menu bar setting puts there and the tint paints as a card.
const HANDLE = '.part.activitybar .menubar .menubar-menu-button';
// Far enough that a hand on its way to the menu does not take the tile with it.
const SLOP = 4;

// The state is the MOTION, never the colour: turning while Claude works, pulsing while it waits
// on you, breathing once a turn has ended that you have not seen. One hue, so there is nothing to
// learn but the movement, and a project with no session wears no ring at all.
//
// The comet turns by its own ANGLE rather than by a transform on the ring, because the ring is a
// rounded rectangle and a mask turns with the element it masks - the corners would wobble round.
// An angle inside a gradient cannot be composited, so every step is a repaint; stepped at 20fps
// that is 0.13% of a core per ring, measured against 0.04% for the same shape done as a masked
// box with a rotating CHILD, which is a node and an observer to keep it alive. CSS beats an init
// at four times nothing.
const RINGS = {
  working: `background: conic-gradient(from var(--ct-ring-angle), ${CLEAR} 0deg, ${CLEAR} 35deg, ${HUE} 330deg, ${CLEAR} 360deg);
  animation: ct-ring-turn 1.8s steps(36) infinite;`,
  attention: `background: ${HUE};
  animation: ct-ring-pulse 2.4s ease-in-out infinite;`,
  // Held still, this is the one state that has to reach you and the least visible of the three,
  // so it breathes instead - at half the rate and a fraction of the depth of the pulse above.
  finished: `background: ${HUE};
  animation: ct-ring-breathe 4.8s steps(96) infinite;`,
};

module.exports = {
  name: 'identity',
  css: (context) => `
.monaco-workbench .part.activitybar .menubar {
  /* The card the badge is drawn on, which the tint paints: rounded here, since the ring is its
     edge and a card rounded any less would show its corners outside the ring. */
  --ct-plate-radius: 8.5px;

  & .menubar-menu-button > .menubar-menu-title {
    /* The editor pads this 8px a side for a row of text menus, leaving 20px - which squeezes a
       24px badge, and which widens the title past the bar's clipped edge if the badge refuses. */
    padding: 0;
    /* The editor already positions this box, and the ring is placed against it; said again so a
       build that stopped puts the ring nowhere rather than in the window's top left corner. */
    position: relative;

    &::before {
      /* The !importants here, and the rule that forced them: the product icon theme sets this same
         pseudo's glyph AND the font it is drawn in with !importants of its own (content:
         var(--vscode-icon-menu-content), font-family: var(--vscode-icon-menu-font-family)), so a
         plain override loses and the hamburger paints on top of the mark - and a letter left in the
         codicon font is a glyph nobody has. */
      content: ${JSON.stringify(context.icon ? '' : initial(context.name))} !important;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 3px;
      ${context.icon ? `background-image: url("${context.icon}");
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;` : `background: oklch(${MARK_LIGHTNESS} ${MARK_CHROMA} ${context.hue});
      font-family: system-ui !important;
      font-size: 15px;
      font-weight: 600;
      color: #fff;`}
    }
${RINGS[context.claudeState] ? `
    &::after {
      content: "";
      position: absolute;
      /* The button's own box, so the ring is the card's edge and the badge gets the room inside it:
         a 3px stroke and 2.5px of air either side of 24px - the size the bar draws its own icons
         at - fill the editor's 35. Rounded as the card is, which keeps all three concentric: 3 on
         the badge, 5.5 inside the stroke, 8.5 outside it. The box is 36 wide, so the air is half
         a pixel more across than down. */
      inset: 0;
      border-radius: var(--ct-plate-radius);
      padding: 3px;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      ${RINGS[context.claudeState]}
      /* The button under it is still the editor's, and still opens the menu. */
      pointer-events: none;

      /* Stopping the motion has to leave three states that still read apart: working keeps the
         comet, whose gap stands in for the turn, and waiting is dimmed where it would have pulsed. */
      @media (prefers-reduced-motion: reduce) {
        animation: none;
        opacity: ${context.claudeState === 'attention' ? '0.45' : '1'};
      }
    }` : ''}
  }
}
${RINGS[context.claudeState] ? `
/* Registered, or it is a string the gradient cannot read and the comet never moves. */
@property --ct-ring-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@keyframes ct-ring-turn { to { --ct-ring-angle: 360deg; } }
@keyframes ct-ring-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes ct-ring-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.34; } }` : ''}

${context.tiled ? `
/* While there are other tiles to move this one among, the badge is a handle and says so. The
   cursor is the whole affordance: the card is already drawn, and a second mark on it would be
   the app talking about itself inside a window that has a project in it. */
.monaco-workbench ${HANDLE} { cursor: grab; }
.monaco-workbench ${HANDLE}[data-ct-holding] { cursor: grabbing; }
` : ''}
/* The row wears the ink the activity bar's icons wear - a colour derived from the ground rather
   than mixed into the theme's own foreground, which on a light theme washes the hue out.
   !important because the composite writes the theme's title foreground INLINE on this node from
   JS, which no stylesheet outranks otherwise; the name inherits it from here. */
.monaco-workbench .part.sidebar .composite.title .title-label h2 {
  color: var(--ct-ink) !important;

  &::before {
    content: ${JSON.stringify(`${context.name} ·`)};
    margin-right: 6px;
  }
}
`,

  init(api) {
    api.whenWorkbench((workbench) => {
      // Delegated off the workbench rather than bound to the button: the menubar is rebuilt
      // whenever the menu changes, and a listener on the button would go with it.
      let press = null;

      const finish = (cancel) => {
        if (!press) return;
        const { button, dragging } = press;
        press = null;
        button.removeAttribute('data-ct-holding');
        if (dragging) return void api.send('project:drop', { cancel });
        // Never a drag, so the menu gets the press it was denied. Not on Esc: abandoning a
        // gesture is not a way to open a menu.
        if (!cancel) openMenu(button);
      };

      workbench.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const button = event.target.closest(HANDLE);
        if (!button) return;
        // A control-click is macOS's right-click, which the contextmenu below answers - so the
        // menubar must not open on the same press, and a press that is a menu is never a drag.
        if (event.ctrlKey) return void event.preventDefault();
        if (!api.context.tiled) return;
        // Held, not taken: this suppresses the mousedown the menubar opens on, which is the only
        // way to tell a drag from a click before the hand has said which it is.
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        button.setAttribute('data-ct-holding', '');
        press = { button, x: event.clientX, y: event.clientY, dragging: false };
      }, true);

      workbench.addEventListener('pointermove', (event) => {
        if (!press || press.dragging) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < SLOP) return;
        press.dragging = true;
        // Only now does main hear about it: a press that stays still is a menu, and a drag
        // session it would have to end for itself.
        api.send('project:drag');
      }, true);

      workbench.addEventListener('pointerup', () => finish(false), true);
      workbench.addEventListener('pointercancel', () => finish(true), true);
      workbench.ownerDocument.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(true);
      }, true);

      // A right-click on the badge is the PROJECT's menu - its icon, its colour - which main draws
      // natively at the cursor, rather than the activity bar's, whose Hide Menu takes the badge
      // itself away. Stopped on the way down, before the bar's own listener under it hears it.
      workbench.addEventListener('contextmenu', (event) => {
        if (!event.target.closest(HANDLE)) return;
        event.preventDefault();
        event.stopPropagation();
        api.send('project:menu');
      }, true);
    });
  },
};

// The press the menu never got. The menubar listens for the pair; a synthetic click does not
// reach it. [code-server 4.135.0]
function openMenu(button) {
  const box = button.getBoundingClientRect();
  const at = {
    bubbles: true,
    cancelable: true,
    button: 0,
    view: button.ownerDocument.defaultView,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };
  for (const type of ['mousedown', 'mouseup']) button.dispatchEvent(new MouseEvent(type, at));
}
