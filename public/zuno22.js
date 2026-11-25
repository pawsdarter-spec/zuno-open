'use strict';
// Zuno 0.22: Zuno's own video player, chat themes & wallpapers for DMs and groups, the ban screen
// with appeals (and the staff Appeals tab).

// ======================= the video player =======================
// Every video in chat gets Zuno's player: big play button, a seek bar you can drag (with what's
// loaded shown), time, volume, speed, picture-in-picture, fullscreen and download. Keyboard:
// Space/K play, ←/→ 5s, J/L 10s, ↑/↓ volume, M mute, F fullscreen. On phones: double-tap the left
// or right side to jump 10s. Only one video plays at a time, and a video keeps playing when new
// messages arrive.
const ZP_ICON = {
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15 8.5a5 5 0 0 1 0 7l-1.2-1.2a3.3 3.3 0 0 0 0-4.6zm2.5-2.5a8.5 8.5 0 0 1 0 12l-1.2-1.2a6.8 6.8 0 0 0 0-9.6z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15.3 9.3l1.2-1.2 2 2 2-2 1.2 1.2-2 2 2 2-1.2 1.2-2-2-2 2-1.2-1.2 2-2z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>',
  exitFull: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h18v14H3zm2 2v10h14V7zm7 4h6v5h-6z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 4h2v8.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/></svg>',
};
const zpClock = s => { if (!isFinite(s)) return '0:00'; s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const zpPrefs = () => { try { return { vol: 1, muted: false, ...JSON.parse(localStorage.getItem('zuno_player') || '{}') }; } catch { return { vol: 1, muted: false }; } };
const zpSave = v => { try { localStorage.setItem('zuno_player', JSON.stringify({ vol: v.volume, muted: v.muted })); } catch {} };

videoHtml = function (a, key = '') {
  const src = a.kind === 'video' ? a.url : a.url + (a.url.includes('?') ? '&' : '?') + 'play=1';
  return `<div class="msg-media msg-video"><div class="zp paused" tabindex="0" data-zp="${esc(key + '|' + src)}" aria-label="Video: ${esc(a.name)}">
    <video playsinline preload="metadata" src="${esc(src)}#t=0.1"></video>
    <button class="zp-big" data-zp-act="play" aria-label="Play">${ZP_ICON.play}</button>
    <div class="zp-spin" aria-hidden="true"></div>
    <div class="zp-seekhint" aria-hidden="true"></div>
    <div class="zp-err hidden">Can't play this video here. <a href="${esc(a.url)}" download="${esc(a.name)}">Download it</a></div>
    <div class="zp-bar">
      <div class="zp-track" data-zp-act="seek" role="slider" aria-label="Seek" tabindex="-1"><i class="zp-buf"></i><i class="zp-played"></i><i class="zp-thumb"></i><span class="zp-tip"></span></div>
      <div class="zp-row">
        <button data-zp-act="play" class="zp-play" aria-label="Play">${ZP_ICON.play}</button>
        <span class="zp-time">0:00 / 0:00</span>
        <span class="zp-grow"></span>
        <span class="zp-volbox"><button data-zp-act="mute" class="zp-mute" aria-label="Mute">${ZP_ICON.vol}</button><input type="range" class="zp-vol" min="0" max="1" step="0.05" aria-label="Volume"></span>
        <button data-zp-act="speed" class="zp-speed" aria-label="Playback speed">1×</button>
        ${document.pictureInPictureEnabled ? `<button data-zp-act="pip" aria-label="Picture in picture" title="Picture in picture">${ZP_ICON.pip}</button>` : ''}
        <a class="zp-dl" href="${esc(a.url)}" download="${esc(a.name)}" aria-label="Download" title="Download (${fmtSize(a.size)})">${ZP_ICON.dl}</a>
        <button data-zp-act="full" class="zp-full" aria-label="Fullscreen" title="Fullscreen">${ZP_ICON.full}</button>
      </div>
    </div></div></div>`;
};
// The message id makes each player's key unique, so a playing video can be kept across redraws.
const _mediaHtml22 = mediaHtml;
mediaHtml = function (m) {
  return _mediaHtml22(m).replace(/data-zp="\|/g, `data-zp="${esc(m.id || '')}|`);
};

const zpOf = el => el?.closest?.('.zp');
const zpVideo = zp => $('video', zp);
function zpSetup(zp) {
  if (zp.dataset.ready) return;
  zp.dataset.ready = '1';
  const v = zpVideo(zp), p = zpPrefs();
  v.volume = p.vol; v.muted = p.muted;
  zpSync(zp);
}
function zpSync(zp) {
  const v = zpVideo(zp);
  if (!v) return;
  const playing = !v.paused && !v.ended;
  zp.classList.toggle('paused', !playing);
  zp.classList.toggle('ended', v.ended);
  for (const b of $$('[data-zp-act="play"]', zp)) { b.innerHTML = v.ended ? ZP_ICON.replay : playing ? ZP_ICON.pause : ZP_ICON.play; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
  $('.zp-mute', zp).innerHTML = v.muted || v.volume === 0 ? ZP_ICON.mute : ZP_ICON.vol;
  $('.zp-vol', zp).value = v.muted ? 0 : v.volume;
  $('.zp-speed', zp).textContent = (v.playbackRate === 1 ? '1' : v.playbackRate) + '×';
  zpTime(zp);
}
function zpTime(zp) {
  const v = zpVideo(zp), d = v.duration || 0, t = zp.scrubbing ?? v.currentTime;
  $('.zp-time', zp).textContent = `${zpClock(t)} / ${zpClock(d)}`;
  const pct = d ? (t / d) * 100 : 0;
  $('.zp-played', zp).style.width = pct + '%';
  $('.zp-thumb', zp).style.left = pct + '%';
  let buf = 0;
  for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5) buf = Math.max(buf, v.buffered.end(i));
  $('.zp-buf', zp).style.width = (d ? (buf / d) * 100 : 0) + '%';
}
function zpPlay(zp) {
  const v = zpVideo(zp);
  for (const other of $$('.zp video')) if (other !== v && !other.paused) other.pause(); // one at a time
  if (v.ended) v.currentTime = 0;
  v.play().catch(() => {});
}
const zpToggle = zp => { const v = zpVideo(zp); v.paused || v.ended ? zpPlay(zp) : v.pause(); };
function zpSeekBy(zp, s) {
  const v = zpVideo(zp);
  v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.05, v.currentTime + s));
  const hint = $('.zp-seekhint', zp);
  hint.textContent = (s > 0 ? '⏩ +' : '⏪ ') + s + 's';
  hint.className = 'zp-seekhint show ' + (s > 0 ? 'right' : 'left');
  clearTimeout(hint.t); hint.t = setTimeout(() => (hint.className = 'zp-seekhint'), 600);
  zpWake(zp);
}
async function zpFullscreen(zp) {
  const v = zpVideo(zp);
  if (document.fullscreenElement) return document.exitFullscreen();
  if (zp.requestFullscreen) return zp.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
  v.webkitEnterFullscreen?.(); // iPhone: only the video itself can go fullscreen
}
// Controls fade out while a video plays and you're not touching it.
function zpWake(zp) {
  zp.classList.add('awake');
  clearTimeout(zp.sleepT);
  zp.sleepT = setTimeout(() => { if (!zpVideo(zp)?.paused && !zp.scrubbing) zp.classList.remove('awake'); }, 2500);
}
const zpTrackPos = (zp, x) => { const r = $('.zp-track', zp).getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };

// Media events don't bubble, so they're caught on the way down.
for (const ev of ['play', 'pause', 'ended', 'volumechange', 'ratechange', 'loadedmetadata']) document.addEventListener(ev, e => { const zp = zpOf(e.target); if (zp) { zpSetup(zp); zpSync(zp); if (ev === 'play') zpWake(zp); } }, true);
// The player takes the video's shape (phone videos are tall), up to a sensible size.
document.addEventListener('loadedmetadata', e => {
  const zp = zpOf(e.target), v = e.target;
  if (!zp || !v.videoWidth || zp.classList.contains('is-full')) return;
  zp.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
  const box = zp.closest('.msg-video');
  if (box) box.style.width = `min(${Math.round(Math.min(480, (420 * v.videoWidth) / v.videoHeight))}px, 100%)`;
}, true);
for (const ev of ['timeupdate', 'progress', 'durationchange']) document.addEventListener(ev, e => { const zp = zpOf(e.target); if (zp) zpTime(zp); }, true);
document.addEventListener('waiting', e => zpOf(e.target)?.classList.add('loading'), true);
for (const ev of ['playing', 'canplay', 'pause']) document.addEventListener(ev, e => zpOf(e.target)?.classList.remove('loading'), true);
document.addEventListener('error', e => { const zp = zpOf(e.target); if (zp && e.target.tagName === 'VIDEO') { zp.classList.add('failed'); $('.zp-err', zp).classList.remove('hidden'); } }, true);
document.addEventListener('fullscreenchange', () => {
  for (const zp of $$('.zp')) {
    const full = document.fullscreenElement === zp, b = $('.zp-full', zp);
    zp.classList.toggle('is-full', full);
    b.innerHTML = full ? ZP_ICON.exitFull : ZP_ICON.full;
    b.title = full ? 'Exit fullscreen' : 'Fullscreen'; b.setAttribute('aria-label', b.title);
    if (full) { zp.focus({ preventScroll: true }); zpWake(zp); }
  }
});
// Zuno's own right-click menus can't show over a fullscreen video, so the browser's one is used there.
document.addEventListener('contextmenu', e => { if (zpOf(e.target) && document.fullscreenElement === zpOf(e.target)) e.stopPropagation(); }, true);

let zpTap = { t: 0, x: 0 };
document.addEventListener('click', e => {
  const zp = zpOf(e.target);
  if (!zp) return;
  zpSetup(zp);
  const act = e.target.closest('[data-zp-act]')?.dataset.zpAct;
  if (e.target.closest('.zp-dl, .zp-err a')) return;
  e.preventDefault(); e.stopPropagation();
  const v = zpVideo(zp);
  zpWake(zp);
  if (act === 'play') return zpToggle(zp);
  if (act === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; zpSave(v); return; }
  if (act === 'speed') { const steps = [0.5, 0.75, 1, 1.25, 1.5, 2]; v.playbackRate = steps[(steps.indexOf(v.playbackRate) + 1) % steps.length] || 1; return; }
  if (act === 'pip') return (document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
  if (act === 'full') return zpFullscreen(zp);
  if (act === 'seek' || e.target.closest('.zp-bar')) return;
  // A tap on the picture: play/pause. On touch screens, a quick second tap on a side jumps 10s.
  const touch = matchMedia('(hover: none)').matches;
  if (touch) {
    const r = zp.getBoundingClientRect(), side = e.clientX < r.left + r.width / 3 ? -1 : e.clientX > r.right - r.width / 3 ? 1 : 0;
    if (side && Date.now() - zpTap.t < 300 && Math.abs(e.clientX - zpTap.x) < 60) { clearTimeout(zpTap.timer); zpTap.t = 0; return zpSeekBy(zp, side * 10); }
    zpTap = { t: Date.now(), x: e.clientX, timer: setTimeout(() => { if (!zp.classList.contains('awake') || v.paused) zpToggle(zp); }, side ? 280 : 0) };
    return;
  }
  zpToggle(zp);
}, true);
document.addEventListener('dblclick', e => { const zp = zpOf(e.target); if (zp && !e.target.closest('.zp-bar') && !matchMedia('(hover: none)').matches) { e.preventDefault(); e.stopPropagation(); zpFullscreen(zp); } }, true);
document.addEventListener('input', e => {
  if (!e.target.matches?.('.zp-vol')) return;
  const v = zpVideo(zpOf(e.target)); v.volume = Number(e.target.value); v.muted = v.volume === 0; zpSave(v);
}, true);
// Dragging the seek bar.
document.addEventListener('pointerdown', e => {
  const track = e.target.closest?.('.zp-track');
  const zp = zpOf(track);
  if (!zp) return;
  e.preventDefault();
  zpSetup(zp);
  const v = zpVideo(zp);
  track.setPointerCapture?.(e.pointerId);
  const at = x => (zp.scrubbing = zpTrackPos(zp, x) * (v.duration || 0));
  at(e.clientX); zp.classList.add('scrubbing'); zpTime(zp);
  const move = ev => { at(ev.clientX); zpTime(zp); };
  const up = ev => {
    track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up);
    if (isFinite(zp.scrubbing)) v.currentTime = zp.scrubbing;
    zp.scrubbing = undefined; zp.classList.remove('scrubbing'); zpTime(zp); zpWake(zp);
  };
  track.addEventListener('pointermove', move); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
}, true);
// Hovering the seek bar shows the time there.
document.addEventListener('pointermove', e => {
  const zp = zpOf(e.target);
  if (!zp) return;
  zpWake(zp);
  const track = e.target.closest('.zp-track');
  if (!track) return;
  const f = zpTrackPos(zp, e.clientX), tip = $('.zp-tip', zp);
  tip.textContent = zpClock(f * (zpVideo(zp).duration || 0));
  tip.style.left = f * 100 + '%';
}, true);
document.addEventListener('keydown', e => {
  const zp = e.target.closest?.('.zp');
  if (!zp || e.target.matches('input')) return;
  const v = zpVideo(zp), k = e.key.toLowerCase();
  const acts = {
    ' ': () => zpToggle(zp), k: () => zpToggle(zp), arrowleft: () => zpSeekBy(zp, -5), arrowright: () => zpSeekBy(zp, 5), j: () => zpSeekBy(zp, -10), l: () => zpSeekBy(zp, 10),
    m: () => { v.muted = !v.muted; zpSave(v); }, f: () => zpFullscreen(zp),
    arrowup: () => { v.muted = false; v.volume = Math.min(1, v.volume + 0.1); zpSave(v); }, arrowdown: () => { v.volume = Math.max(0, v.volume - 0.1); zpSave(v); },
  };
  if (!acts[k]) return;
  e.preventDefault(); e.stopPropagation(); zpWake(zp); acts[k]();
}, true);

// A playing (or started) video survives the chat being redrawn: the same player is moved into the
// new page, so it doesn't stop or start over when a message arrives.
const _renderMessages22 = renderMessages;
renderMessages = function (...a) {
  const keep = new Map();
  for (const zp of $$('#messages .zp')) { const v = zpVideo(zp); if (v && (!v.paused || v.currentTime > 0.2)) keep.set(zp.dataset.zp, zp); }
  const r = _renderMessages22(...a);
  for (const [key, old] of keep) {
    const fresh = $(`#messages .zp[data-zp="${CSS.escape(key)}"]`);
    if (!fresh) continue;
    // The size the player picked for this video's shape lives on its box: the new box needs it too,
    // or a tall phone video stretched to the full width (and got huge) after the chat redrew.
    const width = old.closest('.msg-video')?.style.width, box = fresh.closest('.msg-video');
    fresh.replaceWith(old);
    if (box && width) box.style.width = width;
  }
  return r;
};

// ======================= chat themes & wallpapers =======================
// Pick a theme for a DM or group (🎨 in the top bar); everyone in the chat sees it. Each theme is a
// whole look: an animated scene behind the chat, bubble colors and style, a tinted top bar and
// message box, and a little burst of its own emoji when you send a message. A wallpaper (or your
// own picture) can replace the scene. The lists must match server/chatthemes.js.
//   scene: what moves behind the chat (see SCENES below); bg: the sky behind it;
//   me / them: your bubbles and theirs; meText: text on your bubbles; style: bubble shape/finish;
//   fx: emoji that burst out when you send.
const CHAT_THEMES = {
  default: { label: 'Zuno', emoji: '🌿' },
  ocean: { label: 'Ocean', emoji: '🌊', brand: '#2f8cff', me: 'linear-gradient(135deg,#2f8cff,#1d5fbf)', them: 'rgba(20,40,70,.78)', bg: 'linear-gradient(180deg,#06213d,#0a3a66)', scene: 'bubbles', colors: ['#9fd3ff'], style: 'glass', fx: ['🫧', '💧', '🐠'] },
  sunset: { label: 'Sunset', emoji: '🌅', brand: '#ff7a45', me: 'linear-gradient(135deg,#ff9a4d,#ff4f7b)', them: 'rgba(70,32,40,.8)', bg: 'linear-gradient(180deg,#2a1036 0%,#7a2c52 50%,#ff8a4c 100%)', scene: 'sky', colors: ['#ffd29b'], fx: ['🌅', '☀️', '🧡'] },
  forest: { label: 'Forest', emoji: '🌲', brand: '#4cc46f', me: 'linear-gradient(135deg,#46b866,#1f7a45)', them: 'rgba(20,45,30,.82)', bg: 'linear-gradient(180deg,#0b1f16,#123524)', scene: 'fireflies', colors: ['#d6ff7a'], fx: ['🌿', '🍃', '✨'] },
  galaxy: { label: 'Galaxy', emoji: '🪐', brand: '#8b7bff', me: 'linear-gradient(135deg,#7b5cff,#3d7bff)', them: 'rgba(25,22,55,.82)', bg: 'radial-gradient(ellipse at 30% 20%,#2a1f5c,transparent 60%),radial-gradient(ellipse at 80% 80%,#14305c,transparent 60%),#070816', scene: 'stars', colors: ['#ffffff', '#c9c2ff'], fx: ['✨', '🌟', '🪐'] },
  sakura: { label: 'Sakura', emoji: '🌸', brand: '#ff7eb3', me: 'linear-gradient(135deg,#ff9cc6,#ff6fa3)', them: 'rgba(60,30,45,.8)', bg: 'linear-gradient(180deg,#2b1a26,#3d2233)', scene: 'petals', colors: ['#ffc0dc', '#ffd6e8', '#ff9cc6'], style: 'soft', fx: ['🌸', '💮', '🌷'] },
  lava: { label: 'Lava Lamp', emoji: '🌋', brand: '#ff5a2e', me: 'linear-gradient(135deg,#ff7a2e,#d6261f)', them: 'rgba(60,20,15,.82)', bg: 'linear-gradient(180deg,#1a0805,#3a0f08)', scene: 'blobs', colors: ['#ff5a2e', '#ff9f1c', '#d6261f'], fx: ['🔥', '🌋', '💥'] },
  neon: { label: 'Neon', emoji: '⚡', brand: '#00f0ff', me: 'linear-gradient(135deg,#ff2bd6,#7a2bff)', them: 'rgba(10,10,30,.85)', bg: 'linear-gradient(180deg,#0a0016,#1a0033 60%,#2a0045)', scene: 'grid', colors: ['#ff2bd6', '#00f0ff'], style: 'glow', fx: ['⚡', '💜', '🔷'] },
  terminal: { label: 'Terminal', emoji: '💻', brand: '#33ff88', me: '#0b2a16', meText: '#7dffb0', them: '#0a140e', bg: '#030805', scene: 'scan', colors: ['#33ff88'], style: 'term', fx: ['▮', '01', '>_'] },
  lemon: { label: 'Lemonade', emoji: '🍋', brand: '#f5c518', me: 'linear-gradient(135deg,#ffe066,#f5a623)', meText: '#2a2000', them: 'rgba(60,50,15,.82)', bg: 'linear-gradient(180deg,#2a2410,#3a3012)', scene: 'rays', colors: ['#ffe066'], fx: ['🍋', '☀️', '🌼'] },
  aurora: { label: 'Aurora', emoji: '🌌', brand: '#3ee0c0', me: 'linear-gradient(135deg,#3ee0c0,#5b7bff)', them: 'rgba(15,35,45,.82)', bg: 'linear-gradient(180deg,#04121c,#081f2e)', scene: 'aurora', colors: ['#3ee0c0', '#7b5cff', '#2f8cff'], fx: ['🌌', '✨', '💚'] },
  dreamy: { label: 'Dreamy', emoji: '🦄', brand: '#b98cff', me: 'linear-gradient(135deg,#c79bff,#ff9bd8)', them: 'rgba(45,32,65,.75)', bg: 'linear-gradient(160deg,#1d1433,#2b1840 50%,#1a2340)', scene: 'orbs', colors: ['#c79bff', '#ff9bd8', '#8fd3ff'], style: 'glass', fx: ['💭', '🦄', '🌙'] },
  winter: { label: 'Winter', emoji: '❄️', brand: '#8fd3ff', me: 'linear-gradient(135deg,#9fdcff,#5aa8e6)', meText: '#06243a', them: 'rgba(30,45,60,.75)', bg: 'linear-gradient(180deg,#0f1c2b,#1d3147)', scene: 'snow', colors: ['#ffffff'], style: 'glass', fx: ['❄️', '☃️', '🌨️'] },
  love: { label: 'Love', emoji: '💖', brand: '#ff4d6d', me: 'linear-gradient(135deg,#ff5f7e,#e6247a)', them: 'rgba(60,22,35,.82)', bg: 'linear-gradient(180deg,#2a0c18,#3d1024)', scene: 'hearts', colors: ['#ff4d6d', '#ff8fab', '#ffb3c6'], style: 'soft', fx: ['❤️', '💖', '💕'] },
  coffee: { label: 'Coffee', emoji: '☕', brand: '#c8894f', me: 'linear-gradient(135deg,#c8894f,#8a5a33)', them: 'rgba(45,32,24,.86)', bg: 'linear-gradient(180deg,#1c140f,#2e2119)', scene: 'steam', colors: ['#f3e3d3'], fx: ['☕', '🍪', '🤎'] },
  candy: { label: 'Candy', emoji: '🍭', brand: '#ff5fb2', me: 'linear-gradient(135deg,#ff6fb5,#ffb03b)', them: 'rgba(55,28,48,.82)', bg: 'linear-gradient(180deg,#2a1530,#331b2e)', scene: 'sprinkles', colors: ['#ff5fb2', '#ffd23b', '#3ee0c0', '#8fd3ff'], style: 'soft', fx: ['🍭', '🍬', '🧁'] },
  grape: { label: 'Grape', emoji: '🍇', brand: '#9b6bff', me: 'linear-gradient(135deg,#9b6bff,#6a3fd6)', them: 'rgba(38,30,62,.86)', bg: 'linear-gradient(180deg,#160f29,#22173d)', scene: 'orbs', colors: ['#9b6bff', '#6a3fd6'], fx: ['🍇', '💜', '🔮'] },
  rose: { label: 'Rose', emoji: '🌹', brand: '#e8536b', me: 'linear-gradient(135deg,#e8536b,#b02a45)', them: 'rgba(55,25,32,.86)', bg: 'linear-gradient(180deg,#1f0f13,#2e1419)', scene: 'petals', colors: ['#e8536b', '#b02a45', '#ff8a9e'], fx: ['🌹', '🥀', '❣️'] },
  midnight: { label: 'Midnight', emoji: '🌙', brand: '#6b7cff', me: 'linear-gradient(135deg,#5b6cff,#2a338c)', them: 'rgba(22,26,46,.86)', bg: 'linear-gradient(180deg,#05070f,#0c1024)', scene: 'stars', colors: ['#c8d0ff'], fx: ['🌙', '⭐', '💤'] },
  mono: { label: 'Mono', emoji: '◼️', brand: '#d6dcdb', me: 'linear-gradient(135deg,#5a6362,#3a4140)', them: 'rgba(35,40,40,.86)', bg: 'linear-gradient(180deg,#111414,#1a1e1e)', scene: 'grain', colors: ['#ffffff'], style: 'mono', fx: ['◼️', '◻️', '▪️'] },
  mint: { label: 'Mint', emoji: '🌱', brand: '#3ee0c0', me: 'linear-gradient(135deg,#3ee0c0,#1b9e86)', meText: '#04261f', them: 'rgba(20,45,42,.86)', bg: 'linear-gradient(180deg,#071a17,#0d2a25)', scene: 'aurora', colors: ['#3ee0c0', '#9cffd9'], fx: ['🌱', '🍃', '💚'] },
};
// How many moving bits each scene has (kept small so it stays smooth on phones).
const SCENES = { bubbles: 18, sky: 6, fireflies: 22, stars: 40, petals: 18, blobs: 6, grid: 0, scan: 0, rays: 0, aurora: 3, orbs: 7, snow: 34, hearts: 14, steam: 6, sprinkles: 30, grain: 0 };
const WALLPAPERS = {
  none: { label: 'Theme scene', css: 'none' },
  plain: { label: 'Plain', css: 'none' },
  dots: { label: 'Dots', css: 'radial-gradient(color-mix(in srgb, var(--brand) 22%, transparent) 1.2px, transparent 1.4px) 0 0 / 18px 18px' },
  grid: { label: 'Grid', css: 'linear-gradient(color-mix(in srgb, var(--brand) 12%, transparent) 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, color-mix(in srgb, var(--brand) 12%, transparent) 1px, transparent 1px) 0 0 / 26px 26px' },
  waves: { label: 'Waves', css: 'radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--brand) 18%, transparent) 20%, transparent 21%) 0 0 / 40px 20px, radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--brand) 10%, transparent) 20%, transparent 21%) 20px 10px / 40px 20px' },
  stars: { label: 'Stars', css: 'radial-gradient(1.5px 1.5px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 60%, #fff6, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #fff5, transparent), radial-gradient(1px 1px at 85% 15%, #fff7, transparent) 0 0 / 160px 160px, linear-gradient(#0b1020, #10162b)' },
  hearts: { label: 'Hearts', css: 'radial-gradient(circle at 30% 35%, color-mix(in srgb, #ff5fb2 30%, transparent) 4px, transparent 5px) 0 0 / 34px 34px, radial-gradient(circle at 70% 35%, color-mix(in srgb, #ff5fb2 30%, transparent) 4px, transparent 5px) 0 0 / 34px 34px' },
  aurora: { label: 'Aurora', css: 'radial-gradient(ellipse at 20% 0%, #3ee0c044, transparent 60%), radial-gradient(ellipse at 80% 30%, #9b6bff44, transparent 60%), radial-gradient(ellipse at 50% 100%, #2f8cff33, transparent 60%)' },
  dusk: { label: 'Dusk', css: 'linear-gradient(160deg, #ff7a4533, #9b6bff26 50%, #2f8cff22)' },
  leaves: { label: 'Leaves', css: 'radial-gradient(ellipse 10px 5px at 50% 50%, #3fbf6b33 60%, transparent 62%) 0 0 / 36px 30px, radial-gradient(ellipse 5px 10px at 50% 50%, #3fbf6b26 60%, transparent 62%) 18px 15px / 36px 30px' },
  confetti: { label: 'Confetti', css: 'radial-gradient(#ff5fb255 2px, transparent 2.5px) 0 0 / 30px 30px, radial-gradient(#f2c23055 2px, transparent 2.5px) 10px 15px / 30px 30px, radial-gradient(#3ee0c055 2px, transparent 2.5px) 20px 5px / 30px 30px' },
};
// The same random-looking layout every time for a theme (so it doesn't jump around on redraws).
const sceneRand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
function sceneHtml(th, small = false) {
  if (!th?.scene) return '';
  const n = Math.round((SCENES[th.scene] || 0) * (small ? 0.5 : 1));
  const cs = th.colors || ['#fff'];
  const bits = Array.from({ length: n }, (_, i) => {
    const r = k => sceneRand(i, k);
    return `<i style="--x:${(r(1) * 100).toFixed(1)}%;--y:${(r(2) * 100).toFixed(1)}%;--d:-${(r(3) * 20).toFixed(2)}s;--t:${(6 + r(4) * 14).toFixed(1)}s;--s:${(0.4 + r(5) * 0.9).toFixed(2)};--c:${cs[i % cs.length]};--r:${Math.round(r(6) * 360)}deg"></i>`;
  }).join('');
  return `<div class="ct-scene sc-${th.scene}" aria-hidden="true" style="--bg:${th.bg};--c0:${cs[0]};--c1:${cs[1] || cs[0]};--c2:${cs[2] || cs[0]}">${bits}</div>`;
}
state.chatThemes = {};
const chatThemeKey = () => (state.view.type === 'dm' ? state.view.peerId : state.view.type === 'group' ? 'g:' + state.view.groupId : null);
async function loadChatThemes() { try { state.chatThemes = (await api('GET', '/api/chat-themes')).themes || {}; applyChatTheme(); } catch {} }
const THEME_CLASSES = Object.keys(CHAT_THEMES).map(k => 'ctheme-' + k);
function applyChatTheme() {
  const main = $('#main'), key = chatThemeKey();
  if (!main) return;
  const t = key ? state.chatThemes[key] : null;
  const name = CHAT_THEMES[t?.theme] && t.theme !== 'default' ? t.theme : null, th = name ? CHAT_THEMES[name] : {};
  main.classList.toggle('chat-themed', !!name);
  main.classList.remove(...THEME_CLASSES, 'cst-glass', 'cst-glow', 'cst-term', 'cst-soft', 'cst-mono');
  if (name) { main.classList.add('ctheme-' + name); if (th.style) main.classList.add('cst-' + th.style); }
  for (const [v, val] of [['--brand', th.brand], ['--bubble-me', th.me], ['--bubble-them', th.them], ['--bubble-me-text', th.meText]]) val ? main.style.setProperty(v, val) : main.style.removeProperty(v);
  const chat = $('.chat', main), w = t?.wallpaper;
  if (chat) {
    const wall = !!(w?.url || (w?.preset && w.preset !== 'plain'));
    chat.classList.toggle('has-wall', wall);
    chat.style.setProperty('--chat-wall', w?.url ? `url("${encodeURI(w.url)}") center / cover no-repeat` : WALLPAPERS[w?.preset]?.css || 'none');
    chat.style.setProperty('--chat-wall-dim', String((w?.dim ?? 0) / 100));
    // The theme's scene, unless a wallpaper (or "Plain") was picked. Only rebuilt when it changes.
    const sceneKey = !wall && w?.preset !== 'plain' && th.scene ? name : '';
    if (chat.dataset.scene !== sceneKey) {
      $('.ct-scene', chat)?.remove();
      if (sceneKey) chat.insertAdjacentHTML('afterbegin', sceneHtml(th));
      chat.dataset.scene = sceneKey;
    }
    chat.classList.toggle('has-scene', !!sceneKey);
  }
  // The 🎨 button in the top bar of DMs and groups.
  const bar = $('.topbar', main);
  if (bar && key && !$('#theme-btn', bar)) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'theme-btn'; b.title = 'Chat theme & wallpaper'; b.setAttribute('aria-label', 'Chat theme and wallpaper'); b.textContent = '🎨';
    b.addEventListener('click', openChatThemePicker);
    const at = $('#toggle-panel', bar) || $('#tb-more', bar);
    at ? at.before(b) : bar.appendChild(b);
    if (typeof compactTopbar === 'function') compactTopbar();
  }
}
const _renderMessages22t = renderMessages;
renderMessages = function (...a) { const r = _renderMessages22t(...a); applyChatTheme(); return r; };
// Sending in a themed chat: a little burst of the theme's emoji from the message box.
function themeBurst() {
  const t = state.chatThemes[chatThemeKey()], th = CHAT_THEMES[t?.theme];
  const from = $('#composer-send:not([style*="none"])') || $('.composer-box');
  if (!th?.fx || !from || document.documentElement.classList.contains('reduce-motion')) return;
  const r = from.getBoundingClientRect();
  for (let i = 0; i < 7; i++) {
    const s = document.createElement('span');
    s.className = 'ct-fx'; s.textContent = th.fx[i % th.fx.length];
    s.style.cssText = `left:${r.left + r.width * (0.3 + Math.random() * 0.6)}px;top:${r.top}px;--dx:${Math.round((Math.random() - 0.5) * 140)}px;--dy:${-Math.round(90 + Math.random() * 120)}px;--rot:${Math.round((Math.random() - 0.5) * 80)}deg;animation-delay:${i * 40}ms`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}
const _sendMessage22 = sendMessage;
sendMessage = function (conv, ...rest) {
  if (conv === chatThemeKey() && state.chatThemes[conv]?.theme && state.chatThemes[conv].theme !== 'default') themeBurst();
  return _sendMessage22(conv, ...rest);
};
const themeUrl = () => (state.view.type === 'dm' ? `/api/dms/${state.view.peerId}/theme` : `/api/groups/${state.view.groupId}/theme`);
function openChatThemePicker() {
  const key = chatThemeKey();
  if (!key) return;
  const cur = () => state.chatThemes[key] || {};
  const tile = ([k, t]) => `<button class="ct-sw${k === 'default' ? ' ct-default' : ''}" data-theme="${k}" title="${t.label}" style="--bg:${t.bg || 'var(--main)'};--m:${t.me || 'var(--bubble-me)'};--t:${t.them || 'var(--bubble-them)'}">
      <i><b class="ct-mini-t"></b><b class="ct-mini-m"></b><em>${t.emoji}</em></i><span>${t.label}</span></button>`;
  const ov = openLayer(`<div class="dialog modal ct-picker">
    <h3>🎨 Chat theme</h3>
    <p class="muted small" style="margin:-6px 0 12px">Everyone in this chat sees it. Themes move, have their own bubbles, and burst when you send.</p>
    <div class="ct-preview"><div class="ct-pscene"></div><div class="ct-wall"></div><div class="ct-b them">Hey! 👋 Look at this</div><div class="ct-b me">Ooh, I love this theme</div><div class="ct-b them">Right?! ✨</div></div>
    <div class="ct-grid ct-themes">${Object.entries(CHAT_THEMES).map(tile).join('')}</div>
    <div class="setting-head" style="margin-top:14px">Background</div>
    <div class="ct-grid">${Object.entries(WALLPAPERS).map(([k, w]) => `<button class="ct-wp" data-wall="${k}" title="${w.label}"><i style="background:${k === 'none' ? 'conic-gradient(from 90deg, #2f8cff, #ff5fb2, #3ee0c0, #f5c518, #2f8cff)' : w.css === 'none' ? 'var(--main)' : w.css + ', var(--main)'}">${k === 'none' ? '✨' : ''}</i><span>${w.label}</span></button>`).join('')}
      <button class="ct-wp" data-wall="upload" title="Your own picture"><i class="ct-up">＋</i><span>Your picture</span></button></div>
    <label class="ct-dim${cur().wallpaper?.url ? '' : ' hidden'}">Darken your picture <input type="range" min="0" max="80" step="5" value="${cur().wallpaper?.dim ?? 30}"></label>
    <input type="file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" id="ct-file">
    <div class="actions"><button class="btn btn-primary" data-a="done">Done</button></div></div>`);
  const box = $('.ct-picker', ov);
  const draw = () => {
    const t = cur(), name = CHAT_THEMES[t.theme] ? t.theme : 'default', th = CHAT_THEMES[name], w = t.wallpaper;
    const pv = $('.ct-preview', box);
    pv.className = `ct-preview ctheme-${name}${th.style ? ' cst-' + th.style : ''}`;
    for (const [v, val] of [['--brand', th.brand], ['--bubble-me', th.me], ['--bubble-them', th.them], ['--bubble-me-text', th.meText]]) val ? pv.style.setProperty(v, val) : pv.style.removeProperty(v);
    const wall = w?.url || (w?.preset && w.preset !== 'plain');
    $('.ct-pscene', pv).innerHTML = !wall && w?.preset !== 'plain' ? sceneHtml(th, true) : '';
    $('.ct-wall', pv).style.background = w?.url ? `linear-gradient(rgba(0,0,0,${(w.dim ?? 0) / 100}), rgba(0,0,0,${(w.dim ?? 0) / 100})), url("${encodeURI(w.url)}") center / cover` : wall ? WALLPAPERS[w.preset]?.css : 'none';
    $$('[data-theme]', box).forEach(b => b.classList.toggle('on', b.dataset.theme === name));
    $$('[data-wall]', box).forEach(b => b.classList.toggle('on', b.dataset.wall === (w?.url ? 'upload' : w?.preset || 'none')));
    $('.ct-dim', box).classList.toggle('hidden', !w?.url);
  };
  const put = async body => {
    try { const { theme } = await api('PUT', themeUrl(), body); state.chatThemes[key] = theme; draw(); applyChatTheme(); }
    catch (e) { toast(e.message, true); }
  };
  $$('[data-theme]', box).forEach(b => b.addEventListener('click', () => put({ theme: b.dataset.theme })));
  $$('[data-wall]', box).forEach(b => b.addEventListener('click', () => (b.dataset.wall === 'upload' ? $('#ct-file', box).click() : put({ wallpaper: { preset: b.dataset.wall } }))));
  $('#ct-file', box).addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 8e6) return toast('Wallpapers can be up to 8 MB.', true);
    try {
      const r = await fetch('/api/chat-wallpaper', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/octet-stream' }, body: f });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Upload failed.');
      put({ wallpaper: { url: d.url, dim: Number($('.ct-dim input', box).value) } });
    } catch (err) { toast(err.message, true); }
  });
  let dimT;
  $('.ct-dim input', box).addEventListener('input', e => { clearTimeout(dimT); const w = cur().wallpaper; if (!w?.url) return; dimT = setTimeout(() => put({ wallpaper: { url: w.url, dim: Number(e.target.value) } }), 250); });
  $('[data-a=done]', box).addEventListener('click', closeLayer);
  draw();
}
const _connect22 = connect;
connect = function (...a) {
  const r = _connect22(...a);
  state.es?.addEventListener('chat-theme', e => {
    const { conv, theme, by } = JSON.parse(e.data);
    state.chatThemes[conv] = theme;
    if (chatThemeKey() === conv) { applyChatTheme(); if (by !== state.me?.id) toast(`${user(by)?.displayName || 'Someone'} changed the chat theme 🎨`); }
  });
  state.es?.addEventListener('appeals', () => { if ($('.mod-tabs [data-mt="appeals"].on')) renderModeration($('#settings-body')); });
  return r;
};
setTimeout(function waitForMe() { if (state.me) { loadChatThemes(); renderBanScreen(); } else setTimeout(waitForMe, 500); }, 500);

// ======================= banned: the ban screen and appeals =======================
// A banned account sees why, and can send one appeal while the time to appeal lasts.
function renderBanScreen() {
  const ban = state.me?.ban;
  let el = $('#ban-screen');
  if (!ban) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'ban-screen'; el.className = 'ban-screen'; document.body.appendChild(el); }
  const a = ban.appeal;
  const left = Math.max(0, Math.ceil((ban.appealUntil - Date.now()) / 864e5));
  el.innerHTML = `<div class="ban-card">
    ${mascot('sleepy')}
    <h2>Your account was banned from Zuno</h2>
    <p class="muted">On ${esc(new Date(ban.at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}, for breaking the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>.</p>
    ${ban.reason ? `<div class="ban-reason"><small>Reason</small>${esc(ban.reason)}</div>` : ''}
    ${a ? `<div class="ban-appeal s-${esc(a.status)}"><small>Your appeal · ${esc(fmtTime(a.at))}</small><div class="ban-appeal-text">${esc(a.text)}</div>
        <b>${a.status === 'pending' ? '⏳ Waiting for the Zuno team to look at it.' : a.status === 'denied' ? '❌ Your appeal was denied.' : '✅ Approved'}</b>
        ${a.note ? `<div class="muted small">From the team: ${esc(a.note)}</div>` : ''}
        ${a.status === 'denied' ? '<p class="muted small">This login will stop working within a day.</p>' : ''}</div>`
      : ban.canAppeal ? `<form class="ban-form"><label class="field">Think this was a mistake? Tell the Zuno team why (one appeal, ${left} day${left === 1 ? '' : 's'} left)
          <textarea name="text" maxlength="1500" minlength="20" required placeholder="What happened, and why the ban should be lifted…"></textarea></label>
          <button class="btn btn-primary">Send Appeal</button></form>`
      : '<p class="muted">The time to appeal this ban has passed.</p>'}
    <button class="btn btn-link" id="ban-logout">Log Out</button></div>`;
  $('#ban-logout', el).addEventListener('click', () => signOut());
  $('.ban-form', el)?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true;
    try { const { me } = await api('POST', '/api/appeal', { text: e.target.text.value }); state.me = { ...state.me, ...me }; toast('Appeal sent. The Zuno team will look at it.'); renderBanScreen(); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}
const _onMe22 = typeof onMe === 'function' ? onMe : null;
if (_onMe22) onMe = function (...a) { const r = _onMe22(...a); renderBanScreen(); return r; };

// Staff: Settings › Moderation › Appeals.
async function modAppeals(box) {
  const { pending, decided } = await api('GET', '/api/mod/appeals');
  const card = x => `<div class="bug-card appeal-card" data-appeal="${esc(x.userId)}">
    <div class="bug-head"><b>${esc(x.was?.displayName || x.now?.displayName || 'Someone')}</b> <span class="muted small">@${esc(x.was?.username || x.now?.username || '')} · now ${esc(x.now?.displayName || '')}</span>
      <span class="bug-pill s-${x.appeal.status === 'pending' ? 'new' : x.appeal.status === 'approved' ? 'fixed' : 'not-a-bug'}">${x.appeal.status === 'pending' ? 'Waiting' : x.appeal.status === 'approved' ? 'Approved' : 'Denied'}</span></div>
    <div class="muted small">Banned ${esc(fmtTime(x.bannedAt))}${x.reason ? ` · Reason: “${esc(x.reason)}”` : ''} · Appealed ${esc(fmtTime(x.appeal.at))}</div>
    <div class="bug-text">${esc(x.appeal.text)}</div>
    ${x.appeal.status === 'pending' ? `<div class="bug-actions"><input class="bug-note" maxlength="500" placeholder="Note to them (optional)"><button class="btn btn-sm btn-green" data-decide="approve">Approve (restore account)</button><button class="btn btn-sm btn-red" data-decide="deny">Deny</button></div>`
      : `<div class="muted small">${x.decidedBy ? `By ${esc(x.decidedBy.displayName)}` : ''}${x.appeal.note ? ` · “${esc(x.appeal.note)}”` : ''}${state.me.isFounder ? ` <button class="btn btn-link btn-sm purge-btn" data-purge-appeal="${esc(x.userId)}">🗑 Delete for good</button>` : ''}</div>`}</div>`;
  box.innerHTML = `<p class="muted small" style="margin:0 0 12px">People banned from Zuno can send one appeal within ${14} days. Approving brings their name and profile back (not their servers or friends). Denying wipes the login a day later.</p>
    ${pending.length ? pending.map(card).join('') : `<div class="empty-state">${mascot('happy')}<div class="title">No appeals waiting</div></div>`}
    ${decided.length ? `<h4 class="setting-head" style="margin-top:22px">Answered</h4>${decided.map(card).join('')}` : ''}`;
  $$('[data-purge-appeal]', box).forEach(b => b.addEventListener('click', () => purgeThing(`/api/mod/appeals/${b.dataset.purgeAppeal}`, 'this appeal', () => modAppeals(box))));
  $$('[data-decide]', box).forEach(b => b.addEventListener('click', async () => {
    const c = b.closest('[data-appeal]');
    if (b.dataset.decide === 'deny' && !confirm('Deny this appeal? Their login is wiped a day later.')) return;
    try { await api('POST', `/api/mod/appeals/${c.dataset.appeal}`, { decision: b.dataset.decide, note: $('.bug-note', c).value }); toast(b.dataset.decide === 'approve' ? 'Approved: their account is back.' : 'Appeal denied.'); modAppeals(box); }
    catch (e) { toast(e.message, true); }
  }));
}
