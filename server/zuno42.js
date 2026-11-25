'use strict';
// Zuno 0.42: the language you picked (Settings › My Account › Language) follows your account.
const fs = require('fs');
const path = require('path');

module.exports = function (z) {
  const { hooks } = z;

  // ======================= heyzuno.uk/download =======================
  // The download page (website/) used to live on GitHub Pages, which stopped after the move to the
  // new GitHub account. Zuno serves it itself now, on its own address.
  const SITE = path.join(__dirname, '..', 'website');
  const PAGE_CSP = [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https:", "connect-src 'self' https://api.github.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const send = (res, status, headers, body) => { res.writeHead(status, headers); res.end(body); };
  hooks.rawRoutes.push({ path: '/download', fn: (req, res) => send(res, 301, { Location: '/download/' }) });
  hooks.rawRoutes.push({ path: '/download/', fn: (req, res) => fs.readFile(path.join(SITE, 'index.html'), (err, buf) => {
    if (err) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    res.setHeader('Content-Security-Policy', PAGE_CSP);
    send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }, buf);
  }) });
  hooks.rawRoutes.push({ path: '/download/terms.html', fn: (req, res) => send(res, 301, { Location: '/terms' }) });
  for (const f of fs.existsSync(path.join(SITE, 'img')) ? fs.readdirSync(path.join(SITE, 'img')) : []) {
    const type = TYPES[path.extname(f).toLowerCase()];
    if (!type) continue;
    hooks.rawRoutes.push({ path: `/download/img/${f}`, fn: (req, res) => fs.readFile(path.join(SITE, 'img', f), (err, buf) => (err
      ? send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found')
      : send(res, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' }, buf))) });
  }
  const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'ja'];
  z.PREF_DEFAULTS.language = 'en';
  hooks.patchPrefs.push((me, prefs, body) => {
    if ('language' in body && LANGS.includes(body.language)) prefs.language = body.language;
  });
};
