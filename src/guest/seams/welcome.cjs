'use strict';

// The welcome page, saying this app rather than the server under it. Two of the three changes
// are the server's own switches, taken where it is spawned (`src/main/server.js`): `--app-name`
// is the heading, which code-server serves to the workbench as its `nameLong`, and
// `--disable-getting-started-override` is Coder's "Next Up" ad.
//
// The walkthroughs are the third, and the editor has no switch: the list empties only by hiding
// each card in turn, which is a choice it stores per profile and offers back as "see all
// walkthroughs" - a link a seam would then spend its life fighting. So the page is handed no
// walkthroughs to list, and everything after that is the editor's own empty state: it drops the
// list, moves Recent into the column the walkthroughs had, and lets it run to ten. Nothing is
// taken away, only the page's copy of it - the service still holds them and
// "Welcome: Open Walkthrough..." still opens one. [code-server 4.135.0]
//
// Unpatched, the list is there, exactly as a stock window shows it.
module.exports = {
  name: 'welcome',
  patch: {
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: 'ct:no-walkthroughs',
    find: /\.setEntries\(this\.gettingStartedCategories\)/,
    replace: '.setEntries([]/* ct:no-walkthroughs */)',
  },
};
