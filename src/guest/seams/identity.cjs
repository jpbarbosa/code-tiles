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
.monaco-workbench .part.activitybar .menubar .menubar-menu-button > .menubar-menu-title::before {
  /* The !importants here, and the rule that forced them: the product icon theme sets this same
     pseudo's glyph AND the font it is drawn in with !importants of its own (content:
     var(--vscode-icon-menu-content), font-family: var(--vscode-icon-menu-font-family)), so a
     plain override loses and the hamburger paints on top of the mark - and a letter left in the
     codicon font is a glyph nobody has. */
  content: ${JSON.stringify(context.icon ? '' : initial(context.name))} !important;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  ${context.icon ? `background-image: url("${context.icon}");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;` : `background: oklch(${MARK_LIGHTNESS} ${MARK_CHROMA} ${context.hue});
  font-family: system-ui !important;
  font-size: 11px;
  font-weight: 600;
  color: #fff;`}
}
${RINGS[context.claudeState] ? `
.monaco-workbench .part.activitybar .menubar .menubar-menu-button > .menubar-menu-title {
  /* The editor already positions this box, and the ring is placed against it; said again so a
     build that stopped puts the ring nowhere rather than in the window's top left corner. */
  position: relative;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    /* Concentric with the card, which is the whole reason for these numbers: an 18px badge
       rounded by 3px, a ring standing 4.5px off it, so 27px at a radius of 7.5 - and the 2px the
       stroke eats inward leaves 2.5px of air on the flats AND round the corners. box-sizing is
       said out loud because the padding is the stroke: under content-box the ring grows by 4px
       and stops being concentric with anything. */
    box-sizing: border-box;
    width: 27px;
    height: 27px;
    margin: -13.5px 0 0 -13.5px;
    border-radius: 7.5px;
    padding: 2px;
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
  }
}

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
        if (event.button !== 0 || !api.context.tiled) return;
        const button = event.target.closest(HANDLE);
        if (!button) return;
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
