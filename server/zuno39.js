'use strict';
// Zuno 0.39/0.40: Partnered servers (given by the founder), @mention lookups.

module.exports = function (z) {
  const { data, save, route, fail, hooks } = z;

  // Partnered servers: a blue ✓ seal (different from Zuno Official's mark), given or taken away by
  // the founder from the server's right-click menu. It's only the mark: nobody is put in the server.
  // (0.39 called this "Official" and kept it as sv.verified; moved over here.)
  // (Only once: since then sv.verified is the separate Official mark again.)
  if (!data.partnerMoved40) {
    for (const sv of Object.values(data.servers)) if (sv.verified) { sv.partnered = true; delete sv.verified; }
    data.partnerMoved40 = true; save();
  }
  hooks.serverSummary.push(sv => ({ ...(sv.partnered ? { partnered: true } : {}), ...(sv.verified ? { verified: true } : {}) }));
  async function setPartner({ me, params, body }) {
    if (!z.isFounder(me.id)) fail(403, 'Only the founder can make a server Partnered.');
    const sv = data.servers[params.id];
    if (!sv) fail(404, 'Server not found.');
    if (sv.official) fail(400, 'Zuno Official has its own mark.');
    if (body.on) sv.partnered = true; else delete sv.partnered;
    save();
    z.refreshServer(sv);
    return { partnered: !!sv.partnered };
  }
  route('POST', '/api/servers/:id/partner', setPartner);
  // The ✓ Official mark (like Zuno Official's), separate from Partnered. Only the mark: nobody is
  // put in the server and people can still leave it.
  route('POST', '/api/servers/:id/official-mark', async ({ me, params, body }) => {
    if (!z.isFounder(me.id)) fail(403, 'Only the founder can make a server Official.');
    const sv = data.servers[params.id];
    if (!sv) fail(404, 'Server not found.');
    if (sv.official) fail(400, 'Zuno Official is always Official.');
    if (body.on) sv.verified = true; else delete sv.verified;
    save();
    z.refreshServer(sv);
    return { verified: !!sv.verified };
  });

  // How close a server is to the Partner requirements (shown to its members in Server Settings).
  const PARTNER_MEMBERS = 500;
  route('GET', '/api/servers/:id/partner-status', async ({ me, params }) => {
    const sv = data.servers[params.id];
    if (!sv || !sv.members.includes(me.id)) fail(404, 'Server not found.');
    const humans = sv.members.filter(id => data.users[id] && !data.users[id].bot).length;
    let trending = false;
    if (typeof z.discoverScores === 'function') {
      const scores = z.discoverScores(), sc = x => scores.get(x.id)?.score || 0;
      const top = Object.values(data.servers).filter(x => (x.discoverable || x.official) && sc(x) > 0).sort((a, b) => sc(b) - sc(a)).slice(0, 8);
      trending = top.includes(sv);
    }
    return { partnered: !!sv.partnered, official: !!sv.official, members: humans, need: PARTNER_MEMBERS, trending, discoverable: !!sv.discoverable };
  });

  // 0.40: display names and nicknames that were invisible, or in "fancy" letters, are made plain.
  if (!data.namesPlain40 && z.cleanName) {
    let n = 0;
    for (const u of Object.values(data.users)) {
      if (typeof u.displayName !== 'string' || u.system) continue;
      const v = z.cleanName(u.displayName, 32) || u.username;
      if (v !== u.displayName) { u.displayName = v; n++; }
    }
    for (const sv of Object.values(data.servers)) for (const [id, nick] of Object.entries(sv.nicks || {})) {
      const v = z.cleanName(nick, 32);
      if (v !== nick) { if (v) sv.nicks[id] = v; else delete sv.nicks[id]; n++; }
    }
    data.namesPlain40 = true; save();
    if (n) console.log(`[names] made ${n} names plain`);
  }

  // ======================= sharing encrypted history with a new device =======================
  // A device that can't read older encrypted messages (a new browser, cleared storage, or Zuno's
  // move to a new address) asks your other devices. One of them shows "Allow?"; if you say yes it
  // unlocks each message's key and locks it again for the new device. Zuno never sees the keys:
  // it only passes along locked copies, and only between devices on your own account.
  const myDev = (me, id) => (me.e2eDevices || []).find(d => d.id === String(id || ''));
  function* myEncrypted(me) {
    for (const [key, st] of Object.entries(data.dms || {})) {
      const [a, b] = key.split(':');
      if (a !== me.id && b !== me.id) continue;
      const peer = a === me.id ? b : a;
      for (const m of st?.messages || []) if (m.e2e) yield { c: peer, m };
    }
    for (const g of Object.values(data.groups || {})) {
      if (!g.members?.includes(me.id)) continue;
      for (const m of data.groupMessages?.[g.id]?.messages || []) if (m.e2e) yield { c: 'g:' + g.id, m };
    }
  }
  route('POST', '/api/me/e2e/history-request', async ({ me, body }) => {
    const dev = myDev(me, body.device);
    if (!dev) fail(400, 'This device isn\'t set up for encryption yet. Reload Zuno and try again.');
    z.limit('e2ehist:' + me.id, 4, 10 * 60e3, 'You just asked. Give your other devices a moment.');
    const online = (z.streams.get(me.id) || new Set()).size;
    z.send(me.id, 'e2e-history-req', { device: dev.id, name: dev.name || 'A device' });
    return { ok: true, online };
  });
  // The device that says yes: which messages it can unlock for the new device.
  route('GET', '/api/me/e2e/history-keys', async ({ me, query }) => {
    const from = myDev(me, query.get('from')), to = myDev(me, query.get('to'));
    if (!from || !to || from.id === to.id) fail(400, 'Unknown device.');
    const items = [];
    for (const { c, m } of myEncrypted(me)) {
      const k = m.e2e.keys?.[from.id];
      if (!k || m.e2e.keys[to.id]) continue;
      items.push({ c, m: m.id, ct: m.e2e.ct, iv: k.iv, k: k.k, fk: k.fk || m.e2e.fromKey });
    }
    return { items: items.slice(-3000), key: to.key };
  });
  route('POST', '/api/me/e2e/history-keys', async ({ me, body }) => {
    const from = myDev(me, body.from), to = myDev(me, body.to);
    if (!from || !to || from.id === to.id) fail(400, 'Unknown device.');
    z.limit('e2ehistput:' + me.id, 30, 10 * 60e3, 'Slow down a little.');
    const want = new Map((Array.isArray(body.items) ? body.items : []).slice(0, 600).map(i => [String(i.m), i]));
    const b64 = (v, max) => typeof v === 'string' && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v);
    let n = 0;
    for (const { m } of myEncrypted(me)) {
      const it = want.get(m.id);
      if (!it || !b64(it.iv, 32) || !b64(it.k, 200) || m.e2e.keys?.[to.id]) continue;
      // The key is locked between the sharing device and the new one, so it notes which device locked it.
      m.e2e.keys = { ...m.e2e.keys, [to.id]: { iv: it.iv, k: it.k, fk: from.key } };
      n++;
    }
    if (n) save();
    if (body.last || n) z.send(me.id, 'e2e-history-done', { device: to.id, count: n, last: !!body.last });
    return { count: n };
  });

  // Looking someone up by username, so an @mention can show their display name.
  route('GET', '/api/users/by-name/:name', async ({ me, params }) => {
    z.limit('byname:' + me.id, 120, 60e3, 'Slow down a little.');
    const name = String(params.name || '').toLowerCase();
    const u = Object.values(data.users).find(x => x.username === name && !x.deleted);
    if (!u) fail(404, 'User not found.');
    return { user: z.publicUser(u) };
  });
};
