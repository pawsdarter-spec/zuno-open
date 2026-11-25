'use strict';
// Zuno 0.29: server tags and badges in Settings › Profiles, the golden Senior Bug Hunter badge,
// and polish.

// ======================= Senior Bug Hunter =======================
BADGE_INFO.bughunter_senior = {
  label: 'Senior Bug Hunter', desc: 'Had 5 bug reports confirmed by the Zuno team',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgBugGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".55" stop-color="#f5b82e"/><stop offset="1" stop-color="#c9820e"/></linearGradient>
      <linearGradient id="bgBugGoldRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c9"/><stop offset="1" stop-color="#a86a05"/></linearGradient></defs>
    <circle cx="12" cy="12" r="10.6" fill="url(#bgBugGoldRim)"/><circle cx="12" cy="12" r="9.4" fill="url(#bgBugGold)"/>
    <ellipse cx="12" cy="13.6" rx="3.6" ry="4.4" fill="#fffaf0"/><circle cx="12" cy="8.4" r="2.2" fill="#fffaf0"/>
    <path d="M12 9.6v8.2" stroke="#c9820e" stroke-width="1"/>
    <path d="M8.4 11.6 6 10.4M8.2 14.2H5.6M8.6 16.6 6.4 18M15.6 11.6l2.4-1.2M15.8 14.2h2.6M15.4 16.6l2.2 1.4M10.8 6.6 9.6 5M13.2 6.6 14.4 5" stroke="#fffaf0" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M18.6 3.2l.55 1.2 1.25.15-.95.85.25 1.25-1.1-.65-1.1.65.25-1.25-.95-.85 1.25-.15z" fill="#fff"/></svg>`,
};

// ======================= Settings › Profiles: server tag & badges =======================
// Wearing a tag used to live only in each server's menu. Now it's next to your decorations,
// along with switches to hide any of your badges.
const _flairProfileFields29 = flairProfileFields;
flairProfileFields = function (d) {
  return _flairProfileFields29(d) + `
    <div class="field">Server Tag <span class="hint">(shows next to your name everywhere)</span><div id="tag-pick"></div></div>
    <div class="field">Badges <span class="hint">(click one to hide it from your profile; click again to show it)</span><div id="badge-pick" class="bp-grid"><span class="muted small">Loading…</span></div></div>`;
};
const _wireFlairFields29 = wireFlairFields;
wireFlairFields = function (form, d, update) {
  _wireFlairFields29(form, d, update);
  drawTagPick(form, update);
  drawBadgePick(form, update);
};
function drawTagPick(form, update) {
  const el = $('#tag-pick', form);
  if (!el) return;
  const tagged = state.servers.filter(s => s.tag?.text);
  const cur = state.me?.serverTag?.serverId || '';
  if (!tagged.length) {
    el.innerHTML = `<div class="tp-none muted small">None of your servers have a tag yet. A server's owner can make one in Server Settings › Server Tag.</div>`;
    return;
  }
  const chip = t => `<span class="srv-tag"${safeColor(t.color) ? ` style="--tc:${esc(t.color)}"` : ''}>${tagEmojiHtml(t)}${esc(t.text)}</span>`;
  el.innerHTML = `<div class="flair-grid tp-grid">
    <button type="button" class="flair-opt tp-opt${cur ? '' : ' on'}" data-tag=""><span class="flair-none">✕</span><small>None</small></button>
    ${tagged.map(s => `<button type="button" class="flair-opt tp-opt${cur === s.id ? ' on' : ''}" data-tag="${esc(s.id)}" title="${esc(s.name)}">${chip(s.tag)}<small>${esc(s.name)}</small></button>`).join('')}</div>`;
  $$('[data-tag]', el).forEach(b => b.addEventListener('click', async () => {
    if (b.classList.contains('on')) return;
    $$('[data-tag]', el).forEach(x => x.disabled = true);
    await wearTag(b.dataset.tag || null);
    drawTagPick(form, update);
    update();
  }));
}
async function drawBadgePick(form, update) {
  const el = $('#badge-pick', form);
  if (!el) return;
  let d;
  try { d = await api('GET', '/api/me/badges'); } catch { el.innerHTML = '<span class="muted small">Your badges couldn\'t be loaded.</span>'; return; }
  const owned = d.owned.filter(b => BADGE_INFO[b]);
  if (!owned.length) { el.innerHTML = '<span class="muted small">You don\'t have any badges yet.</span>'; return; }
  const hidden = new Set(d.hidden);
  const draw = () => {
    el.innerHTML = owned.map(b => `<button type="button" class="bp-opt${hidden.has(b) ? ' off' : ''}" data-bp="${esc(b)}" aria-pressed="${!hidden.has(b)}" title="${hidden.has(b) ? 'Hidden. Click to show it' : 'Showing. Click to hide it'}">
      <span class="bp-ico">${BADGE_INFO[b].svg}</span><span class="bp-name">${esc(BADGE_INFO[b].label)}</span><span class="bp-eye">${hidden.has(b) ? 'Hidden' : 'Shown'}</span></button>`).join('');
    $$('[data-bp]', el).forEach(btn => btn.addEventListener('click', async () => {
      const k = btn.dataset.bp;
      hidden.has(k) ? hidden.delete(k) : hidden.add(k);
      draw();
      try {
        await api('PATCH', '/api/me/badges', { hidden: [...hidden] });
        state.me = { ...state.me, badges: owned.filter(x => !hidden.has(x)) };
        update(); renderUserPanel?.();
      } catch (e) { toast(e.message, true); hidden.has(k) ? hidden.delete(k) : hidden.add(k); draw(); }
    }));
  };
  draw();
}

// ======================= polish =======================
// Icon-only buttons with an accessible label show it as a tooltip on hover too.
document.addEventListener('pointerover', e => {
  const b = e.target.closest?.('button.icon-btn');
  if (b && !b.title && b.getAttribute('aria-label')) b.title = b.getAttribute('aria-label');
}, { passive: true });

// ======================= old messages unload, and load back in as you scroll up =======================
// A chat only keeps its newest messages in memory. While you're at the bottom, anything past the
// newest 200 is let go; chats you aren't looking at keep just their newest 60. Scrolling up fetches
// older ones again, 50 at a time, without a button to press.
const KEEP_ACTIVE = 200, KEEP_IDLE = 60;
function trimConvo(conv, keep) {
  const convo = state.convos[conv];
  if (!convo?.loaded || convo.loadingOlder || convo.messages.length <= keep) return 0;
  const drop = convo.messages.length - keep;
  const gone = convo.messages.slice(0, drop);
  // Never drop a message you're editing or replying to.
  const busy = new Set([state.editing?.id, state.replyTo?.conv === conv ? state.replyTo.id : null].filter(Boolean));
  if (gone.some(m => busy.has(m.id))) return 0;
  convo.messages = convo.messages.slice(drop);
  convo.hasMore = true;
  if (convo.from != null) convo.from = Math.max(0, convo.from - drop);
  if (convo.seen) for (const m of gone) convo.seen.delete(m.id);
  return drop;
}
const _renderMessages29 = renderMessages;
renderMessages = function (forceBottom = false, ...rest) {
  const conv = activeConv();
  if (conv && (forceBottom || (typeof stickToBottom !== 'undefined' && stickToBottom))) trimConvo(conv, KEEP_ACTIVE);
  const r = _renderMessages29(forceBottom, ...rest);
  watchOlder();
  return r;
};
setInterval(() => {
  const active = activeConv();
  for (const conv of Object.keys(state.convos)) if (conv !== active) trimConvo(conv, KEEP_IDLE);
}, 15e3);

// The top of the chat loads older messages as soon as it comes into view.
let olderObs = null;
function watchOlder() {
  const el = $('#messages'), top = $('#load-more');
  olderObs?.disconnect();
  if (!el || !top) return;
  top.textContent = 'Loading older messages…';
  top.classList.add('lm-auto');
  const near = () => top.isConnected && top.getBoundingClientRect().bottom > el.getBoundingClientRect().top - 400;
  const go = () => {
    if (!near()) return;
    const convo = state.convos[activeConv()];
    if (!convo) return;
    if (convo.loadingOlder) { setTimeout(go, 450); return; } // a page is still arriving; check again after
    loadOlder();
  };
  olderObs = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) go(); }, { root: el, rootMargin: '400px 0px 0px 0px' });
  olderObs.observe(top);
}

// ======================= a roomier, tidier profile =======================
// The profile you open (not the small previews) gets: a bigger banner and picture, the main button
// up top with everything else in a ⋯ menu, badges as chips under your name, a Comments row that
// opens the comments panel, and a footer with when they joined and their ID (click to copy).
const _openProfile29 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile29(id, ...rest);
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  const card = modal?.querySelector(':scope > .pcard');
  const u = user(id);
  if (card && u && !card.classList.contains('pf29')) dressProfile(modal, card, u);
  return r;
};
function dressProfile(modal, card, u) {
  const self = u.id === state.me.id;
  card.classList.add('pf29');
  modal.classList.add('pf29-modal');
  const head = $('.pc-head', card), body = $('.pc-body', card);
  if (!head || !body) return;

  // Bigger picture; click it to see it full size.
  const av = $(':scope > .avatar', head);
  if (av) {
    Object.assign(av.style, { width: '108px', height: '108px', fontSize: '44px' });
    if (u.avatar) { av.classList.add('pf-zoom'); av.title = 'View picture'; av.addEventListener('click', () => openLightbox(u.avatar, `${u.username}.png`)); }
  }

  // Close button
  const x = document.createElement('button');
  x.className = 'pf-close'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '✕';
  x.addEventListener('click', dismissLayer);
  card.appendChild(x);

  // The main button next to the picture; the rest go in a ⋯ menu.
  const acts = $('.pc-actions', body);
  const bar = document.createElement('div');
  bar.className = 'pf-bar';
  head.appendChild(bar);
  const main = acts && (acts.querySelector('[data-a=msg],[data-a=edit],[data-a=accept],[data-a=add]') || acts.querySelector('.btn:not([disabled])'));
  if (main) bar.appendChild(main);
  const more = document.createElement('div');
  more.className = 'pf-menu';
  for (const b of [...(acts?.children || [])]) { b.classList.add('pf-mi'); more.appendChild(b); }
  acts?.remove();
  const extra = [
    !self && !u.system && state.view.type === 'channel' && !u.bot ? ['＠', 'Mention', () => { const ta = $('#composer-input'); if (ta) { closeLayer(); ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + '@' + u.username + ' '; ta.focus(); ta.dispatchEvent(new Event('input')); } }] : null,
    ['📋', 'Copy Username', () => copyText(u.username, 'Username')],
    ['🔗', 'Copy Profile Link', () => copyText(`${location.origin}/?profile=${encodeURIComponent(u.id)}`, 'Profile link')],
    ['🆔', 'Copy User ID', () => copyText(u.id, 'User ID')],
    u.avatar ? ['🖼️', 'View Picture', () => openLightbox(u.avatar, `${u.username}.png`)] : null,
    self ? ['🙈', 'Hide or Show Badges', () => { closeLayer(); openSettings('profile'); setTimeout(() => $('#badge-pick')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400); }] : null,
  ].filter(Boolean);
  if (extra.length && more.children.length) more.insertAdjacentHTML('beforeend', '<div class="pf-sep"></div>');
  for (const [ico, label, run] of extra) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pf-mi'; b.innerHTML = `<span class="pf-ico">${ico}</span>${esc(label)}`;
    b.addEventListener('click', () => { more.classList.remove('open'); run(); });
    more.appendChild(b);
  }
  if (more.children.length) {
    const dots = document.createElement('button');
    dots.className = 'pf-dots'; dots.setAttribute('aria-label', 'More'); dots.title = 'More';
    dots.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
    bar.append(dots, more);
    dots.addEventListener('click', e => { e.stopPropagation(); more.classList.toggle('open'); });
    card.addEventListener('click', e => { if (!more.contains(e.target) && e.target !== dots) more.classList.remove('open'); });
  }

  // Username · pronouns on one line, badges as chips under it.
  const un = $('.pc-uname', body), pr = $('.pc-pronouns', body);
  if (un) { un.innerHTML = `@${esc(u.username)}${pr ? ` <span class="pf-dot">•</span> ${esc(u.pronouns || pr.textContent)}` : ''}`; pr?.remove(); }
  const badges = $('.pc-badges', head);
  if (badges && un) { badges.classList.add('pf-chips'); un.after(badges); }

  // Member since + ID go to a small footer.
  const since = $('.pc-since', body);
  const sinceH = since?.previousElementSibling?.tagName === 'H4' ? since.previousElementSibling : null;
  const joined = new Date(u.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  sinceH?.remove(); since?.remove();
  const foot = document.createElement('div');
  foot.className = 'pf-foot';
  foot.innerHTML = `<span>Joined ${esc(joined)}</span><button type="button" class="pf-id" title="Copy user ID">ID ${esc(u.id.slice(0, 8))} <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z"/></svg></button>`;
  $('.pf-id', foot).addEventListener('click', () => copyText(u.id, 'User ID'));
  card.appendChild(foot);

  // Comments row: shows the count and opens/closes the panel (the panel starts closed on phones).
  const side = $('.pcm-side', modal);
  if (side) {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'pf-crow';
    row.innerHTML = '<span class="pf-chev">›</span><b>Comments</b><span class="pf-cn">…</span><span class="pf-see">See all</span>';
    const roles = $('.pc-roles', body);
    (roles ? roles.previousElementSibling?.tagName === 'H4' ? roles.previousElementSibling : roles : body.querySelector('hr'))?.before(row);
    const phone = matchMedia('(max-width: 760px)').matches;
    const setOpen = open => { modal.classList.toggle('pcm-closed', !open); row.classList.toggle('open', open); $('.pf-see', row).textContent = open ? 'Hide' : 'See all'; };
    setOpen(!phone);
    row.addEventListener('click', () => setOpen(modal.classList.contains('pcm-closed')));
    modal.addEventListener('pcm-count', e => { $('.pf-cn', row).textContent = e.detail; });
    modal.addEventListener('pcm-gone', () => row.remove());
    const n = $('.pcm-n', side); if (n) $('.pf-cn', row).textContent = n.textContent;
  }
}
// Opening a shared profile link (?profile=<id>) shows that profile once Zuno has loaded.
{
  const pid = new URLSearchParams(location.search).get('profile');
  if (pid) {
    history.replaceState(null, '', location.pathname);
    const wait = setInterval(() => { if (state.me && $('#app:not(.hidden)')) { clearInterval(wait); setTimeout(() => openProfile(pid), 300); } }, 300);
    setTimeout(() => clearInterval(wait), 30e3);
  }
}
