'use strict';
// Roles, permission overrides, the audit log, bots & webhooks in Server Settings,
// plus the role-aware member list and invite dialog.

const PERM_DESC = {
  administrator: 'Every permission, and skips every channel rule. Only give this to people you really trust.',
  view_channels: 'See channels and read what is posted in them.',
  manage_channels: 'Create, edit, reorder and delete channels and categories.',
  manage_roles: 'Create and edit roles below their own, and change channel permissions.',
  manage_server: "Change the server's name, icon, banner, discovery and safety settings.",
  view_audit_log: 'See the history of changes and moderation in this server.',
  manage_integrations: 'Add and remove bots, and make webhooks.',
  create_invites: 'Make invites to bring people in.',
  manage_invites: 'See and delete everyone’s invites, reset the main invite and pause invites.',
  kick_members: 'Remove people from the server (they can come back with an invite).',
  ban_members: 'Remove people and stop them from coming back.',
  send_messages: 'Post messages in text channels.',
  attach_files: 'Upload files and pictures.',
  add_reactions: 'Add new emoji reactions (anyone can join a reaction that is already there).',
  mention_everyone: 'Use @everyone, @here and ping any role, even ones that are not mentionable.',
  manage_messages: "Delete other people's messages and post in announcement channels.",
  read_history: 'Read messages sent before they joined. Without it, people only see new messages.',
  bypass_slowmode: 'Send messages without waiting for slowmode.',
  use_commands: 'Use bot slash commands like /ping.',
  connect: 'Join voice channels.',
  speak: 'Talk in voice channels. Without it, people join muted.',
  video: 'Turn on their camera or share their screen in voice channels.',
  change_nickname: 'Change their own nickname in this server.',
  manage_nicknames: "Change other people's nicknames (below their own role).",
  moderate_members: "Time people out: they can read, but can't talk, react or speak for a while.",
};
const PERM_GROUPS = ['General', 'Members', 'Text', 'Voice', 'Advanced'];
let PERM_INFO = null;
async function permInfo() {
  if (PERM_INFO) return PERM_INFO;
  try { PERM_INFO = (await api('GET', '/api/perms')).perms; } catch { PERM_INFO = {}; }
  return PERM_INFO;
}
const ROLE_SWATCHES = ['#04c5ae', '#1abc9c', '#2ecc71', '#3aaefc', '#5865f2', '#a37bff', '#9b59b6', '#eb459e', '#ff7b6b', '#e74c3c', '#e67e22', '#f0b232', '#95a5a6', '#607d8b'];
const roleMembers = (sv, rid) => Object.entries(sv.memberRoles || {}).filter(([, rs]) => rs.includes(rid)).map(([id]) => id);

// ======================= Roles =======================
let rolesUI = { sel: null, tab: 'display' };
async function ssRoles(body, sv) {
  await permInfo();
  if (!state.serverMembers[sv.id]) await loadServerMembers(sv.id);
  sv = svById(sv.id) || sv;
  if (!sv.roles.some(r => r.id === rolesUI.sel)) rolesUI.sel = sv.roles[0]?.id;
  const sel = sv.roles.find(r => r.id === rolesUI.sel) || sv.roles[sv.roles.length - 1];
  const myTop = myTopPos(sv);
  const editable = r => isOwner(sv) || (r.everyone ? hasPerm(sv, 'manage_roles') : sv.roles.indexOf(r) > myTop);
  body.innerHTML = `<div data-keep><h2>Roles</h2>
    <p class="muted" style="margin:-10px 0 16px">Roles give people permissions and a color. People get every permission from all their roles. Higher roles can manage lower ones, so drag to set the order. ${isOwner(sv) ? '' : '🔒 means the role is at or above yours.'}</p>
    <div class="roles-wrap">
      <div class="roles-list">
        <button class="btn btn-primary btn-sm btn-block" id="role-new">${ICON.plus} Create Role</button>
        <input class="qs-input" id="role-q" placeholder="Search roles" autocomplete="off">
        <div id="role-items">${sv.roles.map(r => `<div class="role-item${r.id === sel.id ? ' on' : ''}${editable(r) ? '' : ' locked'}" data-role="${esc(r.id)}"${!r.everyone && editable(r) ? ' draggable="true"' : ''}>
          ${!r.everyone ? '<span class="sc-grip">⋮⋮</span>' : ''}<span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span>
          <span class="ri-name">${roleIconHtml(r)}<span style="${esc(roleCss(r))}">${esc(r.name)}</span></span>${r.managed ? '<span class="official bot-tag">Bot</span>' : ''}
          <span class="ri-count">${r.everyone ? sv.memberCount : roleMembers(sv, r.id).length}</span>${editable(r) ? '' : '<span title="Above your highest role">' + uiIcon('lock') + '</span>'}</div>`).join('')}</div>
      </div>
      <div class="role-editor" id="role-editor"></div>
    </div></div>`;
  $('#role-new', body).addEventListener('click', async () => {
    try { const { role } = await api('POST', `/api/servers/${sv.id}/roles`, { name: 'new role', color: ROLE_SWATCHES[Math.floor(Math.random() * ROLE_SWATCHES.length)] }); rolesUI.sel = role.id; rolesUI.tab = 'display'; await refresh({}); ssRoles(body, svById(sv.id)); setTimeout(() => $('#re-name')?.select(), 50); }
    catch (e) { toast(e.message, true); }
  });
  $('#role-q', body).addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('.role-item', body).forEach(x => { x.style.display = $('.ri-name', x).textContent.toLowerCase().includes(q) ? '' : 'none'; }); });
  $$('.role-item', body).forEach(x => x.addEventListener('click', () => { rolesUI.sel = x.dataset.role; ssRoles(body, svById(sv.id)); }));
  // Drag to reorder
  let drag = null;
  $$('.role-item[draggable]', body).forEach(x => {
    x.addEventListener('dragstart', e => { drag = x.dataset.role; x.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    x.addEventListener('dragend', () => { x.classList.remove('dragging'); $$('.drop-before', body).forEach(n => n.classList.remove('drop-before')); });
  });
  $$('.role-item', body).forEach(x => {
    x.addEventListener('dragover', e => { if (!drag || x.dataset.role === drag) return; e.preventDefault(); $$('.drop-before', body).forEach(n => n.classList.remove('drop-before')); x.classList.add('drop-before'); });
    x.addEventListener('drop', async e => {
      e.preventDefault();
      if (!drag) return;
      const order = sv.roles.filter(r => !r.everyone).map(r => r.id).filter(id => id !== drag);
      const at = x.dataset.role === sv.id ? order.length : order.indexOf(x.dataset.role);
      order.splice(at < 0 ? order.length : at, 0, drag);
      drag = null;
      try { await api('PUT', `/api/servers/${sv.id}/roles-order`, { order }); await refresh({}); ssRoles(body, svById(sv.id)); } catch (err) { toast(err.message, true); }
    });
  });
  drawRoleEditor($('#role-editor', body), sv, sel, editable(sel), () => ssRoles(body, svById(sv.id)));
}
function drawRoleEditor(el, sv, role, canEdit, redraw) {
  const tab = role.everyone && rolesUI.tab === 'members' ? 'perms' : rolesUI.tab;
  const patch = async change => {
    try { await api('PATCH', `/api/servers/${sv.id}/roles/${role.id}`, change); await refresh({}); redraw(); }
    catch (e) { toast(e.message, true); redraw(); }
  };
  el.innerHTML = `<div class="re-head"><span class="role-dot big" style="--rc:${esc(role.color || '#9aa6a4')}${role.color2 ? `;background:linear-gradient(135deg,${esc(role.color)},${esc(role.color2)})` : ''}"></span><h3>${esc(role.everyone ? '@everyone' : role.name)}</h3>
      ${!role.everyone && !role.managed && canEdit ? `<button class="btn btn-link btn-sm danger" id="re-del">Delete Role</button>` : ''}</div>
    ${canEdit ? '' : '<div class="re-note">' + uiIcon('lock') + ' This role is at or above your highest role, so you can look but not change it.</div>'}
    ${role.managed ? '<div class="re-note">' + uiIcon('bot') + ' This role belongs to a bot. It goes away when the bot is removed.</div>' : ''}
    <div class="re-tabs">${[['display', 'Display'], ['perms', 'Permissions'], ['members', `Members (${roleMembers(sv, role.id).length})`]].filter(([k]) => !(role.everyone && k !== 'perms') && !(role.managed && k === 'members')).map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="re-body"></div>`;
  $$('[data-tab]', el).forEach(b => b.addEventListener('click', () => { rolesUI.tab = b.dataset.tab; drawRoleEditor(el, sv, role, canEdit, redraw); }));
  $('#re-del', el)?.addEventListener('click', () => confirmDialog(`Delete ${role.name}?`, `${roleMembers(sv, role.id).length} people will lose this role and its permissions.`, 'Delete Role', async () => {
    try { await api('DELETE', `/api/servers/${sv.id}/roles/${role.id}`); toast('Role deleted'); rolesUI.sel = null; await refresh({}); redraw(); } catch (e) { toast(e.message, true); }
  }));
  const rb = $('.re-body', el);
  const dis = canEdit ? '' : ' disabled';
  if (tab === 'display' && !role.everyone) {
    rb.innerHTML = `<label class="field">Role name<input id="re-name" maxlength="32" value="${esc(role.name)}"${dis}></label>
      <div class="field">Role color <span class="hint">(people show in the color of their highest colored role)</span>
        <div class="sv-colors">${['', ...ROLE_SWATCHES].map(c => `<button type="button" class="sv-color${(role.color || '') === c ? ' on' : ''}${c ? '' : ' none'}" data-rc="${c}" style="${c ? `background:${c}` : ''}"${dis}>${c ? '' : '✕'}</button>`).join('')}
        <label class="sv-color custom" title="Pick any color"><input type="color" id="re-color" value="${esc(role.color || '#04c5ae')}"${dis}></label></div></div>
      <div class="field">Gradient <span class="hint">(fade the name into a second color)</span>
        <div class="sv-colors">${['', ...ROLE_SWATCHES].map(c => `<button type="button" class="sv-color${(role.color2 || '') === c ? ' on' : ''}${c ? '' : ' none'}" data-rc2="${c}" style="${c ? `background:linear-gradient(135deg,${esc(role.color || '#9aa6a4')},${c})` : ''}"${dis || (!role.color ? ' disabled' : '')}>${c ? '' : '✕'}</button>`).join('')}
        <label class="sv-color custom" title="Pick any color"><input type="color" id="re-color2" value="${esc(role.color2 || '#a37bff')}"${dis || (!role.color ? ' disabled' : '')}></label></div>
        ${role.color ? '' : '<span class="hint">Pick a role color first.</span>'}</div>
      ${role.color ? (() => {
        // Why some people with this role don't show its color: a higher colored role wins.
        const pos = sv.roles.findIndex(x => x.id === role.id);
        const covered = roleMembers(sv, role.id).map(id => [id, sv.roles.find((x, i) => i < pos && !x.everyone && x.color && (sv.memberRoles?.[id] || []).includes(x.id))]).filter(([, r]) => r);
        if (!covered.length) return '';
        const by = [...new Set(covered.map(([, r]) => r.name))];
        return `<div class="re-note">${uiIcon('palette')} ${covered.length === 1 ? `${esc(user(covered[0][0])?.displayName || 'One person')} shows` : `${covered.length} people show`} the color of a higher role (<b>${by.map(esc).join('</b>, <b>')}</b>) instead. Drag this role above it in the role list to show this color.</div>`;
      })() : ''}
      <div class="field">Role icon <span class="hint">(an emoji or a small picture next to their name)</span>
        <div class="copy-row"><input id="re-icon" maxlength="8" value="${esc(role.icon || '')}" placeholder="e.g. ⭐"${dis}><button class="btn btn-grey btn-sm" id="re-icon-pick" type="button"${dis}>Emoji</button>
          <button class="btn btn-grey btn-sm" id="re-icon-img" type="button"${dis}>${role.iconUrl ? 'Change Picture' : 'Upload Picture'}</button>${role.iconUrl ? `<button class="btn btn-link btn-sm" id="re-icon-rm" type="button"${dis}>Remove picture</button>` : ''}</div>
        <input type="file" id="re-icon-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
        <span class="hint">Pictures show instead of the emoji. Square PNGs (64×64) look best.</span></div>
      <div class="re-preview"><span class="author" style="${esc(roleCss(role) || 'color:var(--header)')}">${esc(state.me.displayName)}</span>${roleIconHtml(role)}<span class="muted small"> · how names look in chat</span></div>
      ${ssToggle('hoist', 'Show separately in the member list', 'People with this role get their own group in the member list.', role.hoist)}
      ${ssToggle('mentionable', 'Let anyone @mention this role', 'Anyone can ping everyone with this role. People with "Mention @everyone" can always ping it.', role.mentionable)}
      ${role.everyone || role.managed ? '' : ssToggle('autoJoin', 'Give to people when they join', 'Everyone who joins the server gets this role automatically. Turning it on also gives it to everyone already in the server.', role.autoJoin)}`;
    if (!canEdit) $$('input', rb).forEach(i => (i.disabled = true));
    const name = $('#re-name', rb);
    name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });
    name.addEventListener('change', () => patch({ name: name.value }));
    $$('[data-rc]', rb).forEach(b => b.addEventListener('click', () => patch({ color: b.dataset.rc || null })));
    $('#re-color', rb).addEventListener('change', e => patch({ color: e.target.value }));
    $$('[data-rc2]', rb).forEach(b => b.addEventListener('click', () => patch({ color2: b.dataset.rc2 || null })));
    $('#re-color2', rb).addEventListener('change', e => patch({ color2: e.target.value }));
    $('#re-icon-img', rb).addEventListener('click', () => $('#re-icon-file', rb).click());
    $('#re-icon-file', rb).addEventListener('change', async e => {
      let file = e.target.files[0];
      if (!file) return;
      if (file.type !== 'image/gif' && window.openImageEditor) { const blob = await openImageEditor(file, { shape: 'circle', title: 'Adjust the role icon' }); if (!blob) return; file = new File([blob], 'icon.webp', { type: 'image/webp' }); }
      try {
        const res = await fetch(`/api/servers/${sv.id}/roles/${role.id}/icon`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
        const d = await res.json(); if (!res.ok) throw new Error(d.error);
        toast('Role icon updated'); await refresh({}); redraw();
      } catch (err) { toast(err.message, true); }
    });
    $('#re-icon-rm', rb)?.addEventListener('click', async () => { try { await api('DELETE', `/api/servers/${sv.id}/roles/${role.id}/icon`); await refresh({}); redraw(); } catch (err) { toast(err.message, true); } });
    $('#re-icon', rb).addEventListener('change', e => patch({ icon: e.target.value.trim() }));
    $('#re-icon-pick', rb).addEventListener('click', e => openEmojiPicker(e.currentTarget, emoji => patch({ icon: emoji }), { title: 'Pick a role icon' }));
    $('[name=hoist]', rb).addEventListener('change', e => patch({ hoist: e.target.checked }));
    $('[name=mentionable]', rb).addEventListener('change', e => patch({ mentionable: e.target.checked }));
    $('[name=autoJoin]', rb)?.addEventListener('change', e => {
      if (!e.target.checked) return patch({ autoJoin: false });
      e.target.checked = false;
      confirmDialog(`Give ${role.name} to everyone?`, `Everyone already in the server gets ${role.name} now, and everyone who joins later gets it too.`, 'Give to Everyone', () => patch({ autoJoin: true }));
    });
  } else if (tab === 'perms' || role.everyone) {
    const mine = svPerms(sv);
    const on = new Set(role.perms);
    rb.innerHTML = `${role.everyone ? '<p class="muted small" style="margin:0 0 10px">These are what <b>everyone</b> in the server can do. Other roles add to this.</p>' : ''}
      <input class="qs-input" id="re-pq" placeholder="Search permissions" autocomplete="off">
      ${PERM_GROUPS.map(g => {
        const keys = Object.entries(PERM_INFO).filter(([, v]) => v.group === g).map(([k]) => k).filter(k => !(role.everyone && k === 'administrator'));
        return keys.length ? `<h4 class="setting-head re-group">${g}</h4>${keys.map(k => {
          const locked = !canEdit || (!isOwner(sv) && !mine.has(k) && !on.has(k)) || (role.managed && !isOwner(sv));
          return `<label class="setting-row re-perm${k === 'administrator' ? ' admin' : ''}" data-perm="${k}"><div><b class="setting-title">${esc(PERM_INFO[k].label)}</b><div class="setting-desc">${esc(PERM_DESC[k] || '')}${locked && canEdit && !mine.has(k) ? ' <i>(you don\'t have this one)</i>' : ''}</div></div><input type="checkbox" class="switch" data-p="${k}"${on.has(k) ? ' checked' : ''}${locked ? ' disabled' : ''}></label>`;
        }).join('')}` : '';
      }).join('')}
      ${canEdit && !role.managed ? '<button class="btn btn-grey btn-sm" id="re-clear" style="margin-top:12px">Clear all permissions</button>' : ''}`;
    $('#re-pq', rb).addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('.re-perm', rb).forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });
    $$('[data-p]', rb).forEach(cb => cb.addEventListener('change', () => {
      const next = new Set(role.perms);
      cb.checked ? next.add(cb.dataset.p) : next.delete(cb.dataset.p);
      const go = () => patch({ perms: [...next] });
      if (cb.dataset.p === 'administrator' && cb.checked) { cb.checked = false; confirmDialog('Give Administrator?', 'People with this role can do anything, including deleting channels and banning people. Only give it to people you trust completely.', 'Give Administrator', go); }
      else go();
    }));
    $('#re-clear', rb)?.addEventListener('click', () => patch({ perms: [] }));
  } else if (tab === 'members') {
    const ids = roleMembers(sv, role.id);
    rb.innerHTML = `${canEdit ? '<button class="btn btn-primary btn-sm" id="re-add">Add Members</button>' : ''}
      <div class="re-members">${ids.map(id => { const u = user(id); return u ? `<div class="fp-row">${avatar(u, 32, true)}<div class="fp-who"><b>${esc(u.displayName)}</b><small>${esc(u.username)}</small></div>${canEdit && !rolesLockedMe(sv, id) ? `<button class="icon-btn" data-rm="${esc(id)}" title="Remove from role">✕</button>` : ''}</div>` : ''; }).join('') || '<div class="fp-empty">Nobody has this role yet.</div>'}</div>`;
    $$('[data-rm]', rb).forEach(b => b.addEventListener('click', async () => { await setMemberRoles(sv, b.dataset.rm, (sv.memberRoles?.[b.dataset.rm] || []).filter(x => x !== role.id)); redraw(); }));
    $('#re-add', rb)?.addEventListener('click', () => openAddRoleMembers(sv, role, redraw));
  }
}
function openAddRoleMembers(sv, role, done) {
  const ids = (state.serverMembers[sv.id] || []).filter(id => !(sv.memberRoles?.[id] || []).includes(role.id) && !user(id)?.bot && !rolesLockedMe(sv, id));
  const ov = openLayer(`<div class="dialog modal find-people"><h3>Add to ${esc(role.name)}</h3>
    <input class="qs-input fp-input" placeholder="Search members" autocomplete="off"><div class="fp-list"></div>
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="ok">Add</button></div></div>`);
  const picked = new Set();
  const draw = q => {
    $('.fp-list', ov).innerHTML = ids.map(user).filter(Boolean).filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q)).map(u => `<label class="fp-row pick">${avatar(u, 32)}<div class="fp-who"><b>${esc(u.displayName)}</b><small>${esc(u.username)}</small></div><input type="checkbox" value="${esc(u.id)}"${picked.has(u.id) ? ' checked' : ''}></label>`).join('') || '<div class="fp-empty">Nobody to add.</div>';
    $$('.fp-list input', ov).forEach(i => i.addEventListener('change', () => (i.checked ? picked.add(i.value) : picked.delete(i.value))));
  };
  $('.fp-input', ov).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  draw('');
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('[data-a=ok]', ov).addEventListener('click', async () => {
    for (const id of picked) { try { await api('PUT', `/api/servers/${sv.id}/members/${id}/roles`, { roles: [...(sv.memberRoles?.[id] || []), role.id] }); } catch (e) { toast(e.message, true); } }
    closeLayer(); await refresh({ serverId: sv.id });
    openServerSettings(svById(sv.id), 'roles');
    toast(`Added ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`);
  });
}

// ======================= channel & category permissions =======================
const CH_PERMS = {
  text: ['view_channels', 'manage_channels', 'manage_roles', 'create_invites', 'send_messages', 'attach_files', 'add_reactions', 'mention_everyone', 'manage_messages', 'read_history', 'bypass_slowmode', 'use_commands'],
  voice: ['view_channels', 'manage_channels', 'manage_roles', 'create_invites', 'connect', 'speak', 'video'],
};
CH_PERMS.category = [...new Set([...CH_PERMS.text, ...CH_PERMS.voice])];
async function openPermEditor(sv, target) {
  await permInfo();
  if (!state.serverMembers[sv.id]) await loadServerMembers(sv.id);
  sv = svById(sv.id) || sv;
  const ch = target.kind === 'channel' ? sv.channels.find(c => c.id === target.id) : null;
  const cat = target.kind === 'category' ? sv.categories.find(c => c.id === target.id) : ch?.categoryId ? sv.categories.find(c => c.id === ch.categoryId) : null;
  if (!ch && !cat) return;
  const synced = !!(ch && cat && ch.synced !== false);
  let list = JSON.parse(JSON.stringify((ch ? (synced ? cat.overrides : ch.overrides) : cat.overrides) || []));
  if (!list.some(o => o.id === sv.id)) list.unshift({ id: sv.id, type: 'role', allow: [], deny: [] });
  let sel = sv.id, dirty = false;
  const keys = ch ? CH_PERMS[ch.type] : CH_PERMS.category;
  const nameOf = o => (o.type === 'member' ? user(o.id)?.displayName || 'Someone' : o.id === sv.id ? '@everyone' : sv.roles.find(r => r.id === o.id)?.name || 'Deleted role');
  const colorOf = o => (o.type === 'role' ? sv.roles.find(r => r.id === o.id)?.color || '#9aa6a4' : null);
  const title = ch ? `${ch.type === 'voice' ? '🔊 ' : '#'}${ch.name}` : cat.name;
  const ov = openLayer(`<div class="dialog modal perm-editor"><h3>${esc(title)} · Permissions</h3>
    ${ch && cat ? `<div class="pe-sync${synced ? ' on' : ''}" id="pe-sync">${synced ? `${uiIcon('chain')} Synced with <b>${esc(cat.name)}</b>. Changing anything here gives this channel its own permissions.` : `This channel has its own permissions. <button class="btn btn-link btn-sm" id="pe-resync">Sync with ${esc(cat.name)}</button>`}</div>` : ''}
    ${!ch ? '<div class="pe-sync">Channels in this category that are synced follow these permissions.</div>' : ''}
    <div class="pe-quick"><label class="setting-row"><div><div class="setting-title">${LOCK} Private ${ch ? 'channel' : 'category'}</div><div class="setting-desc">Hide it from @everyone. Then add the roles or people who can see it.</div></div><input type="checkbox" class="switch" id="pe-private"></label></div>
    <div class="pe-wrap"><div class="pe-targets"><div class="pe-tlist"></div><button class="btn btn-grey btn-sm btn-block" id="pe-add">${ICON.plus} Add role or member</button></div>
      <div class="pe-perms"></div></div>
    <div class="actions"><span class="muted small pe-legend"><b class="tri deny">✕</b> deny · <b class="tri pass">/</b> follow roles · <b class="tri allow">✓</b> allow</span><span style="flex:1"></span><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="save">Save Changes</button></div></div>`);
  const draw = () => {
    const everyone = list.find(o => o.id === sv.id);
    $('#pe-private', ov).checked = everyone.deny.includes('view_channels');
    $('.pe-tlist', ov).innerHTML = list.map(o => `<button class="pe-t${o.id === sel ? ' on' : ''}" data-t="${esc(o.id)}">${o.type === 'member' ? avatar(user(o.id) || { displayName: '?' }, 20) : `<span class="role-dot" style="--rc:${esc(colorOf(o))}"></span>`}<span>${esc(nameOf(o))}</span>${o.allow.length || o.deny.length ? `<small>${o.allow.length ? '✓' + o.allow.length : ''}${o.deny.length ? ' ✕' + o.deny.length : ''}</small>` : ''}</button>`).join('');
    const o = list.find(x => x.id === sel) || everyone;
    $('.pe-perms', ov).innerHTML = `<div class="pe-phead"><b>${esc(nameOf(o))}</b>${o.id !== sv.id ? '<button class="btn btn-link btn-sm danger" id="pe-rm">Remove</button>' : ''}</div>
      ${keys.map(k => { const st = o.allow.includes(k) ? 'allow' : o.deny.includes(k) ? 'deny' : 'pass';
        return `<div class="pe-row" data-k="${k}"><div><b>${esc(PERM_INFO[k]?.label || k)}</b><small>${esc(PERM_DESC[k] || '')}</small></div>
          <div class="tri-group">${['deny', 'pass', 'allow'].map(s => `<button class="tri ${s}${st === s ? ' on' : ''}" data-s="${s}" title="${s === 'pass' ? 'Follow roles' : s}">${s === 'deny' ? '✕' : s === 'allow' ? '✓' : '/'}</button>`).join('')}</div></div>`; }).join('')}`;
    $$('.pe-t', ov).forEach(b => b.addEventListener('click', () => { sel = b.dataset.t; draw(); }));
    $$('.pe-row', ov).forEach(r => $$('.tri', r).forEach(b => b.addEventListener('click', () => {
      const k = r.dataset.k;
      o.allow = o.allow.filter(x => x !== k); o.deny = o.deny.filter(x => x !== k);
      if (b.dataset.s === 'allow') o.allow.push(k); else if (b.dataset.s === 'deny') o.deny.push(k);
      dirty = true; draw();
    })));
    $('#pe-rm', ov)?.addEventListener('click', () => { list = list.filter(x => x !== o); sel = sv.id; dirty = true; draw(); });
  };
  $('#pe-private', ov).addEventListener('change', e => {
    const everyone = list.find(o => o.id === sv.id);
    everyone.allow = everyone.allow.filter(x => x !== 'view_channels'); everyone.deny = everyone.deny.filter(x => x !== 'view_channels');
    if (e.target.checked) {
      everyone.deny.push('view_channels');
      // Keep yourself in, so you don't lock yourself out.
      if (!isOwner(sv) && !list.some(o => o.id === state.me.id)) list.push({ id: state.me.id, type: 'member', allow: ['view_channels'], deny: [] });
    }
    dirty = true; draw();
  });
  $('#pe-add', ov).addEventListener('click', e => {
    const roles = sv.roles.filter(r => !r.everyone && !list.some(o => o.id === r.id)).map(r => ({ label: r.name, icon: `<span class="role-dot" style="--rc:${esc(r.color || '#9aa6a4')}"></span>`, run: () => { list.push({ id: r.id, type: 'role', allow: [], deny: [] }); sel = r.id; dirty = true; draw(); } }));
    const people = (state.serverMembers[sv.id] || []).filter(id => !list.some(o => o.id === id)).map(user).filter(Boolean).slice(0, 25).map(u => ({ label: u.displayName, icon: avatar(u, 18), run: () => { list.push({ id: u.id, type: 'member', allow: [], deny: [] }); sel = u.id; dirty = true; draw(); } }));
    openMenuOver(e.currentTarget, [...roles, ...(roles.length && people.length ? ['sep'] : []), ...people]);
  });
  $('#pe-resync', ov)?.addEventListener('click', async () => {
    try { await api('PUT', `/api/channels/${ch.id}/overrides`, { synced: true }); toast(`Synced with ${cat.name}`); closeLayer(); await refresh({}); } catch (e) { toast(e.message, true); }
  });
  $('[data-a=cancel]', ov).addEventListener('click', () => (dirty ? confirmDialog('Discard changes?', "You changed some permissions but didn't save.", 'Discard', closeLayer) : dismissLayer()));
  $('[data-a=save]', ov).addEventListener('click', async () => {
    const clean = list.filter(o => o.id === sv.id || o.allow.length || o.deny.length);
    try {
      if (ch) await api('PUT', `/api/channels/${ch.id}/overrides`, { overrides: clean });
      else await api('PUT', `/api/servers/${sv.id}/categories/${cat.id}/overrides`, { overrides: clean });
      closeLayer(); toast('Permissions saved'); await refresh({});
      if (svSettings && svSettings.id === sv.id && $('.server-settings-page')) showServerSection(svSettings.section);
    } catch (e) { toast(e.message, true); }
  });
  draw();
}

// ======================= Audit Log =======================
const AUDIT_ICON = { server_update: '⚙️', channel_create: '➕', channel_update: '✏️', channel_delete: '🗑️', channel_perms: '🔐', category_create: '📁', category_update: '✏️', category_delete: '🗑️', category_perms: '🔐', layout: '↕️', role_create: '🎨', role_update: '🎨', role_delete: '🗑️', role_order: '↕️', member_roles: '🏷️', member_kick: '👢', member_ban: '🔨', member_unban: '🕊️', invite_create: '💌', invite_delete: '✂️', message_delete: '🧹', bot_add: '🤖', bot_remove: '🤖', webhook_create: '🪝', webhook_update: '🪝', webhook_delete: '🪝', ownership: '👑', automod_block: '🛡️', automod_update: '🛡️', sticker_create: '🖼️', sticker_delete: '🖼️', event_create: '📅', event_update: '📅', event_delete: '📅', emoji_create: '😀', emoji_delete: '😀', sound_create: '🔊', sound_delete: '🔊', member_nick: '✏️', member_timeout: '⏳', member_untimeout: '⏳', bot_config: '🤖', member_warn: '⚠️', member_unwarn: '🧽', channel_lock: '🔒', channel_unlock: '🔓', message_purge: '🧹' };
const AUDIT_KEYS = { name: 'name', iconColor: 'icon color', bannerColor: 'banner color', accentColor: 'accent color', description: 'description', welcomeMessages: 'welcome messages', welcomeChannelId: 'welcome channel', rulesChannelId: 'rules channel', invitesPaused: 'paused invites', minAccountAge: 'minimum account age', tags: 'tags', vanity: 'custom invite', discoverable: 'Discover listing', topic: 'topic', slowmode: 'slowmode', readOnly: 'announcement mode', nsfw: 'age limit', userLimit: 'user limit', categoryId: 'category', color: 'color', hoist: 'show separately', mentionable: 'mentionable', icon: 'icon', perms: 'permissions' };
const auditDetail = e => (['server_update', 'channel_update', 'role_update'].includes(e.action) ? 'Changed ' + e.detail.split(', ').map(k => AUDIT_KEYS[k] || k).join(', ') : e.detail);
const AUDIT_RANGES = [['', 'Any time'], ['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];
async function ssAudit(body, sv, filters = { action: '', userId: '', q: '', days: '' }) {
  const since = filters.days ? Date.now() - Number(filters.days) * 864e5 : 0;
  const load = async before => api('GET', `/api/servers/${sv.id}/audit?action=${encodeURIComponent(filters.action)}&userId=${encodeURIComponent(filters.userId)}&q=${encodeURIComponent(filters.q || '')}${since ? '&since=' + since : ''}${before ? '&before=' + before : ''}`);
  let d;
  try { d = await load(); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  if (!state.serverMembers[sv.id]) await loadServerMembers(sv.id);
  const row = e => `<div class="audit-row"><span class="au-ico">${AUDIT_ICON[e.action] || '•'}</span>${avatar(e.byUser || { displayName: '?' }, 32)}
    <div class="au-text"><div><b>${esc(e.byUser?.displayName || 'Someone')}</b> ${esc(e.label)}${e.target?.name ? ` <b>${e.target.type === 'channel' ? '#' : ''}${esc(e.target.name)}</b>` : ''}</div>
      ${e.detail ? `<div class="muted small">${esc(auditDetail(e))}</div>` : ''}</div><span class="muted small au-time">${fmtTime(e.at)}</span></div>`;
  body.innerHTML = `<h2>Audit Log</h2>
    <p class="muted" style="margin:-10px 0 14px">Every change to the server and every moderation action, newest first.</p>
    <div class="ss-mtools au-tools"><input class="au-search" id="au-q" placeholder="Search the audit log" value="${esc(filters.q || '')}" autocomplete="off"><select class="sc-select" id="au-action"><option value="">All actions</option>${Object.entries(d.actions).map(([k, l]) => `<option value="${k}"${filters.action === k ? ' selected' : ''}>${AUDIT_ICON[k] || ''} ${esc(l[0].toUpperCase() + l.slice(1))}</option>`).join('')}</select>
      <select class="sc-select" id="au-user"><option value="">Everyone</option>${(state.serverMembers[sv.id] || []).map(user).filter(Boolean).map(u => `<option value="${esc(u.id)}"${filters.userId === u.id ? ' selected' : ''}>${esc(u.displayName)}</option>`).join('')}</select>
      <select class="sc-select" id="au-days">${AUDIT_RANGES.map(([v, l]) => `<option value="${v}"${(filters.days || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div id="au-list">${d.entries.length ? d.entries.map(row).join('') : `<div class="empty-state">${mascot('sleepy')}<div class="title">${filters.q || filters.action || filters.userId || filters.days ? 'No matches' : 'Nothing here yet'}</div><div>${filters.q || filters.action || filters.userId || filters.days ? 'Try a different search or filter.' : 'Changes and moderation will show up here.'}</div></div>`}</div>
    ${d.hasMore ? '<button class="btn btn-grey btn-sm" id="au-more" style="margin-top:12px">Load more</button>' : ''}`;
  $('#au-action', body).addEventListener('change', e => ssAudit(body, sv, { ...filters, action: e.target.value }));
  $('#au-user', body).addEventListener('change', e => ssAudit(body, sv, { ...filters, userId: e.target.value }));
  $('#au-days', body).addEventListener('change', e => ssAudit(body, sv, { ...filters, days: e.target.value }));
  let qt;
  $('#au-q', body).addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(async () => { await ssAudit(body, sv, { ...filters, q: e.target.value.trim() }); const q = $('#au-q', body); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); });
  let last = d.entries[d.entries.length - 1]?.at;
  $('#au-more', body)?.addEventListener('click', async e => {
    try { const more = await load(last); $('#au-list', body).insertAdjacentHTML('beforeend', more.entries.map(row).join('')); last = more.entries[more.entries.length - 1]?.at; if (!more.hasMore) e.target.remove(); } catch (err) { toast(err.message, true); }
  });
}

// ======================= Bots & Webhooks =======================
async function ssIntegrations(body, sv) {
  let d;
  try { d = await api('GET', `/api/servers/${sv.id}/integrations`); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const text = sv.channels.filter(c => c.type === 'text');
  body.innerHTML = `<div data-keep><h2>Bots & Webhooks</h2>
    <div class="setting-group"><h4 class="setting-head">Bots <span class="muted">${d.bots.length}</span></h4>
      <p class="muted small" style="margin:0 0 10px">Bots are accounts run by code. They follow the permissions of their role. Anyone can make one in Settings › Developer.</p>
      <form class="copy-row" id="bot-add"><input name="bot" placeholder="Bot ID or zuno.bot/… link" autocomplete="off" spellcheck="false"><button class="btn btn-primary btn-sm">Add Bot</button></form>
      <button class="btn btn-link btn-sm" id="bot-browse" style="padding-left:0">Browse public bots</button>
      <div class="int-list">${d.bots.map(b => `<div class="int-row" data-bot="${esc(b.id)}">${avatar({ ...b, displayName: b.name }, 36)}<div class="int-who"><span class="int-line"><b>${esc(b.name)}</b> <span class="official bot-tag">Bot</span> ${b.online ? '<span class="int-on">● online</span>' : '<span class="muted small">offline</span>'}</span>
          <small>${esc(b.description || 'No description')}${b.addedVia ? ` · ${esc(b.addedVia)}` : ''}</small>
          ${(b.commands || []).length ? `<div class="int-cmds">${b.commands.map(c => `<code>/${esc(c.name)}</code>`).join(' ')}</div>` : ''}</div>
          ${b.role ? `<button class="btn btn-grey btn-sm" data-botrole="${esc(b.role.id)}">Permissions</button>` : ''}${hasPerm(sv, 'kick_members') ? '<button class="btn btn-red btn-sm" data-botkick>Remove</button>' : ''}</div>`).join('') || '<div class="fp-empty">No bots in this server yet.</div>'}</div>
    </div>
    <div class="setting-group"><h4 class="setting-head">Webhooks <span class="muted">${d.webhooks.length}</span></h4>
      <p class="muted small" style="margin:0 0 10px">A webhook is a secret link that posts into a channel. Paste it into GitHub, a game server, a form… anything that can send a web request.</p>
      <form class="inv-make" id="wh-new"><label class="field">Name<input name="name" maxlength="32" placeholder="Captain Hook"></label>
        <label class="field">Channel<select name="channelId" class="sc-select">${text.map(c => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('')}</select></label>
        <button class="btn btn-primary btn-sm">Create Webhook</button></form>
      <div id="wh-made"></div>
      <div class="int-list">${d.webhooks.map(w => `<div class="int-row" data-wh="${esc(w.id)}">${avatar({ id: 'wh_' + w.id, displayName: w.name, avatar: w.avatar }, 36)}
        <div class="int-who"><input class="wh-name" value="${esc(w.name)}" maxlength="32"><small>#${esc(w.channelName)} · made by ${esc(w.by?.displayName || '?')} · ${w.uses} post${w.uses === 1 ? '' : 's'}</small></div>
        <select class="sc-select wh-ch">${text.map(c => `<option value="${esc(c.id)}"${c.id === w.channelId ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}</select>
        <button class="btn btn-grey btn-sm" data-whurl title="Makes a new secret link (the old one stops working)">New Link</button><button class="icon-btn danger" data-whdel title="Delete">${ICON.trash}</button></div>`).join('') || '<div class="fp-empty">No webhooks yet.</div>'}</div>
    </div></div>`;
  const redraw = () => ssIntegrations(body, svById(sv.id) || sv);
  $('#bot-add', body).addEventListener('submit', e => { e.preventDefault(); const v = e.target.bot.value.trim().split('/').pop(); if (v) addBotToServer(v, sv.id, redraw); });
  $('#bot-browse', body).addEventListener('click', () => openBotDirectory(sv.id, redraw));
  $$('[data-botrole]', body).forEach(b => b.addEventListener('click', () => { rolesUI.sel = b.dataset.botrole; rolesUI.tab = 'perms'; showServerSection('roles'); }));
  $$('[data-botkick]', body).forEach(b => b.addEventListener('click', () => {
    const id = b.closest('[data-bot]').dataset.bot;
    confirmDialog('Remove this bot?', 'It leaves the server and its role is deleted. You can add it again later.', 'Remove', async () => { try { await api('DELETE', `/api/servers/${sv.id}/members/${id}`); toast('Bot removed'); await refresh({}); redraw(); } catch (e) { toast(e.message, true); } });
  }));
  const showUrl = (url, name) => {
    const full = location.origin + url;
    $('#wh-made', body).innerHTML = `<div class="wh-made"><b>🔑 ${esc(name)}'s secret link</b> <span class="muted small">Copy it now. For safety, Zuno won't show it again.</span>
      <div class="copy-row"><input readonly value="${esc(full)}"><button class="btn btn-primary btn-sm" id="wh-copy">Copy</button></div>
      <pre class="code-sample">curl -X POST "${esc(full)}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"content": "Hello from a webhook! 👋", "username": "Optional name"}'</pre></div>`;
    $('#wh-copy', body).addEventListener('click', e => { copyText(full, 'Webhook link'); e.target.textContent = 'Copied!'; });
  };
  $('#wh-new', body).addEventListener('submit', async e => {
    e.preventDefault();
    try { const { webhook } = await api('POST', `/api/servers/${sv.id}/webhooks`, { name: e.target.name.value, channelId: e.target.channelId.value }); await redraw(); showUrl(webhook.url, webhook.name); }
    catch (err) { toast(err.message, true); }
  });
  $$('[data-wh]', body).forEach(r => {
    const id = r.dataset.wh;
    const patch = async change => { try { const { webhook } = await api('PATCH', `/api/servers/${sv.id}/webhooks/${id}`, change); if (webhook.url) { await redraw(); showUrl(webhook.url, webhook.name); } else toast('Webhook saved'); } catch (e) { toast(e.message, true); } };
    $('.wh-name', r).addEventListener('change', e => patch({ name: e.target.value }));
    $('.wh-ch', r).addEventListener('change', e => patch({ channelId: e.target.value }));
    $('[data-whurl]', r).addEventListener('click', () => confirmDialog('Make a new link?', 'The current link stops working right away. Anything using it will need the new one.', 'Make New Link', () => patch({ newUrl: true })));
    $('[data-whdel]', r).addEventListener('click', () => confirmDialog('Delete webhook?', 'Its link stops working. Messages it already posted stay.', 'Delete', async () => { try { await api('DELETE', `/api/servers/${sv.id}/webhooks/${id}`); toast('Webhook deleted'); redraw(); } catch (e) { toast(e.message, true); } }));
  });
}
// Add a bot: shows what it's asking for, and you pick which permissions to give it.
async function addBotToServer(botId, serverId = null, after) {
  let d;
  try { d = await api('GET', `/api/apps/${encodeURIComponent(botId)}/public`); } catch (e) { return toast(e.message, true); }
  await permInfo();
  const servers = d.servers.filter(s => !s.has);
  if (!servers.length) return toast(d.servers.length ? `${d.app.name} is already in every server you can add bots to.` : "You need the Manage Bots & Webhooks permission in a server to add bots.", true);
  const ov = openLayer(`<form class="dialog modal add-bot">
    <div class="ab-head">${avatar({ ...d.app, displayName: d.app.name }, 64)}<div><h3>${esc(d.app.name)} <span class="official bot-tag">Bot</span></h3><div class="muted small">made by ${esc(d.app.owner?.displayName || '?')}</div></div></div>
    <p class="muted">${esc(d.app.description || 'This bot has no description.')}</p>
    <label class="field">Add to server<select name="server" class="sc-select">${servers.map(s => `<option value="${esc(s.id)}"${s.id === serverId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <div class="field">It wants to be able to:</div>
    <div class="ab-perms">${d.app.perms.map(p => `<label class="priv-role"><input type="checkbox" value="${p}" checked> ${esc(PERM_INFO[p]?.label || p)}</label>`).join('') || '<span class="muted small">Nothing special.</span>'}</div>
    <p class="muted small">You can only give permissions you have. You can change them later in Roles.</p>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Add Bot</button></div></form>`);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('form', ov).addEventListener('submit', async e => {
    e.preventDefault();
    const sid = e.target.server.value;
    try { await api('POST', `/api/servers/${sid}/bots`, { botId: d.app.id, perms: $$('.ab-perms input:checked', ov).map(i => i.value) }); closeLayer(); toast(`${d.app.name} joined!`); await refresh({ serverId: sid }); after?.(); }
    catch (err) { toast(err.message, true); }
  });
}
async function openBotDirectory(serverId, after) {
  const ov = openLayer(`<div class="dialog modal find-people bot-dir"><h3>🤖 Public bots</h3>
    <input class="qs-input fp-input" placeholder="Search bots" autocomplete="off"><div class="fp-list"><div class="fp-empty">Loading…</div></div></div>`);
  let t;
  const draw = async q => {
    try {
      const { apps } = await api('GET', `/api/apps-directory?q=${encodeURIComponent(q || '')}`);
      $('.fp-list', ov).innerHTML = apps.map(a => `<div class="fp-row">${avatar({ ...a, displayName: a.name }, 36)}<div class="fp-who"><b>${esc(a.name)}</b><small>${esc(a.description || '')} · in ${a.serverCount} server${a.serverCount === 1 ? '' : 's'}</small></div><button class="btn btn-primary btn-sm" data-add="${esc(a.id)}">Add</button></div>`).join('') || '<div class="fp-empty">No public bots yet. Make one in Settings › Developer!</div>';
      $$('[data-add]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); addBotToServer(b.dataset.add, serverId, after); }));
    } catch (e) { $('.fp-list', ov).innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; }
  };
  $('.fp-input', ov).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => draw(e.target.value), 250); });
  draw('');
}

// ======================= member list grouped by roles =======================
renderMemberList = function () {
  const el = $('#profile-panel');
  const sv = currentServer();
  if (!el || !sv || state.view.type !== 'channel') return;
  const ch = currentChannel();
  const ids = state.serverMembers[sv.id] || [];
  const members = ids.map(user).filter(Boolean).sort((a, b) => nameIn(a, sv).localeCompare(nameIn(b, sv)));
  const hoisted = sv.roles.filter(r => !r.everyone && r.hoist);
  const groupOf = u => hoisted.find(r => (sv.memberRoles?.[u.id] || []).includes(r.id));
  const row = u => {
    const muted = (sv.timeouts?.[u.id] || 0) > Date.now();
    return `<button class="member${u.status === 'offline' ? ' off' : ''}" data-member="${esc(u.id)}">
      <span class="on-panel-2">${avatar(u, 32, true)}</span>
      <span class="m-meta"><span class="m-name"><span class="m-nm"${nameStyle(u)}>${esc(nameIn(u, sv))}</span>${roleIconFor(u.id)}${muted ? '<i class="m-timeout" title="Timed out">⏳</i>' : ''}${u.id === sv.ownerId ? `<i class="crown" title="Server Owner">${ICON.crown}</i>` : ''}${botTag(u)}</span>
      ${u.customStatus ? `<span class="m-sub">${esc(statusLine(u))}</span>` : ''}</span></button>`;
  };
  const online = members.filter(u => u.status !== 'offline'), offline = members.filter(u => u.status === 'offline');
  let html = '';
  for (const r of hoisted) { const list = online.filter(u => groupOf(u) === r); if (list.length) html += `<div class="list-label"${r.color ? ` style="--rc:${esc(r.color)}"` : ''}>${roleIconHtml(r)}${esc(r.name)} — ${list.length}</div>${list.map(row).join('')}`; }
  const rest = online.filter(u => !groupOf(u));
  if (rest.length) html += `<div class="list-label">Online — ${rest.length}</div>${rest.map(row).join('')}`;
  if (offline.length) html += `<div class="list-label">Offline — ${offline.length}</div>${offline.map(row).join('')}`;
  el.innerHTML = `<div class="members">${ch && isPrivateCh(sv, ch) ? `<div class="m-private">${LOCK} Private channel</div>` : ''}${html}</div>`;
  $$('[data-member]', el).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.member)));
  $$('[data-member]', el).forEach(b => b.addEventListener('contextmenu', e => { e.preventDefault(); openMemberMenu(sv, b.dataset.member, atPoint(e)); }));
};
function openMemberMenu(sv, id, anchor) {
  const u = user(id);
  const items = [{ label: 'Profile', icon: ico('👤'), run: () => openProfile(id) }];
  if (id !== state.me.id && isFriend(id)) items.push({ label: 'Message', icon: ico('💬'), run: () => openDM(id) });
  else if (id !== state.me.id && !u?.bot) items.push({ label: 'Send Message Request', icon: ico('✉️'), run: () => openDM(id) });
  if (u && !u.bot && id !== state.me.id) items.push({ label: 'Mention', icon: ico('@'), run: () => { const ta = $('#composer-input'); if (ta) { ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + '@' + u.username + ' '; ta.focus(); ta.dispatchEvent(new Event('input')); } } });
  const above = outranksMe(sv, id);
  if (hasPerm(sv, 'manage_roles') && id !== sv.ownerId && (id === state.me.id || !rolesLockedMe(sv, id))) items.push({ label: 'Roles…', icon: ico('🏷️'), run: () => openRolePicker(sv, id, anchor) });
  if (id !== state.me.id && id !== sv.ownerId && !above) {
    const mod = [];
    if (hasPerm(sv, 'kick_members')) mod.push({ label: u?.bot ? 'Remove Bot' : 'Kick from Server', danger: true, run: () => kickMember(sv, id) });
    if (hasPerm(sv, 'ban_members')) mod.push({ label: 'Ban from Server', danger: true, run: () => openServerBan(sv, id) });
    if (mod.length) items.push('sep', ...mod);
  }
  items.push('sep', { label: 'Copy User ID', icon: ico('#️⃣'), run: () => copyText(id, 'User ID') });
  openMenu(anchor, items);
}

// ======================= invite dialog =======================
openInvite = async function (sv, channelId = null) {
  if (!hasPerm(sv, 'create_invites')) return toast("You don't have permission to invite people here.", true);
  if (!sv.invite) await loadServerMembers(sv.id);
  sv = svById(sv.id) || sv;
  let code = sv.vanity || sv.invite;
  if (channelId) { try { code = (await api('POST', `/api/servers/${sv.id}/invites`, { maxAge: 604800, maxUses: 0, channelId })).invite.code; } catch (e) { return toast(e.message, true); } }
  const ch = channelId ? sv.channels.find(c => c.id === channelId) : null;
  const ov = openLayer(`<div class="dialog modal invite-dialog">
    <h3>Invite friends to ${esc(sv.name)}${ch ? ` <span class="muted">#${esc(ch.name)}</span>` : ''}</h3>
    <p class="muted" style="margin:0 0 14px">Send them this invite. They paste it in Add a Server, or just click it in chat.</p>
    <div class="copy-row"><input readonly value="${esc(inviteText(code))}" id="invite-code"><button class="btn btn-primary btn-sm" id="copy-invite">Copy</button></div>
    <p class="muted small" id="inv-desc">${channelId ? 'Expires in 7 days.' : 'This invite never expires.'} <a href="#" id="inv-edit">Edit invite link</a></p>
    <form class="inv-make hidden" id="inv-opts"><label class="field">Expires after<select name="maxAge" class="sc-select">${Object.entries(AGE_LABEL).map(([v, l]) => `<option value="${v}"${v === '604800' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Max uses<select name="maxUses" class="sc-select">${Object.entries(USES_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><button class="btn btn-primary btn-sm">Make Link</button></form>
    ${state.friends.length ? `<div class="list-label" style="margin-top:18px">Or send it to a friend</div>
    <div class="invite-friends">${state.friends.map(user).filter(u => u && !u.bot).map(u => `<div class="invite-friend">${avatar(u, 32)}<span>${esc(u.displayName)}</span><button class="btn btn-grey btn-sm" data-send-invite="${esc(u.id)}">Send</button></div>`).join('')}</div>` : ''}
  </div>`);
  $('#copy-invite', ov).addEventListener('click', async e => {
    try { await navigator.clipboard.writeText($('#invite-code').value); } catch { $('#invite-code').select(); document.execCommand('copy'); }
    e.target.textContent = 'Copied!'; burst(e.target, 8);
    setTimeout(() => { if (e.target.isConnected) e.target.textContent = 'Copy'; }, 1600);
  });
  $('#inv-edit', ov).addEventListener('click', e => { e.preventDefault(); $('#inv-opts', ov).classList.toggle('hidden'); });
  $('#inv-opts', ov).addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const { invite } = await api('POST', `/api/servers/${sv.id}/invites`, { maxAge: Number(e.target.maxAge.value), maxUses: Number(e.target.maxUses.value), channelId });
      code = invite.code; $('#invite-code', ov).value = inviteText(code);
      $('#inv-desc', ov).innerHTML = `${untilText(invite.expiresAt)}${invite.maxUses ? ` · ${invite.maxUses} uses` : ''}. <a href="#" id="inv-edit2">Edit invite link</a>`;
      $('#inv-edit2', ov).addEventListener('click', ev => { ev.preventDefault(); $('#inv-opts', ov).classList.toggle('hidden'); });
      $('#inv-opts', ov).classList.add('hidden'); toast('New invite ready');
    } catch (err) { toast(err.message, true); }
  });
  $$('[data-send-invite]', ov).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('POST', `/api/dms/${b.dataset.sendInvite}/messages`, { content: `Join me in **${sv.name}** on Zuno! Invite: ${inviteText(code)}` }); b.textContent = 'Sent'; }
    catch (e) { toast(e.message, true); b.disabled = false; }
  }));
};

// Live audit refresh while the Audit Log is open.
(function waitEs() {
  if (!state.es) return setTimeout(waitEs, 1000);
  const hook = es => es.addEventListener('audit', e => { const d = JSON.parse(e.data); if (svSettings?.id === d.serverId && svSettings.section === 'audit' && $('#au-list')) ssAudit($('#ss-body'), svById(d.serverId)); });
  hook(state.es);
  const _connect = connect;
  connect = function () { _connect(); hook(state.es); };
})();
