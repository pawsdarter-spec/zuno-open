'use strict';
// Group DMs: chats with up to 10 friends, no server needed.

const groupById = id => state.groups.find(g => g.id === id);
const groupTitle = g => (!g ? 'Group' : g.name || g.members.filter(u => u.id !== state.me.id).map(u => user(u.id)?.displayName || u.displayName).join(', ') || 'Just you');
function groupIcon(g, size = 32) {
  if (g.icon) return `<div class="avatar group-ico" style="width:${size}px;height:${size}px"><img src="${esc(g.icon)}" alt=""></div>`;
  const others = g.members.filter(u => u.id !== state.me.id).slice(0, 2).map(u => user(u.id) || u);
  if (others.length < 2) return avatar(others[0] || state.me, size);
  const s = Math.round(size * 0.68);
  // Decorations are left off the two small stacked avatars: they collided with each other.
  const plain = u => ({ ...u, decoration: null, communityDeco: null });
  return `<div class="group-stack" style="width:${size}px;height:${size}px">${avatar(plain(others[0]), s)}${avatar(plain(others[1]), s)}</div>`;
}
function groupListItem(g) {
  const active = state.view.type === 'group' && state.view.groupId === g.id;
  return `<button class="dm-item${active ? ' active' : ''}${g.unread ? ' unread' : ''}" data-group="${esc(g.id)}" data-conv="g:${esc(g.id)}">
    ${groupIcon(g, 32)}
    <div class="meta"><div class="name">${esc(groupTitle(g))}</div><div class="sub">${g.members.length} members</div></div>
    ${g.unread ? `<span class="badge">${g.unread > 99 ? '99+' : g.unread}</span>` : ''}</button>`;
}

// ======================= opening a group =======================
async function openGroup(id) {
  closeLayer();
  const g = groupById(id);
  if (!g) return toast('That group is gone.', true);
  if (state.view.type === 'dm') stopProfileSound();
  state.view = { type: 'group', groupId: id };
  state.currentServerId = null;
  setWhere(groupTitle(g));
  $('#app').classList.remove('show-nav');
  const main = $('#main');
  main.innerHTML = chatLayout({
    title: '',
    actions: `<span id="group-call-slot"></span><button class="icon-btn" id="group-voice" title="Start a group call">${ICON.phone}</button><button class="icon-btn" id="group-video" title="Start a video call">${ICON.video}</button>
      <button class="icon-btn" id="group-add" title="Add friends to the group">${ICON.plus}</button><button class="icon-btn" id="toggle-panel" title="Show Members">${ICON.members}</button>`,
    side: `<aside class="profile-panel group-panel${state.showProfilePanel ? '' : ' hidden'}" id="profile-panel"></aside>`,
  });
  wireMobileNav(main);
  $('#toggle-panel').addEventListener('click', () => { state.showProfilePanel = !state.showProfilePanel; $('#profile-panel').classList.toggle('hidden', !state.showProfilePanel); });
  $('#group-add').addEventListener('click', () => openGroupPicker(g));
  $('#group-voice').addEventListener('click', () => Calls.startGroup(id));
  $('#group-video').addEventListener('click', () => Calls.startGroup(id, { video: true }));
  renderGroupCallButton();
  renderDMHeader(); renderComposer(); renderProfilePanel(); renderTyping(); renderSidebar(); renderRail();
  Calls.renderSlot();
  const conv = 'g:' + id;
  markRead(conv);
  await loadConversation(conv);
}
function groupIntro(conv) {
  const g = groupById(conv.slice(2));
  if (!g) return '';
  return `<div class="chat-intro">${groupIcon(g, 80)}<h2>${esc(groupTitle(g))}</h2>
    <div class="muted">Welcome to the beginning of the <b>${esc(groupTitle(g))}</b> group.</div></div>`;
}
function renderGroupHeader(el) {
  const g = groupById(state.view.groupId);
  if (!g) return;
  el.innerHTML = `<span class="on-main" style="display:flex">${groupIcon(g, 24)}</span><span class="group-name-edit" id="group-name" title="Click to rename" tabindex="0">${esc(groupTitle(g))}</span>`;
  const n = $('#group-name', el);
  n.addEventListener('click', () => {
    if (n.isContentEditable) return;
    n.contentEditable = 'true'; n.textContent = g.name || ''; n.dataset.ph = groupTitle({ ...g, name: '' }); n.focus();
    const done = async save => {
      n.contentEditable = 'false';
      const name = n.textContent.trim().slice(0, 48);
      if (save && name !== (g.name || '')) { try { await api('PATCH', `/api/groups/${g.id}`, { name }); } catch (e) { toast(e.message, true); } }
      renderDMHeader();
    };
    n.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    n.onblur = () => done(true);
  });
}
function renderGroupMembers() {
  const el = $('#profile-panel');
  const g = groupById(state.view.groupId);
  if (!el || !g) return;
  const members = g.members.map(u => user(u.id) || u).sort((a, b) => (a.id === g.ownerId ? -1 : b.id === g.ownerId ? 1 : a.displayName.localeCompare(b.displayName)));
  el.innerHTML = `<div class="members">
    <div class="gp-head">${groupIcon(g, 56)}<div><b>${esc(groupTitle(g))}</b><small>${g.members.length} of 10 members</small></div></div>
    <div class="gp-acts"><button class="btn btn-grey btn-sm" data-gp="icon">Change Icon</button><button class="btn btn-grey btn-sm" data-gp="add">Add Friends</button></div>
    <input type="file" id="gp-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
    <div class="list-label">Members — ${g.members.length}</div>
    ${members.map(u => `<button class="member${u.status === 'offline' ? ' off' : ''}" data-gmember="${esc(u.id)}"><span class="on-panel-2">${avatar(u, 32, true)}</span>
      <span class="m-meta"><span class="m-name">${esc(u.displayName)}${u.id === g.ownerId ? `<i class="crown" title="Group Owner">${ICON.crown}</i>` : ''}</span>${activityLine(u) || u.customStatus ? `<span class="m-sub">${activityLine(u) || esc(statusLine(u))}</span>` : ''}</span></button>`).join('')}
    <button class="btn btn-link danger gp-leave" data-gp="leave">Leave Group</button></div>`;
  $$('[data-gmember]', el).forEach(b => {
    b.addEventListener('click', () => openProfile(b.dataset.gmember));
    b.addEventListener('contextmenu', e => { e.preventDefault(); openGroupMemberMenu(g, b.dataset.gmember, atPoint(e)); });
  });
  $('[data-gp=add]', el).addEventListener('click', () => openGroupPicker(g));
  $('[data-gp=icon]', el).addEventListener('click', () => $('#gp-file', el).click());
  $('#gp-file', el).addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'image/gif' && window.openImageEditor) { const blob = await openImageEditor(file, { shape: 'circle', title: 'Adjust the group icon' }); if (!blob) return; file = new File([blob], 'icon.webp', { type: 'image/webp' }); }
    try { const res = await fetch(`/api/groups/${g.id}/icon`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file }); const d = await res.json(); if (!res.ok) throw new Error(d.error); }
    catch (err) { toast(err.message, true); }
  });
  $('[data-gp=leave]', el).addEventListener('click', () => confirmDialog(`Leave ${groupTitle(g)}?`, "You won't get its messages anymore. Someone in the group can add you back.", 'Leave Group', async () => {
    try { await api('DELETE', `/api/groups/${g.id}/members/${state.me.id}`); state.groups = state.groups.filter(x => x.id !== g.id); showFriends('online'); } catch (e) { toast(e.message, true); }
  }));
}
function openGroupMemberMenu(g, id, anchor) {
  const items = [{ label: 'Profile', icon: ico('👤'), run: () => openProfile(id) }];
  if (id !== state.me.id && isFriend(id)) items.push({ label: 'Message', icon: ico('💬'), run: () => openDM(id) });
  if (g.ownerId === state.me.id && id !== state.me.id) {
    items.push('sep', { label: 'Make Group Owner', icon: ico('👑'), run: async () => { try { await api('POST', `/api/groups/${g.id}/owner`, { userId: id }); } catch (e) { toast(e.message, true); } } });
    items.push({ label: 'Remove from Group', danger: true, run: async () => { try { await api('DELETE', `/api/groups/${g.id}/members/${id}`); } catch (e) { toast(e.message, true); } } });
  }
  openMenu(anchor, items);
}

// ======================= making a group / adding friends =======================
function openGroupPicker(g = null, preselect = []) {
  const inGroup = new Set((g?.members || []).map(u => u.id));
  const friends = state.friends.map(user).filter(u => u && !u.bot && !u.system && !inGroup.has(u.id)).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const room = g ? 10 - g.members.length : 9;
  const picked = new Set(preselect.filter(id => friends.some(f => f.id === id)));
  const ov = openLayer(`<div class="dialog modal find-people group-picker"><h3>${g ? 'Add friends to the group' : 'New group chat'}</h3>
    <p class="muted small" style="margin:0 0 10px">${g ? `You can add ${room} more.` : 'Pick 2 to 9 friends. You can name the group and change its icon after.'}</p>
    <input class="qs-input fp-input" placeholder="Search friends" autocomplete="off"><div class="fp-list"></div>
    ${g ? '' : '<label class="field" style="margin-top:10px">Group name <span class="hint">(optional)</span><input id="gp-name" maxlength="48" placeholder="Weekend crew"></label>'}
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="ok" disabled>${g ? 'Add' : 'Create Group'}</button></div></div>`);
  const ok = $('[data-a=ok]', ov);
  const sync = () => { ok.disabled = g ? !picked.size : picked.size < 2; ok.textContent = g ? `Add${picked.size ? ` ${picked.size}` : ''}` : `Create Group${picked.size ? ` (${picked.size + 1})` : ''}`; };
  const draw = q => {
    $('.fp-list', ov).innerHTML = friends.filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q)).map(u => `<label class="fp-row pick">${avatar(u, 32, true)}<div class="fp-who"><b>${esc(u.displayName)}</b><small>${esc(u.username)}</small></div><input type="checkbox" value="${esc(u.id)}"${picked.has(u.id) ? ' checked' : ''}></label>`).join('')
      || `<div class="fp-empty">${friends.length ? 'Nobody matches that.' : g ? 'All your friends are already here.' : 'Add some friends first!'}</div>`;
    $$('.fp-list input', ov).forEach(i => i.addEventListener('change', () => {
      if (i.checked && picked.size >= room) { i.checked = false; return toast(`Groups can have up to 10 people.`, true); }
      i.checked ? picked.add(i.value) : picked.delete(i.value); sync();
    }));
  };
  $('.fp-input', ov).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try {
      if (g) { await api('POST', `/api/groups/${g.id}/members`, { userIds: [...picked] }); closeLayer(); toast('Added to the group'); }
      else {
        const { group } = await api('POST', '/api/groups', { userIds: [...picked], name: $('#gp-name', ov).value.trim() });
        state.groups.push({ ...group, unread: 0, lastMessageAt: Date.now() });
        closeLayer(); openGroup(group.id);
      }
    } catch (e) { toast(e.message, true); ok.disabled = false; }
  });
  draw(''); sync();
  $('.fp-input', ov).focus();
}

// ======================= live updates =======================
function onGroupMessage(conv, payload) {
  const { message } = payload;
  const convo = state.convos[conv];
  if (convo?.loaded && !convo.messages.some(m => m.id === message.id)) {
    const pending = message.authorId === state.me.id && convo.messages.find(m => m.pending && m.content === message.content);
    if (pending) Object.assign(pending, message, { pending: false });
    else convo.messages.push(message);
  }
  const g = groupById(conv.slice(2));
  if (g) { g.lastMessageAt = message.createdAt; if (typeof messagePreview48 === 'function') g.last = messagePreview48(message); }
  if (message.authorId !== state.me.id) {
    if (state.typing[conv]) delete state.typing[conv][message.authorId];
    const viewing = activeConv() === conv && !document.hidden;
    if (viewing) api('POST', `${convBase(conv)}/read`).catch(() => {});
    else if (g) g.unread = (g.unread || 0) + 1;
    if (!viewing && !message.note && state.me.statusPref !== 'dnd' && !isMuted('g:' + g?.id)) {
      if (prefs().notificationSound) playPing();
      if ('Notification' in window && prefs().desktopNotifications && Notification.permission === 'granted') {
        const a = user(message.authorId);
        const n = new Notification(`${a?.displayName || 'Someone'} (${groupTitle(g)})`, { body: (message.content || 'Sent something').slice(0, 200), icon: g?.icon || a?.avatar || '/logo.png', tag: 'g:' + g?.id });
        n.onclick = () => { window.zunoDesktop?.focus(); window.focus(); openGroup(g.id); n.close(); setTimeout(() => $('#composer-input')?.focus(), 500); };
      }
    }
  }
  renderDMList();
  if (activeConv() === conv) { renderMessagesSoon(); renderTyping(); }
}
// Leaving, being removed, renames and new members come in as "refresh".
const _refreshG = refresh;
refresh = async function (info = {}) {
  await _refreshG(info);
  if (state.view.type === 'group') {
    if (!groupById(state.view.groupId)) { if (info.removed) toast("You're no longer in that group.", true); return showFriends('online'); }
    renderDMHeader(); renderGroupMembers(); setWhere(groupTitle(groupById(state.view.groupId)));
  }
};

// A call going on in the group you're looking at (and you're not in it): a green Join button.
function renderGroupCallButton() {
  const slot = $('#group-call-slot');
  if (!slot || state.view.type !== 'group') return;
  const g = groupById(state.view.groupId);
  const inCall = (g?.call || []).filter(id => id !== state.me.id);
  const joined = Calls.room === 'gc:' + g?.id;
  slot.innerHTML = inCall.length && !joined ? `<button class="btn btn-green btn-sm join-call-btn" id="group-join">${ICON.phone} Join Call · ${inCall.length}</button>` : '';
  $('#group-join', slot)?.addEventListener('click', () => Calls.startGroup(g.id));
}

// "New Group" next to Direct Messages, and from a friend's right-click menu.
const _renderSidebarG = renderSidebar;
renderSidebar = function () {
  _renderSidebarG();
  const label = $('#sidebar-scroll .dm-label');
  if (label && !$('#group-new', label)) {
    const b = document.createElement('button');
    b.className = 'sec-add'; b.id = 'group-new'; b.title = 'New group chat'; b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>';
    $('#dm-new', label)?.before(b);
    b.addEventListener('click', () => openGroupPicker());
  }
};
