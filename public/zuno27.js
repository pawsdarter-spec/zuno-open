// Zuno 0.27: status schedules, Polls 2.0, the pin board, voice channel games, Discover categories &
// trending, server ban appeals, Bloom gifting events, the bot marketplace, the in-game overlay and
// the founder's admin dashboard.

// ======================= status schedules =======================
// Status menu › Schedule Status: "Do Not Disturb, weekdays 9:00–17:00" and the like.
const SCHED_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SCHED_STATUS = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible' };
const _openStatusMenu27 = openStatusMenu;
openStatusMenu = function (anchor, ...a) {
  const _om = openMenu;
  openMenu = (anc, items) => {
    openMenu = _om;
    const i = items.findIndex(x => x?.run === openCustomStatus);
    items.splice(i + 1, 0, { label: 'Schedule Status…', desc: 'Change it by itself at set times', icon: '<span class="mi-ico">🕒</span>', run: openStatusSchedule });
    return _om(anc, items);
  };
  try { return _openStatusMenu27(anchor, ...a); } finally { openMenu = _om; }
};
async function openStatusSchedule() {
  let d = { rules: [] };
  try { d = await api('GET', '/api/me/status-schedule'); } catch (e) { return toast(e.message, true); }
  let rules = d.rules.map(r => ({ ...r }));
  const ov = openLayer(`<div class="dialog modal sched-dlg"><h3>🕒 Schedule Status</h3>
    <p class="muted" style="margin:0 0 10px">Your status changes by itself at these times (your time: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local')}). Afterwards it goes back to what you had.</p>
    <div class="sched-list"></div>
    <button class="btn btn-grey btn-sm" data-a="add">+ Add a time</button>
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="save">Save</button></div></div>`);
  const list = $('.sched-list', ov);
  const draw = () => {
    list.innerHTML = rules.length ? rules.map((r, i) => `<div class="sched-rule" data-i="${i}">
      <div class="sched-top"><select class="sc-select" data-k="status">${Object.entries(SCHED_STATUS).map(([k, l]) => `<option value="${k}"${r.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input type="time" data-k="from" value="${esc(r.from)}"><span class="muted">to</span><input type="time" data-k="to" value="${esc(r.to)}">
        <input type="checkbox" class="switch" data-k="on"${r.on !== false ? ' checked' : ''} title="On"><button class="icon-btn" data-del title="Remove">✕</button></div>
      <div class="sched-days">${SCHED_DAYS.map((n, d) => `<button type="button" class="sched-day${r.days.includes(d) ? ' on' : ''}" data-day="${d}">${n}</button>`).join('')}</div>
      <input class="sched-text" data-k="text" maxlength="80" placeholder="Custom status while it's on (optional)" value="${esc(r.text || '')}"></div>`).join('')
      : '<div class="fp-empty">No times yet. Add one, like Do Not Disturb on weekdays from 9 to 5.</div>';
    for (const row of $$('.sched-rule', list)) {
      const r = rules[row.dataset.i];
      for (const inp of $$('[data-k]', row)) inp.addEventListener('change', () => { r[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; });
      for (const b of $$('[data-day]', row)) b.addEventListener('click', () => { const d = Number(b.dataset.day); r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d]; b.classList.toggle('on'); });
      $('[data-del]', row).addEventListener('click', () => { rules.splice(row.dataset.i, 1); draw(); });
    }
  };
  draw();
  $('[data-a=add]', ov).addEventListener('click', () => { rules.push({ status: 'dnd', from: '09:00', to: '17:00', days: [1, 2, 3, 4, 5], text: '', on: true }); draw(); });
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('[data-a=save]', ov).addEventListener('click', async () => {
    if (rules.some(r => !r.days.length)) return toast('Pick at least one day for each time.', true);
    try {
      const r = await api('PUT', '/api/me/status-schedule', { rules, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      closeLayer();
      toast(r.rules.length ? `Saved. ${r.active ? 'One is on right now.' : ''}` : 'Status schedule cleared');
    } catch (e) { toast(e.message, true); }
  });
}

// ======================= Polls 2.0 =======================
// New in the poll maker: anonymous, ranked choice, hide results until the end, let everyone add
// answers, and more lengths. Polls can be ended early, and Zuno posts the result when one ends.
const POLL_LENS = [[0.25, '15 minutes'], [0.5, '30 minutes'], [1, '1 hour'], [4, '4 hours'], [8, '8 hours'], [24, '1 day'], [72, '3 days'], [168, '1 week'], [336, '2 weeks']];
const pollSealed = p => p.anonymous || p.ranked || p.blind;
const pollEndedNow = p => p.closed || (p.endsAt && p.endsAt < Date.now());
state.pollMine ||= {}; // msgId -> your picks, for polls whose votes are private
const pollMineLoading = new Set();
function loadPollMine(m) {
  if (state.pollMine[m.id] || pollMineLoading.has(m.id)) return;
  pollMineLoading.add(m.id);
  const conv = activeConv();
  api('GET', `${convBase(conv)}/messages/${m.id}/poll`).then(r => { state.pollMine[m.id] = r.mine; if (activeConv() === conv) renderMessagesSoon(); }).catch(() => {}).finally(() => pollMineLoading.delete(m.id));
}
const _pollHtml27 = pollHtml;
pollHtml = function (m) {
  const p = m.poll;
  if (p.v !== 2) return _pollHtml27(m);
  if (!pollSealed(p)) {
    // A normal poll with the new extras (end early, add answers): the usual look plus a footer.
    return _pollHtml27(m).replace(/<\/div><\/div>$/, `${pollExtras(m)}</div></div>`).replace('<div class="poll', '<div class="poll v2');
  }
  if (!state.pollMine[m.id]) loadPollMine(m);
  const mine = state.pollMine[m.id] || [];
  const ended = pollEndedNow(p), voted = mine.length > 0;
  const show = ended ? true : !p.blind && (voted || m.authorId === state.me.id);
  const total = p.voters || 0;
  const counts = p.options.map(o => o.count || 0), top = Math.max(0, ...counts);
  const left = p.endsAt - Date.now();
  const leftText = left > 864e5 ? `${Math.round(left / 864e5)}d left` : left > 3600e3 ? `${Math.round(left / 3600e3)}h left` : `${Math.max(1, Math.round(left / 60e3))}m left`;
  const tags = [p.anonymous && 'Anonymous', p.ranked && 'Ranked choice', p.blind && !ended && 'Results at the end'].filter(Boolean);
  const sub = ended ? 'Poll ended' : p.ranked ? (voted ? 'Your ranking is in. Click answers again to change it.' : 'Click the answers in order: your favourite first') : p.multi ? 'Pick one or more answers' : 'Pick one answer';
  const rankOf = id => mine.indexOf(id) + 1;
  const winner = p.ranked ? p.winner : null;
  return `<div class="poll v2${ended ? ' ended' : ''}${p.ranked ? ' ranked' : ''}" data-poll="${esc(m.id)}"><div class="poll-q">${esc(p.question)}</div>
    <div class="poll-tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="poll-sub">${sub}</div>
    ${p.options.map(o => {
      const pct = total ? Math.round(((o.count || 0) / total) * 100) : 0;
      const picked = mine.includes(o.id);
      const win = ended && (p.ranked ? winner === o.id : top && o.count === top);
      return `<button class="poll-opt${picked ? ' on' : ''}${win ? ' win' : ''}" data-vote2="${esc(o.id)}" data-msg="${esc(m.id)}"${ended ? ' disabled' : ''}>
        ${show ? `<span class="po-bar" style="width:${pct}%"></span>` : ''}<span class="po-check">${p.ranked ? (picked ? rankOf(o.id) : '') : picked ? '✓' : ''}</span><span class="po-text">${o.emoji ? esc(o.emoji) + ' ' : ''}${esc(o.text)}</span>${show && !p.anonymous && o.votes?.length ? pollVoterStack(o.votes) : ''}${show ? `<span class="po-pct">${pct}% <small>(${o.count || 0}${p.ranked ? ' first' : ''})</small></span>` : ''}</button>`;
    }).join('')}
    ${p.ranked && !ended && voted ? `<button class="btn btn-link btn-sm" data-poll-clear="${esc(m.id)}">Clear my ranking</button>` : ''}
    ${p.ranked && ended && p.rounds?.length > 1 ? `<details class="poll-rounds"><summary>How the runoff went (${p.rounds.length} rounds)</summary>${p.rounds.map((r, i) => `<div><b>Round ${i + 1}:</b> ${Object.entries(r).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(p.options.find(o => o.id === id)?.text || '?')} ${n}`).join(' · ')}</div>`).join('')}</details>` : ''}
    <div class="poll-foot">${total} ${p.ranked ? 'ballot' : 'vote'}${total === 1 ? '' : 's'} · ${ended ? 'Final results' : leftText}${!show ? (p.blind ? ' · results when it ends' : ' · vote to see results') : ''}</div>
    ${pollExtras(m)}</div>`;
};
function pollExtras(m) {
  const p = m.poll;
  if (pollEndedNow(p)) return '';
  const mod = p.by === state.me.id || m.authorId === state.me.id || (isChannelConv(activeConv()) && (currentChannel()?.perms || []).includes('manage_messages'));
  return `<div class="poll-extras">${p.open || mod ? `<form class="poll-add" data-poll-add="${esc(m.id)}"><input maxlength="55" placeholder="Add an answer"><button class="btn btn-grey btn-sm">Add</button></form>` : ''}${mod ? `<button class="btn btn-link btn-sm poll-end" data-poll-end="${esc(m.id)}">End poll now</button>` : ''}</div>`;
}
async function pollAction(msgId, body) {
  const conv = activeConv();
  try {
    const r = await api('POST', `${convBase(conv)}/messages/${msgId}/poll`, body);
    const m = state.convos[conv]?.messages.find(x => x.id === r.message.id);
    if (m) Object.assign(m, r.message);
    if (r.mine) state.pollMine[msgId] = r.mine;
    renderMessages();
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-vote2]');
  if (b) {
    const m = state.convos[activeConv()]?.messages.find(x => x.id === b.dataset.msg);
    if (!m) return;
    const p = m.poll, id = b.dataset.vote2;
    let mine = [...(state.pollMine[m.id] || [])];
    if (p.ranked) mine = mine.includes(id) ? mine.filter(x => x !== id) : [...mine, id];
    else if (p.multi) mine = mine.includes(id) ? mine.filter(x => x !== id) : [...mine, id];
    else mine = mine.includes(id) ? [] : [id];
    b.disabled = true;
    pollAction(m.id, { action: 'vote', options: mine });
    return;
  }
  const c = e.target.closest?.('[data-poll-clear]');
  if (c) return pollAction(c.dataset.pollClear, { action: 'vote', options: [] });
  const end = e.target.closest?.('[data-poll-end]');
  if (end) confirmDialog('End this poll now?', 'Voting stops and Zuno posts the result.', 'End Poll', () => pollAction(end.dataset.pollEnd, { action: 'end' }));
});
document.addEventListener('submit', async e => {
  const f = e.target.closest?.('[data-poll-add]');
  if (!f) return;
  e.preventDefault();
  const input = $('input', f), text = input.value.trim();
  if (text && await pollAction(f.dataset.pollAdd, { action: 'add', text })) toast('Answer added');
});
// The poll maker: extra switches and lengths.
const _openPollMaker27 = openPollMaker;
openPollMaker = function (conv) {
  _openPollMaker27(conv);
  const f = $('#layer .poll-maker');
  if (!f) return;
  f.hours.innerHTML = POLL_LENS.map(([v, l]) => `<option value="${v}"${v === 24 ? ' selected' : ''}>${l}</option>`).join('');
  const sw = (name, title, desc) => `<label class="setting-row pm-multi"><div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div><input type="checkbox" class="switch" name="${name}"></label>`;
  $('.pm-row', f).insertAdjacentHTML('afterend', `<div class="pm-more">${sw('ranked', 'Ranked choice', 'People put the answers in order. The winner is found by instant runoff.')}${sw('anonymous', 'Anonymous', 'Nobody can see who voted for what. Not even you.')}${sw('blind', 'Hide results until it ends', 'Stops people following the crowd.')}${sw('open', 'Let everyone add answers', 'Anyone who can vote can add an answer.')}</div>`);
  f.ranked.addEventListener('change', () => { if (f.ranked.checked) f.multi.checked = false; f.multi.disabled = f.ranked.checked; });
  // Replace the old submit with one that sends the new options too.
  const fresh = f.cloneNode(true);
  f.replaceWith(fresh);
  const g = fresh;
  g.ranked.addEventListener('change', () => { if (g.ranked.checked) g.multi.checked = false; g.multi.disabled = g.ranked.checked; });
  $('[data-a=cancel]', g).addEventListener('click', dismissLayer);
  const list = $('#pm-opts', g);
  const add = (v = '') => {
    if ($$('.pm-opt', list).length >= 10) return toast('Polls can start with up to 10 answers.', true);
    const row = document.createElement('div');
    row.className = 'copy-row pm-opt';
    row.innerHTML = `<input maxlength="55" placeholder="Answer ${$$('.pm-opt', list).length + 1}" value="${esc(v)}"><button type="button" class="icon-btn" title="Remove">✕</button>`;
    $('button', row).addEventListener('click', () => { if ($$('.pm-opt', list).length > 2) row.remove(); });
    list.appendChild(row);
    return row;
  };
  for (const row of $$('.pm-opt', list)) $('button', row).addEventListener('click', () => { if ($$('.pm-opt', list).length > 2) row.remove(); });
  $('#pm-add', g).addEventListener('click', () => $('input', add())?.focus());
  g.q.focus();
  g.addEventListener('submit', async e => {
    e.preventDefault();
    const options = $$('.pm-opt input', g).map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) return toast('Add at least 2 answers.', true);
    try {
      const { message } = await api('POST', `${convBase(conv)}/messages`, { content: '', poll: { question: g.q.value, options, hours: Number(g.hours.value), multi: g.multi.checked, ranked: g.ranked.checked, anonymous: g.anonymous.checked, blind: g.blind.checked, open: g.open.checked } });
      addSentMessage(conv, message);
      closeLayer();
    } catch (err) { toast(err.message, true); }
  });
};

// ======================= the pin board =======================
// "Open board" in the pins pop-up: every pin as a card, with filters (pictures, links, files,
// polls, who pinned it), search and sort. Click a card to jump to the message.
const _openPins27 = openPins;
openPins = async function (anchor, ...a) {
  const r = await _openPins27(anchor, ...a);
  const box = $('#layer .pins-pop');
  if (box && !$('.pins-board-btn', box)) {
    const b = document.createElement('button');
    b.className = 'btn btn-grey btn-sm pins-board-btn'; b.textContent = 'Open board';
    $('.pop-head', box)?.append(b);
    b.addEventListener('click', () => openPinBoard());
  }
  return r;
};
async function openPinBoard() {
  const conv = activeConv();
  let pins = [];
  try { const r = await api('GET', `${convBase(conv)}/pins`); pins = r.pins; for (const u of r.authors) state.users[u.id] = { ...u, ...state.users[u.id] }; } catch (e) { return toast(e.message, true); }
  const can = canPinHere();
  const kindOf = m => (m.attachments?.some(x => x.kind === 'image' || x.kind === 'video') || m.gif ? 'media' : m.poll ? 'poll' : m.attachments?.length ? 'file' : /https?:\/\//.test(m.content || '') ? 'link' : 'text');
  const people = [...new Set(pins.map(m => m.authorId))].map(id => user(id)).filter(Boolean);
  let f = { kind: 'all', who: '', q: '', sort: 'new' };
  const ov = openLayer(`<div class="dialog modal pin-board"><div class="pb-head"><h3>📌 Pin Board</h3><span class="muted small">${pins.length} pinned</span></div>
    <div class="pb-filters"><div class="seg">${[['all', 'All'], ['text', 'Messages'], ['media', 'Pictures & videos'], ['link', 'Links'], ['file', 'Files'], ['poll', 'Polls']].map(([k, l]) => `<button data-kind="${k}" class="${k === 'all' ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="pb-q" placeholder="Search pins" maxlength="60">
      <select class="sc-select pb-who"><option value="">Anyone</option>${people.map(u => `<option value="${esc(u.id)}">${esc(u.displayName)}</option>`).join('')}</select>
      <select class="sc-select pb-sort"><option value="new">Newest pins</option><option value="old">Oldest pins</option></select></div>
    <div class="pb-grid"></div>
    <div class="actions"><button class="btn btn-primary" data-a="done">Done</button></div></div>`);
  const grid = $('.pb-grid', ov);
  const draw = () => {
    let list = pins.filter(m => (f.kind === 'all' || kindOf(m) === f.kind) && (!f.who || m.authorId === f.who) && (!f.q || (m.content || '').toLowerCase().includes(f.q) || (m.poll?.question || '').toLowerCase().includes(f.q)));
    list = list.sort((a, b) => (f.sort === 'new' ? (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt) : (a.pinnedAt || a.createdAt) - (b.pinnedAt || b.createdAt)));
    grid.innerHTML = list.map(m => {
      const a = user(m.authorId) || { displayName: 'Someone' };
      const img = m.attachments?.find(x => x.kind === 'image');
      const pic = img ? `<img class="pb-img" src="${esc(img.thumb || img.url)}" alt="" loading="lazy">` : m.gif ? `<img class="pb-img" src="${esc(m.gif.url)}" alt="" loading="lazy">` : '';
      return `<div class="pb-card" data-jump-pin="${esc(m.id)}">${pic}<div class="pb-body"><div class="pb-who">${avatar(a, 20)}<b>${esc(a.displayName)}</b><span class="muted small">${fmtTime(m.createdAt)}</span></div>
        ${m.content ? `<div class="pb-text">${formatMessage(m.content.slice(0, 400))}</div>` : m.poll ? `<div class="pb-text">📊 ${esc(m.poll.question)}</div>` : m.attachments?.length && !img ? `<div class="pb-text">📎 ${esc(m.attachments.map(x => x.name).join(', '))}</div>` : ''}
        <div class="pb-foot"><span class="muted small">Pinned ${m.pinnedBy ? `by ${esc(user(m.pinnedBy)?.displayName || 'someone')} ` : ''}${m.pinnedAt ? fmtTime(m.pinnedAt) : ''}</span>${can ? `<button class="btn btn-link btn-sm" data-unpin-board="${esc(m.id)}">Unpin</button>` : ''}</div></div></div>`;
    }).join('') || `<div class="fp-empty">${mascot('curious')}<div>${pins.length ? 'No pins match.' : 'Nothing pinned here yet.'}</div></div>`;
  };
  draw();
  for (const b of $$('[data-kind]', ov)) b.addEventListener('click', () => { f.kind = b.dataset.kind; $$('[data-kind]', ov).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('.pb-q', ov).addEventListener('input', e => { f.q = e.target.value.trim().toLowerCase(); draw(); });
  $('.pb-who', ov).addEventListener('change', e => { f.who = e.target.value; draw(); });
  $('.pb-sort', ov).addEventListener('change', e => { f.sort = e.target.value; draw(); });
  grid.addEventListener('click', async e => {
    const un = e.target.closest('[data-unpin-board]');
    if (un) { e.stopPropagation(); await togglePin(un.dataset.unpinBoard, false); pins = pins.filter(m => m.id !== un.dataset.unpinBoard); return draw(); }
    if (e.target.closest('a, button, .spoiler')) return;
    const card = e.target.closest('[data-jump-pin]');
    if (card) { closeLayer(); jumpToAny(conv, card.dataset.jumpPin); }
  });
  $('[data-a=done]', ov).addEventListener('click', dismissLayer);
}

// ======================= voice channel games =======================
// ▶ in a call: Wordle Race, Trivia Night and Connect Four, next to Listen/Watch Together.
let game = null, gameRoom = null, gameTick = null;
const GAME_NAMES = { wordle: 'Wordle Race', trivia: 'Trivia Night', connect4: 'Connect Four', tictactoe: 'Tic-Tac-Toe', hangman: 'Hangman', reaction: 'Reaction Race', math: 'Quick Math', scramble: 'Word Scramble', rps: 'Rock Paper Scissors' };
// One menu for everything you can do together in a call. A running Listen/Watch Together no longer
// hides the games (and a running game no longer hides Listen/Watch Together).
window.openActivities = function (anchor) {
  if (!Calls.room) return toast('Join a call first.', true);
  const listening = activity && activityRoom === Calls.room;
  const playing = game && gameRoom === Calls.room && !game.over;
  openMenu(anchor, [
    listening ? { label: `${activity.type === 'watch' ? '🎬 Show Watch Together' : '🎧 Show Listen Together'}`, run: () => showActivityPanel() }
      : { label: '🎧 Listen Together (free)', run: () => startActivity('listen') },
    ...(listening ? [] : [{ label: `🎬 Watch Together${hasBloomNow() ? '' : ' (Bloom)'}`, run: () => (hasBloomNow() ? startActivity('watch') : confirmDialog('Watch Together is a Bloom perk', 'Watch YouTube in sync with everyone in your call. Listen Together is free for everyone.', 'See Zuno Bloom', () => openSettings('bloom'))) }]),
    ...(window.watchUploadedEntry ? [window.watchUploadedEntry()] : []),
    'sep',
    ...(playing ? [{ label: `🎮 Show ${GAME_NAMES[game.type]}`, run: () => { $('#game-panel')?.classList.remove('min'); showGamePanel(); } }] : []),
    { label: '🟩 Wordle Race', desc: 'Same word for everyone. Who gets it first?', run: () => startGame('wordle') },
    { label: '❓ Trivia Night', desc: '8 quick questions, points for speed', run: () => startGame('trivia') },
    { label: '🔴 Connect Four', desc: 'Two players, everyone else watches', run: () => startGame('connect4') },
    { label: '❌ Tic-Tac-Toe', desc: 'A quick one for two', run: () => startGame('tictactoe') },
    { label: '🪢 Hangman', desc: 'Everyone guesses letters together', run: () => startGame('hangman') },
    { label: '⚡ Reaction Race', desc: 'Click when it turns green. 5 rounds', run: () => startGame('reaction') },
    { label: '➗ Quick Math', desc: 'First to answer each sum scores. 10 rounds', run: () => startGame('math') },
    { label: '🔤 Word Scramble', desc: 'Unscramble the word before anyone else', run: () => startGame('scramble') },
    { label: '✊ Rock Paper Scissors', desc: 'Everyone picks at once. 5 rounds', run: () => startGame('rps') },
  ].filter(Boolean));
};
async function startGame(type) {
  try { const { game: g } = await api('POST', '/api/games/start', { room: Calls.room, type }); onGame({ room: Calls.room, game: g }); }
  catch (e) { toast(e.message, true); }
}
// One move at a time: pressing Enter twice quickly used to send the same guess twice.
let gameMoving = false;
async function gameMove(body) {
  if (gameMoving) return false;
  gameMoving = true;
  try { const { game: g } = await api('POST', '/api/games/move', { room: gameRoom, ...body }); onGame({ room: gameRoom, game: g }); return true; }
  catch (e) { toast(e.message, true); return false; }
  finally { gameMoving = false; }
}
function onGame({ room, game: g }) {
  if (room !== Calls.room) return;
  const was = game;
  if (g) g.receivedAt = Date.now();
  game = g; gameRoom = room;
  if (!g) { $('#game-panel')?.remove(); clearInterval(gameTick); if (was && !was.over) toast(`${GAME_NAMES[was.type]} ended.`); return; }
  if (!was || was.id !== g.id) { wordleDraft = ''; if (g.hostId !== state.me.id && (!was || was.id !== g.id)) toast(`${user(g.hostId)?.displayName || 'Someone'} started ${GAME_NAMES[g.type]}!`); }
  showGamePanel();
}
onLive26('game', onGame);
setInterval(() => { if (game && gameRoom !== Calls.room) { game = null; $('#game-panel')?.remove(); } }, 1500);

let wordleDraft = '';
function showGamePanel() {
  const g = game;
  if (!g) return;
  let panel = $('#game-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'game-panel'; panel.tabIndex = 0;
    panel.innerHTML = `<div class="ap-head"><b class="gp-title"></b><button class="icon-btn" data-gp="min" title="Make smaller">▁</button><button class="icon-btn" data-gp="stop" title="End for everyone">✕</button></div><div class="gp-body"></div>`;
    document.body.appendChild(panel);
    $('[data-gp=min]', panel).addEventListener('click', () => panel.classList.toggle('min'));
    // Ending closes it here straight away, even if the server can't be reached or your call dropped.
    $('[data-gp=stop]', panel).addEventListener('click', () => confirmDialog('End the game?', 'It ends for everyone in the call.', 'End Game', async () => {
      const room = gameRoom;
      try { await api('POST', '/api/games/stop', { room }); } catch (e) { if (!/call first/i.test(e.message)) toast(e.message, true); }
      game = null; clearInterval(gameTick); $('#game-panel')?.remove();
    }));
  }
  panel.className = `activity-panel game-panel gp-${g.type}${panel.classList.contains('min') ? ' min' : ''}`;
  $('.gp-title', panel).textContent = GAME_NAMES[g.type];
  const body = $('.gp-body', panel);
  clearInterval(gameTick);
  if (g.type === 'wordle') body.innerHTML = wordleHtml(g);
  if (g.type === 'trivia') { body.innerHTML = triviaHtml(g); const tick = () => { const t = $('.tv-timer i', panel); if (!t || !game?.phaseEnds) return; const left = game.phaseEnds - game.now - (Date.now() - game.receivedAt); t.style.width = Math.max(0, Math.min(100, left / (game.phase === 'ask' ? 150 : 50))) + '%'; }; tick(); gameTick = setInterval(tick, 200); }
  if (g.type === 'connect4') body.innerHTML = c4Html(g);
  if (g.type === 'tictactoe') body.innerHTML = tttHtml(g);
  if (g.type === 'hangman') body.innerHTML = hangmanHtml(g);
  if (g.type === 'reaction') body.innerHTML = reactionHtml(g);
  if (g.type === 'math' || g.type === 'scramble') {
    const typed = $('[data-qk-in]', body)?.value || '', had = document.activeElement?.matches?.('[data-qk-in]');
    body.innerHTML = quickHtml(g);
    const inp = $('[data-qk-in]', body);
    const free = !document.activeElement || document.activeElement === document.body;
    if (inp && g.round === body._qkRound) inp.value = typed;
    if (inp && (had || free) && innerWidth > 760) inp.focus({ preventScroll: true });
    body._qkRound = g.round;
    const tick = () => { const t = $('.tv-timer i', panel); if (!t || !game?.phaseEnds) return; const left = game.phaseEnds - game.now - (Date.now() - game.receivedAt); t.style.width = Math.max(0, Math.min(100, left / (game.phase === 'ask' ? (game.type === 'math' ? 120 : 250) : 30))) + '%'; };
    tick(); gameTick = setInterval(tick, 200);
  }
  if (g.type === 'rps') { body.innerHTML = rpsHtml(g); const tick = () => { const t = $('.tv-timer i', panel); if (!t || !game?.phaseEnds) return; const left = game.phaseEnds - game.now - (Date.now() - game.receivedAt); t.style.width = Math.max(0, Math.min(100, left / (game.phase === 'pick' ? 120 : 35))) + '%'; }; tick(); gameTick = setInterval(tick, 200); }
  body.insertAdjacentHTML('beforeend', tonightHtml(g));
  wireGame(panel);
  placeGamePanel();
}
// Listen/Watch Together and a game can be open at once: put the game next to it instead of on top.
function placeGamePanel() {
  const panel = $('#game-panel'), other = $('.activity-panel:not(.game-panel)');
  if (!panel) return;
  panel.classList.toggle('gp-beside', !!other && innerWidth > 760);
  if (other && innerWidth > 760) panel.style.setProperty('--gp-right', `${Math.round(innerWidth - other.getBoundingClientRect().left + 12)}px`);
}
// Typing plays Wordle while the board is open, unless you're typing somewhere else (like the chat).
// (The board used to grab the keyboard focus on every update, which stole it from the message box.)
document.addEventListener('keydown', e => {
  if (game?.type !== 'wordle' || !$('#game-panel') || $('#game-panel').classList.contains('min')) return;
  if (e.ctrlKey || e.metaKey || e.altKey || $('#layer')?.childElementCount) return; // a dialog or menu is open
  const t = e.target;
  if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
  if (wordleKey(e.key)) e.preventDefault();
});
// Hangman takes typed letters, and Reaction Race takes the space bar, the same way.
document.addEventListener('keydown', e => {
  if (!['hangman', 'reaction'].includes(game?.type) || game.over || !$('#game-panel') || $('#game-panel').classList.contains('min')) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || $('#layer')?.childElementCount) return;
  if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (game.type === 'hangman' && /^[a-z]$/i.test(e.key) && !game.guessed.includes(e.key.toLowerCase())) { e.preventDefault(); gameMove({ letter: e.key.toLowerCase() }); }
  if (game.type === 'reaction' && e.key === ' ' && (game.phase === 'go' || game.phase === 'wait') && game.mine == null) { e.preventDefault(); gameMove({}); }
});
// ---- Wordle Race
const WORDLE_KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function wordleHtml(g) {
  const meP = g.players.find(p => p.id === state.me.id) || { rows: [], done: false };
  // Only the row you just guessed flips over.
  const flipRow = meP.rows.length > (wordleHtml.seen?.[g.id] || 0) ? meP.rows.length - 1 : -1;
  (wordleHtml.seen ||= {})[g.id] = meP.rows.length;
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const r = meP.rows[i];
    const letters = r ? r.word : i === meP.rows.length && !meP.done ? wordleDraft.padEnd(5) : '     ';
    rows.push(`<div class="wd-row${i === meP.rows.length && !meP.done ? ' cur' : ''}${i === flipRow ? ' flip' : ''}">${[...letters].map((ch, k) => `<span class="wd-cell ${r ? r.marks[k] : ch.trim() ? 'typed' : ''}">${esc(ch.trim().toUpperCase())}</span>`).join('')}</div>`);
  }
  const keyState = {};
  for (const r of meP.rows) [...r.word].forEach((ch, k) => { const m = r.marks[k]; if (keyState[ch] !== 'hit') keyState[ch] = m === 'hit' ? 'hit' : m === 'near' || keyState[ch] === 'near' ? 'near' : 'miss'; });
  const others = g.players.filter(p => p.id !== state.me.id);
  return `<div class="wd-wrap"><div class="wd-board">${rows.join('')}</div>
    ${g.over ? `<div class="wd-word">The word was <b>${esc((g.word || '').toUpperCase())}</b></div>` : meP.done ? `<div class="wd-word">${meP.won ? `🎉 Got it in ${meP.rows.length}!` : 'Out of tries!'} Waiting for the others…</div>` : ''}
    ${meP.done || g.over ? '' : `<div class="wd-keys">${WORDLE_KEYS.map((row, i) => `<div>${i === 2 ? '<button data-wk="Enter" class="wide">Enter</button>' : ''}${[...row].map(k => `<button data-wk="${k}" class="${keyState[k] || ''}">${k.toUpperCase()}</button>`).join('')}${i === 2 ? '<button data-wk="Backspace" class="wide">⌫</button>' : ''}</div>`).join('')}</div>`}
    ${others.length ? `<div class="wd-others">${others.map(p => { const u = user(p.id) || { displayName: '?' }; return `<div class="wd-other">${avatar(u, 22)}<span>${esc(u.displayName)}</span><div class="wd-mini">${p.rows.map(r => `<i>${r.marks.map(m => `<b class="${m}"></b>`).join('')}</i>`).join('')}</div>${p.done ? (p.won ? `<em>✓ ${p.rows.length}/6</em>` : '<em>X/6</em>') : ''}</div>`; }).join('')}</div>` : '<div class="muted small wd-solo">Everyone in the call gets the same word. Share the race!</div>'}
    ${g.over ? '<button class="btn btn-primary btn-sm" data-gp-again="wordle">Play again</button>' : ''}</div>`;
}
function wordleKey(k) {
  const g = game, meP = g?.players.find(p => p.id === state.me.id);
  if (!g || g.over || meP?.done) return false;
  if (/^[a-z]$/i.test(k)) { if (wordleDraft.length < 5) wordleDraft += k.toLowerCase(); }
  else if (k === 'Backspace') wordleDraft = wordleDraft.slice(0, -1);
  else if (k === 'Enter') {
    if (wordleDraft.length < 5) { toast('Not enough letters'); return true; }
    const guess = wordleDraft;
    gameMove({ guess }).then(ok => { if (ok) wordleDraft = ''; showGamePanel(); });
    return true;
  } else return false;
  showGamePanel();
  return true;
}
// ---- Trivia Night
function triviaHtml(g) {
  if (g.over) {
    const board = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
    return `<div class="tv-wrap"><div class="tv-q">🏆 Final scores</div>${board.length ? board.map(([id, s], i) => `<div class="tv-score">${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${avatar(user(id) || { displayName: '?' }, 22)}<b>${esc(user(id)?.displayName || 'Someone')}</b><span>${s}</span></div>`).join('') : '<div class="muted">Nobody scored. Rematch?</div>'}
      <button class="btn btn-primary btn-sm" data-gp-again="trivia">Play again</button></div>`;
  }
  const q = g.question;
  const reveal = g.phase === 'reveal';
  return `<div class="tv-wrap"><div class="tv-top"><span class="muted small">Question ${g.round + 1} of ${g.rounds}</span><span class="muted small">${g.answered.length} answered</span></div>
    <div class="tv-timer"><i></i></div>
    <div class="tv-q">${esc(q.text)}</div>
    <div class="tv-answers">${q.answers.map((a, i) => `<button data-tv="${i}" class="${g.mine === i ? 'mine' : ''}${reveal ? (i === q.right ? ' right' : g.mine === i ? ' wrong' : '') : ''}"${reveal || g.mine !== null ? ' disabled' : ''}>${esc(a)}${reveal ? `<small>${Object.values(g.picks || {}).filter(p => p === i).length || ''}</small>` : ''}</button>`).join('')}</div>
    <div class="tv-mini">${Object.entries(g.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, s]) => `<span>${esc(user(id)?.displayName || '?')} <b>${s}</b></span>`).join('')}</div></div>`;
}
// ---- Connect Four
function c4Html(g) {
  const [p1, p2] = g.players;
  const name = id => (id ? esc(user(id)?.displayName || 'Someone') : 'Anyone');
  const myMark = g.players.indexOf(state.me.id) + 1;
  const status = g.over ? (g.forfeit ? `${name(g.forfeit)} left the call${g.winner ? `, so ${name(g.winner)} wins` : ''}.` : g.winner ? `🎉 ${name(g.winner)} wins!` : "It's a draw!") : !p2 && myMark !== 1 ? 'Drop a piece to play against ' + name(p1) : g.turn === myMark ? 'Your turn' : `${name(g.players[g.turn - 1])}'s turn`;
  const win = new Set((g.line || []).map(([r, c]) => r + ',' + c));
  return `<div class="c4-wrap"><div class="c4-players"><span class="c4-p one">${name(p1)}</span><span class="muted">vs</span><span class="c4-p two">${name(p2)}</span></div>
    <div class="c4-status">${status}</div>
    <div class="c4-board">${[0, 1, 2, 3, 4, 5, 6].map(c => `<button class="c4-col" data-c4="${c}"${g.over ? ' disabled' : ''}>${g.board.map((row, r) => `<i class="c4-cell p${row[c]}${win.has(r + ',' + c) ? ' win' : ''}${g.last?.[0] === r && g.last?.[1] === c ? ' drop' : ''}"></i>`).join('')}</button>`).join('')}</div>
    ${g.over ? '<button class="btn btn-primary btn-sm" data-gp-again="connect4">Rematch</button>' : ''}</div>`;
}
// ---- Tic-Tac-Toe
function tttHtml(g) {
  const [p1, p2] = g.players;
  const name = id => (id ? esc(user(id)?.displayName || 'Someone') : 'Anyone');
  const myMark = g.players.indexOf(state.me.id) + 1;
  const status = g.over ? (g.forfeit ? `${name(g.forfeit)} left the call${g.winner ? `, so ${name(g.winner)} wins` : ''}.` : g.winner ? `🎉 ${name(g.winner)} wins!` : "It's a draw!") : !p2 && myMark !== 1 ? 'Tap a square to play against ' + name(p1) : !p2 && g.turn === 2 ? 'Waiting for someone to play ◯' : g.turn === myMark ? 'Your turn' : `${name(g.players[g.turn - 1])}'s turn`;
  const win = new Set(g.line || []);
  return `<div class="ttt-wrap"><div class="c4-players"><span class="c4-p one">✕ ${name(p1)}</span><span class="muted">vs</span><span class="c4-p two">◯ ${name(p2)}</span></div>
    <div class="c4-status">${status}</div>
    <div class="ttt-board">${g.board.map((v, i) => `<button class="ttt-cell p${v}${win.has(i) ? ' win' : ''}" data-ttt="${i}"${g.over || v ? ' disabled' : ''}>${v === 1 ? '✕' : v === 2 ? '◯' : ''}</button>`).join('')}</div>
    ${g.over ? '<button class="btn btn-primary btn-sm" data-gp-again="tictactoe">Rematch</button>' : ''}</div>`;
}
// ---- Hangman (everyone together)
function hangmanHtml(g) {
  const lives = g.maxWrong - g.wrong;
  const parts = ['head', 'body', 'arm-l', 'arm-r', 'leg-l', 'leg-r'].slice(0, g.wrong);
  return `<div class="hm-wrap">
    <div class="hm-top"><svg class="hm-art" viewBox="0 0 100 110" aria-hidden="true"><path d="M10 105h50M25 105V8h40v12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      ${parts.includes('head') ? '<circle cx="65" cy="30" r="10" fill="none" stroke="currentColor" stroke-width="4"/>' : ''}${parts.includes('body') ? '<path d="M65 40v30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}
      ${parts.includes('arm-l') ? '<path d="M65 48l-13 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}${parts.includes('arm-r') ? '<path d="M65 48l13 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}
      ${parts.includes('leg-l') ? '<path d="M65 70l-11 16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}${parts.includes('leg-r') ? '<path d="M65 70l11 16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ''}</svg>
      <div class="hm-lives">${'❤️'.repeat(Math.max(0, lives))}${'🖤'.repeat(g.wrong)}<div class="muted small">${g.over ? (g.won ? '🎉 You got it together!' : 'Out of lives!') : 'Guess the phrase together'}</div></div></div>
    <div class="hm-word">${[...(g.over ? g.word : g.shown)].map(ch => (ch === ' ' ? '<i class="sp"></i>' : `<b class="${ch === '_' ? 'blank' : ''}">${ch === '_' ? '' : esc(ch.toUpperCase())}</b>`)).join('')}</div>
    ${g.over ? '<button class="btn btn-primary btn-sm" data-gp-again="hangman">New phrase</button>' : `<div class="wd-keys hm-keys">${WORDLE_KEYS.map(row => `<div>${[...row].map(k => { const used = g.guessed.includes(k); const hit = used && g.shown.includes(k); return `<button data-hm="${k}" class="${used ? (hit ? 'hit' : 'miss') : ''}"${used ? ' disabled' : ''} title="${used ? `${esc(user(g.by[k])?.displayName || 'Someone')} tried it` : ''}">${k.toUpperCase()}</button>`; }).join('')}</div>`).join('')}</div>`}
  </div>`;
}
// ---- Reaction Race
function reactionHtml(g) {
  const name = id => esc(user(id)?.displayName || 'Someone');
  if (g.over) {
    const board = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
    return `<div class="tv-wrap"><div class="tv-q">⚡ Final scores</div>${board.length ? board.map(([id, s], i) => `<div class="tv-score">${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${avatar(user(id) || { displayName: '?' }, 22)}<b>${name(id)}</b><span>${s}</span></div>`).join('') : '<div class="muted">Nobody was fast enough!</div>'}
      <button class="btn btn-primary btn-sm" data-gp-again="reaction">Play again</button></div>`;
  }
  const mine = g.mine;
  const pad = g.phase === 'go' ? (mine == null ? 'go' : 'done') : g.phase === 'wait' ? (mine === 'early' ? 'early' : 'wait') : 'result';
  const label = { wait: 'Wait for green…', go: 'CLICK!', early: 'Too early! 😬', done: `${mine} ms`, result: g.last?.winner ? `${name(g.last.winner)} was fastest` : 'Nobody clicked in time' }[pad];
  const times = g.phase === 'result' && g.last ? Object.entries(g.last.times).sort((a, b) => (a[1] === 'early') - (b[1] === 'early') || a[1] - b[1]).map(([id, t]) => `<span>${name(id)} <b>${t === 'early' ? 'early' : t + ' ms'}</b></span>`).join('') : '';
  return `<div class="rx-wrap"><div class="tv-top"><span class="muted small">Round ${Math.min(g.round + 1, g.rounds)} of ${g.rounds}</span></div>
    <button class="rx-pad ${pad}" data-rx-go${pad === 'go' || pad === 'wait' ? '' : ' disabled'}>${label}</button>
    ${times ? `<div class="tv-mini">${times}</div>` : ''}
    <div class="tv-mini">${Object.entries(g.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, s]) => `<span>${name(id)} <b>${s}</b></span>`).join('')}</div></div>`;
}
// ---- Quick Math and Word Scramble (0.44)
function scoreBoard44(g) {
  const name = id => esc(user(id)?.displayName || 'Someone');
  const board = Object.entries(g.scores || {}).sort((a, b) => b[1] - a[1]);
  return board.length ? board.map(([id, s], i) => `<div class="tv-score">${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${avatar(user(id) || { displayName: '?' }, 22)}<b>${name(id)}</b><span>${s}</span></div>`).join('') : '<div class="muted">Nobody scored!</div>';
}
function quickHtml(g) {
  const name = id => esc(user(id)?.displayName || 'Someone');
  if (g.over) return `<div class="tv-wrap"><div class="tv-q">${g.type === 'math' ? '➗' : '🔤'} Final scores</div>${scoreBoard44(g)}<button class="btn btn-primary btn-sm" data-gp-again="${g.type}">Play again</button></div>`;
  const reveal = g.phase !== 'ask';
  return `<div class="tv-wrap qk-wrap"><div class="tv-top"><span class="muted small">${g.type === 'math' ? 'Sum' : 'Word'} ${g.round + 1} of ${g.rounds}</span></div>
    <div class="tv-timer"><i></i></div>
    <div class="qk-q${g.type === 'scramble' ? ' scr' : ''}">${esc(g.question || '')}${g.type === 'math' ? ' = ?' : ''}</div>
    ${reveal ? `<div class="qk-res">${g.solvedBy ? `<b>${name(g.solvedBy)}</b> got it: ` : "Time's up! It was "}<b class="qk-ans">${esc(String(g.answer || '').toUpperCase())}</b></div>`
      : `<form class="qk-form" data-qk><input data-qk-in class="input" autocomplete="off" maxlength="20" inputmode="${g.type === 'math' ? 'numeric' : 'text'}" placeholder="${g.type === 'math' ? 'Your answer' : 'Unscrambled word'}"><button class="btn btn-primary btn-sm">Go</button></form>${g.tries ? `<div class="muted small">${5 - g.tries} tries left</div>` : ''}`}
    <div class="tv-mini">${Object.entries(g.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, s]) => `<span>${name(id)} <b>${s}</b></span>`).join('')}</div></div>`;
}
// ---- Rock Paper Scissors (0.44)
const RPS44 = { rock: '✊', paper: '✋', scissors: '✌️' };
function rpsHtml(g) {
  const name = id => esc(user(id)?.displayName || 'Someone');
  if (g.over) return `<div class="tv-wrap"><div class="tv-q">✊ Final scores</div>${scoreBoard44(g)}<button class="btn btn-primary btn-sm" data-gp-again="rps">Play again</button></div>`;
  const reveal = g.phase === 'reveal' && g.last;
  return `<div class="tv-wrap rps-wrap"><div class="tv-top"><span class="muted small">Round ${g.round + 1} of ${g.rounds}</span></div>
    <div class="tv-timer"><i></i></div>
    ${reveal ? `<div class="rps-reveal">${Object.entries(g.last.picks).map(([id, p]) => `<div class="rps-pick">${avatar(user(id) || { displayName: '?' }, 26)}<span class="rps-ic">${RPS44[p]}</span><b>${name(id)}</b><i>+${g.last.pts[id] || 0}</i></div>`).join('') || '<div class="muted">Nobody picked!</div>'}</div>`
      : `<div class="rps-row">${Object.entries(RPS44).map(([k, ic]) => `<button class="rps-btn${g.mine === k ? ' on' : ''}" data-rps="${k}"${g.mine ? ' disabled' : ''} title="${k}">${ic}</button>`).join('')}</div>
         <div class="muted small">${g.mine ? 'Waiting for everyone…' : 'Pick one!'} ${g.picked.length ? `(${g.picked.length} picked)` : ''}</div>`}
    <div class="tv-mini">${Object.entries(g.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, s]) => `<span>${name(id)} <b>${s}</b></span>`).join('')}</div></div>`;
}
// ---- Tonight's scoreboard: wins across every game in this call
function tonightHtml(g) {
  const t = g.tonight;
  if (!t || !t.board.length) return '';
  return `<details class="gp-tonight"${g.over ? ' open' : ''}><summary>🏆 Tonight · ${t.games} game${t.games === 1 ? '' : 's'}</summary>
    ${t.board.map((r, i) => `<div class="gp-tn-row">${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${avatar(user(r.id) || { displayName: '?' }, 20)}<b>${esc(user(r.id)?.displayName || 'Someone')}</b><span>${r.wins} win${r.wins === 1 ? '' : 's'}</span></div>`).join('')}</details>`;
}
function wireGame(panel) {
  for (const b of $$('[data-ttt]', panel)) b.addEventListener('click', () => gameMove({ cell: Number(b.dataset.ttt) }));
  for (const b of $$('[data-hm]', panel)) b.addEventListener('click', () => gameMove({ letter: b.dataset.hm }));
  $('[data-rx-go]', panel)?.addEventListener('pointerdown', () => gameMove({}));
  for (const b of $$('[data-wk]', panel)) b.addEventListener('click', () => wordleKey(b.dataset.wk));
  for (const b of $$('[data-tv]', panel)) b.addEventListener('click', () => gameMove({ pick: Number(b.dataset.tv) }));
  for (const b of $$('[data-c4]', panel)) b.addEventListener('click', () => gameMove({ col: Number(b.dataset.c4) }));
  for (const b of $$('[data-gp-again]', panel)) b.addEventListener('click', () => startGame(b.dataset.gpAgain));
  for (const b of $$('[data-rps]', panel)) b.addEventListener('click', () => gameMove({ pick: b.dataset.rps }));
  $('[data-qk]', panel)?.addEventListener('submit', async e => {
    e.preventDefault();
    const inp = $('[data-qk-in]', panel), answer = inp.value.trim();
    if (!answer) return;
    inp.value = '';
    try { const r = await api('POST', '/api/games/move', { room: gameRoom, answer }); if (!r.right) { inp.classList.remove('qk-wrong'); void inp.offsetWidth; inp.classList.add('qk-wrong'); } onGame({ room: gameRoom, game: r.game }); }
    catch (err) { toast(err.message, true); }
  });
}

// ======================= Discover: categories & trending =======================
// With no search and "All" picked, Discover shows Trending this week, New & rising, and a row for
// each category (with "See all"). Picking a category or searching shows the grid as before.
const _loadDiscover27 = loadDiscover;
loadDiscover = async function () {
  await _loadDiscover27();
  const grid = $('#disc-grid');
  if (!grid || disc.q || disc.tag || disc.sorted) { $('#disc-home')?.remove(); grid?.classList.remove('hidden'); return; }
  let d;
  try { d = await api('GET', '/api/discover-home'); } catch { return; }
  $('#disc-home')?.remove();
  if (!d.trending.length && !d.categories.length) return;
  const trendTag = sv => (sv.trend?.joins ? `<span class="dc-trend">▲ ${sv.trend.joins} joined this week</span>` : sv.trend?.talkers ? `<span class="dc-trend">${sv.trend.talkers} chatting this week</span>` : '');
  const row = (title, list, tag = null) => list.length ? `<section class="dh-row"><div class="dh-row-head"><h3>${title}</h3>${tag ? `<button class="btn btn-link btn-sm" data-see="${esc(tag)}">See all</button>` : ''}</div>
    <div class="dh-strip">${list.map(sv => discoverCard(sv).replace('<div class="dc-stats">', `<div class="dc-stats">${trendTag(sv)}`)).join('')}</div></section>` : '';
  const home = document.createElement('div');
  home.id = 'disc-home';
  home.innerHTML = row('🔥 Trending this week', d.trending) + row('🌱 New & rising', d.rising) + d.categories.map(c => row(`${TAG_EMOJI[c.tag] || ''} ${esc(c.tag)}`, c.servers, c.tag)).join('');
  grid.classList.add('hidden');
  grid.before(home);
  $$('[data-disc]', home).forEach(c => c.addEventListener('click', () => openDiscoverServer(c.dataset.disc)));
  $$('[data-see]', home).forEach(b => b.addEventListener('click', () => { disc.tag = b.dataset.see; loadDiscover(); $('.discover')?.scrollTo?.({ top: 0, behavior: 'smooth' }); }));
};

// ======================= server ban appeals =======================
// You: Settings › Account Standing lists servers you're banned from, with "Appeal".
const _renderStanding27 = renderStanding;
renderStanding = async function (body, ...a) {
  const r = await _renderStanding27(body, ...a);
  let bans = [];
  try { bans = (await api('GET', '/api/me/server-bans')).bans; } catch { return r; }
  if (!bans.length) return r;
  const g = document.createElement('div');
  g.className = 'setting-group srv-bans';
  g.innerHTML = `<h4 class="setting-head">Server bans</h4>${bans.map(b => `<div class="bug-row" data-sb="${esc(b.serverId)}"><span class="sa-sv" style="--sv:${esc(b.iconColor || '#04c5ae')}">${esc([...b.name][0] || '?')}</span>
    <div style="flex:1;min-width:0"><b>${esc(b.name)}</b><div class="muted small">Banned ${fmtTime(b.at)}${b.reason ? ` · "${esc(b.reason)}"` : ''}</div>
    ${b.appeal ? `<div class="small sb-status ${b.appeal.status}">${b.appeal.status === 'pending' ? 'Appeal sent: waiting for the moderators' : b.appeal.status === 'approved' ? 'Appeal accepted' : `Appeal not accepted${b.appeal.note ? `: "${esc(b.appeal.note)}"` : ''}`}</div>` : ''}</div>
    ${b.canAppeal ? '<button class="btn btn-primary btn-sm" data-sb-appeal>Appeal</button>' : ''}</div>`).join('')}`;
  body.append(g);
  for (const btn of $$('[data-sb-appeal]', g)) btn.addEventListener('click', () => {
    const id = btn.closest('[data-sb]').dataset.sb, b = bans.find(x => x.serverId === id);
    const ov = openLayer(`<form class="dialog modal"><h3>Appeal your ban from ${esc(b.name)}</h3>
      <p class="muted">The server's moderators will read this. Be honest and kind: say what happened and why they should let you back.</p>
      <label class="field">Your appeal<textarea name="t" rows="5" maxlength="1000" required minlength="10"></textarea></label>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Send Appeal</button></div></form>`);
    $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
    $('form', ov).addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('POST', `/api/servers/${id}/appeal`, { text: e.target.t.value }); closeLayer(); toast('Appeal sent'); openSettings('standing'); } catch (err) { toast(err.message, true); }
    });
  });
  return r;
};
// Moderators: Server Settings › Bans shows appeals at the top.
const _ssBans27 = ssBans;
ssBans = async function (body, sv) {
  await _ssBans27(body, sv);
  let appeals = [];
  try { appeals = (await api('GET', `/api/servers/${sv.id}/appeals`)).appeals; } catch { return; }
  const pending = appeals.filter(a => a.appeal.status === 'pending');
  if (!appeals.length) return;
  const box = document.createElement('div');
  box.className = 'setting-group srv-appeals';
  box.innerHTML = `<h4 class="setting-head">Appeals ${pending.length ? `<span class="count-pill">${pending.length} waiting</span>` : ''}</h4>${appeals.slice(0, 30).map(x => `<div class="appeal-card" data-ap-user="${esc(x.user.id)}">
    <div class="ac-head">${avatar(x.user, 32)}<div><b>${esc(x.user.displayName)}</b> <span class="muted">${esc(x.user.username)}</span><div class="muted small">Banned ${fmtTime(x.bannedAt)}${x.bannedBy ? ` by ${esc(x.bannedBy)}` : ''}${x.reason ? ` · "${esc(x.reason)}"` : ''}</div></div></div>
    <div class="ac-text">${esc(x.appeal.text)}</div>
    ${x.appeal.status === 'pending' ? `<input class="ac-note" maxlength="300" placeholder="A note for them (optional)"><div class="ac-acts"><button class="btn btn-grey btn-sm" data-ap-decide="deny">Keep banned</button><button class="btn btn-primary btn-sm" data-ap-decide="approve">Unban</button></div>` : `<div class="muted small">${x.appeal.status === 'approved' ? 'Accepted' : 'Not accepted'} ${fmtTime(x.appeal.decidedAt)}${x.appeal.note ? ` · "${esc(x.appeal.note)}"` : ''}</div>`}</div>`).join('')}`;
  $('h2', body)?.after(box);
  for (const b of $$('[data-ap-decide]', box)) b.addEventListener('click', async () => {
    const card = b.closest('[data-ap-user]');
    try { await api('POST', `/api/servers/${sv.id}/appeals/${card.dataset.apUser}`, { decision: b.dataset.apDecide, note: $('.ac-note', card)?.value || '' }); toast(b.dataset.apDecide === 'approve' ? 'Unbanned' : 'Appeal answered'); ssBans(body, sv); }
    catch (e) { toast(e.message, true); }
  });
};

// ======================= Bloom gifting events =======================
// While one runs: a banner in the Bloom page and the gift dialog with the goal, and the Gift Giver
// badge for everyone who gifts.
Object.assign(BADGE_INFO, {
  gifter: {
    label: 'Gift Giver', desc: 'Gifted Zuno Bloom during a gifting event',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgGift" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9ad5"/><stop offset="1" stop-color="#c2338e"/></linearGradient></defs>
      <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="6.5" fill="url(#bgGift)"/>
      <rect x="5.5" y="10" width="13" height="8.5" rx="1.4" fill="#fff0f8"/><rect x="4.6" y="7.6" width="14.8" height="3.4" rx="1.2" fill="#ffd6ee"/>
      <path d="M12 7.6v10.9" stroke="#c2338e" stroke-width="1.8"/><path d="M12 7.4c-1.6-2.8-4.6-2.6-4.4-.8.2 1.4 2.6 1.4 4.4.8Zm0 0c1.6-2.8 4.6-2.6 4.4-.8-.2 1.4-2.6 1.4-4.4.8Z" fill="#fff0f8" stroke="#c2338e" stroke-width=".9"/></svg>`,
  },
});
function giftEventBanner() {
  const e = state.giftEvent;
  if (!e?.live) return '';
  const pct = Math.min(100, Math.round((e.gifts / e.goal) * 100));
  const left = e.endsAt - Date.now(), leftText = left > 864e5 ? `${Math.ceil(left / 864e5)} days left` : `${Math.max(1, Math.round(left / 3600e3))} hours left`;
  return `<div class="gift-event"><div class="ge-top"><span class="ge-ico">${BADGE_INFO.gifter.svg}</span><div><b>${esc(e.name)}</b><div class="small">Gift Bloom to a friend and get the <b>Gift Giver</b> badge. ${leftText}.</div></div></div>
    <div class="ge-bar"><i style="width:${pct}%"></i></div><div class="small ge-count">${e.gifts} of ${e.goal} months gifted by ${e.givers} ${e.givers === 1 ? 'person' : 'people'}</div></div>`;
}
onLive26('gift-event', e => { state.giftEvent = e; for (const el of $$('.gift-event')) el.outerHTML = giftEventBanner(); });
(function giftEvt() { if (!state.token || !state.me) return setTimeout(giftEvt, 1500); api('GET', '/api/gift-event').then(r => { state.giftEvent = r.event; }).catch(() => {}); })(); // only once signed in
// The banner goes at the top of Settings › Zuno Bloom and of the gift dialog.
new MutationObserver(() => {
  if (!state.giftEvent?.live) return;
  for (const host of $$('#settings-body .bloom-page, #settings-body .bloom-hero, #layer .bloom-gift')) {
    const where = host.closest('#layer') ? host : host.closest('#settings-body');
    if (where && !$('.gift-event', where)) where.insertAdjacentHTML('afterbegin', giftEventBanner());
  }
}).observe(document.body, { childList: true, subtree: true });

// ======================= the bot marketplace =======================
// Every public bot in one place: categories, search, ratings and reviews, and "Add to Server".
// Opens from Discover (Bot Marketplace) and from Server Settings › Bots & Webhooks.
const BOT_CAT_EMOJI = { Moderation: '🛡️', Fun: '🎉', Music: '🎵', Games: '🎮', Utility: '🛠️', Social: '💬', Economy: '🪙', Other: '✨' };
const stars = (n, size = '') => `<span class="stars ${size}" title="${n} out of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${n >= i ? 'on' : n >= i - 0.5 ? 'half' : ''}">★</i>`).join('')}</span>`;
async function openMarketplace(serverId = null, after) {
  const f = { q: '', category: '', sort: 'popular' };
  const ov = openLayer(`<div class="dialog modal market"><div class="mk-head"><h3>🤖 Bot Marketplace</h3><span class="muted small">Bots made by the Zuno community. Add them to servers you manage.</span></div>
    <div class="mk-layout"><nav class="mk-cats"></nav><div class="mk-main"><div class="mk-bar"><input class="mk-q" placeholder="Search bots" maxlength="40"><select class="sc-select mk-sort"><option value="popular">Most used</option><option value="rated">Top rated</option><option value="new">Newest</option></select></div>
    <div class="mk-grid"><div class="fp-empty">Loading…</div></div></div></div>
    <div class="actions"><span class="muted small">Made a bot? List it in Settings › Developer (turn on Public bot).</span><span style="flex:1"></span><button class="btn btn-primary" data-a="done">Done</button></div></div>`);
  const grid = $('.mk-grid', ov);
  const load = async () => {
    let d;
    try { d = await api('GET', `/api/marketplace?q=${encodeURIComponent(f.q)}&category=${encodeURIComponent(f.category)}&sort=${f.sort}`); } catch (e) { grid.innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; return; }
    $('.mk-cats', ov).innerHTML = [['', 'All bots', Object.values(d.counts).reduce((a, b) => a + b, 0)], ...d.categories.map(c => [c, c, d.counts[c]])].map(([k, l, n]) => `<button class="${f.category === k ? 'on' : ''}" data-mkc="${esc(k)}">${k ? BOT_CAT_EMOJI[k] : '🤖'} ${esc(l)}<small>${n || ''}</small></button>`).join('');
    $$('[data-mkc]', ov).forEach(b => b.addEventListener('click', () => { f.category = b.dataset.mkc; load(); }));
    grid.innerHTML = d.bots.map(b => `<div class="mk-card" data-mk="${esc(b.id)}">${avatar({ ...b, displayName: b.name }, 48)}<div class="mk-info"><b>${esc(b.name)}</b><span class="mk-cat">${BOT_CAT_EMOJI[b.category] || ''} ${esc(b.category)}</span>
      <p>${esc(b.tagline || b.description || 'No description yet.')}</p>
      <div class="mk-meta">${b.rating.count ? `${stars(b.rating.avg)} <span>${b.rating.avg} (${b.rating.count})</span>` : '<span class="muted">No reviews yet</span>'}<span>· in ${b.serverCount} server${b.serverCount === 1 ? '' : 's'}</span></div></div></div>`).join('')
      || `<div class="empty-state">${mascot('curious')}<div class="title">No bots here yet</div><div>${f.q || f.category ? 'Try another search or category.' : 'Be the first: Settings › Developer.'}</div></div>`;
    $$('[data-mk]', grid).forEach(c => c.addEventListener('click', () => openMarketBot(c.dataset.mk, serverId, after)));
  };
  let t;
  $('.mk-q', ov).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 250); });
  $('.mk-sort', ov).addEventListener('change', e => { f.sort = e.target.value; load(); });
  $('[data-a=done]', ov).addEventListener('click', dismissLayer);
  load();
}
async function openMarketBot(id, serverId, after) {
  let d;
  try { d = await api('GET', `/api/marketplace/${id}`); } catch (e) { return toast(e.message, true); }
  const b = d.bot;
  let pickStars = d.mine?.stars || 0;
  const ov = openLayer(`<div class="dialog modal market mk-detail"><div class="mkd-head">${avatar({ ...b, displayName: b.name }, 72)}<div><h3>${esc(b.name)}</h3><div class="mk-meta">${b.rating.count ? `${stars(b.rating.avg, 'big')} <span>${b.rating.avg} · ${b.rating.count} review${b.rating.count === 1 ? '' : 's'}</span>` : '<span class="muted">No reviews yet</span>'}<span>· in ${b.serverCount} server${b.serverCount === 1 ? '' : 's'}</span></div>
      <div class="muted small">${BOT_CAT_EMOJI[b.category] || ''} ${esc(b.category)} · made by ${esc(b.owner?.displayName || 'someone')}</div></div><span style="flex:1"></span><button class="btn btn-primary" data-a="add">Add to Server</button></div>
    ${b.description ? `<p class="mkd-desc">${esc(b.description)}</p>` : ''}
    ${b.commands.length ? `<h4 class="setting-head">Commands</h4><div class="mkd-cmds">${b.commands.map(c => `<div><code>/${esc(c.name)}${c.usage ? ' ' + esc(c.usage) : ''}</code><span class="muted">${esc(c.description || '')}</span></div>`).join('')}</div>` : ''}
    <h4 class="setting-head">Reviews</h4>
    ${d.canReview ? `<form class="mkd-review"><div class="mkd-pick">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" class="${pickStars >= i ? 'on' : ''}">★</button>`).join('')}</div><textarea name="t" maxlength="500" rows="2" placeholder="What's it like? (optional)">${esc(d.mine?.text || '')}</textarea><div class="mkd-ra">${d.mine ? '<button type="button" class="btn btn-link btn-sm" data-a="delrev">Delete my review</button>' : ''}<button class="btn btn-grey btn-sm">${d.mine ? 'Update review' : 'Post review'}</button></div></form>` : `<p class="muted small">${b.owner?.id === state.me.id ? "This is your bot, so you can't review it." : 'Use this bot in a server to review it.'}</p>`}
    <div class="mkd-reviews">${d.reviews.map(r => `<div class="mkd-rv">${avatar(r.user, 28)}<div><div><b>${esc(r.user.displayName)}</b> ${stars(r.stars)} <span class="muted small">${fmtTime(r.at)}</span>${state.me.isStaff && r.user.id !== state.me.id ? ` <button class="btn btn-link btn-sm" data-rmrev="${esc(r.user.id)}">Remove</button>` : ''}</div>${r.text ? `<div class="mkd-rt">${esc(r.text)}</div>` : ''}</div></div>`).join('') || '<div class="muted small">No reviews yet.</div>'}</div>
    <div class="actions"><button class="btn btn-link" data-a="back">Back</button></div></div>`);
  $('[data-a=back]', ov).addEventListener('click', () => openMarketplace(serverId, after));
  $('[data-a=add]', ov).addEventListener('click', () => { closeLayer(); addBotToServer(b.id, serverId, after); });
  for (const s of $$('[data-star]', ov)) s.addEventListener('click', () => { pickStars = Number(s.dataset.star); $$('[data-star]', ov).forEach(x => x.classList.toggle('on', Number(x.dataset.star) <= pickStars)); });
  $('.mkd-review', ov)?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pickStars) return toast('Pick some stars first.', true);
    try { await api('PUT', `/api/marketplace/${b.id}/review`, { stars: pickStars, text: e.target.t.value }); toast('Thanks for the review!'); openMarketBot(id, serverId, after); } catch (err) { toast(err.message, true); }
  });
  $('[data-a=delrev]', ov)?.addEventListener('click', async () => { try { await api('DELETE', `/api/marketplace/${b.id}/review`); openMarketBot(id, serverId, after); } catch (err) { toast(err.message, true); } });
  $$('[data-rmrev]', ov).forEach(x => x.addEventListener('click', async () => { try { await api('DELETE', `/api/marketplace/${b.id}/review?user=${encodeURIComponent(x.dataset.rmrev)}`); openMarketBot(id, serverId, after); } catch (err) { toast(err.message, true); } }));
}
openBotDirectory = (serverId, after) => openMarketplace(serverId, after);
// A Bot Marketplace button on Discover.
const _showDiscover27 = showDiscover;
showDiscover = async function (...a) {
  const r = await _showDiscover27(...a);
  const tb = $('#main .topbar');
  if (tb && !$('#mk-open', tb)) { tb.insertAdjacentHTML('beforeend', '<div class="spacer"></div><button class="btn btn-grey btn-sm" id="mk-open">🤖 Bot Marketplace</button>'); $('#mk-open', tb).addEventListener('click', () => openMarketplace()); }
  return r;
};
// Settings › Developer: the marketplace listing (category and tagline) for public bots.
const _renderDeveloper27 = renderDeveloper;
renderDeveloper = async function (body, ...a) {
  const r = await _renderDeveloper27(body, ...a);
  const pub = $('[name=public]', body);
  if (!pub || $('.mk-listing', body)) return r;
  let app;
  try { app = (await api('GET', '/api/apps')).apps.find(x => x.id === devSel); } catch { return r; }
  if (!app) return r;
  const g = document.createElement('div');
  g.className = 'setting-group mk-listing';
  g.innerHTML = `<h4 class="setting-head">Marketplace listing</h4><p class="muted small" style="margin-top:0">How your bot shows up in the Bot Marketplace (when it's public).</p>
    <label class="field">Category<select class="sc-select" name="mk-cat">${Object.keys(BOT_CAT_EMOJI).map(c => `<option${(app.category || 'Other') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">One-line tagline<input name="mk-tag" maxlength="80" value="${esc(app.tagline || '')}" placeholder="The friendliest moderation bot on Zuno"></label>
    <button class="btn btn-primary btn-sm" data-mk-save>Save listing</button>`;
  pub.closest('.setting-group').after(g);
  $('[data-mk-save]', g).addEventListener('click', async () => {
    try { await api('PATCH', `/api/apps/${app.id}/listing`, { category: $('[name=mk-cat]', g).value, tagline: $('[name=mk-tag]', g).value }); toast('Listing saved'); } catch (e) { toast(e.message, true); }
  });
  return r;
};

// ======================= the founder's admin dashboard =======================
// Settings › Admin Dashboard, only for the founder: people, activity, Bloom, moderation queues and
// how the server is doing. Also where gifting events are started. Refreshes every 30 seconds.
const _openSettings27 = openSettings;
openSettings = function (...a) {
  const r = _openSettings27(...a);
  if ((state.me?.isFounder || state.me?.isManager) && !$('.settings-nav [data-s="admin"]')) {
    const anchor = $('.settings-nav [data-s="employee"]') || $('.settings-nav [data-s="buginbox"]');
    if (anchor) {
      anchor.insertAdjacentHTML('afterend', '<button data-s="admin">Admin Dashboard</button>');
      $('.settings-nav [data-s="admin"]').addEventListener('click', () => showSettingsSection('admin'));
    }
  }
  return r;
};
const _showSettingsSection27 = showSettingsSection;
let adminTimer = null;
showSettingsSection = function (section, ...a) {
  clearInterval(adminTimer);
  if (section !== 'admin') return _showSettingsSection27(section, ...a);
  $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === 'admin'));
  settingsDraft = null;
  const body = $('#settings-body');
  renderAdmin(body);
  adminTimer = setInterval(() => { if ($('.admin-dash', body)) renderAdmin(body, true); else clearInterval(adminTimer); }, 30e3);
};
const fmtNum = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n.toLocaleString());
// A simple bar chart: one series, the latest value labelled, hover for each day.
function adminBars(values, label, unit) {
  const max = Math.max(1, ...values), n = values.length;
  const day = i => { const d = new Date(Date.now() - (n - 1 - i) * 864e5); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  return `<div class="ad-chart"><div class="ad-chart-head"><b>${label}</b><span class="muted small">last ${n} days · today ${fmtNum(values[n - 1])}</span></div>
    <div class="ad-bars">${values.map((v, i) => `<div class="ad-bar" title="${day(i)}: ${v.toLocaleString()} ${unit}"><i style="height:${Math.max(v ? 4 : 0, (v / max) * 100)}%"></i></div>`).join('')}</div>
    <div class="ad-axis muted small"><span>${day(0)}</span><span>${day(n - 1)}</span></div></div>`;
}
async function renderAdmin(body, quiet = false) {
  let d;
  try { d = await api('GET', '/api/admin/dashboard'); } catch (e) { if (!quiet) body.innerHTML = `<h2>Admin Dashboard</h2><p>${esc(e.message)}</p>`; return; }
  if (quiet && !$('.admin-dash', body)) return;
  const tile = (label, value, sub = '') => `<div class="ad-tile"><div class="ad-v">${value}</div><div class="ad-l">${label}</div>${sub ? `<div class="ad-s">${sub}</div>` : ''}</div>`;
  const up = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 48 ? `${Math.floor(h / 24)} days` : h ? `${h}h ${m}m` : `${m}m`; };
  const ge = d.giftEvent && d.giftEvent.endsAt > Date.now() ? d.giftEvent : null;
  const check = ok => (ok ? '<span class="ad-ok">On</span>' : '<span class="ad-off">Off</span>');
  body.innerHTML = `<div class="admin-dash"><h2>Admin Dashboard <span class="muted small">${state.me.isFounder ? 'only you and Zuno Managers can see this' : 'only the founder and Zuno Managers can see this'} · updates every 30s</span></h2>
    <div class="ad-tiles">
      ${tile('People', fmtNum(d.people.total), `+${d.people.newToday} today · +${d.people.newWeek} this week`)}
      ${tile('Online now', fmtNum(d.people.online))}
      ${tile('Active today', fmtNum(d.people.active24h), `${fmtNum(d.people.active7d)} this week · ${fmtNum(d.people.active30d)} this month`)}
      ${tile('Messages today', fmtNum(d.activity.messages[d.activity.messages.length - 1]), `${fmtNum(d.activity.messages.reduce((a, b) => a + b, 0))} in 14 days`)}
      ${tile('Servers', fmtNum(d.activity.servers), `${fmtNum(d.activity.groups)} group chats · ${d.activity.calls} calls live`)}
      ${tile('Bloom subscribers', fmtNum(d.money.bloomPaid + d.money.bloomGift), `${fmtNum(d.money.bloomPaid)} paying · ${fmtNum(d.money.bloomGift)} gifted · ~$${d.money.monthly.toLocaleString()}/month`)}
    </div>
    <div class="ad-charts">${adminBars(d.people.signups, 'Sign-ups', 'new accounts')}${adminBars(d.activity.messages, 'Messages', 'messages')}${adminBars(d.activity.activeUsers, 'People chatting', 'people')}</div>
    <div class="ad-cols">
      <div class="setting-group"><h4 class="setting-head">Needs a look</h4>
        <button class="ad-row" data-go="moderation"><span>Open reports</span><b class="${d.moderation.reports ? 'warn' : ''}">${d.moderation.reports}</b></button>
        <button class="ad-row" data-go="moderation"><span>Ban appeals waiting</span><b class="${d.moderation.appeals ? 'warn' : ''}">${d.moderation.appeals}</b></button>
        <button class="ad-row" data-go="buginbox"><span>New bug reports</span><b class="${d.moderation.bugs ? 'warn' : ''}">${d.moderation.bugs}</b></button>
        <div class="ad-row"><span>Banned accounts</span><b>${d.moderation.banned}</b></div></div>
      <div class="setting-group"><h4 class="setting-head">Biggest servers</h4>${d.topServers.map(s => `<div class="ad-row"><span>${esc(s.name)}</span><b>${fmtNum(s.members)}<small> members${s.msgs7 != null ? ` · ${fmtNum(s.msgs7)} msgs/wk` : ''}</small></b></div>`).join('') || '<div class="muted small">No servers yet.</div>'}</div>
      <div class="setting-group"><h4 class="setting-head">The server</h4>
        <div class="ad-row"><span>Version</span><b>${esc(d.system.version || '?')}</b></div><div class="ad-row"><span>Up for</span><b>${up(d.system.uptime)}</b></div>
        <div class="ad-row"><span>Memory</span><b class="${d.system.memoryLimitMB && d.system.memoryMB > d.system.memoryLimitMB * 0.8 ? 'warn' : ''}">${d.system.memoryMB} MB${d.system.memoryLimitMB ? `<small> of ${d.system.memoryLimitMB} MB (${Math.round(d.system.memoryMB / d.system.memoryLimitMB * 100)}%)</small>` : ''}</b></div><div class="ad-row"><span>Node</span><b>${esc(d.system.node)}</b></div>
        ${d.system.storedMessages != null ? `<div class="ad-row"><span>Messages kept in memory</span><b>${fmtNum(d.system.storedMessages)}</b></div><div class="ad-row"><span>Logged-in devices</span><b>${fmtNum(d.system.logins)}</b></div>` : ''}
        <div class="ad-row"><span>AI name judge</span>${check(d.system.aiJudge)}</div><div class="ad-row"><span>Cloud storage</span>${check(d.system.cloudStorage)}</div><div class="ad-row"><span>Sign-up bot check</span>${check(d.system.turnstile)}</div>
        <div class="ad-row"><span>Email</span>${check(d.system.email)}</div><div class="ad-row"><span>Stripe (Bloom payments)</span>${check(d.system.stripe)}</div></div>
      <div class="setting-group ad-source"${state.me.isFounder ? '' : ' hidden'}><h4 class="setting-head">Download Zuno</h4>
        <p class="muted small">A zip of the exact code Zuno is running right now (version ${esc(d.system.version || '')}). Passwords, the database, uploads and git history are never included.</p>
        <button class="btn btn-primary btn-sm" type="button" id="ad-source-dl">Download latest Zuno (.zip)</button> <span class="muted small" id="ad-source-status" role="status"></span>
      </div>
      <div class="setting-group ad-update-publisher"><h4 class="setting-head">Website update publisher</h4>
        <p class="muted small">Write the update announcement before publishing. Everyone online receives it immediately; people who are offline see it when they next open Zuno. Publishing the notice does not deploy code by itself.</p>
        <form id="ad-update-form" class="ad-update-form">
          <label class="field">Version<input name="version" maxlength="32" value="${esc(d.system.version || '')}" placeholder="0.55.0"></label>
          <label class="field">Popup title<input name="title" maxlength="100" required placeholder="What's new in Zuno?"></label>
          <label class="field">Update description<textarea name="summary" maxlength="2000" rows="3" required placeholder="Tell everyone what changed…"></textarea></label>
          <label class="field">Bug fixes <span class="muted small">(one per line)</span><textarea name="fixes" maxlength="3000" rows="4" placeholder="Fixed messages not loading\nFixed profile frame display"></textarea></label>
          <button class="btn btn-primary btn-sm" type="submit">Preview &amp; Publish Update</button>
          <span class="muted small" id="ad-update-status" role="status"></span>
        </form>
        ${d.siteUpdate ? `<div class="ad-row"><span>Last announcement: <b>${esc(d.siteUpdate.title)}</b></span><small>${new Date(d.siteUpdate.publishedAt).toLocaleString()}</small></div>` : ''}
      </div>
      <div class="setting-group"><h4 class="setting-head">Bloom gifting event</h4>
        ${ge ? `<div class="ad-row"><span>${esc(ge.name)}</span><b>${ge.gifts} / ${ge.goal} months</b></div><div class="muted small">${ge.givers?.length || 0} gifters · ends ${fmtTime(ge.endsAt)}</div><button class="btn btn-grey btn-sm" data-ge-stop>End event now</button>`
          : `<form class="ad-ge"><input name="name" maxlength="60" placeholder="Event name" value="Gifting Week"><label>Days<input name="days" type="number" min="1" max="31" value="7"></label><label>Goal (months)<input name="goal" type="number" min="1" max="100000" value="100"></label><button class="btn btn-primary btn-sm">Start event</button></form><p class="muted small">Everyone who gifts Bloom while it runs gets the Gift Giver badge.</p>`}</div>
    </div></div>`;
  $$('[data-go]', body).forEach(b => b.addEventListener('click', () => showSettingsSection(b.dataset.go)));
  $('.ad-ge', body)?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PUT', '/api/admin/gift-event', { name: e.target.name.value, days: Number(e.target.days.value), goal: Number(e.target.goal.value) }); toast('Gifting event started'); renderAdmin(body); } catch (err) { toast(err.message, true); }
  });
  $('[data-ge-stop]', body)?.addEventListener('click', () => confirmDialog('End the gifting event?', 'The banner goes away for everyone. Badges already earned stay.', 'End Event', async () => { try { await api('PUT', '/api/admin/gift-event', { stop: true }); renderAdmin(body); } catch (err) { toast(err.message, true); } }));
  $('#ad-source-dl', body)?.addEventListener('click', async e => {
    const btn = e.currentTarget, status = $('#ad-source-status', body);
    btn.disabled = true; status.textContent = 'Preparing…';
    try {
      const r = await api('POST', '/api/admin/source-ticket');
      const a = document.createElement('a');
      a.href = r.url; a.download = r.name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      status.textContent = `${r.name} · ${r.files} files · ${r.sizeMB} MB`;
    } catch (err) { status.textContent = ''; toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  $('#ad-update-form', body)?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = { version: form.version.value, title: form.title.value, summary: form.summary.value, fixes: form.fixes.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) };
    const preview = `<div class="dialog modal"><h3>Preview website update</h3><h4>${esc(payload.title)}</h4>${payload.version ? `<p class="muted small">Version ${esc(payload.version)}</p>` : ''}<p>${esc(payload.summary).replace(/\n/g, '<br>')}</p>${payload.fixes.length ? `<h4>Bug fixes</h4><ul>${payload.fixes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">No bug fixes listed.</p>'}<p class="muted small">This sends the announcement and asks users to refresh. It does not deploy new server code.</p><div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="publish">Publish to everyone</button></div></div>`;
    const ov = openLayer(preview);
    $('[data-a="cancel"]', ov).addEventListener('click', dismissLayer);
    $('[data-a="publish"]', ov).addEventListener('click', async () => {
      const button = $('[data-a="publish"]', ov); button.disabled = true; button.textContent = 'Publishing…';
      try { await api('POST', '/api/admin/site-update', payload); dismissLayer(); toast('Update announcement sent to everyone'); renderAdmin(body); }
      catch (err) { button.disabled = false; button.textContent = 'Publish to everyone'; toast(err.message, true); }
    });
  });
}

// ======================= in-game overlay (desktop app) =======================
// Settings › Voice & Video › In-game overlay: a little list of who's in your call, lit up when they
// talk, floating over your games. Shift+` hides it. The desktop app draws it (electron/overlay.html).
const overlayPrefs = () => { try { return { on: true, corner: 'top-left', ...JSON.parse(localStorage.getItem('zuno_overlay') || '{}') }; } catch { return { on: true, corner: 'top-left' }; } };
if (window.zunoDesktop?.overlay) {
  let last = '';
  setInterval(() => {
    const p = overlayPrefs();
    // (0.45.1) Only over games: a game is running and Zuno isn't the window in front.
    const overGame = !!window.zunoGame45 && !document.hasFocus();
    const people = Calls.room && p.on && overGame ? Calls.participants().map(id => {
      const u = user(id) || { displayName: '?' }, st = Calls.peerState(id);
      return { name: u.displayName, avatar: u.avatar ? new URL(u.avatar, location.origin).href : null, speaking: Calls.isSpeaking(id), muted: !!(st?.muted || st?.deafened) };
    }) : [];
    const st = people.length ? { on: true, corner: p.corner, people } : null;
    const key = JSON.stringify(st);
    if (key !== last) { last = key; window.zunoDesktop.overlay(st); }
  }, 250);
}
const _renderVoiceSettings27 = renderVoiceSettings;
renderVoiceSettings = async function (body, ...a) {
  const r = await _renderVoiceSettings27(body, ...a);
  const p = overlayPrefs();
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">In-game overlay</h4>
    <label class="setting-row"><div><div class="setting-title">Show who's talking over games</div><div class="setting-desc">${window.zunoDesktop?.overlay ? "In a call, a small list of everyone in it floats in a corner of your screen and lights up when someone talks. Clicks go through it to your game. Shift+` hides it. (Works in windowed and borderless games; exclusive fullscreen games draw over everything.)" : 'Only in the Zuno desktop app. Get it from the download page.'}</div></div><input type="checkbox" class="switch" id="ov-on"${p.on ? ' checked' : ''}${window.zunoDesktop?.overlay ? '' : ' disabled'}></label>
    <div class="setting-row"><div><div class="setting-title">Corner</div></div><select class="sc-select" id="ov-corner"${window.zunoDesktop?.overlay ? '' : ' disabled'}>${[['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']].map(([v, l]) => `<option value="${v}"${p.corner === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
  body.append(g);
  const save = () => { try { localStorage.setItem('zuno_overlay', JSON.stringify({ on: $('#ov-on', g).checked, corner: $('#ov-corner', g).value })); } catch {} };
  $('#ov-on', g).addEventListener('change', save);
  $('#ov-corner', g).addEventListener('change', save);
  return r;
};

// ======================= website update announcements =======================
let shownSiteUpdate27 = '';
function showSiteUpdate27(update) {
  if (!update?.id || update.id === shownSiteUpdate27) return;
  shownSiteUpdate27 = update.id;
  try { if (localStorage.getItem('zuno_site_update_seen') === update.id) return; } catch {}
  const fixes = Array.isArray(update.fixes) ? update.fixes : [];
  const ov = openLayer(`<div class="dialog modal site-update-modal"><div class="site-update-mark">✦</div><h3>${esc(update.title || 'Zuno has been updated')}</h3>${update.version ? `<p class="muted small">Version ${esc(update.version)}</p>` : ''}<p>${esc(update.summary || '').replace(/\n/g, '<br>')}</p>${fixes.length ? `<h4>Bug fixes</h4><ul>${fixes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="muted small">Refresh Zuno to load the latest website files.</p><div class="actions"><button class="btn btn-link" data-a="later">Later</button><button class="btn btn-primary" data-a="refresh">Refresh Zuno</button></div></div>`);
  $('[data-a="later"]', ov).addEventListener('click', () => { try { localStorage.setItem('zuno_site_update_seen', update.id); } catch {} dismissLayer(); });
  $('[data-a="refresh"]', ov).addEventListener('click', () => { try { localStorage.setItem('zuno_site_update_seen', update.id); } catch {} location.reload(); });
}
onLive26?.('site-update', update => showSiteUpdate27(update));
// Catch announcements published while this account was offline or its live stream was disconnected.
// (Online people get them instantly over the live connection, so this only checks every 10 minutes.)
setInterval(async () => {
  if (!state.me || document.hidden) return;
  try { const r = await api('GET', '/api/site-update'); if (r.update) showSiteUpdate27(r.update); } catch {}
}, 600000);
setTimeout(async () => {
  if (!state.me) return;
  try { const r = await api('GET', '/api/site-update'); if (r.update) showSiteUpdate27(r.update); } catch {}
}, 4000);
