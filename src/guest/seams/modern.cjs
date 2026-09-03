'use strict';

// The editor's own rounded design, on. Parts stop being panes butted against each other and
// become cards floating on the shell colour, which is the same shape a tile already has in the
// window - so a tile reads as a card rather than as a cropped window.
//
// One switch, and every radius, inset, border and shadow under it is the product's. The inset
// it floats those parts in is the editor's own frame, which docs/CONSTRAINTS.md warns moves
// between versions: nothing here may measure it or match it.
module.exports = {
  name: 'modern',
  settings: {
    'workbench.experimental.modernUI': true,
  },
};
