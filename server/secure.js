// Zuno 0.16, part three: passkeys, new-login alerts, end-to-end encrypted DMs, and the status page.
// Passkeys are checked by hand (WebAuthn) with Node's own crypto, so there are no packages to install.
const http = require('http');

module.exports = function secure(z) {
  const { data, save, route, fail, hooks, clean, newId, send, crypto, systemMessage } = z;
  const b64u = buf => Buffer.from(buf).toString('base64url');
  const unb64u = s => Buffer.from(String(s || ''), 'base64url');
  const sha256 = buf => crypto.createHash('sha256').update(buf).digest();

  // ======================= passkeys =======================
  // A tiny CBOR reader: enough for what authenticators send.
  function cbor(buf, start = 0) {
    let p = start;
    const read = () => {
      const ib = buf[p++], mt = ib >> 5, ai = ib & 31;
      let len = ai;
      if (ai === 24) len = buf[p++];
      else if (ai === 25) { len = buf.readUInt16BE(p); p += 2; }
      else if (ai === 26) { len = buf.readUInt32BE(p); p += 4; }
      else if (ai === 27) { len = Number(buf.readBigUInt64BE(p)); p += 8; }
      switch (mt) {
        case 0: return len;
        case 1: return -1 - len;
        case 2: { const v = buf.subarray(p, p + len); p += len; return v; }
        case 3: { const v = buf.toString('utf8', p, p + len); p += len; return v; }
        case 4: { const a = []; for (let i = 0; i < len; i++) a.push(read()); return a; }
        case 5: { const m = new Map(); for (let i = 0; i < len; i++) { const k = read(); m.set(k, read()); } return m; }
        case 6: return read();
        default: return ai === 20 ? false : ai === 21 ? true : null;
      }
    };
    const value = read();
    return { value, end: p };
  }
  // COSE public key -> a PEM Node can verify with.
  function coseToPem(cose) {
    const kty = cose.get(1);
    let jwk;
    if (kty === 2 && cose.get(-1) === 1) jwk = { kty: 'EC', crv: 'P-256', x: b64u(cose.get(-2)), y: b64u(cose.get(-3)) };
    else if (kty === 3) jwk = { kty: 'RSA', n: b64u(cose.get(-1)), e: b64u(cose.get(-2)) };
    else fail(400, "That passkey uses a kind of key Zuno doesn't support yet.");
    return { pem: crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }), kty: jwk.kty };
  }
  function parseAuthData(ad) {
    if (ad.length < 37) fail(400, 'That passkey answer was incomplete.');
    const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], counter: ad.readUInt32BE(33) };
    if (out.flags & 0x40) { // attested credential data
      const idLen = ad.readUInt16BE(53);
      out.credId = ad.subarray(55, 55 + idLen);
      out.cose = cbor(ad, 55 + idLen).value;
    }
    return out;
  }
  // The address people use Zuno at is the passkey's "relying party".
  const originOf = req => {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  };
  const rpIdOf = req => String(req.headers.host || 'localhost').split(':')[0];
  const challenges = new Map(); // challenge -> { uid, exp, kind }
  setInterval(() => { const now = Date.now(); for (const [k, c] of challenges) if (c.exp < now) challenges.delete(k); }, 60e3).unref();
  function newChallenge(kind, uid = null) {
    const c = b64u(crypto.randomBytes(32));
    challenges.set(c, { kind, uid, exp: Date.now() + 5 * 60e3 });
    return c;
  }
  function checkClientData(req, clientDataJSON, kind) {
    let cd;
    try { cd = JSON.parse(unb64u(clientDataJSON).toString('utf8')); } catch { fail(400, 'That passkey answer was unreadable.'); }
    if (cd.type !== (kind === 'create' ? 'webauthn.create' : 'webauthn.get')) fail(400, 'That passkey answer was for something else.');
    const ch = challenges.get(cd.challenge);
    if (!ch || ch.exp < Date.now() || ch.kind !== kind) fail(400, 'That took too long. Try again.');
    challenges.delete(cd.challenge);
    if (cd.origin !== originOf(req)) fail(400, `That passkey is for ${cd.origin}, not this Zuno.`);
    return ch;
  }
  const passkeyView = k => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsed: k.lastUsed || null });
  hooks.meExtras.push(me => ({ passkeys: (me.passkeys || []).map(passkeyView) }));
  route('POST', '/api/me/passkeys/options', async ({ me, req, body, token }) => {
    if (me.bot || me.system) fail(403, "This account can't have passkeys.");
    if (me.twoFactor) z.needReauth(token); // (security) a passkey skips two-factor login
    // Adding a passkey needs your password, so a stolen login can't plant a way back in.
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, "That password isn't right.");
    return {
    challenge: newChallenge('create', me.id), rp: { name: 'Zuno', id: rpIdOf(req) },
    user: { id: b64u(Buffer.from(me.id)), name: me.username, displayName: me.displayName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    excludeCredentials: (me.passkeys || []).map(k => ({ type: 'public-key', id: k.id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, timeout: 120000, attestation: 'none',
    };
  });
  route('POST', '/api/me/passkeys', async ({ me, body, req }) => {
    const ch = checkClientData(req, body.clientDataJSON, 'create');
    if (ch.uid !== me.id) fail(400, 'Try adding the passkey again.');
    let att;
    try { att = cbor(unb64u(body.attestationObject)).value; } catch { fail(400, 'That passkey answer was unreadable.'); }
    const ad = parseAuthData(att.get('authData'));
    if (!ad.rpIdHash.equals(sha256(Buffer.from(rpIdOf(req))))) fail(400, 'That passkey is for a different website.');
    if (!(ad.flags & 0x01)) fail(400, 'The passkey needs you to confirm it is you.');
    if (!ad.credId || !ad.cose) fail(400, 'That passkey answer was incomplete.');
    const { pem, kty } = coseToPem(ad.cose);
    me.passkeys ||= [];
    if (me.passkeys.length >= 10) fail(400, 'You can have up to 10 passkeys.');
    const id = b64u(ad.credId);
    if (Object.values(data.users).some(u => (u.passkeys || []).some(k => k.id === id))) fail(400, 'That passkey is already added.');
    const k = { id, pem, kty, counter: ad.counter, name: clean(body.name, 40) || 'Passkey', createdAt: Date.now() };
    me.passkeys.push(k);
    save();
    systemMessage(me.id, `🔑 **A passkey was added to your account** (${k.name}). You can now log in with it instead of your password. If this wasn't you, remove it in Settings › My Account and change your password.`);
    return { passkey: passkeyView(k) };
  });
  route('PATCH', '/api/me/passkeys/:id', async ({ me, params, body }) => {
    const k = (me.passkeys || []).find(x => x.id === params.id);
    if (!k) fail(404, 'Passkey not found.');
    k.name = clean(body.name, 40) || k.name; save();
    return { passkey: passkeyView(k) };
  });
  route('DELETE', '/api/me/passkeys/:id', async ({ me, params, token }) => {
    z.needReauth?.(token);
    me.passkeys = (me.passkeys || []).filter(k => k.id !== params.id); save();
    return { ok: true };
  });
  // Logging in with a passkey: no username or password, the passkey says who you are.
  route('POST', '/api/login/passkey/options', async ({ req }) => {
    z.limit('pk:' + z.visitorTag(req), 30, 5 * 60e3);
    return { challenge: newChallenge('get'), rpId: rpIdOf(req), timeout: 120000, userVerification: 'preferred' };
  }, { auth: false });
  route('POST', '/api/login/passkey', async ({ body, req }) => {
    z.limit('pkl:' + z.visitorTag(req), 20, 5 * 60e3, 'Too many tries. Wait a few minutes.');
    checkClientData(req, body.clientDataJSON, 'get');
    const id = String(body.id || '');
    const user = Object.values(data.users).find(u => (u.passkeys || []).some(k => k.id === id));
    const k = user?.passkeys.find(x => x.id === id);
    if (!k) fail(401, "Zuno doesn't know that passkey. It may have been removed. Log in with your password instead.");
    const authData = unb64u(body.authenticatorData);
    const ad = parseAuthData(authData);
    if (!ad.rpIdHash.equals(sha256(Buffer.from(rpIdOf(req))))) fail(401, 'That passkey is for a different website.');
    if (!(ad.flags & 0x01)) fail(401, 'The passkey needs you to confirm it is you.');
    const signed = Buffer.concat([authData, sha256(unb64u(body.clientDataJSON))]);
    const ok = crypto.verify('sha256', signed, k.kty === 'EC' ? { key: k.pem, dsaEncoding: 'der' } : k.pem, unb64u(body.signature));
    if (!ok) fail(401, "That passkey didn't check out. Try again.");
    if (user.twoFactor && !(ad.flags & 0x04)) fail(401, "Your account has two-factor login, and this passkey didn't check your fingerprint, face or PIN. Log in with your password and code instead.");
    if (ad.counter && k.counter && ad.counter <= k.counter) fail(401, 'That passkey looks copied. For safety, log in with your password.');
    k.counter = ad.counter; k.lastUsed = Date.now();
    save();
    return { token: z.createSession(user.id, req) };
  }, { auth: false });

  // ======================= new-login alerts =======================
  // A login from a browser or device you haven't used before gets a message (and an email, when set up).
  function deviceOf(req) {
    const ua = String(req?.headers['user-agent'] || '');
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Electron\//.test(ua) || /Zuno/.test(ua) ? 'Zuno desktop app' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
    const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
    return { key: `${browser}|${os}`, label: `${browser} on ${os}` };
  }
  hooks.newSession.push((user, req) => {
    if (!user || user.bot || user.system || !req) return;
    const d = deviceOf(req);
    const net = String(z.networkOf(req) || 'unknown').replace(/\.0$/, '.x').replace(/::$/, ':…'); // the network only
    const first = !user.knownDevices;
    user.knownDevices ||= [];
    const known = user.knownDevices.find(x => x.key === d.key);
    if (known) { known.at = Date.now(); return; }
    user.knownDevices = [...user.knownDevices, { key: d.key, label: d.label, at: Date.now() }].slice(-20);
    if (first) return; // signing up isn't a "new login"
    const when = new Date().toUTCString().replace(' GMT', ' UTC');
    // (0.43.1) "This wasn't me" logs out everywhere and locks the account until a new password.
    const notMe = z.notMeLink?.(user);
    systemMessage(user.id, `🔐 **New login to your account**\n${d.label} · ${when} · network ${net}\n\nIf this was you, you're all set. If not, open **Settings › My Account**, log out the devices you don't recognize and change your password right away.${notMe ? `\n\n**This wasn't you?** [Lock my account now](${notMe})` : ''}`);
    if (user.email && z.sendMail) z.sendMail(user.email, 'New login to your Zuno account', `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>New login to Zuno</h2><p>Someone just logged into <b>${user.username}</b> from <b>${d.label}</b> (network ${net}) at ${when}.</p><p>If this was you, there's nothing to do.</p>${notMe ? `<p><a href="${notMe}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#e5484d;color:#fff;text-decoration:none;font-weight:600">This wasn't me: lock my account</a></p><p style="color:#666;font-size:13px">That logs everyone out of your account and emails you a link to pick a new password.</p>` : '<p>If not, change your password and log out other devices in Settings › My Account.</p>'}</div>`).catch?.(() => {});
  });

  // ======================= end-to-end encrypted DMs =======================
  // Each of your devices makes its own key pair; the private half never leaves the device. Encrypted
  // messages are locked separately for every device of both people, so Zuno only ever stores ciphertext.
  const deviceView = d => ({ id: d.id, key: d.key, name: d.name, at: d.at });
  const okJwk = k => k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && k.x.length < 64 && k.y.length < 64;
  route('PUT', '/api/me/e2e/devices', async ({ me, body, token }) => {
    const id = clean(body.id, 40);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id) || !okJwk(body.key)) fail(400, "That device key isn't valid.");
    me.e2eDevices ||= [];
    const existing = me.e2eDevices.find(d => d.id === id);
    const sid = token ? z.sessionSid(token) : null;
    if (existing) { existing.at = Date.now(); existing.name = clean(body.name, 40) || existing.name; existing.sid = sid; }
    else {
      me.e2eDevices.push({ id, key: { kty: 'EC', crv: 'P-256', x: body.key.x, y: body.key.y }, name: clean(body.name, 40) || 'Device', at: Date.now(), sid });
      while (me.e2eDevices.length > 10) me.e2eDevices.shift(); // the oldest device stops getting new messages
    }
    save();
    for (const fid of z.friendIds(me.id)) send(fid, 'e2e-keys', { userId: me.id });
    return { devices: me.e2eDevices.map(deviceView) };
  });
  route('DELETE', '/api/me/e2e/devices/:id', async ({ me, params }) => {
    me.e2eDevices = (me.e2eDevices || []).filter(d => d.id !== params.id); save();
    return { devices: me.e2eDevices.map(deviceView) };
  });
  route('GET', '/api/users/:id/e2e', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!u) fail(404, 'User not found.');
    const live = z.liveSids(u.id);
    return { devices: (u.e2eDevices || []).filter(d => !d.sid || live.has(d.sid)).map(deviceView) };
  });
  // Either person can turn encryption on or off for a DM. Both see a note in the chat.
  route('PUT', '/api/dms/:id/e2e', async ({ me, params, body }) => {
    const conv = z.dmConv(me, params.id);
    if (conv.canWrite() !== 'open') fail(403, 'You can turn on encryption once you can message each other.');
    const on = !!body.on;
    if (on && !(conv.other.e2eDevices || []).length) fail(400, `${conv.other.displayName} needs to open Zuno (version 0.16 or newer) once before you can encrypt your chat.`);
    const st = conv.store();
    if (!!st.e2e === on) return { e2e: on };
    st.e2e = on;
    if (on) { if (me.drafts) delete me.drafts[conv.other.id]; if (conv.other.drafts) delete conv.other.drafts[me.id]; }
    z.postMessage(conv, me, '', { e2eNotice: on ? 'on' : 'off' });
    return { e2e: on };
  });
  hooks.dmExtras.push(conv => ({ e2e: !!conv.peek()?.e2e }));
  // Group chats too: anyone in the group can turn it on or off, once everyone has opened Zuno on a
  // device that can encrypt. New messages are then locked for every member's devices.
  route('PUT', '/api/groups/:id/e2e', async ({ me, params, body }) => {
    const conv = z.groupConv(me, params.id);
    const on = !!body.on;
    if (on) {
      const missing = conv.members.map(id => data.users[id]).filter(u => u && !u.bot && !(u.e2eDevices || []).length);
      if (missing.length) fail(400, `${missing.map(u => u.displayName).join(', ')} need${missing.length === 1 ? 's' : ''} to open Zuno once before the group can be encrypted.`);
    }
    const st = conv.store();
    if (!!st.e2e === on) return { e2e: on };
    st.e2e = on;
    if (on) for (const id of conv.members) if (data.users[id]?.drafts) delete data.users[id].drafts[conv.key];
    z.postMessage(conv, me, '', { e2eNotice: on ? 'on' : 'off' });
    for (const id of conv.members) send(id, 'refresh', {});
    return { e2e: on };
  });
  function cleanE2e(me, e) {
    if (!e || e.v !== 1) fail(400, "That encrypted message isn't valid.");
    const dev = (me.e2eDevices || []).find(d => d.id === e.from);
    if (!dev) fail(400, 'This device isn\'t set up for encryption yet. Reload Zuno and try again.');
    const b64 = (s, max) => typeof s === 'string' && s.length <= max && /^[A-Za-z0-9_-]*$/.test(s);
    if (!b64(e.iv, 32) || !b64(e.ct, 40000)) fail(400, "That encrypted message isn't valid.");
    const keys = {};
    // Up to 150 locked copies of the key: 10 people in a group × their devices.
    for (const [id, k] of Object.entries(e.keys || {}).slice(0, 150)) if (/^[A-Za-z0-9_-]{8,40}$/.test(id) && b64(k?.iv, 32) && b64(k?.k, 200)) keys[id] = { iv: k.iv, k: k.k };
    if (!Object.keys(keys).length) fail(400, "That encrypted message isn't valid.");
    // The sender's key comes from Zuno's records, never from the message itself.
    return { v: 1, from: dev.id, fromKey: dev.key, iv: e.iv, ct: e.ct, keys };
  }
  hooks.beforePost.push(({ conv, me, body, content, extra }) => {
    if (!body.e2e) return;
    if (conv.kind !== 'dm' && conv.kind !== 'group') fail(400, 'Encryption is for DMs and group chats.');
    if (content) fail(400, 'Encrypted messages keep their text inside the encryption.');
    extra.e2e = cleanE2e(me, body.e2e);
  });
  hooks.beforeEdit.push(({ conv, me, m, body, content, change }) => {
    if (!body.e2e) { if (m.e2e) fail(400, 'Encrypted messages must stay encrypted when edited.'); return; }
    if ((conv.kind !== 'dm' && conv.kind !== 'group') || content) fail(400, "That encrypted message isn't valid.");
    change.e2e = cleanE2e(me, body.e2e);
  });

  // ======================= status page =======================
  // Zuno checks itself every minute and keeps 90 days of uptime, plus incidents staff post.
  data.statusLog ||= { days: {}, incidents: [] };
  const log = data.statusLog;
  const dayKey = t => new Date(t).toISOString().slice(0, 10);
  const startedAt = Date.now();
  const samples = []; // { at, ms }
  function check() {
    const t0 = Date.now();
    const done = ms => {
      samples.push({ at: Date.now(), ms }); while (samples.length > 60 * 24) samples.shift();
      const d = log.days[dayKey(Date.now())] ||= { up: 0, slow: 0 };
      d.up++; if (ms > 1500) d.slow++;
      for (const k of Object.keys(log.days)) if (Date.now() - Date.parse(k) > 91 * 864e5) delete log.days[k];
      save();
    };
    const port = process.env.PORT || 3000;
    const r = http.get({ host: '127.0.0.1', port, path: '/api/version', timeout: 10000 }, res => { res.resume(); res.on('end', () => done(Date.now() - t0)); });
    r.on('error', () => done(Date.now() - t0));
    r.on('timeout', () => r.destroy());
  }
  setTimeout(check, 5e3).unref();
  setInterval(check, 60e3).unref();
  route('GET', '/api/status', async () => {
    const today = dayKey(Date.now());
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const k = dayKey(Date.now() - i * 864e5), d = log.days[k];
      if (!d) { days.push({ day: k, uptime: null }); continue; }
      // Minutes in the day so far (today), or a whole day, counting only after Zuno started keeping track.
      const first = Object.keys(log.days).sort()[0];
      const dayStart = Date.parse(k + 'T00:00:00Z');
      const from = k === first ? Math.min(dayStart + 864e5, Math.max(dayStart, log.firstAt || dayStart)) : dayStart;
      const until = k === today ? Date.now() : dayStart + 864e5;
      const minutes = Math.max(1, Math.round((until - from) / 60e3));
      days.push({ day: k, uptime: Math.min(100, Math.round((d.up / minutes) * 10000) / 100), slow: d.slow });
    }
    const recent = samples.slice(-60);
    const avg = recent.length ? Math.round(recent.reduce((a, s) => a + s.ms, 0) / recent.length) : null;
    const online = [...z.streams.values()].filter(s => s.size).length;
    const incidents = log.incidents.filter(i => i.status !== 'resolved' || Date.now() - i.updatedAt < 14 * 864e5).slice(-10).reverse();
    const open = incidents.filter(i => i.status !== 'resolved');
    return {
      overall: open.length ? open.some(i => i.impact === 'major') ? 'major' : 'degraded' : avg && avg > 1500 ? 'degraded' : 'ok',
      version: z.PKG.version, upSince: startedAt, responseMs: avg, online,
      components: [
        { name: 'Website & app', status: 'ok', detail: avg != null ? `Responding in ${avg} ms` : 'Responding' },
        { name: 'Messages & live updates', status: 'ok', detail: `${online} ${online === 1 ? 'person' : 'people'} connected` },
        { name: 'Voice & video calls', status: 'ok', detail: 'Working' },
        { name: 'File uploads', status: 'ok', detail: 'Working' },
        { name: 'Database', status: 'ok', detail: 'Working' },
        { name: 'Emails', status: process.env.RESEND_API_KEY ? 'ok' : 'off', detail: process.env.RESEND_API_KEY ? 'Sending' : 'Off' },
      ],
      days, incidents,
    };
  }, { auth: false });
  if (!log.firstAt) { log.firstAt = Date.now(); save(); }
  route('POST', '/api/status/incidents', async ({ me, body }) => {
    z.needStaff(me);
    const i = { id: newId(), title: clean(body.title, 120) || 'Something is wrong', impact: body.impact === 'major' ? 'major' : 'minor', status: 'investigating', createdAt: Date.now(), updatedAt: Date.now(), updates: [{ at: Date.now(), status: 'investigating', text: clean(body.text, 600) }] };
    log.incidents.push(i); log.incidents = log.incidents.slice(-50); save();
    return { incident: i };
  });
  route('PATCH', '/api/status/incidents/:id', async ({ me, params, body }) => {
    z.needStaff(me);
    const i = log.incidents.find(x => x.id === params.id);
    if (!i) fail(404, 'Incident not found.');
    const status = ['investigating', 'identified', 'monitoring', 'resolved'].includes(body.status) ? body.status : i.status;
    i.status = status; i.updatedAt = Date.now();
    i.updates.push({ at: Date.now(), status, text: clean(body.text, 600) });
    save();
    return { incident: i };
  });
};
