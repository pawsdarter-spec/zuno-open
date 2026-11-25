'use strict';
// Zuno 0.16, chat: scheduled messages, edit history, picture alt text & spoilers, smaller uploads
// with previews, drafts that follow you between devices, search everywhere, the notification
// inbox, and friend suggestions.

// ======================= sending: extra details for pictures =======================
const attMeta = {}; // attachment id -> { alt, spoiler }
const _apiC = api;
api = async function (method, url, body) {
  if (method === 'POST' && /\/messages$/.test(url) && body?.attachmentIds?.length) {
    const meta = Object.fromEntries(body.attachmentIds.filter(id => attMeta[id]).map(id => [id, attMeta[id]]));
    if (Object.keys(meta).length) body = { ...body, attachmentMeta: meta };
  }
  return _apiC(method, url, body);
};

// ======================= smaller uploads & previews =======================
// Big pictures are shrunk before they're sent (WebP, at most 2560 px), and every picture gets a
// small preview so chats load quickly. GIFs are left alone so they keep moving.
const _uploadFileC = uploadFile;
uploadFile = async function (f) {
  if (!f.type?.startsWith('image/') || f.type === 'image/gif' || f.type === 'image/svg+xml') return _uploadFileC(f);
  let send = f, dims = null;
  try { const bmp = await createImageBitmap(f); dims = { w: bmp.width, h: bmp.height }; bmp.close?.(); } catch {}
  if (dims && (f.size > 400_000 || Math.max(dims.w, dims.h) > 2560)) {
    const small = await shrinkImage(f, 2560, 0.86);
    if (small && small.size < f.size) { send = small; dims = { w: small.outW, h: small.outH }; }
  }
  const a = await _uploadFileC(send);
  if (dims) {
    const thumb = Math.max(dims.w, dims.h) > 640 || send.size > 150_000 ? await shrinkImage(send, 640, 0.78) : null;
    try {
      const r = await fetch(`/api/attachments/${a.id}/thumb`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'X-Width': dims.w, 'X-Height': dims.h, 'Content-Type': 'application/octet-stream' }, body: thumb || new Blob([]) });
      const d = await r.json(); if (d.thumb) a.thumb = d.thumb;
    } catch {}
    Object.assign(a, dims, { name: send.name, size: send.size });
  }
  return a;
};

// The composer: ALT and spoiler buttons on each picture before you send it.
const _renderComposerExtrasC = renderComposerExtras;
renderComposerExtras = function () {
  _renderComposerExtrasC();
  const conv = activeConv(), ups = state.uploads[conv] || [];
  for (const el of $$('#composer-extras .up-item')) {
    const u = ups.find(x => x.key === el.dataset.key);
    if (!u || u.kind !== 'image') continue;
    if (u.id && (u.alt || u.spoiler)) attMeta[u.id] = { alt: u.alt || '', spoiler: !!u.spoiler };
    const bar = document.createElement('div');
    bar.className = 'up-tools';
    bar.innerHTML = `<button class="up-alt${u.alt ? ' on' : ''}" title="${u.alt ? esc('Alt text: ' + u.alt) : 'Describe this picture (alt text)'}">ALT</button><button class="up-spoil${u.spoiler ? ' on' : ''}" title="Mark as spoiler">${u.spoiler ? '🙈' : '👁'}</button>`;
    el.appendChild(bar);
    el.classList.toggle('spoiler', !!u.spoiler);
    $('.up-alt', bar).addEventListener('click', () => askAlt(u.alt || '', alt => { u.alt = alt; renderComposerExtras(); }));
    $('.up-spoil', bar).addEventListener('click', () => { u.spoiler = !u.spoiler; renderComposerExtras(); });
  }
};
function askAlt(value, done) {
  const ov = openLayer(`<form class="dialog modal" style="max-width:440px"><h3>Describe this picture</h3>
    <p class="muted small" style="margin:-4px 0 10px">Alt text helps people using screen readers, and makes the picture searchable.</p>
    <textarea name="alt" rows="3" maxlength="500" class="alt-box" placeholder="A cat asleep on a stack of books">${esc(value)}</textarea>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  f.alt.focus();
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  f.addEventListener('submit', e => { e.preventDefault(); closeLayer(); done(f.alt.value.trim()); });
  f.alt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
}

// In chat: previews instead of full pictures, the right size before they load, alt text, spoilers.
const revealed = new Set();
function decoratePictures() {
  const convo = state.convos[activeConv()];
  if (!convo) return;
  const byId = new Map(convo.messages.map(m => [m.id, m]));
  for (const row of $$('#messages .msg[data-id]')) {
    const m = byId.get(row.dataset.id);
    for (const a of m?.attachments || []) {
      if (a.kind !== 'image') continue;
      for (const img of $$(`img[data-full="${CSS.escape(a.url)}"], img[src="${CSS.escape(a.url)}"]`, row)) {
        if (img.dataset.dec) continue;
        img.dataset.dec = '1';
        img.dataset.full = a.url;
        if (a.thumb) img.src = a.thumb;
        if (a.alt) { img.alt = a.alt; img.title = a.alt; }
        if (a.w && a.h && !img.closest('.gallery')) { img.style.aspectRatio = `${a.w} / ${a.h}`; img.setAttribute('width', a.w); img.setAttribute('height', a.h); }
        const box = img.closest('.msg-media, .gal-item') || img.parentElement;
        if (a.alt) box.insertAdjacentHTML('beforeend', `<span class="alt-badge" title="${esc(a.alt)}">ALT</span>`);
        if (a.spoiler && !revealed.has(m.id + a.id)) {
          box.classList.add('spoiler-img');
          box.dataset.reveal = m.id + a.id;
          box.insertAdjacentHTML('beforeend', '<span class="spoiler-tag">SPOILER</span>');
        }
      }
    }
  }
}
document.addEventListener('click', e => {
  const s = e.target.closest('.spoiler-img[data-reveal]');
  if (!s) return;
  e.preventDefault(); e.stopPropagation();
  revealed.add(s.dataset.reveal);
  s.classList.remove('spoiler-img'); $('.spoiler-tag', s)?.remove();
}, true);
// Change the alt text on a picture you sent.
document.addEventListener('contextmenu', e => {
  const img = e.target.closest('#messages .msg[data-id] img[data-full]');
  if (!img || !$('#layer .menu')) return;
  const conv = activeConv(), row = img.closest('.msg[data-id]');
  const m = state.convos[conv]?.messages.find(x => x.id === row.dataset.id);
  const a = m?.attachments?.find(x => x.url === img.dataset.full);
  if (!a || m.authorId !== state.me.id) return;
  addMenuItem({ label: a.alt ? 'Edit Alt Text' : 'Add Alt Text', icon: ico('🏷️'), run: () => askAlt(a.alt || '', async alt => {
    try { const { message } = await api('PATCH', `${convBase(conv)}/messages/${m.id}/attachments/${a.id}`, { alt }); Object.assign(m, message); renderMessages(); } catch (err) { toast(err.message, true); }
  }) });
  addMenuItem({ label: a.spoiler ? 'Unmark Spoiler' : 'Mark as Spoiler', icon: ico('🙈'), run: async () => {
    try { const { message } = await api('PATCH', `${convBase(conv)}/messages/${m.id}/attachments/${a.id}`, { spoiler: !a.spoiler }); Object.assign(m, message); renderMessages(); } catch (err) { toast(err.message, true); }
  } });
});

// ======================= edit history =======================
document.addEventListener('click', e => {
  const tag = e.target.closest('#messages .edited');
  if (!tag) return;
  const row = tag.closest('.msg[data-id]');
  const m = state.convos[activeConv()]?.messages.find(x => x.id === row?.dataset.id);
  if (!m) return;
  const versions = [...(m.edits || []), { content: m.content, at: m.editedAt, now: true }].reverse();
  const box = popover(tag, 'edits-pop', `<div class="pop-head">✏️ Edit history</div><div class="pop-list">${m.e2e ? '<div class="fp-empty">Encrypted messages keep only their newest version.</div>' : ''}${versions.map(v => `<div class="eh-ver${v.now ? ' now' : ''}"><div class="muted small">${v.now ? 'Now · ' : ''}${esc(fmtTime(v.at || m.createdAt))}</div><div class="eh-text">${formatMessage(v.content || '')}</div></div>`).join('')}</div>`);
  box.style.width = '360px';
  const r = tag.getBoundingClientRect();
  if (box.getBoundingClientRect().bottom > innerHeight - 8) box.style.top = Math.max(8, r.top - box.offsetHeight - 8) + 'px';
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
});
const _renderMessagesC = renderMessages;
renderMessages = function (...a) {
  _renderMessagesC(...a);
  decoratePictures();
  for (const t of $$('#messages .edited:not([data-hist])')) { t.dataset.hist = '1'; t.title = (t.title ? t.title + ' · ' : '') + 'Click to see earlier versions'; }
};

// ======================= scheduled messages =======================
const CLOCK = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4.6l3.2 1.9-1 1.7L11 12.7V7h2z"/></svg>';
const _renderComposerC16 = renderComposer;
renderComposer = function () {
  _renderComposerC16();
  const box = $('#composer .composer-box');
  const conv = activeConv();
  if (!box || !conv) return;
  if (!$('#composer-sched', box)) {
    const b = document.createElement('button');
    b.className = 'composer-sched'; b.id = 'composer-sched'; b.title = 'Schedule this message'; b.setAttribute('aria-label', 'Schedule a message');
    b.innerHTML = CLOCK;
    ($('#composer-gif', box) || $('#composer-emoji', box))?.before(b);
    b.addEventListener('click', () => openSchedule(conv));
  }
  renderScheduledBar();
  // A draft from another device fills in an empty message box.
  const ta = $('#composer-input');
  const remote = state.serverDrafts?.[conv];
  if (ta && !ta.value && remote?.text && !state.drafts[conv] && remote.at > (lastSent[conv] || 0)) { ta.value = remote.text; state.drafts[conv] = remote.text; ta.dispatchEvent(new Event('input')); }
  if (ta && !ta.dataset.draftSync) {
    ta.dataset.draftSync = '1';
    ta.addEventListener('input', () => queueDraft(conv, ta.value));
  }
};
function openSchedule(conv) {
  const ta = $('#composer-input');
  const text = replaceShortcodes((ta?.value || '').trim());
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const quick = (() => {
    const now = new Date(), q = [];
    q.push(['In 1 hour', new Date(Date.now() + 3600e3)]);
    const tonight = new Date(); tonight.setHours(20, 0, 0, 0); if (tonight > now) q.push(['Tonight, 8 PM', tonight]);
    const tm = new Date(); tm.setDate(tm.getDate() + 1); tm.setHours(9, 0, 0, 0); q.push(['Tomorrow, 9 AM', tm]);
    const mon = new Date(); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(9, 0, 0, 0); q.push(['Monday, 9 AM', mon]);
    return q;
  })();
  const ov = openLayer(`<form class="dialog modal sched-dialog"><h3>⏰ Schedule message</h3>
    <textarea name="text" rows="3" maxlength="${limits().message}" placeholder="What should Zuno send?">${esc(text)}</textarea>
    <div class="sched-quick">${quick.map(([l, d], i) => `<button type="button" class="sq" data-q="${i}"><b>${esc(l)}</b><small>${esc(d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</small></button>`).join('')}</div>
    <label class="field">Or pick a time<input type="datetime-local" name="at" min="${local(new Date(Date.now() + 120e3))}" value="${local(new Date(Date.now() + 3600e3))}"></label>
    <p class="muted small">Zuno sends it for you at that time, even if you're offline. See and cancel scheduled messages above the message box.</p>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Schedule</button></div></form>`);
  const f = $('form', ov);
  f.text.focus();
  $$('[data-q]', ov).forEach(b => b.addEventListener('click', () => { f.at.value = local(quick[b.dataset.q][1]); $$('[data-q]', ov).forEach(x => x.classList.toggle('on', x === b)); }));
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const at = new Date(f.at.value).getTime();
    try {
      await api('POST', '/api/me/scheduled', { conv, content: replaceShortcodes(f.text.value.trim()), at });
      closeLayer();
      if (ta && activeConv() === conv) { ta.value = ''; state.drafts[conv] = ''; ta.dispatchEvent(new Event('input')); }
      toast(`⏰ Scheduled for ${new Date(at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
      await loadScheduled();
    } catch (err) { toast(err.message, true); }
  });
}
async function loadScheduled() { try { state.scheduled = (await api('GET', '/api/me/scheduled')).scheduled; } catch {} renderScheduledBar(); }
function renderScheduledBar() {
  const conv = activeConv(), comp = $('#composer');
  if (!comp) return;
  $('.sched-bar', comp)?.remove();
  const mine = (state.scheduled || []).filter(s => s.conv === conv);
  if (!mine.length) return;
  const bar = document.createElement('div');
  bar.className = 'sched-bar';
  bar.innerHTML = `<button class="sb-toggle">${CLOCK}<b>${mine.length} scheduled</b><span class="muted small">next ${esc(new Date(mine[0].at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span></button>`;
  comp.prepend(bar);
  $('.sb-toggle', bar).addEventListener('click', e => {
    const pop = popover(e.currentTarget, 'sched-pop', `<div class="pop-head">⏰ Scheduled messages</div><div class="pop-list">${mine.map(s => `<div class="sched-item" data-s="${esc(s.id)}"><div class="muted small">${esc(new Date(s.at).toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div><div class="pi-text">${formatMessage(s.content)}</div>
      <div class="row-btns"><button class="btn btn-grey btn-sm" data-snow>Send Now</button><button class="btn btn-link btn-sm" data-sdel>Cancel</button></div></div>`).join('')}</div>`);
    const r = e.currentTarget.getBoundingClientRect();
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
    $$('[data-s]', pop).forEach(row => {
      const s = mine.find(x => x.id === row.dataset.s);
      $('[data-sdel]', row).addEventListener('click', async () => { await api('DELETE', `/api/me/scheduled/${s.id}`).catch(err => toast(err.message, true)); closeLayer(); loadScheduled(); });
      $('[data-snow]', row).addEventListener('click', async () => { await api('DELETE', `/api/me/scheduled/${s.id}`).catch(() => {}); closeLayer(); sendMessage(conv, s.content); loadScheduled(); });
    });
  });
}

// ======================= drafts that follow you =======================
const DEVICE = (() => { try { let d = localStorage.getItem('zuno_device'); if (!d) { d = Math.random().toString(36).slice(2, 12); localStorage.setItem('zuno_device', d); } return d; } catch { return 'web'; } })();
const draftTimers = {}, lastSent = {};
// Sending a message ends its draft: cancel a save that's still waiting, and forget the old text,
// so what you sent never comes back into the box.
const _sendMessageD = sendMessage;
sendMessage = function (conv, ...rest) {
  clearTimeout(draftTimers[conv]);
  lastSent[conv] = Date.now();
  state.serverDrafts ||= {};
  if (state.serverDrafts[conv]?.text) { state.serverDrafts[conv] = { text: '', at: Date.now() }; api('PUT', '/api/me/drafts', { conv, text: '', device: DEVICE }).catch(() => {}); }
  return _sendMessageD(conv, ...rest);
};
function queueDraft(conv, text) {
  clearTimeout(draftTimers[conv]);
  draftTimers[conv] = setTimeout(() => {
    const ta = $('#composer-input');
    if (activeConv() === conv && ta) text = ta.value; // what's in the box now, not a second ago
    if (state.convos[conv]?.meta?.e2e) text = ''; // encrypted chats: drafts stay on this device
    if ((state.serverDrafts?.[conv]?.text || '') === text) return;
    state.serverDrafts ||= {};
    state.serverDrafts[conv] = { text, at: Date.now() };
    api('PUT', '/api/me/drafts', { conv, text, device: DEVICE }).catch(() => {});
  }, 1200);
}

// ======================= search everywhere =======================
const SEARCH_ALL = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-1 2h2v3h3v2h-3v3H9v-3H6V9h3z"/></svg>';
function openSearchEverywhere(q = '') {
  const sv = currentServer?.();
  const ov = openLayer(`<div class="modal search-all"><div class="sa-top">${SEARCH_ICON}<input id="sa-q" placeholder="Search every DM, group and server" autocomplete="off" value="${esc(q)}"><kbd>Esc</kbd></div>
    <div class="sa-scopes">${[['all', 'Everywhere'], ['dms', 'DMs & Groups'], ['servers', 'Servers'], ...(sv ? [[sv.id, sv.name]] : [])].map(([k, l], i) => `<button data-scope="${esc(k)}" class="${i === 0 ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
    <div class="sa-results" id="sa-results"><div class="fp-empty">Type a word or two. Tip: type <b>from:</b> to pick someone and find their messages.</div></div></div>`);
  const input = $('#sa-q', ov), out = $('#sa-results', ov);
  let scope = 'all', timer, seq = 0;
  const run = async () => {
    const text = ((input.dataset.from ? `from:${input.dataset.from} ` : '') + input.value).trim(); // includes a "from:@name" tag
    if (text.length < 2) { out.innerHTML = '<div class="fp-empty">Type a word or two. Tip: type <b>from:</b> to pick someone and find their messages.</div>'; return; }
    const my = ++seq;
    out.innerHTML = '<div class="fp-empty">Searching…</div>';
    try {
      const r = await api('GET', `/api/search?q=${encodeURIComponent(text)}&scope=${encodeURIComponent(scope)}`);
      if (my !== seq) return;
      for (const u of r.authors) state.users[u.id] = { ...u, ...state.users[u.id] };
      if (!r.results.length) { out.innerHTML = `<div class="fp-empty">${mascot('curious')}<div>Nothing found for “${esc(text)}”.</div></div>`; return; }
      const groups = [];
      for (const res of r.results) { let g = groups.find(x => x.where.conv === res.where.conv); if (!g) groups.push((g = { where: res.where, items: [] })); g.items.push(res.message); }
      out.innerHTML = `<div class="muted small sa-count">${r.total} result${r.total === 1 ? '' : 's'}</div>` + groups.map(g => `<div class="sa-group"><div class="sa-where">${g.where.kind === 'dm' ? avatar(g.where.user || { displayName: g.where.title }, 20) : g.where.kind === 'group' ? '👥' : `<span class="sa-sv" style="--sv:${esc(g.where.server.iconColor || '#04c5ae')}">${esc([...g.where.server.name][0] || '?')}</span>`}<b>${esc(g.where.title)}</b>${g.where.server ? `<span class="muted small">${esc(g.where.server.name)}</span>` : ''}</div>
        ${g.items.map(m => `<button class="sa-hit" data-conv="${esc(g.where.conv)}" data-msg="${esc(m.id)}">${miniMsg(m)}</button>`).join('')}</div>`).join('');
      markMatches($$('.pi-text', out), searchWords(text));
      $$('.sa-hit', out).forEach(b => b.addEventListener('click', () => { closeLayer(); jumpToSaved({ conv: b.dataset.conv, msgId: b.dataset.msg }); }));
    } catch (e) { out.innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); run(); } });
  $$('[data-scope]', ov).forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope; $$('[data-scope]', ov).forEach(x => x.classList.toggle('on', x === b)); run(); }));
  input.focus();
  if (q) run();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && state.me) { e.preventDefault(); e.stopImmediatePropagation(); openSearchEverywhere(); }
}, true); // before the chat search box's own Ctrl+F
// Ctrl+K: when no person matches, offer to search messages instead.
const _openSwitcherC = openSwitcher;
openSwitcher = function () {
  _openSwitcherC();
  const input = $('#sw-input'), results = $('#sw-results');
  if (!input) return;
  const add = () => {
    $('.sw-search', results)?.remove();
    const q = input.value.trim();
    if (q.length < 2) return;
    const b = document.createElement('button');
    b.className = 'result on-main sw-search';
    b.innerHTML = `${SEARCH_ALL}<b>Search messages for “${esc(q)}”</b><span class="muted">Ctrl+Shift+F</span>`;
    b.addEventListener('click', () => openSearchEverywhere(q));
    results.appendChild(b);
  };
  input.addEventListener('input', () => setTimeout(add, 0));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#sw-results [data-i]') && input.value.trim().length > 1) openSearchEverywhere(input.value.trim()); });
};

// ======================= notification inbox =======================
const BELL = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>';
function addTopTools(bar) {
  if (!bar) return;
  const after = $('#saved-btn', bar);
  if (!$('#inbox-btn', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn inbox-btn'; b.id = 'inbox-btn'; b.title = 'Notifications'; b.innerHTML = BELL + '<span class="ib-badge"></span>';
    after ? after.after(b) : bar.appendChild(b);
    b.addEventListener('click', e => openInbox(e.currentTarget));
  }
  if (!$('#search-all-btn', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'search-all-btn'; b.title = 'Search everywhere (Ctrl+Shift+F)'; b.innerHTML = SEARCH_ALL;
    ($('#saved-btn', bar) || $('#inbox-btn', bar)).before(b);
    b.addEventListener('click', () => openSearchEverywhere());
  }
  setInboxBadge();
}
function setInboxBadge() {
  const n = state.notifUnread || 0;
  for (const b of $$('.ib-badge')) { b.textContent = n > 99 ? '99+' : n || ''; b.classList.toggle('on', n > 0); }
}
const _renderDMHeaderC16 = renderDMHeader;
renderDMHeader = function () { _renderDMHeaderC16(); addTopTools($('#main .topbar')); };
const _showFriendsC = showFriends;
showFriends = function (...a) { const r = _showFriendsC(...a); addTopTools($('#main .topbar')); if (a[0] !== 'add' && a[0] !== 'pending') maybeSuggestFriends(); return r; };
const NOTIF_TEXT = {
  mention: n => `mentioned you in <b>${esc(n.title)}</b>`, reply: n => `replied to you in <b>${esc(n.title)}</b>`,
  reaction: n => `reacted ${esc(n.emoji)} to your message`, friend_request: () => 'sent you a friend request', friend_accept: () => 'accepted your friend request 🎉',
  missed_call: n => `called you${n.title && n.title !== 'Direct message' ? ` in <b>${esc(n.title)}</b>` : ''}. You missed it.`, reminder: n => `⏰ Reminder: a message in ${esc(n.title || 'a chat')}`,
};
async function openInbox(anchor) {
  const box = popover(anchor, 'inbox-pop', `<div class="pop-head">🔔 Notifications <span class="ib-tabs"><button data-ibt="all" class="on">All</button><button data-ibt="mentions">Mentions</button><button data-ibt="friends">Friends</button></span><button class="btn btn-link btn-sm" id="ib-clear">Clear all</button></div><div class="pop-list"><div class="fp-empty">Loading…</div></div>`);
  let data;
  try { data = await api('GET', '/api/me/notifications'); } catch (e) { $('.pop-list', box).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
  for (const u of data.users) state.users[u.id] = { ...u, ...state.users[u.id] };
  api('POST', '/api/me/notifications/seen').catch(() => {});
  state.notifUnread = 0; setInboxBadge();
  let tab = 'all';
  const draw = () => {
    const items = data.items.filter(n => tab === 'all' || (tab === 'mentions' ? ['mention', 'reply'].includes(n.type) : ['friend_request', 'friend_accept'].includes(n.type)));
    $('.pop-list', box).innerHTML = items.length ? items.map(n => {
      const u = user(n.from) || { displayName: 'Someone' };
      return `<div class="ib-item${n.unread ? ' unread' : ''}" data-n="${esc(n.id)}">${avatar(u, 36)}<div class="ib-body"><div><b>${esc(u.displayName)}</b> ${(NOTIF_TEXT[n.type] || (() => ''))(n)}</div>
        ${n.text ? `<div class="ib-snip">${formatMessage(n.text)}</div>` : ''}<div class="muted small">${esc(fmtTime(n.at))}${n.server ? ' · ' + esc(n.server) : ''}</div></div>
        <button class="icon-btn ib-x" title="Remove">✕</button></div>`;
    }).join('') : `<div class="fp-empty">${mascot('sleepy')}<div>You're all caught up!</div></div>`;
    $$('.ib-item', box).forEach(row => {
      const n = data.items.find(x => x.id === row.dataset.n);
      row.addEventListener('click', e => {
        if (e.target.closest('.ib-x')) { api('DELETE', `/api/me/notifications/${n.id}`).catch(() => {}); data.items = data.items.filter(x => x !== n); return draw(); }
        closeLayer();
        if (n.type === 'friend_request') return showFriends('pending');
        if (n.type === 'friend_accept') return openDM(n.from);
        if (n.conv && n.msgId) jumpToSaved({ conv: n.conv, msgId: n.msgId });
        else if (n.conv) openDM(n.conv);
      });
    });
  };
  $$('[data-ibt]', box).forEach(b => b.addEventListener('click', () => { tab = b.dataset.ibt; $$('[data-ibt]', box).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  $('#ib-clear', box).addEventListener('click', () => { api('DELETE', '/api/me/notifications/all').catch(() => {}); data.items = []; draw(); });
  draw();
}

// ======================= friend suggestions =======================
let suggestions = null;
async function loadSuggestions() { try { suggestions = (await api('GET', '/api/friends/suggestions')).suggestions; } catch { suggestions = []; } return freshSuggestions(suggestions); }
// Anyone you've since added, sent a request to (from anywhere), or got a request from is left out.
function freshSuggestions(list) {
  const skip = new Set([...(state.friends || []).map(f => (typeof f === 'string' ? f : f?.id)), ...(state.requests || []).map(r => r.userId)]);
  return (list || []).filter(s => s?.user && !skip.has(s.user.id));
}
function suggestionCard(s) {
  const why = [s.mutualFriends ? `${s.mutualFriends} mutual friend${s.mutualFriends === 1 ? '' : 's'}` : '', s.servers.length ? `In ${s.servers.slice(0, 2).join(', ')}` : ''].filter(Boolean).join(' · ');
  return `<div class="sug-card" data-sug="${esc(s.user.id)}">${avatar(s.user, 48, true)}<b>${esc(s.user.displayName)}</b><span class="muted small">${esc(s.user.username)}</span><span class="sug-why">${esc(why)}</span>
    <div class="row-btns"><button class="btn btn-primary btn-sm" data-sug-add>Add Friend</button><button class="icon-btn" data-sug-x title="Not now">✕</button></div></div>`;
}
function wireSuggestions(root) {
  $$('[data-sug]', root).forEach(c => {
    const s = suggestions.find(x => x.user.id === c.dataset.sug);
    $('[data-sug-add]', c).addEventListener('click', async e => { e.currentTarget.disabled = true; await sendRequest(s.user.username); e.currentTarget.textContent = 'Request Sent'; suggestions = suggestions.filter(x => x !== s); });
    $('[data-sug-x]', c).addEventListener('click', () => { api('POST', `/api/friends/suggestions/${s.user.id}/dismiss`).catch(() => {}); suggestions = suggestions.filter(x => x !== s); c.remove(); });
  });
}
const _renderAddFriendC = renderAddFriend;
renderAddFriend = function () {
  _renderAddFriendC();
  const body = $('#friends-body');
  const box = document.createElement('div');
  box.className = 'sug-box';
  body.appendChild(box);
  loadSuggestions().then(list => {
    if (!list.length || !box.isConnected) return;
    box.innerHTML = `<h4 class="list-label">People you may know</h4><div class="sug-grid">${list.map(suggestionCard).join('')}</div>`;
    wireSuggestions(box);
  });
};
async function maybeSuggestFriends() {
  if (state.friends.length >= 8) return;
  const list = freshSuggestions(suggestions || await loadSuggestions());
  const body = $('#friends-body');
  if (!list.length || !body || $('.sug-strip', body) || state.view.type !== 'friends') return;
  const strip = document.createElement('div');
  strip.className = 'sug-box sug-strip';
  strip.innerHTML = `<h4 class="list-label">People you may know</h4><div class="sug-grid">${list.slice(0, 4).map(suggestionCard).join('')}</div>`;
  body.appendChild(strip);
  wireSuggestions(strip);
}

// ======================= live events =======================
function hookChat16Events(es) {
  const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data || '{}')); } catch {} });
  on('notif', d => { state.notifUnread = d.unread || 0; setInboxBadge(); });
  on('scheduled', () => loadScheduled());
  on('draft', d => {
    if (d.device === DEVICE) return;
    state.serverDrafts ||= {};
    state.serverDrafts[d.conv] = { text: d.text, at: d.at };
    const ta = $('#composer-input');
    if (activeConv() === d.conv && ta && document.activeElement !== ta) { ta.value = d.text; state.drafts[d.conv] = d.text; ta.dispatchEvent(new Event('input')); }
    else if (!d.text) delete state.drafts[d.conv];
    else if (!state.drafts[d.conv]) state.drafts[d.conv] = d.text;
  });
}
(function waitEsC() {
  if (!state.es) return setTimeout(waitEsC, 800);
  hookChat16Events(state.es);
  const _connectC = connect;
  connect = function () { _connectC(); hookChat16Events(state.es); };
})();
