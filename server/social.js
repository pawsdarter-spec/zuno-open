// Zuno 0.14, part two: group DMs, activity status & connections (Spotify), birthdays,
// friendship anniversaries, mutual friends & servers, server emoji, link previews,
// Zuno Wrapped and two-factor login. index.js hands everything this needs over in `z`.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');

module.exports = function social(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser, postMessage, systemMessage } = z;
  const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
  const users = () => Object.values(data.users);
  const human = u => u && !u.bot && !u.system;
  data.meta ||= {};

  // New settings people can switch on and off.
  for (const k of ['shareActivity', 'typedEffects']) if (!z.PREF_BOOLS.includes(k)) z.PREF_BOOLS.push(k);
  Object.assign(z.PREF_DEFAULTS, { shareActivity: true, typedEffects: true });

  // ======================= group DMs =======================
  const MAX_GROUP = 10;
  const groupView = g => ({ id: g.id, name: g.name || '', icon: g.icon || null, ownerId: g.ownerId, createdAt: g.createdAt, members: g.members.map(id => publicUser(data.users[id])).filter(Boolean), call: z.roomMembers('gc:' + g.id), e2e: !!data.groupMessages[g.id]?.e2e });
  hooks.groupView = groupView;
  hooks.meExtras.push(me => ({
    groups: Object.values(data.groups).filter(g => g.members.includes(me.id)).map(g => {
      const msgs = data.groupMessages[g.id]?.messages || [];
      const lastRead = me.lastRead?.['g:' + g.id] || me.joinedAt?.['g:' + g.id] || 0;
      return { ...groupView(g), lastMessageAt: msgs[msgs.length - 1]?.createdAt || g.createdAt, last: z.messagePreview?.(msgs[msgs.length - 1], me.id) || null, unread: msgs.filter(m => m.authorId !== me.id && m.createdAt > lastRead).length };
    }),
  }));
  const refreshGroup = (g, extra = []) => { for (const id of new Set([...g.members, ...extra])) send(id, 'refresh', { groupId: g.id }); };
  // A note from Zuno inside the group, like "Alex added Sam".
  const groupNote = (g, text) => { const any = data.users[g.members[0]]; if (any) postMessage(z.groupConv(any, g.id), data.users[z.SYSTEM_ID], text, { note: true }); };
  function myGroup(me, id) {
    const g = data.groups[id];
    if (!g || !g.members.includes(me.id)) fail(404, 'Group not found.');
    return g;
  }
  function checkAddable(me, uid) {
    const u = data.users[uid];
    if (!human(u)) fail(400, "Bots and Zuno can't join group chats.");
    if (!z.areFriends(me.id, uid)) fail(403, `You can only add your friends${u ? ` (${u.displayName} isn't your friend yet)` : ''}.`);
    if (z.isBlocked(me.id, uid)) fail(403, "You can't add that person.");
    return u;
  }
  route('POST', '/api/groups', async ({ me, body }) => {
    if (me.bot) fail(403, "Bots can't make group chats.");
    const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(String))].filter(id => id !== me.id);
    if (ids.length < 2) fail(400, 'Pick at least 2 friends for a group chat. For just one, open your DM with them.');
    if (ids.length + 1 > MAX_GROUP) fail(400, `Group chats can have up to ${MAX_GROUP} people.`);
    for (const id of ids) checkAddable(me, id);
    if (Object.values(data.groups).filter(g => g.ownerId === me.id).length >= 50) fail(400, "You've made a lot of group chats. Leave some first.");
    const id = newId();
    const g = data.groups[id] = { id, name: z.checkName(clean(body.name, 48)), icon: null, ownerId: me.id, members: [me.id, ...ids], createdAt: Date.now() };
    groupNote(g, `👋 **${me.displayName}** started the group with ${ids.map(id => `**${data.users[id].displayName}**`).join(', ')}.`);
    me.lastRead['g:' + id] = Date.now();
    save(); refreshGroup(g);
    return { group: groupView(g) };
  });
  route('PATCH', '/api/groups/:id', async ({ me, params, body }) => {
    const g = myGroup(me, params.id);
    if ('name' in body) {
      const name = z.checkName(clean(body.name, 48));
      if (name !== g.name) { g.name = name; groupNote(g, name ? `✏️ **${me.displayName}** renamed the group to **${name}**.` : `✏️ **${me.displayName}** removed the group name.`); }
    }
    save(); refreshGroup(g);
    return { group: groupView(g) };
  });
  route('POST', '/api/groups/:id/icon', async ({ me, params, body }) => {
    const g = myGroup(me, params.id);
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Group icons must be PNG, JPG, WebP or GIF images.');
    z.removeUpload(g.icon);
    g.icon = z.storeUpload(body, k.ext);
    groupNote(g, `🖼️ **${me.displayName}** changed the group icon.`);
    save(); refreshGroup(g);
    return { group: groupView(g) };
  }, { raw: 2_000_000 });
  route('POST', '/api/groups/:id/members', async ({ me, params, body }) => {
    const g = myGroup(me, params.id);
    const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : [body.userId]).filter(Boolean).map(String))].filter(id => !g.members.includes(id));
    if (!ids.length) fail(400, "They're already in the group.");
    if (g.members.length + ids.length > MAX_GROUP) fail(400, `Group chats can have up to ${MAX_GROUP} people.`);
    for (const id of ids) checkAddable(me, id);
    for (const id of ids) { g.members.push(id); const u = data.users[id]; u.joinedAt ||= {}; u.joinedAt['g:' + g.id] = Date.now(); }
    groupNote(g, `➕ **${me.displayName}** added ${ids.map(id => `**${data.users[id].displayName}**`).join(', ')}.`);
    save(); refreshGroup(g);
    return { group: groupView(g) };
  });
  route('DELETE', '/api/groups/:id/members/:userId', async ({ me, params }) => {
    const g = myGroup(me, params.id);
    const uid = params.userId;
    if (!g.members.includes(uid)) fail(404, "They aren't in this group.");
    if (uid !== me.id && g.ownerId !== me.id) fail(403, 'Only the group owner can remove people.');
    g.members = g.members.filter(id => id !== uid);
    if (!g.members.length) { delete data.groups[g.id]; delete data.groupMessages[g.id]; save(); send(uid, 'refresh', { groupId: g.id, removed: true }); return { ok: true }; }
    if (g.ownerId === uid) g.ownerId = g.members[0];
    groupNote(g, uid === me.id ? `👋 **${me.displayName}** left the group.` : `🚪 **${me.displayName}** removed **${data.users[uid]?.displayName || 'someone'}**.`);
    save(); refreshGroup(g, [uid]);
    send(uid, 'refresh', { groupId: g.id, removed: true });
    return { ok: true };
  });
  route('POST', '/api/groups/:id/owner', async ({ me, params, body }) => {
    const g = myGroup(me, params.id);
    if (g.ownerId !== me.id) fail(403, 'Only the group owner can do that.');
    if (!g.members.includes(String(body.userId))) fail(400, 'Pick someone in the group.');
    g.ownerId = String(body.userId);
    groupNote(g, `👑 **${me.displayName}** made **${data.users[g.ownerId].displayName}** the group owner.`);
    save(); refreshGroup(g);
    return { group: groupView(g) };
  });

  // ======================= activity status =======================
  // The desktop app tells Zuno which game is open (and what Spotify is playing). Spotify's own
  // connection does it from anywhere. People can turn sharing off in Settings › Activity.
  const ACTIVITY_TYPES = ['playing', 'listening', 'watching', 'streaming', 'competing'];
  const ACTIVITY_TTL = 3 * 60e3;
  const sharing = u => ({ ...z.PREF_DEFAULTS, ...(u.prefs || {}) }).shareActivity !== false;
  // (0.43) Settings › Connections › Spotify › "Show what I'm listening to".
  const songShown = u => (u.connections || []).find(c => c.type === 'spotify')?.song !== false;
  // (0.43.1) Two at once: a game and a song (the game shows first). Each is kept on its own.
  const kindOf = a => (a?.type === 'listening' ? 'music' : 'game');
  const actsOf = u => {
    if (!u.acts) { u.acts = {}; if (u.activity?.at) u.acts[kindOf(u.activity)] = u.activity; }
    return u.acts;
  };
  const music = u => actsOf(u).music || null;
  const live = (u, a) => !!a && u.status !== 'invisible' && Date.now() - a.at < ACTIVITY_TTL && z.isOnline(u.id) && sharing(u);
  const currentActivities = u => ['game', 'music'].map(k => actsOf(u)[k]).filter(a => live(u, a));
  const currentActivity = u => currentActivities(u)[0] || null;
  const snap = u => JSON.stringify(currentActivities(u).map(a => ({ ...a, at: 0 })));
  // a = null clears that kind (a game, or music).
  function setActivity(u, a, kind = kindOf(a)) {
    const before = snap(u);
    actsOf(u)[kind] = a ? { ...a, at: Date.now() } : null;
    u.activity = u.acts.game || u.acts.music || null;
    if (snap(u) !== before) z.broadcastUser(u);
  }
  // Covers: a picture from the desktop app (Windows' own album art, a game's icon) or a web address.
  const okArt = v => (typeof v === 'string' && (/^https:\/\/[^\s"'<>]{8,400}$/.test(v) || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 70000)) ? v : null);
  function applyActivity(me, a, source) {
    if (!ACTIVITY_TYPES.includes(a?.type)) fail(400, 'Unknown activity.');
    const act = {
      type: a.type, name: clean(a.name, 64), details: clean(a.details, 128) || null, state: clean(a.state, 128) || null,
      start: Number(a.start) || Date.now(), end: Number(a.end) || null, source, art: okArt(a.art),
    };
    if (!act.name) fail(400, 'Give the activity a name.');
    const kind = kindOf(act), prev = actsOf(me)[kind];
    // A real Spotify connection wins over the desktop app.
    if (act.source === 'desktop' && prev?.source === 'spotify' && Date.now() - prev.at < 60e3 && kind === 'music') return;
    if (kind === 'music' && act.name === 'Spotify' && !songShown(me)) { if (prev) setActivity(me, null, 'music'); return; }
    if (kind === 'game') { z.trackPlay?.(me, act.name); z.rememberGameIcon?.(act.name, act.art); }
    // The same song or game keeps the picture it already had (no flicker while a lookup runs).
    const same = prev && prev.name === act.name && prev.details === act.details;
    const songKey = kind === 'music' && act.details ? `${act.state || ''}|${act.details}`.toLowerCase() : null;
    if (!act.art && songKey && coverCache.get(songKey)?.url) act.art = coverCache.get(songKey).url;
    if (kind === 'game') { const c = z.gameCoverNow?.(act.name) || (!act.art && z.gameIconNow?.(act.name)); if (c) act.art = c; }
    if (!act.art && same && prev.art) act.art = prev.art;
    if (kind === 'game' && !act.art && z.gameTile) act.art = z.gameTile(act.name);
    setActivity(me, act, kind);
    if (kind === 'game' && z.gameCover && !z.gameCoverNow?.(act.name)) z.gameCover(act.name).then(url => {
      const cur = actsOf(me).game;
      if (url && cur?.name === act.name && cur.art !== url) { cur.art = url; z.broadcastUser(me); }
    }).catch(() => {});
    if (!act.art && songKey) {
      const c = coverCache.get(songKey);
      if (c && (c.url || Date.now() - c.at < 30 * 60e3)) return; // looked up already (a miss is tried again later)
      findCover(act.details, act.state).then(url => {
        coverCache.set(songKey, { url, at: Date.now() });
        if (coverCache.size > 2000) coverCache.delete(coverCache.keys().next().value);
        const cur = actsOf(me).music;
        if (url && cur?.details === act.details && !cur.art) { cur.art = url; z.broadcastUser(me); }
      }).catch(() => {});
    }
  }
  route('POST', '/api/me/activity', async ({ me, body }) => {
    const source = ['desktop', 'spotify', 'custom'].includes(body.source) ? body.source : (body.activity?.source && ['desktop', 'custom'].includes(body.activity.source) ? body.activity.source : 'desktop');
    if (Array.isArray(body.activities)) {
      // Newer desktop apps report everything at once; what it doesn't report any more has ended.
      const list = body.activities.filter(Boolean).slice(0, 3);
      const kinds = new Set(list.map(kindOf));
      for (const k of ['game', 'music']) if (!kinds.has(k) && actsOf(me)[k]?.source === source) setActivity(me, null, k);
      for (const a of list) applyActivity(me, a, source);
      return { ok: true };
    }
    if (!body.activity) {
      // Spotify's connection keeps its own song going even when the game closes.
      for (const k of ['game', 'music']) { const a = actsOf(me)[k]; if (a && (!body.source || a.source === body.source)) setActivity(me, null, k); }
      return { ok: true };
    }
    applyActivity(me, body.activity, source);
    return { ok: true };
  });
  hooks.publicUser.push(u => ({ activity: currentActivity(u), activities: currentActivities(u) }));
  // Album covers: Spotify's own search when Spotify is set up here, else Apple's free iTunes search.
  const coverCache = new Map();
  let appToken = null;
  let spotifyBlockedUntil = 0;
  async function findCover(name, artist) {
    const q = `${name} ${artist || ''}`.trim();
    const UA = { 'User-Agent': 'Zuno/1.0 (+https://heyzuno.uk)', Accept: 'application/json' };
    // Spotify's own search (when it lets Zuno in; it's skipped for an hour after it says no).
    if (spotifyReady() && Date.now() > spotifyBlockedUntil) {
      try {
        if (!appToken || appToken.exp < Date.now()) {
          const auth = 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
          const t = await httpsJson('POST', 'https://accounts.spotify.com/api/token', { headers: { Authorization: auth }, form: { grant_type: 'client_credentials' } });
          if (t.status === 200) appToken = { v: t.json.access_token, exp: Date.now() + (t.json.expires_in - 60) * 1000 };
        }
        if (appToken) {
          const r = await httpsJson('GET', `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`, { headers: { Authorization: 'Bearer ' + appToken.v } });
          if (r.status === 403 || r.status === 401) spotifyBlockedUntil = Date.now() + 3600e3;
          const im = r.json?.tracks?.items?.[0]?.album?.images;
          if (im?.length) return (im[1] || im[0]).url;
        }
      } catch {}
    }
    // Deezer has nearly everything Spotify has (and needs no key).
    for (const dq of [`artist:"${artist || ''}" track:"${name}"`, q]) {
      try {
        const r = await httpsJson('GET', `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(dq)}`, { headers: UA });
        const c = r.json?.data?.[0]?.album;
        if (c?.cover_medium || c?.cover_big) return c.cover_big || c.cover_medium;
      } catch {}
    }
    try {
      const r = await httpsJson('GET', `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${encodeURIComponent(q)}`, { headers: UA });
      const a = r.json?.results?.[0]?.artworkUrl100;
      if (a) return a.replace('100x100bb', '300x300bb');
    } catch {}
    return null;
  }

  // ======================= connections =======================
  const CONNECTIONS = {
    spotify: null, github: /^[a-z0-9-]{1,39}$/i, youtube: /^@?[\w.-]{1,60}$/, twitch: /^\w{3,25}$/, x: /^@?\w{1,15}$/, instagram: /^@?[\w.]{1,30}$/,
    tiktok: /^@?[\w.]{2,24}$/, steam: /^[\w-]{2,64}$/, reddit: /^(u\/)?[\w-]{3,20}$/i, roblox: /^\w{3,20}$/, xbox: /^[\w ]{1,15}$/, playstation: /^[\w-]{3,16}$/,
    bluesky: /^@?[\w.-]{3,253}$/, lastfm: /^[A-Za-z][\w.-]{1,14}$/, website: /^https?:\/\/[^\s<>"]{3,200}$/,
  };
  hooks.publicUser.push(u => ({ connections: (u.connections || []).filter(c => c.show !== false).map(c => ({ type: c.type, name: c.name, verified: !!c.verified })) }));
  route('GET', '/api/me/connections', async ({ me }) => ({ connections: me.connections || [], spotifyReady: spotifyReady(), spotifyLast: me.spotify ? me.spotifyLast || null : null, lastfmReady: !!lastfmKey(), lastfmLast: me.lastfmLast || null }));
  route('PUT', '/api/me/connections/:type', async ({ me, params, body }) => {
    const type = params.type, re = CONNECTIONS[type];
    if (!(type in CONNECTIONS)) fail(400, 'Unknown connection.');
    me.connections ||= [];
    const cur = me.connections.find(c => c.type === type);
    if ('show' in body && cur) cur.show = !!body.show;
    if ('song' in body && cur && type === 'spotify') { cur.song = !!body.song; if (!cur.song && music(me)) setActivity(me, null, 'music'); }
    if ('name' in body) {
      if (!re) fail(400, 'Connect Spotify with the Connect button.');
      let name = clean(body.name, 200).trim().replace(type === 'reddit' ? /^u\//i : /^@/, '');
      // Steam: a pasted profile link works too (steamcommunity.com/id/<name> or /profiles/<17-digit id>).
      if (type === 'steam') { const m = /steamcommunity\.com\/(?:id|profiles)\/([\w-]{2,64})/i.exec(name); if (m) name = m[1]; }
      if (!re.test(name)) fail(400, type === 'website' ? 'Use a full link starting with https://' : "That doesn't look like a valid username.");
      if (cur) cur.name = name; else me.connections.push({ type, name, show: true, verified: false, at: Date.now() });
    }
    save(); z.broadcastUser(me);
    return { connections: me.connections };
  });
  route('DELETE', '/api/me/connections/:type', async ({ me, params }) => {
    me.connections = (me.connections || []).filter(c => c.type !== params.type);
    if (params.type === 'spotify') { delete me.spotify; if (music(me)?.source === 'spotify') setActivity(me, null, 'music'); }
    save(); z.broadcastUser(me);
    return { connections: me.connections };
  });

  // ---- Spotify (needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server) ----
  const spotifyReady = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const siteUrl = req => z.PUBLIC_URL || `http://${req?.headers.host || 'localhost:3000'}`;
  const oauthStates = new Map(); // state -> { uid, exp, redirect }
  function httpsJson(method, url, { headers = {}, form = null } = {}) {
    return new Promise((resolve, reject) => {
      const body = form ? new URLSearchParams(form).toString() : null;
      const r = https.request(url, { method, timeout: 10000, headers: { ...headers, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => { let j = null; try { j = raw ? JSON.parse(raw) : null; } catch {} resolve({ status: res.statusCode, json: j }); });
      });
      r.on('timeout', () => r.destroy(new Error('timeout')));
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }
  route('GET', '/api/connections/spotify/start', async ({ me, req }) => {
    if (!spotifyReady()) fail(503, "Spotify isn't set up on this Zuno server yet. In the Zuno desktop app, your Spotify song still shows up on its own.");
    const state = crypto.randomBytes(16).toString('hex');
    const redirect = `${siteUrl(req)}/api/connections/spotify/callback`;
    oauthStates.set(state, { uid: me.id, exp: Date.now() + 10 * 60e3, redirect });
    const q = new URLSearchParams({ client_id: process.env.SPOTIFY_CLIENT_ID, response_type: 'code', redirect_uri: redirect, state, scope: 'user-read-currently-playing user-read-playback-state' });
    return { url: `https://accounts.spotify.com/authorize?${q}` };
  });
  const donePage = (ok, text) => ({ __html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zuno</title><body style="font-family:system-ui;background:#0c1312;color:#dce8e5;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:48px">${ok ? '🎧' : '😕'}</div><h2 style="color:#cffbf5">${text}</h2><p style="color:#8ea6a1">You can close this tab and go back to Zuno.</p></div><script src="/close-tab.js"></script>` });
  route('GET', '/api/connections/spotify/callback', async ({ query }) => {
    const st = oauthStates.get(query.get('state'));
    oauthStates.delete(query.get('state'));
    if (!st || st.exp < Date.now() || !query.get('code')) return donePage(false, "That didn't work. Try connecting again.");
    const u = data.users[st.uid];
    const auth = 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    try {
      const t = await httpsJson('POST', 'https://accounts.spotify.com/api/token', { headers: { Authorization: auth }, form: { grant_type: 'authorization_code', code: query.get('code'), redirect_uri: st.redirect } });
      if (t.status !== 200) throw new Error('token ' + t.status);
      const prof = await httpsJson('GET', 'https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + t.json.access_token } });
      u.spotify = { access: t.json.access_token, refresh: t.json.refresh_token, exp: Date.now() + (t.json.expires_in - 60) * 1000 };
      u.connections = (u.connections || []).filter(c => c.type !== 'spotify');
      u.connections.push({ type: 'spotify', name: prof.json?.display_name || prof.json?.id || 'Spotify', show: true, verified: true, at: Date.now() });
      save(); z.broadcastUser(u); send(u.id, 'connections', {});
      return donePage(true, 'Spotify is connected!');
    } catch (err) { console.warn('Spotify connect failed:', err.message); return donePage(false, "Spotify didn't connect. Try again in a moment."); }
  }, { auth: false });
  async function spotifyToken(u) {
    if (u.spotify.exp > Date.now()) return u.spotify.access;
    const auth = 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const t = await httpsJson('POST', 'https://accounts.spotify.com/api/token', { headers: { Authorization: auth }, form: { grant_type: 'refresh_token', refresh_token: u.spotify.refresh } });
    if (t.status !== 200) { if (t.status === 400) { delete u.spotify; u.connections = (u.connections || []).filter(c => c.type !== 'spotify'); save(); } throw new Error('refresh ' + t.status); }
    u.spotify.access = t.json.access_token;
    if (t.json.refresh_token) u.spotify.refresh = t.json.refresh_token;
    u.spotify.exp = Date.now() + (t.json.expires_in - 60) * 1000;
    save();
    return u.spotify.access;
  }
  // Every 20 seconds, check what connected people who are online are listening to.
  setInterval(async () => {
    if (!spotifyReady()) return;
    for (const u of users()) {
      if (!u.spotify || !z.isOnline(u.id) || !sharing(u)) continue;
      if (!songShown(u)) { if (music(u)?.source === 'spotify') setActivity(u, null, 'music'); continue; }
      try {
        const r = await httpsJson('GET', 'https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: 'Bearer ' + (await spotifyToken(u)) } });
        const item = r.json?.item;
        // (0.43) What Spotify said last, so Settings › Connections can show why nothing appears.
        u.spotifyLast = { at: Date.now(), status: r.status, playing: !!(r.status === 200 && r.json?.is_playing && item), song: item?.name ? clean(item.name, 128) : null, error: r.status >= 400 ? clean(r.json?.error?.message || `Spotify answered ${r.status}`, 200) : null };
        if (r.status === 200 && r.json?.is_playing && item) {
          const now = Date.now();
          setActivity(u, { type: 'listening', name: 'Spotify', details: clean(item.name, 128), state: clean((item.artists || []).map(a => a.name).join(', '), 128),
            art: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || null, url: item.external_urls?.spotify || null,
            start: now - (r.json.progress_ms || 0), end: now - (r.json.progress_ms || 0) + (item.duration_ms || 0), source: 'spotify' });
        } else if (music(u)?.source === 'spotify') setActivity(u, null, 'music');
      } catch (err) { u.spotifyLast = { at: Date.now(), status: 0, playing: false, error: clean(String(err?.message || err), 200) }; }
    }
  }, 20e3).unref();

  // ======================= Last.fm: the song, without Spotify's developer limits =======================
  // (0.43.1) Spotify only shares "now playing" with apps that are out of development mode (only
  // businesses can get that now), so a Last.fm connection is the backup: people link Spotify to
  // Last.fm once, and Last.fm says what's playing. Works on phones too. Needs LASTFM_API_KEY.
  const lastfmKey = () => process.env.LASTFM_API_KEY || '';
  setInterval(async () => {
    if (!lastfmKey()) return;
    for (const u of users()) {
      const conn = (u.connections || []).find(c => c.type === 'lastfm');
      if (!conn || !z.isOnline(u.id) || !sharing(u) || !songShown(u)) continue;
      // A working Spotify connection (or the desktop app) already says what's playing.
      const m = music(u); if (m && m.source !== 'lastfm' && Date.now() - m.at < 90e3) continue;
      try {
        const r = await httpsJson('GET', `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(conn.name)}&api_key=${lastfmKey()}&format=json&limit=1`);
        const t = r.json?.recenttracks?.track?.[0];
        if (t && t['@attr']?.nowplaying === 'true') {
          const details = clean(t.name, 128), state = clean(t.artist?.['#text'] || t.artist?.name || '', 128);
          const art = (t.image || []).map(i => i['#text']).filter(Boolean).pop() || null;
          const same = music(u)?.source === 'lastfm' && music(u).details === details;
          setActivity(u, { type: 'listening', name: 'Spotify', details, state, art: art && !/2a96cbd8b46e442fc41c2b86b821562f/.test(art) ? art : (same && music(u).art) || null, url: null, start: same ? music(u).start : Date.now(), end: null, source: 'lastfm' });
          u.lastfmLast = { at: Date.now(), playing: true, song: details };
        } else {
          if (music(u)?.source === 'lastfm') setActivity(u, null, 'music');
          u.lastfmLast = { at: Date.now(), playing: false, error: r.status >= 400 ? clean(r.json?.message || `Last.fm answered ${r.status}`, 200) : null };
        }
      } catch {}
    }
  }, 30e3).unref();

  // ======================= birthdays & friendship anniversaries =======================
  const todayIn = tz => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date()); const g = t => Number(p.find(x => x.type === t).value); return { y: g('year'), m: g('month'), d: g('day') }; } catch { const n = new Date(); return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() }; } };
  const isBirthday = u => { if (!u.birthday) return false; const t = todayIn(u.tz); return t.m === u.birthday.m && t.d === u.birthday.d; };
  hooks.patchMe.push((me, body) => {
    if ('birthday' in body) {
      const b = body.birthday;
      if (!b) me.birthday = null;
      else {
        const m = Math.round(Number(b.m)), d = Math.round(Number(b.d));
        const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1])) fail(400, "That isn't a real date.");
        me.birthday = { m, d };
      }
    }
    if ('birthdayVisible' in body) me.birthdayVisible = !!body.birthdayVisible;
    if ('tz' in body) { try { new Intl.DateTimeFormat('en-US', { timeZone: String(body.tz) }); me.tz = String(body.tz).slice(0, 64); } catch {} }
  });
  hooks.publicUser.push(u => ({ birthday: u.birthday && u.birthdayVisible !== false ? { m: u.birthday.m, d: u.birthday.d } : null, birthdayToday: human(u) && isBirthday(u) }));
  const pairKey = (a, b) => [a, b].sort().join(':');
  data.friendSince ||= {};
  data.anniversaries ||= {}; // pair -> last year celebrated
  function celebrate() {
    // Fill in when friendships started: the first DM between them, or now.
    for (const [a, b] of data.friendships) {
      const k = pairKey(a, b);
      if (!data.friendSince[k]) data.friendSince[k] = data.dms[z.dmKey(a, b)]?.messages[0]?.createdAt || Date.now();
    }
    // Birthdays: a note from Zuno, once a year, and the 🎂 shows for friends.
    for (const u of users()) {
      if (!human(u) || !u.birthday) continue;
      const t = todayIn(u.tz), today = isBirthday(u);
      if (today && u.bdayCelebrated !== t.y) {
        u.bdayCelebrated = t.y;
        systemMessage(u.id, `🎂 **Happy birthday, ${u.displayName}!** 🎉\n\nYour friends will see a 🎂 next to your name today. Have the best day!`);
        z.broadcastUser(u);
      }
      if (!today && u.bdayShown) z.broadcastUser(u); // the 🎂 goes away the next day
      u.bdayShown = today;
    }
    // Friendship anniversaries, posted in their DM.
    const now = new Date();
    for (const [a, b] of data.friendships) {
      const k = pairKey(a, b), since = new Date(data.friendSince[k]);
      const years = now.getUTCFullYear() - since.getUTCFullYear();
      if (years < 1 || since.getUTCMonth() !== now.getUTCMonth() || since.getUTCDate() !== now.getUTCDate() || data.anniversaries[k] === now.getUTCFullYear()) continue;
      const ua = data.users[a], ub = data.users[b];
      if (!human(ua) || !human(ub)) continue;
      data.anniversaries[k] = now.getUTCFullYear();
      postMessage(z.dmConv(ua, b), data.users[z.SYSTEM_ID], `🎉 **${ua.displayName}** and **${ub.displayName}** have been friends on Zuno for **${years} year${years === 1 ? '' : 's'}** today! 🥳`, { note: true, celebrate: 'anniversary' });
    }
    save();
  }

  // ======================= mutual friends & servers =======================
  route('GET', '/api/users/:id/mutuals', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!u) fail(404, 'User not found.');
    const theirs = new Set(z.friendIds(u.id));
    return {
      friends: z.friendIds(me.id).filter(id => theirs.has(id) && id !== u.id).map(id => publicUser(data.users[id])).filter(Boolean),
      servers: Object.values(data.servers).filter(sv => sv.members.includes(me.id) && sv.members.includes(u.id)).map(sv => ({ id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor, nick: sv.nicks?.[u.id] || null })),
      friendSince: z.areFriends(me.id, u.id) ? data.friendSince[pairKey(me.id, u.id)] || null : null,
    };
  });

  // ======================= server emoji =======================
  Object.assign(z.PERM_INFO, { manage_expressions: { label: 'Manage Emoji', group: 'General' } });
  if (!z.PERM_KEYS.includes('manage_expressions')) z.PERM_KEYS.push('manage_expressions');
  for (const sv of Object.values(data.servers)) {
    if (sv.permsV14b) continue;
    z.ensureRoles(sv);
    for (const r of sv.roles) if (r.perms.includes('manage_server') && !r.perms.includes('manage_expressions')) r.perms.push('manage_expressions');
    sv.permsV14b = true;
  }
  const MAX_EMOJI = 50;
  const emojiView = e => ({ id: e.id, name: e.name, animated: !!e.animated });
  hooks.serverSummary.push(sv => ({ emojis: (sv.emojis || []).map(emojiView) }));
  route('POST', '/api/servers/:id/emojis', async ({ me, params, body, req }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    sv.emojis ||= [];
    const maxEmoji = z.svLimits(sv).emoji || MAX_EMOJI;
    if (sv.emojis.length >= maxEmoji) fail(400, `This server can have up to ${maxEmoji} emoji${z.svLimits(sv).level < 3 ? '. Server Blooming unlocks more' : ''}.`);
    const name = clean(decodeURIComponent(req.headers['x-emoji-name'] || ''), 32).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!/^[a-z0-9_]{2,32}$/.test(name)) fail(400, 'Emoji names use 2–32 letters, numbers and underscores.');
    if (sv.emojis.some(e => e.name === name)) fail(409, `This server already has :${name}:.`);
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Emoji must be PNG, JPG, WebP or GIF images.');
    const url = z.storeUpload(body, k.ext);
    const e = { id: path.basename(url), name, animated: k.ext === 'gif', by: me.id, at: Date.now() };
    sv.emojis.push(e);
    z.audit(sv, me, 'emoji_create', { type: 'emoji', id: e.id, name: ':' + name + ':' });
    save(); z.refreshServer(sv);
    return { emoji: emojiView(e) };
  }, { raw: 512_000 });
  route('PATCH', '/api/servers/:id/emojis/:emojiId', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    const e = (sv.emojis || []).find(x => x.id === params.emojiId);
    if (!e) fail(404, 'Emoji not found.');
    const name = clean(body.name, 32).toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(name)) fail(400, 'Emoji names use 2–32 letters, numbers and underscores.');
    if (sv.emojis.some(x => x !== e && x.name === name)) fail(409, `This server already has :${name}:.`);
    e.name = name;
    save(); z.refreshServer(sv);
    return { emoji: emojiView(e) };
  });
  route('DELETE', '/api/servers/:id/emojis/:emojiId', async ({ me, params }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    const e = (sv.emojis || []).find(x => x.id === params.emojiId);
    if (!e) fail(404, 'Emoji not found.');
    sv.emojis = sv.emojis.filter(x => x !== e);
    z.removeUpload('/uploads/' + e.id);
    z.audit(sv, me, 'emoji_delete', { type: 'emoji', id: e.id, name: ':' + e.name + ':' });
    save(); z.refreshServer(sv);
    return { ok: true };
  });

  // ======================= link previews =======================
  // Zuno fetches the page itself (never anything on a private network), and pictures come
  // through Zuno too, so the sites people link to never see your IP address.
  const embedCache = new Map(); // url -> { at, data }
  const IMG_KEY = crypto.randomBytes(32);
  const signImg = u => crypto.createHmac('sha256', IMG_KEY).update(u).digest('hex').slice(0, 32);
  const proxied = u => (u ? `/api/embed/img?u=${encodeURIComponent(u)}&s=${signImg(u)}` : null);
  function privateIp(ip) {
    if (net.isIPv4(ip)) {
      const [a, b] = ip.split('.').map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  async function safeGet(raw, { maxBytes, accept }, hops = 0) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('bad url'); }
    if (!['http:', 'https:'].includes(u.protocol) || (u.port && !['80', '443'].includes(u.port)) || u.username) throw new Error('blocked');
    const addrs = net.isIP(u.hostname) ? [{ address: u.hostname, family: net.isIP(u.hostname) }] : await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error('blocked');
    const pinned = addrs[0];
    return new Promise((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http;
      const r = lib.get(u, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZunoBot/1.0; +link previews)', Accept: accept, 'Accept-Language': 'en' },
        // Connect only to the address we checked (newer Node asks for a list).
        lookup: (_h, o, cb) => (o?.all ? cb(null, [{ address: pinned.address, family: pinned.family }]) : cb(null, pinned.address, pinned.family)) }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (hops >= 3) return reject(new Error('too many redirects'));
          return resolve(safeGet(new URL(res.headers.location, u).href, { maxBytes, accept }, hops + 1));
        }
        if (res.statusCode >= 400) { res.resume(); return reject(new Error('status ' + res.statusCode)); }
        const chunks = []; let size = 0;
        res.on('data', c => { size += c.length; if (size > maxBytes) { res.destroy(); resolve({ url: u.href, type: res.headers['content-type'] || '', body: Buffer.concat(chunks), cut: true }); } else chunks.push(c); });
        res.on('end', () => resolve({ url: u.href, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      r.on('timeout', () => r.destroy(new Error('timeout')));
      r.on('error', reject);
    });
  }
  const decodeHtml = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32)).trim();
  // Reads <meta> tags one at a time (each capped), so a page made of thousands of half-open tags
  // can't make the matching take minutes.
  function meta(html, names) {
    const tags = html.match(/<meta\b[^>]{0,800}>/gi) || [];
    for (const n of names) {
      for (const tag of tags) {
        const key = tag.match(/\b(?:property|name)=["']([^"']{1,100})["']/i)?.[1];
        if (!key || key.toLowerCase() !== n) continue;
        const content = tag.match(/\bcontent=["']([^"']{0,1000})["']/i)?.[1];
        if (content) return decodeHtml(content);
      }
    }
    return null;
  }
  const ytId = u => { try { const x = new URL(u); if (/(^|\.)youtu\.be$/.test(x.hostname)) return x.pathname.slice(1, 12); if (/(^|\.)youtube\.com$/.test(x.hostname)) return x.searchParams.get('v') || x.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/)?.[2] || null; } catch {} return null; };
  async function buildEmbed(url) {
    const vid = ytId(url);
    if (vid && /^[\w-]{11}$/.test(vid)) {
      let title = 'YouTube video', author = null;
      try { const r = await safeGet(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + vid)}`, { maxBytes: 64e3, accept: 'application/json' }); const j = JSON.parse(r.body.toString('utf8')); title = j.title || title; author = j.author_name || null; } catch {}
      return { type: 'youtube', url, site: 'YouTube', title, description: author, videoId: vid, image: proxied(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`), color: '#ff0033' };
    }
    const r = await safeGet(url, { maxBytes: 600e3, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' });
    if (/^image\//.test(r.type)) return { type: 'image', url, image: proxied(r.url) };
    if (!/html/.test(r.type)) return null;
    const html = r.body.subarray(0, 128 * 1024).toString('utf8'); // the useful tags are near the top
    const title = meta(html, ['og:title', 'twitter:title']) || decodeHtml(html.match(/<title[^>]{0,100}>([^<]{1,300})<\/title>/i)?.[1]);
    if (!title) return null;
    const img = meta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
    let host = ''; try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch {}
    return {
      type: 'link', url, site: (meta(html, ['og:site_name', 'application-name']) || host).slice(0, 80), title: title.slice(0, 200),
      description: (meta(html, ['og:description', 'twitter:description', 'description']) || '').slice(0, 300) || null,
      image: img ? proxied(new URL(img, r.url).href) : null, color: (meta(html, ['theme-color']) || '').match(/^#[0-9a-f]{3,8}$/i)?.[0] || null,
      large: meta(html, ['twitter:card']) === 'summary_large_image',
    };
  }
  route('GET', '/api/embed', async ({ me, query }) => {
    z.limit('embed:' + me.id, 60, 60e3, 'Slow down a little.');
    const url = String(query.get('url') || '').slice(0, 2000);
    if (!/^https?:\/\//i.test(url)) fail(400, 'Not a link.');
    const hit = embedCache.get(url);
    if (hit && Date.now() - hit.at < 6 * 3600e3) return { embed: hit.data };
    let embed = null;
    try { embed = await buildEmbed(url); } catch {}
    embedCache.set(url, { at: Date.now(), data: embed });
    if (embedCache.size > 800) embedCache.delete(embedCache.keys().next().value);
    return { embed };
  });
  hooks.rawRoutes.push({ path: '/api/embed/img', fn: async (req, res, url) => {
    const u = url.searchParams.get('u') || '';
    if (!u || url.searchParams.get('s') !== signImg(u)) { res.writeHead(403); return res.end(); }
    try {
      const r = await safeGet(u, { maxBytes: 8e6, accept: 'image/*' });
      if (!/^image\/(png|jpe?g|gif|webp|avif)/i.test(r.type) || r.cut) throw new Error('not an image');
      res.writeHead(200, { 'Content-Type': r.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      res.end(r.body);
    } catch { res.writeHead(404); res.end(); }
  } });

  // ======================= Zuno Wrapped =======================
  const wrappedCache = new Map(); // userId|year -> { at, data }
  const EMOJI_RE = /<:[a-z0-9_]{2,32}:[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)>|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
  function wrapped(me, year) {
    const from = Date.UTC(year, 0, 1), to = Date.UTC(year + 1, 0, 1);
    const inYear = m => m.createdAt >= from && m.createdAt < to;
    // Hours are counted in their own time zone.
    let tzOff = 0;
    try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: me.tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date()).map(x => [x.type, x.value])); tzOff = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(Date.now() / 60e3) * 60e3; } catch {}
    const s = { year, messages: 0, words: 0, gifs: 0, voice: 0, polls: 0, files: 0, reactionsGiven: 0, reactionsGot: 0, hours: Array(24).fill(0), months: Array(12).fill(0), days: new Set(), emoji: {}, friends: {}, servers: {}, channels: {}, groups: {}, longest: null, first: null };
    const scan = (msgs, where) => {
      for (const m of msgs) {
        if (!inYear(m)) continue;
        for (const [e, ids] of Object.entries(m.reactions || {})) {
          if (ids.includes(me.id)) { s.reactionsGiven++; s.emoji[e] = (s.emoji[e] || 0) + 1; }
          if (m.authorId === me.id) s.reactionsGot += ids.filter(id => id !== me.id).length;
        }
        if (where.peer && m.authorId === where.peer) s.friends[where.peer] = (s.friends[where.peer] || 0) + 1;
        if (m.authorId !== me.id) continue;
        const d = new Date(m.createdAt + tzOff);
        s.messages++; s.hours[d.getUTCHours()]++; s.months[d.getUTCMonth()]++; s.days.add(d.toISOString().slice(0, 10));
        s.words += (m.content || '').split(/\s+/).filter(Boolean).length;
        if (m.gif) s.gifs++;
        if (m.poll) s.polls++;
        for (const a of m.attachments || []) a.kind === 'voice' ? s.voice++ : s.files++;
        for (const e of (m.content || '').match(EMOJI_RE) || []) s.emoji[e] = (s.emoji[e] || 0) + 1;
        if (where.peer) s.friends[where.peer] = (s.friends[where.peer] || 0) + 1;
        if (where.server) { s.servers[where.server] = (s.servers[where.server] || 0) + 1; s.channels[where.channel] = (s.channels[where.channel] || 0) + 1; }
        if (where.group) s.groups[where.group] = (s.groups[where.group] || 0) + 1;
        if (!s.first || m.createdAt < s.first.createdAt) s.first = { content: (m.content || '').slice(0, 200), createdAt: m.createdAt };
        if ((m.content || '').length > (s.longest?.length || 0)) s.longest = { length: m.content.length, preview: m.content.slice(0, 140) };
      }
    };
    for (const [key, dm] of Object.entries(data.dms)) {
      const ids = key.split(':');
      if (!ids.includes(me.id)) continue;
      const peer = ids[0] === me.id ? ids[1] : ids[0];
      if (peer === z.SYSTEM_ID) continue;
      scan(dm.messages, { peer });
    }
    for (const sv of Object.values(data.servers)) {
      if (!sv.members.includes(me.id)) continue;
      for (const ch of sv.channels) scan(data.channelMessages[ch.id]?.messages || [], { server: sv.id, channel: ch.id });
    }
    for (const g of Object.values(data.groups)) if (g.members.includes(me.id)) scan(data.groupMessages[g.id]?.messages || [], { group: g.id });
    const top = (obj, n, map) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => map(k, v)).filter(Boolean);
    const days = [...s.days].sort();
    let streak = 0, run = 0, prev = null;
    for (const d of days) { run = prev && (Date.parse(d) - Date.parse(prev)) === 864e5 ? run + 1 : 1; streak = Math.max(streak, run); prev = d; }
    const peak = s.hours.indexOf(Math.max(...s.hours));
    const persona = !s.messages ? null : peak < 5 ? ['Night Owl', '🦉', 'You do your best talking after midnight.'] : peak < 10 ? ['Early Bird', '🐦', 'Up and chatting before most people wake up.'] : peak < 14 ? ['Lunch Break Legend', '🥪', 'The middle of the day is your time to shine.'] : peak < 18 ? ['Afternoon Adventurer', '☀️', 'Afternoons are when the group chat comes alive.'] : ['Evening Social', '🌙', 'Evenings with your people are your favorite.'];
    const friendSinceThisYear = data.friendships.filter(([a, b]) => (a === me.id || b === me.id) && (data.friendSince[pairKey(a, b)] || 0) >= from && (data.friendSince[pairKey(a, b)] || 0) < to).length;
    return {
      year, messages: s.messages, words: s.words, gifs: s.gifs, voice: s.voice, polls: s.polls, files: s.files, reactionsGiven: s.reactionsGiven, reactionsGot: s.reactionsGot,
      daysActive: days.length, streak, months: s.months, hours: s.hours, peakHour: peak, persona,
      topEmoji: top(s.emoji, 5, (e, n) => ({ emoji: e, count: n })),
      topFriends: top(s.friends, 5, (id, n) => (data.users[id] && human(data.users[id]) ? { user: publicUser(data.users[id]), count: n } : null)),
      topServers: top(s.servers, 3, (id, n) => (data.servers[id] ? { id, name: data.servers[id].name, icon: data.servers[id].icon || null, iconColor: data.servers[id].iconColor, count: n } : null)),
      topChannel: top(s.channels, 1, (id, n) => { for (const sv of Object.values(data.servers)) { const ch = sv.channels.find(c => c.id === id); if (ch) return { name: ch.name, server: sv.name, count: n }; } return null; })[0] || null,
      first: s.first, longest: s.longest, newFriends: friendSinceThisYear, voiceHours: Math.round((me.stats?.voiceMs || 0) / 3600e3),
      serversJoined: Object.entries(me.joinedAt || {}).filter(([k, t]) => !k.startsWith('g:') && t >= from && t < to).length,
    };
  }
  route('GET', '/api/me/wrapped', async ({ me, query }) => {
    const year = Math.max(2025, Math.min(new Date().getUTCFullYear(), Number(query.get('year')) || new Date().getUTCFullYear()));
    const k = me.id + '|' + year, hit = wrappedCache.get(k);
    if (hit && Date.now() - hit.at < 10 * 60e3) return { wrapped: hit.data };
    const w = wrapped(me, year);
    wrappedCache.set(k, { at: Date.now(), data: w });
    if (wrappedCache.size > 500) wrappedCache.delete(wrappedCache.keys().next().value);
    return { wrapped: w };
  });
  // December 1st: everyone gets a note that their Wrapped is ready.
  function announceWrapped() {
    const n = new Date();
    if (n.getUTCMonth() !== 11 || data.meta.wrappedAnnounced === n.getUTCFullYear()) return;
    data.meta.wrappedAnnounced = n.getUTCFullYear();
    for (const u of users()) if (human(u)) systemMessage(u.id, `🎁 **Your Zuno Wrapped ${n.getUTCFullYear()} is here!**\n\nSee your year on Zuno: your top friends, favorite emoji, your busiest hour and more. Open it from your profile menu (click your avatar at the bottom left) › Zuno Wrapped.`);
    save();
  }

  // ======================= two-factor login (authenticator apps) =======================
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const b32encode = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
  const b32decode = str => { let bits = ''; for (const c of str.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  function totp(secret, step) {
    const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
    const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
    const o = h[h.length - 1] & 15;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
  }
  // Accepts the code from the last, current or next 30 seconds; each code works once.
  function checkTotp(tf, code) {
    const c = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(c)) return false;
    const now = Math.floor(Date.now() / 30000);
    for (const step of [now - 1, now, now + 1]) {
      if (step <= (tf.lastStep || 0)) continue;
      const a = Buffer.from(totp(tf.secret, step)), b = Buffer.from(c);
      if (crypto.timingSafeEqual(a, b)) { tf.lastStep = step; return true; }
    }
    return false;
  }
  const newBackupCodes = () => Array.from({ length: 10 }, () => { const x = crypto.randomBytes(5).toString('hex'); return `${x.slice(0, 5)}-${x.slice(5)}`; });
  // A code from the app, or one of the backup codes (each backup code works once).
  function checkSecondFactor(u, code) {
    if (checkTotp(u.twoFactor, code)) return true;
    const c = String(code || '').trim().toLowerCase();
    const i = (u.twoFactor.backup || []).indexOf(sha(c));
    if (i < 0) return false;
    u.twoFactor.backup.splice(i, 1);
    return true;
  }
  hooks.secondFactor = checkSecondFactor; // used by "Confirm it's you" (zuno43.js)
  route('POST', '/api/me/2fa/setup', async ({ me, body }) => {
    if (me.twoFactor) fail(400, 'Two-factor login is already on.');
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, 'Your password is wrong.');
    const secret = b32encode(crypto.randomBytes(20));
    me.twoFactorPending = { secret, exp: Date.now() + 15 * 60e3 };
    save();
    return { secret, uri: `otpauth://totp/Zuno:${encodeURIComponent(me.username)}?secret=${secret}&issuer=Zuno&digits=6&period=30` };
  });
  route('POST', '/api/me/2fa/enable', async ({ me, body, token }) => {
    const p = me.twoFactorPending;
    if (!p || p.exp < Date.now()) fail(400, 'That setup took too long. Start again.');
    const tf = { secret: p.secret, lastStep: 0 };
    if (!checkTotp(tf, body.code)) fail(400, "That code didn't match. Check the time on your phone and try the newest code.");
    const codes = newBackupCodes();
    me.twoFactor = { ...tf, enabledAt: Date.now(), backup: codes.map(sha) };
    delete me.twoFactorPending;
    z.endSessions(me.id, token);
    systemMessage(me.id, '🔐 **Two-factor login is on.** Next time you log in, Zuno will ask for a code from your authenticator app. Keep your backup codes somewhere safe.');
    save();
    return { backupCodes: codes };
  });
  route('POST', '/api/me/2fa/disable', async ({ me, body }) => {
    if (!me.twoFactor) return { ok: true };
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, 'Your password is wrong.');
    if (!checkSecondFactor(me, body.code)) fail(400, "That code didn't work.");
    delete me.twoFactor;
    systemMessage(me.id, '🔓 **Two-factor login was turned off** for your account. If this wasn\'t you, change your password right away.');
    save();
    return { ok: true };
  });
  route('POST', '/api/me/2fa/backup-codes', async ({ me, body }) => {
    if (!me.twoFactor) fail(400, 'Two-factor login is off.');
    if (!checkSecondFactor(me, body.code)) fail(400, "That code didn't work.");
    const codes = newBackupCodes();
    me.twoFactor.backup = codes.map(sha);
    save();
    return { backupCodes: codes };
  });
  route('POST', '/api/mod/users/:id/2fa-off', async ({ me, params, token }) => {
    z.needStaff(me);
    z.needReauth(token);
    const u = data.users[params.id];
    z.staffGuard(me, u);
    if (!u?.twoFactor) fail(400, "They don't have two-factor login on.");
    delete u.twoFactor;
    systemMessage(u.id, '🔓 **Zuno Staff turned off two-factor login** on your account because you asked for help getting back in. You can turn it on again in Settings › My Account.');
    save();
    return { ok: true };
  });
  const tickets = new Map(); // sha(ticket) -> { uid, exp, tries }
  hooks.login.push(user => {
    if (!user.twoFactor) return null;
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(sha(ticket), { uid: user.id, exp: Date.now() + 5 * 60e3, tries: 0 });
    return { mfa: true, ticket };
  });
  route('POST', '/api/login/2fa', async ({ body, req }) => {
    z.limit('mfa:' + z.clientIp(req), 10, 5 * 60e3, 'Too many tries. Wait a few minutes.');
    const k = sha(body.ticket), t = tickets.get(k);
    if (!t || t.exp < Date.now() || t.tries >= 5) { tickets.delete(k); fail(401, 'That took too long. Log in again.'); }
    const u = data.users[t.uid];
    if (!u?.twoFactor) { tickets.delete(k); fail(401, 'Log in again.'); }
    const f = u.twoFactor.fails && Date.now() - u.twoFactor.fails.at < 15 * 60e3 ? u.twoFactor.fails : { n: 0, at: Date.now() };
    if (f.n >= 10) fail(429, 'Too many wrong codes. Wait 15 minutes and try again.');
    if (!checkSecondFactor(u, body.code)) {
      t.tries++; f.n++; f.at = Date.now(); u.twoFactor.fails = f;
      if (f.n === 10) systemMessage(u.id, '⚠️ **Someone typed 10 wrong two-factor codes for your account**, so code login is paused for 15 minutes. They know your password: change it in Settings › My Account.');
      save(); fail(401, "That code didn't work. Try the newest one from your app, or a backup code.");
    }
    delete u.twoFactor.fails;
    tickets.delete(k);
    save();
    return { token: z.createSession(u.id, req) };
  }, { auth: false });
  setInterval(() => { const now = Date.now(); for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k); for (const [k, s] of oauthStates) if (s.exp < now) oauthStates.delete(k); }, 60e3).unref();

  // ======================= ringtones =======================
  // Jujutsu Kaisen fans get a special ringtone: if either person in a call mentions JJK anywhere on
  // their profile, both of them hear one of the special tones while it rings.
  const JJK_RE = /(^|[^a-z])(jjk|jujutsu|kaisen|yuji|itadori|sukuna|ryomen|gojo|satoru|megumi|fushiguro|nobara|kugisaki|geto|suguru|nanami|kento|toji|zenin|inumaki|okkotsu|mahito|jogo|hanami|choso|kenjaku|hakari|tsukumo|mahoraga|higuruma|yorozu|uraume|aoi todo|todo aoi|domain expansion|infinite void|malevolent shrine|cursed energy|cursed technique|hollow purple|black flash|nah,? i'?d win|stand proud|heaven and earth)(?![a-z])/i;
  const JJK_TONES = ['SpecialTone', 'BlueTone', 'AizoTone'];
  const isJjk = u => !!u && JJK_RE.test([u.displayName, u.username, u.bio, u.customStatus, u.pronouns].filter(Boolean).join(' \n '));
  // (0.43.1) Half the time, so Zuno's own "Call Song" (and its hidden twin) gets heard too.
  hooks.ringtone = (...people) => (people.some(isJjk) && Math.random() < 0.5 ? JJK_TONES[Math.floor(Math.random() * JJK_TONES.length)] : null);
  // Your own ringtone (an MP3 only you hear when someone calls you).
  route('POST', '/api/me/ringtone', async ({ me, body, req }) => {
    const k = z.sniff(body);
    if (!k || k.ext !== 'mp3') fail(400, 'Ringtones must be MP3 files.');
    z.removeUpload(me.ringtone?.url);
    me.ringtone = { url: z.storeUpload(body, 'mp3'), name: clean(decodeURIComponent(req.headers['x-file-name'] || 'ringtone.mp3'), 80) };
    save();
    return { ringtone: me.ringtone };
  }, { raw: 4_000_000 });
  route('DELETE', '/api/me/ringtone', async ({ me }) => {
    z.removeUpload(me.ringtone?.url);
    me.ringtone = null;
    save();
    return { ringtone: null };
  });

  // ======================= start =======================
  function start() {
    celebrate();
    announceWrapped();
    setInterval(() => { celebrate(); announceWrapped(); }, 10 * 60e3).unref();
  }
  return { start, spotifyReady };
};
