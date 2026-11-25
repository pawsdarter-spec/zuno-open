// Zuno 0.15: soundboards, saved messages & reminders, read receipts, seasonal events,
// server insights, close friends, DM & server-folder layouts, and profile widgets.
// index.js hands everything this needs over in `z`.
module.exports = function hangout(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser, systemMessage } = z;
  const users = () => Object.values(data.users);
  const human = u => u && !u.bot && !u.system;

  // New settings: read receipts and hearing soundboard sounds are on unless switched off.
  for (const k of ['readReceipts']) if (!z.PREF_BOOLS.includes(k)) z.PREF_BOOLS.push(k);
  Object.assign(z.PREF_DEFAULTS, { readReceipts: true });

  // ======================= soundboard =======================
  Object.assign(z.PERM_INFO, { use_soundboard: { label: 'Use Soundboard', group: 'Voice', channel: true } });
  if (!z.PERM_KEYS.includes('use_soundboard')) z.PERM_KEYS.push('use_soundboard');
  if (!z.DEFAULT_EVERYONE.includes('use_soundboard')) z.DEFAULT_EVERYONE.push('use_soundboard');
  for (const sv of Object.values(data.servers)) {
    if (sv.permsV15) continue;
    z.ensureRoles(sv);
    const everyone = sv.roles[sv.roles.length - 1];
    if (everyone && !everyone.perms.includes('use_soundboard')) everyone.perms.push('use_soundboard');
    sv.permsV15 = true;
  }
  const MAX_SOUNDS = 24, MAX_SOUND_BYTES = 512_000;
  // Zuno's own sounds are made in the app (no files), and everyone can use them anywhere.
  const BUILTIN = { ding: ['Ding', '🔔'], tada: ['Ta-da!', '🎉'], airhorn: ['Air Horn', '📯'], boing: ['Boing', '🦘'], sadtrombone: ['Sad Trombone', '😢'], drumroll: ['Drumroll', '🥁'], applause: ['Applause', '👏'], crickets: ['Crickets', '🦗'] };
  const soundView = sv => s => ({ id: s.id, name: s.name, emoji: s.emoji || null, volume: s.volume ?? 1, serverId: sv.id });
  hooks.serverSummary.push(sv => ({ sounds: (sv.sounds || []).map(soundView(sv)) }));
  route('POST', '/api/servers/:id/sounds', async ({ me, params, body, req }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    sv.sounds ||= [];
    const maxSounds = z.svLimits(sv).sounds || MAX_SOUNDS;
    if (sv.sounds.length >= maxSounds) fail(400, `This server can have up to ${maxSounds} soundboard sounds${z.svLimits(sv).level < 3 ? '. Server Blooming unlocks more' : ''}.`);
    const k = z.sniff(body);
    if (!k || k.ext !== 'mp3') fail(400, 'Soundboard sounds must be MP3 files.');
    const secs = Number(req.headers['x-duration']) || 0;
    if (secs > 5.5) fail(400, 'Soundboard sounds can be up to 5 seconds long.');
    const name = clean(decodeURIComponent(req.headers['x-sound-name'] || ''), 32);
    if (name.length < 2) fail(400, 'Give the sound a name (2–32 characters).');
    const emoji = clean(decodeURIComponent(req.headers['x-sound-emoji'] || ''), 16) || null;
    const url = z.storeUpload(body, 'mp3');
    const s = { id: url.split('/').pop(), name, emoji, volume: 1, by: me.id, at: Date.now() };
    sv.sounds.push(s);
    z.audit(sv, me, 'sound_create', { type: 'sound', id: s.id, name });
    save(); z.refreshServer(sv);
    return { sound: soundView(sv)(s) };
  }, { raw: MAX_SOUND_BYTES });
  route('PATCH', '/api/servers/:id/sounds/:soundId', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    const s = (sv.sounds || []).find(x => x.id === params.soundId);
    if (!s) fail(404, 'Sound not found.');
    if ('name' in body) { const n = clean(body.name, 32); if (n.length < 2) fail(400, 'Give the sound a name.'); s.name = n; }
    if ('emoji' in body) s.emoji = clean(body.emoji, 16) || null;
    if ('volume' in body) s.volume = Math.max(0.1, Math.min(1, Number(body.volume) || 1));
    save(); z.refreshServer(sv);
    return { sound: soundView(sv)(s) };
  });
  route('DELETE', '/api/servers/:id/sounds/:soundId', async ({ me, params }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    const s = (sv.sounds || []).find(x => x.id === params.soundId);
    if (!s) fail(404, 'Sound not found.');
    sv.sounds = sv.sounds.filter(x => x !== s);
    z.removeUpload('/uploads/' + s.id);
    z.audit(sv, me, 'sound_delete', { type: 'sound', id: s.id, name: s.name });
    save(); z.refreshServer(sv);
    return { ok: true };
  });
  // Play a sound for everyone in your call or voice channel.
  route('POST', '/api/rtc/sound', async ({ me, body }) => {
    const roomId = String(body.room || '');
    const room = z.rooms.get(roomId);
    if (!room?.has(me.id)) fail(400, 'Join a call first.');
    z.limit('sb:' + me.id, 1, 1500, 'Give it a second!');
    z.limit('sbm:' + me.id, 15, 60e3, "That's a lot of sounds. Take a little break!");
    const [where, id] = String(body.sound || '').split(':');
    let sound;
    if (where === 'zuno') {
      if (!BUILTIN[id]) fail(400, 'Unknown sound.');
      sound = { builtin: id, name: BUILTIN[id][0], emoji: BUILTIN[id][1] };
    } else {
      // (0.39) Any server's sounds, as long as you're in that server, in any call (like stickers).
      const sv = data.servers[where];
      const s = sv?.sounds?.find(x => x.id === id);
      if (!s || !sv.members.includes(me.id)) fail(404, 'Sound not found.');
      sound = { url: '/uploads/' + s.id, name: s.name, emoji: s.emoji, volume: s.volume ?? 1 };
    }
    if (roomId.startsWith('vc:')) {
      const { sv, ch } = z.findChannel(roomId.slice(3));
      if (sv && !z.permsIn(sv, ch, me.id).has('use_soundboard')) fail(403, "You don't have permission to use the soundboard here.");
    }
    for (const uid of room.keys()) send(uid, 'rtc-sound', { room: roomId, from: me.id, sound });
    return { ok: true };
  });

  // ======================= saved messages & reminders =======================
  const MAX_SAVED = 200;
  const savedView = s => ({ ...s, author: publicUser(data.users[s.snap.authorId]) });
  route('GET', '/api/me/saved', async ({ me }) => ({ saved: (me.saved || []).slice().sort((a, b) => b.savedAt - a.savedAt).map(savedView) }));
  route('POST', '/api/me/saved', async ({ me, body }) => {
    const conv = z.convOf(me, String(body.conv || ''));
    const { m } = z.findMessage(conv, String(body.msgId || ''));
    me.saved ||= [];
    let s = me.saved.find(x => x.msgId === m.id);
    if (!s) {
      if (me.saved.length >= MAX_SAVED) fail(400, `You can save up to ${MAX_SAVED} messages. Remove some first.`);
      const where = conv.kind === 'channel' ? `#${conv.channel.name} in ${conv.server.name}` : conv.kind === 'group' ? (conv.group.name || 'a group chat') : `your DM with ${conv.other.displayName}`;
      s = { id: newId(), conv: String(body.conv), msgId: m.id, savedAt: Date.now(), remindAt: null, snap: { authorId: m.authorId, content: (m.content || (m.attachments ? '📎 Attachment' : m.gif ? 'GIF' : m.poll ? `📊 ${m.poll.question}` : '')).slice(0, 500), createdAt: m.createdAt, where } };
      me.saved.push(s);
    }
    const inMs = Number(body.remindIn) || 0;
    if (inMs) s.remindAt = Date.now() + Math.max(60e3, Math.min(inMs, 365 * 864e5));
    else if (body.remindIn === 0) s.remindAt = null;
    save(); send(me.id, 'saved', {});
    return { saved: savedView(s) };
  });
  route('DELETE', '/api/me/saved/:id', async ({ me, params }) => {
    me.saved = (me.saved || []).filter(s => s.id !== params.id && s.msgId !== params.id);
    save(); send(me.id, 'saved', {});
    return { ok: true };
  });
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const u of users()) for (const s of u.saved || []) {
      if (!s.remindAt || s.remindAt > now) continue;
      s.remindAt = null; s.remindedAt = now; changed = true;
      const who = data.users[s.snap.authorId]?.displayName || 'someone';
      systemMessage(u.id, `⏰ **Reminder:** you saved a message from **${who}** in ${s.snap.where}:\n> ${(s.snap.content || '').replace(/\n/g, ' ').slice(0, 300) || '(no text)'}\n\nOpen **Saved Messages** (the 🔖 in the top bar) to jump to it.`);
      send(u.id, 'saved', {});
      z.notify?.(u.id, { type: 'reminder', from: s.snap.authorId, conv: s.conv, msgId: s.msgId, text: (s.snap.content || '').slice(0, 140), title: s.snap.where });
    }
    if (changed) save();
  }, 15e3).unref();

  // ======================= read receipts ("Seen") =======================
  // Only between two people who both have read receipts on.
  const receipts = u => ({ ...z.PREF_DEFAULTS, ...(u?.prefs || {}) }).readReceipts !== false;
  hooks.onRead.push((conv, me, at) => {
    if (conv.kind !== 'dm' || !receipts(me) || !receipts(conv.other)) return;
    send(conv.other.id, 'seen', { conv: me.id, at });
  });
  hooks.dmExtras.push((conv, me) => (receipts(me) && receipts(conv.other) ? { peerSeen: conv.other.lastRead?.[conv.key] || 0 } : { peerSeen: null }));

  // ======================= seasonal events =======================
  // October: Halloween. December: Winter. Limited decorations and effects can only be picked up
  // during their event, and you keep the ones you used.
  const SEASONS = {
    halloween: { month: 10, name: 'Spooky Season', decorations: ['pumpkin', 'witch_hat', 'bat_wings'], effects: ['spooky'] },
    winter: { month: 12, name: 'Winter Wonderland', decorations: ['santa_hat', 'snow_globe', 'antlers'], effects: ['blizzard'] },
  };
  const season = () => process.env.ZUNO_SEASON || Object.keys(SEASONS).find(k => SEASONS[k].month === new Date().getUTCMonth() + 1) || null;
  const limitedOf = key => Object.entries(SEASONS).find(([, s]) => s.decorations.includes(key) || s.effects.includes(key))?.[0] || null;
  hooks.canUseFlair = (me, key) => {
    const ev = limitedOf(key);
    if (!ev) return false;
    me.collected ||= [];
    if (me.collected.includes(key)) return true;
    if (season() !== ev) fail(400, `That one was only available during ${SEASONS[ev].name}.`);
    me.collected.push(key); // picked up during the event: yours to keep
    return true;
  };
  hooks.meExtras.push(me => ({ season: season() ? { key: season(), ...SEASONS[season()] } : null, collected: me.collected || [], seasons: SEASONS }));

  // ======================= server insights =======================
  route('GET', '/api/servers/:id/insights', async ({ me, params, query }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    if (!z.can(sv, me.id, 'manage_server') && !z.can(sv, me.id, 'view_audit_log')) fail(403, 'You need Manage Server or View Audit Log to see insights.');
    const tz = Math.max(-840, Math.min(840, Number(query.get('tz')) || 0)) * 60e3; // the viewer's offset, so hours are their hours
    const DAY = 864e5, now = Date.now(), from = now - 30 * DAY;
    const dayIndex = t => Math.floor((now - t) / DAY);
    const daily = Array(30).fill(0), heat = Array.from({ length: 7 }, () => Array(24).fill(0)), byMember = {}, byChannel = {};
    const active7 = new Set(), active30 = new Set();
    for (const ch of sv.channels) {
      for (const m of data.channelMessages[ch.id]?.messages || []) {
        if (m.createdAt < from || !data.users[m.authorId] || !human(data.users[m.authorId])) continue;
        daily[29 - dayIndex(m.createdAt)]++;
        const d = new Date(m.createdAt + tz);
        heat[d.getUTCDay()][d.getUTCHours()]++;
        byMember[m.authorId] = (byMember[m.authorId] || 0) + 1;
        byChannel[ch.id] = (byChannel[ch.id] || 0) + 1;
        active30.add(m.authorId);
        if (m.createdAt > now - 7 * DAY) active7.add(m.authorId);
      }
    }
    const members = sv.members.filter(id => human(data.users[id]));
    const joinedAt = id => data.users[id]?.joinedAt?.[sv.id] || (id === sv.ownerId ? sv.createdAt : sv.createdAt);
    const joins = Array(30).fill(0);
    for (const id of members) { const t = joinedAt(id); if (t >= from) joins[29 - dayIndex(t)]++; }
    // Members over time: everyone still here, counted from the day they joined.
    const growth = Array.from({ length: 30 }, (_, i) => { const end = now - (29 - i) * DAY; return members.filter(id => joinedAt(id) <= end).length; });
    let peak = { day: 0, hour: 0, count: 0 };
    heat.forEach((row, d) => row.forEach((n, h) => { if (n > peak.count) peak = { day: d, hour: h, count: n }; }));
    return {
      members: members.length, online: members.filter(id => z.isOnline(id) && data.users[id]?.status !== 'invisible').length, bots: sv.members.length - members.length,
      newMembers7: members.filter(id => joinedAt(id) > now - 7 * DAY).length, active7: active7.size, active30: active30.size,
      messages30: daily.reduce((a, b) => a + b, 0), messages7: daily.slice(-7).reduce((a, b) => a + b, 0), daily, joins, growth, heat, peak,
      topMembers: Object.entries(byMember).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ user: publicUser(data.users[id]), count: n })),
      topChannels: Object.entries(byChannel).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ name: sv.channels.find(c => c.id === id)?.name || '?', count: n })),
    };
  });

  // ======================= close friends =======================
  // A list of your closest friends, and a status (with an optional photo, like a story) only they see.
  const CF_MAX = 50;
  const cfActive = u => (u.cfStatus && u.cfStatus.until > Date.now() ? u.cfStatus : null);
  function cfFor(viewer) {
    const out = {};
    for (const id of z.friendIds(viewer.id)) { const u = data.users[id]; if (u?.closeFriends?.includes(viewer.id) && cfActive(u)) out[id] = cfActive(u); }
    return out;
  }
  const pushCf = u => { for (const id of u.closeFriends || []) send(id, 'cf-status', { userId: u.id, status: cfActive(u) }); };
  hooks.meExtras.push(me => ({ closeFriends: (me.closeFriends || []).filter(id => z.areFriends(me.id, id)), closeStatuses: cfFor(me), myCfStatus: cfActive(me) }));
  route('PUT', '/api/me/close-friends/:id', async ({ me, params, body }) => {
    const id = params.id;
    if (!z.areFriends(me.id, id)) fail(400, 'Only friends can be close friends.');
    me.closeFriends = (me.closeFriends || []).filter(x => x !== id);
    if (body.on) { if (me.closeFriends.length >= CF_MAX) fail(400, `Close Friends can have up to ${CF_MAX} people.`); me.closeFriends.push(id); }
    save();
    send(id, 'cf-status', { userId: me.id, status: body.on ? cfActive(me) : null });
    return { closeFriends: me.closeFriends };
  });
  // Pictures someone uploaded for their Close Friends status or a widget. Only these (or what they
  // already use) are accepted, so nobody can point at (and later delete) someone else's file.
  const inUse = me => [me.cfStatus?.image, ...(me.widgets || []).filter(w => w.type === 'photo').map(w => w.url)].filter(Boolean);
  const ownsUpload = (me, url) => typeof url === 'string' && /^\/uploads\/[\w.]+$/.test(url) && ((me.myUploads || []).includes(url) || inUse(me).includes(url));
  function rememberUpload(me, url) {
    me.myUploads = [...(me.myUploads || []), url];
    // Keep the 10 newest; older ones nobody uses are deleted.
    while (me.myUploads.length > 10) { const old = me.myUploads.shift(); if (!inUse(me).includes(old)) z.removeUpload(old); }
    save();
  }
  route('PUT', '/api/me/cf-status', async ({ me, body }) => {
    const text = clean(body.text, 120), image = ownsUpload(me, body.image) ? body.image : null;
    if (!text && !image) { if (me.cfStatus?.image) z.removeUpload(me.cfStatus.image); me.cfStatus = null; }
    else {
      if (me.cfStatus?.image && me.cfStatus.image !== image) z.removeUpload(me.cfStatus.image);
      const hours = [1, 4, 8, 24].includes(Number(body.hours)) ? Number(body.hours) : 24;
      me.cfStatus = { text, emoji: clean(body.emoji, 16) || null, image, at: Date.now(), until: Date.now() + hours * 3600e3 };
    }
    save(); pushCf(me);
    return { cfStatus: cfActive(me) };
  });
  route('POST', '/api/me/cf-photo', async ({ me, body }) => {
    z.limit('photo-up:' + me.id, 20, 3600e3, "You've uploaded a lot of pictures. Try again later.");
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF picture.');
    const url = z.storeUpload(body, k.ext);
    rememberUpload(me, url);
    return { url };
  }, { raw: 5_000_000 });

  // ======================= layouts: DM pins & categories, server folders =======================
  const convRe = /^(ch:|g:)?[A-Za-z0-9_-]{2,48}$/;
  hooks.meExtras.push(me => ({ dmLayout: me.dmLayout || { pinned: [], cats: [] }, railLayout: me.railLayout || [] }));
  route('PUT', '/api/me/dm-layout', async ({ me, body }) => {
    const ids = v => (Array.isArray(v) ? v.map(String).filter(x => convRe.test(x)) : []);
    const pinned = [...new Set(ids(body.pinned))].slice(0, 20);
    const cats = (Array.isArray(body.cats) ? body.cats : []).slice(0, 12).map(c => ({ id: clean(c.id, 24) || newId(), name: clean(c.name, 32) || 'Category', convs: [...new Set(ids(c.convs))].filter(x => !pinned.includes(x)).slice(0, 100), collapsed: !!c.collapsed }));
    me.dmLayout = { pinned, cats };
    save(); send(me.id, 'layout', {});
    return { dmLayout: me.dmLayout };
  });
  route('PUT', '/api/me/rail-layout', async ({ me, body }) => {
    const mine = new Set(Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => sv.id));
    const seen = new Set();
    const out = [];
    for (const item of (Array.isArray(body.layout) ? body.layout : []).slice(0, 200)) {
      if (typeof item === 'string') { if (mine.has(item) && !seen.has(item)) { seen.add(item); out.push(item); } continue; }
      const servers = (Array.isArray(item?.servers) ? item.servers : []).map(String).filter(id => mine.has(id) && !seen.has(id));
      servers.forEach(id => seen.add(id));
      if (servers.length) out.push({ id: clean(item.id, 24) || newId(), name: clean(item.name, 32), color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : null, servers, open: !!item.open });
    }
    me.railLayout = out;
    save(); send(me.id, 'layout', {});
    return { railLayout: out };
  });

  // ======================= profile widgets =======================
  const WIDGETS = ['games', 'song', 'photo', 'text', 'faves'];
  function cleanWidget(w, me) {
    if (!w || !WIDGETS.includes(w.type)) return null;
    if (w.type === 'games') { const items = (Array.isArray(w.items) ? w.items : []).slice(0, 6).map(i => ({ name: clean(i?.name, 40), emoji: clean(i?.emoji, 16) || '🎮' })).filter(i => i.name); return items.length ? { type: 'games', items } : null; }
    if (w.type === 'song') { const title = clean(w.title, 80); if (!title) return null; const url = typeof w.url === 'string' && /^https:\/\/[^\s<>"]{4,300}$/.test(w.url) ? w.url : null; return { type: 'song', title, artist: clean(w.artist, 80), url }; }
    if (w.type === 'photo') { if (!ownsUpload(me, w.url)) return null; return { type: 'photo', url: w.url, caption: clean(w.caption, 100) }; }
    if (w.type === 'text') { const body = clean(w.body, 300); return body ? { type: 'text', title: clean(w.title, 40) || 'About', body } : null; }
    if (w.type === 'faves') { const items = (Array.isArray(w.items) ? w.items : []).slice(0, 8).map(i => clean(i, 40)).filter(Boolean); return items.length ? { type: 'faves', title: clean(w.title, 40) || 'Favorites', items } : null; }
    return null;
  }
  hooks.patchMe.push((me, body) => {
    if (!('widgets' in body)) return;
    const next = (Array.isArray(body.widgets) ? body.widgets : []).slice(0, 4).map(w => cleanWidget(w, me)).filter(Boolean);
    for (const old of me.widgets || []) if (old.type === 'photo' && !next.some(n => n.url === old.url)) z.removeUpload(old.url);
    me.widgets = next;
  });
  hooks.publicUser.push(u => ({ widgets: u.widgets || [] }));
  route('POST', '/api/me/widget-photo', async ({ me, body }) => {
    z.limit('photo-up:' + me.id, 20, 3600e3, "You've uploaded a lot of pictures. Try again later.");
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF picture.');
    const url = z.storeUpload(body, k.ext);
    rememberUpload(me, url);
    return { url };
  }, { raw: 4_000_000 });

  return {};
};
