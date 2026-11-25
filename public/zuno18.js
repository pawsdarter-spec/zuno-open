'use strict';
// Zuno 0.18: @mention suggestions, a "Zuno is updating" screen while the server restarts, and a
// "Saving changes…" note while server edits go through.

// ======================= @mention suggestions =======================
// Typing "@" shows @everyone, @here and six people from the chat; typing more narrows it to the
// best matches.
const AT_SPECIALS = [
  { special: 'everyone', desc: 'Notify everyone who can see this channel' },
  { special: 'here', desc: 'Notify everyone online right now' },
];
function mentionPool() {
  let ids = [];
  const v = state.view;
  if (v.type === 'channel') {
    const sid = state.currentServerId;
    ids = state.serverMembers[sid] || [];
    if (!ids.length && !mentionPool.loading) { mentionPool.loading = true; loadServerMembers(sid).finally(() => { mentionPool.loading = false; }); }
  } else if (v.type === 'group') ids = (state.groups.find(g => g.id === v.groupId)?.members || []).map(u => u.id);
  else if (v.type === 'dm') ids = [v.peerId];
  return ids.filter(id => id !== state.me.id).map(user).filter(Boolean);
}
// Lower is better; null means it doesn't match.
function mentionScore(u, q) {
  const un = (u.username || '').toLowerCase(), dn = (u.displayName || '').toLowerCase(), nick = nameIn(u).toLowerCase();
  if (un === q || dn === q || nick === q) return 0;
  if (un.startsWith(q)) return 1;
  if (dn.startsWith(q) || nick.startsWith(q)) return 2;
  if ([...dn.split(/\s+/), ...nick.split(/\s+/)].some(w => w.startsWith(q))) return 3;
  if (un.includes(q) || dn.includes(q) || nick.includes(q)) return 4;
  return null;
}
function wireMentionAutocomplete(ta, container) {
  let box = null, items = [], sel = 0, range = null, randomSix = null;
  const close = () => { box?.remove(); box = null; items = []; randomSix = null; };
  const pick = i => {
    const it = items[i];
    if (!it || !range) return;
    const text = '@' + (it.special || it.username) + ' ';
    ta.value = ta.value.slice(0, range[0]) + text + ta.value.slice(range[1]);
    const pos = range[0] + text.length;
    ta.setSelectionRange(pos, pos);
    close();
    ta.dispatchEvent(new Event('input'));
  };
  const row = (it, i) => it.special
    ? `<button class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="at-ico">@</span><b>@${it.special}</b><span class="at-sub">${esc(it.desc)}</span></button>`
    : `<button class="${i === sel ? 'sel' : ''}" data-i="${i}">${avatar(it, 24)}<b>${esc(nameIn(it))}</b><span class="at-sub">@${esc(it.username)}</span></button>`;
  const draw = q => {
    if (!items.length) return close();
    if (!box) { box = document.createElement('div'); box.className = 'ep-suggest at-suggest'; container.prepend(box); }
    box.innerHTML = `<div class="ep-suggest-head">${q ? `Members matching <b>@${esc(q)}</b>` : 'Mention someone'}</div>` + items.map(row).join('');
    $$('[data-i]', box).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pick(Number(b.dataset.i)); }));
  };
  ta.addEventListener('input', () => {
    const upto = ta.value.slice(0, ta.selectionStart);
    const m = /(^|\s)@([\w.]{0,32})$/.exec(upto);
    if (!m) return close();
    const q = m[2].toLowerCase();
    range = [ta.selectionStart - m[2].length - 1, ta.selectionStart];
    const people = mentionPool();
    const specials = state.view.type === 'channel' ? AT_SPECIALS : [];
    if (!q) {
      // The same six stay put while the list is open, so it doesn't reshuffle under your pointer.
      if (!randomSix) randomSix = people.map(u => [Math.random(), u.id]).sort((a, b) => a[0] - b[0]).slice(0, 6).map(x => x[1]);
      items = [...specials, ...randomSix.map(user).filter(Boolean)];
    } else {
      const hits = [
        ...specials.filter(s => s.special.startsWith(q)).map(s => [1, '', s]),
        ...people.map(u => [mentionScore(u, q), nameIn(u).toLowerCase(), u]).filter(x => x[0] !== null),
      ];
      items = hits.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1])).slice(0, 8).map(x => x[2]);
    }
    sel = 0;
    draw(q);
  });
  ta.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; draw(range && ta.value.slice(range[0] + 1, range[1]).toLowerCase()); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; draw(range && ta.value.slice(range[0] + 1, range[1]).toLowerCase()); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  ta.addEventListener('blur', () => setTimeout(close, 120));
}

// ======================= "Zuno is updating" =======================
// While the server restarts (a new version going out), requests fail for a minute. Instead of
// buttons that seem to do nothing, everyone sees a short loading screen until Zuno is back.
let updatingTimer = null, updatingSince = 0, sawDown = false;
async function serverUp() {
  try { const r = await fetch('/api/version', { cache: 'no-store' }); return r.ok && !!(await r.json()).version; } catch { return false; }
}
function showUpdating(announced = false) {
  if ($('#updating-screen') || !navigator.onLine) return;
  updatingSince = Date.now(); sawDown = !announced;
  const el = document.createElement('div');
  el.id = 'updating-screen';
  el.className = 'updating-screen' + (Calls.room ? ' compact' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="us-card">${mascot('happy')}<b>Zuno is updating</b><span>Hang tight, this usually takes under a minute. Nothing you've sent is lost.</span><div class="us-bar"><i></i></div></div>`;
  document.body.appendChild(el);
  clearInterval(updatingTimer);
  updatingTimer = setInterval(async () => {
    // When the server announced the restart it may answer for a few more seconds: wait until it
    // has actually gone down and come back (or a minute and a half, in case it never went down).
    if (!(await serverUp())) { sawDown = true; return; }
    if (!sawDown && Date.now() - updatingSince < 90e3) return;
    clearInterval(updatingTimer); updatingTimer = null;
    el.classList.add('done');
    setTimeout(() => el.remove(), 300);
    connect();
    checkServerVersion(); // a new version reloads Zuno; otherwise it just carries on
  }, 3000);
}
// Only show it when Zuno itself is down, not for a slow request or your own Wi-Fi dropping.
let checkingUp = false;
async function maybeUpdating() {
  if (checkingUp || $('#updating-screen') || !navigator.onLine || !state.me) return;
  checkingUp = true;
  try {
    if (await serverUp()) return;
    await new Promise(r => setTimeout(r, 1500));
    if (!(await serverUp())) showUpdating();
  } finally { checkingUp = false; }
}
const _connect18 = connect;
connect = function (...a) {
  const r = _connect18(...a);
  state.es?.addEventListener('error', maybeUpdating);
  state.es?.addEventListener('server-restart', () => showUpdating(true));
  return r;
};

// ======================= "Saving changes…" =======================
// Server edits (settings, roles, channels, emoji…) show a small note while they go through.
const SERVER_EDIT = /^\/api\/(servers|channels|categories)\//;
const NOT_AN_EDIT = /\/(messages|typing|read|ack|seen|draft|voice|join|leave)(\/|$|\?)/;
let savingCount = 0, savingShownAt = 0, savingTimer = null;
function savingNote(on) {
  let el = $('#saving-note');
  if (on) {
    if (!el) { el = document.createElement('div'); el.id = 'saving-note'; el.className = 'saving-note'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'saving-note'; el.innerHTML = '<i class="sn-spin"></i>Saving changes…';
    savingShownAt = Date.now();
    return;
  }
  if (!el) return;
  setTimeout(() => {
    if (savingCount) return;
    el.className = 'saving-note ok'; el.innerHTML = '✓ Saved';
    setTimeout(() => { if (!savingCount) el.remove(); }, 900);
  }, Math.max(0, 450 - (Date.now() - savingShownAt)));
}
const _api18 = api;
api = async function (method, url, body) {
  const edit = method !== 'GET' && SERVER_EDIT.test(url) && !NOT_AN_EDIT.test(url);
  if (edit && !savingCount++) savingTimer = setTimeout(() => savingNote(true), 250);
  try { return await _api18(method, url, body); }
  catch (e) {
    if (e instanceof TypeError || /something went wrong/i.test(e.message)) maybeUpdating();
    throw e;
  } finally {
    if (edit && !--savingCount) { clearTimeout(savingTimer); savingNote(false); }
  }
};
