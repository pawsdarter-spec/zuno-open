'use strict';
// Servers, part three: right-click people anywhere to Add Roles, nicknames, timeouts, muting
// servers and channels, server themes, templates, the setup checklist, and the Zuno Bots.

// ======================= right-click a person =======================
const isTimedOut = (sv, uid) => (sv?.timeouts?.[uid] || 0) > Date.now();
openMemberMenu = function (sv, id, anchor) {
  sv = svById(sv.id) || sv;
  const u = user(id);
  const me = id === state.me.id;
  const above = outranksMe(sv, id);
  const items = [{ label: 'Profile', icon: ico('👤'), run: () => openProfile(id) }];
  if (!me && isFriend(id)) items.push({ label: 'Message', icon: ico('💬'), run: () => openDM(id) });
  else if (!me && !u?.bot) items.push({ label: 'Send Message Request', icon: ico('✉️'), run: () => openDM(id) });
  if (u && !u.bot && !me) items.push({ label: 'Mention', icon: ico('@'), run: () => { const ta = $('#composer-input'); if (ta) { ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + '@' + u.username + ' '; ta.focus(); ta.dispatchEvent(new Event('input')); } } });
  const manage = [];
  if (hasPerm(sv, 'manage_roles') && id !== sv.ownerId && (me || !above)) manage.push({ label: 'Add Roles', icon: ico('🏷️'), desc: `${(sv.memberRoles?.[id] || []).length} role${(sv.memberRoles?.[id] || []).length === 1 ? '' : 's'}`, run: () => openRolePicker(sv, id, anchor) });
  if ((me && hasPerm(sv, 'change_nickname')) || (!me && hasPerm(sv, 'manage_nicknames') && !above && id !== sv.ownerId)) manage.push({ label: me ? 'Change Nickname' : 'Edit Nickname', icon: ico('✏️'), run: () => openNickname(sv, id) });
  if (!me && hasPerm(sv, 'moderate_members') && !above && id !== sv.ownerId && !u?.bot) manage.push(isTimedOut(sv, id) ? { label: 'Remove Time Out', icon: ico('⏳'), run: () => setTimeoutFor(sv, id, 0) } : { label: 'Time Out', icon: ico('⏳'), desc: 'They can read, but not talk', run: () => openTimeout(sv, id) });
  if (manage.length) items.push('sep', ...manage);
  if (!me && id !== sv.ownerId && !above) {
    const mod = [];
    if (hasPerm(sv, 'kick_members')) mod.push({ label: u?.bot ? 'Remove Bot' : 'Kick from Server', danger: true, run: () => kickMember(sv, id) });
    if (hasPerm(sv, 'ban_members')) mod.push({ label: 'Ban from Server', danger: true, run: () => openServerBan(sv, id) });
    if (mod.length) items.push('sep', ...mod);
  }
  items.push('sep', { label: 'Copy User ID', icon: ico('#️⃣'), run: () => copyText(id, 'User ID') });
  openMenu(anchor, items);
};

// Right-click (or long-press) a name or picture in chat, or someone in a voice channel.
document.addEventListener('contextmenu', e => {
  const sv = state.currentServerId && currentServer();
  if (!sv) return;
  const hit = e.target.closest('.messages .msg [data-profile], .voice-user[data-vu], .vs-tile[data-uid]');
  if (!hit) return;
  const id = hit.dataset.profile || hit.dataset.vu || hit.dataset.uid;
  if (!id || user(id)?.system || user(id)?.webhook || !(state.serverMembers[sv.id] || [id]).includes(id)) return;
  e.preventDefault();
  e.stopPropagation();
  openMemberMenu(sv, id, atPoint(e));
}, true);

// A checklist of roles that stays open, so you can give several at once.
openRolePicker = function (sv, uid, anchor) {
  sv = svById(sv.id) || sv;
  const roles = sv.roles.filter(r => !r.everyone && !r.managed);
  const canMake = hasPerm(sv, 'manage_roles');
  const u = user(uid);
  // Measure the button before closing whatever it sits in (a profile card), or it reads as 0,0.
  const ar = anchor?.getBoundingClientRect?.() || { left: 0, top: 0, bottom: 0, width: 0, height: 0 };
  const placed = anchor && (anchor.isConnected === undefined || anchor.isConnected) && (ar.width || ar.height || ar.left || ar.top);
  // Opened from a profile card: keep the card open underneath, and only close the picker.
  const overCard = !!anchor?.closest?.('#layer .pcard');
  if (!overCard) closeLayer();
  const shield = document.createElement('div');
  shield.style.cssText = `position:fixed;inset:0;z-index:${overCard ? 159 : 119}`;
  const box = document.createElement('div');
  box.className = 'menu role-picker';
  if (overCard) box.style.zIndex = 160;
  let changed = false;
  const closePicker = () => {
    box.remove(); shield.remove(); document.removeEventListener('keydown', onKey, true);
    if (overCard && changed) openProfile(uid); // redraw the card with the new roles
  };
  const onKey = e => { if (!box.isConnected) return document.removeEventListener('keydown', onKey, true); if (e.key === 'Escape') { e.stopPropagation(); overCard ? closePicker() : closeLayer(); } };
  document.addEventListener('keydown', onKey, true);
  const draw = q => {
    const s = svById(sv.id) || sv;
    const have = new Set(s.memberRoles?.[uid] || []);
    const list = s.roles.filter(r => !r.everyone && !r.managed && (!q || r.name.toLowerCase().includes(q)));
    $('.rp-list', box).innerHTML = list.map(r => {
      const ok = canEditRoleMe(s, r);
      return `<label class="rp-item${ok ? '' : ' locked'}" title="${ok ? '' : 'This role is at or above your highest role'}"><input type="checkbox" data-r="${esc(r.id)}"${have.has(r.id) ? ' checked' : ''}${ok ? '' : ' disabled'}>
        <span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span>${roleIconHtml(r)}<span class="rp-name" style="${esc(roleCss(r))}">${esc(r.name)}</span>${ok ? '' : '<span>🔒</span>'}</label>`;
    }).join('') || `<div class="fp-empty">${roles.length ? 'No roles match.' : 'This server has no roles yet.'}</div>`;
    $$('[data-r]', box).forEach(cb => cb.addEventListener('change', async () => {
      const cur = new Set((svById(sv.id) || sv).memberRoles?.[uid] || []);
      cb.checked ? cur.add(cb.dataset.r) : cur.delete(cb.dataset.r);
      // (0.56.1) Shows straight away; the change is saved in the background (quick clicks are sent
      // one after another, each with the latest roles).
      changed = true;
      saveMemberRoles(svById(sv.id) || sv, uid, [...cur]);
    }));
  };
  box.innerHTML = `<div class="rp-head">Roles for <b>${esc(nameIn(u, sv))}</b></div><input class="qs-input rp-q" placeholder="Search roles" autocomplete="off"><div class="rp-list"></div>
    ${canMake ? '<button class="rp-new" data-new-role>＋ Create a new role</button>' : ''}`;
  $('#layer').append(shield, box);
  shield.addEventListener('mousedown', () => (overCard ? closePicker() : closeLayer()));
  draw('');
  $('.rp-q', box).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  $('[data-new-role]', box)?.addEventListener('click', () => { closeLayer(); openServerSettings(svById(sv.id), 'roles'); });
  const r = ar, mr = box.getBoundingClientRect();
  let top = placed ? r.bottom + 6 : (innerHeight - mr.height) / 2, left = placed ? r.left : (innerWidth - mr.width) / 2;
  if (top + mr.height > innerHeight - 8) top = Math.max(8, innerHeight - mr.height - 8);
  if (left + mr.width > innerWidth - 8) left = innerWidth - mr.width - 8;
  box.style.top = Math.max(8, top) + 'px'; box.style.left = Math.max(8, left) + 'px';
  setTimeout(() => $('.rp-q', box)?.focus(), 30);
};

function openNickname(sv, uid) {
  const u = user(uid);
  const ov = openLayer(`<form class="dialog modal"><h3>${uid === state.me.id ? 'Change your nickname' : `Nickname for ${esc(u?.displayName || '')}`}</h3>
    <p class="muted" style="margin:0 0 12px">Only shows in <b>${esc(sv.name)}</b>. Leave it empty to use ${uid === state.me.id ? 'your' : 'their'} display name.</p>
    <label class="field">Nickname<input name="nick" maxlength="32" value="${esc(sv.nicks?.[uid] || '')}" placeholder="${esc(u?.displayName || '')}"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="reset">Reset</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  f.nick.select();
  const save = async nick => { try { await api('PUT', `/api/servers/${sv.id}/members/${uid}/nick`, { nick }); closeLayer(); toast('Nickname saved'); await refresh({ serverId: sv.id }); } catch (e) { toast(e.message, true); } };
  f.addEventListener('submit', e => { e.preventDefault(); save(f.nick.value.trim()); });
  $('[data-a=reset]', ov).addEventListener('click', () => save(''));
}
function openTimeout(sv, uid) {
  const u = user(uid);
  const opts = [[1, '60 seconds'], [5, '5 minutes'], [10, '10 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']];
  const ov = openLayer(`<form class="dialog modal"><h3>Time out ${esc(nameIn(u, sv))}</h3>
    <p class="muted" style="margin:0 0 12px">They can still read, but can't send messages, react, talk or share video in ${esc(sv.name)} until it ends.</p>
    <div class="to-opts">${opts.map(([m, l], i) => `<label class="to-opt"><input type="radio" name="m" value="${m}"${i === 1 ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <label class="field">Reason <span class="hint">(optional, shows in the audit log)</span><input name="reason" maxlength="150"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red">Time Out</button></div></form>`);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('form', ov).addEventListener('submit', e => { e.preventDefault(); setTimeoutFor(sv, uid, Number(e.target.m.value), e.target.reason.value); closeLayer(); });
}
async function setTimeoutFor(sv, uid, minutes, reason = '') {
  try { await api('POST', `/api/servers/${sv.id}/members/${uid}/timeout`, { minutes, reason }); toast(minutes ? 'Timed out' : 'Time out removed'); await refresh({ serverId: sv.id }); }
  catch (e) { toast(e.message, true); }
}

// The message box tells you when you're timed out, and until when.
const _renderComposerT = renderComposer;
renderComposer = function () {
  const el = $('#composer'), sv = state.view.type === 'channel' ? currentServer() : null;
  const until = sv?.timeouts?.[state.me.id];
  if (el && until > Date.now()) {
    const key = 'to:' + until;
    if (el.dataset.rel !== key) { el.dataset.rel = key; el.innerHTML = `<div class="composer-locked">⏳ You're timed out in this server until <b>${esc(fmtTime(until))}</b>. You can read, but not send messages.</div>`; }
    clearTimeout(renderComposer.t); renderComposer.t = setTimeout(() => { delete el.dataset.rel; renderComposer(); }, Math.min(until - Date.now() + 500, 2 ** 31 - 1));
    return;
  }
  if (el?.dataset.rel?.startsWith('to:')) delete el.dataset.rel;
  _renderComposerT();
};

// ======================= muting servers and channels =======================
const isMuted = key => !!state.extras?.mutes?.[key];
async function setMute(key, muted) {
  try { const { mutes } = await api('PUT', '/api/me/mutes', { key, muted }); state.extras.mutes = mutes; toast(muted ? 'Muted' : 'Unmuted'); renderRail(); if (state.currentServerId) renderServerSidebar(); }
  catch (e) { toast(e.message, true); }
}
// Adds an extra button to the menu that was just opened.
function addMenuItem(item, { top = false } = {}) {
  const menu = $('#layer .menu');
  if (!menu) return;
  const b = document.createElement('button');
  b.className = item.danger ? 'danger' : '';
  b.innerHTML = `${item.icon || ''}<span>${esc(item.label)}${item.desc ? `<span class="desc">${esc(item.desc)}</span>` : ''}</span>`;
  b.addEventListener('click', () => { closeLayer(); item.run(); });
  const anchor = top ? menu.querySelector('button, .sep') : [...menu.children].find(n => n.classList.contains('sep'));
  anchor ? menu.insertBefore(b, anchor) : menu.appendChild(b);
}
const _openServerMenuM = openServerMenu;
openServerMenu = function (anchor, sv = currentServer()) {
  _openServerMenuM(anchor, sv);
  if (!sv) return;
  const k = 'sv:' + sv.id;
  addMenuItem({ label: isMuted(k) ? 'Unmute Server' : 'Mute Server', icon: ico(isMuted(k) ? '🔔' : '🔕'), run: () => setMute(k, !isMuted(k)) });
  if (hasPerm(sv, 'change_nickname')) addMenuItem({ label: 'Change Nickname', icon: ico('✏️'), run: () => openNickname(sv, state.me.id) });
};
const _openChannelMenuM = openChannelMenu;
openChannelMenu = function (sv, chId, anchor) {
  _openChannelMenuM(sv, chId, anchor);
  const ch = sv.channels.find(c => c.id === chId);
  if (!ch || ch.type !== 'text') return;
  const k = 'ch:' + ch.id;
  addMenuItem({ label: isMuted(k) ? 'Unmute Channel' : 'Mute Channel', icon: ico(isMuted(k) ? '🔔' : '🔕'), run: () => setMute(k, !isMuted(k)) });
};

// ======================= server themes =======================
const SERVER_THEMES = {
  '': ['Zuno', '#202a29', '#1a2322', '#04c5ae'], lagoon: ['Lagoon', '#14292c', '#10211f', '#3fd3c3'], midnight: ['Midnight', '#141a2b', '#0f1422', '#7c8cff'],
  sunset: ['Sunset', '#2a1c22', '#22161b', '#ff8a5c'], forest: ['Forest', '#1a261b', '#142015', '#6fcf6a'], sakura: ['Sakura', '#2a1f27', '#22181f', '#ff8fcf'],
  ember: ['Ember', '#2a1a16', '#211410', '#ff6a3d'], ocean: ['Ocean', '#132433', '#0e1c29', '#3aaefc'], galaxy: ['Galaxy', '#1c1630', '#151027', '#b67cff'],
  mono: ['Mono', '#1e1f21', '#18191b', '#d4d4d8'], candy: ['Candy', '#2a1d2e', '#221725', '#f472b6'], dusk: ['Dusk', '#24202e', '#1c1925', '#f0b232'], matcha: ['Matcha', '#1f2620', '#192019', '#a3d977'],
};
function applyServerTheme() {
  const sv = state.currentServerId ? currentServer() : null;
  const t = sv?.theme || '';
  const root = document.documentElement;
  if (t) root.dataset.svtheme = t; else delete root.dataset.svtheme;
}
const _renderRailT = renderRail;
renderRail = function (...a) {
  _renderRailT(...a);
  applyServerTheme();
  // Muted servers don't show the unread dot.
  for (const b of $$('#server-rail [data-server]')) b.classList.toggle('sv-muted', isMuted('sv:' + b.dataset.server));
};
const _ssAppearanceT = ssAppearance;
ssAppearance = function (body, sv) {
  _ssAppearanceT(body, sv);
  const group = document.createElement('div');
  group.className = 'setting-group';
  group.innerHTML = `<h4 class="setting-head">Server theme</h4>
    <p class="muted small" style="margin:0 0 10px">Changes the colors of the whole app for everyone while they're in this server.</p>
    <div class="theme-grid">${Object.entries(SERVER_THEMES).map(([k, [name, main, side, acc]]) => `<button type="button" class="theme-tile${(sv.theme || '') === k ? ' on' : ''}" data-theme="${k}" style="--tm:${main};--ts:${side};--ta:${acc}">
      <span class="tt-prev"><i class="tt-side"></i><i class="tt-main"><b></b><b></b><b class="acc"></b></i></span><small>${esc(name)}</small></button>`).join('')}</div>`;
  const first = $('.setting-group', body);
  first ? first.before(group) : body.appendChild(group);
  $$('[data-theme]', group).forEach(b => b.addEventListener('click', async () => {
    try { await api('PATCH', `/api/servers/${sv.id}`, { theme: b.dataset.theme || null }); toast('Theme saved'); burst(b, 10); await refresh({}); }
    catch (e) { toast(e.message, true); }
  }));
};
SS_SETTINGS.push(['appearance', 'Server theme'], ['members', 'Nicknames'], ['members', 'Time out'], ['integrations', 'Zuno Bots'], ['integrations', 'AutoMod']);

// ======================= create a server from a template =======================
const TEMPLATES = [
  ['', '✨', 'Start from scratch', 'Just #general and a voice channel.'],
  ['friends', '💖', 'Friends', 'Memes, plans and a hangout spot.'],
  ['gaming', '🎮', 'Gaming', 'Squads, clips and looking-for-group.'],
  ['study', '📚', 'Study Group', 'Homework help, notes and quiet rooms.'],
  ['community', '🌍', 'Community', 'Rules, announcements and introductions.'],
  ['creators', '🎨', 'Creators', 'Share work, get feedback, find collabs.'],
];
const _openAddServerT = openAddServer;
openAddServer = function () {
  _openAddServerT();
  const ov = $('#layer .add-server');
  const cf = $('#create-form', ov);
  if (!cf) return;
  let picked = '';
  const grid = document.createElement('div');
  grid.className = 'tpl-grid';
  grid.innerHTML = TEMPLATES.map(([k, e, name, desc]) => `<button type="button" class="tpl${k === '' ? ' on' : ''}" data-tpl="${k}"><span class="tpl-e">${e}</span><b>${esc(name)}</b><small>${esc(desc)}</small></button>`).join('');
  cf.prepend(grid);
  const label = document.createElement('div');
  label.className = 'list-label'; label.textContent = 'Start with a template';
  cf.prepend(label);
  // Take over the create button so the template is applied right after the server is made.
  const fresh = cf.cloneNode(true);
  cf.replaceWith(fresh);
  $$('[data-tpl]', fresh).forEach(b => b.addEventListener('click', () => { picked = b.dataset.tpl; $$('[data-tpl]', fresh).forEach(x => x.classList.toggle('on', x === b)); fresh.name.focus(); }));
  fresh.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button.btn-primary', fresh); btn.disabled = true;
    try {
      let { server } = await api('POST', '/api/servers', { name: fresh.name.value });
      if (picked) server = (await api('POST', `/api/servers/${server.id}/template`, { template: picked })).server;
      state.servers.push(server);
      closeLayer();
      await openServer(server.id);
      burst($(`[data-server="${CSS.escape(server.id)}"]`), 18);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
  fresh.name.select();
};

// ======================= "get your server ready" checklist =======================
const guideDone = id => { try { return JSON.parse(localStorage.getItem('zuno_guide_done') || '{}')[id]; } catch { return false; } };
const hideGuide = id => { try { const d = JSON.parse(localStorage.getItem('zuno_guide_done') || '{}'); d[id] = 1; localStorage.setItem('zuno_guide_done', JSON.stringify(d)); } catch {} };
const _renderServerSidebarP = renderServerSidebar;
renderServerSidebar = function () {
  _renderServerSidebarP();
  const sv = currentServer();
  if (!sv) return;
  // Muted channels fade and don't show unread counts.
  for (const b of $$('#sidebar-scroll .ch-item[data-ch]')) {
    const m = isMuted('ch:' + b.dataset.ch) || isMuted('sv:' + sv.id);
    b.classList.toggle('ch-muted', m);
    if (m) $('.badge', b)?.remove();
  }
  for (const n of $$('#sidebar-scroll .ch-name')) {
    const ch = sv.channels.find(c => c.id === n.closest('[data-ch]')?.dataset.ch);
    if (ch && isMuted('ch:' + ch.id)) n.insertAdjacentHTML('afterend', '<span class="ch-flag" title="Muted">🔕</span>');
  }
  if (!isOwner(sv) || sv.official || guideDone(sv.id)) return;
  const steps = [
    ['icon', 'Give it an icon', !!sv.icon, () => openServerSettings(sv, 'overview')],
    ['invite', 'Invite your friends', sv.memberCount > 1, () => openInvite(sv)],
    ['theme', 'Pick a theme', !!sv.theme, () => openServerSettings(sv, 'appearance')],
    ['roles', 'Make a role', sv.roles.some(r => !r.everyone && !r.managed), () => openServerSettings(sv, 'roles')],
    ['bot', 'Add a Zuno bot', (sv.zunobots || []).length > 0, () => openServerSettings(sv, 'integrations')],
  ];
  const done = steps.filter(s => s[2]).length;
  if (done === steps.length) return hideGuide(sv.id);
  const card = document.createElement('div');
  card.className = 'sv-guide';
  card.innerHTML = `<div class="sg-head"><b>Get your server ready</b><button class="sg-x" title="Hide">✕</button></div>
    <div class="sg-bar"><i style="width:${(done / steps.length) * 100}%"></i></div>
    ${steps.map(([k, label, ok]) => `<button class="sg-step${ok ? ' ok' : ''}" data-step="${k}"><span>${ok ? '✓' : '○'}</span>${esc(label)}</button>`).join('')}`;
  const scroll = $('#sidebar-scroll');
  const banner = $('.sv-banner', scroll);
  banner ? banner.after(card) : scroll.prepend(card);
  $('.sg-x', card).addEventListener('click', () => { hideGuide(sv.id); card.remove(); });
  for (const [k, , , run] of steps) $(`[data-step="${k}"]`, card).addEventListener('click', run);
};

// ======================= Zuno Bots in Server Settings › Bots & Webhooks =======================
const _ssIntegrationsZ = ssIntegrations;
ssIntegrations = async function (body, sv) {
  await _ssIntegrationsZ(body, sv);
  let d;
  try { d = await api('GET', `/api/servers/${sv.id}/zunobots`); } catch { return; }
  const group = document.createElement('div');
  group.className = 'setting-group zb-group';
  group.innerHTML = `<h4 class="setting-head">Zuno Bots <span class="muted">ready to go, no code needed</span></h4>
    <p class="muted small" style="margin:0 0 12px">Made by Zuno. Add one with a click, then press Set Up to choose how it works.</p>
    <div class="zb-grid">${d.bots.map(b => `<div class="zb-card${b.added ? ' added' : ''}" data-zb="${b.key}">
      <div class="zb-top">${avatar({ id: b.id, displayName: b.name, avatar: b.avatar }, 40)}<div><b>${esc(b.name)}</b>${b.added ? '<span class="int-on">● in your server</span>' : ''}</div></div>
      <p>${esc(b.desc)}</p>
      <div class="zb-cmds">${b.commands.map(c => `<code title="${esc(c.description)}">/${esc(c.name)}</code>`).join(' ')}</div>
      ${b.added && typeof zbSummary46 === 'function' ? zbSummary46(b, sv) : ''}<div class="zb-acts">${b.added ? `${b.setup ?? ['guardian', 'greeter', 'levels', 'starboard'].includes(b.key) ? `<button class="btn ${b.saved ? 'btn-grey' : 'btn-primary'} btn-sm" data-zb-set>${b.saved ? 'Edit setup' : 'Set Up'}</button>` : ''}<button class="btn btn-grey btn-sm" data-zb-rm>Remove</button>` : '<button class="btn btn-primary btn-sm" data-zb-add>Add to Server</button>'}</div></div>`).join('')}</div>`;
  const root = $('[data-keep]', body) || body;
  const h2 = $('h2', root);
  h2 ? h2.after(group) : root.prepend(group);
  const redraw = async () => { await refresh({ serverId: sv.id }); ssIntegrations(body, svById(sv.id) || sv); };
  for (const card of $$('[data-zb]', group)) {
    const b = d.bots.find(x => x.key === card.dataset.zb);
    $('[data-zb-add]', card)?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { await api('POST', `/api/servers/${sv.id}/bots`, { botId: b.id }); toast(`${b.name} joined!`); burst(card, 14); await redraw(); if (b.setup ?? ['guardian', 'greeter', 'levels', 'starboard'].includes(b.key)) openZunoBotSetup(svById(sv.id), b, redraw); }
      catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
    $('[data-zb-rm]', card)?.addEventListener('click', () => confirmDialog(`Remove ${b.name}?`, 'It leaves the server. Its settings are kept if you add it back.', 'Remove', async () => {
      try { await api('DELETE', `/api/servers/${sv.id}/members/${b.id}`); toast(`${b.name} removed`); await redraw(); } catch (err) { toast(err.message, true); }
    }));
    $('[data-zb-set]', card)?.addEventListener('click', () => openZunoBotSetup(svById(sv.id) || sv, b, redraw));
  }
  // Bots made by Zuno are shown above, so leave them out of the list of other bots.
  for (const row of $$('.int-row[data-bot^="zbot_"]', body)) row.remove();
};
function openZunoBotSetup(sv, b, after) {
  const c = b.config;
  const text = sv.channels.filter(x => x.type === 'text');
  const chSel = (name, val, none = 'Same channel as the message') => `<select name="${name}" class="sc-select"><option value="">${none}</option>${text.map(x => `<option value="${esc(x.id)}"${x.id === val ? ' selected' : ''}>#${esc(x.name)}</option>`).join('')}</select>`;
  const roles = sv.roles.filter(r => !r.everyone && !r.managed && canEditRoleMe(sv, r));
  const roleSel = (name, val) => `<select name="${name}" class="sc-select"><option value="">None</option>${roles.map(r => `<option value="${esc(r.id)}"${r.id === val ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
  const tog = (name, title, desc) => `<label class="setting-row"><div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div><input type="checkbox" class="switch" name="${name}"${c[name] ? ' checked' : ''}></label>`;
  let fields = '';
  if (b.key === 'guardian') fields = `
    <label class="field">Blocked words <span class="hint">(comma-separated; whole words, or phrases with spaces)</span><textarea name="words" rows="2" placeholder="word1, word2, some phrase">${esc(c.words.join(', '))}</textarea></label>
    ${tog('invites', 'Block invite links', 'Stops links to other servers.')}${tog('links', 'Block all links', 'Only people who can manage messages can post links.')}
    ${tog('spam', 'Block spam', 'Too many messages in a few seconds, or the same message 3 times.')}${tog('caps', 'Block shouting', 'Messages that are mostly CAPITAL LETTERS.')}
    <label class="field">Most mentions in one message <span class="hint">(0 = no limit)</span><input name="mentions" type="number" min="0" max="50" value="${c.mentions}"></label>
    <label class="field">When someone breaks a rule<select name="timeoutMinutes" class="sc-select">${[[0, 'Just block the message'], [1, 'Block and time out for 1 minute'], [5, 'Block and time out for 5 minutes'], [10, 'Block and time out for 10 minutes'], [60, 'Block and time out for 1 hour'], [1440, 'Block and time out for 1 day']].map(([v, l]) => `<option value="${v}"${c.timeoutMinutes === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">Log blocked messages in${chSel('logChannelId', c.logChannelId, "Don't log")}</label>
    <p class="muted small">The owner and people who can manage messages are never blocked.</p>`;
  if (b.key === 'greeter') fields = `
    <label class="field">Welcome channel${chSel('channelId', c.channelId, 'The server\'s welcome channel')}</label>
    <label class="field">Message <span class="hint">({user} pings them, {name} is their name, {server} and {count} work too)</span><textarea name="message" rows="3" maxlength="500">${esc(c.message)}</textarea></label>
    <label class="field">Give new members a role${roleSel('roleId', c.roleId)}</label>
    <p class="muted small">Tip: you can turn off Zuno's own "just joined" message in Overview › Welcome messages.</p>`;
  if (b.key === 'levels') fields = `
    ${tog('announce', 'Announce level ups', 'Post a message when someone reaches a new level.')}
    <label class="field">Announce in${chSel('channelId', c.channelId)}</label>
    <div class="field">Role rewards <span class="hint">(give a role when someone reaches a level)</span>
      <div id="lv-rewards">${[...c.rewards, { level: '', roleId: '' }].map(r => `<div class="copy-row lv-row"><input type="number" min="1" max="200" placeholder="Level" value="${esc(r.level)}" data-lv>${roleSel('lvrole', r.roleId)}</div>`).join('')}</div>
      <button type="button" class="btn btn-link btn-sm" id="lv-more">＋ Add another</button></div>`;
  if (b.key === 'starboard') fields = `
    <label class="field">Starboard channel${chSel('channelId', c.channelId, 'Pick a channel')}</label>
    <label class="field">Stars needed<input name="threshold" type="number" min="1" max="50" value="${c.threshold}"></label>
    <label class="field">Emoji<div class="copy-row"><input name="emoji" maxlength="16" value="${esc(c.emoji)}"><button type="button" class="btn btn-grey btn-sm" id="sb-emoji">Pick</button></div></label>`;
  const ov = openLayer(`<form class="dialog modal zb-setup"><div class="ab-head">${avatar({ id: b.id, displayName: b.name, avatar: b.avatar }, 48)}<div><h3>Set up ${esc(b.name)}</h3><div class="muted small">${esc(b.desc)}</div></div></div>${fields}
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('#lv-more', ov)?.addEventListener('click', () => { const row = $('.lv-row', ov).cloneNode(true); $('[data-lv]', row).value = ''; $('select', row).value = ''; $('#lv-rewards', ov).appendChild(row); });
  $('#sb-emoji', ov)?.addEventListener('click', e => openEmojiPicker(e.currentTarget, x => (f.emoji.value = x)));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const config = {};
    for (const el of f.elements) {
      if (!el.name || el.name === 'lvrole') continue;
      config[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    }
    if (b.key === 'levels') config.rewards = $$('.lv-row', ov).map(r => ({ level: Number($('[data-lv]', r).value), roleId: $('select', r).value })).filter(r => r.level && r.roleId);
    try { await api('PUT', `/api/servers/${sv.id}/zunobots/${b.key}`, { config }); closeLayer(); toast(`${b.name} is set up`); after?.(); }
    catch (err) { toast(err.message, true); }
  });
}
