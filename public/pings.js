'use strict';
// Unchecked Pings (mentions and replies in servers you haven't seen yet), Account Standing,
// and the message style setting (Bubbles or Classic).

// ======================= Unchecked Pings =======================
state.pings = [];
async function loadPings() {
  try { state.pings = (await api('GET', '/api/me/inbox')).pings; } catch { state.pings = []; }
  renderPingUI();
}
function onInbox() { loadPings(); }
const pingsIn = serverId => state.pings.filter(p => p.serverId === serverId);

// The @ button in channel headers, the "Unchecked Pings" pill above the chat, and dots on the server icons.
function renderPingUI() {
  $$('.rail-ping').forEach(x => x.remove());
  for (const sv of state.servers) {
    const n = pingsIn(sv.id).length;
    const btn = $(`#server-rail [data-server="${CSS.escape(sv.id)}"]`);
    if (n && btn) btn.insertAdjacentHTML('beforeend', `<i class="rail-ping" title="${n} unread mention${n > 1 ? 's' : ''}">@${n > 9 ? '9+' : n}</i>`);
  }
  const bar = $('#main .topbar');
  if (bar && state.view.type === 'channel') {
    let b = $('#ping-btn', bar);
    if (!b) {
      b = document.createElement('button');
      b.id = 'ping-btn'; b.className = 'icon-btn ping-btn'; b.title = 'Unread Mentions';
      const actions = $('#toggle-members', bar);
      actions ? actions.before(b) : bar.appendChild(b);
      b.addEventListener('click', e => openPingInbox(e.currentTarget));
    }
    const n = state.pings.length;
    b.innerHTML = `<span class="ping-at">@</span>${n ? `<span class="ping-count">${n > 99 ? '99+' : n}</span>` : ''}`;
    b.classList.toggle('has', !!n);
  }
  // The pill above the messages, for pings in the server you're looking at.
  const chat = $('#main .chat');
  $('#ping-pill')?.remove();
  const here = state.currentServerId ? pingsIn(state.currentServerId) : [];
  if (chat && here.length && state.view.type === 'channel') {
    const pill = document.createElement('button');
    pill.id = 'ping-pill'; pill.className = 'ping-pill';
    pill.innerHTML = `<span class="ping-at">@</span> ${here.length} new mention${here.length > 1 ? 's' : ''} <span class="pp-go">Jump ↑</span>`;
    pill.addEventListener('click', () => jumpToPing(here[here.length - 1])); // the oldest first
    chat.appendChild(pill);
  }
}

function openPingInbox(anchor) {
  closeLayer();
  const pop = document.createElement('div');
  pop.className = 'menu ping-inbox';
  const list = state.pings;
  pop.innerHTML = `<div class="pi-head"><b>Unread Mentions</b>${list.length ? '<button class="btn btn-link btn-sm" id="pi-clear">Mark all as seen</button>' : ''}</div>
    <div class="pi-list">${list.length ? list.map(p => `<button class="pi-item" data-p="${esc(p.id)}">
      <span class="pi-where"><span class="pi-sv" style="--sv:${esc(p.serverColor)}">${p.serverIcon ? `<img src="${esc(p.serverIcon)}" alt="">` : esc(p.serverName[0] || '?')}</span>${esc(p.serverName)} › #${esc(p.channelName)}<span class="muted"> · ${fmtTime(p.at)}</span></span>
      <span class="pi-msg">${avatar(p.author || { displayName: '?' }, 24)}<span><b>${esc(p.author?.displayName || 'Someone')}</b> ${p.reply ? '<span class="pi-tag">replied to you</span>' : '<span class="pi-tag">mentioned you</span>'}<span class="pi-snip">${esc(p.snippet)}</span></span></span></button>`).join('')
      : `<div class="pi-empty">${mascot('happy')}<div>You're all caught up!</div><small class="muted">When someone @mentions you or replies to you in a server, it shows up here.</small></div>`}</div>`;
  const shield = document.createElement('div');
  shield.style.cssText = 'position:fixed;inset:0;z-index:119';
  shield.addEventListener('mousedown', closeLayer);
  $('#layer').append(shield, pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = r.bottom + 8 + 'px';
  pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + 'px';
  $$('[data-p]', pop).forEach(b => b.addEventListener('click', () => { closeLayer(); jumpToPing(state.pings.find(p => p.id === b.dataset.p)); }));
  $('#pi-clear', pop)?.addEventListener('click', async () => { await markPingsSeen([], 'all'); closeLayer(); toast('All pings marked as seen'); });
}

async function markPingsSeen(ids, all) {
  state.pings = state.pings.filter(p => !(ids.includes(p.id) || all === 'all' || p.serverId === all));
  renderPingUI();
  try { await api('POST', '/api/me/inbox/seen', { ids, all }); } catch {}
}

// Open the channel, load older messages until the ping is there, then scroll to it.
async function jumpToPing(p) {
  if (!p) return;
  const conv = 'ch:' + p.channelId;
  if (activeConv() !== conv) await openChannel(p.serverId, p.channelId);
  for (let i = 0; i < 15 && !$(`.msg[data-id="${CSS.escape(p.id)}"]`); i++) {
    if (!state.convos[conv]?.hasMore) break;
    await loadOlder();
  }
  if ($(`.msg[data-id="${CSS.escape(p.id)}"]`)) jumpToMessage(p.id);
  else toast("That message couldn't be found. It may have been deleted.");
  markPingsSeen([p.id]);
}

// A ping counts as checked once you've actually seen it on screen for a moment.
const pingSeer = new IntersectionObserver(entries => {
  for (const en of entries) {
    const id = en.target.dataset.id;
    if (en.isIntersecting && document.hasFocus()) en.target._seenT = setTimeout(() => { if (state.pings.some(p => p.id === id)) markPingsSeen([id]); }, 900);
    else clearTimeout(en.target._seenT);
  }
}, { threshold: 0.6 });
// Only chat redraws matter, and many changes in one frame are looked at once.
let pingScan = 0;
new MutationObserver(list => {
  if (!state.pings.length || pingScan || !list.some(r => r.target.id === 'messages' || r.target.closest?.('#messages'))) return;
  pingScan = requestAnimationFrame(() => {
    pingScan = 0;
    const ids = new Set(state.pings.map(p => p.id));
    for (const el of $$('#messages > .msg[data-id]')) if (!el._pingWatched && ids.has(el.dataset.id)) { el._pingWatched = true; pingSeer.observe(el); }
  });
}).observe(document.body, { childList: true, subtree: true });

// Draw the ping UI whenever the view changes.
const _openChannelP = openChannel;
openChannel = async function (...args) { const r = await _openChannelP(...args); renderPingUI(); return r; };
const _renderRailP = renderRail;
renderRail = function (...args) { _renderRailP(...args); renderPingUI(); };
// Load once signed in.
(function waitForMe() { if (state.me && state.servers) loadPings(); else setTimeout(waitForMe, 800); })();

// Keyboard: Ctrl+Shift+M jumps to the next unchecked ping.
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm' && state.pings.length) { e.preventDefault(); jumpToPing(state.pings[state.pings.length - 1]); }
});

// ======================= Account Standing =======================
const STANDING = {
  good: { icon: '🌿', title: "You're in good standing", text: "Thanks for keeping Zuno a nice place. There's nothing on your account.", level: 0 },
  warned: { icon: '⚠️', title: "You've been warned recently", text: "Warnings fade after 90 days. More problems could lead to a timeout.", level: 1 },
  timeout: { icon: '⏸️', title: 'Your account is in a timeout', text: "You can read, but you can't send messages or make changes until it ends.", level: 2 },
  banned: { icon: '⛔', title: 'Your account is banned', text: "You can still read, but you can't post. This happened because the account broke the Terms of Service.", level: 3 },
};
const STANDING_ACTION = { warn: 'You were warned', timeout: 'Your account was put in a timeout', ban: 'Your account was banned', unsuspend: 'Your timeout or ban was lifted', 'delete-message': 'A message of yours was removed' };
async function renderStanding(body) {
  let st;
  try { st = await api('GET', '/api/me/standing'); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const s = STANDING[st.status];
  body.innerHTML = `<h2>Account Standing</h2>
    <div class="standing-card s-${st.status}">
      <div class="sc-icon">${st.status === 'good' ? mascot('happy') : `<span>${uiIcon({ warned: 'warning', timeout: 'pause', banned: 'ban' }[st.status] || 'sprout')}</span>`}</div>
      <div><h3>${s.title}</h3><p>${s.text}</p>
        ${st.suspendedUntil ? `<p class="sc-until">${st.status === 'banned' ? 'Banned' : `Ends ${esc(new Date(st.suspendedUntil).toLocaleString())}`}</p>` : ''}</div>
    </div>
    <div class="standing-meter" aria-label="Standing level">${['All good', 'Warned', 'Limited', 'Banned'].map((l, i) => `<div class="sm-step${i === s.level ? ' on' : ''}${i < s.level ? ' past' : ''}"><i></i><span>${l}</span></div>`).join('')}</div>
    <h4 class="setting-head" style="margin-top:26px">History</h4>
    ${st.history.length ? st.history.map(h => `<div class="bug-row"><div style="flex:1"><b>${esc(STANDING_ACTION[h.action] || h.action)}</b>${h.days ? ` for ${h.days} day${h.days > 1 ? 's' : ''}` : ''}
        <div class="muted small">${fmtTime(h.at)}${h.note ? ` · Reason: "${esc(h.note)}"` : ''}</div></div></div>`).join('')
      : '<div class="fp-empty">Nothing has ever happened on your account. Nice!</div>'}
    <p class="muted small" style="margin-top:20px">Zuno's rules are in the <a href="/terms#rules" target="_blank">Terms of Service</a>. Think something here is a mistake? Use Report a Bug or message the team in Zuno Official.</p>`;
}

// ======================= message style: Bubbles or Classic =======================
// (0.48) Phones default to Classic (clean rows, like other big chat apps); computers keep Bubbles.
// Whatever you pick in Settings › Appearance wins.
const defaultMsgStyle = () => (VW <= 760 ? 'classic' : 'bubbles');
function messageStyle() { try { return localStorage.getItem('zuno_msg_style') || defaultMsgStyle(); } catch { return defaultMsgStyle(); } }
function applyMessageStyle() { document.documentElement.dataset.msgstyle = messageStyle(); }
applyMessageStyle();
const _renderAppearanceP = renderAppearance;
renderAppearance = function (body) {
  _renderAppearanceP(body);
  const group = $('.setting-group:nth-of-type(2)', body) || body;
  const cur = messageStyle();
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `<div><div class="setting-title">Message style</div><div class="setting-desc">Bubbles puts messages in soft chat bubbles, with everyone on the left (on phones, your own DMs go on the right like a texting app). Classic is plain text.</div></div>
    <div class="segmented">${[['bubbles', 'Bubbles'], ['classic', 'Classic']].map(([k, l]) => `<button data-mstyle="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const first = $('.setting-row', group);
  first ? first.before(row) : group.appendChild(row);
  $$('[data-mstyle]', row).forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem('zuno_msg_style', b.dataset.mstyle); } catch {}
    applyMessageStyle(); renderAppearance(body);
  }));
};
