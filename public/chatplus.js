'use strict';
// Chat, part two: pinned messages, search, polls, forwarding, and clickable #channel mentions.

const canPinHere = () => (isChannelConv(activeConv()) ? chHas(currentChannel(), 'manage_messages') : !!activeConv());

// ======================= top bar: search and pins =======================
const PIN_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 3H8v2h1v6l-3 3v2h5v6l1 1 1-1v-6h5v-2l-3-3V5h1z"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>';
const _renderDMHeaderC = renderDMHeader;
renderDMHeader = function () {
  _renderDMHeaderC();
  const bar = $('#main .topbar');
  const conv = activeConv();
  if (!bar || !conv || user(conv)?.system) { $('.tb-tools', bar || document)?.remove(); return; }
  if ($('.tb-tools', bar)) return;
  const tools = document.createElement('div');
  tools.className = 'tb-tools';
  tools.innerHTML = `<button class="icon-btn" id="pins-btn" title="Pinned Messages">${PIN_ICON}</button>
    <label class="tb-search" title="Search (Ctrl+F)">${SEARCH_ICON}<input id="chat-search" placeholder="Search" autocomplete="off" spellcheck="false"></label>`;
  const spacer = $('.spacer', bar);
  spacer ? spacer.after(tools) : bar.appendChild(tools);
  $('#pins-btn', tools).addEventListener('click', e => openPins(e.currentTarget));
  const input = $('#chat-search', tools);
  input.addEventListener('keydown', e => {
    // A "from:@name" tag (zuno23.js) counts as part of the search.
    const q = ((input.dataset.from ? `from:${input.dataset.from} ` : '') + input.value).trim();
    if (e.key === 'Enter' && q) runSearch(q, tools);
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
  input.addEventListener('focus', () => { if (!input.value) showSearchHelp(tools); });
};
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && $('#chat-search') && !$('#layer .settings')) { e.preventDefault(); $('#chat-search').focus(); }
});

function popover(anchor, cls, html) {
  const r = anchor.getBoundingClientRect(); // before closing anything (the anchor may be in a menu)
  closeLayer();
  const shield = document.createElement('div');
  shield.style.cssText = 'position:fixed;inset:0;z-index:119';
  shield.addEventListener('mousedown', closeLayer);
  const box = document.createElement('div');
  box.className = 'menu ' + cls;
  box.innerHTML = html;
  $('#layer').append(shield, box);
  // Below the button if it fits, otherwise above it, and never past the edges of the window. Done
  // again whenever the box changes size (sticker grids and search results fill in afterwards).
  const place = () => {
    const h = box.offsetHeight, w = box.offsetWidth;
    const below = r.bottom + 8, above = r.top - 8 - h;
    box.style.top = Math.max(8, below + h <= innerHeight - 8 ? below : above >= 8 ? above : innerHeight - 8 - h) + 'px';
    box.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  };
  box.style.maxHeight = innerHeight - 16 + 'px';
  place();
  if (window.ResizeObserver) new ResizeObserver(place).observe(box);
  return box;
}
// One message as a little card (pins and search results).
function miniMsg(m, actions = '') {
  const a = user(m.authorId) || { id: m.authorId, displayName: 'Unknown' };
  const text = m.content ? formatMessage(m.content) : m.poll ? `📊 ${esc(m.poll.question)}` : m.gif ? 'GIF' : m.attachments ? `📎 ${esc(m.attachments.map(x => x.name).join(', '))}` : m.forward ? `↪ ${esc(m.forward.content || 'Forwarded message')}` : '';
  return `<div class="pi-msg" data-jump-to="${esc(m.id)}">${avatar(a, 32)}<div class="pi-body"><div><b${nameStyle(a)}>${esc(nameIn(a))}</b> <span class="muted small">${fmtTime(m.createdAt)}</span></div><div class="pi-text">${text}</div></div>${actions}</div>`;
}
async function openPins(anchor) {
  const conv = activeConv();
  const box = popover(anchor, 'pins-pop', '<div class="pop-head">📌 Pinned Messages</div><div class="pop-list"><div class="fp-empty">Loading…</div></div>');
  box.dataset.conv = conv;
  try {
    const { pins, authors } = await api('GET', `${convBase(conv)}/pins`);
    for (const u of authors) state.users[u.id] = { ...u, ...state.users[u.id] };
    const can = canPinHere();
    $('.pop-list', box).innerHTML = pins.map(m => miniMsg(m, can ? `<button class="icon-btn" data-unpin="${esc(m.id)}" title="Unpin">✕</button>` : '')).join('')
      || `<div class="empty-state">${mascot('curious')}<div class="title">No pins yet</div><div>${can ? 'Right-click a message and pick Pin Message to keep it here.' : 'Important messages pinned here will show up for everyone.'}</div></div>`;
    wireMiniMsgs(box, conv);
    $$('[data-unpin]', box).forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); await togglePin(b.dataset.unpin, false); openPins(anchor); }));
  } catch (e) { $('.pop-list', box).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; }
}
function onPinsChanged() { const box = $('#layer .pins-pop'); if (box && box.dataset.conv === activeConv()) openPins($('#pins-btn')); }
async function togglePin(id, on) {
  const conv = activeConv();
  try {
    const { message } = await api(on ? 'POST' : 'DELETE', `${convBase(conv)}/messages/${id}/pin`);
    const m = state.convos[conv]?.messages.find(x => x.id === id);
    if (m) Object.assign(m, message);
    toast(on ? 'Message pinned' : 'Message unpinned');
    if (on) burst($('#pins-btn'), 8);
  } catch (e) { toast(e.message, true); }
}
function wireMiniMsgs(box, conv) {
  $$('[data-jump-to]', box).forEach(r => r.addEventListener('click', e => { if (e.target.closest('button, a')) return; closeLayer(); jumpToAny(conv, r.dataset.jumpTo); }));
}
// Jump to a message, loading older history if it isn't on screen yet.
async function jumpToAny(conv, id) {
  if (activeConv() !== conv) return;
  for (let i = 0; i < 30; i++) {
    if (state.convos[conv]?.messages.some(m => m.id === id)) { renderMessages(); return jumpToMessage(id); }
    if (!state.convos[conv]?.hasMore) break;
    await loadOlder();
  }
  toast("Couldn't find that message. It may have been deleted.", true);
}

function showSearchHelp(tools) {
  const box = popover($('#chat-search', tools), 'search-pop', `<div class="pop-head">Search options</div>
    <div class="search-help">${[['from:', 'username', 'Messages from someone'], ['has:', 'image, video, file, gif, link, poll', 'Messages with something in them'], ['pinned:', 'true', 'Only pinned messages']]
      .map(([k, v, d]) => `<button data-ins="${k}"><b>${k}</b> <span class="muted">${v}</span><small>${d}</small></button>`).join('')}</div>`);
  $$('[data-ins]', box).forEach(b => b.addEventListener('click', () => { closeLayer(); const i = $('#chat-search'); i.value = (i.value ? i.value + ' ' : '') + b.dataset.ins; i.focus(); }));
  setTimeout(() => $('#chat-search', tools)?.focus(), 0);
}
async function runSearch(q, tools) {
  const conv = activeConv();
  const box = popover($('#chat-search', tools), 'search-pop', `<div class="pop-head" id="sr-head">Searching…</div><div class="pop-list"></div>`);
  try {
    const { results, total, authors } = await api('GET', `${convBase(conv)}/search?q=${encodeURIComponent(q)}`);
    for (const u of authors) state.users[u.id] = { ...u, ...state.users[u.id] };
    $('#sr-head', box).textContent = total ? `${total} result${total === 1 ? '' : 's'}${total > results.length ? ` · showing the newest ${results.length}` : ''}` : 'No results';
    $('.pop-list', box).innerHTML = results.map(m => miniMsg(m)).join('') || `<div class="empty-state">${mascot('sleepy')}<div>Nothing matches <b>${esc(q)}</b>.</div></div>`;
    wireMiniMsgs(box, conv);
  } catch (e) { $('#sr-head', box).textContent = e.message; }
}

// ======================= polls & forwarded messages inside messages =======================
function pollHtml(m) {
  const p = m.poll;
  const total = p.options.reduce((n, o) => n + o.votes.length, 0);
  const voters = new Set(p.options.flatMap(o => o.votes)).size;
  const ended = p.endsAt && p.endsAt < Date.now();
  const voted = p.options.some(o => o.votes.includes(state.me.id));
  const show = voted || ended;
  const top = Math.max(...p.options.map(o => o.votes.length));
  const left = p.endsAt - Date.now();
  const leftText = left > 864e5 ? `${Math.round(left / 864e5)}d left` : left > 3600e3 ? `${Math.round(left / 3600e3)}h left` : `${Math.max(1, Math.round(left / 60e3))}m left`;
  return `<div class="poll${ended ? ' ended' : ''}" data-poll="${esc(m.id)}"><div class="poll-q">${esc(p.question)}</div>
    <div class="poll-sub">${ended ? 'Poll ended' : p.multi ? 'Pick one or more answers' : 'Pick one answer'}</div>
    ${p.options.map(o => {
      const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
      const mine = o.votes.includes(state.me.id);
      return `<button class="poll-opt${mine ? ' on' : ''}${ended && o.votes.length === top && top ? ' win' : ''}" data-vote="${esc(o.id)}" data-msg="${esc(m.id)}"${ended ? ' disabled' : ''}>
        ${show ? `<span class="po-bar" style="width:${pct}%"></span>` : ''}<span class="po-check">${mine ? '✓' : ''}</span><span class="po-text">${o.emoji ? esc(o.emoji) + ' ' : ''}${esc(o.text)}</span>${show && o.votes.length ? pollVoterStack(o.votes) : ''}${show ? `<span class="po-pct">${pct}% <small>(${o.votes.length})</small></span>` : ''}</button>`;
    }).join('')}
    <div class="poll-foot">${voters} vote${voters === 1 ? '' : 's'} · ${ended ? 'Final results' : leftText}${!show ? ' · vote to see results' : ''}${show && voters ? ` · <a href="#" data-poll-votes="${esc(m.id)}">See votes</a>` : ''}</div></div>`;
}
// Who voted: a few faces on each answer, and the full list (who picked what) one click away.
function pollVoterStack(ids) {
  const shown = ids.slice(0, 3).map(id => user(id) || { id, displayName: '?' });
  return `<span class="po-voters" title="${esc(ids.map(id => user(id)?.displayName || 'Someone').join(', '))}">${shown.map(u => avatar(u, 20)).join('')}${ids.length > 3 ? `<b>+${ids.length - 3}</b>` : ''}</span>`;
}
function openPollVotes(msgId) {
  const m = state.convos[activeConv()]?.messages.find(x => x.id === msgId);
  if (!m?.poll) return;
  const p = m.poll;
  const ov = openLayer(`<div class="dialog modal poll-votes"><h3>📊 ${esc(p.question)}</h3>
    ${p.options.map(o => `<div class="pv-opt"><div class="pv-head"><b>${o.emoji ? esc(o.emoji) + ' ' : ''}${esc(o.text)}</b><span class="muted small">${o.votes.length} vote${o.votes.length === 1 ? '' : 's'}</span></div>
      ${o.votes.length ? o.votes.map(id => { const u = user(id) || { id, displayName: 'Someone' }; return `<button class="pv-user" data-profile="${esc(id)}">${avatar(u, 28)}<span>${esc(nameIn(u))}</span>${id === state.me.id ? '<span class="muted small">(you)</span>' : ''}</button>`; }).join('') : '<div class="muted small pv-none">No votes yet</div>'}</div>`).join('')}
    <div class="actions"><button class="btn btn-primary" data-a="ok">Close</button></div></div>`);
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  $$('[data-profile]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); openProfile(b.dataset.profile); }));
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-poll-votes]');
  if (a) { e.preventDefault(); openPollVotes(a.dataset.pollVotes); }
});
function forwardHtml(m) {
  const f = m.forward;
  return `<div class="fwd"><div class="fwd-h">↪ Forwarded from <b>${esc(f.authorName)}</b>${f.where ? ` · ${esc(f.where)}` : ''}</div>
    ${f.content ? `<div class="content fwd-body">${formatMessage(f.content)}</div>` : ''}${f.poll ? `<div class="fwd-body muted">📊 ${esc(f.poll.question)}</div>` : ''}${typeof _mediaHtmlC === 'function' ? _mediaHtmlC({ gif: f.gif, attachments: f.attachments }) : ''}
    <div class="fwd-time">${fmtTime(f.createdAt)}</div></div>`;
}
const _mediaHtmlC = mediaHtml;
mediaHtml = function (m) {
  return `${m.forward ? forwardHtml(m) : ''}${m.poll ? pollHtml(m) : ''}${_mediaHtmlC(m)}`;
};
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-vote][data-msg]');
  if (b) {
    const conv = activeConv();
    b.disabled = true;
    try {
      const { message } = await api('POST', `${convBase(conv)}/messages/${b.dataset.msg}/vote`, { option: b.dataset.vote });
      const m = state.convos[conv]?.messages.find(x => x.id === message.id);
      if (m) Object.assign(m, message);
      renderMessages();
    } catch (err) { toast(err.message, true); b.disabled = false; }
    return;
  }
  const ch = e.target.closest('[data-goto-ch]');
  if (ch && state.currentServerId) openChannel(state.currentServerId, ch.dataset.gotoCh);
});

// ======================= making a poll =======================
const _renderComposerC = renderComposer;
renderComposer = function () {
  _renderComposerC();
  const box = $('#composer .composer-box');
  if (!box || $('#composer-poll', box) || user(activeConv())?.system) return;
  const b = document.createElement('button');
  b.className = 'composer-poll'; b.id = 'composer-poll'; b.title = 'Create a poll'; b.setAttribute('aria-label', 'Create a poll');
  b.innerHTML = '<span>📊</span>';
  $('#composer-gif', box)?.before(b);
  b.addEventListener('click', () => openPollMaker(activeConv()));
};
function openPollMaker(conv) {
  const ov = openLayer(`<form class="dialog modal poll-maker"><h3>📊 Create a poll</h3>
    <label class="field">Question<input name="q" maxlength="300" required placeholder="What should we play tonight?"></label>
    <div class="field">Answers<div id="pm-opts"></div><button type="button" class="btn btn-link btn-sm" id="pm-add">＋ Add another answer</button></div>
    <div class="pm-row"><label class="field">Lasts<select name="hours" class="sc-select">${[[1, '1 hour'], [4, '4 hours'], [8, '8 hours'], [24, '1 day'], [72, '3 days'], [168, '1 week']].map(([v, l]) => `<option value="${v}"${v === 24 ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="setting-row pm-multi"><div><div class="setting-title">Allow more than one answer</div></div><input type="checkbox" class="switch" name="multi"></label></div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Post Poll</button></div></form>`);
  const list = $('#pm-opts', ov);
  const add = (v = '') => {
    if ($$('.pm-opt', list).length >= 10) return toast('Polls can have up to 10 answers.', true);
    const row = document.createElement('div');
    row.className = 'copy-row pm-opt';
    row.innerHTML = `<input maxlength="55" placeholder="Answer ${$$('.pm-opt', list).length + 1}" value="${esc(v)}"><button type="button" class="icon-btn" title="Remove">✕</button>`;
    $('button', row).addEventListener('click', () => { if ($$('.pm-opt', list).length > 2) row.remove(); });
    list.appendChild(row);
    return row;
  };
  add(); add();
  $('#pm-add', ov).addEventListener('click', () => $('input', add())?.focus());
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  const f = $('form', ov);
  f.q.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const options = $$('.pm-opt input', ov).map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) return toast('Add at least 2 answers.', true);
    try {
      const { message } = await api('POST', `${convBase(conv)}/messages`, { content: '', poll: { question: f.q.value, options, hours: Number(f.hours.value), multi: f.multi.checked } });
      addSentMessage(conv, message);
      closeLayer();
    } catch (err) { toast(err.message, true); }
  });
}
// Put a message we just sent into the chat (the live event may arrive a moment later).
function addSentMessage(conv, message) {
  const convo = state.convos[conv];
  if (convo?.loaded && !convo.messages.some(m => m.id === message.id)) convo.messages.push(message);
  if (activeConv() === conv) renderMessages(true);
}

// ======================= forwarding =======================
function openForward(fromConv, id) {
  const targets = [];
  for (const d of state.dms) { const u = user(d.userId); if (u && !u.system && !u.bot && isFriend(u.id)) targets.push({ conv: u.id, label: u.displayName, sub: u.username, av: avatar(u, 28) }); }
  for (const g of state.groups) targets.push({ conv: 'g:' + g.id, label: groupTitle(g), sub: `Group · ${g.members.length} members`, av: groupIcon(g, 28) });
  for (const sv of state.servers) for (const c of sv.channels) if (c.type === 'text' && (c.perms || []).includes('send_messages')) targets.push({ conv: 'ch:' + c.id, label: '#' + c.name, sub: sv.name, av: `<span class="fw-sv" style="--sv:${esc(sv.iconColor)}">${serverIcon(sv, 28)}</span>` });
  const ov = openLayer(`<div class="dialog modal find-people forward-dialog"><h3>↪ Forward to</h3>
    <input class="qs-input fp-input" placeholder="Search friends and channels" autocomplete="off"><div class="fp-list"></div>
    <label class="field" style="margin-top:10px">Add a message <span class="hint">(optional)</span><input id="fw-note" maxlength="2000"></label>
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button></div></div>`);
  const draw = q => {
    $('.fp-list', ov).innerHTML = targets.filter(t => !q || t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q)).slice(0, 40)
      .map((t, i) => `<div class="fp-row">${t.av}<div class="fp-who"><b>${esc(t.label)}</b><small>${esc(t.sub)}</small></div><button class="btn btn-primary btn-sm" data-to="${esc(t.conv)}">Send</button></div>`).join('') || '<div class="fp-empty">Nowhere to send it yet.</div>';
    $$('[data-to]', ov).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api('POST', `${convBase(b.dataset.to)}/messages`, { content: $('#fw-note', ov).value.trim(), forward: { conv: fromConv, id } }); b.textContent = 'Sent ✓'; }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
  };
  $('.fp-input', ov).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  draw('');
  $('.fp-input', ov).focus();
}

// ======================= more in a message's right-click menu =======================
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m || m.pending) return;
  if (canPinHere()) addMenuItem({ label: m.pinned ? 'Unpin Message' : 'Pin Message', icon: ico('📌'), run: () => togglePin(id, !m.pinned) });
  if (!user(m.authorId)?.system || m.content) addMenuItem({ label: 'Forward', icon: ico('↪️'), run: () => openForward(conv, id) });
});
