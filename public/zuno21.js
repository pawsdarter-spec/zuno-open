'use strict';
// Zuno 0.21: the phone layout. Settings open as a list you tap into (with a back button), menus
// slide up from the bottom, and the buttons that did nothing on phones now work.
// Everything here only changes things at phone widths (760px and below) unless it says otherwise.

const onPhone = () => matchMedia('(max-width: 760px)').matches;

// ======================= Settings & Server Settings on phones =======================
// A full-screen list of sections; tapping one slides its page in, with ‹ Back at the top.
function phoneSettingsBar(el) {
  const main = $('.settings-main', el);
  if (!main || $('.m-set-bar', main)) return;
  main.insertAdjacentHTML('afterbegin', `<div class="m-set-bar"><button class="m-set-back" aria-label="Back to the list">‹ <span>Back</span></button><b class="m-set-title"></b><button class="m-set-x" aria-label="Close">✕</button></div>`);
  $('.m-set-back', main).addEventListener('click', () => { el.classList.remove('m-page'); main.scrollTop = 0; });
  $('.m-set-x', main).addEventListener('click', () => $('#settings-close, #ss-close', el)?.click());
}
function phoneSettingsOpened(startOnPage) {
  const el = $('#layer .settings:last-of-type');
  if (!el) return;
  phoneSettingsBar(el);
  el.classList.add('m-list');
  el.classList.toggle('m-page', !!startOnPage && onPhone());
  setPhoneSettingsTitle(el);
}
function setPhoneSettingsTitle(el) {
  const active = $('.settings-nav [data-s].active, .settings-nav [data-ss].active', el);
  const t = $('.m-set-title', el);
  if (t) t.textContent = active ? active.textContent.trim() : '';
}
// Tapping a section in the list opens its page.
document.addEventListener('click', e => {
  const b = e.target.closest('.settings-nav [data-s], .settings-nav [data-ss], #ss-results [data-ss]');
  if (!b || ['logout', 'delete'].includes(b.dataset.s || b.dataset.ss)) return;
  const el = b.closest('.settings');
  if (!el) return;
  setTimeout(() => { el.classList.add('m-page'); setPhoneSettingsTitle(el); $('.settings-main', el).scrollTop = 0; });
});
const _openSettings21 = openSettings;
openSettings = function (section, ...rest) {
  const r = _openSettings21(section, ...rest);
  phoneSettingsOpened(section);
  return r;
};
const _openServerSettings21 = openServerSettings;
openServerSettings = function (sv, section, ...rest) {
  const r = _openServerSettings21(sv, section, ...rest);
  phoneSettingsOpened(section);
  return r;
};

// ======================= search in the top bar =======================
// On phones the search box is just a magnifier. Tapping it now opens the box across the top bar
// (before, the box stayed hidden and nothing happened).
document.addEventListener('click', e => {
  const s = e.target.closest('#main .topbar .tb-search');
  if (!s || !onPhone()) return;
  const bar = s.closest('.topbar');
  if (bar.classList.contains('m-searching')) return;
  e.preventDefault();
  bar.classList.add('m-searching');
  const input = $('input', s);
  if (!$('.m-search-x', s)) {
    s.insertAdjacentHTML('beforeend', '<button type="button" class="m-search-x" aria-label="Close search">✕</button>');
    $('.m-search-x', s).addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); bar.classList.remove('m-searching'); });
  }
  input.focus();
}, true);

// ======================= profile / members button =======================
// The side panel doesn't fit on small screens. In a DM the button opens their profile; in a group
// it opens the member list as a drawer.
document.addEventListener('click', e => {
  const b = e.target.closest('#toggle-panel');
  if (!b || innerWidth > 1100) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (state.view.type === 'dm') return openProfile(state.view.peerId);
  const panel = $('#profile-panel');
  if (!panel) return;
  if (panel.classList.contains('drawer-open')) return closeMemberDrawer();
  panel.classList.remove('hidden');
  panel.classList.add('drawer-open');
  const bd = document.createElement('div');
  bd.id = 'member-backdrop'; bd.className = 'member-backdrop';
  bd.addEventListener('click', closeMemberDrawer);
  ($('#app') || document.body).appendChild(bd); // inside #app so it stays under the drawer when an app background gives #app its own layer
}, true);
const _closeMemberDrawer21 = closeMemberDrawer;
closeMemberDrawer = function () { $('#profile-panel.drawer-open')?.classList.remove('drawer-open'); return _closeMemberDrawer21(); };

// ======================= menus slide up from the bottom =======================
// On a phone, right-click / long-press menus become a sheet along the bottom of the screen with
// big rows that are easy to tap. (CSS does the layout; this adds the handle and swipe-to-close.)
new MutationObserver(muts => {
  if (!onPhone()) return;
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1 || !n.classList.contains('menu') || n.dataset.sheet) continue;
    n.dataset.sheet = '1';
    n.classList.add('m-sheet');
    let startY = null;
    n.addEventListener('touchstart', e => { startY = n.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    n.addEventListener('touchmove', e => { if (startY != null) { const dy = Math.max(0, e.touches[0].clientY - startY); n.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    n.addEventListener('touchend', e => {
      const dy = startY == null ? 0 : e.changedTouches[0].clientY - startY;
      startY = null; n.style.transform = '';
      if (dy > 80) (n.id === 'pick-menu' ? n.remove() : closeLayer());
    });
  }
}).observe($('#layer'), { childList: true });

// ======================= staff: moderate a profile =======================
// Staff see "Moderate profile" on profiles: take down single widgets, the bio, status, avatar…
// (server side: server/profilemod.js). The person is told what was removed and why.
const MOD_PARTS = [
  ['avatar', 'Avatar', u => !!u.avatar], ['banner', 'Banner', u => !!u.profileBanner], ['background', 'Profile background', u => !!u.profileBackground],
  ['sound', 'Profile sound', u => !!u.profileSound], ['bio', 'About Me', u => !!u.bio], ['status', 'Custom status', u => !!u.customStatus],
  ['pronouns', 'Pronouns', u => !!u.pronouns], ['displayName', 'Display name (back to their username)', u => u.displayName !== u.username],
];
function openProfileModerator(u) {
  const widgets = u.widgets || [];
  const ov = openLayer(`<form class="dialog modal prof-mod">
    <h3>🛡️ Moderate ${esc(u.displayName)}'s profile</h3>
    <p class="muted small" style="margin:0 0 10px">Pick what breaks the rules. It's removed right away and they get a message from Zuno saying what and why.</p>
    ${widgets.length ? `<div class="setting-head">Widgets</div>${widgets.map((w, i) => `<label class="pm-row"><input type="checkbox" name="w" value="${i}"><span><b>${esc(w.title || w.type)}</b> <span class="muted small">${esc(w.type)}${w.body ? ` · ${esc(String(w.body).slice(0, 60))}` : w.items ? ` · ${esc(w.items.join(', ').slice(0, 60))}` : ''}</span></span></label>`).join('')}` : ''}
    <div class="setting-head" style="margin-top:10px">Profile</div>
    ${MOD_PARTS.filter(([, , has]) => has(u)).map(([k, label]) => `<label class="pm-row"><input type="checkbox" name="p" value="${k}"><span>${label}</span></label>`).join('') || '<p class="muted small">Nothing else on this profile to remove.</p>'}
    <label class="field" style="margin-top:12px">Reason (they'll see this)<input name="note" maxlength="300" placeholder="e.g. Inappropriate image"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red">Remove</button></div></form>`);
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const parts = $$('[name=p]:checked', f).map(x => x.value), widgetIdx = $$('[name=w]:checked', f).map(x => Number(x.value));
    if (!parts.length && !widgetIdx.length) return toast('Pick what to remove.', true);
    try {
      const { user: nu } = await api('POST', `/api/mod/users/${u.id}/profile`, { parts, widgets: widgetIdx, note: f.note.value });
      state.users[nu.id] = { ...state.users[nu.id], ...nu };
      toast('Removed. They were told why.');
      closeLayer();
    } catch (err) { toast(err.message, true); }
  });
}
const _openProfile21 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile21(id, ...rest);
  const u = user(id);
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  if (state.me?.isStaff && u && !u.system && !u.bot && u.id !== state.me.id && modal && !$('[data-a="profmod"]', modal)) {
    const anchor = $('.pc-staff', modal);
    const b = document.createElement('button');
    b.className = 'pc-staff'; b.dataset.a = 'profmod'; b.textContent = 'Moderate profile';
    anchor ? anchor.before(b) : $('.pcard', modal)?.appendChild(b);
    b.addEventListener('click', () => { closeLayer(); openProfileModerator(user(id)); });
  }
  return r;
};

// ======================= less redrawing =======================
// Someone changing their status or profile used to redraw the whole chat, the member list and the
// sidebar, once per change. Now changes that arrive together are handled in one go, and the chat
// is only redrawn when something it shows (a name, a picture…) changed for someone in it.
const CHAT_FIELDS = ['displayName', 'username', 'avatar', 'nameColor', 'nameStyle', 'decoration', 'badges', 'bot', 'roleColor', 'deleted', 'keepOwnColor'];
const pendingUsers = new Map();
let userFlush = null;
onUser = function (u) {
  const before = state.users[u.id];
  const chatChange = !before || CHAT_FIELDS.some(k => k in u && JSON.stringify(u[k]) !== JSON.stringify(before[k]));
  state.users[u.id] = { ...before, ...u };
  if (u.id === state.me?.id) state.me = { ...state.me, ...u };
  const prev = pendingUsers.get(u.id);
  pendingUsers.set(u.id, { chat: chatChange || !!prev?.chat });
  if (!userFlush) userFlush = requestAnimationFrame(flushUsers);
};
function flushUsers() {
  userFlush = null;
  const changes = new Map(pendingUsers);
  pendingUsers.clear();
  if (!state.me) return;
  const ids = [...changes.keys()];
  const chatIds = ids.filter(id => changes.get(id).chat);
  if (changes.has(state.me.id)) renderUserPanel();
  if (state.currentServerId) renderServerSidebar(); else renderDMList();
  const shownInChat = () => { const c = state.convos[activeConv()]; return !!c && chatIds.some(id => id === state.me.id || c.messages.some(m => m.authorId === id)); };
  const v = state.view.type;
  if (v === 'friends') renderFriendsBody();
  else if (v === 'channel') { renderMemberList(); if (shownInChat()) renderMessages(); }
  else if (v === 'voice') renderVoiceStage();
  else if (ids.includes(activePeer()) || changes.has(state.me.id)) { renderDMHeader(); renderProfilePanel(); if (shownInChat()) renderMessages(); }
  else if (v === 'group') { if (shownInChat()) renderMessages(); }
}

// ======================= iPhone photos (HEIC) =======================
// Most browsers can't show HEIC photos. Where the browser can read them (Safari), they're turned
// into JPEGs before sending so everyone can see them. If one still can't be shown, it becomes a
// download card instead of a broken picture.
const _uploadFile21 = uploadFile;
uploadFile = async function (f) {
  if (/^image\/hei[cf]$/i.test(f.type) || /\.hei[cf]$/i.test(f.name || '')) {
    try {
      const bmp = await createImageBitmap(f);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      if (blob) f = new File([blob], (f.name || 'photo').replace(/\.hei[cf]$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch {} // this browser can't read it: send it as it is
  }
  return _uploadFile21(f);
};
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.matches('img.att-img') || img.dataset.failed) return;
  img.dataset.failed = '1';
  const box = img.closest('.msg-media, .gal-item');
  if (!box || !/\.(heic|heif|avif|bmp)$/i.test(img.dataset.full || img.src)) return;
  const name = img.dataset.name || 'photo';
  box.outerHTML = `<a class="att-file" href="${esc(img.dataset.full || img.src)}" download="${esc(name)}" title="Download ${esc(name)}"><span class="att-ico">${ICON.file}</span><span class="att-meta"><b>${esc(name)}</b><small>${fileKind(name)} · your browser can't show it, tap to download</small></span><span class="att-dl">${ICON.download}</span></a>`;
}, true);
