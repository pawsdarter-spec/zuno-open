'use strict';
// Zuno 0.43: the installer and app updates from heyzuno.uk (the GitHub repository is private, so
// GitHub answered "404" to everyone else), game covers and "Games in Rotation", and profile view
// stats.
const https = require('https');

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean } = z;
  const human = u => u && !u.system && !u.bot && !u.deleted;

  // ======================= downloads =======================
  // heyzuno.uk/download/windows (and the files the app's updater asks for) send people on to the
  // newest GitHub release. GitHub only shows a private repository's files to people with a key, so
  // Zuno asks with ZUNO_GITHUB_TOKEN (a read-only token) and passes on GitHub's short-lived link.
  const REPO = process.env.ZUNO_RELEASE_REPO || 'pawsdarter-spec/zuno';
  const ghToken = () => process.env.ZUNO_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  function gh(pathOrUrl, { accept = 'application/vnd.github+json', raw = false } = {}) {
    return new Promise((resolve, reject) => {
      const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
      const req = https.request(url, { timeout: 15000, headers: { 'User-Agent': 'Zuno', Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(ghToken() ? { Authorization: `Bearer ${ghToken()}` } : {}) } }, res => {
        if (raw && res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return resolve({ status: res.statusCode, location: res.headers.location }); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => { const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {} resolve({ status: res.statusCode, json, buf }); });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });
  }
  let latest = null, latestAt = 0;
  async function latestRelease() {
    if (latest && Date.now() - latestAt < 5 * 60e3) return latest;
    const r = await gh(`/repos/${REPO}/releases/latest`);
    if (r.status !== 200) throw new Error(`GitHub answered ${r.status}`);
    latest = r.json; latestAt = Date.now();
    return latest;
  }
  const FILES = { windows: 'Zuno-Setup.exe', 'Zuno-Setup.exe': 'Zuno-Setup.exe', 'Zuno-Setup.exe.blockmap': 'Zuno-Setup.exe.blockmap', 'latest.yml': 'latest.yml' };
  const sorry = (res, text) => { res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zuno</title><body style="font-family:system-ui;background:#0c1312;color:#dce8e5;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h2 style="color:#cffbf5">${text}</h2><p style="color:#8ea6a1">Try again in a little while. You can always use Zuno in your browser at <a style="color:#5eead4" href="/">heyzuno.uk</a>.</p></div>`); };
  for (const [path, name] of Object.entries(FILES)) {
    hooks.rawRoutes.push({ path: `/download/${path}`, fn: async (req, res) => {
      if (!ghToken()) return sorry(res, 'Downloads are being set up.');
      try {
        const rel = await latestRelease();
        const asset = (rel.assets || []).find(a => a.name === name);
        if (!asset) return sorry(res, "The newest Zuno isn't ready to download yet.");
        if (name === 'latest.yml') {
          // Small: passed on as it is, so the app's updater always gets an answer from heyzuno.uk.
          const r = await gh(asset.url, { accept: 'application/octet-stream', raw: true });
          const body = r.location ? await new Promise((ok, no) => https.get(r.location, rr => { const c = []; rr.on('data', d => c.push(d)); rr.on('end', () => ok(Buffer.concat(c))); }).on('error', no)) : r.buf;
          res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache' });
          return res.end(body);
        }
        const r = await gh(asset.url, { accept: 'application/octet-stream', raw: true });
        if (!r.location) return sorry(res, "The download couldn't start.");
        res.writeHead(302, { Location: r.location, 'Cache-Control': 'no-store' });
        res.end();
      } catch (err) {
        console.warn('Download failed:', err.message);
        sorry(res, "The download couldn't start.");
      }
    } });
  }
  // The download page shows the newest version and size.
  hooks.rawRoutes.push({ path: '/download/info', fn: async (req, res) => {
    let out = { ready: !!ghToken() };
    try {
      if (ghToken()) {
        const rel = await latestRelease();
        const exe = (rel.assets || []).find(a => a.name === 'Zuno-Setup.exe');
        out = { ready: !!exe, version: String(rel.tag_name || '').replace(/^v/, ''), size: exe?.size || null };
      }
    } catch { out = { ready: false }; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(out));
  } });
  z.downloadStatus = () => ({ token: !!ghToken() });

  // ======================= game covers =======================
  // A portrait cover from Steam when the game is there, else the picture on its Wikipedia page.
  const covers = new Map();
  function getJson(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 10000, headers: { 'User-Agent': 'ZunoCovers/1.1 (https://heyzuno.uk; game cover lookup)', Accept: 'application/json' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return getJson(new URL(res.headers.location, url).href).then(resolve, reject); }
        let raw = ''; res.on('data', c => (raw += c)); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, json: null }); } });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Games that aren't on Steam, with the Wikipedia page that has their picture.
  const WIKI46 = { roblox: 'Roblox', minecraft: 'Minecraft', minecraftlauncher: 'Minecraft', fortnite: 'Fortnite', valorant: 'Valorant', leagueoflegends: 'League of Legends',
    genshinimpact: 'Genshin Impact', honkaistarrail: 'Honkai: Star Rail', overwatch: 'Overwatch 2', overwatch2: 'Overwatch 2', worldofwarcraft: 'World of Warcraft',
    hearthstone: 'Hearthstone', diablo4: 'Diablo IV', diabloiv: 'Diablo IV', leagueoflegendsclient: 'League of Legends', osu: 'Osu!', zenlesszonezero: 'Zenless Zone Zero',
    wutheringwaves: 'Wuthering Waves', escapefromtarkov: 'Escape from Tarkov', clubpenguin: 'Club Penguin', amongus: 'Among Us', geometrydash: 'Geometry Dash' };
  async function findGameCover(name) {
    const wiki = WIKI46[norm(name)];
    if (wiki) {
      try {
        const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki.replace(/ /g, '_'))}`);
        const img = r.json?.thumbnail?.source || r.json?.originalimage?.source;
        if (r.status === 200 && img) return img;
      } catch {}
      // (0.53) The page-images API, for when the summary API is slow or refuses us.
      try {
        const r = await getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=400&redirects=1&titles=${encodeURIComponent(wiki)}`);
        const pages = Object.values(r.json?.query?.pages || {});
        const img = pages[0]?.thumbnail?.source;
        if (img) return img;
      } catch {}
    }
    try {
      const r = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`);
      const hit = (r.json?.items || []).find(i => norm(i.name) === norm(name)) || (r.json?.items || [])[0];
      if (hit?.id && norm(hit.name).includes(norm(name).slice(0, 6))) return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${hit.id}/library_600x900.jpg`;
    } catch {}
    for (const title of [`${name} (video game)`, name]) {
      try {
        const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
        const img = r.json?.thumbnail?.source || r.json?.originalimage?.source;
        if (r.status === 200 && img && r.json?.type !== 'disambiguation') return img;
      } catch {}
    }
    return null;
  }
  z.gameCoverNow = name => covers.get(norm(name)) || null;
  // (0.43.1) A game's own icon from the PC app, for when there's no cover online.
  // (0.46) Icons are kept across restarts (they used to live only in memory, so after a deploy
  // "Games in Rotation" showed a blank controller until the game was opened again).
  data.gameIcons46 ||= {};
  const icons = { has: k => !!data.gameIcons46[k], get: k => data.gameIcons46[k] };
  // (0.53) Windows hands back the same plain "program" icon for every game it can't read the icon of
  // (a blue window). A picture reported for two different games is that plain icon: it's forgotten
  // and never used, so the game gets its cover or drawn tile instead.
  data.genericIcons53 ||= {};
  const artKey = art => require('crypto').createHash('sha1').update(art).digest('hex').slice(0, 16);
  const artOwner = new Map();
  for (const [k, v] of Object.entries(data.gameIcons46)) { const h = artKey(v); if (artOwner.has(h) && artOwner.get(h) !== k) data.genericIcons53[h] = 1; else artOwner.set(h, k); }
  for (const [k, v] of Object.entries(data.gameIcons46)) if (data.genericIcons53[artKey(v)]) delete data.gameIcons46[k];
  z.isGenericIcon = art => !!(art && /^data:image\//.test(art) && data.genericIcons53[artKey(art)]);
  z.knownGameLogo = name => { const k = norm(name); return !!(LOGO47[k] || LOGO47[k.replace(/(player|studio|beta|launcher)+$/, '')]); };
  z.rememberGameIcon = (name, art) => {
    if (!art || !/^data:image\//.test(art) || art.length > 70000) return;
    const k = norm(name);
    const h = artKey(art);
    if (data.genericIcons53[h]) return;
    const owner = artOwner.get(h);
    if (owner && owner !== k) {
      data.genericIcons53[h] = 1;
      for (const [kk, v] of Object.entries(data.gameIcons46)) if (artKey(v) === h) delete data.gameIcons46[kk];
      save();
      return;
    }
    artOwner.set(h, k);
    if (data.gameIcons46[k] === art) return;
    data.gameIcons46[k] = art;
    const keys = Object.keys(data.gameIcons46);
    if (keys.length > 400) delete data.gameIcons46[keys[0]];
    save();
  };
  z.gameIconNow = name => (z.knownGameLogo(name) ? null : data.gameIcons46[norm(name)] || null);
  // (0.47) Last resort, so a game never shows a blank box: a drawn tile (the Roblox logo for Roblox,
  // the game's initials on a colour from its name for anything else). A real cover replaces it as
  // soon as one is found.
  const LOGO47 = { roblox: ['#e2231a', 'M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z'] };
  z.gameTile = name => {
    const k = norm(name);
    let hue = 0; for (const ch of k) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    const logo = LOGO47[k] || LOGO47[k.replace(/(player|studio|beta|launcher)+$/, '')];
    const bg = logo ? `<rect width="120" height="160" fill="${logo[0]}"/>` : `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,24%)"/></linearGradient></defs><rect width="120" height="160" fill="url(#g)"/>`;
    const words = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    const ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase().replace(/[<>&"]/g, '');
    const fg = logo ? `<g transform="translate(30 50) scale(2.5)"><path fill="#fff" d="${logo[1]}"/></g>` : `<text x="60" y="94" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="700" fill="#fff" text-anchor="middle">${ini}</text>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">${bg}${fg}</svg>`);
  };
  // (0.46) A failed lookup (Steam or Wikipedia slow or down) is tried again after 6 hours instead of
  // being remembered as "no cover" until the next restart.
  const missAt = new Map();
  z.gameCover = async name => {
    const k = norm(name);
    if (covers.has(k)) return covers.get(k);
    if (missAt.get(k) > Date.now() - 6 * 3600e3) return null;
    const url = await findGameCover(name);
    if (url) { covers.set(k, url); missAt.delete(k); } else missAt.set(k, Date.now());
    if (covers.size > 3000) covers.delete(covers.keys().next().value);
    return url;
  };

  // ======================= Games in Rotation =======================
  // Time played per game per day (the last 30 days), from the desktop app's activity reports.
  const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
  z.trackPlay = (u, name) => {
    if (!name) return;
    const now = Date.now();
    u.playtime ||= {};
    const g = u.playtime[name] ||= { days: {} };
    // Reports come about every 45 seconds; a long gap means the game was closed in between.
    const gap = g.last ? now - g.last : 0;
    if (gap > 0 && gap < 3 * 60e3) g.days[day()] = (g.days[day()] || 0) + gap;
    g.last = now;
    const cutoff = day(now - 30 * 864e5);
    for (const d of Object.keys(g.days)) if (d < cutoff) delete g.days[d];
    if (gap > 0) save();
  };
  route('GET', '/api/users/:id/rotation', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'User not found.');
    if (z.isBlocked?.(me.id, u.id) || (u.id !== me.id && (u.prefs?.shareActivity === false || u.showRotation === false))) return { games: [], hidden: true };
    const cutoff = day(Date.now() - 14 * 864e5);
    const games = Object.entries(u.playtime || {}).map(([name, g]) => ({ name, ms: Object.entries(g.days || {}).filter(([d]) => d >= cutoff).reduce((a, [, v]) => a + v, 0), last: g.last || 0 }))
      .filter(g => g.ms >= 5 * 60e3).sort((a, b) => b.ms - a.ms).slice(0, 8);
    await Promise.all(games.map(async g => { g.cover = z.gameCoverNow(g.name) ?? await z.gameCover(g.name).catch(() => null); if (!g.cover && z.gameIconNow(g.name)) { g.cover = z.gameIconNow(g.name); g.icon = true; } if (!g.cover) g.cover = z.gameTile(g.name); }));
    return { games, showing: u.showRotation !== false };
  });
  hooks.patchMe.push((me, body) => { if ('showRotation' in body) me.showRotation = !!body.showRotation; });

  // ======================= profile views =======================
  // Everyone's profile views are counted (just a number a day, never who), for "your profile was
  // viewed 34 times this week".
  const lastView = new Map();
  route('POST', '/api/users/:id/view', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u) || u.id === me.id || !human(me)) return { ok: true };
    const k = `${me.id}:${u.id}`, now = Date.now();
    if (now - (lastView.get(k) || 0) < 3600e3) return { ok: true };
    lastView.set(k, now);
    if (lastView.size > 50000) lastView.delete(lastView.keys().next().value);
    u.views ||= {};
    u.profileViewTotal ??= Object.values(u.views).reduce((a, v) => a + v, 0);
    u.profileViewTotal += 1;
    u.views[day()] = (u.views[day()] || 0) + 1;
    const cutoff = day(now - 60 * 864e5);
    for (const d of Object.keys(u.views)) if (d < cutoff) delete u.views[d];
    save();
    return { ok: true };
  });
  route('GET', '/api/me/profile-stats', async ({ me }) => {
    if (!Number.isFinite(me.profileViewTotal)) { me.profileViewTotal = Object.values(me.views || {}).reduce((a, v) => a + v, 0); save(); }
    const sum = days => Object.entries(me.views || {}).filter(([d]) => d >= day(Date.now() - (days - 1) * 864e5)).reduce((a, [, v]) => a + v, 0);
    const prevWeek = Object.entries(me.views || {}).filter(([d]) => d >= day(Date.now() - 13 * 864e5) && d < day(Date.now() - 6 * 864e5)).reduce((a, [, v]) => a + v, 0);
    const daily = [...Array(14)].map((_, i) => me.views?.[day(Date.now() - (13 - i) * 864e5)] || 0);
    return { today: sum(1), week: sum(7), month: sum(30), totalViews: Number(me.profileViewTotal) || Object.values(me.views || {}).reduce((a, v) => a + v, 0), prevWeek, daily, likes: Object.keys(me.likedBy || {}).length, comments: (me.profileComments || []).length };
  });

  // ======================= 0.43.1: security =======================
  const crypto = require('crypto');
  const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
  const mailReady = () => !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
  const site = () => (z.PUBLIC_URL || 'https://heyzuno.uk').replace(/\/$/, '');
  const pageHtml = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zuno</title><body style="font-family:system-ui,sans-serif;background:#0c1312;color:#dce8e5;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div style="max-width:420px;padding:24px"><h2 style="color:#cffbf5">${title}</h2>${body}</div>`;
  const sendPage = (res, status, html) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); };
  const readForm = req => new Promise(resolve => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); }); req.on('end', () => resolve(new URLSearchParams(raw))); req.on('error', () => resolve(new URLSearchParams())); });

  // ---- "This wasn't me" ----
  // The new-login message and email carry a link that logs everyone out of the account and locks
  // it until a new password is picked (with a reset link sent to the account's email).
  z.notMeLink = u => {
    const t = crypto.randomBytes(24).toString('base64url');
    u.notMe = [...(u.notMe || []).filter(x => x.exp > Date.now()), { h: sha(t), exp: Date.now() + 7 * 864e5 }].slice(-5);
    save();
    return `${site()}/not-me?t=${t}`;
  };
  const findNotMe = t => Object.values(data.users).find(u => (u.notMe || []).some(x => x.h === sha(t) && x.exp > Date.now()));
  hooks.rawRoutes.push({ path: '/not-me', fn: async (req, res, url) => {
    if (req.method === 'POST') {
      const f = await readForm(req);
      try { z.limit('notme:' + z.visitorTag(req), 10, 15 * 60e3); } catch { return sendPage(res, 429, pageHtml('Slow down', '<p>Try again in a few minutes.</p>')); }
      const u = findNotMe(f.get('t'));
      if (!u) return sendPage(res, 400, pageHtml('That link expired', '<p style="color:#8ea6a1">Open Zuno and change your password in Settings › My Account instead.</p>'));
      u.notMe = [];
      u.locked = { at: Date.now(), why: 'not-me' };
      u.passkeys = [];
      z.endSessions(u.id);
      let mailed = false;
      if (u.email && mailReady()) {
        data.resets ||= {};
        const token = crypto.randomBytes(24).toString('base64url');
        data.resets[sha(token)] = { uid: u.id, exp: Date.now() + 3600e3 };
        mailed = await z.sendMail(u.email, 'Pick a new Zuno password', `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>Your account is locked</h2><p>You said a login wasn't you, so everyone was logged out of <b>${u.username}</b>. Pick a new password to unlock it (the link works for 1 hour).</p><p><a href="${site()}/reset?token=${token}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0aa896;color:#fff;text-decoration:none;font-weight:600">Pick a new password</a></p></div>`).catch(() => false);
      }
      save();
      return sendPage(res, 200, pageHtml('Your account is locked and safe', `<p style="color:#8ea6a1">Everyone was logged out of <b>${u.username}</b>, and nobody can log in until a new password is picked.</p><p style="color:#8ea6a1">${mailed ? 'We emailed you a link to pick a new password.' : 'Use "Forgot your password?" on the Zuno login page to pick a new one.'}</p><p><a style="color:#5eead4" href="/">Go to Zuno</a></p>`));
    }
    const t = url.searchParams.get('t') || '';
    const u = findNotMe(t);
    if (!u) return sendPage(res, 400, pageHtml('That link expired', '<p style="color:#8ea6a1">Open Zuno and change your password in Settings › My Account instead.</p>'));
    // A button (not the link itself) does it, so email scanners that open links can't lock accounts.
    sendPage(res, 200, pageHtml('Lock your account?', `<p style="color:#8ea6a1">This logs everyone out of <b>${u.username}</b> (you too) and locks it until you pick a new password.</p><form method="POST" action="/not-me"><input type="hidden" name="t" value="${t.replace(/[^\w-]/g, '')}"><button style="margin-top:8px;padding:12px 18px;border:0;border-radius:10px;background:#e5484d;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Lock my account</button></form>`));
  } });
  hooks.login.unshift(user => { if (user.locked) fail(423, 'This account is locked to keep it safe. Use "Forgot your password?" to pick a new password and unlock it.'); return null; });
  hooks.newSession.push((u, req, key) => { if (u?.locked) { delete data.sessions[key]; save(); } });

  // ---- a login from a new device: a code from your email ----
  const deviceKey = req => {
    const ua = String(req?.headers['user-agent'] || '');
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Electron\//.test(ua) || /Zuno/.test(ua) ? 'Zuno desktop app' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
    const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
    return `${browser}|${os}`;
  };
  const emailTickets = new Map();
  hooks.login.push((user, req) => {
    // Only for accounts with a confirmed email and no two-factor (that's its own step), from a
    // device the account hasn't used before.
    if (user.bot || user.system || !user.email || !user.emailVerified || !mailReady() || !user.knownDevices?.length) return null;
    if (user.knownDevices.some(d => d.key === deviceKey(req))) return null;
    return (async () => {
      // (security) A few login emails an hour per account: stops guessing with endless fresh codes and
      // stops using up the email quota (which used to let the login through).
      z.limit('emsend:' + user.id, 6, 3600e3, 'Too many login attempts for this account. Wait an hour, or use a passkey.');
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      const ticket = 'em_' + crypto.randomBytes(24).toString('base64url');
      const ok = await z.sendMail(user.email, `${code} is your Zuno login code`, `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>Your login code</h2><p>Someone (hopefully you) is logging into <b>${user.username}</b> from a new device. Your code is:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${code}</p><p style="color:#666">It works for 10 minutes. If this wasn't you, change your password: they already know it.</p></div>`).catch(() => false);
      // If the email can't be sent, the login goes ahead (you're never stuck).
      if (!ok) {
        // Staff accounts never skip the check.
        if (z.isStaff(user)) fail(503, "We couldn't send your login code. Try again in a few minutes.");
        const token = z.createSession(user.id, req); return { token };
      }
      emailTickets.set(sha(ticket), { uid: user.id, code: sha(code), exp: Date.now() + 10 * 60e3, tries: 0 });
      const [name, domain] = user.email.split('@');
      return { mfa: true, ticket, emailHint: `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}` };
    })();
  });
  route('POST', '/api/login/email-code', async ({ body, req, res }) => {
    z.limit('emcode:' + z.visitorTag(req), 15, 10 * 60e3, 'Too many tries. Wait a few minutes.');
    const k = sha(body.ticket), t = emailTickets.get(k);
    if (!t || t.exp < Date.now() || t.tries >= 5) { emailTickets.delete(k); fail(401, 'That took too long. Log in again.'); }
    z.limit('emcode-acct:' + t.uid, 12, 3600e3, 'Too many wrong codes for this account. Wait an hour and try again.');
    if (sha(String(body.code || '').replace(/\D/g, '')) !== t.code) { t.tries++; fail(400, "That code isn't right. Check the newest email from Zuno."); }
    emailTickets.delete(k);
    const u = data.users[t.uid];
    if (!u || u.locked) fail(401, 'Log in again.');
    const token = z.createSession(u.id, req);
    if (z.sessionCookie) res.setHeader('Set-Cookie', z.sessionCookie(token, req));
    return { token };
  }, { auth: false });
  setInterval(() => { const now = Date.now(); for (const [k, t] of emailTickets) if (t.exp < now) emailTickets.delete(k); }, 60e3).unref();

  // ---- confirm it's you (before big changes) ----
  route('POST', '/api/me/reauth', async ({ me, body, token, req }) => {
    z.limit('reauth:' + me.id, 10, 15 * 60e3, 'Too many tries. Wait a few minutes.');
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, 'That password is wrong.');
    // (security) With two-factor login on, the code is needed too.
    // The founder's account is protected by its trusted-devices lock instead (zuno46.js), so a password is enough.
    if (me.twoFactor && !z.isFounder(me.id)) {
      if (!String(body.code || '').trim()) fail(400, 'Enter the code from your authenticator app too.');
      if (!z.hooks.secondFactor?.(me, body.code)) { save(); fail(400, "That code didn't work. Try the newest one, or a backup code."); }
    }
    if (data.sessions[token]) { data.sessions[token].reauthAt = Date.now(); save(); }
    return { ok: true };
  });

  // ---- logins refresh themselves ----
  // Every few days the app swaps its login for a new one, so an old copy of it (from a stolen
  // backup, a shared computer…) stops working on its own. The old one keeps working 10 minutes,
  // so nothing in flight breaks.
  route('POST', '/api/me/rotate', async ({ me, token, req, res }) => {
    const s = data.sessions[token];
    if (!s || s.dieAt || Date.now() - (s.rotAt || s.createdAt || 0) < 3 * 864e5) return { token: null };
    const fresh = crypto.randomBytes(32).toString('hex');
    data.sessions[z.tokenKey(fresh)] = { ...s, rotAt: Date.now(), lastSeen: Date.now() };
    s.dieAt = Date.now() + 10 * 60e3;
    save();
    if (z.sessionCookie) res.setHeader('Set-Cookie', z.sessionCookie(fresh, req));
    return { token: fresh };
  });
};
