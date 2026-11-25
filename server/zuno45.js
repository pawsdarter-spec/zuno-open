'use strict';
// Zuno 0.45: faster loading.
//  - One bundled script and one stylesheet instead of ~85 files (minified, compressed, cached for a year).
//    If the bundle ever fails to start, the page reloads with ?nobundle=1 and loads the files one by one.
//  - Only your language's words are downloaded (/lang45/xx.js), from the dictionaries in public/lang/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { minifyJs, minifyCss } = require('./minify45');

const PUBLIC = path.join(__dirname, '..', 'public');
const LANGS = ['es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'ja'];
// Files loaded only when they're needed (not in the bundle, not in index.html).
const LAZY = ['/editor41.js'];
const hash = buf => crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 12);

module.exports = function (z) {
  const { hooks } = z;
  const OFF = process.env.ZUNO_NO_BUNDLE === '1';

  // ---------- in-memory files ----------
  const mem = new Map(); // url path -> { buf, type, etag }
  function put(urlPath, text, type) {
    const buf = Buffer.from(text, 'utf8');
    const entry = { buf, type, etag: '"' + hash(buf) + '"', v: hash(buf) };
    mem.set(urlPath, entry);
    return entry;
  }
  function serve(req, res, entry, url) {
    const immutable = url && url.searchParams.get('v') === entry.v;
    const head = { 'Content-Type': entry.type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ETag: entry.etag, Vary: 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' };
    const sent = String(req.headers['if-none-match'] || '').split(',').map(t => t.trim().replace(/^W\//, ''));
    if (sent.includes(entry.etag)) { res.writeHead(304, head); return res.end(); }
    const accept = String(req.headers['accept-encoding'] || '');
    if (req.method !== 'HEAD' && entry.buf.length > 1024) {
      if (/\bbr\b/.test(accept)) {
        entry.br ||= zlib.brotliCompressSync(entry.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.buf.length } });
        res.writeHead(200, { ...head, 'Content-Encoding': 'br', 'Content-Length': entry.br.length });
        return res.end(entry.br);
      }
      if (/\bgzip\b/.test(accept)) {
        entry.gz ||= zlib.gzipSync(entry.buf, { level: 9 });
        res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': entry.gz.length });
        return res.end(entry.gz);
      }
    }
    res.writeHead(200, { ...head, 'Content-Length': entry.buf.length });
    res.end(req.method === 'HEAD' ? undefined : entry.buf);
  }
  // Rebuilt only when one of its source files changes (checked by modification time).
  const memo = (files, build) => {
    let sig = null, val = null;
    return () => {
      const s = files().map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join(',');
      if (s !== sig) { val = build(); sig = s; }
      return val;
    };
  };

  // ---------- languages ----------
  const LANG_FILES = ['base42.txt', 'base44.txt', 'strings45.txt'].map(f => path.join(PUBLIC, 'lang', f));
  const buildLangs = memo(() => LANG_FILES, () => {
    const words = Object.fromEntries(LANGS.map(l => [l, {}]));
    const read = (file, cols) => {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
      for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const p = line.split('|');
        if (p.length !== cols.length + 1) continue;
        cols.forEach((l, i) => { if (p[i + 1]) words[l][p[0]] = p[i + 1]; });
      }
    };
    read(LANG_FILES[0], ['es', 'pt', 'fr', 'de']);
    read(LANG_FILES[1], ['it', 'nl', 'pl', 'tr', 'ja']);
    read(LANG_FILES[2], LANGS); // newest wins
    const versions = {};
    for (const l of LANGS) versions[l] = put(`/lang45/${l}.js`, `'use strict';\nconst I18N45 = ${JSON.stringify({ lang: l, words: words[l] })};\n`, 'text/javascript; charset=utf-8').v;
    // Loads your language's words before the app starts (a tiny script, asked for fresh each time).
    put('/lang45.js', `(function(){var V=${JSON.stringify(versions)},l;try{l=localStorage.getItem('zuno_lang')}catch(e){}if(l&&V[l])document.write('<script src="/lang45/'+l+'.js?v='+V[l]+'"><\\/script>');})();\n`, 'text/javascript; charset=utf-8');
    return versions;
  });
  hooks.rawRoutes.push({ path: '/lang45.js', fn: (req, res, url) => { buildLangs(); serve(req, res, mem.get('/lang45.js'), url); } });
  for (const l of LANGS) hooks.rawRoutes.push({ path: `/lang45/${l}.js`, fn: (req, res, url) => { buildLangs(); serve(req, res, mem.get(`/lang45/${l}.js`), url); } });

  // ---------- lazy files ----------
  const lazyVersions = () => Object.fromEntries(LAZY.map(p => { try { return [p, hash(fs.readFileSync(path.join(PUBLIC, p)))]; } catch { return [p, '']; } }));

  // ---------- the bundle ----------
  const INDEX = path.join(PUBLIC, 'index.html');
  const pageAssets = () => {
    const html = fs.readFileSync(INDEX, 'utf8');
    const body = html.slice(html.indexOf('<body'));
    const js = [...body.matchAll(/<script src="(\/[A-Za-z0-9_.-]+\.js)"><\/script>/g)].map(m => m[1]);
    const css = [...html.matchAll(/<link rel="stylesheet" href="(\/[A-Za-z0-9_.-]+\.css)">/g)].map(m => m[1]);
    return { js, css };
  };
  const sourceFiles = () => { try { const { js, css } = pageAssets(); return [INDEX, ...js, ...css, ...LAZY].map(p => p === INDEX ? p : path.join(PUBLIC, p)); } catch { return [INDEX]; } };
  const buildBundle = memo(sourceFiles, () => {
    const t0 = Date.now();
    const { js, css } = pageAssets();
    const parts = [`'use strict';\nwindow.ASSET_V45 = ${JSON.stringify(lazyVersions())};\n`];
    for (const p of js) {
      const src = fs.readFileSync(path.join(PUBLIC, p), 'utf8');
      let min;
      try { min = minifyJs(src); } catch (err) { console.error(`Bundle: couldn't shrink ${p} (${err.message}), using it as is.`); min = src; }
      // Each file's own "use strict" line is dropped: the bundle is strict as a whole, like every file.
      parts.push(`// ${p}\n` + min.replace(/^\s*(['"])use strict\1;?\s*/, ''));
    }
    parts.push('window.__b45ok = 1;\n');
    const jsText = parts.join(';\n');
    // A bundle that can't even be read must never be sent.
    try { new Function(jsText); } catch (err) { console.error('Bundle failed its check, sending files one by one:', err.message); return null; }
    const cssText = css.map(p => minifyCss(fs.readFileSync(path.join(PUBLIC, p), 'utf8'))).join('');
    const out = {
      js: put('/b45/app.js', jsText, 'text/javascript; charset=utf-8'),
      css: put('/b45/app.css', cssText, 'text/css; charset=utf-8'),
      files: new Set([...js, ...css]),
    };
    console.log(`Zuno bundle ready: ${js.length} scripts → ${Math.round(jsText.length / 1024)} KB, ${css.length} styles → ${Math.round(cssText.length / 1024)} KB (${Date.now() - t0} ms).`);
    return out;
  });
  // If the bundle stops part-way (a script error while starting), load the page the old way instead.
  put('/b45/check.js', `if(!window.__b45ok){try{if(!sessionStorage.getItem('zuno_nobundle_tried')){sessionStorage.setItem('zuno_nobundle_tried','1');location.replace(location.pathname+'?nobundle=1'+location.hash);}}catch(e){}}\n`, 'text/javascript; charset=utf-8');
  for (const p of ['/b45/app.js', '/b45/app.css', '/b45/check.js']) hooks.rawRoutes.push({ path: p, fn: (req, res, url) => { if (p !== '/b45/check.js') buildBundle(); const e = mem.get(p); if (!e) { res.writeHead(404); return res.end(); } serve(req, res, e, url); } });

  if (OFF) return;
  const pages = new WeakMap();
  hooks.indexPage = entry => {
    let b;
    try { b = buildBundle(); } catch (err) { console.error('Bundle failed:', err.message); return null; }
    if (!b) return null;
    const cached = pages.get(entry);
    if (cached && cached.js === b.js.v && cached.css === b.css.v) return cached.page;
    let html = entry.buf.toString('utf8');
    let firstJs = true, firstCss = true;
    html = html.replace(/<script src="(\/[A-Za-z0-9_.-]+\.js)(?:\?v=[\w-]+)?"><\/script>\n?/g, (all, p) => {
      if (!b.files.has(p)) return all;
      if (!firstJs) return '';
      firstJs = false;
      return `<script src="/b45/app.js?v=${b.js.v}"></script>\n  <script src="/b45/check.js?v=${mem.get('/b45/check.js').v}"></script>\n`;
    });
    html = html.replace(/<link rel="stylesheet" href="(\/[A-Za-z0-9_.-]+\.css)(?:\?v=[\w-]+)?">\n?/g, (all, p) => {
      if (!b.files.has(p)) return all;
      if (!firstCss) return '';
      firstCss = false;
      return `<link rel="stylesheet" href="/b45/app.css?v=${b.css.v}">\n`;
    });
    // Start downloading the script while the styles and fonts load.
    html = html.replace('</head>', `  <link rel="preload" href="/b45/app.js?v=${b.js.v}" as="script">\n</head>`);
    const buf = Buffer.from(html, 'utf8');
    const page = { ...entry, buf, br: null, gz: null, etag: '"' + hash(buf) + '"' };
    pages.set(entry, { js: b.js.v, css: b.css.v, page });
    return page;
  };
  // Build once at start, so the first visitor doesn't wait for it.
  setImmediate(() => { try { buildLangs(); buildBundle(); } catch (err) { console.error('Bundle failed:', err.message); } });
};

// ======================= Zuno Official account =======================
// The founder can sign in as the Zuno account (it shows in their Switch Accounts list), read every
// DM Zuno has with people and answer as Zuno. Asking for it needs the password again, and each
// sign-in is written to the server's audit log.
module.exports.official = function (z) {
  const { data, route, fail, hooks, save } = z;
  route('POST', '/api/official/session', async ({ me, token, req }) => {
    if (!z.isFounder(me.id)) fail(403, 'Only the founder can use the Zuno Official account.');
    // (0.53) Your password is enough (no two-factor or trusted devices needed first).
    z.needReauth(token);
    const zuno = data.users[z.SYSTEM_ID];
    if (!zuno) fail(404, 'The Zuno account is missing.');
    z.limit('official:' + me.id, 10, 3600e3);
    const t = z.createSession(zuno.id, req);
    const s = data.sessions[z.tokenKey(t)];
    if (s && typeof s === 'object') { s.official = true; s.by = me.id; }
    (data.officialLog ||= []).push({ by: me.id, at: Date.now() });
    if (data.officialLog.length > 200) data.officialLog.splice(0, data.officialLog.length - 200);
    save();
    console.log(`Zuno Official: signed in by ${me.username}.`);
    return { token: t, account: { id: zuno.id, username: zuno.username, displayName: zuno.displayName, avatar: zuno.avatar || null, avatarColor: zuno.avatarColor || null } };
  });
  // What Zuno Official writes by hand is marked, so the person can answer it.
  hooks.beforePost.push(({ me, extra }) => { if (me?.system) extra.official = true; });
};

// ======================= Mod View =======================
// For people who can moderate a server: one panel about a member with when they joined, how old
// their account is, their roles, any timeout, everything the audit log says about them, their
// latest messages here, and private notes the moderators share.
module.exports.modview = function (z) {
  const { data, route, fail, save } = z;
  const MOD_PERMS = ['kick_members', 'ban_members', 'manage_messages', 'timeout_members', 'moderate_members'];
  const modOf = (me, id) => {
    const sv = z.getServer(me, id);
    if (sv.ownerId !== me.id && !MOD_PERMS.some(p => z.PERM_INFO[p] && z.can(sv, me.id, p))) fail(403, 'Only moderators can open Mod View.');
    return sv;
  };
  route('GET', '/api/servers/:id/modview/:uid', async ({ me, params }) => {
    const sv = modOf(me, params.id);
    const u = data.users[params.uid];
    if (!u || !sv.members.includes(u.id)) fail(404, "They're not in this server.");
    const messages = [];
    let total = 0;
    for (const ch of sv.channels || []) {
      if (ch.type === 'category' || !z.canView(sv, ch, me.id)) continue;
      const list = data.channelMessages[ch.id]?.messages || [];
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m.authorId !== u.id) continue;
        total++;
        if (messages.length < 60) messages.push({ id: m.id, channelId: ch.id, channel: ch.name, content: String(m.content || (m.attachments ? '📎 file' : m.gif ? 'GIF' : m.sticker ? 'Sticker' : '')).slice(0, 300), createdAt: m.createdAt });
      }
    }
    messages.sort((a, b) => b.createdAt - a.createdAt);
    const history = (sv.audit || []).filter(e => e.target?.id === u.id).slice(-40).reverse().map(e => ({ ...e, byName: data.users[e.by]?.displayName || 'Someone' }));
    const notes = (sv.modNotes?.[u.id] || []).map(n => ({ ...n, byName: data.users[n.by]?.displayName || 'Someone' }));
    return {
      user: z.publicUser(u), owner: sv.ownerId === u.id, joinedAt: u.joinedAt?.[sv.id] || null, createdAt: u.createdAt,
      roles: (sv.roles || []).filter(r => !r.everyone && z.rolesOf(sv, u.id).includes(r.id)).map(r => ({ id: r.id, name: r.name, color: r.color })),
      timedOutUntil: (sv.timeouts?.[u.id] || 0) > Date.now() ? sv.timeouts[u.id] : null,
      messages: messages.slice(0, 15), messageCount: total, history, notes,
      warnings: (() => { const days = sv.zunobots?.warden?.warnExpireDays ?? 30; return (sv.warns46?.[u.id] || []).filter(w => !days || w.at > Date.now() - days * 864e5).map(w => ({ ...w, byName: data.users[w.by]?.displayName || 'A mod' })); })(),
    };
  });
  route('POST', '/api/servers/:id/modview/:uid/notes', async ({ me, params, body }) => {
    const sv = modOf(me, params.id);
    const text = z.clean(String(body.text || ''), 500).trim();
    if (!text) fail(400, 'Write something first.');
    sv.modNotes ||= {};
    const list = (sv.modNotes[params.uid] ||= []);
    list.push({ id: z.newId(), by: me.id, at: Date.now(), text });
    if (list.length > 50) list.splice(0, list.length - 50);
    save();
    return { ok: true };
  });
  route('DELETE', '/api/servers/:id/modview/:uid/notes/:nid', async ({ me, params }) => {
    const sv = modOf(me, params.id);
    const list = sv.modNotes?.[params.uid] || [];
    const i = list.findIndex(n => n.id === params.nid);
    if (i < 0) fail(404, 'That note is gone.');
    if (list[i].by !== me.id && sv.ownerId !== me.id) fail(403, 'Only whoever wrote a note (or the owner) can delete it.');
    list.splice(i, 1);
    save();
    return { ok: true };
  });
};
