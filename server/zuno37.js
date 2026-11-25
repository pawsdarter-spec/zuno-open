'use strict';
// Zuno 0.37: Verified Creator applications, the Star Creator badge, and #videos in Zuno Official.

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, newId, send } = z;
  data.creatorApps ||= {};

  // ======================= creator badges =======================
  // Verified Creator: given when staff approve an application (or by hand). Star Creator: given by
  // staff by hand. Either one lets you post in #videos in Zuno Official.
  const CREATOR_BADGES = ['creator', 'creator_star'];
  const isCreator = u => !!u && z.badgesFor(u).some(b => CREATOR_BADGES.includes(b));
  const NEED_SUBS = 1000;
  const link = v => { const s = clean(v, 300); return /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(s) ? s : ''; };
  const staffIds = () => Object.values(data.users).filter(u => z.isStaff(u) && !u.system).map(u => u.id);
  const ping = () => { for (const id of staffIds()) send(id, 'creator-apps', {}); };
  const view = a => ({
    id: a.id, by: a.by, channel: a.channel, subs: a.subs, video: a.video, proof: a.proof, info: a.info, at: a.at,
    status: a.status, reason: a.reason || '', reviewedAt: a.reviewedAt || null,
    user: z.publicUser(data.users[a.by]), reviewedBy: data.users[a.reviewedBy]?.displayName || null,
  });
  const latestOf = uid => Object.values(data.creatorApps).filter(a => a.by === uid).sort((a, b) => b.at - a.at)[0] || null;

  // Your own application (the newest), so My Account can show where it's at.
  route('GET', '/api/creator/application', async ({ me }) => {
    const a = latestOf(me.id);
    return { application: a ? view(a) : null, hasBadge: isCreator(me), needSubs: NEED_SUBS };
  });
  route('POST', '/api/creator/application', async ({ me, body }) => {
    if (isCreator(me)) fail(400, 'You already have a creator badge.');
    const last = latestOf(me.id);
    if (last?.status === 'pending') fail(400, 'Your application is already waiting for review.');
    if (last?.status === 'declined' && Date.now() - (last.reviewedAt || 0) < 864e5) fail(429, 'You can apply again a day after your last application was looked at.');
    z.limit('creator-app:' + me.id, 3, 864e5, "You've applied a lot today. Try again tomorrow.");
    const channel = link(body.channel);
    if (!channel) fail(400, 'Add a link to your channel (starting with https://).');
    const subs = Math.floor(Number(body.subs));
    if (!Number.isFinite(subs) || subs < NEED_SUBS) fail(400, `You need at least ${NEED_SUBS.toLocaleString('en-US')} subscribers to apply.`);
    const video = link(body.video);
    if (!video) fail(400, 'Add a link to your video about Zuno.');
    const proof = clean(body.proof, 300);
    if (!proof) fail(400, `Show it's you: for example, put "Zuno: ${me.username}" in your channel description, then say where it is.`);
    const a = { id: newId(), by: me.id, channel, subs: Math.min(subs, 1e10), video, proof, info: clean(body.info, 600), at: Date.now(), status: 'pending' };
    data.creatorApps[a.id] = a;
    save();
    ping();
    return { application: view(a) };
  });

  // ---------- staff review (Moderation › Verified Creators) ----------
  route('GET', '/api/creator/review', async ({ me }) => {
    z.needStaff(me);
    const all = Object.values(data.creatorApps);
    const pending = all.filter(a => a.status === 'pending').sort((a, b) => a.at - b.at);
    const recent = all.filter(a => a.status !== 'pending' && a.reviewedAt > Date.now() - 14 * 864e5).sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 30);
    return { pending: pending.map(view), recent: recent.map(view) };
  });
  route('GET', '/api/creator/review/count', async ({ me }) => {
    z.needStaff(me);
    return { pending: Object.values(data.creatorApps).filter(a => a.status === 'pending').length };
  });
  route('PATCH', '/api/creator/:id/review', async ({ me, params, body }) => {
    z.needStaff(me);
    const a = data.creatorApps[params.id];
    if (!a) fail(404, 'That application is gone.');
    if (a.status !== 'pending') fail(400, 'Someone already looked at this one.');
    if (a.by === me.id && !z.isFounder(me.id)) fail(403, "You can't approve your own application. Ask another staff member.");
    const u = data.users[a.by];
    if (body.approve) {
      a.status = 'approved';
      if (u) {
        u.badgeGrants = [...new Set([...(u.badgeGrants || []), 'creator'])];
        u.badgeRemovals = (u.badgeRemovals || []).filter(b => b !== 'creator');
        z.systemMessage(u.id, '🎬 Your **Verified Creator** application was approved! The badge is on your profile now, and you can post in **#videos** in Zuno Official. Thanks for making videos about Zuno!');
      }
    } else {
      const reason = clean(body.reason, 300);
      if (!reason) fail(400, 'Say why, so they know what to fix.');
      a.status = 'declined'; a.reason = reason;
      if (u) z.systemMessage(u.id, `Your **Verified Creator** application wasn't approved this time.\n\nWhy: ${reason}\n\nYou can apply again from Settings › My Account after a day.`);
    }
    a.reviewedBy = me.id; a.reviewedAt = Date.now();
    save();
    if (u) { z.broadcastUser(u); refreshOfficial(); }
    ping();
    return { application: view(a) };
  });

  // ======================= #videos in Zuno Official =======================
  // Everyone can watch; only people with a creator badge (and the team) can post there.
  const isVideos = ch => ch?.type === 'text' && /^videos?$/i.test(String(ch.name || '').replace(/[^a-z]/gi, ''));
  const refreshOfficial = () => { const sv = z.officialServer?.(); if (sv) z.refreshServer(sv); };
  hooks.channelPerms.push((sv, ch, uid, p) => {
    if (!sv.official || !isVideos(ch) || p.has('manage_messages')) return;
    if (isCreator(data.users[uid])) { p.add('send_messages'); p.add('attach_files'); p.add('embed_links'); }
    else { p.delete('send_messages'); p.delete('attach_files'); }
  });
  // Giving or taking a creator badge by hand changes who can post there too.
  (hooks.badgeChange ||= []).push((u, badge) => { if (CREATOR_BADGES.includes(badge)) refreshOfficial(); });
  // Made once if Zuno Official doesn't have one yet.
  setTimeout(() => {
    const sv = z.officialServer?.();
    if (!sv || sv.videosSetUp) return;
    if (!sv.channels.some(isVideos)) {
      const ch = { id: newId(), name: 'videos', type: 'text', topic: 'Videos about Zuno from Verified and Star Creators. Want to post here? Apply in Settings › My Account.' };
      const first = sv.channels.find(c => c.type === 'text');
      if (first?.categoryId) ch.categoryId = first.categoryId;
      const at = sv.channels.map((c, i) => [c, i]).filter(([c]) => (c.categoryId || null) === (ch.categoryId || null)).pop();
      if (at) sv.channels.splice(at[1] + 1, 0, ch); else sv.channels.push(ch);
      console.log('Made #videos in Zuno Official.');
    }
    sv.videosSetUp = true;
    save();
    z.refreshServer?.(sv);
  }, 1800);
};
