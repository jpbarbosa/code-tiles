'use strict';

// Reveal in Finder, which no tile had: the desktop registers `revealFileInOS` in its Electron layer
// alone, and hides the item for anything but a `file:` resource, which nothing in a tile is. The
// server runs here, as you, so an extension in its host does what the item did - and as one of the
// server's own BUILT-INS it is in every profile, outside all the app installs, prunes and mirrors.
// Unplaced, the menus are stock. [code-server 4.135.0]
const path = require('node:path');

module.exports = {
  name: 'reveal',
  builtin: path.join(__dirname, '..', 'builtin', 'reveal'),
};
