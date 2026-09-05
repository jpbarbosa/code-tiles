'use strict';

// The parts of an editor window this app does not show. Each through the editor's own switch,
// except the last.
//
// The title bar and status bar: in web the workbench decides for itself whether a title bar is
// needed - it draws one if the command center, the layout control, the editor actions or a
// non-compact menu bar want to live in it, and hides it outright when none of them do. Turn
// those off and the layout reflows with no band left behind, which is what CSS could never do
// here: the parts are placed in JS, so display:none leaves the space it was given.
//
// The menu is not lost with it: at "compact" the workbench moves the hamburger to the top of the
// activity bar, which is where the identity seam then draws the badge.
//
// The chat panel: the secondary side bar's default is `visibleInWorkspace`, and a tile always
// has a folder open, so every window came up with Chat showing. Claude lives in the terminal
// here. This is a default, not a lock: Cmd+Alt+B still opens it, and a workspace that stored a
// layout before this setting existed keeps that layout until its key is dropped - see the
// per-workspace layout fact in docs/CONSTRAINTS.md.
//
// The activity bar's own list is the exception, and the one place here with no switch behind it.
// A tile is narrow, so the bar keeps the four views a project is actually worked in - and the
// rest are not HIDDEN, they move into the "Additional Views" overflow the editor already draws
// when a bar runs out of room, which names them, badges them, opens them, and puts one back in
// the column for as long as it is the view you are in. The accounts and profile items at the
// foot of the bar are neither: they are a second action bar and are left alone.
//
// The switch that would say this does not exist: pinning is a per-profile choice made from the
// bar's context menu and kept in the browser's own storage, and the overflow is driven by how
// many items FIT rather than by a preference. So the patch says it where the bar decides - the
// list of ids about to be shown is filtered, and the count it is compared against is left whole,
// which is exactly the state a bar with too little room is in. Held to the VERTICAL bar and to
// `workbench.view.*` ids, because the panel and the secondary side bar run the same class.
//
// Unpatched, the bar shows every view it has, which is a stock window. [code-server 4.135.0]
const KEPT = [
  'workbench.view.explorer',
  'workbench.view.search',
  'workbench.view.scm',
  'workbench.view.extensions',
];

module.exports = {
  name: 'chrome',

  // The rewrite restates the two counts instead of re-emitting them: the total the overflow is
  // decided by is taken BEFORE the filter, and the "how many fit" default after it, which is what
  // leaves the shape gone rather than matched forever.
  patch: {
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: 'ct:bar-views',
    find: /let ([\w$]+)=this\.model\.visibleItems\.filter\(([\w$]+)=>\2\.pinned\|\|this\.model\.activeItem&&this\.model\.activeItem\.id===\2\.id\)\.map\(([\w$]+)=>\3\.id\),([\w$]+)=\1\.length,([\w$]+)=\1\.length,/,
    replace: 'let $1=this.model.visibleItems.filter($2=>$2.pinned||this.model.activeItem'
      + '&&this.model.activeItem.id===$2.id).map($3=>$3.id),$5=$1.length,'
      + `$4=($1=$1.filter(id=>this.options.orientation!==1||!id.startsWith("workbench.view.")`
      + `||${JSON.stringify(KEPT)}.includes(id))).length/* ct:bar-views */,`,
  },

  settings: {
    'window.commandCenter': false,
    'workbench.layoutControl.enabled': false,
    'window.menuBarVisibility': 'compact',
    'workbench.statusBar.visible': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
  },
};
