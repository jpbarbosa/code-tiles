'use strict';

// The one thing a window tells the app about itself: the colour the running theme paints behind
// its floating parts. The shell paints its strip and gutters with it, which is what makes the
// window read as one flat ground with tiles cut out of it rather than as a frame around them.
//
// The theme's own colour is read, never the tinted one the focus seam may have written over it,
// or the two would chase each other.
module.exports = {
  name: 'ground',
  init(api) {
    api.whenWorkbench((workbench) => {
      const report = () => {
        const ground = getComputedStyle(workbench)
          .getPropertyValue('--vscode-titleBar-activeBackground').trim();
        if (ground) api.send('ground', { ground });
      };
      report();
      // A theme change swaps the class on the workbench and repaints from new variables.
      new MutationObserver(report).observe(workbench, { attributes: true, attributeFilter: ['class'] });
    });
  },
};
