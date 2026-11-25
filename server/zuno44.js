'use strict';
// Zuno 0.44: server mute, server deafen and disconnect in voice channels, asking someone for their
// time zone, and keybinds/app font saved with your settings.

module.exports = function (z) {
  const { data, save, route, fail, hooks, send, publicUser } = z;

  // ======================= voice moderation =======================
  Object.assign(z.PERM_INFO, {
    mute_members: { label: 'Mute Members', group: 'Voice' },
    deafen_members: { label: 'Deafen Members', group: 'Voice' },
    move_members: { label: 'Disconnect Members', group: 'Voice' },
  });
  for (const k of ['mute_members', 'deafen_members', 'move_members']) if (!z.PERM_KEYS.includes(k)) z.PERM_KEYS.push(k);

  // sv.voiceMod = { userId: { mute: true, deafen: true } }: stays until someone takes it off, like Discord.
  const modOf = (sv, uid) => sv?.voiceMod?.[uid] || null;
  const serverOfRoom = roomId => (String(roomId).startsWith('vc:') ? z.findChannel(String(roomId).slice(3)) : null);
  // Whatever someone's app says, a server-muted person stays muted (everyone else's app silences
  // them), and a server-deafened person stays deafened and muted.
  hooks.rtcState.push((roomId, me, st) => {
    const vc = serverOfRoom(roomId);
    const m = vc?.sv && modOf(vc.sv, me.id);
    if (!m) return;
    if (m.mute || m.deafen) st.muted = true;
    if (m.deafen) st.deafened = true;
    st.serverMuted = !!m.mute; st.serverDeafened = !!m.deafen;
  });
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (what !== 'join') return;
    const vc = serverOfRoom(roomId);
    const m = vc?.sv && modOf(vc.sv, uid);
    const st = room.get(uid);
    if (!m || !st) return;
    if (m.mute || m.deafen) st.muted = true;
    if (m.deafen) st.deafened = true;
    st.serverMuted = !!m.mute; st.serverDeafened = !!m.deafen;
    setTimeout(() => send(uid, 'voice-forced', { room: roomId, mute: !!m.mute, deafen: !!m.deafen, quiet: true }), 300);
  });
  const roomOfIn = (sv, uid) => [...z.rooms.entries()].find(([id, r]) => id.startsWith('vc:') && r.has(uid) && sv.channels.some(c => 'vc:' + c.id === id))?.[0] || null;
  route('POST', '/api/servers/:id/voice/:userId', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    z.ensureRoles(sv);
    const uid = params.userId;
    if (!sv.members.includes(uid)) fail(404, "They aren't in this server.");
    const action = String(body.action || '');
    const need = { mute: 'mute_members', unmute: 'mute_members', deafen: 'deafen_members', undeafen: 'deafen_members', disconnect: 'move_members' }[action];
    if (!need) fail(400, 'Unknown action.');
    z.need(sv, me, need);
    if (uid !== me.id && z.outranks && !z.outranks(sv, me.id, uid)) fail(403, "You can't do that to someone at or above your highest role.");
    const room = roomOfIn(sv, uid);
    const who = data.users[uid];
    if (action === 'disconnect') {
      if (!room) fail(400, "They aren't in a voice channel here.");
      z.leaveRoom(room, uid);
      send(uid, 'call-ended', { room, removed: true });
      z.audit(sv, me, 'voice_disconnect', { type: 'user', id: uid, name: who?.username || '' });
      return { ok: true };
    }
    sv.voiceMod ||= {};
    const m = (sv.voiceMod[uid] ||= {});
    if (action === 'mute') m.mute = true;
    if (action === 'unmute') delete m.mute;
    if (action === 'deafen') m.deafen = true;
    if (action === 'undeafen') delete m.deafen;
    if (!m.mute && !m.deafen) delete sv.voiceMod[uid];
    z.audit(sv, me, 'voice_' + action, { type: 'user', id: uid, name: who?.username || '' });
    save();
    if (room) {
      const r = z.rooms.get(room), st = r?.get(uid);
      if (st) {
        if (m.mute || m.deafen) st.muted = true;
        if (m.deafen) st.deafened = true;
        if (action === 'undeafen' && !m.deafen) st.deafened = false;
        st.serverMuted = !!m.mute; st.serverDeafened = !!m.deafen;
        for (const id of r.keys()) if (id !== uid) send(id, 'rtc-state', { room, userId: uid, ...st });
      }
      send(uid, 'voice-forced', { room, mute: !!m.mute, deafen: !!m.deafen, by: me.displayName || me.username, action });
      z.voiceUpdate(room);
    }
    z.refreshServer(sv);
    return { ok: true, voiceMod: sv.voiceMod[uid] || null };
  });
  // Kick someone from a call: a group's owner in a group call, or anyone who can disconnect members
  // in a voice channel.
  route('POST', '/api/rtc/kick', async ({ me, body }) => {
    const room = String(body.room || ''), uid = String(body.userId || '');
    const r = z.rooms.get(room);
    if (!r?.has(uid) || uid === me.id) fail(404, "They aren't in this call.");
    if (room.startsWith('gc:')) {
      const g = data.groups?.[room.slice(3)];
      if (!g || g.ownerId !== me.id) fail(403, 'Only the group owner can remove people from the call.');
    } else if (room.startsWith('vc:')) {
      const { sv } = z.findChannel(room.slice(3));
      if (!sv) fail(404, 'Channel not found.');
      z.need(sv, me, 'move_members');
      if (!z.outranks(sv, me.id, uid)) fail(403, "You can't do that to someone at or above your highest role.");
      z.audit(sv, me, 'voice_disconnect', { type: 'user', id: uid, name: data.users[uid]?.username || '' });
    } else fail(400, "You can't remove people from a one-on-one call. Just hang up.");
    z.leaveRoom(room, uid);
    send(uid, 'call-ended', { room, removed: true });
    return { ok: true };
  });
  // Who is server muted or deafened shows in the server's summary, for the icons in voice channels.
  hooks.serverSummary.push(sv => ({ voiceMod: sv.voiceMod || {} }));

  // ======================= "What time is it for you?" =======================
  // Ask someone for their time zone. If they share it, you see their local time on their profile.
  const okTz = tz => typeof tz === 'string' && tz.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(tz) && (() => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } })();
  route('POST', '/api/users/:id/tz-request', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!u || u.bot || u.system || u.id === me.id) fail(404, 'User not found.');
    if (z.isBlocked?.(u.id, me.id) || z.isBlocked?.(me.id, u.id)) fail(403, "You can't ask them that.");
    if (!z.areFriends(me.id, u.id) && !Object.values(data.servers).some(sv => sv.members.includes(me.id) && sv.members.includes(u.id))) fail(403, 'You can ask friends and people in your servers.');
    if (u.tzShared?.[me.id]) return { shared: true, tz: u.tzShared[me.id] };
    z.limit('tzask:' + me.id, 10, 3600e3, "You've asked a lot of people. Try again later.");
    u.tzAsks = { ...(u.tzAsks || {}), [me.id]: Date.now() };
    save();
    send(u.id, 'tz-request', { from: publicUser(me) });
    z.notify?.(u.id, { type: 'tz', from: me.id, title: 'Time zone', text: `${me.displayName || me.username} would like to know your time zone.` });
    return { asked: true };
  });
  route('POST', '/api/tz/answer', async ({ me, body }) => {
    const from = String(body.from || '');
    if (!me.tzAsks?.[from]) fail(404, 'That request is gone.');
    delete me.tzAsks[from];
    if (body.share) {
      const tz = String(body.tz || '');
      if (!okTz(tz)) fail(400, "That time zone doesn't look right.");
      me.tzShared = { ...(me.tzShared || {}), [from]: tz };
      const asker = data.users[from];
      if (asker) {
        send(from, 'tz-shared', { userId: me.id, tz });
        z.notify?.(from, { type: 'tz', from: me.id, title: 'Time zone', text: `${me.displayName || me.username} shared their time zone with you.` });
      }
    }
    save();
    return { ok: true };
  });
  route('POST', '/api/users/:id/tz-stop', async ({ me, params }) => {
    if (me.tzShared) delete me.tzShared[params.id];
    save();
    return { ok: true };
  });
  route('GET', '/api/users/:id/tz', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!u) fail(404, 'User not found.');
    return { tz: u.tzShared?.[me.id] || null, asked: !!u.tzAsks?.[me.id], sharedWithThem: !!me.tzShared?.[u.id], pending: Object.keys(me.tzAsks || {}).includes(u.id) };
  });
  route('GET', '/api/me/tz-requests', async ({ me }) => ({ from: Object.keys(me.tzAsks || {}).map(id => publicUser(data.users[id])).filter(Boolean) }));
};
