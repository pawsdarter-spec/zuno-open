'use strict';
// Zuno 0.29: hide or show your badges, and the golden Senior Bug Hunter badge (5 confirmed reports).

module.exports = function (z) {
  const { data, save, route, fail, hooks, send } = z;

  // ======================= Senior Bug Hunter =======================
  // Count the reports that were already confirmed before 0.29, once.
  data.meta ||= {};
  if (!data.meta.bugsCounted29) {
    const counts = {};
    for (const b of Object.values(data.bugs || {})) if (['acknowledged', 'fixed'].includes(b.status)) counts[b.reporterId] = (counts[b.reporterId] || 0) + 1;
    for (const [id, n] of Object.entries(counts)) if (data.users[id]) data.users[id].bugsConfirmed = n;
    data.meta.bugsCounted29 = true;
    save();
  }

  // ======================= hide or show your badges =======================
  // Hidden badges stay yours; they just don't show on your profile or next to your name.
  const hiddenOf = u => (Array.isArray(u.hiddenBadges) ? u.hiddenBadges : []);
  hooks.publicUser.push(u => {
    const hidden = hiddenOf(u);
    return hidden.length ? { badges: z.badgesFor(u).filter(b => !hidden.includes(b)) } : {};
  });
  const badgeView = me => ({ owned: z.badgesFor(me), hidden: hiddenOf(me).filter(b => z.badgesFor(me).includes(b)) });
  route('GET', '/api/me/badges', async ({ me }) => badgeView(me));
  route('PATCH', '/api/me/badges', async ({ me, body }) => {
    if (!Array.isArray(body.hidden)) fail(400, 'Send the list of badges to hide.');
    const owned = z.badgesFor(me);
    me.hiddenBadges = [...new Set(body.hidden.map(String))].filter(b => owned.includes(b)).slice(0, 30);
    if (!me.hiddenBadges.length) delete me.hiddenBadges;
    save(); z.broadcastUser(me);
    send(me.id, 'me', z.privateMe(me));
    return badgeView(me);
  });
};
