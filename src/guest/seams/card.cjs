'use strict';

// A tile is a card on the app's ground, so the window rounds its own corners and leaves them
// UNPAINTED: the shell cannot round a view from outside - it paints above the page it sits on -
// and a corner the window fills with a colour of its own is a square of opacity over the glow,
// which the shell draws for the focused tile in the gutter. Left unpainted, the corner is the
// shell's own ground when the tile is quiet and its glow when the tile is focused, so the halo
// is a band of even thickness around the card rather than one pinched off at every corner.
//
// 7px, because src/shell/shell.css draws that glow at 10px of radius with 3px of bleed: the two
// arcs are concentric only at this number. The workbench clips to it on its own - the editor
// has kept `overflow: hidden` on it since the parts were placed in JS.
module.exports = {
  name: 'card',
  css: () => `
.monaco-workbench {
  border-radius: 7px;
}
`,
};
