'use strict';
// Zuno 0.17: hold-and-drag for channels, categories, roles and DMs; a formatting bar when you select
// text in the message box; reply highlights; favorite emoji; where a server emoji is from; and a
// switch to turn off other people's profile videos and sounds.

// ======================= hold and drag =======================
// Press on a row and move (or hold on a touch screen): it lifts off and follows your pointer, a line
// shows where it will land, and letting go puts it there.
function holdDrag(root, opt) {
  if (!root || root.dataset.holdDrag) return;
  root.dataset.holdDrag = '1';
  let pend = null, drag = null, swallow = false;
  // Once a row is picked up on a touch screen, that finger drags it instead of scrolling the page.
  const noScroll = e => { if (drag) e.preventDefault(); };
  const onMove = e => {
    if (pend && !drag) {
      const dist = Math.hypot(e.clientX - pend.x, e.clientY - pend.y);
      if (!pend.touch && dist > 6) start(e);
      else if (pend.touch && dist > 8) stopListening();
      return;
    }
    if (!drag) return;
    e.preventDefault();
    drag.ghost.style.left = e.clientX - drag.dx + 'px';
    drag.ghost.style.top = e.clientY - drag.dy + 'px';
    const sr = root.getBoundingClientRect();
    if (e.clientY < sr.top + 36) root.scrollTop -= 10; else if (e.clientY > sr.bottom - 36) root.scrollTop += 10;
    $$('.drop-into-target').forEach(n => n.classList.remove('drop-into-target'));
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const over = opt.into && under?.closest(opt.into);
    if (over && root.contains(over) && over !== drag.el && (!opt.canInto || opt.canInto(drag.el, over))) {
      over.classList.add('drop-into-target');
      drag.drop = { into: over };
      drag.line.style.display = 'none';
      return;
    }
    const ts = drag.targets.filter(t => t.isConnected && t.offsetParent);
    const before = ts.find(t => { const r = t.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
    drag.drop = { before };
    const ref = before || ts[ts.length - 1];
    if (!ref) { drag.line.style.display = 'none'; return; }
    const rr = ref.getBoundingClientRect();
    Object.assign(drag.line.style, { display: 'block', left: rr.left + 'px', width: rr.width + 'px', top: (before ? rr.top : rr.bottom) - 2 + 'px' });
  };
  const start = e => {
    const el = pend.el, r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:500`;
    const line = document.createElement('div');
    line.className = 'drag-line';
    document.body.append(ghost, line);
    el.classList.add('drag-src');
    document.body.classList.add('is-dragging');
    drag = { el, ghost, line, dx: pend.x - r.left, dy: pend.y - r.top, targets: opt.targets(el).filter(t => t !== el), drop: null };
    if (pend.touch) { addEventListener('touchmove', noScroll, { passive: false }); navigator.vibrate?.(12); }
    pend = null;
    onMove(e);
  };
  const stopListening = () => {
    clearTimeout(pend?.timer); pend = null;
    removeEventListener('touchmove', noScroll);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
  };
  const onUp = async () => {
    stopListening();
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove(); d.line.remove(); d.el.classList.remove('drag-src');
    document.body.classList.remove('is-dragging');
    $$('.drop-into-target').forEach(n => n.classList.remove('drop-into-target'));
    swallow = true; setTimeout(() => { swallow = false; }, 0);
    if (d.drop && (d.drop.into || d.drop.before !== d.el)) {
      try { await opt.onDrop(d.el, d.drop); } catch (err) { toast(err.message, true); }
    }
  };
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = e.target.closest(opt.rows);
    if (!el || !root.contains(el) || e.target.closest('input, textarea, select, [data-nodrag]') || !opt.canDrag(el)) return;
    pend = { el, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', timer: null };
    if (pend.touch) pend.timer = setTimeout(() => pend && start({ clientX: pend.x, clientY: pend.y, preventDefault() {} }), 450);
    addEventListener('pointermove', onMove, { passive: false });
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
  });
  // A drag isn't a click.
  root.addEventListener('click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  // No browser text-selection or native dragging while holding.
  root.addEventListener('dragstart', e => { if (pend || drag) e.preventDefault(); });
}

// ---- channels and categories in the server sidebar ----
const _renderServerSidebarH = renderServerSidebar;
renderServerSidebar = function () {
  _renderServerSidebarH();
  const scroll = $('#sidebar-scroll');
  const sv = currentServer();
  if (!scroll || !sv) return;
  scroll.classList.toggle('can-arrange', hasPerm(sv, 'manage_channels'));
  holdDrag(scroll, {
    rows: '.ch-item[data-ch], .cat-head[data-cat]',
    canDrag: () => !!currentServer() && hasPerm(currentServer(), 'manage_channels'),
    targets: el => $$(el.matches('.cat-head') ? '.cat-head[data-cat]' : '.ch-item[data-ch], .cat-head[data-cat]', scroll),
    onDrop: (el, { before }) => (el.matches('.cat-head') ? moveCategory(el.dataset.cat, before?.dataset.cat || null) : moveChannel(el.dataset.ch, before)),
  });
};
async function moveChannel(id, before) {
  const sv = currentServer();
  const heads = $$('#sidebar-scroll .cat-head[data-cat]');
  let catId;
  if (before?.matches('.ch-item')) catId = sv.channels.find(c => c.id === before.dataset.ch)?.categoryId || null;
  else {
    // Just above a category header (or at the very end): the end of the group above it.
    const i = before ? heads.indexOf(before) : heads.length;
    catId = i > 0 ? heads[i - 1].dataset.cat : null;
  }
  const list = sv.channels.map(c => ({ id: c.id, categoryId: c.categoryId || null }));
  const moving = list.splice(list.findIndex(x => x.id === id), 1)[0];
  moving.categoryId = catId;
  let at = before?.matches('.ch-item') ? list.findIndex(x => x.id === before.dataset.ch) : -1;
  if (at < 0) { const last = list.map((x, i) => [x, i]).filter(([x]) => x.categoryId === catId).pop(); at = last ? last[1] + 1 : list.length; }
  list.splice(at, 0, moving);
  // Show it right away; the server confirms in a moment.
  const byId = Object.fromEntries(sv.channels.map(c => [c.id, c]));
  sv.channels = list.map(x => ({ ...byId[x.id], categoryId: x.categoryId || undefined }));
  if (catId && collapsedCats?.[catId]) { collapsedCats[catId] = false; saveCollapsed?.(); }
  renderServerSidebar();
  await api('PUT', `/api/servers/${sv.id}/layout`, { channels: list });
}
async function moveCategory(id, beforeId) {
  const sv = currentServer();
  const order = (sv.categories || []).map(c => c.id).filter(x => x !== id);
  const at = beforeId ? order.indexOf(beforeId) : order.length;
  order.splice(at < 0 ? order.length : at, 0, id);
  sv.categories = order.map(cid => sv.categories.find(c => c.id === cid));
  renderServerSidebar();
  await api('PUT', `/api/servers/${sv.id}/layout`, { categories: order });
}

// ---- roles in Server Settings › Roles ----
const _ssRolesH = ssRoles;
ssRoles = async function (body, sv) {
  await _ssRolesH(body, sv);
  const list = $('#role-items', body);
  if (!list) return;
  for (const x of $$('.role-item[draggable]', list)) { x.removeAttribute('draggable'); x.dataset.canMove = '1'; }
  holdDrag(list, {
    rows: '.role-item[data-can-move]',
    canDrag: () => true,
    targets: () => $$('.role-item', list),
    onDrop: async (el, { before }) => {
      const s = svById(sv.id);
      const order = s.roles.filter(r => !r.everyone).map(r => r.id).filter(id => id !== el.dataset.role);
      const at = !before || before.dataset.role === s.id ? order.length : order.indexOf(before.dataset.role);
      order.splice(at < 0 ? order.length : at, 0, el.dataset.role);
      if (before) before.before(el); else list.appendChild(el); // move it on screen right away
      await api('PUT', `/api/servers/${s.id}/roles-order`, { order });
      await refresh({}); ssRoles(body, svById(s.id));
    },
  });
};

// ---- DMs into categories ----
const _renderDMListH = renderDMList;
renderDMList = function (...a) {
  _renderDMListH(...a);
  const list = $('#dm-list');
  if (!list) return;
  holdDrag(list, {
    rows: '.dm-item[data-conv]',
    canDrag: () => true,
    targets: () => $$('#dm-list .dm-item[data-conv]'),
    into: '.dm-sec',
    onDrop: (el, { into, before }) => {
      // Which section did it land in? The header it was dropped on, or the section the line is in.
      let sec = into;
      if (!sec) {
        const all = $$('#dm-list .dm-sec, #dm-list .dm-item[data-conv]');
        const end = before ? all.indexOf(before) : all.length;
        sec = all.slice(0, end).reverse().find(n => n.matches('.dm-sec'));
      }
      if (!sec) return toast('Make a category first: right-click a conversation › New Category. Then drag chats into it.');
      moveConv(el.dataset.conv, sec);
    },
  });
};
function moveConv(conv, sec) {
  const lay = state.dmLayout || { pinned: [], cats: [] };
  const without = (arr, k) => (arr || []).filter(x => x !== k);
  const stripped = { pinned: without(lay.pinned, conv), cats: (lay.cats || []).map(c => ({ ...c, convs: without(c.convs, conv) })) };
  const name = sec.dataset.dmcat ? lay.cats.find(c => c.id === sec.dataset.dmcat)?.name : null;
  if (sec.dataset.dmsec === 'pinned') saveDmLayout({ ...stripped, pinned: [...stripped.pinned, conv] });
  else if (sec.dataset.dmcat) saveDmLayout({ ...stripped, cats: stripped.cats.map(c => (c.id === sec.dataset.dmcat ? { ...c, convs: [...c.convs, conv], collapsed: false } : c)) });
  else saveDmLayout(stripped);
  toast(sec.dataset.dmsec === 'pinned' ? '📌 Pinned' : name ? `Moved to ${name}` : 'Moved to Direct Messages');
}

// ======================= formatting bar for selected text =======================
const FMT = [
  ['bold', '<b>B</b>', 'Bold (Ctrl+B)', '**'], ['italic', '<i>I</i>', 'Italic (Ctrl+I)', '*'], ['underline', '<u>U</u>', 'Underline (Ctrl+U)', '__'],
  ['strike', '<s>S</s>', 'Strikethrough', '~~'], ['spoiler', '👁', 'Hidden (spoiler)', '||'], ['code', '&lt;/&gt;', 'Code', '`'], ['quote', '❝', 'Quote', '> '], ['link', '🔗', 'Link', ''],
];
let fmtBar = null, fmtTa = null, fmtX = null;
const isFmtBox = el => el?.matches?.('#composer-input, textarea.edit-box');
function applyFormat(ta, kind) {
  const [, , , mark] = FMT.find(f => f[0] === kind);
  let s = ta.selectionStart, e = ta.selectionEnd;
  const v = ta.value, sel = v.slice(s, e);
  ta.focus();
  if (kind === 'quote') {
    const lines = sel.split('\n');
    const quoted = lines.every(l => l.startsWith('> '));
    const out = quoted ? lines.map(l => l.slice(2)).join('\n') : lines.map(l => '> ' + l).join('\n');
    ta.setRangeText(out, s, e, 'select');
  } else if (kind === 'link') {
    // askText instead of prompt(), which doesn't exist in the desktop app.
    askText('Add a link', { value: 'https://', ok: 'Add', required: true, max: 2000 }).then(url => {
      if (!url || url === 'https://') return ta.focus();
      ta.focus();
      ta.setRangeText(`[${sel || 'link'}](${url})`, s, e, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return;
  } else {
    const m = kind === 'code' && sel.includes('\n') ? '```' : mark;
    const pre = m === '```' ? '```\n' : m, post = m === '```' ? '\n```' : m;
    if (v.slice(s - pre.length, s) === pre && v.slice(e, e + post.length) === post) {
      // Already formatted around the selection: take it off.
      ta.setRangeText(sel, s - pre.length, e + post.length, 'select');
    } else if (sel.startsWith(pre) && sel.endsWith(post) && sel.length >= pre.length + post.length) {
      ta.setRangeText(sel.slice(pre.length, sel.length - post.length), s, e, 'select');
    } else {
      // Keep spaces outside the marks ("hi " -> "**hi** ").
      const lead = sel.match(/^\s*/)[0], trail = sel.match(/\s*$/)[0], core = sel.trim();
      ta.setRangeText(lead + pre + core + post + trail, s, e, 'end');
      ta.setSelectionRange(s + lead.length + pre.length, s + lead.length + pre.length + core.length);
    }
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  showFmtBar(ta);
}
function hideFmtBar() { fmtBar?.remove(); fmtBar = null; }
function showFmtBar(ta) {
  if (!ta || ta.selectionStart === ta.selectionEnd || document.activeElement !== ta) return hideFmtBar();
  fmtTa = ta;
  if (!fmtBar) {
    fmtBar = document.createElement('div');
    fmtBar.className = 'fmt-bar';
    fmtBar.innerHTML = FMT.map(([k, label, title]) => `<button data-fmt="${k}" title="${title}" aria-label="${title}">${label}</button>`).join('');
    fmtBar.addEventListener('mousedown', e => e.preventDefault()); // keep the selection
    fmtBar.addEventListener('click', e => { const b = e.target.closest('[data-fmt]'); if (b && fmtTa) applyFormat(fmtTa, b.dataset.fmt); });
    document.body.appendChild(fmtBar);
  }
  const r = ta.getBoundingClientRect();
  const x = fmtX ?? r.left + r.width / 2;
  fmtBar.style.left = Math.max(8, Math.min(x - fmtBar.offsetWidth / 2, innerWidth - fmtBar.offsetWidth - 8)) + 'px';
  fmtBar.style.top = Math.max(8, r.top - fmtBar.offsetHeight - 10) + 'px';
}
document.addEventListener('mouseup', e => { if (isFmtBox(e.target)) { fmtX = e.clientX; setTimeout(() => showFmtBar(e.target), 0); } });
document.addEventListener('keyup', e => { if (isFmtBox(e.target) && (e.shiftKey || e.key === 'a' || e.key === 'Shift')) { fmtX = null; showFmtBar(e.target); } else if (isFmtBox(e.target)) showFmtBar(e.target); });
document.addEventListener('selectionchange', () => { if (fmtBar && fmtTa && (fmtTa.selectionStart === fmtTa.selectionEnd || document.activeElement !== fmtTa)) hideFmtBar(); });
document.addEventListener('focusout', e => { if (isFmtBox(e.target)) setTimeout(() => { if (document.activeElement !== fmtTa) hideFmtBar(); }, 100); });
document.addEventListener('keydown', e => {
  if (!isFmtBox(e.target) || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  const kind = !e.shiftKey && { b: 'bold', i: 'italic', u: 'underline' }[k];
  if (kind && e.target.selectionStart !== e.target.selectionEnd) { e.preventDefault(); applyFormat(e.target, kind); }
  if (e.key === 'Escape') hideFmtBar();
});
addEventListener('resize', hideFmtBar);

// ======================= reply highlights =======================
// The message you're replying to stays lit while you write, and hovering a reply lights up the
// message it answers.
function markReplying() {
  $$('#messages .msg.replying-to').forEach(n => n.classList.remove('replying-to'));
  const r = state.replyTo;
  if (r && r.conv === activeConv()) $(`#messages .msg[data-id="${CSS.escape(r.id)}"]`)?.classList.add('replying-to');
}
const _renderComposerExtrasH = renderComposerExtras;
renderComposerExtras = function () { _renderComposerExtrasH(); markReplying(); };
const _renderMessagesH17 = renderMessages;
renderMessages = function (...a) { _renderMessagesH17(...a); markReplying(); };
document.addEventListener('mouseover', e => {
  const ref = e.target.closest?.('#messages .reply-ref[data-jump]');
  $$('#messages .msg.reply-target').forEach(n => { if (!ref || n.dataset.id !== ref.dataset.jump) n.classList.remove('reply-target'); });
  if (ref) $(`#messages .msg[data-id="${CSS.escape(ref.dataset.jump)}"]`)?.classList.add('reply-target');
});

// ======================= favorite emoji =======================
const isFavEmoji = t => (state.favEmojis || []).includes(t);
let favEmojiTimer;
function toggleFavEmoji(t) {
  const on = isFavEmoji(t);
  state.favEmojis = on ? state.favEmojis.filter(x => x !== t) : [t, ...(state.favEmojis || [])].slice(0, 60);
  clearTimeout(favEmojiTimer);
  favEmojiTimer = setTimeout(() => api('PUT', '/api/me/fav-emojis', { emojis: state.favEmojis }).then(r => { state.favEmojis = r.favEmojis; }).catch(err => toast(err.message, true)), 400);
  return !on;
}
const favCell = t => {
  const m = /^<:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))>$/i.exec(t);
  return m ? `<button class="ep-e ep-c ep-fav" data-tok="${esc(t)}" data-name="${esc(m[1])}">${cemojiImg(m[1], m[2])}</button>`
    : `<button class="ep-e ep-fav" data-char="${esc(t)}" data-name="${esc(EMOJI.find(e => e.char === t)?.names[0] || '')}">${esc(t)}</button>`;
};
const _openEmojiPickerH = openEmojiPicker;
openEmojiPicker = function (anchor, onPick, opts) {
  _openEmojiPickerH(anchor, onPick, opts);
  const pop = $('.emoji-picker');
  if (!pop || pop.classList.contains('gif-picker')) return;
  const grid = $('.ep-grid', pop), search = $('.ep-search', pop), cats = $('.ep-cats', pop), foot = $('.ep-foot', pop);
  const forComposer = anchor?.id === 'composer-emoji';
  let hovered = null;
  const inject = () => {
    if (search.value.trim() || $('.ep-fav-sec', grid)) return;
    const favs = state.favEmojis || [];
    const sec = document.createElement('div');
    sec.className = 'ep-fav-sec';
    sec.innerHTML = `<h6 data-sec="Favorites">★ Favorites</h6>${favs.length ? `<div class="ep-row">${favs.map(favCell).join('')}</div>` : '<div class="ep-fav-empty">Right-click an emoji (or use ☆ below) to add it here.</div>'}`;
    grid.prepend(sec);
  };
  new MutationObserver(() => inject()).observe(grid, { childList: true });
  inject();
  const b = document.createElement('button');
  b.dataset.cat = 'favorites'; b.title = 'Favorites'; b.textContent = '★';
  cats.prepend(b);
  b.addEventListener('click', () => { search.value = ''; grid.scrollTop = 0; });
  const star = document.createElement('button');
  star.className = 'ep-star'; star.title = 'Add to favorites'; star.textContent = '☆';
  foot.appendChild(star);
  const syncStar = () => { const on = hovered && isFavEmoji(hovered); star.textContent = on ? '★' : '☆'; star.classList.toggle('on', !!on); star.disabled = !hovered; star.title = on ? 'Remove from favorites' : 'Add to favorites'; };
  syncStar();
  grid.addEventListener('mouseover', e => { const c = e.target.closest('.ep-e'); if (!c) return; hovered = c.dataset.tok || c.dataset.char; syncStar(); });
  const flip = t => { const on = toggleFavEmoji(t); $('.ep-fav-sec', grid)?.remove(); inject(); syncStar(); toast(on ? '★ Added to favorite emoji' : 'Removed from favorites'); };
  star.addEventListener('click', () => hovered && flip(hovered));
  grid.addEventListener('contextmenu', e => { const c = e.target.closest('.ep-e'); if (!c) return; e.preventDefault(); hovered = c.dataset.tok || c.dataset.char; flip(hovered); });
  // Picking a favorite server emoji works like picking it from its own section.
  grid.addEventListener('click', e => {
    const c = e.target.closest('.ep-fav.ep-c');
    if (!c) return;
    e.stopImmediatePropagation();
    onPick(forComposer ? `:${c.dataset.name}: ` : c.dataset.tok);
    if (!e.shiftKey) closeEmojiPicker();
  }, true);
};

// ======================= where a server emoji is from =======================
document.addEventListener('click', async e => {
  const img = e.target.closest('#messages .content img.cemoji, #messages .pi-text img.cemoji, .pc-bio img.cemoji');
  if (!img) return;
  e.preventDefault(); e.stopPropagation();
  const file = (img.getAttribute('src') || '').split('/').pop();
  const name = img.alt.replace(/:/g, '');
  const box = popover(img, 'emoji-info', `<div class="ei-top"><img src="${esc(img.src)}" alt=""><div><b>:${esc(name)}:</b><div class="muted small">Server emoji</div></div></div><div class="ei-server"><div class="fp-empty">Loading…</div></div>`);
  const place = () => {
    const r = img.getBoundingClientRect(), h = box.offsetHeight, w = box.offsetWidth;
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    box.style.top = (r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
  };
  place();
  let d;
  try { d = await api('GET', `/api/emojis/${encodeURIComponent(file)}`); } catch (err) { $('.ei-server', box).innerHTML = `<div class="fp-empty">${esc(err.message)}</div>`; return; }
  const s = d.server, el = $('.ei-server', box);
  if (!d.emoji) { el.innerHTML = '<div class="muted small">This emoji was deleted from its server.</div>'; return; }
  if (!s) { el.innerHTML = '<div class="muted small">It\'s from a private server. You can use it once you\'re invited.</div>'; return; }
  el.innerHTML = `<div class="muted small">From</div><div class="ei-sv">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : `<span class="ei-ico" style="--sv:${esc(s.iconColor || '#04c5ae')}">${esc([...s.name][0] || '?')}</span>`}<div><b>${esc(s.name)}</b><div class="muted small"><i class="dot on"></i>${s.online} online · ${s.memberCount} member${s.memberCount === 1 ? '' : 's'}</div></div></div>
    ${s.description ? `<div class="ei-desc">${esc(s.description)}</div>` : ''}
    ${s.joined ? '<button class="btn btn-grey btn-sm btn-block" data-ei="open">Go to Server</button>' : s.discoverable ? '<button class="btn btn-green btn-sm btn-block" data-ei="join">Join Server</button>' : ''}`;
  place();
  $('[data-ei=open]', el)?.addEventListener('click', () => { closeLayer(); openServer(s.id); });
  $('[data-ei=join]', el)?.addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    try { const { server } = await api('POST', `/api/discover/${s.id}/join`); closeLayer(); if (!state.servers.some(x => x.id === server.id)) state.servers.push(server); await openServer(server.id); toast(`Welcome to ${server.name}! 🎉`); }
    catch (err) { toast(err.message, true); ev.currentTarget.disabled = false; }
  });
}, true);

// ======================= turning off other people's profile videos and sounds =======================
const _profileCardH17 = profileCard;
profileCard = function (u, opts) {
  if (u && state.me && u.id !== state.me.id && prefs().othersProfileMedia === false) {
    u = { ...u, profileBackground: null, profileSound: null, profileBanner: u.profileBanner?.type === 'gif' ? null : u.profileBanner };
  }
  return _profileCardH17(u, opts);
};
const _renderMediaSettingsH = renderMediaSettings;
renderMediaSettings = function (body) {
  _renderMediaSettingsH(body);
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">Other people's profiles</h4>${prefToggle('othersProfileMedia', "Show other people's profile videos and sounds", 'Off: their video and GIF backgrounds, GIF banners and profile sounds never load or play. Your own still show for others.')}`;
  const h2 = $('h2', body);
  h2 ? h2.after(g) : body.prepend(g);
  wireToggles(g, () => showSettingsSection('media'), () => { if (typeof stopProfileSound === 'function') stopProfileSound(); });
  if (typeof US_WORDS === 'object' && US_WORDS.media && !US_WORDS.media.includes('disable')) US_WORDS.media += ' disable turn off videos audio sounds backgrounds others';
};

// ======================= profile sounds only while the profile is on screen =======================
// Checked a few times a second. The sound keeps playing while any bit of a card showing it can be
// seen. It pauses while the card is covered (settings, another window, Zuno in the background) and
// picks up again when it's back in view. It only stops for good when the card is gone (closed).
// Returns 'shown', 'covered' or 'gone'.
function profileCardState(url) {
  let found = false;
  for (const btn of $$('.pc-sound[data-sound]')) {
    if (!url.endsWith(btn.dataset.sound) && btn.dataset.sound !== url) continue;
    const card = btn.closest('.pcard') || btn;
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    found = true;
    // A 5×5 grid of spots on the card: one uncovered spot is enough.
    for (let fx = 0.1; fx < 1; fx += 0.2) for (let fy = 0.1; fy < 1; fy += 0.2) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      if (spotShows(card, x, y)) return 'shown';
    }
  }
  return found ? 'covered' : 'gone';
}
// Is the card visible at this spot? Invisible layers on top (the click-catchers behind menus and
// pickers, see-through tooltips) don't count as covering it.
function spotShows(card, x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (card.contains(el)) return true;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.3) continue;
    const bg = cs.backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 0];
    const alpha = bg.length > 3 ? Number(bg[3]) : 1;
    if (alpha >= 0.6 || cs.backgroundImage !== 'none' || el.tagName === 'IMG' || el.tagName === 'VIDEO') return false;
  }
  return false;
}
const profileOnScreen = url => profileCardState(url) === 'shown';
setInterval(() => {
  if (typeof profileAudio === 'undefined' || !profileAudio) return;
  const where = profileCardState(profileAudio.src);
  if (where === 'gone') return stopProfileSound();
  if (document.hidden || where === 'covered') {
    if (!profileAudio.paused) { profileAudio.autoPaused = true; profileAudio.pause(); }
  } else if (profileAudio.autoPaused && profileAudio.paused) {
    profileAudio.autoPaused = false;
    profileAudio.play().catch(() => {});
  }
}, 400);

// ======================= unread DMs under the Zuno logo =======================
// Everyone with unread messages for you gets their picture under the logo, with how many they sent.
function renderUnreadStack() {
  const home = $('#home-btn');
  if (!home || !state.me) return;
  let box = $('#rail-unread');
  if (!box) { box = document.createElement('div'); box.id = 'rail-unread'; box.className = 'rail-unread'; home.after(box); }
  const items = [
    ...state.dms.filter(x => x.unread > 0 && user(x.userId)).map(x => ({ key: x.userId, u: user(x.userId), n: x.unread, at: x.lastMessageAt || 0 })),
    ...state.groups.filter(g => g.unread > 0).map(g => ({ key: 'g:' + g.id, g, n: g.unread, at: g.lastMessageAt || 0 })),
  ].filter(x => !(x.g ? (state.view.type === 'group' && state.view.groupId === x.g.id) : activePeer() === x.key)).sort((a, b) => b.at - a.at);
  const shown = items.slice(0, 5);
  const html = shown.map(x => `<div class="rail-item ru-item"><button class="rail-btn ru-btn" data-ru="${esc(x.key)}" data-tip="${esc(x.g ? groupTitle(x.g) : x.u.displayName)}">${x.g ? groupIcon(x.g, 48) : avatar(x.u, 48)}<span class="ru-badge">${x.n > 99 ? '99+' : x.n}</span></button></div>`).join('')
    + (items.length > 5 ? `<div class="ru-more" title="More unread chats">+${items.length - 5}</div>` : '');
  if (box.dataset.html === html) return;
  box.dataset.html = html;
  box.innerHTML = html;
  $$('[data-ru]', box).forEach(b => b.addEventListener('click', () => { const k = b.dataset.ru; k.startsWith('g:') ? openGroup(k.slice(2)) : openDM(k); }));
  $('.ru-more', box)?.addEventListener('click', () => showFriends('online'));
}
const _renderFriendsBadgeH = renderFriendsBadge;
renderFriendsBadge = function (...a) { _renderFriendsBadgeH(...a); renderUnreadStack(); };
