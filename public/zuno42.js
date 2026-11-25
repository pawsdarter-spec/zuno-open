'use strict';
// Zuno 0.42: activity shows again (member list, pop-up profiles, hover cards) with a new Spotify
// card, a new My Account, a roomier My Profile, Server Settings with a home page and icons,
// a language picker, and the look resetting when you log out.

// ======================= more icons =======================
Object.assign(UI_PATHS, {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
  languages: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
});
const spotifyLogo42 = () => `<svg class="sp42" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${BRAND_PATHS.spotify}"/></svg>`;

// ======================= logging out resets the look =======================
// Your app background, zoom and theme stayed on the login page (and on "Add an account").
const _signOutLocal42 = signOutLocal;
signOutLocal = function (...a) {
  const r = _signOutLocal42(...a);
  const root = document.documentElement;
  try { applyPrefs(); } catch {}
  root.classList.remove('has-app-bg');
  for (const k of ['--app-bg', '--app-bg-dim', '--app-bg-blur']) root.style.removeProperty(k);
  document.body.style.zoom = '';
  return r;
};

// ======================= activity =======================
// Games and songs were reaching Zuno but nothing showed them: the member list only showed custom
// statuses, and the pop-up profile hid the activity card.
const ACT42_ICON = { playing: 'gamepad', listening: 'headphones', watching: 'tv', streaming: 'radio', competing: 'trophy' };
activityLine = function (u) {
  const a = u?.activity;
  if (!a) return '';
  const sp = a.name === 'Spotify';
  return `<span class="act-line act42">${sp ? spotifyLogo42() : uiIcon(ACT42_ICON[a.type] || 'sparkles')}<span>${ACT_VERB[a.type] || ''} <b>${esc(sp && a.details ? a.details : a.name)}</b></span></span>`;
};
activityCard = function (u) {
  const a = u?.activity;
  if (!a) return '';
  const sp = a.name === 'Spotify';
  const head = sp ? 'Listening to Spotify' : `${ACT_VERB[a.type] || ''}${a.type === 'playing' ? ' a game' : ''}`;
  const art = a.art
    ? `<img class="ac42-art" src="${esc(a.art)}" alt="" loading="lazy">`
    : `<span class="ac42-art ph${sp ? ' sp' : ''}">${sp ? spotifyLogo42() : uiIcon(ACT42_ICON[a.type] || 'sparkles')}</span>`;
  const title = sp ? a.details || 'Spotify' : a.name;
  const sub = sp ? (a.state ? `<span class="ac42-sub">${esc(a.state)}</span>` : '') : [a.details, a.state].filter(Boolean).map(x => `<span class="ac42-sub">${esc(x)}</span>`).join('');
  const timing = a.end
    ? `<div class="ac42-time"><span data-elapsed="${Number(a.start) || 0}">0:00</span><div class="act-bar" data-start="${Number(a.start) || 0}" data-end="${Number(a.end) || 0}"><i></i></div><span>${clock(a.end - a.start)}</span></div>`
    : `<div class="ac42-el">${uiIcon('clock')}<span data-elapsed="${Number(a.start) || Date.now()}">0:00</span></div>`;
  const name = a.url ? `<a class="ac42-title" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>` : `<b class="ac42-title">${esc(title)}</b>`;
  return `<div class="pc-act42"><div class="ac42${sp ? ' sp' : ''}"><div class="ac42-head"><span>${esc(head)}</span>${sp ? spotifyLogo42() : uiIcon(ACT42_ICON[a.type] || 'sparkles')}</div>
    <div class="ac42-row">${art}<div class="ac42-info">${name}${sub}${timing}</div></div></div></div>`;
};
// Member list: what someone is playing or listening to, under their name.
function paintMemberActivity42() {
  for (const row of $$('#profile-panel .member[data-member]')) {
    const u = user(row.dataset.member), meta = $('.m-meta', row);
    if (!meta) continue;
    const line = activityLine(u);
    let sub = $('.m-sub', meta);
    if (!line) { if (sub?.dataset.act42) sub.remove(); continue; }
    if (sub?.dataset.act42 === line) continue;
    if (!sub) { sub = document.createElement('span'); sub.className = 'm-sub'; meta.appendChild(sub); }
    sub.innerHTML = line; sub.dataset.act42 = line;
  }
}
const _renderMemberList42 = renderMemberList;
renderMemberList = function (...a) { const r = _renderMemberList42(...a); try { paintMemberActivity42(); } catch {} return r; };
// Hover cards get the activity too.
new MutationObserver(list => {
  for (const r of list) for (const n of r.addedNodes) {
    if (n.nodeType !== 1 || !n.classList.contains('mh38') || $('.act42', n)) continue;
    const u = user(n.dataset.uid), line = activityLine(u);
    if (!line) continue;
    $('.mh38-body > .muted', n)?.insertAdjacentHTML('afterend', `<div class="mh38-act">${line}</div>`);
    const top = parseFloat(n.style.top) || 0, h = n.offsetHeight;
    if (top + h > innerHeight - 8) n.style.top = Math.max(8, innerHeight - h - 8) + 'px';
  }
}).observe(document.body, { childList: true });

// ======================= My Account =======================
const LANGS42 = { en: 'English', es: 'Español', pt: 'Português (Brasil)', fr: 'Français', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', ja: '日本語' };
function myLang42() { try { return prefs().language || localStorage.getItem('zuno_lang') || 'en'; } catch { return 'en'; } }
function drawAccount42(body) {
  const card = $('.account-card', body);
  if (!card || card.dataset.ac42) return;
  card.dataset.ac42 = '1';
  card.classList.add('ac42-card');
  const me = state.me, u = { ...(state.users[me.id] || {}), ...me };
  const bn = u.profileBanner, bg = u.profileBackground;
  const media = bn?.url ? `<img src="${esc(bn.url)}" alt="">`
    : bg?.url ? (bg.type === 'video' ? `<video src="${esc(bg.url)}" autoplay muted loop playsinline disablepictureinpicture tabindex="-1" aria-hidden="true"></video>` : `<img src="${esc(bg.url)}" alt="">`)
    : '';
  const bloom = me.bloom || me.bloomInfo?.active;
  const cur = myLang42();
  card.innerHTML = `
    <div class="ac42-banner" style="background:${esc(u.bannerColor || 'var(--brand)')}">${media}</div>
    <div class="ac42-top">
      <div class="ac42-av">${avatar({ ...u, status: me.statusPref }, 92, true)}</div>
      <div class="ac42-id">
        <div class="ac42-name"><b${typeof nameStyle === 'function' ? nameStyle(u) : ''}>${esc(u.displayName)}</b>${bloom ? '<img class="ac42-bloom" src="/badges/bloom-new.png" alt="Zuno Bloom" title="Zuno Bloom is active">' : ''}</div>
        <div class="ac42-handle">@${esc(u.username)}${u.pronouns ? ` · ${esc(u.pronouns)}` : ''}</div>
        ${typeof badgeRow === 'function' ? badgeRow(u) : ''}
      </div>
      <button class="btn btn-primary ac42-edit" id="go-profile">${uiIcon('pencil')}<span>Edit Profile</span></button>
    </div>
    <div class="ac42-grid">
      <div class="ac42-cell"><span class="ac42-ic">${uiIcon('user')}</span><div><small>Display Name</small><span>${esc(u.displayName)}</span></div><button class="btn btn-grey btn-sm" data-ac42="name">Edit</button></div>
      <div class="ac42-cell"><span class="ac42-ic">${uiIcon('tag')}</span><div><small>Username</small><span>@${esc(u.username)}</span></div><button class="btn btn-grey btn-sm" id="uname-edit">Edit</button></div>
      <div class="ac42-cell"><span class="ac42-ic">${uiIcon('mail')}</span><div><small>Email</small><span id="email-text">${esc(maskEmail(me.email))}</span></div>${me.email ? '<button class="btn btn-grey btn-sm" id="email-reveal" data-shown="0">Reveal</button>' : ''}</div>
      <div class="ac42-cell"><span class="ac42-ic">${uiIcon('languages')}</span><div><small>Language</small><select class="sc-select ac42-lang" id="ac42-lang">${Object.entries(LANGS42).map(([k, n]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>
    </div>`;
  $('#go-profile', card).addEventListener('click', () => showSettingsSection('profile'));
  $('[data-ac42="name"]', card).addEventListener('click', () => { showSettingsSection('profile'); setTimeout(() => { const i = $('#profile-form [name=displayName]'); i?.scrollIntoView({ block: 'center' }); i?.focus(); }, 400); });
  $('#uname-edit', card).addEventListener('click', () => openUsernameChange());
  $('#email-reveal', card)?.addEventListener('click', e => {
    const b = e.currentTarget, shown = b.dataset.shown === '1';
    $('#email-text', card).textContent = shown ? maskEmail(me.email) : me.email;
    b.dataset.shown = shown ? '0' : '1';
    b.textContent = tr42(shown ? 'Reveal' : 'Hide');
  });
  $('#ac42-lang', card).addEventListener('change', async e => {
    const v = e.target.value;
    try { localStorage.setItem('zuno_lang', v); } catch {}
    try { const { me: m } = await api('PATCH', '/api/me/prefs', { language: v }); state.me = { ...state.me, ...m }; } catch {}
    location.reload();
  });
}
const _showSettingsSection42 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  const r = _showSettingsSection42(section, ...a);
  const body = $('#settings-body');
  if (section === 'account' || section === 'standing') drawAccount42(body);
  if (section === 'profile') {
    const h = $('#settings-body > h2');
    if (h && h.textContent.trim() === 'Profiles') h.textContent = tr42('My Profile');
  }
  return r;
};
if (typeof US_WORDS === 'object' && US_WORDS.account && !US_WORDS.account.includes('language')) US_WORDS.account += ' language translate';

// ======================= Server Settings: home, groups and icons =======================
const SS42_GROUPS = [
  ['Essentials', ['overview', 'appearance', 'svtag']],
  ['People', ['members', 'roles', 'rolepickers', 'onboarding', 'invites', 'bans']],
  ['Channels', ['channels']],
  ['Expressions', ['emoji', 'stickers', 'soundboard']],
  ['Safety', ['safety', 'automod', 'audit']],
  ['Grow', ['discovery', 'insights', 'partner']],
  ['Apps & Data', ['integrations', 'backups']],
];
const SS42_INFO = {
  overview: ['clipboard', 'Name, icon, description and welcome messages.'],
  appearance: ['palette', 'Banner, colors and your invite link.'],
  svtag: ['tag', 'A short tag members can wear by their name.'],
  members: ['users', 'Everyone here: roles, nicknames, kicks.'],
  roles: ['crown', 'Permissions and colors for groups of people.'],
  rolepickers: ['checkCircle', 'Let people pick their own roles.'],
  onboarding: ['wave', 'What new members see when they join.'],
  invites: ['mail', 'Invite links, expiry and uses.'],
  bans: ['ban', 'People who are banned.'],
  channels: ['hash', 'Channels, categories, order and permissions.'],
  emoji: ['smile', 'Custom emoji for your server.'],
  stickers: ['note', 'Custom stickers.'],
  soundboard: ['volume', 'Sounds people can play in voice.'],
  safety: ['lock', 'Account age rules and pausing invites.'],
  automod: ['shield', 'Block words, links and spam on its own.'],
  audit: ['clock', 'Who changed what, and when.'],
  discovery: ['compass', 'Show your server in Discover.'],
  insights: ['chart', 'How your server is growing.'],
  partner: ['award', 'Requirements and your Partner status.'],
  integrations: ['puzzle', 'Bots and webhooks.'],
  backups: ['save', 'Save or restore a copy of your server.'],
  delete: ['trash', ''],
};
const _openServerSettings42 = openServerSettings;
openServerSettings = function (sv, section, ...rest) {
  // Regroup before the page is drawn (sections added by other parts of Zuno keep their own group).
  const order = SS42_GROUPS.flatMap(([, keys]) => keys);
  for (const s of SS_SECTIONS) { const g = SS42_GROUPS.find(([, keys]) => keys.includes(s.key)); if (g) s.group = g[0]; }
  SS_SECTIONS.sort((a, b) => (order.includes(a.key) ? order.indexOf(a.key) : 999) - (order.includes(b.key) ? order.indexOf(b.key) : 999));
  // Opened without a section: start on the home page (instead of drawing Overview first).
  ss42StartHome = !section && !onPhone();
  const r = _openServerSettings42(sv, section, ...rest);
  ss42StartHome = false;
  const page = $('#layer .server-settings-page:last-of-type'), nav = page && $('#ss-navlist', page);
  if (nav && !$('[data-ss42="home"]', nav)) {
    for (const b of $$('[data-ss]', nav)) {
      const ic = SS42_INFO[b.dataset.ss]?.[0] || 'sliders';
      if (!$('.ss42-ic', b)) b.insertAdjacentHTML('afterbegin', `<span class="ss42-ic">${uiIcon(ic)}</span>`);
    }
    const home = document.createElement('button');
    home.dataset.ss42 = 'home'; home.dataset.ss = 'home'; home.className = 'ss42-home';
    home.innerHTML = `<span class="ss42-ic">${uiIcon('home')}</span>${esc(tr42('Home'))}`;
    home.addEventListener('click', () => showServerSection('home'));
    nav.prepend(home);
  }
  return r;
};
let ss42StartHome = false;
function ssHome42(body, sv) {
  const nav = $('#ss-navlist');
  const groups = [];
  let cur = null;
  for (const el of nav ? nav.children : []) {
    if (el.matches('h5.ss-group')) { cur = { name: el.textContent, items: [] }; groups.push(cur); }
    else if (el.matches('[data-ss]') && cur && el.dataset.ss !== 'delete' && el.dataset.ss !== 'home') cur.items.push(el);
  }
  body.innerHTML = `<div class="ss42-hub">
    <div class="ss42-hero">${sv.icon ? `<img src="${esc(sv.icon)}" alt="">` : `<span class="ss42-hico" style="--sv:${esc(sv.iconColor)}">${esc([...sv.name][0] || '?')}</span>`}
      <div><h2>${esc(sv.name)}</h2><span class="muted">${esc(tr42('Pick what you want to change, or search with'))} <kbd>/</kbd></span></div></div>
    ${groups.filter(g => g.items.length).map(g => `<section><h5>${esc(g.name)}</h5><div class="ss42-cards">${g.items.map(b => {
      const k = b.dataset.ss, [ic, d] = SS42_INFO[k] || ['sliders', ''];
      return `<button class="ss42-card" data-go42="${esc(k)}"><span class="ss42-cic">${uiIcon(ic)}</span><span><b>${esc(b.textContent.trim())}</b>${d ? `<small>${esc(tr42(d))}</small>` : ''}</span></button>`;
    }).join('')}</div></section>`).join('')}</div>`;
  $$('[data-go42]', body).forEach(c => c.addEventListener('click', () => $(`#ss-navlist [data-ss="${CSS.escape(c.dataset.go42)}"]`)?.click()));
}
const _showServerSection42 = showServerSection;
showServerSection = async function (section, ...a) {
  if (ss42StartHome) { ss42StartHome = false; section = 'home'; }
  if (section === 'home') {
    const sv = svById(svSettings?.id), body = $('#ss-body');
    if (!sv || !body) return;
    svSettings.section = 'home';
    $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === 'home'));
    ssHome42(body, sv);
    $('.settings-main', body.closest('.settings'))?.scrollTo?.(0, 0);
    return;
  }
  const r = await _showServerSection42(section, ...a);
  const body = $('#ss-body');
  if (body && !$('.ss42-crumb', body) && section !== 'delete' && svSettings?.section === section) {
    const label = $(`#ss-navlist [data-ss="${CSS.escape(section)}"]`)?.textContent.trim() || '';
    body.insertAdjacentHTML('afterbegin', `<div class="ss42-crumb"><button type="button">${uiIcon('home')}<span>${esc(tr42('Server Settings'))}</span></button>${label ? `<span class="ss42-sep">›</span><b>${esc(label)}</b>` : ''}</div>`);
    $('.ss42-crumb button', body).addEventListener('click', () => showServerSection('home'));
  }
  return r;
};

// ======================= languages =======================
// Zuno's own words (menus, buttons, settings) in your language. What people write is never changed.
// "English|Español|Português|Français|Deutsch"
// (0.45) The words now live in public/lang/*.txt; the server sends only your language (/lang45/xx.js).

const LANG_INDEX42 = { es: 1, pt: 2, fr: 3, de: 4, it: 5, nl: 6, pl: 7, tr: 8, ja: 9 };
const LANG42 = (() => {
  let l = 'en';
  try { l = localStorage.getItem('zuno_lang') || 'en'; } catch {}
  return LANG_INDEX42[l] ? l : 'en';
})();
const I18N42 = new Map(LANG42 !== 'en' && typeof I18N45 === 'object' && I18N45 && I18N45.lang === LANG42 ? Object.entries(I18N45.words) : []);
// A few with numbers or names in them ("Online — 2", "Message #general", "Good morning, Paws").
const I18N42_PATTERNS = {
  es: [[/^(Online|Offline) — (\d+)$/, (m, a, n) => `${a === 'Online' ? 'En línea' : 'Desconectados'} — ${n}`], [/^All friends — (\d+)$/, (m, n) => `Todos los amigos — ${n}`], [/^Message (.+)$/, (m, x) => `Mensaje en ${x}`], [/^Good (morning|afternoon|evening), (.+)$/, (m, t, n) => `${{ morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' }[t]}, ${n}`]],
  pt: [[/^(Online|Offline) — (\d+)$/, (m, a, n) => `${a} — ${n}`], [/^All friends — (\d+)$/, (m, n) => `Todos os amigos — ${n}`], [/^Message (.+)$/, (m, x) => `Conversar em ${x}`], [/^Good (morning|afternoon|evening), (.+)$/, (m, t, n) => `${{ morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite' }[t]}, ${n}`]],
  fr: [[/^(Online|Offline) — (\d+)$/, (m, a, n) => `${a === 'Online' ? 'En ligne' : 'Hors ligne'} — ${n}`], [/^All friends — (\d+)$/, (m, n) => `Tous les amis — ${n}`], [/^Message (.+)$/, (m, x) => `Envoyer un message dans ${x}`], [/^Good (morning|afternoon|evening), (.+)$/, (m, t, n) => `${{ morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' }[t]}, ${n}`]],
  de: [[/^(Online|Offline) — (\d+)$/, (m, a, n) => `${a} — ${n}`], [/^All friends — (\d+)$/, (m, n) => `Alle Freunde — ${n}`], [/^Message (.+)$/, (m, x) => `Nachricht an ${x}`], [/^Good (morning|afternoon|evening), (.+)$/, (m, t, n) => `${{ morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' }[t]}, ${n}`]],
};
function tr42(text) {
  if (LANG42 === 'en' || !text) return text;
  const t = String(text).trim();
  const hit = I18N42.get(t);
  if (hit) return String(text).replace(t, hit);
  for (const [re, fn] of I18N42_PATTERNS[LANG42] || []) if (re.test(t)) return String(text).replace(t, t.replace(re, fn));
  return text;
}
if (LANG42 !== 'en') {
  document.documentElement.lang = LANG42;
  // Never inside what people wrote or named: messages, names, bios, channel and server names.
  const SKIP = '#messages, .msg, .markup, .msg-body, .msg-text, textarea, [contenteditable], code, pre, .pc-bio, .m-nm, .m-name, .ch-name, .sh-name, .sv-nav-name, .dm-name, .ac42-name, .ac42-handle, .pcard .pc-name-row, .wg, .reaction, .emoji-picker, .ib-snip, .bug-card, .bug-row, .sug-card, .toast, script, style';
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const doText = n => { const v = n.nodeValue; if (!v || !/[A-Za-z]/.test(v)) return; const t = tr42(v); if (t !== v) n.nodeValue = t; };
  const doEl = el => { for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const t = tr42(v); if (t !== v) el.setAttribute(a, t); } } };
  const walk = root => {
    if (root.nodeType === 3) { if (!root.parentElement?.closest(SKIP)) doText(root); return; }
    if (root.nodeType === 1 && root.matches('textarea')) return doEl(root);
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    doEl(root);
    // Text boxes are skipped, but their placeholder (like "Message #general") is Zuno's.
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeType === 1 && n.matches(SKIP) ? (n.matches('textarea') && doEl(n), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_ACCEPT) });
    let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doEl(n);
  };
  let pending = new Set(), queued = false;
  const flush = () => { queued = false; const list = [...pending]; pending = new Set(); for (const n of list) if (n.isConnected) walk(n); };
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') pending.add(m.target);
      else for (const n of m.addedNodes) pending.add(n);
      if (m.type === 'attributes') doEl(m.target);
    }
    if (!queued && pending.size) { queued = true; requestAnimationFrame(flush); }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}
// The language you picked on another device comes along when you log in.
setTimeout(function syncLang42() {
  if (!state.me) return setTimeout(syncLang42, 1500);
  const want = state.me.prefs?.language;
  let have = 'en';
  try { have = localStorage.getItem('zuno_lang') || 'en'; } catch {}
  if (want && LANG_INDEX42[want] !== undefined || want === 'en') {
    // (0.47) Reload at most once a session, and only if the choice could be saved (Safari can refuse
    // to save, which used to reload the page over and over).
    if (want !== have) {
      let saved = false; try { localStorage.setItem('zuno_lang', want); saved = localStorage.getItem('zuno_lang') === want; } catch {}
      let tried = false; try { tried = sessionStorage.getItem('zuno_lang_reload') === want; sessionStorage.setItem('zuno_lang_reload', want); } catch { tried = true; }
      if (saved && !tried && want !== LANG42) location.reload();
    }
  }
}, 1500);
