'use strict';
// Zuno 0.56: new accounts confirm their email within 14 days (or the account is removed and its
// name is free again), two accounts per person, and a picture (any custom emoji) for server tags.
const crypto = require('crypto');

module.exports = function (z) {
  const { data, save, route, fail, hooks, networkOf } = z;
  const DAY = 864e5, VERIFY_DAYS = 14;
  const MAX_ACCOUNTS = Math.max(1, Number(process.env.ZUNO_MAX_ACCOUNTS) || 2);
  const live = u => u && !u.deleted && !u.bot && !u.system && !u.webhook;

  // ======================= one inbox, one email =======================
  // Gmail ignores dots and anything after a "+", so name.x+1@gmail.com is the same inbox as
  // namex@gmail.com. Those count as the same email, so one inbox can't make endless accounts.
  const inbox = e => {
    let [n, d] = String(e || '').toLowerCase().trim().split('@');
    if (!n || !d) return '';
    if (d === 'googlemail.com') d = 'gmail.com';
    n = n.split('+')[0];
    if (d === 'gmail.com') n = n.replace(/\./g, '');
    return n + '@' + d;
  };
  hooks.emailTaken = (email, exceptId) => {
    const k = inbox(email);
    return !!k && Object.values(data.users).some(u => live(u) && u.id !== exceptId && u.email && inbox(u.email) === k);
  };

  // ======================= two accounts per person =======================
  // Each browser keeps a random id (a cookie, plus a copy the app sends along). Zuno only keeps a
  // scrambled form of it, and only to count how many accounts were made there.
  data.devicePepper ||= crypto.randomBytes(16).toString('hex');
  const devHash = v => crypto.createHmac('sha256', data.devicePepper).update(String(v)).digest('base64url').slice(0, 22);
  const cookieVal = (req, name) => { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]) : ''; };
  const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
  const devicesOf = req => [cookieVal(req, 'zuno_dv'), String(req.headers['x-zuno-device'] || '')].filter(v => ID_RE.test(v)).map(devHash);
  const accountsOn = devs => Object.values(data.users).filter(u => live(u) && (u.regDevices || []).some(d => devs.includes(d)));

  hooks.beforeRegister.push(async ({ email, req }) => {
    if (hooks.emailTaken(email)) fail(409, 'An account with that email already exists.');
    const devs = devicesOf(req);
    if (devs.length && accountsOn(devs).length >= MAX_ACCOUNTS) {
      fail(403, `This device already has ${MAX_ACCOUNTS} Zuno accounts, and Zuno allows ${MAX_ACCOUNTS === 2 ? 'two accounts' : MAX_ACCOUNTS + ' accounts'} per person. Log in to one of them instead.`);
    }
    // A burst of sign-ups from one network (the /24 or /48, never a full address) in a day.
    const net = networkOf(req);
    if (net && !/^(127\.|::1?$|::ffff:127\.)/.test(net)) z.limit('signup-net:' + net, Number(process.env.ZUNO_SIGNUP_NET_MAX) || 6, DAY, 'A lot of new accounts were made from your network today. Try again tomorrow.');
  });

  hooks.onRegister.push((u, req) => {
    if (!req) return;
    const devs = devicesOf(req);
    if (!cookieVal(req, 'zuno_dv')) {
      const v = crypto.randomBytes(18).toString('base64url');
      const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
      (req.zunoCookies ||= []).push(`zuno_dv=${v}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=${2 * 365 * 86400}`);
      devs.push(devHash(v));
    }
    u.regDevices = [...new Set(devs)];
    // ======================= confirm your email within 14 days =======================
    u.verifyBy = Date.now() + VERIFY_DAYS * DAY;
    setTimeout(() => { Promise.resolve(hooks.sendVerify?.(u, req)).catch(() => {}); }, 1500);
  });

  // Without email set up nobody could confirm, so the 14 days only count once email works.
  const deadline = u => Math.max(u.verifyBy || 0, (data.mailReadySince || Infinity) + VERIFY_DAYS * DAY);
  hooks.meExtras.push(me => (me.verifyBy && !me.emailVerified && hooks.mailReady?.() ? { verifyBy: deadline(me) } : { verifyBy: null }));

  // A server owned by an account that's going away goes to its longest-standing member, or is
  // removed if nobody else is in it.
  function handOver(sv, u) {
    const next = sv.members.find(id => id !== u.id && live(data.users[id]));
    if (next) { sv.ownerId = next; z.audit?.(sv, data.users[next], 'server_update', null, 'became the owner (the old owner\'s account was removed)'); z.refreshServer(sv); return; }
    for (const ch of sv.channels || []) delete data.channelMessages[ch.id];
    for (const f of [sv.icon, sv.banner]) if (f) try { z.removeUpload(f); } catch {}
    delete data.servers[sv.id];
  }
  function sweep() {
    if (!hooks.mailReady?.()) return;
    if (!data.mailReadySince) { data.mailReadySince = Date.now(); save(); }
    const now = Date.now();
    let n = 0;
    for (const u of Object.values(data.users)) {
      if (!live(u) || u.emailVerified || !u.verifyBy || deadline(u) > now || z.isStaff(u)) continue;
      for (const sv of Object.values(data.servers)) if (sv.ownerId === u.id && !sv.official) handOver(sv, u);
      hooks.deleteAccount?.(u);
      u.unverifiedRemoved = true;
      n++;
    }
    if (n) { save(); console.log(`Removed ${n} account${n === 1 ? '' : 's'} that never confirmed an email.`); }
  }
  setTimeout(sweep, 60e3).unref();
  setInterval(sweep, 3600e3).unref();

  // ======================= server tags: a picture =======================
  // Any picture, or any custom emoji (the app sends the emoji's picture), can be the tag's icon.
  route('POST', '/api/servers/:id/tag-icon', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    z.need(sv, me, 'manage_server');
    if (!sv.tag) fail(400, 'Save a tag first.');
    if (!Buffer.isBuffer(body) || !body.length) fail(400, 'Pick a picture.');
    if (body.length > 512e3) fail(400, 'Tag pictures can be up to 512 KB.');
    const k = z.sniff(body);
    if (!k || !['png', 'gif', 'webp', 'jpg'].includes(k.ext)) fail(400, 'Use a PNG, GIF, WebP or JPG picture.');
    if (sv.tag.icon) z.removeUpload(sv.tag.icon);
    const { emoji, emojiId, ...rest } = sv.tag;
    sv.tag = { ...rest, icon: z.storeUpload(body, k.ext) };
    z.audit(sv, me, 'server_update', null, `server tag picture for ${sv.tag.text}`);
    save(); z.refreshServer(sv);
    for (const id of sv.members) { const u = data.users[id]; if (u?.serverTag === sv.id) z.broadcastUser(u); }
    return { tag: sv.tag };
  }, { raw: 600_000 });

  // ======================= giving a server back =======================
  // (0.56.1) Whoever owns a server can hand it straight back to the person who owned it before them
  // (for example after the founder looked after a community for a while). They rejoin if they left.
  const previousOwner = sv => {
    const h = [...(sv.ownerHistory || [])].reverse().find(x => x.to === sv.ownerId && x.from && x.from !== sv.ownerId);
    const u = h && data.users[h.from];
    return live(u) ? u : null;
  };
  hooks.serverSummary.push((sv, me) => {
    if (!me || sv.ownerId !== me.id) return {};
    const p = previousOwner(sv);
    return { previousOwner: p ? { id: p.id, displayName: p.displayName, username: p.username } : null };
  });
  route('POST', '/api/servers/:id/return-ownership', async ({ me, params, token }) => {
    const sv = data.servers[params.id];
    if (!sv || sv.ownerId !== me.id) fail(403, 'Only the owner can give this server back.');
    z.needReauth(token);
    const prev = previousOwner(sv);
    if (!prev) fail(400, "There's no earlier owner to give this server back to.");
    if ((sv.bans || []).some(b => b.userId === prev.id)) fail(400, `${prev.displayName} is banned from this server. Unban them first.`);
    if (!sv.members.includes(prev.id)) { sv.members.push(prev.id); (prev.joinedAt ||= {})[sv.id] = Date.now(); }
    sv.ownerHistory = [...(sv.ownerHistory || []), { from: me.id, to: prev.id, by: me.id, at: Date.now(), returned: true }].slice(-20);
    sv.ownerId = prev.id;
    z.audit(sv, me, 'ownership', { type: 'member', id: prev.id, name: prev.displayName });
    save(); z.refreshServer(sv); z.broadcastUser(me); z.broadcastUser(prev);
    z.systemMessage(prev.id, `👑 **${me.displayName}** gave **${sv.name}** back to you. You're the owner again.`);
    return { ok: true, owner: { id: prev.id, displayName: prev.displayName } };
  });
};
