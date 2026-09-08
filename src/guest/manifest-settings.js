// The manifest again, from the ESM side of the fence: main writes settings before the server
// starts, and the guest requires the same files as CommonJS. Two lines of bridge, so there is
// still only ONE list of seams to keep.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default require('./manifest.cjs');

// The one thing outside a window that has to know what a rung is worth: the shell paints each
// tile's ground before that tile has a window to paint it. Both dials at once, because the shell
// draws every tile in one pass and the two are on different rungs.
export function groundShares(levels = {}) {
  const { groundShare } = require('./rungs.cjs');
  return {
    focused: groundShare({ tint: levels.focused, focused: true }),
    quiet: groundShare({ tint: levels.quiet, focused: false }),
  };
}

// The rung names, for the one place that validates them. Spelled here so main is not a second
// list that can fall out of step with what the seam can actually spend.
export function rungNames() {
  return Object.keys(require('./rungs.cjs').RUNGS);
}
