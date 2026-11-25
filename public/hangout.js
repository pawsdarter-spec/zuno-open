'use strict';
// Zuno 0.15, in the app: soundboard, Voice & Video settings, calls as messages, saved messages
// and reminders, "Seen", seasonal events, server insights, close friends, DM pins & categories,
// account switching, and profile widgets. (Server folders live in servers.js.)

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// "at 3:15 PM" today, "Tue 9:00 AM" this week, else a date.
function whenText(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'at ' + fmtShort(ts);
  if (Math.abs(ts - Date.now()) < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + fmtShort(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtShort(ts);
}

// ======================= live events =======================
function hookHangoutEvents(es) {
  const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data || '{}')); } catch {} });
  on('seen', d => { const c = state.convos[d.conv]; if (c?.meta) { c.meta.peerSeen = Math.max(c.meta.peerSeen || 0, d.at); if (activeConv() === d.conv) renderSeen(); } });
  on('saved', () => { if ($('#layer .saved-pop')) openSaved($('#saved-btn') || $('#home-btn')); });
  on('cf-status', d => { state.closeStatuses ||= {}; if (d.status) state.closeStatuses[d.userId] = d.status; else delete state.closeStatuses[d.userId]; renderDMList(); });
  on('layout', () => refresh({}));
  on('group-call', d => {
    const g = groupById(d.groupId);
    if (!g) return;
    g.call = d.users || [];
    renderGroupCallButton(); renderDMList();
  });
  on('rtc-sound', d => playBoardSound(d.sound, d.from));
}
(function waitEsH() {
  if (!state.es) return setTimeout(waitEsH, 800);
  hookHangoutEvents(state.es);
  const _connectH = connect;
  connect = function () { _connectH(); hookHangoutEvents(state.es); };
})();

// ======================= soundboard =======================
const sbVolume = () => lsGet('zuno_sb_volume', 0.6);
// Zuno's own sounds are made right here, so there's nothing to download.
const BOARD = {
  ding: ['Ding', '🔔'], tada: ['Ta-da!', '🎉'], airhorn: ['Air Horn', '📯'], boing: ['Boing', '🦘'],
  sadtrombone: ['Sad Trombone', '😢'], drumroll: ['Drumroll', '🥁'], applause: ['Applause', '👏'], crickets: ['Crickets', '🦗'],
};
function synthBoard(key, vol = sbVolume()) {
  let a;
  try { a = Calls.synth.ctx(); } catch { return; }
  const out = a.createGain(); out.gain.value = vol; out.connect(a.destination);
  const t = a.currentTime;
  const osc = (type, f, at, len, g = 0.2, sweep) => {
    const o = a.createOscillator(), v = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t + at);
    if (sweep) sweep(o.frequency, t + at, len);
    v.gain.setValueAtTime(0.0001, t + at); v.gain.exponentialRampToValueAtTime(g, t + at + 0.015); v.gain.setValueAtTime(g, t + at + len * 0.7); v.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    o.connect(v).connect(out); o.start(t + at); o.stop(t + at + len + 0.05);
    return o;
  };
  const noise = (at, len, g = 0.2, hp = 800, lp = 9000) => {
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = a.createBufferSource(), h = a.createBiquadFilter(), l = a.createBiquadFilter(), v = a.createGain();
    s.buffer = buf; h.type = 'highpass'; h.frequency.value = hp; l.type = 'lowpass'; l.frequency.value = lp; v.gain.value = g;
    s.connect(h).connect(l).connect(v).connect(out); s.start(t + at);
  };
  const bellAt = (notes, g) => notes.forEach(([f, at, len = 1]) => [[1, 1], [2, 0.3], [3, 0.1]].forEach(([m, k]) => osc('sine', f * m, at, len / m, g * k)));
  ({
    ding: () => bellAt([[1319, 0, 1.4]], 0.3),
    tada: () => { bellAt([[523, 0, 0.3], [659, 0.08, 0.3], [784, 0.16, 0.3], [1047, 0.3, 1.2], [1319, 0.3, 1.2]], 0.16); noise(0.3, 0.6, 0.08, 5000); },
    airhorn: () => [0, 0.32, 0.64].forEach((at, i) => { const len = i === 2 ? 0.9 : 0.24; osc('sawtooth', 466, at, len, 0.09); osc('sawtooth', 470, at, len, 0.09); osc('square', 233, at, len, 0.05); }),
    boing: () => osc('sine', 180, 0, 0.7, 0.35, (f, s, len) => { f.exponentialRampToValueAtTime(620, s + 0.12); for (let i = 0; i < 6; i++) f.setTargetAtTime(380 + (i % 2 ? -80 : 80) / (i + 1), s + 0.12 + i * 0.08, 0.03); f.exponentialRampToValueAtTime(320, s + len); }),
    sadtrombone: () => [[392, 0], [370, 0.42], [349, 0.84]].concat([[330, 1.26]]).forEach(([f, at], i) => osc('sawtooth', f, at, i === 3 ? 1.3 : 0.4, 0.07, i === 3 ? (fr, s) => { for (let k = 0; k < 10; k++) fr.setValueAtTime(f + (k % 2 ? -9 : 9), s + 0.15 + k * 0.1); } : null)),
    drumroll: () => { for (let i = 0; i < 26; i++) noise(i * 0.055, 0.06, 0.14 + i * 0.006, 200, 3000); noise(1.45, 1.1, 0.25, 3000, 12000); osc('sine', 80, 1.45, 0.4, 0.4); },
    applause: () => { for (let i = 0; i < 140; i++) noise(Math.random() * 2.2, 0.03, 0.05 + Math.random() * 0.06, 1200, 7000); },
    crickets: () => { for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) osc('sine', 4600 + r * 40, r * 0.55 + i * 0.045, 0.035, 0.05); },
  }[key] || (() => {}))();
}
// Someone in your call played a sound (you hear it unless you're deafened).
function playBoardSound(s, from) {
  if (!s || Calls.deafened || !Calls.room) return;
  if (s.builtin) synthBoard(s.builtin);
  else if (s.url) { const au = new Audio(s.url); au.volume = Math.max(0, Math.min(1, (s.volume ?? 1) * sbVolume())); au.play().catch(() => {}); }
  // A little "who played it" bubble on their tile.
  const tile = $(`[data-tile="${CSS.escape(from || '')}"]`);
  if (tile) { const b = document.createElement('span'); b.className = 'sb-bubble'; b.textContent = s.emoji || '🎵'; tile.appendChild(b); setTimeout(() => b.remove(), 1600); }
  // (0.39) A blue glow on whoever played it (green is for talking), in the call and the channel list.
  for (const el of $$(`[data-tile="${CSS.escape(from || '')}"], .voice-user[data-vu="${CSS.escape(from || '')}"]`)) {
    el.classList.remove('sb-playing'); void el.offsetWidth; el.classList.add('sb-playing');
    clearTimeout(el._sbT); el._sbT = setTimeout(() => el.classList.remove('sb-playing'), 2200);
  }
}
// (0.39) The soundboard shows the sounds of every server you're in (the server whose voice channel
// you're in first), with a search. Zuno's own made-up sounds are gone from it.
function boardSounds() {
  const room = Calls.room || '';
  const vcServer = room.startsWith('vc:') ? state.servers.find(sv => sv.channels.some(c => 'vc:' + c.id === room)) : null;
  const svs = [...(vcServer ? [vcServer] : []), ...state.servers.filter(sv => sv !== vcServer)];
  return svs.filter(sv => (sv.sounds || []).length).map(sv => ({ sv, sounds: sv.sounds }));
}
window.openSoundboard = function (anchor) {
  if (!Calls.room) return toast('Join a call to use the soundboard.');
  const room = Calls.room;
  const vcSv = room.startsWith('vc:') ? state.servers.find(sv => sv.channels.some(c => 'vc:' + c.id === room)) : null;
  if (vcSv && typeof hasPerm === 'function' && !hasPerm(vcSv, 'use_soundboard')) return toast("You don't have permission to use the soundboard here.", true);
  const btn = (key, name, emoji) => `<button class="sb-btn" data-sb="${esc(key)}" data-name="${esc(String(name).toLowerCase())}" title="${esc(name)}"><span class="sb-e">${esc(emoji || '🎵')}</span><span class="sb-n">${esc(name)}</span></button>`;
  const groups = boardSounds();
  const box = popover(anchor, 'sb-pop', `<div class="pop-head">🎵 Soundboard <span class="muted small">Everyone in the call hears it</span></div>
    <input class="sb-search" placeholder="Search sounds" maxlength="40"${groups.length ? '' : ' hidden'}>
    <div class="sb-scroll">${groups.length ? groups.map(({ sv, sounds }) => `<section class="sb-sec"><h6>${esc(sv.name)}</h6><div class="sb-grid">${sounds.map(s => btn(sv.id + ':' + s.id, s.name, s.emoji)).join('')}</div></section>`).join('')
      : `<div class="fp-empty">${typeof mascot === 'function' ? mascot('sleepy') : ''}<div>None of your servers have sounds yet.<br><span class="muted small">Server owners can add them in Server Settings › Soundboard.</span></div></div>`}
    <div class="fp-empty sb-none" hidden>No sounds match that.</div></div>
    <div class="sb-foot"><span class="muted small">🔈</span><input type="range" min="0" max="1" step="0.05" value="${sbVolume()}" class="sb-vol" title="Soundboard volume (just for you)"><span class="muted small">Right-click to preview</span></div>`);
  // Popovers open below their button; the call bar is at the bottom, so lift it up if needed.
  const r = anchor.getBoundingClientRect();
  if (r.bottom + box.offsetHeight + 8 > innerHeight) box.style.top = Math.max(8, r.top - box.offsetHeight - 8) + 'px';
  const search = $('.sb-search', box);
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let any = false;
    for (const sec of $$('.sb-sec', box)) {
      let n = 0;
      for (const b of $$('[data-sb]', sec)) { const on = !q || b.dataset.name.includes(q); b.hidden = !on; if (on) n++; }
      sec.hidden = !n; if (n) any = true;
    }
    $('.sb-none', box).hidden = any || !groups.length;
  });
  setTimeout(() => search.focus(), 30);
  $('.sb-vol', box).addEventListener('input', e => lsSet('zuno_sb_volume', Number(e.target.value)));
  $$('[data-sb]', box).forEach(b => b.addEventListener('click', async () => {
    b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    try { await api('POST', '/api/rtc/sound', { room: Calls.room, sound: b.dataset.sb }); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-sb]', box).forEach(b => b.addEventListener('contextmenu', e => {
    e.preventDefault(); // right-click: preview just for yourself
    const [where, id] = b.dataset.sb.split(':');
    const s = state.servers.find(x => x.id === where)?.sounds?.find(x => x.id === id);
    if (s) { const au = new Audio('/uploads/' + s.id); au.volume = Math.max(0, Math.min(1, (s.volume ?? 1) * sbVolume())); au.play().catch(() => {}); }
  }));
};

// Server Settings › Soundboard
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'emoji') + 1, 0, { group: 'Server', key: 'soundboard', label: 'Soundboard', need: 'manage_expressions', words: 'soundboard sounds audio mp3 voice clips' });
SS_SETTINGS.push(['soundboard', 'Upload sound']);
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'audit') + 1, 0, { group: 'Moderation', key: 'insights', label: 'Server Insights', need: ['manage_server', 'view_audit_log'], words: 'insights stats statistics analytics growth busiest hours active members activity chart' });
const _showServerSectionH = showServerSection;
showServerSection = async function (section, openCh) {
  if (section !== 'soundboard' && section !== 'insights') return _showServerSectionH(section, openCh);
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  return section === 'soundboard' ? ssSoundboard($('#ss-body'), svById(svSettings.id)) : ssInsights($('#ss-body'), svById(svSettings.id));
};
async function mp3Seconds(file) {
  try {
    const a = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
    const buf = await a.decodeAudioData(await file.arrayBuffer());
    return buf.duration;
  } catch { return null; }
}
function ssSoundboard(body, sv) {
  const list = sv.sounds || [];
  body.innerHTML = `<div data-keep><h2>Soundboard</h2>
    <p class="muted" style="margin:-10px 0 16px">Short sounds anyone in ${esc(sv.name)} can play in a call (🎵 in the call controls). Up to 24 sounds, MP3, 5 seconds and 512 KB each.</p>
    <div class="em-up"><button class="btn btn-primary" id="sb-upload">Upload Sound</button><span class="muted small">${list.length} / 24</span><input type="file" id="sb-file" class="hidden" accept="audio/mpeg,.mp3"></div>
    <div class="em-list">${list.map(s => `<div class="em-row sb-row" data-sbid="${esc(s.id)}"><button class="sb-emoji-btn" data-sbemoji title="Pick an emoji">${esc(s.emoji || '🎵')}</button>
      <input class="em-name" value="${esc(s.name)}" maxlength="32"><label class="sb-volrow muted small">Volume <input type="range" min="0.1" max="1" step="0.05" value="${s.volume ?? 1}" data-sbvol></label>
      <button class="icon-btn" data-sbplay title="Play">${ICON.play}</button><button class="icon-btn danger" data-sbdel title="Delete">${ICON.trash}</button></div>`).join('') || `<div class="empty-state">${mascot('curious')}<div class="title">No sounds yet</div><div>Upload a short MP3: a laugh, an inside joke, a drum hit…</div></div>`}</div></div>`;
  const redraw = async () => { await refresh({ serverId: sv.id }); ssSoundboard(body, svById(sv.id)); };
  $('#sb-upload', body).addEventListener('click', () => $('#sb-file', body).click());
  $('#sb-file', body).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512_000) return toast('That sound is too big (max 512 KB).', true);
    const secs = await mp3Seconds(file);
    if (secs == null) return toast("That doesn't look like an MP3 Zuno can play.", true);
    if (secs > 5.2) return toast(`That sound is ${secs.toFixed(1)} seconds. Soundboard sounds can be up to 5 seconds — trim it and try again.`, true);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 32).padEnd(2, '!');
    try {
      const res = await fetch(`/api/servers/${sv.id}/sounds`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'audio/mpeg', 'X-Sound-Name': encodeURIComponent(name), 'X-Duration': secs.toFixed(2) }, body: file });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      toast(`Added “${d.sound.name}” 🎵`);
    } catch (err) { toast(err.message, true); }
    redraw();
  });
  $$('[data-sbid]', body).forEach(r => {
    const id = r.dataset.sbid, patch = async change => { try { await api('PATCH', `/api/servers/${sv.id}/sounds/${id}`, change); redraw(); } catch (err) { toast(err.message, true); } };
    $('.em-name', r).addEventListener('change', e => patch({ name: e.target.value }));
    $('[data-sbvol]', r).addEventListener('change', e => patch({ volume: Number(e.target.value) }));
    $('[data-sbemoji]', r).addEventListener('click', e => openEmojiPicker(e.currentTarget, x => patch({ emoji: x }), { title: 'Sound emoji' }));
    $('[data-sbplay]', r).addEventListener('click', () => { const au = new Audio('/uploads/' + id); au.volume = Number($('[data-sbvol]', r).value); au.play().catch(() => {}); });
    $('[data-sbdel]', r).addEventListener('click', () => confirmDialog('Delete this sound?', 'It disappears from everyone\'s soundboard.', 'Delete', async () => { try { await api('DELETE', `/api/servers/${sv.id}/sounds/${id}`); redraw(); } catch (err) { toast(err.message, true); } }));
  });
}

// ======================= User Settings: Voice & Video, Saved =======================
const _openSettingsH = openSettings;
openSettings = function (section) {
  _openSettingsH(section);
  const nav = $('.settings:not(.server-settings-page) .settings-nav > div');
  if (!nav || $('[data-s="voice"]', nav)) return;
  const b = document.createElement('button');
  b.dataset.s = 'voice'; b.textContent = 'Voice & Video';
  $('[data-s="notifications"]', nav)?.after(b);
  b.addEventListener('click', () => showSettingsSection('voice'));
  if (typeof US_WORDS === 'object') US_WORDS.voice = 'voice video microphone mic noise suppression echo cancellation gain input device soundboard volume test';
  if (section === 'voice') showSettingsSection('voice');
};
const _showSettingsSectionH = showSettingsSection;
showSettingsSection = function (section) {
  if (section === 'voice') {
    if (settingsDraft && isDraftDirty()) return closeSettings();
    settingsDraft = null;
    $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === section));
    return renderVoiceSettings($('#settings-body'));
  }
  _showSettingsSectionH(section);
  const body = $('#settings-body');
  if (section === 'appearance') addSeasonToggle(body);
  if (section === 'profile') addWidgetEditor(body);
};
let micTest = null;
function stopMicTest() { if (!micTest) return; clearInterval(micTest.timer); micTest.stream.getTracks().forEach(t => t.stop()); micTest.ctx.close().catch(() => {}); micTest = null; }
async function renderVoiceSettings(body) {
  stopMicTest();
  const v = Calls.voiceSettings();
  let mics = [];
  try { mics = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch {}
  const toggle = (key, title, desc) => `<label class="setting-row"><div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div><input type="checkbox" class="switch" data-vs="${key}"${v[key] ? ' checked' : ''}></label>`;
  body.innerHTML = `<h2>Voice & Video</h2>
    <div class="setting-group"><h4 class="setting-head">Microphone</h4>
      <select class="sc-select" id="vs-mic" style="width:100%"><option value="">Default microphone</option>${mics.filter(m => m.deviceId && m.deviceId !== 'default').map((m, i) => `<option value="${esc(m.deviceId)}"${v.micId === m.deviceId ? ' selected' : ''}>${esc(m.label || `Microphone ${i + 1}`)}</option>`).join('')}</select>
      <div class="mic-test"><button class="btn btn-primary btn-sm" id="vs-test">Let's Check</button><div class="mic-meter"><i id="vs-level"></i></div></div>
      <p class="muted small">Say something: the bar moves when Zuno hears you. ${mics.length && !mics[0].label ? 'Your microphones get their names after you allow microphone access once.' : ''}</p></div>
    <div class="setting-group"><h4 class="setting-head">Input mode</h4>
      <div class="input-mode" role="radiogroup" aria-label="Input mode">
        <label class="setting-row"><div><div class="setting-title">Voice Activity</div><div class="setting-desc">Your mic sends whenever you talk.</div></div><input type="radio" name="vs-mode" value="voice"${v.inputMode !== 'ptt' ? ' checked' : ''}></label>
        <label class="setting-row"><div><div class="setting-title">Push to Talk</div><div class="setting-desc">Your mic only sends while you hold a key. On a phone, hold the mic button in the call.</div></div><input type="radio" name="vs-mode" value="ptt"${v.inputMode === 'ptt' ? ' checked' : ''}></label>
      </div>
      <div class="setting-row ptt-key-row${v.inputMode === 'ptt' ? '' : ' hidden'}"><div><div class="setting-title">Push to Talk key</div><div class="setting-desc">Hold it in a call to talk. Works anywhere in Zuno, even while you're typing if it isn't a letter key.</div></div>
        <button class="btn btn-grey btn-sm" id="vs-ptt-key"><kbd>${esc(v.pttName || v.pttKey)}</kbd> Change</button></div></div>
    <div class="setting-group"><h4 class="setting-head">Voice processing</h4>
      ${toggle('noiseSuppression', 'Noise suppression', 'Filters out background noise like keyboards, fans and traffic so people only hear you.')}
      ${toggle('echoCancellation', 'Echo cancellation', 'Stops people from hearing themselves through your speakers.')}
      ${toggle('autoGainControl', 'Automatic gain control', 'Evens out your volume so you\'re never too quiet or too loud.')}</div>
    <div class="setting-group"><h4 class="setting-head">Soundboard</h4>
      <div class="setting-row"><div><div class="setting-title">Soundboard volume</div><div class="setting-desc">How loud sounds others play are, just for you.</div></div><input type="range" min="0" max="1" step="0.05" value="${sbVolume()}" id="vs-sb" style="width:160px"></div>
      <button class="btn btn-grey btn-sm" id="vs-sb-test">🔔 Play a test sound</button></div>
    <p class="muted small">These settings are saved on this device. Changes apply right away, even mid-call.</p>`;
  const save = change => { lsSet('zuno_voice_settings', { ...Calls.voiceSettings(), ...change }); Calls.refreshMic(); if (micTest) startTest(); };
  $('#vs-mic', body).addEventListener('change', e => save({ micId: e.target.value }));
  const saveMode = change => { lsSet('zuno_voice_settings', { ...Calls.voiceSettings(), ...change }); Calls.applyInputMode(); };
  $$('[name=vs-mode]', body).forEach(r => r.addEventListener('change', () => {
    saveMode({ inputMode: r.value });
    $('.ptt-key-row', body).classList.toggle('hidden', r.value !== 'ptt');
  }));
  $('#vs-ptt-key', body).addEventListener('click', e => {
    const btn = e.currentTarget;
    btn.innerHTML = 'Press a key… <span class="muted">(Esc to cancel)</span>';
    const grab = ev => {
      ev.preventDefault(); ev.stopImmediatePropagation();
      removeEventListener('keydown', grab, true);
      if (ev.code !== 'Escape') saveMode({ pttKey: ev.code, pttName: ev.key === ' ' ? 'Space' : ev.key.length === 1 ? ev.key.toUpperCase() : ev.key || ev.code });
      const v2 = Calls.voiceSettings();
      btn.innerHTML = `<kbd>${esc(v2.pttName || v2.pttKey)}</kbd> Change`;
    };
    addEventListener('keydown', grab, true);
  });
  $$('[data-vs]', body).forEach(cb => cb.addEventListener('change', () => save({ [cb.dataset.vs]: cb.checked })));
  $('#vs-sb', body).addEventListener('input', e => lsSet('zuno_sb_volume', Number(e.target.value)));
  $('#vs-sb-test', body).addEventListener('click', () => synthBoard('tada'));
  async function startTest() {
    stopMicTest();
    try {
      const v2 = Calls.voiceSettings();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: v2.echoCancellation, noiseSuppression: v2.noiseSuppression, autoGainControl: v2.autoGainControl, ...(v2.micId ? { deviceId: { ideal: v2.micId } } : {}) } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      micTest = { stream, ctx, timer: setInterval(() => {
        const lvl = $('#vs-level');
        if (!lvl) return stopMicTest();
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const x of buf) sum += ((x - 128) / 128) ** 2;
        lvl.style.width = Math.min(100, Math.sqrt(sum / buf.length) * 400) + '%';
      }, 60) };
      $('#vs-test').textContent = 'Stop Checking';
    } catch { toast('Zuno needs your microphone for this. Check that one is plugged in and allowed.', true); }
  }
  $('#vs-test', body).addEventListener('click', () => { if (micTest) { stopMicTest(); $('#vs-test').textContent = "Let's Check"; $('#vs-level').style.width = '0'; } else startTest(); });
}
const _closeLayerH = closeLayer;
closeLayer = function () { stopMicTest(); return _closeLayerH(); };

// ======================= calls show up as messages =======================
function durationText(ms) {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}
function callCardHtml(m) {
  const c = m.call, conv = activeConv();
  const mine = m.authorId === state.me.id;
  const who = user(m.authorId)?.displayName || 'Someone';
  const group = isGroupConv(conv);
  const live = c.state === 'ringing' || c.state === 'ongoing';
  const roomOf = group ? 'gc:' + conv.slice(2) : 'dm:' + [state.me.id, conv].sort().join(':');
  const inThis = Calls.room === roomOf;
  const kind = c.video ? 'video call' : 'call';
  let icon = c.video ? '🎥' : '📞', title, sub = '', cls = '';
  if (live) { title = mine ? `You started a ${kind}` : `${who} started a ${kind}`; sub = c.state === 'ongoing' && c.answeredAt ? `Going on now · started ${fmtTime(c.startedAt)}` : 'Ringing…'; cls = 'live'; }
  else if (c.state === 'missed') { cls = 'missed'; icon = '📵'; title = group ? `${who} started a ${kind} nobody joined` : mine ? `${user(conv)?.displayName || 'They'} missed your ${kind}` : `You missed a ${kind} from ${who}`; }
  else if (c.state === 'declined') { cls = 'missed'; icon = '📵'; title = mine ? `${user(conv)?.displayName || 'They'} declined your ${kind}` : `You declined a ${kind}`; }
  else { title = `${group ? `${who}'s` : mine ? 'Your' : `${who}'s`} ${kind} ended`; sub = `Lasted ${durationText(c.duration || 0)}${group && c.joined?.length > 1 ? ` · ${c.joined.length} people joined` : ''}`; }
  const btn = live && !inThis ? `<button class="btn btn-green btn-sm" data-callgo="${c.video ? 'video' : 'voice'}">${ICON.phone} Join</button>`
    : !live && !Calls.room ? `<button class="btn btn-grey btn-sm" data-callgo="${c.video ? 'video' : 'voice'}">${ICON.phone} Call Back</button>` : '';
  const faces = (c.joined || []).slice(0, 5).map(id => user(id)).filter(Boolean).map(u => avatar(u, 20)).join('');
  return `<div class="call-card ${cls}"><span class="cc-ico">${icon}</span><div class="cc-text"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${faces && group ? `<span class="cc-faces">${faces}</span>` : ''}${btn}</div>`;
}
const _mediaHtmlH = mediaHtml;
mediaHtml = function (m) { return (m.call ? callCardHtml(m) : '') + _mediaHtmlH(m); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-callgo]');
  if (!b) return;
  const conv = activeConv(), video = b.dataset.callgo === 'video';
  if (isGroupConv(conv)) Calls.startGroup(conv.slice(2), { video });
  else if (!isChannelConv(conv)) Calls.startDM(conv, { video });
});

// ======================= saved messages & reminders =======================
const BOOKMARK = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
let savedIds = new Set();
async function loadSaved() { try { const { saved } = await api('GET', '/api/me/saved'); savedIds = new Set(saved.map(s => s.msgId)); return saved; } catch { return []; } }
(function waitSaved() { if (state.me) loadSaved(); else setTimeout(waitSaved, 1000); })();
const REMIND = [['In 20 minutes', 20 * 60e3], ['In 1 hour', 3600e3], ['In 3 hours', 3 * 3600e3], ['Tomorrow morning', 'tomorrow'], ['Next week', 7 * 864e5]];
const remindMs = v => { if (v !== 'tomorrow') return v; const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d - Date.now(); };
async function saveMessage(conv, msgId, remindIn) {
  try {
    const { saved } = await api('POST', '/api/me/saved', { conv, msgId, ...(remindIn != null ? { remindIn } : {}) });
    savedIds.add(msgId);
    toast(saved.remindAt ? `🔖 Saved — Zuno will remind you ${whenText(saved.remindAt)}` : '🔖 Saved. Find it under Saved Messages in the top bar.');
  } catch (e) { toast(e.message, true); }
}
async function unsaveMessage(id) { try { await api('DELETE', `/api/me/saved/${id}`); savedIds.delete(id); } catch (e) { toast(e.message, true); } }
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.messages .msg[data-id]');
  if (!row || !$('#layer .menu')) return;
  const conv = activeConv(), id = row.dataset.id;
  const m = state.convos[conv]?.messages.find(x => x.id === id);
  if (!m || m.pending || m.call) return;
  addMenuItem({ label: 'Remind Me in 1 Hour', icon: ico('⏰'), run: () => saveMessage(conv, id, 3600e3) });
  addMenuItem({ label: 'Remind Me…', icon: ico('🗓️'), run: () => openMenu(row, REMIND.map(([label, v]) => ({ label, run: () => saveMessage(conv, id, remindMs(v)) }))) });
  addMenuItem(savedIds.has(id) ? { label: 'Remove from Saved', icon: ico('🔖'), run: () => unsaveMessage(id) } : { label: 'Save Message', icon: ico('🔖'), run: () => saveMessage(conv, id) });
});
async function openSaved(anchor) {
  const box = popover(anchor, 'pins-pop saved-pop', `<div class="pop-head">🔖 Saved Messages</div><div class="pop-list"><div class="fp-empty">Loading…</div></div>`);
  const saved = await loadSaved();
  if (!box.isConnected) return;
  const list = $('.pop-list', box);
  if (!saved.length) { list.innerHTML = `<div class="fp-empty">${mascot('curious')}<div>Nothing saved yet. Right-click a message and pick <b>Save Message</b> or <b>Remind Me</b>.</div></div>`; return; }
  list.innerHTML = saved.map(s => {
    const a = s.author || { id: s.snap.authorId, displayName: 'Someone' };
    return `<div class="pi-msg sv-item" data-sv="${esc(s.id)}">${avatar(a, 32)}<div class="pi-body"><div><b>${esc(a.displayName)}</b> <span class="muted small">${fmtTime(s.snap.createdAt)}</span></div>
      <div class="muted small">${esc(s.snap.where)}</div><div class="pi-text">${formatMessage(s.snap.content || '')}</div>
      ${s.remindAt ? `<div class="sv-remind">⏰ Reminder ${esc(whenText(s.remindAt))}</div>` : s.remindedAt ? '<div class="sv-remind done">✓ Reminded</div>' : ''}</div>
      <div class="sv-acts"><button class="btn btn-grey btn-sm" data-svgo>Jump</button><button class="icon-btn" data-svrem title="Remind me">⏰</button><button class="icon-btn" data-svdel title="Remove">✕</button></div></div>`;
  }).join('');
  $$('[data-sv]', list).forEach(row => {
    const s = saved.find(x => x.id === row.dataset.sv);
    $('[data-svgo]', row).addEventListener('click', () => { closeLayer(); jumpToSaved(s); });
    $('[data-svdel]', row).addEventListener('click', async () => { await unsaveMessage(s.id); row.remove(); if (!$('[data-sv]', list)) openSaved(anchor); });
    $('[data-svrem]', row).addEventListener('click', e => openMenu(e.currentTarget, [...REMIND.map(([label, v]) => ({ label, run: () => saveMessage(s.conv, s.msgId, remindMs(v)) })), ...(s.remindAt ? ['sep', { label: 'Cancel Reminder', run: () => saveMessage(s.conv, s.msgId, 0) }] : [])]));
  });
}
async function jumpToSaved(s) {
  const conv = s.conv;
  if (activeConv() !== conv) {
    if (isChannelConv(conv)) {
      const sv = state.servers.find(x => x.channels.some(c => c.id === conv.slice(3)));
      if (!sv) return toast("You're not in that server anymore.", true);
      await openChannel(sv.id, conv.slice(3));
    } else if (isGroupConv(conv)) await openGroup(conv.slice(2));
    else await openDM(conv);
  }
  for (let i = 0; i < 40 && !state.convos[conv]?.loaded; i++) await new Promise(r => setTimeout(r, 100));
  jumpToAny(conv, s.msgId);
}
function addSavedButton(bar) {
  if (!bar || $('#saved-btn', bar)) return;
  const b = document.createElement('button');
  b.className = 'icon-btn'; b.id = 'saved-btn'; b.title = 'Saved Messages'; b.innerHTML = BOOKMARK;
  const tools = $('.tb-tools', bar);
  tools ? tools.prepend(b) : bar.appendChild(b);
  b.addEventListener('click', e => openSaved(e.currentTarget));
}
const _renderDMHeaderH = renderDMHeader;
renderDMHeader = function () { _renderDMHeaderH(); addSavedButton($('#main .topbar')); };
const _showFriendsH = showFriends;
showFriends = function (...a) { const r = _showFriendsH(...a); const bar = $('#main .topbar'); if (bar) { const sp = document.createElement('div'); sp.style.flex = '1'; if (!$('#saved-btn', bar)) bar.appendChild(sp); addSavedButton(bar); } return r; };

// ======================= "Seen" in DMs =======================
function renderSeen() {
  $$('#messages .seen-tag').forEach(n => n.remove());
  const conv = activeConv(), convo = state.convos[conv];
  const seen = convo?.meta?.peerSeen;
  if (!convo || isChannelConv(conv) || isGroupConv(conv) || !seen) return;
  const last = [...convo.messages].reverse().find(m => !m.pending && !m.call);
  if (!last || last.authorId !== state.me.id || seen < last.createdAt) return;
  const row = $(`#messages .msg[data-id="${CSS.escape(last.id)}"]`);
  if (!row) return;
  const tag = document.createElement('div');
  tag.className = 'seen-tag'; tag.title = `Seen ${fmtTime(seen)}`;
  tag.textContent = `Seen ${fmtShort(seen)}`;
  row.appendChild(tag);
}
const _renderMessagesH = renderMessages;
renderMessages = function (...a) { _renderMessagesH(...a); renderSeen(); };
const _renderPrivacyH = renderPrivacy;
renderPrivacy = async function (body) { await _renderPrivacyH(body); addReceiptsToggle(body); };
function addReceiptsToggle(body) {
  if (!body || $('[data-pref="readReceipts"]', body) || !$('h2', body)) return;
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = prefToggle('readReceipts', 'Read receipts', 'Show “Seen” under your messages in DMs, and see when others have read yours. Turning this off hides it both ways.');
  $('.setting-group', body)?.after(g);
  wireToggles(g, () => showSettingsSection('privacy'));
}

// ======================= seasonal events =======================
const seasonFxOn = () => lsGet('zuno_season_fx', true);
function renderSeasonFx() {
  $('#season-fx')?.remove();
  document.documentElement.dataset.season = state.season?.key || '';
  if (!state.season || !seasonFxOn() || (typeof motionOff === 'function' && motionOff())) return;
  const el = document.createElement('div');
  el.id = 'season-fx'; el.className = 'season-fx s-' + state.season.key; el.setAttribute('aria-hidden', 'true');
  const phone = innerWidth <= 760; // fewer on phones, so they stay smooth
  const n = state.season.key === 'winter' ? (phone ? 16 : 40) : (phone ? 6 : 14);
  const chars = state.season.key === 'halloween' ? ['🎃', '🦇', '🍂', '🦇', '👻', '🍁'] : null;
  el.innerHTML = Array.from({ length: n }, (_, i) => {
    const r = k => fxRand(i, k);
    return `<i style="--x:${(r(1) * 100).toFixed(1)}%;--d:-${(r(2) * 20).toFixed(1)}s;--t:${(12 + r(3) * 16).toFixed(1)}s;--s:${(0.5 + r(4)).toFixed(2)};--sw:${(r(5) * 60 - 30).toFixed(0)}px">${chars ? chars[i % chars.length] : ''}</i>`;
  }).join('');
  document.body.appendChild(el);
}
function addSeasonToggle(body) {
  if (!body || !state.season || $('#season-toggle', body)) return;
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">${state.season.key === 'winter' ? '❄️' : '🎃'} ${esc(state.season.name)}</h4><label class="setting-row" id="season-toggle"><div><div class="setting-title">Seasonal effects</div><div class="setting-desc">${state.season.key === 'winter' ? 'Gentle snow falling across Zuno this December.' : 'Pumpkins, bats and leaves drifting across Zuno this October.'} Limited decorations are in Profiles while the event lasts.</div></div><input type="checkbox" class="switch"${seasonFxOn() ? ' checked' : ''}></label>`;
  body.appendChild(g);
  $('input', g).addEventListener('change', e => { lsSet('zuno_season_fx', e.target.checked); renderSeasonFx(); });
}
const _startH = start;
start = async function () {
  await _startH();
  renderSeasonFx();
  rememberAccount();
  if (state.season && lsGet('zuno_season_seen', '') !== state.season.key + new Date().getFullYear()) {
    lsSet('zuno_season_seen', state.season.key + new Date().getFullYear());
    setTimeout(() => toast(`${state.season.key === 'winter' ? '❄️' : '🎃'} ${state.season.name} is here! Grab the limited decorations in Settings › Profiles before it ends.`), 1800);
  }
};

// ======================= server insights =======================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourName = h => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const dayLabel = back => new Date(Date.now() - back * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function barChart(values, { label, height = 140 } = {}) {
  const max = Math.max(1, ...values), n = values.length, gap = 2, W = 600, w = (W - gap * (n - 1)) / n;
  const bars = values.map((v, i) => {
    const h = v ? Math.max(3, (v / max) * (height - 4)) : 0, x = i * (w + gap), y = height - h;
    const r = Math.min(4, w / 2, h);
    // Rounded top, square bottom: anchored to the baseline.
    const path = h ? `M${x} ${height}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${height}Z` : '';
    return `<g class="ch-hit" data-tt="${esc(`${dayLabel(n - 1 - i)} · ${v} ${label}`)}"><rect x="${x}" y="0" width="${w + gap}" height="${height}" fill="transparent"/>${path ? `<path d="${path}" class="ch-bar"/>` : ''}</g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)} per day, last 30 days"><line x1="0" x2="${W}" y1="${height - 0.5}" y2="${height - 0.5}" class="ch-base"/>${bars}</svg>
    <div class="ch-axis"><span>${dayLabel(n - 1)}</span><span>${dayLabel(Math.floor((n - 1) / 2))}</span><span>Today</span></div>`;
}
function lineChart(values, { label, height = 140 } = {}) {
  const W = 600, n = values.length, min = Math.min(...values), max = Math.max(min + 1, ...values);
  const lo = Math.max(0, min - Math.ceil((max - min) * 0.15)), x = i => (i / (n - 1)) * W, y = v => height - 6 - ((v - lo) / (max - lo)) * (height - 16);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)} over the last 30 days">
    <line x1="0" x2="${W}" y1="${height - 0.5}" y2="${height - 0.5}" class="ch-base"/>
    <polygon points="0,${height} ${pts} ${W},${height}" class="ch-area"/><polyline points="${pts}" class="ch-line" vector-effect="non-scaling-stroke"/>
    ${values.map((v, i) => `<rect class="ch-hit" x="${(x(i) - W / n / 2).toFixed(1)}" y="0" width="${(W / n).toFixed(1)}" height="${height}" fill="transparent" data-tt="${esc(`${dayLabel(n - 1 - i)} · ${v} ${label}`)}"/>`).join('')}</svg>
    <div class="ch-axis"><span>${dayLabel(n - 1)}</span><span>${lo === min ? '' : ''}</span><span>Today · ${values[n - 1]}</span></div>`;
}
function heatmap(heat) {
  const max = Math.max(1, ...heat.flat());
  // One hue, light to dark: more messages, more color.
  const cell = (n, d, h) => `<i class="hm-c" style="--k:${n ? (12 + (n / max) * 88).toFixed(0) : 0}%" data-tt="${esc(`${DAYS[d]} ${hourName(h)} · ${n} message${n === 1 ? '' : 's'}`)}"></i>`;
  return `<div class="heatmap"><div class="hm-days">${DAYS.map(d => `<span>${d}</span>`).join('')}</div><div class="hm-grid">${heat.map((row, d) => row.map((n, h) => cell(n, d, h)).join('')).join('')}</div>
    <div class="hm-hours"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
    <div class="hm-key muted small">Fewer <i style="--k:12%"></i><i style="--k:40%"></i><i style="--k:70%"></i><i style="--k:100%"></i> More</div></div>`;
}
function rankBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return `<div class="rank">${rows.map(r => `<div class="rk-row" data-tt="${esc(`${r.label} · ${r.count} messages`)}"><span class="rk-name">${r.html}</span><span class="rk-track"><i style="width:${(r.count / max) * 100}%"></i></span><b class="rk-n">${r.count.toLocaleString()}</b></div>`).join('')}</div>`;
}
async function ssInsights(body, sv) {
  body.innerHTML = `<div data-keep><h2>Server Insights</h2><div class="fp-empty">Crunching the numbers…</div></div>`;
  let d;
  try { d = await api('GET', `/api/servers/${sv.id}/insights?tz=${-new Date().getTimezoneOffset()}`); }
  catch (e) { body.innerHTML = `<div data-keep><h2>Server Insights</h2><div class="fp-empty">${esc(e.message)}</div></div>`; return; }
  const tile = (n, label, sub = '') => `<div class="ins-tile"><b>${Number(n).toLocaleString()}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const peak = d.peak.count ? `${DAYS[d.peak.day]}s around ${hourName(d.peak.hour)}` : 'Not enough messages yet';
  body.innerHTML = `<div data-keep><h2>Server Insights</h2>
    <p class="muted" style="margin:-10px 0 16px">How ${esc(sv.name)} has been doing over the last 30 days. Times are in your time zone. Bots don't count.</p>
    <div class="ins-tiles">${tile(d.members, 'Members', d.newMembers7 ? `+${d.newMembers7} this week` : 'No new members this week')}${tile(d.online, 'Online now')}${tile(d.active7, 'Active this week', `${d.active30} in 30 days`)}${tile(d.messages7, 'Messages this week', `${d.messages30.toLocaleString()} in 30 days`)}</div>
    <div class="ins-card"><h4>Messages per day</h4>${barChart(d.daily, { label: 'messages' })}</div>
    <div class="ins-card"><h4>Members over time</h4>${lineChart(d.growth, { label: 'members' })}<p class="muted small">${d.joins.reduce((a, b) => a + b, 0)} people joined in the last 30 days (counting members who are still here).</p></div>
    <div class="ins-card"><h4>Busiest hours <span class="muted small">· busiest: ${esc(peak)}</span></h4>${heatmap(d.heat)}</div>
    <div class="ins-row">
      <div class="ins-card"><h4>Most active members</h4>${d.topMembers.length ? rankBars(d.topMembers.map(t => ({ label: t.user?.displayName || 'Someone', count: t.count, html: `${avatar(t.user || {}, 20)} ${esc(t.user?.displayName || 'Someone')}` }))) : '<div class="fp-empty">No messages yet.</div>'}</div>
      <div class="ins-card"><h4>Busiest channels</h4>${d.topChannels.length ? rankBars(d.topChannels.map(c => ({ label: '#' + c.name, count: c.count, html: `<span class="muted">#</span> ${esc(c.name)}` }))) : '<div class="fp-empty">No messages yet.</div>'}</div>
    </div></div>`;
  wireTooltips(body);
}
function wireTooltips(root) {
  let tip = $('.ch-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'ch-tip'; document.body.appendChild(tip); }
  root.addEventListener('mousemove', e => {
    const t = e.target.closest('[data-tt]');
    if (!t) { tip.classList.remove('on'); return; }
    tip.textContent = t.dataset.tt; tip.classList.add('on');
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px';
    tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
  });
  root.addEventListener('mouseleave', () => tip.classList.remove('on'));
}

// ======================= close friends =======================
const isClose = id => (state.closeFriends || []).includes(id);
async function setClose(id, on) {
  try { const { closeFriends } = await api('PUT', `/api/me/close-friends/${id}`, { on }); state.closeFriends = closeFriends; renderDMList(); toast(on ? `★ ${user(id)?.displayName || 'They'} ${on ? 'is now on' : 'left'} your Close Friends` : 'Removed from Close Friends'); }
  catch (e) { toast(e.message, true); }
}
function cfStatusHtml(s, mine) {
  return `<div class="cf-card"><div class="cf-head">★ Close Friends${mine ? ' · only they see this' : ''} <span class="muted small">until ${esc(whenText(s.until).replace(/^at /, ''))}</span></div>
    ${s.text ? `<div class="cf-text">${s.emoji ? `<span>${esc(s.emoji)}</span> ` : ''}${esc(s.text)}</div>` : ''}${s.image ? `<img class="cf-img att-img" src="${esc(s.image)}" alt="" data-full="${esc(s.image)}" data-name="Close Friends photo">` : ''}</div>`;
}
const _profileExtrasHtmlH = profileExtrasHtml;
profileExtrasHtml = function (u) {
  const mine = u.id === state.me?.id;
  const cf = mine ? state.myCfStatus : state.closeStatuses?.[u.id];
  return (cf ? cfStatusHtml(cf, mine) : '') + _profileExtrasHtmlH(u) + widgetsHtml(u);
};
const _openProfileH = openProfile;
openProfile = async function (id) {
  await _openProfileH(id);
  const acts = $('#layer .pc-actions');
  if (!acts || !isFriend(id)) return;
  const b = document.createElement('button');
  b.className = 'btn btn-grey cf-toggle' + (isClose(id) ? ' on' : '');
  b.innerHTML = isClose(id) ? '★ Close Friend' : '☆ Close Friends';
  b.title = 'Close Friends see your Close Friends status';
  acts.appendChild(b);
  b.addEventListener('click', async () => { await setClose(id, !isClose(id)); b.classList.toggle('on', isClose(id)); b.innerHTML = isClose(id) ? '★ Close Friend' : '☆ Close Friends'; });
};
const _openStatusMenuH = openStatusMenu;
openStatusMenu = function (anchor) {
  _openStatusMenuH(anchor);
  const menu = $('#layer .menu');
  if (!menu) return;
  const add = (label, icon, run, desc) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="mi-ico">${icon}</span><span>${esc(label)}${desc ? `<span class="desc">${esc(desc)}</span>` : ''}</span>`;
    b.addEventListener('click', () => { closeLayer(); run(); });
    menu.appendChild(b);
  };
  menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  add(state.myCfStatus ? 'Edit Close Friends Status' : 'Close Friends Status', '★', openCfStatus, 'Only your Close Friends see it');
  add('Close Friends List', '👥', openCfList, `${(state.closeFriends || []).length} ${(state.closeFriends || []).length === 1 ? 'person' : 'people'}`);
  menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  add('Switch Accounts', '🔁', openAccountSwitcher, savedAccounts().length > 1 ? `${savedAccounts().length} accounts` : 'Add another account');
  // Keep it on screen now that it's taller.
  const r = menu.getBoundingClientRect();
  if (r.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
};
function openCfStatus() {
  const cur = state.myCfStatus || {};
  let emoji = cur.emoji || '', image = cur.image || null;
  const ov = openLayer(`<form class="dialog modal cf-dialog"><h3>★ Close Friends Status</h3>
    <p class="muted" style="margin:0 0 12px">A status (and photo, like a story) only your ${(state.closeFriends || []).length} Close Friend${(state.closeFriends || []).length === 1 ? '' : 's'} can see. ${state.closeFriends?.length ? '' : '<b>Add people from their profile first.</b>'}</p>
    <div class="cs-row"><button type="button" class="cs-emoji" id="cf-emoji">${esc(emoji) || '😀'}</button><input name="text" maxlength="120" value="${esc(cur.text || '')}" placeholder="What's up, just between us?"></div>
    <div class="cf-photo-row"><div class="cf-photo" id="cf-photo">${image ? `<img src="${esc(image)}" alt="">` : '📷'}</div><button type="button" class="btn btn-grey btn-sm" id="cf-pick">${image ? 'Change Photo' : 'Add a Photo'}</button>${image ? '<button type="button" class="btn btn-link btn-sm" id="cf-nophoto">Remove</button>' : ''}<input type="file" id="cf-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif"></div>
    <label class="field">Disappears after<select name="hours" class="sc-select"><option value="1">1 hour</option><option value="4">4 hours</option><option value="8">8 hours</option><option value="24" selected>24 hours</option></select></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="clear">${state.myCfStatus ? 'Clear' : 'Cancel'}</button><button class="btn btn-primary">Share</button></div></form>`);
  const f = $('form', ov);
  $('#cf-emoji', ov).addEventListener('click', e => openEmojiPicker(e.currentTarget, x => { emoji = x; $('#cf-emoji', ov).textContent = x; }, { title: 'Status emoji' }));
  $('#cf-pick', ov).addEventListener('click', () => $('#cf-file', ov).click());
  $('#cf-nophoto', ov)?.addEventListener('click', () => { image = null; $('#cf-photo', ov).innerHTML = '📷'; });
  $('#cf-file', ov).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) return toast('That picture is too big (max 5 MB).', true);
    $('#cf-photo', ov).innerHTML = '…';
    try {
      const res = await fetch('/api/me/cf-photo', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      image = d.url; $('#cf-photo', ov).innerHTML = `<img src="${esc(image)}" alt="">`;
    } catch (err) { toast(err.message, true); $('#cf-photo', ov).innerHTML = '📷'; }
  });
  const put = async body => { try { const { cfStatus } = await api('PUT', '/api/me/cf-status', body); state.myCfStatus = cfStatus; closeLayer(); toast(cfStatus ? '★ Shared with your Close Friends' : 'Close Friends status cleared'); } catch (e) { toast(e.message, true); } };
  f.addEventListener('submit', e => { e.preventDefault(); if (!f.text.value.trim() && !image) return toast('Write something or add a photo.', true); put({ text: f.text.value, emoji, image, hours: Number(f.hours.value) }); });
  $('[data-a=clear]', ov).addEventListener('click', () => (state.myCfStatus ? put({ text: '', image: null }) : closeLayer()));
  f.text.focus();
}
function openCfList() {
  const friends = state.friends.map(user).filter(Boolean).sort((a, b) => isClose(b.id) - isClose(a.id) || a.displayName.localeCompare(b.displayName));
  const ov = openLayer(`<div class="dialog modal cf-list"><h3>★ Close Friends</h3><p class="muted" style="margin:0 0 10px">They see your Close Friends status. Nobody gets told when you add or remove them.</p>
    <input class="friends-search" id="cf-q" placeholder="Search friends">
    <div class="cf-people">${friends.map(u => `<label class="cf-person" data-name="${esc((u.displayName + ' ' + u.username).toLowerCase())}">${avatar(u, 32, true)}<b>${esc(u.displayName)}</b><input type="checkbox" class="switch" data-cf="${esc(u.id)}"${isClose(u.id) ? ' checked' : ''}></label>`).join('') || '<div class="fp-empty">Add some friends first.</div>'}</div>
    <div class="actions"><button class="btn btn-primary" data-a="ok">Done</button></div></div>`);
  $('#cf-q', ov).addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('.cf-person', ov).forEach(r => r.classList.toggle('hidden', !r.dataset.name.includes(q))); });
  $$('[data-cf]', ov).forEach(cb => cb.addEventListener('change', async () => {
    try { const { closeFriends } = await api('PUT', `/api/me/close-friends/${cb.dataset.cf}`, { on: cb.checked }); state.closeFriends = closeFriends; renderDMList(); }
    catch (e) { toast(e.message, true); cb.checked = !cb.checked; }
  }));
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
}

// ======================= DM pins & categories =======================
function saveDmLayout(change) {
  state.dmLayout = { pinned: [], cats: [], ...state.dmLayout, ...change };
  renderDMList();
  api('PUT', '/api/me/dm-layout', state.dmLayout).then(r => { state.dmLayout = r.dmLayout; renderDMList(); }).catch(e => toast(e.message, true));
}
const without = (arr, k) => (arr || []).filter(x => x !== k);
function openDmMenu(anchor, conv) {
  const lay = state.dmLayout || { pinned: [], cats: [] };
  const pinned = lay.pinned.includes(conv);
  const inCat = lay.cats.find(c => c.convs.includes(conv));
  const strip = () => ({ pinned: without(lay.pinned, conv), cats: lay.cats.map(c => ({ ...c, convs: without(c.convs, conv) })) });
  const items = [
    pinned ? { label: 'Unpin', icon: ico('📌'), run: () => saveDmLayout(strip()) } : { label: 'Pin to Top', icon: ico('📌'), run: () => { const s = strip(); saveDmLayout({ ...s, pinned: [conv, ...s.pinned] }); } },
    'sep',
    ...lay.cats.filter(c => c !== inCat).map(c => ({ label: `Move to ${c.name}`, icon: ico('📁'), run: () => { const s = strip(); saveDmLayout({ ...s, cats: s.cats.map(x => (x.id === c.id ? { ...x, convs: [...x.convs, conv] } : x)) }); } })),
    { label: 'New Category…', icon: ico('➕'), run: () => askName('New category', '', name => { const s = strip(); saveDmLayout({ ...s, cats: [...s.cats, { id: Math.random().toString(36).slice(2, 10), name, convs: [conv], collapsed: false }] }); }) },
    ...(inCat ? [{ label: `Remove from ${inCat.name}`, icon: ico('↩️'), run: () => saveDmLayout(strip()) }] : []),
  ];
  if (!isGroupConv(conv) && isFriend(conv)) items.push('sep', isClose(conv) ? { label: 'Remove from Close Friends', icon: ico('☆'), run: () => setClose(conv, false) } : { label: 'Add to Close Friends', icon: ico('★'), run: () => setClose(conv, true) });
  openMenu(anchor, items);
  // Put the menu where the mouse is.
  const m = $('#layer .menu'), ev = openDmMenu.ev;
  if (m && ev) { m.style.left = Math.min(ev.clientX, innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(ev.clientY, innerHeight - m.offsetHeight - 8) + 'px'; }
}
function askName(title, value, done) {
  const ov = openLayer(`<form class="dialog modal" style="max-width:380px"><h3>${esc(title)}</h3><label class="field">Name<input name="n" maxlength="32" value="${esc(value)}" required placeholder="Besties, Work, Gaming…"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  $('form', ov).addEventListener('submit', e => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) { closeLayer(); done(n); } });
  $('input', ov).select();
}
document.addEventListener('contextmenu', e => {
  const item = e.target.closest('#dm-list .dm-item[data-conv]');
  if (item) {
    // Run after any other right-click menu for this row, then replace it with one that has everything.
    e.preventDefault();
    setTimeout(() => {
      const other = $('#layer .menu');
      const extra = other ? [...other.querySelectorAll('button')].map(b => ({ label: b.textContent, el: b })) : [];
      openDmMenu.ev = e;
      openDmMenu(item, item.dataset.conv);
      if (extra.length) {
        const m = $('#layer .menu');
        m.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
        // Keep the friend menu's own actions (Profile, Call, Remove Friend…) below ours, without
        // repeating anything already in it (Profile and Block used to show up twice).
        const keyOf = t => (typeof tr42 === 'function' ? tr42(String(t).trim()) : String(t)).trim().toLowerCase(); // (0.46) translated vs not-yet-translated labels count as the same
        const have = new Set([...m.querySelectorAll('button')].map(b => keyOf(b.textContent)));
        for (const x of extra) {
          const key = keyOf(x.label);
          if (have.has(key)) continue;
          have.add(key);
          const b = x.el.cloneNode(true); m.appendChild(b); b.addEventListener('click', () => x.el.click());
        }
        if (m.lastElementChild?.classList.contains('sep')) m.lastElementChild.remove();
      }
    }, 0);
    return;
  }
  const head = e.target.closest('#dm-list [data-dmcat]');
  if (!head) return;
  e.preventDefault();
  const id = head.dataset.dmcat, lay = state.dmLayout, cat = lay.cats.find(c => c.id === id);
  if (!cat) return;
  openMenu(head, [
    { label: 'Rename Category', icon: ico('✏️'), run: () => askName('Rename category', cat.name, name => saveDmLayout({ cats: lay.cats.map(c => (c.id === id ? { ...c, name } : c)) })) },
    { label: 'Move Up', icon: ico('⬆️'), run: () => { const cats = [...lay.cats], i = cats.indexOf(cat); if (i > 0) [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; saveDmLayout({ cats }); } },
    'sep',
    { label: 'Delete Category', icon: ico('🗑️'), danger: true, desc: 'Conversations go back to Direct Messages', run: () => saveDmLayout({ cats: lay.cats.filter(c => c.id !== id) }) },
  ]);
});
document.addEventListener('click', e => {
  const head = e.target.closest('#dm-list [data-dmcat]');
  if (!head) return;
  const id = head.dataset.dmcat;
  saveDmLayout({ cats: (state.dmLayout.cats || []).map(c => (c.id === id ? { ...c, collapsed: !c.collapsed } : c)) });
});

// ======================= account switching =======================
// Accounts you've logged into on this device (up to 5), so you can hop between them.
const MAX_ACCOUNTS = 5;
const savedAccounts = () => lsGet('zuno_accounts', []).filter(a => a && a.token && a.id);
function rememberAccount() {
  if (!state.me || !state.token) return;
  const me = state.me;
  const list = savedAccounts().filter(a => a.id !== me.id);
  list.unshift({ id: me.id, token: state.token, username: me.username, displayName: me.displayName, avatar: me.avatar || null, avatarColor: me.avatarColor || null });
  lsSet('zuno_accounts', list.slice(0, MAX_ACCOUNTS));
}
function forgetAccount(id) { lsSet('zuno_accounts', savedAccounts().filter(a => a.id !== id)); }
async function switchTo(acc) {
  try {
    const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${acc.token}` } });
    if (res.status === 401) { forgetAccount(acc.id); toast(`You were logged out of ${acc.displayName}. Log in again to add it back.`, true); return false; }
    if (!res.ok) throw new Error();
  } catch { toast("Couldn't reach Zuno to switch accounts. Try again in a moment.", true); return false; }
  Calls.hangup({ quiet: true });
  localStorage.setItem('zuno_token', acc.token);
  location.reload();
  return true;
}
function openAccountSwitcher() {
  const list = savedAccounts();
  const ov = openLayer(`<div class="dialog modal acct-dialog"><h3>Switch Accounts</h3><p class="muted" style="margin:0 0 12px">Hop between up to ${MAX_ACCOUNTS} accounts on this device.</p>
    <div class="acct-list">${list.map(a => `<div class="acct-row${a.id === state.me.id ? ' on' : ''}" data-acct="${esc(a.id)}">${avatar({ ...a, status: a.id === state.me.id ? state.me.statusPref : undefined }, 36, a.id === state.me.id)}<div class="acct-who"><b>${esc(a.displayName)}</b><span class="muted small">${esc(a.username)}</span></div>
      ${a.id === state.me.id ? '<span class="ok-pill">Active</span>' : `<button class="btn btn-primary btn-sm" data-go>Switch</button><button class="icon-btn" data-forget title="Remove from this device">✕</button>`}</div>`).join('')}</div>
    ${list.length < MAX_ACCOUNTS ? '<button class="btn btn-grey acct-add" id="acct-add">➕ Add an Account</button>' : `<p class="muted small">That's the most accounts for one device. Remove one to add another.</p>`}
    <div class="actions"><button class="btn btn-link" data-a="ok">Close</button></div></div>`);
  $$('[data-acct]', ov).forEach(r => {
    const acc = list.find(a => a.id === r.dataset.acct);
    $('[data-go]', r)?.addEventListener('click', () => switchTo(acc));
    $('[data-forget]', r)?.addEventListener('click', () => { forgetAccount(acc.id); openAccountSwitcher(); });
  });
  $('#acct-add', ov)?.addEventListener('click', () => { rememberAccount(); closeLayer(); signOutLocal(); toast('Log in or create another account. Your other accounts stay saved.'); });
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
}
// Logging out forgets this account on this device; if others are saved, hop to one of them.
const _signOutH = signOut;
signOut = async function () {
  const id = state.me?.id;
  if (id) forgetAccount(id);
  await _signOutH();
  const next = savedAccounts()[0];
  if (next) switchTo(next);
};
// The login screen offers saved accounts too.
const _showAuthH = showAuth;
showAuth = function (...a) {
  _showAuthH(...a);
  const list = savedAccounts();
  $('#auth-accounts')?.remove();
  if (!list.length) return;
  const box = document.createElement('div');
  box.id = 'auth-accounts'; box.className = 'auth-accounts';
  box.innerHTML = `<div class="muted small">Continue as</div>${list.map(acc => `<button type="button" class="acct-chip" data-acct="${esc(acc.id)}">${avatar(acc, 24)}<b>${esc(acc.displayName)}</b></button>`).join('')}`;
  $('#auth-sub').after(box);
  $$('[data-acct]', box).forEach(b => b.addEventListener('click', () => switchTo(list.find(x => x.id === b.dataset.acct))));
};

// ======================= profile widgets =======================
const WIDGET_TYPES = {
  games: { name: 'Favorite Games', icon: '🎮' }, song: { name: 'Song on Repeat', icon: '🎵' }, photo: { name: 'Photo', icon: '🖼️' },
  text: { name: 'Text Box', icon: '📝' }, faves: { name: 'Favorite Things', icon: '⭐' },
};
function widgetHtml(w) {
  if (w.type === 'games') return `<div class="wg wg-games"><h5>🎮 Favorite Games</h5><div class="wg-chips">${w.items.map(i => `<span>${esc(i.emoji)} ${esc(i.name)}</span>`).join('')}</div></div>`;
  if (w.type === 'song') return `<div class="wg wg-song"><span class="wg-disc">🎵</span><div><h5>On Repeat</h5>${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(w.title)}</b></a>` : `<b>${esc(w.title)}</b>`}${w.artist ? `<div class="muted small">${esc(w.artist)}</div>` : ''}</div></div>`;
  if (w.type === 'photo') return `<div class="wg wg-photo"><img class="att-img" src="${esc(w.url)}" alt="" data-full="${esc(w.url)}" data-name="${esc(w.caption || 'Photo')}" loading="lazy">${w.caption ? `<div class="muted small">${esc(w.caption)}</div>` : ''}</div>`;
  if (w.type === 'text') return `<div class="wg wg-text"><h5>${esc(w.title)}</h5><div>${esc(w.body)}</div></div>`;
  if (w.type === 'faves') return `<div class="wg wg-faves"><h5>⭐ ${esc(w.title)}</h5><ol>${w.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div>`;
  return '';
}
function widgetsHtml(u) { return u.widgets?.length ? `<div class="widgets">${u.widgets.map(widgetHtml).join('')}</div>` : ''; }
async function saveWidgets(widgets) {
  try { const { me } = await api('PATCH', '/api/me', { widgets }); state.me = { ...state.me, ...me }; state.users[me.id] = { ...state.users[me.id], ...me }; toast('Widgets saved'); return true; }
  catch (e) { toast(e.message, true); return false; }
}
function addWidgetEditor(body) {
  if (!body || !$('.profile-editor', body) || $('#wg-editor', body)) return;
  const list = state.me.widgets || [];
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'wg-editor';
  g.innerHTML = `<h4 class="setting-head">Profile Widgets <span class="muted small">${list.length} / 4</span></h4>
    <p class="setting-desc" style="margin:0 0 10px">Little cards on your profile: games you love, a song on repeat, a photo, a few words. Saved right away.</p>
    <div class="wg-edit-list">${list.map((w, i) => `<div class="wg-edit" data-wi="${i}"><span class="wg-e-ico">${WIDGET_TYPES[w.type].icon}</span><b>${esc(WIDGET_TYPES[w.type].name)}</b><span class="muted small wg-e-sum">${esc(w.title || w.items?.map(x => x.name || x).join(', ') || w.caption || '')}</span>
      <button class="icon-btn" data-wup title="Move up"${i ? '' : ' disabled'}>⬆</button><button class="btn btn-grey btn-sm" data-wedit>Edit</button><button class="icon-btn danger" data-wdel title="Remove">${ICON.trash}</button></div>`).join('')}</div>
    ${list.length < 4 ? '<button class="btn btn-primary btn-sm" id="wg-add">➕ Add a Widget</button>' : ''}`;
  body.appendChild(g);
  const redo = async next => { if (await saveWidgets(next)) { g.remove(); addWidgetEditor(body); } };
  // The widget types show right under the button (a pop-up menu would close Settings behind it).
  $('#wg-add', g)?.addEventListener('click', e => {
    const old = $('.wg-types', g);
    if (old) return old.remove();
    const box = document.createElement('div');
    box.className = 'wg-types';
    box.innerHTML = Object.entries(WIDGET_TYPES).map(([type, t]) => `<button type="button" class="btn btn-grey btn-sm" data-wtype="${type}">${t.icon} ${esc(t.name)}</button>`).join('');
    e.currentTarget.after(box);
    $$('[data-wtype]', box).forEach(b => b.addEventListener('click', () => { box.remove(); editWidget({ type: b.dataset.wtype }, w => redo([...list, w])); }));
  });
  $$('[data-wi]', g).forEach(r => {
    const i = Number(r.dataset.wi);
    $('[data-wedit]', r).addEventListener('click', () => editWidget(list[i], w => redo(list.map((x, k) => (k === i ? w : x)))));
    $('[data-wdel]', r).addEventListener('click', () => redo(list.filter((_, k) => k !== i)));
    $('[data-wup]', r).addEventListener('click', () => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; redo(n); });
  });
}
function editWidget(w, done) {
  const t = WIDGET_TYPES[w.type];
  const fields = {
    games: `<label class="field">Games, one per line (start with an emoji if you like)<textarea name="items" rows="5" maxlength="400" placeholder="⛏️ Minecraft\n🚀 Rocket League">${esc((w.items || []).map(i => `${i.emoji} ${i.name}`).join('\n'))}</textarea></label>`,
    song: `<label class="field">Song<input name="title" maxlength="80" required value="${esc(w.title || '')}"></label><label class="field">Artist<input name="artist" maxlength="80" value="${esc(w.artist || '')}"></label><label class="field">Link (optional)<input name="url" maxlength="300" placeholder="https://open.spotify.com/…" value="${esc(w.url || '')}"></label>`,
    photo: `<div class="field">Photo<div class="wg-photo-pick" id="wg-ph">${w.url ? `<img src="${esc(w.url)}" alt="">` : '🖼️'}</div><button type="button" class="btn btn-grey btn-sm" id="wg-pick">${w.url ? 'Change' : 'Upload'}</button><input type="file" id="wg-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif"></div><label class="field">Caption<input name="caption" maxlength="100" value="${esc(w.caption || '')}"></label>`,
    text: `<label class="field">Title<input name="title" maxlength="40" value="${esc(w.title || 'About')}"></label><label class="field">Text<textarea name="body" rows="4" maxlength="300" required>${esc(w.body || '')}</textarea></label>`,
    faves: `<label class="field">Title<input name="title" maxlength="40" value="${esc(w.title || 'Favorite Things')}"></label><label class="field">One per line (up to 8)<textarea name="items" rows="5" maxlength="400">${esc((w.items || []).join('\n'))}</textarea></label>`,
  }[w.type];
  // Opens on top of Settings (openLayer would close Settings, and the widget list with it).
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.style.zIndex = 130;
  ov.innerHTML = `<form class="dialog modal" style="max-width:440px"><h3>${t.icon} ${esc(t.name)}</h3>${fields}<div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
  $('#layer').appendChild(ov);
  const closeMe = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeMe(); });
  let photo = w.url || null;
  $('[data-a=cancel]', ov).addEventListener('click', closeMe);
  $('#wg-pick', ov)?.addEventListener('click', () => $('#wg-file', ov).click());
  $('#wg-file', ov)?.addEventListener('change', async e => {
    let file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const btn = $('#wg-pick', ov);
    btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      // Big photos (straight from a phone camera) are made smaller first, so they fit.
      if (file.type !== 'image/gif' && file.size > 1.5e6) file = await shrinkPhoto(file, 1600);
      const res = await fetch('/api/me/widget-photo', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || "That picture couldn't be uploaded.");
      photo = d.url; $('#wg-ph', ov).innerHTML = `<img src="${esc(photo)}" alt="">`;
    } catch (err) { toast(err.message, true); }
    btn.disabled = false; btn.textContent = photo ? 'Change' : 'Upload';
  });
  $('form', ov).addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, lines = v => v.split('\n').map(s => s.trim()).filter(Boolean);
    let out;
    if (w.type === 'games') out = { type: 'games', items: lines(f.items.value).slice(0, 6).map(l => { const m = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u.exec(l); return m ? { emoji: m[1], name: m[2] } : { emoji: '🎮', name: l }; }) };
    if (w.type === 'song') out = { type: 'song', title: f.title.value, artist: f.artist.value, url: f.url.value.trim() || null };
    if (w.type === 'photo') { if (!photo) return toast('Upload a photo first.', true); out = { type: 'photo', url: photo, caption: f.caption.value }; }
    if (w.type === 'text') out = { type: 'text', title: f.title.value, body: f.body.value };
    if (w.type === 'faves') out = { type: 'faves', title: f.title.value, items: lines(f.items.value).slice(0, 8) };
    if ((out.items && !out.items.length)) return toast('Add at least one.', true);
    closeMe(); done(out);
  });
}
// A photo made smaller (longest side `max` px) as a JPEG, for uploads with a size limit.
function shrinkPhoto(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(new File([b], 'photo.jpg', { type: 'image/jpeg' })) : reject(new Error("That picture couldn't be read."))), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn't be read. Try a PNG or JPG.")); };
    img.src = url;
  });
}
