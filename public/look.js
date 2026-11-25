'use strict';
// Zuno 0.16, how it looks and sounds: app themes, your own app background, more Appearance
// switches, name styles, status presets, and notification sound packs (or your own MP3).

// ======================= appearance =======================
const APP_THEMES = { dark: ['Dark', '#202a29', '#121918'], midnight: ['Midnight', '#0a0e0e', '#000000'], dim: ['Dim', '#2f3c3b', '#1f2a29'], light: ['Light', '#ffffff', '#e3e9e8'] };
const _applyPrefsL = applyPrefs;
applyPrefs = function () {
  _applyPrefsL();
  const p = prefs(), root = document.documentElement;
  root.dataset.theme = p.appTheme || 'dark';
  document.body.style.zoom = p.uiScale && p.uiScale !== 100 ? p.uiScale / 100 : '';
  root.style.setProperty('--ui-sat', (p.saturation ?? 100) / 100);
  for (const [cls, on] of [['no-chat-avatars', !p.showChatAvatars], ['no-gif-autoplay', !p.autoplayGifs], ['no-link-previews', !p.linkPreviews], ['high-contrast', p.highContrast], ['square-avatars', p.squareAvatars], ['desaturated', (p.saturation ?? 100) < 100]]) root.classList.toggle(cls, !!on);
  const bg = p.appBg;
  root.classList.toggle('has-app-bg', !!bg?.url);
  if (bg?.url) {
    root.style.setProperty('--app-bg', `url("${bg.url}")`);
    root.style.setProperty('--app-bg-dim', (bg.dim ?? 45) / 100);
    root.style.setProperty('--app-bg-blur', (bg.blur ?? 0) + 'px');
  }
};
// 24-hour clock: every time Zuno shows goes through toLocaleTimeString.
const _toLocaleTime = Date.prototype.toLocaleTimeString;
// Making a time formatter is slow, and the chat shows a time on every message, so each kind of
// formatter is made once and reused.
const timeFormats = new Map();
Date.prototype.toLocaleTimeString = function (loc, o) {
  if (!o || !('hour' in o)) return _toLocaleTime.call(this, loc, o);
  if (typeof state !== 'undefined' && state.me && prefs().hour24) o = { ...o, hour: '2-digit', hour12: false };
  const key = JSON.stringify([loc, o]);
  let f = timeFormats.get(key);
  if (!f) timeFormats.set(key, (f = new Intl.DateTimeFormat(Array.isArray(loc) && !loc.length ? undefined : loc, o)));
  return f.format(this);
};
// Paused GIFs in chat when autoplay is off (they play on hover).
const _renderMessagesL = renderMessages;
renderMessages = function (...a) {
  _renderMessagesL(...a);
  if (!prefs().autoplayGifs) $$('#messages img.msg-gif:not([data-frozen]), #messages img[src$=".gif"]:not([data-frozen])').forEach(img => { img.dataset.frozen = '1'; if (typeof freezeImage === 'function') freezeImage(img); });
};

const _renderAppearanceL = renderAppearance;
renderAppearance = function (body) {
  _renderAppearanceL(body);
  const p = prefs(), bg = p.appBg;
  const g = document.createElement('div');
  g.innerHTML = `
    <div class="setting-group"><h4 class="setting-head">Theme</h4>
      <div class="theme-pick">${Object.entries(APP_THEMES).map(([k, [name, main, rail]]) => `<button class="tp-tile${(p.appTheme || 'dark') === k ? ' on' : ''}" data-apptheme="${k}" style="--tm:${main};--tr:${rail}"><span class="tp-prev"><i></i><b></b></span><small>${name}</small></button>`).join('')}</div></div>
    <div class="setting-group"><h4 class="setting-head">App background</h4>
      <p class="setting-desc" style="margin:0 0 10px">Put your own picture behind all of Zuno. PNG, JPG, WebP or GIF up to 8 MB. Free for everyone.</p>
      <div class="appbg-row"><div class="appbg-prev"${bg?.url ? ` style="background-image:url('${esc(bg.url)}')"` : ''}>${bg?.url ? '' : uiIcon('image')}</div>
        <div class="appbg-ctl"><div class="row-btns"><button class="btn btn-primary btn-sm" id="appbg-up">${bg?.url ? 'Change Picture' : 'Upload a Picture'}</button>${bg?.url ? '<button class="btn btn-link btn-sm" id="appbg-rm">Remove</button>' : ''}</div>
        ${bg?.url ? `<label class="appbg-slider">Darken <input type="range" min="0" max="90" value="${bg.dim ?? 45}" id="appbg-dim"><span>${bg.dim ?? 45}%</span></label>
          <label class="appbg-slider">Blur <input type="range" min="0" max="24" value="${bg.blur ?? 0}" id="appbg-blur"><span>${bg.blur ?? 0}px</span></label>` : ''}</div></div>
      <input type="file" id="appbg-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif"></div>
    <div class="setting-group"><h4 class="setting-head">Size & color</h4>
      <div class="setting-row"><div><div class="setting-title">Zoom</div><div class="setting-desc">Make everything in Zuno bigger or smaller.</div></div><div class="vol"><input type="range" min="80" max="130" step="5" value="${p.uiScale || 100}" id="pref-zoom"><span id="pref-zoom-val">${p.uiScale || 100}%</span></div></div>
      <div class="setting-row"><div><div class="setting-title">Color saturation</div><div class="setting-desc">Tone down colors across the app.</div></div><div class="vol"><input type="range" min="0" max="100" step="5" value="${p.saturation ?? 100}" id="pref-sat"><span id="pref-sat-val">${p.saturation ?? 100}%</span></div></div>
      ${prefToggle('highContrast', 'High contrast text', 'Brighter text and clearer edges.')}</div>
    <div class="setting-group"><h4 class="setting-head">Chat</h4>
      ${prefToggle('showChatAvatars', 'Show avatars in chat', 'Turn off for a tidier, text-only chat.')}
      ${prefToggle('showRoleColors', 'Show role colors on names', 'Names in servers take their highest role color. This only changes what you see: to change how your own name looks to others, see Profiles › Name Style.')}
      ${prefToggle('squareAvatars', 'Rounded-square avatars', 'Avatars become rounded squares instead of circles.')}
      ${prefToggle('autoplayGifs', 'Play GIFs automatically', 'Off: GIFs stay still until you hover over them.')}
      ${prefToggle('linkPreviews', 'Show link previews', 'Cards for links, and YouTube videos in chat.')}
      ${prefToggle('hour24', '24-hour clock', 'Show 14:30 instead of 2:30 PM.')}</div>`;
  const first = $('.setting-group', body);
  first.before(...[...g.children].slice(0, 2));
  body.append(...g.children);
  $$('[data-apptheme]', body).forEach(b => b.addEventListener('click', async () => { if (await savePref({ appTheme: b.dataset.apptheme })) renderAppearance(body); }));
  const slider = (id, key, unit) => {
    const el = $('#' + id, body), out = $(`#${id}-val`, body);
    el.addEventListener('input', () => { out.textContent = el.value + unit; if (key === 'uiScale') document.body.style.zoom = el.value / 100; else document.documentElement.style.setProperty('--ui-sat', el.value / 100); document.documentElement.classList.toggle('desaturated', key === 'saturation' && el.value < 100); });
    el.addEventListener('change', () => savePref({ [key]: Number(el.value) }));
  };
  slider('pref-zoom', 'uiScale', '%'); slider('pref-sat', 'saturation', '%');
  $('#appbg-up', body).addEventListener('click', () => $('#appbg-file', body).click());
  $('#appbg-file', body).addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'image/gif' && file.size > 1.5e6) file = await shrinkImage(file, 2560, 0.88) || file;
    if (file.size > 8e6) return toast('That picture is too big (max 8 MB).', true);
    try {
      const res = await fetch('/api/me/app-background', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      state.me = d.me; applyPrefs(); renderAppearance(body); toast('Background set 🖼️');
    } catch (err) { toast(err.message, true); }
  });
  $('#appbg-rm', body)?.addEventListener('click', async () => { if (await savePref({ appBg: null })) renderAppearance(body); });
  for (const k of ['dim', 'blur']) {
    const el = $('#appbg-' + k, body);
    if (!el) continue;
    el.addEventListener('input', () => { el.nextElementSibling.textContent = el.value + (k === 'dim' ? '%' : 'px'); document.documentElement.style.setProperty(`--app-bg-${k}`, k === 'dim' ? el.value / 100 : el.value + 'px'); });
    el.addEventListener('change', () => savePref({ appBg: { ...prefs().appBg, [k]: Number(el.value) } }));
  }
  wireToggles(body, renderAppearance);
};
// Make a big picture smaller before uploading (also used for chat pictures). Returns a File or null.
async function shrinkImage(file, max = 2560, quality = 0.85, type = 'image/webp') {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, type, quality));
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
    return Object.assign(new File([blob], name, { type }), { w: bmp.width, h: bmp.height, outW: w, outH: h });
  } catch { return null; }
}

// ======================= name styles =======================
const NAME_FONTS = { default: 'Default', pacifico: 'Pacifico', bungee: 'Bungee', pixel: 'Pixel', caveat: 'Handwritten', orbitron: 'Orbitron', marker: 'Marker', righteous: 'Righteous', lobster: 'Lobster', comfortaa: 'Comfortaa', creepster: 'Creepster', monoton: 'Monoton' };
const NAME_FX = { none: 'Plain', gradient: 'Gradient', animated: 'Flowing', glow: 'Glow', neon: 'Neon', rainbow: 'Rainbow' };
function nameStyleAttrs(u) {
  const n = u?.nameStyle;
  if (!n) return '';
  const c = n.colors || [];
  return ` data-nf="${esc(n.font)}" data-nx="${esc(n.effect)}" style="--n1:${esc(c[0] || '#04c5ae')};--n2:${esc(c[1] || c[0] || '#eb459e')};--n3:${esc(c[2] || c[0] || '#04c5ae')}${n.effect === 'none' && n.solid && c[0] ? `;color:${esc(c[0])}` : n.effect === 'none' && u.nameColor ? `;color:${esc(u.nameColor)}` : ''}"`;
}
const _nameStyleL = nameStyle;
nameStyle = function (u) {
  if (u?.nameStyle) return nameStyleAttrs(u);
  if (u?.nameColor) return _nameStyleL(u);
  return prefs().showRoleColors === false ? '' : _nameStyleL(u);
};
const _profileCardL = profileCard;
profileCard = function (u, opts) {
  const html = _profileCardL(u, opts);
  return u?.nameStyle ? html.replace(/<div class="pc-name"[^>]*>/, `<div class="pc-name"${nameStyleAttrs(u)}>`) : html;
};
function nameStyleEditor(body) {
  if (!body || !$('.profile-editor', body) || $('#ns-editor', body)) return;
  const cur = state.me.nameStyle || { font: 'default', effect: 'none', colors: ['#04c5ae', '#eb459e'] };
  const d = { font: cur.font, effect: cur.effect, colors: [...(cur.colors || ['#04c5ae', '#eb459e'])], solid: !!cur.solid };
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'ns-editor';
  const preview = () => `<span class="ns-prev"${nameStyleAttrs({ ...state.me, nameStyle: d })}>${esc(state.me.displayName)}</span>`;
  g.innerHTML = `<h4 class="setting-head">Name Style</h4>
    <p class="setting-desc" style="margin:0 0 10px">A font and an effect for your name in chat, member lists and your profile.</p>
    <div class="ns-preview" id="ns-preview">${preview()}</div>
    <div class="ns-label">Font</div><div class="ns-grid" id="ns-fonts">${Object.entries(NAME_FONTS).map(([k, n]) => `<button type="button" class="ns-opt${d.font === k ? ' on' : ''}" data-nsf="${k}"><span data-nf="${k}">${esc(n)}</span></button>`).join('')}</div>
    <div class="ns-label">Effect</div><div class="ns-grid fx" id="ns-fx">${Object.entries(NAME_FX).map(([k, n]) => `<button type="button" class="ns-opt${d.effect === k ? ' on' : ''}" data-nsx="${k}"><span data-nx="${k}" style="--n1:${esc(d.colors[0])};--n2:${esc(d.colors[1] || d.colors[0])};--n3:${esc(d.colors[0])}">${esc(n)}</span></button>`).join('')}</div>
    <div class="ns-colors"><span class="ns-label">Colors</span><input type="color" class="color-input" id="ns-c1" value="${esc(d.colors[0])}"><input type="color" class="color-input" id="ns-c2" value="${esc(d.colors[1] || d.colors[0])}"></div>
    <div class="row-btns"><button class="btn btn-primary btn-sm" id="ns-save">Save Name Style</button>${state.me.nameStyle ? '<button class="btn btn-link btn-sm" id="ns-clear">Reset</button>' : ''}</div>`;
  const anchor = $('#wg-editor', body);
  anchor ? anchor.before(g) : body.appendChild(g);
  const redraw = () => { $('#ns-preview', g).innerHTML = preview(); $$('[data-nsx] span', g).forEach(s => { s.style.setProperty('--n1', d.colors[0]); s.style.setProperty('--n2', d.colors[1]); }); };
  $$('[data-nsf]', g).forEach(b => b.addEventListener('click', () => { d.font = b.dataset.nsf; $$('[data-nsf]', g).forEach(x => x.classList.toggle('on', x === b)); redraw(); }));
  $$('[data-nsx]', g).forEach(b => b.addEventListener('click', () => { d.effect = b.dataset.nsx; $$('[data-nsx]', g).forEach(x => x.classList.toggle('on', x === b)); redraw(); }));
  // Picking a color with "Plain" gives you a solid-colored name.
  $('#ns-c1', g).addEventListener('input', e => { d.colors[0] = e.target.value; d.solid = true; redraw(); });
  $('#ns-c2', g).addEventListener('input', e => { d.colors[1] = e.target.value; redraw(); });
  const save = async nameStyle => {
    try { const { me } = await api('PATCH', '/api/me', { nameStyle }); state.me = { ...state.me, ...me }; state.users[me.id] = { ...state.users[me.id], ...me }; toast(nameStyle ? 'Name style saved ✨' : 'Name style reset'); g.remove(); nameStyleEditor(body); }
    catch (e) { toast(e.message, true); }
  };
  $('#ns-save', g).addEventListener('click', () => save(d.font === 'default' && d.effect === 'none' && !d.solid ? null : d));
  $('#ns-clear', g)?.addEventListener('click', () => save(null));
}

// ======================= status presets =======================
const PRESET_CLEAR = { 0: "Don't clear", 1800000: '30 minutes', 3600000: '1 hour', 14400000: '4 hours', today: 'Today' };
function applyPreset(p) {
  const until = p.clearAfter === 'today' ? (() => { const d = new Date(); d.setHours(23, 59, 59, 0); return d.getTime(); })() : p.clearAfter ? Date.now() + p.clearAfter : 0;
  api('PATCH', '/api/me', { ...(p.status ? { status: p.status } : {}), customStatus: p.text || '', customStatusEmoji: p.emoji || null, customStatusUntil: until })
    .then(({ me }) => { state.me = { ...state.me, ...me }; state.users[me.id] = state.me; renderUserPanel(); toast(`Status: ${[p.emoji, p.text].filter(Boolean).join(' ') || STATUS_LABEL[p.status]}`); })
    .catch(e => toast(e.message, true));
}
async function savePresets(list) {
  try { const { statusPresets } = await api('PUT', '/api/me/status-presets', { presets: list }); state.statusPresets = statusPresets; return true; }
  catch (e) { toast(e.message, true); return false; }
}
const _openStatusMenuL = openStatusMenu;
openStatusMenu = function (anchor) {
  _openStatusMenuL(anchor);
  const menu = $('#layer .menu');
  if (!menu) return;
  const firstSep = $('.sep', menu);
  const frag = document.createElement('div');
  const presets = state.statusPresets || [];
  frag.innerHTML = `<div class="sep"></div><div class="menu-label">Presets</div>${presets.map((p, i) => `<button data-preset="${i}"><span class="mi-ico">${esc(p.emoji || '💬')}</span><span>${esc(p.text || STATUS_LABEL[p.status] || 'Preset')}${p.status ? `<span class="desc">${esc(STATUS_LABEL[p.status])}${p.clearAfter ? ' · clears after ' + esc(PRESET_CLEAR[p.clearAfter] || '') : ''}</span>` : ''}</span></button>`).join('')}
    <button data-preset-new><span class="mi-ico">➕</span><span>${presets.length ? 'Manage Presets' : 'Make a Status Preset'}</span></button>`;
  firstSep ? firstSep.before(...frag.children) : menu.append(...frag.children);
  $$('[data-preset]', menu).forEach(b => b.addEventListener('click', () => { closeLayer(); applyPreset(presets[b.dataset.preset]); }));
  $('[data-preset-new]', menu).addEventListener('click', () => { closeLayer(); openPresetManager(); });
  const r = menu.getBoundingClientRect();
  if (r.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
};
function openPresetManager() {
  const list = [...(state.statusPresets || [])];
  const row = (p, i) => `<div class="preset-row" data-i="${i}"><button type="button" class="cs-emoji" data-pe>${esc(p.emoji || '😀')}</button>
    <input data-pt maxlength="80" value="${esc(p.text || '')}" placeholder="What's up?">
    <select data-ps class="sc-select"><option value="">Keep status</option>${['online', 'idle', 'dnd', 'invisible'].map(s => `<option value="${s}"${p.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>
    <select data-pc class="sc-select">${Object.entries(PRESET_CLEAR).map(([v, l]) => `<option value="${v}"${String(p.clearAfter || 0) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="icon-btn danger" data-px title="Remove">${ICON.trash}</button></div>`;
  const ov = openLayer(`<form class="dialog modal preset-dialog"><h3>Status Presets</h3><p class="muted" style="margin:0 0 12px">One click sets your emoji, status message and Online/Idle/Do Not Disturb. Up to 8.</p>
    <div id="preset-list"></div><button type="button" class="btn btn-grey btn-sm" id="preset-add">➕ Add a Preset</button>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const box = $('#preset-list', ov);
  const read = () => $$('.preset-row', box).map(r => ({ ...list[r.dataset.i], text: $('[data-pt]', r).value, status: $('[data-ps]', r).value || null, clearAfter: $('[data-pc]', r).value === 'today' ? 'today' : Number($('[data-pc]', r).value) }));
  const draw = () => {
    box.innerHTML = list.map(row).join('') || '<div class="fp-empty">No presets yet. Add one like “📚 Studying” or “🎮 Gaming”.</div>';
    $$('.preset-row', box).forEach(r => {
      const i = Number(r.dataset.i);
      $('[data-pe]', r).addEventListener('click', e => openEmojiPicker(e.currentTarget, x => { list[i].emoji = x; e.currentTarget.textContent = x; }, { title: 'Preset emoji' }));
      $('[data-px]', r).addEventListener('click', () => { Object.assign(list, read()); list.splice(i, 1); draw(); });
    });
    $('#preset-add', ov).classList.toggle('hidden', list.length >= 8);
  };
  $('#preset-add', ov).addEventListener('click', () => { const cur = read(); list.length = 0; list.push(...cur, { emoji: '', text: '', status: null, clearAfter: 0 }); draw(); $$('[data-pt]', box).pop()?.focus(); });
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  $('form', ov).addEventListener('submit', async e => { e.preventDefault(); if (await savePresets(read())) { closeLayer(); toast('Presets saved'); } });
  if (!list.length && state.me.customStatus) list.push({ emoji: state.me.customStatusEmoji || '', text: state.me.customStatus, status: null, clearAfter: 0 });
  draw();
}

// ======================= notification sounds =======================
const SOUND_PACKS = { classic: ['Zuno', 'The Zuno sound'], pop: ['Pop', 'The soft pop from before'], bubbly: ['Bubbly', 'Round, bouncy bloops'], retro: ['Retro', '8-bit blips'], soft: ['Soft', 'A quiet little tap'], chime: ['Chime', 'Two gentle bells'], custom: ['Your own', 'An MP3 you upload'], none: ['Silent', 'No sound'] };
let packCtx = null;
function playPack(pack, vol = (prefs().soundVolume ?? 60) / 100) {
  if (pack === 'none') return;
  if (pack === 'custom') { const url = state.notifSound?.url; if (url) { const a = new Audio(url); a.volume = Math.max(0.05, vol); a.play().catch(() => {}); } return; }
  // (0.42) "Zuno Noti" is the Zuno sound now; the old pop is still there as "Pop".
  if (pack === 'classic') { const a = new Audio('/tones/ZunoNoti.mp3'); a.volume = Math.max(0.05, Math.min(1, vol)); a.play().catch(() => _playPingL()); return; }
  if (pack === 'pop') return _playPingL();
  try {
    packCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const a = packCtx, t = a.currentTime;
    const note = (type, f, at, len, g, bend) => {
      const o = a.createOscillator(), v = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at);
      if (bend) o.frequency.exponentialRampToValueAtTime(bend, t + at + len * 0.8);
      v.gain.setValueAtTime(0.0001, t + at); v.gain.exponentialRampToValueAtTime(g * vol * 1.6, t + at + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(v).connect(a.destination); o.start(t + at); o.stop(t + at + len + 0.05);
    };
    if (pack === 'bubbly') { note('sine', 420, 0, 0.16, 0.16, 900); note('sine', 620, 0.1, 0.18, 0.14, 1300); }
    if (pack === 'retro') { note('square', 988, 0, 0.07, 0.05); note('square', 1319, 0.07, 0.1, 0.05); }
    if (pack === 'soft') note('triangle', 660, 0, 0.18, 0.12, 620);
    if (pack === 'chime') { for (const [f, at] of [[1047, 0], [1568, 0.12]]) { note('sine', f, at, 0.9, 0.1); note('sine', f * 2, at, 0.4, 0.03); } }
  } catch {}
}
const _playPingL = playPing;
playPing = function () { playPack(prefs().soundPack || 'classic'); };
const _renderNotificationsL = renderNotifications;
renderNotifications = function (body) {
  _renderNotificationsL(body);
  const p = prefs(), cur = p.soundPack || 'classic';
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">Message sound</h4>
    <div class="pack-grid">${Object.entries(SOUND_PACKS).filter(([k]) => k !== 'custom' || state.notifSound).map(([k, [n, d]]) => `<button class="pack${cur === k ? ' on' : ''}" data-pack="${k}"><b>${esc(k === 'custom' ? state.notifSound.name : n)}</b><small>${esc(d)}</small><span class="pack-play" data-packplay="${k}" title="Listen">▶</span></button>`).join('')}</div>
    <div class="row-btns" style="margin-top:10px"><button class="btn btn-grey btn-sm" id="ns-up">${state.notifSound ? 'Change your MP3' : 'Upload your own MP3'}</button>${state.notifSound ? '<button class="btn btn-link btn-sm" id="ns-rm">Remove it</button>' : ''}<span class="muted small">Short sounds work best (up to 1 MB).</span></div>
    <input type="file" id="ns-file" class="hidden" accept="audio/mpeg,.mp3">`;
  const first = $('.setting-group', body);
  first ? first.after(g) : body.appendChild(g);
  $$('[data-pack]', g).forEach(b => b.addEventListener('click', async e => {
    if (e.target.closest('[data-packplay]')) return playPack(b.dataset.pack);
    if (await savePref({ soundPack: b.dataset.pack })) { playPack(b.dataset.pack); renderNotifications(body); }
  }));
  $('#ns-up', g).addEventListener('click', () => $('#ns-file', g).click());
  $('#ns-file', g).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1e6) return toast('That MP3 is too big (max 1 MB).', true);
    try {
      const res = await fetch('/api/me/notif-sound', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'audio/mpeg', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      state.notifSound = d.notifSound; state.me = d.me; playPack('custom'); renderNotifications(body); toast('Your message sound is set 🔔');
    } catch (err) { toast(err.message, true); }
  });
  $('#ns-rm', g)?.addEventListener('click', async () => { try { const { me } = await api('DELETE', '/api/me/notif-sound'); state.me = me; state.notifSound = null; renderNotifications(body); } catch (err) { toast(err.message, true); } });
};

// Profiles settings: the name style editor joins the widgets editor.
const _showSettingsSectionLk = showSettingsSection;
showSettingsSection = function (section) {
  _showSettingsSectionLk(section);
  if (section === 'profile') nameStyleEditor($('#settings-body'));
};
