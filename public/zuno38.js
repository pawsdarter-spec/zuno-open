'use strict';
// Zuno 0.38, "The Everything Update": a lot of polish all over, and bug fixes.

const ls38 = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const isPhone38 = () => VW <= 760;

// ======================= badge tooltips =======================
// The tooltip floats above everything (it used to be cut off by the profile card and land on top
// of the name), and is moved back on screen near an edge.
(() => {
  let tip = null, on = null;
  const hide = () => { tip?.remove(); tip = null; on = null; };
  const show = b => {
    const src = $('.pbadge-tip', b);
    if (!src) return;
    hide(); on = b;
    tip = document.createElement('div');
    tip.className = 'tip38';
    tip.innerHTML = src.innerHTML;
    document.body.appendChild(tip);
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(innerWidth - w - 8, x));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  document.addEventListener('mouseover', e => { const b = e.target.closest?.('.pbadge'); if (b && b !== on) show(b); else if (!b && on) hide(); });
  document.addEventListener('focusin', e => { const b = e.target.closest?.('.pbadge'); if (b) show(b); });
  document.addEventListener('focusout', e => { if (e.target.closest?.('.pbadge')) hide(); });
  addEventListener('scroll', hide, true);
  document.addEventListener('pointerdown', e => { if (!e.target.closest?.('.pbadge')) hide(); });
  new MutationObserver(() => { if (on && !on.isConnected) hide(); }).observe(document.body, { childList: true, subtree: true });
})();

// ======================= badge tray =======================
// Lots of badges: the first ones show, then a "+3" that shows the rest.
const BADGE_TRAY = 6;
const trayOpen = new Set(); // profiles whose "+N" you opened (it stays open when the card redraws)
function trayBadges(root) {
  const uid = root.querySelector?.('.pcard [data-profile], .pcard [data-uid]')?.dataset?.profile || root.dataset?.uid || '';
  for (const row of $$('.pc-badges', root)) {
    if (row.dataset.tray) continue;
    if (trayOpen.has(uid) || root.dataset.trayOpen) continue;
    const list = $$(':scope > .pbadge', row);
    if (list.length <= BADGE_TRAY) continue;
    row.dataset.tray = '1';
    list.slice(BADGE_TRAY).forEach(b => b.classList.add('tray-more'));
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'tray38'; more.textContent = '+' + (list.length - BADGE_TRAY);
    more.title = 'Show all badges';
    // The card can redraw right after a click (live updates), so remember it's open for this profile.
    more.addEventListener('click', e => { e.stopPropagation(); root.dataset.trayOpen = '1'; if (uid) trayOpen.add(uid); row.classList.add('tray-open'); $$('.tray-more', row).forEach(b => b.classList.remove('tray-more')); more.remove(); });
    row.appendChild(more);
  }
}

// ======================= compact profiles =======================
// The pop-up profile is a smaller card (name, badges, about me, roles) with "View full profile"
// for the rest (creations, comments, connections and so on), and it never goes past the window.
const PC_KEEP = '.pc-name-row, .pc-uname, .pc-custom, .pc-badges, .pc-bio, .pc-roles, .pc-mutuals, .pc-since, .pc-since-friends, .pc-actions, .pf-full38, .sp45';
function compactProfile(modal) {
  const body = $('.pc-body', modal);
  if (!body) return;
  if (!modal.dataset.c38) {
    modal.dataset.c38 = '1';
    modal.classList.add('pc-compact');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pf-full38'; btn.textContent = 'View full profile';
    btn.addEventListener('click', () => { modal.classList.remove('pc-compact'); btn.remove(); });
    body.appendChild(btn);
  }
  const kids = [...body.children];
  // Only changes what's different, so this never sets itself off again (it used to move the button
  // on every run, which counted as a change, so it ran forever and the button flickered).
  kids.forEach((el, i) => {
    let keep = el.matches(PC_KEEP);
    // A heading stays with what it's the heading of (like "Roles in …").
    if (!keep && el.tagName === 'H4' && kids[i + 1]?.matches('.pc-roles, .pc-bio')) keep = true;
    if (el.classList.contains('pc-extra') === keep) el.classList.toggle('pc-extra', !keep);
  });
  const btn = $('.pf-full38', body);
  if (btn) {
    if (body.lastElementChild !== btn) body.appendChild(btn);
    const hide = !kids.some(k => k.classList.contains('pc-extra')) && !$('.pcm-side', modal);
    if (btn.hidden !== hide) btn.hidden = hide;
  }
  trayBadges(modal);
}
const _openProfile38 = openProfile;
openProfile = function (...a) {
  const r = _openProfile38(...a);
  let n = 0;
  const tick = () => {
    const modal = $('#layer .modal:has(.pcard)') || $('#layer .modal .pcard')?.closest('.modal');
    if (modal) {
      compactProfile(modal);
      if (!modal.dataset.mo38) {
        modal.dataset.mo38 = '1';
        let t;
        const mo = new MutationObserver(muts => {
          if (!modal.classList.contains('pc-compact')) return mo.disconnect();
          if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.classList?.contains('pf-full38')))) return;
          clearTimeout(t); t = setTimeout(() => modal.isConnected && compactProfile(modal), 40);
        });
        mo.observe(modal, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 8000);
      }
    } else if (++n < 40) setTimeout(tick, 50);
  };
  Promise.resolve(r).then(() => setTimeout(tick, 0));
  return r;
};

// ======================= threads close when you go somewhere else =======================
// (An open thread used to stay on screen after going to Friends or another chat.)
for (const name of ['showFriends', 'openDM', 'openGroup', 'openVoice']) {
  const orig = window[name];
  if (typeof orig !== 'function') continue;
  window[name] = function (...a) { if (typeof threadView !== 'undefined' && threadView) closeThread(); return orig.apply(this, a); };
}
{
  const _openChannel38 = openChannel;
  openChannel = function (serverId, channelId, ...a) {
    if (typeof threadView !== 'undefined' && threadView && threadView.thread?.channelId !== channelId) closeThread();
    return _openChannel38(serverId, channelId, ...a);
  };
}

// ======================= messages slide in =======================
// New messages slide up softly (Settings › Chat › Message animations turns it off).
const msgAnimOn = () => ls38.get('zuno_msg_anim', true) !== false && !motionOff();
const seen38 = {}; // conv -> Set of message ids already drawn
const _renderMessages38 = renderMessages;
renderMessages = function (...a) {
  const r = _renderMessages38(...a);
  const conv = activeConv(), el = $('#messages');
  if (el && conv) {
    const known = seen38[conv];
    const ids = $$('.msg[data-id]', el).map(n => n.dataset.id);
    // Only messages that just arrived. Your own message animates once while sending, not again
    // when the server confirms it (it gets a new id then), and older ones loaded by scrolling up don't.
    if (known && msgAnimOn()) {
      const list = state.convos[conv]?.messages || [];
      for (const n of $$('.msg[data-id]', el)) {
        if (known.has(n.dataset.id)) continue;
        const m = list.find(x => x.id === n.dataset.id);
        if (!m || Date.now() - (m.createdAt || 0) > 8000 || (m.authorId === state.me.id && !m.pending)) continue;
        n.classList.add('msg-in38');
      }
    }
    seen38[conv] = new Set([...(known || []), ...ids]);
    addQuickReacts(el);
  }
  return r;
};

// ======================= quick reactions =======================
// Hovering a message shows your three most-used reactions, one click away.
const rxCounts = () => ls38.get('zuno_rx_counts', {});
function topReactions() {
  const c = rxCounts();
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([e]) => e).filter(e => !e.startsWith('<'));
  for (const d of ['👍', '❤️', '😂']) if (top.length < 3 && !top.includes(d)) top.push(d);
  return top.slice(0, 3);
}
function addQuickReacts(root) {
  const top = topReactions();
  for (const tools of $$('.msg-tools', root)) {
    const add = $('[data-react]', tools);
    if (!add || $('.qr38', tools)) continue;
    const id = add.dataset.react;
    add.insertAdjacentHTML('beforebegin', top.map(e => `<button class="qr38" data-qr="${esc(e)}" data-qr-msg="${esc(id)}" title="React ${esc(e)}">${esc(e)}</button>`).join(''));
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-qr]');
  if (!b) return;
  e.stopPropagation();
  toggleReaction(b.dataset.qrMsg, b.dataset.qr, b);
}, true);
const _toggleReaction38 = toggleReaction;
toggleReaction = function (msgId, emoji, ...a) {
  const c = rxCounts(); c[emoji] = (c[emoji] || 0) + 1; ls38.set('zuno_rx_counts', c);
  return _toggleReaction38(msgId, emoji, ...a);
};

// ======================= link previews =======================
// The site's icon next to its name, and a ✕ to hide a preview you don't want (just for you).
const hiddenEmbeds = new Set(ls38.get('zuno_hidden_embeds', []));
const _embedHtml38 = embedHtml;
embedHtml = function (url) {
  if (hiddenEmbeds.has(url)) return '';
  let html = _embedHtml38(url);
  if (!html || !/^<div class="embed/.test(html)) return html;
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  const icon = host ? `<img class="em-fav" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" alt="" loading="lazy" onerror="this.remove()">` : '';
  html = html.replace('<div class="em-site">', `<div class="em-site">${icon}`);
  if (!html.includes('class="em-site"') && icon) html = html.replace(/(<div class="em-text">)/, `$1<div class="em-site">${icon}${esc(host.replace(/^www\./, ''))}</div>`);
  return html.replace(/^<div class="embed([^"]*)"/, `<div class="embed$1 em38"`).replace(/<\/div>$/, `<button class="em-hide" data-embed-hide="${esc(url)}" title="Hide this preview">✕</button></div>`);
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-embed-hide]');
  if (!b) return;
  e.stopPropagation();
  hiddenEmbeds.add(b.dataset.embedHide);
  ls38.set('zuno_hidden_embeds', [...hiddenEmbeds].slice(-300));
  renderMessages();
}, true);

// ======================= code blocks: Copy =======================
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy-code]');
  if (!b) return;
  e.stopPropagation();
  const code = b.closest('.code38')?.querySelector('code');
  if (!code) return;
  navigator.clipboard?.writeText(code.textContent).then(() => { b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }).catch(() => toast("Couldn't copy that.", true));
}, true);

// ======================= "scroll to the bottom" shows how many are new =======================
const below38 = {}; // conv -> new messages since you scrolled up
function updateJump38() {
  const btn = $('.chat .jump-present'), conv = activeConv(), n = below38[conv] || 0;
  if (!btn) return;
  const label = n ? `${n > 99 ? '99+' : n} new message${n === 1 ? '' : 's'}` : 'Jump to present';
  if (btn.dataset.l38 !== label) { btn.dataset.l38 = label; btn.innerHTML = `${esc(label)} ${ICON.chevron}`; }
  btn.classList.toggle('has-new', n > 0);
}
const _onMessage38 = onMessage;
onMessage = function (payload, ...a) {
  const r = _onMessage38(payload, ...a);
  const conv = payload?.conv || payload?.peerId, el = $('#messages');
  if (conv && conv === activeConv() && el && payload.message?.authorId !== state.me?.id && el.scrollHeight - el.scrollTop - el.clientHeight > 600) { below38[conv] = (below38[conv] || 0) + 1; updateJump38(); }
  return r;
};
document.addEventListener('scroll', e => {
  if (e.target?.id !== 'messages') return;
  const el = e.target;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 600 && below38[activeConv()]) { below38[activeConv()] = 0; updateJump38(); }
}, true);

// ======================= typing: avatars and your own style =======================
// "Paws is meowing…" with your own three emoji bouncing instead of the dots (My Profile › Typing style).
renderTyping = function () {
  const el = $('#typing'), conv = activeConv();
  if (!el) return;
  const now = Date.now();
  const people = Object.entries(state.typing[conv] || {}).filter(([, t]) => t > now).map(([id]) => user(id)).filter(Boolean);
  const key = people.map(u => u.id + (u.typingStyle ? JSON.stringify(u.typingStyle) : '')).join('|');
  if (!people.length) { el.innerHTML = ''; el.dataset.who = ''; return; }
  if (el.dataset.who === key) return;
  el.dataset.who = key;
  const one = people.length === 1 ? people[0] : null, ts = one?.typingStyle;
  const verb = ts?.verb ? esc(ts.verb) : 'is typing';
  const label = one ? `<b>${esc(one.displayName)}</b> ${verb}…`
    : people.length === 2 ? `<b>${esc(people[0].displayName)}</b> and <b>${esc(people[1].displayName)}</b> are typing…`
    : people.length === 3 ? `<b>${esc(people[0].displayName)}</b>, <b>${esc(people[1].displayName)}</b> and <b>${esc(people[2].displayName)}</b> are typing…`
    : '<b>Several people</b> are typing…';
  const dots = ts?.emojis?.length ? `<span class="dots ty-emoji">${ts.emojis.map(e => `<i>${esc(e)}</i>`).join('')}</span>` : '<span class="dots"><i></i><i></i><i></i></span>';
  el.innerHTML = `<span class="ty-avs">${people.slice(0, 3).map(u => avatar(u, 18)).join('')}</span>${dots}<span>${label}</span>`;
};
function typingStyleEditor(body) {
  if (!body || $('#ts38', body) || !$('.profile-editor', body)) return;
  const cur = state.me.typingStyle || {};
  const d = { emojis: [...(cur.emojis || [])], verb: cur.verb || '' };
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'ts38';
  const draw = () => {
    const name = esc(state.me.displayName);
    g.innerHTML = `<h4 class="setting-head">Typing style</h4>
      <p class="setting-desc" style="margin:0 0 10px">What people see while you type. Pick up to three emoji to bounce instead of the dots, and your own words.</p>
      <div class="ts38-prev"><span class="dots${d.emojis.length ? ' ty-emoji' : ''}">${d.emojis.length ? d.emojis.map(e => `<i>${esc(e)}</i>`).join('') : '<i></i><i></i><i></i>'}</span><span><b>${name}</b> ${esc(d.verb || 'is typing')}…</span></div>
      <div class="ts38-row"><span class="ns-label" style="margin:0">Emoji</span>${[0, 1, 2].map(i => `<button type="button" class="ts38-e" data-tse="${i}" title="${d.emojis[i] ? 'Change' : 'Pick an emoji'}">${d.emojis[i] ? esc(d.emojis[i]) : '+'}</button>`).join('')}${d.emojis.length ? '<button type="button" class="btn btn-link btn-sm" data-ts-clear-e>Use dots</button>' : ''}</div>
      <label class="field" style="margin-top:10px">Words <span class="hint">(like "is meowing" or "is oversharing")</span><input id="ts38-verb" maxlength="30" placeholder="is typing" value="${esc(d.verb)}"></label>
      <div class="row-btns"><button type="button" class="btn btn-primary btn-sm" data-ts-save>Save Typing Style</button>${state.me.typingStyle ? '<button type="button" class="btn btn-link btn-sm" data-ts-reset>Reset</button>' : ''}</div>`;
    $$('[data-tse]', g).forEach(b => b.addEventListener('click', () => openEmojiPicker(b, emoji => { const i = +b.dataset.tse; d.emojis[i] = emoji; d.emojis = d.emojis.filter(Boolean); draw(); }, { title: 'Typing emoji' })));
    $('[data-ts-clear-e]', g)?.addEventListener('click', () => { d.emojis = []; draw(); });
    $('#ts38-verb', g).addEventListener('input', e => { d.verb = e.target.value; $('.ts38-prev span:last-child', g).innerHTML = `<b>${name}</b> ${esc(d.verb || 'is typing')}…`; });
    const save = async v => {
      try { const { me } = await api('PATCH', '/api/me', { typingStyle: v }); state.me = { ...state.me, ...me }; state.users[me.id] = { ...state.users[me.id], ...me }; toast(v ? 'Typing style saved ✨' : 'Typing style reset'); if (!v) { d.emojis = []; d.verb = ''; } draw(); }
      catch (err) { toast(err.message, true); }
    };
    $('[data-ts-save]', g).addEventListener('click', () => save(d.emojis.length || d.verb.trim() ? { emojis: d.emojis, verb: d.verb.trim() } : null));
    $('[data-ts-reset]', g)?.addEventListener('click', () => save(null));
  };
  draw();
  const anchor = $('#ns-editor', body);
  anchor ? anchor.after(g) : body.appendChild(g);
}

// ======================= pictures: arrows and swipes =======================
// In a picture opened from a chat, ← / → (or a swipe) go to the chat's other pictures.
const _openLightbox38 = openLightbox;
openLightbox = function (src, name = '', ...rest) {
  const r = _openLightbox38(src, name, ...rest);
  const list = $$('#messages [data-full], #thread-panel [data-full]').map(n => ({ src: n.dataset.full, name: n.dataset.name || '' })).filter((x, i, all) => all.findIndex(y => y.src === x.src) === i);
  const i = list.findIndex(x => x.src === src);
  const ov = $('#layer .lb33-ov') || $('#layer .overlay:last-child');
  if (!ov || i < 0 || list.length < 2) return r;
  const go = d => { const n = list[(i + d + list.length) % list.length]; openLightbox(n.src, n.name); };
  ov.insertAdjacentHTML('beforeend', `<button class="lb38-nav prev" aria-label="Previous picture">‹</button><button class="lb38-nav next" aria-label="Next picture">›</button><span class="lb38-count">${i + 1} / ${list.length}</span>`);
  $('.lb38-nav.prev', ov).addEventListener('click', e => { e.stopPropagation(); go(-1); });
  $('.lb38-nav.next', ov).addEventListener('click', e => { e.stopPropagation(); go(1); });
  const key = e => { if (!ov.isConnected) return removeEventListener('keydown', key, true); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); removeEventListener('keydown', key, true); go(e.key === 'ArrowLeft' ? -1 : 1); } };
  addEventListener('keydown', key, true);
  let sx = null;
  ov.addEventListener('touchstart', e => { sx = e.touches.length === 1 && !$('.lb33.zoomed', ov) ? e.touches[0].clientX : null; }, { passive: true });
  ov.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); });
  return r;
};

// ======================= servers: remembered for you =======================
// Folded categories, the last channel in each server and your last DM follow you to every device.
let ui38 = null;
async function loadUi38() {
  try { ui38 = (await api('GET', '/api/me/ui')).ui || {}; } catch { ui38 = {}; return; }
  for (const cats of Object.values(ui38.collapsed || {})) for (const id of cats) collapsedCats[id] = true;
  for (const [sv, ch] of Object.entries(ui38.lastChannel || {})) { const s = state.servers.find(x => x.id === sv); if (s && !s.lastChannel) s.lastChannel = ch; }
  lastCollapsedSent = collapsedKey();
}
const collapsedKey = () => JSON.stringify(Object.keys(collapsedCats).filter(k => collapsedCats[k]).sort());
let lastCollapsedSent = null, uiTimer = null, uiPending = {};
function pushUi(change) {
  Object.assign(uiPending, change);
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { const body = uiPending; uiPending = {}; api('PATCH', '/api/me/ui', body).then(r => { ui38 = r.ui; }).catch(() => {}); }, 800);
}
const _renderServerSidebar38 = renderServerSidebar;
renderServerSidebar = function (...a) {
  const r = _renderServerSidebar38(...a);
  const sv = currentServer();
  if (sv && ui38 && collapsedKey() !== lastCollapsedSent) {
    lastCollapsedSent = collapsedKey();
    const collapsed = {};
    for (const s of state.servers) collapsed[s.id] = (s.categories || []).filter(c => collapsedCats[c.id]).map(c => c.id);
    pushUi({ collapsed });
  }
  // The server's banner fades as you scroll the channel list.
  const scroll = $('#sidebar-scroll'), banner = $('.sv-banner', scroll);
  if (scroll && banner && !scroll.dataset.fade38) {
    scroll.dataset.fade38 = '1';
    scroll.addEventListener('scroll', () => { const b = $('.sv-banner', scroll); if (b) b.style.opacity = Math.max(0, 1 - scroll.scrollTop / 110).toFixed(2); }, { passive: true });
  }
  return r;
};
{
  const _openChannel38b = openChannel;
  openChannel = function (serverId, channelId, ...a) {
    const r = _openChannel38b(serverId, channelId, ...a);
    const ch = state.servers.find(s => s.id === serverId)?.channels.find(c => c.id === channelId);
    if (ch?.type === 'text' && ui38 && ui38.lastChannel?.[serverId] !== channelId) { (ui38.lastChannel ||= {})[serverId] = channelId; pushUi({ lastChannel: { server: serverId, channel: channelId } }); }
    return r;
  };
  const rememberDm = id => { if (ui38 && ui38.lastDm !== id) { ui38.lastDm = id; pushUi({ lastDm: id }); } };
  const _openDM38 = openDM;
  openDM = function (peerId, ...a) { rememberDm(peerId); return _openDM38(peerId, ...a); };
  const _openGroup38 = openGroup;
  openGroup = function (id, ...a) { rememberDm('g:' + id); return _openGroup38(id, ...a); };
}
// Going back to your DMs from a server opens the last one you were in (on bigger screens).
$('#home-btn')?.addEventListener('click', e => {
  if (isPhone38() || !ui38?.lastDm || !['channel', 'voice'].includes(state.view.type)) return;
  const id = ui38.lastDm;
  const ok = id.startsWith('g:') ? state.groups.some(g => g.id === id.slice(2)) : state.dms.some(x => x.userId === id) || state.friends.includes(id);
  if (!ok) return;
  e.stopImmediatePropagation();
  state.currentServerId = null;
  id.startsWith('g:') ? openGroup(id.slice(2)) : openDM(id);
  renderRail?.();
}, true);
(function waitMe38() { if (!state.me || !state.servers) return setTimeout(waitMe38, 400); loadUi38(); })();

// ======================= member hover cards =======================
// Hover someone in the member list for a mini profile; click for the full one.
(() => {
  let timer = null, card = null;
  const close = () => { clearTimeout(timer); card?.remove(); card = null; };
  document.addEventListener('mouseover', e => {
    const row = e.target.closest?.('#profile-panel [data-member]');
    if (!row) { if (card && !e.target.closest?.('.mh38')) { clearTimeout(timer); timer = setTimeout(close, 150); } return; }
    if (card?.dataset.uid === row.dataset.member) { clearTimeout(timer); return; }
    clearTimeout(timer);
    const uid = row.dataset.member;
    timer = setTimeout(() => {
      // The list can be redrawn while you hover (someone comes online), so find the row again.
      const row2 = row.isConnected ? row : $(`#profile-panel [data-member="${CSS.escape(uid)}"]`);
      const u = user(uid);
      if (!u || !row2) return;
      close();
      const sv = currentServer(), role = sv ? topRole(u.id, sv) : null;
      card = document.createElement('div');
      card.className = 'mh38'; card.dataset.uid = u.id;
      card.innerHTML = `<div class="mh38-banner" style="background:${esc(u.bannerColor || 'var(--brand)')}">${u.profileBanner?.url ? `<img src="${esc(u.profileBanner.url)}" alt="">` : u.profileBackground?.url ? (u.profileBackground.type === 'video' ? `<video src="${esc(u.profileBackground.url)}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${esc(u.profileBackground.url)}" alt="">`) : ''}</div>
        <div class="mh38-av">${avatar(u, 56, true)}</div>
        <div class="mh38-body"><div class="mh38-name"><b${nameStyle(u)}>${esc(nameIn(u))}</b>${officialTag(u)}</div><div class="muted small">@${esc(u.username || '')}${u.pronouns ? ' · ' + esc(u.pronouns) : ''}</div>
        ${u.customStatus ? `<div class="mh38-st">${esc(statusLine(u))}</div>` : ''}${u.bio ? `<div class="mh38-bio">${formatMessage(u.bio)}</div>` : ''}
        ${role ? `<div class="mh38-role"><i style="background:${esc(role.color || '#9aa6a4')}"></i>${esc(role.name)}</div>` : ''}${badgeRow(u)}</div>`;
      document.body.appendChild(card);
      const r = row2.getBoundingClientRect(), h = card.offsetHeight;
      card.style.left = Math.max(8, r.left - card.offsetWidth - 10) + 'px';
      card.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.top - 20)) + 'px';
      card.addEventListener('mouseleave', () => { timer = setTimeout(close, 150); });
      card.addEventListener('mouseenter', () => clearTimeout(timer));
      card.addEventListener('click', () => { const id = u.id; close(); openProfile(id); });
    }, 380);
  });
  document.addEventListener('click', e => { if (e.target.closest?.('[data-member]')) close(); });
  addEventListener('scroll', e => { if (card && e.target.closest?.('#profile-panel')) { card.remove(); card = null; } }, true);
})();

// ======================= notifications inbox =======================
// Tabs for All, Mentions, Unread and Requests (accept friend requests right there), reactions to
// the same message grouped together, Mark all read, and it scrolls inside instead of running off
// the screen.
openInbox = async function (anchor) {
  const box = popover(anchor, 'inbox-pop ib38', `<div class="pop-head">🔔 Notifications<span class="ib-acts"><button class="btn btn-link btn-sm" id="ib-read">Mark all read</button><button class="btn btn-link btn-sm" id="ib-clear">Clear all</button></span>
      <span class="ib-tabs"><button data-ibt="all" class="on">All</button><button data-ibt="mentions">Mentions</button><button data-ibt="unread">Unread</button><button data-ibt="requests">Requests<b class="ib-n"></b></button></span></div>
    <div class="pop-list"><div class="fp-empty">Loading…</div></div>`);
  let data;
  try { data = await api('GET', '/api/me/notifications'); } catch (e) { $('.pop-list', box).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
  for (const u of data.users) state.users[u.id] = { ...u, ...state.users[u.id] };
  api('POST', '/api/me/notifications/seen').catch(() => {});
  state.notifUnread = 0; setInboxBadge();
  let tab = 'all';
  const incoming = () => (state.requests || []).filter(r => r.direction === 'incoming');
  const setCount = () => { const n = incoming().length; $('.ib-n', box).textContent = n ? ` ${n}` : ''; };
  // Reactions to the same message become one row: "Paws, og and 2 others reacted 😂 ❤️".
  const grouped = list => {
    const out = [], byMsg = new Map();
    for (const n of list) {
      if (n.type !== 'reaction' || !n.msgId) { out.push(n); continue; }
      const g = byMsg.get(n.msgId);
      if (g) { g.group.push(n); if (n.unread) g.unread = true; continue; }
      const row = { ...n, group: [n] };
      byMsg.set(n.msgId, row); out.push(row);
    }
    return out;
  };
  const rowHtml = n => {
    if (n.group?.length > 1) {
      const who = [...new Set(n.group.map(x => x.from))].map(id => user(id)?.displayName || 'Someone');
      const emojis = [...new Set(n.group.map(x => x.emoji).filter(Boolean))].slice(0, 5).join(' ');
      const names = who.length === 2 ? `<b>${esc(who[0])}</b> and <b>${esc(who[1])}</b>` : `<b>${esc(who[0])}</b>, <b>${esc(who[1])}</b>${who.length > 2 ? ` and ${who.length - 2} other${who.length - 2 === 1 ? '' : 's'}` : ''}`;
      return `<div class="ib-item${n.group.some(x => x.unread) ? ' unread' : ''}" data-n="${esc(n.id)}"><span class="ib-stack">${n.group.slice(0, 3).map(x => avatar(user(x.from) || { displayName: '?' }, 26)).join('')}</span><div class="ib-body"><div>${who.length > 1 ? names : `<b>${esc(who[0])}</b>`} reacted ${esc(emojis)} to your message</div>
        ${n.text ? `<div class="ib-snip">${formatMessage(n.text)}</div>` : ''}<div class="muted small">${esc(fmtTime(n.at))}${n.server ? ' · ' + esc(n.server) : ''}</div></div><button class="icon-btn ib-x" title="Remove">✕</button></div>`;
    }
    const u = user(n.from) || { displayName: 'Someone' };
    return `<div class="ib-item${n.unread ? ' unread' : ''}" data-n="${esc(n.id)}">${avatar(u, 36)}<div class="ib-body"><div><b>${esc(u.displayName)}</b> ${(NOTIF_TEXT[n.type] || (() => ''))(n)}</div>
      ${n.text ? `<div class="ib-snip">${formatMessage(n.text)}</div>` : ''}<div class="muted small">${esc(fmtTime(n.at))}${n.server ? ' · ' + esc(n.server) : ''}</div></div><button class="icon-btn ib-x" title="Remove">✕</button></div>`;
  };
  const draw = () => {
    setCount();
    const list = $('.pop-list', box);
    if (tab === 'requests') {
      const reqs = incoming();
      list.innerHTML = reqs.length ? reqs.map(r => { const u = user(r.userId) || { displayName: 'Someone' }; return `<div class="ib-item ib-req" data-req="${esc(r.id)}" data-uid="${esc(r.userId)}">${avatar(u, 36)}<div class="ib-body"><div><b>${esc(u.displayName)}</b> sent you a friend request</div><div class="muted small">@${esc(u.username || '')}${r.createdAt ? ' · ' + esc(fmtTime(r.createdAt)) : ''}</div></div>
        <button class="btn btn-green btn-sm" data-ok>Accept</button><button class="btn btn-grey btn-sm" data-no>Ignore</button></div>`; }).join('')
        : `<div class="fp-empty">${mascot('sleepy')}<div>No friend requests right now.</div></div>`;
      $$('[data-req]', list).forEach(row => {
        $('[data-ok]', row).addEventListener('click', async e => { e.stopPropagation(); await acceptRequest(row.dataset.req); state.requests = (state.requests || []).filter(r => r.id !== row.dataset.req); draw(); });
        $('[data-no]', row).addEventListener('click', async e => { e.stopPropagation(); await rejectRequest(row.dataset.req); state.requests = (state.requests || []).filter(r => r.id !== row.dataset.req); draw(); });
        row.addEventListener('click', () => { closeLayer(); openProfile(row.dataset.uid); });
      });
      return;
    }
    const items = grouped(data.items.filter(n => tab === 'all' || (tab === 'mentions' ? ['mention', 'reply'].includes(n.type) : n.unread)));
    list.innerHTML = items.length ? items.map(rowHtml).join('') : `<div class="fp-empty">${mascot('sleepy')}<div>${tab === 'unread' ? 'Nothing unread.' : "You're all caught up!"}</div></div>`;
    $$('.ib-item', list).forEach(row => {
      const n = items.find(x => x.id === row.dataset.n);
      row.addEventListener('click', e => {
        if (e.target.closest('.ib-x')) {
          for (const x of n.group || [n]) api('DELETE', `/api/me/notifications/${x.id}`).catch(() => {});
          const gone = new Set((n.group || [n]).map(x => x.id));
          data.items = data.items.filter(x => !gone.has(x.id)); return draw();
        }
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
  $('#ib-read', box).addEventListener('click', () => { for (const n of data.items) n.unread = false; draw(); toast('All marked as read'); });
  draw();
};

// ======================= quiet hours =======================
// Between your quiet times, no message sounds or pop-ups on this device, and no phone
// notifications (calls still ring). Settings › Notifications.
const quietNow = () => {
  const q = state.extras?.quietHours || state.quietHours38;
  if (!q?.on) return false;
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  const m = s => +s.slice(0, 2) * 60 + +s.slice(3), a = m(q.from), b = m(q.to);
  return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b;
};
window.quietNow = quietNow;
{
  const _playPing38 = playPing;
  playPing = function (...a) { if (quietNow()) return; return _playPing38(...a); };
  const N = window.Notification;
  if (N) {
    const Q = function (title, opts) { if (quietNow() && !/calling/i.test(title)) return { close() {}, addEventListener() {}, set onclick(v) {} }; return new N(title, opts); };
    Object.defineProperty(Q, 'permission', { get: () => N.permission });
    Q.requestPermission = (...a) => N.requestPermission(...a);
    Q.prototype = N.prototype;
    window.Notification = Q;
  }
}
async function quietHoursSettings(body) {
  if (!body || $('#qh38', body)) return;
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'qh38';
  body.appendChild(g);
  let d;
  try { d = await api('GET', '/api/me/quiet-hours'); } catch { g.remove(); return; }
  const q = d.quietHours;
  state.quietHours38 = q;
  g.innerHTML = `<h4 class="setting-head">Quiet hours</h4>
    <label class="setting-row"><div style="flex:1"><div class="setting-title">Quiet at night</div><div class="setting-desc">No message sounds, pop-ups or phone notifications between these times. Calls still ring.</div></div><input type="checkbox" class="switch" id="qh-on"${q.on ? ' checked' : ''}></label>
    <div class="qh38-times"><label>From <input type="time" id="qh-from" value="${esc(q.from)}"></label><label>Until <input type="time" id="qh-to" value="${esc(q.to)}"></label><span class="muted small" id="qh-now">${d.now ? '🌙 Quiet right now' : ''}</span></div>`;
  const save = async () => {
    try {
      const r = await api('PUT', '/api/me/quiet-hours', { on: $('#qh-on', g).checked, from: $('#qh-from', g).value || '22:00', to: $('#qh-to', g).value || '08:00', tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      state.quietHours38 = r.quietHours; if (state.extras) state.extras.quietHours = r.quietHours;
      $('#qh-now', g).textContent = r.now ? '🌙 Quiet right now' : '';
      toast(r.quietHours.on ? `Quiet from ${r.quietHours.from} to ${r.quietHours.to}` : 'Quiet hours off');
    } catch (e) { toast(e.message, true); }
  };
  for (const id of ['#qh-on', '#qh-from', '#qh-to']) $(id, g).addEventListener('change', save);
}

// ======================= settings hooks =======================
const _showSettingsSection38 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  const r = _showSettingsSection38(section, ...a);
  Promise.resolve(r).then(() => setTimeout(() => {
    const body = $('#settings-body');
    if (!body) return;
    if (section === 'profile') typingStyleEditor(body);
    if (section === 'notifications') quietHoursSettings(body);
    if (section === 'chat' && !$('#ma38', body)) {
      const g = document.createElement('div');
      g.className = 'setting-group'; g.id = 'ma38';
      g.innerHTML = `<h4 class="setting-head">Animations</h4><label class="setting-row"><div style="flex:1"><div class="setting-title">Message animations</div><div class="setting-desc">New messages slide in softly.</div></div><input type="checkbox" class="switch" id="ma38-on"${ls38.get('zuno_msg_anim', true) !== false ? ' checked' : ''}></label>`;
      body.appendChild(g);
      $('#ma38-on', g).addEventListener('change', e => { ls38.set('zuno_msg_anim', e.target.checked); toast(e.target.checked ? 'Message animations on' : 'Message animations off'); });
    }
  }, 60));
  return r;
};

// ======================= calls: who's talking, and signal bars =======================
// Signal bars on everyone in a call: green is great, yellow is okay, red is struggling.
setInterval(async () => {
  if (!Calls.room || !Calls.peerIds) return;
  for (const id of Calls.peerIds()) {
    let q = null;
    try {
      const stats = await Calls.stats(id);
      let rtt = null, lost = 0, got = 0;
      stats?.forEach(s => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime * 1000;
        if (s.type === 'inbound-rtp' && s.kind === 'audio') { lost += s.packetsLost || 0; got += s.packetsReceived || 0; }
      });
      const loss = got + lost ? lost / (got + lost) : 0;
      if (rtt != null) q = rtt < 150 && loss < 0.02 ? 3 : rtt < 350 && loss < 0.08 ? 2 : 1;
    } catch {}
    for (const t of $$(`.tile[data-tile="${CSS.escape(id)}"]`)) {
      let b = $('.sig38', t);
      if (q == null) { b?.remove(); continue; }
      if (!b) { b = document.createElement('span'); b.className = 'sig38'; b.innerHTML = '<i></i><i></i><i></i>'; t.appendChild(b); }
      b.dataset.q = q; b.title = ['', 'Weak connection', 'Okay connection', 'Great connection'][q];
    }
  }
}, 3000);
// Join & leave sounds, per server: Default, Soft or Off (server menu).
function vcSoundMode(serverId) { return ls38.get('zuno_vc_sounds', {})[serverId] || 'default'; }
{
  const _openServerMenu38 = openServerMenu;
  openServerMenu = function (anchor, sv = currentServer(), ...a) {
    const r = _openServerMenu38(anchor, sv, ...a);
    const menu = $$('#layer .menu').pop();
    if (!sv || !menu) return r;
    const mode = vcSoundMode(sv.id), next = { default: 'soft', soft: 'off', off: 'default' }[mode];
    const label = { default: 'Default', soft: 'Soft', off: 'Off' }[mode];
    const b = document.createElement('button');
    b.innerHTML = `<span class="mi-ico">🔔</span><span>Join & leave sounds: <b>${label}</b></span>`;
    b.addEventListener('click', () => { const all = ls38.get('zuno_vc_sounds', {}); all[sv.id] = next; ls38.set('zuno_vc_sounds', all); toast(`Join & leave sounds in ${sv.name}: ${({ default: 'Default', soft: 'Soft', off: 'Off' })[next]}`); closeLayer(); });
    const sep = $('.sep', menu);
    sep ? sep.before(b) : menu.appendChild(b);
    return r;
  };
}

// ======================= switching pages =======================
// A quick fade when you move between chats, servers and Friends.
(() => {
  const main = $('#main');
  if (!main) return;
  let last = '';
  new MutationObserver(() => {
    const key = JSON.stringify([state.view?.type, state.view?.channelId, state.view?.peerId, state.view?.groupId, state.view?.tab]);
    if (key === last || motionOff()) { last = key; return; }
    last = key;
    main.classList.remove('fade38'); void main.offsetWidth; main.classList.add('fade38');
  }).observe(main, { childList: true });
})();

// ======================= phones: tab bar, swipe hints, bigger buttons =======================
// A bar along the bottom on the home screens: Home, Servers, Notifications and You. It hides inside
// a chat so the message box has the room.
(() => {
  const bar = document.createElement('nav');
  bar.className = 'tabbar38'; bar.hidden = true;
  bar.innerHTML = `<button data-tb="home"><span>🏠</span>Home</button><button data-tb="servers"><span>🗂️</span>Servers</button><button data-tb="inbox"><span>🔔</span>Notifications<b class="tb-n"></b></button><button data-tb="you"><span class="tb-you"></span>You</button>`;
  document.body.appendChild(bar);
  const app = $('#app');
  const sync = () => {
    const show = isPhone38() && state.me && !app.classList.contains('hidden') && !$('#layer .settings') && (app.classList.contains('show-nav') || state.view?.type === 'friends');
    if (bar.hidden !== !show) bar.hidden = !show; // (0.47) only when it changes
    document.body.classList.toggle('has-tabbar38', show);
    if (!show) return;
    const you = $('.tb-you', bar);
    if (you && you.dataset.id !== state.me.avatar + state.me.id) { you.dataset.id = state.me.avatar + state.me.id; you.innerHTML = avatar(state.me, 22); }
    const n = (state.notifUnread || 0) + (state.requests || []).filter(r => r.direction === 'incoming').length;
    $('.tb-n', bar).textContent = n ? (n > 99 ? '99+' : n) : '';
    const tab = $('#layer .inbox-pop') ? 'inbox' : app.classList.contains('show-nav') && state.currentServerId ? 'servers' : 'home';
    $$('[data-tb]', bar).forEach(b => b.classList.toggle('on', b.dataset.tb === tab));
  };
  setInterval(sync, 700);
  addEventListener('resize', sync);
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tb]');
    if (!b) return;
    const t = b.dataset.tb;
    if (t === 'home') { closeLayer(); state.currentServerId = null; showFriends('online'); app.classList.add('show-nav'); renderRail?.(); renderDMList?.(); }
    if (t === 'servers') { closeLayer(); const sv = state.currentServerId || state.servers[0]?.id; if (sv) openServer(sv); setTimeout(() => app.classList.add('show-nav'), 50); }
    if (t === 'inbox') openInbox(b);
    if (t === 'you') openSettings('account');
    setTimeout(sync, 80);
  });
})();
// The first time you open a chat on a phone, a little hint about swipes.
(() => {
  const KEY = 'zuno_swipe_hint';
  const _openChat = () => {
    if (!isPhone38() || ls38.get(KEY, false) || !$('#messages')) return;
    ls38.set(KEY, true);
    const h = document.createElement('div');
    h.className = 'hint38';
    h.innerHTML = '<b>👆 Tip</b><span>Swipe a message left to reply. Swipe right anywhere for your servers and chats.</span><button>Got it</button>';
    document.body.appendChild(h);
    const go = () => h.remove();
    $('button', h).addEventListener('click', go);
    setTimeout(go, 9000);
  };
  for (const name of ['openDM', 'openChannel', 'openGroup']) {
    const orig = window[name];
    window[name] = function (...a) { const r = orig.apply(this, a); Promise.resolve(r).then(() => setTimeout(_openChat, 800)); return r; };
  }
})();

// ======================= staff: bug reports and activity =======================
const BUG_REPLIES = [
  ['Fixed next batch', 'This will be fixed next batch. Thanks for letting us know!'],
  ['Fixed now', "This is fixed now. Reload Zuno (or restart the app) to get it. Thanks for reporting!"],
  ["Can't reproduce", "We couldn't make this happen on our side. If it keeps happening, send another report with a screenshot and the steps."],
  ['Need more info', 'Thanks! Could you send another report with a screenshot and the exact steps, so we can find it?'],
  ['Known issue', "We already know about this one and we're working on it. Thanks!"],
];
const _renderBugInbox38 = renderBugInbox;
renderBugInbox = function (body, ...a) {
  const r = _renderBugInbox38(body, ...a);
  Promise.resolve(r).then(() => {
    for (const note of $$('.bug-note', body)) {
      if (note.previousElementSibling?.classList.contains('bq38')) continue;
      const row = document.createElement('div');
      row.className = 'bq38';
      row.innerHTML = BUG_REPLIES.map(([l], i) => `<button type="button" data-bq="${i}">${esc(l)}</button>`).join('');
      note.before(row);
      $$('[data-bq]', row).forEach(b => b.addEventListener('click', () => { note.value = BUG_REPLIES[+b.dataset.bq][1]; note.focus(); }));
    }
  });
  return r;
};
// Moderation › Staff Activity: what everyone on the team did with staff tools.
const _renderModeration38 = renderModeration;
renderModeration = async function (body) {
  if (modTab !== 'staffact') {
    const r = await _renderModeration38(body);
    addStaffActTab(body);
    return r;
  }
  body.innerHTML = `<h2>Moderation</h2><div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}">${l}</button>`).join('')}</div><div id="mod-body" style="margin-top:16px"></div>`;
  $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
  addCreationsTab?.(body); addCreatorsTab37?.(body); addStaffActTab(body);
  drawStaffActivity($('#mod-body', body), 1);
};
function addStaffActTab(body) {
  const tabs = $('.mod-tabs', body);
  if (!tabs || $('[data-mt38]', tabs)) return;
  if (modTab === 'staffact') $$('button', tabs).forEach(b => b.classList.remove('on'));
  tabs.insertAdjacentHTML('beforeend', `<button data-mt38 class="${modTab === 'staffact' ? 'on' : ''}">Staff Activity</button>`);
  $('[data-mt38]', tabs).addEventListener('click', () => { modTab = 'staffact'; renderModeration(body); });
}
async function drawStaffActivity(box, days) {
  if (!box) return;
  let d;
  try { d = await api('GET', `/api/staff/activity?days=${days}`); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  for (const u of d.people) state.users[u.id] = { ...state.users[u.id], ...u };
  const by = {};
  for (const x of d.items) (by[x.by] ||= []).push(x);
  box.innerHTML = `<div class="sa38-top"><div class="segmented">${[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([n, l]) => `<button data-sad="${n}" class="${days === n ? 'on' : ''}">${l}</button>`).join('')}</div><span class="muted small">${d.items.length} action${d.items.length === 1 ? '' : 's'}</span></div>
    ${d.items.length ? Object.entries(by).map(([id, list]) => { const u = user(id) || { displayName: 'Someone' }; return `<div class="sa38-person"><div class="sa38-head">${avatar(u, 28)}<b>${esc(u.displayName)}</b><span class="muted small">${list.length} action${list.length === 1 ? '' : 's'}</span></div>
      ${list.map(x => `<div class="sa38-row"><span class="muted small">${esc(fmtTime(x.at))}</span><span>${esc(x.text.replace(/the ([a-z_]+) badge/, (m, k) => `the ${BADGE_INFO[k]?.label || k} badge`))}</span></div>`).join('')}</div>`; }).join('')
      : `<div class="empty-state"><div class="title">Quiet ${days === 1 ? 'day' : 'stretch'}</div><div>No staff actions ${days === 1 ? 'today' : 'in this time'}.</div></div>`}`;
  $$('[data-sad]', box).forEach(b => b.addEventListener('click', () => drawStaffActivity(box, +b.dataset.sad)));
}
