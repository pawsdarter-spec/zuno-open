'use strict';
// Servers, part two: categories in the channel list, right-click menus for servers, categories and
// channels, and the Server Settings page. Roles, permissions, audit log and integrations live in roles.js.

// ---- permissions (the server decides; these only choose what to show) ----
const svPerms = sv => new Set(sv?.myPerms || []);
const hasPerm = (sv, p) => svPerms(sv).has(p);
const chHas = (ch, p) => (ch?.perms || []).includes(p);
const canManage = sv => hasPerm(sv, 'manage_messages');
const SETTINGS_PERMS = ['manage_server', 'manage_channels', 'manage_roles', 'kick_members', 'ban_members', 'view_audit_log', 'manage_integrations', 'manage_invites'];
const canOpenSettings = sv => isOwner(sv) || SETTINGS_PERMS.some(p => hasPerm(sv, p));
function chOverrides(sv, ch) {
  if (ch.categoryId && ch.synced !== false) { const cat = (sv.categories || []).find(c => c.id === ch.categoryId); if (cat) return cat.overrides || []; }
  return ch.overrides || [];
}
const isPrivateCh = (sv, ch) => (chOverrides(sv, ch).find(o => o.id === sv.id)?.deny || []).includes('view_channels');

const svById = id => state.servers.find(s => s.id === id);
const collapsedCats = (() => { try { return JSON.parse(localStorage.getItem('zuno_collapsed') || '{}'); } catch { return {}; } })();
const saveCollapsed = () => { try { localStorage.setItem('zuno_collapsed', JSON.stringify(collapsedCats)); } catch {} };
const SLOWMODE_LABEL = { 0: 'Off', 5: '5 seconds', 10: '10 seconds', 15: '15 seconds', 30: '30 seconds', 60: '1 minute', 120: '2 minutes', 300: '5 minutes', 600: '10 minutes', 900: '15 minutes', 1800: '30 minutes', 3600: '1 hour', 7200: '2 hours', 21600: '6 hours' };
const atPoint = e => ({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) });
const ico = c => `<span class="mi-ico">${c}</span>`;
const copyText = (t, what) => { navigator.clipboard.writeText(t); toast(`${what} copied`); };
const LOCK = '<svg viewBox="0 0 24 24" width="11" height="11" class="ch-lock"><path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3ZM9 7a3 3 0 0 1 6 0v2H9Z"/></svg>';

// ======================= channel list with categories =======================
renderServerSidebar = function () {
  const sv = currentServer();
  if (!sv) return;
  const side = $('#sidebar');
  side.dataset.mode = 'server';
  side.style.setProperty('--sv-accent', sv.accentColor || 'var(--brand)');
  side.classList.toggle('has-sv-accent', !!sv.accentColor);
  $('#sidebar-top').innerHTML = `<button class="server-head${sv.banner || sv.bannerColor ? ' over-banner' : ''}" id="server-head">${sv.official || sv.verified ? '<span class="official" style="margin:0 6px 0 0">✓ Official</span>' : ''}${sv.partnered ? partnerMark('icon', 'sh') : ''}<span class="sh-name">${esc(sv.name)}</span><span class="chev">${ICON.chevron}</span></button>`;
  $('#server-head').addEventListener('click', e => openServerMenu(e.currentTarget, sv));
  const mc = hasPerm(sv, 'manage_channels');
  const activeId = state.view.channelId;
  const voiceUsers = id => sv.voice?.[id] || [];
  const gear = c => (chHas(c, 'manage_channels') || chHas(c, 'manage_roles') ? `<span class="ch-gear" data-edit-ch="${esc(c.id)}" title="Edit Channel">${ICON.gear}</span>` : '');
  const lock = c => (isPrivateCh(sv, c) ? LOCK : '');
  const chItem = c => c.type === 'voice'
    ? `<button class="ch-item voice${Calls.room === 'vc:' + c.id ? ' connected' : ''}${c.id === activeId ? ' active' : ''}" data-ch="${esc(c.id)}">
        <span class="ch-ico">${ICON.speaker}${lock(c)}</span><span class="ch-name">${esc(c.name)}</span>
        ${c.userLimit ? `<span class="ch-limit">${voiceUsers(c.id).length}/${Number(c.userLimit) || 0}</span>` : ''}<span class="ch-vchat" data-vchat="${esc(c.id)}" title="Open the chat">${ICON.chat || '💬'}</span>${gear(c)}</button>
        ${voiceUsers(c.id).length ? `<div class="voice-users">${voiceUsers(c.id).map(id => {
          const u = user(id) || { id, displayName: '…' };
          const st = Calls.peerState(id);
          return `<div class="voice-user${Calls.isSpeaking(id) ? ' speaking' : ''}" data-vu="${esc(id)}" data-speak="${esc(id)}">${avatar(u, 22)}<span${nameStyle(u)}>${esc(nameIn(u, sv))}</span>${st?.muted ? `<i class="vu-ico">${ICON.micOff}</i>` : ''}${st?.deafened ? `<i class="vu-ico">${ICON.deafen}</i>` : ''}${st?.screen ? '<i class="live">LIVE</i>' : ''}</div>`;
        }).join('')}</div>` : ''}`
    : `<button class="ch-item${c.id === activeId ? ' active' : ''}${c.unread ? ' unread' : ''}" data-ch="${esc(c.id)}" title="${esc(c.topic || '')}">
        <span class="ch-ico">${c.readOnly ? '<span class="ch-ann">📢</span>' : ICON.hash}${lock(c)}</span><span class="ch-name">${esc(c.name)}</span>
        ${c.slowmode ? '<span class="ch-flag" title="Slowmode">🐢</span>' : ''}
        ${c.unread && c.mentions ? `<span class="badge">${c.mentions > 99 ? '99+' : c.mentions}</span>` : ''}${gear(c)}</button>`;
  const cats = sv.categories || [];
  const loose = sv.channels.filter(c => !c.categoryId || !cats.some(k => k.id === c.categoryId));
  let html = '';
  if (sv.banner || sv.bannerColor) html += `<div class="sv-banner" style="${sv.bannerColor ? `--bc:${esc(sv.bannerColor)};` : ''}">${sv.banner ? `<img src="${esc(sv.banner)}" alt="">` : ''}</div>`;
  html += loose.map(chItem).join('');
  for (const cat of cats) {
    const inCat = sv.channels.filter(c => c.categoryId === cat.id);
    if (!inCat.length && !mc) continue;
    const closed = collapsedCats[cat.id];
    const shown = closed ? inCat.filter(c => c.id === activeId || c.unread || (c.type === 'voice' && voiceUsers(c.id).length)) : inCat;
    const catPrivate = (cat.overrides || []).find(o => o.id === sv.id)?.deny?.includes('view_channels');
    html += `<div class="cat-head${closed ? ' closed' : ''}" data-cat="${esc(cat.id)}"><span class="cat-chev">${ICON.chevron}</span><span class="cat-name">${esc(cat.name)}</span>${catPrivate ? LOCK : ''}
      ${mc ? `<button class="sec-add" data-new-in="${esc(cat.id)}" title="Create Channel">${ICON.plus}</button>` : ''}</div>${shown.map(chItem).join('')}`;
  }
  if (!sv.channels.length) html += '<div class="muted small" style="padding:12px">No channels you can see yet.</div>';
  if (mc && !cats.length) html += `<button class="ch-add-hint" data-new-cat>${ICON.plus} Create a category</button>`;
  $('#sidebar-scroll').innerHTML = html;

  const scroll = $('#sidebar-scroll');
  $$('[data-ch]', scroll).forEach(b => {
    b.addEventListener('click', e => { if (!e.target.closest('[data-edit-ch]')) openChannel(sv.id, b.dataset.ch); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); openChannelMenu(sv, b.dataset.ch, atPoint(e)); });
  });
  $$('[data-edit-ch]', scroll).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openServerSettings(sv, 'channels', b.dataset.editCh); }));
  $$('[data-cat]', scroll).forEach(h => {
    h.addEventListener('click', e => {
      if (e.target.closest('[data-new-in]')) return;
      collapsedCats[h.dataset.cat] = !collapsedCats[h.dataset.cat]; saveCollapsed(); renderServerSidebar();
    });
    h.addEventListener('contextmenu', e => { e.preventDefault(); openCategoryMenu(sv, h.dataset.cat, atPoint(e)); });
  });
  $$('[data-new-in]', scroll).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openCreateChannel(sv, 'text', b.dataset.newIn); }));
  $('[data-new-cat]', scroll)?.addEventListener('click', () => openCreateCategory(sv));
  $$('[data-vu]', scroll).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.vu)));
  scroll.oncontextmenu = e => { if ((e.target === scroll || e.target.closest('.sv-banner')) && mc) { e.preventDefault(); openMenu(atPoint(e), [{ label: 'Create Channel', icon: ico('➕'), run: () => openCreateChannel(sv) }, { label: 'Create Category', icon: ico('📁'), run: () => openCreateCategory(sv) }]); } };
};

// ======================= right-click menus =======================
function markServerRead(sv) {
  // (0.39) Every kind of channel (forums, announcements, media…), not just text ones: an unread forum
  // kept the server's dot on forever.
  for (const c of sv.channels) if (c.unread) { if (c.type === 'voice') c.unread = false; else markRead('ch:' + c.id); }
  renderRail(); if (state.currentServerId === sv.id) renderServerSidebar();
}
openServerMenu = function (anchor, sv = currentServer()) {
  if (!sv) return;
  const owner = isOwner(sv);
  const items = [];
  if (sv.channels.some(c => c.unread)) items.push({ label: 'Mark As Read', icon: ico('✔️'), run: () => markServerRead(sv) });
  if (hasPerm(sv, 'create_invites')) items.push({ label: 'Invite People', icon: ico('💌'), run: () => openInvite(sv) });
  if (typeof openEvents === 'function') items.push({ label: sv.liveEvent ? `Events · Live now` : sv.eventCount ? `Events (${sv.eventCount})` : 'Events', icon: ico('📅'), run: () => openEvents(sv.id) });
  if (canOpenSettings(sv)) items.push({ label: 'Server Settings', icon: ico('⚙️'), run: () => openServerSettings(sv) });
  if (hasPerm(sv, 'manage_channels')) {
    items.push({ label: 'Create Channel', icon: ico('➕'), run: () => openCreateChannel(sv) });
    items.push({ label: 'Create Category', icon: ico('📁'), run: () => openCreateCategory(sv) });
  }
  if (hasPerm(sv, 'manage_integrations')) items.push({ label: 'Add a Bot', icon: ico('🤖'), run: () => openServerSettings(sv, 'integrations') });
  items.push({ label: 'Copy Server ID', icon: ico('#️⃣'), run: () => copyText(sv.id, 'Server ID') });
  if (!sv.official) {
    items.push('sep');
    items.push(owner ? { label: 'Delete Server', danger: true, run: () => deleteServer(sv) } : { label: 'Leave Server', danger: true, run: () => leaveServer(sv) });
  }
  openMenu(anchor, items);
  if (anchor instanceof Element) $('.menu').style.minWidth = anchor.offsetWidth + 'px';
};
document.addEventListener('contextmenu', e => {
  const b = e.target.closest('#server-rail [data-server]');
  if (!b) return;
  e.preventDefault();
  openServerMenu(atPoint(e), svById(b.dataset.server));
});
function openChannelMenu(sv, chId, anchor) {
  const ch = sv.channels.find(c => c.id === chId);
  if (!ch) return;
  const items = [];
  if (ch.type !== 'voice' && ch.unread) items.push({ label: 'Mark As Read', icon: ico('✔️'), run: () => { markRead('ch:' + ch.id); renderServerSidebar(); renderRail(); } });
  items.push({ label: ch.type === 'voice' ? 'Join Voice' : 'Open Channel', icon: ico(ch.type === 'voice' ? '🔊' : '💬'), run: () => openChannel(sv.id, ch.id) });
  if (chHas(ch, 'create_invites') && ch.type === 'text') items.push({ label: 'Invite to Channel', icon: ico('💌'), run: () => openInvite(sv, ch.id) });
  if (chHas(ch, 'manage_channels')) items.push({ label: 'Edit Channel', icon: ico('✏️'), run: () => openServerSettings(sv, 'channels', ch.id) });
  if (chHas(ch, 'manage_roles')) items.push({ label: 'Permissions', icon: ico('🔐'), run: () => openPermEditor(sv, { kind: 'channel', id: ch.id }) });
  items.push({ label: 'Copy Channel ID', icon: ico('#️⃣'), run: () => copyText(ch.id, 'Channel ID') });
  if (chHas(ch, 'manage_channels')) items.push('sep', { label: 'Delete Channel', danger: true, run: () => confirmDeleteChannel(ch) });
  openMenu(anchor, items);
}
function openCategoryMenu(sv, catId, anchor) {
  const cat = (sv.categories || []).find(c => c.id === catId);
  if (!cat) return;
  const mc = hasPerm(sv, 'manage_channels');
  const items = [{ label: collapsedCats[catId] ? 'Expand Category' : 'Collapse Category', icon: ico(collapsedCats[catId] ? '🔽' : '🔼'), run: () => { collapsedCats[catId] = !collapsedCats[catId]; saveCollapsed(); renderServerSidebar(); } }];
  items.push({ label: 'Collapse All', icon: ico('⏫'), run: () => { for (const c of sv.categories) collapsedCats[c.id] = true; saveCollapsed(); renderServerSidebar(); } });
  if (mc) items.push({ label: 'Create Channel', icon: ico('➕'), run: () => openCreateChannel(sv, 'text', catId) }, { label: 'Edit Category', icon: ico('✏️'), run: () => openServerSettings(sv, 'channels') });
  if (hasPerm(sv, 'manage_roles')) items.push({ label: 'Permissions', icon: ico('🔐'), run: () => openPermEditor(sv, { kind: 'category', id: catId }) });
  if (mc) items.push('sep', { label: 'Delete Category', danger: true, run: () => confirmDeleteCategory(sv, cat) });
  openMenu(anchor, items);
}
function confirmDeleteChannel(ch) {
  confirmDialog(`Delete ${ch.type === 'voice' ? '' : '#'}${ch.name}`, "This deletes the channel and all of its messages. You can't undo this.", 'Delete Channel', async () => {
    try { await api('DELETE', `/api/channels/${ch.id}`); toast('Channel deleted'); } catch (e) { toast(e.message, true); }
  });
}
function confirmDeleteCategory(sv, cat) {
  confirmDialog(`Delete ${cat.name}`, 'The category is removed. Its channels stay (with the same permissions) and move to the top of the list.', 'Delete Category', async () => {
    try { await api('DELETE', `/api/servers/${sv.id}/categories/${cat.id}`); toast('Category deleted'); } catch (e) { toast(e.message, true); }
  });
}

// ======================= create channel / category =======================
const privateToggle = (sv, what) => `<label class="setting-row sc-priv"><div><div class="setting-title">${LOCK} Private ${what}</div><div class="setting-desc">Only the roles you pick (and you) can see it.</div></div><input type="checkbox" class="switch" name="private"></label>
  <div class="priv-roles hidden">${(sv.roles || []).filter(r => !r.everyone && !r.managed).map(r => `<label class="priv-role"><input type="checkbox" value="${esc(r.id)}"><span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span>${esc(r.name)}</label>`).join('') || '<span class="muted small">No roles yet. Make some in Server Settings › Roles.</span>'}</div>`;
function wirePrivateToggle(ov) {
  const t = $('[name=private]', ov), box = $('.priv-roles', ov);
  t?.addEventListener('change', () => box.classList.toggle('hidden', !t.checked));
  return () => (t?.checked ? $$('.priv-roles input:checked', ov).map(i => i.value) : null);
}
openCreateChannel = function (sv, type = 'text', categoryId = null) {
  const cats = sv.categories || [];
  const ov = openLayer(`<form class="dialog modal" id="new-ch">
    <h3>Create Channel</h3>
    <div class="ch-types">
      <label class="ch-type"><input type="radio" name="type" value="text"${type === 'text' ? ' checked' : ''}><span class="ch-ico">${ICON.hash}</span><span><b>Text</b><small>Messages, emoji, GIFs and files</small></span></label>
      <label class="ch-type"><input type="radio" name="type" value="voice"${type === 'voice' ? ' checked' : ''}><span class="ch-ico">${ICON.speaker}</span><span><b>Voice</b><small>Hang out with voice, video and screen share</small></span></label>
    </div>
    <label class="field">Channel name<input name="name" maxlength="32" placeholder="new-channel" required></label>
    ${cats.length ? `<label class="field">Category<select name="categoryId" class="sc-select"><option value="">No category</option>${cats.map(c => `<option value="${esc(c.id)}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <label class="setting-row sc-ro"><div><div class="setting-title">Announcement channel</div><div class="setting-desc">Only people who can manage messages can post. Everyone else can read and react.</div></div><input type="checkbox" class="switch" name="readOnly"></label>
    ${privateToggle(sv, 'channel')}
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Channel</button></div></form>`);
  const f = $('#new-ch', ov);
  const roles = wirePrivateToggle(ov);
  const syncType = () => { $('.sc-ro', ov).style.display = f.type.value === 'voice' ? 'none' : ''; f.name.placeholder = f.type.value === 'voice' ? 'Game Night' : 'new-channel'; };
  f.addEventListener('change', syncType); syncType();
  f.name.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const picked = roles();
    try {
      const { channel } = await api('POST', `/api/servers/${sv.id}/channels`, { name: f.name.value, type: f.type.value, categoryId: f.categoryId?.value || null, readOnly: f.type.value === 'text' && f.readOnly.checked, private: !!picked, roles: picked || [] });
      closeLayer();
      if (channel.categoryId) { collapsedCats[channel.categoryId] = false; saveCollapsed(); }
      await refresh({});
      if (channel.type === 'text') openChannel(sv.id, channel.id);
    } catch (err) { toast(err.message, true); }
  });
};
function openCreateCategory(sv, after) {
  const ov = openLayer(`<form class="dialog modal" id="new-cat"><h3>Create Category</h3>
    <p class="muted small" style="margin:-4px 0 12px">Categories group channels together, like INFO or GAMING. Channels in a category share its permissions.</p>
    <label class="field">Category name<input name="name" maxlength="32" placeholder="New category" required></label>
    <label class="setting-row"><div><div class="setting-title">${LOCK} Private category</div><div class="setting-desc">Hidden from @everyone. Give roles access in its Permissions.</div></div><input type="checkbox" class="switch" name="private"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Category</button></div></form>`);
  const f = $('#new-cat', ov);
  f.name.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('POST', `/api/servers/${sv.id}/categories`, { name: f.name.value, private: f.private.checked }); closeLayer(); await refresh({}); after?.(); toast('Category created'); }
    catch (err) { toast(err.message, true); }
  });
}
openChannelSettings = (sv, channelId) => openServerSettings(sv, 'channels', channelId);

// ======================= Server Settings page =======================
let svSettings = null; // { id, section, openCh }
// Each section, who can see it, and words people might search for to find it.
const SS_SECTIONS = [
  { group: 'Server', key: 'overview', label: 'Overview', need: 'manage_server', words: 'name icon description welcome messages channel rules transfer ownership' },
  { group: 'Server', key: 'appearance', label: 'Banner & Look', need: 'manage_server', words: 'banner color accent theme picture header custom invite vanity' },
  { group: 'Server', key: 'discovery', label: 'Discovery', need: 'manage_server', words: 'discover public listed tags find search explore' },
  { group: 'Server', key: 'safety', label: 'Safety', need: 'manage_server', words: 'verification account age raid pause invites safety security spam' },
  { group: 'Roles & Channels', key: 'roles', label: 'Roles', need: 'manage_roles', words: 'roles permissions colors hoist mention administrator moderator order' },
  { group: 'Roles & Channels', key: 'channels', label: 'Channels & Categories', need: 'manage_channels', words: 'channels categories slowmode topic announcement voice limit order private permissions overrides sync' },
  { group: 'People', key: 'members', label: 'Members', need: ['kick_members', 'ban_members', 'manage_roles'], words: 'members kick roles search' },
  { group: 'People', key: 'invites', label: 'Invites', need: 'create_invites', words: 'invites links expire uses pause reset' },
  { group: 'People', key: 'bans', label: 'Bans', need: 'ban_members', words: 'bans unban banned' },
  { group: 'Moderation', key: 'audit', label: 'Audit Log', need: 'view_audit_log', words: 'audit log history who changed actions' },
  { group: 'Apps', key: 'integrations', label: 'Bots & Webhooks', need: 'manage_integrations', words: 'bots apps integrations webhooks commands developer' },
];
// Individual settings, so searching "slowmode" jumps right to it.
const SS_SETTINGS = [
  ['overview', 'Server name'], ['overview', 'Server icon'], ['overview', 'Description'], ['overview', 'Welcome messages'], ['overview', 'Rules channel'], ['overview', 'Transfer ownership'],
  ['appearance', 'Server banner'], ['appearance', 'Banner color'], ['appearance', 'Accent color'], ['appearance', 'Custom invite link'],
  ['discovery', 'Show in Discover'], ['discovery', 'Discovery tags'], ['safety', 'Minimum account age'], ['safety', 'Pause invites'],
  ['channels', 'Slowmode'], ['channels', 'Channel topic'], ['channels', 'Announcement channel'], ['channels', 'Voice user limit'], ['channels', 'Channel permissions'], ['channels', 'Category permissions'], ['channels', 'Private channels'],
  ['roles', 'Role color'], ['roles', 'Role icon'], ['roles', 'Display separately'], ['roles', 'Mentionable roles'], ['roles', 'Role permissions'], ['roles', 'Role order'], ['roles', 'Administrator'],
  ['invites', 'Invite expiry'], ['invites', 'Max uses'], ['invites', 'Reset invite'], ['bans', 'Unban'], ['audit', 'Filter by action'], ['integrations', 'Add a bot'], ['integrations', 'Create webhook'],
];
const sectionAllowed = (sv, s) => isOwner(sv) || [].concat(s.need).some(p => hasPerm(sv, p));
openServerSettings = function (sv, section, openCh = null) {
  closeLayer();
  const owner = isOwner(sv);
  const allowed = SS_SECTIONS.filter(s => sectionAllowed(sv, s));
  if (!allowed.length) return toast("You don't have permission to change this server's settings.", true);
  if (!allowed.some(s => s.key === section)) section = allowed[0].key;
  svSettings = { id: sv.id, section, openCh };
  const el = document.createElement('div');
  el.className = 'settings server-settings-page';
  const groups = [...new Set(allowed.map(s => s.group))];
  el.innerHTML = `
    <div class="settings-nav"><div>
      <div class="ss-head">${sv.icon ? `<img src="${esc(sv.icon)}" alt="">` : `<span class="ss-head-ico" style="--sv:${esc(sv.iconColor)}">${esc([...sv.name][0] || '?')}</span>`}<h5 class="sv-nav-name">${esc(sv.name)}</h5></div>
      <div class="ss-search"><input id="ss-q" placeholder="Search settings" autocomplete="off" spellcheck="false"><kbd>/</kbd></div>
      <div id="ss-results" class="hidden"></div>
      <div id="ss-navlist">${groups.map(g => `<h5 class="ss-group">${esc(g)}</h5>${allowed.filter(s => s.group === g).map(s => `<button data-ss="${s.key}">${s.label}</button>`).join('')}`).join('')}
      ${owner && !sv.official ? '<div class="sep"></div><button data-ss="delete" style="color:#fa777c">Delete Server</button>' : ''}</div>
    </div></div>
    <div class="settings-main"><div id="ss-body"></div></div>
    <button class="settings-close" id="ss-close"><span>✕</span>ESC</button>`;
  $('#layer').appendChild(el);
  $$('#ss-navlist [data-ss]', el).forEach(b => b.addEventListener('click', () => b.dataset.ss === 'delete' ? deleteServer(svById(sv.id)) : showServerSection(b.dataset.ss)));
  $('#ss-close').addEventListener('click', closeLayer);
  wireSettingsSearch(el, sv, allowed);
  showServerSection(section, openCh);
};
function wireSettingsSearch(el, sv, allowed) {
  const q = $('#ss-q', el), out = $('#ss-results', el), nav = $('#ss-navlist', el);
  const keys = new Set(allowed.map(s => s.key));
  const label = k => allowed.find(s => s.key === k)?.label || k;
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    out.classList.toggle('hidden', !t); nav.classList.toggle('hidden', !!t);
    if (!t) return;
    const hits = [
      ...SS_SETTINGS.filter(([k, l]) => keys.has(k) && l.toLowerCase().includes(t)).map(([k, l]) => ({ k, l, sub: label(k) })),
      ...allowed.filter(s => s.label.toLowerCase().includes(t) || s.words.includes(t)).map(s => ({ k: s.key, l: s.label, sub: s.group })),
    ].filter((h, i, a) => a.findIndex(x => x.k === h.k && x.l === h.l) === i).slice(0, 12);
    out.innerHTML = hits.length ? hits.map(h => `<button class="ss-hit" data-go="${h.k}" data-find="${esc(h.l)}"><b>${esc(h.l)}</b><small>${esc(h.sub)}</small></button>`).join('') : '<div class="fp-empty">No settings match that.</div>';
    $$('[data-go]', out).forEach(b => b.addEventListener('click', async () => {
      q.value = ''; out.classList.add('hidden'); nav.classList.remove('hidden');
      // Channel settings live in a channel's editor, so open the first one.
      if (b.dataset.go === 'channels' && /slowmode|topic|announcement|limit/i.test(b.dataset.find)) {
        const s = svById(sv.id); const want = /limit/i.test(b.dataset.find) ? 'voice' : 'text';
        svSettings.openCh = s.channels.find(c => c.type === want)?.id || null;
      }
      await showServerSection(b.dataset.go);
      flashSetting(b.dataset.find);
    }));
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') $('[data-go]', out)?.click(); if (e.key === 'Escape') { e.stopPropagation(); q.value = ''; q.dispatchEvent(new Event('input')); } });
  el.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); q.focus(); } });
  document.addEventListener('keydown', function slash(e) {
    if (!el.isConnected) return document.removeEventListener('keydown', slash);
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); q.focus(); }
  });
}
// Scroll to and glow the setting whose title matches.
function flashSetting(text) {
  const t = text.toLowerCase();
  const el = $$('#ss-body .setting-title, #ss-body .field, #ss-body h4, #ss-body h2, #ss-body .re-perm b').find(n => n.textContent.trim().toLowerCase().startsWith(t.split(' ')[0]) && n.textContent.toLowerCase().includes(t.split(' ').pop()));
  const row = el?.closest('.setting-row, .field, .re-perm, .setting-group') || el;
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('ss-flash'); void row.offsetWidth; row.classList.add('ss-flash');
}
async function showServerSection(section, openCh = null) {
  const sv = svById(svSettings?.id);
  const body = $('#ss-body');
  if (!sv || !body) return;
  svSettings.section = section;
  if (openCh !== null) svSettings.openCh = openCh;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  const fn = { overview: ssOverview, appearance: ssAppearance, discovery: ssDiscovery, safety: ssSafety, roles: ssRoles, channels: ssChannels, members: ssMembers, invites: ssInvites, bans: ssBans, audit: ssAudit, integrations: ssIntegrations }[section];
  if (fn) return fn(body, sv);
}
// Re-draw the open settings page when the server changes (from you or someone else).
const _refreshForSettings = refresh;
refresh = async function (info = {}) {
  await _refreshForSettings(info);
  if (svSettings && $('.server-settings-page')) {
    if (!svById(svSettings.id)) return closeLayer();
    const active = document.activeElement;
    if (active && active.closest?.('#ss-body') && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return; // don't interrupt typing
    if ($('#ss-body [data-keep]')) return; // a section that redraws itself
    showServerSection(svSettings.section);
  }
};
const ssToggle = (name, title, desc, on) => `<label class="setting-row"><div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div><input type="checkbox" class="switch" name="${name}"${on ? ' checked' : ''}></label>`;
async function uploadServerImage(sv, kind, file) {
  if (file.type !== 'image/gif' && window.openImageEditor) {
    const blob = await openImageEditor(file, { shape: kind === 'banner' ? 'banner' : 'circle', title: kind === 'banner' ? 'Adjust the server banner' : 'Adjust the server icon' });
    if (!blob) return;
    file = new File([blob], kind + '.webp', { type: 'image/webp' });
  }
  try {
    const res = await fetch(`/api/servers/${sv.id}/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
    const d = await res.json(); if (!res.ok) throw new Error(d.error);
    toast(kind === 'banner' ? 'Banner updated' : 'Server icon updated'); await refresh({});
  } catch (err) { toast(err.message, true); }
}

function ssOverview(body, sv) {
  const colors = ['#04c5ae', '#3aaefc', '#a37bff', '#ff7b6b', '#f0b232', '#23a55a', '#eb459e', '#e67e22'];
  const text = sv.channels.filter(c => c.type === 'text');
  const owner = isOwner(sv);
  body.innerHTML = `<h2>Server Overview</h2>
    <form id="ss-ov">
      <div class="sv-edit">
        <div class="sv-icon-edit">
          <span class="rail-btn sv big" id="sv-preview" style="--sv:${esc(sv.iconColor)}">${serverIcon(sv, 80)}</span>
          <button type="button" class="btn btn-grey btn-sm" id="sv-upload">${sv.icon ? 'Change Icon' : 'Upload Icon'}</button>
          ${sv.icon ? '<button type="button" class="btn btn-link small" id="sv-remove-icon">Remove</button>' : ''}
          <input type="file" id="sv-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
        </div>
        <div style="flex:1;min-width:0">
          <label class="field">Server name<input name="name" maxlength="48" value="${esc(sv.name)}" required></label>
          <div class="field">Icon color<div class="sv-colors">${colors.map(c => `<button type="button" class="sv-color${c === sv.iconColor ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
        </div>
      </div>
      <label class="field">Description <span class="hint">(shown on invites and in Discover)</span><textarea name="description" maxlength="300" placeholder="What's this server about?">${esc(sv.description || '')}</textarea></label>
      <div class="setting-group"><h4 class="setting-head">Welcome messages</h4>
        ${ssToggle('welcomeMessages', 'Say hi when someone joins', 'Zuno posts a message when a new member joins.', sv.welcomeMessages)}
        <label class="field" style="margin-top:10px">Welcome channel<select name="welcomeChannelId" class="sc-select"><option value="">The first text channel</option>${text.map(c => `<option value="${esc(c.id)}"${c.id === sv.welcomeChannelId ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">Rules channel <span class="hint">(its pinned rules show up in Discover)</span><select name="rulesChannelId" class="sc-select"><option value="">None</option>${text.map(c => `<option value="${esc(c.id)}"${c.id === sv.rulesChannelId ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <button class="btn btn-primary" style="margin-top:8px">Save Changes</button>
    </form>
    ${owner && !sv.official ? `<div class="setting-group danger-zone"><h4 class="setting-head">Danger zone</h4>
      <div class="setting-row"><div><div class="setting-title">Transfer ownership</div><div class="setting-desc">Make someone else the owner. You'll stay in the server with your roles.</div></div><button class="btn btn-grey btn-sm" id="sv-transfer">Transfer</button></div></div>` : ''}`;
  const f = $('#ss-ov', body);
  let color = sv.iconColor;
  $$('[data-color]', body).forEach(b => b.addEventListener('click', () => { color = b.dataset.color; $$('[data-color]', body).forEach(x => x.classList.toggle('on', x === b)); $('#sv-preview', body).style.setProperty('--sv', color); }));
  $('#sv-upload', body).addEventListener('click', () => $('#sv-file', body).click());
  $('#sv-file', body).addEventListener('change', e => e.target.files[0] && uploadServerImage(sv, 'icon', e.target.files[0]));
  $('#sv-remove-icon', body)?.addEventListener('click', async () => { try { await api('DELETE', `/api/servers/${sv.id}/icon`); await refresh({}); } catch (e) { toast(e.message, true); } });
  $('#sv-transfer', body)?.addEventListener('click', () => openTransferOwnership(sv));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('PATCH', `/api/servers/${sv.id}`, { name: f.name.value, iconColor: color, description: f.description.value, welcomeMessages: f.welcomeMessages.checked, welcomeChannelId: f.welcomeChannelId.value || null, rulesChannelId: f.rulesChannelId.value || null });
      toast('Server saved'); burst(e.submitter || f, 12); document.activeElement?.blur(); await refresh({});
    } catch (err) { toast(err.message, true); }
  });
}
async function openTransferOwnership(sv) {
  await loadServerMembers(sv.id);
  const people = (state.serverMembers[sv.id] || []).map(user).filter(u => u && !u.bot && u.id !== state.me.id);
  const ov = openLayer(`<form class="dialog modal"><h3>Transfer ownership</h3>
    <p class="muted" style="margin:0 0 12px">The new owner can do everything, including deleting the server. This can only be undone by them.</p>
    <label class="field">New owner<select name="userId" class="sc-select" required><option value="">Pick someone</option>${people.map(u => `<option value="${esc(u.id)}">${esc(u.displayName)} (${esc(u.username)})</option>`).join('')}</select></label>
    <label class="field">Type the server name to confirm<input name="confirm" placeholder="${esc(sv.name)}" autocomplete="off"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red">Transfer</button></div></form>`);
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f.confirm.value.trim() !== sv.name) return toast('Type the server name exactly to confirm.', true);
    try { await api('POST', `/api/servers/${sv.id}/transfer`, { userId: f.userId.value }); closeLayer(); toast('Ownership transferred'); await refresh({}); } catch (err) { toast(err.message, true); }
  });
}

function ssAppearance(body, sv) {
  const swatches = ['#04c5ae', '#1f7a8c', '#3aaefc', '#5865f2', '#a37bff', '#eb459e', '#ff7b6b', '#e67e22', '#f0b232', '#23a55a', '#2b2f33', '#6b4e3d'];
  body.innerHTML = `<h2>Banner & Look</h2>
    <div class="sv-look-preview" id="look-preview"></div>
    <div class="setting-group"><h4 class="setting-head">Server banner</h4>
      <p class="muted small" style="margin:0 0 10px">Shown at the top of your channel list, on invites and in Discover. 1200×480 works best. GIFs move!</p>
      <div class="row-btns"><button class="btn btn-primary btn-sm" id="bn-upload">${sv.banner ? 'Change Banner' : 'Upload Banner'}</button>${sv.banner ? '<button class="btn btn-link btn-sm" id="bn-remove">Remove</button>' : ''}</div>
      <input type="file" id="bn-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
      <div class="field" style="margin-top:14px">Banner color <span class="hint">(used when there's no picture)</span><div class="sv-colors">${['', ...swatches].map(c => `<button type="button" class="sv-color${c === (sv.bannerColor || '') ? ' on' : ''}${c ? '' : ' none'}" data-bc="${c}" style="${c ? `background:${c}` : ''}" aria-label="${c || 'None'}">${c ? '' : '✕'}</button>`).join('')}</div></div>
    </div>
    <div class="setting-group"><h4 class="setting-head">Accent color</h4>
      <p class="muted small" style="margin:0 0 10px">Tints the selected channel and highlights while people are in your server.</p>
      <div class="sv-colors">${['', ...swatches].map(c => `<button type="button" class="sv-color${c === (sv.accentColor || '') ? ' on' : ''}${c ? '' : ' none'}" data-ac="${c}" style="${c ? `background:${c}` : ''}" aria-label="${c || 'Default'}">${c ? '' : '✕'}</button>`).join('')}</div>
    </div>
    <div class="setting-group"><h4 class="setting-head">Custom invite link</h4>
      <p class="muted small" style="margin:0 0 10px">A short, easy-to-remember invite like <b>zuno.invite/night-owls</b>.</p>
      <form class="copy-row" id="vanity-form"><span class="vanity-pre">zuno.invite/</span><input name="vanity" maxlength="24" value="${esc(sv.vanity || '')}" placeholder="your-server" autocomplete="off"><button class="btn btn-primary btn-sm">Save</button></form>
    </div>`;
  const preview = () => {
    const s = svById(sv.id) || sv;
    $('#look-preview', body).innerHTML = `<div class="lp-side" style="--sv-accent:${esc(s.accentColor || 'var(--brand)')}">
      <div class="lp-banner" style="${s.bannerColor ? `--bc:${esc(s.bannerColor)}` : ''}">${s.banner ? `<img src="${esc(s.banner)}" alt="">` : ''}<span>${esc(s.name)}</span></div>
      <div class="lp-ch on"># general</div><div class="lp-ch"># memes</div><div class="lp-ch">🔊 Hangout</div></div>`;
  };
  preview();
  $('#bn-upload', body).addEventListener('click', () => $('#bn-file', body).click());
  $('#bn-file', body).addEventListener('change', e => e.target.files[0] && uploadServerImage(sv, 'banner', e.target.files[0]));
  $('#bn-remove', body)?.addEventListener('click', async () => { try { await api('DELETE', `/api/servers/${sv.id}/banner`); await refresh({}); } catch (e) { toast(e.message, true); } });
  const patch = async (change, msg) => { try { await api('PATCH', `/api/servers/${sv.id}`, change); toast(msg); await refresh({}); } catch (e) { toast(e.message, true); } };
  $$('[data-bc]', body).forEach(b => b.addEventListener('click', () => patch({ bannerColor: b.dataset.bc || null }, 'Banner color saved')));
  $$('[data-ac]', body).forEach(b => b.addEventListener('click', () => patch({ accentColor: b.dataset.ac || null }, 'Accent color saved')));
  $('#vanity-form', body).addEventListener('submit', e => { e.preventDefault(); patch({ vanity: e.target.vanity.value.trim() }, e.target.vanity.value.trim() ? 'Custom invite saved' : 'Custom invite removed'); });
}

async function ssDiscovery(body, sv) {
  let tags = [];
  try { tags = (await api('GET', '/api/perms')).tags; } catch {}
  const mine = new Set(sv.tags || []);
  body.innerHTML = `<h2>Discovery</h2>
    <p class="muted" style="margin:-10px 0 16px">Let anyone on Zuno find and join your server from <b>Discover</b>. You can turn this off any time.</p>
    <div class="disc-preview">${typeof discoverCard === 'function' ? discoverCard({ ...sv, memberCount: sv.memberCount, onlineCount: null, joined: true }) : ''}</div>
    <div class="setting-group">
      <div class="checklist">
        <div class="${(sv.description || '').length >= 10 ? 'ok' : ''}">${(sv.description || '').length >= 10 ? '✓' : '○'} A description (Overview)</div>
        <div class="${mine.size ? 'ok' : ''}">${mine.size ? '✓' : '○'} At least one tag</div>
        <div class="${sv.icon ? 'ok' : ''}">${sv.icon ? '✓' : '○'} An icon <span class="muted">(recommended)</span></div>
        <div class="${sv.banner ? 'ok' : ''}">${sv.banner ? '✓' : '○'} A banner <span class="muted">(recommended)</span></div>
      </div>
      ${ssToggle('discoverable', 'Show in Discover', 'Anyone can see your server name, icon, banner, description, member count and public channel names, and join without an invite.', sv.discoverable)}
    </div>
    <div class="setting-group"><h4 class="setting-head">Discovery tags <span class="muted">(up to 5)</span></h4>
      <div class="tag-pick">${tags.map(t => `<button class="chip${mine.has(t) ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>`;
  $$('[data-tag]', body).forEach(b => b.addEventListener('click', async () => {
    const t = b.dataset.tag;
    mine.has(t) ? mine.delete(t) : mine.add(t);
    if (mine.size > 5) { mine.delete(t); return toast('Pick up to 5 tags.', true); }
    try { await api('PATCH', `/api/servers/${sv.id}`, { tags: [...mine] }); await refresh({}); } catch (e) { toast(e.message, true); }
  }));
  $('[name=discoverable]', body).addEventListener('change', async e => {
    try { await api('PATCH', `/api/servers/${sv.id}`, { discoverable: e.target.checked }); toast(e.target.checked ? 'Your server is in Discover! 🎉' : 'Removed from Discover'); if (e.target.checked) burst(e.target, 14); await refresh({}); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  });
}

function ssSafety(body, sv) {
  const ages = [[0, 'None', 'Anyone can join.'], [1, 'Low', 'Accounts must be at least an hour old.'], [24, 'Medium', 'Accounts must be at least a day old.'], [168, 'High', 'Accounts must be at least a week old.']];
  body.innerHTML = `<h2>Safety</h2>
    <div class="setting-group"><h4 class="setting-head">Minimum account age</h4>
      <p class="muted small" style="margin:0 0 10px">Stops brand-new accounts (often spam or raids) from joining. People already in the server aren't affected.</p>
      <div class="level-pick">${ages.map(([v, l, d]) => `<label class="level${(sv.minAccountAge || 0) === v ? ' on' : ''}"><input type="radio" name="age" value="${v}"${(sv.minAccountAge || 0) === v ? ' checked' : ''}><b>${l}</b><small>${d}</small></label>`).join('')}</div>
    </div>
    <div class="setting-group">${ssToggle('invitesPaused', 'Pause invites', "Nobody new can join with an invite or from Discover while this is on. Handy during a raid.", sv.invitesPaused)}</div>
    <div class="setting-group"><h4 class="setting-head">Good to know</h4>
      <ul class="muted small safety-tips"><li>Slowmode (per channel, in Channels & Categories) slows down spam.</li><li>Give trusted people a role with <b>Manage Messages</b>, <b>Kick</b> and <b>Ban</b> so they can help.</li><li>Every moderation action shows up in the <b>Audit Log</b>.</li></ul></div>`;
  $$('[name=age]', body).forEach(r => r.addEventListener('change', async () => {
    try { await api('PATCH', `/api/servers/${sv.id}`, { minAccountAge: Number(r.value) }); toast('Safety level saved'); await refresh({}); } catch (e) { toast(e.message, true); }
  }));
  $('[name=invitesPaused]', body).addEventListener('change', async e => {
    try { await api('PATCH', `/api/servers/${sv.id}`, { invitesPaused: e.target.checked }); toast(e.target.checked ? 'Invites paused' : 'Invites are open'); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  });
}

// ---- channels & categories: drag to reorder, click to edit ----
function ssChannels(body, sv) {
  const cats = sv.categories || [];
  const open = svSettings.openCh;
  const canRoles = hasPerm(sv, 'manage_roles');
  const row = c => `<div class="sc-ch${c.id === open ? ' open' : ''}" draggable="true" data-sc="${esc(c.id)}">
      <span class="sc-grip" title="Drag to move">⋮⋮</span><span class="ch-ico">${c.type === 'voice' ? ICON.speaker : c.readOnly ? '📢' : ICON.hash}</span>
      <span class="sc-name">${esc(c.name)}</span>
      <span class="sc-tags">${isPrivateCh(sv, c) ? `<i>${LOCK} Private</i>` : ''}${c.categoryId && c.synced === false ? '<i title="Has its own permissions">⛓️‍💥 Not synced</i>' : ''}${c.readOnly ? '<i>Announcements</i>' : ''}${c.slowmode ? `<i>🐢 ${SLOWMODE_LABEL[c.slowmode]}</i>` : ''}${c.userLimit ? `<i>👥 ${Number(c.userLimit) || 0}</i>` : ''}</span>
      ${canRoles ? `<button class="icon-btn sc-perm" title="Permissions" data-perm-ch="${esc(c.id)}">🔐</button>` : ''}<button class="icon-btn sc-edit" title="Edit">${ICON.pencil}</button></div>
    ${c.id === open ? chEditor(c, cats) : ''}`;
  const group = (cat, list) => `<div class="sc-group" data-group="${cat ? esc(cat.id) : ''}">
    ${cat ? `<div class="sc-cat" data-sccat="${esc(cat.id)}"><span class="cat-chev">${ICON.chevron}</span>
      <input class="sc-cat-name" value="${esc(cat.name)}" maxlength="32" aria-label="Category name">
      ${(cat.overrides || []).find(o => o.id === sv.id)?.deny?.includes('view_channels') ? `<span class="sc-tags"><i>${LOCK} Private</i></span>` : ''}
      <button class="icon-btn" data-move="-1" title="Move up">▲</button><button class="icon-btn" data-move="1" title="Move down">▼</button>
      ${canRoles ? '<button class="icon-btn" data-catperm title="Category permissions">🔐</button>' : ''}
      <button class="icon-btn" data-addin title="Create channel here">${ICON.plus}</button><button class="icon-btn danger" data-delcat title="Delete category">${ICON.trash}</button></div>`
      : '<div class="sc-cat loose"><span class="muted small">Not in a category</span></div>'}
    <div class="sc-drop">${list.map(row).join('') || '<div class="sc-empty">Drag channels here</div>'}</div></div>`;
  body.innerHTML = `<h2>Channels & Categories</h2>
    <p class="muted" style="margin:-10px 0 16px">Drag channels to reorder them or move them into a category. Click a channel to change it, or 🔐 for who can see and use it. Channels follow their category's permissions until you give them their own.</p>
    <div class="sc-toolbar"><button class="btn btn-primary btn-sm" id="sc-new-ch">${ICON.plus} Create Channel</button><button class="btn btn-grey btn-sm" id="sc-new-cat">📁 Create Category</button></div>
    <div class="sc-list">${group(null, sv.channels.filter(c => !c.categoryId || !cats.some(k => k.id === c.categoryId)))}${cats.map(cat => group(cat, sv.channels.filter(c => c.categoryId === cat.id))).join('')}</div>`;

  $('#sc-new-ch', body).addEventListener('click', () => openCreateChannel(sv));
  $('#sc-new-cat', body).addEventListener('click', () => openCreateCategory(sv, () => openServerSettings(svById(sv.id), 'channels')));
  $$('[data-perm-ch]', body).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openPermEditor(sv, { kind: 'channel', id: b.dataset.permCh }); }));

  // Category controls
  $$('[data-sccat]', body).forEach(h => {
    const id = h.dataset.sccat, cat = cats.find(c => c.id === id);
    const name = $('.sc-cat-name', h);
    const saveName = async () => { if (name.value.trim().toUpperCase() === cat.name) return; try { await api('PATCH', `/api/servers/${sv.id}/categories/${id}`, { name: name.value }); toast('Category renamed'); } catch (e) { toast(e.message, true); } };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    name.addEventListener('blur', saveName);
    $$('[data-move]', h).forEach(b => b.addEventListener('click', async () => {
      const order = cats.map(c => c.id), i = order.indexOf(id), j = i + Number(b.dataset.move);
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      try { await api('PUT', `/api/servers/${sv.id}/layout`, { categories: order }); } catch (e) { toast(e.message, true); }
    }));
    $('[data-catperm]', h)?.addEventListener('click', () => openPermEditor(sv, { kind: 'category', id }));
    $('[data-addin]', h).addEventListener('click', () => openCreateChannel(sv, 'text', id));
    $('[data-delcat]', h).addEventListener('click', () => confirmDeleteCategory(sv, cat));
  });

  // Click to open the editor
  $$('.sc-ch', body).forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('.sc-grip, [data-perm-ch]')) return;
    svSettings.openCh = svSettings.openCh === r.dataset.sc ? null : r.dataset.sc;
    ssChannels(body, svById(sv.id));
  }));
  wireChEditor(body, sv);

  // Drag and drop
  let dragId = null;
  $$('.sc-ch', body).forEach(r => {
    r.addEventListener('dragstart', e => { dragId = r.dataset.sc; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
    r.addEventListener('dragend', () => { r.classList.remove('dragging'); $$('.drop-before, .drop-into', body).forEach(x => x.classList.remove('drop-before', 'drop-into')); });
  });
  $$('.sc-group', body).forEach(g => {
    g.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      $$('.drop-before, .drop-into', body).forEach(x => x.classList.remove('drop-before', 'drop-into'));
      const over = e.target.closest('.sc-ch');
      if (over && over.dataset.sc !== dragId) over.classList.add('drop-before'); else g.classList.add('drop-into');
    });
    g.addEventListener('drop', async e => {
      e.preventDefault();
      if (!dragId) return;
      const target = e.target.closest('.sc-ch')?.dataset.sc;
      const catId = g.dataset.group || null;
      const list = svById(sv.id).channels.map(c => ({ id: c.id, categoryId: c.categoryId || null }));
      const moving = list.splice(list.findIndex(x => x.id === dragId), 1)[0];
      moving.categoryId = catId;
      let at = target && target !== dragId ? list.findIndex(x => x.id === target) : -1;
      if (at < 0) { const lastInCat = list.map((x, i) => [x, i]).filter(([x]) => (x.categoryId || null) === catId).pop(); at = lastInCat ? lastInCat[1] + 1 : list.length; }
      list.splice(at, 0, moving);
      dragId = null;
      try { await api('PUT', `/api/servers/${sv.id}/layout`, { channels: list }); } catch (err) { toast(err.message, true); }
    });
  });
}
function chEditor(c, cats) {
  const text = c.type === 'text';
  return `<form class="sc-editor" data-editor="${esc(c.id)}">
    <label class="field">Channel name<input name="name" maxlength="32" value="${esc(c.name)}" required></label>
    ${text ? `<label class="field">Channel topic <span class="hint">(shown at the top of the channel)</span><input name="topic" maxlength="200" value="${esc(c.topic || '')}" placeholder="Let everyone know what this channel is for"></label>` : ''}
    <div class="sc-row2">
      <label class="field">Category<select name="categoryId" class="sc-select"><option value="">No category</option>${cats.map(k => `<option value="${esc(k.id)}"${k.id === c.categoryId ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
      ${text ? `<label class="field">Slowmode <span class="hint">(time between messages)</span><select name="slowmode" class="sc-select">${Object.entries(SLOWMODE_LABEL).map(([v, l]) => `<option value="${v}"${Number(v) === (c.slowmode || 0) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
        : `<label class="field">Voice user limit <span class="hint">(0 = no limit)</span><input name="userLimit" type="number" min="0" max="99" value="${Number(c.userLimit) || 0}"></label>`}
    </div>
    ${text ? ssToggle('readOnly', 'Announcement channel', 'Only people who can manage messages (or are allowed in its permissions) can post. Everyone else can read and react.', c.readOnly) : ''}
    <div class="sc-editor-actions"><button type="button" class="btn btn-red btn-sm" data-delch>Delete Channel</button>${chHas(c, 'manage_roles') ? '<button type="button" class="btn btn-grey btn-sm" data-chperm>🔐 Permissions</button>' : ''}<span style="flex:1"></span>
      <button type="button" class="btn btn-link" data-close>Close</button><button class="btn btn-primary btn-sm">Save</button></div></form>`;
}
function wireChEditor(body, sv) {
  const f = $('.sc-editor', body);
  if (!f) return;
  const ch = sv.channels.find(c => c.id === f.dataset.editor);
  f.addEventListener('click', e => e.stopPropagation());
  $('[data-close]', f).addEventListener('click', () => { svSettings.openCh = null; ssChannels(body, svById(sv.id)); });
  $('[data-delch]', f).addEventListener('click', () => confirmDeleteChannel(ch));
  $('[data-chperm]', f)?.addEventListener('click', () => openPermEditor(sv, { kind: 'channel', id: ch.id }));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const change = { name: f.name.value, categoryId: f.categoryId.value || null };
    if (ch.type === 'text') Object.assign(change, { topic: f.topic.value, slowmode: Number(f.slowmode.value), readOnly: f.readOnly.checked });
    else change.userLimit = Number(f.userLimit.value) || 0;
    try { await api('PATCH', `/api/channels/${ch.id}`, change); toast('Channel saved'); document.activeElement?.blur(); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- members ----
async function ssMembers(body, sv) {
  await loadServerMembers(sv.id);
  sv = svById(sv.id);
  const ids = state.serverMembers[sv.id] || [];
  let joined = {};
  try { joined = (await api('GET', `/api/servers/${sv.id}`)).joined || {}; } catch {}
  const roleSort = id => (id === sv.ownerId ? -1 : Math.min(...(sv.memberRoles?.[id] || []).map(r => sv.roles.findIndex(x => x.id === r)).filter(i => i >= 0), 999));
  const canKick = hasPerm(sv, 'kick_members'), canBan = hasPerm(sv, 'ban_members'), canRoles = hasPerm(sv, 'manage_roles');
  let roleFilter = '';
  const draw = q => {
    const list = ids.map(user).filter(Boolean)
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q))
      .filter(u => !roleFilter || (sv.memberRoles?.[u.id] || []).includes(roleFilter))
      .sort((a, b) => roleSort(a.id) - roleSort(b.id) || a.displayName.localeCompare(b.displayName));
    $('#ss-mlist', body).innerHTML = list.map(u => {
      const above = outranksMe(sv, u.id);
      const roles = sv.roles.filter(r => (sv.memberRoles?.[u.id] || []).includes(r.id)); // highest first
      const j = joined[u.id];
      return `<div class="bug-row ss-member" data-m="${esc(u.id)}">${avatar(u, 36, true)}
        <div style="flex:1;min-width:0"><b${nameStyle(u)}>${esc(nameIn(u, sv))}</b> <span class="muted">${esc(u.username)}${sv.nicks?.[u.id] ? ` · ${esc(u.displayName)}` : ''}</span>${botTag(u)}${u.id === sv.ownerId ? ' <span class="role-pill r-owner">👑 Owner</span>' : ''}
          <div class="mr-chips">${roles.map(r => `<span class="role-chip" style="--rc:${esc(r.color || '#9aa6a4')}"><i></i>${roleIconHtml(r)}${esc(r.name)}${canRoles && !r.managed && canEditRoleMe(sv, r) && (u.id === state.me.id || !above) ? `<button data-unrole="${esc(r.id)}" title="Remove role">✕</button>` : ''}</span>`).join('')}
          ${canRoles && (u.id === state.me.id || !above) && u.id !== sv.ownerId ? '<button class="role-chip add" data-addrole title="Add role">+</button>' : ''}</div>
          ${j ? `<div class="muted small">${j.at ? `Joined ${fmtTime(j.at)}` : ''}${j.via ? ` · via ${esc(j.via)}` : ''}</div>` : ''}</div>
        <div class="mod-user-acts">
          ${!above && u.id !== state.me.id && u.id !== sv.ownerId ? `${canKick ? '<button class="btn btn-sm btn-grey" data-kick>Kick</button>' : ''}${canBan ? '<button class="btn btn-sm btn-red" data-ban>Ban</button>' : ''}` : ''}</div></div>`;
    }).join('') || '<div class="fp-empty">Nobody matches that.</div>';
    $$('.ss-member', body).forEach(r => {
      const id = r.dataset.m;
      $('[data-addrole]', r)?.addEventListener('click', e => openRolePicker(sv, id, e.currentTarget));
      $$('[data-unrole]', r).forEach(b => b.addEventListener('click', () => setMemberRoles(sv, id, (sv.memberRoles?.[id] || []).filter(x => x !== b.dataset.unrole))));
      $('[data-kick]', r)?.addEventListener('click', () => kickMember(sv, id));
      $('[data-ban]', r)?.addEventListener('click', () => openServerBan(sv, id));
    });
  };
  body.innerHTML = `<h2>Members <span class="muted" style="font-size:16px">${ids.length}</span></h2>
    <p class="muted" style="margin:-10px 0 14px">Give people roles to change what they can do. You can only manage people whose highest role is below yours.</p>
    <div class="ss-mtools"><input class="qs-input" id="ss-mq" placeholder="Search members" autocomplete="off">
      <select class="sc-select" id="ss-mrole"><option value="">All roles</option>${sv.roles.filter(r => !r.everyone).map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></div>
    <div id="ss-mlist" style="margin-top:12px"></div>`;
  $('#ss-mq', body).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  $('#ss-mrole', body).addEventListener('change', e => { roleFilter = e.target.value; draw($('#ss-mq', body).value.trim().toLowerCase()); });
  draw('');
}
// Is this person's highest role the same as or above mine? (Then I can't act on them.)
function myTopPos(sv, uid = state.me.id) {
  if (uid === sv.ownerId) return -1;
  const mine = sv.memberRoles?.[uid] || [];
  const i = sv.roles.findIndex(r => mine.includes(r.id));
  return i < 0 ? sv.roles.length - 1 : i;
}
const outranksMe = (sv, uid) => uid !== state.me.id && !isOwner(sv) && (uid === sv.ownerId || myTopPos(sv, uid) <= myTopPos(sv));
// For changing someone's roles, administrators can also manage people at their own level (0.28).
const rolesLockedMe = (sv, uid) => outranksMe(sv, uid) && !(uid !== sv.ownerId && hasPerm(sv, 'administrator') && myTopPos(sv, uid) === myTopPos(sv));
const canEditRoleMe = (sv, role) => isOwner(sv) || sv.roles.indexOf(role) > myTopPos(sv);
async function setMemberRoles(sv, uid, roles) {
  try { await api('PUT', `/api/servers/${sv.id}/members/${uid}/roles`, { roles }); toast('Roles updated'); await refresh({ serverId: sv.id }); }
  catch (e) { toast(e.message, true); }
}
function openRolePicker(sv, uid, anchor) {
  sv = svById(sv.id) || sv;
  const have = new Set(sv.memberRoles?.[uid] || []);
  const roles = sv.roles.filter(r => !r.everyone && !r.managed && canEditRoleMe(sv, r));
  if (!roles.length) return toast('There are no roles you can give. Make one in Roles first.', true);
  openMenu(anchor, roles.map(r => ({ label: `${have.has(r.id) ? '✓ ' : ''}${r.name}`, icon: `<span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span>`, run: () => setMemberRoles(sv, uid, have.has(r.id) ? [...have].filter(x => x !== r.id) : [...have, r.id]) })));
}
function openServerBan(sv, id) {
  const u = user(id);
  const ov = openLayer(`<form class="dialog modal"><h3>Ban ${esc(u?.displayName || 'this person')}</h3>
    <p class="muted" style="margin:0 0 12px">They'll be removed from ${esc(sv.name)} and can't come back until they're unbanned.</p>
    <label class="field">Delete their recent messages<select name="deleteHours" class="sc-select"><option value="0">Don't delete any</option><option value="1">From the last hour</option><option value="24">From the last 24 hours</option><option value="168">From the last 7 days</option></select></label>
    <label class="field">Reason <span class="hint">(optional, shows in the audit log)</span><input name="reason" maxlength="200"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red">Ban</button></div></form>`);
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('POST', `/api/servers/${sv.id}/bans`, { userId: id, reason: f.reason.value, deleteHours: Number(f.deleteHours.value) }); toast(`${u?.displayName || 'They'} was banned`); dismissLayer(); if (svSettings && $('.server-settings-page')) openServerSettings(svById(sv.id), 'bans'); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- bans ----
async function ssBans(body, sv) {
  let bans = [];
  try { bans = (await api('GET', `/api/servers/${sv.id}`)).bans || []; } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  body.innerHTML = `<h2>Bans <span class="muted" style="font-size:16px">${bans.length}</span></h2>
    ${bans.length ? `<input class="qs-input" id="ban-q" placeholder="Search bans" autocomplete="off" style="margin-bottom:12px">` : ''}<div id="ban-list"></div>`;
  const draw = q => {
    const list = bans.filter(b => !q || (b.user?.displayName || '').toLowerCase().includes(q) || (b.user?.username || '').includes(q) || (b.reason || '').toLowerCase().includes(q));
    $('#ban-list', body).innerHTML = list.length ? list.map(b => `<div class="bug-row" data-b="${esc(b.userId)}">${avatar(b.user || { displayName: '?' }, 36)}
      <div style="flex:1;min-width:0"><b>${esc(b.user?.displayName || 'Deleted user')}</b> <span class="muted">${esc(b.user?.username || '')}</span>
        <div class="muted small">Banned by ${esc(user(b.by)?.displayName || 'a moderator')} · ${fmtTime(b.at)}${b.reason ? ` · "${esc(b.reason)}"` : ''}</div></div>
      <button class="btn btn-sm btn-grey" data-unban>Unban</button></div>`).join('')
      : `<div class="empty-state">${mascot('happy')}<div class="title">No bans</div><div>${q ? 'Nobody matches that.' : 'Nobody is banned from this server.'}</div></div>`;
    $$('[data-unban]', body).forEach(b => b.addEventListener('click', async () => {
      try { await api('DELETE', `/api/servers/${sv.id}/bans/${b.closest('[data-b]').dataset.b}`); toast('Unbanned'); ssBans(body, sv); } catch (e) { toast(e.message, true); }
    }));
  };
  $('#ban-q', body)?.addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  draw('');
}

// ---- invites ----
const AGE_LABEL = { 0: 'Never', 1800: '30 minutes', 3600: '1 hour', 21600: '6 hours', 43200: '12 hours', 86400: '1 day', 604800: '7 days' };
const USES_LABEL = { 0: 'No limit', 1: '1 use', 5: '5 uses', 10: '10 uses', 25: '25 uses', 50: '50 uses', 100: '100 uses' };
function untilText(t) {
  if (!t) return 'Never expires';
  const ms = t - Date.now();
  if (ms <= 0) return 'Expired';
  return 'Expires in ' + (ms > 864e5 ? Math.round(ms / 864e5) + ' days' : ms > 3600e3 ? Math.round(ms / 3600e3) + ' hours' : Math.max(1, Math.round(ms / 60e3)) + ' min');
}
async function ssInvites(body, sv) {
  let d;
  try { d = await api('GET', `/api/servers/${sv.id}/invites`); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const manage = hasPerm(sv, 'manage_invites');
  const text = sv.channels.filter(c => c.type === 'text');
  body.innerHTML = `<h2>Invites</h2>
    <div class="setting-group"><h4 class="setting-head">Main invite</h4>
      <div class="copy-row"><input readonly value="${esc(inviteText(d.main))}" id="ss-code"><button class="btn btn-primary btn-sm" id="ss-copy">Copy</button></div>
      <p class="muted small">Never expires. Used ${d.mainUses} time${d.mainUses === 1 ? '' : 's'}.${d.vanity ? ` Your custom invite <b>zuno.invite/${esc(d.vanity)}</b> works too.` : ''}</p>
      ${manage ? '<button class="btn btn-grey btn-sm" id="ss-reset">Reset main invite</button>' : ''}
    </div>
    <div class="setting-group"><h4 class="setting-head">Make an invite</h4>
      <form class="inv-make" id="inv-make">
        <label class="field">Expires after<select name="maxAge" class="sc-select">${d.ages.map(a => `<option value="${a}"${a === 604800 ? ' selected' : ''}>${AGE_LABEL[a]}</option>`).join('')}</select></label>
        <label class="field">Max uses<select name="maxUses" class="sc-select">${d.uses.map(u => `<option value="${u}">${USES_LABEL[u]}</option>`).join('')}</select></label>
        <label class="field">Opens in<select name="channelId" class="sc-select"><option value="">Default channel</option>${text.map(c => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('')}</select></label>
        <button class="btn btn-primary btn-sm">Create Invite</button>
      </form>
    </div>
    <div class="setting-group"><h4 class="setting-head">${manage ? 'All invites' : 'Your invites'} <span class="muted">${d.invites.length}</span></h4>
      ${d.invites.length ? `<div class="inv-table">${d.invites.sort((a, b) => b.at - a.at).map(i => `<div class="inv-row" data-code="${esc(i.code)}">
        ${avatar(i.creator || { displayName: '?' }, 28)}<div class="inv-who"><code>${esc(i.code)}</code><small>${esc(i.creator?.displayName || '?')}${i.channelName ? ` · #${esc(i.channelName)}` : ''}</small></div>
        <span class="inv-stat">${i.uses}${i.maxUses ? '/' + i.maxUses : ''} uses</span><span class="inv-stat">${untilText(i.expiresAt)}</span>
        <button class="icon-btn" data-copyinv title="Copy">📋</button><button class="icon-btn danger" data-delinv title="Delete">${ICON.trash}</button></div>`).join('')}</div>`
        : '<div class="fp-empty">No extra invites yet.</div>'}
    </div>
    ${manage ? `<div class="setting-group">${ssToggle('invitesPaused', 'Pause invites', "Nobody new can join with an invite or from Discover while this is on.", sv.invitesPaused)}</div>` : ''}`;
  $('#ss-copy', body).addEventListener('click', e => { copyText($('#ss-code').value, 'Invite'); e.target.textContent = 'Copied!'; });
  $('#ss-reset', body)?.addEventListener('click', () => confirmDialog('Reset main invite?', 'The current main invite stops working right away.', 'Reset', async () => { try { await api('POST', `/api/servers/${sv.id}/invite/reset`); toast('Invite reset'); ssInvites(body, sv); } catch (e) { toast(e.message, true); } }));
  $('#inv-make', body).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try { const { invite } = await api('POST', `/api/servers/${sv.id}/invites`, { maxAge: Number(f.maxAge.value), maxUses: Number(f.maxUses.value), channelId: f.channelId.value || null }); copyText(inviteText(invite.code), 'New invite'); ssInvites(body, sv); }
    catch (err) { toast(err.message, true); }
  });
  $$('[data-copyinv]', body).forEach(b => b.addEventListener('click', () => copyText(inviteText(b.closest('[data-code]').dataset.code), 'Invite')));
  $$('[data-delinv]', body).forEach(b => b.addEventListener('click', async () => { try { await api('DELETE', `/api/servers/${sv.id}/invites/${b.closest('[data-code]').dataset.code}`); toast('Invite deleted'); ssInvites(body, sv); } catch (e) { toast(e.message, true); } }));
  $('[name=invitesPaused]', body)?.addEventListener('change', async e => {
    try { await api('PATCH', `/api/servers/${sv.id}`, { invitesPaused: e.target.checked }); toast(e.target.checked ? 'Invites paused' : 'Invites are open'); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  });
}

// ======================= channel header topic & composer rules =======================
const _renderDMHeader = renderDMHeader;
renderDMHeader = function () {
  _renderDMHeader();
  const ch = state.view.type === 'channel' ? currentChannel() : null;
  const el = $('#dm-title');
  if (ch && el && isPrivateCh(currentServer(), ch)) $('.hash', el)?.insertAdjacentHTML('beforeend', LOCK);
  if (ch && el && ch.topic) el.insertAdjacentHTML('beforeend', `<span class="ch-topic" title="${esc(ch.topic)}">${esc(ch.topic)}</span>`);
};
const _renderComposer = renderComposer;
renderComposer = function () {
  const el = $('#composer'), conv = activeConv();
  const ch = el && isChannelConv(conv) ? currentChannel() : null;
  if (ch && !chHas(ch, 'send_messages')) {
    const key = 'ro:' + conv + (ch.readOnly ? ':a' : ':n');
    if (el.dataset.rel !== key) {
      el.dataset.rel = key;
      el.innerHTML = `<div class="composer-locked">${ch.readOnly ? "📢 This is an announcement channel. You can read and react, but only some people can post here." : "🔒 You don't have permission to send messages in this channel."}</div>`;
    }
    return;
  }
  if (el?.dataset.rel?.startsWith('ro:')) delete el.dataset.rel;
  _renderComposer();
  const ta = $('#composer-input');
  if (ta && ch?.slowmode && !chHas(ch, 'bypass_slowmode') && !chHas(ch, 'manage_messages')) ta.placeholder = `Message #${ch.name} · Slowmode ${SLOWMODE_LABEL[ch.slowmode]}`;
  if (ch && !chHas(ch, 'attach_files')) { const plus = $('#composer-plus'); if (plus) { plus.disabled = true; plus.title = "You can't attach files here"; } }
};
