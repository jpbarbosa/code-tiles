'use strict';

const { shapeOf, tileRadius } = require('../corners.cjs');

// A tile is a card on the app's ground, so the window rounds its own corners and leaves them
// UNPAINTED: the shell cannot round a view from outside - it paints above the page it sits on -
// and a corner the window fills with a colour of its own is a square of opacity over the glow,
// which the shell draws for the focused tile in the gutter. Left unpainted, the corner is the
// shell's own ground when the tile is quiet and its glow when the tile is focused, so the halo
// is a band of even thickness around the card rather than one pinched off at every corner.
module.exports = {
  name: 'card',
  css: (context) => `
.monaco-workbench {
  /* The tile's corner, as the Corners preference has it (src/guest/corners.cjs). The editor keeps
     overflow: hidden here, so this clips, and a squircle clip costs a mask layer over the
     composited parts - docs/CONSTRAINTS.md. */
  border-radius: ${tileRadius(context.corners)}px;
  corner-shape: ${shapeOf(context.corners)};
}
`,
};
