// Zuno 0.14: accounts & sessions, password resets, pins, search, polls, forwarding, nicknames,
// timeouts, mutes, notes, profile decorations & effects, role icons, server themes & templates,
// the rules in Zuno Official, and the ready-made Zuno bots.
// index.js hands everything this file needs over in `z`.
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

module.exports = function features(z) {
  const { data, save, route, fail, hooks, clean, newId, send, emit, publicUser, postMessage, systemMessage } = z;
  const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
  const users = () => Object.values(data.users);
  data.meta ||= {};

  // ======================= new permissions =======================
  Object.assign(z.PERM_INFO, {
    change_nickname: { label: 'Change Nickname', group: 'Members' },
    manage_nicknames: { label: 'Manage Nicknames', group: 'Members' },
    moderate_members: { label: 'Time Out Members', group: 'Members' },
  });
  for (const k of ['change_nickname', 'manage_nicknames', 'moderate_members']) if (!z.PERM_KEYS.includes(k)) z.PERM_KEYS.push(k);
  if (!z.DEFAULT_EVERYONE.includes('change_nickname')) z.DEFAULT_EVERYONE.push('change_nickname');
  // Existing servers: everyone can change their own nickname, like a new server.
  for (const sv of Object.values(data.servers)) {
    if (sv.permsV14) continue;
    z.ensureRoles(sv);
    const everyone = sv.roles[sv.roles.length - 1];
    if (everyone && !everyone.perms.includes('change_nickname')) everyone.perms.push('change_nickname');
    for (const r of sv.roles) if (r.perms.includes('kick_members') && !r.perms.includes('moderate_members')) r.perms.push('moderate_members');
    sv.permsV14 = true;
  }

  // ======================= email (optional) =======================
  // Set RESEND_API_KEY on the server (resend.com, free tier) to send password resets and email checks.
  // Emails go through Brevo (BREVO_API_KEY: sends from any email address you've verified there, no
  // domain needed) or Resend (RESEND_API_KEY: needs your own domain to email anyone but yourself).
  const BREVO_KEY = () => process.env.BREVO_API_KEY || '';
  const MAIL_KEY = () => BREVO_KEY() || process.env.RESEND_API_KEY || '';
  const MAIL_FROM = () => process.env.ZUNO_MAIL_FROM || 'Zuno <onboarding@resend.dev>';
  const resendTestSender = () => !BREVO_KEY() && /@resend\.dev>?\s*$/i.test(MAIL_FROM());
  let lastMailError = null; // shown on Setup Status, so a broken setup is easy to spot
  const siteUrl = req => z.PUBLIC_URL || `http://${req?.headers.host || 'localhost:3000'}`;
  function sendMail(to, subject, html) {
    if (!MAIL_KEY()) return Promise.resolve(false);
    const from = MAIL_FROM();
    const m = /^\s*(?:"?([^"<]*?)"?\s*<)?([^<>\s]+@[^<>\s]+)>?\s*$/.exec(from) || [];
    const brevo = !!BREVO_KEY();
    if (brevo && (!m[2] || /@resend\.dev$/i.test(m[2]))) { lastMailError = { at: Date.now(), message: 'Set ZUNO_MAIL_FROM to the sender email you verified in Brevo.' }; return Promise.resolve(false); }
    const body = JSON.stringify(brevo
      ? { sender: { name: (m[1] || 'Zuno').trim() || 'Zuno', email: m[2] }, to: [{ email: to }], subject, htmlContent: html }
      : { from, to: [to], subject, html });
    const opts = brevo
      ? { host: 'api.brevo.com', path: '/v3/smtp/email', headers: { 'api-key': BREVO_KEY(), accept: 'application/json' } }
      : { host: 'api.resend.com', path: '/emails', headers: { Authorization: `Bearer ${MAIL_KEY()}` } };
    return new Promise(resolve => {
      const r = https.request({ host: opts.host, path: opts.path, method: 'POST', timeout: 10000,
        headers: { ...opts.headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let out = '';
        res.on('data', d => { out += d; });
        res.on('end', () => {
          if (res.statusCode < 400) { lastMailError = null; return resolve(true); }
          let msg = '';
          try { const j = JSON.parse(out); msg = j.message || j.error || ''; } catch {}
          console.error(`Email to ${to.replace(/^(.).*@/, '$1***@')} failed (${res.statusCode}): ${msg}`);
          lastMailError = { at: Date.now(), status: res.statusCode, message: msg || `HTTP ${res.statusCode}` };
          resolve(false);
        });
      });
      r.on('timeout', () => r.destroy());
      r.on('error', err => { console.error('Email failed:', err.message); lastMailError = { at: Date.now(), message: err.message }; resolve(false); });
      r.end(body);
    });
  }
  // What to tell someone when their email couldn't be sent.
  const mailFailText = () => (resendTestSender() || /own email|verify a domain|testing emails/i.test(lastMailError?.message || '')
    ? "Zuno couldn't send that email: this Zuno's email service can only send to its owner for now. Zuno Staff can fix it in Settings › Setup Status."
    : "Zuno couldn't send that email right now. Try again in a few minutes.");
  const mailHtml = (title, text, link, button) => `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#121918;color:#dce8e5;border-radius:12px">
    <h2 style="color:#cffbf5;margin-top:0">${title}</h2><p>${text}</p>
    <p><a href="${link}" style="display:inline-block;background:#04c5ae;color:#022620;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${button}</a></p>
    <p style="color:#8ea6a1;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`;

  // ======================= accounts & sessions =======================
  data.resets ||= {};   // sha(token) -> { uid, exp }
  data.verifies ||= {}; // sha(token) -> { uid, email, exp }
  const prune = obj => { for (const [k, v] of Object.entries(obj)) if (v.exp < Date.now()) delete obj[k]; };

  // (security) With two-factor login on, big account changes also need a fresh "Confirm it's you"
  // (password + code), so a stolen login plus a known password can't take the account.
  const strong = (me, token) => { if (me.twoFactor) z.needReauth(token); };
  route('POST', '/api/me/password', async ({ me, body, token, req, res }) => {
    if (me.bot || me.system) fail(403, "This account doesn't have a password.");
    strong(me, token);
    if (!await z.checkPassword(String(body.current || ''), me.passwordHash)) fail(400, 'Your current password is wrong.');
    const next = String(body.next || '');
    if (next.length < z.MIN_PASSWORD) fail(400, `Passwords need at least ${z.MIN_PASSWORD} characters.`);
    me.passwordHash = await z.hashPassword(next);
    // (0.43.1) Everyone is logged out, this device too: it gets a brand-new login right away, so
    // nothing that copied the old one keeps working.
    z.endSessions(me.id);
    const fresh = z.createSession(me.id, req);
    if (z.sessionCookie) res.setHeader('Set-Cookie', z.sessionCookie(fresh, req));
    return { ok: true, rotatedToken: fresh };
  });
  route('POST', '/api/me/email', async ({ me, body, token }) => {
    if (me.bot || me.system) fail(403, "This account doesn't have an email.");
    strong(me, token);
    z.limit('email-change:' + me.id, 5, 864e5, "You've changed your email a lot today. Try again tomorrow.");
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, 'Your password is wrong.');
    const email = clean(body.email, 254).toLowerCase();
    if (!z.EMAIL_RE.test(email)) fail(400, 'Please enter a valid email address.');
    if (users().some(u => u.email === email && u.id !== me.id)) fail(409, 'Another account already uses that email.');
    const oldEmail = me.email;
    me.email = email; me.emailVerified = false;
    save();
    // Tell the old address, so a takeover can't happen quietly.
    if (oldEmail && oldEmail !== email) sendMail(oldEmail, 'Your Zuno email was changed', mailHtml('Your email was changed', `The email on your Zuno account <b>${me.username}</b> was just changed. If this was you, there's nothing to do. If it wasn't, reset your password right away and tell Zuno Staff.`, `${siteUrl()}/`, 'Open Zuno')).catch(() => {});
    systemMessage(me.id, '📧 **Your account email was changed.** If this wasn\'t you, change your password right away and tell Zuno Staff.');
    send(me.id, 'me', z.privateMe(me));
    return { me: z.privateMe(me) };
  });
  const sessionId = t => String(t).slice(0, 16); // sessions are stored by their token's fingerprint
  route('GET', '/api/me/sessions', async ({ me, token }) => ({
    sessions: Object.entries(data.sessions).filter(([, s]) => (typeof s === 'string' ? s : s.uid) === me.id)
      .filter(([, s]) => !s.dieAt)
      .map(([t, s]) => ({ id: sessionId(t), current: t === token, createdAt: s.createdAt || null, lastSeen: s.lastSeen || null, agent: s.agent || '', ip: s.ip ? String(s.ip).replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/^([0-9a-f]+:[0-9a-f]+):.*$/i, '$1:…') : null }))
      .sort((a, b) => b.current - a.current || (b.lastSeen || 0) - (a.lastSeen || 0)),
  }));
  route('DELETE', '/api/me/sessions/:id', async ({ me, params, token }) => {
    const t = Object.keys(data.sessions).find(k => sessionId(k) === params.id && (data.sessions[k].uid || data.sessions[k]) === me.id);
    if (!t) fail(404, 'That session already ended.');
    if (t === token) fail(400, 'Use Log Out to end this session.');
    delete data.sessions[t];
    for (const res of z.streams.get(me.id) || []) if (res.zunoToken === t) res.end();
    z.pruneDevices(me.id);
    save();
    return { ok: true };
  });
  route('POST', '/api/me/sessions/logout-others', async ({ me, token }) => { z.endSessions(me.id, token); return { ok: true }; });

  // Forgot password: emails a link when email is set up. Otherwise staff can make a link for you.
  route('POST', '/api/password/forgot', async ({ body, req }) => {
    z.limit('forgot:' + z.clientIp(req), 5, 15 * 60e3, 'Too many reset requests. Try again in a few minutes.');
    if (!MAIL_KEY()) return { ok: true, email: false, message: "Password reset emails aren't set up on this Zuno yet. Ask Zuno Staff in Zuno Official, or email the team, for a reset link." };
    const login = clean(body.login, 254).toLowerCase();
    const u = users().find(x => !x.bot && !x.system && (login.includes('@') ? x.email === login : x.username === login));
    // At most 3 emails an hour per account, so nobody can flood someone's inbox with reset links.
    let quiet = false;
    if (u?.email) try { z.limit('forgot-acct:' + u.id, 3, 3600e3); } catch { quiet = true; }
    if (u?.email && !quiet) {
      prune(data.resets);
      const token = crypto.randomBytes(24).toString('base64url');
      data.resets[sha(token)] = { uid: u.id, exp: Date.now() + 3600e3 };
      save();
      const link = `${siteUrl(req)}/reset?token=${token}`;
      sendMail(u.email, 'Reset your Zuno password', mailHtml('Reset your password', `Hi ${u.displayName}! Click below to pick a new password for <b>${u.username}</b>. The link works for 1 hour.`, link, 'Pick a new password'));
    }
    return { ok: true, email: true, message: "If that account has an email, a reset link is on its way. Check your inbox (and spam)." };
  }, { auth: false });
  route('POST', '/api/password/reset', async ({ body, req }) => {
    z.limit('reset:' + z.clientIp(req), 10, 15 * 60e3);
    prune(data.resets);
    const r = data.resets[sha(body.token)];
    if (!r || !data.users[r.uid]) fail(400, 'This reset link has expired or was already used. Ask for a new one.');
    const pw = String(body.password || '');
    if (pw.length < z.MIN_PASSWORD) fail(400, `Passwords need at least ${z.MIN_PASSWORD} characters.`);
    const u = data.users[r.uid];
    delete data.resets[sha(body.token)];
    u.passwordHash = await z.hashPassword(pw);
    delete u.locked; // (0.43.1) "This wasn't me" locked it until a new password
    u.passkeys = []; // a passkey someone else added can't outlive a reset
    z.endSessions(u.id);
    systemMessage(u.id, '🔑 **Your password was changed** with a reset link (your passkeys were removed; add them again in Settings › My Account). If this wasn\'t you, tell Zuno Staff right away.');
    // With two-factor login on, a reset link alone isn't enough to get in: log in with the code too.
    if (u.twoFactor) return { mfa: true, username: u.username };
    return { token: z.createSession(u.id, req), username: u.username };
  }, { auth: false });
  // Staff: a one-hour reset link to hand to someone who's locked out.
  route('POST', '/api/mod/users/:id/reset-link', async ({ me, params, req, token: sessionKey }) => {
    z.needStaff(me);
    z.needReauth(sessionKey);
    const u = data.users[params.id];
    z.staffGuard(me, u);
    if (!u || u.bot || u.system) fail(404, 'User not found.');
    prune(data.resets);
    const token = crypto.randomBytes(24).toString('base64url');
    data.resets[sha(token)] = { uid: u.id, exp: Date.now() + 3600e3, by: me.id };
    save();
    return { url: `${siteUrl(req)}/reset?token=${token}` };
  });

  // Email check: proves the email belongs to them (needs email set up).
  route('POST', '/api/me/verify-email', async ({ me, req }) => {
    if (!me.email) fail(400, 'Add an email first.');
    if (me.emailVerified) return { ok: true, already: true };
    if (!MAIL_KEY()) fail(503, "Email checks aren't set up on this Zuno yet.");
    z.limit('verify:' + me.id, 3, 60 * 60e3, "You've asked for a few emails already. Check your inbox (and spam).");
    prune(data.verifies);
    const token = crypto.randomBytes(24).toString('base64url');
    data.verifies[sha(token)] = { uid: me.id, email: me.email, exp: Date.now() + 24 * 3600e3 };
    save();
    const sent = await sendMail(me.email, 'Check your email for Zuno', mailHtml('Is this you?', `Click below to confirm <b>${me.email}</b> for your Zuno account <b>${me.username}</b>.`, `${siteUrl(req)}/verify?token=${token}`, 'Confirm my email'));
    if (!sent) { delete data.verifies[sha(token)]; save(); fail(502, mailFailText()); }
    return { ok: true };
  });
  route('POST', '/api/verify-email', async ({ body }) => {
    prune(data.verifies);
    const v = data.verifies[sha(body.token)];
    const u = v && data.users[v.uid];
    if (!u || u.email !== v.email) fail(400, 'This link has expired. Send a new one from Settings › My Account.');
    u.emailVerified = true;
    delete data.verifies[sha(body.token)];
    save();
    send(u.id, 'extras', {});
    return { ok: true, email: u.email };
  }, { auth: false });

  // Private bits only you see: mutes, notes, whether your email is checked.
  route('GET', '/api/me/extras', async ({ me }) => ({ mutes: me.mutes || {}, notes: me.notes || {}, emailVerified: !!me.emailVerified, emailReady: !!MAIL_KEY(), twoFactor: !!me.twoFactor, confirmCode: !!me.twoFactor && !z.isFounder(me.id), ringtone: me.ringtone || null, backupLeft: me.twoFactor?.backup?.length ?? null, birthday: me.birthday || null }));
  route('PUT', '/api/me/mutes', async ({ me, body }) => {
    const key = String(body.key || '');
    if (!/^(sv:|ch:)[A-Za-z0-9_-]{4,40}$/.test(key)) fail(400, 'Unknown thing to mute.');
    me.mutes ||= {};
    if (body.muted) me.mutes[key] = true; else delete me.mutes[key];
    save();
    return { mutes: me.mutes };
  });
  route('PUT', '/api/users/:id/note', async ({ me, params, body }) => {
    if (!data.users[params.id]) fail(404, 'User not found.');
    me.notes ||= {};
    const note = clean(body.note, 256);
    if (note) me.notes[params.id] = note; else delete me.notes[params.id];
    save();
    return { note };
  });

  // ======================= calls: TURN relays =======================
  // Free STUN works on most home Wi-Fi. School, work and phone networks often need a TURN relay:
  // set ZUNO_TURN_URLS (comma-separated), ZUNO_TURN_USERNAME and ZUNO_TURN_CREDENTIAL on the server.
  // (0.45.2) Relays that hand out fresh logins can be used too, so passwords never go stale:
  //  - Metered: ZUNO_TURN_API = the "TURN credentials" link from the Metered dashboard
  //    (https://<app>.metered.live/api/v1/turn/credentials?apiKey=...)
  //  - Cloudflare Calls TURN: ZUNO_CF_TURN_KEY_ID + ZUNO_CF_TURN_TOKEN
  const turnCache = { at: 0, list: [] };
  async function freshTurn() {
    if (Date.now() - turnCache.at < 30 * 60e3) return turnCache.list;
    let list = [];
    try {
      if (process.env.ZUNO_TURN_API) {
        const r = await fetch(process.env.ZUNO_TURN_API, { signal: AbortSignal.timeout(5000) });
        const j = await r.json();
        if (Array.isArray(j)) list = j.filter(x => x && x.urls);
      } else if (process.env.ZUNO_CF_TURN_KEY_ID && process.env.ZUNO_CF_TURN_TOKEN) {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(process.env.ZUNO_CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
          method: 'POST', signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${process.env.ZUNO_CF_TURN_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }),
        });
        const j = await r.json();
        list = (j.iceServers ? [].concat(j.iceServers) : []).filter(x => x && x.urls && x.username);
      }
    } catch (err) { console.warn('TURN credentials failed:', err.message); return turnCache.list; }
    if (list.length) { turnCache.at = Date.now(); turnCache.list = list; }
    return list;
  }
  route('GET', '/api/rtc/config', async () => {
    const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
    const turn = (process.env.ZUNO_TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (turn.length) ice.push({ urls: turn, username: process.env.ZUNO_TURN_USERNAME || '', credential: process.env.ZUNO_TURN_CREDENTIAL || '' });
    const fresh = await freshTurn();
    ice.push(...fresh);
    return { iceServers: ice, relay: turn.length > 0 || fresh.length > 0 };
  });

  // ======================= setup status (staff) =======================
  const dirSize = dir => { let n = 0; try { for (const f of fs.readdirSync(dir)) { try { n += fs.statSync(`${dir}/${f}`).size; } catch {} } } catch {} return n; };
  route('GET', '/api/admin/status', async ({ me }) => {
    z.needStaff(me);
    const key = process.env.STRIPE_SECRET_KEY || '';
    let dbSize = 0; try { dbSize = fs.statSync(require('./db').dbFile).size; } catch {}
    const DATA_DIR = require('./db').DATA_DIR;
    let backups = []; try { backups = fs.readdirSync(`${DATA_DIR}/backups`).sort(); } catch {}
    return {
      version: z.PKG.version, users: users().filter(u => !u.bot && !u.system).length, servers: Object.keys(data.servers).length,
      online: users().filter(u => z.isOnline(u.id)).length,
      checks: [
        { key: 'engine', ok: require('./db').MODE === 'sqlite', label: 'SQLite database', fix: 'Zuno is saving to db.json because this Node version has no built-in SQLite. Set NODE_VERSION to 22 (or newer) in the Render dashboard.' },
        { key: 'cloud', ok: require('./storage').enabled(), label: 'Cloud storage for uploads', fix: 'Uploads are on the server disk (1 GB on Render). Make a Cloudflare R2 bucket (free up to 10 GB), create an API token, then set S3_ENDPOINT (https://<account id>.r2.cloudflarestorage.com), S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY. Optional: S3_PUBLIC_URL if the bucket has a public address. Existing files move over by themselves.' },
        { key: 'storage', ok: !!process.env.ZUNO_DATA_DIR, label: 'Saved on a disk', fix: 'Set ZUNO_DATA_DIR to a mounted disk (render.yaml does this). Without it, accounts vanish when the server restarts.' },
        { key: 'url', ok: /^https:\/\//.test(z.PUBLIC_URL), label: 'Public address', fix: 'Set "zunoServer" in package.json (or ZUNO_PUBLIC_URL) to your https:// address. Used for links in emails and payments.' },
        { key: 'gifs', ok: !!(process.env.KLIPY_KEY || process.env.KLIP_KEY), label: 'GIF search', fix: 'Get a free key at klipy.com/developers and set KLIPY_KEY in the Render dashboard.' },
        { key: 'email', ok: !!MAIL_KEY() && !resendTestSender() && !lastMailError, label: 'Emails (password resets, email checks)',
          fix: !MAIL_KEY() ? 'Easiest: make a free account at brevo.com, add your email as a sender (Senders & IP › Senders), create an API key (SMTP & API › API Keys), then set BREVO_API_KEY and ZUNO_MAIL_FROM (like "Zuno <you@gmail.com>"). Or use Resend with your own domain.'
            : resendTestSender() ? "Resend's test sender (onboarding@resend.dev) only delivers to the email on your Resend account, so other people never get their emails. Fix: use Brevo instead (free, no domain needed): set BREVO_API_KEY and ZUNO_MAIL_FROM to a sender email you verified in Brevo. Or verify your own domain in Resend and set ZUNO_MAIL_FROM to an address on it."
            : `The last email failed: ${lastMailError?.message || 'unknown error'}. Check the key and ZUNO_MAIL_FROM (the sender must be verified with your email service).` },
        { key: 'turn', ok: !!(process.env.ZUNO_TURN_URLS || process.env.ZUNO_TURN_API || process.env.ZUNO_CF_TURN_KEY_ID), label: 'Call relay (TURN)', fix: 'Calls on strict networks need a TURN relay (without one, Zuno falls back to sending voice through itself, with no video). Easiest: Cloudflare dashboard › Realtime › TURN Server › Create, then set ZUNO_CF_TURN_KEY_ID and ZUNO_CF_TURN_TOKEN (free up to 1 TB a month). Or a Metered credentials link in ZUNO_TURN_API.' },
        { key: 'turnstile', ok: !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY), label: 'Sign-up bot check (Turnstile)', fix: 'Make a free Turnstile widget in the Cloudflare dashboard for your site, then set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY. Step by step: docs/TURNSTILE_SETUP.md.' },
        { key: 'spotify', ok: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET), label: 'Spotify connections', fix: 'Make an app at developer.spotify.com, add the redirect URL <your address>/api/connections/spotify/callback, then set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. (The desktop app shows Spotify songs even without this.)' },
        { key: 'lastfm', ok: !!process.env.LASTFM_API_KEY, label: 'Last.fm (songs without Spotify\'s limits)', fix: 'Get a free API key at last.fm/api/account/create (any app name; leave the callback empty) and set LASTFM_API_KEY in the Render dashboard.' },
        { key: 'downloads', ok: !!(process.env.ZUNO_GITHUB_TOKEN || process.env.GITHUB_TOKEN), label: 'PC app downloads and updates', fix: 'The GitHub repository is private, so heyzuno.uk/download hands out the installer for it. Make a fine-grained GitHub token (github.com/settings/personal-access-tokens) for just this repository with Contents: Read-only, then set ZUNO_GITHUB_TOKEN to it in the Render dashboard.' },
        { key: 'bloom', ok: /^(sk|rk)_(test|live)_/.test(key.trim()), label: 'Bloom payments', fix: 'Paste your Stripe secret key as STRIPE_SECRET_KEY. Zuno sets up its own webhook.' },
      ],
      dbSize, uploadsSize: dirSize(`${DATA_DIR}/uploads`), backups, publicUrl: z.PUBLIC_URL || null,
    };
  });

  // ======================= profile decorations, effects & status expiry =======================
  const DECORATIONS = ['sprout', 'halo', 'cat', 'crown', 'flames', 'rainbow', 'bubbles', 'headphones', 'flowers', 'horns', 'neon', 'stars', 'bunny', 'leaves', 'hearts', 'glitch', 'collar'];
  const EFFECTS = ['sparkles', 'snow', 'hearts', 'bubbles', 'fireflies', 'confetti', 'petals', 'stars', 'rain', 'embers', 'aurora', 'leaves', 'music', 'pixels'];
  hooks.patchMe.push((me, body) => {
    // Limited (seasonal) ones are checked by hangout.js through hooks.canUseFlair.
    if ('decoration' in body) { if (body.decoration && !DECORATIONS.includes(body.decoration) && !hooks.canUseFlair?.(me, body.decoration)) fail(400, 'Unknown decoration.'); me.decoration = body.decoration || null; }
    if ('profileEffect' in body) { if (body.profileEffect && !EFFECTS.includes(body.profileEffect) && !hooks.canUseFlair?.(me, body.profileEffect)) fail(400, 'Unknown profile effect.'); me.profileEffect = body.profileEffect || null; }
    if ('customStatusUntil' in body) { const t = Number(body.customStatusUntil) || 0; me.customStatusUntil = t > Date.now() ? Math.min(t, Date.now() + 30 * 864e5) : null; }
    if ('customStatusEmoji' in body) me.customStatusEmoji = clean(body.customStatusEmoji, 16) || null;
  });
  hooks.publicUser.push(u => {
    const expired = u.customStatusUntil && u.customStatusUntil < Date.now();
    return {
      decoration: u.decoration || null, profileEffect: u.profileEffect || null,
      customStatus: expired ? '' : u.customStatus, customStatusEmoji: expired ? null : u.customStatusEmoji || null,
      customStatusUntil: expired ? null : u.customStatusUntil || null,
    };
  });

  // ======================= role icons (pictures) =======================
  route('POST', '/api/servers/:id/roles/:roleId/icon', async ({ me, params, body }) => {
    const sv = z.getManagedServer(me, params.id, 'manage_roles');
    const role = z.roleById(sv, params.roleId);
    if (!role || role.everyone) fail(404, 'Role not found.');
    if (!z.canEditRole(sv, me.id, role)) fail(403, 'You can only edit roles below your highest role.');
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Role icons must be PNG, JPG, WebP or GIF images.');
    z.removeUpload(role.iconUrl);
    role.iconUrl = z.storeUpload(body, k.ext);
    z.audit(sv, me, 'role_update', { type: 'role', id: role.id, name: role.name }, 'icon picture');
    save(); z.refreshServer(sv);
    return { role };
  }, { raw: 1_000_000 });
  route('DELETE', '/api/servers/:id/roles/:roleId/icon', async ({ me, params }) => {
    const sv = z.getManagedServer(me, params.id, 'manage_roles');
    const role = z.roleById(sv, params.roleId);
    if (!role || !z.canEditRole(sv, me.id, role)) fail(404, 'Role not found.');
    z.removeUpload(role.iconUrl); role.iconUrl = null;
    save(); z.refreshServer(sv);
    return { role };
  });

  // ======================= server themes, nicknames, timeouts =======================
  const THEMES = ['lagoon', 'midnight', 'sunset', 'forest', 'sakura', 'ember', 'ocean', 'galaxy', 'mono', 'candy', 'dusk', 'matcha'];
  hooks.patchServer.push((sv, me, body) => {
    if ('theme' in body) { if (body.theme && !THEMES.includes(body.theme)) fail(400, 'Unknown theme.'); sv.theme = body.theme || null; }
  });
  const ZBOTS_KEYS = { guardian: 1, greeter: 1, party: 1, levels: 1, reminders: 1, polls: 1, starboard: 1 };
  const timedOut = (sv, uid) => (sv.timeouts?.[uid] || 0) > Date.now();
  hooks.serverSummary.push(sv => ({
    theme: sv.theme || null, nicks: sv.nicks || {},
    timeouts: Object.fromEntries(Object.entries(sv.timeouts || {}).filter(([, t]) => t > Date.now())),
    zunobots: Object.keys(ZBOTS).filter(k => sv.members.includes('zbot_' + k)),
  }));
  // Timed-out members can read, but not talk, react or use commands until it ends.
  hooks.channelPerms.push((sv, ch, uid, p) => {
    if (timedOut(sv, uid)) for (const x of ['send_messages', 'add_reactions', 'speak', 'video', 'use_commands', 'attach_files']) p.delete(x);
  });
  route('PUT', '/api/servers/:id/members/:userId/nick', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    const uid = params.userId;
    if (!sv.members.includes(uid)) fail(404, "They aren't in this server.");
    if (uid === me.id) z.need(sv, me, 'change_nickname');
    else { z.need(sv, me, 'manage_nicknames'); if (!z.outranks(sv, me.id, uid)) fail(403, "You can't change the nickname of someone whose role is the same as or higher than yours."); }
    const nick = z.cleanName ? z.cleanName(body.nick, 32) : clean(body.nick, 32);
    sv.nicks ||= {};
    const old = sv.nicks[uid] || '';
    if (nick !== old) await z.judgeText({ nickname: nick });
    if (nick) sv.nicks[uid] = nick; else delete sv.nicks[uid];
    if (uid !== me.id) z.audit(sv, me, 'member_nick', { type: 'member', id: uid, name: data.users[uid]?.displayName || '?' }, nick ? `"${old}" → "${nick}"` : 'cleared');
    save(); z.refreshServer(sv);
    return { nick: nick || null };
  });
  route('POST', '/api/servers/:id/members/:userId/timeout', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'moderate_members');
    const uid = params.userId;
    if (!sv.members.includes(uid)) fail(404, "They aren't in this server.");
    if (!z.outranks(sv, me.id, uid)) fail(403, "You can't time out someone whose role is the same as or higher than yours.");
    const mins = Math.max(0, Math.min(7 * 1440, Math.round(Number(body.minutes) || 0)));
    sv.timeouts ||= {};
    if (mins) sv.timeouts[uid] = Date.now() + mins * 60e3; else delete sv.timeouts[uid];
    z.audit(sv, me, mins ? 'member_timeout' : 'member_untimeout', { type: 'member', id: uid, name: data.users[uid]?.displayName || '?' }, mins ? `${mins} min${body.reason ? ` · ${clean(body.reason, 150)}` : ''}` : '');
    for (const [rid, room] of z.rooms) if (rid.startsWith('vc:') && room.has(uid)) {
      const st = room.get(uid); st.muted = true; st.video = false; st.screen = false;
      for (const id of room.keys()) if (id !== uid) send(id, 'rtc-state', { room: rid, userId: uid, ...st }); // everyone else's app silences them too
    }
    save(); z.refreshServer(sv);
    return { until: sv.timeouts[uid] || null };
  });

  // ======================= pins, search, polls, votes, forwarding =======================
  const convs = [['/api/dms/:target', z.dmConv], ['/api/channels/:target', z.channelConv], ['/api/groups/:target', z.groupConv]];
  const canPin = conv => (conv.kind === 'channel' ? conv.perms.has('manage_messages') : true);
  for (const [prefix, resolve] of convs) {
    for (const method of ['POST', 'DELETE']) {
      route(method, `${prefix}/messages/:msgId/pin`, async ({ me, params }) => {
        const conv = resolve(me, params.target);
        if (!canPin(conv)) fail(403, 'You need the Manage Messages permission to pin messages here.');
        if (conv.kind === 'dm') conv.canWrite();
        const { st, i, m } = z.findMessage(conv, params.msgId);
        if (method === 'POST' && st.messages.filter(x => x.pinned).length >= 50) fail(400, 'A conversation can have up to 50 pins. Unpin something first.');
        const message = st.messages[i] = method === 'POST' ? { ...m, pinned: true, pinnedAt: Date.now(), pinnedBy: me.id } : { ...m, pinned: false, pinnedAt: undefined, pinnedBy: undefined };
        save();
        emit(conv, 'message-update', { message });
        if (method === 'POST') emit(conv, 'pins', {});
        return { message };
      });
    }
    route('GET', `${prefix}/pins`, async ({ me, params }) => {
      const conv = resolve(me, params.target);
      const pins = (conv.peek()?.messages || []).filter(m => m.pinned).sort((a, b) => b.pinnedAt - a.pinnedAt);
      return { pins, authors: [...new Set(pins.map(m => m.authorId))].map(id => publicUser(data.users[id])).filter(Boolean) };
    });
    // Search: words, plus from:username, has:image / has:file / has:gif / has:link, and pinned:true.
    route('GET', `${prefix}/search`, async ({ me, params, query }) => {
      const conv = resolve(me, params.target);
      let q = clean(query.get('q'), 120).toLowerCase();
      let msgs = conv.peek()?.messages || [];
      if (conv.kind === 'channel' && !conv.perms.has('read_history')) { const since = me.joinedAt?.[conv.server.id] || 0; msgs = msgs.filter(m => m.createdAt >= since); }
      const take = re => { const m = re.exec(q); if (m) q = q.replace(m[0], '').trim(); return m?.[1]; };
      const from = take(/\bfrom:@?([a-z0-9_.]{2,32})/), has = take(/\bhas:(image|file|gif|link|poll)\b/), pinned = take(/\bpinned:(true|yes)\b/);
      const fromUser = from && users().find(u => u.username === from);
      if (from && !fromUser) return { results: [], authors: [], total: 0 };
      // Words are looked up in the search index (fast, and "hel wor" finds "Hello world").
      const indexed = q ? hooks.searchIn?.(conv, q) : null;
      const hits = msgs.filter(m => {
        if (fromUser && m.authorId !== fromUser.id) return false;
        if (pinned && !m.pinned) return false;
        if (has === 'image' && !(m.attachments || []).some(a => a.kind === 'image')) return false;
        if (has === 'file' && !(m.attachments || []).some(a => a.kind === 'file')) return false;
        if (has === 'video' && !(m.attachments || []).some(a => a.kind === 'video')) return false;
        if (has === 'gif' && !m.gif) return false;
        if (has === 'poll' && !m.poll) return false;
        if (has === 'link' && !/https?:\/\//.test(m.content || '')) return false;
        return !q || indexed?.has(m.id) || (m.content || '').toLowerCase().includes(q) || (m.poll?.question || '').toLowerCase().includes(q);
      });
      const results = hits.slice(-25).reverse();
      return { results, total: hits.length, authors: [...new Set(results.map(m => m.authorId))].map(id => publicUser(data.users[id])).filter(Boolean) };
    });
    route('POST', `${prefix}/messages/:msgId/vote`, async ({ me, params, body }) => {
      const conv = resolve(me, params.target);
      if (conv.kind === 'dm' && conv.canWrite() !== 'open') fail(403, 'You can vote once they accept your message request.');
      if (conv.kind === 'channel' && !conv.perms.has('send_messages') && !conv.perms.has('add_reactions')) fail(403, "You can't vote in this channel.");
      const { st, i, m } = z.findMessage(conv, params.msgId);
      if (!m.poll) fail(400, "That message isn't a poll.");
      if ((m.poll.endsAt && m.poll.endsAt < Date.now()) || m.poll.closed) fail(400, 'This poll has ended.');
      // Anonymous, ranked and hidden-results polls keep their votes private (see zuno27.js).
      if (m.poll.anonymous || m.poll.ranked || m.poll.blind) fail(400, 'Update Zuno to vote in this poll.');
      const opt = m.poll.options.find(o => o.id === String(body.option));
      if (!opt) fail(400, 'Unknown answer.');
      const poll = JSON.parse(JSON.stringify(m.poll));
      for (const o of poll.options) {
        const had = o.votes.includes(me.id);
        if (o.id === opt.id) o.votes = had ? o.votes.filter(x => x !== me.id) : [...o.votes, me.id];
        else if (!poll.multi) o.votes = o.votes.filter(x => x !== me.id);
      }
      const message = st.messages[i] = { ...m, poll };
      save();
      emit(conv, 'message-update', { message });
      return { message };
    });
  }
  const POLL_HOURS = [1, 4, 8, 24, 72, 168];
  hooks.beforePost.push(({ conv, me, body, extra }) => {
    if (body.poll) {
      const p = body.poll;
      const question = clean(p.question, 300);
      const options = (Array.isArray(p.options) ? p.options : []).map(o => clean(o, 55)).filter(Boolean).slice(0, 10);
      if (!question) fail(400, 'Give your poll a question.');
      if (options.length < 2) fail(400, 'A poll needs at least 2 answers.');
      const hours = POLL_HOURS.includes(Number(p.hours)) ? Number(p.hours) : 24;
      extra.poll = { question, multi: !!p.multi, endsAt: Date.now() + hours * 3600e3, options: options.map((text, i) => ({ id: String(i + 1), text, emoji: clean(p.emojis?.[i], 16) || null, votes: [] })) };
    }
    if (body.forward) {
      const src = z.convOf(me, String(body.forward.conv || ''));
      const { m } = z.findMessage(src, String(body.forward.id || ''));
      const a = data.users[m.authorId];
      extra.forward = {
        authorId: m.authorId, authorName: a?.displayName || 'Someone', content: m.content || '', gif: m.gif, attachments: m.attachments, poll: m.poll ? { question: m.poll.question } : undefined,
        createdAt: m.createdAt, where: src.kind === 'channel' ? `#${src.channel.name} in ${src.server.name}` : src.kind === 'group' ? 'a group chat' : 'a direct message',
        // (0.45.1) Where it came from, so people who can see that channel or group can jump to it.
        ...(src.kind === 'channel' || src.kind === 'group' ? { from: String(body.forward.conv).slice(0, 80), fromId: String(m.id) } : {}),
      };
    }
  });

  // ======================= Zuno Official: the rules =======================
  const RULES_VERSION = 1;
  function rulesText() {
    const terms = `${z.PUBLIC_URL || ''}/terms`;
    return [
      '# 📜 Zuno Official Rules',
      'Welcome! Zuno is a place to hang out with your people. Keep it fun and kind for everyone:',
      '**1. Be kind.** No harassment, bullying, hate speech, threats or targeting people for who they are.',
      '**2. Keep it safe for everyone.** No sexual content, gore or shock content. Nothing that sexualizes minors, ever.',
      '**3. No spam or scams.** No flooding, chain messages, fake giveaways, "free Bloom/Nitro" links or self-promo without asking.',
      "**4. Respect privacy.** Don't share anyone's personal info, photos or private messages without their OK.",
      "**5. No cheating the system.** Don't impersonate staff, dodge bans with new accounts or abuse bugs. Found a bug? Report it in Settings › Report a Bug.",
      '**6. Use the right channel** and follow what moderators ask.',
      '**7. Follow the Zuno Terms of Service.** Breaking them can lead to a warning, a timeout or a ban from Zuno.',
      `📄 **Read the full Terms of Service:** ${terms}`,
      '-# Need help or want to report something? Right-click a message and pick Report Message, or message Zuno Staff.',
    ].join('\n\n');
  }
  function ensureOfficialRules() {
    const sv = z.officialServer();
    if (!sv) return;
    z.ensureRoles(sv);
    let ch = sv.channels.find(c => c.id === sv.rulesChannelId) || sv.channels.find(c => c.type === 'text' && /^(rules|📜-rules|server-rules)$/.test(c.name));
    let changed = false;
    if (!ch) {
      ch = { id: newId(), name: 'rules', type: 'text', readOnly: true, topic: 'Read these first! They keep Zuno fun for everyone.' };
      sv.channels.unshift(ch);
      changed = true;
    }
    if (sv.rulesChannelId !== ch.id) { sv.rulesChannelId = ch.id; changed = true; }
    if (!ch.readOnly) { ch.readOnly = true; changed = true; }
    const st = data.channelMessages[ch.id] ||= { messages: [] };
    const posted = st.messages.find(m => m.id === data.meta.rulesMessageId);
    if (!posted || data.meta.rulesVersion !== RULES_VERSION) {
      if (posted) st.messages = st.messages.filter(m => m !== posted);
      const m = postMessage(z.channelConvFor(sv, ch), data.users[z.SYSTEM_ID], rulesText(), { pinned: true, pinnedAt: Date.now(), pinnedBy: z.SYSTEM_ID });
      data.meta.rulesMessageId = m.id; data.meta.rulesVersion = RULES_VERSION;
      changed = true;
    }
    if (changed) { save(); z.refreshServer(sv); }
  }

  // ======================= server templates =======================
  const MOD = ['view_channels', 'create_invites', 'send_messages', 'attach_files', 'add_reactions', 'read_history', 'use_commands', 'connect', 'speak', 'video', 'change_nickname', 'manage_messages', 'kick_members', 'ban_members', 'moderate_members', 'manage_nicknames', 'view_audit_log', 'bypass_slowmode', 'mention_everyone', 'manage_invites'];
  const TEMPLATES = {
    friends: { theme: 'lagoon', cats: [['TEXT', [['general'], ['memes'], ['media'], ['plans', 'Movie night? Trip? Plan it here.']]], ['VOICE', [['Hangout', 0, 'voice'], ['Gaming', 0, 'voice']]]], roles: [['Besties', '#eb459e', null, '💖']] },
    gaming: { theme: 'galaxy', cats: [['INFO', [['rules', 'Read before you play.', 'text', true], ['announcements', 'Server news.', 'text', true]]], ['TEXT', [['general'], ['looking-for-group', 'Find people to play with.'], ['clips', 'Your best (and worst) moments.'], ['memes']]], ['VOICE', [['Lobby', 0, 'voice'], ['Squad 1', 5, 'voice'], ['Squad 2', 5, 'voice'], ['AFK', 0, 'voice']]]], roles: [['Moderator', '#3aaefc', MOD, '🛡️'], ['Gamer', '#a37bff', null, '🎮']] },
    study: { theme: 'matcha', cats: [['INFO', [['welcome', 'Start here.', 'text', true], ['resources', 'Helpful links and notes.']]], ['STUDY', [['general'], ['homework-help', 'Stuck? Ask here.'], ['notes'], ['wins', 'Finished something? Celebrate!']]], ['VOICE', [['Study Room', 0, 'voice'], ['Quiet Room', 4, 'voice']]]], roles: [['Tutor', '#23a55a', null, '📚']] },
    community: { theme: 'ocean', cats: [['INFO', [['rules', 'Read these first.', 'text', true], ['announcements', 'News from the team.', 'text', true], ['introductions', 'Say hi and tell us about you!']]], ['COMMUNITY', [['general'], ['off-topic'], ['media'], ['suggestions', 'Ideas to make the server better.']]], ['VOICE', [['Lounge', 0, 'voice'], ['Events', 0, 'voice']]]], roles: [['Moderator', '#3aaefc', MOD, '🛡️'], ['Events', '#f0b232', null, '🎉'], ['Member', '#04c5ae', null, null]] },
    creators: { theme: 'sunset', cats: [['INFO', [['announcements', 'Updates and drops.', 'text', true]]], ['CREATE', [['share-your-work', 'Post what you made!'], ['feedback', 'Kind, useful feedback only.'], ['inspiration'], ['collabs', 'Find people to make things with.']]], ['VOICE', [['Studio', 0, 'voice']]]], roles: [['Artist', '#ff7b6b', null, '🎨']] },
  };
  route('POST', '/api/servers/:id/template', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id, { owner: true }));
    const t = TEMPLATES[body.template];
    if (!t) fail(400, 'Unknown template.');
    if (Date.now() - sv.createdAt > 3600e3 || sv.categories.length) fail(400, 'Templates can only be used on a brand-new server.');
    const general = sv.channels.find(c => c.type === 'text' && c.name === 'general');
    const voice = sv.channels.find(c => c.type === 'voice');
    const channels = [];
    let rulesId = null, welcomeId = null;
    for (const [catName, list] of t.cats) {
      const cat = { id: newId(), name: catName, overrides: [] };
      sv.categories.push(cat);
      for (const [name, x, type = 'text', readOnly = false] of list) {
        let ch = name === 'general' && general ? general : type === 'voice' && voice && !channels.includes(voice) ? voice : null;
        if (ch && ch.type !== type) ch = null;
        ch ||= { id: newId(), name, type };
        ch.name = name; ch.categoryId = cat.id;
        if (type === 'text' && typeof x === 'string') ch.topic = x;
        if (type === 'voice' && x) ch.userLimit = x;
        if (readOnly) ch.readOnly = true;
        if (/rules|welcome/.test(name)) rulesId ||= ch.id;
        if (name === 'general') welcomeId = ch.id;
        channels.push(ch);
      }
    }
    sv.channels = channels;
    for (const [name, color, perms, icon] of [...t.roles].reverse()) {
      sv.roles.unshift({ id: newId(), name, color, perms: perms ? [...perms] : [...sv.roles[sv.roles.length - 1].perms], hoist: true, mentionable: true, icon });
    }
    sv.theme = t.theme; sv.rulesChannelId = rulesId; sv.welcomeChannelId = welcomeId;
    z.audit(sv, me, 'server_update', { type: 'server', id: sv.id, name: sv.name }, `used the ${body.template} template`);
    save(); z.refreshServer(sv);
    return { server: z.serverSummary(sv, me) };
  });

  // ======================= Zuno Bots: ready-made bots anyone can add =======================
  const botAvatar = (emoji, c1, c2) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><text x="32" y="43" font-size="30" text-anchor="middle">${emoji}</text></svg>`);
  const BASE_PERMS = ['view_channels', 'send_messages', 'add_reactions', 'read_history', 'attach_files', 'use_commands'];
  const ZBOTS = {
    guardian: { name: 'Guardian', emoji: '🛡️', c: ['#3aaefc', '#1f5fae'], perms: [...BASE_PERMS, 'manage_messages', 'moderate_members'],
      desc: 'AutoMod: blocks bad words, spam, mass pings, invite links and SHOUTING before anyone sees them. Can time out repeat offenders.',
      commands: [['automod', 'Show what Guardian is watching for']] },
    greeter: { name: 'Greeter', emoji: '👋', c: ['#04c5ae', '#0a7d70'], perms: [...BASE_PERMS, 'manage_roles'],
      desc: 'Welcomes new members with your own message and can give them a role when they join.', commands: [['welcome-test', 'Preview the welcome message']] },
    party: { name: 'Party', emoji: '🎲', c: ['#ff7b6b', '#c2410c'], perms: BASE_PERMS,
      desc: 'Fun commands: dice, coin flips, the magic 8-ball, rock-paper-scissors, jokes and more.',
      commands: [['roll', 'Roll dice', '2d6'], ['flip', 'Flip a coin'], ['8ball', 'Ask the magic 8-ball', 'will it rain?'], ['choose', 'Pick one for you', 'pizza, tacos'], ['rps', 'Rock, paper, scissors', 'rock'], ['joke', 'Tell a joke'], ['ship', 'How well do two people match?', '@a @b'], ['rate', 'Rate anything out of 10', 'my outfit']] },
    levels: { name: 'Levels', emoji: '⭐', c: ['#f0b232', '#b45309'], perms: [...BASE_PERMS, 'manage_roles'],
      desc: 'Members earn XP for chatting and level up. Show off with /rank, compete on /leaderboard, and unlock roles at set levels.',
      commands: [['rank', 'See your level and XP', '@someone'], ['leaderboard', 'Top chatters in the server']] },
    reminders: { name: 'Remind Me', emoji: '⏰', c: ['#a37bff', '#6d28d9'], perms: BASE_PERMS,
      desc: 'Set reminders in chat: /remind 10m take the pizza out. Works for minutes, hours and days.',
      commands: [['remind', 'Remind you later', '10m stretch'], ['reminders', 'See your reminders']] },
    polls: { name: 'Polls', emoji: '📊', c: ['#23a55a', '#166534'], perms: BASE_PERMS,
      desc: 'Quick polls with one command: /poll Pizza or tacos? | Pizza | Tacos', commands: [['poll', 'Start a poll', 'Question? | Answer 1 | Answer 2']] },
    starboard: { name: 'Starboard', emoji: '🌟', c: ['#ffd76a', '#d97706'], perms: BASE_PERMS,
      desc: 'When a message gets enough ⭐ reactions, it gets posted to your starboard channel so the best moments are saved.',
      commands: [['starboard', 'Show starboard settings']] },
  };
  // (0.45.2) Other modules (zuno46.js) add commands, settings and whole new bots through this.
  const ZB_EXT = { config: {}, command: {}, setup: new Set(['guardian', 'greeter', 'levels', 'starboard']), guardianSkip: null, xpRate: null, levelText: null };
  const zbotId = key => 'zbot_' + key;
  const zbotKey = u => u?.app?.builtin || null;
  function ensureZunoBots() {
    for (const [key, b] of Object.entries(ZBOTS)) {
      const id = zbotId(key);
      const prev = data.users[id] || {};
      data.users[id] = {
        ...prev, id, username: key === 'reminders' ? 'remindme' : key, displayName: b.name, bot: true, email: null, passwordHash: null,
        avatar: botAvatar(b.emoji, ...b.c), bannerColor: b.c[0], bio: b.desc.slice(0, 190), pronouns: '', customStatus: `Made by Zuno · /${b.commands[0][0]}`,
        status: 'online', createdAt: prev.createdAt || Date.now(), lastRead: {}, welcomed: true,
        app: { ownerId: z.SYSTEM_ID, builtin: key, description: b.desc, public: true, perms: b.perms, commands: b.commands.map(([name, description, usage]) => ({ name, description, usage: usage || '' })) },
      };
    }
  }
  ensureZunoBots();
  const cfgOf = (sv, key) => ({ ...DEFAULT_CFG[key], ...(sv.zunobots?.[key] || {}) });
  const DEFAULT_CFG = {
    guardian: { words: [], links: false, invites: true, caps: false, spam: true, mentions: 5, timeoutMinutes: 0, logChannelId: null },
    greeter: { channelId: null, message: 'Welcome to **{server}**, {user}! You\'re member #{count}. 🎉', roleId: null },
    party: {},
    levels: { announce: true, channelId: null, rewards: [] },
    reminders: {},
    polls: {},
    starboard: { channelId: null, threshold: 3, emoji: '⭐' },
  };
  const inServer = (sv, key) => sv.members.includes(zbotId(key));
  function botSay(sv, ch, key, text, extra = {}) {
    const bot = data.users[zbotId(key)];
    if (!ch || !bot || !inServer(sv, key)) return null;
    if (!z.permsIn(sv, ch, bot.id).has('send_messages')) return null;
    return postMessage(z.channelConvFor(sv, ch), bot, text, extra);
  }
  const channelIn = (sv, id) => sv.channels.find(c => c.id === id && c.type === 'text');
  const mention = u => '@' + u.username;

  route('GET', '/api/servers/:id/zunobots', async ({ me, params }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    if (!z.can(sv, me.id, 'manage_integrations') && !z.can(sv, me.id, 'manage_server')) fail(403, 'You need Manage Bots & Webhooks to set up bots.');
    return { bots: Object.entries(ZBOTS).map(([key, b]) => ({ key, id: zbotId(key), name: b.name, emoji: b.emoji, desc: b.desc, avatar: data.users[zbotId(key)].avatar, commands: data.users[zbotId(key)].app.commands, added: inServer(sv, key), config: cfgOf(sv, key), setup: ZB_EXT.setup.has(key), saved: !!sv.zunobots?.[key] })) };
  });
  route('PUT', '/api/servers/:id/zunobots/:key', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    if (!z.can(sv, me.id, 'manage_integrations') && !z.can(sv, me.id, 'manage_server')) fail(403, 'You need Manage Bots & Webhooks to set up bots.');
    const key = params.key;
    if (!Object.hasOwn(ZBOTS, key)) fail(404, 'Unknown bot.');
    const c = body.config || {}, cur = cfgOf(sv, key), next = { ...cur };
    const chOrNull = id => (id && channelIn(sv, id) ? id : null);
    const roleOk = id => { const r = id && z.roleById(sv, id); if (!r) return null; if (r.everyone || r.managed) fail(400, "That role can't be handed out by a bot."); if (!z.canEditRole(sv, me.id, r)) fail(403, `You can only pick roles below your highest role.`); if (r.perms.includes('administrator')) fail(400, "Bots can't hand out Administrator."); return r.id; };
    if (key === 'guardian') {
      if ('words' in c) next.words = (Array.isArray(c.words) ? c.words : String(c.words || '').split(',')).map(w => clean(w, 40).toLowerCase()).filter(Boolean).slice(0, 200);
      for (const k of ['links', 'invites', 'caps', 'spam']) if (k in c) next[k] = !!c[k];
      if ('mentions' in c) next.mentions = Math.max(0, Math.min(50, Number(c.mentions) || 0));
      if ('timeoutMinutes' in c) next.timeoutMinutes = [0, 1, 5, 10, 60, 1440].includes(Number(c.timeoutMinutes)) ? Number(c.timeoutMinutes) : 0;
      if ('logChannelId' in c) next.logChannelId = chOrNull(c.logChannelId);
    } else if (key === 'greeter') {
      if ('channelId' in c) next.channelId = chOrNull(c.channelId);
      if ('message' in c) next.message = clean(c.message, 500) || DEFAULT_CFG.greeter.message;
      if ('roleId' in c) next.roleId = c.roleId ? roleOk(c.roleId) : null;
    } else if (key === 'levels') {
      if ('announce' in c) next.announce = !!c.announce;
      if ('channelId' in c) next.channelId = chOrNull(c.channelId);
      if ('rewards' in c) next.rewards = (Array.isArray(c.rewards) ? c.rewards : []).slice(0, 20).map(r => ({ level: Math.max(1, Math.min(200, Math.round(Number(r.level) || 1))), roleId: roleOk(r.roleId) })).filter(r => r.roleId);
    } else if (key === 'starboard') {
      if ('channelId' in c) next.channelId = chOrNull(c.channelId);
      if ('threshold' in c) next.threshold = Math.max(1, Math.min(50, Math.round(Number(c.threshold) || 3)));
      if ('emoji' in c) next.emoji = clean(c.emoji, 16) || '⭐';
    }
    if (ZB_EXT.config[key]) ZB_EXT.config[key](c, next, { sv, me, chOrNull, roleOk });
    sv.zunobots ||= {};
    sv.zunobots[key] = next;
    z.audit(sv, me, 'bot_config', { type: 'member', id: zbotId(key), name: ZBOTS[key].name });
    save(); z.refreshServer(sv);
    return { config: next };
  });

  // ---- Guardian (AutoMod) ----
  const recent = new Map(); // "server|user" -> [{ at, text }]
  const INVITE_RE = /zuno\.invite\/[A-Za-z0-9_-]{4,}|discord\.(gg|com\/invite)\/\S+/i;
  const LINK_RE = /https?:\/\/\S+|www\.\S+/i;
  function guardianCheck(sv, ch, me, content) {
    const c = cfgOf(sv, 'guardian');
    const lower = content.toLowerCase();
    const word = c.words.find(w => (w.includes(' ') ? lower.includes(w) : new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(lower)));
    if (word) return 'it has a word this server blocks';
    if (c.invites && INVITE_RE.test(content)) return 'invite links to other servers aren\'t allowed here';
    if (c.links && LINK_RE.test(content) && !ZB_EXT.linksOk?.(sv, content)) return 'links aren\'t allowed here';
    if (c.mentions && (content.match(/@[a-z0-9_.]{2,32}/gi) || []).length > c.mentions) return `that's more than ${c.mentions} mentions in one message`;
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (c.caps && letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.75) return 'please don\'t shout (too many CAPITAL letters)';
    if (c.spam) {
      const k = sv.id + '|' + me.id, now = Date.now();
      const list = (recent.get(k) || []).filter(x => x.at > now - 30e3);
      list.push({ at: now, text: lower });
      recent.set(k, list);
      if (list.filter(x => x.at > now - 5e3).length > 5) return "you're sending messages too fast";
      if (lower.length > 3 && list.filter(x => x.text === lower).length >= 3) return 'you sent the same thing 3 times';
    }
    return null;
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of recent) if (!v.some(x => x.at > now - 30e3)) recent.delete(k); }, 60e3).unref();
  hooks.beforePost.push(({ conv, me, content }) => {
    if (conv.kind !== 'channel' || !content || me.bot || me.system) return;
    const sv = conv.server;
    if (!inServer(sv, 'guardian') || sv.ownerId === me.id || conv.perms.has('manage_messages')) return;
    if (ZB_EXT.guardianSkip?.(sv, conv.channel, me)) return;
    const why = guardianCheck(sv, conv.channel, me, content);
    if (!why) return;
    const c = cfgOf(sv, 'guardian');
    if (c.timeoutMinutes) { sv.timeouts ||= {}; sv.timeouts[me.id] = Date.now() + c.timeoutMinutes * 60e3; z.refreshServer(sv); }
    const log = channelIn(sv, c.logChannelId);
    if (log) botSay(sv, log, 'guardian', `🛡️ Blocked a message from ${mention(me)} in #${conv.channel.name}: ${why}.${c.timeoutMinutes ? ` Timed out for ${c.timeoutMinutes} min.` : ''}\n> ${content.slice(0, 300).replace(/\n/g, ' ')}`);
    save();
    fail(403, `🛡️ Guardian blocked your message: ${why}.${c.timeoutMinutes ? ` You're timed out for ${c.timeoutMinutes} minute${c.timeoutMinutes === 1 ? '' : 's'}.` : ''}`);
  });

  // ---- Greeter ----
  const fillWelcome = (text, sv, u) => text.replace(/\{user\}/g, mention(u)).replace(/\{name\}/g, u.displayName).replace(/\{server\}/g, sv.name).replace(/\{count\}/g, String(sv.members.filter(id => !data.users[id]?.bot).length));
  hooks.onJoin.push((sv, u) => {
    if (u.bot || !inServer(sv, 'greeter')) return;
    const c = cfgOf(sv, 'greeter');
    const ch = channelIn(sv, c.channelId) || sv.channels.find(x => x.id === sv.welcomeChannelId) || sv.channels.find(x => x.type === 'text');
    setTimeout(() => botSay(sv, ch, 'greeter', fillWelcome(c.message, sv, u)), 600);
    const role = c.roleId && z.roleById(sv, c.roleId);
    if (role && !role.managed && !role.perms.includes('administrator')) {
      sv.memberRoles[u.id] = [...new Set([...(sv.memberRoles[u.id] || []), role.id])];
      z.audit(sv, zbotId('greeter'), 'member_roles', { type: 'member', id: u.id, name: u.displayName }, '+' + role.name);
    }
  });

  // ---- Levels ----
  const xpFor = lvl => 5 * lvl * lvl + 50 * lvl + 100; // XP from one level to the next
  function levelOf(xp) { let l = 0; while (xp >= xpFor(l)) { xp -= xpFor(l); l++; } return { level: l, into: xp, need: xpFor(l) }; }
  function giveXp(sv, ch, u) {
    sv.levels ||= {};
    const rec = sv.levels[u.id] ||= { xp: 0, msgs: 0, last: 0 };
    rec.msgs++;
    if (ZB_EXT.xpRate && !ZB_EXT.xpRate(sv, ch, u)) return;
    if (Date.now() - rec.last < 60e3) return; // one XP drop a minute, so spamming doesn't help
    rec.last = Date.now();
    const before = levelOf(rec.xp).level;
    const rate = ZB_EXT.xpRate ? ZB_EXT.xpRate(sv, ch, u) : 1;
    if (!rate) return;
    rec.xp += Math.round((15 + Math.floor(Math.random() * 11)) * rate);
    const after = levelOf(rec.xp).level;
    if (after <= before) return;
    const c = cfgOf(sv, 'levels');
    const reward = c.rewards.filter(r => r.level <= after).map(r => z.roleById(sv, r.roleId)).filter(r => r && !r.managed);
    const fresh = reward.filter(r => !(sv.memberRoles[u.id] || []).includes(r.id));
    if (fresh.length) { sv.memberRoles[u.id] = [...new Set([...(sv.memberRoles[u.id] || []), ...fresh.map(r => r.id)])]; z.refreshServer(sv); }
    if (c.announce) botSay(sv, channelIn(sv, c.channelId) || ch, 'levels', (ZB_EXT.levelText?.(sv, u, after, fresh) || `🎉 GG ${mention(u)}, you reached **level ${after}**!`) + (fresh.length ? ` You unlocked ${fresh.map(r => `**${r.name}**`).join(', ')}.` : ''));
  }

  // ---- Reminders ----
  data.reminders ||= [];
  const parseWhen = s => { const m = /^(\d{1,4})\s*(s|sec|secs|m|min|mins|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i.exec(s || ''); if (!m) return 0; const n = Number(m[1]); const u = m[2][0].toLowerCase(); return n * { s: 1e3, m: 60e3, h: 3600e3, d: 864e5, w: 6048e5 }[u]; };
  setInterval(() => {
    const now = Date.now();
    const due = data.reminders.filter(r => r.at <= now);
    if (!due.length) return;
    data.reminders = data.reminders.filter(r => r.at > now);
    for (const r of due) {
      const sv = data.servers[r.serverId], u = data.users[r.userId];
      if (!sv || !u || !sv.members.includes(u.id)) continue;
      botSay(sv, channelIn(sv, r.channelId), 'reminders', r.timer ? `${mention(u)} ${r.text}` : `⏰ ${mention(u)}, you asked me to remind you: **${r.text}**`);
    }
    save();
  }, 10e3).unref();

  // ---- Party ----
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const EIGHT = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.', 'Most likely.', 'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];
  const JOKES = ['Why did the scarecrow win an award? He was outstanding in his field. 🌾', "I told my computer I needed a break, and it said 'No problem, I'll go to sleep.' 💤", 'Why do programmers prefer dark mode? Because light attracts bugs. 🐛', "What do you call a fake noodle? An impasta. 🍝", "Why don't skeletons fight each other? They don't have the guts. 💀", 'What did the ocean say to the beach? Nothing, it just waved. 🌊', "Why can't a bicycle stand up by itself? It's two tired. 🚲", "I'm reading a book about anti-gravity. It's impossible to put down. 📚", 'What do you call a sleeping dinosaur? A dino-snore. 🦖', 'Why did the math book look sad? It had too many problems. ➗'];
  function party(name, args, u) {
    if (name === 'roll') {
      const m = /^(\d{1,2})?d(\d{1,4})$/i.exec(args || 'd6') || [null, 1, 6];
      const n = Math.min(20, Number(m[1]) || 1), sides = Math.max(2, Math.min(1000, Number(m[2]) || 6));
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
      return `🎲 ${mention(u)} rolled **${rolls.reduce((a, b) => a + b, 0)}**${n > 1 ? ` (${rolls.join(' + ')})` : ''} on ${n}d${sides}`;
    }
    if (name === 'flip') return `🪙 ${mention(u)} flipped **${pick(['Heads', 'Tails'])}**!`;
    if (name === '8ball') return args ? `🎱 *"${args.slice(0, 200)}"*\n**${pick(EIGHT)}**` : '🎱 Ask me a question, like `/8ball will it rain?`';
    if (name === 'choose') { const opts = (args || '').split(/,| or /i).map(s => s.trim()).filter(Boolean); return opts.length > 1 ? `🤔 I choose... **${pick(opts).slice(0, 100)}**!` : '🤔 Give me some choices, like `/choose pizza, tacos, sushi`'; }
    if (name === 'rps') {
      const mine = pick(['rock', 'paper', 'scissors']), theirs = (args || '').toLowerCase().trim();
      if (!['rock', 'paper', 'scissors'].includes(theirs)) return '✊ Pick one: `/rps rock`, `/rps paper` or `/rps scissors`';
      const e = { rock: '🪨', paper: '📄', scissors: '✂️' };
      const result = mine === theirs ? "It's a tie!" : { rock: 'scissors', paper: 'rock', scissors: 'paper' }[theirs] === mine ? 'You win! 🎉' : 'I win! 😎';
      return `${e[theirs]} vs ${e[mine]} — ${result}`;
    }
    if (name === 'joke') return pick(JOKES);
    if (name === 'ship') {
      const names = (args || '').match(/@?[a-z0-9_.]{2,32}/gi) || [];
      if (names.length < 2) return '💘 Ship two people: `/ship @alex @sam`';
      const [a, b] = names.map(n => n.replace(/^@/, ''));
      const score = parseInt(sha([a, b].sort().join('+')).slice(0, 4), 16) % 101;
      return `💘 **${a}** + **${b}** = **${score}%** ${score > 80 ? '💞 Perfect match!' : score > 50 ? '💕 Cute!' : score > 25 ? '🙂 Maybe...' : '💔 Oof.'}\n\`${'█'.repeat(Math.round(score / 10))}${'░'.repeat(10 - Math.round(score / 10))}\``;
    }
    if (name === 'rate') return args ? `⭐ I rate **${args.slice(0, 100)}** a **${parseInt(sha(args.toLowerCase()).slice(0, 4), 16) % 11}/10**` : '⭐ Rate something: `/rate my cooking`';
    return null;
  }

  // Commands for Zuno bots run right here on the server.
  hooks.afterPost.push(({ conv, me, message, command }) => {
    if (conv.kind !== 'channel') return;
    const sv = conv.server, ch = conv.channel;
    if (!command && inServer(sv, 'levels') && !me.bot && !me.system) giveXp(sv, ch, me);
    if (!command) return;
    const key = zbotKey(data.users[command.botId]);
    if (!key) return;
    const say = text => setTimeout(() => botSay(sv, ch, key, text), 300);
    const args = command.args;
    if (ZB_EXT.command[key]?.({ sv, ch, me, message, command, args, say, botSay: (text, extra) => botSay(sv, ch, key, text, extra) }) === true) return 'handled';
    if (key === 'party') { const r = party(command.name, args, me); if (r) say(r); }
    else if (key === 'levels') {
      if (command.name === 'rank') {
        const who = (args && users().find(u => u.username === args.replace(/^@/, '').toLowerCase() && sv.members.includes(u.id))) || me;
        const rec = sv.levels?.[who.id] || { xp: 0, msgs: 0 };
        const l = levelOf(rec.xp);
        const ranked = Object.entries(sv.levels || {}).sort((a, b) => b[1].xp - a[1].xp);
        const pos = ranked.findIndex(([id]) => id === who.id) + 1;
        const fill = Math.round((l.into / l.need) * 12);
        say(`⭐ **${who.displayName}** · Level **${l.level}**${pos ? ` · Rank #${pos}` : ''}\n\`${'█'.repeat(fill)}${'░'.repeat(12 - fill)}\` ${l.into}/${l.need} XP · ${rec.msgs} messages`);
      } else if (command.name === 'leaderboard') {
        const top = Object.entries(sv.levels || {}).filter(([id]) => sv.members.includes(id)).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
        say(top.length ? `🏆 **${sv.name} Leaderboard**\n${top.map(([id, r], i) => `${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} ${data.users[id]?.displayName || '?'} · Level ${levelOf(r.xp).level} (${r.xp} XP)`).join('\n')}` : '🏆 Nobody has XP yet. Start chatting!');
      }
    } else if (key === 'reminders') {
      if (command.name === 'remind') {
        const [when, ...rest] = (args || '').split(/\s+/);
        const ms = parseWhen(when), text = rest.join(' ').slice(0, 300);
        if (!ms || !text) say('⏰ Try `/remind 10m stretch` or `/remind 2h call mom`. Use s, m, h, d or w.');
        else if (ms > 30 * 864e5) say('⏰ I can only remember things up to 30 days ahead.');
        else if (data.reminders.filter(r => r.userId === me.id).length >= 25) say("⏰ You have 25 reminders already. Let some finish first!");
        else { data.reminders.push({ id: newId(), userId: me.id, serverId: sv.id, channelId: ch.id, text, at: Date.now() + ms }); save(); say(`⏰ Got it, ${mention(me)}! I'll remind you <t:${Math.floor((Date.now() + ms) / 1000)}:R>: **${text}**`); }
      } else if (command.name === 'reminders') {
        const mine = data.reminders.filter(r => r.userId === me.id && r.serverId === sv.id).sort((a, b) => a.at - b.at);
        say(mine.length ? `⏰ **Your reminders**\n${mine.map(r => `• <t:${Math.floor(r.at / 1000)}:R>: ${r.text}`).join('\n')}` : "⏰ You don't have any reminders here.");
      }
    } else if (key === 'polls') {
      const parts = (args || '').split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 3) say('📊 Try `/poll Pizza or tacos? | Pizza | Tacos`');
      else setTimeout(() => botSay(sv, ch, 'polls', '', { poll: { question: parts[0].slice(0, 300), multi: false, endsAt: Date.now() + 24 * 3600e3, options: parts.slice(1, 11).map((t, i) => ({ id: String(i + 1), text: t.slice(0, 55), emoji: null, votes: [] })) }, pollBy: me.id }), 300);
    } else if (key === 'guardian') {
      const c = cfgOf(sv, 'guardian');
      say(`🛡️ **Guardian is watching for:** ${[c.words.length && `${c.words.length} blocked word${c.words.length === 1 ? '' : 's'}`, c.invites && 'invite links', c.links && 'all links', c.caps && 'shouting', c.spam && 'spam', c.mentions && `more than ${c.mentions} mentions`].filter(Boolean).join(', ') || 'nothing yet (set me up in Server Settings › Bots & Webhooks)'}.`);
    } else if (key === 'greeter') say(`👋 Preview: ${fillWelcome(cfgOf(sv, 'greeter').message, sv, me)}`);
    else if (key === 'starboard') { const c = cfgOf(sv, 'starboard'); say(c.channelId ? `🌟 Messages with **${c.threshold}** ${c.emoji} go to <#${c.channelId}>.` : '🌟 Pick a starboard channel in Server Settings › Bots & Webhooks.'); }
    return 'handled';
  });

  // ---- Starboard ----
  hooks.onReact.push(({ conv, message, emoji, added }) => {
    if (conv.kind !== 'channel' || !added) return;
    const sv = conv.server;
    if (!inServer(sv, 'starboard')) return;
    const c = cfgOf(sv, 'starboard');
    const board = channelIn(sv, c.channelId);
    if (!board || board.id === conv.channel.id || emoji !== c.emoji) return;
    // (security) Never copy a message from a private channel into a board more people can see.
    if (sv.members.some(id => z.canView(sv, board, id) && !z.canView(sv, conv.channel, id))) return;
    if ((message.reactions?.[emoji] || []).filter(id => c.selfStar !== false || id !== message.authorId).length < c.threshold) return;
    sv.starred ||= {};
    if (sv.starred[message.id]) return;
    sv.starred[message.id] = Date.now();
    const a = data.users[message.authorId];
    botSay(sv, board, 'starboard', `${c.emoji} **${c.threshold}+** in #${conv.channel.name} · from ${a ? mention(a) : 'someone'}`, { forward: { authorId: message.authorId, authorName: a?.displayName || 'Someone', content: message.content || '', gif: message.gif, attachments: message.attachments, createdAt: message.createdAt, where: `#${conv.channel.name}` } });
  });

  // ======================= housekeeping =======================
  // Files that were uploaded but never sent are removed after a day.
  setInterval(() => {
    let n = 0;
    for (const [id, a] of Object.entries(data.attachments || {})) {
      if (!a.used && Date.now() - a.createdAt > 864e5) { z.removeUpload('/uploads/' + a.file); delete data.attachments[id]; n++; }
    }
    if (n) save();
  }, 3600e3).unref();
  // Upgrade old sessions so they can expire and be listed.
  for (const [t, s] of Object.entries(data.sessions)) if (typeof s === 'string') data.sessions[t] = { uid: s, createdAt: Date.now(), lastSeen: Date.now(), agent: '' };

  // Runs once index.js has made the Zuno account and the Official server is known.
  function start() {
    ensureOfficialRules();
    setInterval(ensureOfficialRules, 10 * 60e3).unref();
  }
  return { start, ZBOTS, THEMES, DECORATIONS, EFFECTS, sendMail, zb: { ZBOTS, DEFAULT_CFG, ZB_EXT, cfgOf, botSay, inServer, zbotId, channelIn, mention, ensureZunoBots, levelOf, xpFor, parseWhen, pick } };
};
