// Gives the Zuno page a few safe desktop-only functions. Nothing else from Node is exposed.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('zunoDesktop', {
  // (0.43) A zuno:// link asked to open something (like a channel or a profile).
  onOpen: cb => ipcRenderer.on('zuno:open', (_e, to) => cb(to)),
  isDesktop: true,
  info: () => ipcRenderer.invoke('zuno:info'),
  hostHere: () => ipcRenderer.invoke('zuno:host'),
  connect: url => ipcRenderer.invoke('zuno:connect', url),
  openServerSettings: () => ipcRenderer.invoke('zuno:server-settings'),
  setBadge: count => ipcRenderer.send('zuno:badge', count),
  focus: () => ipcRenderer.send('zuno:focus'),
  version: () => ipcRenderer.invoke('zuno:version'),
  onUpdateReady: cb => ipcRenderer.on('zuno:update-ready', (_e, v) => cb(v)),
  restart: () => ipcRenderer.send('zuno:restart'),
  checkUpdates: () => ipcRenderer.invoke('zuno:check-updates').catch(() => false),
  screenSources: () => ipcRenderer.invoke('zuno:screen-sources'),
  pickSource: id => ipcRenderer.invoke('zuno:pick-source', id),
  setStreamSound: on => ipcRenderer.invoke('zuno:stream-sound', on),
  windowControl: action => ipcRenderer.invoke('zuno:window', action),
  // Let go of cached pictures and scripts while Zuno sits in the background.
  freeMemory: () => { try { webFrame.clearCache(); } catch {} },
  onWindowState: cb => ipcRenderer.on('zuno:window-state', (_e, st) => cb(st)),
  // What you're playing (or listening to in Spotify), for your activity status.
  onActivity: cb => ipcRenderer.on('zuno:activity', (_e, a) => cb(a)),
  // Open a Spotify link in the Spotify app. Resolves false when Spotify isn't installed.
  openSpotify: uri => ipcRenderer.invoke('zuno:open-spotify', uri),
  // The in-game overlay: who's in your call and who's talking, floating over games.
  overlay: state => ipcRenderer.send('zuno:overlay', state),
  onOverlayToggle: cb => ipcRenderer.on('zuno:overlay-toggle', () => cb()),
});
