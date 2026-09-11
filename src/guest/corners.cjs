'use strict';

// The Corners preference: `squircle`, the shape macOS draws its windows with, or `round`, the circle
// every corner was before. Names, like the tint's rungs; what each is worth is said only here.
const SHAPES = ['squircle', 'round'];
const DEFAULT = 'squircle';

// A squircle's radius against the circle's it replaces, for the same cut at the diagonal: 0.293
// over 0.159. src/shell/corners.css says it again, being CSS, as its `--corner-scale`.
const SCALE = 1.84;

// A name that is not one, from a state file written by hand or by another build, is the default
// rather than a window with no corner at all.
const shapeOf = (shape) => (SHAPES.includes(shape) ? shape : DEFAULT);

// The tile's own corner under each. As a squircle it is the window's - which macOS 27 draws as
// 28.8px - less the 8px gutter: Apple's rule for a corner nested in another, because the exact
// offset of a squircle turns sharply at the diagonal and reads tighter than the window's.
function tileRadius(shape) {
  return shapeOf(shape) === 'squircle' ? 28.8 - 8 : 7;
}

// What a page of the app's own needs, which its sandboxed preload cannot require: the switch
// corners.css spends, and the tile's radius the glow is struck around.
function cornerValues(shape) {
  return { squircle: shapeOf(shape) === 'squircle' ? 1 : 0, tileRadius: tileRadius(shape) };
}

// The same, as the arguments a window is launched with, so its first paint already has them.
function launchArguments(shape) {
  const values = cornerValues(shape);
  return [`--ct-squircle=${values.squircle}`, `--ct-tile-radius=${values.tileRadius}`];
}

module.exports = { SHAPES, DEFAULT, SCALE, shapeOf, tileRadius, cornerValues, launchArguments };
