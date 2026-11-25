'use strict';
// Zuno 0.34

// ======================= Veteran Bug Hunter =======================
// 15 confirmed reports: obsidian purple, with a little galaxy swirling inside and stars that twinkle.
BADGE_INFO.bughunter_veteran = {
  label: 'Veteran Bug Hunter', desc: 'Had 15 bug reports confirmed by the Zuno team',
  svg: `<svg class="bh-vet" viewBox="0 0 24 24" aria-hidden="true"><defs>
      <radialGradient id="bgVetCore" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#6b3fd1"/><stop offset=".45" stop-color="#2a1158"/><stop offset="1" stop-color="#0b0418"/></radialGradient>
      <linearGradient id="bgVetRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c8ff"/><stop offset=".4" stop-color="#8b4dff"/><stop offset="1" stop-color="#240a4d"/></linearGradient>
      <radialGradient id="bgVetNeb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff7ad9" stop-opacity=".85"/><stop offset=".5" stop-color="#7b5cff" stop-opacity=".45"/><stop offset="1" stop-color="#7b5cff" stop-opacity="0"/></radialGradient>
      <clipPath id="bgVetClip"><circle cx="12" cy="12" r="9.4"/></clipPath></defs>
    <circle cx="12" cy="12" r="10.6" fill="url(#bgVetRim)"/><circle cx="12" cy="12" r="9.4" fill="url(#bgVetCore)"/>
    <g clip-path="url(#bgVetClip)"><g class="bv-swirl">
      <ellipse cx="12" cy="12" rx="8.5" ry="3.2" fill="url(#bgVetNeb)" transform="rotate(-28 12 12)"/>
      <ellipse cx="12" cy="12" rx="5.5" ry="1.6" fill="#c9a8ff" opacity=".35" transform="rotate(-28 12 12)"/>
      <circle cx="5.6" cy="7.4" r=".45" fill="#fff"/><circle cx="17.8" cy="16.6" r=".4" fill="#fff"/><circle cx="16.4" cy="6.2" r=".3" fill="#e9dbff"/><circle cx="7.2" cy="17.2" r=".3" fill="#e9dbff"/>
    </g></g>
    <ellipse cx="12" cy="13.6" rx="3.4" ry="4.2" fill="#f4ecff"/><circle cx="12" cy="8.5" r="2.1" fill="#f4ecff"/>
    <path d="M12 9.7v7.9" stroke="#5b2bd6" stroke-width="1"/>
    <path d="M8.5 11.6 6.2 10.5M8.3 14.2H5.8M8.7 16.6 6.6 17.9M15.5 11.6l2.3-1.1M15.7 14.2h2.5M15.3 16.6l2.1 1.3M10.9 6.7 9.8 5.2M13.1 6.7l1.1-1.5" stroke="#f4ecff" stroke-width="1.25" stroke-linecap="round"/>
    <path class="bv-star a" d="M19 2.6l.5 1.15 1.2.15-.9.8.25 1.2-1.05-.6-1.05.6.25-1.2-.9-.8 1.2-.15z" fill="#fff"/>
    <path class="bv-star b" d="M4.4 18.6l.35.8.85.1-.65.55.2.85-.75-.45-.75.45.2-.85-.65-.55.85-.1z" fill="#e2c8ff"/></svg>`,
};

// Bug report page: after Senior, the progress bar moves on to Veteran.
if (typeof renderBugReport === 'function') {
  const _rbr = renderBugReport;
  renderBugReport = async function (body, ...a) {
    const r = await _rbr(body, ...a);
    const box = $('.bh-progress', body);
    if (!box) return r;
    let p;
    try { p = await api('GET', '/api/bugs/progress'); } catch { return r; }
    if (!p.senior) return r;
    const pct = Math.min(100, Math.round(p.confirmed / p.veteranNeed * 100));
    box.className = `bh-progress${p.veteran ? ' done vet' : ' vet-next'}`;
    // Shows the badge you're working toward (the obsidian Veteran one), dimmed until it's yours.
    box.innerHTML = `<span class="bh-ico${p.veteran ? '' : ' bh-goal'}">${BADGE_INFO.bughunter_veteran.svg}</span>
      <div class="bh-txt"><b>${p.veteran ? "You're a Veteran Bug Hunter! 🌌" : 'Next up: Veteran Bug Hunter'}</b>
        <span>${p.veteran ? `${p.confirmed} of your reports were confirmed. Legendary.` : `${p.confirmed} of ${p.veteranNeed} confirmed reports. <b>${Math.max(0, p.veteranNeed - p.confirmed)} more</b> to earn the obsidian badge.`}</span>
        <div class="bh-bar"><i style="width:${pct}%"></i></div></div>`;
    return r;
  };
}

// ======================= refresh keeps your place =======================
// What you're looking at is remembered for this tab, so a refresh (or the app reloading after an
// update) brings you back to the same channel, DM, group or page instead of Friends.
(() => {
  const KEY = 'zuno_last_view';
  const snap = () => {
    const v = state.view || {};
    if (v.type === 'channel' || v.type === 'voice') return { type: 'channel', serverId: v.serverId, channelId: v.channelId, voice: v.type === 'voice' || !!v.voice };
    if (v.type === 'dm') return { type: 'dm', peerId: v.peerId };
    if (v.type === 'group') return { type: 'group', groupId: v.groupId };
    if (['friends', 'requests', 'discover'].includes(v.type)) return { type: v.type, tab: v.tab };
    return null;
  };
  let last = '';
  const keep = () => {
    if (!state.me) return;
    const s = JSON.stringify(snap());
    if (s !== last && s !== 'null') { last = s; try { sessionStorage.setItem(KEY, s); } catch {} }
  };
  setInterval(keep, 800);
  addEventListener('pagehide', keep);

  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch {}
  // Opening something on purpose (a notification, a profile link, a sign-in handoff) wins.
  if (!saved || /[?&](open|profile)=/.test(location.search) || location.hash.includes('handoff')) return;
  const t0 = Date.now();
  const tick = setInterval(() => {
    if (Date.now() - t0 > 15e3) return clearInterval(tick);
    if (!state.me || !state.servers || $('#app')?.classList.contains('hidden')) return;
    clearInterval(tick);
    // Wait for the app's own first view (Friends) to be drawn, then move to where you were.
    setTimeout(() => {
      if (state.view.type !== 'friends') return; // something else already took over
      const v = saved;
      try {
        if (v.type === 'channel') {
          const sv = state.servers.find(s => s.id === v.serverId);
          const ch = sv?.channels.find(c => c.id === v.channelId);
          if (!sv) return;
          // Never rejoin a call by itself: a voice channel reopens as its chat.
          if (ch) return openChannel(sv.id, ch.id, ch.type === 'voice' ? { chat: true } : {});
          return openServer(sv.id);
        }
        if (v.type === 'dm' && v.peerId) return openDM(v.peerId);
        if (v.type === 'group' && v.groupId && typeof openGroup === 'function' && (state.groups || []).some(g => g.id === v.groupId)) return openGroup(v.groupId);
        if (v.type === 'discover' && typeof showDiscover === 'function') return showDiscover();
        if (v.type === 'requests' && typeof showRequests === 'function') return showRequests(v.tab);
        if (v.type === 'friends' && v.tab && v.tab !== state.view.tab) return showFriends(v.tab);
      } catch {}
    }, 150);
  }, 120);
})();

// ======================= image viewer that actually zooms =======================
// Opens the picture as big as the screen allows (small ones too, up to 3×), then: click to zoom in
// where you clicked, scroll or pinch to zoom, drag to look around, double-click or 0 to reset,
// click outside the picture or press Esc to close.
openLightbox = function (src, name = '') {
  const ov = openLayer(`<div class="lb33 modal" tabindex="-1">
    <div class="lb33-stage"><img class="lb33-img" src="${esc(src)}" alt="${esc(name)}" draggable="false"></div>
    <div class="lb33-bar">
      <span class="lb33-name">${esc(name)}</span>
      <button class="lb33-btn" data-z="-1" title="Zoom out (−)">−</button><span class="lb33-pct">100%</span><button class="lb33-btn" data-z="1" title="Zoom in (+)">+</button>
      <button class="lb33-btn" data-z="0" title="Fit to screen (0)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      <a class="lb33-btn" href="${esc(src)}" target="_blank" rel="noopener" title="Open original"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>
      <a class="lb33-btn lb33-save" href="${esc(src)}" download="${esc(name)}">${ICON.download}<span>Save</span></a>
      <button class="lb33-btn" data-x title="Close (Esc)">✕</button>
    </div></div>`);
  const box = $('.lb33', ov), stage = $('.lb33-stage', ov), img = $('.lb33-img', ov), pct = $('.lb33-pct', ov);
  ov.classList.add('lb33-ov');
  let fit = 1, z = 1, x = 0, y = 0;
  const MAX = 8;
  const draw = (smooth = true) => {
    img.style.transition = smooth ? 'transform .18s ease' : 'none';
    img.style.transform = `translate(${x}px, ${y}px) scale(${fit * z})`;
    pct.textContent = Math.round(fit * z * 100) + '%';
    box.classList.toggle('zoomed', z > 1.01);
  };
  const clamp = () => {
    const w = img.naturalWidth * fit * z, h = img.naturalHeight * fit * z, r = stage.getBoundingClientRect();
    const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
    x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
  };
  const measure = () => {
    if (!img.naturalWidth) return;
    const r = stage.getBoundingClientRect();
    fit = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight, 3);
    img.style.width = img.naturalWidth + 'px'; img.style.height = img.naturalHeight + 'px';
    clamp(); draw(false);
  };
  // Zoom toward a point on screen (where you clicked or scrolled), keeping it under the cursor.
  const zoomAt = (nz, cx, cy, smooth = true) => {
    nz = Math.max(1, Math.min(Math.max(1, MAX / Math.max(fit, .01)), nz)); // up to 8× the real pixels
    const r = stage.getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    x = ox - (ox - x) * (nz / z); y = oy - (oy - y) * (nz / z); z = nz;
    if (z <= 1.01) { z = 1; x = 0; y = 0; }
    clamp(); draw(smooth);
  };
  const center = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  img.complete ? measure() : img.addEventListener('load', measure, { once: true });
  const onResize = () => measure();
  addEventListener('resize', onResize);

  let drag = null, moved = false;
  const pts = new Map();
  stage.addEventListener('pointerdown', e => {
    if (e.target !== img) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    img.setPointerCapture(e.pointerId);
    moved = false;
    drag = pts.size === 1 ? { sx: e.clientX, sy: e.clientY, x, y } : null;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; drag = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; }
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (drag?.pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      moved = true;
      zoomAt(drag.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false);
    } else if (drag && !drag.pinch && z > 1) {
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) moved = true;
      x = drag.x + e.clientX - drag.sx; y = drag.y + e.clientY - drag.sy; clamp(); draw(false);
    }
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  img.addEventListener('click', e => { if (moved) return; z > 1 ? zoomAt(1, e.clientX, e.clientY) : zoomAt(2.5, e.clientX, e.clientY); });
  img.addEventListener('dblclick', e => { e.preventDefault(); zoomAt(1, ...center()); });
  stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)), e.clientX, e.clientY, false); }, { passive: false });
  // Clicking the dark area around the picture closes it.
  stage.addEventListener('click', e => { if (e.target === stage) dismissLayer(); });
  $$('[data-z]', ov).forEach(b => b.addEventListener('click', () => { const d = +b.dataset.z; d ? zoomAt(z * (d > 0 ? 1.5 : 1 / 1.5), ...center()) : zoomAt(1, ...center()); }));
  $('[data-x]', ov).addEventListener('click', dismissLayer);
  const keys = e => {
    if (!document.body.contains(box)) { removeEventListener('keydown', keys); removeEventListener('resize', onResize); return; }
    if (e.key === '+' || e.key === '=') zoomAt(z * 1.5, ...center());
    else if (e.key === '-') zoomAt(z / 1.5, ...center());
    else if (e.key === '0') zoomAt(1, ...center());
  };
  addEventListener('keydown', keys);
  box.focus?.();
};

// ======================= dragging a server drags the server =======================
// Server pictures are <img>s, which the browser drags on its own, so grabbing a server by its
// picture dragged the image file. Pictures in the rail can't be dragged now, and the drag shows the
// whole server tile.
document.addEventListener('dragstart', e => {
  const item = e.target.closest?.('#server-rail [data-drag]');
  if (!item) return;
  if (e.target.tagName === 'IMG' && e.target !== item) {
    // Re-start it from the tile: the image's own drag (and its file) never begins.
    e.preventDefault();
    return;
  }
  try {
    const btn = item.querySelector('.rail-btn') || item;
    const r = btn.getBoundingClientRect();
    e.dataTransfer.setDragImage(btn, r.width / 2, r.height / 2);
    e.dataTransfer.clearData?.('text/uri-list'); e.dataTransfer.clearData?.('text/html');
  } catch {}
}, true);
const railImgs = () => $$('#server-rail img').forEach(i => { if (i.draggable !== false || i.getAttribute('draggable') !== 'false') i.setAttribute('draggable', 'false'); });
new MutationObserver(railImgs).observe(document.getElementById('server-rail') || document.body, { childList: true, subtree: true });
railImgs();

// ======================= asking for a bit of text =======================
// The browser's prompt() box doesn't exist in the desktop app (Electron), so anything that used it
// silently did nothing there: staff deleting a Community creation, moderation reasons, naming a
// passkey, adding a link. This is Zuno's own box, and it works everywhere, even over Settings.
// Resolves to the text (maybe empty), or null when cancelled.
function askText(title, { desc = '', value = '', placeholder = '', ok = 'OK', danger = false, required = false, multiline = false, max = 300 } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask33';
    wrap.innerHTML = `<div class="ask33-card" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${desc ? `<p class="muted">${esc(desc)}</p>` : ''}
      ${multiline ? `<textarea class="input" rows="3" maxlength="${max}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(value)}">`}
      <div class="ask33-acts"><button class="btn btn-grey" data-no>Cancel</button><button class="btn ${danger ? 'btn-red' : 'btn-primary'}" data-ok>${esc(ok)}</button></div></div>`;
    ($('#layer') || document.body).appendChild(wrap);
    const field = $('input, textarea', wrap), okBtn = $('[data-ok]', wrap);
    const sync = () => { okBtn.disabled = required && !field.value.trim(); };
    const done = v => { removeEventListener('keydown', keys, true); wrap.remove(); resolve(v); };
    const keys = e => {
      // (0.38.3) If the box was closed some other way (its window closed under it), stop listening
      // and do nothing: it used to keep catching Enter everywhere, so messages wouldn't send.
      if (!wrap.isConnected) { removeEventListener('keydown', keys, true); resolve(null); return; }
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(null); }
      else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey) && !okBtn.disabled) { e.preventDefault(); done(field.value.trim()); }
    };
    addEventListener('keydown', keys, true);
    field.addEventListener('input', sync); sync();
    $('[data-no]', wrap).addEventListener('click', () => done(null));
    okBtn.addEventListener('click', () => done(field.value.trim()));
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) done(null); });
    setTimeout(() => { field.focus(); field.select?.(); }, 20);
  });
}
