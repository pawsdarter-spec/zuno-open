'use strict';
// Zuno 0.28: Reply Later, slash commands, forum & media channels, Watch Together for videos sent in
// chat, server tags, profile visitors & comments, Download My Data, and phone notifications
// (Web Push, no extra packages).
const crypto = require('crypto');
const { badName } = require('./namefilter');

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, newId, send } = z;
  const human = u => u && !u.system && !u.bot && !u.deleted;

  // ======================= Reply Later =======================
  // Right-click a message › Reply Later. It waits in a "Reply later" list until you answer in that
  // chat (or clear it). Up to 50 at a time.
  const laterView = me => (me.replyLater || []).map(x => ({ ...x }));
  route('GET', '/api/me/reply-later', async ({ me }) => ({ items: laterView(me) }));
  route('POST', '/api/me/reply-later', async ({ me, body }) => {
    const convId = clean(body.conv, 80);
    const conv = z.convOf(me, convId); // throws if you can't see it
    const { m } = z.findMessage(conv, clean(body.msgId, 40));
    if (m.authorId === me.id) fail(400, "That's your own message.");
    const text = m.e2e ? '🔒 Encrypted message' : (m.content || (m.attachments ? '📎 Attachment' : m.gif ? 'GIF' : m.sticker ? 'Sticker' : '')).replace(/\s+/g, ' ').slice(0, 120);
    const where = conv.kind === 'channel' ? `#${conv.channel.name} · ${conv.server.name}` : conv.kind === 'group' ? (conv.group.name || 'Group chat') : '';
    me.replyLater = [{ conv: convId, msgId: m.id, authorId: m.authorId, text, where, at: Date.now(), sentAt: m.createdAt },
      ...(me.replyLater || []).filter(x => !(x.conv === convId && x.msgId === m.id))].slice(0, 50);
    save();
    send(me.id, 'reply-later', { items: laterView(me) });
    return { items: laterView(me) };
  });
  route('DELETE', '/api/me/reply-later', async ({ me, body, query }) => {
    const convId = clean(body.conv || query.get('conv'), 80), msgId = clean(body.msgId || query.get('msgId'), 40);
    me.replyLater = (me.replyLater || []).filter(x => !(x.conv === convId && (!msgId || x.msgId === msgId)));
    save();
    send(me.id, 'reply-later', { items: laterView(me) });
    return { items: laterView(me) };
  });
  // Answering in that chat clears it from the list.
  hooks.posted.push((conv, m, author) => {
    if (!author?.replyLater?.length) return;
    const convId = conv.idFor(author.id);
    const before = author.replyLater.length;
    author.replyLater = author.replyLater.filter(x => x.conv !== convId);
    if (author.replyLater.length !== before) send(author.id, 'reply-later', { items: laterView(author) });
  });

  // ======================= closing DMs =======================
  // "Close DM" takes a conversation out of your list; it comes back by itself with the next message
  // (or when you open it again). Nothing is deleted.
  route('POST', '/api/me/close-dm', async ({ me, body }) => {
    const id = clean(body.peerId, 40);
    if (!data.users[id] || id === me.id) fail(404, 'User not found.');
    me.closedDms = { ...(me.closedDms || {}), [id]: Date.now() };
    save();
    return { ok: true };
  });
  route('DELETE', '/api/me/close-dm', async ({ me, body }) => {
    if (me.closedDms) { delete me.closedDms[clean(body.peerId, 40)]; save(); }
    return { ok: true };
  });

  // ======================= slash commands =======================
  // What typing "/" in a channel can show: every command from the bots in this server.
  route('GET', '/api/channels/:id/commands', async ({ me, params }) => {
    const conv = z.channelConv(me, params.id);
    const out = [];
    for (const id of conv.members) {
      const bot = data.users[id];
      if (!bot?.bot || bot.app?.deleted || !Array.isArray(bot.app?.commands)) continue;
      for (const c of bot.app.commands.slice(0, 50)) out.push({ name: c.name, description: c.description || '', usage: c.usage || '', bot: { id: bot.id, name: bot.displayName, avatar: bot.avatar || null } });
    }
    return { commands: out, canUse: conv.perms.has('use_commands') };
  });

  // ======================= forum & media channels =======================
  // Both are text channels with a different layout (`ch.layout`):
  //   forum: every post has a title (and optional tags) and its own thread for replies.
  //   media: every post needs a picture or video; they show as a grid, and each has a thread too.
  // Posts are normal messages (so permissions, AutoMod, reports, search and deletes all work as
  // before) with a `post` field; the thread is made automatically.
  const isLayout = ch => ch && (ch.layout === 'forum' || ch.layout === 'media');
  const TAG_RE = /^[\p{L}\p{N} _'&+-]{1,20}$/u;
  function cleanTags(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const t of list.slice(0, 20)) {
      const name = clean(t?.name, 20);
      if (!name || !TAG_RE.test(name) || badName(name)) continue;
      const emoji = clean(t?.emoji, 8);
      // mod: a staff-only tag (Planned, Declined…): only people who can manage the channel put it on a post.
      out.push({ id: /^[a-z0-9]{4,20}$/.test(String(t?.id || '')) ? t.id : newId().slice(-8), name, ...(emoji ? { emoji } : {}), ...(t?.mod ? { mod: true } : {}) });
    }
    return out;
  }
  route('PATCH', '/api/channels/:id/forum', async ({ me, params, body }) => {
    const { sv, ch } = z.findChannel(params.id);
    if (!sv || !sv.members.includes(me.id) || !z.canView(z.ensureRoles(sv), ch, me.id)) fail(404, 'Channel not found.');
    z.need(sv, me, 'manage_channels', ch);
    if (ch.type !== 'text') fail(400, 'Only text channels can be forums or media channels.');
    if ('layout' in body) { if (body.layout && !['forum', 'media'].includes(body.layout)) fail(400, 'Unknown channel layout.'); if (body.layout) ch.layout = body.layout; else delete ch.layout; }
    if ('tags' in body) ch.forumTags = cleanTags(body.tags);
    if ('requireTag' in body) ch.requireTag = !!body.requireTag;
    if ('guidelines' in body) ch.guidelines = clean(body.guidelines, 1500);
    // What a new post's message box starts with (like "What's the idea? / Why would it help?").
    // Voting: every post shows 👍 / 👎 buttons, and "Most upvoted" sorts by them.
    if ('voting' in body) { if (body.voting) ch.voting = true; else delete ch.voting; }
    if ('postTemplate' in body) { const t = clean(body.postTemplate, 1000); if (t) ch.postTemplate = t; else delete ch.postTemplate; }
    z.audit(sv, me, 'channel_update', { type: 'channel', id: ch.id, name: ch.name }, 'forum settings');
    save(); z.refreshServer(sv);
    return { channel: ch };
  });
  const unuse = body => { for (const id of Array.isArray(body.attachmentIds) ? body.attachmentIds : []) if (data.attachments[id]?.owner) data.attachments[id].used = false; };
  hooks.beforePost.push(({ conv, body, content, extra }) => {
    if (conv.kind !== 'channel' || !isLayout(conv.channel)) return;
    const ch = conv.channel;
    // A forward or a reply isn't a new post: replies go in the post's thread.
    if (body.forward) { unuse(body); fail(400, `Share it in a post instead: forwarding into a ${ch.layout} channel isn't possible.`); }
    const title = clean(body.post?.title, 100);
    if (ch.layout === 'forum' && !title) { unuse(body); fail(400, 'Give your post a title.'); }
    if (title && badName(title)) { unuse(body); fail(400, "That title isn't allowed on Zuno. Please change it."); }
    if (ch.layout === 'media' && !(extra.attachments || []).some(a => a.kind === 'image' || a.kind === 'video') && !extra.gif) {
      unuse(body); fail(400, 'Posts in a media channel need a picture or a video.');
    }
    // Staff-only tags can only be picked by people who can manage the channel.
    const staff = conv.perms.has('manage_channels') || conv.perms.has('manage_messages');
    const usable = (ch.forumTags || []).filter(t => staff || !t.mod), known = new Set(usable.map(t => t.id));
    const tags = [...new Set((Array.isArray(body.post?.tags) ? body.post.tags : []).map(String))].filter(id => known.has(id)).slice(0, 5);
    if (ch.requireTag && usable.some(t => !t.mod) && !tags.length) { unuse(body); fail(400, 'Pick at least one tag for your post.'); }
    if (content && /^\//.test(content)) return; // a bot command stays a command
    extra.post = { title: title || '', tags };
    const now = Date.now();
    extra.thread = { id: newId(), name: (title || content.replace(/[*_~`>#|]/g, '').slice(0, 40) || (ch.layout === 'media' ? 'Comments' : 'Post')).slice(0, 60), count: 0, lastAt: now, archived: false };
  });
  hooks.afterPost.push(({ conv, me, message }) => {
    if (conv.kind !== 'channel' || !message.thread || !message.post || data.threads?.[message.thread.id]) return;
    data.threads ||= {};
    const t = { id: message.thread.id, name: message.thread.name, serverId: conv.server.id, channelId: conv.channel.id, parentId: message.id, ownerId: me.id, createdAt: message.createdAt, lastAt: message.createdAt, archived: false, messages: [] };
    data.threads[t.id] = t;
    save();
    const meta = { id: t.id, name: t.name, serverId: t.serverId, channelId: t.channelId, parentId: t.parentId, ownerId: t.ownerId, createdAt: t.createdAt, lastAt: t.lastAt, count: 0, archived: false };
    for (const id of conv.members) send(id, 'thread', { thread: meta });
  });
  // The forum/media page: every post, newest activity first (up to 300), with its reply count.
  route('GET', '/api/channels/:id/posts', async ({ me, params }) => {
    const conv = z.channelConv(me, params.id);
    if (!isLayout(conv.channel)) fail(400, "This isn't a forum or media channel.");
    let msgs = conv.peek()?.messages || [];
    if (!conv.perms.has('read_history')) { const since = me.joinedAt?.[conv.server.id] || 0; msgs = msgs.filter(m => m.createdAt >= since); }
    const posts = msgs.filter(m => m.post).map(m => {
      const t = m.thread && data.threads?.[m.thread.id];
      const last = t?.messages?.[t.messages.length - 1];
      return { ...m, votes: (m.reactions?.['👍'] || []).length - (m.reactions?.['👎'] || []).length, replies: t ? t.messages.length : 0, activeAt: Math.max(m.createdAt, t?.lastAt || 0), lastReply: last ? { authorId: last.authorId, text: (last.content || (last.sticker ? 'Sticker' : '')).slice(0, 100), at: last.createdAt } : null, archived: !!t?.archived };
    }).sort((a, b) => b.activeAt - a.activeAt).slice(0, 300);
    const ids = new Set(posts.flatMap(p => [p.authorId, p.lastReply?.authorId]).filter(Boolean));
    return { posts, authors: [...ids].map(id => z.publicUser(data.users[id])).filter(Boolean), tags: conv.channel.forumTags || [], requireTag: !!conv.channel.requireTag, guidelines: conv.channel.guidelines || '', postTemplate: conv.channel.postTemplate || '', voting: !!conv.channel.voting, canTagStaff: conv.perms.has('manage_channels') || conv.perms.has('manage_messages'), canPost: conv.perms.has('send_messages'), canAttach: conv.perms.has('attach_files'), canManage: conv.perms.has('manage_channels') };
  });
  // The post's author (or a moderator) can change its title and tags.
  route('PATCH', '/api/channels/:cid/posts/:mid', async ({ me, params, body }) => {
    const conv = z.channelConv(me, params.cid);
    if (!isLayout(conv.channel)) fail(400, "This isn't a forum or media channel.");
    const { st, i, m } = z.findMessage(conv, params.mid);
    if (!m.post) fail(404, 'That post no longer exists.');
    if (m.authorId !== me.id && !conv.perms.has('manage_messages')) fail(403, 'Only the person who posted it (or a moderator) can change it.');
    const post = { ...m.post };
    if ('title' in body) { const title = clean(body.title, 100); if (conv.channel.layout === 'forum' && !title) fail(400, 'Give your post a title.'); if (title && badName(title)) fail(400, "That title isn't allowed on Zuno. Please change it."); post.title = title; }
    if ('tags' in body) {
      // Only staff add or remove staff-only tags; everyone else's edit keeps whichever are there.
      const staff = conv.perms.has('manage_channels') || conv.perms.has('manage_messages'), all = conv.channel.forumTags || [];
      const modIds = new Set(all.filter(t => t.mod).map(t => t.id)), known = new Set(all.map(t => t.id));
      let next = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(String))].filter(id => known.has(id) && (staff || !modIds.has(id)));
      if (!staff) next = [...(post.tags || []).filter(id => modIds.has(id)), ...next];
      post.tags = [...new Set(next)].slice(0, 5);
    }
    const message = st.messages[i] = { ...m, post };
    const t = m.thread && data.threads?.[m.thread.id];
    if (t && post.title) { t.name = post.title.slice(0, 60); st.messages[i] = { ...message, thread: { ...message.thread, name: t.name } }; }
    save();
    z.emit(conv, 'message-update', { message: st.messages[i] });
    return { message: st.messages[i] };
  });

  // ======================= Watch Together for videos sent in chat =======================
  // Pick a video someone sent (or upload one) and everyone in the call watches it in sync. The
  // video is only shared with the people in that call, and only while it's playing.
  const parties = new Map(); // roomId -> { attachmentId, url, name, hostId, playing, position, updatedAt }
  const partyView = p => p && ({ ...p, now: Date.now() });
  const pushParty = roomId => { const p = parties.get(roomId) || null; for (const id of z.roomMembers(roomId)) send(id, 'party', { room: roomId, party: partyView(p) }); };
  const inCall = (me, roomId) => { if (!z.rooms.get(roomId)?.has(me.id)) fail(403, 'Join the call first.'); };
  const partyPos = p => (p.playing ? p.position + (Date.now() - p.updatedAt) / 1000 : p.position);
  hooks.canReadAttachment.push((user, a) => {
    for (const [roomId, p] of parties) if (p.attachmentId === a.id && z.rooms.get(roomId)?.has(user.id)) return true;
    return false;
  });
  route('GET', '/api/party', async ({ me, query }) => {
    const roomId = String(query.get('room') || '');
    inCall(me, roomId);
    return { party: partyView(parties.get(roomId) || null) };
  });
  route('POST', '/api/party/start', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    z.limit('party:' + me.id, 20, 10 * 60e3, "You've started a lot of videos. Try again in a few minutes.");
    const a = data.attachments[clean(body.attachmentId, 40)];
    if (!a || a.kind !== 'video') fail(400, 'Pick a video to watch together.');
    if (!z.canReadAttachment(me, a)) fail(404, "That video isn't available to you.");
    parties.set(roomId, { attachmentId: a.id, url: a.url, name: clean(a.name, 120) || 'Video', hostId: me.id, playing: true, position: 0, updatedAt: Date.now() });
    pushParty(roomId);
    return { party: partyView(parties.get(roomId)) };
  });
  route('POST', '/api/party/control', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    const p = parties.get(roomId);
    if (!p) fail(400, 'Nothing is playing.');
    if (body.action === 'play') { p.position = partyPos(p); p.playing = true; }
    else if (body.action === 'pause') { p.position = partyPos(p); p.playing = false; }
    else if (body.action === 'seek') { p.position = Math.max(0, Math.min(24 * 3600, Number(body.position) || 0)); }
    else if (body.action === 'ended') { p.position = 0; p.playing = false; }
    else fail(400, 'Unknown action.');
    p.updatedAt = Date.now();
    pushParty(roomId);
    return { party: partyView(p) };
  });
  route('POST', '/api/party/stop', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    parties.delete(roomId);
    pushParty(roomId);
    return { ok: true };
  });
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (what === 'join' && parties.has(roomId)) setTimeout(() => send(uid, 'party', { room: roomId, party: partyView(parties.get(roomId)) }), 500);
    if (what !== 'join' && !room?.size) parties.delete(roomId);
  });

  // ======================= server tags =======================
  // A server can have a short tag (2–4 letters or numbers, like ZNO). Members can wear one server's
  // tag next to their name everywhere on Zuno.
  const TAG_TEXT = /^[A-Z0-9]{2,4}$/;
  const tagColor = c => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null);
  // A tag's emoji must be one real emoji: wide characters like "﷽" stretched tags out of their boxes.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const oneEmoji = v => { const t = String(v || '').trim(); return t && [...segmenter.segment(t)].length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(t) ? t : ''; };
  hooks.serverSummary.push(sv => ({ tag: sv.tag ? { ...sv.tag, ...(sv.tag.emoji ? { emoji: oneEmoji(sv.tag.emoji) || undefined } : {}) } : null }));
  hooks.publicUser.push(u => {
    const sv = u.serverTag && data.servers[u.serverTag];
    if (!sv?.tag || !sv.members.includes(u.id)) return { serverTag: null }; // null (not missing), so taking a tag off clears it everywhere
    const emojiId = sv.tag.emojiId && (sv.emojis || []).some(e => e.id === sv.tag.emojiId) ? sv.tag.emojiId : null;
    return { serverTag: { text: sv.tag.text, color: sv.tag.color || null, emoji: emojiId ? null : oneEmoji(sv.tag.emoji) || null, emojiId, serverId: sv.id, server: sv.name } };
  });
  route('PATCH', '/api/servers/:id/tag', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    z.need(sv, me, 'manage_server');
    if (body.text === null || body.text === '') delete sv.tag;
    else {
      const text = clean(body.text, 10).toUpperCase(); // checked below, not cut short, so "TOOLONG" isn't quietly saved as "TOOL"
      if (!TAG_TEXT.test(text)) fail(400, 'Tags are 2 to 4 letters or numbers.');
      if (badName(text)) fail(400, "That tag isn't allowed on Zuno. Please pick another.");
      const emoji = oneEmoji(clean(body.emoji, 16));
      if (clean(body.emoji, 16) && !emoji) fail(400, 'Pick a single emoji for the tag.');
      // Or one of this server's own custom emoji (0.30).
      const emojiId = String(body.emojiId || '');
      if (emojiId && !(sv.emojis || []).some(e => e.id === emojiId)) fail(400, "That emoji isn't one of this server's emoji.");
      sv.tag = { text, ...(tagColor(body.color) ? { color: tagColor(body.color) } : {}), ...(emojiId ? { emojiId } : emoji ? { emoji } : {}) };
    }
    z.audit(sv, me, 'server_update', null, sv.tag ? `server tag ${sv.tag.text}` : 'removed the server tag');
    save(); z.refreshServer(sv);
    for (const id of sv.members) { const u = data.users[id]; if (u?.serverTag === sv.id) z.broadcastUser(u); }
    return { tag: sv.tag || null };
  });
  route('PATCH', '/api/me/server-tag', async ({ me, body }) => {
    if (!body.serverId) { delete me.serverTag; }
    else {
      const sv = z.getServer(me, String(body.serverId));
      if (!sv.tag) fail(400, "That server doesn't have a tag yet.");
      me.serverTag = sv.id;
    }
    save(); z.broadcastUser(me);
    send(me.id, 'me', z.privateMe(me));
    return { me: z.privateMe(me) };
  });

  // ======================= profile visitors & comments =======================
  // Visitors (off by default): turn it on to see who opened your profile in the last 30 days. It
  // works both ways: you only show up in someone's list if you've turned it on yourself.
  // Comments: friends (or everyone, or nobody) can leave a comment on your profile. You can
  // delete any comment on your profile; people can delete their own.
  const VISIT_DAYS = 30 * 864e5;
  const socialOf = u => ({ visitors: !!u.profileSocial?.visitors, comments: ['everyone', 'friends', 'off'].includes(u.profileSocial?.comments) ? u.profileSocial.comments : 'everyone' });
  hooks.publicUser.push(u => (human(u) ? { profileComments: socialOf(u).comments } : {}));
  route('PATCH', '/api/me/profile-social', async ({ me, body }) => {
    const cur = socialOf(me);
    if ('visitors' in body) cur.visitors = !!body.visitors;
    if ('comments' in body) { if (!['everyone', 'friends', 'off'].includes(body.comments)) fail(400, 'Pick who can comment.'); cur.comments = body.comments; }
    me.profileSocial = cur;
    if (!cur.visitors) me.visitors = [];
    save(); z.broadcastUser(me);
    return { social: cur };
  });
  route('GET', '/api/me/profile-social', async ({ me }) => {
    const since = Date.now() - VISIT_DAYS;
    const visitors = (me.visitors || []).filter(v => v.at > since && data.users[v.id]);
    return { social: socialOf(me), visitors: visitors.map(v => ({ at: v.at, user: z.publicUser(data.users[v.id]) })), anonymous: (me.visitsAnon || []).filter(t => t > since).length };
  });
  route('POST', '/api/users/:id/visit', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u) || u.id === me.id || !human(me) || !socialOf(u).visitors || z.isBlocked(me.id, u.id)) return { ok: true };
    const now = Date.now();
    if (socialOf(me).visitors) {
      const prev = (u.visitors || []).find(v => v.id === me.id);
      if (prev && now - prev.at < 3600e3) return { ok: true }; // one visit an hour is plenty
      u.visitors = [{ id: me.id, at: now }, ...(u.visitors || []).filter(v => v.id !== me.id && now - v.at < VISIT_DAYS)].slice(0, 100);
    } else {
      u.visitsAnon = [...(u.visitsAnon || []).filter(t => now - t < VISIT_DAYS), now].slice(-500);
    }
    save();
    return { ok: true };
  });
  const canComment = (me, u) => {
    if (!human(u) || !human(me)) return false;
    if (u.id === me.id) return true;
    if (z.isBlocked(me.id, u.id)) return false;
    const mode = socialOf(u).comments;
    return mode === 'everyone' || (mode === 'friends' && z.areFriends(me.id, u.id));
  };
  const commentView = c => ({ id: c.id, authorId: c.authorId, text: c.text, at: c.at });
  route('GET', '/api/users/:id/comments', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!human(u)) return { comments: [], authors: [], mode: 'off', canComment: false, canModerate: false };
    const blocked = new Set(me.blocked || []);
    const list = (u.profileComments || []).filter(c => data.users[c.authorId] && !blocked.has(c.authorId)).slice(0, 100);
    const ids = new Set(list.map(c => c.authorId));
    return { comments: list.map(commentView), authors: [...ids].map(id => z.publicUser(data.users[id])).filter(Boolean), mode: socialOf(u).comments, canComment: socialOf(u).comments !== 'off' && canComment(me, u), canModerate: u.id === me.id || z.isStaff(me) };
  });
  route('POST', '/api/users/:id/comments', async ({ me, params, body }) => {
    const u = data.users[params.id];
    if (!u) fail(404, 'User not found.');
    if (socialOf(u).comments === 'off') fail(403, `${u.displayName} has turned off profile comments.`);
    if (!canComment(me, u)) fail(403, socialOf(u).comments === 'friends' ? `Only ${u.displayName}'s friends can comment on their profile.` : "You can't comment on this profile.");
    z.limit('pcomment:' + me.id, 6, 60e3, "You're commenting too fast.");
    const text = clean(String(body.text ?? '').replace(/\s+/g, ' '), 300);
    if (!text) fail(400, 'Write something first.');
    if (badName(text)) fail(400, "That comment isn't allowed on Zuno. Please change it.");
    const c = { id: newId(), authorId: me.id, text, at: Date.now() };
    u.profileComments = [c, ...(u.profileComments || [])].slice(0, 100);
    save();
    if (u.id !== me.id) send(u.id, 'profile-comment', { from: z.publicUser(me), text: text.slice(0, 120) });
    return { comment: commentView(c), author: z.publicUser(me) };
  });
  route('DELETE', '/api/users/:id/comments/:cid', async ({ me, params }) => {
    const u = data.users[params.id];
    const c = (u?.profileComments || []).find(x => x.id === params.cid);
    if (!c) fail(404, 'That comment is already gone.');
    if (c.authorId !== me.id && u.id !== me.id && !z.isStaff(me)) fail(403, 'You can only delete your own comments, or comments on your profile.');
    u.profileComments = u.profileComments.filter(x => x !== c);
    save();
    return { ok: true };
  });

  // ======================= Download My Data =======================
  // Everything Zuno keeps about you, as one JSON file: your account and profile, your friends and
  // servers, your messages (and the chats you're in), files you sent, notes, settings and more.
  // Secrets (your password's hash, login tokens, two-factor and recovery codes) are never included.
  const SECRET_KEYS = new Set(['passwordHash', 'twoFactor', 'twoFactorPending', 'recovery', 'passkeys', 'e2eDevices', 'spotify', 'knocks', 'visitsAnon', 'push']);
  // Belt and braces: anything nested that looks like a key or token is left out too.
  const scrub = v => (Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !/token|secret|hash|password|refresh/i.test(k)).map(([k, x]) => [k, scrub(x)])) : v);
  route('GET', '/api/me/export', async ({ me, res }) => {
    if (!human(me)) fail(403, "This account can't download data.");
    z.limit('export:' + me.id, 3, 3600e3, 'You can download your data 3 times an hour. Try again a bit later.');
    const account = {};
    for (const [k, v] of Object.entries(me)) if (!SECRET_KEYS.has(k)) account[k] = scrub(v);
    const pick = (map, keyOk) => Object.entries(data[map] || {}).filter(([k, st]) => keyOk(k, st)).map(([k, st]) => ({ id: k, messages: (st.messages || []) }));
    const dms = pick('dms', k => k.split(':').includes(me.id)).map(c => ({ with: c.id.split(':').find(x => x !== me.id), withUsername: data.users[c.id.split(':').find(x => x !== me.id)]?.username || null, messages: c.messages }));
    const groups = Object.values(data.groups || {}).filter(g => g.members.includes(me.id)).map(g => ({ id: g.id, name: g.name || '', members: g.members.map(id => data.users[id]?.username || id), messages: data.groupMessages?.[g.id]?.messages || [] }));
    const servers = Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => ({
      id: sv.id, name: sv.name, owner: sv.ownerId === me.id, joinedAt: me.joinedAt?.[sv.id] || null,
      myMessages: sv.channels.filter(ch => ch.type === 'text' || ch.type === 'voice').map(ch => ({ channel: ch.name, messages: (data.channelMessages[ch.id]?.messages || []).filter(m => m.authorId === me.id) })).filter(c => c.messages.length),
      threadReplies: Object.values(data.threads || {}).filter(t => t.serverId === sv.id).flatMap(t => t.messages.filter(m => m.authorId === me.id).map(m => ({ thread: t.name, ...m }))),
    }));
    const files = Object.values(data.attachments || {}).filter(a => a.owner === me.id).map(a => ({ id: a.id, name: a.name, kind: a.kind, size: a.size, url: a.url, sentAt: a.createdAt }));
    const out = {
      about: 'Your data from Zuno. Messages in DMs and group chats include what everyone in them sent; in servers, only your own messages are included.',
      exportedAt: new Date().toISOString(),
      account,
      friends: Object.values(data.users).filter(u => z.areFriends(me.id, u.id)).map(u => ({ id: u.id, username: u.username, displayName: u.displayName })),
      blocked: (me.blocked || []).map(id => data.users[id]?.username || id),
      servers, dms, groups, files,
      profileCommentsYouWrote: Object.values(data.users).flatMap(u => (u.profileComments || []).filter(c => c.authorId === me.id).map(c => ({ on: u.username, text: c.text, at: c.at }))),
      logins: Object.values(data.sessions || {}).filter(s => s?.uid === me.id).map(s => ({ createdAt: s.createdAt, lastSeen: s.lastSeen, device: s.agent || '' })),
    };
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="zuno-data-${me.username}-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return out;
  });

  // ======================= phone notifications (Web Push) =======================
  // Installed Zuno (on a phone's home screen, or a desktop browser) can get notifications while
  // it's closed: DMs, group messages, mentions and replies, friend requests and calls. Messages are
  // encrypted for each device (RFC 8291) and signed with Zuno's own key (VAPID, RFC 8292), using
  // only Node's built-in crypto. Nothing is sent while you're looking at Zuno somewhere.
  data.meta ||= {};
  if (!data.meta.vapid) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = publicKey.export({ format: 'jwk' });
    data.meta.vapid = { publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]).toString('base64url'), privateJwk: privateKey.export({ format: 'jwk' }) };
    save();
  }
  const vapidKey = () => crypto.createPrivateKey({ key: data.meta.vapid.privateJwk, format: 'jwk' });
  // Only real push services: a subscription can't make Zuno send requests anywhere else.
  const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
  // (ZUNO_PUSH_TEST_URL lets the tests use a pretend push service on this computer. Never set it in production.)
  const okEndpoint = e => { try { const u = new URL(e); if (process.env.ZUNO_PUSH_TEST_URL && e.startsWith(process.env.ZUNO_PUSH_TEST_URL)) return true; return u.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(u.hostname)) && e.length < 1000; } catch { return false; } };
  function vapidJwt(endpoint) {
    const aud = new URL(endpoint).origin;
    const head = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
    const sub = process.env.ZUNO_PUSH_CONTACT || (z.PUBLIC_URL ? z.PUBLIC_URL : 'mailto:support@zuno.app');
    const claims = Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })).toString('base64url');
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapidKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${head}.${claims}.${sig}`;
  }
  const hmac = (key, buf) => crypto.createHmac('sha256', key).update(buf).digest();
  // aes128gcm content encoding (RFC 8188) with Web Push's key derivation (RFC 8291).
  function encryptPush(sub, payload) {
    const uaPublic = Buffer.from(sub.p256dh, 'base64url'), authSecret = Buffer.from(sub.auth, 'base64url');
    const ecdh = crypto.createECDH('prime256v1');
    const asPublic = ecdh.generateKeys();
    const shared = ecdh.computeSecret(uaPublic);
    const prkKey = hmac(authSecret, shared);
    const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const salt = crypto.randomBytes(16);
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
    const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
  }
  z.encryptPush = encryptPush; // for the tests
  async function pushTo(u, sub, note) {
    try {
      const body = encryptPush(sub, JSON.stringify(note));
      const r = await fetch(sub.endpoint, {
        method: 'POST', signal: AbortSignal.timeout(10000), body,
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: note.urgent ? 'high' : 'normal', ...(note.tag ? { Topic: crypto.createHash('sha1').update(note.tag).digest('base64url').slice(0, 32) } : {}), Authorization: `vapid t=${vapidJwt(sub.endpoint)}, k=${data.meta.vapid.publicKey}` },
      });
      if (r.status === 404 || r.status === 410) { u.push = (u.push || []).filter(s => s.endpoint !== sub.endpoint); save(); }
      else if (r.status >= 400) console.warn('Push failed:', r.status, new URL(sub.endpoint).hostname);
    } catch (err) { console.warn('Push failed:', err.message); }
  }
  // When you last had Zuno open and in front of you somewhere (the app tells the server).
  const lookingAt = new Map(); // userId -> time
  route('POST', '/api/push/presence', async ({ me, body }) => { if (body.visible) lookingAt.set(me.id, Date.now()); else lookingAt.delete(me.id); return { ok: true }; });
  setInterval(() => { const old = Date.now() - 5 * 60e3; for (const [k, t] of lookingAt) if (t < old) lookingAt.delete(k); }, 5 * 60e3).unref();
  const pushCount = new Map(); // userId -> { n, at }, so a busy chat can't flood a phone
  function notifyPhone(uid, note) {
    const u = data.users[uid];
    if (!human(u) || !u.push?.length || u.prefs?.phoneNotifications === false) return;
    if (z.isOnline(uid) && Date.now() - (lookingAt.get(uid) || 0) < 90e3) return; // they're looking at Zuno right now
    if (u.status === 'dnd' && !note.urgent) return;
    if (z.inQuietHours?.(u) && !note.urgent) return; // (0.38) quiet hours: calls still ring
    const c = pushCount.get(uid);
    if (c && Date.now() - c.at < 60e3) { if (++c.n > 20) return; } else pushCount.set(uid, { n: 1, at: Date.now() });
    for (const sub of u.push) pushTo(u, sub, note);
  }
  setInterval(() => { const old = Date.now() - 60e3; for (const [k, c] of pushCount) if (c.at < old) pushCount.delete(k); }, 60e3).unref();
  z.notifyPhone = notifyPhone;
  route('GET', '/api/push/key', async () => ({ key: data.meta.vapid.publicKey }));
  route('POST', '/api/push/subscribe', async ({ me, body, req }) => {
    const endpoint = String(body.endpoint || ''), p256dh = String(body.keys?.p256dh || ''), auth = String(body.keys?.auth || '');
    if (!okEndpoint(endpoint)) fail(400, "This browser's notification service isn't supported.");
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) fail(400, "That notification subscription isn't valid.");
    me.push = [{ endpoint, p256dh, auth, at: Date.now(), agent: clean(req.headers['user-agent'], 120) }, ...(me.push || []).filter(s => s.endpoint !== endpoint)].slice(0, 6);
    save();
    return { ok: true, devices: me.push.length };
  });
  route('DELETE', '/api/push/subscribe', async ({ me, body }) => {
    me.push = (me.push || []).filter(s => s.endpoint !== String(body.endpoint || ''));
    save();
    return { ok: true, devices: me.push.length };
  });
  route('POST', '/api/push/test', async ({ me }) => {
    if (!me.push?.length) fail(400, 'Turn on phone notifications on this device first.');
    z.limit('pushtest:' + me.id, 5, 60e3, 'Give it a moment.');
    for (const sub of me.push) pushTo(me, sub, { title: 'Zuno', body: "🔔 Notifications are working! You'll get one like this for DMs, mentions and calls.", tag: 'test', url: '/' });
    return { ok: true };
  });
  const preview = m => (m.e2e ? '🔒 Encrypted message' : m.content ? m.content.replace(/\s+/g, ' ').slice(0, 140) : m.attachments ? '📎 Sent an attachment' : m.gif ? 'Sent a GIF' : m.sticker ? 'Sent a sticker' : m.poll ? `📊 ${m.poll.question || 'Poll'}` : 'New message');
  hooks.posted.push((conv, m, author) => {
    if (!author || author.system || m.call) return;
    if (conv.kind === 'dm') {
      const other = conv.other; // the conversation is seen from the sender's side
      if (!other || other.id === author.id) return;
      const req = conv.peek()?.request;
      if (req && req.to === other.id && req.status !== 'accepted') return; // message requests wait quietly
      notifyPhone(other.id, { title: author.displayName, body: preview(m), tag: 'dm:' + author.id, open: author.id, icon: author.avatar || null });
    } else if (conv.kind === 'group') {
      for (const id of conv.members) if (id !== author.id) notifyPhone(id, { title: conv.group.name || 'Group chat', body: `${author.displayName}: ${preview(m)}`, tag: 'g:' + conv.group.id, open: 'g:' + conv.group.id });
    } else if (conv.kind === 'channel') {
      // In servers: only messages that ping you (by name, a role you have, @everyone, or a reply).
      const pinged = new Set(m.mentions || []);
      if (m.replyTo?.authorId && !m.replyTo.noPing) pinged.add(m.replyTo.authorId);
      for (const rid of m.mentionRoles || []) for (const id of conv.members) if (z.rolesOf(conv.server, id).includes(rid)) pinged.add(id);
      if (m.mentionEveryone) for (const id of conv.members) pinged.add(id);
      pinged.delete(author.id);
      for (const uid of pinged) {
        if (!conv.members.includes(uid)) continue;
        const reply = m.replyTo?.authorId === uid && !(m.mentions || []).includes(uid);
        notifyPhone(uid, { title: `${author.displayName} ${reply ? 'replied' : 'mentioned you'} in #${conv.channel.name}`, body: preview(m), tag: 'ch:' + conv.channel.id, open: 'ch:' + conv.channel.id });
      }
    }
  });
  hooks.friend.push((kind, a, b) => {
    if (kind === 'request') notifyPhone(b, { title: 'New friend request', body: `${data.users[a]?.displayName || 'Someone'} wants to be friends`, tag: 'fr:' + a, open: 'friends' });
  });
  // Reminders (and anything else that goes to the notification inbox through z.notify).
  const notifyOrig = z.notify;
  if (notifyOrig) z.notify = (uid, n) => {
    notifyOrig(uid, n);
    if (n.type === 'reminder') notifyPhone(uid, { title: '⏰ Reminder', body: n.text || '', tag: 'reminder', open: n.conv || null });
  };
  // Someone starting a call with you while Zuno is closed.
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (what !== 'join' || room?.size !== 1 || !(roomId.startsWith('dm:') || roomId.startsWith('gc:'))) return;
    const caller = data.users[uid];
    if (!caller) return;
    let others = [], title = caller.displayName, open = uid;
    if (roomId.startsWith('dm:')) others = roomId.slice(3).split(':').filter(id => id !== uid);
    else { const g = data.groups?.[roomId.slice(3)]; if (!g) return; others = g.members.filter(id => id !== uid); title = g.name || 'Group call'; open = 'g:' + g.id; }
    for (const id of others) notifyPhone(id, { title: `📞 ${title}`, body: roomId.startsWith('gc:') ? `${caller.displayName} started a call` : 'is calling you', tag: 'call:' + roomId, open, urgent: true, call: true });
  });

  // ======================= what the app gets on load =======================
  const extras = me => ({ replyLater: laterView(me), profileSocial: socialOf(me), serverTag: me.serverTag || null, pushDevices: (me.push || []).length });
  route('GET', '/api/me/extras28', async ({ me }) => extras(me));
};
