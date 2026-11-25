'use strict';
// Zuno 0.20: sending from phones, GIFs you upload work like any other GIF, GIF avatars and banners.

// ======================= sending from a phone =======================
// On a phone the message box had eight buttons squeezed around it and no send button (and iOS's
// Return key adds a new line while autocorrect is busy). Now there's a send button, and the extra
// buttons (poll, schedule, stickers) live in the + menu.
const phoneComposer = () => matchMedia('(max-width: 760px)').matches;
function sendFromComposer() {
  const ta = $('#composer-input');
  if (!ta) return;
  // The box's own Enter handling does the sending (drafts, uploads, replies and all).
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  updateSendButton();
}
function updateSendButton() {
  const b = $('#composer-send'), ta = $('#composer-input'), conv = activeConv();
  if (!b || !ta) return;
  const ready = !!ta.value.trim() || (state.uploads?.[conv] || []).some(u => u.id);
  b.classList.toggle('ready', ready);
  b.closest('.composer-box')?.classList.toggle('has-text', ready);
}
const _renderComposer20 = renderComposer;
renderComposer = function (...a) {
  const r = _renderComposer20(...a);
  const box = $('#composer .composer-box'), ta = $('#composer-input');
  if (box && ta && !$('#composer-send', box)) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'composer-send'; b.className = 'composer-send'; b.title = 'Send'; b.setAttribute('aria-label', 'Send message');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>';
    box.appendChild(b);
    // Keep the keyboard open: don't let the tap take focus away from the message box.
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', sendFromComposer);
    ta.addEventListener('input', updateSendButton);
    ta.addEventListener('keyup', updateSendButton);
  }
  updateSendButton();
  return r;
};
const _renderComposerExtras20 = renderComposerExtras;
renderComposerExtras = function (...a) { const r = _renderComposerExtras20(...a); updateSendButton(); return r; };
// The + button on a phone opens your photos and videos straight away. Everything else (camera,
// other files, polls, scheduling, stickers) is under the ⋯ button next to it.
function pickMedia(capture = false) {
  const conv = activeConv();
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*,video/*'; input.multiple = !capture;
  if (capture) input.setAttribute('capture', 'environment'); // opens the camera: take a photo or record a video
  input.addEventListener('change', () => { if (input.files.length && conv) addFiles(conv, [...input.files]); });
  input.click();
}
document.addEventListener('click', e => {
  const plus = e.target.closest('#composer-plus');
  if (!plus || !phoneComposer()) return;
  e.stopImmediatePropagation(); e.preventDefault();
  pickMedia();
}, true);
function composerMoreMenu(anchor) {
  const conv = activeConv(), box = anchor.closest('.composer-box');
  const items = [
    { label: 'Camera', desc: 'Take a photo or record a video', icon: '<span class="mi-ico">📷</span>', run: () => pickMedia(true) },
    { label: 'Photos & Videos', icon: '<span class="mi-ico">🖼️</span>', run: () => pickMedia() },
    { label: 'Upload a File', icon: '<span class="mi-ico">📎</span>', run: () => $('#composer-file')?.click() },
  ];
  if ($('#composer-poll', box)) items.push({ label: 'Create a Poll', icon: '<span class="mi-ico">📊</span>', run: () => $('#composer-poll', box).click() });
  if ($('#composer-sched', box)) items.push({ label: 'Schedule a Message', icon: '<span class="mi-ico">🕒</span>', run: () => $('#composer-sched', box).click() });
  if ($('#composer-time45', box)) items.push({ label: 'Insert a time', icon: '<span class="mi-ico">📅</span>', run: () => $('#composer-time45', box).click() });
  if ($('.composer-gif', box) && getComputedStyle($('.composer-gif', box)).display === 'none') items.push({ label: 'GIFs', icon: '<span class="mi-ico">🎞️</span>', run: () => $('.composer-gif', box).click() });
  if ($('#composer-sticker', box) && typeof openStickerPicker === 'function') items.push({ label: 'Stickers', icon: '<span class="mi-ico">🌟</span>', run: () => openStickerPicker(anchor, s => sendSticker(conv, s)) });
  openMenu(anchor, items);
}
const _renderComposer20m = renderComposer;
renderComposer = function (...a) {
  const r = _renderComposer20m(...a);
  const plus = $('#composer-plus');
  if (plus && !$('#composer-more')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'composer-more'; b.className = 'composer-more'; b.title = 'More'; b.setAttribute('aria-label', 'Camera, files, polls and more'); b.textContent = '⋯';
    plus.after(b);
    b.addEventListener('click', () => composerMoreMenu(b));
  }
  return r;
};

// ======================= uploaded GIFs are real GIFs =======================
// A GIF someone uploads gets the GIF tag and a ★, so you can favorite it and send it again from
// the GIF picker, like any other GIF.
function decorateUploadedGifs() {
  for (const img of $$('#messages img.att-img[data-full$=".gif"]')) {
    const box = img.closest('.msg-media, .gal-item') || img.parentElement;
    if (!box || $('.gif-fav', box)) continue;
    const g = () => ({ url: img.dataset.full, preview: img.dataset.full, w: img.naturalWidth || 0, h: img.naturalHeight || 0, title: (img.dataset.name || '').replace(/\.gif$/i, '') });
    box.classList.add('is-gif');
    box.insertAdjacentHTML('beforeend', `<span class="gif-tag">GIF</span><button class="gif-fav${isFavGif(img.dataset.full) ? ' on' : ''}" data-fav-gif="${esc(JSON.stringify(g()))}" title="Favorite this GIF">★</button>`);
    if (!img.complete) img.addEventListener('load', () => { const b = $('.gif-fav', box); if (b) b.dataset.favGif = JSON.stringify(g()); }, { once: true });
  }
}
const _renderMessages20 = renderMessages;
renderMessages = function (...a) { const r = _renderMessages20(...a); decorateUploadedGifs(); return r; };

// ======================= avatar & banner: Browse Files or Choose A Gif =======================
async function gifToProfile(kind, g) {
  const status = kind === 'banner' ? $('#banner-status') : null;
  if (status) status.textContent = 'Saving…';
  try {
    const r = await api('POST', '/api/me/gif-media', { kind, url: g.url, preview: g.preview });
    if (kind === 'banner') {
      state.me = r.me; state.users[r.me.id] = r.me;
      toast('Profile banner updated!');
      if ($('#settings-body')) showSettingsSection('profile');
    } else if (settingsDraft) {
      settingsDraft.avatar = r.url;
      $('#profile-form [name=displayName]')?.dispatchEvent(new Event('input', { bubbles: true })); // redraws the preview and shows Save Changes
      toast('Looking good! Press Save Changes to keep it.');
    }
  } catch (e) { toast(e.message, true); if (status) status.textContent = ''; }
}
// A small menu that floats over Settings (the usual menu would close Settings when it opens).
function pickMenu(anchor, items) {
  $('#pick-menu')?.remove();
  const m = document.createElement('div');
  m.id = 'pick-menu'; m.className = 'menu pick-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => `<button data-i="${i}" role="menuitem">${it.icon || ''}<span>${esc(it.label)}${it.desc ? `<span class="desc">${esc(it.desc)}</span>` : ''}</span></button>`).join('');
  $('#layer').appendChild(m);
  const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.top = Math.max(8, r.bottom + 6 + mr.height > innerHeight - 8 ? r.top - mr.height - 6 : r.bottom + 6) + 'px';
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mr.width - 8)) + 'px';
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc_, true); };
  const outside = e => { if (!m.contains(e.target)) close(); };
  const esc_ = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc_, true); });
  $$('[data-i]', m).forEach(btn => btn.addEventListener('click', () => { close(); items[btn.dataset.i].run(); }));
  $('[data-i]', m)?.focus();
}
document.addEventListener('click', e => {
  const b = e.target.closest('#avatar-change, #banner-upload');
  if (!b || !b.closest('#settings-body')) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const kind = b.id === 'avatar-change' ? 'avatar' : 'banner';
  pickMenu(b, [
    { label: 'Browse Files', desc: kind === 'avatar' ? 'A picture or GIF from your device' : `PNG, JPG, WebP or GIF up to ${mb(limits().banner)}`, icon: '<span class="mi-ico">📁</span>', run: () => $(kind === 'avatar' ? '#avatar-file' : '#banner-file')?.click() },
    { label: 'Choose A Gif', desc: 'From your favorites, or search for one', icon: '<span class="mi-ico">✨</span>', run: () => openGifPicker(b, g => gifToProfile(kind, g), { tab: 'favs', title: kind === 'avatar' ? 'Pick a GIF for your avatar' : 'Pick a GIF for your banner' }) },
  ]);
}, true);
// The "Put Zuno on your home screen" hint tucks itself away after a while (it comes back next time).
new MutationObserver(() => {
  const bar = $('#install-bar');
  if (bar && !bar.dataset.timer) bar.dataset.timer = setTimeout(() => bar.remove(), 20000);
}).observe(document.body, { childList: true });
