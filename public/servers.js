'use strict';
// Partnered servers get a blue seal (different from Zuno Official's ✓ tag).
function partnerSeal() {
  return '<svg class="partner-seal" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5l2.4 1.8 3-.2 1 2.8 2.6 1.6-.8 2.9L21.5 12l-1.3 2.6.8 2.9-2.6 1.6-1 2.8-3-.2L12 22.5l-2.4-1.8-3 .2-1-2.8L3 16.5l.8-2.9L2.5 12l1.3-2.6L3 6.5l2.6-1.6 1-2.8 3 .2z"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function partnerMark(kind = 'icon', where = '') {
  return kind === 'tag'
    ? `<span class="partner-tag" data-partner title="Partnered server">${partnerSeal()}Partnered</span>`
    : `<span class="partner-icon${where ? ' in-' + where : ''}" data-partner title="Partnered server">${partnerSeal()}</span>`;
}
// Zuno servers: the server rail, channel list, member list, invites and server settings.

const currentServer = () => state.servers.find(sv => sv.id === state.currentServerId) || null;
const currentChannel = () => {
  const sv = currentServer();
  return sv && (state.view.type === 'channel' || state.view.type === 'voice') ? sv.channels.find(c => c.id === state.view.channelId) || null : null;
};
const isOwner = sv => sv?.ownerId === state.me?.id;

function serverIcon(sv, size = 48) {
  const initials = sv.name.split(/\s+/).filter(Boolean).slice(0, 3).map(w => [...w][0]).join('').toUpperCase() || '?';
  return sv.icon
    ? `<img src="${esc(sv.icon)}" alt="">`
    : `<span class="sv-initials" style="font-size:${initials.length > 2 ? Math.round(size * 0.27) : Math.round(size * 0.36)}px">${esc(initials)}</span>`;
}

// ---------- rail ----------
// The rail follows your own order and folders (state.railLayout); new servers go at the end.
function railItems() {
  const byId = new Map(state.servers.map(sv => [sv.id, sv]));
  const used = new Set(), out = [];
  for (const it of state.railLayout || []) {
    if (typeof it === 'string') { if (byId.has(it) && !used.has(it)) { used.add(it); out.push(it); } continue; }
    const servers = (it.servers || []).filter(id => byId.has(id) && !used.has(id));
    servers.forEach(id => used.add(id));
    if (servers.length) out.push({ ...it, servers });
  }
  for (const sv of state.servers) if (!used.has(sv.id)) out.push(sv.id);
  return out;
}
function saveRail(layout) {
  // A folder of one is just a server again.
  state.railLayout = layout.map(it => (typeof it === 'string' || it.servers.length > 1 ? it : it.servers[0])).filter(Boolean);
  renderRail();
  api('PUT', '/api/me/rail-layout', { layout: state.railLayout }).then(r => { state.railLayout = r.railLayout; }).catch(e => toast(e.message, true));
}
function railServerBtn(sv) {
  const unread = sv.channels.some(c => c.unread);
  const active = state.currentServerId === sv.id;
  const inVoice = Calls.room?.startsWith('vc:') && sv.channels.some(c => 'vc:' + c.id === Calls.room);
  return `<div class="rail-item${active ? ' active' : ''}${unread ? ' unread' : ''}" draggable="true" data-drag="${esc(sv.id)}">
      <button class="rail-btn sv" data-server="${esc(sv.id)}" data-tip="${esc(sv.name)}" style="--sv:${esc(sv.iconColor)}">${serverIcon(sv)}${inVoice ? `<i class="rail-voice">${ICON.speaker}</i>` : ''}${sv.official || sv.verified ? '<i class="rail-official" title="Official">✓</i>' : sv.partnered ? `<i class="rail-partner" title="Partnered">${partnerSeal()}</i>` : ''}</button></div>`;
}
function renderRail() {
  const rail = $('#server-rail');
  if (!rail) return;
  const svOf = id => state.servers.find(s => s.id === id);
  rail.innerHTML = railItems().map(it => {
    if (typeof it === 'string') return railServerBtn(svOf(it));
    const list = it.servers.map(svOf);
    const unread = list.some(sv => sv.channels.some(c => c.unread));
    const active = list.some(sv => sv.id === state.currentServerId);
    const name = it.name || list.map(sv => sv.name).slice(0, 3).join(', ');
    return `<div class="rail-folder${it.open ? ' open' : ''}${active ? ' has-active' : ''}" data-folder="${esc(it.id)}" style="--fc:${esc(it.color || '#5865f2')}">
      <div class="rail-item${unread && !it.open ? ' unread' : ''}${active && !it.open ? ' active' : ''}" draggable="true" data-drag="f:${esc(it.id)}"><button class="rail-btn folder-btn" data-tip="${esc(name)}" aria-expanded="${it.open}">
        ${it.open ? '<span class="folder-ico">📁</span>' : `<span class="folder-minis">${list.slice(0, 4).map(sv => `<i style="--sv:${esc(sv.iconColor)}">${serverIcon(sv, 18)}</i>`).join('')}</span>`}</button></div>
      ${it.open ? `<div class="folder-list">${list.map(railServerBtn).join('')}</div>` : ''}</div>`;
  }).join('');
  $$('[data-server]', rail).forEach(b => b.addEventListener('click', () => openServer(b.dataset.server)));
  $$('.folder-btn', rail).forEach(b => {
    const id = b.closest('[data-folder]').dataset.folder;
    b.addEventListener('click', () => saveRail(railItems().map(it => (typeof it !== 'string' && it.id === id ? { ...it, open: !it.open } : it))));
    b.addEventListener('contextmenu', e => { e.preventDefault(); openFolderMenu(b, id); });
  });
  wireRailDrag(rail);
  const home = $('#home-btn');
  home.classList.toggle('active', !state.currentServerId);
  renderFriendsBadge();
}
function openFolderMenu(anchor, id) {
  const f = railItems().find(it => typeof it !== 'string' && it.id === id);
  if (!f) return;
  const set = change => saveRail(railItems().map(it => (typeof it !== 'string' && it.id === id ? { ...it, ...change } : it)));
  openMenu(anchor, [
    { label: 'Folder Settings', icon: '<span class="mi-ico">✏️</span>', run: () => {
      const ov = openLayer(`<form class="dialog modal" style="max-width:400px"><h3>Folder Settings</h3>
        <label class="field">Folder name<input name="n" maxlength="32" value="${esc(f.name || '')}" placeholder="My servers"></label>
        <div class="field">Color<div class="fold-colors">${['#5865f2', '#04c5ae', '#23a55a', '#f0b232', '#f47b67', '#eb459e', '#9b59b6', '#80848e'].map(c => `<button type="button" data-c="${c}" style="--c:${c}" class="${(f.color || '#5865f2') === c ? 'on' : ''}"></button>`).join('')}</div></div>
        <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Done</button></div></form>`);
      let color = f.color || '#5865f2';
      $$('[data-c]', ov).forEach(b => b.addEventListener('click', () => { color = b.dataset.c; $$('[data-c]', ov).forEach(x => x.classList.toggle('on', x === b)); }));
      $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
      $('form', ov).addEventListener('submit', e => { e.preventDefault(); closeLayer(); set({ name: e.target.n.value.trim(), color }); });
    } },
    { label: f.open ? 'Close Folder' : 'Open Folder', icon: '<span class="mi-ico">📂</span>', run: () => set({ open: !f.open }) },
    'sep',
    { label: 'Ungroup Servers', icon: '<span class="mi-ico">📤</span>', danger: true, run: () => saveRail(railItems().flatMap(it => (typeof it !== 'string' && it.id === id ? it.servers : [it]))) },
  ]);
}
// Drag servers to reorder them; drop one on another to make a folder.
function wireRailDrag(rail) {
  let dragging = null;
  const clear = () => $$('.drop-before, .drop-after, .drop-into', rail).forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const zone = (el, e) => { const r = el.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into'; };
  $$('[data-drag]', rail).forEach(el => {
    el.addEventListener('dragstart', e => { dragging = el.dataset.drag; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/zuno-rail', dragging); el.classList.add('dragging'); e.stopPropagation(); });
    el.addEventListener('dragend', () => { dragging = null; el.classList.remove('dragging'); clear(); });
    el.addEventListener('dragover', e => {
      if (!dragging || dragging === el.dataset.drag) return;
      e.preventDefault(); e.stopPropagation();
      clear();
      let z = zone(el, e);
      if (z === 'into' && dragging.startsWith('f:')) z = 'after'; // folders don't go inside things
      el.classList.add('drop-' + z);
    });
    el.addEventListener('drop', e => {
      if (!dragging || dragging === el.dataset.drag) return;
      e.preventDefault(); e.stopPropagation();
      let z = zone(el, e);
      if (z === 'into' && dragging.startsWith('f:')) z = 'after';
      moveOnRail(dragging, el.dataset.drag, z);
      clear();
    });
  });
}
function moveOnRail(from, to, where) {
  let items = railItems().map(it => (typeof it === 'string' ? it : { ...it, servers: [...it.servers] }));
  const isF = k => k.startsWith('f:');
  // Take the dragged thing out.
  let moving;
  if (isF(from)) { const i = items.findIndex(it => typeof it !== 'string' && it.id === from.slice(2)); moving = items.splice(i, 1)[0]; }
  else { moving = from; items = items.map(it => (typeof it === 'string' ? it : { ...it, servers: it.servers.filter(id => id !== from) })).filter(it => it !== from); }
  const folderOf = id => items.find(it => typeof it !== 'string' && (isF(id) ? it.id === id.slice(2) : it.servers.includes(id)));
  const target = folderOf(to);
  if (where === 'into') {
    if (target) target.servers.push(moving); // dropped on a folder, or on a server inside one
    else { const i = items.indexOf(to); items[i] = { id: Math.random().toString(36).slice(2, 10), name: '', color: '#5865f2', servers: [to, moving], open: false }; }
  } else if (target && !isF(to) && typeof moving === 'string') {
    const i = target.servers.indexOf(to); target.servers.splice(where === 'after' ? i + 1 : i, 0, moving); // reordering inside an open folder
  } else {
    let i = target ? items.indexOf(target) : items.indexOf(to);
    if (i < 0) i = items.length;
    items.splice(where === 'after' ? i + 1 : i, 0, moving);
  }
  saveRail(items.filter(it => typeof it === 'string' || it.servers.length));
}
$('#add-server-btn').addEventListener('click', openAddServer);

// ---------- opening servers & channels ----------
async function loadServerMembers(serverId) {
  try {
    const r = await api('GET', `/api/servers/${serverId}`);
    for (const m of r.members) state.users[m.id] = { ...state.users[m.id], ...m };
    state.serverMembers[serverId] = r.members.map(m => m.id);
    const i = state.servers.findIndex(sv => sv.id === serverId);
    if (i >= 0) state.servers[i] = { ...state.servers[i], ...r.server, invite: r.invite };
  } catch (e) { toast(e.message, true); }
}

async function openServer(serverId, channelId) {
  const sv = state.servers.find(s => s.id === serverId);
  if (!sv) return showFriends('online');
  if (state.view.type === 'dm') stopProfileSound();
  state.currentServerId = serverId;
  sv.lastChannel = channelId || sv.lastChannel;
  const ch = sv.channels.find(c => c.id === sv.lastChannel && c.type === 'text') || sv.channels.find(c => c.type === 'text');
  renderRail();
  if (!state.serverMembers[serverId]) await loadServerMembers(serverId);
  if (ch) openChannel(serverId, ch.id);
}

async function openChannel(serverId, channelId, opts = {}) {
  closeLayer();
  const sv = state.servers.find(s => s.id === serverId);
  const ch = sv?.channels.find(c => c.id === channelId);
  if (!ch) return;
  if (ch.type === 'voice' && !opts.chat) return openVoice(serverId, channelId);
  state.currentServerId = serverId;
  if (ch.type === 'text') sv.lastChannel = channelId;
  // A voice channel's chat: the same as a text channel, with the call on top.
  state.view = ch.type === 'voice' ? { type: 'channel', serverId, channelId, voice: true } : { type: 'channel', serverId, channelId };
  setWhere(`${sv.name}  ›  #${ch.name}`);
  $('#app').classList.remove('show-nav');
  const conv = 'ch:' + channelId;
  const main = $('#main');
  main.innerHTML = chatLayout({
    title: '',
    actions: `<button class="icon-btn${state.showMembers ? ' on' : ''}" id="toggle-members" title="Member List">${ICON.members}</button>`,
    side: `<aside class="member-panel${state.showMembers ? '' : ' hidden'}" id="profile-panel"></aside>`,
  });
  wireMobileNav(main);
  $('#toggle-members').addEventListener('click', e => {
    state.showMembers = !state.showMembers;
    $('#profile-panel').classList.toggle('hidden', !state.showMembers);
    e.currentTarget.classList.toggle('on', state.showMembers);
  });
  renderRail();
  renderServerSidebar();
  renderDMHeader();
  renderComposer();
  renderMemberList();
  renderTyping();
  Calls.renderSlot();
  markRead(conv);
  if (!state.serverMembers[serverId]) await loadServerMembers(serverId);
  renderMemberList();
  await loadConversation(conv);
}

function openVoice(serverId, channelId) {
  const sv = state.servers.find(s => s.id === serverId);
  const ch = sv?.channels.find(c => c.id === channelId);
  if (!ch) return;
  state.currentServerId = serverId;
  state.view = { type: 'voice', serverId, channelId };
  setWhere(`${sv.name}  ›  ${ch.name}`);
  $('#app').classList.remove('show-nav');
  $('#main').innerHTML = `
    <div class="topbar">${mobileNavButton()}<div class="title">${ICON.speaker}<span class="ch-title">${esc(ch.name)}</span></div><div class="spacer"></div><button class="icon-btn vc-chat-btn" id="vc-chat" title="Open Chat">${ICON.chat}<span>Chat</span></button></div>
    <div class="voice-stage" id="voice-stage"></div>`;
  wireMobileNav($('#main'));
  $('#vc-chat').addEventListener('click', () => openChannel(serverId, channelId, { chat: true }));
  renderRail();
  renderServerSidebar();
  // Clicking a voice channel joins it, like Discord.
  if (Calls.room !== 'vc:' + channelId) Calls.joinVoice(serverId, channelId);
  renderVoiceStage();
}

// ---------- channel sidebar ----------
function renderServerSidebar() {
  const sv = currentServer();
  if (!sv) return;
  const side = $('#sidebar');
  side.dataset.mode = 'server';
  $('#sidebar-top').innerHTML = `<button class="server-head" id="server-head">${sv.official || sv.verified ? '<span class="official" style="margin:0 6px 0 0">✓ Official</span>' : ''}${sv.partnered ? partnerMark('icon', 'sh') : ''}${esc(sv.name)}<span class="chev">${ICON.chevron}</span></button>`;
  $('#server-head').addEventListener('click', e => openServerMenu(e.currentTarget));
  const owner = isOwner(sv);
  const activeId = state.view.channelId;
  const text = sv.channels.filter(c => c.type === 'text'), voice = sv.channels.filter(c => c.type === 'voice');
  const voiceUsers = id => (sv.voice?.[id] || []);
  const section = (label, type) => `<div class="section-label ch-section"><span>${label}</span>${owner ? `<button class="sec-add" data-new="${type}" title="Create Channel">${ICON.plus}</button>` : ''}</div>`;
  $('#sidebar-scroll').innerHTML = `
    ${section('Text Channels', 'text')}
    ${text.map(c => `<button class="ch-item${c.id === activeId ? ' active' : ''}${c.unread ? ' unread' : ''}" data-ch="${esc(c.id)}">
      <span class="ch-ico">${ICON.hash}</span><span class="ch-name">${esc(c.name)}</span>
      ${c.unread && c.mentions ? `<span class="badge">${c.mentions > 99 ? '99+' : c.mentions}</span>` : ''}
      ${owner ? `<span class="ch-gear" data-edit-ch="${esc(c.id)}" title="Edit Channel">${ICON.gear}</span>` : ''}</button>`).join('')}
    ${section('Voice Channels', 'voice')}
    ${voice.map(c => `<button class="ch-item voice${Calls.room === 'vc:' + c.id ? ' connected' : ''}${c.id === activeId ? ' active' : ''}" data-ch="${esc(c.id)}">
      <span class="ch-ico">${ICON.speaker}</span><span class="ch-name">${esc(c.name)}</span>
      ${owner ? `<span class="ch-gear" data-edit-ch="${esc(c.id)}" title="Edit Channel">${ICON.gear}</span>` : ''}</button>
      ${voiceUsers(c.id).length ? `<div class="voice-users">${voiceUsers(c.id).map(id => {
        const u = user(id) || { id, displayName: '…' };
        const st = Calls.peerState(id);
        return `<div class="voice-user${Calls.isSpeaking(id) ? ' speaking' : ''}" data-vu="${esc(id)}" data-speak="${esc(id)}">${avatar(u, 22)}<span>${esc(u.displayName)}</span>${st?.muted ? `<i class="vu-ico">${ICON.micOff}</i>` : ''}${st?.deafened ? `<i class="vu-ico">${ICON.deafen}</i>` : ''}${st?.screen ? '<i class="live">LIVE</i>' : ''}</div>`;
      }).join('')}</div>` : ''}`).join('')}`;
  $$('[data-ch]').forEach(b => b.addEventListener('click', e => {
    if (e.target.closest('[data-edit-ch]')) return;
    openChannel(sv.id, b.dataset.ch);
  }));
  $$('[data-edit-ch]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openChannelSettings(sv, b.dataset.editCh); }));
  $$('[data-new]').forEach(b => b.addEventListener('click', () => openCreateChannel(sv, b.dataset.new)));
  $$('[data-vu]').forEach(b => b.addEventListener('click', () => openProfile(b.dataset.vu)));
}

function onVoiceState({ serverId, channelId, users }) {
  const sv = state.servers.find(s => s.id === serverId);
  if (!sv) return;
  sv.voice = { ...(sv.voice || {}), [channelId]: users };
  if (state.currentServerId === serverId) renderServerSidebar();
  if (state.view.type === 'voice' && state.view.channelId === channelId) renderVoiceStage();
}

// ---------- member list ----------
function renderMemberList() {
  const el = $('#profile-panel');
  const sv = currentServer();
  if (!el || !sv || state.view.type !== 'channel') return;
  const ids = state.serverMembers[sv.id] || [];
  const members = ids.map(user).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const online = members.filter(u => u.status !== 'offline'), offline = members.filter(u => u.status === 'offline');
  const row = u => `<button class="member${u.status === 'offline' ? ' off' : ''}" data-member="${esc(u.id)}">
    <span class="on-panel-2">${avatar(u, 32, true)}</span>
    <span class="m-meta"><span class="m-name">${esc(u.displayName)}${u.id === sv.ownerId ? `<i class="crown" title="Server Owner">${ICON.crown}</i>` : (sv.mods || []).includes(u.id) ? '<i class="mod-shield" title="Moderator">🛡️</i>' : ''}${botTag(u)}</span>
    ${u.customStatus ? `<span class="m-sub">${esc(u.customStatus)}</span>` : ''}</span></button>`;
  el.innerHTML = `<div class="members">
    ${online.length ? `<div class="list-label">Online — ${online.length}</div>${online.map(row).join('')}` : ''}
    ${offline.length ? `<div class="list-label">Offline — ${offline.length}</div>${offline.map(row).join('')}` : ''}</div>`;
  $$('[data-member]', el).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.member)));
  $$('[data-member]', el).forEach(b => b.addEventListener('contextmenu', e => {
    e.preventDefault();
    const id = b.dataset.member;
    const items = [{ label: 'Profile', run: () => openProfile(id) }];
    if (id !== state.me.id && isFriend(id)) items.push({ label: 'Message', run: () => openDM(id) });
    const theirRole = id === sv.ownerId ? 'owner' : (sv.mods || []).includes(id) ? 'mod' : 'member';
    const iCan = isOwner(sv) || ((sv.mods || []).includes(state.me.id) && theirRole === 'member');
    if (isOwner(sv) && theirRole !== 'owner') items.push({ label: theirRole === 'mod' ? 'Remove Moderator' : 'Make Moderator', run: async () => { try { await api('POST', `/api/servers/${sv.id}/mods`, { userId: id, on: theirRole !== 'mod' }); toast('Roles updated'); } catch (e) { toast(e.message, true); } } });
    if (iCan && id !== state.me.id && theirRole !== 'owner') items.push('sep', { label: 'Kick from Server', danger: true, run: () => kickMember(sv, id) }, { label: 'Ban from Server', danger: true, run: () => openServerBan(sv, id) });
    openMenu(atPoint(e), items);
  }));
}

function kickMember(sv, id) {
  const u = user(id);
  confirmDialog(`Kick ${u.displayName}`, `${u.displayName} will be removed from ${sv.name}. They can come back with an invite.`, 'Kick', async () => {
    try { await api('DELETE', `/api/servers/${sv.id}/members/${id}`); toast(`${u.displayName} was kicked`); } catch (e) { toast(e.message, true); }
  });
}

// ---------- menus & dialogs ----------
function openServerMenu(anchor) {
  const sv = currentServer();
  const items = [{ label: 'Invite People', icon: ICON.link, run: () => openInvite(sv) }];
  if (isOwner(sv)) {
    items.push({ label: 'Server Settings', icon: ICON.gear, run: () => openServerSettings(sv) });
    items.push({ label: 'Create Channel', icon: ICON.plus, run: () => openCreateChannel(sv, 'text') });
  }
  if (!sv.official) { // everyone stays in Zuno Official
    items.push('sep');
    items.push(isOwner(sv)
      ? { label: 'Delete Server', danger: true, run: () => deleteServer(sv) }
      : { label: 'Leave Server', danger: true, run: () => leaveServer(sv) });
  }
  openMenu(anchor, items);
  $('.menu').style.minWidth = anchor.offsetWidth + 'px';
}

// Invite links look like zuno://invite/CODE but people can paste just the code too.
const inviteText = code => `zuno.invite/${code}`;
// Custom invites can be as short as 3 characters (zuno.invite/owls).
const parseInvite = text => (String(text || '').trim().match(/([A-Za-z0-9_-]{3,})\/?$/) || [])[1];

async function openInvite(sv) {
  if (!sv.invite) await loadServerMembers(sv.id);
  sv = currentServer() || sv;
  const ov = openLayer(`<div class="dialog modal invite-dialog">
    <h3>Invite friends to ${esc(sv.name)}</h3>
    <p class="muted" style="margin:0 0 14px">Send them this invite. They paste it in Add a Server, then Join a Server.</p>
    <div class="copy-row"><input readonly value="${esc(inviteText(sv.invite))}" id="invite-code"><button class="btn btn-primary btn-sm" id="copy-invite">Copy</button></div>
    ${state.friends.length ? `<div class="list-label" style="margin-top:18px">Or send it to a friend</div>
    <div class="invite-friends">${state.friends.map(user).filter(u => u && !u.bot).map(u => `<div class="invite-friend">${avatar(u, 32)}<span>${esc(u.displayName)}</span><button class="btn btn-grey btn-sm" data-send-invite="${esc(u.id)}">Send</button></div>`).join('')}</div>` : ''}
    ${isOwner(sv) ? '<button class="btn btn-link small" id="reset-invite" style="margin-top:12px;padding:0">Reset the invite (the old one stops working)</button>' : ''}
  </div>`);
  $('#copy-invite', ov).addEventListener('click', async e => {
    try { await navigator.clipboard.writeText($('#invite-code').value); } catch { $('#invite-code').select(); document.execCommand('copy'); }
    e.target.textContent = 'Copied!'; burst(e.target, 8);
    setTimeout(() => { if (e.target.isConnected) e.target.textContent = 'Copy'; }, 1600);
  });
  $$('[data-send-invite]', ov).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api('POST', `/api/dms/${b.dataset.sendInvite}/messages`, { content: `Join me in **${sv.name}** on Zuno! Invite: ${inviteText(sv.invite)}` });
      b.textContent = 'Sent';
    } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  $('#reset-invite', ov)?.addEventListener('click', async () => {
    try { const r = await api('POST', `/api/servers/${sv.id}/invite/reset`); sv.invite = r.invite; $('#invite-code').value = inviteText(r.invite); toast('Invite reset'); } catch (e) { toast(e.message, true); }
  });
}

function openAddServer() {
  const ov = openLayer(`<div class="dialog modal add-server">
    ${mascot('happy', 'zm-wiggle')}
    <h3>Create a server</h3>
    <p class="muted" style="margin:0 0 16px">Your server is where you and your friends hang out. Make yours and start talking.</p>
    <form id="create-form">
      <label class="field">Server name<input name="name" maxlength="48" value="${esc(state.me.displayName)}'s server" required></label>
      <button class="btn btn-primary btn-block">Create</button>
    </form>
    <div class="or"><span>or</span></div>
    <form id="join-form">
      <label class="field">Join with an invite<input name="code" placeholder="zuno.invite/AbC12xYz" autocomplete="off" spellcheck="false"></label>
      <div class="form-error" id="join-error"></div>
      <div id="join-preview"></div>
      <button class="btn btn-grey btn-block" id="join-btn">Join Server</button>
    </form>
  </div>`);
  const cf = $('#create-form', ov), jf = $('#join-form', ov);
  cf.name.select();
  cf.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const { server } = await api('POST', '/api/servers', { name: cf.name.value });
      state.servers.push(server);
      closeLayer();
      await openServer(server.id);
      burst($(`[data-server="${CSS.escape(server.id)}"]`), 18);
    } catch (err) { toast(err.message, true); }
  });
  let previewTimer;
  jf.code.addEventListener('input', () => {
    clearTimeout(previewTimer);
    $('#join-error', ov).textContent = '';
    previewTimer = setTimeout(async () => {
      const code = parseInvite(jf.code.value);
      if (!code) return ($('#join-preview', ov).innerHTML = '');
      try {
        const r = await api('GET', `/api/invites/${code}`);
        $('#join-preview', ov).innerHTML = `<div class="invite-preview"><span class="rail-btn sv" style="--sv:${esc(r.server.iconColor)}">${serverIcon(r.server)}</span>
          <div><b>${esc(r.server.name)}</b><div class="muted small">${r.server.memberCount} member${r.server.memberCount === 1 ? '' : 's'}${r.joined ? ' · You\'re already in' : ''}</div></div></div>`;
      } catch { $('#join-preview', ov).innerHTML = ''; }
    }, 300);
  });
  jf.addEventListener('submit', async e => {
    e.preventDefault();
    const code = parseInvite(jf.code.value);
    if (!code) return ($('#join-error', ov).textContent = 'Paste an invite, like zuno.invite/AbC12xYz');
    try {
      const { server } = await api('POST', `/api/invites/${code}/join`);
      if (!state.servers.some(s => s.id === server.id)) state.servers.push(server);
      closeLayer();
      await openServer(server.id);
      burst($(`[data-server="${CSS.escape(server.id)}"]`), 18);
    } catch (err) { $('#join-error', ov).textContent = err.message; }
  });
}

function openCreateChannel(sv, type = 'text') {
  const ov = openLayer(`<form class="dialog modal" id="new-ch">
    <h3>Create Channel</h3>
    <div class="ch-types">
      <label class="ch-type"><input type="radio" name="type" value="text"${type === 'text' ? ' checked' : ''}><span class="ch-ico">${ICON.hash}</span><span><b>Text</b><small>Messages, emoji and reactions</small></span></label>
      <label class="ch-type"><input type="radio" name="type" value="voice"${type === 'voice' ? ' checked' : ''}><span class="ch-ico">${ICON.speaker}</span><span><b>Voice</b><small>Hang out with voice, video and screen share</small></span></label>
    </div>
    <label class="field">Channel name<input name="name" maxlength="32" placeholder="${type === 'voice' ? 'Game Night' : 'new-channel'}" required></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Channel</button></div></form>`);
  const f = $('#new-ch', ov);
  f.name.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const { channel } = await api('POST', `/api/servers/${sv.id}/channels`, { name: f.name.value, type: f.type.value });
      closeLayer();
      await refresh({});
      if (channel.type === 'text') openChannel(sv.id, channel.id);
    } catch (err) { toast(err.message, true); }
  });
}

function openChannelSettings(sv, channelId) {
  const ch = sv.channels.find(c => c.id === channelId);
  if (!ch) return;
  const ov = openLayer(`<form class="dialog modal" id="edit-ch">
    <h3>Edit ${ch.type === 'voice' ? 'voice channel' : 'channel'}</h3>
    <label class="field">Channel name<input name="name" maxlength="32" value="${esc(ch.name)}" required></label>
    <div class="actions" style="justify-content:space-between">
      <button type="button" class="btn btn-red btn-sm" data-a="delete">Delete Channel</button>
      <span><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></span></div></form>`);
  const f = $('#edit-ch', ov);
  f.name.select();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('[data-a=delete]', ov).addEventListener('click', () => {
    confirmDialog(`Delete ${ch.type === 'voice' ? '' : '#'}${ch.name}`, 'This deletes the channel and all of its messages. You can\'t undo this.', 'Delete Channel', async () => {
      try { await api('DELETE', `/api/channels/${ch.id}`); } catch (e) { toast(e.message, true); }
    });
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PATCH', `/api/channels/${ch.id}`, { name: f.name.value }); closeLayer(); } catch (err) { toast(err.message, true); }
  });
}

function openServerSettings(sv) {
  const colors = ['#04c5ae', '#3aaefc', '#a37bff', '#ff7b6b', '#f0b232', '#23a55a', '#eb459e', '#e67e22'];
  const ov = openLayer(`<form class="dialog modal server-settings" id="sv-form">
    <h3>Server Settings</h3>
    <div class="sv-edit">
      <div class="sv-icon-edit">
        <span class="rail-btn sv big" id="sv-preview" style="--sv:${esc(sv.iconColor)}">${serverIcon(sv, 80)}</span>
        <button type="button" class="btn btn-grey btn-sm" id="sv-upload">${sv.icon ? 'Change Icon' : 'Upload Icon'}</button>
        ${sv.icon ? '<button type="button" class="btn btn-link small" id="sv-remove-icon">Remove</button>' : ''}
        <input type="file" id="sv-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
      </div>
      <div style="flex:1">
        <label class="field">Server name<input name="name" maxlength="48" value="${esc(sv.name)}" required></label>
        <div class="field">Icon color<div class="sv-colors">${colors.map(c => `<button type="button" class="sv-color${c === sv.iconColor ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
      </div>
    </div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save Changes</button></div></form>`);
  const f = $('#sv-form', ov);
  let color = sv.iconColor;
  $$('[data-color]', ov).forEach(b => b.addEventListener('click', () => {
    color = b.dataset.color;
    $$('[data-color]', ov).forEach(x => x.classList.toggle('on', x === b));
    $('#sv-preview', ov).style.setProperty('--sv', color);
  }));
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('#sv-upload', ov).addEventListener('click', () => $('#sv-file', ov).click());
  $('#sv-file', ov).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await fetch(`/api/servers/${sv.id}/icon`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      closeLayer(); toast('Server icon updated');
    } catch (err) { toast(err.message, true); }
  });
  $('#sv-remove-icon', ov)?.addEventListener('click', async () => { try { await api('DELETE', `/api/servers/${sv.id}/icon`); closeLayer(); } catch (e) { toast(e.message, true); } });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PATCH', `/api/servers/${sv.id}`, { name: f.name.value, iconColor: color }); closeLayer(); toast('Server saved'); } catch (err) { toast(err.message, true); }
  });
}

function leaveServer(sv) {
  confirmDialog(`Leave ${sv.name}`, `Are you sure you want to leave ${sv.name}? You won't be able to rejoin unless you get a new invite.`, 'Leave Server', async () => {
    try { await api('POST', `/api/servers/${sv.id}/leave`); state.servers = state.servers.filter(s => s.id !== sv.id); delete state.serverMembers?.[sv.id]; showFriends('online'); renderRail(); toast(`You left ${sv.name}.`); } catch (e) { toast(e.message, true); }
  });
}
function deleteServer(sv) {
  confirmDialog(`Delete ${sv.name}`, `This deletes ${sv.name}, all its channels and every message in them, for everyone. You can't undo this.`, 'Delete Server', async () => {
    try { await api('DELETE', `/api/servers/${sv.id}`); state.servers = state.servers.filter(s => s.id !== sv.id); showFriends('online'); toast('Server deleted'); } catch (e) { toast(e.message, true); }
  });
}

// Clicking an invite in a message: show the server and a Join button.
async function openInviteLink(code) {
  let r;
  try { r = await api('GET', `/api/invites/${code}`); } catch (e) { return toast(e.message, true); }
  const ov = openLayer(`<div class="dialog modal invite-open">
    <span class="rail-btn sv big" style="--sv:${esc(r.server.iconColor)}">${serverIcon(r.server, 80)}</span>
    <div class="muted small">You've been invited to join</div>
    <h3>${esc(r.server.name)}</h3>
    <div class="muted small">${r.server.memberCount} member${r.server.memberCount === 1 ? '' : 's'}</div>
    <button class="btn btn-primary btn-block" style="margin-top:16px" id="invite-go">${r.joined ? 'Open Server' : 'Join Server'}</button></div>`);
  $('#invite-go', ov).addEventListener('click', async () => {
    try {
      const { server } = await api('POST', `/api/invites/${code}/join`);
      if (!state.servers.some(s => s.id === server.id)) state.servers.push(server);
      closeLayer();
      await openServer(server.id);
      if (!r.joined) burst($(`[data-server="${CSS.escape(server.id)}"]`), 18);
    } catch (e) { toast(e.message, true); }
  });
}
