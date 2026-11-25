'use strict';
// Zuno 0.53: staff moderation tools (bans & timeouts in one place, lifting server bans and
// timeouts, any-server ownership for the founder), deleting your own account, no @everyone for
// members of Zuno Official, the dark Verified Creator badge, and backend speed-ups.

module.exports = function (z) {
  const { data, route, fail, hooks, save, clean } = z;
  const human = u => u && !u.system && !u.bot && !u.webhook;

  // ======================= Zuno Official: no @everyone from members =======================
  // Only staff can ping @everyone / @here there (and ping roles that aren't mentionable).
  hooks.channelPerms.push((sv, ch, uid, p) => {
    if (sv.official && !z.isStaff(z.data.users[uid])) p.delete('mention_everyone');
  });

  // ======================= Moderation: bans & timeouts =======================
  const FOREVER_AT = 8.64e15;
  const userRow = u => ({ ...z.publicUser(u), createdAt: u.createdAt, warnings: u.mod?.warnings || 0 });
  const lastMod = (uid, actions) => [...(data.modLog || [])].reverse().find(e => e.target === uid && actions.includes(e.action));
  route('GET', '/api/mod/suspended', async ({ me }) => {
    z.needStaff(me);
    const now = Date.now();
    const timeouts = [], bans = [];
    for (const u of Object.values(data.users)) {
      if (!human(u)) continue;
      if (u.banned && !u.banned.restored) {
        const e = lastMod(u.id, ['ban']);
        bans.push({
          user: userRow(u), was: u.banned.snapshot ? { username: u.banned.snapshot.username, displayName: u.banned.snapshot.displayName, avatar: u.banned.snapshot.avatar } : null,
          at: u.banned.at, reason: u.banned.reason || e?.note || '', by: z.publicUser(data.users[e?.by]),
          restorable: !u.banned.purged && !!u.banned.snapshot, appeal: u.banned.appeal?.status || null,
        });
      } else if ((u.suspendedUntil || 0) > now && u.suspendedUntil < FOREVER_AT) {
        const e = lastMod(u.id, ['timeout']);
        timeouts.push({ user: userRow(u), until: u.suspendedUntil, reason: e?.note || '', by: z.publicUser(data.users[e?.by]), at: e?.at || null });
      }
    }
    timeouts.sort((a, b) => a.until - b.until);
    bans.sort((a, b) => b.at - a.at);
    return { timeouts, bans: bans.slice(0, 200) };
  });

  // Someone's bans and timeouts in servers, so staff can lift them from one place.
  route('GET', '/api/mod/users/:id/servers', async ({ me, params }) => {
    z.needStaff(me);
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'User not found.');
    const now = Date.now(), out = [];
    for (const sv of Object.values(data.servers)) {
      const ban = (sv.bans || []).find(b => b.userId === u.id);
      const until = sv.timeouts?.[u.id] || 0;
      if (!ban && until <= now) continue;
      out.push({ id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor, ban: ban ? { at: ban.at, reason: ban.reason || '', by: z.publicUser(data.users[ban.by]) } : null, timeoutUntil: until > now ? until : null });
    }
    return { servers: out.slice(0, 100) };
  });
  route('POST', '/api/mod/users/:id/servers/:serverId/lift', async ({ me, params, body }) => {
    z.needStaff(me);
    const u = data.users[params.id], sv = data.servers[params.serverId];
    if (!human(u) || !sv) fail(404, 'Not found.');
    z.staffGuard(me, u);
    const kind = body.kind === 'timeout' ? 'timeout' : 'ban';
    if (kind === 'ban') {
      if (!(sv.bans || []).some(b => b.userId === u.id)) fail(400, "They aren't banned there.");
      sv.bans = sv.bans.filter(b => b.userId !== u.id);
      if (sv.official) sv.removedUsers = (sv.removedUsers || []).filter(id => id !== u.id);
      z.audit(sv, me, 'member_unban', { type: 'member', id: u.id, name: u.displayName }, 'Zuno Staff');
    } else {
      if (!((sv.timeouts?.[u.id] || 0) > Date.now())) fail(400, "They aren't timed out there.");
      delete sv.timeouts[u.id];
      z.audit(sv, me, 'member_untimeout', { type: 'member', id: u.id, name: u.displayName }, 'Zuno Staff');
    }
    data.modLog.push({ at: Date.now(), by: me.id, action: kind === 'ban' ? 'server-unban' : 'server-untimeout', target: u.id, note: sv.name });
    data.modLog = data.modLog.slice(-1000);
    save(); z.refreshServer(sv);
    z.tellFounder(me, `lifted ${u.username}'s ${kind} in ${sv.name}`);
    return { ok: true };
  });

  // Servers, for staff: find one and (founder) hand it to one of its members.
  route('GET', '/api/mod/servers', async ({ me, query }) => {
    z.needStaff(me);
    const q = clean(query.get('q'), 60).toLowerCase();
    let list = Object.values(data.servers).filter(sv => !sv.deleted);
    if (q) list = list.filter(sv => sv.name.toLowerCase().includes(q) || sv.id === q || (data.users[sv.ownerId]?.username || '').includes(q.replace(/^@/, '')));
    else list.sort((a, b) => b.members.length - a.members.length);
    return { servers: list.slice(0, 30).map(sv => ({ id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor, members: sv.members.length, official: !!sv.official, owner: z.publicUser(data.users[sv.ownerId]) })) };
  });
  route('GET', '/api/mod/servers/:id/members', async ({ me, params, query }) => {
    z.needStaff(me);
    const sv = data.servers[params.id];
    if (!sv) fail(404, 'Server not found.');
    const q = clean(query.get('q'), 32).toLowerCase().replace(/^@/, '');
    const people = sv.members.map(id => data.users[id]).filter(u => human(u) && !u.deleted && (!q || u.username.includes(q) || u.displayName.toLowerCase().includes(q)));
    return { members: people.slice(0, 60).map(z.publicUser), ownerId: sv.ownerId };
  });

  // ======================= delete your own account =======================
  // Settings › My Account › Delete account. Your password, then you're gone: your name is freed,
  // your profile, login, devices and email are wiped, and you leave every server, group and friend
  // list. Messages you sent stay, shown as "Deleted User". Servers you own need a new owner first.
  const ownedBy = uid => Object.values(data.servers).filter(sv => sv.ownerId === uid && sv.members.includes(uid) && !sv.official);
  route('GET', '/api/me/delete-check', async ({ me }) => {
    return { owned: ownedBy(me.id).map(sv => ({ id: sv.id, name: sv.name, members: sv.members.length, icon: sv.icon || null, iconColor: sv.iconColor })), founder: z.isFounder(me.id) };
  });
  route('POST', '/api/me/delete', async ({ me, body }) => {
    if (!human(me) || me.deleted) fail(403, "This account can't be deleted.");
    if (z.isFounder(me.id)) fail(403, "The founder's account can't be deleted.");
    z.limit('delacct:' + me.id, 5, 15 * 60e3, 'Too many tries. Wait a few minutes.');
    if (!me.passwordHash || !await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, 'That password is wrong.');
    if (String(body.confirm || '').trim().toLowerCase() !== me.username) fail(400, `Type your username (${me.username}) to confirm.`);
    const owned = ownedBy(me.id);
    if (owned.length) fail(400, `You still own ${owned.length === 1 ? `**${owned[0].name}**` : `${owned.length} servers`}. Give ${owned.length === 1 ? 'it' : 'them'} to someone else or delete ${owned.length === 1 ? 'it' : 'them'} first.`);
    deleteOwnAccount(me);
    return { ok: true };
  });
  function deleteOwnAccount(u) {
    const friends = z.friendIds(u.id);
    for (const sv of Object.values(data.servers)) if (sv.members.includes(u.id)) z.removeMember(sv, u.id);
    for (const g of Object.values(data.groups || {})) if (g.members?.includes(u.id)) { g.members = g.members.filter(id => id !== u.id); if (g.ownerId === u.id) g.ownerId = g.members[0] || null; }
    data.friendships = (data.friendships || []).filter(f => !f.includes(u.id));
    for (const [id, r] of Object.entries(data.friendRequests || {})) if (r.from === u.id || r.to === u.id) delete data.friendRequests[id];
    // Their bots go too.
    for (const b of Object.values(data.users)) if (b.bot && b.app?.ownerId === u.id && !b.app.deleted) {
      for (const sv of Object.values(data.servers)) if (sv.members.includes(b.id)) z.removeMember(sv, b.id);
      for (const [h, id] of Object.entries(data.botTokens || {})) if (id === b.id) delete data.botTokens[h];
      b.app.deleted = true; b.displayName += ' (deleted)';
    }
    // Uploaded profile files.
    for (const url of [u.profileBanner?.url, u.profileBackground?.url, u.profileSound, /^\/uploads\//.test(u.avatar || '') ? u.avatar : null]) if (url) try { z.removeUpload(url); } catch {}
    let tag;
    do tag = String(Math.floor(10000000 + Math.random() * 90000000)); while (Object.values(data.users).some(x => x.username === 'deleted_user_' + tag));
    Object.assign(u, {
      username: 'deleted_user_' + tag, displayName: 'Deleted User', deleted: true, deletedAt: Date.now(), selfDeleted: true,
      email: null, emailVerified: false, passwordHash: null, passkeys: [], twoFactor: null, recoveryCodes: [], deviceLock: null, push: [], e2eDevices: [],
      avatar: null, bio: '', pronouns: '', customStatus: '', profileBanner: null, profileBackground: null, profileSound: null, profileSoundName: '',
      widgets: [], connections: [], decoration: null, profileEffect: null, nameColor: null, nameStyle: null, nameBanner: null, profileTheme: null,
      activity: null, acts: {}, status: 'offline', statusPref: 'offline', badgeGrants: [], favGifs: [], birthday: null, notes: {}, mutes: {},
      inbox: [], playtime: {}, spotify: null, spotifyLast: null, blocked: [], creatorDark: false,
    });
    z.endSessions(u.id);
    for (const res of z.streams.get(u.id) || []) { try { res.end(); } catch {} }
    save();
    z.broadcastUser(u);
    for (const id of friends) z.send(id, 'refresh', {});
  }

  // ======================= the Verified Creator badge, dark =======================
  hooks.publicUser.push(u => (u?.creatorDark ? { creatorDark: true } : {}));
  hooks.patchMe.push((me, body) => { if ('creatorDark' in body) me.creatorDark = !!body.creatorDark; });

  // ======================= reading a chat clears its notifications =======================
  // (0.53.1) Looking at the message you were pinged about now clears it from Notifications (and the
  // phone tab's number), instead of waiting until you open the Notifications tab.
  hooks.onRead.push((conv, me, at) => {
    const key = conv.idFor(me.id);
    let changed = false;
    for (const n of me.notifs || []) if (!n.read && n.conv === key && n.at <= at + 1000) { n.read = true; changed = true; }
    if (conv.kind === 'channel' && (me.inbox || []).some(p => p.channelId === conv.channel.id)) { me.inbox = me.inbox.filter(p => p.channelId !== conv.channel.id || p.at > at + 1000); changed = true; z.send(me.id, 'inbox', { count: me.inbox.length }); }
    if (!changed) return;
    save();
    const unread = (me.notifs || []).filter(n => n.at > (me.notifsSeenAt || 0) && !n.read).length;
    z.send(me.id, 'notif', { unread });
  });

  // ======================= no full IP addresses kept (one-time cleanup) =======================
  // (0.53.1) Logins used to keep their full address, and new-login alerts printed it. Both are cut
  // down to the network ("203.0.113.x") once, here; from now on only the network is ever kept.
  if (!data.ipsCut531) {
    let n = 0;
    for (const sess of Object.values(data.sessions || {})) {
      if (!sess || typeof sess !== 'object' || !('ip' in sess)) continue;
      sess.net = z.networkOfAddr(sess.ip); delete sess.ip; n++;
    }
    const cutText = t => String(t)
      .replace(/\b(IP|network) (\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, 'network $2.x')
      .replace(/\b(IP|network) ([0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4})(:[0-9a-f:]*)?/gi, 'network $2:…');
    for (const dm of Object.values(data.dms || {})) {
      const list = dm?.messages || [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.authorId !== z.SYSTEM_ID || typeof m.content !== 'string' || !/\bIP \S/.test(m.content)) continue;
        const next = cutText(m.content);
        if (next !== m.content) { list[i] = { ...m, content: next }; n++; } // a new object, so the save notices it
      }
    }
    data.ipsCut531 = true;
    save();
    if (n) console.log(`Cut ${n} stored addresses down to their network.`);
  }
};
