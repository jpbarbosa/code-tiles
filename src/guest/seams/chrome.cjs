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
// A tile is narrow, so the bar keeps the views a project is actually WORKED in - and the rest are
// not HIDDEN, they move into the "Additional Views" overflow the editor already draws when a bar
// runs out of room, which names them, badges them, opens them, and puts one back in the column
// for as long as it is the view you are in. The accounts and profile items at the foot of the bar
// are neither: they are a second action bar and are left alone.
//
// The switch that would say this does not exist: pinning is a per-profile choice made from the
// bar's context menu and kept in the browser's own storage, and the overflow is driven by how
// many items FIT rather than by a preference. So the patch says it where the bar decides - the
// list of ids about to be shown is filtered, and the count it is compared against is left whole,
// which is exactly the state a bar with too little room is in. Held to the VERTICAL bar and to
// `workbench.view.*` ids, because the panel and the secondary side bar run the same class.
//
// Unpatched, the bar shows every view it has, which is a stock window. [code-server 4.135.0]

// Extensions is off this list on purpose: installing one is a thing you do to your VS Code, which
// this app mirrors rather than being where it happens - a tile that installed one would have it
// pruned on the next start. It reads as the same kind of view as Run and Debug or Testing, so it
// is filed with them.
const KEPT = [
  'workbench.view.explorer',
  'workbench.view.search',
  'workbench.view.scm',
];

// The one question both patches ask, written into the bundle at each of the two places the bar
// can put an item in the column.
const keeps = (id) => `(this.options.orientation!==1||!${id}.startsWith("workbench.view.")`
  + `||${JSON.stringify(KEPT)}.includes(${id}))`;

module.exports = {
  name: 'chrome',

  // The rewrite restates the two counts instead of re-emitting them: the total the overflow is
  // decided by is taken BEFORE the filter, and the "how many fit" default after it, which is what
  // leaves the shape gone rather than matched forever.
  //
  // The second is the same rule at the bar's other door. Having filtered the list, the editor then
  // pushes the ACTIVE item back into it unconditionally, so an overflowed view took a place in the
  // column for as long as it was open - the one state where the four kept ids were five. The
  // Additional Views menu marks the open one instead, which is where it is listed anyway.
  patch: [{
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: 'ct:bar-views',
    find: /let ([\w$]+)=this\.model\.visibleItems\.filter\(([\w$]+)=>\2\.pinned\|\|this\.model\.activeItem&&this\.model\.activeItem\.id===\2\.id\)\.map\(([\w$]+)=>\3\.id\),([\w$]+)=\1\.length,([\w$]+)=\1\.length,/,
    replace: 'let $1=this.model.visibleItems.filter($2=>$2.pinned||this.model.activeItem'
      + '&&this.model.activeItem.id===$2.id).map($3=>$3.id),$5=$1.length,'
      + `$4=($1=$1.filter(id=>${keeps('id')})).length/* ct:bar-views */,`,
  }, {
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: 'ct:bar-active',
    find: /this\.model\.activeItem&&([\w$]+)\.every\(([\w$]+)=>!!this\.model\.activeItem&&\2!==this\.model\.activeItem\.id\)&&\(([\w$]+)\+=this\.compositeSizeInBar\.get\(this\.model\.activeItem\.id\),\1\.push\(this\.model\.activeItem\.id\)\)/,
    replace: `this.model.activeItem&&${keeps('this.model.activeItem.id')}/* ct:bar-active */`
      + '&&$1.every($2=>!!this.model.activeItem&&$2!==this.model.activeItem.id)'
      + '&&($3+=this.compositeSizeInBar.get(this.model.activeItem.id),$1.push(this.model.activeItem.id))',
  }],

  settings: {
    'window.commandCenter': false,
    'workbench.layoutControl.enabled': false,
    'window.menuBarVisibility': 'compact',
    'workbench.statusBar.visible': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
  },

  // The two with no switch to take: both are menu contributions, `PanelTitle` and `EditorTitleRun`,
  // and neither offers a setting. Only the button goes; the command and its keybinding still run.
  css: () => `
/* Maximize Panel hides the EDITOR part rather than growing the panel, and under a Claude chat it
   undoes itself in one frame: the chat takes focus as its editor goes, and the workbench
   un-maximizes whenever one re-activates. On the icon, kept in both states. [code-server 4.135.0] */
.monaco-workbench .part.panel .composite.title .action-item:has(> .action-label.codicon-panel-maximize) {
  display: none;
}

/* Run, in the editor's title row. One shape only: the editor appends it as a submenu carrying
   \`isSplitButton\`, so it is a dropdown-with-default however many entries the language ships. The
   !important is the editor's own, which pins that class at \`display: flex !important\`. */
.monaco-workbench .part.editor .editor-actions .action-item.monaco-dropdown-with-default {
  display: none !important;
}
`,
};
