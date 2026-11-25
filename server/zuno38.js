'use strict';
// Zuno 0.38, "The Everything Update": your own typing style, things the app remembers for you on
// every device (folded categories, last channel and DM), quiet hours, and the staff activity feed.

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean } = z;

  // ======================= typing style =======================
  // Up to three emoji instead of the three dots, and your own words: "Paws is meowing…".
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣#*0-9])+$/u;
  hooks.patchMe.push((me, body) => {
    if (!('typingStyle' in body)) return;
    const t = body.typingStyle;
    if (!t) { delete me.typingStyle; return; }
    // Normal emoji, or a server's custom emoji (<:name:file.png>).
    const CUSTOM = /^<:[a-z0-9_]{2,32}:[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)>$/i;
    const emojis = (Array.isArray(t.emojis) ? t.emojis : []).map(e => String(e || '').trim()).filter(e => e && ((e.length <= 16 && EMOJI_ONLY.test(e)) || CUSTOM.test(e))).slice(0, 3);
    const verb = clean(t.verb, 30).replace(/[<>]/g, '');
    if (verb && z.checkName) z.checkName(verb); // no bad words
    if (!emojis.length && !verb) { delete me.typingStyle; return; }
    me.typingStyle = { ...(emojis.length ? { emojis } : {}), ...(verb ? { verb } : {}) };
  });
  hooks.publicUser.push(u => (u.typingStyle ? { typingStyle: u.typingStyle } : {}));

  // ======================= remembered for you =======================
  // Which categories you folded, the last channel you had open in each server, and your last DM.
  // Kept on your account, so every device opens where you left off.
  const ID = /^[a-z0-9:_-]{1,64}$/i;
  route('GET', '/api/me/ui', async ({ me }) => ({ ui: me.uiState || {} }));
  route('PATCH', '/api/me/ui', async ({ me, body }) => {
    const ui = me.uiState ||= {};
    if (body.collapsed && typeof body.collapsed === 'object') {
      ui.collapsed ||= {};
      for (const [sv, cats] of Object.entries(body.collapsed).slice(0, 20)) {
        if (!ID.test(sv)) continue;
        const list = (Array.isArray(cats) ? cats : []).map(String).filter(c => ID.test(c)).slice(0, 60);
        if (list.length) ui.collapsed[sv] = list; else delete ui.collapsed[sv];
      }
    }
    if (body.lastChannel && ID.test(body.lastChannel.server || '') && ID.test(body.lastChannel.channel || '')) {
      ui.lastChannel ||= {};
      ui.lastChannel[body.lastChannel.server] = body.lastChannel.channel;
    }
    if ('lastDm' in body) { const v = String(body.lastDm || ''); if (!v) delete ui.lastDm; else if (ID.test(v)) ui.lastDm = v; }
    // Only the servers you're still in are kept.
    const mine = new Set(Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => sv.id));
    for (const k of ['collapsed', 'lastChannel']) for (const sv of Object.keys(ui[k] || {})) if (!mine.has(sv)) delete ui[k][sv];
    save();
    return { ui };
  });

  // ======================= quiet hours =======================
  // Between two times (in your own time zone) phone notifications stay quiet. Calls still ring.
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minutesIn = (tz) => {
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      return +p.find(x => x.type === 'hour').value * 60 + +p.find(x => x.type === 'minute').value;
    } catch { return null; }
  };
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3);
  z.inQuietHours = u => {
    const q = u?.quietHours;
    if (!q?.on) return false;
    const now = minutesIn(q.tz), a = toMin(q.from), b = toMin(q.to);
    if (now == null || a === b) return false;
    return a < b ? now >= a && now < b : now >= a || now < b; // like 22:00 → 08:00
  };
  route('GET', '/api/me/quiet-hours', async ({ me }) => ({ quietHours: me.quietHours || { on: false, from: '22:00', to: '08:00' }, now: z.inQuietHours(me) }));
  route('PUT', '/api/me/quiet-hours', async ({ me, body }) => {
    const from = String(body.from || ''), to = String(body.to || '');
    if (!HM.test(from) || !HM.test(to)) fail(400, 'Pick a start and an end time.');
    let tz = clean(body.tz, 64);
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'UTC'; }
    me.quietHours = { on: !!body.on, from, to, tz };
    save();
    return { quietHours: me.quietHours, now: z.inQuietHours(me) };
  });
  hooks.meExtras.push(me => ({ quietHours: me.quietHours || null }));

  // ======================= staff activity =======================
  // Everything staff did with staff tools, newest first (the founder hears about each one live too).
  route('GET', '/api/staff/activity', async ({ me, query }) => {
    z.needStaff(me);
    const days = Math.min(30, Math.max(1, Number(query.get('days')) || 1));
    const since = Date.now() - days * 864e5;
    const items = (data.staffLog || []).filter(x => x.at >= since).slice(-300).reverse();
    const people = [...new Set(items.map(x => x.by))].map(id => z.publicUser(data.users[id])).filter(Boolean);
    return { items, people, days };
  });
};
