// Zuno 0.16, part one: appearance (themes, app background), scheduled messages, picture alt text,
// spoilers and thumbnails, drafts that follow you, the search index, per-server profiles, status
// presets, name styles, friend suggestions, notification sounds, and the notification inbox.
const fs = require('fs');
const path = require('path');

module.exports = function studio(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser, systemMessage } = z;
  const users = () => Object.values(data.users);
  const human = u => u && !u.bot && !u.system && !u.webhook;

  // ======================= appearance =======================
  const NEW_BOOLS = { hour24: false, showChatAvatars: true, messageBubbles: true, autoplayGifs: true, linkPreviews: true, highContrast: false, squareAvatars: false, showRoleColors: true };
  for (const k of Object.keys(NEW_BOOLS)) if (!z.PREF_BOOLS.includes(k)) z.PREF_BOOLS.push(k);
  Object.assign(z.PREF_DEFAULTS, NEW_BOOLS, { appTheme: 'dark', uiScale: 100, saturation: 100, appBg: null, soundPack: 'classic' });
  const THEMES = ['dark', 'midnight', 'dim', 'light', 'ocean', 'grape', 'rose', 'forest', 'ember', 'slate', 'mocha', 'nebula', 'crimson', 'arctic', 'sakura', 'sand'];
  const PACKS = ['classic', 'pop', 'bubbly', 'retro', 'soft', 'chime', 'custom', 'none'];
  hooks.patchPrefs.push((me, prefs, body) => {
    if ('appTheme' in body && THEMES.includes(body.appTheme)) prefs.appTheme = body.appTheme;
    if ('uiScale' in body) prefs.uiScale = Math.max(80, Math.min(130, Math.round(Number(body.uiScale) || 100)));
    if ('saturation' in body) prefs.saturation = Math.max(0, Math.min(100, Math.round(Number(body.saturation) || 0)));
    if ('soundPack' in body && PACKS.includes(body.soundPack)) prefs.soundPack = body.soundPack;
    if ('appBg' in body) {
      const b = body.appBg;
      if (!b) { if (prefs.appBg?.url) z.removeUpload(prefs.appBg.url); prefs.appBg = null; }
      else if (prefs.appBg) prefs.appBg = { ...prefs.appBg, dim: Math.max(0, Math.min(90, Math.round(Number(b.dim) || 0))), blur: Math.max(0, Math.min(24, Math.round(Number(b.blur) || 0))) };
    }
  });
  // Your own picture behind the whole app. Free for everyone.
  route('POST', '/api/me/app-background', async ({ me, body }) => {
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF picture.');
    const url = z.storeUpload(body, k.ext);
    const prefs = { ...z.PREF_DEFAULTS, ...(me.prefs || {}) };
    if (prefs.appBg?.url) z.removeUpload(prefs.appBg.url);
    prefs.appBg = { url, dim: prefs.appBg?.dim ?? 45, blur: prefs.appBg?.blur ?? 0 };
    me.prefs = prefs; save();
    return { me: z.privateMe(me) };
  }, { raw: 8_000_000 });

  // ======================= name styles =======================
  // A font and an effect for your display name, free for everyone.
  const FONTS = ['default', 'pacifico', 'bungee', 'pixel', 'caveat', 'orbitron', 'marker', 'righteous', 'lobster', 'comfortaa', 'creepster', 'monoton'];
  const EFFECTS = ['none', 'gradient', 'animated', 'glow', 'neon', 'rainbow'];
  const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  hooks.patchMe.push((me, body) => {
    if (!('nameStyle' in body)) return;
    const n = body.nameStyle;
    if (!n) { me.nameStyle = null; return; }
    const font = FONTS.includes(n.font) ? n.font : 'default', effect = EFFECTS.includes(n.effect) ? n.effect : 'none';
    const colors = (Array.isArray(n.colors) ? n.colors : []).filter(hex).slice(0, 3);
    // "Plain" with a color you picked is a solid-colored name, so it's kept even with the default font.
    const solid = effect === 'none' && !!n.solid && colors.length > 0;
    me.nameStyle = font === 'default' && effect === 'none' && !solid ? null : { font, effect, colors: colors.length ? colors : ['#04c5ae', '#eb459e'], ...(solid ? { solid: true } : {}) };
  });
  hooks.publicUser.push(u => ({ nameStyle: u.nameStyle || null }));

  // ======================= status presets =======================
  hooks.meExtras.push(me => ({ statusPresets: me.statusPresets || [], drafts: me.drafts || {}, scheduled: (me.scheduled || []).map(scheduledView) }));
  route('PUT', '/api/me/status-presets', async ({ me, body }) => {
    const list = (Array.isArray(body.presets) ? body.presets : []).slice(0, 8).map(p => ({
      id: clean(p.id, 24) || newId(), text: clean(p.text, 80), emoji: clean(p.emoji, 16) || null,
      status: ['online', 'idle', 'dnd', 'invisible'].includes(p.status) ? p.status : null, clearAfter: [0, 1800e3, 3600e3, 4 * 3600e3, 'today'].includes(p.clearAfter) ? p.clearAfter : 0,
    })).filter(p => p.text || p.emoji || p.status);
    me.statusPresets = list; save();
    return { statusPresets: list };
  });

  // ======================= drafts that follow you =======================
  route('PUT', '/api/me/drafts', async ({ me, body }) => {
    const conv = String(body.conv || '');
    if (!/^(ch:|g:)?[A-Za-z0-9_-]{2,48}$/.test(conv)) fail(400, 'Unknown conversation.');
    let text = String(body.text ?? '').slice(0, 4000);
    // End-to-end encrypted DMs: what you type there never gets stored on the server.
    if (!/^(ch:|g:)/.test(conv) && data.users[conv] && data.dms[z.dmKey(me.id, conv)]?.e2e) text = '';
    me.drafts ||= {};
    if (text.trim()) me.drafts[conv] = { text, at: Date.now() }; else delete me.drafts[conv];
    // Keep the newest 100.
    const keys = Object.keys(me.drafts);
    if (keys.length > 100) for (const k of keys.sort((a, b) => me.drafts[a].at - me.drafts[b].at).slice(0, keys.length - 100)) delete me.drafts[k];
    save();
    send(me.id, 'draft', { conv, text: me.drafts[conv]?.text || '', at: Date.now(), device: clean(body.device, 40) });
    return { ok: true };
  });
  // Sending a message clears its draft everywhere.
  hooks.posted.push((conv, m, author) => {
    if (!author?.drafts) return;
    const key = conv.idFor(author.id);
    if (author.drafts[key]) { delete author.drafts[key]; send(author.id, 'draft', { conv: key, text: '', at: Date.now() }); }
  });

  // ======================= scheduled messages =======================
  const MAX_SCHEDULED = 25;
  const scheduledView = s => ({ id: s.id, conv: s.conv, content: s.content, at: s.at, createdAt: s.createdAt });
  route('GET', '/api/me/scheduled', async ({ me }) => ({ scheduled: (me.scheduled || []).map(scheduledView).sort((a, b) => a.at - b.at) }));
  route('POST', '/api/me/scheduled', async ({ me, body }) => {
    const convKey = String(body.conv || '');
    const conv = z.convOf(me, convKey);
    if (conv.canWrite() !== 'open') fail(403, 'You can schedule messages once they accept your message request.');
    if (conv.kind === 'dm' && conv.peek()?.e2e) fail(400, "Scheduled messages can't be end-to-end encrypted, so they're off in this chat.");
    const content = String(body.content ?? '').replace(/\r\n/g, '\n').trim();
    if (!content) fail(400, 'Write something to schedule.');
    const max = z.perksFor(me).message;
    if (content.length > max) fail(400, `Messages can be up to ${max} characters.`);
    const at = Number(body.at);
    if (!(at > Date.now() + 30e3)) fail(400, 'Pick a time at least a minute from now.');
    if (at > Date.now() + 365 * 864e5) fail(400, 'You can schedule up to a year ahead.');
    me.scheduled ||= [];
    if (me.scheduled.length >= MAX_SCHEDULED) fail(400, `You can have up to ${MAX_SCHEDULED} scheduled messages.`);
    const s = { id: newId(), conv: convKey, content, at, createdAt: Date.now() };
    me.scheduled.push(s); save();
    send(me.id, 'scheduled', {});
    return { scheduled: scheduledView(s) };
  });
  route('PATCH', '/api/me/scheduled/:id', async ({ me, params, body }) => {
    const s = (me.scheduled || []).find(x => x.id === params.id);
    if (!s) fail(404, 'That scheduled message was already sent or removed.');
    if ('content' in body) { const c = String(body.content || '').trim(); if (!c) fail(400, 'Write something to schedule.'); s.content = c.slice(0, z.perksFor(me).message); }
    if ('at' in body) { const at = Number(body.at); if (!(at > Date.now() + 30e3)) fail(400, 'Pick a time at least a minute from now.'); s.at = at; }
    save(); send(me.id, 'scheduled', {});
    return { scheduled: scheduledView(s) };
  });
  route('DELETE', '/api/me/scheduled/:id', async ({ me, params }) => {
    me.scheduled = (me.scheduled || []).filter(x => x.id !== params.id);
    save(); send(me.id, 'scheduled', {});
    return { ok: true };
  });
  function sendScheduled(u, s) {
    try {
      const conv = z.convOf(u, s.conv);
      if (conv.canWrite() !== 'open') throw new Error("they haven't accepted your message request");
      const extra = {};
      for (const fn of hooks.beforePost) fn({ conv, me: u, body: { content: s.content }, content: s.content, extra });
      const message = z.postMessage(conv, u, s.content, { ...extra, scheduled: true });
      hooks.afterPost.some(fn => fn({ conv, me: u, message, command: null }) === 'handled');
    } catch (err) {
      systemMessage(u.id, `⏰ Your scheduled message couldn't be sent: ${err.message || 'something went wrong'}\n> ${s.content.slice(0, 200)}`);
    }
  }
  setInterval(() => {
    const now = Date.now();
    for (const u of users()) {
      if (!u.scheduled?.length) continue;
      const due = u.scheduled.filter(s => s.at <= now);
      if (!due.length) continue;
      u.scheduled = u.scheduled.filter(s => s.at > now);
      for (const s of due) sendScheduled(u, s);
      save(); send(u.id, 'scheduled', {});
    }
  }, 10e3).unref();

  // ======================= pictures: alt text, spoilers, thumbnails, sizes =======================
  hooks.attachmentView.push((a, out, meta) => {
    // (0.48) Videos get a still picture (poster) and their size too, and both get a tiny blurry
    // placeholder that shows instantly while the real picture loads.
    if (a.kind === 'video') { if (a.thumb) out.thumb = a.thumb; if (a.w && a.h) { out.w = a.w; out.h = a.h; } if (a.ph) out.ph = a.ph; return; }
    if (a.kind !== 'image') return;
    if (a.thumb) out.thumb = a.thumb;
    if (a.w && a.h) { out.w = a.w; out.h = a.h; }
    if (a.ph) out.ph = a.ph;
    const alt = clean(meta.alt, 500);
    if (alt) out.alt = alt;
    if (meta.spoiler) out.spoiler = true;
  });
  // Width and height (so the chat doesn't jump while pictures load), and a small preview copy.
  route('POST', '/api/attachments/:id/thumb', async ({ me, params, body, req }) => {
    const a = data.attachments[params.id];
    if (!a || a.owner !== me.id || (a.kind !== 'image' && a.kind !== 'video')) fail(404, 'Attachment not found.');
    a.w = Math.max(1, Math.min(20000, Number(req.headers['x-width']) || 0)) || undefined;
    a.h = Math.max(1, Math.min(20000, Number(req.headers['x-height']) || 0)) || undefined;
    const ph = String(req.headers['x-placeholder'] || '');
    if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]{20,1400}$/.test(ph)) a.ph = ph;
    if (body?.length) {
      const k = z.sniff(body);
      if (!k || !['png', 'jpg', 'webp'].includes(k.ext)) fail(400, 'Previews must be PNG, JPG or WebP.');
      if (a.thumb) z.removeUpload(a.thumb);
      a.thumb = z.storeUpload(body, k.ext);
      z.noteAttachmentFile(a);
    }
    save();
    return { ok: true, thumb: a.thumb || null };
  }, { raw: 400_000 });
  // Change the alt text or spoiler on a picture you sent.
  for (const [prefix, resolve] of [['/api/dms/:target', z.dmConv], ['/api/channels/:target', z.channelConv], ['/api/groups/:target', z.groupConv]]) {
    route('PATCH', `${prefix}/messages/:msgId/attachments/:attId`, async ({ me, params, body }) => {
      const conv = resolve(me, params.target);
      const { st, i, m } = z.findMessage(conv, params.msgId);
      if (m.authorId !== me.id) fail(403, 'You can only change your own pictures.');
      const attachments = (m.attachments || []).map(a => (a.id !== params.attId ? a : { ...a, ...('alt' in body ? { alt: clean(body.alt, 500) || undefined } : {}), ...('spoiler' in body ? { spoiler: !!body.spoiler || undefined } : {}) }));
      const message = st.messages[i] = { ...m, attachments };
      save(); z.emit(conv, 'message-update', { message });
      return { message };
    });
  }

  // ======================= the search index =======================
  // Every word of every message, so searching stays instant however big Zuno gets.
  const index = new Map();   // word -> Set(ref)
  const words = new Map();   // ref -> [words]
  const refMeta = new Map(); // ref -> { map, conv, id, at }
  const tokenize = text => [...new Set(String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]{2,}/gu) || [])].slice(0, 300);
  const mapOf = conv => (conv.kind === 'dm' ? 'dms' : conv.kind === 'group' ? 'groupMessages' : 'channelMessages');
  const keyOf = conv => (conv.kind === 'dm' ? conv.key : conv.kind === 'group' ? conv.group.id : conv.channel.id);
  function unindex(ref) {
    for (const w of words.get(ref) || []) { const set = index.get(w); if (set) { set.delete(ref); if (!set.size) index.delete(w); } }
    words.delete(ref); refMeta.delete(ref);
  }
  function indexMessage(map, convKey, m) {
    const ref = `${map}|${convKey}|${m.id}`;
    unindex(ref);
    const text = [m.content, m.poll?.question, ...(m.attachments || []).map(a => `${a.name} ${a.alt || ''}`)].filter(Boolean).join(' ');
    const ws = tokenize(text);
    if (!ws.length) return;
    words.set(ref, ws);
    refMeta.set(ref, { map, conv: convKey, id: m.id, at: m.createdAt, author: m.authorId });
    for (const w of ws) { let set = index.get(w); if (!set) index.set(w, (set = new Set())); set.add(ref); }
  }
  for (const map of ['dms', 'channelMessages', 'groupMessages']) for (const [k, conv] of Object.entries(data[map] || {})) for (const m of conv.messages || []) indexMessage(map, k, m);
  hooks.posted.push((conv, m) => indexMessage(mapOf(conv), keyOf(conv), m));
  hooks.onEdit.push((conv, m) => indexMessage(mapOf(conv), keyOf(conv), m));
  hooks.onDelete.push((conv, m) => unindex(`${mapOf(conv)}|${keyOf(conv)}|${m.id}`));
  // Each word must start some word in the message ("hel wor" finds "Hello world").
  function lookup(q) {
    const qs = tokenize(q);
    if (!qs.length) return null;
    let result = null;
    for (const w of qs) {
      const hits = new Set();
      const exact = index.get(w);
      if (exact) for (const r of exact) hits.add(r);
      for (const [word, set] of index) if (word.length > w.length && word.startsWith(w)) for (const r of set) hits.add(r);
      result = result ? new Set([...result].filter(r => hits.has(r))) : hits;
      if (!result.size) break;
    }
    return result;
  }
  // The chat search box (features.js) asks this for one conversation.
  hooks.searchIn = (conv, q) => {
    const refs = lookup(q);
    if (!refs) return null;
    const prefix = `${mapOf(conv)}|${keyOf(conv)}|`;
    return new Set([...refs].filter(r => r.startsWith(prefix)).map(r => refMeta.get(r).id));
  };
  // Search everywhere: every DM, group and channel you can see. Also finds a DM by what was said in it.
  route('GET', '/api/search', async ({ me, query }) => {
    let q = clean(query.get('q'), 120);
    const scope = clean(query.get('scope'), 40) || 'all';
    const fromM = /\bfrom:@?([a-z0-9_.]{2,32})/i.exec(q);
    if (fromM) q = q.replace(fromM[0], '').trim();
    const fromUser = fromM && users().find(u => u.username === fromM[1].toLowerCase());
    if (fromM && !fromUser) return { results: [], total: 0 };
    const refs = lookup(q);
    if (!refs) return { results: [], total: 0 };
    const out = [];
    const canSee = new Map();
    const access = meta => {
      const k = meta.map + '|' + meta.conv;
      if (canSee.has(k)) return canSee.get(k);
      let v = null;
      try {
        if (meta.map === 'dms') {
          const ids = meta.conv.split(':');
          const dm = data.dms[meta.conv];
          if (ids.includes(me.id) && !(dm?.request && dm.request.to === me.id && dm.request.status !== 'accepted')) { const other = ids[0] === me.id ? ids[1] : ids[0]; v = { conv: other, kind: 'dm', title: data.users[other]?.displayName || 'Someone', user: publicUser(data.users[other]) }; }
        } else if (meta.map === 'groupMessages') {
          const g = data.groups[meta.conv];
          if (g?.members.includes(me.id)) v = { conv: 'g:' + g.id, kind: 'group', title: g.name || g.members.filter(id => id !== me.id).map(id => data.users[id]?.displayName).filter(Boolean).slice(0, 3).join(', ') };
        } else {
          const c = z.channelConv(me, meta.conv);
          const since = c.perms.has('read_history') ? 0 : me.joinedAt?.[c.server.id] || 0;
          v = { conv: 'ch:' + c.channel.id, kind: 'channel', title: '#' + c.channel.name, server: { id: c.server.id, name: c.server.name, icon: c.server.icon || null, iconColor: c.server.iconColor }, since };
        }
      } catch { v = null; }
      if (v && scope !== 'all') {
        if (scope === 'dms' && v.kind === 'channel') v = null;
        else if (scope === 'servers' && v.kind !== 'channel') v = null;
        else if (!['dms', 'servers'].includes(scope) && v.server?.id !== scope) v = null;
      }
      canSee.set(k, v);
      return v;
    };
    const sorted = [...refs].map(r => refMeta.get(r)).filter(Boolean).sort((a, b) => b.at - a.at);
    let total = 0;
    for (const meta of sorted) {
      if (fromUser && meta.author !== fromUser.id) continue;
      const where = access(meta);
      if (!where || (where.since && meta.at < where.since)) continue;
      total++;
      if (out.length >= 60) continue;
      const m = (data[meta.map][meta.conv]?.messages || []).find(x => x.id === meta.id);
      if (m) out.push({ where, message: m });
    }
    const authors = [...new Set(out.map(r => r.message.authorId))].map(id => publicUser(data.users[id])).filter(Boolean);
    return { results: out, total, authors };
  });

  // ======================= per-server profiles =======================
  // A different picture, bio and pronouns in each server (your nickname already works per server).
  hooks.serverSummary.push(sv => ({ memberProfiles: sv.memberProfiles || {} }));
  route('PUT', '/api/servers/:id/my-profile', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    sv.memberProfiles ||= {};
    const cur = sv.memberProfiles[me.id] || {};
    const next = { ...cur };
    if ('bio' in body) next.bio = clean(body.bio, z.perksFor(me).bio) || undefined;
    if ('pronouns' in body) next.pronouns = clean(body.pronouns, 24) || undefined;
    await z.judgeText({ 'server bio': next.bio !== cur.bio && next.bio, 'server pronouns': next.pronouns !== cur.pronouns && next.pronouns });
    if ('bannerColor' in body) next.bannerColor = hex(body.bannerColor) ? body.bannerColor : undefined;
    if (body.avatar === null && cur.avatar) { z.removeUpload(cur.avatar); next.avatar = undefined; }
    if (body.banner === null && cur.banner) { if (cur.banner.url) z.removeUpload(cur.banner.url); next.banner = undefined; }
    const clean2 = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    if (Object.keys(clean2).length) sv.memberProfiles[me.id] = clean2; else delete sv.memberProfiles[me.id];
    save(); z.refreshServer(sv);
    return { profile: sv.memberProfiles[me.id] || null };
  });
  route('POST', '/api/servers/:id/my-profile/avatar', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF picture.');
    sv.memberProfiles ||= {};
    const cur = sv.memberProfiles[me.id] || {};
    if (cur.avatar) z.removeUpload(cur.avatar);
    sv.memberProfiles[me.id] = { ...cur, avatar: z.storeUpload(body, k.ext) };
    save(); z.refreshServer(sv);
    return { profile: sv.memberProfiles[me.id] };
  }, { raw: 1_000_000 });
  // (0.45.1) A banner picture just for this server (GIFs move), same size limit as your main banner.
  route('POST', '/api/servers/:id/my-profile/banner', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    const k = z.sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF picture.');
    const max = z.perksFor(me).banner || 4 * 1024 * 1024;
    if (body.length > max) fail(400, `Banners can be up to ${Math.round(max / 1048576)} MB.`);
    sv.memberProfiles ||= {};
    const cur = sv.memberProfiles[me.id] || {};
    if (cur.banner?.url) z.removeUpload(cur.banner.url);
    sv.memberProfiles[me.id] = { ...cur, banner: { url: z.storeUpload(body, k.ext), type: k.ext === 'gif' ? 'gif' : 'image' } };
    save(); z.refreshServer(sv);
    return { profile: sv.memberProfiles[me.id] };
  }, { raw: 25_000_000 });

  // ======================= friend suggestions =======================
  route('GET', '/api/friends/suggestions', async ({ me }) => {
    const friends = new Set(z.friendIds(me.id));
    const pending = new Set(Object.values(data.friendRequests).flatMap(r => (r.from === me.id ? [r.to] : r.to === me.id ? [r.from] : [])));
    const dismissed = new Set(me.dismissedSuggestions || []);
    const scores = new Map();
    const bump = (id, kind, n = 1) => {
      if (id === me.id || friends.has(id) || pending.has(id) || dismissed.has(id)) return;
      const u = data.users[id];
      if (!human(u) || z.isBlocked(me.id, id) || u.prefs?.dmRequests === 'friends' && false) return;
      const s = scores.get(id) || { mutualFriends: 0, servers: [] };
      if (kind === 'friend') s.mutualFriends += n; else s.servers.push(kind);
      scores.set(id, s);
    };
    for (const f of friends) for (const id of z.friendIds(f)) bump(id, 'friend');
    // People you share small servers with (big public ones would suggest strangers).
    for (const sv of Object.values(data.servers)) if (sv.members.includes(me.id) && !sv.official && sv.members.length <= 60) for (const id of sv.members) bump(id, sv.name);
    const list = [...scores.entries()].map(([id, s]) => ({ id, ...s, score: s.mutualFriends * 3 + s.servers.length }))
      .filter(s => s.mutualFriends >= 1 || s.servers.length >= 1).sort((a, b) => b.score - a.score).slice(0, 12);
    return { suggestions: list.map(s => ({ user: publicUser(data.users[s.id]), mutualFriends: s.mutualFriends, servers: s.servers.slice(0, 3) })) };
  });
  route('POST', '/api/friends/suggestions/:id/dismiss', async ({ me, params }) => {
    me.dismissedSuggestions = [...new Set([...(me.dismissedSuggestions || []), params.id])].slice(-500);
    save();
    return { ok: true };
  });

  // ======================= your own notification sound =======================
  route('POST', '/api/me/notif-sound', async ({ me, body, req }) => {
    const k = z.sniff(body);
    if (!k || k.ext !== 'mp3') fail(400, 'Notification sounds must be MP3 files.');
    if (me.notifSound?.url) z.removeUpload(me.notifSound.url);
    me.notifSound = { url: z.storeUpload(body, 'mp3'), name: clean(decodeURIComponent(req.headers['x-file-name'] || 'My sound'), 60).replace(/\.mp3$/i, '') || 'My sound' };
    const prefs = { ...z.PREF_DEFAULTS, ...(me.prefs || {}) };
    prefs.soundPack = 'custom'; me.prefs = prefs;
    save();
    return { notifSound: me.notifSound, me: z.privateMe(me) };
  }, { raw: 1_000_000 });
  route('DELETE', '/api/me/notif-sound', async ({ me }) => {
    if (me.notifSound?.url) z.removeUpload(me.notifSound.url);
    me.notifSound = null;
    const prefs = { ...z.PREF_DEFAULTS, ...(me.prefs || {}) };
    if (prefs.soundPack === 'custom') prefs.soundPack = 'classic';
    me.prefs = prefs; save();
    return { me: z.privateMe(me) };
  });
  hooks.meExtras.push(me => ({ notifSound: me.notifSound || null }));

  // ======================= the notification inbox =======================
  // One place for mentions and replies (everywhere), reactions to your messages, friend requests,
  // missed calls and reminders.
  const MAX_NOTIFS = 150;
  function notify(uid, n) {
    const u = data.users[uid];
    if (!human(u)) return;
    u.notifs = [...(u.notifs || []).filter(x => !(n.key && x.key === n.key)), { id: newId(), at: Date.now(), ...n }].slice(-MAX_NOTIFS);
    save();
    send(uid, 'notif', { unread: unreadCount(u) });
  }
  z.notify = notify;
  const unreadCount = u => (u.notifs || []).filter(n => n.at > (u.notifsSeenAt || 0)).length;
  hooks.meExtras.push(me => ({ notifUnread: unreadCount(me) }));
  const snippet = m => (m.content || (m.attachments ? '📎 Attachment' : m.gif ? 'GIF' : m.poll ? `📊 ${m.poll.question}` : '')).slice(0, 140);
  const whereOf = (conv, uid) => (conv.kind === 'channel' ? { conv: 'ch:' + conv.channel.id, title: `#${conv.channel.name}`, server: conv.server.name, serverId: conv.server.id } : conv.kind === 'group' ? { conv: 'g:' + conv.group.id, title: conv.group.name || 'Group chat' } : { conv: conv.idFor(uid), title: 'Direct message' });
  hooks.posted.push((conv, m, author) => {
    if (!author || author.system || m.call || conv.kind === 'dm') return;
    const pinged = new Set(m.mentions || []);
    if (m.replyTo?.authorId && !m.replyTo.noPing) pinged.add(m.replyTo.authorId);
    if (conv.kind === 'channel') {
      for (const rid of m.mentionRoles || []) for (const id of conv.members) if (z.rolesOf(conv.server, id).includes(rid)) pinged.add(id);
      if (m.mentionEveryone) for (const id of conv.members) pinged.add(id);
    }
    pinged.delete(author.id);
    for (const uid of pinged) {
      if (!conv.members.includes(uid)) continue;
      notify(uid, { type: m.replyTo?.authorId === uid && !(m.mentions || []).includes(uid) ? 'reply' : 'mention', from: author.id, msgId: m.id, text: snippet(m), ...whereOf(conv, uid) });
    }
  });
  hooks.onReact.push(({ conv, me, message, emoji, added }) => {
    if (!added || message.authorId === me.id) return;
    notify(message.authorId, { type: 'reaction', key: `rx:${message.id}:${me.id}:${emoji}`, from: me.id, emoji, msgId: message.id, text: snippet(message), ...whereOf(conv, message.authorId) });
  });
  // A new friend shows up in both people's DMs straight away.
  hooks.friend.push((kind, a, b) => {
    if (kind !== 'accepted') return;
    const dm = data.dms[z.dmKey(a, b)] ||= { messages: [] };
    dm.friendsAt ||= Date.now();
    delete dm.hiddenBy;
  });
  hooks.friend.push((kind, a, b) => {
    if (kind === 'request') notify(b, { type: 'friend_request', key: `fr:${a}`, from: a });
    if (kind === 'accepted') notify(a, { type: 'friend_accept', key: `fa:${b}`, from: b });
  });
  hooks.callDone.push((roomId, log, conv) => {
    if (!conv) return;
    for (const uid of conv.members) if (uid !== log.by) notify(uid, { type: 'missed_call', from: log.by, msgId: log.msgId, ...whereOf(conv, uid) });
  });
  route('GET', '/api/me/notifications', async ({ me }) => {
    const items = (me.notifs || []).slice().reverse().filter(n => !n.from || data.users[n.from]);
    const people = [...new Set(items.map(n => n.from).filter(Boolean))].map(id => publicUser(data.users[id])).filter(Boolean);
    return { items: items.map(n => ({ ...n, unread: n.at > (me.notifsSeenAt || 0) })), users: people, unread: unreadCount(me) };
  });
  route('POST', '/api/me/notifications/seen', async ({ me }) => {
    me.notifsSeenAt = Date.now(); save();
    send(me.id, 'notif', { unread: 0 });
    return { ok: true };
  });
  route('DELETE', '/api/me/notifications/:id', async ({ me, params }) => {
    me.notifs = params.id === 'all' ? [] : (me.notifs || []).filter(n => n.id !== params.id);
    save(); send(me.id, 'notif', { unread: unreadCount(me) });
    return { ok: true };
  });

  // ======================= 0.17: favorite emoji, where an emoji is from, profile media =======================
  if (!z.PREF_BOOLS.includes('othersProfileMedia')) z.PREF_BOOLS.push('othersProfileMedia');
  z.PREF_DEFAULTS.othersProfileMedia = true; // off: other people's profile videos, GIFs and sounds never load
  const emojiTok = /^(<:[a-z0-9_]{2,32}:[a-z0-9]{8,48}\.(png|gif|webp|jpg)>|[^<>\s]{1,16})$/i;
  hooks.meExtras.push(me => ({ favEmojis: me.favEmojis || [] }));
  route('PUT', '/api/me/fav-emojis', async ({ me, body }) => {
    me.favEmojis = [...new Set((Array.isArray(body.emojis) ? body.emojis : []).map(String).filter(e => emojiTok.test(e)))].slice(0, 60);
    save();
    return { favEmojis: me.favEmojis };
  });
  // Click a server emoji in chat: which server it's from, and whether you can join it.
  route('GET', '/api/emojis/:file', async ({ me, params }) => {
    const sv = Object.values(data.servers).find(s => (s.emojis || []).some(e => e.id === params.file));
    if (!sv) return { emoji: null, server: null };
    const e = sv.emojis.find(x => x.id === params.file);
    const joined = sv.members.includes(me.id);
    const visible = joined || sv.discoverable;
    return {
      emoji: { id: e.id, name: e.name, animated: !!e.animated },
      server: visible ? { id: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor, description: sv.description || '', memberCount: sv.members.length, online: sv.members.filter(id => z.isOnline(id) && data.users[id]?.status !== 'invisible').length, joined, discoverable: !!sv.discoverable } : null,
    };
  });

  return { notify };
};
