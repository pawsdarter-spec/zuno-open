'use strict';
// Zuno 0.40: the Bot Builder. Bots that work without any code: "When … → do …" rules that Zuno
// runs itself (answer messages, /commands with set replies, welcome new members, react, give roles).
// Bots made with code keep working the same; a bot can use both.

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean } = z;

  const MAX_RULES = 25, MAX_ACTIONS = 5, LOG_SIZE = 40;
  const ONS = ['message', 'command', 'join'];
  const MATCHES = ['contains', 'exact', 'starts', 'any'];
  const ACTIONS = ['reply', 'send', 'react', 'role', 'unrole'];

  function myBot(me, id) {
    const bot = data.users[id];
    if (!bot || !z.devBot(bot) || bot.app?.ownerId !== me.id || bot.app?.deleted) fail(404, 'Bot not found.');
    return bot;
  }
  const short = (v, n) => clean(v, n).replace(/\s+/g, ' ');
  const cmdName = v => String(v || '').toLowerCase().trim().replace(/^\//, '');

  function cleanRules(list) {
    const out = [];
    for (const r of (Array.isArray(list) ? list : []).slice(0, MAX_RULES)) {
      const on = ONS.includes(r?.on) ? r.on : 'message';
      const rule = { id: /^[a-z0-9]{4,24}$/i.test(r?.id) ? r.id : z.newId(), on, enabled: r?.enabled !== false, name: short(r?.name, 40) };
      if (on === 'message') {
        rule.match = MATCHES.includes(r.match) ? r.match : 'contains';
        rule.text = short(r.text, 100);
        if (rule.match !== 'any' && !rule.text) fail(400, 'A message rule needs the words to look for.');
        rule.channel = short(r.channel, 32).replace(/^#/, '').toLowerCase();
        rule.cooldown = Math.max(0, Math.min(3600, Math.round(Number(r.cooldown) || 0)));
      }
      if (on === 'command') {
        rule.command = cmdName(r.command);
        if (!/^[a-z0-9_-]{1,32}$/.test(rule.command)) fail(400, 'Command names are 1–32 letters, numbers, - or _ (like "roll").');
        rule.description = short(r.description, 100);
        rule.usage = short(r.usage, 60);
      }
      if (on === 'join') rule.channel = short(r.channel, 32).replace(/^#/, '').toLowerCase();
      rule.actions = [];
      for (const a of (Array.isArray(r?.actions) ? r.actions : []).slice(0, MAX_ACTIONS)) {
        if (!ACTIONS.includes(a?.type)) continue;
        const act = { type: a.type };
        if (a.type === 'reply' || a.type === 'send') {
          act.text = clean(a.text, 1500);
          if (!act.text) fail(400, 'A message action needs some text.');
          if (a.type === 'send') act.channel = short(a.channel, 32).replace(/^#/, '').toLowerCase();
        }
        if (a.type === 'react') { act.emoji = String(a.emoji || '').trim().slice(0, 16); if (!act.emoji || /[<>\s]/.test(act.emoji)) fail(400, 'Pick an emoji to react with.'); }
        if (a.type === 'role' || a.type === 'unrole') { act.role = short(a.role, 32).replace(/^@/, ''); if (!act.role) fail(400, 'Type the name of the role.'); }
        rule.actions.push(act);
      }
      if (!rule.actions.length) fail(400, `Give "${rule.name || (on === 'command' ? '/' + rule.command : 'your rule')}" something to do.`);
      out.push(rule);
    }
    const cmds = out.filter(r => r.on === 'command').map(r => r.command);
    if (new Set(cmds).size !== cmds.length) fail(400, 'Two rules use the same /command.');
    return out;
  }
  // Builder commands show in the "/" menu next to ones the bot's code set.
  function syncCommands(bot) {
    const code = (bot.app.commands || []).filter(c => !c.builder);
    const built = (bot.app.rules || []).filter(r => r.on === 'command' && r.enabled !== false).map(r => ({ name: r.command, description: r.description || '', usage: r.usage || '', builder: true }));
    bot.app.commands = [...built, ...code.filter(c => !built.some(b => b.name === c.name))].slice(0, 25);
  }
  const refreshBotServers = bot => { for (const sv of Object.values(data.servers)) if (sv.members.includes(bot.id)) z.refreshServer(sv); };

  route('GET', '/api/apps/:id/builder', async ({ me, params }) => {
    const bot = myBot(me, params.id);
    return { rules: bot.app.rules || [], log: (bot.app.log || []).slice().reverse(), status: bot.customStatus || '' };
  });
  route('PUT', '/api/apps/:id/builder', async ({ me, params, body }) => {
    const bot = myBot(me, params.id);
    const rules = cleanRules(body.rules);
    bot.app.rules = rules;
    // Rules that give roles need "Manage Roles"; asked for automatically (servers already using
    // the bot can tick it on the bot's role).
    if (rules.some(r => r.actions.some(a => a.type === 'role' || a.type === 'unrole')) && !bot.app.perms.includes('manage_roles')) bot.app.perms = [...bot.app.perms, 'manage_roles'];
    syncCommands(bot);
    save(); z.broadcastUser(bot); refreshBotServers(bot);
    return { rules: bot.app.rules, perms: bot.app.perms };
  });
  route('PUT', '/api/apps/:id/status', async ({ me, params, body }) => {
    const bot = myBot(me, params.id);
    bot.customStatus = z.checkName(clean(body.status, 80));
    save(); z.broadcastUser(bot);
    return { status: bot.customStatus };
  });
  route('DELETE', '/api/apps/:id/builder/log', async ({ me, params }) => {
    const bot = myBot(me, params.id);
    bot.app.log = []; save();
    return { ok: true };
  });

  // Bot Developer badge: you made a bot that's in at least one server. Worked out at most once a minute.
  let devCache = { at: 0, ids: new Set() };
  hooks.autoBadges.push(u => {
    if (Date.now() - devCache.at > 60e3) {
      const inServer = new Set();
      for (const sv of Object.values(data.servers)) for (const id of sv.members) inServer.add(id);
      const ids = new Set();
      for (const b of Object.values(data.users)) if (z.devBot(b) && !b.app?.deleted && b.app?.ownerId && inServer.has(b.id)) ids.add(b.app.ownerId);
      devCache = { at: Date.now(), ids };
    }
    return devCache.ids.has(u.id) ? ['botdev'] : [];
  });

  // ---------- running rules ----------
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function fill(text, ctx) {
    return String(text)
      .replace(/\{random:([^}]{1,400})\}/g, (_, opts) => pick(opts.split('|')).trim())
      .replace(/\{dice(?::(\d{1,6}))?\}/g, (_, n) => String(1 + Math.floor(Math.random() * Math.max(2, Math.min(1e6, Number(n) || 6)))))
      .replace(/\{number:(-?\d{1,6})-(-?\d{1,6})\}/g, (_, a, b) => { const lo = Math.min(+a, +b), hi = Math.max(+a, +b); return String(lo + Math.floor(Math.random() * (hi - lo + 1))); })
      .replace(/\{user\}/g, ctx.user?.displayName || 'someone')
      .replace(/\{mention\}/g, ctx.user ? '@' + ctx.user.username : '')
      .replace(/\{username\}/g, ctx.user?.username || '')
      .replace(/\{server\}/g, ctx.sv?.name || '')
      .replace(/\{channel\}/g, ctx.ch ? '#' + ctx.ch.name : '')
      .replace(/\{members\}/g, String(ctx.sv ? ctx.sv.members.filter(id => !data.users[id]?.bot).length : 0))
      .replace(/\{args\}/g, ctx.args || '')
      .slice(0, 2000);
  }
  function logRun(bot, rule, sv, ok, note) {
    bot.app.log = [...(bot.app.log || []), { at: Date.now(), rule: rule.name || (rule.on === 'command' ? '/' + rule.command : rule.on === 'join' ? 'Member joins' : `“${rule.text || 'any message'}”`), server: sv?.name || '', ok, note: note || '' }].slice(-LOG_SIZE);
  }
  const channelNamed = (sv, name) => sv.channels.find(c => c.type === 'text' && c.name.toLowerCase() === name);
  const canTalk = (sv, ch, bot) => { const p = z.permsIn(z.ensureRoles(sv), ch, bot.id); return p.has('view_channels') && p.has('send_messages'); };
  function post(sv, ch, bot, text, replyTo) {
    const conv = z.channelConvFor(sv, ch);
    const extra = {};
    if (replyTo) extra.replyTo = { id: replyTo.id, authorId: replyTo.authorId, snippet: (replyTo.content || '').slice(0, 120) };
    return z.postMessage(conv, bot, text, extra);
  }
  function react(sv, ch, bot, msg, emoji) {
    const conv = z.channelConvFor(sv, ch);
    const { st, i, m } = z.findMessage(conv, msg.id);
    const reactions = { ...(m.reactions || {}) };
    if (!(emoji in reactions) && (Object.keys(reactions).length >= 20 || !z.permsIn(sv, ch, bot.id).has('add_reactions'))) throw new Error("couldn't react (no Add Reactions permission)");
    reactions[emoji] = [...new Set([...(reactions[emoji] || []), bot.id])];
    const message = st.messages[i] = { ...m, reactions };
    z.emit(conv, 'message-update', { message });
  }
  function setRole(sv, bot, uid, roleName, give) {
    const role = sv.roles.find(r => r.name.toLowerCase() === roleName.toLowerCase() && r.id !== sv.id && !r.managed);
    if (!role) throw new Error(`there's no role called "${roleName}"`);
    if (!z.basePerms(sv, bot.id).has('manage_roles')) throw new Error("the bot's role needs Manage Roles");
    if (sv.roles.indexOf(role) <= z.topPos(sv, bot.id)) throw new Error(`"${role.name}" is above the bot's role; move the bot's role higher`);
    const cur = z.rolesOf(sv, uid);
    if (give === cur.includes(role.id)) return;
    sv.memberRoles[uid] = give ? [...cur, role.id] : cur.filter(id => id !== role.id);
    z.refreshServer(sv);
  }
  function run(bot, rule, ctx) {
    const notes = [];
    let ok = true;
    for (const a of rule.actions) {
      try {
        if (a.type === 'reply') {
          if (!ctx.ch || !canTalk(ctx.sv, ctx.ch, bot)) throw new Error(`can't talk in #${ctx.ch?.name || '?'}`);
          post(ctx.sv, ctx.ch, bot, fill(a.text, ctx), ctx.msg);
        } else if (a.type === 'send') {
          const ch = a.channel ? channelNamed(ctx.sv, a.channel) : ctx.ch;
          if (!ch) throw new Error(`there's no #${a.channel}`);
          if (!canTalk(ctx.sv, ch, bot)) throw new Error(`can't talk in #${ch.name}`);
          post(ctx.sv, ch, bot, fill(a.text, { ...ctx, ch: ctx.ch || ch }));
        } else if (a.type === 'react') {
          if (!ctx.msg) throw new Error('nothing to react to');
          react(ctx.sv, ctx.ch, bot, ctx.msg, a.emoji);
        } else if (a.type === 'role' || a.type === 'unrole') {
          setRole(ctx.sv, bot, ctx.user.id, a.role, a.type === 'role');
        }
      } catch (e) { ok = false; notes.push(e.message); }
    }
    logRun(bot, rule, ctx.sv, ok, notes.join('; '));
    save();
  }
  const lastRun = new Map(); // rule+channel -> time, for cooldowns
  const builderBots = sv => sv.members.map(id => data.users[id]).filter(b => z.devBot(b) && !b.app?.deleted && b.app?.rules?.length);
  function matches(rule, text) {
    const t = String(text || '').toLowerCase().trim(), w = (rule.text || '').toLowerCase();
    if (rule.match === 'any') return !!t;
    if (rule.match === 'exact') return t === w;
    if (rule.match === 'starts') return t.startsWith(w);
    return t.includes(w);
  }

  hooks.afterPost.push(({ conv, me, message, command }) => {
    if (conv.kind !== 'channel' || !me || me.bot || me.system || me.webhook) return;
    const sv = conv.server, ch = conv.channel;
    // /commands with set replies
    if (command) {
      const bot = data.users[command.botId];
      const rule = bot?.app?.rules?.find(r => r.on === 'command' && r.enabled !== false && r.command === command.name);
      if (rule) { setImmediate(() => run(bot, rule, { sv, ch, user: me, msg: message, args: command.args })); return 'handled'; }
      return;
    }
    if (String(message.content || '').startsWith('/')) return;
    for (const bot of builderBots(sv)) {
      if (!z.canView(sv, ch, bot.id)) continue;
      for (const rule of bot.app.rules) {
        if (rule.on !== 'message' || rule.enabled === false) continue;
        if (rule.channel && rule.channel !== ch.name.toLowerCase()) continue;
        if (!matches(rule, message.content)) continue;
        const key = bot.id + rule.id + ch.id, cd = Math.max(2, rule.cooldown || 0) * 1000;
        if (Date.now() - (lastRun.get(key) || 0) < cd) continue;
        lastRun.set(key, Date.now());
        setImmediate(() => run(bot, rule, { sv, ch, user: me, msg: message }));
      }
    }
  });
  hooks.onJoin.push((sv, user) => {
    if (!user || user.bot) return;
    for (const bot of builderBots(sv)) for (const rule of bot.app.rules) {
      if (rule.on !== 'join' || rule.enabled === false) continue;
      const ch = (rule.channel && channelNamed(sv, rule.channel)) || sv.channels.find(c => c.id === sv.welcomeChannelId) || sv.channels.find(c => c.type === 'text' && canTalk(sv, c, bot));
      setTimeout(() => run(bot, rule, { sv, ch, user }), 400);
    }
  });

  // Try a rule without posting anything: what would the bot say?
  route('POST', '/api/apps/:id/builder/test', async ({ me, params, body }) => {
    const bot = myBot(me, params.id);
    const rules = body.rules ? cleanRules(body.rules) : bot.app.rules || [];
    const text = clean(body.text, 500);
    const fake = { sv: { name: 'Your Server', members: ['a', 'b', 'c'] }, ch: { name: 'general' }, user: me };
    const out = [];
    const cmd = /^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(text);
    const hits = cmd ? rules.filter(r => r.on === 'command' && r.enabled !== false && r.command === cmd[1].toLowerCase())
      : body.join ? rules.filter(r => r.on === 'join' && r.enabled !== false)
      : rules.filter(r => r.on === 'message' && r.enabled !== false && matches(r, text));
    for (const r of hits) for (const a of r.actions) {
      const ctx = { ...fake, args: cmd?.[2] || '' };
      if (a.type === 'reply') out.push({ kind: 'reply', text: fill(a.text, ctx) });
      if (a.type === 'send') out.push({ kind: 'send', channel: a.channel || 'general', text: fill(a.text, ctx) });
      if (a.type === 'react') out.push({ kind: 'react', emoji: a.emoji });
      if (a.type === 'role' || a.type === 'unrole') out.push({ kind: a.type, role: a.role });
    }
    return { matched: hits.length, actions: out };
  });
};
