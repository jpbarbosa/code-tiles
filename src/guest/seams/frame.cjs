'use strict';

// How much of the editor's own frame a tile keeps. The editor floats its parts inside a frame of
// its own, and that frame is ADDED to the app's gutter, so the space beside a tile is this inset
// plus METRICS.gap - and the inset is the larger half.
const FRAME_SHARE = 1 / 2;

const BUNDLE = 'lib/vscode/out/vs/code/browser/workbench/workbench.js';

// It has to be said twice, because the editor keeps the number twice. A margin says where a
// part's box sits; the layout service sizes that part from a constant in the bundle. Measured at
// 4.135.0: the stylesheet alone slid the editor's top from 8px to 4px and stranded its bottom at
// 12px, and the patch alone changed nothing visible. Widths reflow on their own - only the
// vertical needs the patch, and it needs it absolutely. Both read FRAME_SHARE so they cannot
// drift apart.
//
// One unit, doubled at the workbench's edge and single between two parts, so scaling it scales
// BOTH - and the seam between a window's own parts is not this seam's business. It is put back
// afterwards, which is the only way to move the frame without moving what is inside the tile: a
// margin on each axis, and the reservation with it on the vertical, where nothing reflows.
//
// docs/CONSTRAINTS.md warns the inset moves between versions: this is the one place allowed to
// know it exists. Unpatched, the frame stays at the editor's own 8px. [code-server 4.135.0]
module.exports = {
  name: 'frame',

  // Scoped to the part rather than the workbench: the same token sets tab and status bar
  // spacing, and scaling it everywhere shrank the editor's tabs by 4px with it. Scoped here it
  // also carries the parts' own `height: calc(100% - ...)` rules, which a margin override alone
  // would leave behind. The children read the unit back at full size.
  css: () => `
.monaco-workbench.floating-panels {
  --ct-frame-unit: var(--vscode-spacing-size40);

  & .part { --vscode-spacing-size40: calc(var(--ct-frame-unit) * ${FRAME_SHARE}); }
  & .part > * { --vscode-spacing-size40: var(--ct-frame-unit); }

  /* The gap between two of the window's OWN parts, at full width again: it is a single unit
     where the workbench's edge is a doubled one, so the scaling above catches it too. The
     activity bar is excluded because it has no left margin to restore. */
  & .part:not(.floating-part-outer-left):not(.activitybar),
  & > .monaco-grid-view .part.editor:not(.floating-editor-outer-left) {
    margin-left: var(--ct-frame-unit);
  }

  /* The same seam vertically, which is the gap above the panel. The margin alone strands it: a
     part's height is what is left of its slot once the reservation is taken, so the second patch
     below has to say the same number. */
  &.panel-position-bottom:not(.nopanel):not(.nomaineditorarea) .part.panel.bottom {
    margin-top: var(--ct-frame-unit);
  }

  /* The activity bar's COLUMN is reserved by the layout service from the scaled unit, while the
     bar's own width is the activity-bar-width variable plus a different token that does not
     scale with it. The reservation shrinks, the bar does not, and the two land flush - so its
     neighbour takes the difference back and the column reads as a stock window's does. The
     doubled margin belongs to whichever part is that neighbour, which is the editor once the
     side bar is hidden: at a single unit it lands flush and the bar loses the gap on its right. */
  & .part.sidebar.left:not(.floating-part-outer-left),
  &.nosidebar > .monaco-grid-view .part.editor {
    margin-left: calc(var(--ct-frame-unit) * 2);
  }
}
`,

  // The bundle the browser runs, which is not the one the editor's sources are in: a patch on
  // workbench.web.main.internal.js is served but never executed.
  patch: [
    {
      file: BUNDLE,
      marker: 'ct:frame-share',
      find: /var ([A-Za-z_$][\w$]*)=4,([A-Za-z_$][\w$]*)=0;function/,
      replace: `var $1=4*${FRAME_SHARE}/* ct:frame-share */,$2=0;function`,
    },

    // The reservation behind the vertical seam above, put back to the editor's own unit. Only the
    // panel-under-editor branch: the one beside it is the side bar's seam under a panel at the
    // top, which no tile has, and which the stylesheet leaves scaled.
    {
      file: BUNDLE,
      marker: 'ct:frame-seam',
      find: /return\{top:([\w$]+)\|\|([\w$]+)\?([\w$]+):([\w$]+)\?\3\*2:([\w$]+),bottom:/,
      replace: `return{top:$1?$3:$2?$3/${FRAME_SHARE}/* ct:frame-seam */:$4?$3*2:$5,bottom:`,
    },
  ],
};
