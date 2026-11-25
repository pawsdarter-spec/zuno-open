'use strict';
// Zuno 0.30: community creations (decorations, profile effects and name banners anyone can make),
// the Community browser, Moderation › Community Decorations, name banners in lists, the Cat Scratch
// profile effect, and a tidier Settings › Profiles.

// ======================= stylesheets that didn't load =======================
// If a browser saved a broken copy of one of Zuno's stylesheets (it can happen during an update),
// load it again fresh, so screens never show up unstyled.
setTimeout(() => {
  for (const link of document.querySelectorAll('link[rel="stylesheet"][href^="/"]')) {
    let ok = false;
    try { ok = !!link.sheet && link.sheet.cssRules.length > 0; } catch { ok = true; } // other sites' sheets can't be read; assume fine
    if (ok || link.dataset.retried) continue;
    const fresh = link.cloneNode();
    fresh.dataset.retried = '1';
    fresh.href = link.getAttribute('href') + (link.getAttribute('href').includes('?') ? '&' : '?') + 'r=' + Date.now().toString(36);
    link.after(fresh);
  }
}, 1500);

// ======================= profiles open quickly, even when the server is slow =======================
// A profile used to wait for the server before opening. If that takes more than 2.5 seconds, it now
// opens with what the app already knows about them, and the fresh copy fills in when it arrives.
const _api30 = api;
api = function (method, url, body) {
  const m = method === 'GET' && /^\/api\/users\/([^/?]+)$/.exec(url);
  if (!m) return _api30(method, url, body);
  const real = _api30(method, url, body);
  const known = state.users[m[1]];
  if (!known) return real;
  real.then(r => { if (r?.user) state.users[m[1]] = { ...state.users[m[1]], ...r.user }; }).catch(() => {});
  return Promise.race([real, new Promise(res => setTimeout(() => res({ user: known, relationship: relationshipWith(m[1]) }), 2500))]);
};

// ======================= the Artist badge =======================
BADGE_INFO.artist = {
  label: 'Artist', desc: 'Made a decoration, effect or name banner that everyone can wear',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgArtist" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5"/><stop offset="1" stop-color="#8a5cf6"/></linearGradient></defs>
    <circle cx="12" cy="12" r="10.4" fill="url(#bgArtist)"/>
    <path d="M12 5.2c-4 0-7 2.8-7 6.4 0 3.3 2.6 5.8 5.6 5.8.9 0 1.4-.6 1.4-1.3 0-.8-.6-1.1-.6-1.8 0-.8.6-1.3 1.4-1.3h1.6c2.5 0 4.6-1.6 4.6-4 0-2.9-3-3.8-7-3.8z" fill="#fff6fd"/>
    <circle cx="8.6" cy="10.6" r="1.1" fill="#ff5f8f"/><circle cx="11.2" cy="8.2" r="1.1" fill="#ffd166"/><circle cx="14.6" cy="8.6" r="1.1" fill="#04c5ae"/><circle cx="16.4" cy="11.2" r="1.1" fill="#5865f2"/></svg>`,
};

// ======================= community decorations on avatars =======================
// A moving decoration (GIF or animated WebP) stays still in small places (chat, lists) and moves
// when you point at it. On profiles it always moves.
const stillFrames = new Map(); // url -> still picture (data URL), or 'pending'
function stillOf(url) {
  const got = stillFrames.get(url);
  if (got && got !== 'pending') return got;
  if (!got) {
    stillFrames.set(url, 'pending');
    const img = new Image();
    const draw = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        stillFrames.set(url, c.toDataURL('image/png'));
        for (const el of document.querySelectorAll(`img.cdeco[data-anim="${CSS.escape(url)}"]:not(.playing)`)) el.src = stillFrames.get(url);
      } catch {
        if (!img.dataset.direct && typeof directUrl === 'function' && directUrl(url) !== url) { img.dataset.direct = '1'; img.src = directUrl(url); }
        else stillFrames.delete(url);
      }
    };
    img.addEventListener('load', draw);
    img.src = url;
  }
  return url;
}
const _avatar30 = avatar;
avatar = function (u, size = 32, status = false) {
  const d = u?.communityDeco;
  if (!d || size < 20) return _avatar30(u, size, status);
  const html = _avatar30({ ...u, decoration: null }, size, status);
  const moving = d.animated && size < 80;
  const img = `<img class="cdeco" src="${esc(moving ? stillOf(d.url) : d.url)}"${moving ? ` data-anim="${esc(d.url)}"` : ''} alt="" draggable="false" loading="lazy">`;
  return html.replace('<div class="avatar', '<div class="avatar has-deco has-cdeco').replace(/(<i class="status-dot[^>]*><\/i>)?<\/div>$/, `${img}$1</div>`);
};
document.addEventListener('pointerover', e => {
  const img = e.target.closest?.('.avatar')?.querySelector('img.cdeco[data-anim]');
  if (img && !img.classList.contains('playing')) { img.classList.add('playing'); img.src = img.dataset.anim; }
}, { passive: true });
document.addEventListener('pointerout', e => {
  const av = e.target.closest?.('.avatar');
  if (!av || av.contains(e.relatedTarget)) return;
  const img = av.querySelector('img.cdeco.playing');
  if (img) { img.classList.remove('playing'); img.src = stillOf(img.dataset.anim); }
}, { passive: true });

// ======================= community profile effects =======================
const _profileCard30 = profileCard;
profileCard = function (u, opts) {
  let html = _profileCard30(u, opts);
  const fx = u?.communityEffect;
  if (fx?.url) html = html.replace(/<div class="pcard([^"]*)"([^>]*)>/, (m, cls, rest) => `<div class="pcard${cls.includes('has-fx') ? cls : cls + ' has-fx'}"${rest}><div class="pfx pfx-community" aria-hidden="true"><img src="${esc(fx.url)}" alt=""></div>`);
  return html;
};

// ======================= name banners in DMs and member lists =======================
const NB_PRESETS = { aurora: 'Aurora', sunset: 'Sunset', ocean: 'Ocean', sakura: 'Sakura', mint: 'Mint', galaxy: 'Galaxy', lava: 'Lava', gold: 'Gold' };
function nameBannerAttrs(u) {
  const b = u?.nameBanner;
  if (!b) return null;
  return b.preset ? { cls: 'has-nb nb-' + b.preset } : { cls: 'has-nb nb-img', url: b.url };
}
function paintBanners(root) {
  if (!root) return;
  for (const row of root.querySelectorAll('.member[data-member], .member[data-gmember], .dm-item[data-id]')) {
    const u = user(row.dataset.member || row.dataset.gmember || row.dataset.id);
    const a = nameBannerAttrs(u);
    row.classList.remove(...[...row.classList].filter(c => c === 'has-nb' || c.startsWith('nb-')));
    if (!a) { row.style.removeProperty('--nb'); continue; }
    row.classList.add(...a.cls.split(' '));
    if (a.url) row.style.setProperty('--nb', `url("${a.url.replace(/"/g, '%22')}")`);
  }
}
const _renderMemberList30 = renderMemberList;
renderMemberList = function (...a) { const r = _renderMemberList30(...a); paintBanners($('#profile-panel') || document); return r; };
const _renderDMList30 = renderDMList;
renderDMList = function (...a) { const r = _renderDMList30(...a); paintBanners($('.dm-list') || $('#dm-list') || document.querySelector('.sidebar')); return r; };
const nbHtml = (u, name) => {
  const a = nameBannerAttrs(u);
  return `<div class="nb-demo ${a ? a.cls : ''}"${a?.url ? ` style="--nb:url('${esc(a.url)}')"` : ''}>${avatar(u, 32)}<b>${esc(name || u.displayName)}</b></div>`;
};

// ======================= the Community browser =======================
// Settings › Community: wear what other people made, or make your own.
const KIND_INFO = {
  decoration: { label: 'Decorations', one: 'decoration', icon: '👑' },
  effect: { label: 'Profile Effects', one: 'profile effect', icon: '✨' },
  banner: { label: 'Name Banners', one: 'name banner', icon: '🏷️' },
};
let comTab = 'decoration', comSort = 'popular', comQ = '';
const wearing = kind => ({ decoration: state.me.communityDeco?.id, effect: state.me.communityEffect?.id, banner: state.me.nameBanner?.id || (state.me.nameBanner?.preset ? 'preset:' + state.me.nameBanner.preset : null) })[kind] || null;
async function wear(kind, id) {
  try {
    const { me } = await api('PATCH', '/api/me/wear', { kind, id });
    state.me = { ...state.me, ...me };
    state.users[me.id] = { ...state.users[me.id], ...me };
    if (!me.communityDeco) delete state.me.communityDeco;
    if (!me.communityEffect) delete state.me.communityEffect;
    if (!me.nameBanner) delete state.me.nameBanner;
    renderUserPanel?.(); renderDMList?.(); if (state.view.type === 'channel') renderMemberList?.();
    toast(id ? `Wearing it ✨` : 'Taken off');
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
function previewFor(c, me = state.me) {
  if (c.kind === 'decoration') return `<div class="cm-prev cm-deco">${avatar({ ...me, communityDeco: { url: c.url, animated: false } }, 88)}</div>`;
  if (c.kind === 'effect') return `<div class="cm-prev cm-fx"><div class="cm-fx-card"><div class="cm-fx-banner" style="background:${esc(me.bannerColor || '#0aa896')}"></div>${avatar(me, 34)}<i></i><i></i></div><img src="${esc(c.url)}" alt=""></div>`;
  return `<div class="cm-prev cm-nb">${nbHtml({ ...me, nameBanner: c.preset ? { preset: c.preset } : { url: c.url } })}</div>`;
}
async function renderCommunity(body) {
  const tabs = [['decoration', 'Frames'], ['effect', 'Effects'], ['banner', 'Name Banners']];
  body.innerHTML = `<div class="cm-page" data-keep>
    <div class="cl-hero">
      <div class="cl-rack" aria-hidden="true">${closetRack()}</div>
      <div class="cl-copy"><span class="cl-kicker">The Closet</span><h2>Dress up your profile</h2>
        <p>Every piece in here was made by someone on Zuno. Try anything on for free, swap whenever you like, or design your own and earn the Artist badge.</p></div>
    </div>
    <div class="cl-bar">
      <div class="cl-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${comTab === k ? 'on' : ''}" data-ct="${k}">${l}</button>`).join('')}</div>
      <div class="cl-side"><button class="cl-mine${comTab === 'mine' ? ' on' : ''}" data-ct="mine">My creations</button><button class="btn btn-primary btn-sm cl-make${comTab === 'make' ? ' on' : ''}" data-ct="make">＋ Make your own</button></div>
    </div>
    <div id="cm-body"></div></div>`;
  $$('[data-ct]', body).forEach(b => b.addEventListener('click', () => { comTab = b.dataset.ct; renderCommunity(body); }));
  const box = $('#cm-body', body);
  if (comTab === 'make') return drawMake(box, body);
  if (comTab === 'mine') return drawMine(box, body);
  box.innerHTML = `<div class="cm-tools"><input class="qs-input" id="cm-q" placeholder="Search ${KIND_INFO[comTab].label.toLowerCase()} or makers" value="${esc(comQ)}">
    <div class="cl-sort"><button data-cs="popular" class="${comSort === 'popular' ? 'on' : ''}">Popular</button><button data-cs="new" class="${comSort === 'new' ? 'on' : ''}">Newest</button><button data-cs="favs" class="${comSort === 'favs' ? 'on' : ''}">♥ Favorites</button></div></div>
    <div class="cm-grid"><div class="muted">Loading…</div></div>`;
  $$('[data-cs]', box).forEach(b => b.addEventListener('click', () => { comSort = b.dataset.cs; renderCommunity(body); }));
  let t;
  $('#cm-q', box).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { comQ = e.target.value.trim(); loadGrid(); }, 250); });
  const loadGrid = async () => {
    let d;
    try { d = await api('GET', `/api/creations?kind=${comTab}&sort=${comSort === 'favs' ? 'popular&favs=1' : comSort}&q=${encodeURIComponent(comQ)}`); } catch (e) { $('.cm-grid', box).innerHTML = `<p>${esc(e.message)}</p>`; return; }
    const cur = wearing(comTab);
    const items = [...(comTab === 'banner' && !comQ && comSort !== 'favs' ? d.presets.map(p => ({ id: 'preset:' + p, kind: 'banner', name: NB_PRESETS[p] || p, preset: p, builtIn: true })) : []), ...d.creations];
    for (const c of d.creations) if (c.creator) state.users[c.creator.id] = { ...state.users[c.creator.id], ...c.creator };
    $('.cm-grid', box).innerHTML = items.length ? items.map(c => `<div class="cm-card${cur === c.id ? ' on' : ''}" data-cid="${esc(c.id)}">
        ${previewFor(c)}${cur === c.id ? '<span class="cm-wearing">Wearing</span>' : ''}${c.animated ? '<span class="cm-moves">Moves</span>' : ''}
        <div class="cm-meta"><b title="${esc(c.name)}">${esc(c.name)}</b>
          <span class="muted small">${c.builtIn ? 'Zuno original' : `by <a data-maker="${esc(c.by)}">${esc(c.creator?.displayName || 'someone')}</a> · ${c.wears} wearing`}</span></div>
        ${c.builtIn ? '' : `<button class="cm-fav${c.faved ? ' on' : ''}" data-fav="${esc(c.id)}" title="${c.faved ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Favorite">${uiIcon('heart')}<span>${c.favs || 0}</span></button>`}
        <button class="btn btn-sm ${cur === c.id ? 'btn-grey' : 'btn-primary'}" data-wear="${esc(c.id)}">${cur === c.id ? 'Take off' : 'Try it on'}</button>
        ${!c.builtIn && state.me.isStaff ? `<button class="btn btn-link btn-sm cm-staff-del" data-sdel="${esc(c.id)}">🛡️ Delete (staff)</button>` : ''}</div>`).join('')
      : comSort === 'favs' ? `<div class="cm-empty"><span>♡</span><b>No favorites yet</b><span class="muted small">Press ♡ on anything you like to keep it here.</span></div>`
      : `<div class="cm-empty"><span>${uiIcon('thread')}</span><b>The rack is empty</b><span class="muted small">${comQ ? 'Nothing matches that.' : `Nobody has made a ${KIND_INFO[comTab].one} yet. It could be you!`}</span><button class="btn btn-primary btn-sm" data-go-make>Make one</button></div>`;
    $('[data-go-make]', box)?.addEventListener('click', () => { comTab = 'make'; renderCommunity(body); });
    $$('[data-maker]', box).forEach(a => a.addEventListener('click', () => openProfile(a.dataset.maker)));
    $$('[data-fav]', box).forEach(b => b.addEventListener('click', async () => {
      const on = !b.classList.contains('on'), n = $('span', b);
      b.classList.toggle('on', on); n.textContent = Math.max(0, +n.textContent + (on ? 1 : -1));
      if (on) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
      try {
        const r = await api('POST', `/api/creations/${b.dataset.fav}/fav`, { on });
        n.textContent = r.favs;
        const key = `${comTab}:c:${b.dataset.fav}`;
        on ? savedFlair.add(key) : savedFlair.delete(key);
        keepSaved();
        if (typeof creationFavs !== 'undefined' && creationFavs) on ? creationFavs.add(b.dataset.fav) : creationFavs.delete(b.dataset.fav);
        if (!on && comSort === 'favs') loadGrid();
      } catch (e) { toast(e.message, true); loadGrid(); }
    }));
    $$('[data-sdel]', box).forEach(b => b.addEventListener('click', async () => {
      const why = await askText('Delete this for everyone?', { desc: "It comes off anyone wearing it. The maker gets a Zuno DM with your reason.", placeholder: 'Why? (optional)', ok: 'Delete', danger: true });
      if (why === null) return;
      api('DELETE', `/api/creations/${b.dataset.sdel}?reason=${encodeURIComponent(why.trim())}`).then(() => { toast('Deleted'); loadGrid(); }).catch(e => toast(e.message, true));
    }));
    $$('[data-wear]', box).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      const on = wearing(comTab) === b.dataset.wear;
      if (await wear(comTab, on ? null : b.dataset.wear)) loadGrid(); else b.disabled = false;
    }));
  };
  loadGrid();
}
// A little clothes rail with three of your pictures hanging from it, each wearing something.
function closetRack(me = state.me) {
  const keys = ['crown', 'halo', 'flowers'].filter(k => DECORATIONS[k]);
  return `<i class="cl-rail"></i>${keys.map((k, i) => `<span class="cl-hang" style="--i:${i}"><i class="cl-hook"></i>${avatar({ ...me, communityDeco: null, decoration: k }, 46)}</span>`).join('')}`;
}

// ---------- making your own ----------
const MAKE_RULES = {
  decoration: { size: '512×512 (square)', tips: ['Square, 512×512 works best. PNG, WebP or GIF with a see-through background.', 'The teal circle shows where the profile picture sits. Draw around it, over it, or both: anything you leave see-through shows the picture.', 'Make sure it still looks good small: it shows next to names in chat too.'], template: '/templates/zuno-frame-kit-512.png' },
  effect: { size: '600×900 (portrait)', tips: ['600×900 works best (any size from 300×300, about as tall as a profile). PNG, WebP or GIF with a see-through background.', 'It plays over the whole profile. Leave parts see-through, or fade them out, so the name and About Me stay readable.', 'Animated GIFs or WebPs play on a loop. Keep it gentle: nothing flashing.'], template: '/templates/zuno-effect-kit-600x900.png' },
  banner: { size: '600×100 (long and thin)', tips: ['600×100 works best (3 to 9 times wider than tall). PNG, WebP or GIF.', 'It sits behind your name in DMs and member lists. The left third is behind the picture and name, so keep it calm there; put detail on the right.', 'Keep it dark or soft enough that a white name stays easy to read.'], template: '/templates/zuno-banner-kit-600x100.png' },
};
let makeKind = 'decoration';
const MAKE_ART = {
  decoration: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="11" fill="currentColor" opacity=".25"/><path d="M11 12l3-7 4 5 2-6 2 6 4-5 3 7z" fill="currentColor"/><circle cx="20" cy="22" r="14.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="3 3"/></svg>',
  effect: '<svg viewBox="0 0 40 40"><rect x="9" y="5" width="22" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 12l1.2 2.8L19 16l-2.8 1.2L15 20l-1.2-2.8L11 16l2.8-1.2zM26 22l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg>',
  banner: '<svg viewBox="0 0 40 40"><rect x="3" y="13" width="34" height="14" rx="5" fill="currentColor" opacity=".25"/><circle cx="10" cy="20" r="4" fill="currentColor"/><rect x="16" y="18" width="12" height="4" rx="2" fill="currentColor"/></svg>',
};
function drawMake(box) {
  const r = MAKE_RULES[makeKind], one = KIND_INFO[makeKind].one;
  box.innerHTML = `<div class="mk">
    <ol class="mk-steps">
      <li class="mk-step"><div class="mk-num">1</div><div class="mk-in"><h4>What are you making?</h4>
        <div class="mk-kinds">${Object.entries(KIND_INFO).map(([k, v]) => `<button type="button" class="mk-kind${makeKind === k ? ' on' : ''}" data-mk="${k}"><span class="mk-art">${MAKE_ART[k]}</span><b>${k === 'decoration' ? 'Frame' : v.one[0].toUpperCase() + v.one.slice(1)}</b><small>${esc(MAKE_RULES[k].size)}</small></button>`).join('')}</div></div></li>
      <li class="mk-step"><div class="mk-num">2</div><div class="mk-in"><h4>Grab the kit</h4>
        <div class="mk-kit"><img src="${r.template}" alt="The ${esc(one)} template" class="mk-kit-img mk-kit-${makeKind}">
          <div><ul class="mk-tips">${r.tips.map(t => `<li>${t}</li>`).join('')}</ul><a class="btn btn-grey btn-sm" href="${r.template}" download>⬇ Download the PNG kit</a>
          <p class="muted small">Draw on a new layer above it, then hide the kit before you save. ${makeKind === 'decoration' ? 'A GIF or animated WebP moves (in chat it moves when someone points at it).' : makeKind === 'effect' ? 'A GIF or animated WebP plays on a loop.' : 'A GIF or animated WebP moves.'}</p></div></div></div></li>
      <li class="mk-step"><div class="mk-num">3</div><div class="mk-in"><h4>Try it on</h4>
        <div class="cm-drop" id="cm-drop"><div class="cm-drop-prev" id="cm-prev"><span class="mk-drop-hint"><b>Drop your ${esc(one)} here</b><small>or click to pick a PNG, WebP or GIF</small></span></div><input type="file" id="cm-file" accept="image/png,image/webp,image/gif" hidden></div></div></li>
      <li class="mk-step"><div class="mk-num">4</div><div class="mk-in"><h4>Name it and send it in</h4>
        <form class="cm-form mk-form">
          <input id="cm-name" maxlength="32" placeholder="Give it a name, like “Cozy Scarf”" required>
          <label class="cm-check"><input type="checkbox" id="cm-own"> I made this myself. It isn't taken, traced or AI-made from someone else's art.</label>
          <details class="mk-rules"><summary>What gets approved</summary><ul>
            <li><b>Only your own original work.</b> Stolen ones get taken down and can cost you your Artist badge.</li>
            <li>The right size and shape for a ${esc(one)} (step 2).</li>
            <li>No nudity, gore, hate or other people's logos.</li></ul></details>
          <div class="mk-send"><button class="btn btn-primary" id="cm-send" disabled>Send it in</button><span class="muted small">Staff check everything first. You'll get a Zuno DM either way.</span></div>
        </form></div></li>
    </ol>
    <aside class="mk-perk"><span>🎨</span><div><b>Become an Artist</b><p>Your first approved piece earns the Artist badge, room for 6 in review at once, a wear count on each one, and a Creations shelf on your profile.</p></div></aside>
  </div>`;
  $$('[data-mk]', box).forEach(b => b.addEventListener('click', () => { makeKind = b.dataset.mk; drawMake(box); }));
  let file = null, url = null;
  const sync = () => { $('#cm-send', box).disabled = !(file && $('#cm-own', box).checked && $('#cm-name', box).value.trim().length >= 2); };
  const show = () => {
    const prev = $('#cm-prev', box);
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    prev.innerHTML = makeKind === 'decoration' ? `<div class="cm-try">${avatar({ ...state.me, communityDeco: { url, animated: false } }, 132)}</div>`
      : makeKind === 'effect' ? `<div class="cm-try-fx"><div class="cm-fx-card big"><div class="cm-fx-banner" style="background:${esc(state.me.bannerColor || '#0aa896')}"></div>${avatar(state.me, 56)}<i></i><i></i><i></i></div><img src="${url}" alt=""></div>`
        : `<div class="cm-try-nb">${nbHtml({ ...state.me, nameBanner: { url } })}</div>`;
    const probe = new Image();
    probe.onload = () => { prev.insertAdjacentHTML('beforeend', `<span class="cm-dims">${probe.naturalWidth}×${probe.naturalHeight}</span><span class="cm-swap">Click to swap</span>`); };
    probe.src = url;
  };
  $('#cm-drop', box).addEventListener('click', () => $('#cm-file', box).click());
  $('#cm-drop', box).addEventListener('dragover', e => { e.preventDefault(); $('#cm-drop', box).classList.add('over'); });
  $('#cm-drop', box).addEventListener('dragleave', () => $('#cm-drop', box).classList.remove('over'));
  $('#cm-drop', box).addEventListener('drop', e => { e.preventDefault(); $('#cm-drop', box).classList.remove('over'); file = e.dataTransfer.files[0] || null; show(); sync(); });
  $('#cm-file', box).addEventListener('change', e => { file = e.target.files[0] || null; e.target.value = ''; show(); sync(); });
  $('#cm-own', box).addEventListener('change', sync);
  $('#cm-name', box).addEventListener('input', sync);
  $('.cm-form', box).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#cm-send', box);
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch(`/api/creations?kind=${makeKind}&own=1&name=${encodeURIComponent($('#cm-name', box).value.trim())}`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'That couldn\'t be sent. Try again.');
      toast('Sent in! Staff will take a look 🎨');
      comTab = 'mine'; renderCommunity($('#settings-body'));
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Send it in'; }
  });
}
async function drawMine(box) {
  let d;
  try { d = await api('GET', '/api/creations/mine'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const label = { pending: '<span class="cm-st wait">Waiting for review</span>', approved: '<span class="cm-st ok">Approved</span>', rejected: '<span class="cm-st no">Not approved</span>' };
  box.innerHTML = `<label class="setting-row cm-widget"><div><div class="setting-title">Show my creations on my profile</div><div class="setting-desc">Adds a Creations section to your profile so people can try them on.</div></div><input type="checkbox" class="switch" id="cm-show"${d.showCreations ? ' checked' : ''}></label>
    <p class="muted small">${d.artist ? '🎨 You\'re an Artist: up to 6 can wait for review at once.' : 'Up to 3 can wait for review at once until your first one is approved.'}</p>
    <div class="cm-grid">${d.creations.map(c => `<div class="cm-card" data-cid="${esc(c.id)}">${previewFor(c)}
      <div class="cm-meta"><b>${esc(c.name)}</b><span class="muted small">${esc(KIND_INFO[c.kind].one)}${c.status === 'approved' ? ` · ${c.wears} wearing` : ''}</span>${label[c.status] || ''}${c.reason ? `<span class="cm-reason">${esc(c.reason)}</span>` : ''}</div>
      <div class="cm-acts">${c.status === 'approved' ? `<button class="btn btn-sm ${wearing(c.kind) === c.id ? 'btn-grey' : 'btn-primary'}" data-wear="${esc(c.id)}" data-kind="${c.kind}">${wearing(c.kind) === c.id ? 'Take off' : 'Wear'}</button>` : ''}<button class="btn btn-link btn-sm" data-del="${esc(c.id)}">Delete</button></div></div>`).join('')
      || '<div class="cm-empty"><span>📁</span><b>Nothing yet</b><span class="muted small">What you make shows up here, with whether it was approved.</span></div>'}</div>`;
  $('#cm-show', box).addEventListener('change', async e => { try { await api('PATCH', '/api/me/creations-widget', { show: e.target.checked }); toast('Saved'); } catch (err) { toast(err.message, true); } });
  $$('[data-wear]', box).forEach(b => b.addEventListener('click', async () => { if (await wear(b.dataset.kind, wearing(b.dataset.kind) === b.dataset.wear ? null : b.dataset.wear)) drawMine(box); }));
  $$('[data-del]', box).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this creation? Anyone wearing it will lose it.')) return;
    try { await api('DELETE', `/api/creations/${b.dataset.del}`); drawMine(box); } catch (e) { toast(e.message, true); }
  }));
}

// ---------- in Settings ----------
const _openSettings30 = openSettings;
openSettings = function (...a) {
  const r = _openSettings30(...a);
  const prof = $('.settings:not(.server-settings-page) .settings-nav [data-s="profile"]');
  if (prof && !$('.settings-nav [data-s="community"]')) {
    prof.insertAdjacentHTML('afterend', '<button data-s="community">Community</button>');
    $('.settings-nav [data-s="community"]').addEventListener('click', () => showSettingsSection('community'));
  }
  return r;
};
const _showSettingsSection30 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  if (section !== 'community') return _showSettingsSection30(section, ...a);
  if (settingsDraft && isDraftDirty()) return closeSettings();
  settingsDraft = null;
  $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === 'community'));
  renderCommunity($('#settings-body'));
};
if (typeof US_WORDS === 'object') US_WORDS.community = 'community decorations effects name banner creations artist make upload shop browse';
const openCommunity = (tab = 'decoration') => { comTab = tab; openSettings('community'); };

// Settings › Profiles: a "fresh look" card up top, and what you're wearing from Community.
const _flairProfileFields30 = flairProfileFields;
flairProfileFields = function (d) {
  const me = state.me;
  const worn = [['decoration', me.communityDeco, 'Decoration'], ['effect', me.communityEffect, 'Profile effect'], ['banner', me.nameBanner, 'Name banner']].filter(x => x[1]);
  return `<div class="pf-fresh"><div class="pf-fresh-art">${avatar(me, 44)}</div><div><b>Give your profile a fresh look</b><span>Decorations, effects and name banners from Community, or make your own.</span></div><button type="button" class="btn btn-primary btn-sm" data-open-community>Browse</button></div>
    ${worn.length ? `<div class="pf-worn">${worn.map(([k, v, l]) => `<span class="pf-worn-chip">${l}: <b>${esc(v.name || NB_PRESETS[v.preset] || 'Community')}</b><button type="button" data-takeoff="${k}" title="Take it off" aria-label="Take it off">✕</button></span>`).join('')}</div>` : ''}
    ` + _flairProfileFields30(d);
};
const _wireFlairFields30 = wireFlairFields;
wireFlairFields = function (form, d, update) {
  _wireFlairFields30(form, d, update);
  $('[data-open-community]', form)?.addEventListener('click', () => { if (settingsDraft && isDraftDirty()) return toast('Save or reset your changes first', true); openCommunity(); });
  $$('[data-takeoff]', form).forEach(b => b.addEventListener('click', async () => { if (await wear(b.dataset.takeoff, null)) b.closest('.pf-worn-chip').remove(); update(); }));
};

// ======================= creations on profiles =======================
const _openProfile30 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile30(id, ...rest);
  const u = user(id);
  const card = ($('#layer .overlay:last-child .modal') || $('#layer .modal'))?.querySelector(':scope > .pcard');
  if (!card || !u?.hasCreations || $('.pf-creations', card)) return r;
  let d;
  try { d = await api('GET', `/api/users/${id}/creations`); } catch { return r; }
  if (!d.creations.length || !card.isConnected) return r;
  const sec = document.createElement('div');
  sec.className = 'pf-creations';
  sec.innerHTML = `<h4>Creations <span class="muted small">${d.creations.length}</span></h4><div class="pfc-grid">${d.creations.map(c => `<button type="button" class="pfc" data-try="${esc(c.id)}" title="${esc(c.name)} · try it on">${c.kind === 'decoration' ? `<img src="${esc(c.url)}" alt="">` : c.kind === 'effect' ? `<span class="pfc-fx"><img src="${esc(c.url)}" alt=""></span>` : `<span class="pfc-nb" style="background-image:url('${esc(c.url)}')"></span>`}<small>${esc(c.name)}</small></button>`).join('')}</div>`;
  const body = $('.pc-body', card);
  const anchor = $('.pf-crow', body) || $('.pc-roles', body)?.previousElementSibling || $('h4', body);
  anchor ? anchor.before(sec) : body?.appendChild(sec);
  $$('[data-try]', sec).forEach(b => b.addEventListener('click', () => tryOn({ ...d.creations.find(c => c.id === b.dataset.try), creator: u })));
  return r;
};
function tryOn(c) {
  const ov = openLayer(`<div class="dialog modal cm-tryon"><h3>${esc(c.name)}</h3><p class="muted small" style="margin:-6px 0 12px">A ${esc(KIND_INFO[c.kind].one)} by ${esc(c.creator?.displayName || 'someone')} · ${c.wears} wearing. Here it is on you:</p>
    ${previewFor(c)}
    <div class="actions"><button class="btn btn-link" data-a="close">Close</button><button class="btn btn-primary" data-a="wear">${wearing(c.kind) === c.id ? 'Take off' : 'Wear it'}</button></div></div>`);
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
  $('[data-a=wear]', ov).addEventListener('click', async () => { if (await wear(c.kind, wearing(c.kind) === c.id ? null : c.id)) dismissLayer(); });
}

// ======================= Moderation › Community Decorations =======================
const _renderModeration30 = renderModeration;
renderModeration = async function (body) {
  if (modTab !== 'creations') {
    const r = _renderModeration30(body);
    addCreationsTab(body);
    return r;
  }
  body.innerHTML = `<h2>Moderation</h2><div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}">${l}</button>`).join('')}</div><div id="mod-body" style="margin-top:16px"></div>`;
  $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
  addCreationsTab(body);
  drawReview($('#mod-body', body), body);
};
function addCreationsTab(body) {
  const tabs = $('.mod-tabs', body);
  if (!tabs || $('[data-mt30]', tabs)) return;
  tabs.insertAdjacentHTML('beforeend', `<button data-mt30 class="${modTab === 'creations' ? 'on' : ''}">Approve Community Decorations<span class="cm-count" hidden></span></button>`);
  $('[data-mt30]', tabs).addEventListener('click', () => { modTab = 'creations'; renderModeration(body); });
  api('GET', '/api/creations/review/count').then(d => { const n = $('[data-mt30] .cm-count', tabs); if (n && d.pending) { n.hidden = false; n.textContent = d.pending; } }).catch(() => {});
}
async function drawReview(box, body) {
  let d;
  try { d = await api('GET', '/api/creations/review'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  for (const c of [...d.pending, ...d.recent]) if (c.creator) state.users[c.creator.id] = { ...state.users[c.creator.id], ...c.creator };
  box.innerHTML = `<p class="muted small" style="margin:0 0 12px">Approve only people's own original work that follows the rules on the Make page: sized right, still lets the picture show, looks good small, no stolen or AI-looking art, no nudity, gore, hate or logos. Approving someone's first one gives them the Artist badge.</p>
    ${d.pending.length ? d.pending.map(c => `<div class="rv-card" data-rv="${esc(c.id)}">
      <div class="rv-art"><div class="rv-raw"><img src="${esc(c.url)}" alt=""></div>${previewFor(c)}</div>
      <div class="rv-info"><b>${esc(c.name)}</b><span class="muted small">${esc(KIND_INFO[c.kind].one)}${c.animated ? ' · moves' : ''} · sent ${esc(fmtTime(c.at))}</span>
        <button class="rv-maker" data-maker="${esc(c.by)}">${c.creator ? avatar(c.creator, 22) : ''}<span>${esc(c.creator?.displayName || 'Deleted user')}</span></button>
        <input class="rv-reason" maxlength="300" placeholder="Why not? (needed to turn it down; they'll see this)">
        <div class="rv-acts"><button class="btn btn-green btn-sm" data-ok>Approve</button><button class="btn btn-red btn-sm" data-no>Turn down</button><a class="btn btn-link btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Open full size</a></div></div></div>`).join('')
      : '<div class="empty-state"><div class="title">All caught up</div><div>No creations waiting for review.</div></div>'}
    ${d.recent.length ? `<h4 class="setting-head" style="margin-top:22px">Decided this week</h4><div class="rv-recent">${d.recent.map(c => `<div class="rv-row"><img src="${esc(c.url)}" alt=""><b>${esc(c.name)}</b><span class="cm-st ${c.status === 'approved' ? 'ok' : 'no'}">${c.status === 'approved' ? 'Approved' : 'Turned down'}</span><span class="muted small">by ${esc(c.reviewedBy || '?')}</span>${c.status === 'approved' ? `<button class="btn btn-link btn-sm" data-down="${esc(c.id)}">Take down</button>` : ''}</div>`).join('')}</div>` : ''}`;
  $$('[data-maker]', box).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.maker)));
  const decide = async (id, approve, reason) => {
    try { await api('PATCH', `/api/creations/${id}/review`, { approve, reason }); toast(approve ? 'Approved 🎨' : 'Turned down'); drawReview(box, body); } catch (e) { toast(e.message, true); }
  };
  $$('[data-rv]', box).forEach(card => {
    $('[data-ok]', card).addEventListener('click', () => decide(card.dataset.rv, true));
    $('[data-no]', card).addEventListener('click', () => { const why = $('.rv-reason', card).value.trim(); if (!why) { $('.rv-reason', card).focus(); return toast('Say why first, so they can fix it', true); } decide(card.dataset.rv, false, why); });
  });
  $$('[data-down]', box).forEach(b => b.addEventListener('click', async () => { const why = await askText('Take it down?', { desc: "They'll see your reason in their Zuno DM.", placeholder: 'Why is it being taken down?', ok: 'Take down', danger: true, required: true }); if (why) decide(b.dataset.down, false, why); }));
}
onLive26?.('creations-review', () => { const box = $('.settings-nav [data-s="moderation"].active') && modTab === 'creations' ? $('#mod-body') : null; if (box) drawReview(box); });

// ======================= stickers: grouped by server, with favorites =======================
// One scrolling list: ⭐ Favorites, Zuno's own, then a section for each server (with its icon in
// the side rail to jump there). Hover a sticker and press ☆ to favorite it.
let favStickers = null;
async function loadFavStickers() {
  if (favStickers) return favStickers;
  try { favStickers = (await api('GET', '/api/me/fav-stickers')).favs; } catch { favStickers = []; }
  return favStickers;
}
const favKey = f => (f.serverId ? f.serverId + ':' : '') + f.id;
openStickerPicker = async function (anchor, onPick) {
  const [lib, favs] = await Promise.all([loadStickers(true), loadFavStickers()]);
  const sections = [
    { id: 'zuno', name: 'Zuno', icon: `<span class="stk-rail-zuno">${mascot('happy')}</span>`, list: Object.keys(ZUNO_STICKERS).map(id => ({ id })) },
    ...lib.servers.map(sv => { const full = svById(sv.id); return { id: sv.id, name: sv.name, icon: full ? serverIcon(full, 28) : esc(sv.name[0]), list: sv.stickers.map(s => ({ ...s, serverId: sv.id })) }; }),
  ];
  const find = f => (f.serverId ? sections.find(x => x.id === f.serverId)?.list.find(s => s.id === f.id) : ZUNO_STICKERS[f.id] ? { id: f.id } : null);
  const box = popover(anchor, 'sticker-pop stk30', `<div class="pop-head">Stickers<input class="stk-q" placeholder="Search stickers" autocomplete="off"></div>
    <div class="stk-body"><div class="stk-rail"></div><div class="stk-scroll"></div></div>`);
  // A comfortable height (the generic popup lets it grow to the whole window), so it sits above
  // the message box and scrolls inside instead of running off the screen.
  box.style.maxHeight = Math.min(500, innerHeight - 24) + 'px';
  box.style.height = Math.min(500, innerHeight - 24) + 'px';
  const scroll = $('.stk-scroll', box), rail = $('.stk-rail', box);
  const item = (s, fav) => `<div class="stk-cell"><button class="stk-item" data-stk="${esc(favKey(s))}" title="${esc(ZUNO_STICKERS[s.id]?.[0] || s.name)}">${stickerHtml(s, 76)}</button>
    <button class="stk-fav${fav ? ' on' : ''}" data-fav="${esc(favKey(s))}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${fav ? '★' : '☆'}</button></div>`;
  const draw = (q = '') => {
    const favSet = new Set(favs.map(favKey));
    const match = s => !q || (ZUNO_STICKERS[s.id]?.[0] || s.name || '').toLowerCase().includes(q);
    const favList = favs.map(find).filter(Boolean).filter(match);
    const all = [...(favList.length ? [{ id: 'fav', name: 'Favorites', icon: '<span class="stk-rail-star">★</span>', list: favList }] : []), ...sections.map(sec => ({ ...sec, list: sec.list.filter(match) })).filter(sec => sec.list.length)];
    rail.innerHTML = all.map(sec => `<button class="stk-rail-b" data-jump="${esc(sec.id)}" title="${esc(sec.name)}">${sec.icon}</button>`).join('');
    scroll.innerHTML = all.length ? all.map(sec => `<section class="stk-sec" data-sec="${esc(sec.id)}"><h5>${sec.id === 'fav' ? '★ ' : ''}${esc(sec.name)} <span class="muted small">${sec.list.length}</span></h5>
      <div class="stk-grid">${sec.list.map(s => item(s, favSet.has(favKey(s)))).join('')}</div></section>`).join('') : '<div class="fp-empty">No stickers match that.</div>';
    $$('[data-jump]', rail).forEach(b => b.addEventListener('click', () => $(`[data-sec="${CSS.escape(b.dataset.jump)}"]`, scroll)?.scrollIntoView({ block: 'start', behavior: 'smooth' })));
    $$('[data-stk]', scroll).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.stk;
      const ref = ZUNO_STICKERS[k] ? { id: k } : { serverId: k.slice(0, k.indexOf(':')), id: k.slice(k.indexOf(':') + 1) };
      closeLayer();
      onPick(ZUNO_STICKERS[ref.id] ? { id: ref.id } : { id: ref.id, serverId: ref.serverId });
    }));
    $$('[data-fav]', scroll).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const k = b.dataset.fav, at = favs.findIndex(f => favKey(f) === k);
      if (at >= 0) favs.splice(at, 1);
      else { if (favs.length >= 30) return toast('You can have up to 30 favorite stickers', true); favs.unshift(ZUNO_STICKERS[k] ? { id: k } : { serverId: k.slice(0, k.indexOf(':')), id: k.slice(k.indexOf(':') + 1) }); }
      const top = scroll.scrollTop;
      draw($('.stk-q', box).value.trim().toLowerCase());
      scroll.scrollTop = top;
      try { await api('PUT', '/api/me/fav-stickers', { favs }); } catch (err) { toast(err.message, true); }
    }));
  };
  draw();
  // Open at the server you're in.
  const here = state.currentServerId && $(`[data-sec="${CSS.escape(state.currentServerId)}"]`, scroll);
  if (here && !favs.length) scroll.scrollTop = here.offsetTop - scroll.offsetTop;
  $('.stk-q', box).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  setTimeout(() => $('.stk-q', box)?.focus(), 30);
};

// ======================= a tidier Settings › Profiles =======================
// The long form is grouped into cards (Identity, Looks, Flair, About, Sound), the preview stays in
// view while you scroll, and Profiles gets jump links in the side menu. On a phone the preview sits
// at the top of the screen, so every change shows on your profile as you make it.
const PF_GROUPS = [
  ['identity', 'Identity', 'How your name shows up.', /^(Display Name|Pronouns)/],
  ['looks', 'Looks', 'Your picture, banner and colors.', /^(Avatar(?! Decoration)|Banner Color|Profile Banner|Profile Background|Profile Colors)/],
  ['flair', 'Flair', 'Decorations, effects, name banners, your server tag and badges.', /^(Wearing|Avatar Decoration|Profile Effect|Server Tag|Badges)/],
  ['about', 'About', 'What people read when they open your profile.', /^(Custom Status|About Me)/],
  ['sound', 'Sound', 'Plays when someone opens your profile.', /^Profile Sound/],
];
function groupProfileForm() {
  const form = $('#profile-form');
  if (!form || form.dataset.grouped) return;
  form.dataset.grouped = '1';
  const kids = [...form.children];
  const cards = {};
  for (const [key, title, desc] of PF_GROUPS) {
    const c = document.createElement('section');
    c.className = 'pf-card'; c.id = 'pf-' + key;
    c.innerHTML = `<div class="pf-card-head"><h3>${title}</h3><span>${desc}</span></div>`;
    cards[key] = c;
  }
  const fresh = kids.find(k => k.classList.contains('pf-fresh')), worn = kids.find(k => k.classList.contains('pf-worn'));
  for (const k of kids) {
    if (k === fresh || k === worn) continue;
    const label = (k.firstChild?.textContent || k.textContent || '').trim();
    const g = PF_GROUPS.find(x => x[3].test(label));
    (g ? cards[g[0]] : cards.looks).appendChild(k);
  }
  if (fresh) form.appendChild(fresh);
  for (const [key] of PF_GROUPS) if (cards[key].children.length > 1) form.appendChild(cards[key]);
  if (worn) cards.flair.querySelector('.pf-card-head').after(worn);
  // Jump links under Profiles in the side menu.
  const nav = $('.settings-nav [data-s="profile"]');
  if (nav && !$('.pf-subnav')) {
    const sub = document.createElement('div');
    sub.className = 'pf-subnav';
    sub.innerHTML = PF_GROUPS.filter(([k]) => $('#pf-' + k)).map(([k, t]) => `<button type="button" data-jump-pf="${k}">${t}</button>`).join('');
    nav.after(sub);
    $$('[data-jump-pf]', sub).forEach(b => b.addEventListener('click', () => {
      $('#pf-' + b.dataset.jumpPf)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      $$('[data-jump-pf]', sub).forEach(x => x.classList.toggle('on', x === b));
    }));
  }
  // Phones: a "Preview" handle that shrinks or grows the live preview.
  const prev = $('.profile-editor .preview');
  if (prev && !$('.pf-prev-toggle', prev)) {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'pf-prev-toggle';
    // Starts small in short windows so it doesn't cover what you're editing; your choice is remembered.
    let small; try { small = localStorage.getItem('zuno_pf_prev_min'); } catch {}
    small = small == null ? innerHeight < 900 : small === '1';
    prev.classList.toggle('pf-prev-min', small);
    t.textContent = small ? 'Show preview' : 'Hide preview';
    t.addEventListener('click', () => { const s = prev.classList.toggle('pf-prev-min'); t.textContent = s ? 'Show preview' : 'Hide preview'; try { localStorage.setItem('zuno_pf_prev_min', s ? '1' : '0'); } catch {} });
    prev.prepend(t);
  }
}
const _showSettingsSection30b = showSettingsSection;
showSettingsSection = function (section, ...a) {
  $('.pf-subnav')?.remove();
  const r = _showSettingsSection30b(section, ...a);
  if (section === 'profile') { Promise.resolve(r).then(() => requestAnimationFrame(groupProfileForm)); }
  return r;
};

// ======================= Settings › Profiles: rows that open a picker =======================
// Instead of long grids, each kind of flair is one row showing what you have on. Clicking it opens
// a picker: Zuno's own or Community, filters, your picture wearing each one, a live preview of how
// it looks in chat and lists, and Apply.
const savedFlair = (() => { try { return new Set(JSON.parse(localStorage.getItem('zuno_flair_saved') || '[]')); } catch { return new Set(); } })();
const keepSaved = () => { try { localStorage.setItem('zuno_flair_saved', JSON.stringify([...savedFlair])); } catch {} };
const FLAIR = {
  decoration: { title: 'Avatar decoration', pick: 'Change avatar decoration', make: 'Make a frame' },
  effect: { title: 'Profile effect', pick: 'Change profile effect', make: 'Make an effect' },
  banner: { title: 'Name banner', pick: 'Change name banner', make: 'Make a banner' },
};
// What you have on now, as a picker id: "z:<key>" (Zuno's own), "c:<id>" (Community), "p:<preset>" or "".
function currentFlair(kind, me = state.me) {
  if (kind === 'decoration') return me.communityDeco ? 'c:' + me.communityDeco.id : me.decoration ? 'z:' + me.decoration : '';
  if (kind === 'effect') return me.communityEffect ? 'c:' + me.communityEffect.id : me.profileEffect ? 'z:' + me.profileEffect : '';
  return me.nameBanner?.preset ? 'p:' + me.nameBanner.preset : me.nameBanner ? 'c:' + me.nameBanner.id : '';
}
function flairName(kind, me = state.me) {
  if (kind === 'decoration') return me.communityDeco?.name || DECORATIONS[me.decoration]?.name || 'None';
  if (kind === 'effect') return me.communityEffect?.name || EFFECTS[me.profileEffect]?.name || 'None';
  return me.nameBanner?.preset ? NB_PRESETS[me.nameBanner.preset] : me.nameBanner ? 'Community banner' : 'None';
}
// "me" wearing a picker option, for previews.
function wearingAs(kind, opt, me = state.me) {
  const u = { ...me };
  if (kind === 'decoration') { u.decoration = opt?.z || null; u.communityDeco = opt?.c ? { url: opt.c.url, animated: false } : null; }
  if (kind === 'effect') { u.profileEffect = opt?.z || null; u.communityEffect = opt?.c ? { url: opt.c.url } : null; }
  if (kind === 'banner') u.nameBanner = opt?.p ? { preset: opt.p } : opt?.c ? { url: opt.c.url } : null;
  return u;
}
function rowThumb(kind, me = state.me) {
  if (kind === 'decoration') return `<span class="fr-thumb">${avatar(me, 34)}</span>`;
  if (kind === 'effect') return `<span class="fr-thumb fr-fx">${me.communityEffect ? `<img src="${esc(me.communityEffect.url)}" alt="">` : (me.profileEffect && profileEffectHtml(me.profileEffect)) || '<span class="fr-none">✦</span>'}</span>`;
  const a = nameBannerAttrs(me);
  return `<span class="fr-thumb fr-nb ${a ? a.cls : ''}"${a?.url ? ` style="--nb:url('${esc(a.url)}')"` : ''}>${a ? '' : '<span class="fr-none">Aa</span>'}</span>`;
}
function flairRows() {
  return `<div class="fr-list">${Object.entries(FLAIR).map(([k, f]) => `<button type="button" class="fr-row" data-flair="${k}">${rowThumb(k)}<span class="fr-txt"><b>${f.title}</b><small>${esc(flairName(k))}</small></span><span class="fr-go">Change<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4z"/></svg></span></button>`).join('')}</div>`;
}
flairProfileFields = function () {
  return `<div class="pf-fresh cl-fresh"><div class="cl-rack sm" aria-hidden="true">${closetRack()}</div>
      <div><b>Raid the Closet</b><span>Frames, effects and name banners made by people on Zuno. Try anything on, it's all free.</span></div>
      <button type="button" class="btn btn-primary btn-sm" data-open-community>Open the Closet</button></div>
    <div class="field fr-field">Wearing<span class="hint" style="display:block;margin-top:2px">Pick one to change it. Changes save right away.</span>${flairRows()}</div>
    <div class="field">Server Tag <span class="hint">(shows next to your name everywhere)</span><div id="tag-pick"></div></div>
    <div class="field">Badges <span class="hint">(click one to hide it from your profile; click again to show it)</span><div id="badge-pick" class="bp-grid"><span class="muted small">Loading…</span></div></div>`;
};
let flairUpdate = null;
wireFlairFields = function (form, d, update) {
  flairUpdate = update;
  drawTagPick(form, update);
  drawBadgePick(form, update);
  $('[data-open-community]', form)?.addEventListener('click', () => { if (settingsDraft && isDraftDirty()) return toast('Save or reset your changes first', true); openCommunity(); });
  $$('[data-flair]', form).forEach(b => b.addEventListener('click', () => openFlairPicker(b.dataset.flair)));
};
function refreshFlairRows() {
  const list = $('.fr-list');
  if (list) list.outerHTML = flairRows();
  $$('[data-flair]').forEach(b => b.addEventListener('click', () => openFlairPicker(b.dataset.flair)));
  if (settingsDraft) { settingsDraft.decoration = state.me.decoration || null; settingsDraft.profileEffect = state.me.profileEffect || null; }
  flairUpdate?.();
}

async function openFlairPicker(kind) {
  const f = FLAIR[kind];
  let src = 'zuno', filter = 'all', q = '', pick = currentFlair(kind), community = null;
  const zunoOpts = () => kind === 'decoration' ? [{ id: '', name: 'None' }, ...Object.entries(DECORATIONS).filter(([k, v]) => flairShown(k, v)).map(([k, v]) => ({ id: 'z:' + k, z: k, name: v.name, moving: /class="dk-/.test(v.svg), ltd: !!v.season }))]
    : kind === 'effect' ? [{ id: '', name: 'None' }, ...Object.entries(EFFECTS).filter(([k, v]) => flairShown(k, v)).map(([k, v]) => ({ id: 'z:' + k, z: k, name: v.name, moving: true, ltd: !!v.season }))]
      : [{ id: '', name: 'None' }, ...Object.entries(NB_PRESETS).map(([k, n]) => ({ id: 'p:' + k, p: k, name: n, moving: false }))];
  // Opens over Settings (the usual dialog would close Settings first).
  const ov = document.createElement('div');
  ov.className = 'overlay fp-overlay';
  ov.style.zIndex = 130;
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc29, true); };
  const esc29 = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc29, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $('#layer').appendChild(ov);
  ov.innerHTML = (`<div class="dialog modal fp-dlg"><div class="fp-head"><h3>${f.pick}</h3><button class="fp-x" data-a="x" aria-label="Close">✕</button></div>
    <div class="fp-main"><div class="fp-left">
      <div class="fp-top"><div class="fp-src"><button data-src="zuno" class="on">Zuno</button><button data-src="community">Community</button></div><button class="btn btn-primary btn-sm" data-a="make">✦ ${f.make}</button></div>
      <div class="fp-filters"><button data-f="all" class="on">All</button><button data-f="saved">★ Saved</button><button data-f="still">Still</button><button data-f="moving">Moving</button><input class="fp-q" placeholder="Search" hidden></div>
      <div class="fp-grid"></div></div>
      <div class="fp-right"><div class="fp-prev"></div></div></div>
    <div class="fp-foot"><span class="fp-chosen muted small"></span><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="apply" disabled>Apply</button></div></div>`);
  const grid = $('.fp-grid', ov), prev = $('.fp-prev', ov);
  const all = () => (src === 'zuno' ? zunoOpts() : [{ id: '', name: 'None' }, ...(community || []).map(c => ({ id: 'c:' + c.id, c, name: c.name, moving: !!c.animated, by: c.creator?.displayName }))]);
  const tile = o => {
    const u = wearingAs(kind, o);
    const art = kind === 'decoration' ? avatar(u, 58) : kind === 'effect' ? `<span class="fp-fx">${o.c ? `<img src="${esc(o.c.url)}" alt="">` : o.z ? profileEffectHtml(o.z) : ''}<i class="fp-fx-av">${avatar(state.me, 26)}</i></span>` : nbHtml(u, state.me.displayName);
    const key = kind + ':' + o.id;
    return `<div class="fp-tile${pick === o.id ? ' on' : ''}" data-opt="${esc(o.id)}" role="button" tabindex="0">${o.id ? `<button class="fp-star${savedFlair.has(key) ? ' on' : ''}" data-star="${esc(key)}" aria-label="Save">${savedFlair.has(key) ? '★' : '☆'}</button>` : ''}${o.ltd ? '<span class="ltd-tag">Limited</span>' : ''}
      <span class="fp-art">${o.id ? art : '<span class="fp-none">✕</span>'}</span><b>${esc(o.name)}</b>${o.by ? `<small>by ${esc(o.by)}</small>` : ''}</div>`;
  };
  const drawGrid = () => {
    let list = all();
    if (filter === 'saved') list = list.filter(o => !o.id || savedFlair.has(kind + ':' + o.id));
    if (filter === 'still') list = list.filter(o => !o.id || !o.moving);
    if (filter === 'moving') list = list.filter(o => !o.id || o.moving);
    if (q) list = list.filter(o => !o.id || o.name.toLowerCase().includes(q) || (o.by || '').toLowerCase().includes(q));
    grid.innerHTML = src === 'community' && community === null ? '<div class="muted fp-wait">Loading…</div>'
      : list.length > 1 || !list.length ? list.map(tile).join('') + (src === 'community' && (community || []).length === 0 ? `<div class="fp-empty"><b>Nothing here yet</b><span class="muted small">Be the first to make a ${esc(KIND_INFO[kind].one)}!</span></div>` : '')
        : list.map(tile).join('') + `<div class="fp-empty"><span class="muted small">${filter === 'saved' ? 'Press ☆ on one to save it here.' : 'Nothing matches.'}</span></div>`;
    $$('[data-opt]', grid).forEach(t => {
      const choose = () => { pick = t.dataset.opt; $$('.fp-tile', grid).forEach(x => x.classList.toggle('on', x === t)); drawPrev(); };
      t.addEventListener('click', choose);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
    $$('[data-star]', grid).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const k = b.dataset.star;
      savedFlair.has(k) ? savedFlair.delete(k) : savedFlair.add(k);
      keepSaved();
      b.classList.toggle('on', savedFlair.has(k)); b.textContent = savedFlair.has(k) ? '★' : '☆';
      if (filter === 'saved') drawGrid();
    }));
  };
  const optFor = id => [...zunoOpts(), ...(community || []).map(c => ({ id: 'c:' + c.id, c, name: c.name }))].find(o => o.id === id) || { id: '', name: 'None' };
  const drawPrev = () => {
    const o = optFor(pick), u = wearingAs(kind, o);
    const name = esc(state.me.displayName);
    prev.innerHTML = kind === 'effect'
      ? `<div class="fp-card">${profileCard(u, { size: 64 })}</div>`
      : `<div class="fp-big">${kind === 'decoration' ? avatar(u, 112) : nbHtml(u, state.me.displayName)}</div>
        <div class="fp-in"><span class="fp-lbl">In chat</span><div class="fp-msg">${avatar(u, 36)}<div><b>${name}</b> <small>Today at 12:00</small><p>Look at my new ${kind === 'decoration' ? 'decoration' : 'name banner'}!</p></div></div>
          <span class="fp-lbl">In the member list</span>${nbHtml(u, state.me.displayName)}</div>`;
    $('.fp-chosen', ov).textContent = o.id ? `${o.name}${o.by ? ' by ' + o.by : ''}` : 'Nothing';
    $('[data-a=apply]', ov).disabled = pick === currentFlair(kind);
  };
  $$('[data-src]', ov).forEach(b => b.addEventListener('click', async () => {
    src = b.dataset.src;
    $$('[data-src]', ov).forEach(x => x.classList.toggle('on', x === b));
    $('.fp-q', ov).hidden = src !== 'community';
    drawGrid();
    if (src === 'community' && community === null) {
      try { community = (await api('GET', `/api/creations?kind=${kind}`)).creations; } catch { community = []; }
      for (const c of community) if (c.creator) state.users[c.creator.id] = { ...state.users[c.creator.id], ...c.creator };
      drawGrid();
    }
  }));
  $$('[data-f]', ov).forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; $$('[data-f]', ov).forEach(x => x.classList.toggle('on', x === b)); drawGrid(); }));
  $('.fp-q', ov).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); drawGrid(); });
  $('[data-a=x]', ov).addEventListener('click', close);
  $('[data-a=cancel]', ov).addEventListener('click', close);
  $('[data-a=make]', ov).addEventListener('click', () => { close(); makeKind = kind; comTab = 'make'; showSettingsSection('community'); });
  $('[data-a=apply]', ov).addEventListener('click', async () => {
    const btn = $('[data-a=apply]', ov);
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const o = optFor(pick);
      const field = kind === 'decoration' ? 'decoration' : 'profileEffect';
      if (kind === 'banner') { if (!(await wear('banner', o.p ? 'preset:' + o.p : o.c ? o.c.id : null))) throw new Error(''); }
      else if (o.c) { if (!(await wear(kind, o.c.id))) throw new Error(''); }
      else {
        if (kind === 'decoration' ? state.me.communityDeco : state.me.communityEffect) await wear(kind, null);
        const { me } = await api('PATCH', '/api/me', { [field]: o.z || null });
        state.me = { ...state.me, ...me }; state.users[me.id] = { ...state.users[me.id], ...me };
        if (!me.communityDeco) delete state.me.communityDeco;
        if (!me.communityEffect) delete state.me.communityEffect;
        renderUserPanel?.();
      }
      close();
      refreshFlairRows();
      toast(o.id ? `${o.name} is on ✨` : 'Taken off');
    } catch (e) { if (e.message) toast(e.message, true); btn.disabled = false; btn.textContent = 'Apply'; }
  });
  drawGrid(); drawPrev();
}

// ======================= Settings menu: icons and clearer names =======================
const NAV_ICONS = {
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  profile: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.8-1.8 2-2.7 3.5-2.7s2.7.9 3.5 2.7M14 10h4M14 13.5h3"/>',
  community: '<path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 14.8l-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
  connections: '<path d="M10 14l4-4M8.5 16.5l-1 1a3 3 0 0 1-4.2-4.2l3-3a3 3 0 0 1 4.2 0M15.5 7.5l1-1a3 3 0 0 1 4.2 4.2l-3 3a3 3 0 0 1-4.2 0"/>',
  privacy: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  activity: '<circle cx="12" cy="12" r="3"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>',
  standing: '<path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6z"/>',
  appearance: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/><path d="M12 21c-1.5 0-2-1.3-1.3-2.3.8-1.2-.2-2.7-1.7-2.7"/>',
  notifications: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  developer: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  bugs: '<ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8V20M9 6.5 7.5 4.5M15 6.5l1.5-2M7 12H3.5M20.5 12H17M7.5 17l-3 2M16.5 17l3 2"/>',
  buginbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  moderation: '<path d="M14 4l6 6-3 3-6-6zM11 7L4 14l3 3 7-7M3 21h9"/>',
  admin: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  setup: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
};
const NAV_NAMES = { profile: 'My Profile', media: 'Profile Playback' };
const _openSettings30c = openSettings;
openSettings = function (...a) {
  const r = _openSettings30c(...a);
  const nav = $('.settings:not(.server-settings-page) .settings-nav');
  if (nav && !nav.classList.contains('nav30')) {
    nav.classList.add('nav30');
    for (const b of $$('[data-s]', nav)) {
      const k = b.dataset.s;
      if (NAV_NAMES[k]) b.textContent = NAV_NAMES[k];
      if (k === 'community') b.innerHTML = 'Community<span class="nav-new">Closet</span>';
      if (NAV_ICONS[k] && !b.querySelector('img, svg')) b.insertAdjacentHTML('afterbegin', `<svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[k]}</svg>`);
    }
  }
  return r;
};
const _renderMediaSettings30 = renderMediaSettings;
renderMediaSettings = function (body, ...a) {
  const r = _renderMediaSettings30(body, ...a);
  const h = $('h2', body); if (h) h.textContent = 'Profile Playback';
  return r;
};
