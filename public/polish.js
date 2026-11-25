'use strict';
// Zuno polish: the picture editor (crop, zoom, rotate avatars and banners), quick avatar changes,
// the Quick Switcher (Ctrl+K), ripples, greetings and other small touches.

// Pictures may come straight from cloud storage, which the page can show but not read; ?direct=1
// asks Zuno to pass the file through instead, for the few places that read the pixels.
function directUrl(src) { try { const u = new URL(src, location.href); if (u.origin === location.origin && /^\/(uploads|files)\//.test(u.pathname)) u.searchParams.set('direct', '1'); return u.href; } catch { return src; } }

// ======================= picture editor =======================
// openImageEditor(fileOrUrl, { shape: 'circle' | 'banner' }) -> Promise<Blob | null>
function openImageEditor(source, { shape = 'circle', title } = {}) {
  const banner = shape === 'banner';
  const VW = banner ? 480 : 280, VH = banner ? 192 : 280;  // the crop window on screen
  const OW = banner ? 1200 : 512, OH = banner ? 480 : 512; // the saved picture
  return new Promise(resolve => {
    const url = typeof source === 'string' ? directUrl(source) : URL.createObjectURL(source);
    const img = new Image();
    img.onerror = () => { toast("Couldn't read that picture.", true); resolve(null); };
    img.onload = () => {
      // Its own overlay, so it can open on top of Settings without closing it.
      const ov = document.createElement('div');
      ov.className = 'overlay ie-overlay';
      ov.innerHTML = `<div class="dialog modal img-editor">
        <h3>${esc(title || (banner ? 'Adjust your banner' : 'Adjust your avatar'))}</h3>
        <p class="muted small" style="margin:-4px 0 14px">Drag to move it, scroll or use the slider to zoom.</p>
        <div class="ie-stage${banner ? ' banner' : ''}" style="width:${VW}px;height:${VH}px"><canvas width="${VW * 2}" height="${VH * 2}"></canvas><div class="ie-ring"></div></div>
        <div class="ie-tools">
          <button type="button" class="icon-btn" data-z="-1" title="Zoom out">−</button>
          <input type="range" class="ie-zoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
          <button type="button" class="icon-btn" data-z="1" title="Zoom in">+</button>
          <button type="button" class="icon-btn" data-rot title="Rotate">⟳</button>
          <button type="button" class="btn btn-link btn-sm" data-reset>Reset</button>
        </div>
        <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button type="button" class="btn btn-primary" data-a="ok">Apply</button></div></div>`;
      document.body.appendChild(ov);
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', onKey, true);
      const canvas = $('canvas', ov), ctx = canvas.getContext('2d'), zoom = $('.ie-zoom', ov);
      let rot = 0, z = 1, ox = 0, oy = 0;
      const dims = () => (rot % 180 ? [img.height, img.width] : [img.width, img.height]);
      const base = () => { const [w, h] = dims(); return Math.max(VW / w, VH / h); };
      const clamp = () => {
        const [w, h] = dims(), s = base() * z;
        const mx = Math.max(0, (w * s - VW) / 2), my = Math.max(0, (h * s - VH) / 2);
        ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
      };
      const paint = (c, k) => {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.save();
        g.translate(c.width / 2 + ox * k, c.height / 2 + oy * k);
        g.rotate((rot * Math.PI) / 180);
        const s = base() * z * k;
        g.scale(s, s);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, -img.width / 2, -img.height / 2);
        g.restore();
      };
      const draw = () => { clamp(); paint(canvas, 2); };
      const setZoom = v => { z = Math.max(1, Math.min(4, v)); zoom.value = z; draw(); };
      draw();

      let drag = null;
      canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox, oy }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grab'); });
      canvas.addEventListener('pointermove', e => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; draw(); });
      const end = () => { drag = null; canvas.classList.remove('grab'); };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
      $$('[data-z]', ov).forEach(b => b.addEventListener('click', () => setZoom(z + Number(b.dataset.z) * 0.25)));
      $('[data-rot]', ov).addEventListener('click', () => { rot = (rot + 90) % 360; draw(); });
      $('[data-reset]', ov).addEventListener('click', () => { rot = 0; ox = oy = 0; setZoom(1); });

      function done(blob) {
        document.removeEventListener('keydown', onKey, true);
        if (typeof source !== 'string') URL.revokeObjectURL(url);
        ov.classList.add('closing'); setTimeout(() => ov.remove(), 160);
        resolve(blob);
      }
      $('[data-a=cancel]', ov).addEventListener('click', () => done(null));
      $('[data-a=ok]', ov).addEventListener('click', () => {
        const out = document.createElement('canvas');
        out.width = OW; out.height = OH;
        paint(out, OW / VW);
        out.toBlob(b => done(b), 'image/webp', 0.9);
      });
    };
    img.src = url;
  });
}
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

// Turn a picked file into an avatar data URL: GIFs stay animated, everything else goes through the editor.
async function avatarFromFile(file) {
  if (!file) return null;
  if (file.type === 'image/gif' && limits().animatedAvatar) {
    if (file.size > limits().avatar) { toast(`Animated avatars can be up to ${mb(limits().avatar)}.`, true); return null; }
    return blobToDataUrl(file);
  }
  if (!file.type.startsWith('image/')) { toast('Pick a PNG, JPG, WebP or GIF picture.', true); return null; }
  const blob = await openImageEditor(file, { shape: 'circle' });
  if (!blob) return null;
  let data = await blobToDataUrl(blob);
  if (data.length > limits().avatar * 1.37) { // shrink if it's still too big for the account's limit
    const small = await new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(i, 0, 0, 256, 256); c.toBlob(r, 'image/webp', 0.85); }; i.src = data; });
    data = await blobToDataUrl(small);
  }
  return data;
}

// Change your avatar from anywhere (user panel menu, your own profile), saved right away.
function quickChangeAvatar() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  input.addEventListener('change', async () => {
    const data = await avatarFromFile(input.files[0]);
    if (!data) return;
    try {
      const { me } = await api('PATCH', '/api/me', { avatar: data });
      state.me = me; state.users[me.id] = me;
      renderUserPanel();
      toast('Avatar updated!');
      burst($('#user-panel .avatar') || document.body, 16);
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}
async function quickRemoveAvatar() {
  try { const { me } = await api('PATCH', '/api/me', { avatar: null }); state.me = me; state.users[me.id] = me; renderUserPanel(); toast('Avatar removed'); }
  catch (e) { toast(e.message, true); }
}

// ======================= Quick Switcher (Ctrl+K) =======================
function openQuickSwitcher() {
  const items = [];
  for (const id of state.friends || []) { const u = user(id); if (u) items.push({ kind: 'dm', id, label: u.displayName, sub: u.username, html: avatar(u, 24) }); }
  for (const d of state.dms || []) if (!items.some(i => i.id === d.userId)) { const u = user(d.userId); if (u) items.push({ kind: 'dm', id: u.id, label: u.displayName, sub: u.username, html: avatar(u, 24) }); }
  for (const sv of state.servers || []) for (const ch of sv.channels || []) items.push({ kind: 'ch', sv: sv.id, id: ch.id, label: ch.name, sub: sv.name, html: `<span class="qs-hash">${ch.type === 'voice' ? '🔊' : '#'}</span>` });
  const ov = openLayer(`<div class="dialog modal quick-switch">
    <input class="qs-input" placeholder="Where do you want to go?" autocomplete="off" spellcheck="false">
    <div class="qs-list"></div>
    <div class="qs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div></div>`);
  const input = $('.qs-input', ov), list = $('.qs-list', ov);
  let shown = [], sel = 0;
  const score = (i, q) => { const l = i.label.toLowerCase(), s = (i.sub || '').toLowerCase(); return l.startsWith(q) ? 3 : l.includes(q) ? 2 : s.includes(q) ? 1 : 0; };
  const render = () => {
    const q = input.value.trim().toLowerCase().replace(/^[#@]/, '');
    shown = (q ? items.map(i => [i, score(i, q)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([i]) => i) : items).slice(0, 12);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((i, n) => `<button class="qs-item${n === sel ? ' on' : ''}" data-n="${n}">${i.html}<b>${esc(i.label)}</b><small>${esc(i.sub || '')}</small></button>`).join('')
      : '<div class="qs-empty">Nothing matches that.</div>';
    $$('[data-n]', list).forEach(b => b.addEventListener('click', () => go(shown[b.dataset.n])));
  };
  const go = i => { if (!i) return; dismissLayer(); i.kind === 'dm' ? openDM(i.id) : openChannel(i.sv, i.id); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
  });
  render();
  input.focus();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.me) { e.preventDefault(); openQuickSwitcher(); }
});

// ======================= little touches =======================
// A ripple from where you click, like a drop in water.
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.btn, .tab, .swatch-btn, .gift-plan, .qs-item, .menu button, .friend-row, .bp-card');
  if (!el || el.disabled || document.documentElement.classList.contains('reduce-motion')) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 650);
});

// A greeting on the Friends page that changes with the time of day.
function greeting() {
  const h = new Date().getHours(), n = state.me?.displayName || '';
  const [t, e] = h < 5 ? ['Up late', '🌙'] : h < 12 ? ['Good morning', '☀️'] : h < 17 ? ['Good afternoon', '🌤️'] : h < 21 ? ['Good evening', '🌆'] : ['Good night', '🌙']; // (0.39) after 9pm it's night
  return `${e} ${t}, ${esc(n)}`;
}
const _showFriends = showFriends;
showFriends = function (tab) {
  _showFriends(tab);
  const bar = $('#main .topbar');
  if (bar && !$('.greet', bar)) bar.insertAdjacentHTML('beforeend', `<span class="greet" title="Press Ctrl+K to jump anywhere">${greeting()} <kbd>Ctrl K</kbd></span>`);
};

// ======================= find people =======================
// Search your friends and everyone on Zuno; message friends or add new ones right from the results.
function openFindPeople() {
  const ov = openLayer(`<div class="dialog modal find-people">
    <h3>Find people</h3>
    <p class="muted small" style="margin:-4px 0 12px">Search by name or username. Friends show up first.</p>
    <input class="qs-input fp-input" placeholder="Who are you looking for?" autocomplete="off" spellcheck="false">
    <div class="fp-list"></div></div>`);
  const input = $('.fp-input', ov), list = $('.fp-list', ov);
  let t, seq = 0;
  const row = (u, rel, extra = '') => {
    const action = rel === 'friend' ? `<button class="btn btn-primary btn-sm" data-msg="${esc(u.id)}">Message</button>`
      : rel === 'incoming' ? `<button class="btn btn-green btn-sm" data-accept="${esc(u.id)}">Accept</button>`
      : rel === 'outgoing' ? '<button class="btn btn-grey btn-sm" disabled>Request sent</button>'
      : `<button class="btn btn-grey btn-sm" data-add="${esc(u.username)}">Add Friend</button>`;
    return `<div class="fp-row" data-profile="${esc(u.id)}">${avatar(u, 36, true)}<div class="fp-who"><b>${esc(u.displayName)}</b><small>${esc(u.username)}${extra}</small></div>${action}</div>`;
  };
  const draw = async () => {
    const q = input.value.trim().toLowerCase().replace(/^@/, '');
    const my = ++seq;
    const friends = (state.friends || []).map(user).filter(Boolean)
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q))
      .sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || a.displayName.localeCompare(b.displayName));
    let html = friends.length ? `<div class="fp-head">Friends</div>${friends.slice(0, 30).map(u => row(u, 'friend')).join('')}` : '';
    if (q.length >= 2) {
      list.innerHTML = html + '<div class="fp-head">Everyone on Zuno</div><div class="fp-empty">Searching…</div>';
      try {
        const { users } = await api('GET', `/api/people/search?q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        for (const u of users) state.users[u.id] = { ...state.users[u.id], ...u };
        const others = users.filter(u => u.relationship !== 'friend');
        html += `<div class="fp-head">Everyone on Zuno</div>${others.length ? others.map(u => row(u, u.relationship, u.mutualServers ? ` · ${u.mutualServers} server${u.mutualServers > 1 ? 's' : ''} in common` : '')).join('') : '<div class="fp-empty">Nobody else matches that.</div>'}`;
      } catch (e) { html += `<div class="fp-empty">${esc(e.message)}</div>`; }
    } else if (!friends.length) html = `<div class="fp-empty">${q ? 'Type at least 2 letters to search everyone on Zuno.' : "You haven't added any friends yet. Search for someone's name or username."}</div>`;
    else if (!q) html += '<div class="fp-hint">Type a name to search everyone on Zuno.</div>';
    if (my !== seq) return;
    list.innerHTML = html;
    $$('[data-msg]', list).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); dismissLayer(); openDM(b.dataset.msg); }));
    $$('[data-add]', list).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation(); b.disabled = true;
      try { await api('POST', '/api/friends/requests', { username: b.dataset.add }); b.textContent = 'Request sent'; burst(b, 10); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
    $$('[data-accept]', list).forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const req = state.requests.find(r => r.user?.id === b.dataset.accept || r.userId === b.dataset.accept);
      if (req) { await acceptRequest(req.id); draw(); }
    }));
    $$('.fp-row', list).forEach(r => r.addEventListener('click', () => openProfile(r.dataset.profile)));
  };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 220); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('[data-msg], [data-add]', list); b?.click(); } });
  draw();
  input.focus();
}

// ======================= favorites & right-click on pictures =======================
document.addEventListener('click', e => {
  const star = e.target.closest('[data-fav-gif]');
  if (!star) return;
  e.preventDefault(); e.stopPropagation();
  try { const on = toggleFavGif(JSON.parse(star.dataset.favGif)); if (on) burst(star, 10); } catch {}
}, true);

async function copyImage(src) {
  try {
    const blob = await (await fetch(directUrl(src))).blob();
    let png = blob;
    if (blob.type !== 'image/png') {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      png = await new Promise(r => c.toBlob(r, 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Image copied');
  } catch { navigator.clipboard?.writeText(new URL(src, location.href).href); toast("Couldn't copy the picture itself, so its link was copied instead."); }
}
async function saveImage(src, name) {
  try {
    const blob = await (await fetch(directUrl(src))).blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name || 'image' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { toast("Couldn't save that picture.", true); }
}
document.addEventListener('contextmenu', e => {
  const img = e.target.closest('img.msg-gif, img.att-img, .lightbox img, img.bug-shot, img.pc-banner, .gp-item img, img.gift-card-img');
  if (!img) return;
  e.preventDefault();
  const src = img.dataset.full || img.dataset.live || img.src;
  const name = img.dataset.name || img.alt || 'image';
  const gifData = img.dataset.gif ? JSON.parse(img.dataset.gif) : null;
  const point = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
  const items = [
    { label: 'Open', icon: '<span class="mi-ico">🔍</span>', run: () => openLightbox(src, name) },
    { label: 'Save Image', icon: '<span class="mi-ico">💾</span>', run: () => saveImage(src, /\.\w{3,4}$/.test(name) ? name : `${name}.${(src.match(/\.(gif|png|jpe?g|webp)/i) || [, 'png'])[1]}`) },
    { label: 'Copy Image', icon: '<span class="mi-ico">📋</span>', run: () => copyImage(src) },
    { label: 'Copy Link', icon: '<span class="mi-ico">🔗</span>', run: () => { navigator.clipboard.writeText(new URL(src, location.href).href); toast('Link copied'); } },
    { label: 'Open in Browser', icon: '<span class="mi-ico">🌐</span>', run: () => window.open(new URL(src, location.href).href, '_blank') },
  ];
  if (gifData) items.unshift({ label: isFavGif(gifData.url) ? 'Remove from Favorites' : 'Add to Favorites', icon: '<span class="mi-ico">★</span>', run: () => toggleFavGif(gifData) }, 'sep');
  // On a picture that's already open (or inside a profile or other window), the menu floats on top
  // instead: the usual menu closes whatever is open first, which closed the picture.
  if (img.closest('#layer') && typeof pickMenu === 'function') return pickMenu(point, items.filter(it => it !== 'sep' && !(it.label === 'Open' && img.closest('.lightbox'))));
  openMenu(point, items);
});

// ======================= saving memory =======================
// Moving pictures (GIFs) and videos only play while you can see them. Off screen, a GIF lets go of
// its frames and a video pauses, then both pick up again when you scroll back.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const isAnimated = img => /\.gif($|\?)/i.test(img.dataset.live || img.src) || img.classList.contains('msg-gif');
const sleeper = new IntersectionObserver(entries => {
  for (const { target: el, isIntersecting } of entries) {
    if (el.tagName === 'VIDEO') {
      if (!isIntersecting && !el.paused) { el.dataset.wasPlaying = '1'; el.pause(); }
      else if (isIntersecting && el.dataset.wasPlaying && !document.hidden) { delete el.dataset.wasPlaying; el.play().catch(() => {}); }
      continue;
    }
    if (!isIntersecting && !el.dataset.live && el.complete && el.naturalWidth) {
      el.style.width = el.offsetWidth + 'px'; el.style.height = el.offsetHeight + 'px'; // keep its space so nothing jumps
      el.dataset.live = el.src; el.src = BLANK;
    } else if (isIntersecting && el.dataset.live) {
      el.src = el.dataset.live; delete el.dataset.live;
      el.addEventListener('load', () => { el.style.width = ''; el.style.height = ''; }, { once: true });
    }
  }
}, { rootMargin: '400px 0px' });
const watchMedia = root => {
  if (!(root instanceof Element)) return;
  const els = root.matches?.('img, video') ? [root] : root.querySelectorAll('img.msg-gif, img.att-img, video, .pc-bg, img.pc-banner, .gp-item img');
  for (const el of els) if ((el.tagName === 'VIDEO' || isAnimated(el)) && !el.dataset.watched) { el.dataset.watched = '1'; sleeper.observe(el); }
};
new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(watchMedia); }).observe(document.body, { childList: true, subtree: true });
watchMedia(document.body);

// When Zuno is minimized or hidden: pause videos and animations, and after a while let go of cached pictures.
let hiddenTimer;
document.addEventListener('visibilitychange', () => {
  const root = document.documentElement;
  if (document.hidden) {
    root.classList.add('app-hidden');
    $$('video').forEach(v => { if (!v.paused) { v.dataset.wasPlaying = '1'; v.pause(); } });
    hiddenTimer = setTimeout(() => { trimConversations(true); window.zunoDesktop?.freeMemory?.(); }, 60 * 1000);
  } else {
    root.classList.remove('app-hidden');
    clearTimeout(hiddenTimer);
    $$('video[data-was-playing]').forEach(v => { delete v.dataset.wasPlaying; v.play().catch(() => {}); });
  }
});

// Only keep the newest messages of chats you aren't looking at; older ones load again when you scroll up.
function trimConversations(hard = false) {
  const active = activeConv?.();
  for (const [conv, c] of Object.entries(state.convos || {})) {
    if (conv === active || !c?.messages) continue;
    const keep = hard ? 30 : 80;
    // (0.45.1.1) The drawn window starts over too: it pointed past the end of the shorter list, so
    // the chat opened showing only its last message and looked like a brand-new DM.
    if (c.messages.length > keep) { c.messages = c.messages.slice(-keep); c.hasMore = true; c.from = null; c.to = null; }
  }
}
setInterval(() => trimConversations(false), 2 * 60 * 1000);

// ======================= right-click on a message =======================
document.addEventListener('contextmenu', e => {
  if (e.defaultPrevented) return; // a picture already showed its own menu
  const row = e.target.closest('.messages .msg[data-id]');
  if (!row || e.target.closest('textarea, input, a')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m) return;
  e.preventDefault();
  const tool = sel => row.querySelector(sel);
  const selected = String(getSelection() || '').trim();
  const point = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
  const ico = c => `<span class="mi-ico">${c}</span>`;
  const items = [];
  if (selected) items.push({ label: 'Copy Selection', icon: ico('✂️'), run: () => { navigator.clipboard.writeText(selected); toast('Copied'); } });
  if (m.content) items.push({ label: 'Copy Text', icon: ico('📋'), run: () => { navigator.clipboard.writeText(m.content); toast('Message copied'); } });
  if (tool('[data-reply]')) items.push({ label: 'Reply', icon: ico('↩️'), run: () => startReply(id) });
  items.push({ label: 'Add Reaction', icon: ico('😀'), run: () => tool('[data-react]')?.click() });
  if (m.gif) items.push({ label: isFavGif(m.gif.url) ? 'Remove GIF from Favorites' : 'Add GIF to Favorites', icon: ico('★'), run: () => toggleFavGif(m.gif) });
  for (const a of m.attachments || []) items.push({ label: `Copy Link to ${a.name.length > 22 ? a.name.slice(0, 20) + '…' : a.name}`, icon: ico('🔗'), run: () => { navigator.clipboard.writeText(new URL(a.url, location.href).href); toast('Link copied'); } });
  const author = user(m.authorId);
  if (author && !author.system) items.push({ label: `View ${author.displayName}'s Profile`, icon: ico('👤'), run: () => openProfile(author.id) });
  items.push({ label: 'Copy Message ID', icon: ico('#️⃣'), run: () => { navigator.clipboard.writeText(id); toast('ID copied'); } });
  if (m.authorId !== state.me.id && author && !author.system) items.push({ label: 'Report Message', icon: ico('🚩'), danger: true, run: () => openReportDialog(conv, id) });
  if (tool('[data-edit]') || tool('[data-del]')) items.push('sep');
  if (tool('[data-edit]')) items.push({ label: 'Edit Message', icon: ico('✏️'), run: () => tool('[data-edit]')?.click() });
  if (tool('[data-del]')) items.push({ label: 'Delete Message', icon: ico('🗑️'), danger: true, run: () => tool('[data-del]')?.click() });
  openMenu(point, items);
  // A row of quick reactions at the top of the menu.
  const menu = $('.menu');
  if (menu && !m.pending) {
    const bar = document.createElement('div');
    bar.className = 'quick-react';
    bar.innerHTML = ['👍', '❤️', '😂', '😮', '😢', '🔥'].map(x => `<button data-q="${x}">${x}</button>`).join('');
    menu.prepend(bar);
    $$('[data-q]', bar).forEach(b => b.addEventListener('click', () => { closeLayer(); toggleReaction(id, b.dataset.q); }));
    const r = menu.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - r.height - 8) + 'px';
  }
});

// ======================= phones: long-press and swipes =======================
// Long-press a message or picture to open its menu (iPhones don't send a right-click).
(() => {
  let timer = null, start = null;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, at: Date.now(), target: e.target };
    clearTimeout(timer);
    if (e.target.closest('.messages .msg, img.msg-gif, img.att-img')) {
      timer = setTimeout(() => {
        e.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY }));
        navigator.vibrate?.(15);
        start = null;
      }, 500);
    }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!start) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) clearTimeout(timer);
  }, { passive: true });
  document.addEventListener('touchend', e => {
    clearTimeout(timer);
    if (!start || innerWidth > 760) return;
    const t = e.changedTouches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
    const app = $('#app');
    // (0.49) Opening and closing the side menu by swiping now follows your finger (zuno49.js).
    start = null;
  }, { passive: true });
})();

// ======================= install on phones =======================
if ('serviceWorker' in navigator && !window.zunoDesktop && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; showInstallBar(); });
function showInstallBar() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (window.zunoDesktop || standalone || innerWidth > 760 || $('#install-bar')) return;
  try { if (localStorage.getItem('zuno_install_dismissed')) return; } catch {}
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installEvent && !ios) return;
  const bar = document.createElement('div');
  bar.id = 'install-bar';
  bar.className = 'install-bar';
  bar.innerHTML = `<img src="/icon-192.png" alt=""><div><b>Put Zuno on your home screen</b><span>${installEvent ? 'Open it like any other app.' : 'Tap the Share button, then "Add to Home Screen".'}</span></div>
    ${installEvent ? '<button class="btn btn-primary btn-sm" id="install-go">Install</button>' : ''}<button class="install-x" id="install-x" aria-label="Close">✕</button>`;
  document.body.appendChild(bar);
  $('#install-go')?.addEventListener('click', async () => { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; bar.remove(); });
  $('#install-x').addEventListener('click', () => { bar.remove(); try { localStorage.setItem('zuno_install_dismissed', '1'); } catch {} });
}
setTimeout(showInstallBar, 4000);
