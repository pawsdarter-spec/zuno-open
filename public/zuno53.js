'use strict';
// Zuno 0.53: a simpler Moderation area (bans & timeouts in one place, lifting server bans and
// timeouts, servers and ownership), deleting your account, the dark Verified Creator badge,
// loading sketches shaped like what's coming, and a lighter chat.

// ======================= badges keep their color (all of them) =======================
// zuno32.js gives each copy of a badge its own gradient ids, but only for badges that existed when
// it ran. Badges added later (Verified Creator, Bot Developer, the artist ones…) shared one id, so a
// hidden copy made every other copy lose its color (the creator badge showed as a black box).
function uniqueBadgeIds53() {
  let n = 0;
  for (const info of Object.values(BADGE_INFO)) {
    const d = Object.getOwnPropertyDescriptor(info, 'svg');
    if (!d || d.get || typeof d.value !== 'string') continue;
    let raw = d.value;
    Object.defineProperty(info, 'svg', {
      configurable: true, enumerable: true,
      get() {
        if (!/\sid="/.test(raw)) return raw;
        const s = '_c' + (++n).toString(36);
        return raw.replace(/\sid="([^"]+)"/g, ` id="$1${s}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${s})`).replace(/href="#([^"]+)"/g, `href="#$1${s}"`);
      },
      set(v) { raw = v; },
    });
  }
}

// The Verified Creator badge in dark (a choice in My Account for people who have it).
BADGE_INFO.creator_dark = {
  label: 'Verified Creator', desc: 'Makes videos about Zuno',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgCreatorDk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient></defs>
    <rect x="1.8" y="4" width="20.4" height="16" rx="5" fill="url(#bgCreatorDk)" stroke="#3a3f45" stroke-width=".8"/>
    <path d="M9.6 8.6v6.8c0 .6.6.9 1.1.6l5.4-3.4c.5-.3.5-.9 0-1.2l-5.4-3.4c-.5-.3-1.1 0-1.1.6z" fill="#fff"/>
    <circle cx="19.2" cy="18.6" r="4" fill="#2fbf71" stroke="#0c1312" stroke-width="1.2"/><path d="m17.4 18.6 1.3 1.3 2.3-2.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
uniqueBadgeIds53();
{
  const _badgeRow53 = badgeRow;
  badgeRow = function (u, ...a) {
    if (u?.creatorDark && (u.badges || []).includes('creator')) u = { ...u, badges: u.badges.map(b => (b === 'creator' ? 'creator_dark' : b)) };
    return _badgeRow53(u, ...a);
  };
}
// My Account › Verified Creator: pick the badge's look.
{
  const _cc53 = creatorCard37;
  creatorCard37 = async function (body, ...a) {
    const r = await _cc53(body, ...a);
    const card = $('.cr37', body);
    if (!card || !card.querySelector('.cr37-state.ok') || $('.cb53', card)) return r;
    const dark = !!state.me.creatorDark;
    const box = document.createElement('div');
    box.className = 'cb53';
    const look = d => `<button type="button" class="cb53-opt${d === dark ? ' on' : ''}" data-dark="${d ? 1 : 0}"><span class="pbadge">${BADGE_INFO[d ? 'creator_dark' : 'creator'].svg}</span>${d ? 'Dark' : 'Red'}</button>`;
    box.innerHTML = `<span class="muted small">Badge look</span>${look(false)}${look(true)}`;
    card.appendChild(box);
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-dark]');
      if (!b || b.classList.contains('on')) return;
      try {
        const { me } = await api('PATCH', '/api/me', { creatorDark: b.dataset.dark === '1' });
        state.me = me; state.users[me.id] = { ...state.users[me.id], ...me };
        $$('.cb53-opt', box).forEach(x => x.classList.toggle('on', x === b));
        toast('Badge look saved');
      } catch (err) { toast(err.message, true); }
    });
    return r;
  };
}

// ======================= little helpers =======================
// A window over Settings (z-index above it), closed with Esc or a click outside.
function over53(html, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'overlay ov53';
  ov.style.zIndex = 190;
  ov.innerHTML = `<div class="dialog modal ${cls}">${html}</div>`;
  ($('#layer') || document.body).appendChild(ov);
  const close = () => { ov.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (!ov.isConnected) return removeEventListener('keydown', onKey, true); if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  return { ov, close, box: ov.firstElementChild };
}
const inDays53 = t => {
  const ms = t - Date.now();
  if (ms <= 0) return 'now';
  const h = ms / 3600e3;
  return h < 1 ? `in ${Math.max(1, Math.round(ms / 60e3))} min` : h < 48 ? `in ${Math.round(h)} h` : `in ${Math.round(h / 24)} days`;
};
const svIcon53 = (sv, size = 32) => `<span class="sv53-ic" style="width:${size}px;height:${size}px;background:${esc(sv.iconColor || '#2b3a3a')}">${serverIcon(sv, size)}</span>`;

// ======================= loading sketches =======================
// Grey shapes like what's about to show (messages, a list of people, cards…) instead of a few bars.
function skel53(kind, n = 0) {
  const rnd = i => [72, 54, 86, 40, 64, 78, 48][i % 7];
  if (kind === 'messages') return `<div class="sk53 sk53-msgs" aria-hidden="true">${Array.from({ length: n || 7 }, (_, i) => `<p class="${i % 3 === 1 ? 'cont' : ''}"><i></i><b class="nm" style="width:${60 + (i * 37) % 90}px"></b><b style="width:${rnd(i)}%"></b>${i % 2 ? `<b style="width:${rnd(i + 3) - 20}%"></b>` : ''}</p>`).join('')}</div>`;
  if (kind === 'rows') return `<div class="sk53 sk53-rows" aria-hidden="true">${Array.from({ length: n || 4 }, (_, i) => `<p><i></i><b style="width:${rnd(i)}%"></b><b class="s" style="width:${rnd(i + 2) - 25}%"></b></p>`).join('')}</div>`;
  if (kind === 'cards') return `<div class="sk53 sk53-cards" aria-hidden="true">${Array.from({ length: n || 6 }, () => '<p><i></i><b></b><b class="s"></b></p>').join('')}</div>`;
  if (kind === 'chips') return `<div class="sk53 sk53-chips" aria-hidden="true">${Array.from({ length: n || 8 }, () => '<i></i>').join('')}</div>`;
  if (kind === 'card') return `<div class="sk53 sk53-card" aria-hidden="true"><i></i><b></b><b class="s"></b></div>`;
  return `<div class="sk53 sk53-bars" aria-hidden="true"><b style="width:80%"></b><b style="width:60%"></b><b style="width:70%"></b></div>`;
}
// Which sketch fits where "Loading…" was written.
function skel53For(el) {
  const at = s => el.closest(s);
  if (at('.pop-list, .pcm-list, .ib-list, #mod-body, #mod-users, .fp-list, .sec-devices, .mod53-list')) return skel53('rows', at('.pcm-list') ? 3 : 4);
  if (at('.disc-grid, .mk-grid, .cm-grid')) return skel53('cards');
  if (at('.bp-grid')) return skel53('chips');
  if (el.matches('.tc-load') || at('.cr37')) return skel53('card');
  if (el.matches('.composer-locked')) return skel53('bars');
  return skel53('bars');
}

// ======================= Moderation =======================
// One row of tabs, short names, in groups: people problems, things to review, staff.
const MOD53_TABS = [
  ['reports', 'Reports', '[data-mt="reports"]'], ['appeals', 'Appeals', '[data-mt="appeals"]'], ['sus53', 'Bans & Timeouts', null], ['users', 'People', '[data-mt="users"]'], ['svs53', 'Servers', null],
  'sep', ['creations', 'Creations', '[data-mt30]'], ['creators', 'Creators', '[data-mt37]'], ['botrev46', 'Bots', '[data-mt46]'],
  'sep', ['staffact', 'Staff', '[data-mt38]'], ['log', 'Log', '[data-mt="log"]'],
];
function polishModTabs53(body) {
  const tabs = $('.mod-tabs', body);
  if (!tabs || tabs.dataset.p53) return;
  tabs.dataset.p53 = '1';
  tabs.classList.add('mt53');
  const frag = document.createDocumentFragment();
  for (const t of MOD53_TABS) {
    if (t === 'sep') { const s = document.createElement('i'); s.className = 'mt53-sep'; frag.appendChild(s); continue; }
    const [key, label, sel] = t;
    let b = sel ? $(sel, tabs) : null;
    if (sel && !b) continue;
    if (!b) {
      b = document.createElement('button');
      b.dataset.mt53 = key;
      b.addEventListener('click', () => { modTab = key; renderModeration(body); });
    }
    const count = $('.cm-count', b);
    b.textContent = label;
    if (count) b.appendChild(count);
    b.classList.toggle('on', modTab === key);
    frag.appendChild(b);
  }
  tabs.replaceChildren(frag);
  // Counts on the new tabs.
  api('GET', '/api/mod/suspended').then(d => {
    const b = $('[data-mt53="sus53"]', tabs), n = (d.timeouts?.length || 0) + (d.bans?.length || 0);
    if (b && n && !$('.cm-count', b)) b.insertAdjacentHTML('beforeend', `<span class="cm-count dim53">${n}</span>`);
  }).catch(() => {});
}
{
  const _rm53 = renderModeration;
  renderModeration = async function (body) {
    if (modTab !== 'sus53' && modTab !== 'svs53') {
      const r = await _rm53(body);
      polishModTabs53(body);
      return r;
    }
    body.innerHTML = `<h2>Moderation</h2><div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}">${l}</button>`).join('')}</div><div id="mod-body" class="mod53-body"></div>`;
    $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
    for (const fn of [typeof addCreationsTab === 'function' && addCreationsTab, typeof addCreatorsTab37 === 'function' && addCreatorsTab37, typeof addStaffActTab === 'function' && addStaffActTab, typeof addBotRevTab46 === 'function' && addBotRevTab46]) if (fn) try { fn(body); } catch {}
    polishModTabs53(body);
    const box = $('#mod-body', body);
    box.innerHTML = skel53('rows', 5);
    try { if (modTab === 'sus53') await drawSuspended53(box); else await drawServers53(box); }
    catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

// A person's row, shared by People and Bans & Timeouts.
function modRow53(u, meta, acts) {
  return `<div class="mod53-row" data-u="${esc(u.id)}">${avatar(u, 36)}
    <div class="mod53-who"><div class="mod53-name"><b>${esc(u.displayName)}</b> <span class="muted">@${esc(u.username)}</span></div><div class="muted small">${meta}</div></div>
    <div class="mod53-acts">${acts}</div></div>`;
}
async function modDo53(id, action, extra = {}) {
  await api('POST', `/api/mod/users/${id}`, { action, ...extra });
}
async function askReason53(title, danger = false) {
  return askText(title, { desc: 'They will see this reason.', placeholder: 'Reason (optional)', ok: 'Confirm', danger });
}

// ---- Bans & Timeouts ----
async function drawSuspended53(box) {
  const d = await api('GET', '/api/mod/suspended');
  const q = box.querySelector('.mod53-q')?.value || '';
  box.innerHTML = `<input class="qs-input mod53-q" placeholder="Filter by name" value="${esc(q)}" autocomplete="off">
    <h4 class="mod53-h">${uiIcon('clock')} Timed out <span class="muted">${d.timeouts.length}</span></h4>
    <div class="mod53-list" data-list="t">${d.timeouts.length ? d.timeouts.map(t => modRow53(t.user,
      `Ends ${esc(inDays53(t.until))} (${esc(new Date(t.until).toLocaleString())})${t.by ? ` · by ${esc(t.by.displayName)}` : ''}${t.reason ? ` · “${esc(t.reason)}”` : ''}`,
      '<button class="btn btn-sm btn-green" data-do="unsuspend">End timeout</button>')).join('') : '<div class="mod53-empty">Nobody is timed out.</div>'}</div>
    <h4 class="mod53-h">${uiIcon('ban')} Banned from Zuno <span class="muted">${d.bans.length}</span></h4>
    <div class="mod53-list" data-list="b">${d.bans.length ? d.bans.map(b => modRow53(b.was ? { ...b.user, displayName: b.was.displayName, username: b.was.username, avatar: b.was.avatar } : b.user,
      `Banned ${esc(fmtTime(b.at))}${b.by ? ` by ${esc(b.by.displayName)}` : ''}${b.reason ? ` · “${esc(b.reason)}”` : ''}${b.appeal ? ` · appeal ${esc(b.appeal)}` : ''}`,
      b.restorable ? '<button class="btn btn-sm btn-green" data-do="unban">Unban</button>' : '<span class="mod53-pill">Wiped</span>')).join('') : '<div class="mod53-empty">Nobody is banned.</div>'}</div>`;
  const filter = () => {
    const v = $('.mod53-q', box).value.trim().toLowerCase();
    $$('.mod53-row', box).forEach(r => { r.hidden = !!v && !r.querySelector('.mod53-name').textContent.toLowerCase().includes(v); });
  };
  $('.mod53-q', box).addEventListener('input', filter);
  filter();
  box.onclick = async e => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const row = b.closest('[data-u]'), act = b.dataset.do;
    const name = row.querySelector('.mod53-name b').textContent;
    if (act === 'unban' && !await confirmOver(`Unban ${name}?`, 'Their name and profile come back and they can log in again. Servers and friends don\'t come back.', 'Unban', false)) return;
    b.disabled = true;
    try { await modDo53(row.dataset.u, act); toast(act === 'unban' ? `${name} was unbanned` : `${name}'s timeout ended`); drawSuspended53(box); }
    catch (err) { toast(err.message, true); b.disabled = false; }
  };
}

// ---- People (replaces the old list) ----
modPeople = function (box) {
  box.innerHTML = `<input class="qs-input" id="mod-q" placeholder="Search people by name or username" autocomplete="off">
    <p class="muted small mod53-hint">Empty search shows everyone with a warning, timeout or ban.</p><div id="mod-users" class="mod53-list"></div>`;
  const q = $('#mod-q', box), list = $('#mod-users', box);
  let t, seq = 0;
  const draw = async () => {
    const my = ++seq;
    const { users } = await api('GET', `/api/mod/users?q=${encodeURIComponent(q.value.trim())}`);
    if (my !== seq) return;
    list.innerHTML = users.length ? users.map(u => {
      const st = u.banned ? '<span class="mod53-pill red">Banned</span>' : u.suspendedUntil ? `<span class="mod53-pill amber">Timed out · ends ${esc(inDays53(u.suspendedUntil))}</span>` : '';
      const acts = u.banned
        ? (u.restorable ? '<button class="btn btn-sm btn-green" data-ua="unban">Unban</button>' : '')
        : `${u.suspendedUntil ? '<button class="btn btn-sm btn-green" data-ua="unsuspend">End timeout</button>' : ''}<button class="btn btn-sm btn-grey" data-ua="warn">Warn</button><button class="btn btn-sm btn-grey" data-ua="timeout">Timeout</button><button class="btn btn-sm btn-red" data-ua="ban">Ban</button>`;
      return `${modRow53(u, `${st} Joined ${new Date(u.createdAt).toLocaleDateString()} · ${u.warnings} warning${u.warnings === 1 ? '' : 's'} · ${u.reportsAgainst} report${u.reportsAgainst === 1 ? '' : 's'}`, `${acts}<button class="icon-btn mod53-more" data-ua="servers" title="Server bans & timeouts">${uiIcon('hash')}</button>`)}<div class="mod53-sub" data-sub="${esc(u.id)}" hidden></div>`;
    }).join('') : `<div class="mod53-empty">${q.value.trim() ? 'Nobody matches that.' : 'Nobody has a warning, timeout or ban.'}</div>`;
  };
  list.addEventListener('click', async e => {
    const b = e.target.closest('[data-ua]');
    if (!b) return;
    const id = b.closest('[data-u]').dataset.u, action = b.dataset.ua;
    if (action === 'servers') return toggleServerLifts53(id, $(`[data-sub="${CSS.escape(id)}"]`, list));
    let extra = {};
    if (action === 'timeout') {
      const days = await pickDays53(b);
      if (!days) return;
      extra.days = days;
    }
    if (action === 'ban' && !await confirmOver('Ban this account from Zuno?', 'It becomes DELETED_USER_…, leaves every server, and its email can\'t sign up again. You can unban it from Bans & Timeouts until its appeal time runs out.', 'Ban')) return;
    if (action === 'unban' && !await confirmOver('Unban this account?', 'Their name and profile come back. Servers and friends don\'t.', 'Unban', false)) return;
    const note = ['unsuspend', 'unban'].includes(action) ? '' : await askReason53(MOD_ACTION[action] || 'Reason', action === 'ban');
    if (note === null) return;
    try { await modDo53(id, action, { ...extra, note }); toast(`Done: ${MOD_ACTION[action] || action}`); draw(); }
    catch (err) { toast(err.message, true); }
  });
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
  draw().catch(err => { list.innerHTML = `<p class="muted">${esc(err.message)}</p>`; });
};
MOD_ACTION.unban = 'Unbanned';
MOD_ACTION['server-unban'] = 'Lifted a server ban for';
MOD_ACTION['server-untimeout'] = 'Ended a server timeout for';
function pickDays53() {
  return new Promise(resolve => {
    const { box, close } = over53(`<h3>Time out for how long?</h3><p class="muted" style="margin:0 0 12px">They can read but not post anywhere on Zuno until it ends.</p>
      <div class="days53">${[[1, '1 day'], [3, '3 days'], [7, '1 week'], [30, '30 days']].map(([d, l]) => `<button type="button" class="btn btn-grey" data-d="${d}">${l}</button>`).join('')}</div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button></div>`, 'days53-modal');
    let done = false;
    const fin = v => { if (done) return; done = true; close(); resolve(v); };
    box.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) fin(Number(b.dataset.d)); if (e.target.closest('[data-a=cancel]')) fin(0); });
    new MutationObserver((_, o) => { if (!box.isConnected) { o.disconnect(); fin(0); } }).observe(box.parentNode.parentNode, { childList: true });
  });
}
async function toggleServerLifts53(uid, sub) {
  if (!sub) return;
  if (!sub.hidden) { sub.hidden = true; return; }
  sub.hidden = false;
  sub.innerHTML = skel53('rows', 2);
  try {
    const { servers } = await api('GET', `/api/mod/users/${uid}/servers`);
    sub.innerHTML = servers.length ? servers.map(s => `<div class="mod53-svrow" data-sv="${esc(s.id)}">${svIcon53(s, 28)}<div class="mod53-who"><b>${esc(s.name)}</b><div class="muted small">${s.ban ? `Banned ${esc(fmtTime(s.ban.at))}${s.ban.by ? ` by ${esc(s.ban.by.displayName)}` : ''}${s.ban.reason ? ` · “${esc(s.ban.reason)}”` : ''}` : ''}${s.ban && s.timeoutUntil ? ' · ' : ''}${s.timeoutUntil ? `Timed out, ends ${esc(inDays53(s.timeoutUntil))}` : ''}</div></div>
      <div class="mod53-acts">${s.ban ? '<button class="btn btn-sm btn-green" data-lift="ban">Unban</button>' : ''}${s.timeoutUntil ? '<button class="btn btn-sm btn-green" data-lift="timeout">End timeout</button>' : ''}</div></div>`).join('')
      : '<div class="mod53-empty small">Not banned or timed out in any server.</div>';
    $$('[data-lift]', sub).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api('POST', `/api/mod/users/${uid}/servers/${b.closest('[data-sv]').dataset.sv}/lift`, { kind: b.dataset.lift }); toast(b.dataset.lift === 'ban' ? 'Server ban lifted' : 'Server timeout ended'); sub.hidden = true; toggleServerLifts53(uid, sub); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
  } catch (err) { sub.innerHTML = `<p class="muted small">${esc(err.message)}</p>`; }
}

// ---- Servers: find one, see its owner, hand it to someone (founder) ----
async function drawServers53(box) {
  box.innerHTML = `<input class="qs-input mod53-q" placeholder="Search servers by name, owner or ID" autocomplete="off">
    <p class="muted small mod53-hint">${state.me.isFounder ? 'You can give any server to one of its members.' : 'The biggest servers show first.'}</p><div class="mod53-list"></div>`;
  const q = $('.mod53-q', box), list = $('.mod53-list', box);
  let t, seq = 0;
  const draw = async () => {
    const my = ++seq;
    const { servers } = await api('GET', `/api/mod/servers?q=${encodeURIComponent(q.value.trim())}`);
    if (my !== seq) return;
    list.innerHTML = servers.length ? servers.map(s => `<div class="mod53-row" data-sv="${esc(s.id)}">${svIcon53(s, 36)}
      <div class="mod53-who"><div class="mod53-name"><b>${esc(s.name)}</b>${s.official ? ' <span class="mod53-pill">Official</span>' : ''}</div><div class="muted small">${s.members.toLocaleString()} member${s.members === 1 ? '' : 's'} · owner ${s.owner ? `<b>${esc(s.owner.displayName)}</b> @${esc(s.owner.username)}` : 'nobody'}</div></div>
      <div class="mod53-acts">${state.me.isFounder ? '<button class="btn btn-sm btn-grey" data-tr>Transfer ownership</button>' : ''}</div></div>`).join('')
      : '<div class="mod53-empty">No servers match that.</div>';
  };
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-tr]');
    if (!b) return;
    const row = b.closest('[data-sv]');
    transferAny53({ id: row.dataset.sv, name: row.querySelector('.mod53-name b').textContent }, draw);
  });
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
  await draw();
}

// The founder hands any server to one of its members (they don't need to own it or be in it).
function transferAny53(sv, after) {
  const { box, close } = over53(`<h3>Transfer ownership of ${esc(sv.name)}</h3>
    <p class="muted" style="margin:0 0 10px">Pick the new owner. They get every power in the server, including deleting it.</p>
    <input class="qs-input tr53-q" placeholder="Search members" autocomplete="off">
    <div class="tr53-list">${skel53('rows', 4)}</div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button></div>`, 'tr53');
  $('[data-a=cancel]', box).addEventListener('click', close);
  const q = $('.tr53-q', box), list = $('.tr53-list', box);
  let t, seq = 0;
  const draw = async () => {
    const my = ++seq;
    try {
      const { members, ownerId } = await api('GET', `/api/mod/servers/${sv.id}/members?q=${encodeURIComponent(q.value.trim())}`);
      if (my !== seq) return;
      list.innerHTML = members.length ? members.map(u => `<button type="button" class="tr53-row" data-id="${esc(u.id)}"${u.id === ownerId ? ' disabled' : ''}>${avatar(u, 30)}<span><b>${esc(u.displayName)}</b> <span class="muted">@${esc(u.username)}</span></span>${u.id === ownerId ? '<span class="mod53-pill">Owner</span>' : ''}</button>`).join('') : '<div class="mod53-empty">Nobody matches that.</div>';
    } catch (err) { list.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  };
  list.addEventListener('click', async e => {
    const b = e.target.closest('.tr53-row');
    if (!b || b.disabled) return;
    const who = b.querySelector('b').textContent;
    if (!await confirmOver(`Make ${who} the owner of ${sv.name}?`, 'The current owner stays in the server with their roles.', 'Transfer', true)) return;
    try {
      await api('POST', `/api/servers/${sv.id}/transfer`, { userId: b.dataset.id });
      close(); toast(`${who} now owns ${sv.name}`);
      after?.();
      if (state.servers?.some(s => s.id === sv.id) && typeof refresh === 'function') Promise.resolve(refresh({})).catch(() => {});
    } catch (err) { toast(err.message, true); }
  });
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 200); });
  draw();
  q.focus();
}
// Server Settings › Transfer and the server's right-click menu use it for the founder.
{
  const _tr53 = openTransferOwnership;
  openTransferOwnership = function (sv, ...a) {
    if (state.me?.isFounder) return transferAny53(sv);
    return _tr53(sv, ...a);
  };
  const _osm53 = openServerMenu;
  openServerMenu = function (anchor, sv = currentServer(), ...a) {
    const r = _osm53(anchor, sv, ...a);
    if (!sv || !state.me?.isFounder || sv.ownerId === state.me.id) return r;
    const menu = $$('#layer .menu').pop();
    if (!menu || $('[data-tr53]', menu)) return r;
    const b = document.createElement('button');
    b.dataset.tr53 = '1';
    b.innerHTML = `<span class="mi-ico">${uiIcon('crown')}</span><span>Transfer Ownership</span>`;
    b.addEventListener('click', () => { closeLayer(); transferAny53(sv); });
    const danger = [...menu.children].find(x => /Delete Server|Leave Server/.test(x.textContent));
    menu.insertBefore(b, danger || null);
    return r;
  };
}

// ======================= Settings › My Account › Delete account =======================
{
  const _ss53 = showSettingsSection;
  showSettingsSection = function (section, ...rest) {
    const r = _ss53(section, ...rest);
    if (section === 'account' && state.me && !state.me.isFounder) setTimeout(() => deleteCard53($('#settings-body')), 60);
    return r;
  };
}
function deleteCard53(body) {
  if (!body?.isConnected || $('.del53', body)) return;
  const card = document.createElement('div');
  card.className = 'del53';
  card.style.order = 990;
  card.innerHTML = `<div class="del53-txt"><b>${uiIcon('trash')} Delete account</b><span class="muted small">Gone for good: your name, profile, friends and login. Messages you sent stay, as “Deleted User”.</span></div>
    <button class="btn btn-red btn-sm" data-del53>Delete Account</button>`;
  body.appendChild(card);
  $('[data-del53]', card).addEventListener('click', startDelete53);
}
async function startDelete53() {
  let check;
  try { check = await api('GET', '/api/me/delete-check'); } catch (e) { return toast(e.message, true); }
  if (check.founder) return toast("The founder's account can't be deleted.", true);
  if (check.owned.length) {
    const { box, close } = over53(`<h3>First, your servers</h3>
      <p class="muted" style="margin:0 0 12px">You own ${check.owned.length === 1 ? 'a server' : `${check.owned.length} servers`}. Give ${check.owned.length === 1 ? 'it' : 'each one'} to someone else, or delete ${check.owned.length === 1 ? 'it' : 'them'}, then come back.</p>
      <div class="del53-svs">${check.owned.map(s => `<div class="del53-sv" data-sv="${esc(s.id)}">${svIcon53(s, 32)}<div><b>${esc(s.name)}</b><div class="muted small">${s.members} member${s.members === 1 ? '' : 's'}</div></div>
        <button class="btn btn-sm btn-grey" data-a="give"${s.members < 2 ? ' disabled title="Nobody else is in it"' : ''}>Transfer</button><button class="btn btn-sm btn-red" data-a="del">Delete</button></div>`).join('')}</div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="close">Close</button></div>`, 'del53-modal');
    $('[data-a=close]', box).addEventListener('click', close);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-a=give], [data-a=del]');
      if (!b) return;
      const sv = state.servers.find(s => s.id === b.closest('[data-sv]').dataset.sv);
      if (!sv) return toast('Open the server once, then try again.', true);
      close(); closeLayer();
      if (b.dataset.a === 'give') openTransferOwnership(sv); else deleteServer(sv);
    });
    return;
  }
  const me = state.me;
  const { box, close } = over53(`<form class="del53-form"><h3>${uiIcon('trash')} Delete your account?</h3>
    <ul class="del53-list"><li>Your name <b>@${esc(me.username)}</b> is freed, and your profile, friends and badges are removed.</li><li>You leave every server and group, and your bots are deleted.</li><li>Messages you sent stay, shown as “Deleted User”.</li><li>This can't be undone.</li></ul>
    <label class="field">Password<input name="pw" type="password" required autocomplete="current-password"></label>
    <label class="field">Type your username to confirm<input name="confirm" autocomplete="off" placeholder="${esc(me.username)}" spellcheck="false"></label>
    <div class="form-error"></div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red" data-a="go" disabled>Delete My Account</button></div></form>`, 'del53-modal');
  const f = $('form', box), go = $('[data-a=go]', box);
  $('[data-a=cancel]', box).addEventListener('click', close);
  const ready = () => { go.disabled = !(f.pw.value && f.confirm.value.trim().toLowerCase() === me.username); };
  f.addEventListener('input', ready);
  f.pw.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (go.disabled) return;
    go.disabled = true; go.textContent = 'Deleting…';
    try {
      await api('POST', '/api/me/delete', { password: f.pw.value, confirm: f.confirm.value.trim() });
      close();
      toast('Your account was deleted. Bye for now 👋');
      setTimeout(() => { signOutLocal(); }, 900);
    } catch (err) {
      $('.form-error', box).textContent = err.message;
      go.textContent = 'Delete My Account'; ready();
    }
  });
}

// ======================= channel permissions: search =======================
// A box above the list finds a permission by name or what it does.
{
  const _ope53 = openPermEditor;
  openPermEditor = async function (...a) {
    const r = await _ope53(...a);
    const ov = $$('#layer .perm-editor').pop(), perms = ov && $('.pe-perms', ov);
    if (!perms || $('.pe53-col', ov)) return r;
    const col = document.createElement('div');
    col.className = 'pe53-col';
    col.innerHTML = `<label class="pe53-search">${uiIcon('search')}<input type="search" placeholder="Search permissions" autocomplete="off"></label>`;
    perms.replaceWith(col);
    col.appendChild(perms);
    const q = $('input', col);
    const apply = () => {
      const v = q.value.trim().toLowerCase();
      for (const row of $$('.pe-row', perms)) { const hide = !!v && !row.textContent.toLowerCase().includes(v); if (row.hidden !== hide) row.hidden = hide; }
    };
    q.addEventListener('input', apply);
    new MutationObserver(apply).observe(perms, { childList: true });
    return r;
  };
}

// ======================= phones: notifications drop down from the top =======================
// (0.53.1) A DM, a ping or a reply while you're in Zuno on a phone shows as a card at the top of the
// screen (whatever your status, except Do Not Disturb): tap it to open, swipe it up to dismiss.
function banner53({ who, title, where, text, open }) {
  if (!isPhone() || document.hidden || state.me?.statusPref === 'dnd') return;
  $('.nb53')?.remove();
  const el = document.createElement('div');
  el.className = 'nb53';
  el.setAttribute('role', 'status');
  el.innerHTML = `${avatar(who || { displayName: '?' }, 38)}<div class="nb53-txt"><div class="nb53-top"><b>${esc(title)}</b>${where ? `<span>${esc(where)}</span>` : ''}</div><div class="nb53-msg">${esc(text)}</div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let gone = false, y0 = null, dy = 0;
  const close = () => { if (gone) return; gone = true; el.classList.remove('in'); el.style.transform = ''; setTimeout(() => el.remove(), 260); };
  const t = setTimeout(close, 4500);
  el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.min(0, e.touches[0].clientY - y0); el.style.transform = `translate3d(-50%, ${dy}px, 0)`; }, { passive: true });
  el.addEventListener('touchend', () => { el.style.transition = ''; if (dy < -30) { clearTimeout(t); close(); } else el.style.transform = ''; y0 = null; });
  el.addEventListener('click', () => { if (Math.abs(dy) > 8) return; clearTimeout(t); close(); open?.(); });
}
const msgText53 = m => (m.e2e ? '🔒 Encrypted message' : m.content || (m.attachments?.length ? '📎 Sent a file' : m.sticker ? 'Sent a sticker' : m.gif ? 'Sent a GIF' : m.poll ? '📊 Poll' : 'Sent a message')).slice(0, 160);
{
  const _notify53 = notify;
  notify = function (peerId, message, ...a) {
    const r = _notify53(peerId, message, ...a);
    try {
      if (!message?.call && !(activePeer() === peerId && !document.hidden) && !isMuted('dm:' + peerId) && !isMuted(peerId)) {
        const u = user(message.authorId) || user(peerId);
        banner53({ who: u, title: u?.displayName || 'New message', where: 'Direct message', text: msgText53(message), open: () => openDM(peerId) });
      }
    } catch {}
    return r;
  };
  const _nm53 = notifyMention;
  notifyMention = function (conv, serverId, channelId, message, ...a) {
    const r = _nm53(conv, serverId, channelId, message, ...a);
    try {
      if (!(activeConv() === conv && !document.hidden) && !isMuted('ch:' + channelId) && !isMuted('sv:' + serverId)) {
        const sv = state.servers.find(s => s.id === serverId), ch = sv?.channels.find(c => c.id === channelId), u = user(message.authorId);
        banner53({ who: u, title: u?.displayName || 'Someone', where: `#${ch?.name || 'channel'} · ${sv?.name || ''}`, text: msgText53(message), open: () => openChannel(serverId, channelId) });
      }
    } catch {}
    return r;
  };
}
