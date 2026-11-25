'use strict';
// Message Requests: people who aren't your friends can "knock" with up to 3 messages.
// They wait in Requests (or Filtered, if they look like spam) until you accept. Nothing pings you
// for Filtered ones, and declining is silent. Plus Privacy & Safety settings and blocking.

const ago = ms => { const d = ms / 864e5; return d >= 365 ? `${Math.floor(d / 365)} year${d >= 730 ? 's' : ''}` : d >= 30 ? `${Math.floor(d / 30)} month${d >= 60 ? 's' : ''}` : d >= 1 ? `${Math.floor(d)} day${d >= 2 ? 's' : ''}` : `${Math.max(1, Math.floor(ms / 3600e3))} hour${ms >= 7200e3 ? 's' : ''}`; };

function showRequests(tab = 'requests') {
  if (state.view.type === 'dm') stopProfileSound();
  setWhere('Message Requests');
  state.view = { type: 'requests', tab };
  state.currentServerId = null;
  renderRail(); renderSidebar();
  $('#app').classList.remove('show-nav');
  const reqs = state.messageRequests || [];
  const n = reqs.filter(r => !r.spam).length, f = reqs.filter(r => r.spam).length;
  const main = $('#main');
  main.innerHTML = `<div class="topbar">${mobileNavButton()}<div class="title">${ICON.chat} Message Requests</div><div class="divider"></div>
    <button class="tab${tab === 'requests' ? ' active' : ''}" data-rt="requests">Requests${n ? ` <span class="badge" style="margin:0">${n}</span>` : ''}</button>
    <button class="tab${tab === 'filtered' ? ' active' : ''}" data-rt="filtered">Filtered${f ? ` <span class="muted">${f}</span>` : ''}</button>
    <span class="spacer"></span><button class="icon-btn" id="req-settings" title="Who can message me">${ICON.gear}</button></div>
    <div class="body-row"><div class="requests" id="requests-body"></div></div>`;
  wireMobileNav(main);
  $$('[data-rt]', main).forEach(b => b.addEventListener('click', () => showRequests(b.dataset.rt)));
  $('#req-settings').addEventListener('click', () => openSettings('privacy'));
  renderRequestsBody();
}
function renderRequestsBody() {
  const el = $('#requests-body');
  if (!el || state.view.type !== 'requests') return;
  const filtered = state.view.tab === 'filtered';
  const list = (state.messageRequests || []).filter(r => !!r.spam === filtered);
  const intro = filtered
    ? `<div class="req-intro">🧹 <div><b>Filtered requests</b><span>Zuno moves messages that look like spam here, quietly. They don't notify you. Check now and then in case something real landed here.</span></div></div>`
    : `<div class="req-intro">🚪 <div><b>Someone knocked</b><span>People who aren't your friends can send you up to 3 messages. They can't see whether you've read them, and if you decline, they aren't told.</span></div></div>`;
  if (!list.length) { el.innerHTML = intro + emptyState(filtered ? 'happy' : 'sleepy', filtered ? 'Nothing filtered' : 'No message requests', filtered ? 'No spam here. Nice and tidy.' : "When someone who isn't your friend messages you, it shows up here."); return; }
  el.innerHTML = intro + list.map(r => `<div class="req-card" data-req="${esc(r.user.id)}">
    <div class="rc-top">${avatar(r.user, 44, true)}<div class="rc-who"><b>${esc(r.user.displayName)}</b><span class="muted">${esc(r.user.username)}</span>
      <div class="rc-facts"><span title="How old their account is">🕒 Account ${ago(r.accountAge)} old</span>${r.mutualServers.length ? `<span>🏠 ${r.mutualServers.map(s => esc(s.name)).join(', ')}</span>` : '<span class="warn">No servers in common</span>'}${r.mutualFriends ? `<span>👥 ${r.mutualFriends} mutual friend${r.mutualFriends > 1 ? 's' : ''}</span>` : ''}</div></div>
      <span class="muted small">${fmtTime(r.at)}</span></div>
    <div class="rc-preview">${r.preview ? formatMessage(r.preview) : '<i class="muted">Sent an attachment</i>'}${r.count > 1 ? `<span class="rc-more">+${r.count - 1} more</span>` : ''}</div>
    <div class="rc-acts"><button class="btn btn-green btn-sm" data-ra="accept">Accept</button><button class="btn btn-grey btn-sm" data-ra="peek">Read all</button><button class="btn btn-grey btn-sm" data-ra="decline">Decline</button>
      <span style="flex:1"></span>${filtered ? '<button class="btn btn-link btn-sm" data-ra="notspam">Not spam</button>' : '<button class="btn btn-link btn-sm" data-ra="spam">Mark as spam</button>'}<button class="btn btn-link btn-sm danger" data-ra="block">Block</button></div></div>`).join('');
  $$('[data-req]', el).forEach(card => {
    const id = card.dataset.req;
    $$('[data-ra]', card).forEach(b => b.addEventListener('click', () => requestAction(id, b.dataset.ra, card)));
    $$('[data-profile]', card).forEach(n => n.addEventListener('click', () => openProfile(n.dataset.profile)));
  });
}
async function requestAction(id, action, card) {
  const u = user(id);
  if (action === 'peek') return openDM(id);
  if (action === 'block') return confirmBlock(id, () => { card?.remove(); });
  try {
    await api('POST', `/api/dms/${id}/request`, { action });
    if (card) { card.classList.add('removing'); setTimeout(() => card.remove(), 200); }
    state.messageRequests = (state.messageRequests || []).filter(r => action !== 'accept' && action !== 'decline' ? true : r.user.id !== id);
    if (action === 'spam' || action === 'notspam') { const r = state.messageRequests.find(x => x.user.id === id); if (r) r.spam = action === 'spam'; }
    renderFriendsBadge();
    if (action === 'accept') { toast(`You can now chat with ${u?.displayName || 'them'}`); delete state.convos[id]; await refresh({}); openDM(id); }
    else if (action === 'decline') toast('Request declined. They won’t be told.');
    else toast(action === 'spam' ? 'Moved to Filtered' : 'Moved to Requests');
    setTimeout(() => state.view.type === 'requests' && showRequests(state.view.tab), 220);
  } catch (e) { toast(e.message, true); }
}
function confirmBlock(id, after) {
  const u = user(id);
  confirmDialog(`Block ${u?.displayName || 'them'}?`, "They won't be able to message you, call you or send you friend requests. If you're friends, you'll be unfriended. They aren't told.", 'Block', async () => {
    try { await api('POST', `/api/users/${id}/block`, { on: true }); state.me.blocked = [...new Set([...(state.me.blocked || []), id])]; toast(`${u?.displayName || 'They'} blocked`); delete state.convos[id]; after?.(); await refresh({}); if (state.view.type === 'requests') showRequests(state.view.tab); else if (activePeer() === id) openDM(id); }
    catch (e) { toast(e.message, true); }
  });
}
async function unblock(id) {
  try { await api('POST', `/api/users/${id}/block`, { on: false }); state.me.blocked = (state.me.blocked || []).filter(x => x !== id); toast('Unblocked'); delete state.convos[id]; await refresh({}); if (activePeer() === id) openDM(id); }
  catch (e) { toast(e.message, true); }
}

// What the message box looks like in a DM with someone who isn't your friend.
function dmLockedComposer(el, u, meta) {
  if (!meta) { el.innerHTML = '<div class="composer-locked muted">Loading…</div>'; return true; }
  // (0.46) Bots can be messaged when you share a server with them (Zuno checks when you send).
  if (u.bot && u.id !== 'testing') return false;
  if (meta.blocked) { el.innerHTML = `<div class="composer-locked">🚫 You blocked ${esc(u.displayName)}. <button class="btn btn-grey btn-sm" id="lock-unblock">Unblock</button></div>`; $('#lock-unblock').addEventListener('click', () => unblock(u.id)); return true; }
  const req = meta.request;
  if (req?.direction === 'incoming') {
    el.innerHTML = `<div class="composer-locked req-lock"><div><b>${esc(u.displayName)} wants to message you.</b><span>Accept to reply. They can't tell you've read this.</span></div>
      <button class="btn btn-green btn-sm" data-ra="accept">Accept</button><button class="btn btn-grey btn-sm" data-ra="decline">Decline</button><button class="btn btn-link btn-sm danger" data-ra="block">Block</button></div>`;
    $$('[data-ra]', el).forEach(b => b.addEventListener('click', () => requestAction(u.id, b.dataset.ra)));
    return true;
  }
  if (req?.direction === 'outgoing' && req.status === 'declined') { el.innerHTML = `<div class="composer-locked">${esc(u.displayName)} isn't taking messages from you right now.</div>`; return true; }
  if (u.id === 'testing') {
    el.innerHTML = `<div class="composer-locked">Add Testing as a friend to chat. It says yes right away! <button class="btn btn-primary btn-sm" id="lock-act">Send Friend Request</button></div>`;
    $('#lock-act').addEventListener('click', () => sendRequest(u.username));
    return true;
  }
  return false; // you can knock
}
function dmRequestNote(u, meta) {
  if (u?.bot) return ''; // (0.46) DMs with bots don't go through Message Requests
  const sent = (state.convos[u.id]?.messages || []).filter(m => m.authorId === state.me.id && !m.pending).length;
  const rel = relationshipWith(u.id);
  const fr = rel === 'incoming' ? `<button class="btn btn-link btn-sm" data-fr="accept">Accept their friend request</button>` : rel === 'outgoing' ? '<span class="muted small">Friend request sent</span>' : '<button class="btn btn-link btn-sm" data-fr="send">Add Friend</button>';
  setTimeout(() => {
    $('[data-fr=send]')?.addEventListener('click', () => sendRequest(u.username));
    $('[data-fr=accept]')?.addEventListener('click', () => { const r = state.requests.find(x => x.userId === u.id && x.direction === 'incoming'); if (r) acceptRequest(r.id); });
  });
  return `<div class="req-note">🚪 <span>${meta?.request ? `Message request sent · <b>${sent}/${meta.request.limit || 3}</b>. ${esc(u.displayName)} sees it once they accept.` : `You're not friends yet, so this goes to ${esc(u.displayName)}'s Message Requests. You can send up to 3 messages until they accept.`}</span>${fr}</div>`;
}

// ======================= Privacy & Safety settings =======================
async function renderPrivacy(body) {
  const p = prefs();
  let blocked = [];
  try { blocked = (await api('GET', '/api/me/blocked')).users; } catch {}
  body.innerHTML = `<h2>Privacy & Safety</h2>
    <div class="setting-group"><h4 class="setting-head">Who can send you message requests</h4>
      <p class="muted small" style="margin:0 0 10px">Friends can always message you. Everyone else lands in Message Requests first.</p>
      <div class="level-pick">${[['everyone', 'Everyone', 'Anyone on Zuno can knock.'], ['servers', 'People in my servers', "Only people you share a server with."], ['friends', 'Friends only', 'Nobody else can message you.']].map(([v, l, d]) => `<label class="level${p.dmRequests === v ? ' on' : ''}"><input type="radio" name="dmr" value="${v}"${p.dmRequests === v ? ' checked' : ''}><b>${l}</b><small>${d}</small></label>`).join('')}</div>
    </div>
    <div class="setting-group">${prefToggle('filterSpam', 'Filter likely spam', 'Requests that look like spam (brand-new accounts, suspicious links, the same message sent to lots of people) go to Filtered quietly instead of pinging you.')}</div>
    <div class="setting-group"><h4 class="setting-head">Blocked <span class="muted">${blocked.length}</span></h4>
      ${blocked.length ? blocked.map(u => `<div class="bug-row">${avatar(u, 36)}<div style="flex:1;min-width:0"><b>${esc(u.displayName)}</b> <span class="muted">${esc(u.username)}</span></div><button class="btn btn-grey btn-sm" data-unblock="${esc(u.id)}">Unblock</button></div>`).join('') : '<div class="fp-empty">You haven’t blocked anyone.</div>'}</div>`;
  $$('[name=dmr]', body).forEach(r => r.addEventListener('change', async () => { await savePref({ dmRequests: r.value }); renderPrivacy(body); toast('Saved'); }));
  wireToggles(body, () => renderPrivacy(body));
  $$('[data-unblock]', body).forEach(b => b.addEventListener('click', async () => { await unblock(b.dataset.unblock); renderPrivacy(body); }));
}

// ======================= live events =======================
function hookRequestEvents(es) {
  es.addEventListener('message-request', async e => {
    const d = JSON.parse(e.data);
    await refresh({});
    if (state.view.type === 'requests') showRequests(state.view.tab);
    if (d.spam || state.me.statusPref === 'dnd') return;
    const r = (state.messageRequests || []).find(x => x.user.id === d.from);
    if (r && r.count === 1) { if (prefs().notificationSound) playPing(); toast(`✉️ New message request from ${r.user.displayName}`); }
  });
  es.addEventListener('request-accepted', e => {
    const { userId } = JSON.parse(e.data);
    if (state.convos[userId]) state.convos[userId].meta = { ...(state.convos[userId].meta || {}), request: null, accepted: true };
    toast(`${user(userId)?.displayName || 'Someone'} accepted your message request 🎉`);
    refresh({});
  });
}
(function waitEsR() {
  if (!state.es) return setTimeout(waitEsR, 800);
  hookRequestEvents(state.es);
  const _connectR = connect;
  connect = function () { _connectR(); hookRequestEvents(state.es); };
})();

// Right-click a DM for Profile / Block.
document.addEventListener('contextmenu', e => {
  const b = e.target.closest('#dm-list .dm-item');
  if (!b) return;
  e.preventDefault();
  const id = b.dataset.id, u = user(id);
  if (!u || u.system) return;
  const blocked = (state.me.blocked || []).includes(id);
  openMenu(atPoint(e), [
    { label: 'Profile', icon: ico('👤'), run: () => openProfile(id) },
    { label: 'Copy User ID', icon: ico('#️⃣'), run: () => copyText(id, 'User ID') },
    'sep',
    blocked ? { label: 'Unblock', run: () => unblock(id) } : { label: 'Block', danger: true, run: () => confirmBlock(id) },
  ]);
});

// After you knock, the note above the message box counts what you've sent.
const _sendMessageR = sendMessage;
sendMessage = async function (conv, ...rest) {
  await _sendMessageR(conv, ...rest);
  if (isChannelConv(conv) || isGroupConv(conv) || relationshipWith(conv) === 'friend' || user(conv)?.bot) return;
  const convo = state.convos[conv];
  if (!convo || convo.meta?.accepted) return;
  if (convo.messages.some(m => m.authorId === state.me.id && !m.pending)) {
    convo.meta = { ...(convo.meta || {}), request: convo.meta?.request || { direction: 'outgoing', status: 'pending', limit: 3 } };
    if (activeConv() === conv) { const el = $('#composer'); if (el) delete el.dataset.rel; renderComposer(); }
    const e = state.dms.find(x => x.userId === conv); if (e) e.pending = true;
    renderDMList();
  }
};
