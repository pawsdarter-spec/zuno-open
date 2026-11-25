'use strict';
// Zuno 0.36 (silent): Settings › My Profile redesign, and a fuller My Account.

// ======================= My Profile =======================
// Each section gets an icon header; the picture, banner, background and sound become rows with a
// live thumbnail next to their buttons (the buttons are the same ones, so everything they did
// still works); the name and pronouns sit side by side; the sound gets a preview and a simple
// Loop / Play once switch.
const PF36_ICONS = {
  identity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.3"/><path d="M6.2 16c.6-1.6 1.6-2.4 2.8-2.4s2.2.8 2.8 2.4M14.5 10h4M14.5 13.5h3"/></svg>',
  looks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="7.8" r="1.2" fill="currentColor"/></svg>',
  flair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L19 8.2l-3.8 3.4 1.1 5L12 14l-4.3 2.6 1.1-5L5 8.2l5.1-.6Z"/><path d="M19 15l.7 1.6 1.6.7-1.6.7L19 20l-.7-1.6-1.6-.7 1.6-.7Z"/></svg>',
  about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5Z"/><path d="M9 11h6M9 14h4"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
};
const NOTE36 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';

function pf36Thumb(kind) {
  // (0.53) The banner color you're trying shows here too, before it's saved.
  const me = settingsDraft?.bannerColor ? { ...state.me, bannerColor: settingsDraft.bannerColor } : state.me;
  if (kind === 'avatar') return me.avatar ? `<img src="${esc(me.avatar)}" alt="">` : `<span class="m36-ini" style="background:${esc(me.bannerColor || 'var(--brand)')}">${esc((me.displayName || '?')[0].toUpperCase())}</span>`;
  if (kind === 'banner') return me.profileBanner ? `<img src="${esc(me.profileBanner.url)}" alt="">` : `<span class="m36-swatch" style="background:${esc(me.bannerColor || '#0aa896')}"></span>`;
  if (kind === 'bg') { const bg = me.profileBackground; return bg ? (bg.type === 'video' ? `<video src="${esc(bg.url)}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${esc(bg.url)}" alt="">`) : '<span class="m36-none">None</span>'; }
  if (kind === 'sound') return `<span class="m36-note${me.profileSound ? ' on' : ''}">${NOTE36}</span>`;
  return '';
}
// Turns a "Title / hint / buttons" field into a row: thumbnail · title + hint · buttons.
function pf36Row(field, kind, title) {
  if (!field || field.dataset.m36) return;
  field.dataset.m36 = '1';
  const hint = $(':scope > .hint', field), row = $(':scope > .editor-row', field);
  if (!row) return;
  field.classList.add('m36-field');
  // The field's own title is a bare text node: take it out.
  for (const n of [...field.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) n.remove();
  const wrap = document.createElement('div');
  wrap.className = 'm36-row';
  wrap.innerHTML = `<div class="m36-thumb m36-${kind}" data-thumb="${kind}">${pf36Thumb(kind)}</div><div class="m36-text"><b>${esc(title)}</b></div><div class="m36-acts"></div>`;
  field.prepend(wrap);
  if (hint) { hint.removeAttribute('style'); wrap.after(hint); }
  const acts = $('.m36-acts', wrap);
  for (const el of [...row.children]) {
    if (el.matches('.muted.small, [id$="-status"]')) { el.classList.add('m36-status'); $('.m36-text', wrap).appendChild(el); }
    else acts.appendChild(el);
  }
  row.remove();
}
function pf36Refresh() {
  for (const t of $$('#profile-form [data-thumb]')) {
    const html = pf36Thumb(t.dataset.thumb);
    if (t.dataset.was !== html) { t.dataset.was = html; t.innerHTML = html; }
  }
  const play = $('#m36-play');
  if (play) play.disabled = !state.me.profileSound;
}
function pf36Polish() {
  const form = $('#profile-form');
  if (!form?.dataset.grouped || form.dataset.m36) return;
  form.dataset.m36 = '1';
  document.body.classList.add('pf36');
  // Section headers with icons.
  for (const [key] of PF_GROUPS) {
    const head = $(`#pf-${key} .pf-card-head`);
    if (head && !$('.m36-ic', head)) head.insertAdjacentHTML('afterbegin', `<span class="m36-ic m36-ic-${key}">${PF36_ICONS[key] || ''}</span>`);
  }
  // Identity: name and pronouns side by side.
  const idc = $('#pf-identity');
  if (idc) { const fs = $$(':scope > label.field', idc); if (fs.length >= 2) { const g = document.createElement('div'); g.className = 'm36-pair'; fs[0].before(g); fs.forEach(f => g.appendChild(f)); } }
  // Looks.
  const byTitle = re => $$('#profile-form .field').find(f => re.test((f.firstChild?.textContent || '').trim()));
  pf36Row(byTitle(/^Avatar$/), 'avatar', 'Avatar');
  const bannerField = byTitle(/^Profile Banner/), colorField = byTitle(/^Banner Color/);
  pf36Row(bannerField, 'banner', 'Banner');
  // The banner color becomes a swatch on the banner row ("or a color").
  if (bannerField && colorField) {
    const input = $('input[type=color]', colorField), hex = $('#banner-hex', colorField), note = $(':scope > .hint', colorField);
    const box = document.createElement('label');
    box.className = 'm36-color'; box.title = 'Banner color (shows when you have no banner image)';
    box.innerHTML = '<span class="muted small">or a color</span>';
    if (input) box.appendChild(input);
    if (hex) box.appendChild(hex);
    $('.m36-acts', bannerField)?.prepend(box);
    if (note) bannerField.appendChild(note);
    colorField.remove();
    // (0.53) The color goes into the unsaved changes (it used to overwrite the saved one in this
    // window, so Save Changes never appeared and the color was lost).
    const pick = () => { if (settingsDraft) settingsDraft.bannerColor = input.value; if (hex) hex.textContent = input.value; pf36Refresh(); renderSaveBar(); };
    input?.addEventListener('input', pick);
    input?.addEventListener('change', pick);
  }
  pf36Row(byTitle(/^Profile Background/), 'bg', 'Background');
  pf36Row(byTitle(/^Profile Sound/), 'sound', 'Profile sound');
  // Sound: a preview button, and Loop / Play once as a switch.
  const sf = $('#pf-sound .m36-field');
  if (sf && !$('#m36-play', sf)) {
    const play = document.createElement('button');
    play.type = 'button'; play.id = 'm36-play'; play.className = 'btn btn-grey btn-sm'; play.innerHTML = `${ICON.play || '▶'} <span>Preview</span>`;
    let audio = null;
    play.addEventListener('click', () => {
      if (audio && !audio.paused) { audio.pause(); play.querySelector('span').textContent = 'Preview'; return; }
      audio = new Audio(state.me.profileSound); audio.volume = (prefs().soundVolume ?? 60) / 100;
      audio.play().catch(() => toast("Couldn't play it.", true));
      play.querySelector('span').textContent = 'Stop';
      audio.addEventListener('ended', () => { play.querySelector('span').textContent = 'Preview'; });
      // (0.45.1) Closing Settings (or leaving this page) stops the preview.
      const a = audio, watch = setInterval(() => { if (!play.isConnected || a.paused) { a.pause(); clearInterval(watch); } }, 400);
    });
    $('.m36-acts', sf)?.prepend(play);
    const mode = $('.sound-mode', sf);
    mode?.classList.add('m36-seg');
  }
  // About: a live count on the status too.
  const cs = $('#pf-about input[name=customStatus]');
  if (cs && !$('.m36-count', cs.parentElement)) {
    const n = document.createElement('span'); n.className = 'char-count m36-count';
    const upd = () => (n.textContent = 80 - cs.value.length);
    cs.before(n); upd(); cs.addEventListener('input', upd);
  }
  // Name Style and Profile Widgets sat below everything: they become cards in the same column.
  const editor = $('.profile-editor');
  if (editor && !$('.m36-col', editor)) {
    const col = document.createElement('div');
    col.className = 'm36-col';
    form.before(col); col.appendChild(form);
    for (const [id, key, icon] of [['ns-editor', 'namestyle', PF36_ICONS.identity], ['wg-editor', 'widgets', PF36_ICONS.flair]]) {
      const box = document.getElementById(id);
      if (!box) continue;
      box.classList.add('pf-card', 'm36-extra'); box.id = id; box.dataset.pfkey = key;
      const h = $(':scope > .setting-head', box), d = $(':scope > .setting-desc', box);
      const head = document.createElement('div');
      head.className = 'pf-card-head';
      head.innerHTML = `<span class="m36-ic m36-ic-${key}">${key === 'namestyle' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19 9.5 5h1L16 19M6.3 14h7.4M17 10v9M17 13c0-1.7 1.2-3 3-3"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 14v6.5M14 17.25h6.5"/></svg>'}</span><h3>${esc(h?.textContent || '')}</h3><span>${esc(d?.textContent || '')}</span>`;
      h?.remove(); d?.remove();
      box.prepend(head);
      box.id = id;
      box.querySelector(':scope > .pf-card-head').dataset.anchor = 'pf-' + key;
      box.setAttribute('data-anchor', 'pf-' + key);
      col.appendChild(box);
    }
    // Jump links for them too.
    const sub = $('.pf-subnav');
    if (sub) for (const [id, label] of [['ns-editor', 'Name Style'], ['wg-editor', 'Widgets']]) {
      if (!document.getElementById(id) || $(`[data-jump36="${id}"]`, sub)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.jump36 = id; b.textContent = label;
      b.addEventListener('click', () => { document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); $$('button', sub).forEach(x => x.classList.toggle('on', x === b)); });
      // In page order: after Sound.
      sub.appendChild(b);
    }
  }
  pf36Refresh();
  // Thumbnails follow uploads and removals (the preview redraws whenever those change).
  const prev = $('.profile-editor .preview');
  if (prev) new MutationObserver(() => requestAnimationFrame(pf36Refresh)).observe(prev, { childList: true, subtree: true });
}
const _showSettingsSection36 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  document.body.classList.remove('pf36');
  const r = _showSettingsSection36(section, ...a);
  if (section === 'profile') Promise.resolve(r).then(() => { requestAnimationFrame(() => requestAnimationFrame(pf36Polish)); setTimeout(pf36Polish, 400); });
  return r;
};

// ======================= My Account =======================
// The account card, then quick facts, then everything sorted into cards: Basics, Sign-in &
// Security, Devices and Account Standing (which used to be its own page). Parts that load a moment
// later are sorted in as they arrive.
const A36_ICONS = {
  basics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16c1.2 0 1.8-1 3.5-1s2.3 1 3.5 1 1.8-1 3.5-1 2.3 1 3.5 1M12 12V8M12 5.2c.6-.6.6-1.6 0-2.2-.6.6-.6 1.6 0 2.2Z"/></svg>',
  security: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="10" rx="2"/><path d="M2 18h16M19 8h1.5A1.5 1.5 0 0 1 22 9.5v8a1.5 1.5 0 0 1-1.5 1.5H19"/></svg>',
  standing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0Zm14 0-3 6a3 3 0 0 0 6 0Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
};
const A36_CARDS = [
  ['basics', 'Basics', 'Birthday and the little things.', /^Birthday/i],
  ['security', 'Sign-in & Security', 'How you log in, and keeping your account safe.', /^(Two-factor|Passkeys|Email|Password|Recovery)/i],
  ['devices', 'Devices', "Where you're logged in right now.", /^Devices/i],
  ['standing', 'Account Standing', 'Your account’s record with Zuno.', null],
  ['more', 'More', 'Everything else about your account.', null],
];
const A36_ORDER = ['Two-factor', 'Passkeys', 'Email', 'Password', 'Recovery'];
function acct36(body) {
  if (!body || !$('.account-card', body)) return;
  document.body.classList.add('a36');
  // Nothing is moved: each part's own code keeps finding its buttons inside its own wrapper.
  // The wrappers are made layout-transparent, and every settings group gets a place in the page
  // order and a card look (header, shared background, rounded ends) from its group.
  if (!$('.a36-facts', body)) {
    const me = state.me, card = $('.account-card', body);
    const since = me.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';
    const facts = document.createElement('div');
    facts.className = 'a36-facts';
    facts.innerHTML = [
      [uiIcon('calendar'), 'Member since', since, null],
      [uiIcon('users'), 'Friends', String((state.friends || []).length), 'friends'],
      [uiIcon('home'), 'Servers', String((state.servers || []).length), null],
      [uiIcon('award'), 'Badges', String((me.badges || []).length), 'badges'],
      ['<img class="a36-bloom" src="/badges/bloom-new.png" alt="">', 'Zuno Bloom', me.bloom || me.bloomInfo?.active ? 'Active' : 'Not yet', 'bloom'],
    ].map(([ic, k, v, go]) => `<${go ? 'button type="button"' : 'div'} class="a36-fact"${go ? ` data-go="${go}"` : ''}><span class="a36-fi">${ic}</span><span><b>${esc(v)}</b><small>${esc(k)}</small></span></${go ? 'button' : 'div'}>`).join('');
    card.after(facts);
    $$('[data-go]', facts).forEach(b => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'friends') { closeSettings?.(); showFriends?.('all'); }
      else if (go === 'badges') { showSettingsSection('profile'); setTimeout(() => $('#pf-flair')?.scrollIntoView({ block: 'start' }), 500); }
      else if (go === 'bloom') showSettingsSection('bloom');
    }));
    // Card headers.
    A36_CARDS.forEach(([k, t, d], i) => body.insertAdjacentHTML('beforeend', `<div class="a36-head" id="a36-${k}" data-card="${k}" style="order:${(i + 1) * 100}" hidden><div class="pf-card-head"><span class="m36-ic a36-ic-${k}">${A36_ICONS[k]}</span><h3>${esc(t)}</h3><span>${esc(d)}</span></div></div>`));
    // Account Standing, drawn into its own part.
    const sb = document.createElement('div');
    sb.className = 'a36-standing setting-group a36-g';
    sb.dataset.card = 'standing';
    body.appendChild(sb);
    Promise.resolve(renderStanding(sb)).then(() => {
      $('h2', sb)?.remove();
      const t = $('.standing-card h3', sb)?.textContent;
      if (t) {
        const good = $('.standing-card', sb).classList.contains('s-good');
        const pill = document.createElement('button');
        pill.type = 'button'; pill.className = `a36-standing-pill${good ? ' good' : ' warn'}`;
        pill.innerHTML = `${uiIcon(good ? 'checkCircle' : 'warning')} ${esc(t)}`;
        pill.addEventListener('click', () => $('#a36-standing')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        facts.appendChild(pill);
      }
      acct36(body);
      if (pendingStanding36) { pendingStanding36 = false; setTimeout(() => $('#a36-standing')?.scrollIntoView({ block: 'start' }), 60); }
    }).catch(() => {});
  }
  // Wrappers become transparent so their groups line up in one column.
  for (const el of body.children) if (!el.matches('h2, .account-card, .a36-facts, .a36-head, .setting-group') && el.querySelector(':scope > .setting-group')) el.classList.add('a36-pass');
  // Each group: its card, its place in that card.
  const groups = $$('.setting-group', body).filter(g => !g.parentElement.closest('.setting-group'));
  const per = {};
  for (const g of groups) {
    let key = g.dataset.card;
    if (!key) {
      const title = ($('h4', g)?.textContent || '').trim();
      key = (A36_CARDS.find(x => x[3]?.test(title)) || A36_CARDS[4])[0];
      g.dataset.card = key;
      const ci = A36_CARDS.findIndex(x => x[0] === key);
      const sub = key === 'security' ? Math.max(0, A36_ORDER.findIndex(o => title.startsWith(o))) : 0;
      g.style.order = (ci + 1) * 100 + 1 + sub;
    } else if (!g.style.order) g.style.order = (A36_CARDS.findIndex(x => x[0] === key) + 1) * 100 + 1;
    g.classList.add('a36-g');
    (per[key] ||= []).push(g);
  }
  for (const [k] of A36_CARDS) {
    const head = $(`#a36-${k}`, body), list = (per[k] || []).filter(g => g.offsetParent !== null || g.dataset.card === 'standing');
    if (head) head.hidden = !list.length;
    list.sort((a, b) => (+a.style.order || 0) - (+b.style.order || 0));
    list.forEach((g, i) => { g.classList.toggle('a36-last', i === list.length - 1); g.classList.toggle('a36-first', i === 0); });
  }
}
let pendingStanding36 = false;
const _showSettingsSection36b = showSettingsSection;
showSettingsSection = function (section, ...a) {
  document.body.classList.remove('a36');
  // Account Standing now lives inside My Account.
  if (section === 'standing') { pendingStanding36 = true; section = 'account'; }
  const r = _showSettingsSection36b(section, ...a);
  $('.settings-nav [data-s="standing"]')?.classList.add('a36-gone');
  if (section === 'account') {
    $$('.settings-nav [data-s]').forEach(n => n.classList.toggle('active', n.dataset.s === 'account'));
    const body = $('#settings-body');
    Promise.resolve(r).then(() => {
      acct36(body);
      // Parts arrive a little later (passkeys, devices…): sort them in as they do.
      let t;
      const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => acct36(body), 60); });
      mo.observe(body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 6000);
    });
  }
  return r;
};

// ======================= installed from the old address =======================
// An app installed from zuno-tau7.onrender.com stays there (see move.js). Once a day it offers to
// move to heyzuno.uk, signed in, so the app can be installed from the new address.
(() => {
  if (!window.zunoOldInstall) return;
  const KEY = 'zuno_move_note';
  const t0 = Date.now();
  const tick = setInterval(() => {
    if (Date.now() - t0 > 20e3) return clearInterval(tick);
    if (!state.me || $('#app')?.classList.contains('hidden')) return;
    clearInterval(tick);
    try { if (Date.now() - (+localStorage.getItem(KEY) || 0) < 864e5) return; } catch {}
    const bar = document.createElement('div');
    bar.className = 'move36';
    bar.innerHTML = `<span>🏡 Zuno has a new home: <b>heyzuno.uk</b>. Open it there and install the app again for the newest version.</span>
      <button class="btn btn-primary btn-sm" data-go>Open heyzuno.uk</button><button class="icon-btn" data-x title="Not now">✕</button>`;
    document.body.appendChild(bar);
    const close = () => { try { localStorage.setItem(KEY, Date.now()); } catch {} bar.remove(); };
    $('[data-x]', bar).addEventListener('click', close);
    $('[data-go]', bar).addEventListener('click', async () => {
      let code = '';
      try { code = (await api('POST', '/api/me/handoff')).code || ''; } catch {}
      window.open('https://heyzuno.uk/' + (code ? '#handoff=' + code : ''), '_blank', 'noopener');
      close();
    });
  }, 300);
})();
