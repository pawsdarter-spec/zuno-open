'use strict';
// Zuno 0.28: a steadier chat, Reply Later, slash commands, forum & media channels, Watch Together
// for videos sent in chat, server tags, profile visitors & comments, Download My Data, phone
// notifications and mini mode.

// ======================= a steadier chat =======================
// The chat is redrawn as a whole when something in it changes (a new message, a reaction, someone's
// name). If you'd scrolled up to read, the redraw used to put you back at the same pixel position,
// which isn't the same place once anything above changed size, so the chat jumped. Now it keeps
// the message you were looking at exactly where it was.
function chatAnchor(el) {
  const top = el.getBoundingClientRect().top;
  for (const row of el.querySelectorAll(':scope > .msg[data-id]')) {
    const r = row.getBoundingClientRect();
    if (r.bottom > top + 4) return { id: row.dataset.id, off: r.top - top };
  }
  return null;
}
const _renderMessages28 = renderMessages;
renderMessages = function (forceBottom = false, ...rest) {
  const el = $('#messages');
  const keep = el && !forceBottom && typeof stickToBottom !== 'undefined' && !stickToBottom ? chatAnchor(el) : null;
  const r = _renderMessages28(forceBottom, ...rest);
  // Invite cards go in before the position is put back (they have a fixed size, so nothing moves later).
  if (el?.isConnected) { decorateInvites(); if (stickToBottom || forceBottom) { el.scrollTop = el.scrollHeight; lastMsgTop = el.scrollTop; } }
  if (keep && el.isConnected && !stickToBottom) {
    const row = el.querySelector(`:scope > .msg[data-id="${CSS.escape(keep.id)}"]`);
    if (row) {
      const diff = row.getBoundingClientRect().top - el.getBoundingClientRect().top - keep.off;
      if (Math.abs(diff) > 1) { el.scrollTop += diff; lastMsgTop = el.scrollTop; }
    }
  }
  return r;
};

// ======================= what the app learns on load =======================
const _loadState28 = loadState;
loadState = async function (...a) {
  const r = await _loadState28(...a);
  try {
    const d = await api('GET', '/api/me/extras28');
    Object.assign(state, { replyLater: d.replyLater || [], profileSocial: d.profileSocial || { visitors: false, comments: 'friends' }, pushDevices: d.pushDevices || 0 });
  } catch { state.replyLater ||= []; }
  return r;
};
const live28 = (ev, fn) => onLive26(ev, fn);

// ======================= Reply Later =======================
// Right-click someone's message › Reply Later. It waits at the top of your DMs until you answer
// in that chat (or tick it off).
state.replyLater ||= [];
live28('reply-later', d => { state.replyLater = d.items || []; renderDMList(); });
const inReplyLater = (conv, id) => (state.replyLater || []).some(x => x.conv === conv && x.msgId === id);
async function setReplyLater(conv, msgId, on) {
  try {
    const r = on ? await api('POST', '/api/me/reply-later', { conv, msgId }) : await api('DELETE', `/api/me/reply-later?conv=${encodeURIComponent(conv)}&msgId=${encodeURIComponent(msgId)}`) /* (0.53.1) DELETE sends no body */;
    state.replyLater = r.items; renderDMList();
    toast(on ? '⏰ Saved to Reply Later (top of your DMs)' : 'Removed from Reply Later');
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.messages .msg[data-id], #messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m || m.pending || m.authorId === state.me.id || user(m.authorId)?.system) return;
  const on = inReplyLater(conv, id);
  addMenuItem({ label: on ? 'Remove from Reply Later' : 'Reply Later', icon: ico('⏰'), run: () => setReplyLater(conv, id, !on) });
});
let rlOpen = localStorage.getItem('zuno_rl_open') !== '0';
const _renderDMList28 = renderDMList;
renderDMList = function (...a) {
  const r = _renderDMList28(...a);
  const list = $('#dm-list'), items = state.replyLater || [];
  if (!list || !items.length) return r;
  const box = document.createElement('div');
  box.className = 'rl-box';
  box.innerHTML = `<div class="dm-sec rl-head${rlOpen ? '' : ' collapsed'}"><span><i class="dm-caret">▾</i>⏰ Reply later</span><b class="dm-sec-n">${items.length}</b></div>
    ${rlOpen ? items.map(x => { const u = user(x.authorId) || { id: x.authorId, displayName: 'Someone' }; return `<div class="rl-item" data-rl="${esc(x.conv)}|${esc(x.msgId)}" role="button" tabindex="0">${avatar(u, 26)}<div class="rl-meta"><b>${esc(u.displayName)}</b><span>${esc(x.text || 'Message')}</span>${x.where ? `<small>${esc(x.where)}</small>` : ''}</div><button class="rl-x" title="Done (remove)">✓</button></div>`; }).join('') : ''}`;
  list.prepend(box);
  $('.rl-head', box).addEventListener('click', () => { rlOpen = !rlOpen; localStorage.setItem('zuno_rl_open', rlOpen ? '1' : '0'); renderDMList(); });
  $$('.rl-item', box).forEach(el => {
    const [conv, msgId] = el.dataset.rl.split('|');
    el.addEventListener('click', e => { if (e.target.closest('.rl-x')) return; jumpToSaved({ conv, msgId }); });
    $('.rl-x', el).addEventListener('click', () => setReplyLater(conv, msgId, false));
  });
  return r;
};

// ======================= unsaved profile changes =======================
// With unsaved profile changes, Settings stays where it is until you save or reset them. That used
// to happen with only a quick flash of the save bar (easy to miss, so Settings seemed frozen).
// Now it says why, and brings the save bar into view.
const _closeSettings28 = closeSettings;
closeSettings = function (...a) {
  if (settingsDraft && isDraftDirty()) {
    $('.save-bar')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast('You have unsaved profile changes. Press Save Changes, or Reset to throw them away.', true);
  }
  return _closeSettings28(...a);
};

// ======================= role colours in servers =======================
// In a server, a member's role colour now shows even if they picked their own name colour (that
// colour still shows everywhere else). A name style with an effect (gradient, glow…) keeps its look.
const _nameStyle28 = nameStyle;
nameStyle = function (u) {
  const inServer = state.view.type === 'channel' || state.view.type === 'voice';
  const r = inServer && u && prefs().showRoleColors !== false ? topRole(u.id) : null;
  if (r && safeColor(r.color) && (!u.nameStyle || !u.nameStyle.effect || u.nameStyle.effect === 'none')) {
    const font = u.nameStyle?.font && u.nameStyle.font !== 'default' ? ` data-nf="${esc(u.nameStyle.font)}" data-nx="none"` : '';
    return `${font} style="${esc(roleCss(r))}"`;
  }
  return _nameStyle28(u);
};
// Role changes arrive as a "refresh"; redraw the chat too so new colours show straight away.
const _refresh28 = refresh;
refresh = async function (info = {}, ...a) {
  const r = await _refresh28(info, ...a);
  if (state.view.type === 'channel' && (!info.serverId || info.serverId === state.currentServerId)) { renderMessages(); renderMemberList?.(); }
  return r;
};

// ======================= server emoji in "Recently used" =======================
// A server emoji picked from the :name: suggestions was remembered as plain text, so "Recently
// used" showed ":valorant:" instead of the picture. Now it shows the picture (or nothing, if you've
// left that server), and server emoji picked from the picker are remembered too.
const _openEmojiPicker28 = openEmojiPicker;
openEmojiPicker = function (anchor, onPick, opts) {
  const r = _openEmojiPicker28(anchor, onPick, opts);
  const pop = $('.emoji-picker');
  if (!pop) return r;
  const fixRecent = () => {
    const all = typeof allServerEmoji === 'function' ? allServerEmoji() : [];
    for (const b of $$('.ep-grid .ep-e[data-char]', pop)) {
      const m = /^:([a-z0-9_]{2,32}):$/i.exec(b.dataset.char) || /^<:([a-z0-9_]{2,32}):/i.exec(b.dataset.char);
      if (!m) continue;
      const e = all.find(x => x.name === m[1].toLowerCase());
      if (!e) { b.remove(); continue; }
      b.classList.add('ep-c'); b.dataset.tok = e.token; b.dataset.name = e.name; b.removeAttribute('data-char');
      b.innerHTML = cemojiImg(e.name, e.id);
    }
  };
  fixRecent();
  $('.ep-search', pop)?.addEventListener('input', () => setTimeout(fixRecent, 0));
  pop.addEventListener('click', e => { const c = e.target.closest('.ep-c'); if (c?.dataset.name) rememberEmoji(`:${c.dataset.name}:`); }, true);
  return r;
};

// ======================= your own profile changes show everywhere =======================
// Saving a new picture or name updated Settings and the panel at the bottom, but the chat, member
// list and DMs kept your old one until something else redrew them (the server tells everyone
// else about the change, not you). Now your own changes are applied everywhere right away.
let lastMeLook = '';
const meLook = () => JSON.stringify(['avatar', 'displayName', 'nameColor', 'nameStyle', 'decoration', 'badges', 'serverTag'].map(k => state.me?.[k] ?? null));
const _renderUserPanel28 = renderUserPanel;
renderUserPanel = function (...a) {
  const r = _renderUserPanel28(...a);
  const look = meLook();
  if (state.me && lastMeLook && look !== lastMeLook) onUser({ ...state.me });
  lastMeLook = look;
  return r;
};

// ======================= slash commands =======================
// Type "/" at the start of a message: Zuno's own commands, plus every bot command in this server,
// with what each one does. Pick one with the arrow keys and Enter (or click it).
const SLASH_BUILTIN = [
  { name: 'shrug', usage: '[message]', description: 'Adds ¯\\_(ツ)_/¯ to your message' },
  { name: 'tableflip', usage: '[message]', description: 'Adds (╯°□°)╯︵ ┻━┻' },
  { name: 'unflip', usage: '[message]', description: 'Adds ┬─┬ ノ( ゜-゜ノ)' },
  { name: 'lenny', usage: '[message]', description: 'Adds ( ͡° ͜ʖ ͡°)' },
  { name: 'me', usage: 'action', description: 'Says it in italics, like *waves*' },
  { name: 'spoiler', usage: 'message', description: 'Hides the whole message until someone clicks it' },
  { name: 'status', usage: 'text', description: 'Sets your custom status (just /status clears it)' },
  { name: 'gif', usage: '', description: 'Opens the GIF picker' },
  { name: 'later', usage: '', description: 'Shows your Reply Later list' },
];
const SLASH_SUFFIX = { shrug: '¯\\_(ツ)_/¯', tableflip: '(╯°□°)╯︵ ┻━┻', unflip: '┬─┬ ノ( ゜-゜ノ)', lenny: '( ͡° ͜ʖ ͡°)' };
const botCmdCache = {}; // channelId -> { at, list, canUse }
async function botCommands(conv) {
  if (!isChannelConv(conv)) return [];
  const id = conv.slice(3), hit = botCmdCache[id];
  if (hit && Date.now() - hit.at < 60e3) return hit.canUse ? hit.list : [];
  try { const d = await api('GET', `/api/channels/${id}/commands`); botCmdCache[id] = { at: Date.now(), list: d.commands, canUse: d.canUse }; return d.canUse ? d.commands : []; }
  catch { return []; }
}
function wireSlash(ta, container) {
  if (!ta || ta.dataset.slash) return;
  ta.dataset.slash = '1';
  let box = null, items = [], sel = 0;
  const close = () => { box?.remove(); box = null; items = []; };
  const pick = i => {
    const it = items[i];
    if (!it) return;
    ta.value = `/${it.name} `;
    ta.setSelectionRange(ta.value.length, ta.value.length);
    close();
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  };
  const draw = q => {
    if (!items.length) return close();
    if (!box) { box = document.createElement('div'); box.className = 'ep-suggest at-suggest slash-suggest'; container.prepend(box); }
    box.innerHTML = `<div class="ep-suggest-head">${q ? `Commands matching <b>/${esc(q)}</b>` : 'Commands'}</div>` + items.map((it, i) => `<button class="${i === sel ? 'sel' : ''}" data-i="${i}">${it.bot ? avatar({ id: it.bot.id, displayName: it.bot.name, avatar: it.bot.avatar }, 22) : '<span class="at-ico">/</span>'}<b>/${esc(it.name)}${it.usage ? ` <span class="sl-usage">${esc(it.usage)}</span>` : ''}</b><span class="at-sub">${esc(it.description || '')}${it.bot ? ` · ${esc(it.bot.name)}` : ''}</span></button>`).join('');
    $$('[data-i]', box).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pick(Number(b.dataset.i)); }));
    $('.sel', box)?.scrollIntoView({ block: 'nearest' });
  };
  ta.addEventListener('input', async () => {
    const m = /^\/([\w-]{0,32})$/.exec(ta.value.slice(0, ta.selectionStart));
    if (!m || ta.value.includes('\n')) return close();
    const q = m[1].toLowerCase(), conv = activeConv();
    const bots = await botCommands(conv);
    if (!/^\/([\w-]{0,32})$/.test(ta.value.slice(0, ta.selectionStart))) return close(); // typed on meanwhile
    const all = [...SLASH_BUILTIN, ...bots];
    items = all.filter(c => c.name.toLowerCase().startsWith(q)).concat(all.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q))).slice(0, 12);
    sel = 0;
    draw(q);
  });
  ta.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; draw(ta.value.slice(1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; draw(ta.value.slice(1)); }
    else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && ta.value.trim() !== `/${items[sel]?.name}`)) { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  ta.addEventListener('blur', () => setTimeout(close, 120));
}
const _renderComposer28 = renderComposer;
renderComposer = function (...a) {
  const r = _renderComposer28(...a);
  const ta = $('#composer-input');
  if (ta) wireSlash(ta, $('#composer'));
  return r;
};
// Zuno's own commands run here; anything else (bot commands) is sent as it is.
const _sendMessage28 = sendMessage;
sendMessage = async function (conv, text, opts = {}, ...rest) {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text || '');
  if (m) {
    const name = m[1].toLowerCase(), arg = (m[2] || '').trim();
    if (SLASH_SUFFIX[name]) text = (arg ? arg + ' ' : '') + SLASH_SUFFIX[name];
    else if (name === 'me' && arg) text = `*${arg}*`;
    else if (name === 'spoiler' && arg) text = `||${arg}||`;
    else if (name === 'status') {
      try { const { me } = await api('PATCH', '/api/me', { customStatus: arg }); state.me = { ...state.me, ...me }; renderUserPanel(); toast(arg ? `Status set: ${arg}` : 'Status cleared'); }
      catch (e) { toast(e.message, true); }
      return;
    } else if (name === 'gif') { $('#composer-gif')?.click(); return; }
    else if (name === 'later') { showFriends?.('online'); rlOpen = true; renderDMList(); toast((state.replyLater || []).length ? '⏰ Your Reply Later list is at the top of your DMs' : 'Nothing in Reply Later. Right-click a message › Reply Later.'); return; }
  }
  return _sendMessage28(conv, text, opts, ...rest);
};

// ======================= forum & media channels =======================
// Forum: every post has a title (and tags) and its own thread for replies. Media: a grid of
// pictures and videos, each with a thread for comments. Both are made in Create Channel.
const FORUM_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm16 4h0a2 2 0 0 1 2 2v9l-3-2h-7a2 2 0 0 1-2-2v-1h6a3 3 0 0 0 3-3z"/></svg>';
const MEDIA_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 12 4-5 3 4 2-2.5 5 3.5V6H5zM15.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>';
const chLayout = (sv, chId) => sv?.channels.find(c => c.id === chId)?.layout || null;
const forumHere = () => (state.view.type === 'channel' && !state.view.voice ? chLayout(currentServer(), state.view.channelId) : null);
// Create Channel gets Forum and Media.
const _openCreateChannel28 = openCreateChannel;
openCreateChannel = function (sv, type = 'text', categoryId = null) {
  _openCreateChannel28(sv, type === 'forum' || type === 'media' ? 'text' : type, categoryId);
  const types = $('#new-ch .ch-types'), f = $('#new-ch');
  if (!types || !f) return;
  types.insertAdjacentHTML('beforeend', `<label class="ch-type"><input type="radio" name="type" value="forum"${type === 'forum' ? ' checked' : ''}><span class="ch-ico">${FORUM_ICON}</span><span><b>Forum</b><small>Posts with titles and tags, each with its own replies</small></span></label>
    <label class="ch-type"><input type="radio" name="type" value="media"${type === 'media' ? ' checked' : ''}><span class="ch-ico">${MEDIA_ICON}</span><span><b>Media</b><small>A gallery of pictures and videos, each with comments</small></span></label>`);
  const sync = () => { const v = f.type.value; if (v === 'forum' || v === 'media') { $('.sc-ro', f).style.display = 'none'; f.name.placeholder = v === 'forum' ? 'help-desk' : 'art-gallery'; } };
  f.addEventListener('change', sync); sync();
};
// Their own icons in the channel list.
const _renderServerSidebar28 = renderServerSidebar;
renderServerSidebar = function (...a) {
  const r = _renderServerSidebar28(...a);
  const sv = currentServer();
  if (sv) for (const b of $$('#sidebar .ch-item[data-ch]')) {
    const lay = chLayout(sv, b.dataset.ch), ico = lay && $('.ch-ico', b);
    if (ico && !ico.dataset.lay) { ico.dataset.lay = lay; const lock = $('svg + svg, .lock', ico); ico.innerHTML = (lay === 'forum' ? FORUM_ICON : MEDIA_ICON) + (lock ? lock.outerHTML : ''); }
  }
  return r;
};

const forum = { data: {}, q: '', tag: '', sort: 'active', loading: {} };
async function loadForum(chId, quiet = false) {
  if (forum.loading[chId]) return;
  forum.loading[chId] = true;
  try {
    const d = await api('GET', `/api/channels/${chId}/posts`);
    for (const u of d.authors || []) state.users[u.id] = { ...state.users[u.id], ...u };
    forum.data[chId] = d;
  } catch (e) { if (!quiet) toast(e.message, true); }
  forum.loading[chId] = false;
  if (state.view.channelId === chId && forumHere()) renderForum();
}
let forumSoon = null;
const reloadForumSoon = chId => { clearTimeout(forumSoon); forumSoon = setTimeout(() => loadForum(chId, true), 350); };
for (const ev of ['message', 'message-update', 'message-delete', 'thread', 'thread-message', 'thread-delete']) {
  live28(ev, p => {
    const chId = p.channelId || p.thread?.channelId || (typeof p.conv === 'string' && p.conv.startsWith('ch:') ? p.conv.slice(3) : null);
    if (chId && forum.data[chId]) reloadForumSoon(chId);
  });
}
const firstPic = m => (m.attachments || []).find(a => a.kind === 'image' || a.kind === 'video') || null;
const plainSnippet = t => String(t || '').replace(/<:[a-z0-9_]+:[^>]+>/gi, '').replace(/[*_~`>#|]/g, '').replace(/\s+/g, ' ').trim();
function forumTagChip(t, on = false) { return `<span class="fm-tag${on ? ' on' : ''}${t.mod ? ' mod' : ''}"${t.mod ? ' title="Set by staff"' : ''}>${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}</span>`; }
function renderForum() {
  const el = $('#messages'), sv = currentServer(), chId = state.view.channelId, lay = forumHere();
  if (!el || !lay) return;
  const ch = sv.channels.find(c => c.id === chId), d = forum.data[chId];
  el.classList.add('forum-view');
  if (!d) { el.innerHTML = `<div class="fm-empty">${mascot('curious')}<div>Loading posts…</div></div>`; loadForum(chId); return; }
  const tags = d.tags || [], tagBy = new Map(tags.map(t => [t.id, t]));
  const q = forum.q.toLowerCase();
  let posts = d.posts.filter(p => (!forum.tag || p.post.tags?.includes(forum.tag)) && (!q || `${p.post.title} ${p.content}`.toLowerCase().includes(q)));
  if (forum.sort === 'new') posts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  if (forum.sort === 'top') posts = [...posts].sort((a, b) => (b.votes || 0) - (a.votes || 0) || b.activeAt - a.activeAt);
  const keepScroll = el.scrollTop;
  const head = `<div class="fm-head"><div class="fm-title">${lay === 'forum' ? FORUM_ICON : MEDIA_ICON}<div><b>${esc(ch?.name || '')}</b>${ch?.topic ? `<span class="muted small">${esc(ch.topic)}</span>` : ''}</div></div>
      <div class="fm-tools"><input class="fm-search" placeholder="Search ${lay === 'forum' ? 'posts' : 'this gallery'}" value="${esc(forum.q)}">
        <select class="sc-select fm-sort"><option value="active"${forum.sort === 'active' ? ' selected' : ''}>Recent activity</option><option value="new"${forum.sort === 'new' ? ' selected' : ''}>Newest</option><option value="top"${forum.sort === 'top' ? ' selected' : ''}>Most upvoted 👍</option></select>
        ${d.canManage ? '<button class="btn btn-grey btn-sm" data-fm="settings">⚙ Tags & guidelines</button>' : ''}
        ${d.canPost ? `<button class="btn btn-primary btn-sm" data-fm="new">${lay === 'forum' ? '➕ New Post' : '➕ Share'}</button>` : ''}</div></div>
    ${tags.length ? `<div class="fm-tags"><button class="chip${forum.tag ? '' : ' on'}" data-fmtag="">All</button>${tags.map(t => `<button class="chip${forum.tag === t.id ? ' on' : ''}" data-fmtag="${esc(t.id)}">${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}</button>`).join('')}</div>` : ''}
    ${d.guidelines ? `<div class="fm-guide"><b>Guidelines</b><div>${formatMessage(d.guidelines)}</div></div>` : ''}`;
  const count = p => `${p.votes ? `<span class="fm-votes${p.votes < 0 ? ' neg' : ''}" title="👍 minus 👎">${p.votes > 0 ? '▲' : '▼'} ${Math.abs(p.votes)}</span>` : ''}<span class="fm-count">💬 ${p.replies}</span>`;
  const body = !posts.length
    ? `<div class="fm-empty">${mascot('curious')}<div>${d.posts.length ? 'Nothing matches that.' : lay === 'forum' ? 'No posts yet. Start the first one!' : 'Nothing shared yet. Post the first picture or video!'}</div></div>`
    : lay === 'forum'
      ? `<div class="fm-list">${posts.map(p => {
          const u = user(p.authorId) || { id: p.authorId, displayName: 'Someone' }, pic = firstPic(p);
          return `<button class="fm-post${p.archived ? ' closed' : ''}" data-post="${esc(p.id)}">
            <div class="fm-main"><div class="fm-ptags">${(p.post.tags || []).map(id => tagBy.get(id)).filter(Boolean).map(t => forumTagChip(t)).join('')}</div>
              <b class="fm-ptitle">${p.archived ? '🔒 ' : ''}${esc(p.post.title)}</b>
              <div class="fm-snip"><span class="fm-by">${esc(nameIn(u))}:</span> ${esc(plainSnippet(p.content).slice(0, 160)) || '<i>(picture)</i>'}</div>
              <div class="fm-meta">${count(p)}<span>${esc(fmtTime(p.activeAt))}</span>${p.lastReply ? `<span class="muted">· last reply by ${esc(user(p.lastReply.authorId)?.displayName || 'someone')}</span>` : ''}</div></div>
            ${pic ? (pic.kind === 'image' ? `<img class="fm-thumb" src="${esc(pic.thumb || pic.url)}" alt="" loading="lazy">` : `<video class="fm-thumb" src="${esc(pic.url)}#t=0.1" muted preload="metadata"></video>`) : ''}</button>`;
        }).join('')}</div>`
      : `<div class="fm-grid">${posts.map(p => {
          const pic = firstPic(p), u = user(p.authorId) || { id: p.authorId, displayName: 'Someone' };
          const spoil = pic?.spoiler;
          return `<button class="fm-tile${spoil ? ' spoil' : ''}" data-post="${esc(p.id)}">
            ${pic ? (pic.kind === 'image' ? `<img src="${esc(pic.thumb || pic.url)}" alt="${esc(pic.alt || '')}" loading="lazy">` : `<video src="${esc(pic.url)}#t=0.1" muted preload="metadata"></video><span class="fm-play">▶</span>`) : p.gif ? `<img src="${esc(p.gif.preview || p.gif.url)}" alt="" loading="lazy">` : ''}
            <div class="fm-cap"><b>${esc(p.post.title || plainSnippet(p.content).slice(0, 60))}</b><span>${avatar(u, 18)} ${esc(nameIn(u))} · 💬 ${p.replies}</span></div></button>`;
        }).join('')}</div>`;
  el.innerHTML = head + body;
  el.scrollTop = keepScroll;
  const search = $('.fm-search', el);
  search.addEventListener('input', () => { forum.q = search.value; const at = search.selectionStart; renderForum(); const s = $('.fm-search', el); s.focus(); s.setSelectionRange(at, at); });
  $('.fm-sort', el).addEventListener('change', e => { forum.sort = e.target.value; renderForum(); });
  $$('[data-fmtag]', el).forEach(b => b.addEventListener('click', () => { forum.tag = b.dataset.fmtag; renderForum(); }));
  $('[data-fm=new]', el)?.addEventListener('click', () => openNewPost(chId));
  $('[data-fm=settings]', el)?.addEventListener('click', () => openForumSettings(chId));
  $$('[data-post]', el).forEach(b => b.addEventListener('click', () => {
    const p = d.posts.find(x => x.id === b.dataset.post);
    if (p?.thread) openThread(p.thread.id);
  }));
  $$('.fm-post', el).forEach(b => b.addEventListener('contextmenu', e => {
    const p = d.posts.find(x => x.id === b.dataset.post);
    if (!p) return;
    e.preventDefault(); e.stopPropagation();
    const mine = p.authorId === state.me.id, mod = hasPerm(sv, 'manage_messages');
    const items = [{ label: 'Open', run: () => openThread(p.thread.id) }];
    if (mine || mod) items.push({ label: 'Edit title & tags', run: () => openEditPost(chId, p) });
    if (mine || mod) items.push({ label: 'Delete Post', danger: true, run: () => confirmDialog('Delete this post?', 'It and all its replies are deleted for everyone.', 'Delete', async () => { try { await api('DELETE', `/api/channels/${chId}/messages/${p.id}`); loadForum(chId, true); } catch (err) { toast(err.message, true); } }) });
    openMenu(atPoint(e), items);
  }));
}
// While a forum or media channel is open, its page replaces the chat and the message box.
const _renderMessagesF28 = renderMessages;
renderMessages = function (...a) {
  if (forumHere()) return renderForum();
  $('#messages')?.classList.remove('forum-view');
  return _renderMessagesF28(...a);
};
const _renderComposerF28 = renderComposer;
renderComposer = function (...a) {
  const el = $('#composer'), lay = forumHere();
  if (el && lay) { const rel = 'forum:' + state.view.channelId; if (el.dataset.rel !== rel) { el.dataset.rel = rel; el.innerHTML = ''; } return; }
  return _renderComposerF28(...a);
};
const _openChannel28 = openChannel;
openChannel = async function (serverId, channelId, opts = {}) {
  const lay = chLayout(state.servers.find(s => s.id === serverId), channelId);
  if (lay) { forum.q = ''; forum.tag = ''; delete forum.data[channelId]; }
  const r = await _openChannel28(serverId, channelId, opts);
  if (lay && state.view.channelId === channelId) { renderComposer(); renderForum(); }
  return r;
};
function postDialog({ title, chId, lay, tags, values = {}, files = true, onSubmit }) {
  // Staff-only tags (Planned, Declined…) only show for people who can set them.
  if (!d0(chId)?.canTagStaff) tags = tags.filter(t => !t.mod);
  const ov = openLayer(`<form class="dialog modal fm-dialog"><h3>${title}</h3>
    <label class="field">${lay === 'forum' ? 'Title' : 'Title (optional)'}<input name="title" maxlength="100" value="${esc(values.title || '')}"${lay === 'forum' ? ' required' : ''} placeholder="${lay === 'forum' ? 'What is it about?' : 'Give it a name'}"></label>
    ${values.content === undefined ? `<label class="field">${lay === 'forum' ? 'Message' : 'Caption'}<textarea name="content" rows="${d0(chId)?.postTemplate ? 7 : 4}" maxlength="${limits().message}" placeholder="${lay === 'forum' ? 'Add the details…' : 'Say something about it (optional)'}"${lay === 'forum' ? ' required' : ''}>${esc(d0(chId)?.postTemplate || '')}</textarea></label>` : ''}
    ${tags.length ? `<div class="field">Tags<div class="fm-pick">${tags.map(t => `<label class="chip-check${t.mod ? ' mod' : ''}"${t.mod ? ' title="Staff-only tag"' : ''}><input type="checkbox" name="tags" value="${esc(t.id)}"${(values.tags || []).includes(t.id) ? ' checked' : ''}><span>${t.mod ? '🛡️ ' : ''}${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}</span></label>`).join('')}</div></div>` : ''}
    ${files ? `<div class="field">${lay === 'media' ? 'Picture or video' : 'Files (optional)'}<div class="fm-files"></div><button type="button" class="btn btn-grey btn-sm" data-a="file">${lay === 'media' ? '🖼️ Choose a picture or video' : '📎 Attach files'}</button><input type="file" class="hidden" multiple${lay === 'media' ? ' accept="image/*,video/*"' : ''}></div>` : ''}
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="ok">${values.title !== undefined && values.content !== undefined ? 'Save' : lay === 'forum' ? 'Post' : 'Share'}</button></div></form>`);
  const f = $('form', ov), ups = [];
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  const drawFiles = () => { const box = $('.fm-files', ov); if (box) box.innerHTML = ups.map((u, i) => `<span class="fm-file${u.error ? ' err' : u.id ? '' : ' busy'}">${u.preview ? (u.kind === 'video' ? '🎬' : `<img src="${u.preview}" alt="">`) : '📄'}<span>${esc(u.name)}</span><small>${u.error ? 'Failed' : u.id ? fmtSize(u.size) : 'Uploading…'}</small><button type="button" data-rm="${i}">✕</button></span>`).join(''); $$('[data-rm]', ov).forEach(b => b.addEventListener('click', () => { ups.splice(Number(b.dataset.rm), 1); drawFiles(); })); };
  $('[data-a=file]', ov)?.addEventListener('click', () => $('input[type=file]', ov).click());
  $('input[type=file]', ov)?.addEventListener('change', e => {
    for (const file of [...e.target.files]) {
      if (ups.length >= limits().files) { toast(`You can attach up to ${limits().files} files.`, true); break; }
      if (file.size > limits().upload) { toast(`${file.name} is too big (up to ${mb(limits().upload)}).`, true); continue; }
      const u = { name: file.name, size: file.size, kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file' };
      if (u.kind === 'image') u.preview = URL.createObjectURL(file);
      ups.push(u);
      uploadFile(file).then(a => Object.assign(u, a)).catch(err => { u.error = err.message; toast(err.message, true); }).finally(drawFiles);
    }
    e.target.value = ''; drawFiles();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (ups.some(u => !u.id && !u.error)) return toast('Wait for your files to finish uploading.', true);
    const picked = $$('input[name=tags]:checked', f).map(x => x.value);
    if (d0(chId)?.requireTag && tags.some(t => !t.mod) && !picked.length) return toast('Pick at least one tag.', true);
    const tpl = d0(chId)?.postTemplate;
    if (tpl && f.content && f.content.value.trim() === tpl.trim()) return toast('Fill in the template first.', true);
    const btn = $('[data-a=ok]', f); btn.disabled = true;
    try { await onSubmit({ title: f.title.value.trim(), content: f.content?.value.trim() ?? '', tags: picked, attachmentIds: ups.filter(u => u.id).map(u => u.id) }); closeLayer(); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
  f.title.focus();
}
const d0 = chId => forum.data[chId];
function openNewPost(chId) {
  const lay = forumHere(), d = d0(chId);
  postDialog({ title: lay === 'forum' ? '📝 New post' : '🖼️ Share a picture or video', chId, lay, tags: d?.tags || [], onSubmit: async v => {
    if (lay === 'media' && !v.attachmentIds.length) throw new Error('Choose a picture or video to share.');
    const { message } = await api('POST', `/api/channels/${chId}/messages`, { content: v.content, post: { title: v.title, tags: v.tags }, ...(v.attachmentIds.length ? { attachmentIds: v.attachmentIds } : {}) });
    await loadForum(chId, true);
    if (lay === 'forum' && message?.thread) openThread(message.thread.id);
  } });
}
function openEditPost(chId, p) {
  const lay = forumHere(), d = d0(chId);
  postDialog({ title: 'Edit post', chId, lay, tags: d?.tags || [], values: { title: p.post.title, tags: p.post.tags || [], content: p.content }, files: false, onSubmit: async v => {
    await api('PATCH', `/api/channels/${chId}/posts/${p.id}`, { title: v.title, tags: v.tags });
    await loadForum(chId, true);
  } });
}
function openForumSettings(chId) {
  const d = d0(chId);
  let tags = (d?.tags || []).map(t => ({ ...t }));
  const ov = openLayer(`<form class="dialog modal fm-dialog"><h3>⚙ Tags & guidelines</h3>
    <div class="field">Tags <span class="muted small">(up to 20)</span><div class="fm-taghelp">People pick tags for their posts. Tags with a lit 🛡️ are staff-only: only moderators can put them on a post (good for statuses like Planned or Declined). Click a tag's 🛡️ to switch it.</div><div class="fm-tagedit"></div><div class="fm-addtag"><input class="fm-tagemoji" maxlength="8" placeholder="🙂"><input class="fm-tagname" maxlength="20" placeholder="New tag, e.g. Question"><label class="fm-modchk" title="Staff-only"><input type="checkbox" class="fm-tagmod"> 🛡️</label><button type="button" class="btn btn-grey btn-sm" data-a="add">Add</button></div></div>
    <label class="setting-row"><div><div class="setting-title">Posts need a tag</div><div class="setting-desc">Everyone has to pick at least one tag for a new post.</div></div><input type="checkbox" class="switch" name="requireTag"${d?.requireTag ? ' checked' : ''}></label>
    <label class="setting-row"><div><div class="setting-title">👍 Voting</div><div class="setting-desc">Every post gets 👍 / 👎 buttons, and posts can be sorted by Most upvoted.</div></div><input type="checkbox" class="switch" name="voting"${d?.voting ? ' checked' : ''}></label>
    <label class="field">Guidelines <span class="muted small">(shown at the top)</span><textarea name="guidelines" rows="5" maxlength="1500" placeholder="Search before posting, one question per post…">${esc(d?.guidelines || '')}</textarea></label>
    <label class="field">Post template <span class="muted small">(what a new post's message starts with; leave empty for none)</span><textarea name="postTemplate" rows="4" maxlength="1000" placeholder="What's the idea?&#10;Why would it help?">${esc(d?.postTemplate || '')}</textarea></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const draw = () => {
    $('.fm-tagedit', ov).innerHTML = tags.length ? tags.map((t, i) => `<span class="fm-tag${t.mod ? ' mod' : ''}"><button type="button" class="fm-shield${t.mod ? ' on' : ''}" data-mod="${i}" title="${t.mod ? 'Staff-only (click to let everyone use it)' : 'Everyone can use it (click to make it staff-only)'}">🛡️</button>${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}<button type="button" data-del="${i}" title="Remove">✕</button></span>`).join('') : '<span class="muted small">No tags yet.</span>';
    $$('[data-del]', ov).forEach(b => b.addEventListener('click', () => { tags.splice(Number(b.dataset.del), 1); draw(); }));
    $$('[data-mod]', ov).forEach(b => b.addEventListener('click', () => { const t = tags[Number(b.dataset.mod)]; t.mod = !t.mod; draw(); }));
  };
  draw();
  const add = () => { const name = $('.fm-tagname', ov).value.trim(); if (!name) return; if (tags.length >= 20) return toast('Up to 20 tags.', true); tags.push({ name, emoji: $('.fm-tagemoji', ov).value.trim(), mod: $('.fm-tagmod', ov).checked }); $('.fm-tagname', ov).value = ''; $('.fm-tagemoji', ov).value = ''; $('.fm-tagmod', ov).checked = false; draw(); $('.fm-tagname', ov).focus(); };
  $('[data-a=add]', ov).addEventListener('click', add);
  $('.fm-tagname', ov).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('form', ov).addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PATCH', `/api/channels/${chId}/forum`, { tags, requireTag: e.target.requireTag.checked, guidelines: e.target.guidelines.value, postTemplate: e.target.postTemplate.value, voting: e.target.voting.checked }); closeLayer(); loadForum(chId, true); toast('Saved'); }
    catch (err) { toast(err.message, true); }
  });
}
// A media post's picture or video shows at the top of its thread, with the files of a forum post.
const _drawThread28 = drawThread;
drawThread = function (...a) {
  const r = _drawThread28(...a);
  const parent = threadView?.parent, box = $('#thread-panel .tp-parent');
  if (box && parent && (parent.attachments?.length || parent.gif) && !$('.msg-media, .att-grid', box)) {
    if (parent.post?.title) box.insertAdjacentHTML('afterbegin', `<b class="tp-ptitle">${esc(parent.post.title)}</b>`);
    box.insertAdjacentHTML('beforeend', `<div class="tp-media">${mediaHtml(parent)}</div>`);
    $$('[data-full]', box).forEach(img => img.addEventListener('click', () => openLightbox(img.dataset.full, img.dataset.name)));
  } else if (box && parent?.post?.title && !$('.tp-ptitle', box)) box.insertAdjacentHTML('afterbegin', `<b class="tp-ptitle">${esc(parent.post.title)}</b>`);
  return r;
};

// ======================= Watch Together: videos sent in chat =======================
// ▶ in a call › Watch a video together: pick a video someone sent (or upload one from your
// device) and it plays in sync for everyone in the call. Free for everyone.
let party = null, partyRoom = null, partyTimer = null;
window.watchUploadedEntry = () => ({ label: '🎞️ Watch a video together', desc: 'A video sent in chat, or one from your device', run: openPartyPicker });
function videosNearby() {
  const out = [], seen = new Set();
  const convs = [activeConv()];
  const r = Calls.room || '';
  if (r.startsWith('vc:')) convs.push('ch:' + r.slice(3));
  else if (r.startsWith('g:')) convs.push(r);
  else if (r.startsWith('dm:')) convs.push(r.slice(3).split(':').find(id => id !== state.me.id));
  for (const conv of convs.filter(Boolean)) for (const m of [...(state.convos[conv]?.messages || [])].reverse()) for (const a of m.attachments || []) {
    if (a.kind !== 'video' || seen.has(a.id)) continue;
    seen.add(a.id); out.push({ ...a, by: m.authorId, at: m.createdAt });
  }
  return out.slice(0, 30);
}
function openPartyPicker() {
  if (!Calls.room) return toast('Join a call first.', true);
  const vids = videosNearby();
  const ov = openLayer(`<div class="dialog modal pt-pick"><h3>🎞️ Watch a video together</h3>
    <p class="muted small" style="margin:0 0 10px">Everyone in your call watches it in sync. Only people in the call can see it, and only while it plays.</p>
    <div class="pt-list">${vids.length ? vids.map(v => `<button class="pt-vid" data-vid="${esc(v.id)}"><video src="${esc(v.url)}#t=0.5" muted preload="metadata"></video><div><b>${esc(v.name)}</b><span class="muted small">${esc(user(v.by)?.displayName || 'Someone')} · ${esc(fmtTime(v.at))}</span></div></button>`).join('') : '<div class="fm-empty">No videos in this chat yet.</div>'}</div>
    <div class="actions"><button class="btn btn-grey" data-a="up">📁 Upload from your device</button><input type="file" class="hidden" accept="video/mp4,video/webm,video/quicktime"><button class="btn btn-link" data-a="cancel">Cancel</button></div></div>`);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $$('[data-vid]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); startParty(b.dataset.vid); }));
  $('[data-a=up]', ov).addEventListener('click', () => $('input[type=file]', ov).click());
  $('input[type=file]', ov).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > limits().upload) return toast(`Videos can be up to ${mb(limits().upload)}.`, true);
    const btn = $('[data-a=up]', ov); btn.disabled = true; btn.textContent = 'Uploading…';
    try { const a = await uploadFile(file); if (a.kind !== 'video') throw new Error('That file isn\'t a video Zuno can play (try MP4 or WebM).'); closeLayer(); startParty(a.id); }
    catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = '📁 Upload from your device'; }
  });
}
async function startParty(attachmentId) {
  try { const { party: p } = await api('POST', '/api/party/start', { room: Calls.room, attachmentId }); onParty({ room: Calls.room, party: p }); }
  catch (e) { toast(e.message, true); }
}
const partyPos = p => (!p ? 0 : p.position + (p.playing ? ((p.now - p.updatedAt) + (Date.now() - p.receivedAt)) / 1000 : 0));
async function partyControl(action, extra = {}) {
  try { const { party: p } = await api('POST', '/api/party/control', { room: partyRoom, action, ...extra }); onParty({ room: partyRoom, party: p }); }
  catch (e) { toast(e.message, true); }
}
function onParty({ room, party: p }) {
  if (room !== Calls.room) return;
  const was = party;
  if (p) p.receivedAt = Date.now();
  party = p; partyRoom = room;
  if (!p) { $('#party-panel')?.remove(); clearInterval(partyTimer); if (was) toast('The video ended.'); layoutPanels(); return; }
  if (!was && p.hostId !== state.me.id) toast(`${user(p.hostId)?.displayName || 'Someone'} started a video for the call 🎞️`);
  showParty();
}
live28('party', onParty);
setInterval(() => { if (party && partyRoom !== Calls.room) { party = null; $('#party-panel')?.remove(); layoutPanels(); } }, 1500);
const fmtSec = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function showParty() {
  let panel = $('#party-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'party-panel'; panel.className = 'activity-panel ap-watch party-panel';
    panel.innerHTML = `<div class="ap-head"><b class="ap-title">🎞️ <span class="pt-name"></span></b><button class="icon-btn" data-pt="min" title="Make smaller">▁</button><button class="icon-btn" data-pt="stop" title="End for everyone">✕</button></div>
      <div class="ap-stage pt-stage"><video class="pt-video" playsinline preload="auto"></video><button class="pt-join hidden">▶ Click to watch with sound</button></div>
      <div class="pt-bar"><button class="icon-btn pt-play" title="Play / Pause">▶</button><span class="pt-time">0:00</span><input type="range" class="pt-seek" min="0" max="1000" value="0"><span class="pt-dur">0:00</span><button class="icon-btn pt-full" title="Full screen">⤢</button></div>`;
    document.body.appendChild(panel);
    const v = $('.pt-video', panel);
    $('[data-pt=min]', panel).addEventListener('click', () => { panel.classList.toggle('min'); layoutPanels(); });
    $('[data-pt=stop]', panel).addEventListener('click', () => confirmDialog('Stop the video?', 'It stops for everyone in the call.', 'Stop', async () => { try { await api('POST', '/api/party/stop', { room: partyRoom }); } catch (e) { toast(e.message, true); } }));
    $('.pt-play', panel).addEventListener('click', () => partyControl(party?.playing ? 'pause' : 'play'));
    v.addEventListener('click', () => partyControl(party?.playing ? 'pause' : 'play'));
    const seek = $('.pt-seek', panel);
    seek.addEventListener('change', () => { if (v.duration) partyControl('seek', { position: seek.value / 1000 * v.duration }); });
    v.addEventListener('ended', () => { if (party?.playing) partyControl('ended'); });
    v.addEventListener('loadedmetadata', () => syncParty(true));
    $('.pt-full', panel).addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : $('.pt-stage', panel).requestFullscreen?.()));
    $('.pt-join', panel).addEventListener('click', e => { e.currentTarget.classList.add('hidden'); v.muted = false; v.play().catch(() => {}); });
  }
  const v = $('.pt-video', panel);
  $('.pt-name', panel).textContent = party.name;
  if (v.dataset.att !== party.attachmentId) { v.dataset.att = party.attachmentId; v.src = party.url; }
  clearInterval(partyTimer);
  partyTimer = setInterval(() => syncParty(false), 1000);
  syncParty(true);
  layoutPanels();
}
function syncParty(hard) {
  const panel = $('#party-panel'), v = panel && $('.pt-video', panel);
  if (!v || !party) return;
  const want = partyPos(party);
  if (v.readyState >= 1 && (hard || Math.abs(v.currentTime - want) > 1.2) && (!v.duration || want < v.duration)) { try { v.currentTime = want; } catch {} }
  if (party.playing && v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); $('.pt-join', panel).classList.remove('hidden'); });
  if (!party.playing && !v.paused) v.pause();
  $('.pt-play', panel).textContent = party.playing ? '⏸' : '▶';
  $('.pt-time', panel).textContent = fmtSec(v.currentTime);
  $('.pt-dur', panel).textContent = fmtSec(v.duration);
  if (v.duration && document.activeElement !== $('.pt-seek', panel)) $('.pt-seek', panel).value = Math.round(v.currentTime / v.duration * 1000);
}
// Listen/Watch Together, a video and a game can all be open: they sit side by side.
function layoutPanels() {
  const order = ['#activity-panel', '#party-panel', '#game-panel'].map(s => $(s)).filter(Boolean);
  let right = 16;
  for (const p of order) {
    p.classList.remove('gp-beside');
    p.style.right = innerWidth > 760 ? right + 'px' : '';
    if (innerWidth > 760) right += p.getBoundingClientRect().width + 12;
  }
}
placeGamePanel = layoutPanels;
addEventListener('resize', layoutPanels);
new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.id === 'activity-panel' || n.id === 'game-panel' || n.id === 'party-panel'))) layoutPanels(); }).observe(document.body, { childList: true });

// ======================= server tags =======================
// A server's short tag (like ZNO) that members can wear next to their name everywhere.
// Its emoji can be a normal one or one of the server's own custom emoji (0.30).
function tagEmojiHtml(t) {
  if (t?.emojiId && /^[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)$/i.test(t.emojiId)) return `<img class="st-cemoji" src="/uploads/${esc(t.emojiId)}" alt="" draggable="false">`;
  return t?.emoji ? `<i>${esc(t.emoji)}</i>` : '';
}
const _officialTag28 = officialTag;
officialTag = function (u) {
  const t = u?.serverTag;
  const tag = t && t.text ? `<span class="srv-tag" data-tagsv="${esc(t.serverId || '')}" role="button" tabindex="0" title="${esc(t.server || 'Server')} tag: click to see the server"${safeColor(t.color) ? ` style="--tc:${esc(t.color)}"` : ''}>${tagEmojiHtml(t)}${esc(t.text)}</span>` : '';
  return _officialTag28(u) + tag;
};
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'appearance') + 1, 0, { group: 'Server', key: 'svtag', label: 'Server Tag', need: 'manage_server', words: 'tag clan badge short name letters wear' });
const _showServerSection28 = showServerSection;
showServerSection = async function (section, openCh) {
  if (section !== 'svtag') return _showServerSection28(section, openCh);
  const sv = svById(svSettings?.id), body = $('#ss-body');
  if (!sv || !body) return;
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  const t = sv.tag || {};
  body.innerHTML = `<div data-keep><h2>Server Tag</h2>
    <p class="muted">A short tag (2 to 4 letters or numbers) your members can wear next to their name all over Zuno, like a team badge. They choose it from the server menu.</p>
    <div class="setting-group"><div class="st-prev">${avatar(state.me, 32)}<b>${esc(state.me.displayName)}</b><span class="srv-tag" id="st-demo"></span></div>
      <div class="st-row"><label class="field">Tag<input id="st-text" maxlength="4" value="${esc(t.text || '')}" placeholder="ZNO" style="text-transform:uppercase"></label>
      <label class="field">Emoji (optional)<input id="st-emoji" maxlength="8" value="${esc(t.emoji || '')}" placeholder="⚡"></label>
      <input type="hidden" id="st-eid" value="${esc(t.emojiId || '')}">
      <label class="field">Color<input type="color" class="color-input" id="st-color" value="${esc(t.color || '#04c5ae')}"></label></div>
      ${(sv.emojis || []).length ? `<div class="field">Or use one of this server's emoji<div class="st-cem">${sv.emojis.map(e => `<button type="button" class="st-cem-b${t.emojiId === e.id ? ' on' : ''}" data-eid="${esc(e.id)}" title=":${esc(e.name)}:"><img src="/uploads/${esc(e.id)}" alt=":${esc(e.name)}:"></button>`).join('')}</div></div>` : ''}
      <div class="row-btns"><button class="btn btn-primary btn-sm" id="st-save">Save Tag</button>${sv.tag ? '<button class="btn btn-link btn-sm" id="st-rm">Remove tag</button>' : ''}</div></div></div>`;
  const demo = () => { const d = $('#st-demo', body); const txt = $('#st-text', body).value.toUpperCase(); d.innerHTML = `${tagEmojiHtml({ emojiId: $('#st-eid', body).value, emoji: $('#st-emoji', body).value })}${esc(txt || 'TAG')}`; d.style.setProperty('--tc', $('#st-color', body).value); };
  $$('[data-eid]', body).forEach(b => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    $$('[data-eid]', body).forEach(x => x.classList.remove('on'));
    b.classList.toggle('on', on);
    $('#st-eid', body).value = on ? b.dataset.eid : '';
    if (on) $('#st-emoji', body).value = '';
    demo();
  }));
  $('#st-emoji', body).addEventListener('input', () => { if ($('#st-emoji', body).value) { $('#st-eid', body).value = ''; $$('[data-eid]', body).forEach(x => x.classList.remove('on')); } });
  demo();
  for (const id of ['#st-text', '#st-emoji', '#st-color']) $(id, body).addEventListener('input', demo);
  const save = async text => {
    try { await api('PATCH', `/api/servers/${sv.id}/tag`, text === null ? { text: null } : { text, emoji: $('#st-emoji', body).value.trim(), emojiId: $('#st-eid', body).value || null, color: $('#st-color', body).value }); toast(text === null ? 'Tag removed' : 'Tag saved'); await refresh({ serverId: sv.id }); showServerSection('svtag'); }
    catch (e) { toast(e.message, true); }
  };
  $('#st-save', body).addEventListener('click', () => save($('#st-text', body).value.trim().toUpperCase()));
  $('#st-rm', body)?.addEventListener('click', () => save(null));
};
async function wearTag(serverId) {
  try { const { me } = await api('PATCH', '/api/me/server-tag', { serverId }); state.me = { ...state.me, ...me }; renderUserPanel(); toast(serverId ? 'You\'re wearing this server\'s tag ✨' : 'Tag taken off'); }
  catch (e) { toast(e.message, true); }
}
const _openServerMenu28 = openServerMenu;
openServerMenu = function (anchor, sv = currentServer()) {
  _openServerMenu28(anchor, sv);
  if (!sv?.tag) return;
  const wearing = state.me?.serverTag?.serverId === sv.id;
  addMenuItem({ label: wearing ? `Take Off the ${sv.tag.text} Tag` : `Wear the ${sv.tag.text} Tag`, icon: ico('🏷️'), run: () => wearTag(wearing ? null : sv.id) }, { top: true });
};

// ======================= profile visitors & comments =======================
const _openProfile28 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile28(id, ...rest);
  const u = user(id);
  if (!u || u.system || u.bot) return r;
  if (id !== state.me.id) api('POST', `/api/users/${id}/visit`).catch(() => {});
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  if (!modal || !modal.querySelector('.pcard') || $('.pcm-side', modal)) return r;
  // Comments sit in their own panel to the right of the profile (below it on a phone).
  const side = document.createElement('aside');
  side.className = 'pcm-side';
  side.innerHTML = '<div class="pcm-in"><div class="pcm-head"><b>Comments</b></div><div class="pcm-list"><div class="pcm-empty muted small">Loading…</div></div></div>';
  modal.classList.add('has-pcm');
  modal.appendChild(side);
  drawComments(side, id);
  return r;
};
async function drawComments(side, id) {
  let d;
  const self = id === state.me.id;
  const gone = () => { const m = side.closest('.modal'); m?.classList.remove('has-pcm'); m?.dispatchEvent(new CustomEvent('pcm-gone')); side.remove(); };
  try { d = await api('GET', `/api/users/${id}/comments`); } catch { return gone(); }
  if (!side.isConnected) return;
  if (d.mode === 'off' && !d.comments.length && !self) return gone();
  for (const a of d.authors) state.users[a.id] = { ...state.users[a.id], ...a };
  const who = user(id);
  const row = c => {
    const a = user(c.authorId) || { id: c.authorId, displayName: 'Someone' };
    return `<div class="pcm-c">
      <span class="pcm-av" data-cprof="${esc(a.id)}">${avatar(a, 32)}</span>
      <div class="pcm-bub"><div class="pcm-meta"><b data-cprof="${esc(a.id)}">${esc(a.displayName)}</b>${a.id === id ? '<span class="pcm-own">Owner</span>' : ''}<span class="muted small">${esc(fmtTime(c.at))}</span></div><div class="pcm-t">${esc(c.text)}</div></div>
      ${c.authorId === state.me.id || d.canModerate ? `<button class="icon-btn pcm-del" data-cdel="${esc(c.id)}" title="Delete comment" aria-label="Delete comment">${ICON.trash}</button>` : ''}</div>`;
  };
  const composer = d.canComment
    ? `<form class="pcm-form"><textarea rows="2" maxlength="300" placeholder="${self ? 'Write something on your profile…' : `Leave a comment for ${esc(who?.displayName || 'them')}…`}"></textarea>
        <div class="pcm-bar"><span class="muted small pcm-left">300</span><button class="btn btn-primary btn-sm" disabled>Post</button></div></form>`
    : `<div class="pcm-note">${d.mode === 'off' ? (self ? 'Comments are off. Turn them on in Settings › Privacy & Safety.' : 'Comments are turned off.') : d.mode === 'friends' ? `🔒 Only ${esc(who?.displayName || 'their')}'s friends can comment.` : "You can't comment here."}</div>`;
  side.innerHTML = `<div class="pcm-in">
    <div class="pcm-head"><b>Comments</b><span class="pcm-n">${d.comments.length}</span>${self && state.profileSocial?.visitors ? '<button class="btn btn-grey btn-sm pcm-visitors" data-visitors>👀 Visitors</button>' : ''}</div>
    <div class="pcm-list">${d.comments.length ? d.comments.map(row).join('') : `<div class="pcm-empty"><span>💬</span><b>No comments yet</b><span class="muted small">${d.canComment ? (self ? 'Pin a note for your visitors.' : 'Be the first to say something!') : ''}</span></div>`}</div>
    ${composer}</div>`;
  side.dispatchEvent(new CustomEvent('pcm-count', { detail: d.comments.length, bubbles: true }));
  $$('[data-cprof]', side).forEach(n => n.addEventListener('click', () => { closeLayer(); openProfile(n.dataset.cprof); }));
  $('[data-visitors]', side)?.addEventListener('click', openVisitors);
  $$('[data-cdel]', side).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('DELETE', `/api/users/${id}/comments/${b.dataset.cdel}`); drawComments(side, id); } catch (e) { b.disabled = false; toast(e.message, true); }
  }));
  const f = $('.pcm-form', side);
  if (!f) return;
  const ta = $('textarea', f), btn = $('button', f), left = $('.pcm-left', f);
  const sync = () => { left.textContent = 300 - ta.value.length; btn.disabled = !ta.value.trim(); };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!ta.value.trim() || btn.disabled) return;
    btn.disabled = true;
    try { await api('POST', `/api/users/${id}/comments`, { text: ta.value.trim() }); await drawComments(side, id); $('.pcm-list', side)?.scrollTo(0, 0); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}
live28('profile-comment', d => toast(`💬 ${d.from?.displayName || 'Someone'} commented on your profile: ${d.text}`));
async function openVisitors() {
  let d;
  try { d = await api('GET', '/api/me/profile-social'); } catch (e) { return toast(e.message, true); }
  const ov = openLayer(`<div class="dialog modal"><h3>👀 Profile visitors</h3><p class="muted small" style="margin:0 0 10px">The last 30 days. People only show up here if they've turned on profile visitors too${d.anonymous ? `; ${d.anonymous} other visit${d.anonymous === 1 ? '' : 's'} came from people who haven't` : ''}.</p>
    <div class="pt-list">${d.visitors.length ? d.visitors.map(v => `<button class="vis-row" data-vis="${esc(v.user.id)}">${avatar(v.user, 32)}<div><b>${esc(v.user.displayName)}</b><span class="muted small">${esc(fmtTime(v.at))}</span></div></button>`).join('') : '<div class="fm-empty">No visitors yet.</div>'}</div>
    <div class="actions"><button class="btn btn-primary" data-a="ok">Done</button></div></div>`);
  for (const v of d.visitors) state.users[v.user.id] = { ...state.users[v.user.id], ...v.user };
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  $$('[data-vis]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); openProfile(b.dataset.vis); }));
}

// ======================= Settings › Privacy & Safety additions =======================
const _renderPrivacy28 = renderPrivacy;
renderPrivacy = async function (body, ...a) {
  const r = await _renderPrivacy28(body, ...a);
  if (!body || $('#ps28', body)) return r;
  const s = state.profileSocial || { visitors: false, comments: 'friends' };
  const g = document.createElement('div');
  g.id = 'ps28';
  g.innerHTML = `<div class="setting-group"><h4 class="setting-head">Your profile</h4>
      <label class="setting-row"><div><div class="setting-title">Show who visited my profile</div><div class="setting-desc">See who opened your profile in the last 30 days. It works both ways: you'll only show up on other people's lists while this is on.</div></div><input type="checkbox" class="switch" id="ps-vis"${s.visitors ? ' checked' : ''}></label>
      <div class="setting-row"><div><div class="setting-title">Who can comment on my profile</div><div class="setting-desc">You can always delete comments on your profile.</div></div><select class="sc-select" id="ps-com"><option value="friends"${s.comments === 'friends' ? ' selected' : ''}>Friends</option><option value="everyone"${s.comments === 'everyone' ? ' selected' : ''}>Everyone</option><option value="off"${s.comments === 'off' ? ' selected' : ''}>Nobody (off)</option></select></div></div>
    <div class="setting-group"><h4 class="setting-head">Your data</h4>
      <div class="setting-row"><div><div class="setting-title">Download my data</div><div class="setting-desc">Everything Zuno keeps about you in one file: your account, profile, friends, servers, messages and the files you sent. Passwords and login codes are never included.</div></div><button class="btn btn-grey btn-sm" id="ps-export">Download</button></div></div>`;
  body.appendChild(g);
  const save = async change => { try { const { social } = await api('PATCH', '/api/me/profile-social', change); state.profileSocial = social; toast('Saved'); } catch (e) { toast(e.message, true); } };
  $('#ps-vis', g).addEventListener('change', e => save({ visitors: e.target.checked }));
  $('#ps-com', g).addEventListener('change', e => save({ comments: e.target.value }));
  $('#ps-export', g).addEventListener('click', downloadMyData);
  return r;
};
async function downloadMyData(e) {
  const btn = e?.currentTarget;
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
  try {
    const res = await fetch('/api/me/export', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Your data couldn't be prepared. Try again in a moment.");
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'zuno-data.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10e3);
    toast('Your data is downloading 📦');
  } catch (err) { toast(err.message, true); }
  if (btn) { btn.disabled = false; btn.textContent = 'Download'; }
}

// ======================= mark a picture as a spoiler after sending =======================
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('#messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), m = state.convos[conv]?.messages.find(x => x.id === row.dataset.id);
  if (!m || m.pending || m.authorId !== state.me.id) return;
  const pics = (m.attachments || []).filter(a => a.kind === 'image' || a.kind === 'video');
  if (!pics.length) return;
  const all = pics.every(a => a.spoiler);
  addMenuItem({ label: all ? 'Remove Spoiler' : (pics.length > 1 ? 'Mark Pictures as Spoilers' : 'Mark as Spoiler'), icon: ico('🙈'), run: async () => {
    try { for (const a of pics) await api('PATCH', `${convBase(conv)}/messages/${m.id}/attachments/${a.id}`, { spoiler: !all }); toast(all ? 'Spoiler removed' : 'Marked as spoiler 🙈'); }
    catch (err) { toast(err.message, true); }
  } });
});

// ======================= phone notifications =======================
// Settings › Notifications › Phone & desktop notifications. On iPhone, add Zuno to your Home Screen
// first (Share › Add to Home Screen) and turn it on from there.
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !window.zunoDesktop;
const b64ToBytes = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function pushSub() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; } }
async function enablePush() {
  if (!pushSupported()) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone, add Zuno to your Home Screen first (Share › Add to Home Screen), then open it from there.' : "This browser can't get notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked for Zuno. Allow them in your browser settings, then try again.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  const r = await api('POST', '/api/push/subscribe', sub.toJSON());
  state.pushDevices = r.devices;
}
async function disablePush() {
  const sub = await pushSub();
  if (sub) { try { await api('DELETE', '/api/push/subscribe', { endpoint: sub.endpoint }); } catch {} await sub.unsubscribe().catch(() => {}); }
}
// Tell the server whether you're looking at Zuno right now (no phone notifications while you are).
let lastPresence = null;
function reportPresence() {
  if (!state.me) return;
  const visible = document.visibilityState === 'visible' && document.hasFocus();
  if (visible === lastPresence && !visible) return;
  lastPresence = visible;
  api('POST', '/api/push/presence', { visible }).catch(() => {});
}
for (const ev of ['visibilitychange', 'focus', 'blur']) addEventListener(ev, () => setTimeout(reportPresence, 50));
setInterval(() => { if (document.visibilityState === 'visible' && document.hasFocus()) { lastPresence = null; reportPresence(); } }, 60e3);
// Tapping a notification opens that chat.
function openFromNotification(open) {
  if (!open || !state.me) return;
  if (open === 'friends') return showFriends('pending');
  if (open.startsWith('ch:')) { const sv = state.servers.find(x => x.channels.some(c => c.id === open.slice(3))); if (sv) openChannel(sv.id, open.slice(3)); return; }
  if (open.startsWith('g:')) return openGroup(open.slice(2));
  openDM(open);
}
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'zuno-open') openFromNotification(e.data.open); });
{
  const want = new URLSearchParams(location.search).get('open');
  if (want) { const t = setInterval(() => { if (state.me && state.servers) { clearInterval(t); history.replaceState(null, '', '/'); openFromNotification(want); } }, 300); setTimeout(() => clearInterval(t), 15e3); }
}
// "Install Zuno" where the browser offers it.
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
const _renderNotifications28 = renderNotifications;
renderNotifications = function (body, ...a) {
  const r = _renderNotifications28(body, ...a);
  if (!body || $('#push28', body)) return r;
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'push28';
  body.insertBefore(g, $('.setting-group', body)?.nextSibling || null);
  const draw = async () => {
    const sub = pushSupported() ? await pushSub() : null;
    const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    g.innerHTML = `<h4 class="setting-head">Phone & desktop notifications</h4>
      <p class="setting-desc" style="margin:0 0 10px">Get DMs, mentions, replies, friend requests and calls even when Zuno is closed. Nothing is sent while you're looking at Zuno.${window.zunoDesktop ? ' (The desktop app already shows notifications while it\'s running.)' : ''}</p>
      ${!pushSupported() ? `<div class="muted small">${ios && !standalone ? 'On iPhone or iPad: tap Share › <b>Add to Home Screen</b>, open Zuno from your Home Screen, and turn this on there.' : window.zunoDesktop ? '' : "This browser can't get notifications while Zuno is closed."}</div>`
        : `<div class="row-btns">${sub ? '<button class="btn btn-grey btn-sm" id="push-test">Send a test</button><button class="btn btn-link btn-sm" id="push-off">Turn off on this device</button><span class="muted small">✅ On for this device</span>' : '<button class="btn btn-primary btn-sm" id="push-on">Turn on for this device</button>'}</div>`}
      ${installPrompt ? '<div class="row-btns" style="margin-top:10px"><button class="btn btn-grey btn-sm" id="push-install">' + uiIcon('phone') + ' Install Zuno as an app</button></div>' : ''}`;
    $('#push-on', g)?.addEventListener('click', async e => { e.currentTarget.disabled = true; try { await enablePush(); toast('Notifications are on 🔔'); } catch (err) { toast(err.message, true); } draw(); });
    $('#push-off', g)?.addEventListener('click', async () => { await disablePush(); toast('Notifications turned off on this device'); draw(); });
    $('#push-test', g)?.addEventListener('click', async () => { try { await api('POST', '/api/push/test'); toast('Sent! It should pop up in a few seconds.'); } catch (err) { toast(err.message, true); } });
    $('#push-install', g)?.addEventListener('click', async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; draw(); });
  };
  draw();
  return r;
};

// ======================= mini mode =======================
// A tiny call window that floats above your other apps: who's talking, mute, deafen, leave.
// Browsers (Chrome, Edge) open it as a picture-in-picture window; the desktop app shrinks itself
// into one (after its next update). The ⧉ button sits in the "Voice Connected" bar, or Ctrl+Shift+M.
let miniWin = null, miniTimer = null;
function miniInner() {
  const ids = Calls.participants();
  return `<div class="mini-call"><div class="mini-head"><b>${esc($('#voice-bar .vbar-info span')?.textContent || 'Call')}</b><button data-mini="back" title="Back to Zuno">⤢</button></div>
    <div class="mini-people">${ids.map(id => { const u = user(id) || { id, displayName: '…' }, st = Calls.peerState(id); return `<div class="mini-p${Calls.isSpeaking(id) ? ' speaking' : ''}">${avatar(u, 36)}<span>${esc(u.displayName)}</span>${st?.muted ? '<i>🔇</i>' : ''}${st?.screen ? '<i class="live">LIVE</i>' : ''}</div>`; }).join('')}</div>
    <div class="mini-ctl"><button data-mini="mute" class="${Calls.muted ? 'on' : ''}" title="Mute">${Calls.muted ? '🔇' : '🎙️'}</button><button data-mini="deafen" class="${Calls.deafened ? 'on' : ''}" title="Deafen">${Calls.deafened ? '🔕' : '🎧'}</button><button data-mini="leave" class="hang" title="Leave call">📞</button></div></div>`;
}
function miniAction(a) {
  if (a === 'mute') Calls.toggleMute();
  if (a === 'deafen') Calls.toggleDeafen();
  if (a === 'leave') { Calls.hangup(); closeMini(); }
  if (a === 'back') closeMini();
}
function closeMini() {
  clearInterval(miniTimer); miniTimer = null;
  if (miniWin) { try { miniWin.close(); } catch {} miniWin = null; }
  if (document.body.classList.contains('mini-mode')) { document.body.classList.remove('mini-mode'); $('#mini-call-host')?.remove(); window.zunoDesktop?.windowControl?.('mini-off'); }
}
async function openMini() {
  if (!Calls.room) return toast('Mini mode is for calls. Join one first.', true);
  if (miniWin || document.body.classList.contains('mini-mode')) return closeMini();
  let root;
  if (window.documentPictureInPicture && !window.zunoDesktop) {
    try { miniWin = await documentPictureInPicture.requestWindow({ width: 300, height: 340 }); }
    catch { return toast("Mini mode couldn't open. Try again.", true); }
    for (const l of $$('link[rel=stylesheet]')) miniWin.document.head.appendChild(l.cloneNode());
    miniWin.document.documentElement.className = document.documentElement.className;
    miniWin.document.body.className = 'mini-doc';
    root = miniWin.document.body;
    miniWin.addEventListener('pagehide', () => { miniWin = null; clearInterval(miniTimer); miniTimer = null; });
  } else if (window.zunoDesktop?.windowControl) {
    document.body.classList.add('mini-mode');
    root = document.createElement('div'); root.id = 'mini-call-host';
    document.body.appendChild(root);
    window.zunoDesktop.windowControl('mini-on');
  } else return toast('Mini mode works in Chrome, Edge and the Zuno desktop app.', true);
  root.addEventListener('click', e => { const b = e.target.closest('[data-mini]'); if (b) miniAction(b.dataset.mini); });
  let last = '';
  const draw = () => { if (!Calls.room) return closeMini(); const html = miniInner(); if (html !== last) { root.innerHTML = html; last = html; } };
  draw();
  miniTimer = setInterval(draw, 250);
}
addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); openMini(); } });
// (Checked once a second during a call, instead of watching every change on the page.)
setInterval(() => {
  if (!Calls.room) return;
  const bar = $('#voice-bar .vbar');
  if (bar && !$('[data-c="mini"]', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.dataset.c = 'mini'; b.title = 'Mini mode (Ctrl+Shift+M)'; b.textContent = '⧉';
    b.addEventListener('click', openMini);
    $('.hang', bar)?.before(b);
  }
}, 1000);

// ======================= close DMs =======================
// Right-click a DM › Close DM: it leaves your list until a new message comes in (or you open it
// again from a profile or search). Nothing is deleted.
async function closeDm(peerId) {
  try { await api('POST', '/api/me/close-dm', { peerId }); } catch (e) { return toast(e.message, true); }
  state.dms = state.dms.filter(x => x.userId !== peerId);
  if (activePeer() === peerId) showFriends('online');
  renderDMList();
}
const _openDmMenu28 = openDmMenu;
openDmMenu = function (anchor, conv) {
  const r = _openDmMenu28(anchor, conv);
  if (!isGroupConv(conv) && !user(conv)?.system) addMenuItem({ label: 'Close DM', icon: ico('✖️'), run: () => closeDm(conv) });
  return r;
};
// Opening a closed DM again (from a profile, search…) keeps it in the list.
const _openDM28 = openDM;
openDM = async function (peerId, ...a) {
  if (peerId && !state.dms.some(x => x.userId === peerId)) api('DELETE', '/api/me/close-dm', { peerId }).catch(() => {});
  return _openDM28(peerId, ...a);
};

// ======================= voice channel chat on the right =======================
// In a voice channel's chat, the call (and any stream) stays big on the left and the chat sits in
// a column on the right, so you can watch and talk at the same time. (Phones keep it stacked.)
const _openChannelV28 = openChannel;
openChannel = async function (serverId, channelId, opts = {}) {
  const r = await _openChannelV28(serverId, channelId, opts);
  $('#main')?.classList.toggle('vc-chat', !!(state.view.type === 'channel' && state.view.voice));
  return r;
};

// ======================= streams pop out =======================
// In a voice channel, someone's stream follows you in a small window while you look at other chats
// or servers. ⤢ takes you back to the voice channel; ✕ hides it until the next stream.
let popHidden = new Set(), popFor = null;
function streamPopTick() {
  const room = Calls.room || '';
  const viewingCall = (state.view.type === 'voice' || (state.view.type === 'channel' && state.view.voice)) && 'vc:' + state.view.channelId === room;
  const streamer = room.startsWith('vc:') && !viewingCall ? Calls.participants().find(id => id !== state.me.id && Calls.peerState(id)?.screen && Calls.watching(id) && Calls.remoteVideo(id) && !popHidden.has(id)) : null;
  let pop = $('#stream-pop');
  if (!streamer) { pop?.remove(); popFor = null; for (const id of [...popHidden]) if (!Calls.peerState(id)?.screen) popHidden.delete(id); return; }
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'stream-pop';
    pop.innerHTML = `<video autoplay playsinline muted></video><div class="sp-bar"><span class="sp-name"></span><button data-sp="go" title="Back to the voice channel">⤢</button><button data-sp="x" title="Hide">✕</button></div>`;
    document.body.appendChild(pop);
    pop.addEventListener('click', e => {
      const a = e.target.closest('[data-sp]')?.dataset.sp;
      if (a === 'x') { popHidden.add(popFor); pop.remove(); popFor = null; return; }
      const sv = state.servers.find(s => s.channels.some(c => 'vc:' + c.id === Calls.room));
      if (sv) openVoice(sv.id, Calls.room.slice(3));
    });
    dragPop(pop);
  }
  const v = $('video', pop), track = Calls.remoteVideo(streamer);
  if (popFor !== streamer || v.srcObject?.getVideoTracks()[0] !== track) { v.srcObject = new MediaStream([track]); popFor = streamer; v.play().catch(() => {}); }
  $('.sp-name', pop).textContent = `${user(streamer)?.displayName || 'Someone'} is live`;
}
setInterval(() => { if ((Calls.room || '').startsWith('vc:') || $('#stream-pop')) streamPopTick(); }, 800);
// Drag the pop-out anywhere by its picture.
function dragPop(el) {
  let sx, sy, ox, oy, moved;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; moved = false;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    el.style.left = Math.max(0, Math.min(innerWidth - el.offsetWidth, ox + dx)) + 'px';
    el.style.top = Math.max(0, Math.min(innerHeight - el.offsetHeight, oy + dy)) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
  });
  el.addEventListener('pointerup', e => { if (moved) e.stopPropagation(); sx = null; });
  el.addEventListener('click', e => { if (moved) { e.stopImmediatePropagation(); moved = false; } }, true);
}

// ======================= zoom into fullscreen streams =======================
// Fullscreen streams fit the whole picture on screen. Scroll (or pinch) to zoom in and out, drag
// to look around while zoomed, double-click to go back to the whole picture.
const zoomOf = new WeakMap();
const applyZoom = (v, z) => { v.style.transform = z.s > 1 ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : ''; v.style.cursor = z.s > 1 ? 'grab' : ''; };
function clampZoom(v, z) {
  const maxX = (v.clientWidth * (z.s - 1)) / 2, maxY = (v.clientHeight * (z.s - 1)) / 2;
  z.x = Math.max(-maxX, Math.min(maxX, z.x)); z.y = Math.max(-maxY, Math.min(maxY, z.y));
}
const fsVideo = () => { const f = document.fullscreenElement; return f && (f.matches('.tile') || f.closest?.('#voice-stage, #call-slot')) ? f.querySelector('video[data-vid]') : null; };
document.addEventListener('wheel', e => {
  const v = fsVideo();
  if (!v || !document.fullscreenElement.contains(e.target)) return;
  e.preventDefault();
  const z = zoomOf.get(v) || { s: 1, x: 0, y: 0 };
  const r = v.getBoundingClientRect(), cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2);
  const next = Math.max(1, Math.min(6, z.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  // Zoom toward the pointer.
  z.x = (z.x - cx) * (next / z.s) + cx; z.y = (z.y - cy) * (next / z.s) + cy; z.s = next;
  if (z.s === 1) { z.x = 0; z.y = 0; }
  clampZoom(v, z); zoomOf.set(v, z); applyZoom(v, z);
}, { passive: false });
{
  let drag = null;
  document.addEventListener('pointerdown', e => { const v = fsVideo(); const z = v && zoomOf.get(v); if (z?.s > 1 && document.fullscreenElement.contains(e.target) && !e.target.closest('button, input')) { drag = { v, z, x: e.clientX, y: e.clientY, ox: z.x, oy: z.y }; v.style.cursor = 'grabbing'; } });
  document.addEventListener('pointermove', e => { if (!drag) return; drag.z.x = drag.ox + e.clientX - drag.x; drag.z.y = drag.oy + e.clientY - drag.y; clampZoom(drag.v, drag.z); applyZoom(drag.v, drag.z); });
  document.addEventListener('pointerup', () => { if (drag) { drag.v.style.cursor = 'grab'; drag = null; } });
  document.addEventListener('dblclick', e => { const v = fsVideo(); if (v && zoomOf.get(v)?.s > 1) { e.stopPropagation(); const z = { s: 1, x: 0, y: 0 }; zoomOf.set(v, z); applyZoom(v, z); } }, true);
  document.addEventListener('fullscreenchange', () => { for (const v of $$('video[data-vid]')) { v.style.transform = ''; v.style.cursor = ''; zoomOf.delete(v); } });
}

// ======================= getting back from a bad display setting =======================
// Ctrl+Shift+0 (or Ctrl+0 twice) puts Zoom and Color saturation back to normal, from anywhere, in
// case a setting (or a controller nudging a slider) leaves Zuno hard to use.
{
  let lastCtrl0 = 0;
  const resetLook = () => { savePref({ uiScale: 100, saturation: 100 }); applyPrefs(); toast('Zoom and colors are back to normal.'); };
  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== '0' && e.code !== 'Digit0') return;
    if (e.shiftKey) { e.preventDefault(); return resetLook(); }
    const p = prefs();
    if ((p.uiScale && p.uiScale !== 100) || (p.saturation ?? 100) < 100) { if (Date.now() - lastCtrl0 < 1500) { e.preventDefault(); resetLook(); } lastCtrl0 = Date.now(); }
  });
}
// A controller's stick sends arrow keys to whatever is focused, so it could drag a slider (like
// Zoom or Color saturation) all the way while you were just trying to move around. Sliders in
// Settings now only change from the stick when you've clicked them first (only while a
// controller is plugged in; keyboard users can still use the arrow keys as normal).
const padConnected = () => { try { return [...(navigator.getGamepads?.() || [])].some(Boolean); } catch { return false; } };
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t?.type === 'range' && t.closest('.settings') && /^Arrow/.test(e.key) && !t.dataset.grabbed && padConnected()) e.preventDefault();
}, true);
document.addEventListener('pointerdown', e => { if (e.target?.type === 'range') e.target.dataset.grabbed = '1'; }, true);
document.addEventListener('focusout', e => { if (e.target?.type === 'range') delete e.target.dataset.grabbed; }, true);

// ======================= invite cards =======================
// A server invite in chat (zuno.invite/…) shows as a card: the server's banner, icon and name, how
// many people are online and in it, when it started, and a Join button. The card has a fixed size
// from the start, so loading it never moves the chat.
const inviteCache = new Map(); // code -> { at, data | error }
async function invitePreview(code) {
  const hit = inviteCache.get(code);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
  const p = api('GET', `/api/invites/${encodeURIComponent(code)}`).then(d => d.server).catch(e => ({ error: e.message }));
  inviteCache.set(code, { at: Date.now(), p });
  return p;
}
function inviteCardHtml(code, sv) {
  if (!sv) return `<div class="inv-card loading" data-inv="${esc(code)}"><div class="inv-banner"></div><div class="inv-body"><div class="inv-skel"></div></div></div>`;
  if (sv.error) return `<div class="inv-card bad" data-inv="${esc(code)}"><div class="inv-body"><b>Invite not available</b><span class="muted small">${esc(sv.error)}</span></div></div>`;
  const est = sv.createdAt ? new Date(sv.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';
  return `<div class="inv-card" data-inv="${esc(code)}">
    <div class="inv-banner"${sv.banner ? ` style="background-image:url('${esc(sv.banner)}')"` : ` style="--bc:${esc(safeColor(sv.bannerColor) || safeColor(sv.iconColor) || '#2b3a38')}"`}></div>
    <div class="inv-body"><span class="inv-icon rail-btn sv" style="--sv:${esc(sv.iconColor || '#04c5ae')}">${serverIcon(sv, 64)}</span>
      <b class="inv-name">${esc(sv.name)}${sv.official ? ' <span class="official-tag">OFFICIAL</span>' : ''}</b>
      <div class="inv-stats"><span><i class="dot on"></i>${fmtNum(sv.onlineCount)} Online</span><span><i class="dot"></i>${fmtNum(sv.memberCount)} Member${sv.memberCount === 1 ? '' : 's'}</span></div>
      ${est ? `<div class="muted small">Est. ${esc(est)}</div>` : ''}
      <button class="btn ${sv.joined ? 'btn-grey' : 'btn-primary'} btn-block inv-join"${sv.paused && !sv.joined ? ' disabled' : ''}>${sv.joined ? 'Open Server' : sv.paused ? 'Not taking new members' : 'Join'}</button></div></div>`;
}
function decorateInvites() {
  const box = $('#messages');
  if (!box) return;
  for (const row of $$('.msg[data-id]', box)) {
    const links = [...new Set($$('.invite-link[data-invite]', row).map(a => a.dataset.invite))].slice(0, 2);
    if (!links.length || row.dataset.inv === links.join(',')) continue;
    row.dataset.inv = links.join(',');
    const host = $('.msg-body', row) || $('.content', row)?.parentElement || row;
    $$('.inv-card', host).forEach(c => c.remove());
    for (const code of links) {
      host.insertAdjacentHTML('beforeend', inviteCardHtml(code, null));
      const card = host.lastElementChild;
      invitePreview(code).then(sv => {
        if (!card.isConnected) return;
        card.outerHTML = inviteCardHtml(code, sv);
        const now = $(`.inv-card[data-inv="${CSS.escape(code)}"]`, host);
        $('.inv-join', now)?.addEventListener('click', async () => {
          if (sv.joined) return openServer(sv.id);
          try {
            const { server } = await api('POST', `/api/invites/${encodeURIComponent(code)}/join`);
            if (!state.servers.some(s => s.id === server.id)) state.servers.push(server);
            inviteCache.delete(code);
            await openServer(server.id);
          } catch (e) { toast(e.message, true); }
        });
      });
    }
  }
}
