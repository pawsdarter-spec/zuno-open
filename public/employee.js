'use strict';
// Zuno Employee Dashboard. All authority is checked again by the server.
async function renderEmployeeDashboard(body) {
  if (!state.me?.isStaff) { body.innerHTML = '<h2>Employee Dashboard</h2><p class="muted">Staff access required.</p>'; return; }
  let auth;
  try { auth = await api('GET', '/api/employee/auth'); } catch (e) { body.innerHTML = `<h2>Employee Dashboard</h2><p class="emp-error">${esc(e.message)}</p>`; return; }
  if (!auth.authenticated) {
    body.innerHTML = `<div class="emp-head"><div><h2>Employee Dashboard</h2><p class="muted">Staff-only tools require an additional sign-in.</p></div><span class="emp-pill">STAFF ONLY</span></div><section class="emp-panel emp-auth-panel"><h3>Staff dashboard sign-in</h3><p class="muted small">Enter the staff dashboard password. You will only need to do this once per signed-in session; access expires after 12 hours.</p><form id="emp-auth-form"><label for="emp-auth-password">Dashboard password</label><input id="emp-auth-password" type="password" class="qs-input" autocomplete="current-password" required maxlength="256"><button class="btn btn-primary" type="submit">Unlock Employee Dashboard</button><p id="emp-auth-error" class="emp-error" role="alert"></p></form></section>`;
    const form = $('#emp-auth-form', body), input = $('#emp-auth-password', body), error = $('#emp-auth-error', body);
    form.addEventListener('submit', async e => { e.preventDefault(); const password = input.value; input.value = ''; error.textContent = ''; const button = form.querySelector('button'); button.disabled = true;
      try { await api('POST', '/api/employee/auth', { password }); await renderEmployeeDashboard(body); }
      catch (err) { error.textContent = err.message; input.focus(); }
      finally { button.disabled = false; }
    });
    input.focus(); return;
  }
  body.innerHTML = `<div class="emp-head"><div><h2>Employee Dashboard</h2><p class="muted">Manage accounts, profiles, badges and platform restrictions.</p></div><span class="emp-pill">STAFF ONLY · SIGNED IN</span></div>
    <section class="emp-panel"><h3>User management</h3><div class="emp-search"><input id="emp-search" class="qs-input" placeholder="Search by username, display name or user ID" autocomplete="off"><button class="btn btn-primary" id="emp-search-go">Search</button></div><div id="emp-results" class="emp-results"><p class="muted small">Search for a user to manage their account.</p></div></section>
    <section class="emp-panel"><h3>Username & server vanity policies</h3><p class="muted small">Put names on hold to reserve them, or blacklist usernames so they cannot be claimed.</p>
      <div class="emp-policy-form"><select id="emp-policy-kind"><option value="username">Username</option><option value="vanity">Server vanity</option></select><input id="emp-policy-name" class="qs-input" placeholder="Username or vanity"><select id="emp-policy-mode"><option value="hold">Put on hold</option><option value="blacklist">Blacklist username</option></select><button class="btn btn-primary" id="emp-policy-add">Apply</button></div><div id="emp-policies" class="emp-policies"><p class="muted small">Loading policies…</p></div></section>
    <p class="muted small">Actions are logged. Account bans require password confirmation. Use these tools only for legitimate Zuno staff duties.</p>`;
  const search = $('#emp-search', body), results = $('#emp-results', body), policies = $('#emp-policies', body);
  let selected = null, seq = 0;
  const runSearch = async () => {
    const q = search.value.trim();
    if (q.length < 2) { results.innerHTML = '<p class="muted small">Enter at least two characters.</p>'; return; }
    const n = ++seq; results.innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const d = await api('GET', `/api/employee/users?q=${encodeURIComponent(q)}`);
      if (n !== seq) return;
      results.innerHTML = d.users.length ? d.users.map(u => `<button class="emp-user" data-emp-user="${esc(u.id)}"><span><b>${esc(u.displayName)}</b><small>@${esc(u.username)} · ${esc(u.id)}</small></span><span class="emp-user-state">${u.banned ? 'Banned' : u.suspendedUntil > Date.now() ? 'Timed out' : u.dmOnly ? 'DM-only' : ''}</span></button>`).join('') : '<p class="muted small">No users found.</p>';
      results.querySelectorAll('[data-emp-user]').forEach(b => b.addEventListener('click', () => { const u = d.users.find(x => x.id === b.dataset.empUser); if (u) drawUser(u); }));
    } catch (e) { results.innerHTML = `<p class="emp-error">${esc(e.message)}</p>`; }
  };
  $('#emp-search-go', body).addEventListener('click', runSearch);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
  const refreshPolicies = async () => {
    try {
      const d = await api('GET', '/api/employee/policies');
      const rows = [];
      for (const [kind, entries] of [['username', d.policies.usernames || {}], ['vanity', d.policies.vanities || {}]]) for (const [name, p] of Object.entries(entries)) rows.push({ kind, name, p });
      policies.innerHTML = rows.length ? rows.map(x => `<div class="emp-policy"><span><b>${esc(x.name)}</b><small>${x.kind === 'vanity' ? 'Server vanity' : 'Username'} · ${esc(x.p.mode || 'hold')} · ${x.p.note ? esc(x.p.note) : 'No note'}</small></span><button class="btn btn-grey btn-sm" data-policy-remove="${esc(x.kind)}|${esc(x.name)}">Release</button></div>`).join('') : '<p class="muted small">No active name policies.</p>';
      policies.querySelectorAll('[data-policy-remove]').forEach(b => b.addEventListener('click', async () => {
        const [kind, name] = b.dataset.policyRemove.split('|');
        try { await api('POST', '/api/employee/policies', { kind, name, remove: true }); toast('Policy released'); refreshPolicies(); }
        catch (e) { toast(e.message, true); }
      }));
    } catch (e) { policies.innerHTML = `<p class="emp-error">${esc(e.message)}</p>`; }
  };
  const policyKind = $('#emp-policy-kind', body), policyMode = $('#emp-policy-mode', body);
  policyKind.addEventListener('change', () => { policyMode.disabled = policyKind.value === 'vanity'; if (policyMode.disabled) policyMode.value = 'hold'; });
  policyKind.dispatchEvent(new Event('change'));
  $('#emp-policy-add', body).addEventListener('click', async () => {
    const kind = $('#emp-policy-kind', body).value, name = $('#emp-policy-name', body).value.trim(), mode = $('#emp-policy-mode', body).value;
    if (!name) return toast('Enter a name first.', true);
    try { await api('POST', '/api/employee/policies', { kind, name, mode }); $('#emp-policy-name', body).value = ''; toast('Name policy saved'); refreshPolicies(); }
    catch (e) { toast(e.message, true); }
  });
  const drawUser = u => {
    selected = u;
    const badges = Object.entries(BADGE_INFO || {}).filter(([k]) => !k.startsWith('bloom') && k !== 'creator_dark' && (k !== 'staff' || state.me.isFounder || (state.me.badges || []).includes('zuno_manager')) && (k !== 'zuno_manager' || state.me.isFounder));
    const isStaffTarget = !!u.isStaff || (u.badges || []).includes('staff') || (u.badges || []).includes('zuno_manager');
    results.innerHTML = `<div class="emp-selected"><div class="emp-selected-top"><div><h4>${esc(u.displayName)}</h4><span class="muted">@${esc(u.username)} · ${esc(u.id)}</span></div><button class="btn btn-grey btn-sm" id="emp-clear">Clear</button></div>
      <div class="emp-status">${u.banned ? '<span class="red">Banned</span>' : u.suspendedUntil > Date.now() ? 'Timed out' : 'Account active'} · ${u.warnings || 0} warning(s) · ${u.dmOnly ? 'DM-only' : 'Standard server access'}${u.mutedUntil > Date.now() ? ' · Muted' : ''}</div>
      <div class="emp-sub"><h4>Profile identity</h4><div class="emp-fields"><label>Username<input id="emp-username" value="${esc(u.username)}" maxlength="32"></label><label>Display name<input id="emp-display" value="${esc(u.displayName)}" maxlength="32"></label><label>Pronouns<input id="emp-pronouns" value="${esc(u.pronouns || '')}" maxlength="24"></label></div><button class="btn btn-primary btn-sm" id="emp-profile-save">Save profile identity</button></div>
      <div class="emp-sub"><h4>Manage badges</h4><div class="emp-badges">${badges.map(([k, b]) => `<label class="emp-badge"><input type="checkbox" data-emp-badge="${esc(k)}"${(u.badges || []).includes(k) ? ' checked' : ''}><span class="emp-badge-icon">${b.svg || ''}</span><span>${esc(b.label || k)}</span></label>`).join('')}</div></div>
      <div class="emp-sub"><h4>Moderate profile</h4><p class="muted small">Remove profile content that violates Zuno's rules. The user is notified and the action is logged.</p><div class="emp-remove-grid">${[['bio','Bio'],['pronouns','Pronouns'],['displayName','Display name'],['avatar','Avatar'],['banner','Banner'],['background','Background'],['sound','Profile sound'],['widgets','All widgets']].map(([k,l]) => `<label><input type="checkbox" data-emp-remove="${k}"> ${l}</label>`).join('')}</div><input id="emp-profile-note" class="qs-input" placeholder="Reason (optional)"><button class="btn btn-grey btn-sm" id="emp-profile-remove">Remove selected profile content</button></div>
      <div class="emp-sub"><h4>Account actions</h4><div class="emp-actions"><button class="btn btn-grey btn-sm" data-emp-mod="warn">Warn</button><button class="btn btn-grey btn-sm" data-emp-mod="timeout">Timeout</button><button class="btn btn-danger btn-sm" data-emp-mod="ban">Ban account</button></div><div class="emp-fields"><label>Mute duration<select id="emp-mute-days"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="30">30 days</option><option value="365">365 days</option></select></label></div><div class="emp-actions"><button class="btn btn-grey btn-sm" id="emp-mute">Mute user</button><button class="btn btn-grey btn-sm" id="emp-unmute">Unmute</button></div><label class="emp-toggle"><input type="checkbox" id="emp-dmonly"${u.dmOnly ? ' checked' : ''}> Restrict to DMs and DM calls only (disable server messages and server voice calls)</label><button class="btn btn-primary btn-sm" id="emp-restrictions-save">Save restrictions</button></div>
      </div>`;
    $('#emp-clear', results).addEventListener('click', () => { selected = null; results.innerHTML = '<p class="muted small">Search for a user to manage their account.</p>'; });
    $('#emp-profile-save', results).addEventListener('click', async () => {
      try { const r = await api('POST', `/api/employee/users/${u.id}/profile`, { username: $('#emp-username', results).value, displayName: $('#emp-display', results).value, pronouns: $('#emp-pronouns', results).value }); Object.assign(u, r.user); state.users[u.id] = { ...state.users[u.id], ...r.user }; toast('Profile updated'); runSearch(); }
      catch (e) { toast(e.message, true); }
    });
    results.querySelectorAll('[data-emp-badge]').forEach(cb => cb.addEventListener('change', async () => {
      try { const r = await api('POST', `/api/users/${u.id}/badges`, { badge: cb.dataset.empBadge, on: cb.checked }); Object.assign(u, r.user); state.users[u.id] = { ...state.users[u.id], ...r.user }; toast('Badge updated'); }
      catch (e) { cb.checked = !cb.checked; toast(e.message, true); }
    }));
    $('#emp-profile-remove', results).addEventListener('click', async () => {
      const parts = [...results.querySelectorAll('[data-emp-remove]:checked')].map(x => x.dataset.empRemove);
      if (!parts.length) return toast('Select at least one profile item.', true);
      try { await api('POST', `/api/mod/users/${u.id}/profile`, { parts, note: $('#emp-profile-note', results).value }); toast('Selected profile content removed'); runSearch(); }
      catch (e) { toast(e.message, true); }
    });
    results.querySelectorAll('[data-emp-mod]').forEach(b => b.addEventListener('click', async () => {
      const action = b.dataset.empMod;
      if (action === 'ban' && !await confirmOver(`Ban @${u.username}?`, 'This removes the account and takes them out of every server. You can unban it from Moderation › Bans & Timeouts until its appeal time runs out.', 'Ban')) return;
      let note = '';
      if (typeof askReason53 === 'function') { note = await askReason53(action === 'warn' ? 'Warning reason' : action === 'timeout' ? 'Timeout reason' : 'Ban reason', action === 'ban'); if (note === null) return; }
      const extra = { note };
      if (action === 'timeout') extra.days = 1;
      try { await api('POST', `/api/mod/users/${u.id}`, { action, ...extra }); toast(action === 'ban' ? 'Account banned' : action === 'timeout' ? 'Account timed out' : 'Warning issued'); runSearch(); }
      catch (e) { toast(e.message, true); }
    }));
    $('#emp-mute', results).addEventListener('click', async () => {
      try { await api('POST', `/api/employee/users/${u.id}/restrictions`, { muteDays: Number($('#emp-mute-days', results).value) }); toast('User muted'); runSearch(); }
      catch (e) { toast(e.message, true); }
    });
    $('#emp-unmute', results).addEventListener('click', async () => {
      try { await api('POST', `/api/employee/users/${u.id}/restrictions`, { muteDays: 0 }); toast('User unmuted'); runSearch(); }
      catch (e) { toast(e.message, true); }
    });
    $('#emp-restrictions-save', results).addEventListener('click', async () => {
      try { await api('POST', `/api/employee/users/${u.id}/restrictions`, { dmOnly: $('#emp-dmonly', results).checked }); toast('Account restrictions saved'); runSearch(); }
      catch (e) { toast(e.message, true); }
    });
  };
  await refreshPolicies();
}

// Moderation (reports, appeals, bans & timeouts, servers…) uses the same staff tools, so it asks for
// the dashboard password first too; once unlocked it opens straight away.
async function renderModerationGated(body) {
  try {
    const a = await api('GET', '/api/employee/auth');
    if (a.authenticated) return renderModeration(body);
  } catch {}
  await renderEmployeeDashboard(body);
  const form = $('#emp-auth-form', body);
  if (form) form.addEventListener('submit', () => setTimeout(async () => { try { if ((await api('GET', '/api/employee/auth')).authenticated && $('.settings-nav [data-s="moderation"].active')) renderModeration(body); } catch {} }, 600));
}
