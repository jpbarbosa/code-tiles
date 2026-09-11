'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Which side the OS draws the window's own controls on. Not a measurement main sends: it is the
// same answer for the life of the process, and the strip only needs it to know which end to
// leave free - macOS lays traffic lights over the left, the other two overlay a caption right.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.controls = process.platform === 'darwin' ? 'left' : 'right';
});

// The Corners preference as the page opens, from src/guest/corners.cjs by way of main's launch
// arguments: this preload is sandboxed and cannot require it. Without them corners.css draws circles.
const argumentOf = (name) => process.argv.find((value) => value.startsWith(name))?.slice(name.length);
const squircle = argumentOf('--ct-squircle=');
const tileRadius = argumentOf('--ct-tile-radius=');
window.addEventListener('DOMContentLoaded', () => {
  if (squircle) document.documentElement.style.setProperty('--squircle', squircle);
  if (tileRadius) document.documentElement.style.setProperty('--tile-radius', `${tileRadius}px`);
});

// The OS's clock, which a page's own locale cannot say (src/main/clock.js). Panels only: the strip
// shows no time and is handed none.
const HOUR_CYCLE = '--ct-hour-cycle=';
const hourCycle = process.argv.find((value) => value.startsWith(HOUR_CYCLE))?.slice(HOUR_CYCLE.length);

// Two functions, matching the two channels, and the clock. The shell has no other way to reach
// main and no way at all to reach a project window.
contextBridge.exposeInMainWorld('ct', {
  call: (type, payload) => ipcRenderer.invoke('ct:call', { type, payload }),
  onEvent: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('ct:event', handler);
    return () => ipcRenderer.off('ct:event', handler);
  },
  hourCycle,
});
