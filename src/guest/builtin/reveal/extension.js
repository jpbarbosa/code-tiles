'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');
const vscode = require('vscode');

const { contributes } = require('./package.json');

// Three names for one handler, because a manifest fixes a command's title: each host shows the one
// its own desktop VS Code would, and the menus hide the other two.
exports.activate = (context) => {
  for (const { command } of contributes.commands) {
    context.subscriptions.push(vscode.commands.registerCommand(command, (clicked, selected) => {
      reveal(targets(clicked, selected));
    }));
  }
};

// The explorer passes the row clicked and the whole selection, a tab passes its own resource and
// an object, and the palette passes nothing, which means whatever the active tab is showing.
function targets(clicked, selected) {
  const uris = Array.isArray(selected) && selected.length
    ? selected
    : [clicked ?? vscode.window.tabGroups.activeTabGroup.activeTab?.input?.uri];
  return uris.filter((uri) => uri?.scheme === 'file').map((uri) => uri.fsPath);
}

function reveal(files) {
  if (!files.length) return;
  if (process.platform === 'darwin') return void run('open', ['-R', ...files]);
  // explorer wants `/select,"path"` as ONE argument with the quotes inside it, which node would
  // otherwise quote a second time around the whole thing.
  if (process.platform === 'win32') {
    for (const file of files) run('explorer.exe', [`/select,"${file}"`], { windowsVerbatimArguments: true });
    return;
  }
  for (const folder of new Set(files.map((file) => path.dirname(file)))) run('xdg-open', [folder]);
}

// A tool that could not start, or one that said why it failed. explorer.exe exits 1 having done
// exactly what it was asked, so an exit status alone is no verdict.
function run(file, args, options = {}) {
  execFile(file, args, options, (error, _stdout, stderr) => {
    if (!error || (typeof error.code !== 'string' && !stderr.trim())) return;
    vscode.window.showErrorMessage(`${file}: ${stderr.trim() || error.message}`);
  });
}
