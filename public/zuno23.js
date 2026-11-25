'use strict';
// Zuno 0.23: end-to-end encrypted group chats, the encryption offer in new chats, reporting
// encrypted messages (the reporter's keys let staff read just what's reported), and from:@name in
// search. (Chat themes live in zuno22.js; the report screens in moderation.js.)

// ======================= encrypted group chats =======================
// Same locks as encrypted DMs (secure16.js): each message gets its own key, locked once for every
// device of every member. Anyone in the group can turn it on or off.
const groupOf = id => state.groups.find(g => g.id === id);
const groupE2e = id => !!groupOf(id)?.e2e;
async function encryptForUsers(userIds, text) {
  const dev = await ensureDevice();
  if (!dev) throw new Error("This browser can't encrypt messages. Turn off encryption for this chat, or use another browser.");
  const ids = [...new Set([...userIds, state.me.id])];
  const targets = (await Promise.all(ids.map(id => devicesOf(id, true).catch(() => [])))).flat();
  if (!targets.some(d => d.id === dev.id)) targets.push({ id: dev.id, key: dev.publicJwk });
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text));
  const keys = {};
  for (const t of targets) {
    const s = await shared(dev.privateKey, await importPub(t.key));
    const kiv = crypto.getRandomValues(new Uint8Array(12));
    keys[t.id] = { iv: b64u(kiv), k: b64u(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: kiv }, s, raw)) };
  }
  const e2e = { v: 1, from: dev.id, iv: b64u(iv), ct: b64u(ct), keys };
  plainCache.set(e2e.ct, text);
  return e2e;
}
const _api23 = api;
api = async function (method, url, body) {
  const g = /^\/api\/groups\/([^/]+)\/messages(?:\/([^/]+))?$/.exec(url);
  if (g && body?.content && ((method === 'POST' && !g[2]) || (method === 'PATCH' && g[2]))) {
    const editing = method === 'PATCH' && state.convos['g:' + g[1]]?.messages.find(m => m.id === g[2])?.e2e;
    if (groupE2e(g[1]) || editing) body = { ...body, content: '', e2e: await encryptForUsers(groupOf(g[1])?.members.map(u => u.id) || [], body.content) };
  }
  return _api23(method, url, body);
};
async function groupSafetyNumber(g) {
  const all = (await Promise.all(g.members.map(u => devicesOf(u.id, true).catch(() => [])))).flat().map(d => d.key.x + d.key.y).sort().join('|');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(all)));
  let digits = '';
  for (let i = 0; i < 30; i += 2) digits += String(((h[i] << 8) | h[i + 1]) % 100000).padStart(5, '0');
  return digits.match(/.{5}/g).slice(0, 12).join(' ');
}
async function openGroupE2e(id) {
  const g = groupOf(id);
  if (!g) return;
  const on = !!g.e2e;
  await ensureDevice();
  const num = on ? await groupSafetyNumber(g).catch(() => '') : '';
  const ov = openLayer(`<div class="dialog modal e2e-dialog"><div class="e2e-hero">${LOCK_ICO}</div><h3>${on ? 'This group is end-to-end encrypted' : 'Encrypt this group'}</h3>
    <p>${on ? 'New messages in this group are locked on the devices of the people in it. Zuno only ever stores scrambled text it can\'t read.' : 'Lock new messages so only the people in this group can read them, on the devices they use Zuno on. Not even Zuno can read them.'}</p>
    <ul class="e2e-notes"><li>People added later can't read messages sent before they joined.</li><li>Encrypted messages can't be searched, and links don't get previews.</li><li>Pictures and files aren't encrypted yet, only text.</li><li>If someone reports a message, they share it (and the ones before it) with the Zuno team.</li></ul>
    ${on && num ? `<div class="e2e-num"><div class="muted small">Group safety number. Everyone in the group sees the same one: if yours match, nobody is listening in.</div><code>${esc(num)}</code></div>` : ''}
    <div class="actions"><button class="btn btn-link" data-a="close">Close</button><button class="btn ${on ? 'btn-grey' : 'btn-primary'}" data-a="toggle">${on ? 'Turn Off' : 'Turn On Encryption'}</button></div></div>`);
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
  $('[data-a=toggle]', ov).addEventListener('click', () => setGroupE2e(id, !on).then(ok => ok && closeLayer()));
}
async function setGroupE2e(id, on) {
  try {
    const r = await _api23('PUT', `/api/groups/${id}/e2e`, { on });
    const g = groupOf(id); if (g) g.e2e = r.e2e;
    toast(r.e2e ? '🔒 Encryption is on for this group' : 'Encryption is off for new messages');
    renderMessages();
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
// The lock in a group's top bar.
function addGroupLock() {
  if (state.view.type !== 'group') return;
  const bar = $('#main .topbar');
  if (!bar) return;
  const on = groupE2e(state.view.groupId);
  let b = $('#e2e-btn', bar);
  if (!b) {
    b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'e2e-btn'; b.innerHTML = LOCK_ICO;
    b.addEventListener('click', () => openGroupE2e(state.view.groupId));
    ($('#theme-btn', bar) || $('#toggle-panel', bar))?.before(b);
    if (!b.isConnected) bar.appendChild(b);
    if (typeof compactTopbar === 'function') compactTopbar();
  }
  b.classList.toggle('e2e-on', on);
  b.title = on ? 'End-to-end encrypted' : 'Turn on end-to-end encryption';
}

// ======================= the encryption offer =======================
// A brand-new DM or group (nobody has said anything yet) offers encryption right away.
const offerSeen = () => { try { return JSON.parse(localStorage.getItem('zuno_e2e_offer') || '{}'); } catch { return {}; } };
function dismissOffer(conv) { try { const s = offerSeen(); s[conv] = Date.now(); localStorage.setItem('zuno_e2e_offer', JSON.stringify(s)); } catch {} $('#e2e-offer')?.remove(); }
function maybeOfferE2e() {
  const conv = activeConv(), v = state.view.type;
  $('#e2e-offer')?.remove();
  if (!conv || (v !== 'dm' && v !== 'group') || offerSeen()[conv]) return;
  const peer = v === 'dm' ? user(conv) : null;
  if (peer && (peer.system || peer.bot)) return;
  const convo = state.convos[conv];
  if (!convo?.loaded) return;
  const on = v === 'dm' ? !!convo.meta?.e2e : groupE2e(state.view.groupId);
  if (on || convo.messages.some(m => !m.note && !m.e2eNotice && m.authorId !== SYSTEM_ID_CLIENT())) return;
  const who = v === 'dm' ? esc(peer?.displayName || 'them') : 'the people in this group';
  const el = $('#messages');
  if (!el) return;
  el.insertAdjacentHTML('afterbegin', `<div class="e2e-offer" id="e2e-offer"><div class="eo-ico">${LOCK_ICO}</div><div>
    <b>Make this chat end-to-end encrypted?</b><p>Only you and ${who} will be able to read new messages, on your own devices. Not even Zuno can.</p>
    <div class="eo-actions"><button class="btn btn-primary btn-sm" data-eo="on">🔒 Turn On Encryption</button><button class="btn btn-link btn-sm" data-eo="no">Not now</button></div></div></div>`);
  $('[data-eo="no"]', el).addEventListener('click', () => dismissOffer(conv));
  $('[data-eo="on"]', el).addEventListener('click', async () => {
    if (v === 'group') { if (await setGroupE2e(state.view.groupId, true)) dismissOffer(conv); return; }
    try {
      const r = await _api23('PUT', `/api/dms/${conv}/e2e`, { on: true });
      if (convo.meta) convo.meta.e2e = r.e2e; else convo.meta = { e2e: r.e2e };
      dismissOffer(conv); renderDMHeader(); toast('🔒 Encryption is on for this chat');
    } catch (e) { toast(e.message, true); }
  });
}
const SYSTEM_ID_CLIENT = () => Object.values(state.users).find(u => u.system)?.id;
const _renderMessages23 = renderMessages;
renderMessages = function (...a) { const r = _renderMessages23(...a); addGroupLock(); maybeOfferE2e(); return r; };

// ======================= reporting encrypted messages =======================
// The reporter's device hands over the keys for the reported message and up to 30 before it, so
// the Zuno team can read exactly those (Zuno checks them against what was sent).
async function e2eMessageKey(e) {
  const dev = await ensureDevice();
  const mine = dev && e?.keys?.[dev.id];
  if (!mine) return null;
  try {
    const s = await shared(dev.privateKey, await importPub(mine.fk || e.fromKey));
    return b64u(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(mine.iv) }, s, unb64u(mine.k)));
  } catch { return null; }
}
async function e2eReportKeys(conv, msgId) {
  const msgs = state.convos[conv]?.messages || [];
  const i = msgs.findIndex(m => m.id === msgId);
  if (i < 0) return [];
  const pick = msgs.slice(Math.max(0, i - 30), i + 1).filter(m => m.e2e);
  const out = [];
  for (const m of pick) { const key = await e2eMessageKey(m.e2e); if (key) out.push({ id: m.id, key }); }
  return out;
}

// ======================= search: from:@name =======================
// Typing "from:" in a search box adds the @ and lists people; picking one turns it into a
// "from:@name" tag, and whatever you type after it searches that person's messages.
function fromPool(where) {
  const ids = new Set();
  if (where === 'chat' && typeof mentionPool === 'function') for (const u of mentionPool()) ids.add(u.id);
  else {
    for (const id of state.friends || []) ids.add(id);
    for (const d of state.dms || []) ids.add(d.userId);
    for (const g of state.groups || []) for (const u of g.members) ids.add(u.id);
    for (const id of state.serverMembers?.[state.currentServerId] || []) ids.add(id);
  }
  ids.add(state.me.id);
  return [...ids].map(user).filter(u => u && !u.system);
}
function wireFromChip(input, where, onChange) {
  if (!input || input.dataset.fromWired) return;
  input.dataset.fromWired = '1';
  let pop = null, items = [], sel = 0;
  const close = () => { pop?.remove(); pop = null; };
  const chipHost = input.parentElement;
  const setChip = u => {
    $('.from-chip', chipHost)?.remove();
    if (!u) { delete input.dataset.from; onChange(); return; }
    input.dataset.from = '@' + u.username;
    const chip = document.createElement('span');
    chip.className = 'from-chip';
    chip.innerHTML = `from:@${esc(u.username)}<button type="button" aria-label="Remove">✕</button>`;
    input.before(chip);
    $('button', chip).addEventListener('mousedown', e => { e.preventDefault(); setChip(null); input.focus(); });
    onChange();
  };
  const draw = q => {
    const people = fromPool(where);
    items = !q ? people.slice(0, 8) : people.map(u => [typeof mentionScore === 'function' ? mentionScore(u, q) : (u.username.startsWith(q) ? 1 : null), u]).filter(x => x[0] !== null).sort((a, b) => a[0] - b[0]).slice(0, 8).map(x => x[1]);
    if (!items.length) return close();
    sel = Math.min(sel, items.length - 1);
    if (!pop) { pop = document.createElement('div'); pop.className = 'from-pop'; document.body.appendChild(pop); }
    const r = input.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left - 20, innerWidth - 268)) + 'px';
    pop.style.top = r.bottom + 8 + 'px';
    pop.innerHTML = `<div class="fp-head">Messages from…</div>` + items.map((u, i) => `<button class="${i === sel ? 'sel' : ''}" data-i="${i}">${avatar(u, 22)}<b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></button>`).join('');
    $$('[data-i]', pop).forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); pick(Number(b.dataset.i)); }));
  };
  const pick = i => {
    const u = items[i];
    if (!u) return;
    input.value = input.value.replace(/(^|\s)from:@?[\w.]*$/i, '$1').trim();
    close(); setChip(u);
    input.focus();
  };
  input.addEventListener('input', () => {
    // "from:" just typed: add the @ for you.
    if (/(^|\s)from:$/i.test(input.value)) input.value += '@';
    const m = /(^|\s)from:@([\w.]*)$/i.exec(input.value);
    if (m && !input.dataset.from) draw(m[2].toLowerCase()); else close();
    if (input.dataset.from) onChange(true);
  });
  input.addEventListener('keydown', e => {
    if (pop) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(/from:@([\w.]*)$/i.exec(input.value)?.[1]?.toLowerCase() || ''); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    }
    // Backspace at the very start removes the tag.
    if (e.key === 'Backspace' && input.dataset.from && input.selectionStart === 0 && input.selectionEnd === 0) { e.preventDefault(); setChip(null); }
  }, true);
  input.addEventListener('blur', () => setTimeout(close, 150));
}
// The search box in a chat's top bar: once there's a from: tag, results update as you type.
let chatSearchT;
function wireChatSearch() {
  const input = $('#chat-search');
  if (!input) return;
  wireFromChip(input, 'chat', live => {
    if (!live && !input.dataset.from) return;
    clearTimeout(chatSearchT);
    chatSearchT = setTimeout(() => {
      const q = ((input.dataset.from ? `from:${input.dataset.from} ` : '') + input.value).trim();
      if (q && document.activeElement === input) runSearch(q, input.closest('.tb-tools'));
    }, 350);
  });
}
const _renderDMHeader23 = renderDMHeader;
renderDMHeader = function (...a) { const r = _renderDMHeader23(...a); wireChatSearch(); return r; };
document.addEventListener('focusin', e => { if (e.target.id === 'chat-search') wireChatSearch(); if (e.target.id === 'sa-q') wireFromChip(e.target, 'all', live => { if (!live) e.target.dispatchEvent(new Event('input')); }); });
// (Search Everywhere's own input handler runs the search, so the tag only needs to nudge it.)
