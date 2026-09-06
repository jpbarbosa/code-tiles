'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Which side the OS draws the window's own controls on. Not a measurement main sends: it is the
// same answer for the life of the process, and the strip only needs it to know which end to
// leave free - macOS lays traffic lights over the left, the other two overlay a caption right.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.controls = process.platform === 'darwin' ? 'left' : 'right';
});

// Two functions, matching the two channels. The shell has no other way to reach main and no way
// at all to reach a project window.
contextBridge.exposeInMainWorld('ct', {
  call: (type, payload) => ipcRenderer.invoke('ct:call', { type, payload }),
  onEvent: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('ct:event', handler);
    return () => ipcRenderer.off('ct:event', handler);
  },
});
