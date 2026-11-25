'use strict';
// Zuno 0.31: Senior Bug Hunter progress, server tag cards (with Join), profile likes, reporting
// profiles, favorite community creations, Senior Artist and Talented Artist badges, and Suggestions.

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, newId, send } = z;
  const human = u => u && !u.system && !u.bot && !u.deleted;
  const SENIOR_BUGS = 5, VETERAN_BUGS = 15;

  // ======================= Senior Bug Hunter progress =======================
  route('GET', '/api/bugs/progress', async ({ me }) => {
    const confirmed = me.bugsConfirmed || 0;
    const has = z.badgesFor(me), senior = has.includes('bughunter_senior') || has.includes('bughunter_veteran'), veteran = has.includes('bughunter_veteran');
    // After Senior, the next goal is Veteran (15).
    const need = senior ? VETERAN_BUGS : SENIOR_BUGS;
    return { confirmed, need, left: Math.max(0, need - confirmed), senior, veteran, seniorNeed: SENIOR_BUGS, veteranNeed: VETERAN_BUGS };
  });

  // ======================= server tags: a card with Join =======================
  // Clicking someone's server tag shows which server it's from. Servers listed in Discover can be
  // joined right from the card; others say they're invite-only.
  route('GET', '/api/servers/:id/tag-card', async ({ me, params }) => {
    const sv = data.servers[params.id];
    if (!sv || !sv.tag?.text) fail(404, "That server doesn't have a tag anymore.");
    // sv.members is a list of ids (counting its keys gave 0, 1, 2… and so "0 online" every time)
    const ids = sv.members || [];
    const members = ids.length;
    const online = ids.filter(id => data.users[id] && z.effectiveStatus(data.users[id]) !== 'offline').length;
    const joined = ids.includes(me.id);
    const banned = (sv.bans || []).some(b => b.userId === me.id);
    return {
      id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor || null, banner: sv.banner || null, bannerColor: sv.bannerColor || null,
      description: (sv.description || '').slice(0, 200), members, online, tag: sv.tag, joined,
      joinable: !joined && !banned && !!(sv.discoverable || sv.official),
    };
  });
  route('POST', '/api/servers/:id/join-from-tag', async ({ me, params }) => {
    const sv = data.servers[params.id];
    if (!sv || !(sv.discoverable || sv.official)) fail(403, "That server is invite-only. Ask someone in it for an invite.");
    if ((sv.bans || []).some(b => b.userId === me.id)) fail(403, "You can't join that server.");
    if (sv.official && (sv.removedUsers || []).includes(me.id)) fail(403, 'The Zuno team removed you from Zuno Official.');
    if (!(sv.members || []).includes(me.id)) z.joinServer(sv, me, 'a server tag');
    return { server: z.serverSummary(sv, me) };
  });

  // ======================= profile likes =======================
  // One like per person per profile. Liking your own doesn't count.
  const likesOf = u => (u.likedBy && typeof u.likedBy === 'object' ? u.likedBy : {});
  hooks.publicUser.push(u => (human(u) ? { likes: Object.keys(likesOf(u)).length } : {}));
  route('GET', '/api/users/:id/likes', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'Nobody to like there.');
    return { count: Object.keys(likesOf(u)).length, liked: !!likesOf(u)[me.id] };
  });
  route('POST', '/api/users/:id/like', async ({ me, params, body }) => {
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'Nobody to like there.');
    if (u.id === me.id) fail(400, "You can't like your own profile.");
    if ((u.blocked || []).includes?.(me.id) || (me.blocked || []).includes?.(u.id)) fail(403, "You can't like this profile.");
    z.limit('like:' + me.id, 60, 3600e3, "That's a lot of likes. Take a breather.");
    u.likedBy = likesOf(u);
    if (body.on === false) delete u.likedBy[me.id]; else u.likedBy[me.id] = Date.now();
    save();
    z.broadcastUser(u);
    return { count: Object.keys(u.likedBy).length, liked: !!u.likedBy[me.id] };
  });

  // ======================= reporting a profile =======================
  route('POST', '/api/reports/profile', async ({ me, body }) => {
    const u = data.users[String(body.userId || '')];
    if (!human(u)) fail(404, "That profile can't be reported.");
    if (u.id === me.id) fail(400, "You can't report your own profile.");
    const reason = String(body.reason || '');
    if (!z.REPORT_REASONS[reason]) fail(400, 'Pick a reason for the report.');
    z.limit('report-profile:' + me.id, 10, 3600e3, "You've sent a lot of reports this hour. The Zuno team will get to them.");
    if (Object.values(data.reports).some(r => r.reporterId === me.id && r.where?.kind === 'profile' && r.targetUserId === u.id && r.status === 'open')) fail(400, "You've already reported this profile. The Zuno team will look at it.");
    // A snapshot of what the profile showed, so staff see it even if it changes later.
    const lines = [`Profile of @${u.username}`, `Name: ${u.displayName}`];
    if (u.pronouns) lines.push(`Pronouns: ${u.pronouns}`);
    if (u.customStatus?.text || u.status?.text) lines.push(`Status: ${u.customStatus?.text || u.status?.text}`);
    if (u.bio) lines.push(`About me: ${u.bio}`);
    const pics = [u.avatar && { url: u.avatar, name: 'Profile picture', type: 'image' }, u.banner && { url: u.banner, name: 'Banner', type: 'image' }].filter(Boolean);
    const id = newId();
    data.reports[id] = {
      id, reporterId: me.id, targetUserId: u.id, reason, details: clean(body.details, 1000),
      where: { kind: 'profile', userId: u.id, name: `@${u.username}'s profile` },
      message: { id: 'profile:' + u.id + ':' + Date.now(), authorId: u.id, content: lines.join('\n'), attachments: pics.length ? pics : undefined, createdAt: Date.now() },
      context: [], revealed: {}, status: 'open', createdAt: Date.now(),
    };
    save();
    for (const s of Object.values(data.users)) if (z.isStaff(s) && !s.system) send(s.id, 'reports', {});
    return { ok: true };
  });

  // ======================= favorite community creations =======================
  route('GET', '/api/me/creation-favs', async ({ me }) => ({ favs: Object.keys(me.creationFavs || {}) }));
  route('POST', '/api/creations/:id/fav', async ({ me, params, body }) => {
    const c = data.creations?.[params.id];
    if (!c || c.status !== 'approved') fail(404, "That one isn't available.");
    me.creationFavs ||= {};
    const on = body.on !== false;
    const had = !!me.creationFavs[c.id];
    if (on && !had) { me.creationFavs[c.id] = 1; if (c.by !== me.id) c.favN = (c.favN || 0) + 1; }
    if (!on && had) { delete me.creationFavs[c.id]; if (c.by !== me.id) c.favN = Math.max(0, (c.favN || 0) - 1); }
    statsDirty = true;
    save();
    return { on, favs: c.favN || 0 };
  });

  // ======================= Senior Artist & Talented Artist =======================
  // Senior Artist: 5 or more approved creations. Talented Artist: across all your creations, worn by
  // 500 different people (ever) and favorited 70 times.
  const SENIOR_ART = 5, TALENT_WORN = 500, TALENT_FAVS = 70;
  let stats = {}, statsAt = 0, statsDirty = true;
  z.artistStatsDirty = () => { statsDirty = true; };
  function artistStats() {
    if (statsDirty || Date.now() - statsAt > 60e3) {
      stats = {};
      for (const c of Object.values(data.creations || {})) {
        if (c.status !== 'approved') continue;
        const s = (stats[c.by] ||= { approved: 0, worn: 0, favs: 0 });
        s.approved++; s.worn += c.everWornN || 0; s.favs += c.favN || 0;
      }
      statsAt = Date.now(); statsDirty = false;
    }
    return stats;
  }
  hooks.autoBadges.push(u => {
    const s = artistStats()[u.id];
    if (!s) return [];
    const out = [];
    if (s.approved >= SENIOR_ART) out.push('artist_senior');
    if (s.worn >= TALENT_WORN && s.favs >= TALENT_FAVS) out.push('artist_talented');
    return out;
  });
  route('GET', '/api/me/artist-progress', async ({ me }) => {
    const s = artistStats()[me.id] || { approved: 0, worn: 0, favs: 0 };
    return { ...s, needApproved: SENIOR_ART, needWorn: TALENT_WORN, needFavs: TALENT_FAVS };
  });

  // ======================= Suggestions =======================
  // Anyone can suggest something to the Zuno team from Settings › Suggestions. Staff mark each one
  // Planned, Done or Not planned, and the person hears back in their Zuno DM.
  data.suggestions ||= {};
  const S_STATUS = { new: 'New', planned: 'Planned', done: 'Done', declined: 'Not planned' };
  const S_KINDS = { feature: 'New feature', improve: 'Make something better', look: 'Looks and design', other: 'Something else' };
  const sView = (s, withUser = false) => ({ id: s.id, title: s.title, details: s.details, kind: s.kind, status: s.status, note: s.note || null, at: s.at, decidedAt: s.decidedAt || null, ...(withUser && data.users[s.by] ? { by: z.publicUser(data.users[s.by]) } : {}) });
  route('POST', '/api/suggestions', async ({ me, body }) => {
    if (!human(me)) fail(403, "This account can't send suggestions.");
    const title = clean(body.title, 100).trim(), details = clean(body.details, 2000).trim();
    if (title.length < 4) fail(400, 'Give your suggestion a short title.');
    z.limit('suggest:' + me.id, 8, 24 * 3600e3, "You've sent a lot of suggestions today. Thanks! Try again tomorrow.");
    const s = { id: newId(), by: me.id, title, details, kind: S_KINDS[body.kind] ? body.kind : 'other', status: 'new', at: Date.now() };
    data.suggestions[s.id] = s;
    save();
    for (const u of Object.values(data.users)) if (z.isStaff(u) && !u.system) send(u.id, 'suggestions', {});
    return { suggestion: sView(s) };
  });
  route('GET', '/api/suggestions/mine', async ({ me }) => ({ suggestions: Object.values(data.suggestions).filter(s => s.by === me.id).sort((a, b) => b.at - a.at).slice(0, 50).map(s => sView(s)) }));
  route('GET', '/api/suggestions', async ({ me, query }) => {
    z.needStaff(me);
    const st = query.get('status') || 'new';
    const list = Object.values(data.suggestions).filter(s => st === 'all' || s.status === st).sort((a, b) => b.at - a.at).slice(0, 200);
    const counts = {};
    for (const s of Object.values(data.suggestions)) counts[s.status] = (counts[s.status] || 0) + 1;
    return { suggestions: list.map(s => sView(s, true)), counts };
  });
  route('PATCH', '/api/suggestions/:id', async ({ me, params, body }) => {
    z.needStaff(me);
    const s = data.suggestions[params.id];
    if (!s) fail(404, 'That suggestion is gone.');
    if (!S_STATUS[body.status]) fail(400, 'Pick a status.');
    const was = s.status;
    s.status = body.status; s.note = clean(body.note || '', 500) || null; s.decidedAt = Date.now(); s.decidedBy = me.id;
    save();
    if (was !== s.status && s.status !== 'new' && data.users[s.by]) {
      const msg = { planned: `💡 Good news! Your suggestion **${s.title}** is now **Planned**.`, done: `✅ Your suggestion **${s.title}** is **Done**! Thanks for the idea.`, declined: `Your suggestion **${s.title}** is marked **Not planned** for now. Thanks for sending it in.` }[s.status];
      z.systemMessage(s.by, msg + (s.note ? `\n\nNote from the team: ${s.note}` : ''));
    }
    return { suggestion: sView(s, true) };
  });
  route('DELETE', '/api/suggestions/:id', async ({ me, params }) => {
    const s = data.suggestions[params.id];
    if (!s) fail(404, 'That suggestion is gone.');
    if (s.by !== me.id && !z.isStaff(me)) fail(403, 'Only the person who sent it can delete it.');
    delete data.suggestions[params.id];
    save();
    return { ok: true };
  });
};
