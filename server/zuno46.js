'use strict';
// Zuno 0.45.2: more for the free Zuno bots, and Warden, a moderation bot that does a bit of everything.
// The bots themselves live in features.js; this file adds commands and settings through feat.zb.
module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, newId, send } = z;
  const zb = z.feat.zb;
  const { ZBOTS, DEFAULT_CFG, ZB_EXT, cfgOf, botSay, inServer, zbotId, channelIn, mention, levelOf, pick } = zb;
  const BASE_PERMS = ['view_channels', 'send_messages', 'add_reactions', 'read_history', 'attach_files', 'use_commands'];
  const addCmds = (key, list) => { for (const c of list) if (!ZBOTS[key].commands.some(x => x[0] === c[0])) ZBOTS[key].commands.push(c); };
  const sha = s => z.sha(String(s));
  const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ts = (ms, f = 'R') => `<t:${Math.floor(ms / 1000)}:${f}>`;
  // "1h30m", "10m", "2d" → milliseconds
  const parseDur = s => {
    const str = String(s || '').toLowerCase().trim();
    if (!/^(\d{1,4}\s*(s|sec|secs|m|min|mins|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\s*)+$/.test(str)) return 0;
    let ms = 0;
    for (const m of str.matchAll(/(\d{1,4})\s*([a-z]+)/g)) ms += Number(m[1]) * { s: 1e3, m: 60e3, h: 3600e3, d: 864e5, w: 6048e5 }[m[2][0]];
    return ms;
  };
  const durText = ms => {
    const parts = [];
    for (const [n, w] of [[864e5, 'day'], [3600e3, 'hour'], [60e3, 'minute'], [1e3, 'second']]) { const k = Math.floor(ms / n); if (k) { parts.push(plural(k, w)); ms -= k * n; } if (parts.length === 2) break; }
    return parts.join(' ') || '0 seconds';
  };
  // Finds a member from "@name", "name" or their display name.
  function findMember(sv, word) {
    const w = String(word || '').replace(/^@/, '').trim().toLowerCase();
    if (!w) return null;
    const list = sv.members.map(id => data.users[id]).filter(Boolean);
    return list.find(u => u.username === w) || list.find(u => (sv.nicks?.[u.id] || '').toLowerCase() === w) || list.find(u => (u.displayName || '').toLowerCase() === w) || null;
  }
  // "/warn @bob being rude" → { who: bob, rest: 'being rude' }
  const splitTarget = (sv, args) => { const [first, ...rest] = String(args || '').trim().split(/\s+/); return { who: findMember(sv, first), word: first || '', rest: rest.join(' ').trim() }; };

  // ======================= Party: lots more fun commands =======================
  ZBOTS.party.desc = 'Fun commands: dice, coins, the magic 8-ball, would you rather, truth or dare, slots, duels, hugs and more.';
  addCmds('party', [['wyr', 'Would you rather…'], ['truth', 'A truth question'], ['dare', 'A (harmless) dare'], ['fact', 'A random fun fact'], ['compliment', 'Say something nice', '@someone'], ['fortune', 'Open a fortune cookie'],
    ['hug', 'Hug someone', '@someone'], ['highfive', 'High five someone', '@someone'], ['slots', 'Spin the slot machine'], ['duel', 'Dice duel against someone', '@someone'], ['number', 'Random number', '1 100'],
    ['card', 'Draw a playing card'], ['reverse', 'Write text backwards', 'hello'], ['mock', 'wRiTe LiKe ThIs', 'text'], ['emojify', 'Turn text into big letters', 'hi']]);
  const WYR = ['be able to fly or be invisible?', 'always be 10 minutes late or 20 minutes early?', 'have unlimited pizza or unlimited tacos?', 'live in space or under the sea?', 'never use the internet again or never watch TV again?', 'talk to animals or speak every language?', 'have a rewind button or a pause button for your life?', 'be the funniest person in the room or the smartest?', 'only whisper or only shout?', 'have a pet dragon or a pet dinosaur?', 'be famous for something silly or unknown for something great?', 'explore the deep ocean or outer space?', 'give up music or give up movies?', 'have super speed or super strength?', 'live without your phone for a month or without snacks for a month?'];
  const TRUTH = ["What's the most embarrassing song on your playlist?", "What's a weird food combo you secretly love?", "What's the last thing you searched online?", 'Who in this server would survive a zombie apocalypse the longest?', "What's your most useless talent?", "What's the silliest thing you've ever cried about?", "What's a hobby you'd love to try but haven't?", "What's the worst haircut you've ever had?", "What's your go-to excuse for being late?", 'If you could swap lives with someone here for a day, who?', "What's a movie everyone loves but you don't?", "What's the strangest dream you remember?"];
  const DARE = ['Send the 5th picture in your camera roll (if it\'s safe!).', 'Type your next message with your eyes closed.', 'Change your status to something funny for an hour.', 'Describe your day using only emoji.', 'Compliment the person who sent the last message.', 'Write a two-line poem about the last thing you ate.', 'Talk like a pirate for your next 3 messages.', 'Share your favourite meme.', 'Use only capital letters for 2 minutes. (Guardian might not like it!)', 'Tell us your most-used emoji and why.', 'Rename yourself something silly in this server for 10 minutes.', 'Send a voice message saying "I love this server".'];
  const FACTS = ['Octopuses have three hearts. 🐙', 'Honey never spoils. Archaeologists have eaten 3,000-year-old honey. 🍯', 'Bananas are berries, but strawberries aren\'t. 🍌', 'A day on Venus is longer than its year. 🪐', 'Sharks existed before trees. 🦈', 'Wombat poop is cube-shaped. 🟫', 'There are more stars in the universe than grains of sand on Earth. ✨', 'A group of flamingos is called a "flamboyance". 🦩', 'Cows have best friends and get stressed when apart. 🐄', 'The Eiffel Tower grows about 15 cm taller in summer. 🗼', 'Sea otters hold hands while they sleep. 🦦', 'Your nose can remember around 50,000 smells. 👃', 'Butterflies taste with their feet. 🦋', 'The shortest war in history lasted 38 minutes. ⏱️', 'A bolt of lightning is about five times hotter than the Sun\'s surface. ⚡'];
  const NICE = ['has the best taste in music. 🎧', 'makes this server 100% better. 💯', 'is cooler than the other side of the pillow. 😎', 'always brings good vibes. ✨', 'is genuinely one of a kind. 🌟', 'has a laugh that could fix any bad day. 😄', 'is smarter than they give themselves credit for. 🧠', 'is the main character today. 🎬', 'deserves a snack and a nap. 🍪', 'is a certified legend. 🏆'];
  const FORTUNE = ['A pleasant surprise is waiting for you.', 'Today is a good day to try something new.', 'Someone in this server is thinking about you (probably about your memes).', 'Your hard work is about to pay off.', 'Adventure is closer than you think.', 'A snack in the hand is worth two in the fridge.', 'You will soon find the thing you lost.', 'Laughter is in your near future.', 'Be bold. The world rewards it.', 'Good news will arrive by message.'];
  const SLOTS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '7️⃣'];
  const SUITS = ['♠️', '♥️', '♦️', '♣️'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const BIG = { a: '🇦', b: '🇧', c: '🇨', d: '🇩', e: '🇪', f: '🇫', g: '🇬', h: '🇭', i: '🇮', j: '🇯', k: '🇰', l: '🇱', m: '🇲', n: '🇳', o: '🇴', p: '🇵', q: '🇶', r: '🇷', s: '🇸', t: '🇹', u: '🇺', v: '🇻', w: '🇼', x: '🇽', y: '🇾', z: '🇿', 0: '0️⃣', 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', '!': '❗', '?': '❓' };
  ZB_EXT.command.party = ({ sv, me, command, args, say }) => {
    const name = command.name, other = findMember(sv, (args || '').split(/\s+/)[0]);
    const r = (() => {
      if (name === 'wyr') return `🤔 **Would you rather** ${pick(WYR)}`;
      if (name === 'truth') return `🫣 **Truth:** ${pick(TRUTH)}`;
      if (name === 'dare') return `😈 **Dare:** ${pick(DARE)}`;
      if (name === 'fact') return `💡 ${pick(FACTS)}`;
      if (name === 'compliment') return `💖 ${mention(other || me)} ${pick(NICE)}`;
      if (name === 'fortune') return `🥠 *${pick(FORTUNE)}*\nLucky numbers: ${Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 60)).join(', ')}`;
      if (name === 'hug') return other && other.id !== me.id ? `🤗 ${mention(me)} gives ${mention(other)} a big hug!` : `🤗 ${mention(me)} hugs themselves. Someone give them a hug!`;
      if (name === 'highfive') return other && other.id !== me.id ? `🙏 ${mention(me)} high-fives ${mention(other)}! *smack*` : '✋ Who are you high-fiving? Try `/highfive @someone`';
      if (name === 'slots') {
        const reel = [pick(SLOTS), pick(SLOTS), pick(SLOTS)];
        const win = reel[0] === reel[1] && reel[1] === reel[2], two = new Set(reel).size === 2;
        return `🎰 | ${reel.join(' | ')} |\n${win ? (reel[0] === '7️⃣' ? '**JACKPOT!!!** 🎉🎉🎉' : '**Three in a row! You win!** 🎉') : two ? 'Two match. So close! 😮' : 'No luck this time. Spin again!'}`;
      }
      if (name === 'duel') {
        if (!other || other.id === me.id) return '⚔️ Challenge someone: `/duel @someone`';
        const a = 1 + Math.floor(Math.random() * 100), b = 1 + Math.floor(Math.random() * 100);
        return `⚔️ **${me.displayName}** rolled **${a}** · **${other.displayName}** rolled **${b}**\n${a === b ? "It's a draw! 🤝" : `🏆 ${mention(a > b ? me : other)} wins the duel!`}`;
      }
      if (name === 'number') {
        const [x, y] = (args || '').split(/[\s,-]+/).map(Number).filter(Number.isFinite);
        const lo = y === undefined ? 1 : Math.min(x, y), hi = y === undefined ? (x > 1 ? x : 100) : Math.max(x, y);
        if (hi - lo > 1e9) return '🔢 That range is a bit too big.';
        return `🔢 Between ${lo} and ${hi}: **${lo + Math.floor(Math.random() * (hi - lo + 1))}**`;
      }
      if (name === 'card') return `🃏 ${mention(me)} drew the **${pick(RANKS)}${pick(SUITS)}**`;
      if (name === 'reverse') return args ? `🔁 ${[...args.slice(0, 300)].reverse().join('')}` : '🔁 Give me something to flip: `/reverse hello`';
      if (name === 'mock') return args ? `🧽 ${[...args.slice(0, 300)].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')}` : '🧽 Give me some text: `/mock i love mondays`';
      if (name === 'emojify') { const t = (args || '').toLowerCase().slice(0, 40); return t ? [...t].map(ch => (ch === ' ' ? '   ' : BIG[ch] || ch)).join(' ') : '🔤 Give me some text: `/emojify hello`'; }
      return null;
    })();
    if (r === null) return false;
    say(r);
    return true;
  };

  // ======================= Greeter: goodbyes, milestones and more =======================
  ZBOTS.greeter.desc = 'Welcomes new members with your own message, gives them roles, says goodbye when people leave and celebrates member milestones.';
  addCmds('greeter', [['goodbye-test', 'Preview the goodbye message'], ['members', 'How many members the server has'], ['joined', 'When someone joined', '@someone']]);
  Object.assign(DEFAULT_CFG.greeter, { goodbye: false, goodbyeChannelId: null, goodbyeMessage: '**{name}** left the server. See you around! 👋', extraRoleId: null, milestones: true, ignoreBots: true });
  const humans = sv => sv.members.filter(id => !data.users[id]?.bot).length;
  const fill = (text, sv, u) => String(text).replace(/\{user\}/g, mention(u)).replace(/\{name\}/g, u.displayName).replace(/\{server\}/g, sv.name).replace(/\{count\}/g, String(humans(sv)))
    .replace(/\{rules\}/g, sv.rulesChannelId ? `<#${sv.rulesChannelId}>` : '#rules').replace(/\{username\}/g, '@' + u.username);
  ZB_EXT.config.greeter = (c, next, { chOrNull, roleOk }) => {
    for (const k of ['goodbye', 'milestones']) if (k in c) next[k] = !!c[k];
    if ('goodbyeChannelId' in c) next.goodbyeChannelId = chOrNull(c.goodbyeChannelId);
    if ('goodbyeMessage' in c) next.goodbyeMessage = clean(c.goodbyeMessage, 500) || DEFAULT_CFG.greeter.goodbyeMessage;
    if ('extraRoleId' in c) next.extraRoleId = c.extraRoleId ? roleOk(c.extraRoleId) : null;
  };
  const welcomeCh = (sv, id) => channelIn(sv, id) || sv.channels.find(x => x.id === sv.welcomeChannelId) || sv.channels.find(x => x.type === 'text');
  hooks.onJoin.push((sv, u) => {
    if (u.bot || !inServer(sv, 'greeter')) return;
    const c = cfgOf(sv, 'greeter');
    const role = c.extraRoleId && z.roleById(sv, c.extraRoleId);
    if (role && !role.managed && !role.perms.includes('administrator')) sv.memberRoles[u.id] = [...new Set([...(sv.memberRoles[u.id] || []), role.id])];
    const n = humans(sv);
    if (c.milestones && n >= 10 && (n % 100 === 0 || [10, 25, 50, 75].includes(n))) setTimeout(() => botSay(sv, welcomeCh(sv, c.channelId), 'greeter', `🎉 **${sv.name}** just reached **${n} members**! Thanks for being here, everyone.`), 1200);
  });
  hooks.onLeave.push((sv, u) => {
    if (!u || u.bot || !inServer(sv, 'greeter')) return;
    const c = cfgOf(sv, 'greeter');
    if (c.goodbye) setTimeout(() => botSay(sv, welcomeCh(sv, c.goodbyeChannelId || c.channelId), 'greeter', fill(c.goodbyeMessage, sv, u)), 300);
  });
  ZB_EXT.command.greeter = ({ sv, me, command, args, say }) => {
    const c = cfgOf(sv, 'greeter');
    if (command.name === 'welcome-test') { say(`👋 **Preview:** ${fill(c.message, sv, me)}`); return true; }
    if (command.name === 'goodbye-test') { say(`👋 **Preview${c.goodbye ? '' : ' (goodbyes are off)'}:** ${fill(c.goodbyeMessage, sv, me)}`); return true; }
    if (command.name === 'members') {
      const today = sv.members.filter(id => (data.users[id]?.joinedAt?.[sv.id] || 0) > Date.now() - 864e5 && !data.users[id]?.bot).length;
      const bots = sv.members.length - humans(sv);
      say(`👥 **${sv.name}** has **${humans(sv)}** member${humans(sv) === 1 ? '' : 's'}${bots ? ` and ${plural(bots, 'bot')}` : ''}. ${today ? `${today} joined today! 🎉` : ''}`);
      return true;
    }
    if (command.name === 'joined') {
      const u = findMember(sv, args) || me, at = u.joinedAt?.[sv.id];
      say(at ? `📅 **${u.displayName}** joined ${ts(at, 'D')} (${ts(at)}).` : `📅 I don't know when **${u.displayName}** joined.`);
      return true;
    }
    return false;
  };

  // ======================= Levels: XP speed, no-XP channels, your own level-up message =======================
  addCmds('levels', [['rewards', 'See which roles you can unlock'], ['xp-give', 'Give or take XP (managers)', '@someone 100'], ['xp-reset', 'Reset someone\'s XP (managers)', '@someone']]);
  Object.assign(DEFAULT_CFG.levels, { rate: 1, noXpChannels: [], message: '🎉 GG {user}, you reached **level {level}**!' });
  ZB_EXT.config.levels = (c, next, { sv }) => {
    if ('rate' in c) next.rate = [0.5, 1, 1.5, 2, 3].includes(Number(c.rate)) ? Number(c.rate) : 1;
    if ('noXpChannels' in c) next.noXpChannels = (Array.isArray(c.noXpChannels) ? c.noXpChannels : []).filter(id => channelIn(sv, id)).slice(0, 50);
    if ('message' in c) next.message = clean(c.message, 300) || DEFAULT_CFG.levels.message;
  };
  ZB_EXT.xpRate = (sv, ch) => { const c = cfgOf(sv, 'levels'); return c.noXpChannels.includes(ch.id) ? 0 : c.rate || 1; };
  ZB_EXT.levelText = (sv, u, level) => fill(cfgOf(sv, 'levels').message, sv, u).replace(/\{level\}/g, String(level));
  ZB_EXT.command.levels = ({ sv, me, command, args, say }) => {
    const c = cfgOf(sv, 'levels');
    if (command.name === 'rewards') {
      const list = c.rewards.map(r => ({ ...r, role: z.roleById(sv, r.roleId) })).filter(r => r.role).sort((a, b) => a.level - b.level);
      const mine = levelOf(sv.levels?.[me.id]?.xp || 0).level;
      say(list.length ? `🎁 **Level rewards**\n${list.map(r => `${mine >= r.level ? '✅' : '🔒'} Level **${r.level}** → **${r.role.name}**`).join('\n')}` : '🎁 No role rewards yet. Managers can add them in Server Settings › Bots & Webhooks.');
      return true;
    }
    if (command.name === 'xp-give' || command.name === 'xp-reset') {
      if (!z.can(sv, me.id, 'manage_server') && !z.can(sv, me.id, 'manage_roles')) { say('⭐ Only people who can manage the server or roles can change XP.'); return true; }
      const { who, rest } = splitTarget(sv, args);
      if (!who || who.bot) { say(`⭐ Who? Try \`/${command.name} @someone${command.name === 'xp-give' ? ' 100' : ''}\``); return true; }
      sv.levels ||= {};
      const rec = sv.levels[who.id] ||= { xp: 0, msgs: 0, last: 0 };
      if (command.name === 'xp-reset') rec.xp = 0;
      else { const n = num(rest, -100000, 100000, 0); if (!n) { say('⭐ How much? Try `/xp-give @someone 100` (or a minus number to take some away).'); return true; } rec.xp = Math.max(0, rec.xp + n); }
      z.audit(sv, me, 'bot_config', { type: 'member', id: who.id, name: who.displayName }, command.name === 'xp-reset' ? 'reset XP' : `XP ${rest}`);
      save();
      say(`⭐ **${who.displayName}** now has **${rec.xp} XP** (level ${levelOf(rec.xp).level}).`);
      return true;
    }
    return false;
  };

  // ======================= Remind Me: combos, cancelling, public timers =======================
  addCmds('reminders', [['remind-cancel', 'Cancel one of your reminders', '1'], ['timer', 'Start a timer everyone can see', '5m']]);
  ZBOTS.reminders.desc = 'Set reminders in chat: /remind 1h30m take the pizza out. Cancel them, or start a timer everyone can see.';
  ZB_EXT.command.reminders = ({ sv, ch, me, command, args, say }) => {
    data.reminders ||= [];
    if (command.name === 'remind') {
      // Allow "1h30m" and "in 2 hours" on top of the old single unit.
      const m = /^(?:in\s+)?((?:\d{1,4}\s*[a-z]+\s*?)+?)\s+([\s\S]+)$/i.exec((args || '').trim());
      let ms = 0, text = '';
      if (m) { for (let cut = m[1].length; cut > 0 && !ms; cut--) { const d = parseDur(m[1].slice(0, cut)); if (d) { ms = d; text = (m[1].slice(cut) + ' ' + m[2]).trim(); } } }
      if (!ms || !text) return false; // the original handler explains the format
      text = text.slice(0, 300);
      if (ms > 30 * 864e5) { say('⏰ I can only remember things up to 30 days ahead.'); return true; }
      if (data.reminders.filter(r => r.userId === me.id).length >= 25) { say('⏰ You have 25 reminders already. Let some finish first!'); return true; }
      data.reminders.push({ id: newId(), userId: me.id, serverId: sv.id, channelId: ch.id, text, at: Date.now() + ms });
      save();
      say(`⏰ Got it, ${mention(me)}! I'll remind you ${ts(Date.now() + ms)}: **${text}**`);
      return true;
    }
    if (command.name === 'reminders') {
      const mine = data.reminders.filter(r => r.userId === me.id && r.serverId === sv.id && !r.timer).sort((a, b) => a.at - b.at);
      say(mine.length ? `⏰ **Your reminders**\n${mine.map((r, i) => `**${i + 1}.** ${ts(r.at)}: ${r.text}`).join('\n')}\n-# Cancel one with \`/remind-cancel <number>\`` : "⏰ You don't have any reminders here.");
      return true;
    }
    if (command.name === 'remind-cancel') {
      const mine = data.reminders.filter(r => r.userId === me.id && r.serverId === sv.id && !r.timer).sort((a, b) => a.at - b.at);
      const pickIt = String(args || '').trim().toLowerCase();
      const gone = pickIt === 'all' ? mine : [mine[num(pickIt, 1, 999, 0) - 1]].filter(Boolean);
      if (!gone.length) { say(mine.length ? '⏰ Which one? Use the number from `/reminders`, or `/remind-cancel all`.' : "⏰ You don't have any reminders here."); return true; }
      data.reminders = data.reminders.filter(r => !gone.includes(r));
      save();
      say(`⏰ Cancelled ${gone.length === 1 ? `**${gone[0].text}**` : plural(gone.length, 'reminder')}.`);
      return true;
    }
    if (command.name === 'timer') {
      const [when, ...rest] = String(args || '').trim().split(/\s+/);
      const ms = parseDur(when), label = rest.join(' ').slice(0, 100);
      if (!ms || ms > 864e5) { say('⏱️ Try `/timer 5m` or `/timer 1h30m pizza`. Timers can last up to a day.'); return true; }
      data.reminders.push({ id: newId(), userId: me.id, serverId: sv.id, channelId: ch.id, text: `⏱️ Time's up${label ? `: ${label}` : ''}!`, at: Date.now() + ms, timer: true });
      save();
      say(`⏱️ Timer started${label ? ` for **${label}**` : ''}: done ${ts(Date.now() + ms)} (${durText(ms)}).`);
      return true;
    }
    return false;
  };

  // ======================= Polls: timed, multi-choice and yes/no polls =======================
  addCmds('polls', [['quickpoll', 'A quick yes/no poll', 'Pizza tonight?']]);
  ZBOTS.polls.desc = 'Polls with one command: /poll Pizza or tacos? | Pizza | Tacos. Add "2h" or "multi" at the start for timed or multi-choice polls, or use /quickpoll for yes/no.';
  ZBOTS.polls.commands.find(c => c[0] === 'poll')[2] = '[2h] [multi] Question? | Answer 1 | Answer 2';
  ZB_EXT.command.polls = ({ me, command, args, say, botSay: post }) => {
    let text = String(args || '').trim(), endsIn = 24 * 3600e3, multi = false;
    for (let i = 0; i < 2; i++) {
      const w = text.split(/\s+/)[0] || '';
      if (/^multi$/i.test(w)) { multi = true; text = text.slice(w.length).trim(); }
      else if (parseDur(w) && !w.includes('|')) { endsIn = Math.min(7 * 864e5, Math.max(60e3, parseDur(w))); text = text.slice(w.length).trim(); }
    }
    let parts = text.split('|').map(s => s.trim()).filter(Boolean);
    if (command.name === 'quickpoll') { if (!parts.length) { say('📊 Try `/quickpoll Pizza tonight?`'); return true; } parts = [parts.join(' '), 'Yes', 'No']; }
    else if (parts.length < 3) { say('📊 Try `/poll Pizza or tacos? | Pizza | Tacos`. Start with `2h` for a timed poll or `multi` to allow more than one answer.'); return true; }
    setTimeout(() => post('', { poll: { question: parts[0].slice(0, 300), multi, endsAt: Date.now() + endsIn, options: parts.slice(1, 11).map((t, i) => ({ id: String(i + 1), text: t.slice(0, 55), emoji: command.name === 'quickpoll' ? (i ? '👎' : '👍') : null, votes: [] })) }, pollBy: me.id }), 300);
    return true;
  };

  // ======================= Starboard: top stars, no self-stars =======================
  addCmds('starboard', [['star-top', 'The most-starred messages']]);
  Object.assign(DEFAULT_CFG.starboard, { selfStar: false });
  ZB_EXT.config.starboard = (c, next) => { if ('selfStar' in c) next.selfStar = !!c.selfStar; };
  ZB_EXT.command.starboard = ({ sv, command, say }) => {
    if (command.name !== 'star-top') return false;
    const c = cfgOf(sv, 'starboard'), found = [];
    for (const ch of sv.channels) {
      if (ch.type !== 'text' || ch.id === c.channelId) continue;
      for (const m of data.channelMessages[ch.id]?.messages || []) { const n = (m.reactions?.[c.emoji] || []).length; if (n) found.push({ m, n, ch }); }
    }
    found.sort((a, b) => b.n - a.n);
    say(found.length ? `${c.emoji} **Top messages**\n${found.slice(0, 5).map((x, i) => `**${i + 1}.** ${x.n} ${c.emoji} · ${data.users[x.m.authorId]?.displayName || 'Someone'} in <#${x.ch.id}>: ${String(x.m.content || '(picture)').replace(/\n/g, ' ').slice(0, 80)}`).join('\n')}` : `${c.emoji} Nothing has been starred yet.`);
    return true;
  };

  // ======================= Guardian: more filters, exemptions and a test command =======================
  addCmds('guardian', [['automod-test', 'Check if a message would be blocked', 'some text']]);
  Object.assign(DEFAULT_CFG.guardian, { emojis: 0, lines: 0, zalgo: false, allowLinks: [], exemptRoles: [], exemptChannels: [] });
  ZB_EXT.config.guardian = (c, next, { sv }) => {
    if ('emojis' in c) next.emojis = num(c.emojis, 0, 100, 0);
    if ('lines' in c) next.lines = num(c.lines, 0, 200, 0);
    if ('zalgo' in c) next.zalgo = !!c.zalgo;
    if ('allowLinks' in c) next.allowLinks = (Array.isArray(c.allowLinks) ? c.allowLinks : String(c.allowLinks || '').split(',')).map(d => clean(d, 80).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 50);
    if ('exemptRoles' in c) next.exemptRoles = (Array.isArray(c.exemptRoles) ? c.exemptRoles : []).filter(id => z.roleById(sv, id)).slice(0, 25);
    if ('exemptChannels' in c) next.exemptChannels = (Array.isArray(c.exemptChannels) ? c.exemptChannels : []).filter(id => channelIn(sv, id)).slice(0, 50);
  };
  ZB_EXT.guardianSkip = (sv, ch, me) => {
    const c = cfgOf(sv, 'guardian');
    return c.exemptChannels.includes(ch.id) || z.rolesOf(sv, me.id).some(r => c.exemptRoles.includes(r));
  };
  const EMOJI_RE = /\p{Extended_Pictographic}|<a?:[a-z0-9_]+:[a-z0-9]+>|:[a-z0-9_]{2,32}:/giu;
  const ZALGO_RE = /[̀-ͯ҉]{3,}/;
  function guardianExtra(sv, content) {
    const c = cfgOf(sv, 'guardian');
    if (c.emojis && (content.match(EMOJI_RE) || []).length > c.emojis) return `that's more than ${c.emojis} emoji in one message`;
    if (c.lines && content.split('\n').length > c.lines) return `that's more than ${c.lines} lines in one message`;
    if (c.zalgo && ZALGO_RE.test(content)) return 'glitchy (zalgo) text isn\'t allowed here';
    return null;
  }
  hooks.beforePost.push(({ conv, me, content }) => {
    if (conv.kind !== 'channel' || !content || me.bot || me.system) return;
    const sv = conv.server;
    if (!inServer(sv, 'guardian') || sv.ownerId === me.id || conv.perms.has('manage_messages') || ZB_EXT.guardianSkip(sv, conv.channel, me)) return;
    const why = guardianExtra(sv, content);
    if (!why) return;
    const c = cfgOf(sv, 'guardian'), log = channelIn(sv, c.logChannelId);
    if (log) botSay(sv, log, 'guardian', `🛡️ Blocked a message from ${mention(me)} in #${conv.channel.name}: ${why}.\n> ${content.slice(0, 300).replace(/\n/g, ' ')}`);
    fail(403, `🛡️ Guardian blocked your message: ${why}.`);
  });
  // "Block all links" can let some sites through.
  const LINK_G = /https?:\/\/([^\s/]+)\S*|www\.([^\s/]+)\S*/gi;
  ZB_EXT.linksOk = (sv, content) => {
    const c = cfgOf(sv, 'guardian');
    if (!c.allowLinks.length) return false;
    const hosts = [...content.matchAll(LINK_G)].map(m => (m[1] || m[2] || '').toLowerCase().replace(/^www\./, ''));
    return hosts.length > 0 && hosts.every(h => c.allowLinks.some(d => h === d || h.endsWith('.' + d)));
  };
  ZB_EXT.command.guardian = ({ sv, me, command, args, say }) => {
    if (command.name === 'automod') {
      const c = cfgOf(sv, 'guardian');
      const on = [c.words.length && plural(c.words.length, 'blocked word'), c.invites && 'invite links', c.links && (c.allowLinks.length ? `links (except ${c.allowLinks.slice(0, 3).join(', ')}${c.allowLinks.length > 3 ? '…' : ''})` : 'all links'), c.caps && 'shouting', c.spam && 'spam', c.mentions && `more than ${c.mentions} mentions`, c.emojis && `more than ${c.emojis} emoji`, c.lines && `walls of text (${c.lines}+ lines)`, c.zalgo && 'glitchy text'].filter(Boolean);
      say(`🛡️ **Guardian is watching for:** ${on.join(', ') || 'nothing yet (set me up in Server Settings › Bots & Webhooks)'}.${c.timeoutMinutes ? `\nBreaking a rule means a **${c.timeoutMinutes} min** timeout.` : ''}`);
      return true;
    }
    if (command.name === 'automod-test') {
      if (!args) { say('🛡️ Give me some text: `/automod-test hello everyone`'); return true; }
      if (!z.can(sv, me.id, 'manage_messages')) { say('🛡️ Only people who can manage messages can test AutoMod.'); return true; }
      say('🛡️ ' + (guardianExtra(sv, args) ? `That would be **blocked**: ${guardianExtra(sv, args)}.` : 'Checked the extra filters (emoji, lines, glitchy text): that would get through. Word, link and spam filters are checked when a real message is sent.'));
      return true;
    }
    return false;
  };

  // ======================= Warden: a moderation bot that does a bit of everything =======================
  ZBOTS.warden = {
    name: 'Warden', emoji: '⚖️', c: ['#ef4444', '#7f1d1d'],
    perms: [...BASE_PERMS, 'manage_messages', 'moderate_members', 'kick_members', 'ban_members', 'manage_channels', 'manage_nicknames', 'view_audit_log'],
    desc: 'Moderation in one bot: warnings that add up to timeouts or kicks, kick/ban/timeout commands, clearing messages, slowmode, channel lockdowns, reports, a mod log and raid alerts.',
    commands: [['warn', 'Warn someone', '@someone reason'], ['warnings', "See someone's warnings", '@someone'], ['clearwarns', "Clear someone's warnings", '@someone'],
      ['timeout', 'Time someone out', '@someone 10m reason'], ['untimeout', 'Remove a timeout', '@someone'], ['kick', 'Kick someone', '@someone reason'], ['ban', 'Ban someone', '@someone reason'], ['unban', 'Unban someone', 'username'],
      ['purge', 'Delete recent messages here', '20 @someone'], ['slowmode', 'Set slowmode here', '10s / off'], ['lock', 'Lock this channel', 'reason'], ['unlock', 'Unlock this channel'], ['lockdown', 'Lock or unlock every channel', 'on / off'],
      ['note', 'Add a private mod note', '@someone text'], ['userinfo', 'Info about a member', '@someone'], ['report', 'Quietly report someone to the mods', '@someone reason'], ['modhelp', 'What Warden can do']],
  };
  DEFAULT_CFG.warden = { logChannelId: null, timeoutAt: 3, timeoutMinutes: 60, kickAt: 0, banAt: 0, warnExpireDays: 30, logJoins: false, logDeletes: false, raidJoins: 0, raidPause: true, newAccountDays: 0, newAccountAction: 'none', reports: true };
  ZB_EXT.setup.add('warden');
  zb.ensureZunoBots();
  ZB_EXT.config.warden = (c, next, { chOrNull }) => {
    if ('logChannelId' in c) next.logChannelId = chOrNull(c.logChannelId);
    for (const k of ['timeoutAt', 'kickAt', 'banAt']) if (k in c) next[k] = num(c[k], 0, 20, 0);
    if ('timeoutMinutes' in c) next.timeoutMinutes = [5, 10, 30, 60, 360, 1440, 10080].includes(Number(c.timeoutMinutes)) ? Number(c.timeoutMinutes) : 60;
    if ('warnExpireDays' in c) next.warnExpireDays = [0, 7, 14, 30, 90].includes(Number(c.warnExpireDays)) ? Number(c.warnExpireDays) : 30;
    for (const k of ['logJoins', 'logDeletes', 'raidPause', 'reports']) if (k in c) next[k] = !!c[k];
    if ('raidJoins' in c) next.raidJoins = [0, 5, 10, 20].includes(Number(c.raidJoins)) ? Number(c.raidJoins) : 0;
    if ('newAccountDays' in c) next.newAccountDays = [0, 1, 3, 7, 30].includes(Number(c.newAccountDays)) ? Number(c.newAccountDays) : 0;
    if ('newAccountAction' in c) next.newAccountAction = ['none', 'timeout', 'kick'].includes(c.newAccountAction) ? c.newAccountAction : 'none';
  };
  const WID = zbotId('warden');
  const wcfg = sv => cfgOf(sv, 'warden');
  const modLog = (sv, text) => { const ch = channelIn(sv, wcfg(sv).logChannelId); if (ch) botSay(sv, ch, 'warden', text); };
  const activeWarns = sv => { const days = wcfg(sv).warnExpireDays; return (list = []) => list.filter(w => !days || w.at > Date.now() - days * 864e5); };
  const warnsOf = (sv, uid) => activeWarns(sv)(sv.warns46?.[uid]);
  // Can this person (and Warden) do that to them? Returns why not, or null.
  function gate(sv, me, perm, who, word) {
    if (!z.can(sv, me.id, perm)) return `you need the **${z.PERM_INFO[perm]?.label || perm}** permission for that`;
    if (!who) return word ? `I can't find **${String(word).replace(/^@/, '').slice(0, 32)}** in this server` : 'tell me who, like `@someone`';
    if (who.id === me.id) return "you can't do that to yourself";
    if (who.id === sv.ownerId) return "the owner can't be moderated";
    if (who.bot && who.id === WID) return 'nice try 😄';
    if (!z.outranks(sv, me.id, who.id)) return `**${who.displayName}**'s role is the same as or higher than yours`;
    if (!z.can(sv, WID, perm)) return `I don't have the **${z.PERM_INFO[perm]?.label || perm}** permission. Give my role that permission first`;
    if (!z.outranks(sv, WID, who.id)) return `my role needs to be above **${who.displayName}**'s highest role`;
    return null;
  }
  function timeoutUser(sv, by, who, mins, reason) {
    sv.timeouts ||= {};
    if (mins) sv.timeouts[who.id] = Date.now() + mins * 60e3; else delete sv.timeouts[who.id];
    z.audit(sv, by, mins ? 'member_timeout' : 'member_untimeout', { type: 'member', id: who.id, name: who.displayName }, mins ? `${mins} min${reason ? ` · ${reason}` : ''} (Warden)` : '(Warden)');
    for (const [rid, room] of z.rooms) if (rid.startsWith('vc:') && room.has(who.id)) {
      const st = room.get(who.id); st.muted = true; st.video = false; st.screen = false;
      for (const id of room.keys()) if (id !== who.id) send(id, 'rtc-state', { room: rid, userId: who.id, ...st });
    }
    save(); z.refreshServer(sv);
  }
  function kickUser(sv, by, who, reason) {
    z.audit(sv, by, 'member_kick', { type: 'member', id: who.id, name: who.displayName }, `${reason || ''} (Warden)`.trim());
    z.removeMember(sv, who.id);
  }
  function banUser(sv, by, who, reason) {
    sv.bans = (sv.bans || []).filter(b => b.userId !== who.id);
    sv.bans.push({ userId: who.id, by: typeof by === 'string' ? by : by.id, at: Date.now(), reason: clean(reason || '', 200) });
    z.audit(sv, by, 'member_ban', { type: 'member', id: who.id, name: who.displayName }, `${reason || ''} (Warden)`.trim());
    if (sv.members.includes(who.id)) z.removeMember(sv, who.id); else { save(); z.refreshServer(sv); }
  }
  function deleteMessages(sv, ch, list) {
    const st = data.channelMessages[ch.id];
    if (!st || !list.length) return 0;
    const gone = new Set(list.map(m => m.id));
    st.messages = st.messages.filter(m => !gone.has(m.id));
    for (const id of gone) for (const uid of sv.members) send(uid, 'message-delete', { conv: 'ch:' + ch.id, id, serverId: sv.id, channelId: ch.id });
    save();
    return gone.size;
  }
  const SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
  // Locked channels: only people who manage messages (and bots) can talk.
  hooks.channelPerms.push((sv, ch, uid, p) => {
    if (!ch?.locked46 || p.has('manage_messages') || p.has('manage_channels') || data.users[uid]?.bot) return;
    p.delete('send_messages'); p.delete('add_reactions'); p.delete('attach_files'); p.delete('use_commands');
  });
  function lockChannel(sv, ch, by, on, reason, lockdown = false) {
    if (on) ch.locked46 = { by: by.id || by, at: Date.now(), reason: clean(reason || '', 150), lockdown };
    else delete ch.locked46;
    z.audit(sv, by, on ? 'channel_lock' : 'channel_unlock', { type: 'channel', id: ch.id, name: ch.name }, reason || '');
  }
  ZB_EXT.command.warden = ({ sv, ch, me, message, command, args, say }) => {
    const name = command.name, c = wcfg(sv);
    const no = why => { say(`⚖️ Can't do that: ${why}.`); return true; };
    if (name === 'modhelp') {
      say('⚖️ **Warden commands**\n**Members:** `/warn` `/warnings` `/clearwarns` `/timeout` `/untimeout` `/kick` `/ban` `/unban` `/note` `/userinfo`\n**Channels:** `/purge 20` `/slowmode 10s` `/lock` `/unlock` `/lockdown on`\n**Everyone:** `/report @someone reason` sends a private report to the mods.\n-# Set up warnings, the mod log and raid alerts in Server Settings › Bots & Webhooks.');
      return true;
    }
    if (name === 'report') {
      const { who, rest } = splitTarget(sv, args);
      deleteMessages(sv, ch, [message]); // the report itself stays private
      if (!c.reports || !channelIn(sv, c.logChannelId)) { say(`⚖️ ${mention(me)}, reports aren't set up in this server. Message a moderator instead.`); return true; }
      if (!who) { say(`⚖️ ${mention(me)}, I couldn't find who you meant. Try \`/report @someone what happened\`.`); return true; }
      z.limit('report46:' + me.id, 5, 3600e3, 'You have sent a lot of reports. Try again later.');
      modLog(sv, `🚩 **Report** from ${mention(me)} about ${mention(who)} in <#${ch.id}>\n> ${rest ? rest.slice(0, 400) : '(no reason given)'}`);
      say(`📨 Thanks ${mention(me)}, the moderators got your report.`);
      return true;
    }
    if (name === 'userinfo') {
      if (!z.can(sv, me.id, 'moderate_members') && !z.can(sv, me.id, 'kick_members')) return no('only moderators can look people up');
      const who = findMember(sv, args) || me;
      const roles = (sv.roles || []).filter(r => !r.everyone && !r.managed && z.rolesOf(sv, who.id).includes(r.id)).map(r => r.name);
      const until = sv.timeouts?.[who.id] > Date.now() ? sv.timeouts[who.id] : 0;
      say(`🪪 **${who.displayName}** (@${who.username})${who.bot ? ' · Bot' : ''}\nAccount made ${ts(who.createdAt || Date.now(), 'D')} (${ts(who.createdAt || Date.now())})\nJoined ${who.joinedAt?.[sv.id] ? ts(who.joinedAt[sv.id]) : 'a while ago'}\nRoles: ${roles.length ? roles.slice(0, 15).join(', ') : 'none'}\nWarnings: **${warnsOf(sv, who.id).length}**${(sv.modNotes?.[who.id] || []).length ? ` · Notes: **${sv.modNotes[who.id].length}**` : ''}${until ? `\n⏳ Timed out until ${ts(until)}` : ''}`);
      return true;
    }
    if (name === 'warnings') {
      if (!z.can(sv, me.id, 'moderate_members') && !z.can(sv, me.id, 'kick_members')) return no('only moderators can see warnings');
      const who = findMember(sv, args) || me, list = warnsOf(sv, who.id);
      say(list.length ? `⚠️ **${who.displayName}** has ${plural(list.length, 'warning')}\n${list.slice(-10).map((w, i) => `**${i + 1}.** ${ts(w.at)} by ${data.users[w.by]?.displayName || 'a mod'}: ${w.reason || 'no reason'}`).join('\n')}` : `✅ **${who.displayName}** has no warnings.`);
      return true;
    }
    if (name === 'warn') {
      const { who, word, rest } = splitTarget(sv, args);
      const why = gate(sv, me, 'moderate_members', who, word);
      if (why) return no(why);
      sv.warns46 ||= {};
      const list = (sv.warns46[who.id] = [...warnsOf(sv, who.id), { id: newId(), by: me.id, at: Date.now(), reason: clean(rest, 200) }].slice(-50));
      z.audit(sv, me, 'member_warn', { type: 'member', id: who.id, name: who.displayName }, rest || '');
      let extra = '';
      if (c.banAt && list.length >= c.banAt && z.can(sv, WID, 'ban_members') && z.outranks(sv, WID, who.id)) { banUser(sv, WID, who, `Reached ${c.banAt} warnings`); extra = ` That's ${list.length} warnings, so they've been **banned**.`; }
      else if (c.kickAt && list.length >= c.kickAt && z.can(sv, WID, 'kick_members') && z.outranks(sv, WID, who.id)) { kickUser(sv, WID, who, `Reached ${c.kickAt} warnings`); extra = ` That's ${list.length} warnings, so they've been **kicked**.`; }
      else if (c.timeoutAt && list.length >= c.timeoutAt && z.can(sv, WID, 'moderate_members')) { timeoutUser(sv, WID, who, c.timeoutMinutes, `Reached ${c.timeoutAt} warnings`); extra = ` That's ${list.length} warnings, so they're **timed out for ${durText(c.timeoutMinutes * 60e3)}**.`; }
      save();
      say(`⚠️ ${mention(who)} has been warned${rest ? `: **${rest.slice(0, 200)}**` : '.'} (${plural(list.length, 'warning')})${extra}`);
      modLog(sv, `⚠️ ${mention(me)} warned ${mention(who)} (${list.length})${rest ? `: ${rest.slice(0, 200)}` : ''}${extra}`);
      return true;
    }
    if (name === 'clearwarns') {
      const { who, word } = splitTarget(sv, args);
      const why = gate(sv, me, 'moderate_members', who, word);
      if (why) return no(why);
      const n = warnsOf(sv, who.id).length;
      if (sv.warns46) delete sv.warns46[who.id];
      z.audit(sv, me, 'member_unwarn', { type: 'member', id: who.id, name: who.displayName }, `${n} cleared`);
      save();
      say(`🧽 Cleared ${plural(n, 'warning')} for **${who.displayName}**.`);
      modLog(sv, `🧽 ${mention(me)} cleared ${who.displayName}'s warnings (${n}).`);
      return true;
    }
    if (name === 'timeout' || name === 'untimeout') {
      const { who, word, rest } = splitTarget(sv, args);
      const why = gate(sv, me, 'moderate_members', who, word);
      if (why) return no(why);
      if (name === 'untimeout') { timeoutUser(sv, me, who, 0); say(`⏳ **${who.displayName}** can talk again.`); modLog(sv, `⏳ ${mention(me)} removed ${who.displayName}'s timeout.`); return true; }
      const [d, ...r] = rest.split(/\s+/);
      const ms = parseDur(d) || 10 * 60e3, reason = (parseDur(d) ? r.join(' ') : rest).trim();
      const mins = Math.max(1, Math.min(7 * 1440, Math.round(ms / 60e3)));
      timeoutUser(sv, me, who, mins, reason);
      say(`⏳ ${mention(who)} is timed out for **${durText(mins * 60e3)}**${reason ? `: ${reason.slice(0, 200)}` : '.'}`);
      modLog(sv, `⏳ ${mention(me)} timed out ${mention(who)} for ${durText(mins * 60e3)}${reason ? `: ${reason.slice(0, 200)}` : ''}`);
      return true;
    }
    if (name === 'kick' || name === 'ban') {
      const { who, word, rest } = splitTarget(sv, args);
      const why = gate(sv, me, name === 'kick' ? 'kick_members' : 'ban_members', who, word);
      if (why) return no(why);
      if (sv.official) return no('use the staff tools in Zuno Official');
      (name === 'kick' ? kickUser : banUser)(sv, me, who, rest);
      say(`${name === 'kick' ? '👢' : '🔨'} **${who.displayName}** was ${name === 'kick' ? 'kicked' : 'banned'}${rest ? `: ${rest.slice(0, 200)}` : '.'}`);
      modLog(sv, `${name === 'kick' ? '👢' : '🔨'} ${mention(me)} ${name === 'kick' ? 'kicked' : 'banned'} **${who.displayName}** (@${who.username})${rest ? `: ${rest.slice(0, 200)}` : ''}`);
      return true;
    }
    if (name === 'unban') {
      if (!z.can(sv, me.id, 'ban_members')) return no('you need the **Ban Members** permission for that');
      const w = String(args || '').trim().replace(/^@/, '').toLowerCase();
      const ban = (sv.bans || []).find(b => data.users[b.userId]?.username === w);
      if (!ban) return no(`**${w || '?'}** isn't banned here`);
      sv.bans = sv.bans.filter(b => b !== ban);
      z.audit(sv, me, 'member_unban', { type: 'member', id: ban.userId, name: data.users[ban.userId]?.displayName || '?' }, '(Warden)');
      save(); z.refreshServer(sv);
      say(`🕊️ **${data.users[ban.userId].displayName}** was unbanned. They can join again with an invite.`);
      modLog(sv, `🕊️ ${mention(me)} unbanned ${data.users[ban.userId].displayName}.`);
      return true;
    }
    if (name === 'purge') {
      if (!z.can(sv, me.id, 'manage_messages')) return no('you need the **Manage Messages** permission for that');
      if (!z.can(sv, WID, 'manage_messages')) return no("I don't have the **Manage Messages** permission");
      const words = String(args || '').trim().split(/\s+/).filter(Boolean);
      const count = num(words.find(w => /^\d+$/.test(w)), 1, 100, 0);
      const target = words.find(w => !/^\d+$/.test(w));
      const who = target ? findMember(sv, target) : null;
      if (!count) return no('say how many, like `/purge 20` (up to 100)');
      if (target && !who) return no(`I can't find **${target.replace(/^@/, '').slice(0, 32)}** in this server`);
      const all = data.channelMessages[ch.id]?.messages || [];
      const list = all.filter(m => m.id !== message.id && !m.pinned && (!who || m.authorId === who.id)).slice(-count);
      const n = deleteMessages(sv, ch, [...list, message]) - 1;
      z.audit(sv, me, 'message_purge', { type: 'channel', id: ch.id, name: ch.name }, `${n} messages${who ? ` from ${who.displayName}` : ''}`);
      say(`🧹 Cleared **${plural(n, 'message')}**${who ? ` from **${who.displayName}**` : ''}. Pinned messages were kept.`);
      modLog(sv, `🧹 ${mention(me)} cleared ${plural(n, 'message')}${who ? ` from ${who.displayName}` : ''} in <#${ch.id}>.`);
      return true;
    }
    if (name === 'slowmode') {
      if (!z.can(sv, me.id, 'manage_channels')) return no('you need the **Manage Channels** permission for that');
      const w = String(args || '').trim().toLowerCase();
      const secs = /^(off|0|none)$/.test(w) ? 0 : Math.round(parseDur(/^\d+$/.test(w) ? w + 's' : w) / 1000);
      if (!w || (!secs && !/^(off|0|none)$/.test(w))) return no('try `/slowmode 10s`, `/slowmode 5m` or `/slowmode off`');
      const pickS = SLOW.filter(s => s <= secs).pop() || (secs ? 5 : 0);
      ch.slowmode = pickS;
      z.audit(sv, me, 'channel_update', { type: 'channel', id: ch.id, name: ch.name }, `slowmode ${pickS}s`);
      save(); z.refreshServer(sv);
      say(pickS ? `🐢 Slowmode is on: one message every **${durText(pickS * 1000)}**.` : '🐇 Slowmode is off.');
      return true;
    }
    if (name === 'lock' || name === 'unlock') {
      if (!z.can(sv, me.id, 'manage_channels')) return no('you need the **Manage Channels** permission for that');
      if (name === 'lock' && ch.locked46) return no('this channel is already locked');
      if (name === 'unlock' && !ch.locked46) return no("this channel isn't locked");
      lockChannel(sv, ch, me, name === 'lock', args);
      save(); z.refreshServer(sv);
      say(name === 'lock' ? `🔒 This channel is locked${args ? `: ${args.slice(0, 150)}` : '.'} Only moderators can talk for now.` : '🔓 This channel is unlocked. Carry on!');
      modLog(sv, `${name === 'lock' ? '🔒' : '🔓'} ${mention(me)} ${name}ed <#${ch.id}>${args && name === 'lock' ? `: ${args.slice(0, 150)}` : ''}`);
      return true;
    }
    if (name === 'lockdown') {
      if (!z.can(sv, me.id, 'manage_server') && !z.can(sv, me.id, 'administrator')) return no('you need the **Manage Server** permission for that');
      const on = !/^(off|end|stop|no)$/i.test(String(args || '').trim());
      let n = 0;
      for (const x of sv.channels) {
        if (x.type !== 'text' && x.type !== 'forum') continue;
        if (on && !x.locked46) { lockChannel(sv, x, me, true, 'Server lockdown', true); n++; }
        if (!on && x.locked46?.lockdown) { lockChannel(sv, x, me, false, 'Lockdown over'); n++; }
      }
      save(); z.refreshServer(sv);
      say(on ? `🚨 **Lockdown:** locked ${plural(n, 'channel')}. Use \`/lockdown off\` to end it.` : `✅ Lockdown over: unlocked ${plural(n, 'channel')}.`);
      modLog(sv, `${on ? '🚨' : '✅'} ${mention(me)} ${on ? 'started' : 'ended'} a lockdown (${plural(n, 'channel')}).`);
      return true;
    }
    if (name === 'note') {
      const { who, word, rest } = splitTarget(sv, args);
      if (!z.can(sv, me.id, 'moderate_members') && !z.can(sv, me.id, 'kick_members')) return no('only moderators can add notes');
      if (!who) return no(word ? `I can't find **${word.replace(/^@/, '').slice(0, 32)}**` : 'try `/note @someone what to remember`');
      if (!rest) return no('write the note after their name');
      deleteMessages(sv, ch, [message]); // notes are private
      sv.modNotes ||= {};
      const list = (sv.modNotes[who.id] ||= []);
      list.push({ id: newId(), by: me.id, at: Date.now(), text: clean(rest, 500) });
      if (list.length > 50) list.splice(0, list.length - 50);
      save();
      say(`📝 Saved a private note about **${who.displayName}**. Moderators can see it in Mod View.`);
      modLog(sv, `📝 ${mention(me)} added a note about ${who.displayName}: ${rest.slice(0, 300)}`);
      return true;
    }
    return false;
  };
  // Raid alerts, young accounts and the join/leave log.
  const joins = new Map(); // serverId -> [times]
  hooks.onJoin.push((sv, u) => {
    if (u.bot || !inServer(sv, 'warden')) return;
    const c = wcfg(sv), age = Date.now() - (u.createdAt || Date.now());
    if (c.logJoins) setTimeout(() => modLog(sv, `📥 ${mention(u)} joined · account made ${ts(u.createdAt || Date.now())}${age < 7 * 864e5 ? ' ⚠️ new account' : ''}`), 300);
    if (c.newAccountDays && c.newAccountAction !== 'none' && age < c.newAccountDays * 864e5 && z.outranks(sv, WID, u.id)) {
      if (c.newAccountAction === 'kick' && z.can(sv, WID, 'kick_members')) setTimeout(() => { if (sv.members.includes(u.id)) { kickUser(sv, WID, u, `Account younger than ${plural(c.newAccountDays, 'day')}`); modLog(sv, `👢 Kicked new account ${u.displayName} (younger than ${plural(c.newAccountDays, 'day')}).`); } }, 800);
      else if (c.newAccountAction === 'timeout' && z.can(sv, WID, 'moderate_members')) { timeoutUser(sv, WID, u, 60, 'New account'); modLog(sv, `⏳ Timed out new account ${mention(u)} for 1 hour (younger than ${plural(c.newAccountDays, 'day')}).`); }
    }
    if (c.raidJoins) {
      const list = (joins.get(sv.id) || []).filter(t => t > Date.now() - 15e3);
      list.push(Date.now()); joins.set(sv.id, list);
      if (list.length === c.raidJoins) {
        if (c.raidPause) { sv.invitesPaused = true; z.audit(sv, WID, 'server_update', { type: 'server', id: sv.id, name: sv.name }, 'paused invites (raid alert)'); save(); z.refreshServer(sv); }
        modLog(sv, `🚨 **Raid alert:** ${c.raidJoins} people joined in 15 seconds.${c.raidPause ? ' I paused invites. Turn them back on in Server Settings › Invites when it calms down.' : ''}`);
        for (const id of sv.members) if (z.can(sv, id, 'kick_members') && !data.users[id]?.bot) z.notify?.(id, { type: 'raid46', title: sv.name, text: `${c.raidJoins} people joined ${sv.name} in 15 seconds.`, serverId: sv.id, key: 'raid46:' + sv.id });
      }
    }
  });
  hooks.onLeave.push((sv, u) => { if (u && !u.bot && inServer(sv, 'warden') && wcfg(sv).logJoins) modLog(sv, `📤 **${u.displayName}** (@${u.username}) left or was removed.`); });
  hooks.onDelete.push((conv, m) => {
    if (conv.kind !== 'channel' || !m?.content || data.users[m.authorId]?.bot) return;
    const sv = conv.server;
    if (!inServer(sv, 'warden') || !wcfg(sv).logDeletes || conv.channel.id === wcfg(sv).logChannelId) return;
    setTimeout(() => modLog(sv, `🗑️ A message from **${data.users[m.authorId]?.displayName || 'someone'}** was deleted in <#${conv.channel.id}>:\n> ${m.content.slice(0, 300).replace(/\n/g, ' ')}`), 200);
  });
  setInterval(() => { const now = Date.now(); for (const [k, v] of joins) if (!v.some(t => t > now - 15e3)) joins.delete(k); }, 60e3).unref();
  // The server summary tells the app which channels are locked.
  hooks.serverSummary.push(sv => {
    const locked = sv.channels.filter(c => c.locked46).map(c => c.id);
    return locked.length ? { locked46: locked } : {};
  });
  // Mod View shows warnings too.
  z.route('GET', '/api/servers/:id/warnings/:uid', async ({ me, params }) => {
    const sv = z.ensureRoles(z.getServer(me, params.id));
    if (!z.can(sv, me.id, 'moderate_members') && !z.can(sv, me.id, 'kick_members')) fail(403, 'Only moderators can see warnings.');
    return { warnings: warnsOf(sv, params.uid).map(w => ({ ...w, byName: data.users[w.by]?.displayName || 'A mod' })) };
  });
};

// ======================= Bot Marketplace reviews and the developer reference =======================
module.exports.reviews = function (z) {
  const { data, save, route, fail, hooks, clean } = z;
  const fs = require('fs'), path = require('path');
  data.botQueue46 ||= {}; // botId -> { status: 'pending' | 'approved' | 'declined', at, by, message, note, decidedBy, decidedAt }
  // Bots that were already public before reviews existed stay listed.
  if (!data.botListMig46) {
    for (const u of Object.values(data.users)) if (z.devBot(u) && u.app?.public && !u.app.builtin && !u.app.deleted) { u.app.listed = true; data.botQueue46[u.id] = { status: 'approved', at: Date.now(), by: u.app.ownerId, decidedAt: Date.now(), note: 'Listed before reviews started' }; }
    data.botListMig46 = true; save();
  }
  const mine = (me, id) => { const u = data.users[id]; if (!z.devBot(u) || u.app?.deleted || u.app.ownerId !== me.id) fail(404, "That bot isn't yours."); return u; };
  const statusOf = u => (u.app.listed ? 'approved' : data.botQueue46[u.id]?.status === 'approved' ? 'none' : data.botQueue46[u.id]?.status || 'none');
  route('GET', '/api/apps/:id/review', async ({ me, params }) => {
    const u = mine(me, params.id), q = data.botQueue46[u.id];
    return { state: statusOf(u), note: q?.status === 'declined' ? q.note || '' : '', at: q?.at || null };
  });
  route('POST', '/api/apps/:id/review', async ({ me, params, body }) => {
    const u = mine(me, params.id);
    if (u.app.listed) fail(400, 'Your bot is already in the Bot Marketplace.');
    if (data.botQueue46[u.id]?.status === 'pending') fail(400, "It's already waiting for review.");
    if (String(u.app.description || '').trim().length < 20) fail(400, 'Write a description first (at least 20 characters) so people know what it does.');
    if (!(u.app.commands || []).length && !(u.app.rules || []).length) fail(400, 'Your bot needs at least one command (or a Bot Builder rule) first.');
    z.limit('botreview:' + me.id, 5, 864e5, "You've sent a lot of review requests today. Try again tomorrow.");
    const message = clean(body.message, 500);
    if (message) await z.judgeText({ review: message });
    u.app.public = true;
    data.botQueue46[u.id] = { status: 'pending', at: Date.now(), by: me.id, message };
    save();
    for (const s of Object.values(data.users)) if (z.isStaff(s) && !s.bot) z.send(s.id, 'bot-review', { botId: u.id });
    return { state: 'pending' };
  });
  route('DELETE', '/api/apps/:id/review', async ({ me, params }) => {
    const u = mine(me, params.id);
    if (data.botQueue46[u.id]?.status === 'pending') delete data.botQueue46[u.id];
    save();
    return { state: statusOf(u) };
  });
  // Turning "Public bot" off takes it out of the marketplace.
  hooks.patchApp46 = (u) => { if (!u.app.public && u.app.listed) { u.app.listed = false; if (data.botQueue46[u.id]) data.botQueue46[u.id].status = 'none'; } };
  const card = u => ({ id: u.id, name: u.displayName, username: u.username, avatar: u.avatar, description: u.app.description || '', tagline: u.app.tagline || '', category: u.app.category || 'Other',
    commands: u.app.commands || [], perms: u.app.perms || [], online: z.isOnline(u.id), createdAt: u.createdAt, servers: Object.values(data.servers).filter(sv => sv.members.includes(u.id)).length,
    owner: z.publicUser(data.users[u.app.ownerId]) });
  route('GET', '/api/staff/bot-reviews', async ({ me }) => {
    z.needStaff(me);
    const rows = Object.entries(data.botQueue46).map(([id, q]) => ({ q, u: data.users[id] })).filter(x => x.u && !x.u.app?.deleted);
    return {
      pending: rows.filter(x => x.q.status === 'pending').sort((a, b) => a.q.at - b.q.at).map(x => ({ ...card(x.u), message: x.q.message || '', at: x.q.at })),
      recent: rows.filter(x => x.q.decidedAt > Date.now() - 7 * 864e5 && x.q.decidedBy).sort((a, b) => b.q.decidedAt - a.q.decidedAt).slice(0, 30)
        .map(x => ({ id: x.u.id, name: x.u.displayName, avatar: x.u.avatar, state: x.q.status, note: x.q.note || '', decidedAt: x.q.decidedAt, decidedBy: data.users[x.q.decidedBy]?.displayName || 'Staff', listed: !!x.u.app.listed })),
    };
  });
  route('GET', '/api/staff/bot-reviews/count', async ({ me }) => { z.needStaff(me); return { pending: Object.values(data.botQueue46).filter(q => q.status === 'pending').length }; });
  route('POST', '/api/staff/bot-reviews/:id', async ({ me, params, body }) => {
    z.needStaff(me);
    const u = data.users[params.id], q = data.botQueue46[params.id];
    if (!z.devBot(u) || u.app?.deleted || !q) fail(404, 'That bot is gone.');
    const approve = !!body.approve, unlist = !!body.unlist, note = clean(body.note, 300);
    if (!approve && !note) fail(400, 'Say why, so the owner knows what to change.');
    if (approve) { u.app.listed = true; u.app.public = true; q.status = 'approved'; }
    else { u.app.listed = false; q.status = 'declined'; }
    Object.assign(q, { note, decidedBy: me.id, decidedAt: Date.now() });
    save();
    const owner = data.users[u.app.ownerId];
    if (owner) z.systemMessage(owner.id, approve
      ? `🎉 Your bot **${u.displayName}** was approved and is now in the **Bot Marketplace**! Anyone can find it and add it to their server.`
      : `🤖 Your bot **${u.displayName}** ${unlist ? 'was taken out of' : "wasn't added to"} the Bot Marketplace yet.\n**What to change:** ${note}\nFix it, then press **Send it again** in Settings › Developer.`);
    for (const s of Object.values(data.users)) if (z.isStaff(s) && !s.bot) z.send(s.id, 'bot-review', { botId: u.id });
    return { ok: true };
  });
  // The public reference page.
  const PAGE = path.join(__dirname, '..', 'website', 'developers.html');
  const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  const page = (req, res) => fs.readFile(PAGE, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
  hooks.rawRoutes.push({ path: '/developers', fn: page }, { path: '/developers/', fn: page }, { path: '/docs', fn: (req, res) => { res.writeHead(301, { Location: '/developers' }); res.end(); } });
};

// ======================= account safety (silent) =======================
module.exports.safety = function (z) {
  const { data, save, route, fail, hooks, clean } = z;
  // Zuno Official logins last 12 hours at most, and end as soon as the founder who opened them has
  // no login of their own left (logged out, password changed, "This wasn't me").
  const OFFICIAL_MAX = 12 * 3600e3;
  setInterval(() => {
    let changed = false;
    const live = new Set(Object.values(data.sessions).filter(s => s && typeof s === 'object' && !s.official && !s.dieAt).map(s => s.uid));
    for (const [key, s] of Object.entries(data.sessions)) {
      if (!s || typeof s !== 'object' || !s.official) continue;
      if (Date.now() - (s.createdAt || 0) > OFFICIAL_MAX || !s.by || !live.has(s.by) || !z.isFounder(s.by)) {
        delete data.sessions[key]; changed = true;
        for (const res of z.streams.get(s.uid) || []) if (res.zunoToken === key) { try { res.end(); } catch {} }
      }
    }
    if (changed) save();
  }, 60e3).unref();
  // ---- Trusted devices only (the founder's account) ----
  // A device is trusted by a long random secret kept in a cookie that pages can't read (HttpOnly),
  // set on that device while you're logged in there. With the lock on, every way of logging in
  // (password, two-factor, passkey, email code, recovery code, reset link) is refused anywhere else.
  // Locked out (cleared your browser, new PC)? Set ZUNO_FOUNDER_UNLOCK=1 on Render, log in, trust
  // the new device, then remove the variable again.
  const crypto = z.crypto;
  const DEV_COOKIE = 'zuno_device';
  const unlocked = () => process.env.ZUNO_FOUNDER_UNLOCK === '1';
  const deviceToken = req => {
    const m = String(req?.headers?.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(DEV_COOKIE + '='));
    const t = m ? m.slice(DEV_COOKIE.length + 1) : '';
    return /^[A-Za-z0-9_-]{40,80}$/.test(t) ? t : null;
  };
  const trustedOn = (u, req) => { const t = deviceToken(req); if (!t) return null; const h = z.sha('device:' + t); return (u.deviceLock?.devices || []).find(d => d.hash === h) || null; };
  const lockOn = u => !!u && z.isFounder(u.id) && !!u.deviceLock?.on && !unlocked();
  const BLOCKED = "This account can only log in from its owner's trusted devices.";
  const tellBlocked = (u, req) => {
    const k = 'devblock:' + u.id;
    try { z.limit(k, 1, 3600e3); } catch { return; } // at most one alert an hour
    z.systemMessage(u.id, `🛡️ **A login to your account was blocked** because it came from a device that isn't on your trusted list (${String(req?.headers?.['user-agent'] || 'unknown device').slice(0, 80)}). If this was you on a new device, trust it first from a device you're already logged in on.`);
  };
  hooks.loginGate = (u, req) => { if (lockOn(u) && !trustedOn(u, req)) { tellBlocked(u, req); fail(403, BLOCKED); } };
  hooks.newSession.unshift((u, req, key) => {
    if (!lockOn(u)) return;
    const d = trustedOn(u, req);
    if (!d) { delete data.sessions[key]; save(); tellBlocked(u, req); fail(403, BLOCKED); }
    d.lastUsed = Date.now();
    if (data.sessions[key]) data.sessions[key].device = d.id;
  });
  const devView = (u, req) => {
    const here = trustedOn(u, req);
    return { on: !!u.deviceLock?.on, unlockedByServer: unlocked(), thisTrusted: !!here, devices: (u.deviceLock?.devices || []).map(d => ({ id: d.id, name: d.name, at: d.at, lastUsed: d.lastUsed || null, current: here?.id === d.id })) };
  };
  const founderOnly = me => { if (!z.isFounder(me.id)) fail(403, 'Only the founder can use this.'); };
  route('GET', '/api/me/device-lock', async ({ me, req }) => { founderOnly(me); return devView(me, req); });
  route('POST', '/api/me/device-lock/trust', async ({ me, req, res, body, token }) => {
    founderOnly(me);
    z.needReauth(token);
    me.deviceLock ||= { on: false, devices: [] };
    if (trustedOn(me, req)) return devView(me, req);
    if (me.deviceLock.devices.length >= 10) fail(400, 'You can trust up to 10 devices. Remove one first.');
    const t = crypto.randomBytes(36).toString('base64url');
    const ua = String(req.headers['user-agent'] || '');
    const guess = `${/Electron|Zuno\//.test(ua) ? 'Zuno app' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'} on ${/Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'a device'}`;
    me.deviceLock.devices.push({ id: z.newId(), hash: z.sha('device:' + t), name: clean(body.name, 40) || guess, at: Date.now(), lastUsed: Date.now() });
    const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', `${DEV_COOKIE}=${t}; Path=/api/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=315360000`);
    save();
    z.systemMessage(me.id, `🛡️ **A new trusted device was added** to your account (${me.deviceLock.devices.at(-1).name}). If this wasn't you, remove it in Settings › My Account right away.`);
    return devView(me, req);
  });
  route('DELETE', '/api/me/device-lock/devices/:id', async ({ me, req, params, token }) => {
    founderOnly(me);
    z.needReauth(token);
    const list = me.deviceLock?.devices || [];
    const d = list.find(x => x.id === params.id);
    if (!d) fail(404, 'That device is already gone.');
    if (me.deviceLock.on && list.length === 1) fail(400, "That's your last trusted device. Turn the lock off first, or you'd be locked out.");
    me.deviceLock.devices = list.filter(x => x !== d);
    // Its logins end too.
    for (const [k, s] of Object.entries(data.sessions)) if (s && typeof s === 'object' && s.uid === me.id && s.device === d.id && k !== token) delete data.sessions[k];
    save();
    return devView(me, req);
  });
  route('POST', '/api/me/device-lock', async ({ me, req, body, token }) => {
    founderOnly(me);
    z.needReauth(token);
    me.deviceLock ||= { on: false, devices: [] };
    if (body.on) {
      const here = trustedOn(me, req);
      if (!here) fail(400, 'Trust this device first, so you don\'t lock yourself out.');
      me.deviceLock.on = true;
      // Everyone logged in somewhere that isn't trusted is logged out now.
      for (const [k, s] of Object.entries(data.sessions)) {
        const uid = typeof s === 'string' ? s : s?.uid;
        if (uid !== me.id || k === token) continue;
        if (typeof s === 'object' && s.device && me.deviceLock.devices.some(d => d.id === s.device)) continue;
        delete data.sessions[k];
        for (const r of z.streams.get(me.id) || []) if (r.zunoToken === k) { try { r.end(); } catch {} }
      }
      if (data.sessions[token] && typeof data.sessions[token] === 'object') data.sessions[token].device = here.id;
      z.systemMessage(me.id, '🛡️ **Trusted devices only is on.** Your account can now only be logged into from your trusted devices. Every other login was ended.');
    } else {
      me.deviceLock.on = false;
      z.systemMessage(me.id, '🔓 **Trusted devices only was turned off.** Any device can log in with your password again.');
    }
    save();
    return devView(me, req);
  });

  // Founder-only: shows which address the server thinks you're on, to check that rate limits can't be
  // dodged with made-up headers. Nothing is stored.
  route('GET', '/api/admin/ip-check', async ({ me, req }) => {
    if (!z.isFounder(me.id)) fail(403, 'Only the founder can see this.');
    const h = req.headers;
    return { chosen: z.clientIp(req), cfConnectingIp: h['cf-connecting-ip'] || null, xForwardedFor: h['x-forwarded-for'] || null, trueClientIp: h['true-client-ip'] || null, socket: req.socket.remoteAddress || null, cfRay: h['cf-ray'] || null };
  });
};
