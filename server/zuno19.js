// Zuno 0.19: threads, translation, stickers, bookmark folders, "Catch me up", Listen Together and
// Watch Together, server events, AutoMod, account recovery codes, a map of where you're logged in,
// and scheduled maintenance notices.
// index.js hands everything this needs over in `z`.
const https = require('https');

module.exports = function zuno19(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser } = z;
  const human = u => u && !u.bot && !u.system;
  const everyStream = (event, payload) => { const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`; for (const set of z.streams.values()) for (const res of set) z.streamWrite(res, chunk); };
  // A small https GET/POST that gives back parsed JSON (or null), with a time limit.
  function fetchJson(url, { method = 'GET', headers = {}, body = null, timeout = 8000 } = {}) {
    return new Promise(resolve => {
      const req = https.request(url, { method, headers: { 'User-Agent': 'Zuno', ...headers }, timeout }, res => {
        let buf = '';
        res.on('data', d => { buf += d; if (buf.length > 2e6) req.destroy(); });
        res.on('end', () => { try { resolve(res.statusCode < 300 ? JSON.parse(buf) : null); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (body) req.write(body);
      req.end();
    });
  }
  // Everyone in a server who can see a channel.
  const viewersOf = (sv, ch) => sv.members.filter(id => z.canView(sv, ch, id));

  // ======================= AutoMod =======================
  // Server Settings › AutoMod: blocks words, links, invites, mention spam, shouting and repeated
  // messages before anyone sees them. People who can manage messages are never blocked.
  const AUTOMOD_DEFAULTS = { enabled: false, words: [], links: false, allowDomains: [], invites: true, mentionLimit: 0, caps: false, spam: true, newAccountLinks: 0, timeoutMinutes: 0, alertChannelId: null, exemptRoles: [], exemptChannels: [] };
  const automodOf = sv => ({ ...AUTOMOD_DEFAULTS, ...(sv.automod || {}) });
  const INVITE_RE = /zuno\.invite\/[A-Za-z0-9_-]{4,}|\/invite\/[A-Za-z0-9_-]{4,}|\x64iscord\.(gg|com\/invite)\/\S+/i;
  const URL_RE = /\bhttps?:\/\/([^\s/]+)[^\s]*|\bwww\.([^\s/]+)[^\s]*/gi;
  const recent = new Map(); // "server|user" -> [{ at, text }]
  setInterval(() => { const now = Date.now(); for (const [k, v] of recent) if (!v.some(x => x.at > now - 30e3)) recent.delete(k); }, 60e3).unref();
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function wordHit(words, text) {
    const lower = text.toLowerCase();
    return words.find(w => {
      w = String(w).toLowerCase().trim();
      if (!w) return false;
      // "*bad*" matches inside other words; plain words only match whole words.
      if (w.startsWith('*') || w.endsWith('*')) return lower.includes(w.replace(/^\*|\*$/g, ''));
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(w)}([^\\p{L}\\p{N}]|$)`, 'iu').test(lower);
    });
  }
  function automodCheck(sv, ch, me, content) {
    const c = automodOf(sv);
    if (!c.enabled || !content || !human(me) || sv.ownerId === me.id) return null;
    if (z.can(sv, me.id, 'manage_messages', ch)) return null;
    if ((c.exemptChannels || []).includes(ch.id)) return null;
    if ((z.rolesOf(sv, me.id) || []).some(r => (c.exemptRoles || []).includes(r))) return null;
    const word = wordHit(c.words || [], content);
    if (word) return 'it has a word this server blocks';
    if (c.invites && INVITE_RE.test(content)) return "invite links to other servers aren't allowed here";
    const hosts = [...content.matchAll(URL_RE)].map(m => (m[1] || m[2] || '').toLowerCase().replace(/^www\./, ''));
    if (hosts.length) {
      if (c.links && hosts.some(h => !(c.allowDomains || []).some(d => h === d || h.endsWith('.' + d)))) return "links aren't allowed here";
      if (c.newAccountLinks && Date.now() - (me.createdAt || 0) < c.newAccountLinks * 60e3) return `new accounts can't post links here for their first ${c.newAccountLinks >= 1440 ? Math.round(c.newAccountLinks / 1440) + ' day(s)' : c.newAccountLinks + ' minutes'}`;
    }
    if (c.mentionLimit && (content.match(/@[\w.]{2,32}/g) || []).length > c.mentionLimit) return `that's more than ${c.mentionLimit} mentions in one message`;
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (c.caps && letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.75) return "please don't shout (too many capital letters)";
    if (c.spam) {
      const k = sv.id + '|' + me.id, now = Date.now(), lower = content.toLowerCase().trim();
      const list = (recent.get(k) || []).filter(x => x.at > now - 30e3);
      list.push({ at: now, text: lower });
      recent.set(k, list);
      if (list.filter(x => x.at > now - 5e3).length > 5) return "you're sending messages too fast";
      if (lower.length > 3 && list.filter(x => x.text === lower).length >= 3) return 'you sent the same thing 3 times';
    }
    return null;
  }
  // Blocks the message (the sender sees why), logs it, and can time the sender out.
  function automodEnforce(sv, ch, me, content, where = `#${ch.name}`) {
    const why = automodCheck(sv, ch, me, content);
    if (!why) return;
    const c = automodOf(sv);
    if (c.timeoutMinutes) { sv.timeouts ||= {}; sv.timeouts[me.id] = Date.now() + c.timeoutMinutes * 60e3; z.refreshServer(sv); }
    z.audit(sv, z.SYSTEM_ID, 'automod_block', { type: 'member', id: me.id, name: me.displayName }, `in ${where}: ${why}. "${content.slice(0, 120)}"`);
    const alert = c.alertChannelId && sv.channels.find(x => x.id === c.alertChannelId && x.type === 'text');
    if (alert) z.postMessage(z.channelConvFor(sv, alert), data.users[z.SYSTEM_ID], `🛡️ **AutoMod** blocked a message from @${me.username} in ${where}: ${why}.${c.timeoutMinutes ? ` Timed out for ${c.timeoutMinutes} min.` : ''}\n> ${content.slice(0, 300).replace(/\n/g, ' ')}`);
    save();
    fail(403, `🛡️ AutoMod blocked your message: ${why}.${c.timeoutMinutes ? ` You're timed out for ${c.timeoutMinutes} minute${c.timeoutMinutes === 1 ? '' : 's'}.` : ''}`);
  }
  hooks.beforePost.push(({ conv, me, content }) => { if (conv.kind === 'channel') automodEnforce(conv.server, conv.channel, me, content); });
  hooks.beforeEdit.push(({ conv, me, content }) => { if (conv.kind === 'channel') automodEnforce(conv.server, conv.channel, me, content); });
  route('GET', '/api/servers/:id/automod', async ({ me, params }) => {
    const sv = z.getManagedServer(me, params.id, 'manage_server');
    return { automod: automodOf(sv) };
  });
  route('PATCH', '/api/servers/:id/automod', async ({ me, params, body }) => {
    const sv = z.getManagedServer(me, params.id, 'manage_server');
    const c = automodOf(sv);
    const list = (v, max, len) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map(x => clean(x, len).toLowerCase()).filter(Boolean).slice(0, max);
    if ('enabled' in body) c.enabled = !!body.enabled;
    if ('words' in body) c.words = [...new Set(list(body.words, 300, 60))];
    if ('allowDomains' in body) c.allowDomains = [...new Set(list(body.allowDomains, 50, 80).map(d => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')))];
    for (const k of ['links', 'invites', 'caps', 'spam']) if (k in body) c[k] = !!body[k];
    if ('mentionLimit' in body) c.mentionLimit = Math.max(0, Math.min(50, Math.round(Number(body.mentionLimit) || 0)));
    if ('timeoutMinutes' in body) c.timeoutMinutes = Math.max(0, Math.min(10080, Math.round(Number(body.timeoutMinutes) || 0)));
    if ('newAccountLinks' in body) c.newAccountLinks = Math.max(0, Math.min(43200, Math.round(Number(body.newAccountLinks) || 0)));
    if ('alertChannelId' in body) c.alertChannelId = sv.channels.some(x => x.id === body.alertChannelId && x.type === 'text') ? body.alertChannelId : null;
    if ('exemptRoles' in body) c.exemptRoles = (Array.isArray(body.exemptRoles) ? body.exemptRoles : []).filter(id => sv.roles.some(r => r.id === id && !r.everyone));
    if ('exemptChannels' in body) c.exemptChannels = (Array.isArray(body.exemptChannels) ? body.exemptChannels : []).filter(id => sv.channels.some(x => x.id === id));
    sv.automod = c;
    z.audit(sv, me, 'automod_update', null, c.enabled ? 'AutoMod on' : 'AutoMod off');
    save();
    return { automod: c };
  });

  // ======================= being found on Google =======================
  // robots.txt and sitemap.xml (they used to return the app page), plus Google Search Console's
  // file check when ZUNO_GOOGLE_VERIFY is set to the file name Google gives you (googleXXXX.html).
  const site = req => (z.PUBLIC_URL && /^https?:\/\//.test(z.PUBLIC_URL) ? z.PUBLIC_URL : `https://${req.headers.host}`).replace(/\/+$/, '');
  hooks.rawRoutes.push({ path: '/robots.txt', fn: (req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /files/\n\nSitemap: ${site(req)}/sitemap.xml\n`); } });
  hooks.rawRoutes.push({ path: '/sitemap.xml', fn: (req, res) => {
    const u = site(req);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/status', '/terms.html'].map((p, i) => `  <url><loc>${u}${p}</loc><priority>${i ? '0.5' : '1.0'}</priority></url>`).join('\n')}\n</urlset>\n`);
  } });
  const gv = String(process.env.ZUNO_GOOGLE_VERIFY || '').trim().replace(/^\//, '');
  if (/^google[a-z0-9]+\.html$/i.test(gv)) hooks.rawRoutes.push({ path: '/' + gv, fn: (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`google-site-verification: ${gv}`); } });

  // ======================= roles given on join =======================
  hooks.onJoin.push((sv, u) => {
    if (!u || u.bot) return;
    const give = (sv.roles || []).filter(r => r.autoJoin && !r.everyone && !r.managed).map(r => r.id);
    if (give.length) sv.memberRoles[u.id] = [...new Set([...(sv.memberRoles[u.id] || []), ...give])];
  });

  // ======================= stickers =======================
  // Zuno's own stickers work everywhere; servers can upload up to 30 of their own (PNG, GIF, WebP).
  const BUILTIN_STICKERS = {
    'zuno:hi': ['Hi!', 'happy', '👋'], 'zuno:love': ['Love it', 'happy', '❤️'], 'zuno:party': ['Party', 'happy', '🎉'], 'zuno:gg': ['GG', 'happy', '🏆'],
    'zuno:thumbs': ['Nice', 'happy', '👍'], 'zuno:fire': ['Fire', 'curious', '🔥'], 'zuno:huh': ['Huh?', 'curious', '❓'], 'zuno:sleepy': ['Sleepy', 'sleepy', '💤'],
    'zuno:sad': ['Sad', 'sleepy', '💧'], 'zuno:coffee': ['Coffee', 'sleepy', '☕'], 'zuno:wow': ['Wow', 'curious', '✨'], 'zuno:bye': ['Bye!', 'happy', '🌙'],
  };
  const MAX_STICKERS = 30, MAX_STICKER_BYTES = 512_000;
  const stickerView = (sv, s) => ({ id: s.id, name: s.name, url: s.url, emoji: s.emoji || '', serverId: sv.id });
  hooks.serverSummary.push(sv => ({ stickers: (sv.stickers || []).map(s => stickerView(sv, s)) }));
  route('POST', '/api/servers/:id/stickers', async ({ me, params, body, req }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    z.need(sv, me, 'manage_expressions');
    sv.stickers ||= [];
    if (sv.stickers.length >= MAX_STICKERS) fail(400, `A server can have up to ${MAX_STICKERS} stickers.`);
    const k = z.sniff(body);
    if (!k || !['png', 'gif', 'webp', 'jpg'].includes(k.ext)) fail(400, 'Stickers must be PNG, GIF, WebP or JPG pictures.');
    if (body.length > MAX_STICKER_BYTES) fail(400, 'Stickers can be up to 512 KB.');
    const name = clean(decodeURIComponent(req.headers['x-sticker-name'] || ''), 30);
    if (name.length < 2) fail(400, 'Give the sticker a name (2–30 characters).');
    const s = { id: newId(), name, emoji: clean(decodeURIComponent(req.headers['x-sticker-emoji'] || ''), 8), url: z.storeUpload(body, k.ext), by: me.id, at: Date.now() };
    sv.stickers.push(s);
    z.audit(sv, me, 'sticker_create', null, name);
    save(); z.refreshServer(sv);
    return { sticker: stickerView(sv, s) };
  }, { raw: MAX_STICKER_BYTES + 1000 });
  route('DELETE', '/api/servers/:id/stickers/:sid', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    z.need(sv, me, 'manage_expressions');
    const s = (sv.stickers || []).find(x => x.id === params.sid);
    if (!s) fail(404, 'That sticker is already gone.');
    sv.stickers = sv.stickers.filter(x => x !== s);
    z.removeUpload(s.url);
    z.audit(sv, me, 'sticker_delete', null, s.name);
    save(); z.refreshServer(sv);
    return { ok: true };
  });
  // A sticker can be sent anywhere by someone in its server.
  function cleanSticker(me, st) {
    if (!st) return undefined;
    const id = String(st.id || '');
    // (0.51) The built-in Zuno stickers were retired: old messages keep showing them, new ones can't use them.
    if (BUILTIN_STICKERS[id]) fail(400, "That sticker isn't available anymore.");
    const sv = data.servers[String(st.serverId || '')];
    const s = sv?.members.includes(me.id) && (sv.stickers || []).find(x => x.id === id);
    if (!s) fail(400, "That sticker isn't available anymore.");
    return { id: s.id, name: s.name, url: s.url, serverId: sv.id };
  }
  hooks.beforePost.push(({ body, me, extra }) => { if (body.sticker) extra.sticker = cleanSticker(me, body.sticker); });
  route('GET', '/api/stickers', async ({ me }) => ({
    builtin: Object.entries(BUILTIN_STICKERS).map(([id, [name, mood, accent]]) => ({ id, name, mood, accent })),
    servers: Object.values(data.servers).filter(sv => sv.members.includes(me.id) && (sv.stickers || []).length).map(sv => ({ id: sv.id, name: sv.name, stickers: sv.stickers.map(s => stickerView(sv, s)) })),
  }));

  // ======================= threads =======================
  // A side conversation started from a message in a server channel. Anyone who can see the channel
  // can read it; anyone who can talk there can reply.
  data.threads ||= {};
  const threadMeta = t => ({ id: t.id, name: t.name, serverId: t.serverId, channelId: t.channelId, parentId: t.parentId, ownerId: t.ownerId, createdAt: t.createdAt, lastAt: t.lastAt, count: t.messages.length, archived: !!t.archived });
  function threadAccess(me, id, write = false) {
    const t = data.threads[id];
    const found = t && z.findChannel(t.channelId);
    const sv = found?.sv, ch = found?.ch;
    if (!t || !sv || !ch || !sv.members.includes(me.id) || !z.canView(z.ensureRoles(sv), ch, me.id)) fail(404, 'Thread not found.');
    const perms = z.permsIn(sv, ch, me.id);
    if (write) {
      if (me.dmOnly) fail(403, 'This account is limited to direct messages and cannot post in servers.');
      if ((me.mutedUntil || 0) > Date.now()) fail(403, `Your account is muted until ${new Date(me.mutedUntil).toLocaleString()}.`);
      if (!perms.has('send_messages')) fail(403, "You don't have permission to talk in this thread.");
      if (sv.timeouts?.[me.id] > Date.now()) fail(403, "You're timed out in this server.");
      if (t.archived) fail(400, 'This thread is closed. Reopen it to keep talking.');
    }
    return { t, sv, ch, perms };
  }
  // Keep the "N replies" chip on the starting message up to date.
  function syncParent(t, sv, ch) {
    const st = data.channelMessages[ch.id];
    const i = st?.messages.findIndex(m => m.id === t.parentId) ?? -1;
    if (i < 0) return;
    st.messages[i] = { ...st.messages[i], thread: { id: t.id, name: t.name, count: t.messages.length, lastAt: t.lastAt, archived: !!t.archived } };
    z.emit(z.channelConvFor(sv, ch), 'message-update', { message: st.messages[i] });
  }
  const threadEmit = (sv, ch, event, payload) => { for (const id of viewersOf(sv, ch)) send(id, event, payload); };
  route('POST', '/api/channels/:cid/messages/:mid/thread', async ({ me, params, body }) => {
    const conv = z.channelConv(me, params.cid);
    if (!conv.perms.has('send_messages')) fail(403, "You don't have permission to start threads here.");
    const { m } = z.findMessage(conv, params.mid);
    if (m.thread && data.threads[m.thread.id]) return { thread: threadMeta(data.threads[m.thread.id]) };
    const name = clean(body.name, 60) || clean((m.content || '').replace(/[*_~`>#|]/g, ''), 40) || 'Thread';
    const t = { id: newId(), name, serverId: conv.server.id, channelId: conv.channel.id, parentId: m.id, ownerId: me.id, createdAt: Date.now(), lastAt: Date.now(), archived: false, messages: [] };
    data.threads[t.id] = t;
    syncParent(t, conv.server, conv.channel);
    save();
    threadEmit(conv.server, conv.channel, 'thread', { thread: threadMeta(t) });
    return { thread: threadMeta(t) };
  });
  route('GET', '/api/channels/:cid/threads', async ({ me, params }) => {
    const conv = z.channelConv(me, params.cid);
    return { threads: Object.values(data.threads).filter(t => t.channelId === conv.channel.id).sort((a, b) => b.lastAt - a.lastAt).slice(0, 50).map(threadMeta) };
  });
  route('GET', '/api/threads/:id', async ({ me, params }) => {
    const { t, sv, ch, perms } = threadAccess(me, params.id);
    const parent = data.channelMessages[ch.id]?.messages.find(m => m.id === t.parentId) || null;
    const msgs = t.messages.slice(-100);
    const ids = new Set([...msgs.map(m => m.authorId), parent?.authorId].filter(Boolean));
    return { thread: threadMeta(t), parent, messages: msgs, authors: [...ids].map(id => publicUser(data.users[id])).filter(Boolean), canWrite: perms.has('send_messages') && !t.archived, canManage: t.ownerId === me.id || perms.has('manage_messages'), channelName: ch.name, serverName: sv.name };
  });
  route('POST', '/api/threads/:id/messages', async ({ me, params, body }) => {
    const { t, sv, ch } = threadAccess(me, params.id, true);
    z.limit('thread:' + me.id, 20, 10e3, "You're sending messages too fast.");
    const content = clean(String(body.content ?? '').replace(/\r\n/g, '\n'), z.perksFor(me).message);
    const sticker = cleanSticker(me, body.sticker);
    if (!content && !sticker) fail(400, "You can't send an empty message.");
    if (content) automodEnforce(sv, ch, me, content, `a thread in #${ch.name}`);
    const message = { id: newId(), authorId: me.id, content, createdAt: Date.now(), ...(sticker ? { sticker } : {}) };
    t.messages.push(message);
    if (t.messages.length > 2000) t.messages.splice(0, t.messages.length - 2000);
    t.lastAt = message.createdAt;
    syncParent(t, sv, ch);
    save();
    threadEmit(sv, ch, 'thread-message', { threadId: t.id, message, author: publicUser(me), thread: threadMeta(t) });
    // People mentioned by @username in a thread get it in their inbox.
    for (const mm of content.matchAll(/(^|[^\w@])@([a-z0-9_.]{2,32})\b/gi)) {
      const u = z.userByName ? z.userByName(mm[2]) : Object.values(data.users).find(x => x.username === mm[2].toLowerCase());
      if (u && u.id !== me.id && human(u) && z.canView(sv, ch, u.id)) z.notify?.(u.id, { type: 'mention', from: me.id, conv: 'ch:' + ch.id, msgId: t.parentId, text: content.slice(0, 140), title: `🧵 ${t.name}`, server: sv.name, serverId: sv.id });
    }
    return { message };
  });
  route('DELETE', '/api/threads/:id/messages/:mid', async ({ me, params }) => {
    const { t, sv, ch, perms } = threadAccess(me, params.id);
    const m = t.messages.find(x => x.id === params.mid);
    if (!m) fail(404, 'That message no longer exists.');
    if (m.authorId !== me.id && !perms.has('manage_messages')) fail(403, 'You can only delete your own messages.');
    t.messages = t.messages.filter(x => x !== m);
    syncParent(t, sv, ch);
    save();
    threadEmit(sv, ch, 'thread-delete', { threadId: t.id, id: m.id, thread: threadMeta(t) });
    return { ok: true };
  });
  route('PATCH', '/api/threads/:id', async ({ me, params, body }) => {
    const { t, sv, ch, perms } = threadAccess(me, params.id);
    if (t.ownerId !== me.id && !perms.has('manage_messages')) fail(403, 'Only the person who started the thread (or a moderator) can change it.');
    if ('name' in body) t.name = clean(body.name, 60) || t.name;
    if ('archived' in body) t.archived = !!body.archived;
    syncParent(t, sv, ch);
    save();
    threadEmit(sv, ch, 'thread', { thread: threadMeta(t) });
    return { thread: threadMeta(t) };
  });
  // Deleting the starting message closes its thread for good.
  hooks.onDelete.push((conv, m) => {
    if (conv.kind !== 'channel' || !m.thread) return;
    delete data.threads[m.thread.id];
  });

  // ======================= translation =======================
  // "Translate" on a message. Uses free translation services; nothing is stored except a short cache.
  const tCache = new Map();
  async function translate(text, to) {
    const key = to + '|' + text;
    if (tCache.has(key)) return tCache.get(key);
    let out = null;
    const g = await fetchJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`, { timeout: 6000 });
    if (Array.isArray(g?.[0])) out = { text: g[0].map(x => x?.[0] || '').join(''), from: g[2] || '' };
    if (!out?.text) {
      const parts = text.match(/[\s\S]{1,480}(\s|$)|[\s\S]{1,480}/g) || [text];
      const done = [];
      let from = '';
      for (const p of parts.slice(0, 6)) {
        const r = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(p)}&langpair=autodetect|${encodeURIComponent(to)}${process.env.ZUNO_TRANSLATE_EMAIL ? '&de=' + encodeURIComponent(process.env.ZUNO_TRANSLATE_EMAIL) : ''}`, { timeout: 8000 });
        if (!r?.responseData?.translatedText || r.responseStatus !== 200) { done.length = 0; break; }
        done.push(r.responseData.translatedText); from ||= r.responseData.detectedLanguage || '';
      }
      if (done.length) out = { text: done.join(' '), from };
    }
    if (out) { tCache.set(key, out); if (tCache.size > 2000) tCache.delete(tCache.keys().next().value); }
    return out;
  }
  route('POST', '/api/translate', async ({ me, body }) => {
    z.limit('translate:' + me.id, 30, 60e3, 'Too many translations. Try again in a minute.');
    const text = clean(body.text, 2000);
    const to = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(body.to || '') ? body.to : 'en';
    if (!text) fail(400, 'Nothing to translate.');
    const r = await translate(text, to);
    if (!r) fail(503, "Translation isn't available right now. Try again in a bit.");
    return { text: r.text, from: String(r.from || '').toLowerCase(), to };
  });

  // ======================= saved message folders =======================
  route('POST', '/api/me/saved-folders', async ({ me, body }) => {
    const name = clean(body.name, 32);
    if (!name) fail(400, 'Give the folder a name.');
    me.savedFolders ||= [];
    if (me.savedFolders.length >= 20) fail(400, 'You can have up to 20 folders.');
    if (!me.savedFolders.some(f => f.toLowerCase() === name.toLowerCase())) me.savedFolders.push(name);
    save(); send(me.id, 'saved', {});
    return { folders: me.savedFolders };
  });
  route('PATCH', '/api/me/saved-folders', async ({ me, body }) => {
    const from = clean(body.from, 32), to = clean(body.to, 32);
    if (!to) fail(400, 'Give the folder a name.');
    me.savedFolders = (me.savedFolders || []).map(f => (f === from ? to : f));
    for (const s of me.saved || []) if (s.folder === from) s.folder = to;
    save(); send(me.id, 'saved', {});
    return { folders: me.savedFolders };
  });
  route('DELETE', '/api/me/saved-folders/:name', async ({ me, params }) => {
    me.savedFolders = (me.savedFolders || []).filter(f => f !== params.name);
    for (const s of me.saved || []) if (s.folder === params.name) delete s.folder;
    save(); send(me.id, 'saved', {});
    return { folders: me.savedFolders };
  });
  route('PATCH', '/api/me/saved/:id', async ({ me, params, body }) => {
    const s = (me.saved || []).find(x => x.id === params.id);
    if (!s) fail(404, "That saved message isn't there anymore.");
    const folder = clean(body.folder, 32);
    if (folder && !(me.savedFolders || []).includes(folder)) fail(400, 'Make that folder first.');
    if (folder) s.folder = folder; else delete s.folder;
    save(); send(me.id, 'saved', {});
    return { ok: true };
  });

  // ======================= Catch me up =======================
  // A quick summary of what you missed in a chat: who talked, what got the most reactions, where
  // you were mentioned, links and files. With ANTHROPIC_API_KEY set, also a short written summary.
  async function aiSummary(lines) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || lines.length < 5) return null;
    const body = JSON.stringify({
      model: process.env.ZUNO_AI_MODEL || 'claude-haiku-5-5', max_tokens: 400,
      messages: [{ role: 'user', content: `Summarize this chat for someone who missed it, in 3 to 5 short bullet points. Plain, friendly language. Only use what's in the chat.\n\n${lines.join('\n').slice(-12000)}` }],
    });
    const r = await fetchJson('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(body) }, body, timeout: 20000 });
    return r?.content?.map(c => c.text || '').join('').trim() || null;
  }
  route('GET', '/api/catchup', async ({ me, query }) => {
    z.limit('catchup:' + me.id, 10, 60e3, 'Give it a moment before catching up again.');
    const conv = z.convOf(me, String(query.get('conv') || ''));
    const since = Math.max(Date.now() - 7 * 864e5, Number(query.get('since')) || Date.now() - 864e5);
    const all = (conv.peek()?.messages || []).filter(m => m.createdAt > since && !m.e2e).slice(-500);
    const name = id => data.users[id]?.displayName || 'Someone';
    const people = {};
    for (const m of all) if (!data.users[m.authorId]?.system) people[m.authorId] = (people[m.authorId] || 0) + 1;
    const rx = m => Object.values(m.reactions || {}).reduce((n, l) => n + l.length, 0);
    const snip = m => ({ id: m.id, authorId: m.authorId, author: name(m.authorId), text: (m.content || (m.attachments ? '📎 Attachment' : m.gif ? 'GIF' : m.poll ? `📊 ${m.poll.question}` : m.sticker ? `Sticker: ${m.sticker.name}` : '')).slice(0, 200), at: m.createdAt, reactions: rx(m) });
    const mine = new RegExp(`(^|[^\\w@])@${escRe(me.username)}\\b`, 'i');
    const links = [...new Set(all.flatMap(m => (m.content || '').match(/https?:\/\/[^\s<>]+/g) || []))].slice(-6);
    const lines = all.filter(m => m.content).map(m => `${name(m.authorId)}: ${m.content.replace(/\n/g, ' ').slice(0, 300)}`);
    return {
      since, count: all.length,
      people: Object.entries(people).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ user: publicUser(data.users[id]), count: n })),
      top: all.filter(m => rx(m) > 0).sort((a, b) => rx(b) - rx(a)).slice(0, 3).map(snip),
      mentions: all.filter(m => m.authorId !== me.id && ((m.mentions || []).includes(me.id) || mine.test(m.content || '') || (m.replyTo?.authorId === me.id && !m.replyTo.noPing) || m.mentionEveryone)).slice(-5).map(snip),
      questions: all.filter(m => /\?\s*$/.test(m.content || '') && (m.content || '').length > 12).slice(-3).map(snip),
      pinned: all.filter(m => m.pinned).slice(-3).map(snip),
      links, files: all.filter(m => m.attachments?.length).length, polls: all.filter(m => m.poll).map(snip).slice(-3),
      threads: Object.values(data.threads).filter(t => conv.kind === 'channel' && t.channelId === conv.channel.id && t.lastAt > since).map(threadMeta).slice(0, 5),
      summary: await aiSummary(lines),
    };
  });

  // ======================= Listen Together & Watch Together =======================
  // Synced YouTube in a call: Listen Together (free, music) and Watch Together (Zuno Bloom, video).
  // Everyone in the call can add songs and videos; play, pause and skip are shared.
  const activities = new Map(); // roomId -> activity
  const ytId = url => {
    const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
    return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(String(url || '').trim()) ? String(url).trim() : null;
  };
  const ytInfo = new Map();
  async function videoInfo(id) {
    if (ytInfo.has(id)) return ytInfo.get(id);
    const r = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`, { timeout: 6000 });
    if (!r) return null;
    const info = { title: clean(r.title, 150), author: clean(r.author_name, 80) };
    ytInfo.set(id, info);
    if (ytInfo.size > 3000) ytInfo.delete(ytInfo.keys().next().value);
    return info;
  }
  const activityView = a => a && ({ ...a, now: Date.now() });
  const pushActivity = roomId => { const a = activities.get(roomId) || null; for (const id of z.roomMembers(roomId)) send(id, 'activity', { room: roomId, activity: activityView(a) }); };
  function inRoom(me, roomId) {
    if (!z.rooms.get(roomId)?.has(me.id)) fail(403, 'Join the call first.');
  }
  const posNow = a => (a.playing ? a.position + (Date.now() - a.updatedAt) / 1000 : a.position);
  route('GET', '/api/activity', async ({ me, query }) => {
    const roomId = String(query.get('room') || '');
    inRoom(me, roomId);
    return { activity: activityView(activities.get(roomId) || null) };
  });
  route('POST', '/api/activity/start', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inRoom(me, roomId);
    const type = body.type === 'watch' ? 'watch' : 'listen';
    if (type === 'watch' && !z.hasBloom(me)) fail(403, 'Watch Together is a Zuno Bloom perk. Listen Together is free for everyone!');
    const cur = activities.get(roomId);
    if (cur && cur.type === type) return { activity: activityView(cur) };
    activities.set(roomId, { type, hostId: me.id, queue: [], index: 0, playing: false, position: 0, updatedAt: Date.now() });
    pushActivity(roomId);
    return { activity: activityView(activities.get(roomId)) };
  });
  route('POST', '/api/activity/add', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inRoom(me, roomId);
    const a = activities.get(roomId);
    if (!a) fail(400, 'Start Listen Together or Watch Together first.');
    if (a.queue.length >= 50) fail(400, 'The queue is full (50).');
    const id = ytId(body.url);
    if (!id) fail(400, 'Paste a YouTube link (youtube.com, youtu.be or music.youtube.com).');
    const info = await videoInfo(id);
    if (!info) fail(400, "That video couldn't be found, or it can't be played outside YouTube.");
    a.queue.push({ key: newId(), videoId: id, title: info.title, author: info.author, by: me.id });
    if (a.queue.length === 1) { a.index = 0; a.position = 0; a.playing = true; a.updatedAt = Date.now(); }
    pushActivity(roomId);
    return { activity: activityView(a) };
  });
  route('POST', '/api/activity/control', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inRoom(me, roomId);
    const a = activities.get(roomId);
    if (!a) fail(400, 'Nothing is playing.');
    const now = Date.now();
    const go = i => { a.index = Math.max(0, Math.min(i, a.queue.length - 1)); a.position = 0; a.playing = a.index < a.queue.length; a.updatedAt = now; };
    switch (body.action) {
      case 'play': a.position = posNow(a); a.playing = true; break;
      case 'pause': a.position = posNow(a); a.playing = false; break;
      case 'seek': a.position = Math.max(0, Number(body.position) || 0); break;
      case 'next': if (a.index < a.queue.length - 1) go(a.index + 1); else { a.playing = false; a.position = 0; } break;
      case 'prev': go(a.index - 1); break;
      case 'jump': go(Number(body.index) || 0); break;
      // Sent by the players when a video finishes; only the first one counts.
      case 'ended': if (Number(body.index) !== a.index) return { activity: activityView(a) }; if (a.index < a.queue.length - 1) go(a.index + 1); else { a.playing = false; a.position = 0; } break;
      case 'remove': {
        const i = Number(body.index);
        if (!(i >= 0 && i < a.queue.length)) break;
        a.queue.splice(i, 1);
        if (i < a.index) a.index--;
        else if (i === a.index) { a.index = Math.min(a.index, Math.max(0, a.queue.length - 1)); a.position = 0; a.playing = a.queue.length > 0 && a.playing; }
        break;
      }
      default: fail(400, 'Unknown action.');
    }
    a.updatedAt = now;
    pushActivity(roomId);
    return { activity: activityView(a) };
  });
  route('POST', '/api/activity/stop', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inRoom(me, roomId);
    activities.delete(roomId);
    pushActivity(roomId);
    return { ok: true };
  });
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (what === 'join' && activities.has(roomId)) setTimeout(() => send(uid, 'activity', { room: roomId, activity: activityView(activities.get(roomId)) }), 500);
    if (what !== 'join' && !room?.size) activities.delete(roomId);
  });

  // ======================= server events =======================
  Object.assign(z.PERM_INFO, { manage_events: { label: 'Manage Events', group: 'General' } });
  if (!z.PERM_KEYS.includes('manage_events')) z.PERM_KEYS.push('manage_events');
  // The first few interested people come along (for the faces on the card); the rest are a number.
  const eventView = (e, me) => ({ ...e, interested: e.interested.length, going: me ? e.interested.includes(me.id) : false, creator: publicUser(data.users[e.creatorId]),
    faces: e.interested.slice(0, 5).map(id => data.users[id]).filter(Boolean).map(u => publicUser(u)) });
  // A weekly event: when one ends, the next week's is put on the calendar (once).
  function nextWeek(sv, e) {
    if (e.repeat !== 'weekly' || e.nextMade) return;
    e.nextMade = true;
    const WEEK = 7 * 864e5;
    let startAt = e.startAt + WEEK;
    while (startAt < Date.now()) startAt += WEEK;
    const n = { ...e, id: newId(), startAt, endAt: e.endAt ? e.endAt + (startAt - e.startAt) : null, createdAt: Date.now(), interested: [e.creatorId], status: 'scheduled', remindedSoon: false, nextMade: false };
    delete n.startedAt; delete n.endedAt;
    sv.events.push(n);
  }
  const eventsOf = sv => (sv.events ||= []);
  hooks.serverSummary.push((sv, me) => ({ eventCount: eventsOf(sv).filter(e => e.status !== 'ended').length, liveEvent: eventsOf(sv).find(e => e.status === 'live')?.name || null }));
  function cleanEvent(sv, body, e = {}) {
    const name = 'name' in body ? clean(body.name, 80) : e.name;
    if (!name || name.length < 2) fail(400, 'Give the event a name.');
    const startAt = 'startAt' in body ? Number(body.startAt) : e.startAt;
    if (!startAt || Number.isNaN(startAt)) fail(400, 'Pick when it starts.');
    if (!e.id && startAt < Date.now() - 5 * 60e3) fail(400, 'The start time is in the past.');
    if (startAt > Date.now() + 365 * 864e5) fail(400, 'Events can be up to a year away.');
    let endAt = 'endAt' in body ? Number(body.endAt) || null : e.endAt || null;
    if (endAt && endAt <= startAt) fail(400, 'The end time must be after the start.');
    let where = e.where || { type: 'place', text: '' };
    if ('where' in body) {
      const w = body.where || {};
      if (w.type === 'voice') { if (!sv.channels.some(c => c.id === w.channelId && c.type === 'voice')) fail(400, 'Pick a voice channel.'); where = { type: 'voice', channelId: w.channelId }; }
      else where = { type: 'place', text: clean(w.text, 120) };
    }
    const repeat = 'repeat' in body ? (body.repeat === 'weekly' ? 'weekly' : null) : e.repeat || null;
    return { name, description: 'description' in body ? clean(body.description, 1000) : e.description || '', startAt, endAt, where, cover: e.cover || null, repeat };
  }
  const eventPing = (sv, e, text) => { for (const uid of e.interested) if (sv.members.includes(uid)) z.notify?.(uid, { type: 'event', from: e.creatorId, key: 'event:' + e.id + ':' + text.slice(0, 6), title: e.name, text, server: sv.name, serverId: sv.id, eventId: e.id }); };
  route('GET', '/api/servers/:id/events', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    return { events: eventsOf(sv).filter(e => e.status !== 'ended' || e.endedAt > Date.now() - 864e5).sort((a, b) => a.startAt - b.startAt).map(e => eventView(e, me)), canManage: z.can(sv, me.id, 'manage_events') };
  });
  route('POST', '/api/servers/:id/events', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    z.need(sv, me, 'manage_events');
    if (eventsOf(sv).filter(e => e.status !== 'ended').length >= 50) fail(400, 'A server can have up to 50 upcoming events.');
    const e = { id: newId(), ...cleanEvent(sv, body), creatorId: me.id, createdAt: Date.now(), interested: [me.id], status: 'scheduled' };
    sv.events.push(e);
    z.audit(sv, me, 'event_create', null, e.name);
    save(); z.refreshServer(sv);
    for (const id of sv.members) send(id, 'events', { serverId: sv.id });
    return { event: eventView(e, me) };
  });
  route('PATCH', '/api/servers/:id/events/:eid', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    const e = eventsOf(sv).find(x => x.id === params.eid) || fail(404, 'That event is gone.');
    if (e.creatorId !== me.id) z.need(sv, me, 'manage_events');
    Object.assign(e, cleanEvent(sv, body, e));
    if (body.status === 'ended' && e.status !== 'ended') { e.status = 'ended'; e.endedAt = Date.now(); nextWeek(sv, e); }
    if (body.status === 'live' && e.status === 'scheduled') { e.status = 'live'; e.startedAt = Date.now(); eventPing(sv, e, 'is starting now!'); }
    z.audit(sv, me, 'event_update', null, e.name);
    save(); z.refreshServer(sv);
    for (const id of sv.members) send(id, 'events', { serverId: sv.id });
    return { event: eventView(e, me) };
  });
  route('DELETE', '/api/servers/:id/events/:eid', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    const e = eventsOf(sv).find(x => x.id === params.eid) || fail(404, 'That event is gone.');
    if (e.creatorId !== me.id) z.need(sv, me, 'manage_events');
    sv.events = sv.events.filter(x => x !== e);
    if (e.status !== 'ended') eventPing(sv, e, 'was cancelled.');
    z.audit(sv, me, 'event_delete', null, e.name);
    save(); z.refreshServer(sv);
    for (const id of sv.members) send(id, 'events', { serverId: sv.id });
    return { ok: true };
  });
  // Everyone who's interested.
  route('GET', '/api/servers/:id/events/:eid/people', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    const e = eventsOf(sv).find(x => x.id === params.eid) || fail(404, 'That event is gone.');
    return { people: e.interested.map(id => data.users[id]).filter(u => u && sv.members.includes(u.id)).map(u => publicUser(u)) };
  });
  route('POST', '/api/servers/:id/events/:eid/interested', async ({ me, params }) => {
    const sv = z.getServer(me, params.id);
    const e = eventsOf(sv).find(x => x.id === params.eid) || fail(404, 'That event is gone.');
    e.interested = e.interested.includes(me.id) ? e.interested.filter(id => id !== me.id) : [...e.interested, me.id];
    save();
    for (const id of sv.members) send(id, 'events', { serverId: sv.id });
    return { event: eventView(e, me) };
  });
  // Reminders 15 minutes before, a note when it starts, and ending on its own.
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const sv of Object.values(data.servers)) for (const e of sv.events || []) {
      if (e.status === 'scheduled' && !e.remindedSoon && e.startAt - 15 * 60e3 <= now && e.startAt > now) { e.remindedSoon = true; changed = true; eventPing(sv, e, 'starts in 15 minutes.'); }
      if (e.status === 'scheduled' && e.startAt <= now) {
        e.status = 'live'; e.startedAt = now; changed = true;
        eventPing(sv, e, 'is starting now!');
        const ch = sv.channels.find(c => c.id === sv.welcomeChannelId && c.type === 'text') || sv.channels.find(c => c.type === 'text');
        if (ch) { try { z.postMessage(z.channelConvFor(sv, ch), data.users[z.SYSTEM_ID], `📅 **${e.name}** is starting now!${e.where.type === 'voice' ? ` Join the voice channel <#${e.where.channelId}>.` : e.where.text ? ` 📍 ${e.where.text}` : ''} ${e.interested.length} interested.`); } catch {} }
        z.refreshServer(sv);
      }
      if (e.status === 'live' && now > (e.endAt || e.startAt + 3 * 3600e3)) { e.status = 'ended'; e.endedAt = now; changed = true; nextWeek(sv, e); z.refreshServer(sv); for (const id of sv.members) send(id, 'events', { serverId: sv.id }); }
    }
    for (const sv of Object.values(data.servers)) if (sv.events?.some(e => e.status === 'ended' && e.endedAt < now - 7 * 864e5)) { sv.events = sv.events.filter(e => !(e.status === 'ended' && e.endedAt < now - 7 * 864e5)); changed = true; }
    if (changed) save();
  }, 20e3).unref();

  // ======================= account recovery codes =======================
  // Ten one-time codes that let you back into your account if you forget your password and can't
  // get to your email (or lose your two-factor device).
  const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const makeCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of z.crypto.randomBytes(8)) s += a[b % a.length]; return s.slice(0, 4) + '-' + s.slice(4); };
  route('GET', '/api/me/recovery-codes', async ({ me }) => ({ left: (me.recovery?.codes || []).filter(c => !c.used).length, createdAt: me.recovery?.createdAt || null }));
  route('POST', '/api/me/recovery-codes', async ({ me, body, token }) => {
    if (!human(me)) fail(403, "This account can't have recovery codes.");
    // (security) Recovery codes skip two-factor login, so making them needs the code too.
    if (me.twoFactor) z.needReauth(token);
    if (!await z.checkPassword(String(body.password || ''), me.passwordHash)) fail(400, "That password isn't right.");
    const codes = Array.from({ length: 10 }, makeCode);
    me.recovery = { createdAt: Date.now(), codes: codes.map(c => ({ hash: z.sha('recovery:' + normCode(c)), used: false })) };
    save();
    z.systemMessage(me.id, '🔑 **New recovery codes were made for your account.** Any old ones stopped working. If this wasn\'t you, change your password right away.');
    return { codes };
  });
  route('POST', '/api/recover', async ({ body, req }) => {
    z.limit('recover:' + z.visitorTag(req), 8, 15 * 60e3, 'Too many tries. Wait 15 minutes and try again.');
    const login = String(body.login || '').trim().toLowerCase();
    const u = Object.values(data.users).find(x => human(x) && (x.username === login || (x.email || '').toLowerCase() === login));
    if (u) z.limit('recover-acct:' + u.id, 10, 3600e3, 'Too many tries for this account. Wait an hour and try again.');
    const hash = z.sha('recovery:' + normCode(body.code));
    const code = u?.recovery?.codes?.find(c => !c.used && c.hash === hash);
    if (!code) fail(401, "That username and recovery code don't match.");
    const pw = String(body.password || '');
    if (pw.length < z.MIN_PASSWORD) fail(400, `Your new password needs at least ${z.MIN_PASSWORD} characters.`);
    code.used = true;
    u.passwordHash = await z.hashPassword(pw);
    u.passkeys = []; // a passkey someone else added can't outlive a recovery
    z.endSessions(u.id);
    const token = z.createSession(u.id, req);
    const left = u.recovery.codes.filter(c => !c.used).length;
    z.systemMessage(u.id, `🔑 **You used a recovery code** to get back into your account and set a new password. You have ${left} recovery code${left === 1 ? '' : 's'} left. Every other device was logged out, and your passkeys were removed (add them again in Settings › My Account).`);
    save();
    return { token, left };
  }, { auth: false });

  // ======================= where you're logged in (on a map) =======================
  // Rough location from each login's network (city level, never exact). A login only keeps its
  // network ("203.0.113.0"), never a full address.
  const geoCache = new Map();
  const isLocalIp = ip => !ip || ip === '?' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80|::ffff:127\.)/i.test(ip);
  async function geo(ip) {
    ip = String(ip || '').replace(/^::ffff:/, '');
    if (isLocalIp(ip)) return { local: true };
    if (geoCache.has(ip)) return geoCache.get(ip);
    const r = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,country_code,latitude,longitude`, { timeout: 5000 });
    const g = r?.success ? { city: r.city || '', region: r.region || '', country: r.country || '', countryCode: r.country_code || '', lat: Math.round(r.latitude * 10) / 10, lon: Math.round(r.longitude * 10) / 10 } : null;
    if (g) { geoCache.set(ip, g); if (geoCache.size > 5000) geoCache.delete(geoCache.keys().next().value); }
    return g;
  }
  hooks.newSession.push((u, req, token) => { if (data.sessions[token]) data.sessions[token].net = z.networkOf(req); });
  const sessionId = t => String(t).slice(0, 16); // sessions are stored by their token's fingerprint
  route('GET', '/api/me/sessions/map', async ({ me, token }) => {
    const mine = Object.entries(data.sessions).filter(([, s]) => (typeof s === 'string' ? s : s.uid) === me.id);
    const out = [];
    for (const [t, s] of mine) {
      const g = await geo(s.net);
      out.push({ id: sessionId(t), current: t === token, agent: s.agent || '', lastSeen: s.lastSeen || null, createdAt: s.createdAt || null, ...(g || {}) });
    }
    return { sessions: out.sort((a, b) => b.current - a.current || (b.lastSeen || 0) - (a.lastSeen || 0)) };
  });

  // ======================= scheduled maintenance =======================
  // Staff can warn everyone before an update or restart; a banner counts down in every open Zuno.
  data.maintenance ||= null;
  const maintenanceView = () => (data.maintenance && data.maintenance.at + (data.maintenance.minutes || 10) * 60e3 + 3600e3 > Date.now() ? data.maintenance : null);
  // Things the app loads once at start: your saved-message folders and any maintenance notice.
  route('GET', '/api/me/z19', async ({ me }) => ({ savedFolders: me.savedFolders || [], maintenance: maintenanceView() }));
  route('GET', '/api/maintenance', async () => ({ maintenance: maintenanceView() }), { auth: false });
  route('POST', '/api/staff/maintenance', async ({ me, body }) => {
    z.needStaff(me);
    const at = Number(body.at);
    if (!at || at < Date.now() - 60e3 || at > Date.now() + 30 * 864e5) fail(400, 'Pick a time in the next 30 days.');
    data.maintenance = { id: newId(), at, minutes: Math.max(1, Math.min(600, Math.round(Number(body.minutes) || 10))), message: clean(body.message, 240), by: me.id, createdAt: Date.now() };
    save();
    everyStream('maintenance', { maintenance: data.maintenance });
    return { maintenance: data.maintenance };
  });
  route('DELETE', '/api/staff/maintenance', async ({ me }) => {
    z.needStaff(me);
    data.maintenance = null;
    save();
    everyStream('maintenance', { maintenance: null });
    return { ok: true };
  });

  return { automodCheck, BUILTIN_STICKERS };
};
