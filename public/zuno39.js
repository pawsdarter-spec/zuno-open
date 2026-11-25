'use strict';
// Zuno 0.39


// ======================= voice channels: a chat button =======================
// Hover a voice channel for a 💬 button that opens its text chat, without joining the call.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-vchat]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const sv = currentServer();
  if (sv) openChannel(sv.id, b.dataset.vchat, { chat: true });
}, true);

// ======================= Partnered servers (founder) =======================
// Right-click a server: "Make Official" / "Make Partnered" (and Remove), two separate marks.
{
  const _openServerMenu39 = openServerMenu;
  openServerMenu = function (anchor, sv = currentServer(), ...a) {
    const r = _openServerMenu39(anchor, sv, ...a);
    if (!sv || sv.official || !state.me?.isFounder) return r;
    const menu = $$('#layer .menu').pop();
    if (!menu) return r;
    const item = (html, run) => { const b = document.createElement('button'); b.innerHTML = html; b.addEventListener('click', () => { closeLayer(); run(); }); return b; };
    const mark = async (kind) => {
      try {
        if (kind === 'partner') {
          const d = await api('POST', `/api/servers/${sv.id}/partner`, { on: !sv.partnered });
          sv.partnered = d.partnered;
          toast(d.partnered ? `${sv.name} is now Partnered` : `${sv.name} is no longer Partnered`);
        } else {
          const d = await api('POST', `/api/servers/${sv.id}/official-mark`, { on: !sv.verified });
          sv.verified = d.verified;
          toast(d.verified ? `${sv.name} is now Official ✓` : `${sv.name} is no longer Official`);
        }
        renderRail(); if (state.currentServerId === sv.id) renderServerSidebar();
      } catch (e) { toast(e.message, true); }
    };
    const b = item(`<span class="mi-ico partner-mi">${partnerSeal()}</span><span>${sv.partnered ? 'Remove Partnered' : 'Make Partnered'}</span>`, () => mark('partner'));
    menu.insertBefore(item(`<span class="mi-ico">✓</span><span>${sv.verified ? 'Remove Official' : 'Make Official'}</span>`, () => mark('official')), menu.firstChild);
    menu.insertBefore(b, menu.firstChild.nextSibling);
    return r;
  };

  // What Partnered means and how to get it: a little window (from the seal) and a Server Settings page.
  const REQS = st => [
    { ok: st ? st.members >= st.need : null, title: `${(st?.need || 500).toLocaleString()}+ members`, info: st ? `You have ${st.members.toLocaleString()} member${st.members === 1 ? '' : 's'}.` : 'People in the server, not counting bots.' },
    { ok: st ? st.trending : null, title: 'Trending on Discover', info: st ? (st.trending ? 'Your server is trending right now.' : st.discoverable ? 'Not trending yet. Trending is based on new members and chat activity this week.' : 'Turn on Discovery so your server can trend.') : 'Lots of new members and chat activity this week.' },
    { ok: null, title: 'Properly moderated', info: 'Active moderators, clear rules, and following Zuno\'s rules. Checked by the Zuno team.' },
  ];
  const reqList = st => `<div class="pr-list">${REQS(st).map(r => `<div class="pr-row ${r.ok === true ? 'ok' : r.ok === false ? 'no' : 'tbd'}"><span class="pr-dot">${r.ok === true ? '✓' : r.ok === false ? '✕' : '•'}</span><div><b>${esc(r.title)}</b><div class="muted small">${esc(r.info)}</div></div></div>`).join('')}</div>`;
  const intro = sv => sv.partnered
    ? `<div class="pr-hero on">${partnerSeal()}<div><b>${esc(sv.name)} is Partnered</b><div class="muted small">It shows a blue seal next to its name, everywhere on Zuno.</div></div></div>`
    : `<div class="pr-hero">${partnerSeal()}<div><b>Zuno Partner Program</b><div class="muted small">Partnered servers get a blue seal next to their name, everywhere on Zuno. To be considered, a server needs:</div></div></div>`;
  window.openPartnerInfo = async function (sv = currentServer()) {
    if (!sv) return;
    const wrap = openLayer(`<div class="dialog modal pr-modal"><div class="pr-body">${intro(sv)}${reqList(null)}</div><div class="actions"><button class="btn btn-primary" data-a="ok">Got it</button></div></div>`);
    const body = $('.pr-body', wrap);
    $('[data-a=ok]', wrap).addEventListener('click', dismissLayer);
    try { const st = await api('GET', `/api/servers/${sv.id}/partner-status`); if (body?.isConnected) body.innerHTML = intro(sv) + reqList(st) + (sv.partnered ? '' : '<p class="muted small pr-foot">Meet these and the Zuno team may reach out about partnering.</p>'); } catch {}
    return wrap;
  };
  document.addEventListener('click', e => {
    const m = e.target.closest?.('[data-partner]');
    if (!m) return;
    e.preventDefault(); e.stopPropagation();
    const sid = m.closest('[data-server]')?.dataset.server;
    openPartnerInfo(sid ? state.servers.find(s => s.id === sid) : currentServer());
  }, true);

  if (typeof SS_SECTIONS !== 'undefined') {
    SS_SECTIONS.splice(SS_SECTIONS.findIndex(s => s.key === 'overview') + 1, 0, { group: 'Server', key: 'partner', label: 'Partner Program', need: 'manage_server', words: 'partner partnered verified blue check seal official requirements' });
    const _ssShow39 = showServerSection;
    showServerSection = async function (section, ...a) {
      if (section !== 'partner') return _ssShow39(section, ...a);
      svSettings.section = section;
      $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
      const sv = svById(svSettings.id), el = $('#ss-body');
      el.innerHTML = `<h2>Partner Program</h2><div class="pr-body">${intro(sv)}${reqList(null)}</div>`;
      try { const st = await api('GET', `/api/servers/${sv.id}/partner-status`); if (svSettings.section === 'partner') $('.pr-body', el).innerHTML = intro(sv) + reqList(st) + (sv.partnered ? '' : '<p class="muted small pr-foot">Meet these and the Zuno team may reach out about partnering.</p>'); } catch {}
    };
  }
}

// ======================= @mentions show display names =======================
// Someone Zuno hasn't loaded yet (a member of a big server, say) is looked up once, then the chat
// is redrawn so "@username" becomes "@Display Name".
{
  const asked = new Set(), queue = new Set();
  let t = null;
  window.lookupMention = name => {
    if (!name || asked.has(name) || !state.me) return;
    asked.add(name); queue.add(name);
    clearTimeout(t);
    t = setTimeout(async () => {
      const names = [...queue]; queue.clear();
      let found = 0;
      for (const n of names.slice(0, 25)) {
        try { const { user: u } = await api('GET', `/api/users/by-name/${encodeURIComponent(n)}`); state.users[u.id] = { ...u, ...state.users[u.id] }; found++; } catch {}
      }
      if (found) { renderMessages(); if (typeof threadView !== 'undefined' && threadView) drawThread?.(); }
    }, 250);
  };
}

// ======================= moderation counts stay current =======================
// After you approve, turn down or handle something, every waiting-count (the Moderation menu and
// its tabs) updates right away, instead of when you next click them.
async function refreshModCounts() {
  if (!state.me?.isStaff) return;
  const set = (sel, n) => { const el = $(sel); if (!el) return; el.hidden = !n; el.textContent = n || ''; };
  api('GET', '/api/creations/review/count').then(d => set('[data-mt30] .cm-count', d.pending)).catch(() => {});
  api('GET', '/api/creator/review/count').then(d => set('[data-mt37] .cm-count', d.pending)).catch(() => {});
  api('GET', '/api/mod/reports?status=open').then(r => { if (typeof setModBadge === 'function') setModBadge(r.counts?.open || 0); }).catch(() => {});
}
{
  const _api39 = api;
  const STAFF_ACT = /^\/api\/(creations\/[^/]+\/review|creator\/[^/]+\/review|mod\/|reports\/|appeals\/|bugs\/|suggestions\/)/;
  let t = null;
  api = async function (method, path, ...rest) {
    const r = await _api39(method, path, ...rest);
    if (method !== 'GET' && STAFF_ACT.test(path || '')) { clearTimeout(t); t = setTimeout(refreshModCounts, 300); }
    return r;
  };
}
onLive26?.('creations-review', () => setTimeout(refreshModCounts, 200));
onLive26?.('creator-apps', () => setTimeout(refreshModCounts, 200));

// ======================= profiles and settings update live =======================
// An open profile redraws when that person changes something (name, picture, status, badges…),
// keeping where you'd scrolled and whether you'd opened the full profile. Your own Settings page
// does the same when your account changes elsewhere (another device, staff giving you a badge),
// unless you're in the middle of editing it.
let pf39 = null; // the profile that's open
{
  const _openProfile39 = openProfile;
  openProfile = function (id, ...a) { pf39 = id; return _openProfile39(id, ...a); };
}
{
  // Only changes you'd see on a profile count (not someone's activity ticking along).
  const look = u => JSON.stringify(u ? [u.displayName, u.username, u.avatar, u.banner, u.bannerColor, u.bio, u.pronouns, u.badges, u.customStatus, u.nameStyle, u.decoration, u.effect, u.nameBanner, u.serverTag, u.typingStyle] : null);
  const seenLook = new Map();
  const pending = new Set();
  let t = null;
  const flush = () => {
    const ids = [...pending].filter(id => { const now = look(user(id)); const was = seenLook.get(id); seenLook.set(id, now); return was !== undefined && was !== now; });
    pending.clear();
    const modal = $('#layer .modal:has(> .pcard)');
    if (pf39 && modal && ids.includes(pf39) && !modal.contains(document.activeElement?.closest?.('input, textarea'))) {
      const card = $('.pcard', modal), top = card?.scrollTop || 0, full = !modal.classList.contains('pc-compact');
      const id = pf39;
      Promise.resolve(openProfile(id)).then(() => setTimeout(() => {
        const m2 = $('#layer .modal:has(> .pcard)');
        if (!m2) return;
        if (full) $('.pf-full38', m2)?.click();
        const c2 = $('.pcard', m2); if (c2) c2.scrollTop = top;
        m2.style.animation = 'none';
      }, 120));
    }
    if (state.me && ids.includes(state.me.id)) {
      const sec = $('.settings-nav [data-s].active')?.dataset.s;
      const busy = $('#settings-body')?.contains(document.activeElement?.closest?.('input, textarea, select')) || (typeof isDraftDirty === 'function' && isDraftDirty());
      if ((sec === 'profile' || sec === 'account') && !busy) showSettingsSection(sec);
    }
  };
  const _onUser39 = onUser;
  let _prev39 = null;
  onUser = function (u, ...a) {
    _prev39 = u?.id ? { ...(state.users[u.id] || {}) } : null;
    const r = _onUser39(u, ...a);
    if (u?.id) {
      if (!seenLook.has(u.id) && (u.id === pf39 || u.id === state.me?.id)) seenLook.set(u.id, look(_prev39 || null));
      pending.add(u.id); clearTimeout(t); t = setTimeout(flush, 700);
    }
    return r;
  };
}

// ======================= all badges (from "+N") =======================
// Pressing "+N" on a profile opens a window with every badge they have; click one to see how to get it.
{
  const HOW = {
    staff: 'Given to people on the Zuno team.',
    og: 'Given to people who joined Zuno in its early days.',
    bughunter: 'Report a bug and have the Zuno team confirm it.',
    bughunter_senior: 'Have 5 bug reports confirmed by the Zuno team.',
    bughunter_veteran: 'Have 15 bug reports confirmed by the Zuno team.',
    founder: 'Create your own server.',
    botdev: 'Make a bot in Settings › Developer (no code needed with the Bot Builder) and add it to a server.',
    chatterbox: 'Send 500 messages on Zuno.',
    social: 'Have 10 or more friends.',
    voice: 'Spend 10 hours talking in voice.',
    gifter: 'Gift Zuno Bloom to someone during a gifting event.',
    bloom: 'Subscribe to Zuno Bloom.',
    bloom_month: 'Keep Zuno Bloom for over a month.',
    bloom_early: 'Get Zuno Bloom during Zuno\'s first 6 months.',
    artist: 'Make a decoration, effect or name banner that gets approved for everyone to wear.',
    artist_senior: 'Have 5 of your creations approved.',
    artist_talented: 'Have your creations worn by 500 people and favorited 70 times.',
    creator: 'Apply in Settings › My Account with a YouTube channel (1K+ subscribers) that has a video about Zuno.',
    creator_star: 'Picked by the Zuno team from Verified Creators.',
  };
  // (0.47) Labels can already be translated, so match on the badge's key first, then on the label
  // in either language (it used to miss every badge whose name had been translated).
  const keyFor = (label, el) => (el?.dataset.badge && BADGE_INFO[el.dataset.badge] ? el.dataset.badge : Object.keys(BADGE_INFO).find(k => BADGE_INFO[k].label === label || (typeof tr42 === 'function' && tr42(BADGE_INFO[k].label) === label)));
  function openAllBadges(row) {
    const keys = [...new Set($$('.pbadge', row).map(b => keyFor(b.getAttribute('aria-label'), b)).filter(Boolean))];
    const name = (row.closest('.pcard')?.querySelector('.pc-name, .pf-name, h2') || row.closest('.mh38')?.querySelector('.mh38-name b'))?.textContent?.trim();
    const ov = document.createElement('div');
    ov.className = 'overlay ab39-ov';
    ov.innerHTML = `<div class="dialog modal ab39"><h3>${name ? esc(name) + "'s badges" : 'Badges'} <span class="muted small">${keys.length}</span></h3>
      <div class="ab39-list">${keys.map(k => `<button type="button" class="ab39-row"><span class="ab39-ico">${BADGE_INFO[k].svg}</span><span class="ab39-txt"><b>${esc(BADGE_INFO[k].label)}</b><span class="muted small">${esc(BADGE_INFO[k].desc || '')}</span><span class="ab39-how"><b>How to get it:</b> ${esc(HOW[k] || BADGE_INFO[k].desc || 'Given by the Zuno team.')}</span></span><span class="ab39-chev">›</span></button>`).join('')}</div>
      <div class="actions"><button class="btn btn-primary" data-a="ok">Done</button></div></div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    $('[data-a=ok]', ov).addEventListener('click', () => ov.remove());
    $$('.ab39-row', ov).forEach(r => r.addEventListener('click', () => r.classList.toggle('open')));
    $('#layer').appendChild(ov);
  }
  // Runs before the old "+N" (which only un-hid the badges, and sometimes didn't).
  document.addEventListener('click', e => {
    const more = e.target.closest?.('.tray38');
    if (!more) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    const row = more.closest('.pc-badges');
    if (row) openAllBadges(row);
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') { const ov = $('#layer .ab39-ov:last-child'); if (ov) { e.stopImmediatePropagation(); ov.remove(); } } }, true);
}

// ======================= encrypted history from your other devices =======================
// A device that can't read older encrypted messages (new browser, cleared storage, or Zuno's move
// to a new address) can ask your other devices for them. You press Allow on one that can read them.
{
  const unreadable = () => {
    const convo = state.convos?.[typeof activeConv === 'function' ? activeConv() : ''];
    return (convo?.messages || []).filter(m => m.e2e && myDevice && plainCache.has(m.e2e.ct) && plainCache.get(m.e2e.ct) === null && !m.e2e.keys?.[myDevice.id]);
  };
  let asked = 0;
  async function askOthers() {
    const dev = await ensureDevice();
    if (!dev) return toast("This browser can't read encrypted messages.", true);
    try {
      const r = await api('POST', '/api/me/e2e/history-request', { device: dev.id });
      asked = Date.now();
      toast(r.online > 1 ? 'Asked your other devices. Press Allow on one that can read these messages.' : 'Open Zuno on a device that can read these messages (like the desktop app), then ask again.');
    } catch (e) { toast(e.message, true); }
  }
  const _renderMessages39e = renderMessages;
  renderMessages = function (...a) {
    const r = _renderMessages39e(...a);
    const box = $('#messages');
    if (box && !$('.e2eh39', box) && unreadable().length) {
      const bar = document.createElement('div');
      bar.className = 'e2eh39';
      bar.innerHTML = `<span>🔒 Some encrypted messages were locked for your other devices.</span><button type="button" class="btn btn-small">Get them from my other devices</button>`;
      $('button', bar).addEventListener('click', askOthers);
      const first = $('.msg', box);
      if (first) first.before(bar); else box.appendChild(bar);
    }
    return r;
  };

  // On a device that can read them: "Allow?"
  async function shareTo(to, name) {
    const dev = await ensureDevice();
    if (!dev) return;
    try {
      const { items, key } = await api('GET', `/api/me/e2e/history-keys?from=${encodeURIComponent(dev.id)}&to=${encodeURIComponent(to)}`);
      if (!items.length) { await api('POST', '/api/me/e2e/history-keys', { from: dev.id, to, items: [], last: true }); return toast(`${name} can already read everything this device can.`); }
      const toKey = await shared(dev.privateKey, await importPub(key));
      const senders = new Map();
      const out = [];
      for (const it of items) {
        try {
          const fk = JSON.stringify(it.fk);
          if (!senders.has(fk)) senders.set(fk, await shared(dev.privateKey, await importPub(it.fk)));
          const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(it.iv) }, senders.get(fk), unb64u(it.k));
          const kiv = crypto.getRandomValues(new Uint8Array(12));
          out.push({ c: it.c, m: it.m, iv: b64u(kiv), k: b64u(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: kiv }, toKey, raw)) });
        } catch {}
      }
      let sent = 0;
      for (let i = 0; i < out.length || i === 0; i += 500) {
        const part = out.slice(i, i + 500);
        const r = await api('POST', '/api/me/e2e/history-keys', { from: dev.id, to, items: part, last: i + 500 >= out.length });
        sent += r.count || 0;
      }
      toast(`Shared ${sent} encrypted message${sent === 1 ? '' : 's'} with ${name}.`);
    } catch (e) { toast(e.message, true); }
  }
  onLive26('e2e-history-req', async ({ device, name }) => {
    const dev = await ensureDevice();
    if (!dev || dev.id === device) return;
    confirmDialog(`Share your encrypted messages with ${name || 'another device'}?`,
      'Another device logged in to your account wants to read your older encrypted messages. Only allow it if that device is yours.',
      'Allow', () => shareTo(device, name || 'that device'));
  });
  // On the device that asked: reload the chats so the newly readable messages show.
  onLive26('e2e-history-done', ({ device, count }) => {
    if (!myDevice || device !== myDevice.id) return;
    for (const [ct, v] of plainCache) if (v === null) plainCache.delete(ct);
    for (const [k, c] of Object.entries(state.convos || {})) if (c?.messages?.some(m => m.e2e)) delete state.convos[k];
    const conv = activeConv?.();
    if (conv) loadConversation(conv);
    if (count) toast(`🔓 ${count} older encrypted message${count === 1 ? '' : 's'} can be read here now.`);
    else if (asked) toast('Your other device had nothing new for this one.');
  });
}
