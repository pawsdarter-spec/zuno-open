// Zuno 0.16, part two: stage channels, voice channel status, role pickers (reaction roles),
// onboarding questions, Server Blooming, and server backups.
module.exports = function community(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser } = z;

  // ======================= stage channels =======================
  // A voice channel with stage: true. Speakers talk; everyone else listens and can raise a hand.
  Object.assign(z.PERM_INFO, { manage_stage: { label: 'Stage Moderator', group: 'Voice', channel: true } });
  if (!z.PERM_KEYS.includes('manage_stage')) z.PERM_KEYS.push('manage_stage');
  const stages = new Map(); // channelId -> { speakers: Set, hands: Set, startedAt }
  const isStageRoom = roomId => roomId.startsWith('vc:') && z.findChannel(roomId.slice(3)).ch?.stage;
  const stageMod = (sv, ch, uid) => z.can(sv, uid, 'manage_stage', ch) || z.can(sv, uid, 'manage_channels', ch);
  const stageView = ch => { const s = stages.get(ch.id); return { topic: ch.stageTopic || '', speakers: s ? [...s.speakers] : [], hands: s ? [...s.hands] : [], startedAt: s?.startedAt || null }; };
  function pushStage(sv, ch) {
    const view = { serverId: sv.id, channelId: ch.id, ...stageView(ch) };
    for (const id of sv.members) if (z.canView(sv, ch, id)) send(id, 'stage', view);
  }
  hooks.serverSummary.push(sv => ({ stages: Object.fromEntries(sv.channels.filter(c => c.stage).map(c => [c.id, stageView(c)])) }));
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (!roomId.startsWith('vc:')) return;
    const { sv, ch } = z.findChannel(roomId.slice(3));
    if (!sv) return;
    if (ch.stage) {
      let s = stages.get(ch.id);
      if (what === 'join') {
        if (!s) stages.set(ch.id, (s = { speakers: new Set(), hands: new Set(), startedAt: Date.now() }));
        // Stage moderators start as speakers; everyone else listens (muted).
        if (stageMod(sv, ch, uid)) s.speakers.add(uid);
        else { const st = room.get(uid); if (st) st.muted = true; }
      } else if (s) {
        s.speakers.delete(uid); s.hands.delete(uid);
        if (!room.size) { stages.delete(ch.id); ch.stageTopic = ''; save(); }
      }
      pushStage(sv, ch);
    }
    // Voice channel status clears itself when everyone leaves.
    if (what === 'leave' && !room.size && ch.voiceStatus) { ch.voiceStatus = null; save(); pushStatus(sv, ch); }
  });
  hooks.rtcState.push((roomId, me, st) => {
    if (!isStageRoom(roomId)) return;
    const { ch } = z.findChannel(roomId.slice(3));
    if (!st.muted && !stages.get(ch.id)?.speakers.has(me.id)) fail(403, "You're in the audience. Raise your hand to ask to speak.");
  });
  const stageFor = (me, chId) => {
    const { sv, ch } = z.findChannel(chId);
    if (!sv || !ch?.stage || !sv.members.includes(me.id) || !z.canView(sv, ch, me.id)) fail(404, 'Stage not found.');
    return { sv, ch, s: stages.get(ch.id), inRoom: z.roomMembers('vc:' + ch.id).includes(me.id) };
  };
  route('POST', '/api/stage/:id/hand', async ({ me, params, body }) => {
    const { sv, ch, s, inRoom } = stageFor(me, params.id);
    if (!inRoom || !s) fail(400, 'Join the stage first.');
    if (body.up === false) s.hands.delete(me.id); else if (!s.speakers.has(me.id)) s.hands.add(me.id);
    pushStage(sv, ch);
    return { ok: true };
  });
  // Moderators invite someone up or move them back to the audience; anyone can step down.
  route('POST', '/api/stage/:id/speaker', async ({ me, params, body }) => {
    const { sv, ch, s } = stageFor(me, params.id);
    const uid = String(body.userId || me.id);
    if (!s || !z.roomMembers('vc:' + ch.id).includes(uid)) fail(400, "They're not on the stage.");
    const mod = stageMod(sv, ch, me.id);
    if (body.on) {
      if (!mod) fail(403, 'Only stage moderators can invite people to speak.');
      s.speakers.add(uid); s.hands.delete(uid);
      send(uid, 'stage-invited', { channelId: ch.id, by: me.id });
    } else {
      if (uid !== me.id && !mod) fail(403, 'Only stage moderators can move people to the audience.');
      s.speakers.delete(uid);
      const room = z.rooms.get('vc:' + ch.id);
      const st = room?.get(uid);
      if (st && !st.muted) { st.muted = true; for (const id of room.keys()) send(id, 'rtc-state', { room: 'vc:' + ch.id, userId: uid, ...st }); }
      send(uid, 'stage-audience', { channelId: ch.id });
    }
    pushStage(sv, ch);
    return { ok: true };
  });
  route('PUT', '/api/stage/:id/topic', async ({ me, params, body }) => {
    const { sv, ch } = stageFor(me, params.id);
    if (!stageMod(sv, ch, me.id)) fail(403, 'Only stage moderators can change the topic.');
    ch.stageTopic = clean(body.topic, 120);
    save(); pushStage(sv, ch);
    return { ok: true };
  });

  // ======================= voice channel status =======================
  // "grinding ranked 🎮" under a voice channel's name. Anyone in the channel can set it.
  function pushStatus(sv, ch) { for (const id of sv.members) if (z.canView(sv, ch, id)) send(id, 'voice-status', { serverId: sv.id, channelId: ch.id, status: ch.voiceStatus || null }); }
  route('PUT', '/api/channels/:id/voice-status', async ({ me, params, body }) => {
    const { sv, ch } = z.findChannel(params.id);
    if (!sv || ch.type !== 'voice' || !sv.members.includes(me.id) || !z.canView(sv, ch, me.id)) fail(404, 'Voice channel not found.');
    const inside = z.roomMembers('vc:' + ch.id).includes(me.id);
    if (!inside && !z.can(sv, me.id, 'manage_channels', ch)) fail(403, 'Join the voice channel to set its status.');
    const text = clean(body.text, 60);
    if (text && text !== ch.voiceStatus?.text) await z.judgeText({ 'voice channel status': text });
    ch.voiceStatus = text ? { text, by: me.id, at: Date.now() } : null;
    save(); pushStatus(sv, ch);
    return { voiceStatus: ch.voiceStatus };
  });

  // ======================= role pickers (reaction roles) =======================
  // A message with buttons: click (or react with the emoji) to give yourself a role.
  route('POST', '/api/servers/:id/role-pickers', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_roles');
    const conv = z.channelConv(me, String(body.channelId || ''));
    if (conv.server.id !== sv.id || conv.channel.type !== 'text') fail(400, 'Pick a text channel in this server.');
    const options = (Array.isArray(body.options) ? body.options : []).slice(0, 20).map(o => {
      const role = z.roleById(sv, String(o.roleId || ''));
      if (!role || role.everyone) fail(400, 'Pick real roles for every option.');
      if (!z.canEditRole(sv, me.id, role)) fail(403, `"${role.name}" is at or above your highest role, so you can't hand it out.`);
      if ((role.perms || []).some(p => ['administrator', 'manage_server', 'manage_roles', 'ban_members', 'kick_members', 'manage_channels'].includes(p))) fail(400, `"${role.name}" has moderator permissions. Role pickers are for roles anyone can take.`);
      return { roleId: role.id, emoji: clean(o.emoji, 64) || null, label: clean(o.label, 40) || role.name, description: clean(o.description, 80) || '' };
    });
    if (!options.length) fail(400, 'Add at least one role.');
    if (new Set(options.map(o => o.roleId)).size !== options.length) fail(400, 'Each role can only be in the picker once.');
    const rolePicker = { title: clean(body.title, 80) || 'Pick your roles', description: clean(body.description, 300), multi: body.multi !== false, options };
    const message = z.postMessage(conv, me, '', { rolePicker });
    z.audit(sv, me, 'role_picker', { type: 'channel', id: conv.channel.id, name: conv.channel.name }, rolePicker.title);
    return { message };
  });
  function pick(sv, uid, message, roleId, want) {
    const rp = message.rolePicker;
    const opt = rp?.options.find(o => o.roleId === roleId);
    if (!opt || !z.roleById(sv, roleId)) fail(404, 'That role is no longer in this picker.');
    const mine = new Set(sv.memberRoles[uid] || []);
    const has = mine.has(roleId);
    const on = want ?? !has;
    if (on) { if (!rp.multi) for (const o of rp.options) mine.delete(o.roleId); mine.add(roleId); } else mine.delete(roleId);
    sv.memberRoles[uid] = [...mine];
    save(); z.refreshServer(sv);
    return { roles: sv.memberRoles[uid], on };
  }
  route('POST', '/api/channels/:id/messages/:msgId/pick', async ({ me, params, body }) => {
    const conv = z.channelConv(me, params.id);
    const { m } = z.findMessage(conv, params.msgId);
    if (!m.rolePicker) fail(400, "That message isn't a role picker.");
    return pick(conv.server, me.id, m, String(body.roleId || ''));
  });
  hooks.onReact.push(({ conv, me, message, emoji, added }) => {
    if (conv.kind !== 'channel' || !message.rolePicker) return;
    const opt = message.rolePicker.options.find(o => o.emoji && o.emoji === emoji);
    if (opt) try { pick(conv.server, me.id, message, opt.roleId, added); } catch {}
  });

  // ======================= onboarding questions =======================
  // New members answer a few questions and get roles to match.
  const cleanOnboarding = (sv, me, b) => ({
    enabled: !!b.enabled, welcome: clean(b.welcome, 300),
    questions: (Array.isArray(b.questions) ? b.questions : []).slice(0, 8).map(q => ({
      id: clean(q.id, 24) || newId(), title: clean(q.title, 100) || 'Question', multi: !!q.multi, required: !!q.required,
      options: (Array.isArray(q.options) ? q.options : []).slice(0, 12).map(o => ({
        id: clean(o.id, 24) || newId(), label: clean(o.label, 50) || 'Option', emoji: clean(o.emoji, 64) || null, description: clean(o.description, 100),
        roleIds: (Array.isArray(o.roleIds) ? o.roleIds : []).map(String).filter(id => { const r = z.roleById(sv, id); return r && !r.everyone && z.canEditRole(sv, me.id, r); }).slice(0, 5),
      })).filter(o => o.label),
    })).filter(q => q.options.length),
  });
  hooks.serverSummary.push((sv, me) => ({ onboarding: sv.onboarding?.enabled || (me && z.can(sv, me.id, 'manage_server')) ? sv.onboarding || null : null, onboarded: !!(me && (sv.onboarded?.[me.id] || sv.ownerId === me.id)) }));
  route('PUT', '/api/servers/:id/onboarding', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_server');
    sv.onboarding = cleanOnboarding(sv, me, body);
    if (sv.onboarding.enabled && !sv.onboarding.questions.length) fail(400, 'Add at least one question with options first.');
    z.audit(sv, me, 'onboarding_update', { type: 'server', id: sv.id, name: sv.name }, sv.onboarding.enabled ? 'on' : 'off');
    save(); z.refreshServer(sv);
    return { onboarding: sv.onboarding };
  });
  route('POST', '/api/servers/:id/onboarding/answers', async ({ me, params, body }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    const ob = sv.onboarding;
    if (!ob?.enabled) fail(400, "This server doesn't have onboarding.");
    const answers = body.answers || {};
    const give = new Set();
    for (const q of ob.questions) {
      const picked = (Array.isArray(answers[q.id]) ? answers[q.id] : []).map(String).filter(id => q.options.some(o => o.id === id));
      if (q.required && !picked.length && !body.skip) fail(400, `Please answer "${q.title}".`);
      for (const id of q.multi ? picked : picked.slice(0, 1)) for (const r of q.options.find(o => o.id === id).roleIds) if (z.roleById(sv, r)) give.add(r);
    }
    sv.memberRoles[me.id] = [...new Set([...(sv.memberRoles[me.id] || []), ...give])];
    sv.onboarded ||= {};
    sv.onboarded[me.id] = Date.now();
    save(); z.refreshServer(sv);
    return { roles: sv.memberRoles[me.id] };
  });

  // ======================= Server Blooming =======================
  // Zuno Bloom comes with 2 Server Blooms. Bloom a server to unlock perks for everyone in it.
  const BLOOMS_PER_USER = 2;
  const LEVELS = [
    { level: 0, need: 0, emoji: 50, sounds: 24 },
    { level: 1, need: 2, emoji: 100, sounds: 36 },
    { level: 2, need: 6, emoji: 150, sounds: 48 },
    { level: 3, need: 12, emoji: 250, sounds: 72 },
  ];
  // Blooms only count while the person still has Zuno Bloom and is still in the server.
  const activeBlooms = sv => Object.values(data.users).flatMap(u => (z.hasBloom(u) && sv.members.includes(u.id) ? (u.serverBlooms || []).filter(b => b.serverId === sv.id).map(b => ({ ...b, userId: u.id })) : []));
  function blooming(sv) {
    const list = activeBlooms(sv);
    const lv = [...LEVELS].reverse().find(l => list.length >= l.need);
    const next = LEVELS.find(l => l.need > list.length) || null;
    const bloomers = [...new Set(list.map(b => b.userId))];
    return { count: list.length, level: lv.level, next: next ? { level: next.level, need: next.need } : null, bloomers, perks: { emoji: lv.emoji, sounds: lv.sounds, hdStreams: lv.level >= 2, animatedIcon: lv.level >= 1, glow: lv.level >= 3 } };
  }
  z.svLimits = sv => { const b = blooming(sv); return { emoji: b.perks.emoji, sounds: b.perks.sounds, level: b.level }; };
  hooks.serverSummary.push(sv => ({ blooming: blooming(sv) }));
  const mineFree = me => (z.hasBloom(me) ? BLOOMS_PER_USER : 0) - (me.serverBlooms || []).length;
  hooks.meExtras.push(me => ({ serverBlooms: { total: z.hasBloom(me) ? BLOOMS_PER_USER : 0, used: (me.serverBlooms || []).map(b => ({ serverId: b.serverId, at: b.at })) } }));
  route('POST', '/api/servers/:id/bloom', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    if (!z.hasBloom(me)) fail(403, 'Server Blooms come with Zuno Bloom: you get 2 to give to your favorite servers.');
    if (mineFree(me) <= 0) fail(400, "You've used both of your Server Blooms. Take one back from another server first.");
    const before = blooming(sv).level;
    me.serverBlooms = [...(me.serverBlooms || []), { id: newId(), serverId: sv.id, at: Date.now() }];
    save();
    const after = blooming(sv);
    const ch = sv.channels.find(c => c.id === sv.welcomeChannelId && c.type === 'text') || sv.channels.find(c => c.type === 'text');
    if (ch) z.postMessage(z.channelConvFor(sv, ch), data.users[z.SYSTEM_ID], `🌸 **${me.displayName}** just bloomed the server!${after.level > before ? ` ${sv.name} reached **Level ${after.level}**! 🎉` : ''}`);
    z.refreshServer(sv);
    return { blooming: after };
  });
  route('DELETE', '/api/servers/:id/bloom', async ({ me, params }) => {
    const list = me.serverBlooms || [];
    const i = list.map(b => b.serverId).lastIndexOf(params.id);
    if (i < 0) fail(404, "You haven't bloomed that server.");
    list.splice(i, 1); me.serverBlooms = list;
    save();
    const sv = data.servers[params.id];
    if (sv) z.refreshServer(sv);
    return { ok: true };
  });

  // ======================= server backups =======================
  // Everything about how a server is set up (not its members or messages), as a file you can keep
  // and turn into a new server any time. Zuno also keeps a daily copy of the last 5 days.
  const BACKUP_KEYS = ['name', 'description', 'icon', 'iconColor', 'banner', 'bannerColor', 'accentColor', 'theme', 'tags', 'roles', 'categories', 'channels', 'emojis', 'sounds',
    'onboarding', 'welcomeMessages', 'welcomeChannelId', 'rulesChannelId', 'minAccountAge', 'automod', 'verification'];
  function buildBackup(sv) {
    z.ensureRoles(sv);
    const out = { zunoBackup: 1, version: z.PKG.version, at: Date.now(), from: { id: sv.id, name: sv.name } };
    for (const k of BACKUP_KEYS) if (sv[k] !== undefined) out[k] = JSON.parse(JSON.stringify(sv[k]));
    // Stage topics, voice statuses and the like are moment-to-moment, not setup.
    out.channels = (out.channels || []).map(({ voiceStatus, stageTopic, ...c }) => c);
    out.roles = (out.roles || []).map(r => ({ ...r, managed: undefined }));
    return out;
  }
  const canBackup = (sv, me) => sv.ownerId === me.id || z.can(sv, me.id, 'manage_server');
  route('GET', '/api/servers/:id/backup', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    if (!canBackup(sv, me)) fail(403, 'You need Manage Server to back up this server.');
    return { backup: buildBackup(sv) };
  });
  data.serverBackups ||= {};
  route('GET', '/api/servers/:id/backups', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    if (!canBackup(sv, me)) fail(403, 'You need Manage Server to see backups.');
    return { backups: (data.serverBackups[sv.id] || []).map(b => ({ id: b.id, at: b.at, channels: b.backup.channels?.length || 0, roles: b.backup.roles?.length || 0 })).reverse() };
  });
  route('GET', '/api/servers/:id/backups/:bid', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    if (!canBackup(sv, me)) fail(403, 'You need Manage Server to see backups.');
    const b = (data.serverBackups[sv.id] || []).find(x => x.id === params.bid);
    if (!b) fail(404, 'That backup is gone.');
    return { backup: b.backup };
  });
  function snapshotAll() {
    const now = Date.now();
    for (const sv of Object.values(data.servers)) {
      if (sv.official) continue;
      const list = data.serverBackups[sv.id] ||= [];
      if (list.length && now - list[list.length - 1].at < 22 * 3600e3) continue;
      const backup = buildBackup(sv);
      const same = list.length && JSON.stringify({ ...list[list.length - 1].backup, at: 0 }) === JSON.stringify({ ...backup, at: 0 });
      if (same) { list[list.length - 1].at = now; continue; }
      list.push({ id: newId(), at: now, backup });
      while (list.length > 5) list.shift();
    }
    for (const id of Object.keys(data.serverBackups)) if (!data.servers[id]) delete data.serverBackups[id];
    save();
  }
  setTimeout(snapshotAll, 60e3).unref();
  setInterval(snapshotAll, 3 * 3600e3).unref();
  // Make a brand-new server from a backup. Every id gets a fresh one.
  route('POST', '/api/servers/from-backup', async ({ me, body }) => {
    z.limit('restore:' + me.id, 5, 3600e3, "You've restored a few servers already. Try again in an hour.");
    const b = body.backup;
    if (!b || b.zunoBackup !== 1 || !Array.isArray(b.roles) || !Array.isArray(b.channels)) fail(400, "That isn't a Zuno server backup.");
    if (JSON.stringify(b).length > 2_000_000) fail(400, 'That backup is too big.');
    if (Object.values(data.servers).filter(sv => sv.ownerId === me.id).length >= 100) fail(400, "You own a lot of servers already.");
    const id = newId();
    const oldIds = new Set([b.from?.id, ...b.roles.map(r => r.id), ...b.channels.map(c => c.id), ...(b.categories || []).map(c => c.id)].filter(Boolean).map(String));
    const map = new Map([...oldIds].map(o => [o, o === b.from?.id ? id : newId()]));
    // Pictures and sounds belong to the original server, so the copy starts without them (its colors, roles,
    // channels and settings all come over).
    const SKIP = new Set(['icon', 'banner', 'emojis', 'sounds']);
    let json = JSON.stringify(Object.fromEntries(BACKUP_KEYS.filter(k => b[k] !== undefined && !SKIP.has(k)).map(k => [k, b[k]])));
    for (const [o, n] of map) json = json.split(JSON.stringify(o)).join(JSON.stringify(n));
    const setup = JSON.parse(json);
    // A backup file can be edited by hand, so nothing in it is trusted: no links to uploaded files
    // (they'd belong to someone else), word lists are plain text, and the lists have sane sizes.
    (function scrub(o) {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') { delete o[k]; continue; }
        const v = o[k];
        if (typeof v === 'string' && /^\/(uploads|files)\//.test(v)) o[k] = null;
        else if (k === 'words' && Array.isArray(v)) o[k] = v.filter(w => typeof w === 'string').map(w => w.slice(0, 60)).slice(0, 300);
        else scrub(v);
      }
    })(setup);
    setup.roles = (Array.isArray(setup.roles) ? setup.roles : []).filter(r => r && typeof r === 'object').slice(0, 250);
    setup.channels = (Array.isArray(setup.channels) ? setup.channels : []).filter(c => c && typeof c === 'object').slice(0, 500);
    setup.categories = (Array.isArray(setup.categories) ? setup.categories : []).filter(c => c && typeof c === 'object').slice(0, 100);
    // Every field gets the same checks as editing it normally: colors are real colors, numbers are
    // numbers in range, and every id points inside this backup (never at another server's channel).
    const HEX = /^#[0-9a-f]{6}$/i, hex = v => (typeof v === 'string' && HEX.test(v) ? v : null);
    const known = new Set(z.PERM_KEYS);
    const perms = v => (Array.isArray(v) ? v : []).filter(p => known.has(p));
    const ids = new Set([id, ...map.values()]);
    const own = v => (typeof v === 'string' && ids.has(v) ? v : null);
    const roleIds = new Set(setup.roles.map(r => r.id).filter(own));
    const cleanOverrides = list => (Array.isArray(list) ? list : []).filter(o => o && o.type === 'role' && (roleIds.has(o.id) || o.id === id) || o?.id === b.from?.id)
      .map(o => ({ id: o.id === b.from?.id ? id : o.id, type: 'role', allow: perms(o.allow), deny: perms(o.deny) })).slice(0, 100);
    setup.roles = setup.roles.map(r => ({ id: own(r.id) || newId(), name: clean(r.name, 32) || 'role', color: hex(r.color), color2: hex(r.color2), hoist: !!r.hoist, mentionable: !!r.mentionable,
      icon: clean(r.icon, 8) || null, perms: perms(r.perms), autoJoin: !!r.autoJoin && !r.everyone, ...(r.everyone ? { everyone: true } : {}) }));
    setup.categories = setup.categories.map(c => ({ id: own(c.id) || newId(), name: clean(c.name, 100) || 'category', overrides: cleanOverrides(c.overrides), collapsed: false }));
    const catIds = new Set(setup.categories.map(c => c.id));
    setup.channels = setup.channels.map(c => ({ id: own(c.id) || newId(), name: clean(c.name, 100) || 'channel', type: c.type === 'voice' ? 'voice' : 'text',
      topic: clean(c.topic, 1024), categoryId: catIds.has(c.categoryId) ? c.categoryId : null, synced: c.synced !== false,
      slowmode: [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600].includes(Number(c.slowmode)) ? Number(c.slowmode) : 0,
      userLimit: Math.max(0, Math.min(99, Math.round(Number(c.userLimit) || 0))), readOnly: !!c.readOnly, nsfw: !!c.nsfw, overrides: cleanOverrides(c.overrides) }));
    const chIds = new Set(setup.channels.map(c => c.id));
    for (const k of ['iconColor', 'bannerColor', 'accentColor']) setup[k] = hex(setup[k]);
    setup.description = clean(setup.description, 300);
    setup.tags = (Array.isArray(setup.tags) ? setup.tags : []).filter(t => typeof t === 'string').map(t => clean(t, 30)).slice(0, 5);
    setup.theme = typeof setup.theme === 'string' && /^[a-z0-9_-]{1,24}$/.test(setup.theme) ? setup.theme : null;
    setup.minAccountAge = Math.max(0, Math.min(8760, Number(setup.minAccountAge) || 0));
    setup.welcomeMessages = setup.welcomeMessages !== false;
    setup.welcomeChannelId = chIds.has(setup.welcomeChannelId) ? setup.welcomeChannelId : null;
    setup.rulesChannelId = chIds.has(setup.rulesChannelId) ? setup.rulesChannelId : null;
    if (typeof setup.verification !== 'number' && typeof setup.verification !== 'string') delete setup.verification;
    if (setup.automod && typeof setup.automod === 'object') {
      const a = setup.automod;
      setup.automod = { enabled: !!a.enabled, words: a.words || [], links: !!a.links, invites: a.invites !== false, caps: !!a.caps, spam: a.spam !== false,
        allowDomains: (Array.isArray(a.allowDomains) ? a.allowDomains : []).filter(d => typeof d === 'string').map(d => clean(d, 80)).slice(0, 50),
        mentionLimit: Math.max(0, Math.min(50, Number(a.mentionLimit) || 0)), timeoutMinutes: Math.max(0, Math.min(10080, Number(a.timeoutMinutes) || 0)),
        newAccountLinks: Math.max(0, Math.min(43200, Number(a.newAccountLinks) || 0)), alertChannelId: chIds.has(a.alertChannelId) ? a.alertChannelId : null,
        exemptRoles: (Array.isArray(a.exemptRoles) ? a.exemptRoles : []).filter(x => roleIds.has(x)), exemptChannels: (Array.isArray(a.exemptChannels) ? a.exemptChannels : []).filter(x => chIds.has(x)) };
    } else delete setup.automod;
    const onboarding = setup.onboarding; delete setup.onboarding;
    // The @everyone role always shares the server's id.
    const everyone = setup.roles.find(r => r.everyone);
    if (everyone) everyone.id = id;
    if (!setup.roles.some(r => r.everyone)) setup.roles.push({ id, name: '@everyone', color: null, perms: [...z.DEFAULT_EVERYONE], everyone: true });
    const sv = data.servers[id] = z.ensureRoles({
      ...setup, id, name: clean(body.name, 48) || clean(setup.name, 48) || 'Restored server', ownerId: me.id, createdAt: Date.now(),
      iconColor: setup.iconColor || z.SERVER_COLORS[0], members: [me.id], memberRoles: {}, invite: z.crypto.randomBytes(5).toString('base64url'),
      channels: setup.channels.length ? setup.channels : [{ id: newId(), name: 'general', type: 'text' }],
    });
    if (onboarding && typeof onboarding === 'object') { try { sv.onboarding = cleanOnboarding(sv, me, onboarding); } catch { sv.onboarding = null; } }
    me.joinedAt = { ...(me.joinedAt || {}), [sv.id]: Date.now() };
    save(); z.refreshServer(sv);
    return { server: z.serverSummary(sv, me) };
  });

  return { blooming };
};
