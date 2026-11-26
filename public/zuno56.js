'use strict';
// Zuno 0.56: catching up after you come back to the tab, clean copying, badges that fit, the
// browser's back and forward buttons, favoriting emoji from chat, server tags with any emoji,
// and confirming your email.

// ======================= coming back to Zuno =======================
// A tab in the background can be paused by the browser, and its live connection can quietly die
// without saying so. Coming back after a while reconnects, and the open chat fetches what it missed.
{
  let hiddenAt = document.hidden ? Date.now() : 0, busy = false;
  const merge = async conv => {
    const convo = state.convos?.[conv];
    if (!conv || !convo?.loaded) return;
    const r = await api('GET', `${convBase(conv)}/messages`);
    if (activeConv() !== conv || state.convos[conv] !== convo) return;
    for (const a of r.authors || []) state.users[a.id] = { ...a, ...state.users[a.id] };
    const byId = new Map(convo.messages.map(m => [m.id, m]));
    const fresh = r.messages.filter(m => !byId.has(m.id));
    let changed = false;
    for (const m of r.messages) { const old = byId.get(m.id); if (old && JSON.stringify(old) !== JSON.stringify({ ...old, ...m })) { Object.assign(old, m); changed = true; } }
    if (fresh.length && fresh.length === r.messages.length) {
      // Missed more than a page: start from the newest page (older ones load on scroll as usual).
      const keep = convo.messages.filter(m => m.pending || m.failed);
      Object.assign(convo, { messages: [...r.messages, ...keep], hasMore: r.hasMore, from: null, to: null });
      changed = true;
    } else if (fresh.length) {
      convo.messages.push(...fresh);
      convo.messages.sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.createdAt - b.createdAt);
      changed = true;
    }
    if (changed) renderMessages();
  };
  const back = async () => {
    if (document.hidden || busy || !state.me || !state.token) return;
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away < 8000) return;
    busy = true;
    try {
      const live = state.es;
      if (live && !live.closed && away > 45000 && live.open) {
        try { live.es?.close(); } catch {}
        live.es = null; live.readyState = 0;
        live.open();
      }
      await merge(activeConv()).catch(() => {});
    } finally { busy = false; }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else back(); });
  document.addEventListener('resume', () => { hiddenAt ||= Date.now() - 60000; back(); });
  addEventListener('pageshow', e => { if (e.persisted) { hiddenAt ||= Date.now() - 60000; back(); } });
  addEventListener('online', () => { hiddenAt ||= Date.now() - 60000; back(); });
}

// ======================= copying messages =======================
// Copying a message copies its words: not the reactions under it, the buttons, or the empty lines
// the page uses for spacing.
addEventListener('copy', e => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0), box = document.getElementById('messages');
  if (!box || !box.contains(range.commonAncestorContainer)) return;
  const div = document.createElement('div');
  div.append(range.cloneContents());
  div.querySelectorAll('.reactions, .msg-tools, .hover-time, button, .gif-tag, .zp-bar, .zp-err, .new-divider, .seen-tag, .avatar, .srv-tag, .official, [aria-hidden="true"]').forEach(n => n.remove());
  div.querySelectorAll('img.twemoji, img.cemoji').forEach(img => img.replaceWith(img.alt || ''));
  div.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;white-space:normal';
  document.body.append(div);
  let text = div.innerText;
  div.remove();
  text = text.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return;
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

// ======================= badges never cover the picture =======================
// A narrow profile (the side panel) with lots of badges: the row grew left over the profile
// picture and its online dot. Badges that don't fit go into the "+N" instead.
function fitBadges56(row) {
  if (!row?.isConnected || row.classList.contains('tray-open')) return;
  const av = row.closest('.pc-head')?.querySelector(':scope > .avatar, .avatar');
  if (!av || !av.offsetWidth) return;
  const limit = av.getBoundingClientRect().right + 8;
  for (let guard = 0; guard < 40 && row.getBoundingClientRect().left < limit; guard++) {
    const shown = [...row.querySelectorAll(':scope > .pbadge:not(.tray-more)')];
    if (shown.length <= 1) break;
    shown[shown.length - 1].classList.add('tray-more');
    let more = row.querySelector(':scope > .tray38');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button'; more.className = 'tray38'; more.title = 'Show all badges';
      more.addEventListener('click', ev => { ev.stopPropagation(); row.classList.add('tray-open'); row.querySelectorAll('.tray-more').forEach(b => b.classList.remove('tray-more')); more.remove(); });
      row.appendChild(more);
    }
    more.textContent = '+' + row.querySelectorAll(':scope > .pbadge.tray-more').length;
  }
}
{
  let q = new Set(), raf = 0;
  const run = () => { raf = 0; const list = [...q]; q = new Set(); list.forEach(fitBadges56); };
  const queue = row => { q.add(row); raf ||= requestAnimationFrame(run); };
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList?.contains('pc-badges')) queue(n);
      else if (n.firstElementChild) n.querySelectorAll?.('.pc-head .pc-badges').forEach(queue);
    }
  }).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', () => document.querySelectorAll('.pc-head .pc-badges').forEach(queue));
}

// ======================= back and forward =======================
// The browser's (and the mouse's) back and forward buttons move between the places you've been in
// Zuno: chats, channels, Friends, Discover. Settings close with back. Before, back left Zuno.
{
  let fromHistory = false;
  const keyOf = v => (v ? { type: v.type, peerId: v.peerId, groupId: v.groupId, serverId: v.serverId, channelId: v.channelId, voice: v.voice || undefined } : null);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const record = () => {
    if (fromHistory || !state.me) return;
    const v = keyOf(state.view);
    if (!v?.type) return;
    const cur = history.state?.zv;
    if (cur && same(cur, v)) return;
    try { if (!cur) history.replaceState({ ...(history.state || {}), zv: v }, ''); else history.pushState({ zv: v }, ''); } catch {}
  };
  const _setWhere56 = setWhere;
  setWhere = function (...a) { const r = _setWhere56.apply(this, a); queueMicrotask(record); return r; };
  const go = async v => {
    if (v.type === 'friends') return showFriends();
    if (v.type === 'dm' && v.peerId) return openDM(v.peerId);
    if (v.type === 'group' && v.groupId) return openGroup(v.groupId);
    if (v.type === 'discover') return showDiscover();
    if (v.type === 'requests') return showRequests();
    if ((v.type === 'channel' || v.type === 'voice') && v.serverId) {
      const sv = state.servers.find(s => s.id === v.serverId);
      if (!sv) return showFriends();
      const ch = sv.channels.find(c => c.id === v.channelId);
      // Going back never joins a voice call by itself: its chat opens instead.
      if (ch && ch.type !== 'voice') return openChannel(v.serverId, v.channelId);
      if (ch && v.type === 'channel') return openChannel(v.serverId, v.channelId, { chat: true });
      return openServer(v.serverId);
    }
  };
  addEventListener('popstate', e => {
    const v = e.state?.zv;
    if (!v || !state.me) return;
    if (document.querySelector('.settings #settings-body')) { try { closeSettingsNow(); } catch {} }
    if (same(keyOf(state.view), v)) return;
    fromHistory = true;
    Promise.resolve().then(() => go(v)).catch(() => {}).finally(() => { setTimeout(() => { fromHistory = false; }, 0); });
  });
}

// ======================= emoji in chat: favorite it, see where it's from =======================
// Clicking an emoji in a message shows it with a ☆ to add it to your favorites. A server emoji also
// shows its server (with Join when the server is in Discover).
function favButton56(tok) {
  const on = typeof isFavEmoji === 'function' && isFavEmoji(tok);
  return `<button class="btn btn-sm ${on ? 'btn-grey' : 'btn-primary'} ei56-fav" data-tok56="${esc(tok)}">${on ? '★ Favorited' : '☆ Add to Favorites'}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.ei56-fav');
  if (!b) return;
  e.stopPropagation();
  const on = toggleFavEmoji(b.dataset.tok56);
  b.outerHTML = favButton56(b.dataset.tok56);
  toast(on ? '★ Added to favorite emoji' : 'Removed from favorites');
}, true);
// Server emoji: the "where it's from" card gets the favorite button.
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1 || !n.classList?.contains('emoji-info') || n.querySelector('.ei56-fav') || n.dataset.ei56) continue;
    const img = n.querySelector('.ei-top img'), name = n.querySelector('.ei-top b')?.textContent.replace(/:/g, '');
    const file = (img?.getAttribute('src') || '').split('/').pop().split('?')[0];
    if (!/^[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)$/i.test(file) || !name) continue;
    n.querySelector('.ei-top').insertAdjacentHTML('afterend', `<div class="ei56-row">${favButton56(`<:${name}:${file}>`)}</div>`);
  }
}).observe(document.getElementById('layer') || document.body, { childList: true, subtree: true });
// Normal emoji.
document.addEventListener('click', e => {
  const img = e.target.closest('#messages .content img.twemoji, #messages .pi-text img.twemoji');
  if (!img || e.target.closest('a, button')) return;
  e.preventDefault(); e.stopPropagation();
  const ch = img.alt;
  const name = (typeof emojiName === 'function' && emojiName(ch)) || '';
  const box = popover(img, 'emoji-info', `<div class="ei-top"><img src="${esc(img.src)}" alt=""><div><b>${name ? `:${esc(name)}:` : esc(ch)}</b><div class="muted small">Standard emoji</div></div></div><div class="ei56-row">${favButton56(ch)}</div>`);
  box.dataset.ei56 = '1';
}, true);

// ======================= server tags =======================
// Any emoji can be a tag's icon, including custom emoji from other servers, or an uploaded picture.
tagEmojiHtml = function (t) {
  if (t?.emojiId && /^[a-z0-9]{8,48}\.(?:png|gif|webp|jpg)$/i.test(t.emojiId)) return `<img class="st-cemoji" src="/uploads/${esc(t.emojiId)}" alt="" draggable="false">`;
  if (t?.icon && /^\/uploads\/[a-z0-9]+\.(?:png|gif|webp|jpg)$/i.test(t.icon)) return `<img class="st-cemoji" src="${esc(t.icon)}" alt="" draggable="false">`;
  return t?.emoji ? `<i>${esc(t.emoji)}</i>` : '';
};
async function uploadTagIcon56(sv, blob) {
  const res = await fetch(`/api/servers/${sv.id}/tag-icon`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': blob.type || 'image/png' }, body: blob });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Something went wrong.');
  sv.tag = d.tag;
  await refresh({ serverId: sv.id }).catch(() => {});
  showServerSection('svtag');
  toast('Tag icon saved');
}
const _showServerSection56 = showServerSection;
showServerSection = async function (section, ...rest) {
  const r = await _showServerSection56(section, ...rest);
  if (section !== 'svtag') return r;
  const body = $('#ss-body'), sv = svById(svSettings?.id);
  const row = body && $('.st-row', body);
  if (!sv || !row || $('.st56', body)) return r;
  const t = sv.tag || {};
  row.insertAdjacentHTML('afterend', `<div class="st56">
    <div class="st56-cur">${t.icon ? `<img src="${esc(t.icon)}" alt="">` : ''}</div>
    <button type="button" class="btn btn-grey btn-sm" id="st56-pick">Choose an emoji…</button>
    <button type="button" class="btn btn-grey btn-sm" id="st56-up">Upload a picture</button>
    ${t.icon ? '<button type="button" class="btn btn-link btn-sm" id="st56-rm">Remove picture</button>' : ''}
    <input type="file" id="st56-file" class="hidden" accept="image/png,image/gif,image/webp,image/jpeg">
    <div class="muted small st56-note">Any emoji works, including custom emoji from your other servers. Pictures can be up to 512 KB.</div></div>`);
  const needTag = () => { if (!sv.tag) { toast('Save the tag first, then pick its icon.', true); return false; } return true; };
  $('#st56-pick', body).addEventListener('click', ev => openEmojiPicker(ev.currentTarget, async tok => {
    const m = /^<:([a-z0-9_]{2,32}):([a-z0-9]{8,48}\.(?:png|gif|webp|jpg))>$/i.exec(tok || '');
    if (!m) { const inp = $('#st-emoji', body); inp.value = tok; inp.dispatchEvent(new Event('input', { bubbles: true })); return; }
    const own = $(`[data-eid="${CSS.escape(m[2])}"]`, body);
    if (own) { if (!own.classList.contains('on')) own.click(); return; }
    if (!needTag()) return;
    try { const blob = await (await fetch('/uploads/' + m[2])).blob(); await uploadTagIcon56(sv, blob); } catch (err) { toast(err.message, true); }
  }, { title: 'Pick the tag icon' }));
  $('#st56-up', body).addEventListener('click', () => { if (needTag()) $('#st56-file', body).click(); });
  $('#st56-file', body).addEventListener('change', async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    if (f.size > 512e3) return toast('Tag pictures can be up to 512 KB.', true);
    try { await uploadTagIcon56(sv, f); } catch (err) { toast(err.message, true); }
  });
  $('#st56-rm', body)?.addEventListener('click', async () => {
    try { await api('PATCH', `/api/servers/${sv.id}/tag`, { text: t.text, color: t.color || null, icon: null }); await refresh({ serverId: sv.id }).catch(() => {}); showServerSection('svtag'); toast('Picture removed'); }
    catch (err) { toast(err.message, true); }
  });
  // The preview shows the saved picture until another icon is picked.
  if (t.icon) { const d = $('#st-demo', body); if (d && !d.querySelector('img')) d.insertAdjacentHTML('afterbegin', tagEmojiHtml(t)); }
  return r;
};

// ======================= confirm your email =======================
// New accounts confirm their email within 14 days, or the account is removed and its name is free
// for someone else. A bar at the top says how long is left, with a button to send the email again.
{
  let shut = false;
  const draw = () => {
    const by = state.me?.verifyBy;
    let bar = document.getElementById('vb56');
    if (!by || shut || state.me?.emailVerified) { bar?.remove(); return; }
    const days = Math.max(0, Math.ceil((by - Date.now()) / 864e5));
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'vb56'; bar.className = 'vb56'; bar.setAttribute('role', 'status');
      document.body.appendChild(bar);
      bar.addEventListener('click', async e => {
        const b = e.target.closest('[data-vb]');
        if (!b) return;
        if (b.dataset.vb === 'close') { shut = true; bar.remove(); return; }
        if (b.dataset.vb === 'email') { openSettings('account'); return; }
        b.disabled = true;
        try { await api('POST', '/api/me/verify-email'); toast(`Sent! Check ${state.me.email || 'your inbox'} (and spam).`); }
        catch (err) { toast(err.message, true); }
        b.disabled = false;
      });
    }
    const left = days <= 1 ? 'by tomorrow' : `within ${days} days`;
    bar.innerHTML = `<span>📧 Confirm your email ${left}, or this account and its name will be removed. We sent a link to <b>${esc(state.me.email || 'your email')}</b>.</span>
      <button class="btn btn-sm btn-primary" data-vb="send">Send again</button><button class="btn btn-sm btn-grey" data-vb="email">Change email</button><button class="vb56-x" data-vb="close" aria-label="Hide for now">✕</button>`;
    bar.classList.toggle('urgent', days <= 3);
  };
  setInterval(async () => {
    if (!state.me?.verifyBy || state.me.emailVerified) return draw();
    try { const x = await api('GET', '/api/me/extras'); if (x.emailVerified) { state.me.emailVerified = true; state.me.verifyBy = null; toast('Email confirmed ✨'); } } catch {}
    draw();
  }, 60000);
  const _onMe56 = typeof onMe === 'function' ? onMe : null;
  if (_onMe56) onMe = function (...a) { const r = _onMe56.apply(this, a); setTimeout(draw, 0); return r; };
  const t = setInterval(() => { if (state.me) { clearInterval(t); draw(); } }, 500);
}

// ======================= 0.56.1: roles =======================
// The ✕ on a role in someone's profile takes it off (when you can manage roles and the role is below
// yours). It disappears at once and is saved in the background.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pc-unrole]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const sv = currentServer(), uid = b.dataset.uid, rid = b.dataset.pcUnrole;
  if (!sv) return;
  const chip = b.closest('.role-chip'), wrap = chip?.parentElement;
  chip?.remove();
  if (wrap && !wrap.querySelector('.role-chip:not(.add)') && !wrap.querySelector('.add')) wrap.previousElementSibling?.tagName === 'H4' && wrap.previousElementSibling.remove();
  saveMemberRoles(sv, uid, (sv.memberRoles?.[uid] || []).filter(x => x !== rid));
}, true);
// Someone else's roles changed: just their roles are updated (no full reload).
{
  const onRoles = e => {
    let d; try { d = JSON.parse(e.data); } catch { return; }
    const sv = svById(d.serverId);
    if (!sv) return;
    (sv.memberRoles ||= {})[d.userId] = d.roles || [];
    memberRolesChanged(sv, d.userId);
  };
  let hooked = null;
  const hook = () => { if (state.es && state.es !== hooked) { hooked = state.es; state.es.addEventListener('member-roles', onRoles); } };
  const _connect56 = connect;
  connect = function (...a) { const r = _connect56.apply(this, a); hook(); return r; };
  hook();
}

// ======================= 0.56.1: give a server back =======================
// The owner sees "Give Back to <name>" in the server menu when the server came to them from someone
// else (for example the founder looking after a community for a while).
{
  const _osm56 = openServerMenu;
  openServerMenu = function (anchor, sv = currentServer(), ...a) {
    const r = _osm56(anchor, sv, ...a);
    const p = sv?.previousOwner;
    if (!sv || sv.ownerId !== state.me?.id || !p) return r;
    const menu = $$('#layer .menu').pop();
    if (!menu || $('[data-giveback]', menu)) return r;
    const b = document.createElement('button');
    b.dataset.giveback = '1';
    b.innerHTML = `<span class="mi-ico">${uiIcon('crown')}</span><span>Give Back to ${esc(p.displayName)}</span>`;
    b.addEventListener('click', async () => {
      closeLayer();
      if (!await confirmOver(`Give ${sv.name} back to ${p.displayName}?`, `${p.displayName} becomes the owner again. You stay in the server with your roles.`, 'Give Back', true)) return;
      try { await api('POST', `/api/servers/${sv.id}/return-ownership`); toast(`${p.displayName} owns ${sv.name} again 👑`); await refresh({ serverId: sv.id }).catch(() => {}); }
      catch (err) { toast(err.message, true); }
    });
    const danger = [...menu.children].find(x => /Delete Server|Leave Server/.test(x.textContent));
    menu.insertBefore(b, danger || null);
    return r;
  };
}

// ======================= 0.56.1: AutoMod presets =======================
// Server Settings › AutoMod starts with ready-made setups. Picking one fills in the form (your own
// blocked words, skipped roles and channels and alert channel are kept); press Save to use it.
const AM_SCAMS56 = ['*free nitro*', '*free bloom*', '*steam gift*', '*claim your prize*', '*claim your reward*', '*crypto giveaway*', '*airdrop*', '*double your money*', '*send me your password*', '*verify your account here*', '*gift for you*', '*you have been selected*'];
const AM_PRESETS56 = [
  { id: 'light', icon: '🌱', name: 'Relaxed', desc: 'For friend groups. Only stops spam and invites to other servers.',
    set: { enabled: true, invites: true, links: false, spam: true, caps: false, mentionLimit: 10, newAccountLinks: 0, timeoutMinutes: 0 } },
  { id: 'balanced', icon: '🛡️', name: 'Balanced', desc: 'Recommended for most servers. Spam, shouting, mention spam and common scam messages.', best: true,
    set: { enabled: true, invites: true, links: false, spam: true, caps: true, mentionLimit: 5, newAccountLinks: 60, timeoutMinutes: 1 }, words: AM_SCAMS56 },
  { id: 'public', icon: '🌍', name: 'Big public server', desc: 'Only links to well-known sites, no links from new accounts for a day, 10-minute timeouts.',
    set: { enabled: true, invites: true, links: true, spam: true, caps: true, mentionLimit: 3, newAccountLinks: 1440, timeoutMinutes: 10 }, words: AM_SCAMS56,
    allow: ['youtube.com', 'youtu.be', 'twitch.tv', 'klipy.com', 'wikipedia.org', 'github.com', 'spotify.com', 'reddit.com'] },
  { id: 'gaming', icon: '🎮', name: 'Gaming', desc: 'Clips and streams are fine; fake gift and trade scams are blocked.',
    set: { enabled: true, invites: true, links: true, spam: true, caps: false, mentionLimit: 5, newAccountLinks: 60, timeoutMinutes: 5 }, words: AM_SCAMS56,
    allow: ['youtube.com', 'youtu.be', 'twitch.tv', 'medal.tv', 'store.steampowered.com', 'roblox.com', 'epicgames.com', 'klipy.com'] },
  { id: 'art', icon: '🎨', name: 'Art & creators', desc: 'Links to portfolio and art sites only, so promo spam stays out.',
    set: { enabled: true, invites: true, links: true, spam: true, caps: false, mentionLimit: 5, newAccountLinks: 1440, timeoutMinutes: 5 }, words: AM_SCAMS56,
    allow: ['artstation.com', 'deviantart.com', 'pixiv.net', 'behance.net', 'dribbble.com', 'instagram.com', 'youtube.com', 'youtu.be', 'tiktok.com'] },
  { id: 'lockdown', icon: '🚨', name: 'Raid lockdown', desc: 'For when you are being raided. No links at all, 2 mentions max, 1-hour timeouts. Turn it back down after.',
    set: { enabled: true, invites: true, links: true, spam: true, caps: true, mentionLimit: 2, newAccountLinks: 10080, timeoutMinutes: 60 }, words: AM_SCAMS56, allow: [] },
];
{
  const _ssAutomod56 = ssAutomod;
  ssAutomod = async function (body, sv, ...rest) {
    const r = await _ssAutomod56(body, sv, ...rest);
    const f = $('#am-form', body);
    if (!f || $('.amp56', body)) return r;
    const box = document.createElement('div');
    box.className = 'setting-group amp56';
    box.innerHTML = `<h4 class="setting-head">Start from a preset</h4>
      <p class="muted small" style="margin:0 0 10px">Fills in the settings below. Your own blocked words, skipped roles and channels, and alert channel stay. Nothing changes until you press Save.</p>
      <div class="amp56-grid">${AM_PRESETS56.map(p => `<button type="button" class="amp56-card" data-amp="${p.id}"><span class="amp56-ico">${p.icon}</span><b>${esc(p.name)}${p.best ? ' <span class="amp56-best">Recommended</span>' : ''}</b><span class="muted small">${esc(p.desc)}</span></button>`).join('')}</div>`;
    f.prepend(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-amp]');
      if (!b) return;
      const p = AM_PRESETS56.find(x => x.id === b.dataset.amp);
      for (const [k, v] of Object.entries(p.set)) {
        const el = f.elements[k];
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = v; else el.value = String(v);
      }
      if (p.words) {
        const have = f.words.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        f.words.value = [...new Set([...have, ...p.words])].join('\n');
      }
      if (p.allow) f.allowDomains.value = p.allow.join('\n');
      $$('.amp56-card', box).forEach(x => x.classList.toggle('on', x === b));
      toast(`${p.name} filled in. Check it, then press Save AutoMod.`);
      $('#am-save', body)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return r;
  };
}

// ======================= 0.56.1: scrolling up =======================
// Near the top, every scroll event drew another 100 older messages (two watchers asked at once), so
// the chat stuttered and jumped. Now it's at most once every 300 ms.
{
  const _loadOlder56 = loadOlder;
  // Calls that come while one is waiting share it, so "jump to message" still loads page after page.
  let at = 0, pending = null;
  loadOlder = function (...a) {
    if (pending) return pending;
    const wait = Math.max(0, 300 - (performance.now() - at));
    pending = new Promise(r => setTimeout(r, wait)).then(() => { at = performance.now(); return _loadOlder56.apply(this, a); }).finally(() => { pending = null; });
    return pending;
  };
}
