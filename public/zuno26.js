// Zuno 0.26: smoother fullscreen video, stream quality, clips, chat in voice channels, blocking,
// messaging from profiles, live @mention and :emoji: previews in the message box, search highlights.

// ======================= smooth fullscreen video =======================
// A video playing fullscreen from a chat used to be pulled out and put back every time the chat
// redrew (new messages, typing, reactions…), and everything behind it kept animating. Now the chat
// waits until you leave fullscreen to redraw, and the rest of Zuno holds still meanwhile.
const chatVideoFull = () => !!document.fullscreenElement?.closest?.('#messages');
let redrawAfterFull = false;
const _renderMessages26 = renderMessages;
renderMessages = function (...a) {
  if (chatVideoFull()) { redrawAfterFull = true; return; }
  return _renderMessages26(...a);
};
document.addEventListener('fullscreenchange', () => {
  document.documentElement.classList.toggle('zp-fs', !!document.fullscreenElement?.matches?.('.zp'));
  if (!document.fullscreenElement && redrawAfterFull) { redrawAfterFull = false; renderMessages(); }
});

// ======================= search highlights =======================
// The words you searched for (not from:/has:/pinned:) light up in the results, anywhere they
// appear inside a word too ("cat" in "concatenate").
const searchWords = q => String(q || '').replace(/\b(from|has|pinned|in|before|after):\S*/gi, '').trim().split(/\s+/).filter(w => w.length > 1);
function markMatches(els, words) {
  if (!words.length) return;
  const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu');
  for (const el of els) {
    const texts = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (!n.parentElement.closest('mark')) texts.push(n);
    for (const n of texts) {
      const s = n.textContent;
      re.lastIndex = 0;
      if (!re.test(s)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const m of s.matchAll(re)) {
        frag.append(s.slice(at, m.index));
        const mk = document.createElement('mark'); mk.className = 'hl'; mk.textContent = m[0];
        frag.append(mk); at = m.index + m[0].length;
      }
      frag.append(s.slice(at));
      n.replaceWith(frag);
    }
  }
}
const _runSearch26 = runSearch;
runSearch = async function (q, tools) {
  const r = await _runSearch26(q, tools);
  markMatches($$('#layer .search-pop .pi-text'), searchWords(q));
  return r;
};

// ======================= the message box: :emoji: and @mentions =======================
// Finish typing ":sob:" and it turns into 😭 right there in the box.
function fillShortcode(ta) {
  const at = ta.selectionStart;
  if (at !== ta.selectionEnd) return;
  const m = /(^|[^\w`]):([a-z0-9_+\-]{1,32}):$/i.exec(ta.value.slice(0, at));
  const ch = m && EMOJI_BY_NAME[m[2].toLowerCase()];
  if (!ch) return;
  const start = at - m[2].length - 2;
  ta.value = ta.value.slice(0, start) + ch + ta.value.slice(at);
  ta.setSelectionRange(start + ch.length, start + ch.length);
  rememberEmoji(ch);
}
// @someone that will really ping (a person Zuno knows, @everyone/@here in servers and groups, or
// a role in this server) gets a highlight behind it while you type, just like after it's sent.
function validMentions(text) {
  const out = [];
  const inServer = state.view.type === 'channel';
  for (const m of text.matchAll(/(^|[\s(])@([a-z0-9_.]{2,32})/gi)) {
    const name = m[2].replace(/\.+$/, '').toLowerCase(), start = m.index + m[1].length;
    const ok = Object.values(state.users).some(u => u.username === name) || (inServer || isGroupConv(activeConv())) && (name === 'everyone' || name === 'here');
    if (ok) out.push([start, start + 1 + name.length]);
  }
  const sv = inServer && typeof currentServer === 'function' ? currentServer() : null;
  for (const r of (sv?.roles || []).filter(r => !r.everyone)) {
    const re = new RegExp('(^|[\\s(])@' + r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'gi');
    for (const m of text.matchAll(re)) out.push([m.index + m[1].length, m.index + m[0].length]);
  }
  return out.sort((a, b) => a[0] - b[0]).filter((r, i, a) => !i || r[0] >= a[i - 1][1]);
}
function drawMentionHighlights(ta) {
  const box = ta.parentElement;
  if (!box) return;
  let hl = $(':scope > .cmp-hl', box);
  if (!hl && !ta.value.includes('@')) return;
  const spans = validMentions(ta.value);
  if (!spans.length) { hl?.remove(); return; }
  if (!hl) {
    hl = document.createElement('div');
    hl.className = 'cmp-hl'; hl.setAttribute('aria-hidden', 'true');
    box.insertBefore(hl, ta);
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  }
  // The box's font and padding are copied once; its place and size only when they change.
  if (!hl._styled) {
    hl._styled = true;
    const cs = getComputedStyle(ta);
    for (const k of ['font', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textAlign', 'tabSize', 'wordSpacing']) hl.style[k] = cs[k];
  }
  const geo = `${ta.offsetLeft},${ta.offsetTop},${ta.clientWidth},${ta.clientHeight}`;
  if (hl._geo !== geo) { hl._geo = geo; Object.assign(hl.style, { left: ta.offsetLeft + 'px', top: ta.offsetTop + 'px', width: ta.clientWidth + 'px', height: ta.clientHeight + 'px' }); }
  let html = '', at = 0;
  for (const [s, e] of spans) { html += esc(ta.value.slice(at, s)) + `<mark class="cmp-m">${esc(ta.value.slice(s, e))}</mark>`; at = e; }
  html += esc(ta.value.slice(at)) + '\n';
  if (hl._html !== html) { hl._html = html; hl.innerHTML = html; }
  hl.scrollTop = ta.scrollTop;
}
const isMessageBox = el => el?.matches?.('#composer-input, .edit-box textarea, .thread-composer textarea');
document.addEventListener('input', e => {
  if (!isMessageBox(e.target)) return;
  fillShortcode(e.target);
  drawMentionHighlights(e.target);
}, true);
document.addEventListener('scroll', e => { if (isMessageBox(e.target)) { const hl = $(':scope > .cmp-hl', e.target.parentElement); if (hl) hl.scrollTop = e.target.scrollTop; } }, true);
// Sending (or a draft coming back) changes the text without typing.
document.addEventListener('keyup', e => { if (isMessageBox(e.target) && e.key === 'Enter') setTimeout(() => drawMentionHighlights(e.target), 0); }, true);
const _renderComposer26 = renderComposer;
renderComposer = function (...a) { const r = _renderComposer26(...a); const ta = $('#composer-input'); if (ta?.value) drawMentionHighlights(ta); return r; };

// ======================= blocking =======================
// Block or unblock from a member's right-click menu, a DM's right-click menu, and their profile.
// Blocked people can't message, call or friend you; in servers and groups their messages fold up
// into "Blocked message" (click to see it anyway).
const isBlockedByMe = id => (state.me?.blocked || []).includes(id);
const blockItem = id => (isBlockedByMe(id)
  ? { label: 'Unblock', icon: ico26('🔓'), run: () => unblock(id) }
  : { label: 'Block', icon: ico26('🚫'), danger: true, run: () => confirmBlock(id, () => renderMessages()) });
function ico26(e) { return `<span class="mi-ico">${e}</span>`; }
// Adds items to the next menu opened (for menus built inside other functions).
function withMenuExtra(add, open) {
  const _om = openMenu;
  openMenu = (anchor, items) => { openMenu = _om; return _om(anchor, add(items)); };
  try { return open(); } finally { if (openMenu !== _om) openMenu = _om; }
}
const _openMemberMenu26 = openMemberMenu;
openMemberMenu = function (sv, id, anchor) {
  const u = user(id);
  if (!u || u.bot || u.system || id === state.me.id) return _openMemberMenu26(sv, id, anchor);
  return withMenuExtra(items => [...items, blockItem(id)], () => _openMemberMenu26(sv, id, anchor));
};
const _openDmMenu26 = openDmMenu;
openDmMenu = function (anchor, conv) {
  const u = user(conv);
  if (isGroupConv(conv) || !u || u.bot || u.system) return _openDmMenu26(anchor, conv);
  return withMenuExtra(items => [...items, 'sep', { label: 'Profile', icon: ico26('👤'), run: () => openProfile(conv) }, blockItem(conv)], () => _openDmMenu26(anchor, conv));
};
// Messages from people you blocked, in servers and groups.
state.showBlocked ||= new Set();
const _renderMessagesB26 = renderMessages;
renderMessages = function (...a) {
  const r = _renderMessagesB26(...a);
  const conv = activeConv(), convo = state.convos[conv], el = $('#messages');
  if (!el || !convo || !(state.me?.blocked || []).length || chatVideoFull()) return r;
  const byId = new Map(convo.messages.map(m => [m.id, m]));
  let run = null;
  for (const row of $$(':scope > .msg[data-id]', el)) {
    const m = byId.get(row.dataset.id);
    if (!m || !isBlockedByMe(m.authorId) || state.showBlocked.has(m.id)) { run = null; continue; }
    row.classList.add('blocked-hidden');
    if (!run) {
      run = document.createElement('button');
      run.className = 'blocked-run'; run.dataset.ids = '';
      row.before(run);
    }
    run.dataset.ids += (run.dataset.ids ? ',' : '') + m.id;
    const n = run.dataset.ids.split(',').length;
    run.innerHTML = `${uiIcon('ban')}<span>${n} blocked message${n === 1 ? '' : 's'}</span><b>Show</b>`;
  }
  return r;
};
document.addEventListener('click', e => {
  const b = e.target.closest?.('.blocked-run');
  if (!b) return;
  for (const id of b.dataset.ids.split(',')) state.showBlocked.add(id);
  renderMessages();
});

// ======================= message someone from their profile =======================
// A "Message @name" box at the bottom of someone's profile: type and press Enter to send it to
// them (as a message request if you aren't friends yet).
const _wireProfileExtras26 = wireProfileExtras;
wireProfileExtras = function (ov, u) {
  _wireProfileExtras26(ov, u);
  const card = $('.pcard', ov) || $('.modal', ov);
  if (!card || !u || u.system || u.bot || u.id === state.me.id) return;
  // Block / Unblock next to the profile's buttons.
  const acts = $('.pc-actions', card) || card;
  if (!$('.pc-block', card)) {
    const b = document.createElement('button');
    b.className = 'pc-block btn btn-grey'; b.title = isBlockedByMe(u.id) ? 'Unblock' : 'Block';
    b.innerHTML = uiIcon(isBlockedByMe(u.id) ? 'unlock' : 'ban') + `<span>${isBlockedByMe(u.id) ? 'Unblock' : 'Block'}</span>`;
    b.addEventListener('click', () => { closeLayer(); blockItem(u.id).run(); });
    acts.append(b);
  }
  if (isBlockedByMe(u.id) || $('.pc-msg', card)) return;
  const f = document.createElement('form');
  f.className = 'pc-msg';
  f.innerHTML = `<input maxlength="${limits().message}" placeholder="Message @${esc(u.username)}" aria-label="Message ${esc(u.displayName)}"><button class="icon-btn" title="Send">${uiIcon('forward')}</button>`;
  card.append(f);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('input', f), text = replaceShortcodes(input.value.trim());
    if (!text) return;
    input.disabled = true;
    try {
      await api('POST', `/api/dms/${u.id}/messages`, { content: text });
      delete state.convos[u.id];
      toast(`Sent to ${u.displayName}`);
      input.value = '';
      refresh({}).catch(() => {});
      if (activePeer?.() === u.id) openDM(u.id);
    } catch (err) { toast(err.message, true); }
    input.disabled = false; input.focus();
  });
};

// ======================= live events helper =======================
const liveHandlers26 = [];
// Each handler is attached once to every live connection. (Handlers registered before the first
// connection existed used to wait for a reconnect, so live game updates and the like never arrived.)
const live26Seen = new WeakMap(); // connection -> Set of handlers already on it
function attach26(es, ev, fn) {
  if (!es) return;
  let set = live26Seen.get(es);
  if (!set) live26Seen.set(es, (set = new Set()));
  if (set.has(fn)) return;
  set.add(fn);
  es.addEventListener(ev, e => { try { fn(JSON.parse(e.data || '{}')); } catch (err) { console.error(err); } });
}
function onLive26(ev, fn) { liveHandlers26.push([ev, fn]); attach26(state.es, ev, fn); }
(function waitEs26() {
  if (!state.es) return setTimeout(waitEs26, 300);
  for (const [ev, fn] of liveHandlers26) attach26(state.es, ev, fn);
  const _connect26 = connect;
  connect = function (...a) { const r = _connect26(...a); for (const [ev, fn] of liveHandlers26) attach26(state.es, ev, fn); return r; };
})();

// ======================= clips =======================
// Clips are off until you turn them on (they record while you're in a call, which takes some work
// from your computer). Then, in a call or voice channel, press the clip button (or Ctrl+Shift+C)
// to save the last 30 seconds:
// everyone's voices, stream sound, and the stream or camera you're looking at. Clips stay on this
// device (Settings › Voice & Video › Clips) until you send one with + › Send A Clip.
// Everyone in the call is told when someone clips.
const CLIP_DEFAULTS = { on: false, seconds: 30, key: 'KeyC', keyName: 'Ctrl+Shift+C', ctrl: true, shift: true, alt: false };
const clipPrefs = () => { try { return { ...CLIP_DEFAULTS, ...JSON.parse(localStorage.getItem('zuno_clips') || '{}') }; } catch { return { ...CLIP_DEFAULTS }; } };
const saveClipPrefs = p => { try { localStorage.setItem('zuno_clips', JSON.stringify(p)); } catch {} };
const clipSupported = () => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;

// Clips are kept in this browser's storage (IndexedDB), newest 25.
function clipDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('zuno-clips', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function clipStore(mode, fn) { const db = await clipDb(); return new Promise((resolve, reject) => { const tx = db.transaction('clips', mode); const out = fn(tx.objectStore('clips')); tx.oncomplete = () => resolve(out?.result ?? out); tx.onerror = () => reject(tx.error); }); }
const listClips = async () => ((await clipStore('readonly', s => s.getAll())) || []).sort((a, b) => b.at - a.at);
async function saveClip(clip) {
  await clipStore('readwrite', s => s.put(clip));
  const all = await listClips();
  for (const old of all.slice(25)) await clipStore('readwrite', s => s.delete(old.id));
}
const deleteClip = id => clipStore('readwrite', s => s.delete(id));

const clipRec = { recs: [], timer: null, draw: null, canvas: null, vid: null, ac: null, dest: null, wired: new Set(), room: null };
function clipMime() { return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || ''; }
function clipRoomName() {
  const room = Calls.room || '';
  if (room.startsWith('vc:')) { for (const sv of state.servers) { const ch = sv.channels.find(c => 'vc:' + c.id === room); if (ch) return `${ch.name} · ${sv.name}`; } }
  return 'Call';
}
function clipStart() {
  if (clipRec.timer || !clipSupported() || !Calls.room || !clipPrefs().on) return;
  clipRec.room = Calls.room;
  // The picture: whatever video you're watching, drawn onto a canvas (so it can change mid-clip).
  const cv = clipRec.canvas = document.createElement('canvas');
  cv.width = 960; cv.height = 540;
  const g = cv.getContext('2d');
  const vid = clipRec.vid = document.createElement('video');
  vid.muted = true; vid.playsInline = true;
  let lastTrack = null;
  clipRec.draw = setInterval(() => {
    const t = Calls.clipSources?.().video || null;
    if (t !== lastTrack) { lastTrack = t; vid.srcObject = t ? new MediaStream([t]) : null; if (t) vid.play().catch(() => {}); }
    g.fillStyle = '#0f1716'; g.fillRect(0, 0, cv.width, cv.height);
    if (t && vid.videoWidth) {
      const s = Math.min(cv.width / vid.videoWidth, cv.height / vid.videoHeight), w = vid.videoWidth * s, h = vid.videoHeight * s;
      g.drawImage(vid, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    } else {
      g.fillStyle = '#04c5ae'; g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('Zuno', cv.width / 2, cv.height / 2 - 10);
      g.fillStyle = '#9aa6a4'; g.font = '28px system-ui, sans-serif';
      g.fillText(clipRoomName(), cv.width / 2, cv.height / 2 + 40);
    }
  }, 1000 / 24);
  // The sound: every voice and stream in the call, mixed.
  clipRec.ac = new (window.AudioContext || window.webkitAudioContext)();
  clipRec.dest = clipRec.ac.createMediaStreamDestination();
  clipRec.wired = new Set();
  const wire = () => { for (const t of Calls.clipSources?.().audio || []) if (!clipRec.wired.has(t.id)) { clipRec.wired.add(t.id); try { clipRec.ac.createMediaStreamSource(new MediaStream([t])).connect(clipRec.dest); } catch {} } };
  wire();
  const stream = new MediaStream([...cv.captureStream(24).getVideoTracks(), ...clipRec.dest.stream.getAudioTracks()]);
  // A new recording starts every half clip-length, so one of them always holds the last N seconds.
  const begin = () => {
    wire();
    const secs = clipPrefs().seconds;
    try {
      const rec = new MediaRecorder(stream, { mimeType: clipMime(), videoBitsPerSecond: 1.8e6 });
      const item = { rec, chunks: [], at: Date.now() };
      rec.ondataavailable = e => { if (e.data.size) item.chunks.push(e.data); };
      rec.start(1000);
      clipRec.recs.push(item);
    } catch {}
    const now = Date.now();
    // Recordings older than 1.5× the clip length aren't needed any more.
    for (const it of clipRec.recs.filter(it => now - it.at > secs * 1500 + 2000 && clipRec.recs.length > 2)) { try { it.rec.stop(); } catch {} clipRec.recs.splice(clipRec.recs.indexOf(it), 1); }
  };
  begin();
  clipRec.timer = setInterval(begin, clipPrefs().seconds * 500);
}
function clipStop() {
  clearInterval(clipRec.timer); clearInterval(clipRec.draw);
  for (const it of clipRec.recs) { try { it.rec.stop(); } catch {} }
  clipRec.recs = []; clipRec.timer = null; clipRec.draw = null;
  if (clipRec.vid) clipRec.vid.srcObject = null;
  clipRec.ac?.close().catch(() => {}); clipRec.ac = null;
}
async function takeClip() {
  if (!Calls.room) return toast('Join a call or voice channel to clip it.');
  if (!clipSupported()) return toast("Clips don't work in this browser.", true);
  if (!clipPrefs().on) { saveClipPrefs({ ...clipPrefs(), on: true }); clipStart(); return toast(`Clips are on. Zuno now keeps the last ${clipPrefs().seconds} seconds of your calls on this device: press clip again to save them. (Settings › Voice & Video › Clips)`); }
  if (!clipRec.timer) { clipStart(); return toast('Getting ready to clip. Try again in a few seconds.'); }
  const secs = clipPrefs().seconds, now = Date.now();
  // The recording that started closest to N seconds ago (but not after it).
  const pick = clipRec.recs.filter(it => now - it.at >= secs * 1000 - 500).sort((a, b) => a.at - b.at).pop() || clipRec.recs[0];
  if (!pick) return;
  clipRec.recs.splice(clipRec.recs.indexOf(pick), 1);
  const blob = await new Promise(resolve => { pick.rec.onstop = () => resolve(new Blob(pick.chunks, { type: 'video/webm' })); try { pick.rec.stop(); } catch { resolve(new Blob(pick.chunks, { type: 'video/webm' })); } });
  if (!blob.size) return toast("That clip came out empty. Try again in a moment.", true);
  const clip = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: now, name: clipRoomName(), seconds: Math.round((now - pick.at) / 1000), blob };
  await saveClip(clip);
  api('POST', '/api/rtc/clipped', { room: Calls.room }).catch(() => {});
  sfx26();
  toast(`Clipped! ${clip.seconds}s saved. Send it with + › Send A Clip.`);
}
function sfx26() { try { Calls.synth.tone([[880, 0], [1320, 0.09]], 0.06); } catch {} }
window.zunoClips = {
  on: () => clipSupported(),
  seconds: () => clipPrefs().seconds,
  keyName: () => clipPrefs().keyName,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/><circle cx="6.5" cy="9.5" r="1" fill="currentColor"/></svg>',
  clip: takeClip,
};
// Recording runs while you're in a call with clips on.
setInterval(() => {
  const want = !!Calls.room && clipPrefs().on && clipSupported();
  if (want && (!clipRec.timer || clipRec.room !== Calls.room)) { clipStop(); clipStart(); }
  else if (!want && clipRec.timer) clipStop();
}, 1500);
document.addEventListener('keydown', e => {
  const p = clipPrefs();
  if (!p.on || !Calls.room || e.code !== p.key || e.ctrlKey !== p.ctrl || e.shiftKey !== p.shift || e.altKey !== p.alt) return;
  // (0.38.3) A plain key (no Ctrl/Alt) while you're typing is just typing.
  if (!p.ctrl && !p.alt && e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
  takeClip();
});
onLive26('clipped', d => { if (d.room === Calls.room) toast(`${d.name || 'Someone'} clipped the call`); });

// Settings › Voice & Video › Clips.
const _renderVoiceSettings26 = renderVoiceSettings;
renderVoiceSettings = async function (body, ...a) {
  const r = await _renderVoiceSettings26(body, ...a);
  const p = clipPrefs();
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">Clips</h4>
    <label class="setting-row"><div><div class="setting-title">Clips</div><div class="setting-desc">${clipSupported() ? 'In a call or voice channel, save the last few seconds with the clip button or your shortcut. Everyone in the call sees a note when you clip.' : "This browser can't record clips."}</div></div><input type="checkbox" class="switch" id="clip-on"${p.on ? ' checked' : ''}></label>
    <div class="setting-row"><div><div class="setting-title">Clip length</div></div><select class="sc-select" id="clip-len">${[15, 30, 60].map(s => `<option value="${s}"${p.seconds === s ? ' selected' : ''}>${s} seconds</option>`).join('')}</select></div>
    <div class="setting-row"><div><div class="setting-title">Shortcut</div><div class="setting-desc">Click, then press the keys you want.</div></div><button class="btn btn-grey btn-sm" id="clip-key">${esc(p.keyName)}</button></div>
    <div class="setting-row"><div><div class="setting-title">Your clips</div><div class="setting-desc" id="clip-count">Saved on this device.</div></div><button class="btn btn-grey btn-sm" id="clip-open">See clips</button></div>`;
  body.append(g);
  listClips().then(l => { $('#clip-count', g).textContent = `${l.length} clip${l.length === 1 ? '' : 's'} saved on this device.`; }).catch(() => {});
  $('#clip-on', g).addEventListener('change', e => { saveClipPrefs({ ...clipPrefs(), on: e.target.checked }); });
  $('#clip-len', g).addEventListener('change', e => { saveClipPrefs({ ...clipPrefs(), seconds: Number(e.target.value) }); if (clipRec.timer) { clipStop(); clipStart(); } });
  $('#clip-key', g).addEventListener('click', e => {
    const b = e.currentTarget; b.textContent = 'Press keys…';
    const grab = ev => {
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(ev.key)) return;
      ev.preventDefault(); ev.stopPropagation();
      const name = [ev.ctrlKey && 'Ctrl', ev.altKey && 'Alt', ev.shiftKey && 'Shift', ev.code.replace(/^Key|^Digit/, '')].filter(Boolean).join('+');
      saveClipPrefs({ ...clipPrefs(), key: ev.code, keyName: name, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey });
      b.textContent = name;
      document.removeEventListener('keydown', grab, true);
    };
    document.addEventListener('keydown', grab, true);
  });
  $('#clip-open', g).addEventListener('click', () => openClips());
  return r;
};

// The clip library: watch, delete, or send one to the chat you're in.
async function openClips(sendTo = null) {
  let clips = [];
  try { clips = await listClips(); } catch {}
  const urls = [];
  const ov = openLayer(`<div class="dialog modal clips-dlg"><h3>${sendTo ? 'Send A Clip' : 'Your Clips'}</h3>
    ${clips.length ? `<div class="clip-grid">${clips.map(c => { const u = URL.createObjectURL(c.blob); urls.push(u); return `<div class="clip-card" data-clip="${esc(c.id)}"><video src="${u}#t=0.1" preload="metadata" muted playsinline></video><div class="clip-meta"><b>${esc(c.name)}</b><span class="muted small">${fmtTime(c.at)} · ${c.seconds}s · ${fmtSize(c.blob.size)}</span></div><div class="clip-acts">${sendTo ? '<button class="btn btn-primary btn-sm" data-send>Send</button>' : ''}<button class="btn btn-grey btn-sm" data-play>Play</button><button class="btn btn-link btn-sm" data-del>Delete</button></div></div>`; }).join('')}</div>`
      : `<div class="fp-empty">${mascot('curious')}<div>No clips yet. In a call or voice channel, press the clip button (or ${esc(clipPrefs().keyName)}) to save the last ${clipPrefs().seconds} seconds.</div></div>`}
    <div class="actions"><button class="btn btn-primary" data-a="done">Done</button></div></div>`);
  const cleanup = () => urls.forEach(u => URL.revokeObjectURL(u));
  $('[data-a=done]', ov).addEventListener('click', () => { cleanup(); dismissLayer(); });
  for (const card of $$('.clip-card', ov)) {
    const clip = clips.find(c => c.id === card.dataset.clip), v = $('video', card);
    $('[data-play]', card).addEventListener('click', () => { v.muted = false; v.controls = true; v.play().catch(() => {}); });
    $('[data-del]', card).addEventListener('click', async () => { await deleteClip(clip.id); card.remove(); });
    $('[data-send]', card)?.addEventListener('click', () => {
      cleanup(); closeLayer();
      const stamp = new Date(clip.at).toISOString().slice(0, 19).replace(/[T:]/g, '-');
      addFiles(sendTo, [new File([clip.blob], `zuno-clip-${stamp}.webm`, { type: 'video/webm' })]);
    });
  }
}

// + in the message box: "Send An Image/Video" or "Send A Clip".
window.addEventListener('click', e => {
  const plus = e.target.closest?.('#composer-plus');
  if (!plus || plus.disabled) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const conv = activeConv();
  openMenu(plus, [
    { label: 'Send An Image/Video', icon: ico26('🖼️'), run: () => (typeof pickMedia === 'function' ? pickMedia() : $('#composer-file')?.click()) },
    { label: 'Send A Clip', icon: `<span class="mi-ico">${window.zunoClips.icon}</span>`, run: () => openClips(conv) },
    { label: 'Upload a File', icon: ico26('📎'), run: () => $('#composer-file')?.click() },
  ]);
}, true);

// ======================= chat in voice channels =======================
// Every voice channel has its own chat. "Chat" in a voice channel opens it with the call on top;
// "Voice" goes back to the big call view.
const _openChannel26 = openChannel;
openChannel = async function (serverId, channelId, opts = {}) {
  const r = await _openChannel26(serverId, channelId, opts);
  if (state.view.type === 'channel' && state.view.voice && state.view.channelId === channelId && !$('#vc-back')) {
    const b = document.createElement('button');
    b.className = 'icon-btn vc-chat-btn'; b.id = 'vc-back';
    const inIt = Calls.room === 'vc:' + channelId;
    b.title = inIt ? 'Voice view' : 'Join Voice'; b.innerHTML = `${ICON.speaker}<span>${inIt ? 'Voice' : 'Join Voice'}</span>`;
    b.addEventListener('click', () => openVoice(serverId, channelId));
    $('#main .topbar .spacer')?.after(b);
  }
  return r;
};

// "Seen" goes on the same side as your message: under it on the left, or on the right when your
// messages are drawn on the right.
const _renderSeen26 = renderSeen;
renderSeen = function (...a) {
  const r = _renderSeen26(...a);
  const tag = $('#messages .seen-tag'), content = tag?.closest('.msg')?.querySelector('.content, .msg-media');
  // (0.55.1) Measure the words themselves, not their box: in the flat style the box spans the whole
  // chat, which made "Seen" jump to the far right on PC.
  if (tag && content) {
    const row = tag.closest('.msg').getBoundingClientRect();
    let c = content.getBoundingClientRect();
    try { const rg = document.createRange(); rg.selectNodeContents(content); const t = rg.getBoundingClientRect(); if (t.width) c = t; } catch {}
    tag.classList.toggle('right', c.left - row.left > row.right - c.right);
  }
  return r;
};

// ======================= smooth scrolling =======================
// Mark the chat as scrolling for a moment after each scroll step (see .scrolling in zuno26.css).
{
  let scrollIdle = 0, intent = 0;
  // Only your own scrolling turns off hovering. The chat keeping itself at the bottom doesn't, or the
  // newest message under your mouse flickers in and out of hover and can't be clicked.
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) addEventListener(ev, () => { intent = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('scroll', e => {
    const el = e.target;
    if (el.id !== 'messages' || Date.now() - intent > 600) return;
    if (!el.classList.contains('scrolling')) el.classList.add('scrolling');
    clearTimeout(scrollIdle);
    scrollIdle = setTimeout(() => el.classList.remove('scrolling'), 140);
  }, { capture: true, passive: true });
}

// ======================= Spotify links open in Spotify =======================
// A Spotify song (or album, playlist, artist, podcast) link in a bio, message or widget opens in the
// Spotify app. Without the app, it opens in the browser like any link.
const SPOTIFY_LINK = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})/;
document.addEventListener('click', async e => {
  const a = e.target.closest?.('a[href]');
  const m = a && SPOTIFY_LINK.exec(a.href);
  if (!m || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault(); e.stopPropagation();
  const uri = `spotify:${m[1]}:${m[2]}`, web = a.href;
  if (window.zunoDesktop?.openSpotify) { if (!(await window.zunoDesktop.openSpotify(uri))) window.open(web, '_blank', 'noopener'); return; }
  // Firefox shows an error page for app links it doesn't know, so it gets the web player.
  if (/firefox/i.test(navigator.userAgent)) return window.open(web, '_blank', 'noopener');
  // In a browser: ask for the app; if nothing takes over the page within a moment, use the web player.
  let left = false;
  const gone = () => { left = true; };
  window.addEventListener('blur', gone, { once: true });
  document.addEventListener('visibilitychange', gone, { once: true });
  location.href = uri;
  setTimeout(() => {
    window.removeEventListener('blur', gone); document.removeEventListener('visibilitychange', gone);
    if (!left) window.open(web, '_blank', 'noopener');
  }, 2500);
}, true);
