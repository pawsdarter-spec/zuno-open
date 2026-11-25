// The overlay window only receives the call's state to draw; it can't do anything else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zunoOverlay', { onState: cb => ipcRenderer.on('overlay:state', (_e, st) => cb(st)) });
