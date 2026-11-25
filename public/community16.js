'use strict';
// Zuno 0.16, servers: stage channels, voice channel status, role pickers, onboarding questions,
// Server Blooming, server backups, and per-server profiles.

const svNow = () => (['channel', 'voice'].includes(state.view.type) ? currentServer() : null);
const STAGE_ICO = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5.5 9.5a6.5 6.5 0 0 0 13 0H20a8 8 0 0 1-7 7.93V20h3v2H8v-2h3v-2.57A8 8 0 0 1 4 9.5h1.5zM2.3 4.6l1.4-1.4C2.2 5 1.5 7.1 1.5 9.5s.7 4.5 2.2 6.3l-1.4 1.4A11 11 0 0 1 0 9.5c0-1.9.6-3.6 2.3-4.9zm19.4 0A11 11 0 0 1 24 9.5c0 2.8-.9 5.4-2.3 7.7l-1.4-1.4c1.5-1.8 2.2-3.9 2.2-6.3s-.7-4.5-2.2-6.3z"/></svg>';

// ======================= per-server profiles =======================
// Your picture, bio and pronouns can be different in each server.
const serverProfile = (sv, uid) => sv?.memberProfiles?.[uid] || null;
const _avatarS = avatar;
avatar = function (u, size, status) {
  const p = u && serverProfile(svNow(), u.id);
  return _avatarS(p?.avatar ? { ...u, avatar: p.avatar } : u, size, status);
};
const _profileCardS = profileCard;
profileCard = function (u, opts) {
  const sv = svNow(), p = u && serverProfile(sv, u.id);
  if (!p) return _profileCardS(u, opts);
  const html = _profileCardS({ ...u, avatar: p.avatar || u.avatar, bio: p.bio ?? u.bio, pronouns: p.pronouns ?? u.pronouns, bannerColor: p.bannerColor || u.bannerColor }, opts);
  return html.replace('<div class="pc-uname">', `<div class="pc-svprof" title="This profile is just for ${esc(sv.name)}">🏷️ ${esc(sv.name)} profile</div><div class="pc-uname">`);
};
function openServerProfile(sv) {
  const p = serverProfile(sv, state.me.id) || {};
  let pendingAvatar;
  const ov = openLayer(`<form class="dialog modal sp-dialog"><h3>Your profile in ${esc(sv.name)}</h3>
    <p class="muted" style="margin:0 0 12px">Only people in this server see these. Anything you leave empty uses your main profile.</p>
    <div class="sp-row"><div class="sp-av" id="sp-av">${avatar({ ...state.me, avatar: p.avatar || state.me.avatar }, 72)}</div>
      <div class="row-btns"><button type="button" class="btn btn-primary btn-sm" id="sp-up">Change Server Avatar</button>${p.avatar ? '<button type="button" class="btn btn-link btn-sm" id="sp-rm">Use main avatar</button>' : ''}</div>
      <input type="file" id="sp-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif"></div>
    <label class="field">Nickname<input name="nick" maxlength="32" value="${esc(sv.nicks?.[state.me.id] || '')}" placeholder="${esc(state.me.displayName)}"></label>
    <label class="field">Pronouns<input name="pronouns" maxlength="24" value="${esc(p.pronouns || '')}" placeholder="${esc(state.me.pronouns || 'Add your pronouns')}"></label>
    <label class="field">About me here<textarea name="bio" rows="3" maxlength="${limits().bio}" placeholder="${esc(state.me.bio || 'Tell this server about yourself')}">${esc(p.bio || '')}</textarea></label>
    <div class="field">Banner color<div class="editor-row sp-bc"><input type="color" class="color-input" name="bc" value="${esc(p.bannerColor || state.me.bannerColor || '#0aa896')}"><label class="sp-bc-on"><input type="checkbox" class="switch" name="bcOn"${p.bannerColor ? ' checked' : ''}><span>Use this color in this server</span></label></div></div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  $('#sp-up', ov).addEventListener('click', () => $('#sp-file', ov).click());
  $('#sp-file', ov).addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'image/gif') { const b = window.openImageEditor ? await openImageEditor(file, { shape: 'circle' }) : null; if (b) file = new File([b], 'avatar.png', { type: b.type || 'image/png' }); else if (window.openImageEditor) return; }
    if (file.size > 1e6) return toast('Avatars can be up to 1 MB.', true);
    pendingAvatar = file;
    $('#sp-av', ov).innerHTML = avatar({ ...state.me, avatar: URL.createObjectURL(file) }, 72);
  });
  let removeAvatar = false;
  $('#sp-rm', ov)?.addEventListener('click', () => { removeAvatar = true; pendingAvatar = null; $('#sp-av', ov).innerHTML = avatar(state.me, 72); });
  f.bc.addEventListener('input', () => { f.bcOn.checked = true; });
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      if (pendingAvatar) {
        const res = await fetch(`/api/servers/${sv.id}/my-profile/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': pendingAvatar.type }, body: pendingAvatar });
        const d = await res.json(); if (!res.ok) throw new Error(d.error);
      }
      await api('PUT', `/api/servers/${sv.id}/my-profile`, { bio: f.bio.value, pronouns: f.pronouns.value, bannerColor: f.bcOn.checked ? f.bc.value : null, ...(removeAvatar ? { avatar: null } : {}) });
      if ((sv.nicks?.[state.me.id] || '') !== f.nick.value.trim()) await api('PUT', `/api/servers/${sv.id}/members/${state.me.id}/nick`, { nick: f.nick.value.trim() });
      closeLayer(); toast('Server profile saved'); refresh({ serverId: sv.id });
    } catch (err) { toast(err.message, true); }
  });
}

// ======================= server menu: blooming, server profile, backups =======================
const _openServerMenuS = openServerMenu;
openServerMenu = function (anchor, sv = currentServer()) {
  _openServerMenuS(anchor, sv);
  if (!sv) return;
  addMenuItem({ label: 'Edit Server Profile', icon: ico('🏷️'), run: () => openServerProfile(sv) }, { top: true });
  if (!sv.official) addMenuItem({ label: `Server Blooming${sv.blooming?.level ? ` · Level ${sv.blooming.level}` : ''}`, icon: ico('🌸'), run: () => openBlooming(sv) }, { top: true });
};

// ======================= Server Blooming =======================
const BLOOM_LEVELS = [
  { level: 1, need: 2, perks: ['100 emoji slots (from 50)', '36 soundboard sounds (from 24)', 'A pink Level 1 flower next to the server name'] },
  { level: 2, need: 6, perks: ['150 emoji slots', '48 soundboard sounds', 'HD screen share (1080p, 60 FPS) for everyone in its voice channels'] },
  { level: 3, need: 12, perks: ['250 emoji slots', '72 soundboard sounds', 'A blooming glow on the server in everyone\'s server list'] },
];
function openBlooming(sv) {
  const b = sv.blooming || { count: 0, level: 0, bloomers: [] };
  const mine = (state.serverBlooms?.used || []).filter(x => x.serverId === sv.id).length;
  const free = (state.serverBlooms?.total || 0) - (state.serverBlooms?.used || []).length;
  const next = BLOOM_LEVELS.find(l => l.need > b.count);
  const pct = next ? Math.min(100, (b.count / next.need) * 100) : 100;
  const ov = openLayer(`<div class="dialog modal bloom-sv"><div class="bsv-hero"><span class="bsv-flower">🌸</span><div><h3>${esc(sv.name)}</h3><div class="muted">${b.level ? `Level ${b.level}` : 'Not bloomed yet'} · ${b.count} Bloom${b.count === 1 ? '' : 's'}</div></div></div>
    <div class="bsv-bar"><i style="width:${pct}%"></i></div><div class="muted small">${next ? `${next.need - b.count} more to reach Level ${next.level}` : 'Fully bloomed! 🎉'}</div>
    <div class="bsv-levels">${BLOOM_LEVELS.map(l => `<div class="bsv-lv${b.level >= l.level ? ' on' : ''}"><b>Level ${l.level}</b><span class="muted small">${l.need} Blooms</span><ul>${l.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>
    ${b.bloomers?.length ? `<div class="bsv-who"><span class="muted small">Blooming this server</span>${b.bloomers.map(id => user(id)).filter(Boolean).map(u => `<span class="bsv-chip">${avatar(u, 20)}${esc(u.displayName)}</span>`).join('')}</div>` : ''}
    <p class="muted small">${state.me.bloom ? `Zuno Bloom gives you 2 Server Blooms. You have ${free} free${mine ? `, and ${mine} here` : ''}.` : 'Server Blooms come with Zuno Bloom: you get 2 to give to your favorite servers.'}</p>
    <div class="actions">${mine ? '<button class="btn btn-link" data-a="un">Take a Bloom Back</button>' : ''}<button class="btn btn-link" data-a="close">Close</button>${state.me.bloom ? `<button class="btn btn-bloom" data-a="bloom"${free > 0 ? '' : ' disabled'}>🌸 Bloom This Server</button>` : '<button class="btn btn-bloom" data-a="get">Get Zuno Bloom</button>'}</div></div>`);
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
  $('[data-a=get]', ov)?.addEventListener('click', () => openSettings('bloom'));
  const act = async (method) => {
    try { await api(method, `/api/servers/${sv.id}/bloom`); await refresh({ serverId: sv.id }); if (method === 'POST') { burst($('.bsv-flower', ov) || document.body, 24); toast(`🌸 You bloomed ${sv.name}!`); } openBlooming(svById(sv.id)); }
    catch (e) { toast(e.message, true); }
  };
  $('[data-a=bloom]', ov)?.addEventListener('click', () => act('POST'));
  $('[data-a=un]', ov)?.addEventListener('click', () => act('DELETE'));
}
const _renderRailS = renderRail;
renderRail = function (...a) {
  _renderRailS(...a);
  for (const sv of state.servers) {
    const lv = sv.blooming?.level || 0;
    const b = $(`#server-rail [data-server="${CSS.escape(sv.id)}"]`);
    if (!b) continue;
    b.classList.toggle('sv-glow', lv >= 3);
    if (lv && !$('.rail-bloom', b)) b.insertAdjacentHTML('beforeend', `<i class="rail-bloom" title="Server Blooming Level ${lv}">🌸</i>`);
  }
};

// ======================= sidebar: stage channels & voice channel status =======================
const _renderServerSidebarS = renderServerSidebar;
renderServerSidebar = function () {
  _renderServerSidebarS();
  const sv = currentServer();
  if (!sv) return;
  if (sv.blooming?.level) $('#server-head .sh-name')?.insertAdjacentHTML('afterend', `<span class="sh-bloom" title="Server Blooming Level ${sv.blooming.level}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 7 10 4 12 3c2 1 2 4 0 6.5ZM14.5 12c2.5-2 5.5-2 6.5 0-1 2-4 2-6.5 0ZM12 14.5c2 2.5 2 5.5 0 6.5-2-1-2-4 0-6.5ZM9.5 12C7 14 4 14 3 12c1-2 4-2 6.5 0Z"/></svg>${sv.blooming.level}</span>`);
  for (const ch of sv.channels.filter(c => c.type === 'voice')) {
    const item = $(`#sidebar-scroll .ch-item[data-ch="${CSS.escape(ch.id)}"]`);
    if (!item) continue;
    const st = sv.stages?.[ch.id];
    if (ch.stage) {
      item.classList.add('stage');
      const icoEl = $('.ch-ico', item);
      if (icoEl) icoEl.innerHTML = STAGE_ICO + icoEl.innerHTML.replace(/<svg[\s\S]*?<\/svg>/, '');
      if (st?.speakers?.length || (sv.voice?.[ch.id] || []).length) item.insertAdjacentHTML('afterend', `<div class="vc-status stage-live"><b>LIVE</b> ${esc(st?.topic || 'On stage now')}</div>`);
    }
    if (ch.voiceStatus?.text) item.insertAdjacentHTML('afterend', `<div class="vc-status" title="Set by ${esc(user(ch.voiceStatus.by)?.displayName || 'someone')}">${esc(ch.voiceStatus.text)}</div>`);
  }
};
const _openChannelMenuS = openChannelMenu;
openChannelMenu = function (sv, chId, anchor) {
  _openChannelMenuS(sv, chId, anchor);
  const ch = sv.channels.find(c => c.id === chId);
  if (ch?.type === 'voice' && (Calls.room === 'vc:' + ch.id || chHas(ch, 'manage_channels'))) addMenuItem({ label: ch.voiceStatus ? 'Change Channel Status' : 'Set Channel Status', icon: ico('💬'), run: () => openVoiceStatus(ch) }, { top: true });
};
function openVoiceStatus(ch) {
  const ov = openLayer(`<form class="dialog modal" style="max-width:420px"><h3>Channel status</h3><p class="muted small" style="margin:-4px 0 10px">Shows under the channel name, like “grinding ranked 🎮”. It clears itself when everyone leaves.</p>
    <label class="field">Status<input name="t" maxlength="60" value="${esc(ch.voiceStatus?.text || '')}" placeholder="What's happening in here?"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="clear">Clear</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  f.t.focus();
  const save = async text => { try { await api('PUT', `/api/channels/${ch.id}/voice-status`, { text }); closeLayer(); } catch (e) { toast(e.message, true); } };
  f.addEventListener('submit', e => { e.preventDefault(); save(f.t.value.trim()); });
  $('[data-a=clear]', ov).addEventListener('click', () => save(''));
}
// Creating a channel: Stage is a third choice.
const _openCreateChannelS = openCreateChannel;
openCreateChannel = function (sv, type = 'text', categoryId = null) {
  _openCreateChannelS(sv, type === 'stage' ? 'voice' : type, categoryId);
  const types = $('#new-ch .ch-types');
  if (!types) return;
  types.insertAdjacentHTML('beforeend', `<label class="ch-type"><input type="radio" name="type" value="stage"${type === 'stage' ? ' checked' : ''}><span class="ch-ico">${STAGE_ICO}</span><span><b>Stage</b><small>Speakers talk, everyone else listens and raises a hand</small></span></label>`);
  const f = $('#new-ch');
  f.addEventListener('change', () => { if (f.type.value === 'stage') { $('.sc-ro', f).style.display = 'none'; f.name.placeholder = 'Town Hall'; } });
};

// ======================= the stage =======================
const stageOf = (sv, chId) => sv?.stages?.[chId] || { topic: '', speakers: [], hands: [] };
const amSpeaker = () => { const sv = currentServer(), r = Calls.room; if (!r?.startsWith('vc:') || !sv) return true; const ch = sv.channels.find(c => 'vc:' + c.id === r); return !ch?.stage || stageOf(sv, ch.id).speakers.includes(state.me.id); };
const stageRoomCh = () => { const r = Calls.room; if (!r?.startsWith('vc:')) return null; for (const sv of state.servers) { const ch = sv.channels.find(c => 'vc:' + c.id === r && c.stage); if (ch) return { sv, ch }; } return null; };
// The audience stays muted: unmuting asks to raise your hand instead.
const _toggleMuteS = Calls.toggleMute;
Calls.toggleMute = function () {
  const st = stageRoomCh();
  if (st && Calls.muted && !stageOf(st.sv, st.ch.id).speakers.includes(state.me.id)) { toast("You're in the audience. Raise your hand ✋ to ask to speak."); return; }
  return _toggleMuteS();
};
const _renderVoiceStageS = renderVoiceStage;
renderVoiceStage = function () {
  const el = $('#voice-stage');
  const sv = currentServer(), ch = currentChannel();
  if (!el || state.view.type !== 'voice' || !ch?.stage) { _renderVoiceStageS(); addVoiceStatusButton(); return; }
  const st = stageOf(sv, ch.id), room = 'vc:' + ch.id, inside = sv.voice?.[ch.id] || [];
  const mod = chHas(ch, 'manage_stage') || chHas(ch, 'manage_channels');
  const joined = Calls.room === room;
  const speaker = st.speakers.includes(state.me.id);
  const audience = inside.filter(id => !st.speakers.includes(id));
  const person = (id, big) => { const u = user(id) || { id, displayName: '…' }; const ps = Calls.peerState(id); return `<div class="stg-person${big ? ' big' : ''}${Calls.isSpeaking(id) ? ' speaking' : ''}" data-speak="${esc(id)}" data-sp="${esc(id)}">${avatar(u, big ? 72 : 40)}<span>${esc(nameIn(u, sv))}${st.hands.includes(id) ? ' ✋' : ''}</span>${big && ps?.muted ? `<i class="vu-ico">${ICON.micOff}</i>` : ''}</div>`; };
  el.innerHTML = `<div class="stage-view">
    <div class="stg-head"><span class="stg-live${inside.length ? ' on' : ''}">${inside.length ? 'LIVE' : 'STAGE'}</span><h2>${esc(st.topic || ch.name)}</h2>${mod ? '<button class="btn btn-grey btn-sm" id="stg-topic">Edit Topic</button>' : ''}</div>
    <div class="stg-speakers">${st.speakers.length ? st.speakers.map(id => person(id, true)).join('') : `<div class="muted">No one is speaking yet.${mod ? ' Join to start the stage.' : ''}</div>`}</div>
    <div class="stg-aud-label">Listening — ${audience.length}</div>
    <div class="stg-audience">${audience.map(id => person(id, false)).join('') || '<span class="muted small">Nobody in the audience yet.</span>'}</div>
    ${mod && st.hands.length ? `<div class="stg-hands"><b>✋ Raised hands</b>${st.hands.map(id => `<div class="stg-hand">${avatar(user(id) || { id }, 24)}<span>${esc(user(id)?.displayName || 'Someone')}</span><button class="btn btn-primary btn-sm" data-invite="${esc(id)}">Invite to Speak</button></div>`).join('')}</div>` : ''}
    <div class="stg-controls">${joined ? `${speaker ? `<button class="btn btn-grey" id="stg-mute">${Calls.muted ? '🎙️ Unmute' : '🔇 Mute'}</button><button class="btn btn-grey" id="stg-down">Move to Audience</button>` : `<button class="btn btn-grey" id="stg-hand">${st.hands.includes(state.me.id) ? 'Lower Hand' : '✋ Raise Hand'}</button>`}<button class="btn btn-grey" id="stg-sounds">🎵</button><button class="btn btn-red" id="stg-leave">Leave Quietly</button>`
      : `<button class="btn btn-green" id="stg-join">${inside.length ? 'Join Stage' : mod ? 'Start the Stage' : 'Join Stage'}</button>`}</div></div>`;
  const post = (path, body) => api('POST', `/api/stage/${ch.id}/${path}`, body).catch(e => toast(e.message, true));
  $('#stg-join', el)?.addEventListener('click', () => Calls.joinVoice(sv.id, ch.id));
  $('#stg-leave', el)?.addEventListener('click', () => Calls.hangup());
  $('#stg-mute', el)?.addEventListener('click', () => { Calls.toggleMute(); setTimeout(renderVoiceStage, 50); });
  $('#stg-down', el)?.addEventListener('click', () => post('speaker', { userId: state.me.id, on: false }));
  $('#stg-hand', el)?.addEventListener('click', () => post('hand', { up: !st.hands.includes(state.me.id) }));
  $('#stg-sounds', el)?.addEventListener('click', e => openSoundboard(e.currentTarget));
  $$('[data-invite]', el).forEach(b => b.addEventListener('click', () => post('speaker', { userId: b.dataset.invite, on: true })));
  $('#stg-topic', el)?.addEventListener('click', () => {
    const ov = openLayer(`<form class="dialog modal" style="max-width:420px"><h3>Stage topic</h3><label class="field">What's this stage about?<input name="t" maxlength="120" value="${esc(st.topic)}" placeholder="Monthly Q&A"></label><div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
    $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
    $('form', ov).addEventListener('submit', async e => { e.preventDefault(); await api('PUT', `/api/stage/${ch.id}/topic`, { topic: e.target.t.value }).catch(err => toast(err.message, true)); closeLayer(); });
  });
  $$('[data-sp]', el).forEach(p => p.addEventListener('click', e => {
    const id = p.dataset.sp;
    if (!mod || !joined || id === state.me.id) return openProfile(id);
    openMenu(p, [{ label: 'View Profile', run: () => openProfile(id) }, st.speakers.includes(id) ? { label: 'Move to Audience', run: () => post('speaker', { userId: id, on: false }) } : { label: 'Invite to Speak', run: () => post('speaker', { userId: id, on: true }) }]);
  }));
};
function addVoiceStatusButton() {
  const bar = $('#main .topbar'), ch = currentChannel();
  if (!bar || !ch || ch.type !== 'voice' || $('#vs-btn', bar)) return;
  const b = document.createElement('button');
  b.className = 'btn btn-grey btn-sm'; b.id = 'vs-btn'; b.style.marginLeft = 'auto';
  b.textContent = ch.voiceStatus?.text ? `💬 ${ch.voiceStatus.text}` : '💬 Set Status';
  bar.appendChild(b);
  b.addEventListener('click', () => (Calls.room === 'vc:' + ch.id || chHas(ch, 'manage_channels') ? openVoiceStatus(ch) : toast('Join the voice channel to set its status.')));
}
// Joining a stage as the audience starts you muted.
const _joinVoiceS = Calls.joinVoice;
Calls.joinVoice = async function (serverId, channelId) {
  const r = await _joinVoiceS(serverId, channelId);
  const sv = svById(serverId), ch = sv?.channels.find(c => c.id === channelId);
  if (ch?.stage && !(chHas(ch, 'manage_stage') || chHas(ch, 'manage_channels')) && !Calls.muted) _toggleMuteS();
  return r;
};

// ======================= role pickers =======================
function rolePickerHtml(m) {
  const rp = m.rolePicker, sv = currentServer();
  if (!sv) return '';
  const mine = new Set(sv.memberRoles?.[state.me.id] || []);
  return `<div class="role-picker"><div class="rpk-title">🏷️ ${esc(rp.title)}</div>${rp.description ? `<div class="rpk-desc">${formatMessage(rp.description)}</div>` : ''}
    <div class="rpk-opts">${rp.options.map(o => { const r = sv.roles.find(x => x.id === o.roleId); if (!r) return ''; return `<button class="rpk-opt${mine.has(r.id) ? ' on' : ''}" data-rpick="${esc(r.id)}" data-msg="${esc(m.id)}" style="--rc:${esc(r.color || '#9aa6a4')}" title="${esc(o.description || r.name)}">${o.emoji ? `<span class="rpk-e">${formatMessage(o.emoji)}</span>` : '<i class="rpk-dot"></i>'}<span>${esc(o.label)}</span>${mine.has(r.id) ? '<b>✓</b>' : ''}</button>`; }).join('')}</div>
    <div class="muted small">${rp.multi ? 'Pick as many as you like.' : 'Pick one.'} Click again to remove.</div></div>`;
}
const _mediaHtmlS = mediaHtml;
mediaHtml = function (m) { return (m.rolePicker ? rolePickerHtml(m) : '') + _mediaHtmlS(m); };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-rpick]');
  if (!b) return;
  b.disabled = true;
  try {
    const r = await api('POST', `/api/channels/${state.view.channelId}/messages/${b.dataset.msg}/pick`, { roleId: b.dataset.rpick });
    const sv = currentServer(); if (sv) sv.memberRoles = { ...sv.memberRoles, [state.me.id]: r.roles };
    toast(r.on ? '✓ Role added' : 'Role removed'); renderMessages();
  } catch (err) { toast(err.message, true); }
  b.disabled = false;
});
SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'roles') + 1, 0,
  { group: 'Roles & Channels', key: 'rolepickers', label: 'Role Pickers', need: 'manage_roles', words: 'reaction roles role picker self roles buttons pick your roles' },
  { group: 'Roles & Channels', key: 'onboarding', label: 'Onboarding', need: 'manage_server', words: 'onboarding questions new members welcome join roles customize' });
SS_SECTIONS.push({ group: 'Server', key: 'backups', label: 'Backups', need: 'manage_server', words: 'backup restore export copy template download' });
SS_SETTINGS.push(['rolepickers', 'Reaction roles'], ['onboarding', 'Onboarding questions'], ['backups', 'Download backup']);
const _showServerSectionS = showServerSection;
showServerSection = async function (section, openCh) {
  const fn = { rolepickers: ssRolePickers, onboarding: ssOnboarding, backups: ssBackups }[section];
  if (!fn) return _showServerSectionS(section, openCh);
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  return fn($('#ss-body'), svById(svSettings.id));
};
const pickableRoles = sv => sv.roles.filter(r => !r.everyone && !r.managed && !(r.perms || []).some(p => ['administrator', 'manage_server', 'manage_roles', 'ban_members', 'kick_members', 'manage_channels'].includes(p)));
function ssRolePickers(body, sv) {
  const roles = pickableRoles(sv);
  const texts = sv.channels.filter(c => c.type === 'text');
  const opts = [{ roleId: roles[0]?.id || '', emoji: '', label: '' }];
  body.innerHTML = `<div data-keep><h2>Role Pickers</h2>
    <p class="muted" style="margin:-10px 0 16px">Post a message with buttons so people can give themselves roles, like “He/Him”, “Gamer” or “EU”. Reacting with an option's emoji works too. Roles with moderator permissions can't be picked.</p>
    ${roles.length ? `<form id="rpk-form" class="rpk-form">
      <label class="field">Post it in<select name="ch" class="sc-select">${texts.map(c => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">Title<input name="title" maxlength="80" value="Pick your roles"></label>
      <label class="field">Description <span class="hint">(optional)</span><textarea name="desc" rows="2" maxlength="300"></textarea></label>
      <label class="setting-row"><div><div class="setting-title">Let people pick more than one</div><div class="setting-desc">Off: picking one removes the others (good for regions or colors).</div></div><input type="checkbox" class="switch" name="multi" checked></label>
      <div class="field">Options<div id="rpk-opts"></div><button type="button" class="btn btn-grey btn-sm" id="rpk-add">➕ Add an Option</button></div>
      <div class="rpk-preview" id="rpk-preview"></div>
      <button class="btn btn-primary">Post Role Picker</button></form>` : `<div class="empty-state">${mascot('curious')}<div class="title">Make some roles first</div><div>Role pickers hand out roles without special permissions. Create some in Roles.</div></div>`}</div>`;
  const f = $('#rpk-form', body);
  if (!f) return;
  const draw = () => {
    $('#rpk-opts', f).innerHTML = opts.map((o, i) => `<div class="rpk-row" data-i="${i}"><button type="button" class="cs-emoji" data-oe>${o.emoji ? formatMessage(o.emoji) : '😀'}</button>
      <select class="sc-select" data-or>${roles.map(r => `<option value="${esc(r.id)}"${o.roleId === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      <input data-ol maxlength="40" placeholder="Label (optional)" value="${esc(o.label)}"><button type="button" class="icon-btn danger" data-ox title="Remove">${ICON.trash}</button></div>`).join('');
    $$('.rpk-row', f).forEach(r => {
      const o = opts[r.dataset.i];
      $('[data-oe]', r).addEventListener('click', e => openEmojiPicker(e.currentTarget, x => { o.emoji = x; draw(); }, { title: 'Option emoji' }));
      $('[data-or]', r).addEventListener('change', e => { o.roleId = e.target.value; preview(); });
      $('[data-ol]', r).addEventListener('input', e => { o.label = e.target.value; preview(); });
      $('[data-ox]', r).addEventListener('click', () => { opts.splice(r.dataset.i, 1); draw(); });
    });
    $('#rpk-add', f).classList.toggle('hidden', opts.length >= 20);
    preview();
  };
  const preview = () => { $('#rpk-preview', f).innerHTML = `<div class="muted small">Preview</div>` + rolePickerHtml({ id: 'preview', rolePicker: { title: f.title.value, description: f.desc.value, multi: f.multi.checked, options: opts.map(o => ({ ...o, label: o.label || sv.roles.find(r => r.id === o.roleId)?.name || '' })) } }).replace(/data-rpick/g, 'data-x'); };
  f.addEventListener('input', preview);
  $('#rpk-add', f).addEventListener('click', () => { opts.push({ roleId: roles.find(r => !opts.some(o => o.roleId === r.id))?.id || roles[0].id, emoji: '', label: '' }); draw(); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('POST', `/api/servers/${sv.id}/role-pickers`, { channelId: f.ch.value, title: f.title.value, description: f.desc.value, multi: f.multi.checked, options: opts });
      toast('Role picker posted 🏷️'); ssRolePickers(body, sv);
    } catch (err) { toast(err.message, true); }
  });
  draw();
}

// ======================= onboarding questions =======================
function ssOnboarding(body, sv) {
  const ob = JSON.parse(JSON.stringify(sv.onboarding || { enabled: false, welcome: '', questions: [] }));
  const roles = sv.roles.filter(r => !r.everyone && !r.managed);
  const nid = () => Math.random().toString(36).slice(2, 10);
  const draw = () => {
    body.innerHTML = `<div data-keep><h2>Onboarding</h2>
      <p class="muted" style="margin:-10px 0 16px">New members answer a few questions when they join, and get roles to match their answers.</p>
      <label class="setting-row"><div><div class="setting-title">Ask new members questions</div><div class="setting-desc">Shown right after someone joins.</div></div><input type="checkbox" class="switch" id="ob-on"${ob.enabled ? ' checked' : ''}></label>
      <label class="field">Welcome note<textarea id="ob-welcome" rows="2" maxlength="300" placeholder="Welcome! Tell us a little about yourself so we can show you the right channels.">${esc(ob.welcome || '')}</textarea></label>
      <div id="ob-qs">${ob.questions.map((q, qi) => `<div class="ob-q" data-q="${qi}"><div class="ob-qhead"><input data-qt maxlength="100" value="${esc(q.title)}" placeholder="What are you into?"><label class="ob-flag"><input type="checkbox" data-qm${q.multi ? ' checked' : ''}> Many answers</label><label class="ob-flag"><input type="checkbox" data-qr${q.required ? ' checked' : ''}> Required</label><button class="icon-btn danger" data-qx title="Remove question">${ICON.trash}</button></div>
        ${q.options.map((o, oi) => `<div class="ob-opt" data-o="${oi}"><button type="button" class="cs-emoji" data-oe>${o.emoji ? formatMessage(o.emoji) : '😀'}</button><input data-ol maxlength="50" value="${esc(o.label)}" placeholder="Answer">
          <select data-orl class="sc-select"><option value="">No role</option>${roles.map(r => `<option value="${esc(r.id)}"${o.roleIds?.[0] === r.id ? ' selected' : ''}>Gives @${esc(r.name)}</option>`).join('')}</select><button class="icon-btn" data-ox title="Remove answer">✕</button></div>`).join('')}
        <button class="btn btn-link btn-sm" data-oadd>➕ Add an answer</button></div>`).join('')}</div>
      ${ob.questions.length < 8 ? '<button class="btn btn-grey btn-sm" id="ob-addq">➕ Add a Question</button>' : ''}
      <div class="row-btns" style="margin-top:16px"><button class="btn btn-primary" id="ob-save">Save</button><button class="btn btn-grey" id="ob-preview">Preview</button></div></div>`;
    const read = () => {
      ob.enabled = $('#ob-on', body).checked; ob.welcome = $('#ob-welcome', body).value;
      $$('.ob-q', body).forEach(qe => {
        const q = ob.questions[qe.dataset.q];
        q.title = $('[data-qt]', qe).value; q.multi = $('[data-qm]', qe).checked; q.required = $('[data-qr]', qe).checked;
        $$('.ob-opt', qe).forEach(oe => { const o = q.options[oe.dataset.o]; o.label = $('[data-ol]', oe).value; o.roleIds = $('[data-orl]', oe).value ? [$('[data-orl]', oe).value] : []; });
      });
    };
    $('#ob-addq', body)?.addEventListener('click', () => { read(); ob.questions.push({ id: nid(), title: '', multi: true, required: false, options: [{ id: nid(), label: '', emoji: '', roleIds: [] }] }); draw(); });
    $$('.ob-q', body).forEach(qe => {
      const qi = Number(qe.dataset.q), q = ob.questions[qi];
      $('[data-qx]', qe).addEventListener('click', () => { read(); ob.questions.splice(qi, 1); draw(); });
      $('[data-oadd]', qe).addEventListener('click', () => { read(); q.options.push({ id: nid(), label: '', emoji: '', roleIds: [] }); draw(); });
      $$('.ob-opt', qe).forEach(oe => {
        const oi = Number(oe.dataset.o);
        $('[data-ox]', oe).addEventListener('click', () => { read(); q.options.splice(oi, 1); draw(); });
        $('[data-oe]', oe).addEventListener('click', e => { read(); openEmojiPicker(e.currentTarget, x => { q.options[oi].emoji = x; draw(); }, { title: 'Answer emoji' }); });
      });
    });
    $('#ob-save', body).addEventListener('click', async () => {
      read();
      try { const r = await api('PUT', `/api/servers/${sv.id}/onboarding`, ob); sv.onboarding = r.onboarding; toast('Onboarding saved'); } catch (e) { toast(e.message, true); }
    });
    $('#ob-preview', body).addEventListener('click', () => { read(); openOnboarding({ ...sv, onboarding: ob }, true); });
  };
  draw();
}
function openOnboarding(sv, preview = false) {
  const ob = sv.onboarding;
  if (!ob?.questions?.length) return;
  const picked = {};
  let step = 0;
  const ov = openLayer('<div class="dialog modal onboard"></div>');
  const box = $('.onboard', ov);
  const draw = () => {
    const q = ob.questions[step];
    box.innerHTML = `<div class="ob-top">${sv.icon ? `<img src="${esc(sv.icon)}" alt="">` : `<span class="ob-ico" style="--sv:${esc(sv.iconColor || '#04c5ae')}">${esc([...sv.name][0] || '?')}</span>`}<div><b>Welcome to ${esc(sv.name)}!</b>${step === 0 && ob.welcome ? `<div class="muted small">${esc(ob.welcome)}</div>` : ''}</div></div>
      <div class="ob-progress">${ob.questions.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <h3>${esc(q.title)}${q.required ? ' <span class="req">*</span>' : ''}</h3><div class="muted small">${q.multi ? 'Pick as many as you like' : 'Pick one'}</div>
      <div class="ob-answers">${q.options.map(o => `<button class="ob-ans${(picked[q.id] || []).includes(o.id) ? ' on' : ''}" data-ans="${esc(o.id)}">${o.emoji ? `<span>${formatMessage(o.emoji)}</span>` : ''}<b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`).join('')}</div>
      <div class="actions">${step > 0 ? '<button class="btn btn-link" data-a="back">Back</button>' : ob.questions.some(x => x.required) ? '' : '<button class="btn btn-link" data-a="skip">Skip</button>'}<button class="btn btn-primary" data-a="next">${step === ob.questions.length - 1 ? 'Finish' : 'Next'}</button></div>`;
    $$('[data-ans]', box).forEach(b => b.addEventListener('click', () => {
      const cur = picked[q.id] || [];
      picked[q.id] = q.multi ? (cur.includes(b.dataset.ans) ? cur.filter(x => x !== b.dataset.ans) : [...cur, b.dataset.ans]) : [b.dataset.ans];
      draw();
    }));
    $('[data-a=back]', box)?.addEventListener('click', () => { step--; draw(); });
    $('[data-a=skip]', box)?.addEventListener('click', () => finish(true));
    $('[data-a=next]', box).addEventListener('click', () => {
      if (q.required && !(picked[q.id] || []).length) return toast('Pick at least one answer.', true);
      if (step < ob.questions.length - 1) { step++; draw(); } else finish(false);
    });
  };
  const finish = async skip => {
    if (preview) { closeLayer(); return toast('That was a preview. Nothing was saved.'); }
    try { await api('POST', `/api/servers/${sv.id}/onboarding/answers`, { answers: picked, skip }); closeLayer(); toast(`You're all set in ${sv.name}! 🎉`); refresh({ serverId: sv.id }); }
    catch (e) { toast(e.message, true); }
  };
  draw();
}
const _openServerS = openServer;
openServer = async function (serverId, channelId) {
  const r = await _openServerS(serverId, channelId);
  const sv = svById(serverId);
  if (sv?.onboarding?.enabled && !sv.onboarded && !sessionStorage.getItem('zuno_ob_' + sv.id)) { try { sessionStorage.setItem('zuno_ob_' + sv.id, '1'); } catch {} openOnboarding(sv); }
  return r;
};

// ======================= backups =======================
function downloadJson(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const backupName = (sv, at) => `${sv.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'server'}-backup-${new Date(at).toISOString().slice(0, 10)}.zuno.json`;
async function ssBackups(body, sv) {
  body.innerHTML = `<div data-keep><h2>Backups</h2><div class="fp-empty">Loading…</div></div>`;
  let list = [];
  try { list = (await api('GET', `/api/servers/${sv.id}/backups`)).backups; } catch {}
  body.innerHTML = `<div data-keep><h2>Backups</h2>
    <p class="muted" style="margin:-10px 0 16px">A backup is how ${esc(sv.name)} is set up: roles and permissions, channels and categories, onboarding and settings. It doesn't include members or messages. Turn one into a brand-new server any time.</p>
    <div class="setting-group"><div class="setting-row"><div><div class="setting-title">Download a backup now</div><div class="setting-desc">Saves a .zuno.json file you can keep.</div></div><button class="btn btn-primary btn-sm" id="bk-now">Download</button></div>
      <div class="setting-row"><div><div class="setting-title">Make a server from a backup</div><div class="setting-desc">Creates a new server you own, set up just like the backup. Pictures, emoji and sounds aren't copied.</div></div><button class="btn btn-grey btn-sm" id="bk-restore">Choose File</button></div></div>
    <div class="setting-group"><h4 class="setting-head">Automatic backups</h4><p class="setting-desc" style="margin:0 0 10px">Zuno saves a copy each day it changes and keeps the last 5.</p>
      ${list.length ? list.map(b => `<div class="bk-row"><span>💾</span><div style="flex:1"><b>${esc(new Date(b.at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</b><div class="muted small">${b.channels} channels · ${b.roles} roles</div></div><button class="btn btn-grey btn-sm" data-bk="${esc(b.id)}">Download</button><button class="btn btn-link btn-sm" data-bkr="${esc(b.id)}">Make a Server</button></div>`).join('') : '<div class="fp-empty">The first automatic backup is made within a few hours.</div>'}</div></div>`;
  $('#bk-now', body).addEventListener('click', async () => { try { const { backup } = await api('GET', `/api/servers/${sv.id}/backup`); downloadJson(backup, backupName(sv, backup.at)); } catch (e) { toast(e.message, true); } });
  $('#bk-restore', body).addEventListener('click', restoreFromFile);
  $$('[data-bk]', body).forEach(b => b.addEventListener('click', async () => { try { const { backup } = await api('GET', `/api/servers/${sv.id}/backups/${b.dataset.bk}`); downloadJson(backup, backupName(sv, backup.at)); } catch (e) { toast(e.message, true); } }));
  $$('[data-bkr]', body).forEach(b => b.addEventListener('click', async () => { try { const { backup } = await api('GET', `/api/servers/${sv.id}/backups/${b.dataset.bkr}`); restoreBackup(backup); } catch (e) { toast(e.message, true); } }));
}
function restoreFromFile() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try { restoreBackup(JSON.parse(await file.text())); } catch { toast("That file isn't a Zuno server backup.", true); }
  });
  input.click();
}
function restoreBackup(backup) {
  if (backup?.zunoBackup !== 1) return toast("That file isn't a Zuno server backup.", true);
  const ov = openLayer(`<form class="dialog modal" style="max-width:420px"><h3>Make a server from this backup</h3>
    <p class="muted small" style="margin:-4px 0 10px">${(backup.channels || []).length} channels and ${(backup.roles || []).length} roles from <b>${esc(backup.name || 'a server')}</b>, saved ${esc(new Date(backup.at).toLocaleDateString())}.</p>
    <label class="field">New server name<input name="n" maxlength="48" value="${esc(backup.name || '')}" required></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Server</button></div></form>`);
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  $('form', ov).addEventListener('submit', async e => {
    e.preventDefault();
    try { const { server } = await api('POST', '/api/servers/from-backup', { backup, name: e.target.n.value }); closeLayer(); state.servers.push(server); await openServer(server.id); toast('Server restored from backup 💾'); }
    catch (err) { toast(err.message, true); }
  });
}
// "Add a Server" gets a restore option.
const _openAddServerS = openAddServer;
openAddServer = function () {
  _openAddServerS();
  const ov = $('#layer .add-server');
  if (!ov || $('#restore-link', ov)) return;
  ov.insertAdjacentHTML('beforeend', '<button class="btn btn-link btn-sm" id="restore-link" style="margin-top:8px">💾 Make a server from a backup file</button>');
  $('#restore-link', ov).addEventListener('click', restoreFromFile);
};

// ======================= member list: who's blooming the server =======================
const _renderMemberListS = renderMemberList;
renderMemberList = function (...a) {
  _renderMemberListS(...a);
  const sv = currentServer();
  for (const id of sv?.blooming?.bloomers || []) $(`#profile-panel [data-member="${CSS.escape(id)}"] .m-name`)?.insertAdjacentHTML('beforeend', '<i class="m-bloom" title="Blooming this server">🌸</i>');
};

// ======================= live events =======================
function hookCommunityEvents(es) {
  const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data || '{}')); } catch {} });
  on('stage', d => {
    const sv = svById(d.serverId);
    if (!sv) return;
    const was = sv.stages?.[d.channelId]?.speakers?.includes(state.me.id);
    sv.stages = { ...(sv.stages || {}), [d.channelId]: d };
    // Moved to the audience: mute right away.
    if (was && !d.speakers.includes(state.me.id) && Calls.room === 'vc:' + d.channelId && !Calls.muted) _toggleMuteS();
    if (state.currentServerId === sv.id) renderServerSidebar();
    if (state.view.type === 'voice' && state.view.channelId === d.channelId) renderVoiceStage();
  });
  on('stage-invited', () => toast("🎤 You're a speaker now! Unmute to talk."));
  on('stage-audience', () => toast("You're back in the audience."));
  on('voice-status', d => {
    const ch = svById(d.serverId)?.channels.find(c => c.id === d.channelId);
    if (!ch) return;
    ch.voiceStatus = d.status;
    if (state.currentServerId === d.serverId) renderServerSidebar();
    if (state.view.type === 'voice' && state.view.channelId === d.channelId) { $('#vs-btn')?.remove(); addVoiceStatusButton(); }
  });
}
(function waitEsS() {
  if (!state.es) return setTimeout(waitEsS, 800);
  hookCommunityEvents(state.es);
  const _connectS = connect;
  connect = function () { _connectS(); hookCommunityEvents(state.es); };
})();
