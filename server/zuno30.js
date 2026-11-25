'use strict';
// Zuno 0.30: community creations. Anyone can make an avatar decoration, a profile effect or a name
// banner and send it in. Zuno Staff approve it (Moderation › Community Decorations), then everyone
// can find it in Community and wear it. Your first approved one earns the Artist badge.

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, newId, send } = z;
  const human = u => u && !u.system && !u.bot && !u.deleted;
  data.creations ||= {};
  // Cat Scratch is out for now: anyone wearing it goes back to no effect.
  for (const u of Object.values(data.users)) if (u.profileEffect === 'catscratch') u.profileEffect = null;

  const KINDS = {
    // (0.47) Sizes in MB as computers show them (1 MB = 1024 × 1024 bytes), so a file Windows shows
    // as "5,898 KB" counts as under 6 MB.
    decoration: { label: 'decoration', max: 3 * 1048576 },
    effect: { label: 'profile effect', max: 6 * 1048576 },
    banner: { label: 'name banner', max: 2 * 1048576 },
  };
  // Built-in name banners anyone can use (drawn with CSS on the app side).
  const BANNER_PRESETS = ['aurora', 'sunset', 'ocean', 'sakura', 'mint', 'galaxy', 'lava', 'gold'];

  // Width and height straight from the file, so nothing gets stretched by surprise.
  function imageSize(buf, ext) {
    try {
      if (ext === 'png' && buf.toString('latin1', 12, 16) === 'IHDR') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      if (ext === 'gif') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
      if (ext === 'webp') {
        const t = buf.toString('latin1', 12, 16);
        if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
        if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
        if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      }
    } catch {}
    return null;
  }
  // GIFs and animated WebPs move; everything else is still.
  const isAnimated = (buf, ext) => (ext === 'gif' ? buf.indexOf('NETSCAPE2.0') > 0 || (buf.toString('latin1').match(/\x21\xf9\x04/g) || []).length > 1 : ext === 'webp' ? buf.indexOf('ANIM') > 0 && buf.indexOf('ANIM') < 64 : false);
  function checkShape(kind, s) {
    if (!s) fail(400, "That picture couldn't be read. Try saving it again as a PNG, WebP or GIF.");
    if (kind === 'decoration') {
      if (s.w !== s.h) fail(400, `Decorations must be square (yours is ${s.w}×${s.h}). 512×512 works best.`);
      if (s.w < 192) fail(400, `Decorations need to be at least 192×192 (yours is ${s.w}×${s.h}) or they look blurry.`);
    } else if (kind === 'effect') {
      if (s.w < 300 || s.h < 300) fail(400, `Profile effects need to be at least 300×300 (yours is ${s.w}×${s.h}). 600×900 works best.`);
      const r = s.h / s.w;
      if (r < 0.8 || r > 2.2) fail(400, `Profile effects should be about as tall as a profile (yours is ${s.w}×${s.h}). 600×900 works best.`);
    } else if (kind === 'banner') {
      const r = s.w / s.h;
      if (s.w < 300) fail(400, `Name banners need to be at least 300 wide (yours is ${s.w}×${s.h}). 600×100 works best.`);
      if (r < 3 || r > 9) fail(400, `Name banners are long and thin (yours is ${s.w}×${s.h}). 600×100 works best.`);
    }
  }

  const live = c => c && c.status === 'approved';
  const view = (c, withOwner = true) => ({
    id: c.id, kind: c.kind, name: c.name, url: c.url, animated: !!c.animated, status: c.status, reason: c.reason || null,
    at: c.at, by: c.by, wears: wearCount(c.id), everWorn: c.everWornN || 0, favs: c.favN || 0, ...(withOwner ? { creator: data.users[c.by] ? z.publicUser(data.users[c.by]) : null } : {}),
  });
  // How many people wear each creation, recounted at most once a minute.
  let wears = null, wearsAt = 0;
  function wearCount(id) {
    if (!wears || Date.now() - wearsAt > 60e3) {
      wears = {};
      for (const u of Object.values(data.users)) for (const k of [u.cdeco, u.ceffect, u.nbanner]) if (k && data.creations[k]) wears[k] = (wears[k] || 0) + 1;
      wearsAt = Date.now();
    }
    return wears[id] || 0;
  }
  const isArtist = u => z.badgesFor(u).includes('artist');
  const pendingCap = u => (isArtist(u) ? 6 : 3);

  // ---------- what everyone sees on you ----------
  hooks.publicUser.push(u => {
    const out = {};
    const d = data.creations[u.cdeco], e = data.creations[u.ceffect];
    if (live(d)) out.communityDeco = { id: d.id, url: d.url, animated: !!d.animated, name: d.name };
    if (live(e)) out.communityEffect = { id: e.id, url: e.url, name: e.name };
    if (u.nbanner?.startsWith?.('preset:')) { const p = u.nbanner.slice(7); if (BANNER_PRESETS.includes(p)) out.nameBanner = { preset: p }; }
    else { const b = data.creations[u.nbanner]; if (live(b)) out.nameBanner = { id: b.id, url: b.url, animated: !!b.animated }; }
    if (human(u) && u.showCreations !== false && Object.values(data.creations).some(c => c.by === u.id && live(c))) out.hasCreations = true;
    return out;
  });

  // ---------- browsing ----------
  route('GET', '/api/creations', async ({ me, query }) => {
    const kind = query.get('kind'), q = (query.get('q') || '').toLowerCase().slice(0, 40), sort = query.get('sort') || 'popular';
    let list = Object.values(data.creations).filter(c => live(c) && (!KINDS[kind] || c.kind === kind));
    if (query.get('favs') === '1') list = list.filter(c => me.creationFavs?.[c.id]); // just the ones you favorited
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (data.users[c.by]?.username || '').includes(q));
    list.sort(sort === 'new' ? (a, b) => b.approvedAt - a.approvedAt : (a, b) => wearCount(b.id) - wearCount(a.id) || b.approvedAt - a.approvedAt);
    return { creations: list.slice(0, 120).map(c => ({ ...view(c), faved: !!me.creationFavs?.[c.id] })), presets: BANNER_PRESETS };
  });
  route('GET', '/api/creations/mine', async ({ me }) => ({
    creations: Object.values(data.creations).filter(c => c.by === me.id && c.status !== 'removed').sort((a, b) => b.at - a.at).map(c => view(c, false)),
    pendingCap: pendingCap(me), artist: isArtist(me), showCreations: me.showCreations !== false,
  }));
  route('GET', '/api/users/:id/creations', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u) || (u.showCreations === false && u.id !== me.id)) return { creations: [] };
    return { creations: Object.values(data.creations).filter(c => c.by === u.id && live(c)).sort((a, b) => wearCount(b.id) - wearCount(a.id)).slice(0, 24).map(c => view(c, false)) };
  });

  // ---------- sending one in ----------
  route('POST', '/api/creations', async ({ me, query, body }) => {
    if (!human(me)) fail(403, "This account can't send in creations.");
    const kind = query.get('kind');
    if (!KINDS[kind]) fail(400, 'Pick what you made: a decoration, a profile effect or a name banner.');
    if (query.get('own') !== '1') fail(400, 'Tick the box to confirm you made this yourself.');
    const name = clean(query.get('name') || '', 32).trim();
    if (name.length < 2) fail(400, 'Give it a name (2 to 32 letters).');
    await z.judgeText({ name });
    z.limit('creation:' + me.id, 10, 3600e3, "You've sent a lot in this hour. Try again later.");
    const mine = Object.values(data.creations).filter(c => c.by === me.id && c.status === 'pending').length;
    if (mine >= pendingCap(me)) fail(400, `You have ${mine} waiting for review already (up to ${pendingCap(me)} at once). Wait for staff to look at those first.`);
    if (!Buffer.isBuffer(body) || !body.length) fail(400, 'Pick a picture first.');
    if (body.length > KINDS[kind].max) fail(400, `That file is too big. A ${KINDS[kind].label} can be up to ${Math.round(KINDS[kind].max / 104857.6) / 10} MB.`);
    const k = z.sniff(body);
    if (!k || !['png', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, WebP or GIF with a see-through background.');
    checkShape(kind, imageSize(body, k.ext));
    const c = { id: newId(), kind, name, url: z.storeUpload(body, k.ext), animated: isAnimated(body, k.ext), by: me.id, at: Date.now(), status: 'pending' };
    data.creations[c.id] = c;
    save();
    for (const u of Object.values(data.users)) if (z.isStaff(u) && !u.system) send(u.id, 'creations-review', {});
    return { creation: view(c, false) };
  }, { raw: 6 * 1048576 + 4096 });
  route('DELETE', '/api/creations/:id', async ({ me, params, query }) => {
    const c = data.creations[params.id];
    if (!c || c.status === 'removed') fail(404, 'That one is already gone.');
    if (c.by !== me.id && !z.isStaff(me)) fail(403, 'Only the person who made it can delete it.');
    if (c.by !== me.id && data.users[c.by]) {
      const why = String(query.get('reason') || '').trim().slice(0, 300);
      z.systemMessage(c.by, `Your ${KINDS[c.kind].label} **${c.name}** was removed by the Zuno team.${why ? `\n\nWhy: ${why}` : ''}`);
    }
    c.status = 'removed';
    z.artistStatsDirty?.();
    z.removeUpload(c.url);
    takeOff(c.id);
    save();
    return { ok: true };
  });

  // ---------- wearing ----------
  function takeOff(id) {
    for (const u of Object.values(data.users)) {
      let changed = false;
      for (const k of ['cdeco', 'ceffect', 'nbanner']) if (u[k] === id) { delete u[k]; changed = true; }
      if (changed) z.broadcastUser(u);
    }
    wears = null;
  }
  route('PATCH', '/api/me/wear', async ({ me, body }) => {
    const slot = { decoration: 'cdeco', effect: 'ceffect', banner: 'nbanner' }[body.kind];
    if (!slot) fail(400, 'Pick what to wear.');
    const id = body.id ? String(body.id) : null;
    if (!id) delete me[slot];
    else if (body.kind === 'banner' && id.startsWith('preset:')) {
      if (!BANNER_PRESETS.includes(id.slice(7))) fail(400, 'Unknown name banner.');
      me[slot] = id;
    } else {
      const c = data.creations[id];
      if (!live(c) || c.kind !== body.kind) fail(404, "That one isn't available.");
      me[slot] = id;
      // Everyone who ever wore it counts toward its maker's Talented Artist badge (0.31).
      if (c.by !== me.id) { c.everWorn ||= {}; if (!c.everWorn[me.id]) { c.everWorn[me.id] = 1; c.everWornN = (c.everWornN || 0) + 1; z.artistStatsDirty?.(); } }
      // A community decoration or effect replaces the built-in one.
      if (body.kind === 'decoration') me.decoration = null;
      if (body.kind === 'effect') me.profileEffect = null;
    }
    wears = null;
    save(); z.broadcastUser(me);
    send(me.id, 'me', z.privateMe(me));
    return { me: z.privateMe(me) };
  });
  // Picking a built-in decoration or effect takes off the community one.
  hooks.patchMe.push((me, body) => {
    if (body.decoration) delete me.cdeco;
    if (body.profileEffect) delete me.ceffect;
  });
  route('PATCH', '/api/me/creations-widget', async ({ me, body }) => {
    me.showCreations = !!body.show;
    save(); z.broadcastUser(me);
    return { show: me.showCreations };
  });

  // ---------- staff review ----------
  route('GET', '/api/creations/review', async ({ me }) => {
    z.needStaff(me);
    const list = Object.values(data.creations).filter(c => c.status === 'pending').sort((a, b) => a.at - b.at);
    const recent = Object.values(data.creations).filter(c => ['approved', 'rejected'].includes(c.status) && c.reviewedAt > Date.now() - 7 * 864e5).sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 30);
    return { pending: list.map(c => view(c)), recent: recent.map(c => ({ ...view(c), reviewedBy: data.users[c.reviewedBy]?.displayName || null })) };
  });
  route('PATCH', '/api/creations/:id/review', async ({ me, params, body }) => {
    z.needStaff(me);
    const c = data.creations[params.id];
    if (!c || c.status === 'removed') fail(404, 'That one is gone.');
    const maker = data.users[c.by];
    if (body.approve) {
      if (c.by === me.id && !z.isFounder(me.id)) fail(403, "You can't approve your own creation. Ask another staff member.");
      c.status = 'approved'; c.reason = null; c.approvedAt = Date.now();
      if (maker && !z.badgesFor(maker).includes('artist')) {
        maker.badgeGrants = [...new Set([...(maker.badgeGrants || []), 'artist'])];
        maker.badgeRemovals = (maker.badgeRemovals || []).filter(x => x !== 'artist');
        z.systemMessage(maker.id, `🎨 Your ${KINDS[c.kind].label} **${c.name}** was approved and is now in Community for everyone. You earned the **Artist** badge, and you can now have up to 6 waiting for review at once.`);
      } else if (maker) z.systemMessage(maker.id, `🎨 Your ${KINDS[c.kind].label} **${c.name}** was approved and is now in Community for everyone.`);
    } else {
      const reason = clean(body.reason || '', 300);
      if (!reason) fail(400, 'Say why, so they can fix it.');
      const was = c.status;
      c.status = 'rejected'; c.reason = reason;
      if (was === 'approved') takeOff(c.id);
      if (maker) z.systemMessage(maker.id, `Your ${KINDS[c.kind].label} **${c.name}** ${was === 'approved' ? 'was taken down' : "wasn't approved"}.\n\nWhy: ${reason}`);
    }
    c.reviewedBy = me.id; c.reviewedAt = Date.now();
    z.artistStatsDirty?.();
    save();
    if (maker) z.broadcastUser(maker);
    for (const u of Object.values(data.users)) if (z.isStaff(u) && !u.system) send(u.id, 'creations-review', {});
    return { creation: view(c) };
  });
  route('GET', '/api/creations/review/count', async ({ me }) => {
    z.needStaff(me);
    return { pending: Object.values(data.creations).filter(c => c.status === 'pending').length };
  });

  // ======================= favorite stickers =======================
  // Up to 30, in the order you starred them. Stickers from servers you've left stay listed but
  // can't be sent (the picker hides them).
  const favView = me => (Array.isArray(me.favStickers) ? me.favStickers : []);
  route('GET', '/api/me/fav-stickers', async ({ me }) => ({ favs: favView(me) }));
  route('PUT', '/api/me/fav-stickers', async ({ me, body }) => {
    if (!Array.isArray(body.favs)) fail(400, 'Send the list of favorites.');
    me.favStickers = body.favs.slice(0, 30).map(f => ({ id: clean(String(f?.id || ''), 60), ...(f?.serverId ? { serverId: clean(String(f.serverId), 40) } : {}) })).filter(f => f.id);
    save();
    return { favs: favView(me) };
  });
};
