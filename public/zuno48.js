'use strict';
// Zuno 0.48: a cleaner, smoother phone app; pictures and videos that load faster; and a few
// touches borrowed from big desktop chat apps (the server rail pill, roomier lists).

// The window width, remembered (asking for it often is surprisingly slow while the page is changing).
const isPhone48 = () => VW <= 760;

// ======================= chat list previews =======================
// The last message in each chat ("You: see you soon", "📷 Photo"), kept up to date as messages arrive.
function messagePreview48(m) {
  if (!m) return null;
  let text = '';
  if (m.e2e) text = 'Encrypted message';
  else if (m.call) text = m.call.video ? '📹 Video call' : '📞 Call';
  else if (m.content) text = String(m.content).replace(/```[\s\S]*?```/g, '[code]').replace(/<:([a-z0-9_]{2,32}):[^>]+>/gi, ':$1:').replace(/^-#\s+|^#{1,3}\s+|[*_~`>|]{1,3}/gm, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  else if (m.sticker) text = '🏷️ Sticker';
  else if (m.gif) text = 'GIF';
  else if (m.poll) text = '📊 Poll';
  else if (m.attachments?.length) { const k = m.attachments[0].kind; text = k === 'image' ? '📷 Photo' : k === 'video' ? '🎬 Video' : k === 'voice' ? '🎤 Voice message' : '📎 File'; }
  else if (m.forward) text = '↪ Forwarded message';
  return { text, mine: m.authorId === state.me?.id, by: m.authorId };
}
// "now", "5m", "3h", "2d", then a date.
function shortAgo48(t) {
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 7 * 86400) return Math.floor(s / 86400) + 'd';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const _renderDMList48 = renderDMList;
renderDMList = function (...a) {
  const r = _renderDMList48(...a);
  for (const row of $$('#dm-list .dm-item[data-conv]')) {
    const conv = row.dataset.conv;
    const g = conv.startsWith('g:') ? state.groups.find(x => 'g:' + x.id === conv) : null;
    const e = g || state.dms.find(x => x.userId === conv);
    if (!e) continue;
    const meta = $('.meta', row);
    if (!meta || $('.dm-prev48', meta)) continue;
    const last = e.last;
    // Someone's game or status (if they have one) beats the preview, like big chat apps do.
    if (last?.text && !$('.sub', meta)) {
      const who = last.mine ? 'You: ' : g && last.by ? `${user(last.by)?.displayName || 'Someone'}: ` : '';
      meta.insertAdjacentHTML('beforeend', `<div class="dm-prev48${e.unread ? ' unread' : ''}">${esc(who + last.text)}</div>`);
    }
    if (e.lastMessageAt) row.insertAdjacentHTML('beforeend', `<span class="dm-time48">${esc(shortAgo48(e.lastMessageAt))}</span>`);
  }
  updateBackBadge48();
  return r;
};
setInterval(() => { if (isPhone48() && $('#app.show-nav')) renderDMList(); }, 60e3);

// ======================= phone: the chat's top bar =======================
// A back arrow (with how many unread chats you have), the name with a ›, and call, video and
// search right there. Everything else stays under ⋯.
const BACK48 = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M20 12H5m6-7-7 7 7 7"/></svg>';
function updateBackBadge48() {
  const btn = $('#main .topbar [data-act=nav]');
  if (!btn) return;
  if (!btn.dataset.back48) { btn.dataset.back48 = '1'; btn.classList.add('back48'); btn.insertAdjacentHTML('afterbegin', `<span class="back48-ic">${BACK48}</span>`); btn.title = 'Back'; }
  const n = state.dms.reduce((t, x) => t + (x.unread ? 1 : 0), 0) + (state.groups || []).reduce((t, x) => t + (x.unread ? 1 : 0), 0);
  let b = $('.back48-n', btn);
  if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement('b'); b.className = 'back48-n'; btn.appendChild(b); }
  b.textContent = n > 99 ? '99+' : n;
}
const _compactTopbar48 = compactTopbar;
compactTopbar = function (...a) {
  const r = _compactTopbar48(...a);
  const bar = $('#main .topbar');
  if (bar) {
    const phone = isPhone48();
    for (const id of ['call-voice', 'call-video']) $('#' + id, bar)?.classList.toggle('tb-ovf', false);
    // Notifications have their own tab at the bottom on phones.
    $('#inbox-btn', bar)?.classList.toggle('tb-ovf', phone);
    bar.classList.toggle('tb48', phone);
    updateBackBadge48();
  }
  return r;
};

// ======================= phone: the message menu =======================
// Big reaction tiles, a hint about double-tap, and the actions in rounded groups.
const groupSheet48 = menu => {
  if (menu.dataset.g48) return;
  menu.dataset.g48 = '1';
  const qr = $('.quick-react', menu);
  if (qr && !$('.dt48', menu)) qr.insertAdjacentHTML('afterend', '<div class="dt48">Double-tap a message to react ❤️</div>');
  const btns = [...menu.children].filter(el => el.tagName === 'BUTTON');
  if (btns.length < 2) return;
  $$(':scope > .sep', menu).forEach(s => s.remove());
  const danger = btns.filter(b => b.classList.contains('danger') || /delete|report/i.test(b.textContent));
  const normal = btns.filter(b => !danger.includes(b));
  const groups = [normal.slice(0, 3), normal.slice(3), danger].filter(g => g.length);
  for (const g of groups) {
    const box = document.createElement('div');
    box.className = 'sh48' + (g === danger ? ' danger48' : '');
    g[0].before(box);
    box.append(...g);
  }
};
new MutationObserver(() => {
  if (!isPhone48()) return;
  for (const m of $$('#layer .menu.msg-menu')) groupSheet48(m);
}).observe(document.getElementById('layer') || document.body, { childList: true, subtree: true });

// ======================= phone: double-tap a message to ❤️ it =======================
{
  let last = { id: null, at: 0 };
  document.addEventListener('touchend', e => {
    if (!isPhone48() || e.touches.length) return;
    const row = e.target.closest?.('#messages .msg[data-id]');
    if (!row || e.target.closest('a, button, video, img, input, textarea, .reactions, .msg-media')) { last = { id: null, at: 0 }; return; }
    const now = Date.now();
    if (last.id === row.dataset.id && now - last.at < 320) {
      last = { id: null, at: 0 };
      e.preventDefault();
      const btn = $(`.qr38[data-qr="❤️"][data-qr-msg="${CSS.escape(row.dataset.id)}"]`, row);
      if (!btn) return;
      // Already ❤️'d it: leave it (a double-tap only ever adds the heart).
      const mine = [...$$('.reactions .rx.on[data-rx]', row)].some(x => /^❤/.test(x.dataset.rx));
      if (!mine) btn.click();
      const pop = document.createElement('span');
      pop.className = 'heart48';
      pop.textContent = '❤️';
      const r = row.getBoundingClientRect(), x = e.changedTouches[0];
      pop.style.left = (x.clientX - r.left) + 'px'; pop.style.top = (x.clientY - r.top) + 'px';
      row.appendChild(pop);
      setTimeout(() => pop.remove(), 700);
      navigator.vibrate?.(8);
    } else last = { id: row.dataset.id, at: now };
  }, { passive: false });
}

// ======================= faster pictures and videos =======================
// Pictures start with their small preview (not the full file), at the right size, over a tiny
// blurry placeholder, and fade in. Videos show a still picture and only download when played.
function mediaAttrs48(a) {
  const dims = a.w && a.h ? ` width="${a.w}" height="${a.h}" style="aspect-ratio:${a.w} / ${a.h}"` : '';
  return dims + ' decoding="async"';
}
const _mediaHtml48 = mediaHtml;
mediaHtml = function (m) {
  let html = _mediaHtml48(m);
  for (const a of m.attachments || []) {
    if (a.kind === 'image') {
      const from = `<div class="msg-media"><img class="att-img" src="${esc(a.url)}"`;
      const ph = a.ph ? ` style="--ph48:url('${a.ph}')"` : '';
      html = html.replace(from, `<div class="msg-media ld48${a.ph ? ' ph48' : ''}"${ph}><img class="att-img" src="${esc(a.thumb || a.url)}"${mediaAttrs48(a)}`);
    }
  }
  return html;
};
const _galleryHtml48 = typeof galleryHtml === 'function' ? galleryHtml : null;
if (_galleryHtml48) galleryHtml = function (imgs, msgId) {
  let html = _galleryHtml48(imgs, msgId);
  for (const a of imgs) if (a.thumb) html = html.replace(`<img src="${esc(a.url)}"`, `<img src="${esc(a.thumb)}" decoding="async"`);
  return html;
};
const _videoHtml48 = videoHtml;
videoHtml = function (a) {
  let html = _videoHtml48(a);
  if (a.thumb) html = html.replace('preload="metadata"', `preload="none" poster="${esc(a.thumb)}"`).replace('#t=0.1"', '"');
  if (a.w && a.h) html = html.replace('<video ', `<video style="aspect-ratio:${a.w} / ${a.h}" `);
  return html;
};
// Fade pictures in once they've arrived.
document.addEventListener('load', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.closest?.('.msg-media.ld48')) img.closest('.msg-media').classList.add('in48');
}, true);

// When you send a video: its first frame becomes the still picture people see, and every picture
// or video gets a tiny blurry placeholder (a few hundred bytes).
async function tinyPlaceholder48(source, w, h) {
  try {
    const c = document.createElement('canvas');
    const s = 16 / Math.max(w, h);
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/webp', 0.5);
    return url.startsWith('data:image/webp') && url.length < 1400 ? url : null;
  } catch { return null; }
}
async function videoPoster48(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 8000); });
    v.currentTime = Math.min(0.5, (v.duration || 1) / 4);
    await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 3000); });
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return null;
    const s = Math.min(1, 640 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.75));
    return { blob, w, h, ph: await tinyPlaceholder48(v, w, h) };
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
const _uploadFile48 = uploadFile;
uploadFile = async function (f) {
  const a = await _uploadFile48(f);
  try {
    const send = (body, w, h, ph) => fetch(`/api/attachments/${a.id}/thumb`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'X-Width': w, 'X-Height': h, ...(ph ? { 'X-Placeholder': ph } : {}), 'Content-Type': 'application/octet-stream' }, body }).then(r => r.json());
    if (a?.kind === 'video' && f.type?.startsWith('video/')) {
      const p = await videoPoster48(f);
      if (p?.blob) { const d = await send(p.blob, p.w, p.h, p.ph); if (d.thumb) Object.assign(a, { thumb: d.thumb, w: p.w, h: p.h, ph: p.ph }); }
    } else if (a?.kind === 'image' && a.w && a.h && f.type !== 'image/gif') {
      const bmp = await createImageBitmap(f);
      const ph = await tinyPlaceholder48(bmp, bmp.width, bmp.height);
      bmp.close?.();
      if (ph) { await send(new Blob([]), a.w, a.h, ph); a.ph = ph; }
    }
  } catch {}
  return a;
};

// ======================= phone: line icons in the bottom tabs =======================
{
  const IC = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z"/></svg>',
    servers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  };
  const fix = () => {
    for (const b of $$('.tabbar38 button[data-tb]')) {
      const ic = IC[b.dataset.tb], span = b.firstElementChild;
      if (ic && span && !span.dataset.ic48) { span.dataset.ic48 = '1'; span.innerHTML = ic; }
    }
  };
  new MutationObserver(fix).observe(document.body, { childList: true });
  setTimeout(fix, 0);
}

// ======================= desktop: "Active Now" next to your friends =======================
// Friends who are playing something or listening to music, with a button to message them.
// Only on wide screens, where there's room for it.
const _renderFriendsBody48 = renderFriendsBody;
renderFriendsBody = function (...a) {
  const r = _renderFriendsBody48(...a);
  const row = $('#main .body-row');
  if (!row || state.view?.type !== 'friends') return r;
  let side = $('.active48', row);
  if (!side) { side = document.createElement('aside'); side.className = 'active48'; row.appendChild(side); }
  const busy = state.friends.map(id => user(id)).filter(u => u && u.activity && u.status !== 'offline');
  side.innerHTML = `<h3>Active Now</h3>${busy.length ? busy.map(u => `<button class="an48-card" data-an48="${esc(u.id)}">
      <span class="an48-who">${avatar(u, 32, true)}<span><b>${esc(u.displayName)}</b><small>${activityLine(u)}</small></span></span></button>`).join('')
    : '<div class="an48-empty"><b>It\'s quiet for now</b><span>When a friend starts playing a game or listening to music, they\'ll show up here.</span></div>'}`;
  $$('[data-an48]', side).forEach(b => b.addEventListener('click', () => openDM(b.dataset.an48)));
  return r;
};
