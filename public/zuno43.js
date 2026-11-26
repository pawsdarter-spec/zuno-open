'use strict';
// Zuno 0.43: profiles get a side panel (Activity, Widgets, Creations, Comments), your own profile
// opens from your name in the corner and lets you change your status, Games in Rotation, Listen
// along, profile view stats, tidy right-click menus, Spotify connects,
// and "Open in app".

Object.assign(UI_PATHS, {
  eyeOpen: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
});

// ======================= right-click menus =======================
// Different parts of Zuno each added their own items, so some menus said "Profile" and "Block"
// twice, and some items had no icon. Every menu is tidied the same way: no repeats, the same
// sections in the same order (open → organize → people → copy → careful), an icon on every item.
const MENU_ICON43 = [
  [/^(view )?profile$/i, 'user'], [/message request/i, 'mail'], [/^(send )?message/i, 'chat'], [/video/i, 'camera'], [/call/i, 'call'],
  [/^unblock/i, 'unlock'], [/^block/i, 'ban'], [/report/i, 'flag'], [/^(kick|leave|remove friend)/i, 'door'], [/^ban\b/i, 'hammer'],
  [/^copy/i, 'clipboard'], [/^(un)?mute/i, 'bellOff'], [/^close dm/i, 'x'], [/^(un)?pin/i, 'pin'], [/categor/i, 'folder'], [/close friend/i, 'star'],
  [/nickname|^edit|rename/i, 'pencil'], [/role/i, 'tag'], [/invite/i, 'mail'], [/mark.*read/i, 'check'], [/settings|permissions/i, 'gear'],
  [/note/i, 'note'], [/add friend|friend request/i, 'users'], [/gift/i, 'gift'], [/^(delete|remove)/i, 'trash'], [/reply/i, 'reply'],
  [/forward/i, 'forward'], [/react/i, 'smile'], [/thread/i, 'thread'], [/^(join|open)/i, 'forward'], [/event/i, 'calendar'], [/tag/i, 'tag'],
];
const MENU_RANK43 = [
  [/^((view )?profile|(send )?message|message request|open|join|call|voice call|video call|start a|invite|reply)/i, 0],
  [/(add friend|remove friend|friend request|close friend|nickname|roles?\b|note|gift|tag)/i, 2],
  [/^copy/i, 3],
];
const menuLabel43 = b => ($(':scope > span', b)?.childNodes[0]?.textContent || b.textContent || '').trim();
function tidyMenu43(menu) {
  if (!menu.isConnected || menu.matches('.status-menu, .menu-over') || $('input, textarea, .sm-head', menu)) return;
  const kids = [...menu.children];
  const plain = kids.every(n => n.tagName === 'BUTTON' || n.classList.contains('sep'));
  // 1. no repeats
  const seen = new Set();
  for (const b of kids.filter(n => n.tagName === 'BUTTON')) {
    const k = menuLabel43(b).toLowerCase();
    if (!k) continue;
    if (seen.has(k)) { b.remove(); continue; }
    seen.add(k);
    // 2. an icon on everything
    if (!$(':scope > .mi-ico, :scope > svg, :scope > img, :scope > .avatar', b)) {
      const ic = MENU_ICON43.find(([re]) => re.test(menuLabel43(b)))?.[1] || 'dot';
      b.insertAdjacentHTML('afterbegin', `<span class="mi-ico">${uiIcon(ic)}</span>`);
    }
  }
  if (!plain) return;
  // 3. sections in a set order, careful things last
  const buttons = [...menu.children].filter(n => n.tagName === 'BUTTON');
  const rank = b => (b.classList.contains('danger') ? 4 : MENU_RANK43.find(([re]) => re.test(menuLabel43(b)))?.[1] ?? 1);
  const groups = [0, 1, 2, 3, 4].map(r => buttons.filter(b => rank(b) === r)).filter(g => g.length);
  const want = groups.flatMap((g, i) => (i ? ['sep', ...g] : g));
  const now = [...menu.children].map(n => (n.classList.contains('sep') ? 'sep' : n));
  if (want.length === now.length && want.every((x, i) => x === now[i])) return;
  menu.textContent = '';
  for (const x of want) { if (x === 'sep') { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); } else menu.appendChild(x); }
  if (typeof keepMenuOnScreen === 'function') requestAnimationFrame(keepMenuOnScreen);
}
new MutationObserver(list => {
  for (const r of list) for (const n of r.addedNodes) {
    if (n.nodeType !== 1 || !n.classList.contains('menu')) continue;
    tidyMenu43(n);
    // Items added a moment later (after something loads) get tidied too.
    const mo = new MutationObserver(() => tidyMenu43(n));
    mo.observe(n, { childList: true });
    setTimeout(() => mo.disconnect(), 3000);
  }
}).observe($('#layer'), { childList: true });

// ======================= profiles: the side panel =======================
const PF43_TABS = [['activity', 'Activity'], ['widgets', 'Widgets'], ['creations', 'Creations'], ['comments', 'Comments']];
const fmtHours43 = ms => { const h = ms / 3600e3; return h >= 10 ? `${Math.round(h)} h` : h >= 1 ? `${h.toFixed(1).replace(/\.0$/, '')} h` : `${Math.max(1, Math.round(ms / 60e3))} min`; };
function listenUrl43(a) {
  return a.url || `https://open.spotify.com/search/${encodeURIComponent(`${a.details || ''} ${a.state || ''}`.trim())}`;
}
function nowHtml43(u) {
  // (0.43.1) A game and a song can show together.
  const list = (u.activities?.length ? u.activities : u.activity ? [u.activity] : []);
  if (list.length > 1) return list.map(x => nowHtml43({ ...u, activity: x, activities: null })).join('<div class="pf43-gap"></div>');
  const a = list[0] || null;
  if (!a) {
    const self = u.id === state.me.id;
    return `<div class="pf43-empty">${typeof mascot === 'function' ? mascot('sleepy') : ''}<b>${self ? "You're not doing anything right now" : `${esc(u.displayName)} isn't doing anything right now`}</b>
      ${self ? `<span class="muted small">${window.zunoDesktop ? 'Open a game or play something on Spotify and it shows up here.' : 'Connect Spotify in Settings › Connections, or use the Zuno PC app to show games and music.'}</span>` : ''}</div>`;
  }
  const sp = a.name === 'Spotify';
  return `${activityCard(u)}${sp ? `<a class="btn btn-grey pf43-listen" href="${esc(listenUrl43(a))}" target="_blank" rel="noopener noreferrer">${spotifyLogo42()}<span>${u.id === state.me.id ? 'Open in Spotify' : 'Listen along on Spotify'}</span></a>` : ''}`;
}
async function drawActivity43(pane, u) {
  const self = u.id === state.me.id;
  pane.innerHTML = `${self ? '<section class="pf43-sec pf43-stats" hidden></section>' : ''}
    <section class="pf43-sec"><h5>Right now</h5><div class="pf43-now">${nowHtml43(u)}</div></section>
    <section class="pf43-sec pf43-rot-sec" hidden><h5>Games in Rotation <span class="muted small">past 2 weeks</span></h5><div class="pf43-rot"></div></section>`;
  if (self) drawStats43($('.pf43-stats', pane));
  let d;
  try { d = await api('GET', `/api/users/${u.id}/rotation`); } catch { return; }
  const sec = $('.pf43-rot-sec', pane);
  if (!sec?.isConnected || (!d.games?.length && !self)) return;
  sec.hidden = false;
  $('.pf43-rot', sec).innerHTML = d.games?.length
    ? d.games.map(g => `<div class="pf43-game" title="${esc(g.name)}">${g.cover ? `<img${g.icon ? ' class="pf43-ico"' : ''} src="${esc(g.cover)}" alt="" loading="lazy">` : `<span class="pf43-gph">${uiIcon('gamepad')}</span>`}<b>${esc(g.name)}</b><small>${esc(fmtHours43(g.ms))}</small></div>`).join('')
    : `<div class="muted small pf43-note">Games you play with the Zuno PC app open show up here.</div>`;
  if (self) {
    sec.insertAdjacentHTML('beforeend', `<label class="pf43-toggle"><input type="checkbox" class="switch" ${d.showing ? 'checked' : ''}><span class="muted small">Show this on my profile</span></label>`);
    $('.pf43-toggle input', sec).addEventListener('change', async e => {
      try { await api('PATCH', '/api/me', { showRotation: e.target.checked }); toast(e.target.checked ? 'Games in Rotation shows on your profile' : 'Games in Rotation is hidden from others'); } catch (err) { toast(err.message, true); }
    });
  }
}
async function drawStats43(sec) {
  let s;
  try { s = await api('GET', '/api/me/profile-stats'); } catch { return; }
  if (!sec.isConnected) return;
  const max = Math.max(1, ...s.daily);
  const diff = s.prevWeek ? Math.round(((s.week - s.prevWeek) / s.prevWeek) * 100) : null;
  sec.hidden = false;
  sec.innerHTML = `<h5>Your profile <span class="muted small">only you see this</span></h5>
    <div class="pf43-statrow">
      <div><b>${s.totalViews ?? s.week}</b><small>profile views total · ${s.week} this week${diff !== null ? ` <i class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}%</i>` : ''}</small></div>
      <div><b>${s.likes}</b><small>likes</small></div>
      <div><b>${s.comments}</b><small>comments</small></div>
    </div>
    <div class="pf43-spark" title="Views over the last 14 days">${s.daily.map(v => `<i style="height:${Math.max(6, Math.round((v / max) * 100))}%" title="${v}"></i>`).join('')}</div>`;
}
function myStatusBox43() {
  const me = state.me, cur = me.statusPref || 'online';
  const box = document.createElement('div');
  box.className = 'pf43-me';
  const draw = () => {
    const c = state.me.statusPref || cur;
    box.innerHTML = `<div class="pf43-me-head">${uiIcon('smile')}<b>Your status</b></div>
      <div class="pf43-sts">${[['online', 'Online'], ['idle', 'Idle'], ['dnd', 'Busy'], ['invisible', 'Invisible']].map(([k, l]) => `<button type="button" data-st43="${k}" class="${c === k ? 'on' : ''}"><span class="swatch s-${k}"></span>${l}</button>`).join('')}</div>
      <form class="pf43-cs"><input maxlength="80" placeholder="Set a custom status" value="${esc(state.me.customStatus || '')}"><button class="btn btn-primary btn-sm">Save</button>${state.me.customStatus ? '<button type="button" class="btn btn-link btn-sm" data-clear43>Clear</button>' : ''}</form>`;
    $$('[data-st43]', box).forEach(b => b.addEventListener('click', async () => { await setStatus(b.dataset.st43); draw(); }));
    const save = async v => {
      try { const { me: m } = await api('PATCH', '/api/me', { customStatus: v, ...(v ? {} : { customStatusEmoji: null, customStatusUntil: 0 }) }); state.me = { ...state.me, ...m }; state.users[m.id] = { ...state.users[m.id], ...m }; renderUserPanel(); toast(v ? 'Status set' : 'Status cleared'); draw(); }
      catch (e) { toast(e.message, true); }
    };
    $('form', box).addEventListener('submit', e => { e.preventDefault(); save($('input', box).value.trim()); });
    $('[data-clear43]', box)?.addEventListener('click', () => save(''));
  };
  draw();
  return box;
}
function buildSide43(modal, card, u) {
  const old = $(':scope > .pcm-side', modal);
  const side = document.createElement('aside');
  side.className = 'pcm-side pf43-side';
  side.dataset.uid = u.id;
  side.innerHTML = '<div class="pf43-in"><div class="pf43-tabs" role="tablist"></div><div class="pf43-panes"></div><button type="button" class="pf43-x" aria-label="Close">✕</button></div>';
  const tabs = $('.pf43-tabs', side), panes = $('.pf43-panes', side);
  const add = (k, label, count) => {
    tabs.insertAdjacentHTML('beforeend', `<button type="button" role="tab" data-tab43="${k}">${esc(label)}${count != null ? `<span class="pf43-n">${count}</span>` : ''}</button>`);
    const p = document.createElement('div');
    p.className = 'pf43-pane'; p.dataset.pane = k; p.hidden = true;
    panes.appendChild(p);
    return p;
  };
  drawActivity43(add('activity', 'Activity'), u);
  const widgets = $('.pc-body .widgets', card);
  if (widgets) add('widgets', 'Widgets', widgets.children.length).appendChild(widgets);
  const creations = $('.pc-body .pf-creations', card);
  if (creations) { const n = $('h4 .muted', creations)?.textContent; $('h4', creations)?.remove(); add('creations', 'Creations', n || null).appendChild(creations); }
  if (old) {
    old.replaceWith(side);
    old.classList.remove('pcm-side'); old.classList.add('pf43-comments');
    add('comments', 'Comments', $('.pcm-n', old)?.textContent || null).appendChild(old);
  } else modal.appendChild(side);
  const show = k => { $$('[data-tab43]', tabs).forEach(b => b.classList.toggle('on', b.dataset.tab43 === k)); $$('.pf43-pane', panes).forEach(p => (p.hidden = p.dataset.pane !== k)); };
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab43]'); if (b) show(b.dataset.tab43); });
  show('activity');
  modal.addEventListener('pcm-count', e => { const n = $('[data-tab43="comments"] .pf43-n', tabs); if (n) n.textContent = e.detail; });
  modal.addEventListener('pcm-gone', () => { $('[data-tab43="comments"]', tabs)?.remove(); $('[data-pane="comments"]', panes)?.remove(); modal.classList.add('has-pcm'); show('activity'); });
  // (0.43.1) A see-through copy of the banner runs along the top of the panel and fades out.
  const banner = $('.banner', card), bimg = $('.banner img', card);
  const glow = document.createElement('div');
  glow.className = 'pf43-glow';
  if (bimg?.src) glow.style.backgroundImage = `url("${bimg.currentSrc || bimg.src}")`;
  else if (banner) glow.style.background = getComputedStyle(banner).backgroundColor || '';
  const fit = () => { if (banner?.offsetHeight) glow.style.height = Math.round(banner.offsetHeight * 1.35) + 'px'; };
  fit(); requestAnimationFrame(fit);
  side.prepend(glow);
  // The theme colors of the card carry over to the panel.
  if (card.classList.contains('themed')) { side.classList.add('pf43-themed'); for (const v of ['--pt1', '--pt2']) side.style.setProperty(v, card.style.getPropertyValue(v)); }
  return side;
}
const _openProfile43 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile43(id, ...rest);
  const u = user(id);
  if (!u || u.system || u.bot) return r;
  if (id !== state.me.id) api('POST', `/api/users/${id}/view`).catch(() => {});
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  const card = modal?.querySelector(':scope > .pcard');
  if (!card || modal.dataset.pf43) return r;
  modal.dataset.pf43 = '1';
  modal.classList.add('has-pcm', 'has-pf43');
  modal.classList.remove('pcm-closed');
  const side = buildSide43(modal, card, u);
  // Phones: a row in the card opens the panel as a sheet (desktop always shows it).
  const body = $('.pc-body', card);
  $('.pf-crow', body)?.remove();
  const row = document.createElement('button');
  row.type = 'button'; row.className = 'pf-crow pf43-row';
  row.innerHTML = `<span class="pf-chev">›</span><b>Activity, widgets & comments</b><span class="pf-see">Open</span>`;
  const anchor = $('.pc-roles', body);
  (anchor ? (anchor.previousElementSibling?.tagName === 'H4' ? anchor.previousElementSibling : anchor) : body.querySelector('hr'))?.before(row) ?? body?.appendChild(row);
  const phone = () => matchMedia('(max-width: 760px)').matches;
  const setOpen = open => { modal.classList.toggle('pcm-closed', !open); $('.pf-see', row).textContent = open ? 'Hide' : 'Open'; };
  setOpen(!phone());
  row.addEventListener('click', () => setOpen(modal.classList.contains('pcm-closed')));
  $('.pf43-x', side).addEventListener('click', () => setOpen(false));
  // Your own profile: change your status right here.
  if (id === state.me.id && body && !$('.pf43-me', body)) {
    const box = myStatusBox43();
    // Under your name and badges (the badge row is added a moment after the card).
    const place = () => { const at = $(':scope > .pc-badges', body) || $(':scope > .pc-uname', body); if (at && at.nextElementSibling !== box) at.after(box); else if (!at && !box.isConnected) body.prepend(box); };
    place(); setTimeout(place, 150); setTimeout(place, 600);
  }
  return r;
};
// Opens a profile already expanded (no "View full profile" step).
async function openFullProfile43(id) {
  await openProfile(id);
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  if (!modal) return;
  // The compact view (and its button) is set up a moment after the profile opens.
  for (let i = 0; i < 30 && !$('.pf-full38', modal) && !modal.classList.contains('pc-compact'); i++) await new Promise(r => setTimeout(r, 40));
  const btn = $('.pf-full38', modal);
  if (btn) btn.click(); else modal.classList.remove('pc-compact');
}
// Activity in an open profile stays live.
const _onUser43 = onUser;
onUser = function (u) {
  const r = _onUser43(u);
  for (const side of $$(`.pf43-side[data-uid="${CSS.escape(u.id)}"]`)) {
    const now = $('.pf43-now', side), full = user(u.id);
    const k = JSON.stringify(full?.activities || full?.activity || null);
    if (now && full && now.dataset.k !== k) { now.dataset.k = k; now.innerHTML = nowHtml43(full); }
  }
  return r;
};

// ======================= your name in the corner opens your profile =======================
const _renderUserPanel43 = renderUserPanel;
renderUserPanel = function (...a) {
  const r = _renderUserPanel43(...a);
  const b = $('#me-btn');
  if (b && !b.dataset.pf43) {
    const nb = b.cloneNode(true);
    nb.dataset.pf43 = '1';
    nb.title = 'Your profile (right-click to change your status)';
    nb.addEventListener('click', () => openFullProfile43(state.me.id));
    nb.addEventListener('contextmenu', e => { e.preventDefault(); openStatusMenu(nb); });
    b.replaceWith(nb);
  }
  return r;
};
if (state.me && $('#me-btn')) renderUserPanel();

// ======================= activity next to a DM's name =======================
const _renderDMHeader43 = renderDMHeader;
renderDMHeader = function (...a) {
  const r = _renderDMHeader43(...a);
  if (state.view.type === 'dm') {
    const el = $('#dm-title'), u = user(activePeer());
    $('.dm43-act', el)?.remove();
    const line = u ? activityLine(u) : '';
    if (el && line) {
      el.insertAdjacentHTML('beforeend', `<button type="button" class="dm43-act" title="See what ${esc(u.displayName)} is up to">${line}</button>`);
      $('.dm43-act', el).addEventListener('click', () => openFullProfile43(u.id));
    }
  }
  return r;
};

// ======================= Spotify =======================
// (0.43.1) What the PC app last saw, shown in Settings › Connections to help when nothing appears.
let desktopSaw43 = null;
window.zunoDesktop?.onActivity?.(a => { desktopSaw43 = { a, at: Date.now() }; });
// Connect opens Spotify's own page in a small window; Zuno notices when you're done. Once
// connected you can choose whether your song shows, and see what Spotify last told Zuno.
const _addConnection43 = addConnection;
addConnection = async function (type, spotifyReady, done) {
  if (type !== 'spotify') return _addConnection43(type, spotifyReady, done);
  if (!spotifyReady) return _addConnection43(type, spotifyReady, done);
  let url;
  try { ({ url } = await api('GET', '/api/connections/spotify/start')); } catch (e) { return toast(e.message, true); }
  const w = Math.min(520, screen.availWidth - 40), h = Math.min(760, screen.availHeight - 60);
  const pop = window.open(url, 'zuno-spotify', `popup=yes,width=${w},height=${h},left=${Math.round((screen.availWidth - w) / 2)},top=${Math.round((screen.availHeight - h) / 2)}`);
  if (!pop) window.location.assign(url);
  toast('Log in to Spotify and press Agree');
  const started = Date.now();
  const tick = async () => {
    if (Date.now() - started > 5 * 60e3) return;
    try {
      const d = await api('GET', '/api/me/connections');
      if (d.connections.some(c => c.type === 'spotify')) {
        toast('Spotify is connected!');
        try { pop?.close(); } catch {}
        const body = $('#settings-body');
        if (body && $('.settings-nav [data-s="connections"].active')) renderConnections(body);
        return;
      }
    } catch {}
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 2500);
};
const _renderConnections43 = renderConnections;
renderConnections = async function (body, ...a) {
  const r = await _renderConnections43(body, ...a);
  const row = $('[data-c="spotify"]', body);
  if (!row || $('.sp43', body)) return r;
  let d;
  try { d = await api('GET', '/api/me/connections'); } catch { return r; }
  const c = d.connections.find(x => x.type === 'spotify');
  if (!c || !row.isConnected) return r;
  const last = d.spotifyLast;
  let note = 'Zuno checks Spotify every 20 seconds while you are online.';
  if (last?.playing) note = `${uiIcon('headphones')} Now playing: <b>${esc(last.song || 'a song')}</b>`;
  else if (last && !last.error) note = 'Nothing is playing on Spotify right now.';
  else if (last?.error) {
    note = `${uiIcon('warning')} Spotify won't share your song: <b>${esc(last.error)}</b>.`;
    if (/registered|developer|premium|403/i.test(`${last.error} ${last.status}`)) note += " Spotify only lets Zuno see songs when the Zuno Spotify app's owner has Spotify Premium and you're added under <b>User Management</b> in Spotify's developer dashboard. Until then, the Zuno PC app or a Last.fm connection shows your song instead.";
    else if (last.status === 401) note += ' Try removing Spotify and connecting it again.';
  }
  if (window.zunoDesktop) {
    const saw = desktopSaw43?.a?.list ? desktopSaw43.a.list.find(x => x.type === 'listening') : desktopSaw43?.a;
    note += `<br>${uiIcon('monitor')} ${saw?.type === 'listening' ? `The Zuno app sees <b>${esc(saw.details || 'a song')}</b> and shows it for you (this works even while Spotify says no).` : desktopSaw43 ? "The Zuno app doesn't see Spotify playing right now. If it is playing, update the Zuno app (download it again from heyzuno.uk/download)." : 'The Zuno app checks what Spotify is playing every 20 to 45 seconds.'}`;
  }
  row.insertAdjacentHTML('afterend', `<div class="sp43">
    <label class="setting-row"><div><div class="setting-title">Show what I'm listening to</div><div class="setting-desc">Your song shows on your profile, in member lists and in DMs.</div></div><input type="checkbox" class="switch" data-sp43 ${c.song !== false ? 'checked' : ''}></label>
    <div class="sp43-last muted small">${note}</div></div>`);
  $('[data-sp43]', body).addEventListener('change', async e => {
    try { await api('PUT', '/api/me/connections/spotify', { song: e.target.checked }); toast(e.target.checked ? 'Your Spotify song shows again' : 'Your Spotify song is hidden'); } catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  });
  return r;
};

// ======================= Open in app =======================
// In a browser on a computer: a button that opens (or starts) the Zuno PC app, right where you are.
function viewKey43() {
  const v = state.view || {};
  if (v.type === 'channel' && v.serverId && v.channelId) return `channel:${v.serverId}:${v.channelId}`;
  if (v.type === 'dm' && v.peerId) return `dm:${v.peerId}`;
  return '';
}
function openInApp43() {
  const to = viewKey43();
  let left = false;
  const blur = () => { left = true; };
  addEventListener('blur', blur, { once: true });
  location.href = `zuno://open${to ? `?to=${encodeURIComponent(to)}` : ''}`;
  setTimeout(() => {
    removeEventListener('blur', blur);
    if (!left && document.hasFocus()) toast("Didn't open? Get the Zuno app at heyzuno.uk/download");
  }, 1600);
}
(function addOpenInApp43() {
  if (window.zunoDesktop || (typeof onPhone === 'function' && onPhone()) || /android|iphone|ipad|mobile/i.test(navigator.userAgent)) return;
  const tryAdd = () => {
    const rail = $('#app .rail');
    if (!rail || $('#open-app43', rail)) return;
    const b = document.createElement('button');
    b.className = 'rail-btn'; b.id = 'open-app43';
    b.dataset.tip = 'Open in the Zuno app'; b.setAttribute('aria-label', 'Open in the Zuno app');
    b.innerHTML = uiIcon('monitor');
    b.addEventListener('click', openInApp43);
    rail.appendChild(b);
  };
  const _renderRail43 = typeof renderRail === 'function' ? renderRail : null;
  if (_renderRail43) renderRail = function (...a) { const r = _renderRail43(...a); tryAdd(); return r; };
  setTimeout(tryAdd, 1500);
})();
// In the PC app: a zuno:// link said where to go.
window.zunoDesktop?.onOpen?.(to => {
  const [kind, a, b] = String(to || '').split(':');
  try {
    if (kind === 'channel' && a && b) openChannel(a, b);
    else if (kind === 'dm' && a) openDM(a);
    else if (kind === 'profile' && a) openFullProfile43(a);
  } catch {}
});

// ======================= 0.43.1: Last.fm, the backup for songs =======================
// Spotify only shares "now playing" with apps that are out of development mode, so Last.fm is the
// backup: link Spotify to Last.fm once, add your Last.fm name here, and your song shows (phones too).
BRAND_PATHS.lastfm = 'M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.869.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z';
{
  // Right after Spotify in the list of tiles.
  const entries = Object.entries(CONNECTION_INFO);
  for (const [k] of entries) delete CONNECTION_INFO[k];
  for (const [k, v] of entries) { CONNECTION_INFO[k] = v; if (k === 'spotify') CONNECTION_INFO.lastfm = { name: 'Last.fm', color: '#d51007', icon: brandSvg('lastfm'), url: n => `https://www.last.fm/user/${encodeURIComponent(n)}` }; }
}
const _addConnection431 = addConnection;
addConnection = async function (type, ...a) {
  const r = await _addConnection431(type, ...a);
  if (type === 'lastfm') {
    const form = $('#layer form.dialog');
    if (form && !$('.lf43-help', form)) $('p.muted.small', form)?.insertAdjacentHTML('beforebegin', `<div class="lf43-help">${uiIcon('headphones')}<span>Shows your song on Zuno (on your phone too), without Spotify Premium. First, on last.fm go to <b>Settings › Applications › Spotify scrobbling › Connect</b>. Then put your Last.fm username here.</span></div>`);
  }
  return r;
};
const _renderConnections431 = renderConnections;
renderConnections = async function (body, ...a) {
  const r = await _renderConnections431(body, ...a);
  const row = $('[data-c="lastfm"]', body);
  if (!row || $('.lf43', body)) return r;
  let d;
  try { d = await api('GET', '/api/me/connections'); } catch { return r; }
  const last = d.lastfmLast;
  const note = !d.lastfmReady ? "Last.fm isn't set up on this Zuno server yet."
    : last?.playing ? `${uiIcon('headphones')} Now playing: <b>${esc(last.song || 'a song')}</b>`
    : last?.error ? `${uiIcon('warning')} Last.fm said: <b>${esc(last.error)}</b>. Check that the username is right.`
    : 'Zuno checks Last.fm every 30 seconds while you are online. Make sure Spotify scrobbling is on in your Last.fm settings.';
  row.insertAdjacentHTML('afterend', `<div class="sp43 lf43"><div class="sp43-last muted small">${note}</div></div>`);
  return r;
};

// ======================= 0.43.1: security =======================
// A login from a new device asks for the code Zuno emailed you (accounts with a confirmed email).
const _askTwoFactor431 = askTwoFactor;
askTwoFactor = function (ticket, ...a) {
  if (!String(ticket).startsWith('em_')) return _askTwoFactor431(ticket, ...a);
  return new Promise(resolve => {
    const ov = openLayer(`<form class="dialog modal tf-dialog">${mascot('curious')}<h3>Check your email</h3>
      <p class="muted" style="margin:0 0 12px;text-align:center">This is a new device for your account, so we emailed you a 6-digit code. It works for 10 minutes.</p>
      <label class="field">Code<input name="code" required autocomplete="one-time-code" inputmode="numeric" maxlength="8" placeholder="123456"></label>
      <p class="muted small">Can't find it? Check your spam folder.</p>
      <div class="form-error" id="tf-err"></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Back</button><button class="btn btn-primary">Log In</button></div></form>`);
    const f = $('form', ov);
    f.code.focus();
    $('[data-a=cancel]', ov).addEventListener('click', () => { closeLayer(); resolve(null); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('POST', '/api/login/email-code', { ticket, code: f.code.value.trim() }); closeLayer(); resolve(r); }
      catch (err) { $('#tf-err', ov).textContent = err.message; if (/took too long|again\./.test(err.message)) setTimeout(() => { closeLayer(); resolve(null); }, 1500); }
    });
  });
};
// A new login from the server (after a password change, or the regular refresh) replaces the old one
// everywhere: this tab, the saved accounts list and the live connection.
function adoptToken43(fresh) {
  if (!fresh || fresh === state.token) return;
  const old = state.token;
  state.token = fresh;
  try { localStorage.setItem('zuno_token', fresh); } catch {}
  try { const list = JSON.parse(localStorage.getItem('zuno_accounts') || '[]'); for (const a of list) if (a.token === old) a.token = fresh; localStorage.setItem('zuno_accounts', JSON.stringify(list)); } catch {}
  try { if (typeof connect === 'function') connect(); } catch {}
}
// "Confirm it's you": the server asks for your password before big changes, then the change goes ahead.
function askPassword43() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay'; ov.style.zIndex = 200;
    ov.innerHTML = `<form class="dialog modal" style="max-width:380px"><h3>${uiIcon('lock')} Confirm it's you</h3>
      <p class="muted" style="margin:0 0 12px">For your safety, type your password to do this.</p>
      <label class="field">Password<input name="pw" type="password" required autocomplete="current-password"></label>
      <div class="form-error"></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Confirm</button></div></form>`;
    $('#layer').appendChild(ov);
    const f = $('form', ov);
    f.pw.focus();
    const done = v => { ov.remove(); resolve(v); };
    $('[data-a=cancel]', ov).addEventListener('click', () => done(false));
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { await _api431('POST', '/api/me/reauth', { password: f.pw.value }); done(true); }
      catch (err) { $('.form-error', ov).textContent = err.message; }
    });
  });
}
const _api431 = api;
api = async function (method, url, body) {
  try {
    const r = await _api431(method, url, body);
    if (r?.rotatedToken) adoptToken43(r.rotatedToken);
    return r;
  } catch (err) {
    if (err?.message === "Confirm it's you to do that." && await askPassword43()) return api(method, url, body);
    throw err;
  }
};
// Logins refresh every few days (the server decides; usually nothing happens).
setTimeout(function rotate43() {
  if (!state.token || !state.me) return setTimeout(rotate43, 5000);
  _api431('POST', '/api/me/rotate').then(r => adoptToken43(r?.token)).catch(() => {});
}, 8000);

// Links in messages: a warning before opening ones that look like scams or pretend to be a site.
const KNOWN43 = ['zuno', 'heyzuno', '\x64iscord', 'steam', 'steampowered', 'steamcommunity', 'roblox', 'spotify', 'youtube', 'google', 'paypal', 'twitch', 'instagram', 'tiktok', 'epicgames', 'minecraft', 'microsoft', 'apple', 'amazon', 'github', 'nintendo', 'playstation', 'xbox'];
const lev43 = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
function linkRisk43(href) {
  let u;
  try { u = new URL(href, location.href); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.host === location.host) return null;
  const host = u.hostname.toLowerCase();
  if (host.startsWith('xn--') || host.includes('.xn--')) return 'This address uses look-alike letters, a common trick to pretend to be another site.';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'This link goes to a bare number address instead of a named site.';
  if (u.username || /@/.test(href.split('?')[0].replace(/^https?:\/\//, '').split('/')[0])) return 'This link hides where it really goes (there\'s an "@" in the address).';
  const parts = host.split('.');
  const main = (parts.length > 2 && parts.at(-2).length <= 3 ? parts.at(-3) : parts.at(-2)) || '';
  const whole = main.replace(/[-_]/g, ''), bits = [whole, ...main.split(/[-_]/)].filter(w => w.length >= 4);
  const early = parts.slice(0, -2);
  for (const k of KNOWN43) if (early.includes(k) && main !== k) return `This link starts with "${k}" but really goes to ${parts.slice(-2).join('.')}. That's a common trick.`;
  if (KNOWN43.includes(whole)) return null;
  for (const k of KNOWN43) {
    for (const word of bits) {
      if (word === k) { if (/gift|free|nitro|bloom|login|verify|claim|promo|giveaway/.test(whole)) return `This isn't the real ${k}: real ${k} links don't look like this. It might be a scam.`; continue; }
      if (Math.abs(word.length - k.length) <= 2 && lev43(word, k) <= (k.length >= 7 ? 2 : 1)) return `This site's name looks like "${k}" but isn't it. It might be pretending.`;
    }
    if (whole.includes(k) && whole !== k && /gift|free|nitro|bloom|login|verify|claim|promo|giveaway/.test(whole)) return `This isn't the real ${k}. It might be a scam.`;
  }
  return null;
}
document.addEventListener('click', e => {
  const a = e.target.closest?.('#messages a[href]');
  if (!a || a.dataset.ok43 || e.defaultPrevented) return;
  const why = linkRisk43(a.getAttribute('href'));
  if (!why) return;
  e.preventDefault(); e.stopPropagation();
  let host = ''; try { host = new URL(a.href).hostname; } catch {}
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.style.zIndex = 200;
  ov.innerHTML = `<div class="dialog modal" style="max-width:420px"><h3 style="color:#f5b14c">${uiIcon('warning')} Careful with this link</h3>
    <p class="muted" style="margin:0 0 10px">${esc(why)}</p><div class="lw43-host">${esc(host)}</div>
    <div class="actions"><button class="btn btn-link" data-go>Open anyway</button><button class="btn btn-primary" data-x>Don't open</button></div></div>`;
  $('#layer').appendChild(ov);
  $('[data-x]', ov).addEventListener('click', () => ov.remove());
  ov.addEventListener('mousedown', ev => { if (ev.target === ov) ov.remove(); });
  $('[data-go]', ov).addEventListener('click', () => { ov.remove(); window.open(a.href, '_blank', 'noopener,noreferrer'); });
}, true);
// Messages that look like the usual scams ("free Bloom/Nitro", "claim your gift", "steam gift")
// from people who aren't your friends get a warning under them.
const SCAM43 = /(free\s+(nitro|bloom|robux|gift|skins?|v-?bucks)|claim\s+(your|a|the)\s+(gift|prize|reward|nitro|bloom)|steam\s+gift|(\x64iscord|nitro|bloom)[\s.-]*gift|airdrop|you\s+(have\s+)?won\s+(a|an|\$)|gift\s*card\s+giveaway|scan\s+(this|the)\s+qr|verify\s+your\s+account\s+(here|now)|double\s+your\s+(money|crypto|bitcoin))/i;
function markScams43() {
  const box = $('#messages');
  const conv = activeConv();
  const messages = state.convos[conv]?.messages;
  const me = state.me;
  if (!box || !messages?.length || !me) return;

  // Build one lookup for this pass. The old implementation searched the full message array
  // separately for every visible row, making a long chat increasingly expensive (O(rows × msgs)).
  const pending = $$('.msg:not([data-sc43])', box);
  if (!pending.length) return;
  const byId = new Map(messages.map(m => [String(m.id), m]));
  const friends = new Set(state.friends || []);
  for (const row of pending) {
    row.dataset.sc43 = '1';
    const m = byId.get(String(row.dataset.id));
    if (!m || m.authorId === me.id || !m.content || !SCAM43.test(m.content)) continue;
    const au = user(m.authorId);
    if (au?.system || au?.isStaff || friends.has(m.authorId)) continue;
    $('.content', row)?.insertAdjacentHTML('afterend', `<div class="scam43">${uiIcon('warning')}<span>This looks like a common scam. Zuno and Zuno Staff never give away Bloom or prizes in DMs, and never ask for your password or a QR scan.</span></div>`);
  }
}
const _renderMessages431 = renderMessages;
// Message rendering is the source of truth: scan newly rendered rows once instead of waking up
// every two seconds to inspect the chat even when nothing has changed.
renderMessages = function (...a) { const r = _renderMessages431(...a); try { markScams43(); } catch {} return r; };

// ======================= 0.43.1: old replies, windows and memory =======================
// Clicking a reply to a message from long ago loads back until it's found, then jumps there.
const _jumpToMessage431 = jumpToMessage;
jumpToMessage = async function (id, ...a) {
  const conv = activeConv(), convo = state.convos[conv];
  if (convo && !convo.messages.some(m => m.id === id) && convo.hasMore) {
    toast('Finding that message…');
    for (let n = 0; n < 40 && convo.hasMore && !convo.messages.some(m => m.id === id); n++) {
      try {
        const oldest = convo.messages[0]?.createdAt || Date.now();
        const r = await api('GET', `${convBase(conv)}/messages?before=${oldest}`);
        for (const au of r.authors || []) state.users[au.id] = { ...au, ...state.users[au.id] };
        if (!r.messages.length) { convo.hasMore = false; break; }
        convo.messages = [...r.messages, ...convo.messages];
        convo.hasMore = r.hasMore;
        if (convo.from != null) convo.from += r.messages.length;
      } catch { break; }
    }
  }
  const i = convo ? convo.messages.findIndex(m => m.id === id) : -1;
  // Far back: draw a window around it, not everything from there to now.
  if (i >= 0 && !$(`#messages .msg[data-id="${CSS.escape(id)}"]`)) { const to = i + 120; convo.to = to >= convo.messages.length ? null : to; }
  return _jumpToMessage431(id, ...a);
};
const _renderMessages432 = renderMessages;
renderMessages = function (...a) {
  const convo = state.convos[activeConv()];
  // Sending while looking at old messages takes you back to now.
  if (convo?.to != null && convo.messages.at(-1)?.pending) { convo.to = null; convo.from = null; }
  return _renderMessages432(...a);
};
document.addEventListener('click', e => {
  if (!e.target.closest?.('.jump-present')) return;
  const convo = state.convos[activeConv()];
  if (convo?.to != null) { convo.to = null; convo.from = null; renderMessages(true); }
}, true);
// Chats you haven't looked at in a while give back their memory (they load again when opened).
{
  const lastSeen = {};
  setInterval(() => {
    const now = Date.now(), cur = activeConv();
    if (cur) lastSeen[cur] = now;
    for (const [k, c] of Object.entries(state.convos || {})) {
      if (k === cur || !c?.messages || c.messages.length <= 200) continue;
      if (now - (lastSeen[k] ||= now) < 10 * 60e3) continue;
      c.messages = c.messages.slice(-100);
      c.hasMore = true; c.from = null; c.to = null;
      c.seen = new Set(); c.enterAt = {};
    }
  }, 60e3);
}
// Profile videos and moving backgrounds pause while Zuno is in the background.
document.addEventListener('visibilitychange', () => {
  for (const v of $$('video.pc-bg, .ac42-banner video, .mh38-banner video')) {
    if (document.hidden) { if (!v.paused) { v.dataset.bg43 = '1'; v.pause(); } }
    else if (v.dataset.bg43) { delete v.dataset.bg43; v.play().catch(() => {}); }
  }
});

// ======================= 0.43.1: performance mode =======================
// Appearance › Performance mode: no blur, no animations, no moving backgrounds. For slower PCs.
const perfOn43 = () => { try { return localStorage.getItem('zuno_perf') === '1'; } catch { return false; } };
document.documentElement.classList.toggle('perf43', perfOn43());
const _renderAppearance431 = renderAppearance;
renderAppearance = function (body, ...a) {
  const r = _renderAppearance431(body, ...a);
  Promise.resolve(r).then(() => {
    if (!body?.isConnected || $('#perf43', body)) return;
    const g = document.createElement('div');
    g.className = 'setting-group'; g.id = 'perf43';
    g.innerHTML = `<h4 class="setting-head">Performance</h4>
      <label class="setting-row"><div><div class="setting-title">Performance mode</div><div class="setting-desc">Turns off blur, animations and moving profile backgrounds so Zuno runs smoother on slower computers. Only on this device.${(navigator.hardwareConcurrency || 8) <= 4 ? ' <b>Recommended for this computer.</b>' : ''}</div></div><input type="checkbox" class="switch" ${perfOn43() ? 'checked' : ''}></label>`;
    $('h2', body)?.after(g);
    $('input', g).addEventListener('change', e => {
      try { localStorage.setItem('zuno_perf', e.target.checked ? '1' : '0'); } catch {}
      document.documentElement.classList.toggle('perf43', e.target.checked);
      for (const v of $$('video.pc-bg')) e.target.checked ? v.pause() : v.play().catch(() => {});
      toast(e.target.checked ? 'Performance mode is on' : 'Performance mode is off');
    });
  });
  return r;
};
new MutationObserver(list => {
  if (!document.documentElement.classList.contains('perf43')) return;
  for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1) for (const v of n.matches?.('video.pc-bg') ? [n] : $$('video.pc-bg', n)) { v.autoplay = false; v.pause(); }
}).observe(document.body, { childList: true, subtree: true });

// ======================= 0.43.1: loading placeholders =======================
// "Loading…" becomes soft grey bars shaped like what's coming.
new MutationObserver(list => {
  for (const r of list) for (const n of r.addedNodes) {
    // Chat redraws are skipped, and only bits that say "Loading…" are looked through (keeps it cheap).
    if (n.nodeType !== 1 || n.id === 'messages' || n.closest?.('#messages') || !n.textContent.includes('Loading…')) continue;
    for (const el of [n, ...$$('.fp-empty, .pcm-empty, .muted', n)]) {
      if (!el.matches?.('.fp-empty, .pcm-empty, .muted') || el.children.length || el.textContent.trim() !== 'Loading…') continue;
      el.classList.add('sk43-host');
      // (0.53) Shaped like what's coming (people, cards, a card…) when zuno53.js knows.
      el.innerHTML = typeof skel53For === 'function' ? skel53For(el) : '<span class="sk43"><i></i><i></i><i></i></span>';
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ======================= 0.43.1: the user panel =======================
// Your status emoji and words, or what you're playing, under your name.
const _renderUserPanel431 = renderUserPanel;
renderUserPanel = function (...a) {
  const r = _renderUserPanel431(...a);
  const sub = $('#me-btn .sub'), me = state.me;
  if (sub && me) {
    const act = state.users[me.id]?.activity;
    if (me.customStatus) sub.innerHTML = `${me.customStatusEmoji ? `<span class="up43-emo">${esc(me.customStatusEmoji)}</span>` : ''}<span>${esc(me.customStatus)}</span>`;
    else if (act) sub.innerHTML = activityLine(state.users[me.id]);
    sub.classList.add('up43-sub');
  }
  return r;
};
if (state.me && $('#me-btn')) renderUserPanel();

// ======================= old PC apps =======================
// PC apps installed before 0.43 were set to update from the old GitHub account (now gone), so they
// never updated again. They still load Zuno, but they can't see Spotify songs or games, and their
// screen sharing is old. Tell them, with a download button. (0.43 apps have onOpen.)
const oldDesktop43 = !!window.zunoDesktop && typeof window.zunoDesktop.onOpen !== 'function';
function getNewApp43() {
  fetch('/download/info').then(r => r.json()).catch(() => ({})).then(d => {
    const url = d?.ready ? `${location.origin}/download/windows` : 'https://heyzuno.uk/download';
    window.open(url, '_blank', 'noopener');
  });
}
if (oldDesktop43) {
  setTimeout(function oldAppBar43() {
    if (!state.me) return setTimeout(oldAppBar43, 3000);
    try { if (Date.now() - (+localStorage.getItem('zuno_oldapp_bar') || 0) < 3 * 864e5) return; } catch {}
    if ($('.oldapp43')) return;
    const bar = document.createElement('div');
    bar.className = 'oldapp43';
    bar.innerHTML = `${uiIcon('monitor')}<span><b>Your Zuno app is out of date</b> and can't update itself anymore. Get the new one for your Spotify song and games on your profile, better screen sharing, and updates again.</span>
      <button class="btn btn-primary btn-sm" data-get>Get the new app</button><button class="icon-btn" data-x aria-label="Not now">✕</button>`;
    document.body.appendChild(bar);
    $('[data-get]', bar).addEventListener('click', getNewApp43);
    $('[data-x]', bar).addEventListener('click', () => { try { localStorage.setItem('zuno_oldapp_bar', Date.now()); } catch {} bar.remove(); });
  }, 4000);
}
// Settings › Connections and your empty Activity say it too.
const _renderConnections433 = renderConnections;
renderConnections = async function (body, ...a) {
  const r = await _renderConnections433(body, ...a);
  if (oldDesktop43 && !$('.oldapp43-note', body)) {
    $('.conn-tip', body)?.remove();
    $('.sp43', body)?.insertAdjacentHTML('beforeend', `<div class="oldapp43-note">${uiIcon('warning')}<span>This Zuno app is too old to see what Spotify is playing (or your games). <a href="#" data-getapp>Get the new Zuno app</a> and your song shows up on its own, no Premium needed.</span></div>`);
    $('[data-getapp]', body)?.addEventListener('click', e => { e.preventDefault(); getNewApp43(); });
  }
  return r;
};

// A game and a song at once: the pop-up profile shows both cards too.
const _activityCard431 = activityCard;
activityCard = function (u) {
  if (u?.activities?.length > 1) return u.activities.map(x => _activityCard431({ ...u, activity: x, activities: null })).join('');
  return _activityCard431(u);
};
