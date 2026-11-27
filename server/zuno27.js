// Zuno 0.27: status schedules, Polls 2.0, the pin board, voice channel games (Wordle and more),
// Discover categories and trending, server ban appeals, Bloom gifting events, the bot marketplace
// and the founder's admin dashboard.
// index.js hands everything this needs over in `z`.

module.exports = function zuno27(z) {
  const { data, save, route, fail, hooks, clean, newId, send, publicUser, broadcastUser } = z;

  // ======================= status schedules =======================
  // "Do Not Disturb on weekdays 9–5": while a rule's time is on, your status (and optionally a custom
  // status) switches to it; afterwards whatever you had before comes back.
  const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
  const hhmm = s => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s)) ? String(s) : null);
  const minutesOf = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  function cleanRules(list) {
    return (Array.isArray(list) ? list : []).slice(0, 8).map(r => {
      const from = hhmm(r?.from), to = hhmm(r?.to);
      const days = [...new Set((Array.isArray(r?.days) ? r.days : []).map(Number).filter(d => d >= 0 && d <= 6))].sort();
      if (!from || !to || from === to || !days.length || !STATUSES.includes(r.status)) return null;
      return { id: String(r.id || newId()).slice(0, 24), days, from, to, status: r.status, text: clean(r.text, 80) || '', emoji: clean(r.emoji, 16) || '', on: r.on !== false };
    }).filter(Boolean);
  }
  // The rule that's on right now, in the person's own time zone.
  function activeRule(u, now = new Date()) {
    const rules = (u.statusSchedule || []).filter(r => r.on);
    if (!rules.length) return null;
    let day, mins;
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: u.timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
      day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday); mins = Number(parts.hour) * 60 + Number(parts.minute);
    } catch { return null; }
    for (const r of rules) {
      const a = minutesOf(r.from), b = minutesOf(r.to);
      // Overnight rules (22:00–07:00) belong to the day they start on.
      if (a < b ? r.days.includes(day) && mins >= a && mins < b : (r.days.includes(day) && mins >= a) || (r.days.includes((day + 6) % 7) && mins < b)) return r;
    }
    return null;
  }
  function applySchedule(u) {
    const r = activeRule(u);
    const was = u.statusScheduled;
    if (r && was?.rule !== r.id) {
      if (!was) u.statusBeforeSchedule = { status: u.status, customStatus: u.customStatus || '', customStatusEmoji: u.customStatusEmoji || null };
      u.status = r.status;
      if (r.text || r.emoji) { u.customStatus = r.text; u.customStatusEmoji = r.emoji || null; }
      u.statusScheduled = { rule: r.id, since: Date.now(), text: r.text || r.emoji ? r.text : null };
      return true;
    }
    if (!r && was) {
      const b = u.statusBeforeSchedule || {};
      u.status = STATUSES.includes(b.status) ? b.status : 'online';
      // Only put the old custom status back if the schedule set one (and you haven't changed it since).
      if (was.text != null && u.customStatus === was.text) { u.customStatus = b.customStatus || ''; u.customStatusEmoji = b.customStatusEmoji || null; }
      delete u.statusScheduled; delete u.statusBeforeSchedule;
      return true;
    }
    return false;
  }
  route('GET', '/api/me/status-schedule', async ({ me }) => ({ rules: me.statusSchedule || [], timeZone: me.timeZone || null, active: me.statusScheduled?.rule || null }));
  route('PUT', '/api/me/status-schedule', async ({ me, body }) => {
    const rules = cleanRules(body.rules);
    for (const r of rules) if (r.text) await z.judgeText({ status: r.text });
    me.statusSchedule = rules;
    try { if (body.timeZone) { new Intl.DateTimeFormat('en-US', { timeZone: String(body.timeZone) }); me.timeZone = String(body.timeZone).slice(0, 64); } } catch { fail(400, 'Unknown time zone.'); }
    if (applySchedule(me)) broadcastUser(me);
    save(); send(me.id, 'me', z.privateMe(me));
    return { rules: me.statusSchedule, active: me.statusScheduled?.rule || null };
  });
  // Changing your status by hand while a schedule is on: it stays your choice until the schedule ends.
  setInterval(() => {
    let changed = false;
    for (const u of Object.values(data.users)) if (u.statusSchedule?.length && applySchedule(u)) { changed = true; broadcastUser(u); send(u.id, 'me', z.privateMe(u)); }
    if (changed) save();
  }, 30e3).unref();
  z.applyStatusSchedule = applySchedule;

  // ======================= Polls 2.0 =======================
  // On top of the 0.14 polls: anonymous polls (nobody sees who picked what), ranked-choice polls
  // (put the answers in order; the winner is worked out by instant runoff), hidden results until the
  // poll ends, letting everyone add answers, ending a poll early, and more lengths (15 minutes to 2
  // weeks). When a poll ends, Zuno replies to it with the result.
  // Votes for anonymous, ranked and hidden-results polls are kept apart from the message
  // (data.pollBallots) so they never reach anyone's app; the message only carries the totals.
  const POLL_LENGTHS = { 0.25: '15 minutes', 0.5: '30 minutes', 1: '1 hour', 4: '4 hours', 8: '8 hours', 24: '1 day', 72: '3 days', 168: '1 week', 336: '2 weeks' };
  data.pollBallots ||= {};
  data.pollWatch ||= {}; // msgId -> { by, conv, endsAt }: polls whose end Zuno announces
  const sealed = p => p.anonymous || p.ranked || p.blind;
  hooks.beforePost.push(({ conv, me, body, extra }) => {
    if (!extra.poll || !body.poll) return;
    const b = body.poll, p = extra.poll;
    const hours = Number(b.hours);
    if (POLL_LENGTHS[hours]) p.endsAt = Date.now() + hours * 3600e3;
    p.v = 2; p.by = me.id;
    if (b.anonymous) p.anonymous = true;
    if (b.ranked) { p.ranked = true; p.multi = false; }
    if (b.blind) p.blind = true;
    if (b.open) p.open = true;
    if (sealed(p)) for (const o of p.options) { o.votes = []; o.count = 0; }
  });
  hooks.afterPost.push(({ conv, me, message }) => {
    if (message?.poll?.v === 2) { data.pollWatch[message.id] = { by: me.id, conv: conv.idFor(me.id), endsAt: message.poll.endsAt }; save(); }
  });
  // Instant runoff: drop the answer with the fewest first choices until one has more than half.
  function runoff(ballots, optionIds) {
    let alive = new Set(optionIds);
    const rounds = [];
    for (let guard = 0; guard < optionIds.length; guard++) {
      const counts = Object.fromEntries([...alive].map(id => [id, 0]));
      let total = 0;
      for (const b of ballots) { const top = b.find(id => alive.has(id)); if (top) { counts[top]++; total++; } }
      rounds.push(counts);
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!total) return { rounds, winner: null };
      if (sorted[0][1] * 2 > total || alive.size <= 2) return { rounds, winner: sorted[0][1] === sorted[1]?.[1] ? null : sorted[0][0] };
      const low = Math.min(...Object.values(counts));
      const out = sorted.filter(([, n]) => n === low).map(([id]) => id);
      if (out.length === alive.size) return { rounds, winner: null };
      for (const id of out) alive.delete(id);
    }
    return { rounds, winner: null };
  }
  // The public view of a sealed poll: totals (and, once it's over and not anonymous, who voted what).
  function tally(m, reveal = false) {
    const p = m.poll, ballots = data.pollBallots[m.id] || {};
    const list = Object.entries(ballots);
    for (const o of p.options) {
      const who = list.filter(([, b]) => (p.ranked ? b[0] === o.id : b.includes(o.id))).map(([uid]) => uid);
      o.count = who.length;
      o.votes = reveal && !p.anonymous ? who : [];
    }
    p.voters = list.length;
    if (p.ranked) { const r = runoff(list.map(([, b]) => b), p.options.map(o => o.id)); p.rounds = r.rounds; p.winner = r.winner; }
    // Hidden results stay hidden (just the number of voters) until the poll ends.
    if (p.blind && !reveal) { for (const o of p.options) o.count = 0; delete p.rounds; delete p.winner; }
    return p;
  }
  const pollEnded = p => p.endsAt && p.endsAt <= Date.now();
  function finishPoll(conv, st, i, m, early = false) {
    const poll = JSON.parse(JSON.stringify(m.poll));
    if (early) poll.endsAt = Date.now();
    poll.closed = true;
    const message = st.messages[i] = { ...m, poll };
    if (sealed(poll)) tally(message, true);
    delete data.pollWatch[m.id];
    save();
    z.emit(conv, 'message-update', { message });
    // The result, as a reply from Zuno.
    const counts = poll.options.map(o => [o, sealed(poll) ? o.count : o.votes.length]);
    const voters = sealed(poll) ? poll.voters || 0 : new Set(poll.options.flatMap(o => o.votes)).size;
    let text;
    if (!voters) text = `📊 The poll **${poll.question}** ended with no votes.`;
    else if (poll.ranked) { const w = poll.options.find(o => o.id === poll.winner); text = w ? `📊 **${w.text}** won the ranked poll **${poll.question}** (${voters} ballot${voters === 1 ? '' : 's'}).` : `📊 The ranked poll **${poll.question}** ended in a tie (${voters} ballot${voters === 1 ? '' : 's'}).`; }
    else {
      const top = Math.max(...counts.map(c => c[1]));
      const winners = counts.filter(c => c[1] === top).map(c => c[0].text);
      text = winners.length > 1 ? `📊 **${winners.join('** and **')}** tied in **${poll.question}** with ${top} vote${top === 1 ? '' : 's'} each.` : `📊 **${winners[0]}** won **${poll.question}** with ${top} of ${voters} vote${voters === 1 ? '' : 's'}.`;
    }
    try { z.postMessage(conv, data.users[z.SYSTEM_ID], text, { replyTo: { id: m.id, authorId: m.authorId, snippet: poll.question.slice(0, 120) } }); } catch {}
    return message;
  }
  setInterval(() => {
    for (const [id, w] of Object.entries(data.pollWatch)) {
      if (w.endsAt > Date.now()) continue;
      try {
        const author = data.users[w.by];
        const conv = z.convOf(author, w.conv);
        const { st, i, m } = z.findMessage(conv, id);
        if (m.poll && !m.poll.closed) finishPoll(conv, st, i, m);
        else delete data.pollWatch[id];
      } catch { delete data.pollWatch[id]; }
    }
  }, 20e3).unref();

  const convRoutes = [['/api/dms/:target', z.dmConv], ['/api/channels/:target', z.channelConv], ['/api/groups/:target', z.groupConv]];
  for (const [prefix, resolve] of convRoutes) {
    // Which answers you picked (for polls whose votes are kept private).
    route('GET', `${prefix}/messages/:msgId/poll`, async ({ me, params }) => {
      const conv = resolve(me, params.target);
      const { m } = z.findMessage(conv, params.msgId);
      if (!m.poll) fail(400, "That message isn't a poll.");
      return { mine: data.pollBallots[m.id]?.[me.id] || [] };
    });
    route('POST', `${prefix}/messages/:msgId/poll`, async ({ me, params, body }) => {
      const conv = resolve(me, params.target);
      if (conv.kind === 'dm' && conv.canWrite() !== 'open') fail(403, 'You can vote once they accept your message request.');
      if (conv.kind === 'channel' && !conv.perms.has('send_messages') && !conv.perms.has('add_reactions')) fail(403, "You can't vote in this channel.");
      const { st, i, m } = z.findMessage(conv, params.msgId);
      if (!m.poll) fail(400, "That message isn't a poll.");
      const action = String(body.action || 'vote');
      const mod = m.poll.by === me.id || m.authorId === me.id || (conv.kind === 'channel' && conv.perms.has('manage_messages'));
      if (action === 'end') {
        if (!mod) fail(403, 'Only whoever made the poll (or a moderator) can end it.');
        if (m.poll.closed || pollEnded(m.poll)) fail(400, 'This poll has already ended.');
        return { message: finishPoll(conv, st, i, m, true) };
      }
      if (m.poll.closed || pollEnded(m.poll)) fail(400, 'This poll has ended.');
      const poll = JSON.parse(JSON.stringify(m.poll));
      if (action === 'add') {
        if (!poll.open && !mod) fail(403, "This poll doesn't take new answers.");
        const text = clean(body.text, 55);
        if (!text) fail(400, 'Type an answer.');
        await z.judgeText({ 'poll answer': text });
        if (poll.options.length >= 15) fail(400, 'Polls can have up to 15 answers.');
        if (poll.options.some(o => o.text.toLowerCase() === text.toLowerCase())) fail(400, "That answer's already there.");
        poll.options.push({ id: String(Math.max(...poll.options.map(o => Number(o.id) || 0)) + 1), text, emoji: null, votes: [], ...(sealed(poll) ? { count: 0 } : {}), addedBy: me.id });
      } else {
        const ids = [...new Set((Array.isArray(body.options) ? body.options : [body.option]).map(String))].filter(id => poll.options.some(o => o.id === id));
        if (!sealed(poll)) fail(400, 'Use the normal vote for this poll.');
        if (!poll.ranked && !poll.multi && ids.length > 1) fail(400, 'Pick one answer.');
        const ballots = (data.pollBallots[m.id] ||= {});
        if (ids.length) ballots[me.id] = ids; else delete ballots[me.id];
      }
      const message = st.messages[i] = { ...m, poll };
      if (sealed(poll)) tally(message);
      save();
      z.emit(conv, 'message-update', { message });
      return { message, mine: data.pollBallots[m.id]?.[me.id] || [] };
    });
  }

  // ======================= voice channel games =======================
  // Started from the ▶ button in a call: Wordle Race, Trivia Night and Connect Four. One game per
  // call at a time; everyone in the call sees it. The secret word and trivia answers stay here
  // until they're revealed, so nobody can peek.
  const WORDS = require('./gamewords');
  const games = new Map(); // roomId -> game
  // Tonight's scoreboard: wins in each call, across every game played there, until the call empties.
  const tallies = new Map(); // roomId -> { uid: wins }
  const HANGMAN = ['pancake stack', 'midnight snack', 'game night', 'pizza party', 'rocket ship', 'treasure map', 'thunder storm', 'video game', 'board game', 'roller coaster', 'campfire story', 'birthday cake', 'space station', 'haunted house', 'magic trick', 'secret agent', 'popcorn bucket', 'ice cream truck', 'dance floor', 'road trip', 'snow day', 'beach volleyball', 'dragon egg', 'pirate ship', 'jelly bean', 'sleepover', 'karaoke', 'trampoline', 'lighthouse', 'skateboard', 'waterfall', 'volcano', 'butterfly', 'penguin', 'chocolate', 'spaceship', 'adventure', 'telescope', 'fireworks', 'astronaut', 'marshmallow', 'dinosaur', 'friendship', 'microphone', 'headphones', 'controller', 'speedrun', 'high score', 'final boss', 'level up', 'power up', 'extra life', 'game over', 'checkpoint', 'side quest', 'boss battle', 'loot box', 'respawn', 'leaderboard', 'tournament'];
  const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  // Who won a finished game (none for a draw, or for a team game like Hangman).
  function winnersOf(g) {
    if (g.type === 'connect4' || g.type === 'tictactoe') return g.winner ? [g.winner] : [];
    if (g.type === 'trivia' || g.type === 'reaction' || g.type === 'math' || g.type === 'scramble' || g.type === 'rps') {
      const top = Math.max(0, ...Object.values(g.scores || {}));
      return top > 0 ? Object.entries(g.scores).filter(([, v]) => v === top).map(([id]) => id) : [];
    }
    if (g.type === 'wordle') {
      const won = Object.entries(g.players).filter(([, p]) => p.won);
      if (!won.length) return [];
      const best = Math.min(...won.map(([, p]) => p.rows.length));
      const fastest = won.filter(([, p]) => p.rows.length === best).sort((a, b) => a[1].doneAt - b[1].doneAt);
      return [fastest[0][0]];
    }
    return [];
  }
  function tallyGame(roomId, g) {
    if (!g.over || g.tallied) return;
    g.tallied = true;
    const t = tallies.get(roomId) || {};
    for (const id of winnersOf(g)) t[id] = (t[id] || 0) + 1;
    t._games = (t._games || 0) + 1;
    tallies.set(roomId, t);
  }
  // Reaction Race: wait for green, then click. Too early is a false start. 5 rounds.
  function reactionTick(roomId) {
    const g = games.get(roomId);
    if (!g || g.type !== 'reaction' || g.over) return;
    clearTimeout(g.timer);
    if (g.phase === 'wait') { g.phase = 'go'; g.goAt = Date.now(); g.timer = setTimeout(() => reactionTick(roomId), 2500); }
    else if (g.phase === 'go') {
      // Fastest click this round scores; everyone who clicked gets a time on the board.
      const clicks = Object.entries(g.clicks).filter(([, c]) => c.ms != null).sort((a, b) => a[1].ms - b[1].ms);
      if (clicks[0]) g.scores[clicks[0][0]] = (g.scores[clicks[0][0]] || 0) + 1;
      g.last = { times: Object.fromEntries(Object.entries(g.clicks).map(([id, c]) => [id, c.ms ?? 'early'])), winner: clicks[0]?.[0] || null };
      g.phase = 'result'; g.timer = setTimeout(() => reactionTick(roomId), 2500);
    } else {
      g.round++;
      if (g.round >= g.rounds) { g.over = true; g.phase = 'done'; pushGame(roomId); return; }
      g.phase = 'wait'; g.clicks = {}; g.goAt = null;
      g.timer = setTimeout(() => reactionTick(roomId), 1800 + Math.random() * 3200);
    }
    pushGame(roomId);
  }
  const inCall = (me, roomId) => { if (!z.rooms.get(roomId)?.has(me.id)) fail(403, 'Join the call first.'); };
  const pick = list => list[Math.floor(Math.random() * list.length)];
  // A fair shuffle (sorting by a random number isn't).
  const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  // Wordle Race ends once everyone still in the call who played is done (and at least two people
  // played, unless you're on your own). People who left the call don't hold the game up.
  function checkWordleOver(roomId, g) {
    if (g.type !== 'wordle' || g.over) return;
    const here = new Set(z.roomMembers(roomId));
    const players = Object.entries(g.players).filter(([id]) => here.has(id)).map(([, p]) => p);
    if (players.length && players.every(x => x.done) && players.length >= Math.min(2, here.size)) g.over = true;
  }
  function wordleScore(guess, word) {
    const res = Array(5).fill('miss'), left = {};
    for (let i = 0; i < 5; i++) { if (guess[i] === word[i]) res[i] = 'hit'; else left[word[i]] = (left[word[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (res[i] !== 'hit' && left[guess[i]]) { res[i] = 'near'; left[guess[i]]--; }
    return res;
  }
  // What one person sees of the game.
  function gameView(g, uid) {
    if (!g) return null;
    const base = { id: g.id, type: g.type, hostId: g.hostId, startedAt: g.startedAt, over: !!g.over, now: Date.now(), tonight: tonightOf(g.roomId), closeVote: closeVoteView(g) };
    if (g.type === 'wordle') {
      const players = Object.entries(g.players).map(([id, p]) => ({
        id, done: p.done, won: p.won, tries: p.rows.length, time: p.doneAt ? p.doneAt - g.startedAt : null,
        // Your own board has letters; everyone else's is just colours (until the game is over).
        rows: p.rows.map(r => ({ marks: r.marks, ...(id === uid || g.over ? { word: r.word } : {}) })),
      }));
      return { ...base, players, word: g.over ? g.word : undefined };
    }
    if (g.type === 'trivia') {
      const q = g.questions[g.round];
      return { ...base, round: g.round, rounds: g.questions.length, phase: g.phase, phaseEnds: g.phaseEnds, scores: g.scores,
        question: q ? { text: q[0], answers: q[1], right: g.phase === 'reveal' ? q[2] : undefined } : null,
        answered: Object.keys(g.answers), mine: g.answers[uid]?.pick ?? null,
        picks: g.phase === 'reveal' ? Object.fromEntries(Object.entries(g.answers).map(([id, a]) => [id, a.pick])) : undefined };
    }
    if (g.type === 'connect4') return { ...base, board: g.board, players: g.players, turn: g.turn, winner: g.winner, line: g.line, last: g.last, forfeit: g.forfeit || null };
    if (g.type === 'tictactoe') return { ...base, board: g.board, players: g.players, turn: g.turn, winner: g.winner, line: g.line, forfeit: g.forfeit || null };
    if (g.type === 'hangman') {
      // Letters only show once guessed (all of it once the game is over).
      const shown = [...g.word].map(ch => (/[a-z]/.test(ch) ? (g.over || g.guessed.includes(ch) ? ch : '_') : ch)).join('');
      return { ...base, shown, guessed: g.guessed, wrong: g.wrong, maxWrong: g.maxWrong, won: !!g.won, by: g.by, word: g.over ? g.word : undefined };
    }
    if (g.type === 'math' || g.type === 'scramble') {
      const q = g.qs[g.round];
      return { ...base, round: g.round, rounds: g.qs.length, phase: g.phase, phaseEnds: g.phaseEnds, scores: g.scores, solvedBy: g.solvedBy || null,
        question: q ? q.q : null, answer: g.phase !== 'ask' && q ? q.a : undefined, tries: g.tries?.[uid] || 0 };
    }
    if (g.type === 'rps') return { ...base, round: g.round, rounds: g.rounds, phase: g.phase, phaseEnds: g.phaseEnds, scores: g.scores, picked: Object.keys(g.picks || {}), mine: g.picks?.[uid] || null, last: g.phase !== 'pick' ? g.last || null : g.last || null };
    if (g.type === 'reaction') return { ...base, round: g.round, rounds: g.rounds, phase: g.phase, scores: g.scores, mine: g.clicks?.[uid] ? (g.clicks[uid].ms ?? 'early') : null, last: g.last || null };
    return base;
  }
  function tonightOf(roomId) {
    const t = tallies.get(roomId);
    if (!t) return null;
    const board = Object.entries(t).filter(([k]) => k !== '_games').sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, wins]) => ({ id, wins }));
    return { games: t._games || 0, board };
  }
  function pushGame(roomId) {
    const g = games.get(roomId) || null;
    if (g?.over) tallyGame(roomId, g);
    for (const id of z.roomMembers(roomId)) send(id, 'game', { room: roomId, game: gameView(g, id) });
  }
  // Trivia moves on by itself: 15 seconds to answer, 5 to see the answer.
  function triviaTick(roomId) {
    const g = games.get(roomId);
    if (!g || g.type !== 'trivia' || g.over) return;
    clearTimeout(g.timer);
    if (g.phase === 'ask') {
      const q = g.questions[g.round];
      for (const [id, a] of Object.entries(g.answers)) if (a.pick === q[2]) g.scores[id] = (g.scores[id] || 0) + 100 + Math.max(0, Math.round((g.phaseEnds - a.at) / 150));
      g.phase = 'reveal'; g.phaseEnds = Date.now() + 5000;
    } else {
      g.round++; g.answers = {};
      if (g.round >= g.questions.length) { g.over = true; g.phase = 'done'; pushGame(roomId); return; }
      g.phase = 'ask'; g.phaseEnds = Date.now() + 15000;
    }
    g.timer = setTimeout(() => triviaTick(roomId), g.phaseEnds - Date.now());
    pushGame(roomId);
  }
  function c4Winner(b, r, c) {
    const me = b[r][c];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [[r, c]];
      for (const s of [1, -1]) for (let k = 1; k < 4; k++) { const rr = r + dr * k * s, cc = c + dc * k * s; if (b[rr]?.[cc] === me) line.push([rr, cc]); else break; }
      if (line.length >= 4) return line;
    }
    return null;
  }
  // ---- 0.44: Quick Math and Word Scramble (first right answer scores) and Rock Paper Scissors.
  const SCRAMBLE = ['planet', 'guitar', 'pickle', 'rocket', 'wizard', 'jungle', 'castle', 'dragon', 'pirate', 'muffin', 'hockey', 'garden', 'bubble', 'cookie', 'monkey', 'sunset', 'island', 'turtle', 'violin', 'winter', 'camera', 'candle', 'button', 'parrot', 'zombie', 'puzzle', 'banana', 'tomato', 'kitten', 'laptop', 'galaxy', 'comet', 'ninja', 'tiger', 'pizza', 'robot', 'ocean', 'cloud', 'piano', 'lemon', 'magnet', 'meteor', 'cactus', 'walrus', 'noodle', 'shadow', 'thunder', 'blanket', 'popcorn', 'unicorn', 'penguin', 'volcano', 'dolphin', 'compass', 'lantern', 'pumpkin', 'balloon', 'tornado', 'sandwich', 'treasure'];
  function mathRound() {
    const r = Math.random(), n = k => 2 + Math.floor(Math.random() * k);
    if (r < 0.3) { const a = n(60), b = n(60); return { q: `${a} + ${b}`, a: String(a + b) }; }
    if (r < 0.55) { const a = n(80) + 20, b = n(a - 2); return { q: `${a} − ${b}`, a: String(a - b) }; }
    if (r < 0.85) { const a = n(11), b = n(11); return { q: `${a} × ${b}`, a: String(a * b) }; }
    const b = n(10), c = n(11); return { q: `${b * c} ÷ ${b}`, a: String(c) };
  }
  function scrambleRound(used) {
    let w; do w = pick(SCRAMBLE); while (used.has(w) && used.size < SCRAMBLE.length); used.add(w);
    let mixed; do mixed = shuffle([...w]).join(''); while (mixed === w);
    return { q: mixed.toUpperCase(), a: w };
  }
  const QUICK_ASK = { math: 12000, scramble: 25000 };
  function quickTick(roomId) {
    const g = games.get(roomId);
    if (!g || (g.type !== 'math' && g.type !== 'scramble') || g.over) return;
    clearTimeout(g.timer);
    if (g.phase === 'ask') { g.phase = 'reveal'; g.phaseEnds = Date.now() + 3000; }
    else {
      g.round++; g.tries = {}; g.solvedBy = null;
      if (g.round >= g.qs.length) { g.over = true; g.phase = 'done'; pushGame(roomId); return; }
      g.phase = 'ask'; g.phaseEnds = Date.now() + QUICK_ASK[g.type];
    }
    g.timer = setTimeout(() => quickTick(roomId), g.phaseEnds - Date.now());
    pushGame(roomId);
  }
  const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  function rpsTick(roomId) {
    const g = games.get(roomId);
    if (!g || g.type !== 'rps' || g.over) return;
    clearTimeout(g.timer);
    if (g.phase === 'pick') {
      // Every pick scores a point for each other pick it beats.
      const picks = Object.entries(g.picks);
      const pts = {};
      for (const [id, p] of picks) pts[id] = picks.filter(([o, q]) => o !== id && RPS_BEATS[p] === q).length;
      for (const [id, v] of Object.entries(pts)) g.scores[id] = (g.scores[id] || 0) + v;
      g.last = { picks: g.picks, pts };
      g.phase = 'reveal'; g.phaseEnds = Date.now() + 3500;
    } else {
      g.round++; g.picks = {};
      if (g.round >= g.rounds) { g.over = true; g.phase = 'done'; pushGame(roomId); return; }
      g.phase = 'pick'; g.phaseEnds = Date.now() + 12000;
    }
    g.timer = setTimeout(() => rpsTick(roomId), g.phaseEnds - Date.now());
    pushGame(roomId);
  }
  route('GET', '/api/games', async ({ me, query }) => {
    const roomId = String(query.get('room') || '');
    inCall(me, roomId);
    return { game: gameView(games.get(roomId), me.id) };
  });
  const GAME_TITLES = { wordle: 'Wordle Race', trivia: 'Trivia', connect4: 'Connect 4', tictactoe: 'Tic-tac-toe', hangman: 'Hangman', reaction: 'Reaction Race', math: 'Quick Math', scramble: 'Word Scramble', rps: 'Rock Paper Scissors' };
  route('POST', '/api/games/start', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    const type = ['wordle', 'trivia', 'connect4', 'tictactoe', 'hangman', 'reaction', 'math', 'scramble', 'rps'].includes(body.type) ? body.type : fail(400, 'Unknown game.');
    const cur = games.get(roomId);
    if (cur && !cur.over && cur.type === type) return { game: gameView(cur, me.id) };
    // (0.45.1) Starting another game while one is still going would end it for everyone, so it
    // needs the same vote as closing it (unless you're the only one in the call).
    if (cur && !cur.over && z.roomMembers(roomId).length > 1) fail(409, `${GAME_TITLES[cur.type] || 'A game'} is still going. Press ✕ on it to ask everyone to close it first.`);
    if (cur) { clearTimeout(cur.timer); clearTimeout(cur.voteTimer); }
    const g = { id: newId(), type, hostId: me.id, startedAt: Date.now(), roomId };
    if (type === 'wordle') Object.assign(g, { word: pick(WORDS.ANSWERS), players: {} });
    if (type === 'trivia') {
      // Questions in a random order, and each question's answers shuffled too (the lists put the right
      // answer second or third most of the time, which was easy to learn).
      const qs = shuffle([...WORDS.TRIVIA]).slice(0, 8).map(([text, answers, right]) => {
        const order = shuffle([0, 1, 2, 3]);
        return [text, order.map(i => answers[i]), order.indexOf(right)];
      });
      Object.assign(g, { questions: qs, round: 0, phase: 'ask', phaseEnds: Date.now() + 15000, answers: {}, scores: {} });
    }
    if (type === 'connect4') Object.assign(g, { board: Array.from({ length: 6 }, () => Array(7).fill(0)), players: [me.id, null], turn: 1, winner: null });
    if (type === 'tictactoe') Object.assign(g, { board: Array(9).fill(0), players: [me.id, null], turn: 1, winner: null });
    if (type === 'hangman') Object.assign(g, { word: pick(HANGMAN), guessed: [], wrong: 0, maxWrong: 6, by: {} });
    if (type === 'reaction') { Object.assign(g, { round: 0, rounds: 5, phase: 'wait', clicks: {}, scores: {} }); g.timer = setTimeout(() => reactionTick(roomId), 2200 + Math.random() * 3000); }
    if (type === 'math' || type === 'scramble') {
      const used = new Set();
      Object.assign(g, { qs: Array.from({ length: type === 'math' ? 10 : 6 }, () => (type === 'math' ? mathRound() : scrambleRound(used))), round: 0, phase: 'ask', phaseEnds: Date.now() + QUICK_ASK[type], scores: {}, tries: {}, solvedBy: null });
      g.timer = setTimeout(() => quickTick(roomId), QUICK_ASK[type]);
    }
    if (type === 'rps') { Object.assign(g, { round: 0, rounds: 5, phase: 'pick', phaseEnds: Date.now() + 12000, picks: {}, scores: {} }); g.timer = setTimeout(() => rpsTick(roomId), 12000); }
    games.set(roomId, g);
    if (type === 'trivia') g.timer = setTimeout(() => triviaTick(roomId), 15000);
    pushGame(roomId);
    // Tell the call's chat a game started (voice channels only).
    return { game: gameView(g, me.id) };
  });
  route('POST', '/api/games/move', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    const g = games.get(roomId);
    if (!g) fail(404, 'No game is running.');
    if (g.over) fail(400, 'This game is over.');
    if (g.type === 'wordle') {
      const guess = String(body.guess || '').toLowerCase();
      if (!/^[a-z]{5}$/.test(guess)) fail(400, 'Guesses are 5 letters.');
      if (!WORDS.VALID.has(guess) && !/[aeiouy]/.test(guess)) fail(400, "That's not a word.");
      const p = (g.players[me.id] ||= { rows: [], done: false, won: false });
      if (p.done) fail(400, "You're done with this one! Wait for the others.");
      const marks = wordleScore(guess, g.word);
      p.rows.push({ word: guess, marks });
      if (guess === g.word || p.rows.length >= 6) { p.done = true; p.won = guess === g.word; p.doneAt = Date.now(); }
      // Everyone in the call who played has finished: show the word.
      checkWordleOver(roomId, g);
    } else if (g.type === 'trivia') {
      if (g.phase !== 'ask') fail(400, 'Wait for the next question.');
      const n = Number(body.pick);
      if (!(n >= 0 && n < 4)) fail(400, 'Pick an answer.');
      if (g.answers[me.id]) fail(400, 'You already answered.');
      if (Date.now() > g.phaseEnds) fail(400, "Time's up for this one!");
      g.answers[me.id] = { pick: n, at: Date.now() };
      // Everyone answered: reveal straight away.
      if (z.roomMembers(roomId).every(id => g.answers[id])) { triviaTick(roomId); return { game: gameView(g, me.id) }; }
    } else if (g.type === 'tictactoe') {
      if (!g.players[1] && me.id !== g.players[0]) g.players[1] = me.id;
      const mark = g.players.indexOf(me.id) + 1;
      if (!mark) fail(403, 'Two people are already playing. Watch, or start a new game after!');
      if (mark !== g.turn) fail(400, "It's not your turn.");
      const i = Number(body.cell);
      if (!(i >= 0 && i < 9) || g.board[i]) fail(400, 'Pick an empty square.');
      g.board[i] = mark;
      const line = TTT_LINES.find(l => l.every(k => g.board[k] === mark));
      if (line) { g.winner = me.id; g.line = line; g.over = true; }
      else if (g.board.every(Boolean)) { g.over = true; g.winner = null; }
      else g.turn = mark === 1 ? 2 : 1;
    } else if (g.type === 'hangman') {
      const ch = String(body.letter || '').toLowerCase();
      if (!/^[a-z]$/.test(ch)) fail(400, 'Pick a letter.');
      if (g.guessed.includes(ch)) fail(400, 'Someone already tried that letter.');
      g.guessed.push(ch); g.by[ch] = me.id;
      if (!g.word.includes(ch)) g.wrong++;
      const solved = [...g.word].every(c => !/[a-z]/.test(c) || g.guessed.includes(c));
      if (solved) { g.over = true; g.won = true; } else if (g.wrong >= g.maxWrong) { g.over = true; g.won = false; }
    } else if (g.type === 'reaction') {
      if (g.clicks[me.id]) fail(400, 'You already went this round.');
      if (g.phase === 'wait') g.clicks[me.id] = { ms: null }; // false start
      else if (g.phase === 'go') g.clicks[me.id] = { ms: Date.now() - g.goAt };
      else fail(400, 'Wait for the next round.');
      // Everyone in the call has gone: show the result straight away.
      if (g.phase === 'go' && z.roomMembers(roomId).every(id => g.clicks[id])) reactionTick(roomId);
    } else if (g.type === 'math' || g.type === 'scramble') {
      if (g.phase !== 'ask') fail(400, 'Wait for the next one.');
      const guess = String(body.answer || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!guess || guess.length > 20) fail(400, 'Type an answer.');
      g.tries[me.id] = (g.tries[me.id] || 0) + 1;
      if (g.tries[me.id] > 5) fail(400, 'Out of tries for this one!');
      if (guess === g.qs[g.round].a) { g.scores[me.id] = (g.scores[me.id] || 0) + 1; g.solvedBy = me.id; quickTick(roomId); return { game: gameView(g, me.id), right: true }; }
      pushGame(roomId);
      return { game: gameView(g, me.id), right: false };
    } else if (g.type === 'rps') {
      if (g.phase !== 'pick') fail(400, 'Wait for the next round.');
      const p = String(body.pick || '');
      if (!RPS_BEATS[p]) fail(400, 'Pick rock, paper or scissors.');
      if (g.picks[me.id]) fail(400, 'You already picked.');
      g.picks[me.id] = p;
      const here = z.roomMembers(roomId);
      if (here.length > 1 && here.every(id => g.picks[id])) { rpsTick(roomId); return { game: gameView(g, me.id) }; }
    } else if (g.type === 'connect4') {
      if (!g.players[1] && me.id !== g.players[0]) g.players[1] = me.id; // the second player is whoever moves first
      const mark = g.players.indexOf(me.id) + 1;
      if (!mark) fail(403, 'Two people are already playing. Watch, or start a new game after!');
      if (mark !== g.turn) fail(400, "It's not your turn.");
      const c = Number(body.col);
      if (!(c >= 0 && c < 7)) fail(400, 'Pick a column.');
      let r = 5; while (r >= 0 && g.board[r][c]) r--;
      if (r < 0) fail(400, 'That column is full.');
      g.board[r][c] = mark; g.last = [r, c];
      const line = c4Winner(g.board, r, c);
      if (line) { g.winner = me.id; g.line = line; g.over = true; }
      else if (g.board[0].every(Boolean)) { g.over = true; g.winner = null; }
      else g.turn = mark === 1 ? 2 : 1;
    }
    pushGame(roomId);
    return { game: gameView(g, me.id) };
  });
  // (0.45) Closing a game that's still going is a vote: more than half of the people in the call
  // have to say yes. Everyone sees who voted yes and who voted no. A finished game, or a call with
  // just you in it, closes straight away.
  const VOTE_MS = 30000;
  function closeVoteView(g) {
    const v = g.closeVote;
    if (!v) return null;
    const here = z.roomMembers(g.roomId).length || 1;
    return { by: v.by, yes: [...v.yes], no: [...v.no], endsAt: v.endsAt, need: Math.floor(here / 2) + 1, here };
  }
  function endGame(roomId) {
    const g = games.get(roomId);
    if (g) { clearTimeout(g.timer); clearTimeout(g.voteTimer); games.delete(roomId); }
    pushGame(roomId);
  }
  // Counts the vote: closes the game, or drops the vote once it can't pass.
  function tallyClose(roomId, g) {
    const v = g.closeVote;
    if (!v) return;
    const here = z.roomMembers(roomId);
    for (const id of [...v.yes, ...v.no]) if (!here.includes(id)) { v.yes.delete(id); v.no.delete(id); }
    const need = Math.floor(here.length / 2) + 1;
    if (v.yes.size >= need) { for (const id of here) send(id, 'game-vote', { room: roomId, result: 'closed', yes: [...v.yes], no: [...v.no] }); return endGame(roomId); }
    if (here.length - v.no.size < need) {
      clearTimeout(g.voteTimer); g.closeVote = null;
      for (const id of here) send(id, 'game-vote', { room: roomId, result: 'kept', yes: [...v.yes], no: [...v.no] });
    }
    pushGame(roomId);
  }
  route('POST', '/api/games/stop', async ({ me, body }) => {
    const roomId = String(body.room || '');
    const g = games.get(roomId);
    // Whoever started it can still close it if their call dropped.
    if (!(g && g.hostId === me.id && !z.roomMembers(roomId).includes(me.id))) inCall(me, roomId);
    const here = z.roomMembers(roomId);
    if (!g || g.over || here.length <= 1 || !here.includes(me.id)) { endGame(roomId); return { ok: true }; }
    if (!g.closeVote) {
      g.closeVote = { by: me.id, yes: new Set([me.id]), no: new Set(), endsAt: Date.now() + VOTE_MS };
      g.voteTimer = setTimeout(() => {
        if (games.get(roomId) !== g || !g.closeVote) return;
        const v = g.closeVote; g.closeVote = null;
        for (const id of z.roomMembers(roomId)) send(id, 'game-vote', { room: roomId, result: 'expired', yes: [...v.yes], no: [...v.no] });
        pushGame(roomId);
      }, VOTE_MS);
    } else { g.closeVote.no.delete(me.id); g.closeVote.yes.add(me.id); }
    tallyClose(roomId, g);
    return { ok: true, vote: games.has(roomId) && !!games.get(roomId)?.closeVote };
  });
  route('POST', '/api/games/close-vote', async ({ me, body }) => {
    const roomId = String(body.room || '');
    inCall(me, roomId);
    const g = games.get(roomId);
    if (!g?.closeVote) fail(400, 'There is no vote right now.');
    const v = g.closeVote;
    if (body.yes) { v.no.delete(me.id); v.yes.add(me.id); } else { v.yes.delete(me.id); v.no.add(me.id); }
    tallyClose(roomId, g);
    return { ok: true };
  });
  // Someone leaving can make a close vote pass (or fail).
  hooks.roomChange.push((roomId, uid, what) => { const g = games.get(roomId); if (what !== 'join' && g?.closeVote) tallyClose(roomId, g); });
  hooks.roomChange.push((roomId, uid, what, room) => {
    if (what === 'join' && games.has(roomId)) setTimeout(() => send(uid, 'game', { room: roomId, game: gameView(games.get(roomId), uid) }), 500);
    if (what !== 'join' && !room?.size) { clearTimeout(games.get(roomId)?.timer); games.delete(roomId); tallies.delete(roomId); return; }
    // Someone left a game that's still going: don't leave everyone else stuck waiting for them.
    const g = what !== 'join' && games.get(roomId);
    if (!g || g.over) return;
    if (g.type === 'wordle') { checkWordleOver(roomId, g); pushGame(roomId); }
    if ((g.type === 'connect4' || g.type === 'tictactoe') && g.players.includes(uid)) {
      const other = g.players.find(id => id && id !== uid) || null;
      g.over = true; g.winner = other; g.forfeit = uid;
      pushGame(roomId);
    }
    // Everyone left in the call has answered this trivia question: no need to wait for the timer.
    if (g.type === 'trivia' && g.phase === 'ask' && room?.size && [...room.keys()].every(id => g.answers[id])) triviaTick(roomId);
  });

  // ======================= Discover: categories & trending =======================
  // The Discover home page: trending this week (new members and messages), rising newcomers, and a
  // row per category. Worked out at most every 10 minutes, since it looks through recent messages.
  let discoverCache = { at: 0, scores: new Map() };
  function discoverScores() {
    if (Date.now() - discoverCache.at < 10 * 60e3) return discoverCache.scores;
    const week = Date.now() - 7 * 864e5, scores = new Map();
    for (const sv of Object.values(data.servers)) {
      if (!sv.discoverable && !sv.official) continue;
      const joins = sv.members.filter(id => (data.users[id]?.joinedAt?.[sv.id] || 0) > week && !data.users[id]?.bot).length;
      let msgs = 0, talkers = new Set();
      for (const ch of sv.channels) {
        const list = data.channelMessages[ch.id]?.messages || [];
        for (let i = list.length - 1; i >= 0 && list[i].createdAt > week; i--) { msgs++; talkers.add(list[i].authorId); }
      }
      scores.set(sv.id, { joins, msgs, talkers: talkers.size, score: joins * 6 + Math.min(msgs, 2000) / 10 + talkers.size * 3 });
    }
    discoverCache = { at: Date.now(), scores };
    return scores;
  }
  z.discoverScores = discoverScores;
  route('GET', '/api/discover-home', async ({ me }) => {
    const scores = discoverScores();
    const listed = Object.values(data.servers).filter(sv => (sv.discoverable || sv.official) && !(sv.bans || []).some(b => b.userId === me.id));
    const card = sv => ({ ...z.invitePreview(sv, me), trend: scores.get(sv.id) || null });
    const sc = sv => scores.get(sv.id)?.score || 0;
    const trending = listed.filter(sv => sc(sv) > 0).sort((a, b) => sc(b) - sc(a)).slice(0, 8).map(card);
    const rising = listed.filter(sv => Date.now() - sv.createdAt < 30 * 864e5).sort((a, b) => sc(b) - sc(a) || b.createdAt - a.createdAt).slice(0, 8).map(card);
    const categories = z.DISCOVERY_TAGS.map(tag => ({ tag, servers: listed.filter(sv => (sv.tags || []).includes(tag)).sort((a, b) => sc(b) - sc(a) || b.members.length - a.members.length).slice(0, 10).map(card) })).filter(c => c.servers.length);
    return { trending, rising, categories, total: listed.length };
  });

  // ======================= server ban appeals =======================
  // Someone banned from a server can ask to come back (once per ban; again 30 days after a no).
  // People who can ban members see appeals in Server Settings › Bans and say yes (unban) or no.
  const banOf = (sv, uid) => (sv.bans || []).find(b => b.userId === uid);
  route('GET', '/api/me/server-bans', async ({ me }) => ({
    bans: Object.values(data.servers).map(sv => [sv, banOf(sv, me.id)]).filter(([, b]) => b).map(([sv, b]) => ({
      serverId: sv.id, name: sv.name, icon: sv.icon || null, iconColor: sv.iconColor, reason: b.reason || '', at: b.at,
      appeal: b.appeal ? { status: b.appeal.status, at: b.appeal.at, note: b.appeal.note || '', decidedAt: b.appeal.decidedAt || null } : null,
      canAppeal: !b.appeal || (b.appeal.status === 'denied' && Date.now() - (b.appeal.decidedAt || 0) > 30 * 864e5),
    })),
  }));
  route('POST', '/api/servers/:id/appeal', async ({ me, params, body }) => {
    const sv = data.servers[params.id];
    const b = sv && banOf(sv, me.id);
    if (!b) fail(404, "You aren't banned from that server.");
    if (b.appeal && !(b.appeal.status === 'denied' && Date.now() - (b.appeal.decidedAt || 0) > 30 * 864e5)) fail(400, b.appeal.status === 'pending' ? 'Your appeal is waiting for the moderators.' : 'You can appeal again 30 days after a decision.');
    const text = clean(body.text, 1000);
    if (text.length < 10) fail(400, 'Tell them a little more (at least 10 characters).');
    z.limit('srv-appeal:' + me.id, 5, 3600e3);
    b.appeal = { text, at: Date.now(), status: 'pending' };
    save();
    for (const id of sv.members) if (z.can(sv, id, 'ban_members')) send(id, 'server-appeals', { serverId: sv.id });
    return { ok: true };
  });
  route('GET', '/api/servers/:id/appeals', async ({ me, params }) => {
    const sv = z.getManagedServer(me, params.id, 'ban_members');
    return { appeals: (sv.bans || []).filter(b => b.appeal).sort((a, b) => (a.appeal.status === 'pending' ? -1 : 1) - (b.appeal.status === 'pending' ? -1 : 1) || b.appeal.at - a.appeal.at).map(b => ({
      user: publicUser(data.users[b.userId]), reason: b.reason || '', bannedAt: b.at, bannedBy: data.users[b.by]?.displayName || '', appeal: b.appeal,
    })).filter(x => x.user) };
  });
  route('POST', '/api/servers/:id/appeals/:userId', async ({ me, params, body }) => {
    const sv = z.getManagedServer(me, params.id, 'ban_members');
    const b = banOf(sv, params.userId);
    if (!b?.appeal || b.appeal.status !== 'pending') fail(404, 'That appeal is gone or already decided.');
    const yes = body.decision === 'approve', note = clean(body.note, 300);
    Object.assign(b.appeal, { status: yes ? 'approved' : 'denied', decidedAt: Date.now(), decidedBy: me.id, note });
    const u = data.users[params.userId];
    if (yes) {
      sv.bans = sv.bans.filter(x => x !== b);
      if (sv.official) sv.removedUsers = (sv.removedUsers || []).filter(id => id !== params.userId);
      z.audit(sv, me, 'member_unban', { type: 'member', id: params.userId, name: u?.displayName || '?' }, 'Appeal approved');
    }
    save(); z.refreshServer(sv);
    z.systemMessage(params.userId, yes
      ? `✅ **Your appeal to ${sv.name} was accepted.** You can join again with an invite or from Discover.${note ? `\n\nFrom the moderators: ${note}` : ''}`
      : `Your appeal to **${sv.name}** wasn't accepted.${note ? `\n\nFrom the moderators: ${note}` : ''}\n\nYou can appeal again in 30 days.`);
    return { ok: true };
  });

  // ======================= Bloom gifting events =======================
  // The founder starts one from the admin dashboard. While it runs, everyone who gifts Bloom gets
  // the Gift Giver badge, and Zuno counts the gifts towards a goal everyone can see.
  data.giftEvent ||= null;
  const giftEventLive = () => { const e = data.giftEvent; return e && e.startsAt <= Date.now() && e.endsAt > Date.now() ? e : null; };
  const giftEventView = () => { const e = data.giftEvent; return e && e.endsAt > Date.now() ? { name: e.name, startsAt: e.startsAt, endsAt: e.endsAt, goal: e.goal, gifts: e.gifts || 0, givers: (e.givers || []).length, live: !!giftEventLive() } : null; };
  hooks.giftDelivered.push((from, to, months) => {
    const e = giftEventLive();
    if (!e || !from) return;
    e.gifts = (e.gifts || 0) + months;
    e.givers = [...new Set([...(e.givers || []), from.id])];
    if (!(from.badgeGrants || []).includes('gifter')) { from.badgeGrants = [...(from.badgeGrants || []), 'gifter']; broadcastUser(from); z.systemMessage(from.id, `🎁 **Thank you for gifting Bloom during ${e.name}!** You've earned the **Gift Giver** badge.`); }
    save();
    for (const id of Object.keys(data.users)) if (z.isOnline?.(id)) send(id, 'gift-event', giftEventView());
  });
  route('GET', '/api/gift-event', async () => ({ event: giftEventView() }));
  hooks.meExtras.push(() => ({ giftEvent: giftEventView() }));

  // ======================= the bot marketplace =======================
  // Every public bot in one place, with categories, ratings and reviews. Anyone who can manage bots
  // in a server can add one from here; reviews are from people who've had it in a server.
  const BOT_CATEGORIES = ['Moderation', 'Fun', 'Music', 'Games', 'Utility', 'Social', 'Economy', 'Other'];
  data.botReviews ||= {}; // botId -> { userId: { stars, text, at } }
  const ratingOf = id => { const r = Object.values(data.botReviews[id] || {}); return { avg: r.length ? Math.round((r.reduce((n, x) => n + x.stars, 0) / r.length) * 10) / 10 : 0, count: r.length }; };
  const botServers = id => Object.values(data.servers).filter(sv => sv.members.includes(id)).length;
  // Zuno's own bots get a sensible category.
  const BUILTIN_CAT = { guardian: 'Moderation', greeter: 'Social', party: 'Fun', levels: 'Social', reminders: 'Utility', polls: 'Utility', starboard: 'Social', warden: 'Moderation' };
  const catOf = u => u.app.category || BUILTIN_CAT[u.app.builtin] || 'Other';
  const marketCard = (u, me) => ({ ...z.appView(u, me), serverCount: botServers(u.id), rating: ratingOf(u.id), category: catOf(u), builtin: !!u.app.builtin, tagline: u.app.tagline || '', createdAt: u.createdAt });
  route('GET', '/api/marketplace', async ({ me, query }) => {
    const q = clean(query.get('q'), 40).toLowerCase(), cat = String(query.get('category') || ''), sort = String(query.get('sort') || 'popular');
    let list = Object.values(data.users).filter(u => z.devBot(u) && !u.app?.deleted && u.app?.public && (u.app.builtin || u.app.listed));
    if (q) list = list.filter(u => u.displayName.toLowerCase().includes(q) || (u.app.description || '').toLowerCase().includes(q) || (u.app.tagline || '').toLowerCase().includes(q));
    if (cat) list = list.filter(u => catOf(u) === cat);
    const cards = list.map(u => marketCard(u, me));
    cards.sort(sort === 'rated' ? (a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count : sort === 'new' ? (a, b) => b.createdAt - a.createdAt : (a, b) => b.serverCount - a.serverCount);
    const counts = Object.fromEntries(BOT_CATEGORIES.map(c => [c, Object.values(data.users).filter(u => z.devBot(u) && !u.app?.deleted && u.app?.public && (u.app.builtin || u.app.listed) && catOf(u) === c).length]));
    return { bots: cards.slice(0, 60), categories: BOT_CATEGORIES, counts };
  });
  route('GET', '/api/marketplace/:id', async ({ me, params }) => {
    const u = data.users[params.id];
    if (!z.devBot(u) || u.app?.deleted || !u.app?.public) fail(404, "That bot isn't in the marketplace.");
    const reviews = Object.entries(data.botReviews[u.id] || {}).sort((a, b) => b[1].at - a[1].at).slice(0, 50).map(([uid, r]) => ({ user: publicUser(data.users[uid]), ...r })).filter(r => r.user);
    const usedIt = Object.values(data.servers).some(sv => sv.members.includes(u.id) && sv.members.includes(me.id));
    return { bot: { ...marketCard(u, me), commands: u.app.commands || [], owner: publicUser(data.users[u.app.ownerId]) }, reviews, mine: data.botReviews[u.id]?.[me.id] || null, canReview: usedIt && u.app.ownerId !== me.id };
  });
  route('PUT', '/api/marketplace/:id/review', async ({ me, params, body }) => {
    const u = data.users[params.id];
    if (!z.devBot(u) || u.app?.deleted || !u.app?.public) fail(404, "That bot isn't in the marketplace.");
    if (u.app.ownerId === me.id) fail(400, "You can't review your own bot.");
    if (!Object.values(data.servers).some(sv => sv.members.includes(u.id) && sv.members.includes(me.id))) fail(403, 'Use the bot in a server first, then review it.');
    const stars = Math.round(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Pick 1 to 5 stars.');
    const text = clean(body.text, 500);
    if (text) await z.judgeText({ review: text });
    (data.botReviews[u.id] ||= {})[me.id] = { stars, text, at: Date.now() };
    save();
    return { rating: ratingOf(u.id) };
  });
  route('DELETE', '/api/marketplace/:id/review', async ({ me, params, query }) => {
    // Your own review, or anyone's for Zuno Staff.
    const uid = query.get('user') && z.isStaff(me) ? query.get('user') : me.id;
    if (data.botReviews[params.id]) delete data.botReviews[params.id][uid];
    save();
    return { rating: ratingOf(params.id) };
  });
  // Bot owners pick a category and a one-line tagline (Settings › Developer).
  route('PATCH', '/api/apps/:id/listing', async ({ me, params, body }) => {
    const u = data.users[params.id];
    if (!z.devBot(u) || u.app?.ownerId !== me.id) fail(404, "That bot isn't yours.");
    if ('category' in body) u.app.category = BOT_CATEGORIES.includes(body.category) ? body.category : 'Other';
    if ('tagline' in body) { const t = clean(body.tagline, 80); if (t) await z.judgeText({ tagline: t }); u.app.tagline = t; }
    save();
    return { app: marketCard(u, me) };
  });

  // ======================= the founder's admin dashboard =======================
  // Only the founder (CONFIG.FOUNDER) can open it: people, activity, money, moderation queues and
  // how the server itself is doing, plus the switch for gifting events.
  // (0.57.2) Zuno Managers can use the Admin Dashboard too (downloading the code stays founder-only).
  const needFounder = me => { if (!z.isFounder(me.id) && !z.isManager(me)) fail(403, 'Only the founder and Zuno Managers can see this.'); };
  route('GET', '/api/admin/dashboard', async ({ me }) => {
    needFounder(me);
    const now = Date.now(), day = 864e5;
    const people = Object.values(data.users).filter(u => !u.bot && !u.system && !u.deleted);
    const days = 30, signups = Array(days).fill(0), messages = Array(14).fill(0), activeDays = Array(14).fill(null).map(() => new Set());
    const dayIdx = (t, n) => n - 1 - Math.floor((now - t) / day);
    for (const u of people) { const i = dayIdx(u.createdAt || 0, days); if (i >= 0 && i < days) signups[i]++; }
    for (const map of ['channelMessages', 'dms', 'groupMessages']) for (const conv of Object.values(data[map] || {})) {
      const list = conv.messages || [];
      for (let i = list.length - 1; i >= 0 && list[i].createdAt > now - 14 * day; i--) { const k = dayIdx(list[i].createdAt, 14); if (k >= 0) { messages[k]++; activeDays[k].add(list[i].authorId); } }
    }
    const lastSeen = {};
    for (const s of Object.values(data.sessions)) if (s && typeof s === 'object') lastSeen[s.uid] = Math.max(lastSeen[s.uid] || 0, s.lastSeen || 0);
    const active = n => people.filter(u => (lastSeen[u.id] || 0) > now - n).length;
    const bloomPaid = people.filter(u => (u.bloom?.paidUntil || 0) > now).length;
    const bloomGift = people.filter(u => (u.bloom?.giftUntil || 0) > now && !((u.bloom?.paidUntil || 0) > now)).length;
    const price = Number(String(CONFIG_PRICE()).replace(/[^\d.]/g, '')) || 5;
    const servers = Object.values(data.servers);
    const topServers = servers.map(sv => ({ id: sv.id, name: sv.name, members: sv.members.filter(id => !data.users[id]?.bot).length, msgs7: discoverScores().get(sv.id)?.msgs ?? null })).sort((a, b) => b.members - a.members).slice(0, 8);
    const mem = process.memoryUsage();
    // Every message Zuno has is kept in memory, so this is the number that decides how much room is left.
    const storedMessageCount = () => ['dms', 'channelMessages', 'groupMessages', 'threads'].reduce((n, k) => n + Object.values(data[k] || {}).reduce((m, c) => m + (c?.messages?.length || 0), 0), 0);
    return {
      people: { total: people.length, online: people.filter(u => z.isOnline?.(u.id)).length, active24h: active(day), active7d: active(7 * day), active30d: active(30 * day), signups, newToday: signups[days - 1], newWeek: signups.slice(-7).reduce((a, b) => a + b, 0) },
      activity: { messages, activeUsers: activeDays.map(s => s.size), servers: servers.length, groups: Object.keys(data.groups || {}).length, calls: [...(z.rooms?.values?.() || [])].filter(r => r.size).length },
      money: { bloomPaid, bloomGift, monthly: Math.round(bloomPaid * price * 100) / 100, price },
      moderation: { reports: Object.values(data.reports || {}).filter(r => r.status === 'open').length, appeals: Object.values(data.users).filter(u => u.banned?.appeal?.status === 'pending').length, bugs: Object.values(data.bugs || {}).filter(b => !b.status || b.status === 'new').length, banned: Object.values(data.users).filter(u => u.banned && !u.banned.restored).length },
      topServers,
      system: { version: z.PKG?.version, uptime: Math.round(process.uptime()), memoryMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576), memoryLimitMB: Number(process.env.ZUNO_MEMORY_MB) || 512, storedMessages: storedMessageCount(), logins: Object.keys(data.sessions || {}).length, node: process.version, aiJudge: !!process.env.ANTHROPIC_API_KEY, turnstile: !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY), cloudStorage: !!process.env.S3_BUCKET, email: !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY), stripe: !!process.env.STRIPE_SECRET_KEY },
      giftEvent: data.giftEvent,
      siteUpdate: data.siteUpdate || null,
    };
  });
  // ======================= website update publisher =======================
  // Publishing sends a durable release notice to every account. The browser shows a
  // confirmation popup and reloads only after the user chooses Update now.
  route('GET', '/api/site-update', async () => ({ update: data.siteUpdate || null }));
  route('POST', '/api/admin/site-update', async ({ me, body }) => {
    needFounder(me);
    const title = clean(body.title, 100);
    const version = clean(body.version, 32);
    const summary = clean(body.summary, 2000);
    const fixes = (Array.isArray(body.fixes) ? body.fixes : String(body.fixes || '').split(/\r?\n/))
      .map(x => clean(x, 240)).filter(Boolean).slice(0, 20);
    if (!title || !summary) fail(400, 'Add an update title and description before publishing.');
    const update = {
      id: newId(), version: version || (z.PKG?.version || 'latest'), title, summary, fixes,
      publishedAt: Date.now(), publishedBy: me.id,
    };
    data.siteUpdate = update;
    save();
    for (const id of Object.keys(data.users)) if (!data.users[id]?.system) send(id, 'site-update', update);
    return { update };
  });
  route('PUT', '/api/admin/gift-event', async ({ me, body }) => {
    needFounder(me);
    if (body.stop) { data.giftEvent = null; save(); return { event: null }; }
    const name = clean(body.name, 60) || 'Gifting Week';
    const days = Math.max(1, Math.min(31, Math.round(Number(body.days) || 7)));
    data.giftEvent = { name, startsAt: Date.now(), endsAt: Date.now() + days * 864e5, goal: Math.max(1, Math.min(100000, Math.round(Number(body.goal) || 100))), gifts: 0, givers: [] };
    save();
    for (const id of Object.keys(data.users)) if (z.isOnline?.(id)) send(id, 'gift-event', giftEventView());
    return { event: data.giftEvent };
  });
  const CONFIG_PRICE = () => z.CONFIG?.BLOOM_PRICE || '$5';
};
