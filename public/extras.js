'use strict';
// Zuno extras: GIFs, file uploads, replies, mentions, the "new" divider, bug reports,
// more badges, and the screen that keeps everyone on the same version.

const fmtSize = n => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const MAX_UPLOAD = 1_000_000;

// ======================= more badges =======================
Object.assign(BADGE_INFO, {
  bughunter: {
    label: 'Bug Hunter', desc: 'Found a bug the Zuno team confirmed',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgBug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b892ff"/><stop offset="1" stop-color="#6d3fe0"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bgBug)"/>
      <ellipse cx="12" cy="13.6" rx="3.6" ry="4.4" fill="#f4eeff"/><circle cx="12" cy="8.4" r="2.2" fill="#f4eeff"/>
      <path d="M12 9.6v8.2" stroke="#6d3fe0" stroke-width="1"/>
      <path d="M8.4 11.6 6 10.4M8.2 14.2H5.6M8.6 16.6 6.4 18M15.6 11.6l2.4-1.2M15.8 14.2h2.6M15.4 16.6l2.2 1.4M10.8 6.6 9.6 5M13.2 6.6 14.4 5" stroke="#f4eeff" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  },
  founder: {
    label: 'Server Founder', desc: 'Started their own Zuno server',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgFounder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8ff"/><stop offset="1" stop-color="#1f7fd6"/></linearGradient></defs>
      <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="6.5" fill="url(#bgFounder)"/>
      <path d="M6 18.2V10l2 1.4V9l2 1.4V8l2-1.6L14 8v2.4L16 9v2.4l2-1.4v8.2z" fill="#eaf6ff"/>
      <path d="M12 6.4V3.4l3 1.2-3 1.1" fill="#ffd166"/><rect x="10.6" y="14.2" width="2.8" height="4" rx="1.2" fill="#1f7fd6"/></svg>`,
  },
  chatterbox: {
    label: 'Chatterbox', desc: 'Sent 500 messages on Zuno',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgChat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb37a"/><stop offset="1" stop-color="#f06a2a"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bgChat)"/>
      <path d="M5.4 7.2h9a1.6 1.6 0 0 1 1.6 1.6v4.6a1.6 1.6 0 0 1-1.6 1.6H9.6l-2.8 2.2V15h-1.4a1.6 1.6 0 0 1-1.6-1.6V8.8a1.6 1.6 0 0 1 1.6-1.6z" fill="#fff4ea"/>
      <path d="M17.2 10.2h1.4a1.6 1.6 0 0 1 1.6 1.6v3.4a1.6 1.6 0 0 1-1.6 1.6h-.6v1.8l-2.4-1.8h-2.4" fill="none" stroke="#fff4ea" stroke-width="1.3" stroke-linejoin="round"/>
      <circle cx="7.6" cy="11.1" r=".95" fill="#f06a2a"/><circle cx="10" cy="11.1" r=".95" fill="#f06a2a"/><circle cx="12.4" cy="11.1" r=".95" fill="#f06a2a"/></svg>`,
  },
  social: {
    label: 'Social Butterfly', desc: 'Has 10 or more friends on Zuno',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgSocial" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9fd2"/><stop offset="1" stop-color="#e2448f"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bgSocial)"/>
      <path d="M11.6 11.4C9.6 7 5.4 6.4 5.2 9c-.2 2.4 2.6 3.4 6.4 2.4zm.8 0c2-4.4 6.2-5 6.4-2.4.2 2.4-2.6 3.4-6.4 2.4zm-.8 1C8.4 12 6.8 13.6 7.8 15.6c1 1.8 3.2.6 3.8-3.2zm.8 0c3.2-.4 4.8 1.2 3.8 3.2-1 1.8-3.2.6-3.8-3.2z" fill="#fff0f8"/>
      <path d="M12 9.4v7.4M12 9.4 10.8 7.2M12 9.4l1.2-2.2" stroke="#9c2463" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  },
  voice: {
    label: 'Voice Veteran', desc: 'Spent 10 hours talking in voice',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgVoice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe39a"/><stop offset="1" stop-color="#1f9d55"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bgVoice)"/>
      <rect x="9.6" y="5.4" width="4.8" height="8.4" rx="2.4" fill="#effff5"/>
      <path d="M7.4 11.4a4.6 4.6 0 0 0 9.2 0M12 16v2.6M9.4 18.6h5.2" stroke="#effff5" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
  },
});

// ======================= replies =======================
function replyRefHtml(r) {
  const u = user(r.authorId) || { id: r.authorId, displayName: 'Someone' };
  return `<button class="reply-ref" data-jump="${esc(r.id)}" title="Jump to the message">
    <span class="reply-curve"></span>${avatar(u, 16)}<b>${esc(u.displayName)}</b><span class="reply-snip">${esc((r.snippet || 'Click to see the message').replace(/\|\|[\s\S]*?\|\|/g, '▒▒▒▒'))}</span></button>`;
}
function startReply(id) {
  const conv = activeConv();
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m) return;
  state.replyTo = { conv, id: m.id, authorId: m.authorId, snippet: (m.content || (m.gif ? 'GIF' : m.attachments ? 'Attachment' : '')).slice(0, 120) };
  renderComposerExtras();
  $('#composer-input')?.focus();
}
function clearReply() { state.replyTo = null; renderComposerExtras(); }
function jumpToMessage(id) {
  const row = $(`.msg[data-id="${CSS.escape(id)}"]`);
  if (!row) return toast("That message is further back. Load older messages to see it.");
  row.scrollIntoView({ behavior: motionOff() ? 'auto' : 'smooth', block: 'center' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}

// ======================= GIFs & attachments inside messages =======================
function mediaHtml(m) {
  let html = '';
  if (m.gif) {
    const w = Math.min(m.gif.w || 300, 320), h = m.gif.w ? Math.round((m.gif.h / m.gif.w) * w) : 200;
    html += `<div class="msg-media"><img class="msg-gif" src="${esc(m.gif.url)}" alt="${esc(m.gif.title || 'GIF')}" width="${w}" height="${h}" loading="lazy" data-full="${esc(m.gif.url)}" data-name="${esc(m.gif.title || 'GIF')}" data-gif="${esc(JSON.stringify(m.gif))}"><span class="gif-tag">GIF</span>
      <button class="gif-fav${isFavGif(m.gif.url) ? ' on' : ''}" data-fav-gif="${esc(JSON.stringify(m.gif))}" title="Favorite this GIF">★</button></div>`;
  }
  for (const a of m.attachments || []) {
    html += a.kind === 'image'
      ? `<div class="msg-media"><img class="att-img" src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy" data-full="${esc(a.url)}" data-name="${esc(a.name)}"></div>`
      : isVideoAtt(a) ? videoHtml(a)
      : `<a class="att-file" href="${esc(a.url)}" download="${esc(a.name)}" title="Download ${esc(a.name)}">
          <span class="att-ico">${ICON.file}</span><span class="att-meta"><b>${esc(a.name)}</b><small>${fileKind(a.name)} · ${fmtSize(a.size)}</small></span><span class="att-dl">${ICON.download}</span></a>`;
  }
  return html;
}

// Videos play right in the chat. (Ones sent before Zuno 0.21.1 were saved as plain files; ?play=1
// asks the server to stream those as video too.)
const VIDEO_NAME = /\.(mp4|m4v|mov|webm)$/i;
const isVideoAtt = a => a.kind === 'video' || (a.kind === 'file' && VIDEO_NAME.test(a.name || ''));
// What a file is, in words, for the file card ("PDF document", "ZIP archive"…).
const FILE_KINDS = { pdf: 'PDF document', zip: 'ZIP archive', rar: 'RAR archive', '7z': '7-Zip archive', txt: 'Text file', md: 'Text file', doc: 'Word document', docx: 'Word document', xls: 'Spreadsheet', xlsx: 'Spreadsheet', csv: 'Spreadsheet', ppt: 'Presentation', pptx: 'Presentation', mp3: 'Audio', wav: 'Audio', m4a: 'Audio', ogg: 'Audio', flac: 'Audio', exe: 'Program', apk: 'Android app', js: 'Code', py: 'Code', json: 'Code', html: 'Web page', psd: 'Photoshop file', heic: 'iPhone photo', svg: 'SVG image' };
function fileKind(name) { const ext = (String(name).split('.').pop() || '').toLowerCase(); return FILE_KINDS[ext] || (ext && ext !== name.toLowerCase() ? ext.toUpperCase() + ' file' : 'File'); }
function videoHtml(a) {
  const src = a.kind === 'video' ? a.url : a.url + (a.url.includes('?') ? '&' : '?') + 'play=1';
  return `<div class="msg-media msg-video"><video controls playsinline preload="metadata" src="${esc(src)}#t=0.1" aria-label="${esc(a.name)}"></video>
    <a class="vid-dl" href="${esc(a.url)}" download="${esc(a.name)}" title="Download ${esc(a.name)} (${fmtSize(a.size)})">${ICON.download}</a></div>`;
}

function openLightbox(src, name = '') {
  const ov = openLayer(`<div class="lightbox modal"><img src="${esc(src)}" alt="${esc(name)}">
    <div class="lb-bar"><span>${esc(name)}</span><a href="${esc(src)}" download="${esc(name)}" class="btn btn-grey btn-sm">${ICON.download} Save</a></div></div>`);
  $('img', ov).addEventListener('click', dismissLayer);
}

// ======================= "New" divider & jump to present =======================
state.lastUnread = {};
const _markRead = markRead;
markRead = function (conv) {
  // Remember how many were unread before clearing, so the divider can show where you left off.
  const count = isChannelConv(conv) ? currentChannel()?.unread : state.dms.find(x => x.userId === conv)?.unread;
  if (count) state.lastUnread[conv] = count;
  return _markRead(conv);
};
function rememberUnreadForDivider(conv) { if (state.convos[conv]?.loaded) placeDivider(conv); }
function placeDivider(conv) {
  const count = state.lastUnread[conv];
  const convo = state.convos[conv];
  delete state.lastUnread[conv];
  if (!count || !convo) return;
  let left = count;
  for (let i = convo.messages.length - 1; i >= 0; i--) {
    if (convo.messages[i].authorId === state.me.id) continue;
    if (--left === 0) { convo.dividerId = convo.messages[i].id; break; }
  }
}
function wireJumpToPresent(el) {
  const chat = el.closest('.chat');
  if (!chat || el.dataset.jumpWired) return;
  el.dataset.jumpWired = '1';
  const btn = document.createElement('button');
  btn.className = 'jump-present hidden';
  btn.innerHTML = `Jump to present ${ICON.chevron}`;
  chat.appendChild(btn);
  btn.addEventListener('click', () => el.scrollTo({ top: el.scrollHeight, behavior: motionOff() ? 'auto' : 'smooth' }));
  el.addEventListener('scroll', () => btn.classList.toggle('hidden', el.scrollHeight - el.scrollTop - el.clientHeight < 600));
}

// ======================= composer extras =======================
state.uploads = {}; // conv -> [{ key, name, size, kind, preview, id, url, error }]
const readyUploads = conv => (state.uploads[conv] || []).filter(u => u.id).map(u => ({ id: u.id, url: u.url, name: u.name, size: u.size, kind: u.kind }));
const uploadsBusy = conv => (state.uploads[conv] || []).some(u => !u.id && !u.error);
function clearUploads(conv) { delete state.uploads[conv]; renderComposerExtras(); }

function wireComposerExtras(conv, ta) {
  renderComposerExtras();
  updateCharCount(ta);
  const file = $('#composer-file');
  $('#composer-plus').addEventListener('click', () => file.click());
  file.addEventListener('change', () => { addFiles(conv, [...file.files]); file.value = ''; });
  $('#composer-gif').addEventListener('click', e => openGifPicker(e.currentTarget, gif => sendMessage(conv, '', { gif })));
  ta.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(conv, files); }
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Escape' && state.replyTo) { e.stopPropagation(); clearReply(); } });
  // Drag files anywhere onto the chat.
  const chat = $('.chat');
  if (chat && !chat.dataset.dropWired) {
    chat.dataset.dropWired = '1';
    let depth = 0;
    chat.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { depth++; chat.classList.add('dropping'); } });
    chat.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; chat.classList.remove('dropping'); } });
    chat.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    chat.addEventListener('drop', e => {
      e.preventDefault(); depth = 0; chat.classList.remove('dropping');
      const c = activeConv();
      if (c && $('#composer-input')) addFiles(c, [...e.dataTransfer.files]);
    });
  }
}

function addFiles(conv, files) {
  const list = state.uploads[conv] ||= [];
  for (const f of files) {
    const lim = limits();
    if (list.length >= lim.files) { toast(`You can attach up to ${lim.files} files at once.`, true); break; }
    if (f.size > lim.upload) { toast(`${f.name} is ${fmtSize(f.size)}. Files can be up to ${mb(lim.upload)}.${state.me.bloom ? '' : ' Zuno Bloom raises that to 50 MB.'}`, true); continue; }
    const item = { key: Math.random().toString(36).slice(2), name: f.name, size: f.size, kind: f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file' };
    if (item.kind !== 'file') item.preview = URL.createObjectURL(f);
    list.push(item);
    uploadFile(f).then(a => Object.assign(item, a)).catch(err => { item.error = err.message; toast(err.message, true); }).finally(renderComposerExtras);
  }
  renderComposerExtras();
}
async function uploadFile(f) {
  const res = await fetch('/api/attachments', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'X-File-Name': encodeURIComponent(f.name), 'Content-Type': 'application/octet-stream' }, body: f });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'That file could not be uploaded.');
  return d.attachment;
}

function renderComposerExtras() {
  const box = $('#composer-extras');
  const conv = activeConv();
  if (!box || !conv) return;
  const r = state.replyTo?.conv === conv ? state.replyTo : null;
  const ups = state.uploads[conv] || [];
  box.innerHTML = `${r ? `<div class="reply-bar">${ICON.reply}<span>Replying to <b>${esc(user(r.authorId)?.displayName || 'someone')}</b></span><button class="rb-x" title="Cancel reply">${ICON.x}</button></div>` : ''}
    ${ups.length ? `<div class="up-tray">${ups.map(u => `<div class="up-item${u.error ? ' err' : u.id ? '' : ' busy'}" data-key="${u.key}">
      ${u.preview ? (u.kind === 'video' ? `<video src="${u.preview}#t=0.1" muted playsinline preload="metadata"></video><span class="up-play">▶</span>` : `<img src="${u.preview}" alt="">`) : `<span class="up-ico">${ICON.file}</span>`}
      <span class="up-name">${esc(u.name)}</span><span class="up-size">${u.error ? 'Failed' : u.id ? fmtSize(u.size) : 'Uploading…'}</span>
      <button class="up-x" title="Remove">${ICON.x}</button></div>`).join('')}</div>` : ''}`;
  box.classList.toggle('on', !!(r || ups.length));
  $('.rb-x', box)?.addEventListener('click', clearReply);
  $$('.up-x', box).forEach(b => b.addEventListener('click', () => {
    const key = b.closest('.up-item').dataset.key;
    state.uploads[conv] = ups.filter(u => u.key !== key);
    renderComposerExtras();
  }));
}

function updateCharCount(ta) {
  let c = $('#char-count');
  const n = ta.value.length;
  const max = limits().message;
  if (n < max - 300) { c?.remove(); return; }
  if (!c) { c = document.createElement('span'); c.id = 'char-count'; ta.closest('.composer-box').appendChild(c); }
  c.textContent = max - n;
  c.classList.toggle('over', n >= max);
}

// Someone @mentioned you (or replied to you) in a server channel.
function notifyMention(conv, serverId, channelId, message) {
  if (state.me.statusPref === 'dnd') return;
  if (!document.hidden && activeConv() === conv) return;
  if (prefs().notificationSound) playPing();
  if (!('Notification' in window) || !prefs().desktopNotifications || Notification.permission !== 'granted') return;
  const sv = state.servers.find(s => s.id === serverId);
  const ch = sv?.channels.find(c => c.id === channelId);
  const a = user(message.authorId);
  const n = new Notification(`${a?.displayName || 'Someone'} (#${ch?.name || 'channel'}, ${sv?.name || 'server'})`, { body: (message.content || 'Sent a GIF').slice(0, 200), icon: sv?.icon || a?.avatar || '/logo.png', badge: '/icon-192.png', tag: 'ch:' + channelId });
  n.onclick = () => { window.zunoDesktop?.focus(); window.focus(); openChannel(serverId, channelId); n.close(); setTimeout(() => { startReply?.(message.id); $('#composer-input')?.focus(); }, 500); };
}

// ======================= GIF picker (KLIPY) =======================
// Favorite GIFs live on your account, so they follow you to every computer.
function localFavs() { try { return JSON.parse(localStorage.getItem('zuno_fav_gifs') || '[]'); } catch { return []; } }
function favGifs() {
  const saved = state.me?.favGifs || [];
  if (!saved.length && localFavs().length && !favGifs.moved) { favGifs.moved = true; setFavGifs(localFavs()); return localFavs(); } // bring over older favorites
  return saved;
}
let favTimer;
function setFavGifs(list) {
  list = list.slice(0, 100);
  if (state.me) state.me.favGifs = list;
  clearTimeout(favTimer);
  favTimer = setTimeout(() => api('PUT', '/api/me/fav-gifs', { gifs: list }).then(r => { state.me.favGifs = r.favGifs; try { localStorage.removeItem('zuno_fav_gifs'); } catch {} }).catch(e => toast(e.message, true)), 400);
}
const isFavGif = url => favGifs().some(f => f.url === url || f.from === url);
function toggleFavGif(g) {
  const on = isFavGif(g.url);
  setFavGifs(on ? favGifs().filter(f => f.url !== g.url && f.from !== g.url) : [{ url: g.url, preview: g.preview || g.url, w: g.w, h: g.h, title: g.title || '' }, ...favGifs()]);
  toast(on ? 'Removed from your favorite GIFs' : '★ Added to your favorite GIFs');
  $$(`[data-fav-gif]`).forEach(b => { try { if (JSON.parse(b.dataset.favGif).url === g.url) b.classList.toggle('on', !on); } catch {} });
  return !on;
}

// opts.tab: 'favs' opens on your favorites (when you have any); opts.title replaces the search hint.
function openGifPicker(anchor, onPick, opts = {}) {
  closeEmojiPicker();
  const pop = document.createElement('div');
  pop.className = 'emoji-picker gif-picker';
  pop.innerHTML = `
    ${opts.title ? `<div class="gp-title">${esc(opts.title)}</div>` : ''}<div class="ep-top"><input class="ep-search" placeholder="Search KLIPY" autocomplete="off" spellcheck="false"></div>
    <div class="gp-tabs"><button class="on" data-tab="trending">Trending</button><button data-tab="favs">Favorites</button></div>
    <div class="gp-grid" tabindex="-1"></div>
    <div class="ep-foot gp-foot">Powered by KLIPY</div>`;
  const shield = document.createElement('div');
  shield.className = 'ep-shield';
  shield.addEventListener('mousedown', closeEmojiPicker);
  document.body.append(shield, pop);
  const grid = $('.gp-grid', pop), search = $('.ep-search', pop);
  let q = '', page = 1, loading = false, more = true, tab = opts.tab === 'favs' && favGifs().length ? 'favs' : 'trending', items = [];
  $$('[data-tab]', pop).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));

  const tile = g => {
    const fav = favGifs().some(f => f.url === g.url);
    return `<div class="gp-item" data-url="${esc(g.url)}"><img src="${esc(g.preview)}" alt="${esc(g.title)}" loading="lazy"${g.w ? ` style="aspect-ratio:${g.w}/${g.h}"` : ''}>
      <button class="gp-fav${fav ? ' on' : ''}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">★</button></div>`;
  };
  const draw = () => {
    if (tab === 'favs') {
      const favs = favGifs();
      grid.innerHTML = favs.length ? `<div class="gp-cols">${favs.map(tile).join('')}</div>` : '<div class="ep-empty">Star a GIF to keep it here.</div>';
    } else grid.innerHTML = items.length ? `<div class="gp-cols">${items.map(tile).join('')}</div>` : (loading ? '<div class="ep-empty">Loading GIFs…</div>' : '<div class="ep-empty">No GIFs found. Try another search.</div>');
    $$('.gp-item', grid).forEach(el => el.addEventListener('click', e => {
      const list = tab === 'favs' ? favGifs() : items;
      const g = list.find(x => x.url === el.dataset.url);
      if (!g) return;
      if (e.target.closest('.gp-fav')) {
        const favs = favGifs();
        setFavGifs(favs.some(f => f.url === g.url) ? favs.filter(f => f.url !== g.url) : [g, ...favs]);
        return draw();
      }
      closeEmojiPicker();
      onPick({ url: g.url, preview: g.preview, w: g.w, h: g.h, title: g.title });
    }));
  };
  const load = async (reset = false) => {
    if (loading || (!more && !reset)) return;
    if (reset) { page = 1; items = []; more = true; }
    loading = true; draw();
    try {
      const r = await api('GET', `/api/gifs?${new URLSearchParams({ q, page })}`);
      items = items.concat(r.results.filter(g => !items.some(x => x.url === g.url)));
      more = r.hasMore; page++;
    } catch (e) {
      grid.innerHTML = `<div class="ep-empty">${mascot('sleepy')}<div>${esc(e.message)}</div></div>`;
      loading = false; return;
    }
    loading = false; draw();
  };
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { q = search.value.trim(); tab = 'trending'; $$('[data-tab]', pop).forEach(b => b.classList.toggle('on', b.dataset.tab === 'trending')); load(true); }, 350);
  });
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeEmojiPicker(); } });
  $$('[data-tab]', pop).forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    $$('[data-tab]', pop).forEach(x => x.classList.toggle('on', x === b));
    tab === 'trending' && !items.length ? load(true) : draw();
  }));
  grid.addEventListener('scroll', () => { if (tab === 'trending' && grid.scrollTop + grid.clientHeight > grid.scrollHeight - 300) load(); });

  const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.top - pr.height - 8, left = r.right - pr.width;
  if (top < 44) top = Math.min(innerHeight - pr.height - 8, r.bottom + 8);
  pop.style.top = top + 'px'; pop.style.left = Math.max(8, Math.min(left, innerWidth - pr.width - 8)) + 'px';
  if (!(typeof isPhone === 'function' && isPhone())) search.focus();
  tab === 'favs' ? draw() : load(true);
}

// ======================= bug reports =======================
const BUG_LABEL = { new: 'New', acknowledged: 'Acknowledged', fixed: 'Fixed', 'not-a-bug': 'Not a bug' };
function bugPill(status) { return `<span class="bug-pill s-${status}">${BUG_LABEL[status] || status}</span>`; }
const BUG_CATS = [['important', 'Important', 'Something doesn\'t work or gets in the way'], ['minor', 'Minor', 'Small, but it works around'], ['cosmetic', 'Cosmetic', 'Looks wrong, works fine']];
const BUG_CAT_LABEL = Object.fromEntries(BUG_CATS.map(([k, l]) => [k, l]));
function bugCatPill(cat) { return cat ? `<span class="bug-cat c-${cat}">${BUG_CAT_LABEL[cat] || cat}</span>` : ''; }

async function renderBugReport(body) {
  let mine = [];
  try { mine = (await api('GET', '/api/bugs')).bugs; } catch {}
  let version = '';
  try { version = window.zunoDesktop?.version ? (await window.zunoDesktop.version()).version : (await (await fetch('/api/version')).json()).version; } catch {}
  body.innerHTML = `
    <h2>Report a Bug</h2>
    <p class="muted" style="margin:-8px 0 20px">Found something broken? Tell the Zuno team. If they confirm it, you'll earn the <b>Bug Hunter</b> badge.</p>
    <form id="bug-form" class="bug-form">
      <label class="field">What's wrong? <span class="req">*</span><input name="title" maxlength="100" placeholder="The GIF button does nothing in DMs" required></label>
      <div class="field">How bad is it? <span class="req">*</span>
        <div class="bug-cats" role="radiogroup" aria-label="Category">${BUG_CATS.map(([k, l, d]) => `<label class="bug-cat-opt c-${k}"><input type="radio" name="category" value="${k}"${k === 'minor' ? ' checked' : ''}><b>${l}</b><span>${d}</span></label>`).join('')}</div></div>
      <label class="field">What happened? <span class="req">*</span><textarea name="details" maxlength="2000" placeholder="What did you expect, and what happened instead?" required></textarea></label>
      <label class="field">How can we make it happen? <span class="hint">(optional)</span><textarea name="steps" maxlength="1000" placeholder="1. Open a DM&#10;2. Click GIF&#10;3. …"></textarea></label>
      <div class="field">Screenshots <span class="hint">(optional, up to 6: pick files, take one now, or paste with Ctrl+V)</span>
        <div class="editor-row"><button type="button" class="btn btn-grey btn-sm" id="bug-shot">Add Screenshots</button>${navigator.mediaDevices?.getDisplayMedia ? '<button type="button" class="btn btn-grey btn-sm" id="bug-capture">📸 Take Screenshot</button>' : ''}<span class="muted small" id="bug-shot-name"></span>
        <input type="file" id="bug-shot-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" multiple></div>
        <div class="bug-shots41" id="bug-shots"></div></div>
      <p class="muted small" style="margin:0 0 14px">We'll include your Zuno version (${esc(version || 'unknown')}) and system so the team can find it faster.</p>
      <button class="btn btn-primary" id="bug-send">Send Report</button>
    </form>
    ${mine.length ? `<div class="setting-group" style="margin-top:32px"><h4 class="setting-head">Your reports</h4>
      ${mine.map(b => `<div class="bug-row"><div style="flex:1;min-width:0"><b>${esc(b.title)}</b> ${bugCatPill(b.category)}<div class="muted small">${fmtTime(b.createdAt)}${b.note ? ` · ${esc(b.note)}` : ''}</div></div>${bugPill(b.status)}</div>`).join('')}</div>` : ''}`;
  const f = $('#bug-form', body);
  const MAX_SHOTS = 6;
  let shots = []; // { id, url }
  const drawShots = () => {
    $('#bug-shots', body).innerHTML = shots.map((s, i) => `<div class="bug-shot-preview"><img alt="Screenshot ${i + 1}" src="${s.url}"><button type="button" class="icon-btn" data-shot-x="${i}" title="Remove screenshot">✕</button></div>`).join('');
    $$('[data-shot-x]', body).forEach(b => b.addEventListener('click', () => { shots.splice(Number(b.dataset.shotX), 1); drawShots(); }));
    $('#bug-shot-name', body).textContent = shots.length ? `${shots.length} of ${MAX_SHOTS} added` : '';
  };
  $('#bug-shot', body).addEventListener('click', () => $('#bug-shot-file', body).click());
  // Big pictures are shrunk to fit under the 1 MB limit.
  const shrink = async file => {
    if (file.size <= MAX_UPLOAD || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
    const img = await createImageBitmap(file);
    for (const scale of [1, 0.75, 0.5, 0.35]) {
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      if (blob && blob.size <= MAX_UPLOAD) return new File([blob], 'screenshot.jpg', { type: 'image/jpeg' });
    }
    return file;
  };
  const attachShot = async raw => {
    if (shots.length >= MAX_SHOTS) return toast(`You can add up to ${MAX_SHOTS} screenshots.`, true);
    const file = await shrink(raw);
    if (file.size > MAX_UPLOAD) return toast('Screenshots can be up to 1 MB.', true);
    $('#bug-shot-name', body).textContent = 'Uploading…';
    try {
      const id = (await uploadFile(file)).id;
      if (shots.length < MAX_SHOTS) shots.push({ id, url: URL.createObjectURL(file) });
    } catch (err) { toast(err.message, true); }
    drawShots();
  };
  $('#bug-shot-file', body).addEventListener('change', async e => { const files = [...e.target.files]; e.target.value = ''; for (const file of files) await attachShot(file); });
  // Take a screenshot right now: pick a screen, window or tab, and Zuno grabs one picture of it.
  $('#bug-capture', body)?.addEventListener('click', async () => {
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return; }
    try {
      const v = document.createElement('video');
      v.srcObject = stream; v.muted = true; await v.play();
      await new Promise(r => setTimeout(r, 300));
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await attachShot(new File([blob], 'screenshot.png', { type: 'image/png' }));
    } finally { stream.getTracks().forEach(t => t.stop()); }
  });
  f.addEventListener('paste', async e => { const files = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/')); if (files.length) { e.preventDefault(); for (const file of files) await attachShot(file); } });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#bug-send', body);
    btn.disabled = true;
    try {
      await api('POST', '/api/bugs', { title: f.title.value, category: f.category.value, details: f.details.value, steps: f.steps.value, screenshotIds: shots.map(s => s.id), version, platform: navigator.userAgentData?.platform || navigator.platform || '' });
      toast('Thanks! Your report was sent to the Zuno team.');
      burst(btn, 16);
      renderBugReport(body);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

let bugCatFilter = '';
async function renderBugInbox(body, filter = 'new') {
  let bugs = [];
  try { bugs = (await api('GET', '/api/bugs?all=1')).bugs; } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const live = bugs.filter(b => !b.dismissed);
  const counts = Object.fromEntries(Object.keys(BUG_LABEL).map(k => [k, live.filter(b => b.status === k).length]));
  counts.dismissed = bugs.length - live.length;
  const rank = { important: 0, minor: 1, cosmetic: 2 };
  const shown = (filter === 'dismissed' ? bugs.filter(b => b.dismissed) : live.filter(b => filter === 'all' || b.status === filter))
    .filter(b => !bugCatFilter || (b.category || 'minor') === bugCatFilter)
    .sort((a, b) => (rank[a.category] ?? 1) - (rank[b.category] ?? 1) || b.createdAt - a.createdAt);
  body.innerHTML = `
    <h2>Bug Reports</h2>
    <div class="segmented bug-filter">${[['new', 'New'], ['acknowledged', 'Acknowledged'], ['fixed', 'Fixed'], ['not-a-bug', 'Not a bug'], ['all', 'All'], ['dismissed', 'Dismissed']].map(([k, l]) =>
      `<button data-filter="${k}" class="${filter === k ? 'on' : ''}">${l}${k !== 'all' && counts[k] ? ` <span class="count">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="bug-catfilter">${[['', 'Every category'], ...BUG_CATS].map(([k, l]) => `<button class="chip${bugCatFilter === k ? ' on' : ''}" data-catf="${k}">${l}</button>`).join('')}</div>
    <p class="muted small" style="margin:10px 0 18px">Marking a report Acknowledged or Fixed gives the reporter the Bug Hunter badge and tells them in their Zuno DM.</p>
    ${shown.length ? shown.map(b => `<div class="bug-card" data-bug="${esc(b.id)}">
      <div class="bug-head"><b>${esc(b.title)}</b>${bugCatPill(b.category || 'minor')}${bugPill(b.status)}
        <select class="bug-cat-set" aria-label="Category" title="Change category">${BUG_CATS.map(([k, l]) => `<option value="${k}"${(b.category || 'minor') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${state.me.isFounder ? `<button class="btn btn-link btn-sm purge-btn" data-purge-bug="${esc(b.id)}" title="Only the founder can do this">🗑</button>` : ''}<button class="btn btn-link btn-sm" data-dismiss="${b.dismissed ? '0' : '1'}" title="${b.dismissed ? 'Put it back in the inbox' : 'Hide it from the inbox (the reporter isn\'t told)'}">${b.dismissed ? 'Restore' : 'Dismiss'}</button></div>
      <div class="bug-who">${b.reporter ? `${avatar(b.reporter, 20)}<span>${esc(b.reporter.displayName)} (${esc(b.reporter.username)})</span>` : ''}<span class="muted">${fmtTime(b.createdAt)}${b.version ? ` · Zuno ${esc(b.version)}` : ''}${b.platform ? ` · ${esc(b.platform)}` : ''}</span></div>
      <div class="bug-text">${formatMessage(b.details)}</div>
      ${b.steps ? `<div class="bug-steps"><small>Steps</small>${formatMessage(b.steps)}</div>` : ''}
      ${(b.screenshots || (b.screenshot ? [b.screenshot] : [])).length > 1
        ? `<div class="bug-shots41">${b.screenshots.map((u, i) => `<img class="bug-shot" src="${esc(u)}" alt="Screenshot ${i + 1}" data-full="${esc(u)}">`).join('')}</div>`
        : b.screenshot ? `<img class="bug-shot" src="${esc(b.screenshot)}" alt="Screenshot" data-full="${esc(b.screenshot)}">` : ''}
      <div class="bug-actions">
        <input class="bug-note" maxlength="500" placeholder="Note to the reporter (optional)" value="${esc(b.note || '')}">
        ${['acknowledged', 'fixed', 'not-a-bug'].map(st => `<button class="btn btn-sm ${st === 'not-a-bug' ? 'btn-grey' : 'btn-primary'}" data-set="${st}"${b.status === st ? ' disabled' : ''}>${BUG_LABEL[st]}</button>`).join('')}
      </div></div>`).join('') : `<div class="empty-state">${mascot('happy')}<div class="title">Nothing here</div><div>No ${filter === 'all' ? '' : (BUG_LABEL[filter] || filter).toLowerCase() + ' '}${bugCatFilter ? BUG_CAT_LABEL[bugCatFilter].toLowerCase() + ' ' : ''}reports right now.</div></div>`}`;
  $$('[data-filter]', body).forEach(b => b.addEventListener('click', () => renderBugInbox(body, b.dataset.filter)));
  $$('[data-purge-bug]', body).forEach(b => b.addEventListener('click', () => purgeThing(`/api/bugs/${b.dataset.purgeBug}`, 'this bug report', () => renderBugInbox(body, filter))));
  $$('[data-catf]', body).forEach(b => b.addEventListener('click', () => { bugCatFilter = b.dataset.catf; renderBugInbox(body, filter); }));
  $$('[data-dismiss]', body).forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('[data-bug]'), dismissed = b.dataset.dismiss === '1';
    try {
      await api('PATCH', `/api/bugs/${card.dataset.bug}`, { dismissed });
      card.classList.add('bug-out');
      toast(dismissed ? 'Report dismissed' : 'Report restored');
      setTimeout(() => renderBugInbox(body, filter), 200);
    } catch (e) { toast(e.message, true); }
  }));
  $$('.bug-cat-set', body).forEach(sel => sel.addEventListener('change', async () => {
    try { await api('PATCH', `/api/bugs/${sel.closest('[data-bug]').dataset.bug}`, { category: sel.value }); renderBugInbox(body, filter); } catch (e) { toast(e.message, true); }
  }));
  $$('.bug-shot', body).forEach(img => img.addEventListener('click', () => openLightbox(img.dataset.full, 'Screenshot')));
  $$('[data-set]', body).forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('[data-bug]');
    try {
      await api('PATCH', `/api/bugs/${card.dataset.bug}`, { status: b.dataset.set, note: $('.bug-note', card).value });
      if (b.dataset.set !== 'not-a-bug') burst(b, 14);
      toast(`Marked ${BUG_LABEL[b.dataset.set]}`);
      setTimeout(() => renderBugInbox(body, filter), 250);
    } catch (e) { toast(e.message, true); }
  }));
}

// ======================= everyone on the same version =======================
const verParts = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
const verLess = (a, b) => { const x = verParts(a), y = verParts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };

// A desktop app that's too old for the server can't continue until it updates.
async function enforceDesktopVersion() {
  if (!window.zunoDesktop?.version) return;
  let need, have;
  try {
    need = (await (await fetch('/api/version', { cache: 'no-store' })).json()).minDesktop;
    have = (await window.zunoDesktop.version()).version;
  } catch { return; }
  if (!need || !verLess(have, need) || $('#update-gate')) return;
  const gate = document.createElement('div');
  gate.id = 'update-gate';
  gate.className = 'update-gate';
  gate.innerHTML = `<div class="ug-card">${mascot('happy', 'zm-wiggle')}
    <h2>Zuno needs a quick update</h2>
    <p>Everyone's moving to Zuno ${esc(need)} so you can all keep chatting together. You have ${esc(have)}.</p>
    <div class="ug-status" id="ug-status"><span class="ug-spin"></span>Downloading the update…</div>
    <button class="btn btn-primary hidden" id="ug-restart">Restart to finish</button>
    <p class="muted small" id="ug-help">This usually takes under a minute. If it gets stuck, close Zuno and open it again, or download it from heyzuno.uk/download.</p></div>`;
  document.body.appendChild(gate);
  // If restarting already didn't update this copy, don't trap anyone: offer the installer and a way through.
  const key = `zuno_update_tries_${have}`;
  let tries = 0;
  try { tries = Number(localStorage.getItem(key)) || 0; } catch {}
  if (tries >= 1) {
    $('#ug-help').innerHTML = `The automatic update didn't finish on this computer. Download the newest Zuno and run it. It installs right over this one and keeps your account.
      <div class="ug-fallback"><a class="btn btn-primary" href="https://heyzuno.uk/download" target="_blank">Download Zuno</a>
      <button class="btn btn-grey" id="ug-skip">Use this version for now</button></div>`;
    $('#ug-skip').addEventListener('click', () => gate.remove());
  }
  const ready = () => { $('#ug-status').innerHTML = 'The update is ready.'; $('#ug-restart').classList.remove('hidden'); };
  window.zunoDesktop.onUpdateReady(ready);
  $('#ug-restart').addEventListener('click', () => { try { localStorage.setItem(key, String(tries + 1)); } catch {} window.zunoDesktop.restart(); });
  try { if ((await window.zunoDesktop.version()).readyVersion) ready(); } catch {}
  window.zunoDesktop.checkUpdates?.();
  setInterval(() => window.zunoDesktop.checkUpdates?.(), 60000);
}
enforceDesktopVersion();
setInterval(enforceDesktopVersion, 5 * 60 * 1000);
