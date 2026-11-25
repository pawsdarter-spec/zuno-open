// Zuno launcher.
//
// The installed Zuno (from Zuno Setup.exe) remembers the project folder it was
// built from. Every time it opens, it runs the newest Zuno code from that folder,
// so updates show up without rebuilding or reinstalling.
// If that folder is gone, it runs the copy bundled inside the installer.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const parts = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
function compare(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

let appDir = path.join(__dirname, '..'); // the bundled copy

if (app.isPackaged) {
  const source = readJson(path.join(__dirname, 'source.json'));
  const srcDir = source && source.dir;
  const srcPkg = srcDir && readJson(path.join(srcDir, 'package.json'));
  const bundledPkg = readJson(path.join(appDir, 'package.json'));
  if (srcPkg && fs.existsSync(path.join(srcDir, 'electron', 'app.js')) && compare(srcPkg.version, bundledPkg && bundledPkg.version) >= 0) {
    appDir = srcDir;
  }
}

global.zunoAppDir = appDir;
require(path.join(appDir, 'electron', 'app.js'));
