'use strict';
// Media & chat comfort: server emoji, voice messages, link previews, picture galleries,
// pasting and dropping files anywhere, jump to unread, mark unread, and smooth long chats.

// ======================= server emoji =======================
// In messages a server emoji is written <:name:file.png>; in the message box you type :name:.
const CEMOJI_RE = /&lt;:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))&gt;/gi;
const cemojiImg = (name, file, big = false) => `<img class="cemoji${big ? ' big' : ''}" src="/uploads/${esc(file)}" alt=":${esc(name)}:" title=":${esc(name)}:" loading="lazy" draggable="false">`;
function renderEmojiToken(t) {
  const m = /^<:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))>$/i.exec(t || '');
  return m ? cemojiImg(m[1], m[2]) : esc(t);
}
function allServerEmoji() {
  const cur = currentServer?.();
  const list = [];
  for (const sv of [cur, ...state.servers.filter(s => s !== cur)].filter(Boolean)) for (const e of sv.emojis || []) list.push({ ...e, serverId: sv.id, serverName: sv.name, token: `<:${e.name}:${e.id}>` });
  return list;
}
const _formatMessageM = formatMessage;
formatMessage = function (text) { return _formatMessageM(text).replace(CEMOJI_RE, (_, n, f) => cemojiImg(n, f)); };
const _isJumboM = isJumbo;
isJumbo = function (text) {
  if (!/<:[a-z0-9_]{2,32}:/i.test(text || '')) return _isJumboM(text);
  const rest = text.replace(/<:[a-z0-9_]{2,32}:[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)>/gi, '').trim();
  return (text.match(/<:[a-z0-9_]{2,32}:/gi) || []).length <= 27 && (!rest || _isJumboM(rest));
};
const _replaceShortcodesM = replaceShortcodes;
replaceShortcodes = function (text) {
  const all = allServerEmoji();
  return _replaceShortcodesM(text).replace(/(^|[^\w`<]):([a-z0-9_]{2,32}):/gi, (whole, pre, name) => { const e = all.find(x => x.name === name.toLowerCase()); return e ? pre + e.token : whole; });
};
// Typing ":po" suggests server emoji too (used by the emoji autocomplete in emoji.js).
function customEmojiMatches(q) {
  return allServerEmoji().filter(e => e.name.includes(q)).sort((a, b) => b.name.startsWith(q) - a.name.startsWith(q)).slice(0, 5).map(e => ({ char: `:${e.name}:`, names: [e.name], img: `/uploads/${e.id}` }));
}
// The emoji picker gets a section for every server you're in that has its own emoji.
const _openEmojiPickerM = openEmojiPicker;
openEmojiPicker = function (anchor, onPick, opts) {
  const forComposer = anchor?.id === 'composer-emoji';
  _openEmojiPickerM(anchor, onPick, opts);
  const pop = $('.emoji-picker');
  const all = allServerEmoji();
  if (!pop || !all.length) return;
  const grid = $('.ep-grid', pop), cats = $('.ep-cats', pop), search = $('.ep-search', pop);
  const bySv = {};
  for (const e of all) (bySv[e.serverId] ||= { name: e.serverName, list: [] }).list.push(e);
  const section = q => Object.entries(bySv).map(([sid, g]) => { const list = g.list.filter(e => !q || e.name.includes(q)); return list.length ? `<h6 data-sec="sv-${esc(sid)}">${esc(g.name)}</h6><div class="ep-row">${list.map(e => `<button class="ep-e ep-c" data-tok="${esc(e.token)}" data-name="${esc(e.name)}">${cemojiImg(e.name, e.id)}</button>`).join('')}</div>` : ''; }).join('');
  const inject = () => {
    const q = search.value.trim().toLowerCase().replace(/:/g, '');
    $$('.ep-c-sec', grid).forEach(n => n.remove());
    const html = section(q);
    if (!html) return;
    const wrap = document.createElement('div');
    wrap.className = 'ep-c-sec';
    wrap.innerHTML = html;
    if (q && $('.ep-empty', grid)) $('.ep-empty', grid).remove();
    grid.prepend(wrap);
  };
  inject();
  search.addEventListener('input', () => setTimeout(inject, 0));
  const b = document.createElement('button');
  b.dataset.cat = 'server'; b.title = 'Server emoji'; b.textContent = '⭐';
  cats.prepend(b);
  b.addEventListener('click', () => { grid.scrollTop = 0; });
  grid.addEventListener('click', e => {
    const c = e.target.closest('.ep-c');
    if (!c) return;
    e.stopImmediatePropagation();
    onPick(forComposer ? `:${c.dataset.name}: ` : c.dataset.tok);
    if (!e.shiftKey) closeEmojiPicker();
  }, true);
  grid.addEventListener('mouseover', e => {
    const c = e.target.closest('.ep-c');
    if (!c) return;
    $('.ep-preview-char', pop).innerHTML = $('img', c).outerHTML;
    $('.ep-preview-name', pop).textContent = `:${c.dataset.name}:`;
  });
};
// Reactions with server emoji show the picture.
const _reactionsHtmlM = reactionsHtml;
reactionsHtml = function (m) { return _reactionsHtmlM(m).replace(/<span class="rx-e">([^<]*)<\/span>/g, (all, e) => (/^&lt;:/.test(e) ? `<span class="rx-e">${formatMessage(e.replace(/&lt;/g, '<').replace(/&gt;/g, '>'))}</span>` : all)); };

// Server Settings › Emoji
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'roles'), 0, { group: 'Server', key: 'emoji', label: 'Emoji', need: 'manage_expressions', words: 'emoji emojis custom stickers expressions upload' });
SS_SETTINGS.push(['emoji', 'Upload emoji']);
const _showServerSectionM = showServerSection;
showServerSection = async function (section, openCh) {
  if (section !== 'emoji') return _showServerSectionM(section, openCh);
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  return ssEmoji($('#ss-body'), svById(svSettings.id));
};
function ssEmoji(body, sv) {
  const list = sv.emojis || [];
  body.innerHTML = `<div data-keep><h2>Emoji</h2>
    <p class="muted" style="margin:-10px 0 16px">Upload up to 50 emoji for everyone in ${esc(sv.name)}. Type <b>:name:</b> to use one, or find them at the top of the emoji picker. Square PNG or GIF, up to 512 KB.</p>
    <div class="em-up"><button class="btn btn-primary" id="em-upload">Upload Emoji</button><span class="muted small">${list.length} / 50</span><input type="file" id="em-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" multiple></div>
    <div class="em-list">${list.map(e => `<div class="em-row" data-em="${esc(e.id)}">${cemojiImg(e.name, e.id, true)}<input class="em-name" value="${esc(e.name)}" maxlength="32"><span class="muted small">${e.animated ? 'Animated' : ''}</span><button class="icon-btn danger" data-emdel title="Delete">${ICON.trash}</button></div>`).join('') || `<div class="empty-state">${mascot('curious')}<div class="title">No emoji yet</div><div>Upload your server's first one!</div></div>`}</div></div>`;
  const redraw = async () => { await refresh({ serverId: sv.id }); ssEmoji(body, svById(sv.id)); };
  $('#em-upload', body).addEventListener('click', () => $('#em-file', body).click());
  $('#em-file', body).addEventListener('change', async e => {
    for (const file of [...e.target.files]) {
      const name = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32).padEnd(2, '_');
      try {
        const res = await fetch(`/api/servers/${sv.id}/emojis`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type, 'X-Emoji-Name': encodeURIComponent(name) }, body: file });
        const d = await res.json(); if (!res.ok) throw new Error(d.error);
        toast(`Added :${d.emoji.name}:`);
      } catch (err) { toast(`${file.name}: ${err.message}`, true); }
    }
    redraw();
  });
  $$('[data-em]', body).forEach(r => {
    const id = r.dataset.em;
    $('.em-name', r).addEventListener('change', async e => { try { await api('PATCH', `/api/servers/${sv.id}/emojis/${id}`, { name: e.target.value }); toast('Renamed'); redraw(); } catch (err) { toast(err.message, true); } });
    $('[data-emdel]', r).addEventListener('click', () => confirmDialog('Delete this emoji?', 'Old messages show its :name: instead.', 'Delete', async () => { try { await api('DELETE', `/api/servers/${sv.id}/emojis/${id}`); redraw(); } catch (err) { toast(err.message, true); } }));
  });
}

// ======================= voice messages =======================
const MIC = ICON.mic;
let recorder = null;
const _renderComposerM = renderComposer;
renderComposer = function () {
  _renderComposerM();
  const box = $('#composer .composer-box');
  if (!box || $('#composer-voice', box) || !window.MediaRecorder) return;
  const b = document.createElement('button');
  b.className = 'composer-voice'; b.id = 'composer-voice'; b.title = 'Record a voice message'; b.setAttribute('aria-label', 'Record a voice message');
  b.innerHTML = MIC;
  $('#composer-emoji', box)?.after(b);
  b.addEventListener('click', () => startVoice(activeConv()));
};
async function startVoice(conv) {
  if (recorder) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return toast('Zuno needs your microphone to record. Check that one is plugged in and allowed.', true); }
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
  const chunks = [], levels = [];
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctx.createAnalyser(); an.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const started = Date.now();
  const MAX = 5 * 60e3;
  recorder = { rec, conv, cancel: false };
  const box = $('#composer .composer-box');
  const bar = document.createElement('div');
  bar.className = 'voice-rec';
  bar.innerHTML = `<button class="vr-x" title="Cancel">${ICON.trash}</button><span class="vr-dot"></span><span class="vr-time">0:00</span><span class="vr-wave"></span><button class="vr-send" title="Send">${ICON.reply.replace('<svg', '<svg style="transform:scaleX(-1)"')}</button>`;
  box.appendChild(bar);
  const tick = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
    levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    const t = Date.now() - started;
    $('.vr-time', bar).textContent = clock(t);
    $('.vr-wave', bar).innerHTML = levels.slice(-40).map(l => `<i style="height:${Math.max(8, l * 100)}%"></i>`).join('');
    if (t > MAX) stop(false);
  }, 100);
  const stop = cancel => { recorder.cancel = cancel; clearInterval(tick); if (rec.state !== 'inactive') rec.stop(); };
  $('.vr-x', bar).addEventListener('click', () => stop(true));
  $('.vr-send', bar).addEventListener('click', () => stop(false));
  const onKey = e => { if (e.key === 'Escape') stop(true); if (e.key === 'Enter') { e.preventDefault(); stop(false); } };
  document.addEventListener('keydown', onKey, true);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    document.removeEventListener('keydown', onKey, true);
    stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {});
    bar.remove();
    const cancelled = recorder.cancel; recorder = null;
    const secs = (Date.now() - started) / 1000;
    if (cancelled) return;
    if (secs < 0.7) return toast('Hold on a little longer to record a voice message.', true);
    // 48 bars for the waveform, from 0 to 99.
    const bars = Array.from({ length: 48 }, (_, i) => { const s = levels.slice(Math.floor((i * levels.length) / 48), Math.floor(((i + 1) * levels.length) / 48)); return Math.round((s.length ? Math.max(...s) : 0) * 99); });
    const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
    if (blob.size > limits().upload) return toast(`That recording is too big (max ${mb(limits().upload)}). Try a shorter one.`, true);
    try {
      const res = await fetch('/api/attachments', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'X-Voice': '1', 'X-Duration': secs.toFixed(1), 'X-Wave': bars.join(','), 'Content-Type': 'application/octet-stream' }, body: blob });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      const { message } = await api('POST', `${convBase(conv)}/messages`, { content: '', attachmentIds: [d.attachment.id] });
      addSentMessage(conv, message);
    } catch (err) { toast(err.message, true); }
  };
  rec.start(250);
}
let voicePlayer = null; // { audio, id }
function voiceHtml(a) {
  const wave = (a.wave?.length ? a.wave : Array(48).fill(30)).map(v => `<i style="height:${Math.max(10, v)}%"></i>`).join('');
  return `<div class="voice-msg" data-voice="${esc(a.url)}" data-dur="${a.duration || 0}"><button class="vm-play" title="Play">${ICON.play}</button><span class="vm-wave">${wave}</span><span class="vm-time">${clock((a.duration || 0) * 1000)}</span><button class="vm-speed" title="Speed">1×</button></div>`;
}
document.addEventListener('click', e => {
  const sp = e.target.closest('.vm-speed');
  if (sp) { const r = { '1×': '1.5×', '1.5×': '2×', '2×': '1×' }[sp.textContent]; sp.textContent = r; if (voicePlayer && sp.closest('.voice-msg').dataset.voice === voicePlayer.url) voicePlayer.audio.playbackRate = parseFloat(r); return; }
  const wave = e.target.closest('.vm-wave');
  const play = e.target.closest('.vm-play');
  if (!play && !wave) return;
  const box = (play || wave).closest('.voice-msg'), url = box.dataset.voice;
  if (voicePlayer?.url !== url) {
    voicePlayer?.audio.pause();
    const audio = new Audio(url);
    audio.playbackRate = parseFloat($('.vm-speed', box).textContent);
    voicePlayer = { audio, url };
    const sync = () => {
      for (const b of $$(`.voice-msg[data-voice="${CSS.escape(url)}"]`)) {
        const d = audio.duration && isFinite(audio.duration) ? audio.duration : Number(b.dataset.dur) || 1;
        const p = Math.min(1, audio.currentTime / d);
        $$('.vm-wave i', b).forEach((i, k, all) => i.classList.toggle('on', k / all.length < p));
        $('.vm-time', b).textContent = clock((audio.paused && !audio.currentTime ? d : audio.currentTime) * 1000);
        $('.vm-play', b).innerHTML = audio.paused ? ICON.play : ICON.pause;
      }
    };
    for (const ev of ['timeupdate', 'play', 'pause']) audio.addEventListener(ev, sync);
    audio.addEventListener('ended', () => { audio.currentTime = 0; sync(); });
  }
  const { audio } = voicePlayer;
  if (wave) { const r = wave.getBoundingClientRect(); const d = audio.duration && isFinite(audio.duration) ? audio.duration : Number(box.dataset.dur); audio.currentTime = ((e.clientX - r.left) / r.width) * d; if (audio.paused) audio.play(); return; }
  audio.paused ? audio.play().catch(() => toast("Couldn't play that voice message.", true)) : audio.pause();
});

// ======================= pictures: gallery grid & lightbox with arrows =======================
function galleryHtml(imgs, msgId) {
  const n = imgs.length;
  return `<div class="gallery g${Math.min(n, 5)}">${imgs.slice(0, 10).map((a, i) => `<button class="gal-item" data-gal="${esc(msgId)}" data-i="${i}"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy">${i === 9 && n > 10 ? `<span class="gal-more">+${n - 10}</span>` : ''}</button>`).join('')}</div>`;
}
function openGallery(list, start) {
  let i = start;
  const ov = openLayer('<div class="lightbox modal gallery-box"><button class="lb-nav prev" aria-label="Previous">‹</button><img alt=""><button class="lb-nav next" aria-label="Next">›</button><div class="lb-bar"><span class="lb-name"></span><span class="muted small lb-count"></span><a class="btn btn-grey btn-sm lb-dl" download>' + ICON.download + ' Save</a></div></div>');
  const show = () => {
    const a = list[i];
    $('img', ov).src = a.url; $('.lb-name', ov).textContent = a.name; $('.lb-count', ov).textContent = list.length > 1 ? `${i + 1} of ${list.length}` : '';
    $('.lb-dl', ov).href = a.url; $('.lb-dl', ov).download = a.name;
    $$('.lb-nav', ov).forEach(b => b.classList.toggle('hidden', list.length < 2));
  };
  const go = d => { i = (i + d + list.length) % list.length; show(); };
  $('.prev', ov).addEventListener('click', () => go(-1));
  $('.next', ov).addEventListener('click', () => go(1));
  const keys = e => { if (!ov.isConnected) return document.removeEventListener('keydown', keys); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  document.addEventListener('keydown', keys);
  show();
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-gal]');
  if (!g) return;
  const m = state.convos[activeConv()]?.messages.find(x => x.id === g.dataset.gal);
  if (m) openGallery((m.attachments || []).filter(a => a.kind === 'image'), Number(g.dataset.i));
});

// ======================= link previews =======================
const embeds = new Map(); // url -> null (loading) | embed | false (none)
const LINK_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/g;
let embedRender = null;
function linksIn(text) {
  const clean = String(text || '').replace(/```[\s\S]*?```|`[^`]*`|\|\|[^|]*\|\|/g, '');
  return [...new Set(clean.match(LINK_RE) || [])].filter(u => !/zuno\.invite\//.test(u)).slice(0, 3);
}
function embedHtml(url) {
  if (!embeds.has(url)) {
    embeds.set(url, null);
    api('GET', `/api/embed?url=${encodeURIComponent(url)}`).then(r => embeds.set(url, r.embed || false)).catch(() => embeds.set(url, false)).finally(() => {
      clearTimeout(embedRender);
      embedRender = setTimeout(() => { if (activeConv()) renderMessages(); }, 60);
    });
  }
  const e = embeds.get(url);
  if (!e) return '';
  if (e.type === 'image') return `<div class="msg-media"><img class="att-img" src="${esc(e.image)}" alt="" loading="lazy" data-full="${esc(e.image)}" data-name="Image"></div>`;
  if (e.type === 'youtube') return `<div class="embed yt" style="--ec:${esc(e.color || '#ff0033')}"><div class="em-site">YouTube${e.description ? ` · ${esc(e.description)}` : ''}</div><a class="em-title" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>
    <button class="yt-thumb" data-yt="${esc(e.videoId)}"><img src="${esc(e.image)}" alt="" loading="lazy"><span class="yt-play">${ICON.play}</span></button></div>`;
  return `<div class="embed${e.large && e.image ? ' large' : ''}" style="--ec:${esc(e.color || 'var(--brand)')}"><div class="em-text">${e.site ? `<div class="em-site">${esc(e.site)}</div>` : ''}<a class="em-title" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>${e.description ? `<div class="em-desc">${esc(e.description)}</div>` : ''}</div>
    ${e.image ? `<img class="em-img" src="${esc(e.image)}" alt="" loading="lazy">` : ''}</div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-yt]');
  if (!t) return;
  t.outerHTML = `<div class="yt-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.yt)}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="YouTube video"></iframe></div>`;
});

// Messages: voice players, picture grids and link previews.
const _mediaHtmlM = mediaHtml;
mediaHtml = function (m) {
  const atts = m.attachments || [];
  const voice = atts.filter(a => a.kind === 'voice');
  const imgs = atts.filter(a => a.kind === 'image');
  const grid = imgs.length > 1 && m.id;
  const rest = atts.filter(a => a.kind !== 'voice' && !(grid && a.kind === 'image'));
  const html = _mediaHtmlM({ ...m, attachments: rest.length ? rest : undefined });
  const links = m.content && !m.pending && !m.noEmbed ? linksIn(m.content).map(embedHtml).join('') : '';
  return voice.map(voiceHtml).join('') + (grid ? galleryHtml(imgs, m.id) : '') + html + links;
};

// ======================= paste and drop files anywhere =======================
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length || !$('#composer-input')) return;
  const t = document.activeElement;
  if (t?.id === 'composer-input' || $('#layer .overlay, #layer .settings')) return; // the message box handles its own paste
  if (t && /INPUT|TEXTAREA/.test(t.tagName)) return;
  e.preventDefault();
  addFiles(activeConv(), files);
  $('#composer-input').focus();
});
(() => {
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const chat = () => $('.chat');
  document.addEventListener('dragenter', e => { if (!hasFiles(e) || !$('#composer-input')) return; depth++; chat()?.classList.add('dropping'); });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; chat()?.classList.remove('dropping'); } });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); }); // never let a dropped file open in the window
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; chat()?.classList.remove('dropping');
    if (e.target.closest?.('.chat')) return; // the chat area handles drops itself
    if ($('#composer-input') && activeConv() && !$('#layer .overlay, #layer .settings')) addFiles(activeConv(), [...e.dataTransfer.files]);
  });
})();

// ======================= jump to unread & mark unread =======================
const _renderMessagesM = renderMessages;
renderMessages = function (forceBottom) {
  _renderMessagesM(forceBottom);
  const el = $('#messages');
  const conv = activeConv(), convo = state.convos[conv];
  if (!el || !convo) return;
  // Scrolling near the top draws (or loads) older messages.
  if (!el.dataset.olderWired) {
    el.dataset.olderWired = '1';
    el.addEventListener('scroll', () => { if (el.scrollTop < 250 && (state.convos[activeConv()]?.from > 0 || state.convos[activeConv()]?.hasMore)) loadOlder(); updateUnreadBar(); }, { passive: true });
  }
  updateUnreadBar();
};
function updateUnreadBar() {
  const chat = $('.chat'), el = $('#messages');
  const conv = activeConv(), convo = state.convos[conv];
  if (!chat || !el) return;
  let bar = $('.unread-bar', chat);
  const id = convo?.dividerId;
  const div = id && $('.new-divider', el);
  const idx = id ? convo.messages.findIndex(m => m.id === id) : -1;
  const above = idx >= 0 && (!div || div.getBoundingClientRect().bottom < el.getBoundingClientRect().top + 8);
  if (!above) return bar?.remove();
  const count = convo.messages.slice(idx).filter(m => m.authorId !== state.me.id).length;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'unread-bar';
    chat.prepend(bar);
    bar.addEventListener('click', e => {
      if (e.target.closest('[data-ub=read]')) { convo.dividerId = null; bar.remove(); renderMessages(); return; }
      jumpToAny(conv, convo.dividerId);
    });
  }
  bar.innerHTML = `<span>${count} new message${count === 1 ? '' : 's'} since ${fmtShort(convo.messages[idx].createdAt)}</span><b>Jump to unread ${ICON.chevron.replace('<svg', '<svg style="transform:rotate(180deg)"')}</b><button data-ub="read" title="Mark as read">Mark as read ✓</button>`;
}
// Messages outside the drawn window get drawn before jumping to them.
const _jumpToMessageM = jumpToMessage;
jumpToMessage = function (id) {
  const convo = state.convos[activeConv()];
  const i = convo?.messages.findIndex(m => m.id === id) ?? -1;
  if (i >= 0 && i < (convo.from || 0)) { convo.from = Math.max(0, i - 20); renderMessages(); }
  return _jumpToMessageM(id);
};
async function markUnread(conv, id) {
  const convo = state.convos[conv];
  const m = convo?.messages.find(x => x.id === id);
  if (!m) return;
  try { await api('POST', `${convBase(conv)}/read`, { at: m.createdAt - 1 }); } catch (e) { return toast(e.message, true); }
  const count = convo.messages.filter(x => x.createdAt >= m.createdAt && x.authorId !== state.me.id).length;
  convo.dividerId = id;
  if (isChannelConv(conv)) { const ch = currentChannel(); if (ch) ch.unread = count; renderServerSidebar(); renderRail(); }
  else if (isGroupConv(conv)) { const g = groupById(conv.slice(2)); if (g) g.unread = count; renderDMList(); }
  else { const d = state.dms.find(x => x.userId === conv); if (d) d.unread = count; renderDMList(); }
  state.markedUnread = conv; // don't clear it again until you leave and come back
  renderMessages();
  toast('Marked as unread');
}
// While a chat is marked unread, being in it doesn't clear it.
const _markReadM = markRead;
markRead = function (conv) { if (state.markedUnread === conv && activeConv() === conv) return; if (state.markedUnread && state.markedUnread !== activeConv()) state.markedUnread = null; return _markReadM(conv); };
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m || m.pending) return;
  addMenuItem({ label: 'Mark Unread', icon: ico('🔵'), run: () => markUnread(conv, id) });
});

// Pictures that fail to load: a server emoji turns back into its :name:, a widget picture disappears.
// (Done here instead of onerror="" so the security policy can block scripts written inside pages.)
document.addEventListener('error', e => {
  const t = e.target;
  if (t?.matches?.('img.cemoji')) t.replaceWith(document.createTextNode(t.alt));
  else if (t?.matches?.('img.em-img')) t.remove();
}, true);
