'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
