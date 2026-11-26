'use strict';
// Accounts: password & email, devices you're logged in on, forgot password and reset links,
// email checks, search in User Settings, and the staff Setup Status page.

// ======================= start-up =======================
const _startA = start;
start = async function () {
  await _startA();
  await loadExtras();
  renderRail();
  if (state.currentServerId) renderServerSidebar();
};
const _connectA = connect;
connect = function () {
  _connectA();
  state.es.addEventListener('extras', () => loadExtras());
  state.es.addEventListener('pins', e => { const d = JSON.parse(e.data || '{}'); if (typeof onPinsChanged === 'function') onPinsChanged(d.conv); });
};

// ======================= reset & email links (/reset?token=…, /verify?token=…) =======================
const linkToken = new URLSearchParams(location.search).get('token');
const onResetPage = /^\/reset\/?$/.test(location.pathname) && linkToken;
if (onResetPage) state.token = null; // show the reset form even if someone is logged in here
if (/^\/verify\/?$/.test(location.pathname) && linkToken) {
  history.replaceState(null, '', '/');
  api('POST', '/api/verify-email', { token: linkToken })
    .then(r => { toast(`Email confirmed: ${r.email}`); if (state.extras) state.extras.emailVerified = true; })
    .catch(e => toast(e.message, true));
}
const _showAuthA = showAuth;
showAuth = function () {
  _showAuthA();
  if (!$('#auth-forgot')) {
    $('#auth-error').insertAdjacentHTML('beforebegin', '<a href="#" class="small login-only" id="auth-forgot">Forgot your password?</a>');
    $('#auth-forgot').addEventListener('click', e => { e.preventDefault(); openForgot(); });
  }
  if (onResetPage && !showAuth.done) { showAuth.done = true; openResetForm(); }
};
function openForgot() {
  const ov = openLayer(`<form class="dialog modal"><h3>Forgot your password?</h3>
    <p class="muted" style="margin:0 0 12px">Type your email or username. If emails are set up, we'll send you a link to pick a new password.</p>
    <label class="field">Email or username<input name="login" required autocomplete="username" autocapitalize="off"></label>
    <div id="fg-msg" class="muted small"></div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Close</button><button class="btn btn-primary">Send Link</button></div></form>`);
  const f = $('form', ov);
  f.login.value = $('#auth-form [name=username]')?.value || '';
  f.login.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { const r = await api('POST', '/api/password/forgot', { login: f.login.value }); $('#fg-msg', ov).textContent = r.message; $('#fg-msg', ov).classList.add('fg-ok'); }
    catch (err) { $('#fg-msg', ov).textContent = err.message; }
  });
}
function openResetForm() {
  const ov = openLayer(`<form class="dialog modal reset-dialog">${mascot('happy')}<h3>Pick a new password</h3>
    <p class="muted" style="margin:0 0 12px">You'll be logged out everywhere else, and logged in here.</p>
    <label class="field">New password<input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
    <label class="field">Type it again<input name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
    <div class="form-error" id="rs-err"></div>
    <div class="actions"><button class="btn btn-primary">Save Password</button></div></form>`);
  const f = $('form', ov);
  f.pw.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f.pw.value !== f.pw2.value) return ($('#rs-err', ov).textContent = "Those passwords don't match.");
    try {
      const { token } = await api('POST', '/api/password/reset', { token: linkToken, password: f.pw.value });
      history.replaceState(null, '', '/');
      state.token = token; localStorage.setItem('zuno_token', token);
      closeLayer(); await start(); toast('Password changed. Welcome back!');
    } catch (err) { $('#rs-err', ov).textContent = err.message; }
  });
}

// ======================= My Account: password, email, devices =======================
const _showSettingsSectionA = showSettingsSection;
showSettingsSection = function (section) {
  if (section === 'setup') {
    if (settingsDraft && isDraftDirty()) return closeSettings(); // flashes the save bar
    $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === 'setup'));
    return renderSetupStatus($('#settings-body'));
  }
  _showSettingsSectionA(section);
  if (section === 'account' && $('#settings-body .account-card')) renderSecurity($('#settings-body'));
};
function deviceName(agent) {
  if (!agent) return 'Unknown device';
  const os = /Windows/.test(agent) ? 'Windows' : /iPhone|iPad/.test(agent) ? 'iPhone' : /Android/.test(agent) ? 'Android' : /Mac OS/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'Device';
  const app = /Electron|Zuno\//.test(agent) ? 'Zuno app' : /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  return `${app} on ${os}`;
}
async function renderSecurity(body) {
  const me = state.me, ex = state.extras || {};
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="setting-group"><h4 class="setting-head">Email</h4>
      <div class="setting-row"><div><div class="setting-title">${esc(me.email || 'No email')}${me.email ? (ex.emailVerified ? ' <span class="ok-pill">✓ Confirmed</span>' : ' <span class="warn-pill">Not confirmed</span>') : ''}</div>
        <div class="setting-desc">Used to log in and to reset your password. Only you can see it.</div></div>
        <div class="row-btns">${me.email && !ex.emailVerified && ex.emailReady ? '<button class="btn btn-grey btn-sm" id="sec-verify">Send confirmation</button>' : ''}<button class="btn btn-grey btn-sm" id="sec-email">Change Email</button></div></div></div>
    <div class="setting-group"><h4 class="setting-head">Password</h4>
      <form id="sec-pw" class="sec-pw"><label class="field">Current password<input name="current" type="password" required autocomplete="current-password"></label>
        <label class="field">New password<input name="next" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="field">Type it again<input name="next2" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn btn-primary btn-sm">Change Password</button><span class="muted small"> You'll stay logged in here. Other devices get logged out.</span></form></div>
    <div class="setting-group"><h4 class="setting-head">Devices <span class="muted" id="sec-count"></span></h4>
      <p class="muted small" style="margin:0 0 10px">Everywhere you're logged in. Don't recognize one? Log it out and change your password. Devices you don't use for 60 days log out on their own.</p>
      <div id="sec-devices" class="sec-devices"><div class="fp-empty">Loading…</div></div>
      <button class="btn btn-red btn-sm" id="sec-others" style="margin-top:10px">Log Out All Other Devices</button></div>`;
  body.appendChild(wrap);
  const f = $('#sec-pw', wrap);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f.next.value !== f.next2.value) return toast("The new passwords don't match.", true);
    try { await api('POST', '/api/me/password', { current: f.current.value, next: f.next.value }); f.reset(); toast('Password changed'); drawDevices(); }
    catch (err) { toast(err.message, true); }
  });
  $('#sec-email', wrap).addEventListener('click', openChangeEmail);
  $('#sec-verify', wrap)?.addEventListener('click', async e => { try { await api('POST', '/api/me/verify-email'); e.target.textContent = 'Sent! Check your inbox'; e.target.disabled = true; } catch (err) { toast(err.message, true); } });
  $('#sec-others', wrap).addEventListener('click', () => confirmDialog('Log out everywhere else?', 'Every other device and browser will be logged out right away.', 'Log Out Others', async () => {
    try { await api('POST', '/api/me/sessions/logout-others'); toast('Other devices logged out'); drawDevices(); } catch (err) { toast(err.message, true); }
  }));
  async function drawDevices() {
    const box = $('#sec-devices', wrap);
    if (!box) return;
    try {
      const { sessions } = await api('GET', '/api/me/sessions');
      $('#sec-count', wrap).textContent = sessions.length;
      box.innerHTML = sessions.map(s => `<div class="sec-dev" data-sid="${esc(s.id)}"><span class="sec-ico">${uiIcon(/iPhone|Android/.test(s.agent) ? 'phone' : /Electron|Zuno/.test(s.agent) ? 'monitor' : 'laptop')}</span>
        <div style="flex:1;min-width:0"><b>${esc(deviceName(s.agent))}</b>${s.current ? ' <span class="ok-pill">This device</span>' : ''}
          <div class="muted small">${s.lastSeen ? `Last active ${fmtTime(s.lastSeen)}` : ''}${s.createdAt ? ` · logged in ${fmtDay(s.createdAt)}` : ''}${s.network ? ` · network ${esc(s.network)}` : ''}</div></div>
        ${s.current ? '' : '<button class="icon-btn danger" data-out title="Log out this device">✕</button>'}</div>`).join('');
      $$('[data-out]', box).forEach(b => b.addEventListener('click', async () => { try { await api('DELETE', `/api/me/sessions/${b.closest('[data-sid]').dataset.sid}`); drawDevices(); } catch (err) { toast(err.message, true); } }));
      $('#sec-others', wrap).classList.toggle('hidden', sessions.length < 2);
    } catch (err) { box.innerHTML = `<div class="fp-empty">${esc(err.message)}</div>`; }
  }
  drawDevices();
}
function openChangeEmail() {
  const ov = openLayer(`<form class="dialog modal"><h3>Change your email</h3>
    <label class="field">New email<input name="email" type="email" required maxlength="254" autocapitalize="off"></label>
    <label class="field">Your password<input name="password" type="password" required autocomplete="current-password"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  const f = $('form', ov);
  f.email.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { const { me } = await api('POST', '/api/me/email', { email: f.email.value, password: f.password.value }); state.me = { ...state.me, ...me }; state.extras.emailVerified = false; closeLayer(); openSettings('account'); toast('Email changed'); }
    catch (err) { toast(err.message, true); }
  });
}

// ======================= search in User Settings =======================
const US_WORDS = {
  account: 'account email password security devices sessions log out username',
  profile: 'profile avatar banner background sound bio about pronouns decoration effect custom status name color theme',
  media: 'profile effects sounds volume autoplay animations gif video',
  privacy: 'privacy safety block blocked message requests spam dms',
  standing: 'standing warnings timeout ban',
  employee: 'employee staff dashboard users badges profiles pronouns display name username mute ban blacklist hold vanity moderation',
  bloom: 'bloom subscription perks gift premium',
  appearance: 'appearance accent color theme compact cozy text size font bubbles classic reduce motion',
  notifications: 'notifications sound desktop pop-up',
  chat: 'chat typing enter send shortcuts keyboard',
  about: 'about version update terms',
  developer: 'developer bots token api apps',
  bugs: 'report bug problem broken',
  setup: 'setup status server environment keys email turn gifs stripe',
};
const _openSettingsA = openSettings;
openSettings = function (section) {
  _openSettingsA(section);
  const nav = $('.settings:not(.server-settings-page) .settings-nav > div');
  if (!nav) return;
  if (state.me.isStaff && !$('[data-s="setup"]', nav)) {
    const b = document.createElement('button');
    b.dataset.s = 'setup'; b.textContent = 'Setup Status';
    $('[data-s="employee"]', nav)?.after(b);
    b.addEventListener('click', () => showSettingsSection('setup'));
  }
  const box = document.createElement('div');
  box.className = 'ss-search';
  box.innerHTML = '<input id="us-q" placeholder="Search settings" autocomplete="off" spellcheck="false"><kbd>/</kbd>';
  nav.prepend(box);
  const q = $('#us-q', box);
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    for (const b of $$('[data-s]', nav)) {
      const hit = !t || b.textContent.toLowerCase().includes(t) || (US_WORDS[b.dataset.s] || '').includes(t);
      b.classList.toggle('hidden', !hit);
    }
    for (const h of $$('h5', nav)) h.classList.toggle('hidden', !!t);
  });
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') $$('[data-s]', nav).find(b => !b.classList.contains('hidden'))?.click();
    if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; q.dispatchEvent(new Event('input')); }
  });
  const slash = e => {
    if (!nav.isConnected) return document.removeEventListener('keydown', slash);
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); q.focus(); }
  };
  document.addEventListener('keydown', slash);
};

// ======================= Setup Status (staff) =======================
async function renderSetupStatus(body) {
  settingsDraft = null;
  body.innerHTML = '<h2>Setup Status</h2><div class="fp-empty">Checking…</div>';
  let d;
  try { d = await api('GET', '/api/admin/status'); } catch (e) { body.innerHTML = `<h2>Setup Status</h2><p>${esc(e.message)}</p>`; return; }
  const mbs = n => `${(n / 1e6).toFixed(1)} MB`;
  const done = d.checks.filter(c => c.ok).length;
  body.innerHTML = `<h2>Setup Status</h2>
    <p class="muted" style="margin:-8px 0 16px">What's turned on for this Zuno server, and how to turn on the rest. Keys go in the Render dashboard under <b>Environment</b>, never in the code.</p>
    <div class="setup-stats"><div><b>${esc(d.version)}</b><small>version</small></div><div><b>${d.users}</b><small>people</small></div><div><b>${d.online}</b><small>online now</small></div><div><b>${d.servers}</b><small>servers</small></div><div><b>${mbs(d.dbSize)}</b><small>database</small></div><div><b>${mbs(d.uploadsSize)}</b><small>uploads</small></div></div>
    <div class="setting-group"><h4 class="setting-head">Checklist <span class="muted">${done}/${d.checks.length}</span></h4>
      ${d.checks.map(c => `<div class="setup-row${c.ok ? ' ok' : ''}"><span class="setup-ico">${c.ok ? '✓' : '!'}</span><div><b>${esc(c.label)}</b><div class="muted small">${c.ok ? 'Working.' : esc(c.fix)}</div></div></div>`).join('')}</div>
    <div class="setting-group"><h4 class="setting-head">Backups</h4>
      <p class="muted small" style="margin:0">Zuno copies its database once a day and keeps the last 3 days on the server's disk.${d.backups.length ? ` Latest: <b>${esc(d.backups[d.backups.length - 1])}</b>.` : ' None yet.'} If the database ever breaks, Zuno starts from the newest backup by itself.</p></div>`;
}

// ======================= keyboard shortcuts (Ctrl+/) =======================
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '/' && state.me) {
    e.preventDefault();
    const list = [['Ctrl', 'K', 'Quick switcher'], ['Ctrl', 'F', 'Search this chat'], ['Ctrl', '/', 'Show these shortcuts'], ['↑', '', 'Edit your last message'], ['Shift', 'Enter', 'New line'], ['Esc', '', 'Close or cancel'], ['/', '', 'Search settings (in Settings)'], ['Shift', 'Click delete', 'Delete without asking']];
    const ov = openLayer(`<div class="dialog modal"><h3>⌨️ Keyboard shortcuts</h3><div class="shortcuts">${list.map(([a, b, d]) => `<div class="shortcut"><span>${d}</span><span><kbd>${a}</kbd>${b ? `<kbd>${b}</kbd>` : ''}</span></div>`).join('')}</div>
      <div class="actions"><button class="btn btn-primary" data-a="ok">Got it</button></div></div>`);
    $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  }
});
