// Zuno desktop app (Electron). Started by main.js, which picks the newest copy of this file.
// By default it runs the Zuno server inside the app ("host on this computer"),
// so friends on the same Wi-Fi can connect to you. It can also connect to a
// friend's Zuno, or to an online Zuno server later on.
const { app, BrowserWindow, Menu, shell, ipcMain, session, desktopCapturer, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Started through plain electron.exe (an old shortcut or pin pointing at the project folder)?
// Hand over to the installed Zuno so Windows shows Zuno's name and icon, not Electron's.
if (!app.isPackaged && process.platform === 'win32' && !process.env.ZUNO_DEV) {
  const installed = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'zuno', 'Zuno.exe');
  if (fs.existsSync(installed)) {
    try { require('child_process').spawn(installed, [], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    app.exit(0);
  }
}

const PORT = 3000;
app.setName('Zuno'); // shows "Zuno" instead of "Electron", even when run from the project folder
const ICON = path.join(__dirname, '..', 'public', 'logo.png');

let win = null;
let serverModule = null;
let hostedUrl = null;

// ---------- updates ----------
// The version that's running right now, and a watcher that notices when newer files arrive.
const APP_DIR = path.join(__dirname, '..');
const pkgVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version; } catch { return null; } };
const RUNNING_VERSION = pkgVersion() || app.getVersion();
let readyVersion = null;
// Two ways Zuno updates:
//  - Your own copy (installed from your project folder) watches that folder for new files.
//  - Copies downloaded from the website get new versions from GitHub Releases.
const FROM_FOLDER = !app.isPackaged || fs.existsSync(path.join(__dirname, 'source.json'));
let updater = null, updateDownloaded = false;
function watchForUpdates() {
  if (!FROM_FOLDER) return checkReleases();
  setInterval(() => {
    const v = pkgVersion();
    if (v && v !== RUNNING_VERSION && v !== readyVersion) {
      readyVersion = v;
      win?.webContents.send('zuno:update-ready', v);
    }
  }, 15000);
}
function checkReleases() {
  try { updater = require('electron-updater').autoUpdater; } catch { return; } // not bundled: no auto-updates
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', info => {
    updateDownloaded = true;
    readyVersion = info.version;
    win?.webContents.send('zuno:update-ready', info.version);
  });
  updater.on('error', err => console.warn('Update check failed:', err?.message));
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 3000);
  setInterval(check, 10 * 60 * 1000);
  ipcMain.handle('zuno:check-updates', guard('page', () => { check(); return true; }, false));
}

// ---------- settings saved in the user's app-data folder ----------
// The online Zuno server, set in package.json ("zunoServer") once Zuno is online.
// When it's set, Zuno connects there by default instead of hosting on this computer.
const ONLINE_SERVER = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).zunoServer || ''; } catch { return ''; } })();
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  const defaults = ONLINE_SERVER ? { mode: 'remote', serverUrl: ONLINE_SERVER } : { mode: 'host', serverUrl: '' };
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch {}
  // Older versions saved "host on this computer" without anyone choosing it. Only a setting
  // picked in Server Settings counts, so everyone else lands on the online Zuno.
  if (!saved.modeChosen) { delete saved.mode; delete saved.serverUrl; }
  return { ...defaults, ...saved };
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

// ---------- run the server inside the app ----------
async function startLocalServer() {
  if (hostedUrl) return hostedUrl;
  // Accounts and uploads are stored in the user's app-data folder.
  process.env.ZUNO_DATA_DIR = path.join(app.getPath('userData'), 'data');
  serverModule = require('../server/index.js');
  try {
    await serverModule.start(PORT, { quiet: true });
  } catch (err) {
    // Port taken: most likely Zuno is already running on this computer (e.g. from the start file). Use that one.
    if (err.code !== 'EADDRINUSE') throw err;
  }
  hostedUrl = `http://localhost:${PORT}`;
  return hostedUrl;
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    // A bare Wi-Fi address like 192.168.1.20 means the default Zuno port.
    if (!u.port && u.protocol === 'http:' && /^[\d.]+$|^localhost$/.test(u.hostname)) u.port = String(PORT);
    return u.origin;
  } catch { return null; }
}

// Check that a Zuno server answers at this address.
async function isZunoServer(origin) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${origin}/api/me`, { signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => null);
    return res.status === 401 && body && typeof body.error === 'string';
  } catch { return false; }
}

// ---------- window ----------
function showConnect(error = '') {
  win.loadFile(path.join(__dirname, 'connect.html'), { query: { error } });
}

async function loadApp() {
  const cfg = readConfig();
  if (cfg.mode === 'remote' && cfg.serverUrl) return win.loadURL(cfg.serverUrl);
  try { win.loadURL(await startLocalServer()); }
  catch (err) { showConnect(`Zuno couldn't start its server: ${err.message}`); }
}

// Tell Windows what a taskbar pin of this window should open and which icon it shows.
// Without this, a copy started through electron.exe gets pinned as "Electron" and the pin opens Electron.
function pinAsZuno(w) {
  if (process.platform !== 'win32' || !w.setAppDetails) return;
  // The installed Zuno.exe has the Zuno icon built in; a project-folder copy uses build/icon.ico.
  const icoPath = app.isPackaged ? process.execPath : [path.join(APP_DIR, 'build', 'icon.ico')].find(p => fs.existsSync(p));
  const installed = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'zuno', 'Zuno.exe');
  let relaunchCommand;
  if (app.isPackaged) relaunchCommand = `"${process.execPath}"`;
  else if (fs.existsSync(installed)) relaunchCommand = `"${installed}"`; // prefer the real installed Zuno
  else relaunchCommand = `"${process.execPath}" "${APP_DIR}"`;   // running from the project folder
  try {
    w.setAppDetails({ appId: app.isPackaged ? 'app.zuno.desktop' : 'app.zuno.dev', relaunchCommand, relaunchDisplayName: 'Zuno', ...(icoPath ? { appIconPath: icoPath, appIconIndex: 0 } : {}) });
  } catch (err) { console.warn('Could not set taskbar details:', err.message); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    title: 'Zuno',
    icon: ICON,
    backgroundColor: '#313338',
    autoHideMenuBar: true,
    frame: false, // Zuno draws its own title bar with its own buttons
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // profile sounds can start on their own
      spellcheck: false,          // saves memory: no spellcheck dictionaries loaded
      backgroundThrottling: true, // slow down timers while Zuno is in the background
      devTools: !app.isPackaged || !!process.env.ZUNO_DEVTOOLS, // (0.47) no developer tools in the installed app
    },
  });
  // (0.47) Shortcuts that would open developer tools do nothing in the installed app.
  if (app.isPackaged && !process.env.ZUNO_DEVTOOLS) {
    win.webContents.on('before-input-event', (e, i) => {
      const k = String(i.key || '').toUpperCase();
      if (k === 'F12' || ((i.control || i.meta) && i.shift && ['I', 'J', 'C'].includes(k)) || (i.meta && i.alt && ['I', 'J', 'C'].includes(k))) e.preventDefault();
    });
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
  }
  pinAsZuno(win);
  win.once('ready-to-show', () => win.show());
  const sendState = () => win.webContents.send('zuno:window-state', { maximized: win.isMaximized() });
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, sendState);

  // (0.57) Pages can't embed their own browser views.
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  // Links in messages open in the normal web browser, not inside Zuno.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const current = win.webContents.getURL();
    const sameSite = (url.startsWith('file:') && current.startsWith('file:')) || (current && !current.startsWith('file:') && new URL(url).origin === new URL(current).origin);
    if (!sameSite) { e.preventDefault(); if (/^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && !url.startsWith('file:') && code !== -3) showConnect(`Couldn't reach ${url} (${desc}).`);
  });

  loadApp();
}

function buildMenu() {
  const template = [
    {
      label: 'Zuno',
      submenu: [
        { label: 'Server Settings…', accelerator: 'CmdOrCtrl+Shift+S', click: () => showConnect() },
        { type: 'separator' },
        { role: 'reload' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- who may use the desktop functions ----------
// (0.57) The window can show three kinds of page: Zuno's own app pages (files inside the app),
// the official Zuno (heyzuno.uk, or the server this computer hosts), or a server someone picked
// in Server Settings. Every message from a page is checked: it must come from the main window's
// top frame (never an embedded frame or another window), and its address decides what it may do.
const { dialog } = require('electron');
const { pathToFileURL } = require('url');
const originOf = u => { try { const o = new URL(u).origin; return o && o !== 'null' ? o : ''; } catch { return ''; } };
const OWN_FILES = pathToFileURL(__dirname + path.sep).href;
const OFFICIAL = new Set([originOf(ONLINE_SERVER), 'https://heyzuno.uk', 'https://www.heyzuno.uk', 'https://zuno-tau7.onrender.com'].filter(Boolean));
function chosenOrigin() { const cfg = readConfig(); return cfg.mode === 'remote' && cfg.serverUrl ? originOf(cfg.serverUrl) : ''; }
function trustOfUrl(url) {
  url = String(url || '');
  if (url.startsWith('file:')) return url.startsWith(OWN_FILES) ? 'local' : null;
  const o = originOf(url);
  if (!o) return null;
  if (OFFICIAL.has(o) || (hostedUrl && o === originOf(hostedUrl))) return 'official';
  if (o === chosenOrigin()) return 'chosen';
  return null;
}
function trustOf(e) {
  if (!win || win.isDestroyed() || e.sender !== win.webContents) return null;
  const f = e.senderFrame;
  if (!f || f.parent) return null; // only the top frame, never something embedded in the page
  return trustOfUrl(f.url);
}
// Wraps a handler: pages that aren't allowed get `denied` back and nothing happens.
// need: 'page' (any of the three) or 'local' (only Zuno's own app pages).
function guard(need, fn, denied = undefined) {
  return (e, ...args) => {
    const t = trustOf(e);
    if (!t || (need === 'local' && t !== 'local')) return denied;
    return fn(e, t, ...args);
  };
}
// A server picked in Server Settings is run by someone else, so it has to ask before it can see
// what's on screen. The answer lasts until the app closes.
const screenOk = new Set();
async function askScreen(origin, what) {
  if (screenOk.has(origin)) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Allow', "Don't allow"], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Screen sharing', message: `Let ${origin} ${what}?`,
    detail: "This server isn't the official Zuno. Only allow it if you trust whoever runs it.",
  });
  if (response !== 0) return false;
  screenOk.add(origin);
  return true;
}

// ---------- microphone, camera and screen sharing for calls ----------
// (0.57) Screen sharing only ever hands over the screen or window you picked in Zuno's picker,
// within two minutes of picking it. Nothing is chosen for you.
let picked = null, streamSound = true, listed = new Map();
function setupMediaPermissions() {
  const allowed = ['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection'];
  const okFor = (wc, url) => !!win && !win.isDestroyed() && wc === win.webContents && trustOfUrl(url) !== null;
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(allowed.includes(permission) && okFor(wc, details?.requestingUrl || wc?.getURL?.())));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allowed.includes(permission) && okFor(wc, origin || wc?.getURL?.()));
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const frame = req.frame;
      const trust = frame && !frame.parent ? trustOfUrl(frame.url) : null;
      if (!trust || !picked || Date.now() - picked.at > 2 * 60e3) return cb({});
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const src = sources.find(s => s.id === picked.id);
      if (!src) return cb({});
      if (trust === 'chosen' && !(await askScreen(originOf(frame.url), `share "${src.name}"`))) return cb({});
      // A second try without sound may follow right away, so the pick stays good for a few seconds.
      picked.at = Math.min(picked.at, Date.now() - 2 * 60e3 + 15e3);
      // Sound comes along on Windows (the whole computer's sound; the page asks Chromium to leave
      // Zuno's own sounds out). Before this, streams from the app never had any sound.
      cb({ video: src, ...(streamSound && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
    } catch { cb({}); }
  });
}
ipcMain.handle('zuno:screen-sources', guard('page', async (e, trust) => {
  if (trust === 'chosen' && !(await askScreen(originOf(e.senderFrame.url), 'see your screens and windows so you can pick one to share'))) return [];
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
  const out = sources.filter(s => s.name !== 'Zuno');
  listed = new Map(out.map(s => [s.id, Date.now()]));
  return out.map(s => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }));
}, []));
ipcMain.handle('zuno:open-spotify', guard('page', async (_e, _t, uri) => {
  if (!/^spotify:(track|album|playlist|artist|episode|show):[A-Za-z0-9]{10,40}$/.test(String(uri))) return false;
  try { await shell.openExternal(uri); return true; } catch { return false; }
}, false));
// Only an id from the list just shown in the picker counts.
ipcMain.handle('zuno:pick-source', guard('page', (_e, _t, id) => {
  if (typeof id !== 'string' || !listed.has(id) || Date.now() - listed.get(id) > 5 * 60e3) return false;
  picked = { id, at: Date.now() };
  return true;
}, false));
ipcMain.handle('zuno:stream-sound', guard('page', (_e, _t, on) => { streamSound = on !== false; return true; }, false));

// ---------- messages from the page ----------
ipcMain.handle('zuno:info', guard('local', () => {
  const cfg = readConfig();
  return { mode: cfg.mode, serverUrl: cfg.serverUrl, port: PORT, lanAddresses: lanAddresses(), version: RUNNING_VERSION };
}, null));
// Tells the page which version is running, whether it was just updated, and if a newer one is waiting.
// Where Zuno is installed on this computer is only told to Zuno's own pages.
ipcMain.handle('zuno:version', guard('page', (_e, trust) => {
  const cfg = readConfig();
  // Someone who already used Zuno before versions were tracked counts as updated too.
  const usedBefore = fs.existsSync(path.join(app.getPath('userData'), 'data', 'db.json'));
  const previous = cfg.lastVersion || (usedBefore ? 'an earlier version' : null);
  if (previous !== RUNNING_VERSION) {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch {}
    writeConfig({ ...saved, lastVersion: RUNNING_VERSION }); // only remember the version, nothing else
  }
  const paths = trust === 'chosen' ? {} : { execPath: process.execPath, appDir: APP_DIR };
  return { version: RUNNING_VERSION, updatedFrom: previous && previous !== RUNNING_VERSION ? previous : null, readyVersion, packaged: app.isPackaged, ...paths };
}, null));
// The custom title bar's buttons.
// Mini mode (0.28): a small window that stays on top of everything, showing just your call.
let beforeMini = null;
ipcMain.handle('zuno:window', guard('page', (_e, _t, action) => {
  if (!win) return null;
  if (action === 'mini-on' && !beforeMini) {
    beforeMini = { bounds: win.getBounds(), maximized: win.isMaximized(), min: win.getMinimumSize() };
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(260, 200);
    const area = require('electron').screen.getDisplayMatching(win.getBounds()).workArea;
    win.setBounds({ width: 320, height: 380, x: area.x + area.width - 340, y: area.y + area.height - 400 });
    win.setAlwaysOnTop(true, 'floating');
    return { mini: true };
  }
  if (action === 'mini-off' && beforeMini) {
    win.setAlwaysOnTop(false);
    win.setMinimumSize(...beforeMini.min);
    win.setBounds(beforeMini.bounds);
    if (beforeMini.maximized) win.maximize();
    beforeMini = null;
    return { mini: false };
  }
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
  return { maximized: win.isMaximized() };
}, null));
ipcMain.on('zuno:restart', guard('page', () => {
  try { serverModule?.flush(); } catch {}
  if (updater && updateDownloaded) return updater.quitAndInstall(false, true); // install the downloaded version, then reopen
  app.relaunch();
  app.exit(0);
}));
// Only the app's own pages can switch it to hosting or to another server, never a web page loaded in it.
ipcMain.handle('zuno:host', guard('local', async () => {
  writeConfig({ ...readConfig(), mode: 'host', modeChosen: true });
  await loadApp();
  return { ok: true };
}, { ok: false }));
ipcMain.handle('zuno:connect', guard('local', async (_e, _t, input) => {
  const origin = normalizeUrl(input);
  if (!origin) return { ok: false, error: "That doesn't look like a server address." };
  if (!(await isZunoServer(origin))) return { ok: false, error: `No Zuno server answered at ${origin}. Check the address and that their Zuno is open.` };
  writeConfig({ ...readConfig(), mode: 'remote', serverUrl: origin, modeChosen: origin !== ONLINE_SERVER });
  win.loadURL(origin);
  return { ok: true };
}, { ok: false, error: 'Open Server Settings from the Zuno menu to change servers.' }));
ipcMain.handle('zuno:server-settings', guard('page', () => { showConnect(); }));
ipcMain.on('zuno:badge', guard('page', (_e, _t, count) => {
  try { app.setBadgeCount(Math.max(0, Math.min(9999, Number(count) || 0))); } catch {}
  if (count > 0 && win && !win.isFocused()) win.flashFrame(true);
}));
ipcMain.on('zuno:focus', guard('page', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}));

// ---------- activity status: which game is open, and what Spotify is playing ----------
// Zuno only checks the names of running programs against this list of games, plus Spotify's
// window title for the song. Nothing else is looked at, and nothing is sent unless sharing is on.
const GAMES = {
  'fortniteclient-win64-shipping.exe': 'Fortnite', 'robloxplayerbeta.exe': 'Roblox', 'minecraft.windows.exe': 'Minecraft', 'minecraftlauncher.exe': 'Minecraft Launcher',
  'valorant-win64-shipping.exe': 'VALORANT', 'league of legends.exe': 'League of Legends', 'cs2.exe': 'Counter-Strike 2', 'gta5.exe': 'Grand Theft Auto V', 'gta5_enhanced.exe': 'Grand Theft Auto V',
  'rocketleague.exe': 'Rocket League', 'r5apex.exe': 'Apex Legends', 'r5apex_dx12.exe': 'Apex Legends', 'overwatch.exe': 'Overwatch 2', 'dota2.exe': 'Dota 2', 'destiny2.exe': 'Destiny 2',
  'eldenring.exe': 'ELDEN RING', 'among us.exe': 'Among Us', 'fallguys_client_game.exe': 'Fall Guys', 'tslgame.exe': 'PUBG: BATTLEGROUNDS', 'rainbowsix.exe': "Tom Clancy's Rainbow Six Siege",
  'cod.exe': 'Call of Duty', 'terraria.exe': 'Terraria', 'stardew valley.exe': 'Stardew Valley', 'stardewvalley.exe': 'Stardew Valley', 'genshinimpact.exe': 'Genshin Impact', 'starrail.exe': 'Honkai: Star Rail',
  'zenlesszonezero.exe': 'Zenless Zone Zero', 'palworld-win64-shipping.exe': 'Palworld', 'lethal company.exe': 'Lethal Company', 'hollow_knight.exe': 'Hollow Knight', 'celeste.exe': 'Celeste',
  'phasmophobia.exe': 'Phasmophobia', 'deadbydaylight-win64-shipping.exe': 'Dead by Daylight', 'fc25.exe': 'EA SPORTS FC 25', 'fc26.exe': 'EA SPORTS FC 26', 'rustclient.exe': 'Rust',
  'cyberpunk2077.exe': 'Cyberpunk 2077', 'witcher3.exe': 'The Witcher 3', 'bg3.exe': "Baldur's Gate 3", 'bg3_dx11.exe': "Baldur's Gate 3", 'hades.exe': 'Hades', 'hades2.exe': 'Hades II',
  'valheim.exe': 'Valheim', 'sotgame.exe': 'Sea of Thieves', 'marvel-win64-shipping.exe': 'Marvel Rivals', 'helldivers2.exe': 'HELLDIVERS 2', 'osu!.exe': 'osu!', 'hearthstone.exe': 'Hearthstone',
  'wow.exe': 'World of Warcraft', 'diablo iv.exe': 'Diablo IV', 'brawlhalla.exe': 'Brawlhalla', 'warframe.x64.exe': 'Warframe', 'pathofexile_x64.exe': 'Path of Exile', 'pathofexile.exe': 'Path of Exile 2',
  'ts4_x64.exe': 'The Sims 4', 'fallout4.exe': 'Fallout 4', 'skyrimse.exe': 'Skyrim', 'factorio.exe': 'Factorio', 'rimworldwin64.exe': 'RimWorld', 'subnautica.exe': 'Subnautica',
  'projectzomboid64.exe': 'Project Zomboid', 'geometrydash.exe': 'Geometry Dash', 'beamng.drive.x64.exe': 'BeamNG.drive', 'factorygamesteam-win64-shipping.exe': 'Satisfactory', 'balatro.exe': 'Balatro',
  'repo.exe': 'R.E.P.O.', 'schedule i.exe': 'Schedule I', 'peak.exe': 'PEAK', 'deltarune.exe': 'DELTARUNE', 'undertale.exe': 'Undertale', 'cuphead.exe': 'Cuphead', 'portal2.exe': 'Portal 2',
  'tf2.exe': 'Team Fortress 2', 'left4dead2.exe': 'Left 4 Dead 2', 'gmod.exe': "Garry's Mod", 'hl2.exe': "Garry's Mod", 'deadlock.exe': 'Deadlock', 'thefinals.exe': 'THE FINALS',
};
const MAC_GAMES = { minecraft: 'Minecraft', robloxplayer: 'Roblox', 'league of legends': 'League of Legends', 'osu!': 'osu!', terraria: 'Terraria', 'stardew valley': 'Stardew Valley', factorio: 'Factorio', 'among us': 'Among Us', balatro: 'Balatro' };
const run = (cmd, args) => new Promise(resolve => require('child_process').execFile(cmd, args, { windowsHide: true, timeout: 15000, maxBuffer: 8e6 }, (err, out) => resolve(err && !out ? '' : String(out || ''))));
// (0.43.1) What's playing, from Windows' own media controls (the same info the volume flyout
// shows): the song, where you are in it, and its album art. It works even when Spotify is
// minimized to the tray. One PowerShell stays open while Spotify runs and reports every 2 seconds
// (starting PowerShell over and over is what made checks slow and heavy).
const SMTC_PS = `$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $null = $task.Wait(4000); $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { 'NOSMTC'; exit }
$lastKey = ''; $lastArt = ''; $sentArt = ''
while ($true) {
  $o = $null
  foreach ($s in $mgr.GetSessions()) {
    if ($s.SourceAppUserModelId -notmatch 'spotify') { continue }
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if (-not $p) { continue }
    $i = $s.GetPlaybackInfo(); $t = $s.GetTimelineProperties()
    $key = "$($p.Title)|$($p.Artist)"
    if ($key -ne $lastKey) {
      $lastKey = $key; $lastArt = ''
      if ($p.Thumbnail) {
        try {
          $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
          $img = [System.Drawing.Image]::FromStream($net)
          $bmp = New-Object System.Drawing.Bitmap 160, 160
          $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($img, 0, 0, 160, 160); $g.Dispose()
          $ms = New-Object System.IO.MemoryStream
          $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
          $lastArt = 'data:image/jpeg;base64,' + [Convert]::ToBase64String($ms.ToArray())
          $bmp.Dispose(); $img.Dispose(); $net.Dispose()
        } catch {}
      }
    }
    # (0.44) The picture is only sent once per song; the app keeps it.
    $art = $null; if ($sentArt -ne $key) { $art = $lastArt; if ($lastArt) { $sentArt = $key } }
    $o = [pscustomobject]@{ title = $p.Title; artist = $p.Artist; status = [string]$i.PlaybackStatus; pos = [int64]$t.Position.TotalMilliseconds; dur = [int64]$t.EndTime.TotalMilliseconds; at = $t.LastUpdatedTime.ToUnixTimeMilliseconds(); art = $art }
    break
  }
  if ($o) { ConvertTo-Json -Compress -InputObject $o } else { '{}' }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}`;
let smtcProc = null, smtcLast = null, smtcAt = 0, smtcFails = 0, smtcBroken = false;
function startSmtc() {
  if (process.platform !== 'win32' || smtcProc || smtcBroken) return;
  const enc = Buffer.from(SMTC_PS, 'utf16le').toString('base64');
  try { smtcProc = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true }); } catch { smtcBroken = true; return; }
  let buf = '';
  smtcProc.stdout.setEncoding('utf8');
  smtcProc.stdout.on('data', d => {
    buf += d;
    let n;
    while ((n = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
      if (line === 'NOSMTC') { smtcBroken = true; continue; }
      try {
        const o = JSON.parse(line);
        if (!o.art && smtcLast && smtcLast.title === o.title && smtcLast.artist === o.artist) o.art = smtcLast.art;
        smtcLast = o; smtcAt = Date.now(); smtcFails = 0;
      } catch {}
    }
    if (buf.length > 1e6) buf = '';
  });
  smtcProc.on('exit', () => { smtcProc = null; if (++smtcFails > 5) smtcBroken = true; });
  smtcProc.on('error', () => { smtcProc = null; smtcBroken = true; });
}
// (0.44) Which programs are running, from one PowerShell that stays open and checks every second.
// It only says something when the list changes (and every 15 seconds so the app knows it's alive),
// so games show up about a second after they start without starting a new program each time.
const PROC_PS = `$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$last = ''; $n = 0
while ($true) {
  $p = ((Get-Process).ProcessName | Sort-Object -Unique) -join '|'
  $n++
  if ($p -ne $last -or $n -ge 15) { $last = $p; $n = 0; $p; [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 1000
}`;
let procProc = null, procList = null, procAt = 0, procFails = 0;
function startProcWatch() {
  if (process.platform !== 'win32' || procProc || procFails > 5) return;
  const enc = Buffer.from(PROC_PS, 'utf16le').toString('base64');
  try { procProc = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true }); } catch { procFails = 99; return; }
  let buf = '';
  procProc.stdout.setEncoding('utf8');
  procProc.stdout.on('data', d => {
    buf += d;
    let n;
    while ((n = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
      if (line) { procList = line.split('|').map(x => x.toLowerCase() + '.exe'); procAt = Date.now(); }
    }
    if (buf.length > 1e6) buf = '';
  });
  procProc.on('exit', () => { procProc = null; procFails++; });
  procProc.on('error', () => { procProc = null; procFails = 99; });
}
app.on('before-quit', () => { try { procProc?.kill(); } catch {} procProc = null; });
function stopSmtc() { try { smtcProc?.kill(); } catch {} smtcProc = null; smtcLast = null; }
app.on('before-quit', stopSmtc);
// A game's own icon, from its program file (works for every game, on Steam or not).
const gameIcons = new Map();
async function gameIcon(exe) {
  if (gameIcons.has(exe)) return gameIcons.get(exe);
  gameIcons.set(exe, null);
  try {
    const name = exe.replace(/\.exe$/i, '').replace(/'/g, "''");
    const file = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1).Path`])).trim();
    if (file && fs.existsSync(file)) {
      const img = await app.getFileIcon(file, { size: 'large' });
      if (!img.isEmpty()) gameIcons.set(exe, img.toDataURL());
    }
  } catch {}
  return gameIcons.get(exe);
}
let lastTitleCheck = 0, lastTitleSong = null;
async function detectActivity() {
  let game = null, gameExe = null, song = null;
  if (process.platform === 'win32') {
    const rows = csv => csv.split(/\r?\n/).map(row => row.match(/"([^"]*)"/g)?.map(c => c.slice(1, -1))).filter(Boolean);
    startProcWatch();
    const procs = procList && Date.now() - procAt < 20000 ? procList : rows(await run('tasklist', ['/fo', 'csv', '/nh'])).map(c => c[0].toLowerCase());
    gameExe = procs.find(p => GAMES[p]) || null;
    game = gameExe ? GAMES[gameExe] : null;
    const titlesOf = async exe => rows(await run('tasklist', ['/v', '/fo', 'csv', '/nh', '/fi', `imagename eq ${exe}`])).map(c => c[c.length - 1] || '');
    if (!game && procs.some(p => p === 'javaw.exe' || p === 'java.exe')) {
      // Window titles take a whole tasklist, so they're only looked at every 10 seconds.
      if (Date.now() - (detectActivity.javaAt || 0) > 10000) {
        detectActivity.javaAt = Date.now();
        const titles = [...await titlesOf('javaw.exe'), ...await titlesOf('java.exe')];
        detectActivity.minecraft = titles.some(t => /minecraft/i.test(t));
      }
      if (detectActivity.minecraft) { game = 'Minecraft'; gameExe = procs.includes('javaw.exe') ? 'javaw.exe' : 'java.exe'; }
    }
    if (procs.includes('spotify.exe')) {
      startSmtc();
      const m = Date.now() - smtcAt < 8000 ? smtcLast : null;
      if (m?.title && /playing/i.test(m.status || '')) {
        const pos = Math.max(0, (m.pos || 0) + (m.at && m.at > 0 ? Date.now() - m.at : 0));
        song = { name: String(m.title).slice(0, 120), artist: String(m.artist || '').slice(0, 120), pos: m.dur ? Math.min(pos, m.dur) : null, dur: m.dur || null, art: m.art || null };
      } else if (!m || smtcBroken) {
        // Backup: Spotify's window is titled "Artist - Song" while music plays (checked every 10 seconds).
        if (Date.now() - lastTitleCheck > 10000) {
          lastTitleCheck = Date.now();
          const title = (await titlesOf('spotify.exe')).find(t => / - /.test(t) && !/^spotify/i.test(t) && t !== 'N/A');
          lastTitleSong = title ? (([artist, ...name]) => ({ artist: artist.trim(), name: name.join(' - ').trim() }))(title.split(' - ')) : null;
        }
        song = lastTitleSong;
      }
    } else stopSmtc();
  } else if (process.platform === 'darwin') {
    const procs = (await run('ps', ['-Ao', 'comm'])).split('\n').map(p => p.split('/').pop().trim().toLowerCase());
    game = procs.map(p => MAC_GAMES[p]).find(Boolean) || null;
    if (procs.includes('spotify')) {
      const out = (await run('osascript', ['-e', 'tell application "Spotify" to if player state is playing then (artist of current track) & "\t" & (name of current track)'])).trim();
      if (out.includes('\t')) { const [artist, name] = out.split('\t'); song = { artist, name }; }
    }
  } else {
    const procs = (await run('ps', ['-eo', 'comm'])).split('\n').map(p => p.trim().toLowerCase());
    game = procs.map(p => MAC_GAMES[p] || GAMES[p + '.exe']).find(Boolean) || null;
  }
  const list = [];
  if (game) list.push({ type: 'playing', name: game, art: gameExe ? await gameIcon(gameExe) : null });
  if (song) list.push({ type: 'listening', name: 'Spotify', details: song.name.slice(0, 120), state: song.artist.slice(0, 120), art: song.art || null, pos: song.pos, dur: song.dur });
  return list;
}
function watchActivity() {
  // Checked every second (0.44); the page only hears about it when something changed (or once a
  // minute, so it doesn't run out).
  const since = {}; let lastSent = '', lastSentAt = 0, songStart = null;
  const check = async () => {
    let list = [];
    try { list = await detectActivity(); } catch {}
    const now = Date.now();
    for (const a of list) {
      const key = `${a.type}|${a.name}|${a.details || ''}`;
      if (a.type === 'listening' && a.dur) {
        // The song's start stays put unless you skip around in it (then it follows).
        const est = now - (a.pos || 0);
        if (!songStart || songStart.key !== key || Math.abs(songStart.at - est) > 3000) songStart = { key, at: est };
        a.start = songStart.at; a.end = songStart.at + a.dur;
      } else a.start = (since[key] ||= now);
      delete a.pos; delete a.dur;
    }
    for (const k of Object.keys(since)) if (!list.some(a => `${a.type}|${a.name}|${a.details || ''}` === k)) delete since[k];
    const sig = JSON.stringify(list.map(a => ({ ...a, art: a.art ? a.art.length : 0 })));
    if (sig !== lastSent || now - lastSentAt > 60000) {
      lastSent = sig; lastSentAt = now;
      win?.webContents.send('zuno:activity', list.length ? { list } : null);
    }
    setTimeout(check, 1000);
  };
  setTimeout(check, 3000);
}

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // (0.43) "Open in app" on heyzuno.uk: zuno:// links start Zuno, or bring it to the front.
  try {
    if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('zuno', process.execPath, [path.resolve(process.argv[1])]);
    else app.setAsDefaultProtocolClient('zuno');
  } catch {}
  const openLink = url => {
    const m = /^zuno:\/\/[^?#]*(?:\?(.*))?$/i.exec(String(url || ''));
    if (!m || !win) return;
    const to = new URLSearchParams(m[1] || '').get('to') || '';
    if (/^[\w:-]{1,120}$/.test(to)) win.webContents.send('zuno:open', to);
  };
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    openLink(argv.find(a => /^zuno:\/\//i.test(a)));
  });
  app.on('open-url', (e, url) => { e.preventDefault(); if (win) { win.show(); win.focus(); openLink(url); } });
  // The installed app and a developer copy get different Windows identities, so a taskbar pin
  // always opens the real Zuno (a developer copy runs as electron.exe and would show its logo).
  app.setAppUserModelId(app.isPackaged ? 'app.zuno.desktop' : 'app.zuno.dev');
  app.whenReady().then(() => {
    buildMenu();
    setupMediaPermissions();
    createWindow();
    watchForUpdates();
    watchActivity();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('browser-window-focus', () => win?.flashFrame(false));
  app.on('before-quit', () => { try { serverModule?.flush(); } catch {} });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

// ---------- in-game overlay ----------
// A small see-through window in a corner of the screen that floats over games (windowed and
// borderless fullscreen; exclusive fullscreen games draw over everything). It shows who's in your
// call and lights up whoever is talking. Clicks go straight through it to the game.
// Shift+` hides or shows it. Turned on in Settings › Voice & Video.
let overlay = null, overlayHidden = false, overlayCorner = 'top-left';
function placeOverlay() {
  if (!overlay) return;
  const area = screen.getPrimaryDisplay().workArea, w = 260, h = 420, m = 16;
  overlay.setBounds({ x: overlayCorner.endsWith('right') ? area.x + area.width - w - m : area.x + m, y: overlayCorner.startsWith('bottom') ? area.y + area.height - h - m : area.y + m, width: w, height: h });
}
function ensureOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  overlay = new BrowserWindow({
    width: 260, height: 420, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'overlay-preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.on('closed', () => { overlay = null; });
  placeOverlay();
  return overlay;
}
ipcMain.on('zuno:overlay', guard('page', (_e, _t, st) => {
  // st: { on, corner, people: [{ name, avatar, speaking, muted }] } — or null when you leave the call.
  if (!st || !st.on || !st.people?.length) { if (overlay && !overlay.isDestroyed()) overlay.hide(); return; }
  if (st.corner && st.corner !== overlayCorner) { overlayCorner = st.corner; placeOverlay(); }
  const o = ensureOverlay();
  const sendIt = () => o.webContents.send('overlay:state', st);
  if (o.webContents.isLoading()) o.webContents.once('did-finish-load', sendIt); else sendIt();
  if (!overlayHidden && !o.isVisible()) o.showInactive();
}));
app.whenReady().then(() => {
  try {
    globalShortcut.register('Shift+`', () => {
      overlayHidden = !overlayHidden;
      if (overlay && !overlay.isDestroyed()) overlayHidden ? overlay.hide() : overlay.showInactive();
      win?.webContents.send('zuno:overlay-toggle');
    });
  } catch {}
});
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
