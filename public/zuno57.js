// Zuno 0.57: bot embeds, buttons, dropdown menus, forms, and replies only you can see.

// ---------- drawing ----------
function zbEmbedsHtml(m) {
  return (m.embeds || []).map(e => {
    const title = e.title ? (e.url ? `<a class="zb-title" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>` : `<div class="zb-title">${esc(e.title)}</div>`) : '';
    const fields = e.fields?.length ? `<div class="zb-fields">${e.fields.map(f => `<div class="zb-field${f.inline ? ' inline' : ''}"><div class="zb-fname">${esc(f.name)}</div><div class="zb-fval">${formatMessage(f.value || '')}</div></div>`).join('')}</div>` : '';
    const foot = e.footer || e.timestamp ? `<div class="zb-foot">${esc(e.footer || '')}${e.footer && e.timestamp ? ' • ' : ''}${e.timestamp ? esc(fmtTime(e.timestamp)) : ''}</div>` : '';
    return `<div class="zb-embed"${e.color ? ` style="--zb-c:${esc(e.color)}"` : ''}>
      <div class="zb-embed-main">${e.author ? `<div class="zb-author">${esc(e.author.name)}</div>` : ''}${title}
        ${e.description ? `<div class="zb-desc">${formatMessage(e.description)}</div>` : ''}${fields}
        ${e.image ? `<img class="zb-img" src="${esc(e.image.url)}" alt="" loading="lazy" data-full="${esc(e.image.url)}" data-name="${esc(e.image.name || '')}">` : ''}${foot}</div>
      ${e.thumbnail ? `<img class="zb-thumb" src="${esc(e.thumbnail.url)}" alt="" loading="lazy" data-full="${esc(e.thumbnail.url)}" data-name="${esc(e.thumbnail.name || '')}">` : ''}</div>`;
  }).join('');
}
function zbComponentsHtml(m) {
  return `<div class="zb-rows">${(m.components || []).map(r => `<div class="zb-row">${(r.items || []).map(c => {
    const inner = `${c.emoji ? `<span class="zb-emo">${esc(c.emoji)}</span>` : ''}${c.label ? `<span>${esc(c.label)}</span>` : ''}`;
    if (c.type === 'select') {
      const picked = (c.options || []).filter(o => o.default).map(o => o.label);
      return `<button type="button" class="zb-select" data-zbsel="${esc(c.id)}"${c.disabled ? ' disabled' : ''}><span class="zb-ph${picked.length ? ' set' : ''}">${esc(picked.join(', ') || c.placeholder)}</span><span class="zb-caret">▾</span></button>`;
    }
    if (c.style === 'link') return `<a class="zb-btn zb-s-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${inner}<span class="zb-out">↗</span></a>`;
    return `<button type="button" class="zb-btn zb-s-${esc(c.style)}" data-zbc="${esc(c.id)}"${c.disabled ? ' disabled' : ''}>${inner}</button>`;
  }).join('')}</div>`).join('')}</div>`;
}
const _mediaHtml57 = mediaHtml;
mediaHtml = function (m) {
  const rich = m.embeds?.length || m.components?.length || m.ephemeral;
  if (!rich) return _mediaHtml57(m);
  return (m.embeds?.length ? zbEmbedsHtml(m) : '') + _mediaHtml57(m) + (m.components?.length ? zbComponentsHtml(m) : '')
    + (m.ephemeral ? `<div class="zb-eph-note">👁 Only you can see this • <a href="#" data-zbdismiss="${esc(m.id)}">Dismiss</a></div>` : '');
};

// ---------- clicking ----------
const zbWaiting = new Map(); // interaction id -> { el, timer }
function zbBusy(el, id) {
  el.classList.add('zb-busy'); el.disabled = true;
  const bot = user(state.convos[activeConv()]?.messages.find(x => x.id === el.closest('.msg')?.dataset.id)?.authorId);
  const timer = setTimeout(() => { zbDone(id); toast(`${bot?.displayName || 'The bot'} didn't answer. Try again in a moment.`, true); }, 8000);
  zbWaiting.set(id, { el, timer });
}
function zbDone(id) {
  const w = zbWaiting.get(id);
  if (!w) return;
  clearTimeout(w.timer); zbWaiting.delete(id);
  if (w.el.isConnected) { w.el.classList.remove('zb-busy'); w.el.disabled = false; }
}
async function zbSend(el, componentId, values) {
  const msgId = el.closest('.msg')?.dataset.id;
  if (!msgId) return;
  el.disabled = true;
  try {
    const r = await api('POST', '/api/interactions', { conv: activeConv(), messageId: msgId, componentId, ...(values ? { values } : {}) });
    zbBusy(el, r.id);
  } catch (err) { el.disabled = false; toast(err.message, true); }
}
function zbMessage(el) { return state.convos[activeConv()]?.messages.find(x => x.id === el.closest('.msg')?.dataset.id); }
function zbOpenSelect(btn) {
  const m = zbMessage(btn);
  let c = null;
  for (const r of m?.components || []) for (const x of r.items || []) if (x.id === btn.dataset.zbsel) c = x;
  if (!c) return;
  $$('.zb-pop').forEach(n => n.remove());
  const multi = c.max > 1;
  const chosen = new Set((c.options || []).filter(o => o.default).map(o => o.value));
  const pop = document.createElement('div');
  pop.className = 'zb-pop';
  pop.innerHTML = `<div class="zb-opts">${c.options.map(o => `<button type="button" class="zb-opt${chosen.has(o.value) ? ' on' : ''}" data-v="${esc(o.value)}">
      ${multi ? '<span class="zb-check"></span>' : ''}${o.emoji ? `<span class="zb-emo">${esc(o.emoji)}</span>` : ''}
      <span class="zb-otext"><span>${esc(o.label)}</span>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></button>`).join('')}</div>
    ${multi ? `<div class="zb-pop-foot"><span class="muted small">${c.min === c.max ? `Pick ${c.max}` : `Pick ${c.min}–${c.max}`}</span><button type="button" class="btn btn-primary btn-sm" data-zbok>Done</button></div>` : ''}`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.bottom + 4;
  if (top + pr.height > innerHeight - 8) top = Math.max(8, r.top - pr.height - 4);
  pop.style.top = Math.round(top) + 'px';
  pop.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - pr.width - 8))) + 'px';
  pop.style.minWidth = Math.round(r.width) + 'px';
  const close = () => { pop.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc57, true); };
  const away = e => { if (!pop.isConnected) return close(); if (!pop.contains(e.target) && e.target !== btn) close(); };
  const esc57 = e => { if (!pop.isConnected) return close(); if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('mousedown', away, true);
  document.addEventListener('keydown', esc57, true);
  const go = () => { close(); zbSend(btn, c.id, [...chosen]); };
  $$('.zb-opt', pop).forEach(o => o.addEventListener('click', () => {
    const v = o.dataset.v;
    if (!multi) { chosen.clear(); chosen.add(v); return go(); }
    if (chosen.has(v)) chosen.delete(v); else if (chosen.size < c.max) chosen.add(v);
    o.classList.toggle('on', chosen.has(v));
  }));
  $('[data-zbok]', pop)?.addEventListener('click', () => {
    if (chosen.size < c.min) return toast(`Pick at least ${c.min}.`, true);
    go();
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-zbc]');
  if (b && !b.disabled) return zbSend(b, b.dataset.zbc);
  const s = e.target.closest('[data-zbsel]');
  if (s && !s.disabled) return zbOpenSelect(s);
  const d = e.target.closest('[data-zbdismiss]');
  if (d) {
    e.preventDefault();
    const convo = state.convos[activeConv()];
    if (convo) { convo.messages = convo.messages.filter(x => x.id !== d.dataset.zbdismiss); renderMessages(); }
  }
});

// ---------- forms ----------
function zbOpenModal({ id, bot, modal }) {
  const ov = openLayer(`<form class="dialog modal zb-modal"><div class="zb-modal-head">${bot ? avatar(bot, 24) : ''}<h3>${esc(modal.title)}</h3></div>
    ${modal.inputs.map(i => `<label class="field">${esc(i.label)}${i.required ? ' <span class="zb-req">*</span>' : ''}
      ${i.style === 'paragraph'
        ? `<textarea name="${esc(i.id)}" rows="4" maxlength="${i.max}" placeholder="${esc(i.placeholder || '')}"${i.required ? ' required' : ''}>${esc(i.value || '')}</textarea>`
        : `<input name="${esc(i.id)}" maxlength="${i.max}" placeholder="${esc(i.placeholder || '')}" value="${esc(i.value || '')}"${i.required ? ' required' : ''}>`}</label>`).join('')}
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Submit</button></div></form>`);
  const f = $('form', ov);
  f.querySelector('input,textarea')?.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = {};
    for (const i of modal.inputs) fields[i.id] = f.elements[i.id].value;
    const btn = $('.btn-primary', f); btn.disabled = true;
    try { await api('POST', `/api/interactions/${encodeURIComponent(id)}/submit`, { fields }); dismissLayer(); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ---------- live events ----------
const _connect57 = connect;
connect = function (...a) {
  const r = _connect57.apply(this, a);
  const es = state.es;
  es.addEventListener('ix-done', e => zbDone(JSON.parse(e.data).id));
  es.addEventListener('bot-modal', e => zbOpenModal(JSON.parse(e.data)));
  es.addEventListener('bot-ephemeral', e => {
    const { conv, message, author } = JSON.parse(e.data);
    if (author) state.users[author.id] = { ...state.users[author.id], ...author };
    const convo = state.convos[conv];
    if (!convo?.loaded) return;
    const i = convo.messages.findIndex(x => x.id === message.id);
    if (i >= 0) convo.messages[i] = message; else convo.messages.push(message);
    if (activeConv() === conv) renderMessagesSoon();
  });
  // A bot taking its buttons or embeds away sends them as empty.
  es.addEventListener('message-update', e => {
    const { conv, message } = JSON.parse(e.data);
    const m = state.convos[conv]?.messages.find(x => x.id === message.id);
    if (m) for (const k of ['embeds', 'components']) if (!message[k]) delete m[k];
  });
  return r;
};

// ======================= your profile pops up from the corner =======================
// Clicking your name in the bottom-left corner opens a small profile card right above it (with
// your banner, frame, badges and bio) and a menu: edit your profile, change your status, see the
// full profile, copy your id. Right-click still opens the status menu straight away.
const MP57_STATUS = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible' };
function closeMePop57() {
  const p = $('.mp57');
  if (!p) return;
  p.remove();
  document.removeEventListener('mousedown', mp57Away, true);
  document.removeEventListener('keydown', mp57Key, true);
}
function mp57Away(e) {
  const p = $('.mp57');
  if (!p) return closeMePop57();
  // Menus and dialogs opened from the card (status list, emoji picker) don't close it.
  if (p.contains(e.target) || e.target.closest('#me-btn') || e.target.closest('#layer')) return;
  closeMePop57();
}
function mp57Key(e) { if (e.key === 'Escape' && !$('#layer').children.length) { e.stopPropagation(); closeMePop57(); } }
function renderMePop57(pop) {
  const me = { ...state.users[state.me.id], ...state.me };
  const st = me.status || 'online';
  const ico = name => (typeof uiIcon === 'function' ? uiIcon(name) : '');
  pop.innerHTML = `<div class="mp57-card"></div>
    <div class="mp57-menu">
      <button type="button" class="mp57-item" data-mp="edit"><span class="mp57-ic">${ico('pencil')}</span><span class="mp57-l">Edit Profile</span></button>
      <div class="mp57-sep"></div>
      <button type="button" class="mp57-item" data-mp="status"><span class="mp57-ic"><span class="swatch s-${esc(st)}"></span></span><span class="mp57-l">${esc(MP57_STATUS[st] || 'Online')}</span><span class="mp57-chev">›</span></button>
      <div class="mp57-sep"></div>
      <button type="button" class="mp57-item" data-mp="custom"><span class="mp57-ic">${ico('smile')}</span><span class="mp57-l">${me.customStatus || me.customStatusEmoji ? 'Edit Custom Status' : 'Set Custom Status'}</span></button>
    </div>
    <div class="mp57-menu">
      <button type="button" class="mp57-item" data-mp="full"><span class="mp57-ic">${ico('user')}</span><span class="mp57-l">View Full Profile</span></button>
      <div class="mp57-sep"></div>
      <button type="button" class="mp57-item" data-mp="copy"><span class="mp57-ic">${ico('clipboard')}</span><span class="mp57-l">Copy User ID</span></button>
    </div>`;
  const card = $('.mp57-card', pop);
  mountCard(card, profileCard(me, { size: 80 }), { source: 'panel' });
  // A thought bubble next to your picture: your custom status, or a nudge to set one.
  const head = $('.pc-head', card);
  if (head) {
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'mp57-bubble' + (me.customStatus || me.customStatusEmoji ? '' : ' empty');
    bubble.innerHTML = me.customStatus || me.customStatusEmoji ? `${me.customStatusEmoji ? `<span>${esc(me.customStatusEmoji)}</span>` : ''}<span class="mp57-btext">${esc(me.customStatus || '')}</span>` : '<span class="mp57-btext">+ Set a status</span>';
    bubble.addEventListener('click', () => { closeMePop57(); openCustomStatus(); });
    head.appendChild(bubble);
  }
  // Badges go under your name, the bio is cut to a few lines.
  const badges = $('.pc-head .pc-badges', card), uname = $('.pc-uname', card), pro = $('.pc-pronouns', card);
  if (uname && pro) { uname.append(` • ${pro.textContent}`); pro.remove(); }
  if (badges && uname) uname.after(badges);
  const bio = $('.pc-bio', card);
  if (bio) {
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'mp57-more'; more.textContent = 'View Full Bio';
    more.addEventListener('click', () => { closeMePop57(); openFullProfile43(state.me.id); });
    bio.after(more);
    requestAnimationFrame(() => { if (bio.scrollHeight <= bio.clientHeight + 2) more.remove(); });
  }
  const run = {
    edit: () => { closeMePop57(); openSettings('profile'); },
    full: () => { closeMePop57(); openFullProfile43(state.me.id); },
    custom: () => { closeMePop57(); openCustomStatus(); },
    copy: () => { closeMePop57(); copyText(state.me.id, 'User ID'); },
    status: b => {
      const dot = s => `<span class="swatch s-${s}"></span>`;
      openMenu(b, Object.entries(MP57_STATUS).map(([s, label]) => ({
        label, icon: dot(s), desc: s === 'dnd' ? 'You will still get messages' : s === 'invisible' ? 'You will appear offline' : '',
        run: async () => { await setStatus(s); const p = $('.mp57'); if (p) renderMePop57(p); },
      })));
      const m = $('#layer .menu'); if (m) { const r = b.getBoundingClientRect(); m.style.left = Math.min(innerWidth - m.offsetWidth - 8, r.right + 8) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.top - 4)) + 'px'; }
    },
  };
  $$('[data-mp]', pop).forEach(b => b.addEventListener('click', () => run[b.dataset.mp](b)));
}
function placeMePop57(pop) {
  const panel = $('#user-panel'), r = (panel || $('#me-btn')).getBoundingClientRect();
  pop.style.left = Math.round(Math.max(8, r.left)) + 'px';
  pop.style.bottom = Math.round(Math.max(8, innerHeight - r.top + 8)) + 'px';
}
function openMePop57() {
  if ($('.mp57')) return closeMePop57();
  const pop = document.createElement('div');
  pop.className = 'mp57';
  document.body.appendChild(pop);
  renderMePop57(pop);
  placeMePop57(pop);
  document.addEventListener('mousedown', mp57Away, true);
  document.addEventListener('keydown', mp57Key, true);
}
// Phones keep the full profile (the corner card is a desktop thing).
const _renderUserPanel57 = renderUserPanel;
renderUserPanel = function (...a) {
  const r = _renderUserPanel57(...a);
  const b = $('#me-btn');
  if (b && !b.dataset.mp57 && !(typeof isPhone === 'function' && isPhone())) {
    const nb = b.cloneNode(true);
    nb.dataset.mp57 = '1';
    nb.title = 'Your profile (right-click to change your status)';
    nb.addEventListener('click', e => { e.stopPropagation(); openMePop57(); });
    nb.addEventListener('contextmenu', e => { e.preventDefault(); closeMePop57(); openStatusMenu(nb); });
    b.replaceWith(nb);
  }
  const p = $('.mp57');
  if (p && !p.contains(document.activeElement)) renderMePop57(p);
  return r;
};
if (state.me && $('#me-btn')) renderUserPanel();
addEventListener('resize', () => { const p = $('.mp57'); if (p) placeMePop57(p); });

// ======================= the friends page, restyled =======================
// Only marks the page so zuno57.css can style it (tabs, search with an icon, roomier rows).
const _showFriends57 = showFriends;
showFriends = function (...a) {
  const r = _showFriends57.apply(this, a);
  $('#main .topbar')?.classList.add('fr57-top');
  $('#main .body-row')?.classList.add('fr57');
  return r;
};
