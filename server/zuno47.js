'use strict';
// Zuno 0.46: bots can DM people and manage roles and channel permissions, a clearer "add a bot"
// screen, stricter usernames, and a voice relay through Zuno for calls that can't connect directly.
module.exports = function (z) {
  const { data, save, route, fail, hooks, send } = z;

  // ======================= usernames: the stricter filter for people who already have one =======================
  // Usernames with slurs or sexual words that got through before are swapped for a neutral one,
  // once. The person gets a Zuno DM and can pick a new name right away.
  if (!data.badNames46) {
    let n = 0;
    for (const u of Object.values(data.users)) {
      if (!u || u.bot || u.system || !u.username || !z.badUsername(u.username)) continue;
      // Plain swearing in an existing name is left alone; only what badName blocks everywhere is swapped.
      if (!require('./namefilter').badName(u.username)) continue;
      let name;
      do name = 'user' + Math.floor(100000 + Math.random() * 900000); while (Object.values(data.users).some(x => x.username === name));
      u.pastUsernames = [{ name: u.username, until: Date.now(), removed: true }, ...(u.pastUsernames || [])].slice(0, 10);
      u.username = name;
      u.usernameChangedAt = 0;
      z.systemMessage(u.id, `Your username wasn't allowed on Zuno, so it was changed to **@${name}**. You can pick a new one in **Settings › My Account**.`);
      n++;
    }
    data.badNames46 = { at: Date.now(), changed: n };
    save();
  }

  // ======================= bots: DMs =======================
  // People can turn off DMs from bots in Settings › Privacy (on by default).
  z.PREF_DEFAULTS.botDms = true;
  if (!z.PREF_BOOLS.includes('botDms')) z.PREF_BOOLS.push('botDms');

  // ======================= bots (and people): give or take one role =======================
  // PUT/DELETE /api/servers/:id/members/:userId/roles/:roleId: the same checks as changing someone's
  // whole role list, without having to send every role they have.
  const topPos = (sv, uid) => z.topPos(sv, uid);
  function oneRole(me, params, give) {
    const sv = z.getManagedServer(me, params.id, 'manage_roles');
    const uid = params.userId;
    if (!sv.members.includes(uid)) fail(404, "They aren't in this server.");
    const role = z.roleById(sv, params.roleId);
    if (!role || role.everyone) fail(404, 'Role not found.');
    if (role.managed) fail(400, `${role.name} belongs to a bot and can't be given to people.`);
    if (!z.canEditRole(sv, me.id, role)) fail(403, `You can't give or take ${role.name}: it's not below your highest role.`);
    const theirTop = uid === sv.ownerId ? -1 : topPos(sv, uid);
    if (uid !== me.id && me.id !== sv.ownerId && (uid === sv.ownerId || topPos(sv, me.id) >= theirTop) && !(z.basePerms(sv, me.id).has('administrator') && uid !== sv.ownerId))
      fail(403, uid === sv.ownerId ? "Only the owner can change the owner's roles." : "You can't change roles for someone whose role is higher than yours.");
    const cur = z.rolesOf(sv, uid).filter(id => id !== sv.id);
    const has = cur.includes(role.id);
    if (give === has) return { roles: sv.memberRoles[uid] || [] };
    sv.memberRoles[uid] = give ? [...cur, role.id] : cur.filter(id => id !== role.id);
    z.audit(sv, me, 'member_roles', { type: 'member', id: uid, name: data.users[uid]?.displayName || '?' }, (give ? '+' : '−') + role.name);
    save(); z.refreshServer(sv);
    return { roles: sv.memberRoles[uid] };
  }
  route('PUT', '/api/servers/:id/members/:userId/roles/:roleId', async ({ me, params }) => oneRole(me, params, true));
  route('DELETE', '/api/servers/:id/members/:userId/roles/:roleId', async ({ me, params }) => oneRole(me, params, false));

  // A channel's permission overrides, for bots (people see them in the server data already).
  route('GET', '/api/channels/:id/overrides', async ({ me, params }) => {
    const { sv, ch } = z.findChannel(params.id);
    if (!sv || !ch || !sv.members.includes(me.id) || !z.canView(z.ensureRoles(sv), ch, me.id)) fail(404, 'Channel not found.');
    if (!z.permsIn(sv, ch, me.id).has('manage_roles')) fail(403, 'You need Manage Roles & Permissions to see this.');
    return { channelId: ch.id, synced: !!ch.synced, overrides: ch.overrides || [] };
  });

  // ======================= the "add a bot" screen =======================
  // How many servers a bot is in and how long it's been around, shown before you add it.
  route('GET', '/api/apps/:id/authorize', async ({ me, params }) => {
    const bot = data.users[params.id];
    if (!z.devBot(bot) || bot.app?.deleted || (!bot.app?.public && bot.app?.ownerId !== me.id)) fail(404, "That bot doesn't exist or is private.");
    const servers = Object.values(data.servers).filter(sv => sv.members.includes(me.id) && z.can(z.ensureRoles(sv), me.id, 'manage_integrations'))
      .map(sv => ({ id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor || null, has: sv.members.includes(bot.id), mine: [...z.basePerms(sv, me.id)] }));
    const serverCount = Object.values(data.servers).filter(sv => sv.members.includes(bot.id)).length;
    return { app: { ...z.appView(bot, me), serverCount, builtIn: String(bot.id).startsWith('zbot_'), listed: !!bot.app?.listed || String(bot.id).startsWith('zbot_') }, servers, perms: z.PERM_INFO };
  });

  // ======================= calls: voice through Zuno when a direct connection can't be made =======================
  // Some networks block every direct path between two people, and without a TURN relay set up the
  // call never connects. As a last resort the apps send their voice (small Opus packets) through
  // Zuno: a bit more delay, but you can hear each other. Only voice, only between people in the
  // same call, and nothing is stored.
  const { rooms, streams, streamWrite } = z;
  route('POST', '/api/rtc/relay', async ({ me, body }) => {
    const roomId = String(body.room || '');
    const room = rooms.get(roomId);
    if (!room?.has(me.id)) return { ok: false };
    z.limit('relay:' + me.id, 40, 2000, 'Too much call audio at once.');
    const frames = Array.isArray(body.f) ? body.f.filter(x => typeof x === 'string' && x.length < 2000).slice(0, 20) : [];
    if (!frames.length) return { ok: true };
    const to = (Array.isArray(body.to) ? body.to : []).map(String).filter(id => id !== me.id && room.has(id)).slice(0, 25);
    const chunk = `event: rtc-relay\ndata: ${JSON.stringify({ room: roomId, from: me.id, t: Number(body.t) || 0, f: frames })}\n\n`;
    // Written straight to the live connection: not kept for catching up later (old audio is useless).
    for (const id of to) for (const res of streams.get(id) || []) streamWrite(res, chunk);
    return { ok: true };
  });
};

// ======================= PC app downloads without a GitHub key =======================
// (0.47) The repository is private, so heyzuno.uk/download could only fetch the installer with a
// GitHub key (ZUNO_GITHUB_TOKEN) that was never set, and the page said "Downloads are being set up".
// Now the release workflow sends the finished files straight to Zuno, which keeps them in cloud
// storage. GitHub vouches for each upload with a short-lived signed note (an OpenID Connect token),
// checked here: it must come from this repository's release workflow on main. No password or key
// is stored anywhere.
module.exports.releases = function (z) {
  const { data, save, hooks } = z;
  const https = require('https');
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');
  const storage = require('./storage');
  const REPO = process.env.ZUNO_RELEASE_REPO || 'pawsdarter-spec/zuno';
  const AUD = 'zuno-release';
  const NAMES = ['Zuno-Setup.exe', 'Zuno-Setup.exe.blockmap', 'latest.yml'];
  const DISK = path.join(z.UPLOAD_DIR, 'releases47');

  const getJson = url => new Promise((ok, no) => https.get(url, { timeout: 10000, headers: { 'User-Agent': 'Zuno' } }, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString())); } catch (e) { no(e); } }); }).on('error', no));
  let jwks = null, jwksAt = 0;
  async function keyFor(kid) {
    if (!jwks || Date.now() - jwksAt > 3600e3 || !jwks.keys?.some(k => k.kid === kid)) { jwks = await getJson('https://token.actions.githubusercontent.com/.well-known/jwks'); jwksAt = Date.now(); }
    const jwk = jwks.keys?.find(k => k.kid === kid);
    return jwk ? crypto.createPublicKey({ key: jwk, format: 'jwk' }) : null;
  }
  const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  async function checkGitHub(req) {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const [h, p, sig] = tok.split('.');
    if (!h || !p || !sig) return null;
    let head, claims;
    try { head = JSON.parse(b64(h)); claims = JSON.parse(b64(p)); } catch { return null; }
    if (head.alg !== 'RS256') return null;
    const key = await keyFor(head.kid).catch(() => null);
    if (!key || !crypto.verify('sha256', Buffer.from(h + '.' + p), key, b64(sig))) return null;
    const now = Date.now() / 1000;
    const ok = claims.iss === 'https://token.actions.githubusercontent.com'
      && claims.aud === AUD
      && claims.repository === REPO
      && claims.ref === 'refs/heads/main'
      && String(claims.workflow_ref || '').startsWith(`${REPO}/.github/workflows/release.yml@`)
      && Number(claims.exp) > now
      && (claims.nbf == null || Number(claims.nbf) <= now + 60);
    return ok ? claims : null;
  }
  const readBody = (req, max) => new Promise((ok, no) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { no(new Error('too big')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const objName = (version, name) => `release47-${version}-${name}`;

  // ?op=start|part|finish&name=Zuno-Setup.exe&version=0.47.0[&n=1]
  hooks.rawRoutes.push({ path: '/api/release47/upload', fn: async (req, res, url) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return json(res, 405, { error: 'Use POST.' });
    const who = await checkGitHub(req).catch(() => null);
    if (!who) { req.resume(); return json(res, 401, { error: 'Only the release workflow can upload.' }); }
    const op = url.searchParams.get('op'), name = url.searchParams.get('name'), version = url.searchParams.get('version') || '';
    if (!NAMES.includes(name) || !/^\d+\.\d+\.\d+$/.test(version)) { req.resume(); return json(res, 400, { error: 'Bad file or version.' }); }
    const up = (data.release47up ||= {});
    const key = version + '/' + name;
    try {
      if (op === 'start') {
        req.resume();
        up[key] = { parts: [], size: 0, id: storage.enabled() ? await storage.multiStart(objName(version, name), name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream') : null };
        if (!storage.enabled()) { fs.mkdirSync(DISK, { recursive: true }); fs.writeFileSync(path.join(DISK, objName(version, name)), ''); }
        save();
        return json(res, 200, { ok: true });
      }
      if (op === 'part') {
        const u = up[key];
        if (!u) { req.resume(); return json(res, 400, { error: 'Start first.' }); }
        const buf = await readBody(req, 64 * 1048576);
        const n = Number(url.searchParams.get('n'));
        if (n !== u.parts.length + 1) return json(res, 400, { error: `Expected part ${u.parts.length + 1}.` });
        u.parts.push(storage.enabled() ? await storage.multiPart(objName(version, name), u.id, n, buf) : 'disk');
        if (!storage.enabled()) fs.appendFileSync(path.join(DISK, objName(version, name)), buf);
        u.size += buf.length;
        save();
        return json(res, 200, { ok: true, size: u.size });
      }
      if (op === 'finish') {
        req.resume();
        const u = up[key];
        if (!u?.parts.length) return json(res, 400, { error: 'Nothing uploaded.' });
        if (storage.enabled()) await storage.multiFinish(objName(version, name), u.id, u.parts);
        const rel = (data.release47 && data.release47.pending === version) ? data.release47 : { ...(data.release47 || {}), pending: version, files: {} };
        rel.files[name] = { size: u.size, at: Date.now() };
        delete up[key];
        // latest.yml goes up last: once it's there, this version is the one everyone gets.
        if (name === 'latest.yml' && rel.files['Zuno-Setup.exe']) { rel.live = { version, files: rel.files, at: Date.now() }; delete rel.pending; rel.files = {}; }
        data.release47 = rel;
        save();
        console.log(`Release ${version}: ${name} uploaded (${u.size} bytes) by the release workflow (run ${who.run_id}).`);
        return json(res, 200, { ok: true, live: rel.live?.version || null });
      }
      req.resume();
      return json(res, 400, { error: 'Unknown step.' });
    } catch (err) {
      console.warn('Release upload failed:', err.message);
      return json(res, 500, { error: err.message });
    }
  } });

  // Serving: these run before the older routes (which needed the GitHub key).
  const live = () => data.release47?.live || null;
  const sendFile = async (res, version, name) => {
    const o = objName(version, name);
    if (name === 'latest.yml') {
      let body = null;
      if (storage.enabled()) { const r = await storage.get(o); if (r) body = await new Promise((ok, no) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => ok(Buffer.concat(c))); r.on('error', no); }); }
      else if (fs.existsSync(path.join(DISK, o))) body = fs.readFileSync(path.join(DISK, o));
      if (!body) return false;
      res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(body);
      return true;
    }
    if (storage.enabled()) {
      res.writeHead(302, { Location: storage.presignedUrl(o, { 'response-content-disposition': `attachment; filename="${name}"`, 'response-content-type': 'application/octet-stream' }), 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    const file = path.join(DISK, o);
    if (!fs.existsSync(file)) return false;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return true;
  };
  const mine = [];
  for (const [p, name] of Object.entries({ windows: 'Zuno-Setup.exe', 'Zuno-Setup.exe': 'Zuno-Setup.exe', 'Zuno-Setup.exe.blockmap': 'Zuno-Setup.exe.blockmap', 'latest.yml': 'latest.yml' })) {
    const old = hooks.rawRoutes.find(r => r.path === '/download/' + p);
    mine.push({ path: '/download/' + p, fn: async (req, res, url) => {
      const l = live();
      if (l && l.files[name]) { try { if (await sendFile(res, l.version, name)) return; } catch (err) { console.warn('Download failed:', err.message); } }
      return old ? old.fn(req, res, url) : (res.writeHead(404), res.end());
    } });
  }
  const oldInfo = hooks.rawRoutes.find(r => r.path === '/download/info');
  mine.push({ path: '/download/info', fn: async (req, res, url) => {
    const l = live();
    if (!l) return oldInfo ? oldInfo.fn(req, res, url) : json(res, 200, { ready: false });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ready: true, version: l.version, size: l.files['Zuno-Setup.exe']?.size || null }));
  } });
  hooks.rawRoutes.unshift(...mine);
  const oldStatus = z.downloadStatus;
  z.downloadStatus = () => ({ ...(oldStatus ? oldStatus() : {}), uploaded: live()?.version || null });
};
