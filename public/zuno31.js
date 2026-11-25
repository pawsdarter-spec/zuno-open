'use strict';
// Zuno 0.31: Twemoji, bug fixes (profiles that couldn't scroll, comments on phones, reply mentions,
// stickers), Senior Bug Hunter progress, server tag cards with Join, who-reacted cards, profile likes,
// reporting profiles, favorite creations, Senior/Talented Artist badges, and Suggestions.

// ======================= Twemoji =======================
// Emoji show as Twemoji pictures everywhere (the same on every phone and computer). Text you type
// stays real emoji: only how it's drawn changes.
// (0.38.4) Twemoji 17: has the newest emoji (like 🫩), which 15.1 didn't.
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/';
// Emoji whose picture failed stay plain text from then on. (Each redraw of the chat used to try the
// picture again, and the swap between a broken picture and text moved the chat a few pixels every
// time: the "jitter".)
const TWEMOJI_FAILED = new Set();
const EMOJI_RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;
const EMOJI_TEST = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;
const SKIP_TAGS = new Set(['TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'OPTION', 'SELECT', 'svg', 'SVG', 'TITLE', 'NOSCRIPT']);
function twemojiUrl(e) {
  const cps = [...(e.includes('‍') ? e : e.replace(/️/g, ''))].map(c => c.codePointAt(0).toString(16));
  return TWEMOJI_BASE + cps.join('-') + '.svg';
}
function twemojify(root) {
  if (!root || root.nodeType !== 1 && root.nodeType !== 3) return;
  if (root.nodeType === 1 && (SKIP_TAGS.has(root.tagName) || root.isContentEditable || root.closest?.('.no-twemoji, [contenteditable="true"]'))) return;
  if (!EMOJI_TEST.test(root.textContent || '')) return;
  const nodes = [];
  if (root.nodeType === 3) nodes.push(root);
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        // (0.45) Cheap test first: most text has no emoji, so skip the walk up the page for it.
        if (!EMOJI_TEST.test(n.nodeValue)) return NodeFilter.FILTER_SKIP;
        for (let p = n.parentNode; p && p !== root.parentNode; p = p.parentNode) if (SKIP_TAGS.has(p.tagName) || p.isContentEditable || p.classList?.contains('no-twemoji')) return NodeFilter.FILTER_REJECT;
        return EMOJI_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    while (w.nextNode()) nodes.push(w.currentNode);
  }
  const lazy = !!(root.nodeType === 1 ? root : root.parentNode)?.closest?.('.emoji-picker');
  for (const n of nodes) {
    const text = n.nodeValue;
    EMOJI_RE.lastIndex = 0;
    if (!EMOJI_RE.test(text)) continue;
    EMOJI_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = EMOJI_RE.exec(text))) {
      const e = m[0];
      if (/^[0-9#*]$/.test(e) || e === '©' || e === '®' || e === '™' || TWEMOJI_FAILED.has(e)) continue; // plain digits, ©®™ and emoji Twemoji doesn't have stay text
      if (m.index > last) frag.append(text.slice(last, m.index));
      const img = document.createElement('img');
      img.className = 'twemoji'; img.alt = e; img.draggable = false; img.decoding = 'async'; img.dataset.at = Date.now();
      if (lazy) img.loading = 'lazy'; // big grids (the emoji picker) load as you scroll
      img.src = twemojiUrl(e);
      frag.append(img);
      last = m.index + e.length;
    }
    if (!last) continue;
    if (last < text.length) frag.append(text.slice(last));
    n.parentNode?.replaceChild(frag, n);
  }
}
// (0.38.4) A server's custom emoji written as its code (<:name:file.png>) in places that show plain
// text (reply previews, chat lists, notifications, typing styles…) becomes its picture there too.
const CEMOJI_TEXT = /<:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))>/gi;
function cemojify(root) {
  if (!root || !(root.textContent || '').includes('<:')) return;
  const nodes = [];
  if (root.nodeType === 3) nodes.push(root);
  else if (root.nodeType === 1) {
    if (SKIP_TAGS.has(root.tagName) || root.isContentEditable) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      for (let p = n.parentNode; p && p !== root.parentNode; p = p.parentNode) if (SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
      return n.nodeValue.includes('<:') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    } });
    while (w.nextNode()) nodes.push(w.currentNode);
  }
  for (const n of nodes) {
    const text = n.nodeValue;
    CEMOJI_TEXT.lastIndex = 0;
    if (!CEMOJI_TEXT.test(text)) continue;
    const box = document.createElement('span');
    box.innerHTML = esc(text).replace(/&lt;:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))&gt;/gi, (_, name, file) => (typeof cemojiImg === 'function' ? cemojiImg(name, file) : `:${esc(name)}:`));
    n.replaceWith(...box.childNodes);
  }
}
// If a picture can't load (offline, or a brand-new emoji), show the emoji as text again.
document.addEventListener('error', e => {
  const img = e.target;
  if (!img?.classList?.contains('twemoji')) return;
  TWEMOJI_FAILED.add(img.alt);
  img.replaceWith(document.createTextNode(img.alt));
}, true);
// Copying text that has Twemoji in it copies the real emoji.
document.addEventListener('copy', e => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return;
  const div = document.createElement('div');
  div.append(sel.getRangeAt(0).cloneContents());
  if (!div.querySelector('img.twemoji')) return;
  for (const img of div.querySelectorAll('img.twemoji')) img.replaceWith(img.alt);
  e.clipboardData.setData('text/plain', div.innerText || div.textContent);
  e.preventDefault();
});
{
  let queue = new Set(), raf = 0;
  // Any Twemoji picture that hasn't loaded after 4 seconds (a slow or blocked network) goes back to
  // being a normal emoji, so emoji never just vanish.
  let checkT = 0;
  // (0.38) Waits 15 seconds, not 4: on a busy chat or a slow phone many pictures load at once, and
  // giving up early showed the device's own emoji instead.
  const checkLoaded = () => { checkT = 0; for (const img of document.querySelectorAll('img.twemoji:not([data-ok]):not([loading="lazy"])')) { if (img.complete && img.naturalWidth) img.dataset.ok = '1'; else if (Date.now() - (+img.dataset.at || 0) > 15000) { TWEMOJI_FAILED.add(img.alt); img.replaceWith(document.createTextNode(img.alt)); } else if (!checkT) checkT = setTimeout(checkLoaded, 2000); } };
  const flush = () => {
    raf = 0; const list = [...queue]; queue = new Set();
    for (const n of list) if (n.isConnected) { cemojify(n); twemojify(n); }
    if (!checkT) checkT = setTimeout(checkLoaded, 4200);
  };
  const watch = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') { if (m.target.parentNode) queue.add(m.target.parentNode); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) queue.add(n.nodeType === 3 ? n.parentNode || n : n);
    }
    if (queue.size && !raf) raf = requestAnimationFrame(flush);
  });
  const start = () => { cemojify(document.body); twemojify(document.body); watch.observe(document.body, { childList: true, subtree: true, characterData: true }); checkT = setTimeout(checkLoaded, 4200); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
}

// ======================= fixes =======================
// Replies show the person's display name in mentions, the same as the message does (it showed the
// username before, so one person looked like two different @s).
const _replyRefHtml31 = replyRefHtml;
replyRefHtml = function (r) {
  if (!r?.snippet || !r.snippet.includes('@')) return _replyRefHtml31(r);
  const byName = {};
  for (const u of Object.values(state.users)) if (u.username) byName[u.username] = u;
  return _replyRefHtml31({ ...r, snippet: r.snippet.replace(/(^|[\s(])@([a-z0-9_.]{2,32})\b/gi, (all, pre, name) => (byName[name.toLowerCase()] ? `${pre}@${byName[name.toLowerCase()].displayName}` : all)) });
};

// Profiles: comments on a phone open as a sheet from the bottom, with a close button.
const _openProfile31 = openProfile;
openProfile = async function (id, ...rest) {
  const r = await _openProfile31(id, ...rest);
  const modal = $('#layer .overlay:last-child .modal') || $('#layer .modal');
  const card = modal?.querySelector(':scope > .pcard');
  const u = user(id);
  if (!card || !u || card.dataset.z31) return r;
  card.dataset.z31 = '1';
  const side = $('.pcm-side', modal);
  if (side) {
    side.addEventListener('click', e => {
      if (!e.target.closest('.pcm-x')) return;
      modal.classList.add('pcm-closed');
      const row = $('.pf-crow', card); if (row) { row.classList.remove('open'); $('.pf-see', row).textContent = 'See all'; }
    });
    const addX = () => { const h = $('.pcm-head', side); if (h && !$('.pcm-x', h)) h.insertAdjacentHTML('beforeend', '<button class="pcm-x" aria-label="Close comments">✕</button>'); };
    addX();
    side.addEventListener('pcm-count', addX);
  }
  addLikeButton(card, u);
  addProfileReport(card, u);
  return r;
};

// ======================= profile likes =======================
async function addLikeButton(card, u) {
  const bar = $('.pf-bar', card);
  if (!bar || $('.pf-like', bar) || u.system || u.bot) return;
  const self = u.id === state.me.id;
  const b = document.createElement('button');
  b.className = 'pf-like'; b.type = 'button';
  const draw = (n, on) => { b.classList.toggle('on', on); b.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17"><path fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/></svg><b>${n}</b>`; b.title = self ? `${n} ${n === 1 ? 'person likes' : 'people like'} your profile` : on ? 'You like this profile. Click to unlike' : 'Like this profile'; };
  draw(u.likes || 0, false);
  bar.prepend(b);
  let liked = false, count = u.likes || 0;
  try { const d = await api('GET', `/api/users/${u.id}/likes`); liked = d.liked; count = d.count; draw(count, liked); } catch {}
  if (self) { b.classList.add('self'); return; }
  b.addEventListener('click', async () => {
    liked = !liked; count += liked ? 1 : -1; draw(count, liked);
    if (liked) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    try { const d = await api('POST', `/api/users/${u.id}/like`, { on: liked }); count = d.count; liked = d.liked; draw(count, liked); }
    catch (e) { liked = !liked; count += liked ? 1 : -1; draw(count, liked); toast(e.message, true); }
  });
}

// ======================= reporting a profile =======================
function addProfileReport(card, u) {
  const menu = $('.pf-menu', card);
  if (!menu || u.id === state.me.id || u.system || $('[data-z31-report]', menu)) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pf-mi pf-danger'; b.dataset.z31Report = '1';
  b.innerHTML = '<span class="pf-ico">🚩</span>Report Profile';
  b.addEventListener('click', () => { menu.classList.remove('open'); openProfileReport(u); });
  menu.appendChild(b);
}
function openProfileReport(u) {
  const reasons = typeof REPORT_REASONS !== 'undefined' ? REPORT_REASONS : [['other', 'Something else', '']];
  // Opens over the profile (the usual window would close it).
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.style.zIndex = 140;
  ov.innerHTML = `<form class="dialog modal report-dialog"><h3>Report profile</h3>
    <div class="rp-quote">${avatar(u, 32)}<div><b>${esc(u.displayName)}</b><div class="muted small">@${esc(u.username)}${u.bio ? ` · ${esc(u.bio.slice(0, 120))}` : ''}</div></div></div>
    <p class="muted small" style="margin:12px 0 8px">What's wrong with it (their name, picture, banner, About Me…)? Only the Zuno team sees reports, and ${esc(u.displayName)} won't know it was you.</p>
    <div class="rp-reasons">${reasons.map(([k, l, d]) => `<label class="rp-reason"><input type="radio" name="reason" value="${k}"><span><b>${l}</b><small>${d || ''}</small></span></label>`).join('')}</div>
    <label class="field" style="margin-top:12px">Anything else? <span class="hint">(optional)</span><textarea name="details" maxlength="1000" placeholder="Tell the Zuno team what's wrong"></textarea></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red" data-a="send" disabled>Send Report</button></div></form>`;
  $('#layer').appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const form = $('form', ov);
  form.addEventListener('change', () => { $('[data-a=send]', ov).disabled = !form.reason.value; });
  $('[data-a=cancel]', ov).addEventListener('click', close);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('[data-a=send]', ov); btn.disabled = true;
    try { await api('POST', '/api/reports/profile', { userId: u.id, reason: form.reason.value, details: form.details.value }); close(); toast('Thanks. Your report was sent to the Zuno team.'); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ======================= server tag cards =======================
// Click someone's server tag to see which server it's from, and join it if it's public.
document.addEventListener('click', async e => {
  const tag = e.target.closest?.('.srv-tag[data-tagsv]');
  if (!tag || !tag.dataset.tagsv || tag.closest('.tp-opt, .flair-opt, #st-demo')) return;
  e.preventDefault(); e.stopPropagation();
  openTagCard(tag);
}, true);
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.srv-tag[data-tagsv]')) { e.preventDefault(); openTagCard(e.target); } });
async function openTagCard(tag) {
  $('.tag-card')?.remove();
  const r = tag.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'tag-card';
  box.innerHTML = '<div class="tc-load muted small">Loading…</div>';
  document.body.appendChild(box);
  const place = () => {
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    box.style.top = (r.bottom + 8 + h < innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
  };
  place();
  const away = ev => { if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('mousedown', away, true); } };
  setTimeout(() => document.addEventListener('mousedown', away, true));
  let d;
  try { d = await api('GET', `/api/servers/${tag.dataset.tagsv}/tag-card`); } catch (err) { box.innerHTML = `<div class="tc-load muted small">${esc(err.message)}</div>`; place(); return; }
  const icon = d.icon ? `<img src="${esc(d.icon)}" alt="">` : `<span style="background:${esc(safeColor(d.iconColor) || 'var(--brand)')}">${esc((d.name || '?').slice(0, 2).toUpperCase())}</span>`;
  box.innerHTML = `<div class="tc-banner" style="${d.banner ? `background-image:url('${esc(d.banner)}')` : `background:${esc(safeColor(d.bannerColor) || 'color-mix(in srgb, var(--brand) 45%, #111)')}`}"></div>
    <div class="tc-body"><div class="tc-icon">${icon}</div>
      <div class="tc-tag">${officialTag({ serverTag: { ...d.tag, serverId: '', server: d.name } }).replace('data-tagsv=""', '')}</div>
      <b class="tc-name">${esc(d.name)}</b>
      <div class="tc-stats"><span><i class="tc-dot on"></i>${d.online} online</span><span><i class="tc-dot"></i>${d.members} member${d.members === 1 ? '' : 's'}</span></div>
      ${d.description ? `<p class="tc-desc">${esc(d.description)}</p>` : ''}
      ${d.joined ? '<button class="btn btn-grey tc-go" data-a="open">Go to Server</button>' : d.joinable ? '<button class="btn btn-primary tc-go" data-a="join">Join Server</button>' : '<div class="tc-locked">🔒 Invite-only. Ask someone in it for an invite.</div>'}</div>`;
  place();
  $('[data-a=open]', box)?.addEventListener('click', () => { box.remove(); closeLayer(); openServer(d.id); });
  $('[data-a=join]', box)?.addEventListener('click', async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Joining…';
    try {
      const { server } = await api('POST', `/api/servers/${d.id}/join-from-tag`);
      if (!state.servers.some(s => s.id === server.id)) state.servers.push(server);
      renderRail?.();
      box.remove(); closeLayer(); openServer(server.id);
      toast(`Welcome to ${server.name}! 🎉`);
    } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Join Server'; }
  });
}

// ======================= who reacted =======================
// Hover a reaction to see the emoji big and everyone who reacted with it.
{
  let card = null, timer = 0, at = null;
  const hide = () => { clearTimeout(timer); card?.remove(); card = null; at = null; };
  document.addEventListener('pointerover', e => {
    const rx = e.target.closest?.('.rx[data-rx][data-msg]');
    if (rx === at) return;
    hide();
    if (!rx || e.pointerType === 'touch') return;
    at = rx;
    timer = setTimeout(() => {
      const conv = activeConv(), m = state.convos[conv]?.messages.find(x => x.id === rx.dataset.msg);
      const ids = m?.reactions?.[rx.dataset.rx] || [];
      if (!ids.length || !rx.isConnected) return;
      const names = ids.map(id => user(id)).filter(Boolean);
      card = document.createElement('div');
      card.className = 'rx-card';
      card.innerHTML = `<div class="rx-big">${esc(rx.dataset.rx.startsWith(':') || rx.querySelector('img:not(.twemoji)') ? '' : rx.dataset.rx)}${rx.querySelector('img:not(.twemoji)')?.outerHTML || ''}</div>
        <div class="rx-who"><b>${ids.length} reacted</b>${names.slice(0, 12).map(u => `<span>${avatar(u, 18)}${esc(u.displayName)}</span>`).join('')}${ids.length > 12 ? `<span class="muted small">and ${ids.length - 12} more</span>` : ''}</div>`;
      document.body.appendChild(card);
      const r = rx.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
      card.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
      card.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    }, 260);
  }, { passive: true });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', hide, true);
}
// The native tooltip would show on top of the card, so it goes.
const _reactionsHtml31 = reactionsHtml;
reactionsHtml = function (m) { return _reactionsHtml31(m).replace(/(<button class="rx[^"]*" data-rx="[^"]*" data-msg="[^"]*") title="[^"]*"/g, '$1'); };

// ======================= Senior Bug Hunter progress =======================
const _renderBugReport31 = renderBugReport;
renderBugReport = async function (body, ...a) {
  const r = await _renderBugReport31(body, ...a);
  let p;
  try { p = await api('GET', '/api/bugs/progress'); } catch { return r; }
  const intro = $('h2', body)?.nextElementSibling;
  if (!intro || $('.bh-progress', body)) return r;
  const pct = Math.min(100, Math.round(p.confirmed / p.need * 100));
  intro.insertAdjacentHTML('afterend', `<div class="bh-progress${p.senior ? ' done' : ''}">
    <span class="bh-ico">${BADGE_INFO.bughunter_senior.svg}</span>
    <div class="bh-txt"><b>${p.senior ? "You're a Senior Bug Hunter! 🏆" : 'Senior Bug Hunter'}</b>
      <span>${p.senior ? `${p.confirmed} of your reports were confirmed. Thank you!` : `${p.confirmed} of ${p.need} confirmed reports. <b>${p.left} more</b> to earn the golden badge.`}</span>
      <div class="bh-bar"><i style="width:${pct}%"></i></div></div></div>`);
  return r;
};

// ======================= artist badges =======================
BADGE_INFO.artist_senior = {
  label: 'Senior Artist', desc: 'Has 5 or more creations approved for everyone to wear',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgArtSr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3e0"/><stop offset=".5" stop-color="#b06cff"/><stop offset="1" stop-color="#5b2bd6"/></linearGradient></defs>
    <path d="M12 1.6l2.6 2.1 3.3-.3.9 3.2 2.9 1.6-1 3.2 1 3.2-2.9 1.6-.9 3.2-3.3-.3L12 22.4l-2.6-2.1-3.3.3-.9-3.2-2.9-1.6 1-3.2-1-3.2 2.9-1.6.9-3.2 3.3.3z" fill="url(#bgArtSr)"/>
    <path d="M12 6.4c-3.4 0-6 2.4-6 5.5 0 2.8 2.2 5 4.8 5 .8 0 1.2-.5 1.2-1.1 0-.7-.5-.9-.5-1.5 0-.7.5-1.1 1.2-1.1h1.4c2.1 0 3.9-1.4 3.9-3.4 0-2.5-2.6-3.4-6-3.4z" fill="#fff"/>
    <circle cx="9" cy="11.3" r="1" fill="#ff5f8f"/><circle cx="11.3" cy="9.2" r="1" fill="#ffd166"/><circle cx="14.2" cy="9.5" r="1" fill="#04c5ae"/></svg>`,
};
BADGE_INFO.artist_talented = {
  label: 'Talented Artist', desc: 'Their creations were worn by 500 people and favorited 70 times',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgArtTal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#ff7eb6"/></linearGradient></defs>
    <circle cx="12" cy="12" r="10.6" fill="url(#bgArtTal)"/>
    <path d="M12 4.6l2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 15.4l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="#fff"/>
    <path d="M12 8.2l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" fill="#ff7eb6"/></svg>`,
};

// ======================= favorite creations (saved to your account) =======================
// Starring a community creation in the picker now counts for its maker (Talented Artist), and
// follows you to other devices.
let creationFavs = null;
const loadCreationFavs = async () => { if (creationFavs) return creationFavs; if (!state.token) return new Set(); try { creationFavs = new Set((await api('GET', '/api/me/creation-favs')).favs); } catch { creationFavs = new Set(); } return creationFavs; };
(function favsWhenIn() { if (!state.token || !state.me) return setTimeout(favsWhenIn, 1500); loadCreationFavs().then(favs => { for (const k of ['decoration', 'effect', 'banner']) for (const id of favs) savedFlair.add(`${k}:c:${id}`); }).catch(() => {}); })();
document.addEventListener('click', e => {
  const star = e.target.closest?.('.fp-star[data-star]');
  if (!star) return;
  const m = /^(\w+):c:(.+)$/.exec(star.dataset.star);
  if (!m) return;
  // The picker toggles the star first; this sends the new state.
  setTimeout(() => {
    const on = savedFlair.has(star.dataset.star);
    on ? creationFavs?.add(m[2]) : creationFavs?.delete(m[2]);
    api('POST', `/api/creations/${m[2]}/fav`, { on }).catch(err => toast(err.message, true));
  });
}, true);

// Community › My creations shows your progress toward the artist badges.
const _drawMine31 = drawMine;
drawMine = async function (box, ...a) {
  const r = await _drawMine31(box, ...a);
  let p;
  try { p = await api('GET', '/api/me/artist-progress'); } catch { return r; }
  const bar = (n, of) => `<div class="bh-bar"><i style="width:${Math.min(100, Math.round(n / of * 100))}%"></i></div>`;
  box.insertAdjacentHTML('afterbegin', `<div class="ar-prog">
    <div class="ar-item"><span class="bh-ico">${BADGE_INFO.artist_senior.svg}</span><div><b>Senior Artist</b><span>${Math.min(p.approved, p.needApproved)} of ${p.needApproved} creations approved</span>${bar(p.approved, p.needApproved)}</div></div>
    <div class="ar-item"><span class="bh-ico">${BADGE_INFO.artist_talented.svg}</span><div><b>Talented Artist</b><span>Worn by ${p.worn} of ${p.needWorn} people · ${p.favs} of ${p.needFavs} favorites</span>${bar(Math.min(p.worn / p.needWorn, p.favs / p.needFavs), 1)}</div></div></div>`);
  return r;
};

// ======================= Suggestions =======================
// Settings › Suggestions: anyone can send the Zuno team an idea without having to ping anyone.
// Staff see everyone's suggestions there and can mark them Planned, Done or Not planned.
const S_KIND = { feature: 'New feature', improve: 'Make something better', look: 'Looks and design', other: 'Something else' };
const S_STATUS = { new: ['New', 'wait'], planned: ['Planned', 'plan'], done: ['Done', 'ok'], declined: ['Not planned', 'no'] };
let sugTab = 'send', sugFilter = 'new';
async function renderSuggestions(body) {
  const staff = !!state.me.isStaff;
  body.innerHTML = `<h2>Suggestions</h2>
    <p class="muted" style="margin:-8px 0 16px">Got an idea for Zuno? Send it straight to the Zuno team, no pinging needed. You'll get a Zuno DM when they decide on it.</p>
    <div class="cl-tabs" style="margin-bottom:16px"><button data-st="send" class="${sugTab === 'send' ? 'on' : ''}">Suggest something</button><button data-st="mine" class="${sugTab === 'mine' ? 'on' : ''}">My suggestions</button>${staff ? `<button data-st="inbox" class="${sugTab === 'inbox' ? 'on' : ''}">Everyone's (staff)</button>` : ''}</div>
    <div id="sug-body"></div>`;
  $$('[data-st]', body).forEach(b => b.addEventListener('click', () => { sugTab = b.dataset.st; renderSuggestions(body); }));
  const box = $('#sug-body', body);
  if (sugTab === 'send') {
    box.innerHTML = `<form class="sug-form">
      <div class="sug-kinds">${Object.entries(S_KIND).map(([k, l], i) => `<label class="sug-kind"><input type="radio" name="kind" value="${k}"${i === 0 ? ' checked' : ''}><span>${uiIcon(['sparkles', 'wrench', 'palette', 'chat'][i])} ${l}</span></label>`).join('')}</div>
      <label class="field">Your idea in a few words<input name="title" maxlength="100" placeholder="Like “Let me pin messages in DMs”" required></label>
      <label class="field">Tell us more <span class="hint">(optional)</span><textarea name="details" maxlength="2000" rows="5" placeholder="What would it do? Why would it help?"></textarea></label>
      <div class="row-btns"><button class="btn btn-primary" disabled>Send Suggestion</button></div></form>`;
    const f = $('form', box);
    f.addEventListener('input', () => { $('button', f).disabled = f.title.value.trim().length < 4; });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button', f); btn.disabled = true;
      try { await api('POST', '/api/suggestions', { kind: f.kind.value, title: f.title.value, details: f.details.value }); toast('Thanks! Your suggestion was sent 💡'); sugTab = 'mine'; renderSuggestions(body); }
      catch (err) { toast(err.message, true); btn.disabled = false; }
    });
    return;
  }
  if (sugTab === 'mine') {
    let d; try { d = await api('GET', '/api/suggestions/mine'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
    box.innerHTML = d.suggestions.length ? d.suggestions.map(s => sugCard(s, false)).join('') : '<div class="cm-empty"><span>💡</span><b>No suggestions yet</b><span class="muted small">Ideas you send show up here, with what the team decided.</span></div>';
    $$('[data-sdel]', box).forEach(b => b.addEventListener('click', async () => { try { await api('DELETE', `/api/suggestions/${b.dataset.sdel}`); renderSuggestions(body); } catch (e) { toast(e.message, true); } }));
    return;
  }
  let d; try { d = await api('GET', `/api/suggestions?status=${sugFilter}`); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  box.innerHTML = `<div class="cl-sort" style="margin-bottom:12px">${[...Object.entries(S_STATUS).map(([k, [l]]) => [k, l]), ['all', 'All']].map(([k, l]) => `<button data-sf="${k}" class="${sugFilter === k ? 'on' : ''}">${l}${d.counts[k] ? ` <span class="muted">${d.counts[k]}</span>` : ''}</button>`).join('')}</div>
    ${d.suggestions.length ? d.suggestions.map(s => sugCard(s, true)).join('') : '<div class="empty-state"><div class="title">Nothing here</div></div>'}`;
  $$('[data-sf]', box).forEach(b => b.addEventListener('click', () => { sugFilter = b.dataset.sf; renderSuggestions(body); }));
  $$('[data-sby]', box).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.sby)));
  $$('.sug-card[data-sid]', box).forEach(card => $$('[data-sset]', card).forEach(b => b.addEventListener('click', async () => {
    try { await api('PATCH', `/api/suggestions/${card.dataset.sid}`, { status: b.dataset.sset, note: $('.sug-note', card)?.value || '' }); toast('Saved'); renderSuggestions(body); } catch (e) { toast(e.message, true); }
  })));
}
function sugCard(s, staff) {
  const [label, cls] = S_STATUS[s.status] || S_STATUS.new;
  if (s.by) state.users[s.by.id] = { ...state.users[s.by.id], ...s.by };
  return `<div class="sug-card" data-sid="${esc(s.id)}">
    <div class="sug-top"><b>${esc(s.title)}</b><span class="cm-st ${cls}">${label}</span></div>
    <div class="muted small">${esc(S_KIND[s.kind] || 'Something else')} · ${esc(fmtTime(s.at))}${staff && s.by ? ` · from <a data-sby="${esc(s.by.id)}">${esc(s.by.displayName)}</a>` : ''}</div>
    ${s.details ? `<p class="sug-details">${esc(s.details)}</p>` : ''}
    ${s.note && !staff ? `<div class="sug-reply"><b>Zuno team:</b> ${esc(s.note)}</div>` : ''}
    ${staff ? `<input class="sug-note" maxlength="500" placeholder="Note for them (optional)" value="${esc(s.note || '')}"><div class="row-btns sug-acts">${['planned', 'done', 'declined'].map(k => `<button class="btn btn-sm ${s.status === k ? 'btn-primary' : 'btn-grey'}" data-sset="${k}">${S_STATUS[k][0]}</button>`).join('')}</div>`
      : s.status === 'new' ? `<button class="btn btn-link btn-sm" data-sdel="${esc(s.id)}">Delete</button>` : ''}</div>`;
}
const _showSettingsSection31 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  if (section !== 'suggestions') return _showSettingsSection31(section, ...a);
  if (settingsDraft && isDraftDirty()) return closeSettings();
  settingsDraft = null;
  $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === 'suggestions'));
  $('.pf-subnav')?.remove();
  renderSuggestions($('#settings-body'));
};
const _openSettings31 = openSettings;
openSettings = function (...a) {
  const r = _openSettings31(...a);
  const bugs = $('.settings:not(.server-settings-page) .settings-nav [data-s="bugs"]');
  if (bugs && !$('.settings-nav [data-s="suggestions"]')) {
    bugs.insertAdjacentHTML('beforebegin', `<button data-s="suggestions"><svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>Suggestions</button>`);
    $('.settings-nav [data-s="suggestions"]').addEventListener('click', () => showSettingsSection('suggestions'));
  }
  if (a[0] === 'suggestions') showSettingsSection('suggestions');
  return r;
};
if (typeof US_WORDS === 'object') US_WORDS.suggestions = 'suggestions suggest idea feature request feedback';
onLive26?.('suggestions', () => { if ($('.settings-nav [data-s="suggestions"].active') && sugTab === 'inbox') renderSuggestions($('#settings-body')); });
