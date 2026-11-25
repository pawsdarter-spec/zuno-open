'use strict';
// Zuno 0.44: Zuno Manager and Zuno Art Manager badges, channel member lists that only show who can
// see the channel, server mute / deafen / disconnect in voice, picking your mic and speakers by
// right-clicking the mic and headphones, the app font, keybinds, asking for someone's time zone,
// the activity widget on profiles, and slash commands that fold into the bot's answer.

// ======================= badges =======================
BADGE_INFO.zuno_manager = {
  label: 'Zuno Manager', desc: 'Runs the Zuno Staff team',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgMgr44" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a7a"/><stop offset="1" stop-color="#c3122b"/></linearGradient></defs>
    <path d="M12 1.6 20.6 5v6.3c0 5.3-3.6 9.5-8.6 11.1-5-1.6-8.6-5.8-8.6-11.1V5z" fill="url(#bgMgr44)"/>
    <path d="M6.4 17.2c0-3.6 2.5-6.2 5.6-6.2s5.6 2.6 5.6 6.2z" fill="#ffe8e8"/>
    <path d="M8.3 6.2l1.6 1.5L12 5.6l2.1 2.1 1.6-1.5-.5 3.6H8.8z" fill="#ffd166"/>
    <ellipse cx="10.2" cy="14.4" rx=".9" ry="1.25" fill="#8a0d1f"/><ellipse cx="13.8" cy="14.4" rx=".9" ry="1.25" fill="#8a0d1f"/></svg>`,
};
BADGE_INFO.art_manager = {
  label: 'Zuno Art Manager', desc: 'Leads the art on Zuno: decorations, effects and banners',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgArtMgr44" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".45" stop-color="#ff7eb6"/><stop offset="1" stop-color="#7a3cff"/></linearGradient></defs>
    <path d="M12 1.2l2.9 2.3 3.7-.3 1 3.6 3.2 1.8-1.1 3.4 1.1 3.4-3.2 1.8-1 3.6-3.7-.3L12 22.8l-2.9-2.3-3.7.3-1-3.6L1.2 15.4l1.1-3.4-1.1-3.4 3.2-1.8 1-3.6 3.7.3z" fill="url(#bgArtMgr44)"/>
    <path d="M12 6c-3.6 0-6.3 2.5-6.3 5.8 0 2.9 2.3 5.2 5 5.2.9 0 1.3-.5 1.3-1.2 0-.7-.5-1-.5-1.6 0-.7.5-1.1 1.2-1.1h1.5c2.2 0 4.1-1.5 4.1-3.6C18.3 7 15.6 6 12 6z" fill="#fff"/>
    <circle cx="8.9" cy="11.2" r="1.05" fill="#ff5f8f"/><circle cx="11.3" cy="8.9" r="1.05" fill="#ffd166"/><circle cx="14.4" cy="9.2" r="1.05" fill="#04c5ae"/>
    <path d="M17.2 2.2l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#fff"/></svg>`,
};

// ======================= channel member lists =======================
// A private channel lists only the people who can see it.
{
  const _renderMemberList44 = renderMemberList;
  renderMemberList = function (...a) {
    const sv = currentServer(), ch = currentChannel();
    const keep = sv && state.serverMembers[sv.id];
    if (!keep || !Array.isArray(ch?.viewers)) return _renderMemberList44(...a);
    const can = new Set(ch.viewers);
    state.serverMembers[sv.id] = keep.filter(id => can.has(id) || user(id)?.bot);
    try { return _renderMemberList44(...a); } finally { state.serverMembers[sv.id] = keep; }
  };
}

// ======================= voice: server mute, server deafen, disconnect =======================
const voiceRoomOf44 = (sv, uid) => Object.entries(sv?.voice || {}).find(([, ids]) => (ids || []).includes(uid))?.[0] || null;
const voiceAct44 = async (sv, uid, action) => {
  try { await api('POST', `/api/servers/${sv.id}/voice/${uid}`, { action }); toast({ mute: 'Server muted', unmute: 'Server unmuted', deafen: 'Server deafened', undeafen: 'Server undeafened', disconnect: 'Disconnected' }[action]); }
  catch (e) { toast(e.message, true); }
};
{
  const _openMemberMenu44 = openMemberMenu;
  openMemberMenu = function (sv, id, anchor, ...rest) {
    sv = svById(sv.id) || sv;
    const inVoice = voiceRoomOf44(sv, id);
    const mod = sv.voiceMod?.[id] || {};
    const above = id !== state.me.id && typeof outranksMe === 'function' && outranksMe(sv, id);
    const extra = [];
    if (inVoice && !above && id !== sv.ownerId || (inVoice && isOwner(sv))) {
      if (hasPerm(sv, 'mute_members')) extra.push({ label: mod.mute ? 'Server Unmute' : 'Server Mute', icon: uiIcon(mod.mute ? 'mic' : 'volumeOff'), run: () => voiceAct44(sv, id, mod.mute ? 'unmute' : 'mute') });
      if (hasPerm(sv, 'deafen_members')) extra.push({ label: mod.deafen ? 'Server Undeafen' : 'Server Deafen', icon: uiIcon('headphones'), run: () => voiceAct44(sv, id, mod.deafen ? 'undeafen' : 'deafen') });
      if (hasPerm(sv, 'move_members') && id !== state.me.id) extra.push({ label: 'Disconnect from Voice', icon: uiIcon('door'), danger: true, run: () => voiceAct44(sv, id, 'disconnect') });
    } else if (!inVoice && (mod.mute || mod.deafen) && (hasPerm(sv, 'mute_members') || hasPerm(sv, 'deafen_members'))) {
      if (mod.mute) extra.push({ label: 'Server Unmute', icon: uiIcon('mic'), run: () => voiceAct44(sv, id, 'unmute') });
      if (mod.deafen) extra.push({ label: 'Server Undeafen', icon: uiIcon('headphones'), run: () => voiceAct44(sv, id, 'undeafen') });
    }
    if (!extra.length) return _openMemberMenu44(sv, id, anchor, ...rest);
    const _om = openMenu;
    openMenu = function (a, items, ...more) {
      openMenu = _om;
      const at = items.findIndex(it => it === 'sep' && items[items.indexOf(it) + 1]?.label === 'Copy User ID');
      const list = [...items];
      if (at >= 0) list.splice(at, 0, 'sep', ...extra); else list.push('sep', ...extra);
      return _om(a, list, ...more);
    };
    try { return _openMemberMenu44(sv, id, anchor, ...rest); } finally { openMenu = _om; }
  };
}
// You were server muted or deafened: your own buttons show it, and you can't turn it off yourself.
const forced44 = { mute: false, deafen: false, room: null };
onLive26('voice-forced', d => {
  if (Calls.room !== d.room) return;
  Object.assign(forced44, { mute: !!d.mute, deafen: !!d.deafen, room: d.room });
  const c = Calls.state;
  if ((d.mute || d.deafen) && !c.muted) Calls.toggleMute();
  if (d.deafen && !c.deafened) Calls.toggleDeafen();
  if (!d.deafen && c.deafened && d.action === 'undeafen') Calls.toggleDeafen();
  if (!d.quiet && d.action) toast({ mute: `${d.by || 'A moderator'} server muted you.`, unmute: 'You can talk again.', deafen: `${d.by || 'A moderator'} server deafened you.`, undeafen: 'You can hear again.' }[d.action] || '');
  renderUserPanel();
});
{
  const _mute = Calls.toggleMute, _deaf = Calls.toggleDeafen;
  const stillForced = () => forced44.room && forced44.room === Calls.room;
  Calls.toggleMute = function (...a) {
    if (stillForced() && (forced44.mute || forced44.deafen) && Calls.state.muted) return toast('A moderator server muted you here.', true);
    return _mute(...a);
  };
  Calls.toggleDeafen = function (...a) {
    if (stillForced() && forced44.deafen && Calls.state.deafened) return toast('A moderator server deafened you here.', true);
    return _deaf(...a);
  };
  setInterval(() => { if (forced44.room && forced44.room !== Calls.room) Object.assign(forced44, { mute: false, deafen: false, room: null }); }, 2000);
}
// Server-muted people get a red mic in the voice channel list.
function paintVoiceMod44() {
  const sv = state.currentServerId && currentServer();
  if (!sv) return;
  for (const row of $$('#sidebar-scroll .voice-user[data-vu]')) {
    const m = sv.voiceMod?.[row.dataset.vu];
    const want = m ? (m.deafen ? 'headphones' : 'volumeOff') : '';
    const cur = $('.vm44', row);
    if ((cur?.dataset.k || '') === want) continue;
    cur?.remove();
    if (want) row.insertAdjacentHTML('beforeend', `<span class="vm44" data-k="${want}" title="${m.deafen ? 'Server deafened' : 'Server muted'}">${uiIcon(want)}</span>`);
  }
}
{
  const _rss44 = renderServerSidebar;
  renderServerSidebar = function (...a) { const r = _rss44(...a); paintVoiceMod44(); return r; };
}

// ======================= right-click the mic or headphones: pick a device =======================
const voiceSet44 = change => { try { localStorage.setItem('zuno_voice_settings', JSON.stringify({ ...Calls.voiceSettings(), ...change })); } catch {} };
async function applySpeaker44(id = Calls.voiceSettings().spkId || '') {
  for (const el of $$('audio')) if (el.setSinkId) el.setSinkId(id).catch(() => {});
  try { const ac = Calls.synth?.ctx?.(); if (ac?.setSinkId) await ac.setSinkId(id || '').catch(() => {}); } catch {}
}
// New sounds (people joining the call) use your speakers too.
new MutationObserver(list => {
  const id = Calls.voiceSettings().spkId;
  if (!id) return;
  for (const r of list) for (const n of r.addedNodes) if (n.nodeName === 'AUDIO' && n.setSinkId) n.setSinkId(id).catch(() => {});
}).observe(document.body, { childList: true, subtree: true });
setTimeout(() => { if (Calls.voiceSettings().spkId) applySpeaker44(); }, 3000);
async function deviceMenu44(anchor, kind) {
  let list = [];
  try { list = await navigator.mediaDevices.enumerateDevices(); } catch {}
  const want = kind === 'mic' ? 'audioinput' : 'audiooutput';
  const devs = list.filter(d => d.kind === want && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const v = Calls.voiceSettings(), cur = kind === 'mic' ? v.micId || '' : v.spkId || '';
  const check = on => (on ? uiIcon('check') : '<span class="dm44-blank"></span>');
  const pick = async id => {
    if (kind === 'mic') { voiceSet44({ micId: id }); Calls.refreshMic(); }
    else { voiceSet44({ spkId: id }); applySpeaker44(id); }
    toast(kind === 'mic' ? 'Microphone changed' : 'Speakers changed');
  };
  const noNames = devs.length && !devs[0].label;
  const items = [
    { label: kind === 'mic' ? 'Input Device' : 'Output Device', desc: noNames ? 'Names show after you allow microphone access once' : '', icon: uiIcon(kind === 'mic' ? 'mic' : 'headphones'), run: () => {} },
    'sep',
    { label: kind === 'mic' ? 'Default microphone' : 'Default speakers', icon: check(!cur), run: () => pick('') },
    ...devs.map((d, i) => ({ label: d.label || `${kind === 'mic' ? 'Microphone' : 'Speakers'} ${i + 1}`, icon: check(cur === d.deviceId), run: () => pick(d.deviceId) })),
  ];
  if (kind === 'out' && !('setSinkId' in HTMLMediaElement.prototype)) items.splice(2, items.length, { label: "This browser can't pick speakers", desc: 'Use the Zuno app or Chrome', icon: uiIcon('warning'), run: () => {} });
  if (kind === 'mic') items.push('sep', { label: v.noiseSuppression ? 'Noise suppression: on' : 'Noise suppression: off', icon: uiIcon('sparkles'), run: () => { voiceSet44({ noiseSuppression: !v.noiseSuppression }); Calls.refreshMic(); toast(`Noise suppression ${v.noiseSuppression ? 'off' : 'on'}`); } });
  if (kind === 'mic' && Calls.voiceFxList) items.push({ label: `Voice changer: ${Calls.voiceFxList[v.fx || 'off'] || 'Off'}`, desc: 'Beta', icon: uiIcon('wave'), run: () => setTimeout(() => openMenu(anchor, Object.entries(Calls.voiceFxList).map(([k, l]) => ({ label: l, icon: check((v.fx || 'off') === k), run: () => { voiceSet44({ fx: k }); Calls.refreshMic(); toast(k === 'off' ? 'Voice changer off' : `Voice changer: ${l}`); } }))), 0) });
  items.push('sep', { label: 'Voice Settings', icon: uiIcon('gear'), run: () => openSettings('voice') });
  openMenu(anchor, items);
}
document.addEventListener('contextmenu', e => {
  const b = e.target.closest?.('#mute-btn, #deafen-btn, [data-call="mute"], [data-call="deafen"], .vc-btn.mute, .vc-btn.deafen');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  deviceMenu44(b, /deaf/.test(b.id || b.dataset.call || b.className) ? 'out' : 'mic');
}, true);

// ======================= Appearance: app font =======================
const APP_FONTS44 = [
  ['', 'Figtree (Zuno)', ''], ['Nunito', 'Nunito', 'Nunito:wght@400;600;700;800'], ['Inter', 'Inter', 'Inter:wght@400;500;600;700'], ['Poppins', 'Poppins', 'Poppins:wght@400;500;600;700'],
  ['Lexend', 'Lexend', 'Lexend:wght@400;500;600;700'], ['Atkinson Hyperlegible', 'Atkinson Hyperlegible (easy to read)', 'Atkinson+Hyperlegible:wght@400;700'], ['Comfortaa', 'Comfortaa', 'Comfortaa:wght@400;600;700'],
  ['Quicksand', 'Quicksand', 'Quicksand:wght@400;500;600;700'], ['Rubik', 'Rubik', 'Rubik:wght@400;500;600;700'], ['Outfit', 'Outfit', 'Outfit:wght@400;500;600;700'], ['Space Grotesk', 'Space Grotesk', 'Space+Grotesk:wght@400;500;600;700'],
  ['JetBrains Mono', 'JetBrains Mono', 'JetBrains+Mono:wght@400;600;700'], ['Comic Neue', 'Comic Neue', 'Comic+Neue:wght@400;700'], ['system', 'Your system font', ''],
];
function applyAppFont44() {
  let f = '';
  try { f = localStorage.getItem('zuno_font') || ''; } catch {}
  const def = APP_FONTS44.find(x => x[0] === f);
  const root = document.documentElement;
  if (!f || !def) { root.style.removeProperty('--font'); return; }
  if (f === 'system') { root.style.setProperty('--font', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'); return; }
  if (def[2] && !document.getElementById('font44')) {
    const l = document.createElement('link');
    l.id = 'font44'; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${def[2]}&display=swap`;
    document.head.appendChild(l);
  } else if (def[2]) $('#font44').href = `https://fonts.googleapis.com/css2?family=${def[2]}&display=swap`;
  root.style.setProperty('--font', `"${f}", "Figtree", "Segoe UI", sans-serif`);
}
applyAppFont44();
{
  const _renderAppearance44 = renderAppearance;
  renderAppearance = function (body, ...a) {
    const r = _renderAppearance44(body, ...a);
    Promise.resolve(r).then(() => {
      if (!body?.isConnected || $('#font44-g', body)) return;
      let cur = '';
      try { cur = localStorage.getItem('zuno_font') || ''; } catch {}
      const g = document.createElement('div');
      g.className = 'setting-group'; g.id = 'font44-g';
      g.innerHTML = `<h4 class="setting-head">App font</h4>
        <div class="setting-row"><div><div class="setting-title">Font</div><div class="setting-desc">The font for all of Zuno on this device. Messages, menus and settings all change.</div></div>
          <select class="sc-select" id="font44-pick">${APP_FONTS44.map(([k, n]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="font44-prev">The quick brown fox jumps over the lazy dog. 0123456789</div>`;
      ($('#perf43', body) || $('h2', body))?.after(g);
      $('#font44-pick', g).addEventListener('change', e => {
        try { localStorage.setItem('zuno_font', e.target.value); } catch {}
        applyAppFont44();
        toast('Font changed');
      });
    });
    return r;
  };
}

// ======================= Keybinds =======================
// Change Zuno's keyboard shortcuts, or add your own for things that had none.
const KEYBINDS44 = [
  ['mute', 'Toggle mute', 'Ctrl+Shift+M', () => Calls.room && Calls.toggleMute()],
  ['deafen', 'Toggle deafen', 'Ctrl+Shift+D', () => Calls.room && Calls.toggleDeafen()],
  ['hangup', 'Leave the call', '', () => Calls.room && Calls.hangup()],
  ['camera', 'Turn camera on or off', '', () => Calls.room && Calls.toggleCamera()],
  ['screen', 'Share your screen', '', () => Calls.room && Calls.toggleScreen()],
  ['switcher', 'Quick switcher', 'Ctrl+K', () => (typeof openQuickSwitcher === 'function' ? openQuickSwitcher() : openSwitcher())],
  ['prevChat', 'Previous chat or channel', 'Alt+ArrowUp', null],
  ['nextChat', 'Next chat or channel', 'Alt+ArrowDown', null],
  ['search', 'Search everything', '', () => openSearchEverywhere()],
  ['inbox', 'Open your inbox', '', () => { const b = $('#inbox-btn') || $('[data-tip="Inbox"]'); b ? b.click() : openInbox(document.body); }],
  ['saved', 'Saved messages', 'Ctrl+Shift+S', () => { const b = $('#saved-btn'); if (b) openSaved(b); }],
  ['catchup', 'Catch up on unread', 'Ctrl+Shift+U', () => activeConv() && openCatchUp()],
  ['emoji', 'Emoji picker', 'Ctrl+E', () => $('#composer-emoji')?.click()],
  ['upload', 'Upload a file', '', () => ($('#composer-attach') || $('#attach-btn'))?.click()],
  ['markRead', 'Mark this server read', '', () => { const sv = state.currentServerId && currentServer(); if (sv) markServerRead(sv); }],
  ['bottom', 'Jump to the newest message', '', () => { const el = $('#messages'); if (el) el.scrollTop = el.scrollHeight; }],
  ['settings', 'Open settings', 'Ctrl+,', () => openSettings()],
  ['shortcuts', 'Show all shortcuts', 'Ctrl+/', null],
];
const kbLoad44 = () => { try { return JSON.parse(localStorage.getItem('zuno_keybinds') || '{}'); } catch { return {}; } };
const kbOf44 = id => { const m = kbLoad44(); return id in m ? m[id] : KEYBINDS44.find(k => k[0] === id)[2]; };
function comboOf44(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
  const k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
}
const comboHtml44 = c => (c ? c.split('+').map(x => `<kbd>${esc(x.replace('Arrow', '').replace('Up', '↑').replace('Down', '↓').replace('Left', '←').replace('Right', '→'))}</kbd>`).join('<i>+</i>') : '<span class="muted">Not set</span>');
// Runs before Zuno's own shortcuts, so a changed key moves the shortcut (the old key stops working).
addEventListener('keydown', e => {
  if (!state.me || e.repeat || $('.kb44-rec')) return;
  const combo = comboOf44(e);
  if (!combo) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && document.activeElement.id !== 'composer-input';
  const mine = kbLoad44();
  const hit = KEYBINDS44.find(([id]) => kbOf44(id) === combo);
  if (hit) {
    const [id, , def, run] = hit;
    if (combo === def && !(id in mine)) return; // unchanged: Zuno's own shortcut handles it
    if (typing && !/^(Ctrl|Alt)\+/.test(combo)) return;
    if (run) { e.preventDefault(); e.stopImmediatePropagation(); try { run(); } catch {} return; }
    // A moved shortcut that Zuno runs itself (like Alt+↑): press the old key for it.
    if (id === 'prevChat' || id === 'nextChat') { e.preventDefault(); e.stopImmediatePropagation(); try { neighbourChat(id === 'prevChat' ? -1 : 1); } catch {} return; }
    if (id === 'shortcuts') { e.preventDefault(); e.stopImmediatePropagation(); openShortcuts(); return; }
  }
  // A default key whose shortcut was moved (or turned off) does nothing now.
  if (KEYBINDS44.some(([id, , def]) => def === combo && id in mine && mine[id] !== combo)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
function renderKeybinds44(body) {
  const m = kbLoad44();
  body.innerHTML = `<h2>Keybinds</h2>
    <p class="muted" style="margin:-6px 0 14px">Click a shortcut, then press the keys you want. Press Esc to cancel, or Backspace to remove it. Push to Talk is set in Voice &amp; Video.</p>
    <div class="setting-group kb44">${KEYBINDS44.map(([id, label, def]) => `<div class="setting-row kb44-row"><div><div class="setting-title">${esc(label)}</div>${def ? `<div class="setting-desc">Normally ${comboHtml44(def)}</div>` : ''}</div>
      <div class="kb44-r"><button class="btn btn-grey btn-sm kb44-key" data-kb="${id}">${comboHtml44(kbOf44(id))}</button>${id in m ? `<button class="btn btn-link btn-sm" data-kb-reset="${id}">Reset</button>` : ''}</div></div>`).join('')}</div>
    <button class="btn btn-grey btn-sm" id="kb44-all">Reset all keybinds</button>`;
  const save = next => { try { localStorage.setItem('zuno_keybinds', JSON.stringify(next)); } catch {} renderKeybinds44(body); };
  $$('[data-kb]', body).forEach(b => b.addEventListener('click', () => {
    if ($('.kb44-rec')) return;
    b.classList.add('kb44-rec'); b.innerHTML = 'Press keys…';
    const grab = ev => {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.key === 'Escape') return done();
      const next = kbLoad44();
      if (ev.key === 'Backspace' || ev.key === 'Delete') { next[b.dataset.kb] = ''; return done(next); }
      const c = comboOf44(ev);
      if (!c) return;
      if (!/^(Ctrl|Alt)\+/.test(c) && !/^F\d+$/.test(c)) { toast('Use Ctrl or Alt with it (or an F key), so it never gets in the way of typing.', true); return done(); }
      const clash = KEYBINDS44.find(([id]) => id !== b.dataset.kb && kbOf44(id) === c);
      if (clash) next[clash[0]] = '';
      next[b.dataset.kb] = c;
      if (clash) toast(`Moved from "${clash[1]}"`);
      done(next);
    };
    const done = next => { removeEventListener('keydown', grab, true); b.classList.remove('kb44-rec'); if (next) save(next); else renderKeybinds44(body); };
    addEventListener('keydown', grab, true);
  }));
  $$('[data-kb-reset]', body).forEach(b => b.addEventListener('click', () => { const n = kbLoad44(); delete n[b.dataset.kbReset]; save(n); }));
  $('#kb44-all', body).addEventListener('click', () => save({}));
}
{
  const _openSettings44 = openSettings;
  openSettings = function (section, ...a) {
    const r = _openSettings44(section === 'keybinds' ? 'notifications' : section, ...a);
    const nav = $('.settings:not(.server-settings-page) .settings-nav > div') || $('.settings:not(.server-settings-page) .settings-nav');
    if (nav && !$('[data-s="keybinds"]', nav)) {
      const b = document.createElement('button');
      b.dataset.s = 'keybinds'; b.innerHTML = uiIcon('keyboard') + 'Keybinds';
      ($('[data-s="voice"]', nav) || $('[data-s="notifications"]', nav))?.after(b);
      b.addEventListener('click', () => showSettingsSection('keybinds'));
      if (typeof US_WORDS === 'object') US_WORDS.keybinds = 'keybinds keyboard shortcuts hotkeys keys bindings';
    }
    if (section === 'keybinds') setTimeout(() => showSettingsSection('keybinds'), 120);
    return r;
  };
  const _show44 = showSettingsSection;
  showSettingsSection = function (section, ...a) {
    if (section !== 'keybinds') return _show44(section, ...a);
    if (settingsDraft && isDraftDirty()) return closeSettings();
    settingsDraft = null;
    $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === 'keybinds'));
    renderKeybinds44($('#settings-body'));
  };
}

// ======================= time zones =======================
// "What time is it for you?": ask someone, and if they share it, their local time shows on their profile.
const myTz44 = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
const tzTime44 = tz => { try { return new Date().toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const tzDiff44 = tz => {
  try {
    const now = new Date(), there = new Date(now.toLocaleString('en-US', { timeZone: tz })), here = new Date(now.toLocaleString('en-US'));
    const h = Math.round((there - here) / 36e5 * 2) / 2;
    return h === 0 ? 'same time as you' : `${Math.abs(h)} h ${h > 0 ? 'ahead of' : 'behind'} you`;
  } catch { return ''; }
};
async function answerTz44(from) {
  const u = from;
  const tz = myTz44();
  const yes = await confirmOver('Share your time zone?', `${u.displayName || u.username} would like to know your time zone (${tz.replace(/_/g, ' ')}), so they can see what time it is for you. Only they will see it.`, 'Share it');
  try { await api('POST', '/api/tz/answer', { from: u.id, share: !!yes, tz }); if (yes) toast('Shared'); } catch (e) { toast(e.message, true); }
}
onLive26('tz-request', d => d.from && answerTz44(d.from));
onLive26('tz-shared', d => { toast(`${user(d.userId)?.displayName || 'They'} shared their time zone with you`); tzCache44.delete(d.userId); });
// Requests that came in while you were away.
(function tzWhenIn() {
  if (!state.token || !state.me) return setTimeout(tzWhenIn, 2000);
  api('GET', '/api/me/tz-requests').then(async d => { for (const u of d.from || []) await answerTz44(u); }).catch(() => {});
})();
const tzCache44 = new Map();
async function tzRow44(card, uid) {
  if (!card || $('.tz44', card) || uid === state.me.id || user(uid)?.bot || user(uid)?.system) return;
  let d = tzCache44.get(uid);
  if (!d) { try { d = await api('GET', `/api/users/${uid}/tz`); tzCache44.set(uid, d); setTimeout(() => tzCache44.delete(uid), 60e3); } catch { return; } }
  if (!card.isConnected || $('.tz44', card)) return;
  const row = document.createElement('div');
  row.className = 'tz44';
  const draw = () => {
    row.innerHTML = d.tz ? `${uiIcon('clock')}<span><b>${esc(tzTime44(d.tz))}</b> for them · ${esc(tzDiff44(d.tz))}</span>`
      : d.asked ? `${uiIcon('clock')}<span class="muted">You asked for their time zone</span>`
        : `${uiIcon('clock')}<button type="button" class="btn btn-link btn-sm tz44-ask">What time is it for them?</button>`;
    $('.tz44-ask', row)?.addEventListener('click', async () => {
      try { const r = await api('POST', `/api/users/${uid}/tz-request`); d = { ...d, ...(r.shared ? { tz: r.tz } : { asked: true }) }; tzCache44.set(uid, d); draw(); if (!r.shared) toast("Asked! You'll see their time once they share it."); }
      catch (e) { toast(e.message, true); }
    });
  };
  draw();
  const after = $('.pc-badges', card) || $('.pc-name-row', card) || $('.pc-body', card);
  if (!after) return;
  after.after(row);
  if (d.tz) { const t = setInterval(() => (row.isConnected ? draw() : clearInterval(t)), 30e3); }
}

// ======================= profiles: activity as a little widget =======================
// The small pop-up profile shows what someone is doing as a compact widget (the full profile has
// the big card in its Activity tab).
function miniActivity44(u) {
  const list = (u?.activities?.length ? u.activities : u?.activity ? [u.activity] : []).slice(0, 2);
  if (!list.length) return '';
  return `<div class="act44-mini">${list.map(a => {
    const sp = a.name === 'Spotify', ic = a.type === 'listening' ? 'music' : a.type === 'playing' ? 'gamepad' : ACT42_ICON[a.type] || 'sparkles';
    const title = sp ? a.details || 'Spotify' : a.name, sub = sp ? a.state : a.details || '';
    return `<div class="am44"><span class="am44-art">${a.art ? `<img src="${esc(a.art)}" alt="" loading="lazy">` : uiIcon(ic)}<i class="am44-ic ${a.type}">${uiIcon(ic)}</i></span>
      <span class="am44-txt"><small>${esc(ACT_VERB[a.type] || '')}</small><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
      ${a.end ? `<span class="am44-bar act-bar" data-start="${Number(a.start) || 0}" data-end="${Number(a.end) || 0}"><i></i></span>` : `<span class="am44-el" data-elapsed="${Number(a.start) || Date.now()}">0:00</span>`}</div>`;
  }).join('')}</div>`;
}
function decorateCard44(card) {
  if (!card || card.dataset.d44) return;
  const uid = card.closest('[data-uid]')?.dataset.uid || $('[data-uid]', card)?.dataset.uid || card.dataset.uid || card.closest('#layer')?.querySelector('[data-profile-id]')?.dataset.profileId;
  const id = uid || card.dataset.user || openProfile44Id;
  if (!id) return;
  card.dataset.d44 = '1';
  tzRow44(card, id);
  if (!$('.act44-mini', card)) {
    const html = miniActivity44(user(id));
    const at = $('.pc-badges', card) || $('.pc-name-row', card);
    if (html && at) at.insertAdjacentHTML('afterend', html);
  }
}
let openProfile44Id = null;
{
  const _openProfile44 = openProfile;
  openProfile = async function (id, ...rest) {
    openProfile44Id = id;
    const r = await _openProfile44(id, ...rest);
    setTimeout(() => { for (const c of $$('#layer .pcard')) decorateCard44(c); }, 60);
    return r;
  };
}

// ======================= activity icons =======================
// Playing: a green game controller. Listening: a green music note (with Spotify too).
ACT42_ICON.listening = 'music';
{
  const _activityLine44 = activityLine;
  activityLine = function (u) {
    const a = u?.activity;
    if (!a) return '';
    if (a.type !== 'playing' && a.type !== 'listening') return _activityLine44(u);
    const sp = a.name === 'Spotify';
    return `<span class="act-line act42 act44 ${a.type}">${uiIcon(a.type === 'playing' ? 'gamepad' : 'music')}<span>${ACT_VERB[a.type] || ''} <b>${esc(sp && a.details ? a.details : a.name)}</b></span></span>`;
  };
}

// ======================= slash commands fold into the bot's answer =======================
// Your "/roll 2d6" shrinks to a small line, and the bot's answer shows right under it with
// "Paws used /roll" on top, like Discord.
function foldCommands44() {
  const conv = typeof activeConv === 'function' && activeConv();
  const msgs = conv && state.convos[conv]?.messages;
  const box = $('#messages');
  if (!msgs || !box) return;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m.command) continue;
    const el = box.querySelector(`.msg[data-id="${CSS.escape(m.id)}"]`);
    if (!el || el.dataset.c44 === 'done') continue;
    let reply = null;
    for (let j = i + 1; j < Math.min(msgs.length, i + 4); j++) {
      const x = msgs[j];
      if (x.authorId === m.command.botId && x.createdAt - m.createdAt < 60e3) { reply = x; break; }
    }
    const rel = reply && box.querySelector(`.msg[data-id="${CSS.escape(reply.id)}"]`);
    const u = user(m.authorId) || { displayName: 'Someone' };
    const line = `<div class="cmd44">${uiIcon('reply')}${avatar(u, 16)}<b>${esc(u.displayName)}</b><span>used</span><code>/${esc(m.command.name)}</code>${m.content && m.content.length > m.command.name.length + 1 ? `<span class="cmd44-args">${esc(m.content.slice(m.command.name.length + 2, 80))}</span>` : ''}</div>`;
    if (rel) {
      el.dataset.c44 = 'done';
      $('.cmd44', el)?.remove(); el.classList.remove('cmd44-solo');
      if (!rel.dataset.c44) { rel.dataset.c44 = 'done'; rel.insertAdjacentHTML('afterbegin', line); rel.classList.add('cmd44-reply'); }
      el.classList.add('cmd44-hide');
    } else if (el.dataset.c44 !== 'solo') {
      el.dataset.c44 = 'solo';
      el.classList.add('cmd44-solo');
      if (!$('.cmd44', el)) el.insertAdjacentHTML('afterbegin', line.replace('<div class="cmd44">', '<div class="cmd44 solo">'));
    }
  }
}
let fold44 = 0;
new MutationObserver(() => { cancelAnimationFrame(fold44); fold44 = requestAnimationFrame(() => { try { foldCommands44(); } catch {} }); })
  .observe(document.body, { childList: true, subtree: false });
(function watchMsgs44() {
  const box = $('#messages');
  if (!box) return setTimeout(watchMsgs44, 1500);
  if (box.dataset.w44) return;
  box.dataset.w44 = '1';
  new MutationObserver(() => { cancelAnimationFrame(fold44); fold44 = requestAnimationFrame(() => { try { foldCommands44(); } catch {} }); }).observe(box, { childList: true });
})();
{
  const _rm44 = renderMessages;
  renderMessages = function (...a) { const r = _rm44(...a); try { foldCommands44(); } catch {} return r; };
}

// ======================= channel settings, the simple way =======================
// The gear on a channel opens its own settings page (like Discord): Overview and Permissions on the
// left, Delete at the bottom, and a "you have unsaved changes" bar. The big list of every channel is
// still in Server Settings › Channels & Categories.
function openChannelSettings44(svIn, channelId, tab = 'overview') {
  const sv = svById(svIn.id) || svIn;
  const ch = sv.channels.find(c => c.id === channelId);
  if (!ch) return;
  const text = ch.type === 'text';
  const canPerm = typeof chHas === 'function' ? chHas(ch, 'manage_roles') : hasPerm(sv, 'manage_roles');
  const start = { name: ch.name, topic: ch.topic || '', slowmode: ch.slowmode || 0, readOnly: !!ch.readOnly, userLimit: Number(ch.userLimit) || 0, categoryId: ch.categoryId || '' };
  let draft = { ...start };
  const ov = openLayer(`<div class="chs44" role="dialog" aria-label="Channel settings">
    <nav class="chs44-nav"><div class="chs44-navin">
      <div class="chs44-chn">${text ? (ch.readOnly ? uiIcon('megaphone') : ICON.hash) : ICON.speaker}<span>${esc(ch.name)}</span></div>
      <small class="chs44-cat">${esc(sv.categories?.find(c => c.id === ch.categoryId)?.name || 'Channel')}</small>
      <button data-t="overview">Overview</button>
      ${canPerm ? '<button data-t="perms">Permissions</button>' : ''}
      <div class="sep"></div>
      <button class="danger" data-t="delete">Delete Channel ${uiIcon('trash')}</button></div></nav>
    <section class="chs44-main"><div class="chs44-body"></div>
      <div class="chs44-bar" hidden><span>Careful — you have unsaved changes!</span><button class="btn btn-link" data-a="reset">Reset</button><button class="btn btn-green btn-sm" data-a="save">Save Changes</button></div></section>
    <button class="chs44-x" data-a="close" title="Close (Esc)">${uiIcon('x')}<small>ESC</small></button></div>`);
  ov.classList.add('chs44-ov');
  const body = $('.chs44-body', ov), bar = $('.chs44-bar', ov);
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(start);
  const sync = () => { bar.hidden = !dirty(); };
  const close = () => {
    if (dirty()) { bar.classList.remove('nag'); void bar.offsetWidth; bar.classList.add('nag'); return; }
    closeLayer();
  };
  $('[data-a=close]', ov).addEventListener('click', close);
  const onKey = e => { if (!ov.isConnected) return removeEventListener('keydown', onKey, true); if (e.key === 'Escape' && !$('.ask33, .menu')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  $('[data-a=reset]', ov).addEventListener('click', () => { draft = { ...start }; show('overview'); });
  $('[data-a=save]', ov).addEventListener('click', async () => {
    const change = { name: draft.name, categoryId: draft.categoryId || null };
    if (text) Object.assign(change, { topic: draft.topic, slowmode: Number(draft.slowmode), readOnly: draft.readOnly });
    else change.userLimit = Number(draft.userLimit) || 0;
    try {
      const r = await api('PATCH', `/api/channels/${ch.id}`, change);
      Object.assign(start, { ...draft, name: r?.channel?.name || draft.name });
      draft = { ...start };
      sync(); toast('Channel saved');
      $('.chs44-chn span', ov).textContent = start.name;
      if ($('[data-f=name]', body)) $('[data-f=name]', body).value = start.name;
    } catch (e) { toast(e.message, true); }
  });
  const slowSteps = Object.keys(SLOWMODE_LABEL).map(Number);
  function overview() {
    body.innerHTML = `<h2>Overview</h2>
      <label class="chs44-f"><span>Channel name</span><input class="input" data-f="name" maxlength="32" value="${esc(draft.name)}"></label>
      ${text ? `<label class="chs44-f"><span>Channel topic</span><textarea class="input" data-f="topic" maxlength="200" rows="3" placeholder="Let everyone know how to use this channel!">${esc(draft.topic)}</textarea><small class="chs44-count">${draft.topic.length}/200</small></label>` : ''}
      <div class="chs44-sep"></div>
      ${text ? `<div class="chs44-f"><span>Slowmode</span><div class="chs44-slow"><input type="range" min="0" max="${slowSteps.length - 1}" step="1" value="${Math.max(0, slowSteps.indexOf(Number(draft.slowmode)))}" data-f="slow"><b>${esc(SLOWMODE_LABEL[draft.slowmode] || 'Off')}</b></div>
          <small>Members have to wait this long between messages, unless they can manage the channel or messages.</small></div>
        <div class="chs44-sep"></div>
        <label class="chs44-sw"><div><b>Announcement Channel</b><small>Only people who can manage messages (or are allowed in Permissions) can post. Everyone else can read and react.</small></div><input type="checkbox" class="switch" data-f="readOnly"${draft.readOnly ? ' checked' : ''}></label>`
        : `<div class="chs44-f"><span>User limit</span><div class="chs44-slow"><input type="range" min="0" max="99" step="1" value="${draft.userLimit}" data-f="limit"><b>${draft.userLimit ? draft.userLimit + ' people' : 'No limit'}</b></div>
          <small>How many people can be in this voice channel at once. People who can manage channels can always join.</small></div>`}
      <div class="chs44-sep"></div>
      <label class="chs44-f"><span>Category</span><select class="sc-select" data-f="cat"><option value="">No category</option>${(sv.categories || []).map(k => `<option value="${esc(k.id)}"${k.id === draft.categoryId ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>`;
    $('[data-f=name]', body).addEventListener('input', e => { draft.name = e.target.value; sync(); });
    $('[data-f=topic]', body)?.addEventListener('input', e => { draft.topic = e.target.value; $('.chs44-count', body).textContent = `${draft.topic.length}/200`; sync(); });
    $('[data-f=slow]', body)?.addEventListener('input', e => { draft.slowmode = slowSteps[Number(e.target.value)] || 0; e.target.nextElementSibling.textContent = SLOWMODE_LABEL[draft.slowmode]; sync(); });
    $('[data-f=limit]', body)?.addEventListener('input', e => { draft.userLimit = Number(e.target.value); e.target.nextElementSibling.textContent = draft.userLimit ? draft.userLimit + ' people' : 'No limit'; sync(); });
    $('[data-f=readOnly]', body)?.addEventListener('change', e => { draft.readOnly = e.target.checked; sync(); });
    $('[data-f=cat]', body).addEventListener('change', e => { draft.categoryId = e.target.value; sync(); });
  }
  // Permissions: the simple version first (private or not, and who can see it), with the full
  // per-permission editor one click away.
  function perms() {
    const s = svById(sv.id) || sv, c = s.channels.find(x => x.id === ch.id) || ch;
    const cat = c.categoryId && s.categories?.find(k => k.id === c.categoryId);
    const synced = !!(cat && c.synced !== false);
    const ovs = (synced ? cat.overrides : c.overrides) || [];
    const priv = !!ovs.find(o => o.id === s.id)?.deny?.includes('view_channels');
    const allowed = new Set(ovs.filter(o => o.id !== s.id && o.allow?.includes('view_channels')).map(o => o.id));
    const roles = s.roles.filter(r => !r.everyone);
    body.innerHTML = `<h2>Permissions</h2>
      ${cat ? `<div class="chs44-note">${synced ? `${uiIcon('chain')} Synced with <b>${esc(cat.name)}</b>. Changing anything here gives this channel its own permissions.` : `${uiIcon('chain')} Has its own permissions. <button class="btn btn-link btn-sm" data-a="resync">Sync with ${esc(cat.name)}</button>`}</div>` : ''}
      <label class="chs44-sw big"><div><b>${uiIcon('lock')} Private Channel</b><small>Only the roles and people you pick (and admins) can see and use it.</small></div><input type="checkbox" class="switch" data-p="private"${priv ? ' checked' : ''}></label>
      <div class="chs44-who"${priv ? '' : ' hidden'}><h4>Who can see this channel?</h4>
        <div class="chs44-roles">${roles.map(r => `<label class="chs44-role"><input type="checkbox" data-role="${esc(r.id)}"${allowed.has(r.id) ? ' checked' : ''}><span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span><span>${esc(r.name)}</span></label>`).join('') || '<p class="muted small">This server has no roles yet.</p>'}</div>
        ${[...allowed].filter(id => !s.roles.some(r => r.id === id)).map(id => `<div class="chs44-person">${avatar(user(id) || { displayName: '?' }, 20)}<span>${esc(user(id)?.displayName || 'Someone')}</span></div>`).join('')}</div>
      <div class="chs44-sep"></div>
      <div class="chs44-adv"><div><b>Advanced permissions</b><small>Allow or deny each permission (sending, reactions, voice…) for any role or person.</small></div><button class="btn btn-grey btn-sm" data-a="adv">Open</button></div>`;
    const savePerm = async (makePrivate, roleIds) => {
      let list = JSON.parse(JSON.stringify(ovs));
      if (!list.some(o => o.id === s.id)) list.unshift({ id: s.id, type: 'role', allow: [], deny: [] });
      const every = list.find(o => o.id === s.id);
      every.allow = every.allow.filter(x => x !== 'view_channels'); every.deny = every.deny.filter(x => x !== 'view_channels');
      if (makePrivate) every.deny.push('view_channels');
      for (const r of roles) {
        let o = list.find(x => x.id === r.id);
        const want = makePrivate && roleIds.has(r.id);
        if (!o && want) list.push(o = { id: r.id, type: 'role', allow: [], deny: [] });
        if (!o) continue;
        o.allow = o.allow.filter(x => x !== 'view_channels');
        if (want) o.allow.push('view_channels');
      }
      if (makePrivate && !isOwner(s) && !hasPerm(s, 'administrator') && !list.some(o => o.id === state.me.id)) list.push({ id: state.me.id, type: 'member', allow: ['view_channels'], deny: [] });
      list = list.filter(o => o.id === s.id || o.allow.length || o.deny.length);
      try { await api('PUT', `/api/channels/${ch.id}/overrides`, { overrides: list }); await refresh({}); toast('Permissions saved'); perms(); }
      catch (e) { toast(e.message, true); perms(); }
    };
    const picked = () => new Set($$('[data-role]', body).filter(x => x.checked).map(x => x.dataset.role));
    $('[data-p=private]', body).addEventListener('change', e => savePerm(e.target.checked, picked()));
    $$('[data-role]', body).forEach(x => x.addEventListener('change', () => savePerm(true, picked())));
    $('[data-a=adv]', body).addEventListener('click', () => {
      openPermEditor(s, { kind: 'channel', id: ch.id });
      // (0.47) The editor opens on top of these settings; when it closes, show what changed.
      const back = () => { document.removeEventListener('layer-uncovered47', back); if (body.isConnected && $('[data-a=adv]', body)) perms(); };
      document.addEventListener('layer-uncovered47', back);
    });
    $('[data-a=resync]', body)?.addEventListener('click', async () => { try { await api('PUT', `/api/channels/${ch.id}/overrides`, { synced: true }); await refresh({}); perms(); } catch (e) { toast(e.message, true); } });
  }
  function show(t) {
    if (t === 'delete') { confirmDeleteChannel(ch); return; }
    if (t === 'perms' && dirty()) { bar.classList.remove('nag'); void bar.offsetWidth; bar.classList.add('nag'); return; }
    $$('[data-t]', ov).forEach(b => b.classList.toggle('on', b.dataset.t === t));
    (t === 'perms' ? perms : overview)();
    sync();
  }
  $$('[data-t]', ov).forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
  show(tab === 'perms' && canPerm ? 'perms' : 'overview');
}
// The gear and "Edit Channel" open it (Server Settings › Channels & Categories still has the full list).
openChannelSettings = (sv, channelId) => openChannelSettings44(sv, channelId);
document.addEventListener('click', e => {
  const g = e.target.closest?.('#sidebar-scroll [data-edit-ch]');
  if (!g) return;
  const sv = state.currentServerId && currentServer();
  if (!sv) return;
  e.preventDefault(); e.stopImmediatePropagation();
  openChannelSettings44(sv, g.dataset.editCh);
}, true);
{
  const _ocm44 = openChannelMenu;
  openChannelMenu = function (sv, chId, anchor, ...rest) {
    // "Edit Channel" in a channel's right-click menu goes to the new page too.
    const _om = openMenu;
    openMenu = function (a, items, ...more) {
      openMenu = _om;
      return _om(a, items.map(it => (it?.label === 'Edit Channel' ? { ...it, run: () => openChannelSettings44(sv, chId) } : it)), ...more);
    };
    try { return _ocm44(sv, chId, anchor, ...rest); } finally { openMenu = _om; }
  };
}

// ======================= right-click someone in a call =======================
document.addEventListener('contextmenu', e => {
  const t = e.target.closest?.('[data-tile]');
  if (e.defaultPrevented || !t || !Calls.room || e.target.closest('.voice-user')) return;
  const uid = t.dataset.tile, c = Calls.state;
  if (!uid || uid === state.me.id || uid.includes(':')) return;
  const items = [{ label: 'Profile', icon: uiIcon('user'), run: () => openProfile(uid) }];
  const sv = c.serverId && svById(c.serverId);
  const g = c.groupId && state.groups?.find?.(x => x.id === c.groupId);
  if (sv) {
    const mod = sv.voiceMod?.[uid] || {};
    if (hasPerm(sv, 'mute_members')) items.push({ label: mod.mute ? 'Server Unmute' : 'Server Mute', icon: uiIcon(mod.mute ? 'mic' : 'volumeOff'), run: () => voiceAct44(sv, uid, mod.mute ? 'unmute' : 'mute') });
    if (hasPerm(sv, 'deafen_members')) items.push({ label: mod.deafen ? 'Server Undeafen' : 'Server Deafen', icon: uiIcon('headphones'), run: () => voiceAct44(sv, uid, mod.deafen ? 'undeafen' : 'deafen') });
  }
  if ((sv && hasPerm(sv, 'move_members')) || (c.kind === 'group' && g?.ownerId === state.me.id)) {
    items.push('sep', { label: 'Remove from Call', icon: uiIcon('door'), danger: true, run: async () => { try { await api('POST', '/api/rtc/kick', { room: Calls.room, userId: uid }); toast('Removed from the call'); } catch (err) { toast(err.message, true); } } });
  }
  e.preventDefault(); e.stopPropagation();
  openMenu(atPoint(e), items);
}, true);
