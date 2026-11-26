'use strict';
// Zuno 0.19: threads, message translation, stickers, saved-message folders, "Catch me up",
// Listen Together & Watch Together, server events, AutoMod, recovery codes, a map of where you're
// logged in, keyboard shortcuts, swipe gestures on phones, maintenance notices, and tidier
// server-bar tooltips.

const isPhone = () => window.matchMedia('(pointer: coarse)').matches || VW < 760;
const hasBloomNow = () => !!state.me?.bloomInfo?.active;
const langName = code => { try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) || code; } catch { return code; } };
const myLang = () => (navigator.language || 'en').split('-')[0].toLowerCase();

// ======================= server bar tooltips =======================
// The server bar scrolls, so tooltips drawn inside it got cut off (and could be scrolled to).
// They now float above everything instead.
let railTip = null;
document.addEventListener('mouseover', e => {
  const b = e.target.closest?.('.rail [data-tip]');
  if (!b) { railTip?.remove(); railTip = null; return; }
  if (railTip?.dataset.for === b.dataset.tip) return;
  railTip?.remove();
  railTip = document.createElement('div');
  railTip.className = 'rail-tip'; railTip.dataset.for = b.dataset.tip; railTip.textContent = b.dataset.tip;
  document.body.appendChild(railTip);
  const r = b.getBoundingClientRect();
  railTip.style.top = (r.top + r.height / 2) + 'px';
  railTip.style.left = (r.right + 14) + 'px';
});
document.addEventListener('scroll', () => { railTip?.remove(); railTip = null; }, true);

// ======================= stickers =======================
const ZUNO_STICKERS = {
  'zuno:hi': ['Hi!', 'happy', '👋'], 'zuno:love': ['Love it', 'happy', '❤️'], 'zuno:party': ['Party', 'happy', '🎉'], 'zuno:gg': ['GG', 'happy', '🏆'],
  'zuno:thumbs': ['Nice', 'happy', '👍'], 'zuno:fire': ['Fire', 'curious', '🔥'], 'zuno:huh': ['Huh?', 'curious', '❓'], 'zuno:sleepy': ['Sleepy', 'sleepy', '💤'],
  'zuno:sad': ['Sad', 'sleepy', '💧'], 'zuno:coffee': ['Coffee', 'sleepy', '☕'], 'zuno:wow': ['Wow', 'curious', '✨'], 'zuno:bye': ['Bye!', 'happy', '🌙'],
};
function stickerHtml(st, size = 150) {
  const z = ZUNO_STICKERS[st.id];
  if (z) return `<div class="sticker zs" style="--s:${size}px" title="${esc(z[0])}">${mascot(z[1])}<span class="zs-acc">${z[2]}</span><b>${esc(z[0])}</b></div>`;
  return `<div class="sticker" style="--s:${size}px"><img src="${esc(st.url)}" alt="${esc(st.name)}" title="${esc(st.name)}" loading="lazy"></div>`;
}
let stickerLib = null;
async function loadStickers(force) {
  if (stickerLib && !force) return stickerLib;
  try { stickerLib = await api('GET', '/api/stickers'); } catch { stickerLib = { builtin: [], servers: [] }; }
  return stickerLib;
}
async function openStickerPicker(anchor, onPick) {
  const lib = await loadStickers(true);
  const tabs = [{ id: 'zuno', name: 'Zuno', list: Object.keys(ZUNO_STICKERS).map(id => ({ id })) }, ...lib.servers.map(sv => ({ id: sv.id, name: sv.name, list: sv.stickers }))];
  let tab = tabs.find(t => t.id === state.currentServerId && t.list.length) ? state.currentServerId : 'zuno';
  const box = popover(anchor, 'sticker-pop', '<div class="pop-head">Stickers</div><div class="stk-tabs"></div><div class="stk-grid"></div>');
  const draw = () => {
    $('.stk-tabs', box).innerHTML = tabs.map(t => `<button class="chip${t.id === tab ? ' on' : ''}" data-stab="${esc(t.id)}">${esc(t.name)}</button>`).join('');
    const cur = tabs.find(t => t.id === tab);
    $('.stk-grid', box).innerHTML = cur.list.map(s => `<button class="stk-item" data-stk="${esc(s.id)}" title="${esc(ZUNO_STICKERS[s.id]?.[0] || s.name)}">${stickerHtml(s, 84)}</button>`).join('') || '<div class="fp-empty">No stickers here yet.</div>';
    $$('[data-stab]', box).forEach(b => b.addEventListener('click', () => { tab = b.dataset.stab; draw(); }));
    $$('[data-stk]', box).forEach(b => b.addEventListener('click', () => {
      const s = cur.list.find(x => x.id === b.dataset.stk);
      closeLayer();
      onPick(ZUNO_STICKERS[s.id] ? { id: s.id } : { id: s.id, serverId: tab });
    }));
  };
  draw();
}
async function sendSticker(conv, sticker) {
  try { await api('POST', `${convBase(conv)}/messages`, { sticker }); }
  catch (e) { toast(e.message, true); }
}
const STICKER_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 16.2L19.2 14H16a2 2 0 0 0-2 2v3.2zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 13.5c1 1.6 2.4 2.4 4 2.4v-1.6c-1 0-1.8-.4-2.5-1.3z"/></svg>';

// Server Settings › Stickers
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'emoji') + 1, 0, { group: 'Server', key: 'stickers', label: 'Stickers', need: 'manage_expressions', words: 'stickers sticker upload png gif expressions' });
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'audit'), 0, { group: 'Moderation', key: 'automod', label: 'AutoMod', need: 'manage_server', words: 'automod auto mod filter blocked words links invites spam caps mentions safety moderation' });
const _showServerSection19 = showServerSection;
showServerSection = async function (section, openCh) {
  if (section !== 'stickers' && section !== 'automod') return _showServerSection19(section, openCh);
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  const sv = svById(svSettings.id);
  return section === 'stickers' ? ssStickers($('#ss-body'), sv) : ssAutomod($('#ss-body'), sv);
};
function ssStickers(body, sv) {
  const list = sv.stickers || [];
  body.innerHTML = `<div data-keep><h2>Stickers</h2>
    <p class="muted" style="margin:-10px 0 16px">Upload up to 30 stickers for ${esc(sv.name)}. People in the server can send them anywhere from the sticker button next to GIF. PNG, GIF, WebP or JPG, up to 512 KB.</p>
    <div class="em-up"><button class="btn btn-primary" id="stk-upload">Upload Sticker</button><span class="muted small">${list.length} / 30</span><input type="file" id="stk-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" multiple></div>
    <div class="stk-manage">${list.map(s => `<div class="stk-card" data-sid="${esc(s.id)}">${stickerHtml(s, 96)}<b>${esc(s.name)}</b><button class="icon-btn danger" data-stkdel title="Delete">${ICON.trash}</button></div>`).join('') || `<div class="empty-state" style="grid-column:1/-1">${mascot('curious')}<div class="title">No stickers yet</div><div>Upload your server's first one!</div></div>`}</div></div>`;
  const redraw = async () => { await refresh({ serverId: sv.id }); ssStickers(body, svById(sv.id)); };
  $('#stk-upload', body).addEventListener('click', () => $('#stk-file', body).click());
  $('#stk-file', body).addEventListener('change', async e => {
    for (const file of [...e.target.files]) {
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 30).padEnd(2, ' ');
      try {
        const res = await fetch(`/api/servers/${sv.id}/stickers`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type, 'X-Sticker-Name': encodeURIComponent(name) }, body: file });
        const d = await res.json(); if (!res.ok) throw new Error(d.error);
        toast(`Added the "${d.sticker.name}" sticker`);
      } catch (err) { toast(`${file.name}: ${err.message}`, true); }
    }
    redraw();
  });
  $$('[data-sid]', body).forEach(c => $('[data-stkdel]', c).addEventListener('click', () => confirmDialog('Delete this sticker?', "Messages that already have it will keep showing it until it's cleaned up.", 'Delete', async () => {
    try { await api('DELETE', `/api/servers/${sv.id}/stickers/${c.dataset.sid}`); redraw(); } catch (err) { toast(err.message, true); }
  })));
}

// ======================= AutoMod (Server Settings) =======================
async function ssAutomod(body, sv) {
  let c;
  try { c = (await api('GET', `/api/servers/${sv.id}/automod`)).automod; } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const textChannels = sv.channels.filter(x => x.type === 'text');
  const roles = sv.roles.filter(r => !r.everyone);
  body.innerHTML = `<div data-keep><h2>🛡️ AutoMod</h2>
    <p class="muted" style="margin:-10px 0 16px">Stops unwanted messages before anyone sees them. The sender is told why. People who can manage messages are never blocked.</p>
    <form id="am-form">
      ${ssToggle('enabled', 'Turn on AutoMod', 'Check every message (and edits, and thread replies) against the rules below.', c.enabled)}
      <div class="setting-group"><h4 class="setting-head">Blocked words</h4>
        <label class="field">Words or phrases, one per line or separated by commas<span class="hint" style="display:block;margin-top:4px">Whole words only. Put * at the start or end to also catch it inside other words (like *bad*).</span>
          <textarea name="words" rows="4" placeholder="badword&#10;*spoiler*">${esc((c.words || []).join('\n'))}</textarea></label></div>
      <div class="setting-group"><h4 class="setting-head">Links</h4>
        ${ssToggle('invites', 'Block invites to other servers', 'Zuno and other invite links.', c.invites)}
        ${ssToggle('links', 'Block all links', 'Except the sites you allow below.', c.links)}
        <label class="field">Allowed sites<span class="hint" style="display:block;margin-top:4px">Like youtube.com, one per line. Only used when links are blocked.</span><textarea name="allowDomains" rows="2" placeholder="youtube.com&#10;twitch.tv">${esc((c.allowDomains || []).join('\n'))}</textarea></label>
        <label class="field">New accounts can't post links for<select name="newAccountLinks" class="sc-select">${[[0, 'No limit'], [10, '10 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']].map(([v, l]) => `<option value="${v}"${c.newAccountLinks === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="setting-group"><h4 class="setting-head">Spam</h4>
        ${ssToggle('spam', 'Block spam', 'More than 5 messages in 5 seconds, or the same message 3 times.', c.spam)}
        ${ssToggle('caps', 'Block SHOUTING', 'Messages that are mostly capital letters.', c.caps)}
        <label class="field">Most @mentions in one message<select name="mentionLimit" class="sc-select">${[[0, 'No limit'], [3, '3'], [5, '5'], [10, '10'], [20, '20']].map(([v, l]) => `<option value="${v}"${c.mentionLimit === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="setting-group"><h4 class="setting-head">What happens</h4>
        <label class="field">Also time out the sender for<select name="timeoutMinutes" class="sc-select">${[[0, "Don't time out"], [1, '1 minute'], [5, '5 minutes'], [10, '10 minutes'], [60, '1 hour'], [1440, '1 day']].map(([v, l]) => `<option value="${v}"${c.timeoutMinutes === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Post an alert in<select name="alertChannelId" class="sc-select"><option value="">Don't post alerts</option>${textChannels.map(ch => `<option value="${esc(ch.id)}"${c.alertChannelId === ch.id ? ' selected' : ''}>#${esc(ch.name)}</option>`).join('')}</select></label>
        <p class="muted small" style="margin:0">Every blocked message is also in the Audit Log.</p></div>
      <div class="setting-group"><h4 class="setting-head">Skip these</h4>
        <div class="am-picks"><div><div class="setting-title">Roles</div>${roles.map(r => `<label class="am-pick"><input type="checkbox" name="exemptRoles" value="${esc(r.id)}"${(c.exemptRoles || []).includes(r.id) ? ' checked' : ''}> ${esc(r.name)}</label>`).join('') || '<div class="muted small">No roles yet.</div>'}</div>
          <div><div class="setting-title">Channels</div>${textChannels.map(ch => `<label class="am-pick"><input type="checkbox" name="exemptChannels" value="${esc(ch.id)}"${(c.exemptChannels || []).includes(ch.id) ? ' checked' : ''}> #${esc(ch.name)}</label>`).join('')}</div></div></div>
      <button class="btn btn-primary" id="am-save">Save AutoMod</button>
    </form></div>`;
  const f = $('#am-form', body);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const all = n => [...f.querySelectorAll(`[name=${n}]:checked`)].map(x => x.value);
    try {
      await api('PATCH', `/api/servers/${sv.id}/automod`, {
        enabled: f.enabled.checked, words: f.words.value, allowDomains: f.allowDomains.value, invites: f.invites.checked, links: f.links.checked, spam: f.spam.checked, caps: f.caps.checked,
        mentionLimit: Number(f.mentionLimit.value), timeoutMinutes: Number(f.timeoutMinutes.value), newAccountLinks: Number(f.newAccountLinks.value), alertChannelId: f.alertChannelId.value || null,
        exemptRoles: all('exemptRoles'), exemptChannels: all('exemptChannels'),
      });
      toast(f.enabled.checked ? '🛡️ AutoMod saved and on' : 'AutoMod saved (it\'s off)');
    } catch (err) { toast(err.message, true); }
  });
}

// ======================= translation =======================
const translations = {}; // message id -> { text, from } | 'loading'
async function translateMessage(conv, id) {
  const m = state.convos[conv]?.messages.find(x => x.id === id) || threadView?.messages.find(x => x.id === id);
  if (!m?.content) return;
  translations[id] = 'loading'; rerenderFor(id);
  try {
    const r = await api('POST', '/api/translate', { text: m.content, to: myLang() });
    translations[id] = r;
  } catch (e) { delete translations[id]; toast(e.message, true); }
  rerenderFor(id);
}
function rerenderFor(id) { if ($(`#messages .msg[data-id="${CSS.escape(id)}"]`)) renderMessages(); if (threadView?.messages.some(x => x.id === id)) drawThread(); }
function translationHtml(m) {
  const t = translations[m.id];
  if (!t) return '';
  if (t === 'loading') return '<div class="tr-box loading">🌐 Translating…</div>';
  const same = t.from && t.from === myLang();
  return `<div class="tr-box"><div class="tr-head">🌐 ${same ? 'Already in your language' : `Translated${t.from ? ' from ' + esc(langName(t.from)) : ''}`} <a href="#" data-tr-hide="${esc(m.id)}">Hide</a></div>${same ? '' : `<div class="tr-text">${formatMessage(t.text)}</div>`}</div>`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-tr-hide]');
  if (!a) return;
  e.preventDefault();
  delete translations[a.dataset.trHide];
  rerenderFor(a.dataset.trHide);
});

// ======================= messages: stickers, thread chips, translations =======================
const _mediaHtml19 = mediaHtml;
mediaHtml = function (m) {
  return (m.sticker ? stickerHtml(m.sticker) : '') + _mediaHtml19(m) + translationHtml(m)
    + (m.thread ? `<button class="thread-chip" data-thread="${esc(m.thread.id)}">🧵 <b>${esc(m.thread.name)}</b><span>${m.thread.count} ${m.thread.count === 1 ? 'reply' : 'replies'}${m.thread.archived ? ' · closed' : ''}</span></button>` : '');
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-thread]');
  if (b) { e.preventDefault(); openThread(b.dataset.thread); }
});
// Right-click a message: Translate, and Create Thread in server channels.
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m || m.pending) return;
  if (m.content && !m.e2e) addMenuItem(translations[id] && translations[id] !== 'loading' ? { label: 'Hide Translation', icon: ico('🌐'), run: () => { delete translations[id]; renderMessages(); } } : { label: 'Translate', icon: ico('🌐'), run: () => translateMessage(conv, id) });
  if (isChannelConv(conv) && !user(m.authorId)?.system) addMenuItem(m.thread ? { label: 'Open Thread', icon: ico('🧵'), run: () => openThread(m.thread.id) } : { label: 'Create Thread', icon: ico('🧵'), run: () => createThread(conv, id) });
});

// ======================= threads =======================
let threadView = null; // { thread, parent, messages, canWrite, canManage }
async function createThread(conv, msgId) {
  const m = state.convos[conv]?.messages.find(x => x.id === msgId);
  const guess = (m?.content || '').replace(/[*_~`>#|]/g, '').trim().slice(0, 40) || 'New thread';
  const ov = openLayer(`<form class="dialog modal"><h3>🧵 Start a thread</h3><p class="muted" style="margin:0 0 12px">A side conversation about this message, so the channel stays easy to follow.</p>
    <label class="field">Thread name<input name="name" maxlength="60" value="${esc(guess)}" required></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Thread</button></div></form>`);
  const f = $('form', ov);
  f.name.select();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { const { thread } = await api('POST', `${convBase(conv)}/messages/${msgId}/thread`, { name: f.name.value }); closeLayer(); openThread(thread.id); }
    catch (err) { toast(err.message, true); }
  });
}
async function openThread(id) {
  let d;
  try { d = await api('GET', `/api/threads/${id}`); } catch (e) { return toast(e.message, true); }
  for (const u of d.authors) state.users[u.id] = { ...state.users[u.id], ...u };
  threadView = d;
  let panel = $('#thread-panel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'thread-panel'; panel.className = 'thread-panel';
    document.body.appendChild(panel);
  }
  document.body.classList.add('thread-open');
  panel.innerHTML = `<div class="tp-head"><span class="tp-ico">🧵</span><div class="tp-title"><b id="tp-name"></b><span class="muted small" id="tp-where"></span></div>
      <button class="icon-btn" id="tp-menu" title="Thread options">⋯</button><button class="icon-btn" id="tp-close" title="Close (Esc)">✕</button></div>
    <div class="tp-list" id="tp-list"></div>
    <div class="tp-compose" id="tp-compose"></div>`;
  $('#tp-close', panel).addEventListener('click', closeThread);
  $('#tp-menu', panel).addEventListener('click', e => {
    const t = threadView.thread;
    const items = [{ label: 'Copy Thread Name', run: () => navigator.clipboard?.writeText(t.name) }];
    if (threadView.canManage) items.push({ label: 'Rename Thread', run: renameThread }, { label: t.archived ? 'Reopen Thread' : 'Close Thread', run: () => setThread({ archived: !t.archived }) });
    openMenu(e.currentTarget, items);
  });
  drawThread(true);
  drawThreadComposer();
}
function closeThread() { $('#thread-panel')?.remove(); threadView = null; document.body.classList.remove('thread-open'); }
async function setThread(change) {
  try { const { thread } = await api('PATCH', `/api/threads/${threadView.thread.id}`, change); threadView.thread = thread; threadView.canWrite = !thread.archived; drawThread(); drawThreadComposer(); }
  catch (e) { toast(e.message, true); }
}
function renameThread() {
  const ov = openLayer(`<form class="dialog modal"><h3>Rename thread</h3><label class="field">Thread name<input name="name" maxlength="60" value="${esc(threadView.thread.name)}" required></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', e => { e.preventDefault(); closeLayer(); setThread({ name: f.name.value }); });
}
function threadMsgHtml(m, prev) {
  const a = user(m.authorId) || { id: m.authorId, displayName: 'Someone' };
  const grouped = prev && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 7 * 60e3;
  const mine = m.authorId === state.me.id;
  const tools = `<div class="msg-tools tp-tools"><button data-tptr="${esc(m.id)}" title="Translate">🌐</button>${mine || threadView.canManage ? `<button data-tpdel="${esc(m.id)}" title="Delete" class="danger">${ICON.trash}</button>` : ''}</div>`;
  const body = `${m.content ? `<div class="content">${formatMessage(m.content)}</div>` : ''}${m.sticker ? stickerHtml(m.sticker, 120) : ''}${translationHtml(m)}`;
  return grouped ? `<div class="msg tp-msg" data-id="${esc(m.id)}">${body}${tools}</div>`
    : `<div class="msg head tp-msg" data-id="${esc(m.id)}"><span data-profile="${esc(a.id)}">${avatar(a, 32)}</span><div><span class="author" data-profile="${esc(a.id)}">${esc(nameIn(a))}</span><span class="time">${fmtTime(m.createdAt)}</span></div>${body}${tools}</div>`;
}
function drawThread(toBottom) {
  const panel = $('#thread-panel');
  if (!panel || !threadView) return;
  const { thread, parent, messages } = threadView;
  $('#tp-name', panel).textContent = thread.name;
  $('#tp-where', panel).textContent = `#${threadView.channelName}${thread.archived ? ' · closed' : ''} · ${thread.count} ${thread.count === 1 ? 'reply' : 'replies'}`;
  const list = $('#tp-list', panel);
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const pa = parent && (user(parent.authorId) || { displayName: 'Someone' });
  list.innerHTML = `${parent ? `<div class="tp-parent"><div class="muted small">Started from</div><div class="tp-pmsg">${avatar(pa, 24)}<b>${esc(nameIn(pa))}</b><span class="muted small">${fmtTime(parent.createdAt)}</span></div><div class="content">${formatMessage(parent.content || '')}</div>${parent.sticker ? stickerHtml(parent.sticker, 90) : ''}</div>` : '<div class="tp-parent muted">The first message was deleted.</div>'}
    ${messages.length ? '' : `<div class="fp-empty">${mascot('curious')}<div>No replies yet. Say something!</div></div>`}
    ${messages.map((m, i) => threadMsgHtml(m, messages[i - 1])).join('')}`;
  $$('[data-profile]', list).forEach(n => n.addEventListener('click', () => openProfile(n.dataset.profile)));
  $$('[data-tpdel]', list).forEach(b => b.addEventListener('click', async () => { try { await api('DELETE', `/api/threads/${thread.id}/messages/${b.dataset.tpdel}`); } catch (e) { toast(e.message, true); } }));
  $$('[data-tptr]', list).forEach(b => b.addEventListener('click', () => (translations[b.dataset.tptr] ? (delete translations[b.dataset.tptr], drawThread()) : translateMessage(null, b.dataset.tptr))));
  if (toBottom || near) list.scrollTop = list.scrollHeight;
}
function drawThreadComposer() {
  const box = $('#tp-compose');
  if (!box || !threadView) return;
  if (!threadView.canWrite) { box.innerHTML = `<div class="composer-locked">${threadView.thread.archived ? '🔒 This thread is closed.' : "You can't talk in this thread."}</div>`; return; }
  box.innerHTML = `<div class="composer-box"><textarea id="tp-input" rows="1" maxlength="${limits().message}" placeholder="Reply in ${esc(threadView.thread.name)}"></textarea><button class="composer-sticker" id="tp-sticker" title="Stickers">${STICKER_ICON}</button></div>`;
  const ta = $('#tp-input', box);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; };
  ta.addEventListener('input', grow);
  wireEmojiAutocomplete(ta, box);
  wireMentionAutocomplete(ta, box);
  ta.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    ta.value = ''; grow();
    try { await api('POST', `/api/threads/${threadView.thread.id}/messages`, { content: text }); }
    catch (err) { ta.value = text; grow(); toast(err.message, true); }
  });
  $('#tp-sticker', box).addEventListener('click', e => openStickerPicker(e.currentTarget, async sticker => {
    try { await api('POST', `/api/threads/${threadView.thread.id}/messages`, { sticker }); } catch (err) { toast(err.message, true); }
  }));
  if (!isPhone()) ta.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && threadView && !$('#layer').children.length && document.activeElement?.id !== 'composer-input') closeThread(); });
async function openThreadList(anchor) {
  const conv = activeConv();
  if (!isChannelConv(conv)) return;
  const box = popover(anchor, 'pins-pop threads-pop', '<div class="pop-head">🧵 Threads</div><div class="pop-list"><div class="fp-empty">Loading…</div></div>');
  let list = [];
  try { list = (await api('GET', `${convBase(conv)}/threads`)).threads; } catch (e) { $('.pop-list', box).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
  $('.pop-list', box).innerHTML = list.length ? list.map(t => `<button class="th-row" data-thread="${esc(t.id)}"><span class="th-ico">🧵</span><div><b>${esc(t.name)}</b><div class="muted small">${t.count} ${t.count === 1 ? 'reply' : 'replies'} · ${esc(fmtTime(t.lastAt))}${t.archived ? ' · closed' : ''}</div></div></button>`).join('')
    : `<div class="fp-empty">${mascot('curious')}<div>No threads yet. Right-click a message and pick <b>Create Thread</b>.</div></div>`;
  $$('[data-thread]', box).forEach(b => b.addEventListener('click', () => closeLayer()));
}

// ======================= Catch me up =======================
const CATCHUP_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9zM18 2l.7 1.3L20 4l-1.3.7L18 6l-.7-1.3L16 4l1.3-.7z"/></svg>';
const leftAt = {};     // conv -> when you last left it
const catchSince = {}; // conv -> what "since you were last here" means for this visit
async function openCatchUp(conv = activeConv(), since) {
  if (!conv) return;
  since ||= catchSince[conv] || Date.now() - 864e5;
  const ov = openLayer(`<div class="dialog modal catchup"><h3>✨ Catch me up</h3><div class="cu-body"><div class="fp-empty">${mascot('curious')}<div>Reading what you missed…</div></div></div>
    <div class="actions"><select class="sc-select" id="cu-range"><option value="">Since you were last here</option><option value="3600000">Last hour</option><option value="86400000">Last 24 hours</option><option value="604800000">Last 7 days</option></select><button class="btn btn-primary" data-a="ok">Got it</button></div></div>`);
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  $('#cu-range', ov).addEventListener('change', e => { closeLayer(); openCatchUp(conv, e.target.value ? Date.now() - Number(e.target.value) : catchSince[conv]); });
  let d;
  try { d = await api('GET', `/api/catchup?conv=${encodeURIComponent(conv)}&since=${since}`); } catch (e) { $('.cu-body', ov).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
  for (const p of d.people) if (p.user) state.users[p.user.id] = { ...state.users[p.user.id], ...p.user };
  const item = x => `<button class="cu-msg" data-cujump="${esc(x.id)}">${avatar(user(x.authorId) || { displayName: x.author }, 24)}<div><b>${esc(x.author)}</b>${x.reactions ? ` <span class="muted small">· ${x.reactions} reaction${x.reactions === 1 ? '' : 's'}</span>` : ''}<div class="cu-text">${formatMessage(x.text)}</div></div></button>`;
  const sec = (title, html) => (html ? `<div class="cu-sec"><h4>${title}</h4>${html}</div>` : '');
  $('.cu-body', ov).innerHTML = !d.count ? `<div class="fp-empty">${mascot('sleepy')}<div>Nothing new since ${esc(fmtTime(d.since))}. You're all caught up!</div></div>` : `
    <div class="cu-top"><b>${d.count}</b> message${d.count === 1 ? '' : 's'} since ${esc(fmtTime(d.since))} from <b>${d.people.length}</b> ${d.people.length === 1 ? 'person' : 'people'}
      <div class="cu-people">${d.people.map(p => `<span class="cu-person" title="${esc(p.user?.displayName || '')}: ${p.count}">${avatar(p.user || { displayName: '?' }, 28)}<small>${p.count}</small></span>`).join('')}</div></div>
    ${d.summary ? `<div class="cu-sec cu-ai"><h4>In short</h4><div>${formatMessage(d.summary)}</div></div>` : ''}
    ${sec('📣 For you', d.mentions.map(item).join(''))}
    ${sec('🔥 Most reactions', d.top.map(item).join(''))}
    ${sec('❓ Questions asked', d.questions.map(item).join(''))}
    ${sec('📌 Pinned', d.pinned.map(item).join(''))}
    ${sec('📊 Polls', d.polls.map(item).join(''))}
    ${sec('🧵 Active threads', d.threads.map(t => `<button class="cu-msg" data-thread="${esc(t.id)}"><span>🧵</span><div><b>${esc(t.name)}</b><div class="muted small">${t.count} replies</div></div></button>`).join(''))}
    ${sec('🔗 Links', d.links.map(l => `<a class="cu-link" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join(''))}
    ${d.files ? `<p class="muted small">📎 ${d.files} message${d.files === 1 ? '' : 's'} with files.</p>` : ''}`;
  $$('[data-cujump]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); jumpToAny(conv, b.dataset.cujump); }));
  $$('[data-thread]', ov).forEach(b => b.addEventListener('click', () => closeLayer()));
}
// Remember when you leave a chat, and offer a catch-up when lots happened since.
let watchedConv = null;
setInterval(() => { if (activeConv() !== watchedConv) maybeOfferCatchUp(); }, 700);
async function maybeOfferCatchUp() {
  const conv = activeConv();
  if (conv === watchedConv) return;
  if (watchedConv) leftAt[watchedConv] = Date.now();
  watchedConv = conv;
  if (!conv) return;
  // Wait for the chat to load (and its "New" line to be worked out).
  for (let i = 0; i < 30 && !(state.convos[conv]?.loaded && state.convos[conv].dividerId); i++) await new Promise(r => setTimeout(r, 100));
  if (activeConv() !== conv) return;
  const convo = state.convos[conv];
  const firstNew = convo?.dividerId && convo.messages.find(m => m.id === convo.dividerId);
  catchSince[conv] = firstNew ? firstNew.createdAt - 1 : leftAt[conv] || null;
}

// Lots of new messages: the "new messages" bar gets a Catch me up button.
const _updateUnreadBar19 = updateUnreadBar;
updateUnreadBar = function (...a) {
  const r = _updateUnreadBar19(...a);
  const bar = $('.chat .unread-bar'), conv = activeConv(), convo = state.convos[conv];
  const idx = convo?.dividerId ? convo.messages.findIndex(m => m.id === convo.dividerId) : -1;
  if (bar && idx >= 0 && convo.messages.length - idx >= 10 && !$('[data-ub=cu]', bar)) {
    const b = document.createElement('button');
    b.dataset.ub = 'cu'; b.className = 'ub-cu'; b.textContent = '✨ Catch me up';
    $('[data-ub=read]', bar)?.before(b);
    b.addEventListener('click', e => { e.stopPropagation(); openCatchUp(conv, convo.messages[idx].createdAt - 1); });
  }
  return r;
};

// ======================= top bar: threads and catch-up =======================
const _renderDMHeader19 = renderDMHeader;
renderDMHeader = function () {
  _renderDMHeader19();
  const bar = $('#main .topbar');
  const conv = activeConv();
  if (!bar || !conv || user(conv)?.system) return;
  const tools = $('.tb-tools', bar) || bar;
  if (isChannelConv(conv) && !$('#threads-btn', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'threads-btn'; b.title = 'Threads'; b.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm14 6h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2v3l-4-3h-5a2 2 0 0 1-2-2v-1h6a4 4 0 0 0 4-4z"/></svg>';
    tools.prepend(b);
    b.addEventListener('click', e => openThreadList(e.currentTarget));
  }
  if (!$('#catchup-btn', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'catchup-btn'; b.title = 'Catch me up'; b.innerHTML = CATCHUP_ICON;
    tools.prepend(b);
    b.addEventListener('click', () => openCatchUp());
  }
  compactTopbar();
};

// On phones the chat's top bar has more buttons than fit: the extras go in a "⋯" menu. (Hidden
// buttons stay parked under the ⋯ so the popups they open appear in the right place.)
function compactTopbar() {
  const bar = $('#main .topbar');
  if (!bar || !activeConv()) return;
  const keep = b => b.id === 'inbox-btn' || b.id === 'tb-more' || b.dataset.act === 'nav' || b.closest('.title, .tb-search');
  const extras = $$('.icon-btn', bar).filter(b => !keep(b));
  const phone = VW <= 760;
  extras.forEach(b => b.classList.toggle('tb-ovf', phone));
  let more = $('#tb-more', bar);
  if (!phone || !extras.length) { more?.remove(); return; }
  if (!more) {
    more = document.createElement('button');
    more.className = 'icon-btn'; more.id = 'tb-more'; more.title = 'More'; more.textContent = '⋯';
    bar.appendChild(more);
    more.addEventListener('click', () => openMenu(more, $$('.tb-ovf', bar).map(b => ({ label: b.title || b.getAttribute('aria-label') || 'Option', icon: `<span class="mi-ico tb-ovf-ico">${b.innerHTML}</span>`, run: () => b.click() }))));
  }
}
addEventListener('resize', () => compactTopbar());

// ======================= composer: stickers and the shortcuts hint =======================
const _renderComposer19 = renderComposer;
renderComposer = function () {
  _renderComposer19();
  const el = $('#composer');
  const gifBtn = $('#composer-gif', el || document);
  if (el && gifBtn && !$('#composer-sticker', el)) {
    const b = document.createElement('button');
    b.className = 'composer-sticker'; b.id = 'composer-sticker'; b.title = 'Stickers'; b.setAttribute('aria-label', 'Stickers'); b.innerHTML = STICKER_ICON;
    gifBtn.before(b);
    b.addEventListener('click', e => { const conv = activeConv(); openStickerPicker(e.currentTarget, s => sendSticker(conv, s)); });
  }
  if (el && $('#composer-input', el) && !isPhone() && !$('.kb-hint', el)) {
    el.insertAdjacentHTML('beforeend', '<div class="kb-hint"><kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <a href="#" id="kb-hint-open"><kbd>Ctrl</kbd>+<kbd>/</kbd> all keyboard shortcuts</a></div>');
    $('#kb-hint-open', el).addEventListener('click', e => { e.preventDefault(); openShortcuts(); });
  }
};

// ======================= keyboard shortcuts =======================
const SHORTCUTS = [
  ['Navigation', [['Ctrl+K', 'Jump to a chat, channel or server'], ['Alt+↑ / Alt+↓', 'Previous / next channel or DM'], ['Ctrl+Shift+F', 'Search every chat'], ['Ctrl+F', 'Search this chat'], ['Esc', 'Close or cancel']]],
  ['Messages', [['Enter', 'Send'], ['Shift+Enter', 'New line'], ['↑', 'Edit your last message'], ['Ctrl+E', 'Emoji picker'], ['Ctrl+Shift+S', 'Saved messages'], ['Ctrl+Shift+U', 'Catch me up on this chat'], ['Shift+Click delete', 'Delete without asking']]],
  ['Calls', [['Ctrl+Shift+M', 'Mute / unmute'], ['Ctrl+Shift+D', 'Deafen / undeafen']]],
  ['Zuno', [['Ctrl+/', 'Show these shortcuts'], ['Ctrl+,', 'Settings'], ['/', 'Search settings (in Settings)']]],
];
function openShortcuts() {
  const keys = k => k.split(' / ').map(part => part.split('+').map(x => `<kbd>${esc(x)}</kbd>`).join('+')).join(' / ');
  const ov = openLayer(`<div class="dialog modal shortcuts-modal"><h3>⌨️ Keyboard shortcuts</h3>${SHORTCUTS.map(([group, list]) => `<h4 class="setting-head">${group}</h4><div class="shortcuts">${list.map(([k, d]) => `<div class="shortcut"><span>${d}</span><span>${keys(k)}</span></div>`).join('')}</div>`).join('')}
    <div class="actions"><button class="btn btn-primary" data-a="ok">Got it</button></div></div>`);
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
}
// The list of chats you can move through with Alt+↑/↓: the server's text channels, or your DMs.
function neighbourChat(step) {
  if (state.view.type === 'channel' || state.view.type === 'voice') {
    const ids = $$('#sidebar-scroll .ch-item[data-ch]').map(x => x.dataset.ch);
    const sv = currentServer();
    const list = ids.filter(id => sv?.channels.find(c => c.id === id)?.type === 'text');
    const i = list.indexOf(state.view.channelId);
    const next = list[(i + step + list.length) % list.length];
    if (next) openChannel(sv.id, next);
    return;
  }
  const rows = $$('#sidebar-scroll .dm-item[data-dm], #sidebar-scroll [data-group]');
  const cur = state.view.type === 'dm' ? state.view.peerId : state.view.type === 'group' ? state.view.groupId : null;
  const i = rows.findIndex(r => (r.dataset.dm || r.dataset.group) === cur);
  const next = rows[(i + step + rows.length) % rows.length];
  next?.click();
}
document.addEventListener('keydown', e => {
  if (!state.me) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && document.activeElement.id !== 'composer-input';
  if (ctrl && k === '/') { e.preventDefault(); e.stopImmediatePropagation(); return $('.shortcuts-modal') ? closeLayer() : openShortcuts(); }
  if (typing) return;
  if (e.altKey && !ctrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); return neighbourChat(e.key === 'ArrowUp' ? -1 : 1); }
  if (ctrl && e.shiftKey && k === 'm' && Calls.room) { e.preventDefault(); return Calls.toggleMute(); }
  if (ctrl && e.shiftKey && k === 'd' && Calls.room) { e.preventDefault(); return Calls.toggleDeafen(); }
  if (ctrl && e.shiftKey && k === 's') { e.preventDefault(); const b = $('#saved-btn'); return b ? openSaved(b) : null; }
  if (ctrl && e.shiftKey && k === 'u' && activeConv()) { e.preventDefault(); return openCatchUp(); }
  if (ctrl && !e.shiftKey && k === 'e' && $('#composer-emoji')) { e.preventDefault(); return $('#composer-emoji').click(); }
  if (ctrl && e.key === ',') { e.preventDefault(); return openSettings(); }
}, true);

// ======================= saved messages: folders =======================
openSaved = async function (anchor, folder = '') {
  const box = popover(anchor, 'pins-pop saved-pop', `<div class="pop-head">🔖 Saved Messages</div><div class="sv-folders"></div><div class="pop-list"><div class="fp-empty">Loading…</div></div>`);
  const saved = await loadSaved();
  if (!box.isConnected) return;
  const folders = state.savedFolders || [];
  const count = f => saved.filter(s => (f === '' ? true : f === '\u0000' ? !s.folder : s.folder === f)).length;
  $('.sv-folders', box).innerHTML = [['', 'All'], ...folders.map(f => [f, '📁 ' + f])].map(([f, l]) => `<button class="chip${folder === f ? ' on' : ''}" data-svf="${esc(f)}">${esc(l)} <small>${count(f)}</small></button>`).join('') + '<button class="chip add" id="svf-new">+ Folder</button>';
  $$('[data-svf]', box).forEach(b => {
    b.addEventListener('click', () => openSaved(anchor, b.dataset.svf));
    if (b.dataset.svf) b.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(b, [{ label: 'Rename Folder', run: () => folderPrompt('Rename folder', b.dataset.svf, async name => { await api('PATCH', '/api/me/saved-folders', { from: b.dataset.svf, to: name }); await refreshFolders(); }) }, { label: 'Delete Folder', danger: true, run: async () => { await api('DELETE', `/api/me/saved-folders/${encodeURIComponent(b.dataset.svf)}`); await refreshFolders(); } }]); });
  });
  $('#svf-new', box).addEventListener('click', () => folderPrompt('New folder', '', async name => { await api('POST', '/api/me/saved-folders', { name }); await refreshFolders(); openSaved(anchor, name); }));
  const list = $('.pop-list', box);
  const shown = saved.filter(s => !folder || s.folder === folder);
  if (!shown.length) { list.innerHTML = `<div class="fp-empty">${mascot('curious')}<div>${folder ? `Nothing in <b>${esc(folder)}</b> yet. Use the 📁 button on a saved message to move it here.` : 'Nothing saved yet. Right-click a message and pick <b>Save Message</b> or <b>Remind Me</b>.'}</div></div>`; return; }
  list.innerHTML = shown.map(s => {
    const a = s.author || { id: s.snap.authorId, displayName: 'Someone' };
    return `<div class="pi-msg sv-item" data-sv="${esc(s.id)}">${avatar(a, 32)}<div class="pi-body"><div><b>${esc(a.displayName)}</b> <span class="muted small">${fmtTime(s.snap.createdAt)}</span>${s.folder ? ` <span class="sv-ftag">📁 ${esc(s.folder)}</span>` : ''}</div>
      <div class="muted small">${esc(s.snap.where)}</div><div class="pi-text">${formatMessage(s.snap.content || '')}</div>
      ${s.remindAt ? `<div class="sv-remind">⏰ Reminder ${esc(whenText(s.remindAt))}</div>` : s.remindedAt ? '<div class="sv-remind done">✓ Reminded</div>' : ''}</div>
      <div class="sv-acts"><button class="btn btn-grey btn-sm" data-svgo>Jump</button><button class="icon-btn" data-svfold title="Move to folder">📁</button><button class="icon-btn" data-svrem title="Remind me">⏰</button><button class="icon-btn" data-svdel title="Remove">✕</button></div></div>`;
  }).join('');
  $$('[data-sv]', list).forEach(row => {
    const s = saved.find(x => x.id === row.dataset.sv);
    $('[data-svgo]', row).addEventListener('click', () => { closeLayer(); jumpToSaved(s); });
    $('[data-svdel]', row).addEventListener('click', async () => { await unsaveMessage(s.id); row.remove(); if (!$('[data-sv]', list)) openSaved(anchor, folder); });
    $('[data-svrem]', row).addEventListener('click', e => openMenu(e.currentTarget, [...REMIND.map(([label, v]) => ({ label, run: () => saveMessage(s.conv, s.msgId, remindMs(v)) })), ...(s.remindAt ? ['sep', { label: 'Cancel Reminder', run: () => saveMessage(s.conv, s.msgId, 0) }] : [])]));
    $('[data-svfold]', row).addEventListener('click', e => openMenu(e.currentTarget, [
      ...folders.map(f => ({ label: (s.folder === f ? '✓ ' : '') + f, run: async () => { await api('PATCH', `/api/me/saved/${s.id}`, { folder: f }); openSaved(anchor, folder); } })),
      ...(s.folder ? ['sep', { label: 'Take Out of Folder', run: async () => { await api('PATCH', `/api/me/saved/${s.id}`, { folder: '' }); openSaved(anchor, folder); } }] : []),
      'sep', { label: '+ New Folder…', run: () => folderPrompt('New folder', '', async name => { await api('POST', '/api/me/saved-folders', { name }); await api('PATCH', `/api/me/saved/${s.id}`, { folder: name }); await refreshFolders(); openSaved(anchor, name); }) },
    ]));
  });
};
async function refreshFolders() {
  try { state.savedFolders = (await api('GET', '/api/me/z19')).savedFolders || []; } catch {}
}
function folderPrompt(title, value, done) {
  const ov = openLayer(`<form class="dialog modal"><h3>${esc(title)}</h3><label class="field">Folder name<input name="name" maxlength="32" value="${esc(value)}" required></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  f.name.select();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => { e.preventDefault(); try { closeLayer(); await done(f.name.value.trim()); } catch (err) { toast(err.message, true); } });
}

// ======================= Listen Together & Watch Together =======================
// YouTube in a call, in sync for everyone in it. Listen Together is free; Watch Together needs Bloom.
let activity = null, activityRoom = null, ytPlayer = null, ytReady = null, ytLoadedId = null, syncTimer = null;
function loadYouTube() {
  if (ytReady) return ytReady;
  ytReady = new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytReady;
}
window.openActivities = function (anchor) {
  if (!Calls.room) return toast('Join a call first.', true);
  if (activity && activityRoom === Calls.room) return showActivityPanel();
  openMenu(anchor, [
    { label: '🎧 Listen Together (free)', run: () => startActivity('listen') },
    { label: `🎬 Watch Together${hasBloomNow() ? '' : ' (Bloom)'}`, run: () => (hasBloomNow() ? startActivity('watch') : confirmDialog('Watch Together is a Bloom perk', 'Watch YouTube in sync with everyone in your call. Listen Together is free for everyone.', 'See Zuno Bloom', () => openSettings('bloom'))) },
  ]);
};
async function startActivity(type) {
  try { const { activity: a } = await api('POST', '/api/activity/start', { room: Calls.room, type }); onActivity({ room: Calls.room, activity: a }); }
  catch (e) { toast(e.message, true); }
}
const activityPos = a => {
  if (!a) return 0;
  const drift = Date.now() - a.now; // the server's clock vs ours
  return a.playing ? a.position + (Date.now() - drift - a.updatedAt) / 1000 : a.position;
};
function onActivity({ room, activity: a }) {
  if (room !== Calls.room) return;
  if (a) a.receivedAt = Date.now();
  const was = activity;
  activity = a; activityRoom = room;
  if (!a) { closeActivityPanel(); if (was) toast(`${was.type === 'watch' ? 'Watch' : 'Listen'} Together ended.`); return; }
  showActivityPanel();
}
function closeActivityPanel() {
  clearInterval(syncTimer); syncTimer = null;
  try { ytPlayer?.destroy(); } catch {}
  ytPlayer = null; ytLoadedId = null;
  $('#activity-panel')?.remove();
}
async function actControl(action, extra = {}) {
  try { const { activity: a } = await api('POST', '/api/activity/control', { room: activityRoom, action, ...extra }); onActivity({ room: activityRoom, activity: a }); }
  catch (e) { toast(e.message, true); }
}
async function showActivityPanel() {
  const a = activity;
  if (!a) return;
  let panel = $('#activity-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'activity-panel';
    panel.innerHTML = `<div class="ap-head"><b class="ap-title"></b><button class="icon-btn" data-ap="min" title="Make smaller">▁</button><button class="icon-btn" data-ap="stop" title="End for everyone">✕</button></div>
      <div class="ap-stage"><div class="ap-player"><div id="ap-yt"></div></div><div class="ap-art"></div></div>
      <div class="ap-now"></div>
      <div class="ap-controls"><button class="icon-btn" data-ap="prev" title="Previous">⏮</button><button class="icon-btn ap-play" data-ap="toggle" title="Play / Pause">▶</button><button class="icon-btn" data-ap="next" title="Next">⏭</button>
        <input type="range" class="ap-seek" min="0" max="100" value="0" step="1"><span class="ap-time muted small">0:00</span>
        <input type="range" class="ap-vol" min="0" max="100" value="${Number(localStorage.getItem('zuno_act_vol') || 70)}" title="Volume (only for you)"></div>
      <form class="ap-add"><input name="url" placeholder="Paste a YouTube link to add it to the queue" autocomplete="off"><button class="btn btn-primary btn-sm">Add</button></form>
      <div class="ap-queue"></div>`;
    document.body.appendChild(panel);
    $$('[data-ap]', panel).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.ap;
      if (k === 'min') return panel.classList.toggle('min');
      if (k === 'stop') return confirmDialog('End it for everyone?', 'The queue is cleared for everyone in the call.', 'End', () => api('POST', '/api/activity/stop', { room: activityRoom }).catch(e => toast(e.message, true)));
      if (k === 'toggle') return actControl(activity.playing ? 'pause' : 'play');
      actControl(k);
    }));
    $('.ap-seek', panel).addEventListener('change', e => { const d = ytPlayer?.getDuration?.() || 0; if (d) actControl('seek', { position: (Number(e.target.value) / 100) * d }); });
    $('.ap-vol', panel).addEventListener('input', e => { localStorage.setItem('zuno_act_vol', e.target.value); ytPlayer?.setVolume?.(Number(e.target.value)); });
    $('.ap-add', panel).addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.currentTarget, url = f.url.value.trim();
      if (!url) return;
      f.url.value = '';
      try { const { activity: x } = await api('POST', '/api/activity/add', { room: activityRoom, url }); onActivity({ room: activityRoom, activity: x }); }
      catch (err) { f.url.value = url; toast(err.message, true); }
    });
  }
  panel.className = `activity-panel ap-${a.type}${panel.classList.contains('min') ? ' min' : ''}`;
  $('.ap-title', panel).textContent = a.type === 'watch' ? '🎬 Watch Together' : '🎧 Listen Together';
  const cur = a.queue[a.index];
  $('.ap-now', panel).innerHTML = cur ? `<b>${esc(cur.title)}</b><span class="muted small">${esc(cur.author)} · added by ${esc(user(cur.by)?.displayName || 'someone')}</span>` : '<span class="muted">Nothing playing. Paste a YouTube link below to start.</span>';
  $('.ap-art', panel).innerHTML = cur ? `<img src="https://i.ytimg.com/vi/${esc(cur.videoId)}/hqdefault.jpg" alt="">` : mascot('sleepy');
  $('.ap-play', panel).textContent = a.playing ? '⏸' : '▶';
  $('.ap-queue', panel).innerHTML = a.queue.map((q, i) => `<div class="ap-q${i === a.index ? ' on' : ''}" data-qi="${i}"><img src="https://i.ytimg.com/vi/${esc(q.videoId)}/default.jpg" alt=""><div><b>${esc(q.title)}</b><span class="muted small">${esc(q.author)}</span></div><button class="icon-btn" data-qrm="${i}" title="Remove">✕</button></div>`).join('');
  $$('[data-qi]', panel).forEach(r => r.addEventListener('click', e => (e.target.closest('[data-qrm]') ? actControl('remove', { index: Number(e.target.closest('[data-qrm]').dataset.qrm) }) : actControl('jump', { index: Number(r.dataset.qi) }))));
  if (!cur) { try { ytPlayer?.stopVideo?.(); } catch {} return; }
  await loadYouTube();
  if (!ytPlayer) {
    ytPlayer = await new Promise(resolve => {
      const p = new YT.Player('ap-yt', {
        width: '100%', height: '100%', videoId: cur.videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, start: Math.floor(activityPos(activity)) },
        events: {
          onReady: () => resolve(p),
          onStateChange: ev => { if (ev.data === YT.PlayerState.ENDED && activity) actControl('ended', { index: activity.index }); },
          // (0.47) A video that can't play here (removed, private or not allowed outside YouTube) is skipped.
          onError: () => { if (!activity) return; const bad = activity.queue[activity.index]; toast(`Couldn't play "${bad?.title || 'that video'}" here, so it was skipped.`, true); actControl('ended', { index: activity.index }); },
        },
      });
    });
    ytLoadedId = cur.videoId;
    ytPlayer.setVolume(Number(localStorage.getItem('zuno_act_vol') || 70));
  }
  syncPlayer();
  clearInterval(syncTimer);
  syncTimer = setInterval(syncPlayer, 2000);
}
// Keep everyone's player within a few seconds of the shared position.
const sync19 = {};
function syncPlayer() {
  const a = activity, p = ytPlayer;
  if (!a || !p?.getPlayerState) return;
  const cur = a.queue[a.index];
  if (!cur) return;
  const want = activityPos(a);
  if (ytLoadedId !== cur.videoId) { ytLoadedId = cur.videoId; a.playing ? p.loadVideoById(cur.videoId, want) : p.cueVideoById(cur.videoId, want); return; }
  const st = p.getPlayerState();
  if (a.playing && st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING && st !== YT.PlayerState.ENDED) p.playVideo();
  if (!a.playing && st === YT.PlayerState.PLAYING) p.pauseVideo();
  const at = p.getCurrentTime?.() || 0;
  // (0.47) It used to jump to the shared spot every 2 seconds even while the video was still
  // loading, which made it load again, so on a slow connection it never got going ("stuck").
  // Now it only jumps when it's playing and far off, at most every 8 seconds, and a video that
  // hasn't moved for a while is reloaded at the right spot.
  const now = Date.now();
  sync19.moved = !a.playing || sync19.vid !== cur.videoId || Math.abs(at - (sync19.at ?? -1)) > 0.2 ? now : sync19.moved || now;
  sync19.vid = cur.videoId;
  sync19.at = at;
  if (st !== YT.PlayerState.BUFFERING && Math.abs(at - want) > 4 && now - (sync19.seek || 0) > 8000) { sync19.seek = now; p.seekTo(want, true); }
  if (a.playing && now - sync19.moved > 9000 && now - (sync19.reload || 0) > 15000) { sync19.reload = now; sync19.moved = now; p.loadVideoById(cur.videoId, activityPos(a)); }
  const d = p.getDuration?.() || 0;
  const panel = $('#activity-panel');
  if (panel && d) {
    const seek = $('.ap-seek', panel);
    if (document.activeElement !== seek) seek.value = Math.min(100, ((at || want) / d) * 100);
    const t = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    $('.ap-time', panel).textContent = `${t(Math.min(at || want, d))} / ${t(d)}`;
  }
}
// Leaving the call closes the player.
setInterval(() => { if (activity && Calls.room !== activityRoom) { activity = null; closeActivityPanel(); } }, 1500);

// ======================= server events =======================
const CAL_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm12 8H5v9h14zM7 12h4v4H7z"/></svg>';
const _renderServerSidebar19 = renderServerSidebar;
renderServerSidebar = function () {
  _renderServerSidebar19();
  const sv = currentServer(), scroll = $('#sidebar-scroll');
  if (!sv || !scroll || $('#events-row', scroll)) return;
  const n = sv.eventCount || 0;
  const banner = $(':scope > .sv-banner', scroll);
  (banner || scroll).insertAdjacentHTML(banner ? 'afterend' : 'afterbegin', `<button class="events-row${sv.liveEvent ? ' live' : ''}" id="events-row">${CAL_ICON}<span>${sv.liveEvent ? `Live: ${esc(sv.liveEvent)}` : n ? `${n} Event${n === 1 ? '' : 's'}` : 'Events'}</span>${sv.liveEvent ? '<i class="live-dot"></i>' : n ? `<b class="ev-count">${n}</b>` : ''}</button>`);
  $('#events-row', scroll).addEventListener('click', () => openEvents(sv.id));
};
const fmtWhen = t => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const toLocalInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
async function openEvents(serverId) {
  const sv = state.servers.find(s => s.id === serverId);
  if (!sv) return;
  const ov = openLayer(`<div class="dialog modal events-modal"><div class="ev-top"><h3>📅 Events in ${esc(sv.name)}</h3><button class="btn btn-primary btn-sm hidden" id="ev-new">Create Event</button></div><div class="ev-list"><div class="fp-empty">Loading…</div></div>
    <div class="actions"><button class="btn btn-link" data-a="close">Close</button></div></div>`);
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
  const draw = async () => {
    let d;
    try { d = await api('GET', `/api/servers/${sv.id}/events`); } catch (e) { $('.ev-list', ov).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
    $('#ev-new', ov).classList.toggle('hidden', !d.canManage);
    $('.ev-list', ov).innerHTML = d.events.length ? d.events.map(e => {
      const ch = e.where.type === 'voice' && sv.channels.find(c => c.id === e.where.channelId);
      return `<div class="ev-card ${e.status}" data-ev="${esc(e.id)}"><div class="ev-date"><b>${new Date(e.startAt).getDate()}</b><span>${new Date(e.startAt).toLocaleString(undefined, { month: 'short' })}</span></div>
        <div class="ev-info">${e.status === 'live' ? '<span class="ev-live">● Happening now</span>' : e.status === 'ended' ? '<span class="muted small">Ended</span>' : `<span class="ev-when">${esc(fmtWhen(e.startAt))}${e.endAt ? ' – ' + esc(new Date(e.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) : ''}</span> <span class="ev-soon">${esc(typeof eventCountdown === 'function' ? eventCountdown(e.startAt) : '')}</span>`}${e.repeat === 'weekly' ? ' <span class="ev-rep" title="Happens every week">🔁 Weekly</span>' : ''}
          <b class="ev-name">${esc(e.name)}</b>${e.description ? `<div class="ev-desc">${formatMessage(e.description)}</div>` : ''}
          <div class="muted small">${ch ? `🔊 ${esc(ch.name)}` : e.where.text ? `📍 ${esc(e.where.text)}` : ''}${ch || e.where.text ? ' · ' : ''}by ${esc(e.creator?.displayName || 'someone')}</div>
          <button class="ev-faces" data-evpeople title="See who's interested">${(e.faces || []).map(u => avatar(u, 20)).join('')}<span>${e.interested} interested</span></button></div>
        <div class="ev-acts">${e.status !== 'ended' ? `<button class="btn btn-sm ${e.going ? 'btn-green' : 'btn-grey'}" data-evgo>${e.going ? '✓ Interested' : '☆ Interested'}</button>` : ''}${ch && e.status === 'live' ? '<button class="btn btn-primary btn-sm" data-evjoin>Join</button>' : ''}${e.status === 'live' && (d.canManage || e.creator?.id === state.me.id) ? '<button class="btn btn-red btn-sm" data-evend>End</button>' : ''}<button class="icon-btn" data-evmore title="More">⋯</button></div></div>`;
    }).join('') : `<div class="empty-state">${mascot('curious')}<div class="title">No events yet</div><div>${d.canManage ? 'Plan a game night, a watch party or a study session!' : 'When someone plans something, it shows up here.'}</div></div>`;
    $$('[data-ev]', ov).forEach(card => {
      const e = d.events.find(x => x.id === card.dataset.ev);
      $('[data-evgo]', card)?.addEventListener('click', async () => { try { await api('POST', `/api/servers/${sv.id}/events/${e.id}/interested`); draw(); } catch (err) { toast(err.message, true); } });
      $('[data-evjoin]', card)?.addEventListener('click', () => { closeLayer(); Calls.joinVoice(sv.id, e.where.channelId); openVoice?.(sv.id, e.where.channelId); });
      // Everything here opens over the Events window instead of closing it (the menu used to close
      // it first, so "End Event" looked like it did nothing).
      const mine = d.canManage || e.creator?.id === state.me.id;
      const setStatus = async (status, msg) => { try { await api('PATCH', `/api/servers/${sv.id}/events/${e.id}`, { status }); toast(msg); draw(); } catch (err) { toast(err.message, true); } };
      const end = () => setStatus('ended', e.repeat === 'weekly' ? `Ended. Next week's ${e.name} is on the calendar.` : `${e.name} ended.`);
      $('[data-evend]', card)?.addEventListener('click', end);
      $('[data-evpeople]', card)?.addEventListener('click', () => openEventPeople(sv, e));
      $('[data-evmore]', card)?.addEventListener('click', ev => openMenuOver(ev.currentTarget, [
        ...(mine && e.status === 'scheduled' ? [{ label: '▶ Start Now', run: () => setStatus('live', `${e.name} started!`) }] : []),
        ...(mine && e.status === 'live' ? [{ label: '■ End Event', run: end }] : []),
        ...(mine && e.status !== 'ended' ? [{ label: '✏️ Edit', run: () => eventForm(sv, e, draw) }] : []),
        ...(e.status !== 'ended' ? [{ label: '📅 Add to Calendar', run: () => eventIcs(sv, e) }] : []),
        { label: '⭐ Who\'s Interested', run: () => openEventPeople(sv, e) },
        ...(mine ? ['sep', { label: e.status === 'ended' ? 'Remove' : 'Cancel Event', danger: true, run: async () => { if (!(await confirmOver(e.status === 'ended' ? 'Remove this event?' : 'Cancel this event?', e.status === 'ended' ? '' : 'People who are interested get told.', e.status === 'ended' ? 'Remove' : 'Cancel Event'))) return; try { await api('DELETE', `/api/servers/${sv.id}/events/${e.id}`); toast(e.status === 'ended' ? 'Removed' : 'Event cancelled'); draw(); } catch (err) { toast(err.message, true); } } }] : []),
      ]));
    });
  };
  $('#ev-new', ov).addEventListener('click', () => eventForm(sv, null, draw));
  draw();
  openEvents.redraw = draw;
}
function eventForm(sv, e, done) {
  const voice = sv.channels.filter(c => c.type === 'voice');
  const start = e?.startAt || Math.ceil((Date.now() + 3600e3) / 1800e3) * 1800e3;
  const box = document.createElement('div');
  box.className = 'overlay';
  box.innerHTML = `<form class="dialog modal ev-form"><h3>${e ? 'Edit event' : '📅 Create an event'}</h3>
    <label class="field">Name<input name="name" maxlength="80" required value="${esc(e?.name || '')}" placeholder="Game night"></label>
    <div class="ev-row"><label class="field">Starts<input type="datetime-local" name="start" required value="${toLocalInput(start)}"></label>
      <label class="field">Ends <span class="hint">(optional)</span><input type="datetime-local" name="end" value="${e?.endAt ? toLocalInput(e.endAt) : ''}"></label></div>
    <label class="field">Where<select name="wtype" class="sc-select"><option value="voice"${e?.where.type !== 'place' && voice.length ? ' selected' : ''}${voice.length ? '' : ' disabled'}>A voice channel</option><option value="place"${e?.where.type === 'place' || !voice.length ? ' selected' : ''}>Somewhere else</option></select></label>
    <label class="field ev-voice">Voice channel<select name="channel" class="sc-select">${voice.map(c => `<option value="${esc(c.id)}"${e?.where.channelId === c.id ? ' selected' : ''}>🔊 ${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field ev-place">Place or link<input name="place" maxlength="120" value="${esc(e?.where.text || '')}" placeholder="Minecraft server, a park, a link…"></label>
    <label class="field">Description <span class="hint">(optional)</span><textarea name="description" maxlength="1000" rows="3">${esc(e?.description || '')}</textarea></label>
    <label class="setting-row ev-repeat"><div style="flex:1"><div class="setting-title">🔁 Repeat every week</div><div class="setting-desc">When it ends, next week's is put on the calendar.</div></div><input type="checkbox" class="switch" name="repeat"${e?.repeat === 'weekly' ? ' checked' : ''}></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">${e ? 'Save' : 'Create Event'}</button></div></form>`;
  document.body.appendChild(box);
  const f = $('form', box);
  const sync = () => { $('.ev-voice', f).classList.toggle('hidden', f.wtype.value !== 'voice'); $('.ev-place', f).classList.toggle('hidden', f.wtype.value !== 'place'); };
  f.wtype.addEventListener('change', sync); sync();
  $('[data-a=cancel]', f).addEventListener('click', () => box.remove());
  box.addEventListener('mousedown', ev => { if (ev.target === box) box.remove(); });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = { name: f.name.value, startAt: new Date(f.start.value).getTime(), endAt: f.end.value ? new Date(f.end.value).getTime() : null, description: f.description.value, repeat: f.repeat.checked ? 'weekly' : null,
      where: f.wtype.value === 'voice' ? { type: 'voice', channelId: f.channel.value } : { type: 'place', text: f.place.value } };
    try {
      if (e) await api('PATCH', `/api/servers/${sv.id}/events/${e.id}`, body); else await api('POST', `/api/servers/${sv.id}/events`, body);
      box.remove(); toast(e ? 'Event saved' : '📅 Event created! Members can mark themselves interested.'); done();
    } catch (err) { toast(err.message, true); }
  });
}
NOTIF_TEXT.event = n => `📅 <b>${esc(n.title)}</b> ${esc(n.text)}`;
NOTIF_TEXT.staff = () => '🛡️ <b>staff activity</b>';

// ======================= recovery codes & where you're logged in =======================
const _renderSecurity19 = renderSecurity;
renderSecurity = async function (body) {
  await _renderSecurity19(body);
  const devices = $('#sec-devices', body)?.closest('.setting-group');
  if (devices && !$('#sec-map', body)) {
    devices.querySelector('.setting-head').insertAdjacentHTML('afterend', '<div id="sec-map" class="sec-map"><div class="fp-empty">Loading map…</div></div>');
    drawSessionMap($('#sec-map', body));
  }
  if (!$('#rc-group', body)) {
    const g = document.createElement('div');
    g.className = 'setting-group'; g.id = 'rc-group';
    g.innerHTML = '<h4 class="setting-head">Recovery codes</h4><div class="setting-row"><div><div class="setting-title" id="rc-title">Recovery codes</div><div class="setting-desc">If you forget your password and can\'t get to your email (or lose your two-factor device), a recovery code gets you back in. Each code works once.</div></div><div class="row-btns"><button class="btn btn-grey btn-sm" id="rc-make">Make Codes</button></div></div>';
    (devices || body.lastElementChild).before(g);
    const load = async () => { try { const r = await api('GET', '/api/me/recovery-codes'); $('#rc-title', g).textContent = r.left ? `${r.left} recovery code${r.left === 1 ? '' : 's'} left` : 'No recovery codes yet'; $('#rc-make', g).textContent = r.createdAt ? 'Make New Codes' : 'Make Codes'; } catch {} };
    load();
    $('#rc-make', g).addEventListener('click', () => {
      const ov = openLayer(`<form class="dialog modal"><h3>🔑 Recovery codes</h3><p class="muted" style="margin:0 0 12px">Type your password to make 10 new codes. Any old codes stop working.</p>
        <label class="field">Your password<input name="password" type="password" required autocomplete="current-password"></label>
        <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Make Codes</button></div></form>`);
      const f = $('form', ov);
      f.password.focus();
      $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const { codes } = await api('POST', '/api/me/recovery-codes', { password: f.password.value });
          closeLayer(); load(); showRecoveryCodes(codes);
        } catch (err) { toast(err.message, true); }
      });
    });
  }
};
function showRecoveryCodes(codes) {
  const text = `Zuno recovery codes for ${state.me.username}\nEach code works once. Use one on the login screen ("Use a recovery code") if you can't log in.\n\n${codes.join('\n')}\n`;
  const ov = openLayer(`<div class="dialog modal"><h3>🔑 Save these somewhere safe</h3><p class="muted" style="margin:0 0 12px">You won't see them again. Each one works once.</p>
    <div class="rc-codes">${codes.map(c => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="actions"><button class="btn btn-grey" data-a="copy">Copy</button><button class="btn btn-grey" data-a="dl">Download</button><button class="btn btn-primary" data-a="ok">I saved them</button></div></div>`);
  $('[data-a=copy]', ov).addEventListener('click', () => { navigator.clipboard?.writeText(text); toast('Copied'); });
  $('[data-a=dl]', ov).addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'zuno-recovery-codes.txt'; a.click(); });
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
}
// The login screen: "Use a recovery code".
const _showAuth19 = showAuth;
showAuth = function () {
  _showAuth19();
  if (!$('#auth-recover') && $('#auth-forgot')) {
    $('#auth-forgot').insertAdjacentHTML('afterend', '<a href="#" class="small login-only" id="auth-recover">Use a recovery code</a>');
    $('#auth-recover').addEventListener('click', e => { e.preventDefault(); openRecover(); });
  }
};
function openRecover() {
  const ov = openLayer(`<form class="dialog modal"><h3>🔑 Use a recovery code</h3><p class="muted" style="margin:0 0 12px">Type your username (or email), one of your recovery codes, and a new password. You'll be logged out everywhere else.</p>
    <label class="field">Email or username<input name="login" required autocomplete="username" autocapitalize="off"></label>
    <label class="field">Recovery code<input name="code" required placeholder="ABCD-EFGH" autocapitalize="characters" autocomplete="one-time-code"></label>
    <label class="field">New password<input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
    <div class="form-error" id="rc-err"></div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Log In</button></div></form>`);
  const f = $('form', ov);
  f.login.value = $('#auth-form [name=username]')?.value || '';
  (f.login.value ? f.code : f.login).focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/recover', { login: f.login.value, code: f.code.value, password: f.pw.value });
      localStorage.setItem('zuno_token', r.token);
      location.href = '/';
    } catch (err) { $('#rc-err', ov).textContent = err.message; }
  });
}
// A map of where you're logged in (city level), drawn with OpenStreetMap.
let leafletReady = null;
function loadLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = resolve; s.onerror = () => { leafletReady = null; reject(new Error('map')); };
    document.head.appendChild(s);
  });
  return leafletReady;
}
async function drawSessionMap(box) {
  let list;
  try { list = (await api('GET', '/api/me/sessions/map')).sessions; } catch { box.remove(); return; }
  const placed = list.filter(s => typeof s.lat === 'number');
  const where = s => (s.local ? 'Local network' : [s.city, s.region, s.country].filter(Boolean).join(', ') || 'Unknown place');
  box.innerHTML = `<div class="sm-map" id="sm-map"></div><div class="sm-list">${list.map(s => `<div class="sm-row${s.current ? ' cur' : ''}"><span class="sm-pin">${s.current ? '📍' : '•'}</span><b>${esc(deviceName(s.agent))}</b><span class="muted small">${esc(where(s))}${s.current ? ' · this device' : s.lastSeen ? ' · ' + esc(fmtTime(s.lastSeen)) : ''}</span></div>`).join('')}</div>
    <p class="muted small" style="margin:6px 0 0">Places are approximate (city level), worked out from each device's internet address.</p>`;
  if (!placed.length) { $('#sm-map', box).innerHTML = `<div class="fp-empty">${mascot('curious')}<div>No locations to show yet.</div></div>`; return; }
  try { await loadLeaflet(); } catch { $('#sm-map', box).remove(); return; }
  const map = L.map($('#sm-map', box), { zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 10, attribution: '© OpenStreetMap' }).addTo(map);
  const pts = [];
  for (const s of placed) {
    const ll = [s.lat, s.lon];
    pts.push(ll);
    L.circleMarker(ll, { radius: s.current ? 9 : 7, color: s.current ? '#04c5ae' : '#f0b232', weight: 3, fillOpacity: 0.6 }).addTo(map).bindTooltip(`${deviceName(s.agent)}<br>${where(s)}${s.current ? '<br><b>This device</b>' : ''}`);
  }
  if (pts.length === 1) map.setView(pts[0], 6); else map.fitBounds(pts, { padding: [30, 30], maxZoom: 6 });
}

// ======================= swipe gestures (phones) =======================
// Swipe a message right to reply, or swipe an open thread right to close it. (Swiping from the left
// edge to open the side menu is in polish.js.)
(() => {
  let sx = 0, sy = 0, row = null, edge = false, active = false, dx = 0;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dx = 0; active = false;
    edge = sx < 40;
    row = null; // (0.49) replying is a swipe to the left now, with the chat list on a swipe to the right (zuno49.js)
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (!t) return;
    dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (!active && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) active = true;
    if (!active) return;
    if (row && !edge && dx > 0) { row.style.transform = `translateX(${Math.min(dx, 90)}px)`; row.classList.toggle('swipe-ready', dx > 64); }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (active && !edge) {
      if (row && dx > 64) { const id = row.dataset.id; if (navigator.vibrate) navigator.vibrate(12); startReply(id); }
      else if ($('#thread-panel') && dx > 90 && !row) closeThread();
    }
    if (row) { row.style.transition = 'transform .2s'; row.style.transform = ''; row.classList.remove('swipe-ready'); const r = row; setTimeout(() => { r.style.transition = ''; }, 220); }
    row = null; active = false; edge = false;
  });
})();

// ======================= maintenance notices =======================
function renderMaintenance(m) {
  state.maintenance = m || null;
  let bar = $('#maint-bar');
  const dismissed = (() => { try { return localStorage.getItem('zuno_maint_hide'); } catch { return null; } })();
  if (!m || dismissed === m.id) { bar?.remove(); clearInterval(renderMaintenance.t); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'maint-bar'; bar.className = 'maint-bar'; bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  const draw = () => {
    const left = m.at - Date.now();
    const end = m.at + m.minutes * 60e3;
    if (Date.now() > end + 3600e3) { bar.remove(); clearInterval(renderMaintenance.t); return; }
    const inText = left <= 0 ? (Date.now() < end ? 'now' : 'just now') : left < 60e3 ? 'in less than a minute' : left < 3600e3 ? `in ${Math.ceil(left / 60e3)} min` : `at ${new Date(m.at).toLocaleString(undefined, { weekday: left > 864e5 ? 'short' : undefined, hour: 'numeric', minute: '2-digit' })}`;
    bar.innerHTML = `<span class="mb-ico">🛠️</span><div><b>${left <= 0 && Date.now() < end ? 'Zuno is updating now' : `Zuno is updating ${inText}`}</b> <span>for about ${m.minutes} minute${m.minutes === 1 ? '' : 's'}.${m.message ? ' ' + esc(m.message) : ''}</span></div><button class="icon-btn" title="Hide">✕</button>`;
    bar.classList.toggle('soon', left < 10 * 60e3);
    $('button', bar).addEventListener('click', () => { try { localStorage.setItem('zuno_maint_hide', m.id); } catch {} bar.remove(); clearInterval(renderMaintenance.t); });
  };
  draw();
  clearInterval(renderMaintenance.t);
  renderMaintenance.t = setInterval(draw, 15e3);
}
// Staff: schedule one from Settings › Setup Status.
const _renderSetupStatus19 = renderSetupStatus;
renderSetupStatus = async function (body) {
  await _renderSetupStatus19(body);
  if (!body || $('#maint-group', body)) return;
  const m = state.maintenance;
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'maint-group';
  g.innerHTML = `<h4 class="setting-head">🛠️ Maintenance notice</h4>
    <p class="muted small" style="margin:0 0 10px">Warn everyone before an update or restart. A banner counts down in every open Zuno.</p>
    ${m ? `<div class="setting-row"><div><div class="setting-title">Scheduled for ${esc(new Date(m.at).toLocaleString())}</div><div class="setting-desc">About ${m.minutes} min.${m.message ? ' ' + esc(m.message) : ''}</div></div><button class="btn btn-red btn-sm" id="mt-cancel">Cancel Notice</button></div>` : ''}
    <form id="mt-form" class="mt-form"><label class="field">When<input type="datetime-local" name="at" required value="${toLocalInput(Math.ceil((Date.now() + 1800e3) / 300e3) * 300e3)}"></label>
      <label class="field">How long (minutes)<input type="number" name="minutes" min="1" max="600" value="5" required></label>
      <label class="field">Message <span class="hint">(optional)</span><input name="message" maxlength="240" placeholder="New features are coming!"></label>
      <button class="btn btn-primary btn-sm">${m ? 'Replace Notice' : 'Schedule Notice'}</button></form>`;
  body.appendChild(g);
  $('#mt-cancel', g)?.addEventListener('click', async () => { try { await api('DELETE', '/api/staff/maintenance'); toast('Notice cancelled'); showSettingsSection('setup'); } catch (e) { toast(e.message, true); } });
  $('#mt-form', g).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    try { await api('POST', '/api/staff/maintenance', { at: new Date(f.at.value).getTime(), minutes: Number(f.minutes.value), message: f.message.value }); toast('🛠️ Everyone will see the notice'); showSettingsSection('setup'); }
    catch (err) { toast(err.message, true); }
  });
};

// ======================= live updates =======================
function hook19(es) {
  if (!es) return;
  es.addEventListener('thread-message', e => {
    const d = JSON.parse(e.data);
    if (d.author) state.users[d.author.id] = { ...state.users[d.author.id], ...d.author };
    if (threadView?.thread.id !== d.threadId) return;
    if (!threadView.messages.some(m => m.id === d.message.id)) threadView.messages.push(d.message);
    threadView.thread = d.thread;
    drawThread(d.message.authorId === state.me.id);
  });
  es.addEventListener('thread-delete', e => {
    const d = JSON.parse(e.data);
    if (threadView?.thread.id !== d.threadId) return;
    threadView.messages = threadView.messages.filter(m => m.id !== d.id);
    threadView.thread = d.thread;
    drawThread();
  });
  es.addEventListener('thread', e => {
    const d = JSON.parse(e.data);
    if (threadView?.thread.id !== d.thread.id) return;
    threadView.thread = d.thread;
    threadView.canWrite = !d.thread.archived && threadView.canWrite !== false;
    drawThread(); drawThreadComposer();
  });
  es.addEventListener('activity', e => onActivity(JSON.parse(e.data)));
  es.addEventListener('events', e => { const d = JSON.parse(e.data); if ($('.events-modal') && openEvents.redraw) openEvents.redraw(); if (d.serverId === state.currentServerId) refresh({ serverId: d.serverId }); });
  es.addEventListener('maintenance', e => renderMaintenance(JSON.parse(e.data).maintenance));
  // The founder only: other staff members' actions, the moment they happen.
  es.addEventListener('staff-activity', e => {
    const d = JSON.parse(e.data);
    toast(`🛡️ ${d.by?.displayName || 'A staff member'} ${d.text}`);
    try { if (document.hidden && Notification.permission === 'granted') new Notification('Staff activity', { body: `${d.by?.displayName || 'A staff member'} ${d.text}`, icon: '/logo.png' }); } catch {}
  });
}
hook19(state.es);
const _connect19 = connect;
connect = function (...a) { const r = _connect19(...a); hook19(state.es); return r; };
const _start19 = start;
start = async function () {
  await _start19();
  try { const x = await api('GET', '/api/me/z19'); state.savedFolders = x.savedFolders || []; if (x.maintenance) renderMaintenance(x.maintenance); } catch {}
};

// ======================= menus stay on screen =======================
// Right-click menus get extra items after they're placed, so long ones could run off the bottom of
// the window. Once everything is added, the menu is moved back inside (and scrolls if it's taller).
function keepMenuOnScreen() {
  const m = $('#layer .menu');
  if (!m) return;
  m.style.maxHeight = (innerHeight - 16) + 'px';
  m.style.overflowY = 'auto';
  // Measure without the pop-in animation (it's scaled down while it opens).
  const h = m.offsetHeight, w = m.offsetWidth, top = parseFloat(m.style.top) || m.offsetTop, left = parseFloat(m.style.left) || m.offsetLeft;
  if (top + h > innerHeight - 8) m.style.top = Math.max(8, innerHeight - h - 8) + 'px';
  if (left + w > innerWidth - 8) m.style.left = Math.max(8, innerWidth - w - 8) + 'px';
}
document.addEventListener('contextmenu', () => requestAnimationFrame(keepMenuOnScreen));
const _openMenu19 = openMenu;
openMenu = function (...a) { const r = _openMenu19(...a); requestAnimationFrame(keepMenuOnScreen); return r; };

// ======================= red counts only for pings =======================
// A channel's red number counts messages that mention you; other new messages just make the
// channel name bright.
const _onMessage19 = onMessage;
onMessage = function (payload) {
  _onMessage19(payload);
  const m = payload.message, { serverId, channelId } = payload;
  if (!m || !channelId || m.authorId === state.me.id) return;
  const conv = 'ch:' + channelId;
  if (activeConv() === conv && !document.hidden) return;
  if (!(msgMentionsMe(m, serverId) || m.replyTo?.authorId === state.me.id)) return;
  const ch = state.servers.find(sv => sv.id === serverId)?.channels.find(c => c.id === channelId);
  if (!ch) return;
  ch.mentions = (ch.mentions || 0) + 1;
  if (state.currentServerId === serverId) renderServerSidebar();
};
const _renderServerSidebarPing = renderServerSidebar;
renderServerSidebar = function (...a) {
  for (const sv of state.servers) for (const c of sv.channels || []) if (!c.unread) c.mentions = 0;
  return _renderServerSidebarPing(...a);
};

// ======================= your menu (click your avatar), compact =======================
// Everything in one small card: status as four buttons, presets as chips, and a short list.
openStatusMenu = function (anchor) {
  closeLayer();
  const me = state.me, cur = me.statusPref || me.status || 'online';
  const presets = state.statusPresets || [];
  const STATUSES = [['online', 'Online', ''], ['idle', 'Idle', ''], ['dnd', 'Do Not Disturb', 'You still get messages'], ['invisible', 'Invisible', 'You appear offline']];
  const row = (k, icon, label, sub = '') => `<button data-sm="${k}"><span class="mi-ico">${icon}</span><span>${esc(label)}${sub ? `<span class="desc">${esc(sub)}</span>` : ''}</span></button>`;
  const shield = document.createElement('div');
  shield.style.cssText = 'position:fixed;inset:0;z-index:119';
  shield.addEventListener('mousedown', closeLayer);
  const menu = document.createElement('div');
  menu.className = 'menu status-menu';
  menu.innerHTML = `<button class="sm-head" data-sm="custom">${avatar(me, 36)}<span><b>${esc(me.displayName)}</b><span class="desc">${me.customStatus ? esc(`${me.customStatusEmoji ? me.customStatusEmoji + ' ' : ''}${me.customStatus}`) : 'Set a custom status'}</span></span></button>
    <div class="sm-statuses">${STATUSES.map(([k, l, d]) => `<button data-st="${k}" class="${cur === k ? 'on' : ''}" title="${esc(d || l)}"><span class="swatch s-${k}"></span>${esc(k === 'dnd' ? 'Busy' : l)}</button>`).join('')}</div>
    <div class="sm-presets">${presets.map((p, i) => `<button class="chip" data-preset="${i}" title="${esc(p.text || STATUS_LABEL[p.status] || 'Preset')}">${esc(p.emoji || '💬')} ${esc((p.text || STATUS_LABEL[p.status] || 'Preset').slice(0, 14))}</button>`).join('')}<button class="chip add" data-sm="presets" title="${presets.length ? 'Manage presets' : 'Make a status preset'}">${presets.length ? '✎' : '+ Preset'}</button></div>
    <div class="sep"></div>
    ${row('profile', '✏️', 'Edit Profile')}
    ${row('close', '★', 'Close Friends', `${(state.closeFriends || []).length} ${(state.closeFriends || []).length === 1 ? 'person' : 'people'}${state.myCfStatus ? ' · status on' : ''}`)}
    ${row('wrapped', '🎁', 'Zuno Wrapped')}
    ${row('bug', '🐞', 'Report a Bug')}
    ${row('switch', '🔁', 'Switch Accounts', typeof savedAccounts === 'function' && savedAccounts().length > 1 ? `${savedAccounts().length} accounts` : '')}`;
  $('#layer').append(shield, menu);
  const r = anchor.getBoundingClientRect(), mr = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, innerWidth - mr.width - 8)) + 'px';
  menu.style.top = Math.max(8, r.top - mr.height - 8 < 8 ? r.bottom + 8 : r.top - mr.height - 8) + 'px';
  requestAnimationFrame(keepMenuOnScreen);
  $$('[data-st]', menu).forEach(b => b.addEventListener('click', () => { closeLayer(); setStatus(b.dataset.st); }));
  $$('[data-preset]', menu).forEach(b => b.addEventListener('click', () => { closeLayer(); applyPreset(presets[b.dataset.preset]); }));
  const act = {
    custom: openCustomStatus, presets: openPresetManager, bug: () => openSettings('bugs'), profile: () => openSettings('profile'), wrapped: () => openWrapped(),
    switch: () => openAccountSwitcher(),
    close: () => setTimeout(() => openMenu(anchor, [
      { label: state.myCfStatus ? 'Edit Close Friends Status' : 'Close Friends Status', icon: ico('★'), desc: 'Only your Close Friends see it', run: openCfStatus },
      { label: 'Close Friends List', icon: ico('👥'), run: openCfList },
    ]), 0),
  };
  $$('[data-sm]', menu).forEach(b => b.addEventListener('click', () => { closeLayer(); act[b.dataset.sm](); }));
};

// ======================= compact message menu =======================
// Right-clicking a message used to give a long list that ran off the screen. Now: quick reactions,
// a row of buttons for the everyday actions, a few rows, and "More" for the rest.
const MM_TILES = { Reply: 'Reply', 'Edit Message': 'Edit', Forward: 'Forward', 'Copy Text': 'Copy', 'Save Message': 'Save', 'Remove from Saved': 'Saved', 'Create Thread': 'Thread', 'Open Thread': 'Thread', 'Pin Message': 'Pin', 'Unpin Message': 'Unpin', Translate: 'Translate', 'Hide Translation': 'Original' };
const MM_MORE = [/^View .*Profile$/, /^Add Reaction$/, /^Copy Message ID$/, /^Copy Link to /];
const MM_HIDE = ['Remind Me in 1 Hour']; // it's the first choice under "Remind Me…"
function compactMessageMenu(menu, x, y) {
  const label = b => { const s = b.querySelector(':scope > span:last-child'); return ((s?.childNodes[0]?.textContent) ?? b.textContent).trim(); };
  const buttons = [...menu.querySelectorAll(':scope > button')];
  const quick = menu.querySelector(':scope > .quick-react');
  const tiles = [], rows = [], more = [], danger = [];
  for (const b of buttons) {
    const l = label(b);
    if (MM_HIDE.includes(l)) continue;
    if (MM_TILES[l]) tiles.push([b, l]);
    else if (l === 'Delete Message') danger.push(b);
    else if (MM_MORE.some(re => re.test(l))) more.push([b, l]);
    else rows.push(b);
  }
  menu.textContent = '';
  menu.classList.add('msg-menu');
  if (quick) menu.append(quick);
  if (tiles.length) {
    const grid = document.createElement('div');
    grid.className = 'mm-tiles';
    for (const [b, l] of tiles) {
      const ico = b.querySelector('.mi-ico'), icon = ico?.querySelector('svg') ? ico.innerHTML : esc(ico?.textContent || '•');
      b.className = 'mm-tile'; b.title = l;
      b.innerHTML = `<span class="mm-ico">${icon}</span><span class="mm-l">${esc(MM_TILES[l])}</span>`;
      grid.append(b);
    }
    menu.append(grid);
  }
  if (rows.length || more.length) menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  menu.append(...rows);
  if (more.length) {
    const m = document.createElement('button');
    m.innerHTML = '<span class="mi-ico">⋯</span><span>More</span><span class="mm-chev">›</span>';
    // The menu this button is in closes when the "More" list opens, so remember where it was first.
    m.addEventListener('click', () => { const r = m.getBoundingClientRect(); const at = { getBoundingClientRect: () => ({ left: r.right - 8, right: r.right, top: r.top - 6, bottom: r.top - 6, width: 0, height: 0 }) }; openMenu(at, more.map(([b, l]) => ({ label: l, icon: b.querySelector('.mi-ico')?.outerHTML || '', danger: b.classList.contains('danger'), run: () => b.click() }))); });
    menu.append(m);
  }
  if (danger.length) { menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); menu.append(...danger); }
  // Open next to the pointer, then make sure it fits on screen.
  menu.style.top = y + 'px'; menu.style.left = x + 'px';
  keepMenuOnScreen();
}
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('.messages .msg[data-id]')) return;
  const x = e.clientX, y = e.clientY;
  requestAnimationFrame(() => { const menu = $('#layer .menu'); if (menu && !menu.classList.contains('msg-menu')) compactMessageMenu(menu, x, y); });
});

// ======================= Report a Bug button =======================
// Always on the server bar, right under Discover (and in your menu), so it's easy to find.
const BUG_ICON = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14.6 3.2 16 1.8l1.4 1.4-1.6 1.6A6 6 0 0 1 18 9h2v2h-2v1.5c0 .5 0 1-.1 1.5H20v2h-2.7A6 6 0 0 1 6.7 16H4v-2h2.1A7 7 0 0 1 6 12.5V11H4V9h2a6 6 0 0 1 2.2-4.2L6.6 3.2 8 1.8l1.4 1.4a6 6 0 0 1 5.2 0zM8 9v3.5a4 4 0 0 0 8 0V9a4 4 0 0 0-8 0zm2 1h4v2h-4zm0 3h4v2h-4z"/></svg>';
function addBugButton() {
  if ($('#bug-btn')) return;
  const after = $('#discover-btn') || $('#add-server-btn');
  if (!after) return;
  after.insertAdjacentHTML('afterend', `<button class="rail-btn add bug-btn" id="bug-btn" data-tip="Report a Bug" aria-label="Report a Bug">${BUG_ICON}</button>`);
  $('#bug-btn').addEventListener('click', () => openSettings('bugs'));
}
const _renderRailBug = renderRail;
renderRail = function (...a) { const r = _renderRailBug(...a); addBugButton(); return r; };
addBugButton();

// ======================= your own volume for each person in a call =======================
// Right-click someone in a call (their tile, or their name under a voice channel): mute them just
// for you, or move their volume from 0% to 200%. Saved on this device.
function peerAudioHtml(uid, stream = false) {
  const key = stream ? uid + ':screen' : uid, p = Calls.peerAudio(key);
  return `<div class="pa-box" data-pa="${esc(key)}"><div class="pa-head">${stream ? 'Stream Volume' : 'User Volume'} <b class="pa-val">${p.vol}%</b></div>
    <input type="range" class="pa-vol" min="0" max="200" step="5" value="${p.vol}" aria-label="${stream ? 'Stream volume' : 'Volume'} for ${esc(user(uid)?.displayName || 'them')}">
    <label class="pa-mute"><input type="checkbox"${p.muted ? ' checked' : ''}> ${stream ? 'Mute stream' : 'Mute for me'}</label>
    ${p.vol !== 100 ? '<button type="button" class="btn btn-link btn-sm pa-reset">Reset to 100%</button>' : ''}</div>`;
}
// Someone sharing their screen: the stream's own volume, mute, and stop/start watching it.
function streamHtml(uid) {
  if (!Calls.peerState(uid)?.screen) return '';
  const on = Calls.watching(uid);
  return `<div class="sep"></div>${on ? peerAudioHtml(uid, true) : ''}
    <button type="button" class="btn ${on ? 'btn-secondary' : 'btn-primary'} btn-sm pa-watch" data-watch-toggle="${esc(uid)}">${on ? 'Stop Watching Stream' : 'Watch Stream'}</button>`;
}
function wireStream(box) {
  $$('.pa-box', box).forEach(wirePeerAudio);
  $('[data-watch-toggle]', box)?.addEventListener('click', e => {
    const uid = e.currentTarget.dataset.watchToggle;
    Calls.setWatching(uid, !Calls.watching(uid));
    closeLayer();
  });
}
function wirePeerAudio(box) {
  const uid = box.dataset.pa;
  const vol = $('.pa-vol', box), val = $('.pa-val', box);
  vol.addEventListener('input', () => { val.textContent = vol.value + '%'; Calls.setPeerAudio(uid, { vol: Number(vol.value) }); });
  $('.pa-mute input', box).addEventListener('change', e => Calls.setPeerAudio(uid, { muted: e.target.checked }));
  $('.pa-reset', box)?.addEventListener('click', () => { Calls.setPeerAudio(uid, { vol: 100 }); vol.value = 100; val.textContent = '100%'; });
  box.addEventListener('mousedown', e => e.stopPropagation());
  box.addEventListener('click', e => e.stopPropagation());
}
// In a server: added to the menu you get by right-clicking a member.
const _openMemberMenu19 = openMemberMenu;
openMemberMenu = function (sv, id, anchor) {
  const r = _openMemberMenu19(sv, id, anchor);
  const menu = $('#layer .menu');
  if (menu && Calls.inCallWith(id)) {
    menu.insertAdjacentHTML('afterbegin', `<div class="pa-wrap">${peerAudioHtml(id)}${streamHtml(id)}</div><div class="sep"></div>`);
    wireStream($('.pa-wrap', menu));
    requestAnimationFrame(keepMenuOnScreen);
  }
  return r;
};
// In any call: right-click (or long-press) someone's tile.
document.addEventListener('contextmenu', e => {
  const t = e.target.closest('.tile[data-tile]');
  if (e.target.closest('.stream-bar')) return;
  if (!t || !Calls.inCallWith(t.dataset.tile)) return;
  e.preventDefault();
  const uid = t.dataset.tile;
  const box = popover({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) }, 'pa-pop', `<div class="pop-head">${avatar(user(uid) || { displayName: '?' }, 20)} ${esc(user(uid)?.displayName || 'Someone')}</div>${peerAudioHtml(uid)}${streamHtml(uid)}`);
  wireStream(box);
});
// Phones: long-press a tile for the same controls.
(() => {
  let timer = null;
  document.addEventListener('touchstart', e => {
    const t = e.target.closest('.tile[data-tile]'), touch = e.touches[0];
    clearTimeout(timer);
    if (!t || !touch) return;
    timer = setTimeout(() => t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: touch.clientX, clientY: touch.clientY })), 500);
  }, { passive: true });
  for (const ev of ['touchmove', 'touchend', 'touchcancel']) document.addEventListener(ev, () => clearTimeout(timer), { passive: true });
})();

// ======================= member list on small screens =======================
// Below 1100px wide there's no room for the member list next to the chat, so the button opens it
// as a drawer from the right instead (it used to do nothing).
const narrow = () => VW <= 1100;
function closeMemberDrawer() {
  $('#profile-panel.member-panel')?.classList.remove('drawer-open');
  $('#member-backdrop')?.remove();
}
document.addEventListener('click', e => {
  const b = e.target.closest('#toggle-members');
  if (!b || !narrow()) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const panel = $('#profile-panel.member-panel');
  if (!panel) return;
  if (panel.classList.contains('drawer-open')) return closeMemberDrawer();
  panel.classList.remove('hidden');
  panel.classList.add('drawer-open');
  const bd = document.createElement('div');
  bd.id = 'member-backdrop'; bd.className = 'member-backdrop';
  bd.addEventListener('click', closeMemberDrawer);
  // (0.55.1) Right behind the drawer, in the same layer: on phones the chat area is its own layer
  // (for swipes), and a backdrop outside it sat on top of the member list, so it couldn't scroll.
  if (panel.parentNode) panel.before(bd); else ($('#app') || document.body).appendChild(bd);
  if (!panel.children.length) renderMemberList();
}, true);
// Opening someone's profile from the drawer, or going somewhere else, closes it.
document.addEventListener('click', e => { if (e.target.closest('.member-panel.drawer-open [data-member]')) setTimeout(closeMemberDrawer, 50); });
addEventListener('resize', () => { if (!narrow()) closeMemberDrawer(); });
const _openChannel19 = openChannel;
openChannel = function (...a) { closeMemberDrawer(); return _openChannel19(...a); };

// ======================= stay with the newest message =======================
// If you're at (or near) the bottom of a chat, new messages scroll into view, and so do pictures
// and previews that finish loading after them. Scroll up even a little and Zuno leaves you be.
const STICK_PX = 40;
let stickToBottom = true, lastScrollIntent = 0;
const msgGap = el => el.scrollHeight - el.scrollTop - el.clientHeight;
for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) {
  document.addEventListener(ev, e => { if (ev !== 'keydown' || /^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)) lastScrollIntent = Date.now(); }, { passive: true, capture: true });
}
let lastMsgTop = 0;
document.addEventListener('scroll', e => {
  if (e.target.id !== 'messages') return;
  const el = e.target, gap = msgGap(el), up = el.scrollTop < lastMsgTop - 1;
  lastMsgTop = el.scrollTop;
  // Any scroll up by you lets go of the bottom straight away; getting back down to it sticks again.
  // Pictures loading above the bottom aren't you, so they don't count.
  // (0.56) Trackpads keep scrolling for a few seconds after your fingers stop, so that counts too
  // (before, the chat could snap back to the bottom halfway through a long flick upward).
  if (up && gap > 2 && Date.now() - lastScrollIntent < 3500) stickToBottom = false;
  else if (gap < STICK_PX) stickToBottom = true;
}, true);
const _renderMessages19 = renderMessages;
renderMessages = function (forceBottom = false, ...rest) {
  const el = $('#messages');
  if (forceBottom) stickToBottom = true;
  const stick = el && stickToBottom && msgGap(el) > 0;
  if (stick) el.scrollTop = el.scrollHeight; // so the chat counts as "at the bottom" while it redraws
  const top = el?.scrollTop;
  const r = _renderMessages19(forceBottom, ...rest);
  if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  else if (el && !forceBottom) el.scrollTop = top; // you scrolled up: a redraw leaves you where you are
  if (el) lastMsgTop = el.scrollTop;
  return r;
};
// Pictures, videos and link previews grow the chat after they load.
document.addEventListener('load', e => {
  const el = $('#messages');
  // A decoration swapping between its still and moving picture keeps its size, so it never moves the chat.
  if (!el || !stickToBottom || !el.contains(e.target) || e.target.matches?.('img.cdeco, .avatar img')) return;
  if (msgGap(el) > 1) el.scrollTop = el.scrollHeight;
}, true);
