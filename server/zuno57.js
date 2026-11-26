'use strict';
// Zuno 0.57: richer bots. Bot messages can carry embeds (cards with a title, text, fields and
// pictures the bot uploaded), buttons, dropdown menus, and forms (modals). Clicking one tells the
// bot, which answers with a new message, an edit, a form, or a reply only the clicker can see.
// Bots also get limits on pinging people.
const crypto = require('crypto');

module.exports = function (z) {
  const { data, save, route, fail, hooks, clean, send, publicUser, postMessage, emit, findMessage, channelConv, dmConv, devBot, limit, newId, userByName } = z;
  const IX_TTL = 15 * 60e3;
  const str = (v, max) => clean(typeof v === 'string' ? v : v == null ? '' : String(v), max);
  const okId = v => typeof v === 'string' && /^[\w:.\-]{1,100}$/.test(v);
  const okUrl = v => typeof v === 'string' && v.length <= 512 && /^https?:\/\/[^\s<>"']+$/i.test(v);
  const okColor = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const emojiOf = v => { const e = str(v, 32).trim(); return e && !/[<>"'&]/.test(e) ? e : undefined; };

  // ======================= cleaning what a bot sends =======================
  function cleanComponents(list) {
    if (list == null) return undefined;
    if (!Array.isArray(list)) fail(400, 'components must be a list of rows.');
    if (list.length > 5) fail(400, 'A message can have up to 5 rows of components.');
    const ids = new Set();
    const rows = list.map(row => {
      const items = Array.isArray(row?.items) ? row.items : Array.isArray(row?.components) ? row.components : Array.isArray(row) ? row : null;
      if (!items?.length) fail(400, 'Each row needs at least one button or menu.');
      const hasSelect = items.some(i => i?.type === 'select');
      if (hasSelect && items.length > 1) fail(400, 'A dropdown menu needs a row of its own.');
      if (items.length > 5) fail(400, 'A row can have up to 5 buttons.');
      return {
        type: 'row', items: items.map(c => {
          if (c?.type === 'select') {
            if (!okId(c.id)) fail(400, 'Each menu needs an id (letters, numbers, _ - : . up to 100).');
            if (ids.has(c.id)) fail(400, `The id "${c.id}" is used twice.`); ids.add(c.id);
            const options = Array.isArray(c.options) ? c.options.slice(0, 25) : [];
            if (!options.length) fail(400, 'A menu needs at least one option.');
            const values = new Set();
            const opts = options.map(o => {
              const value = str(o?.value, 100);
              if (!value || values.has(value)) fail(400, 'Every menu option needs its own value.');
              values.add(value);
              return { label: str(o.label, 80) || value, value, ...(o.description ? { description: str(o.description, 100) } : {}), ...(emojiOf(o.emoji) ? { emoji: emojiOf(o.emoji) } : {}), ...(o.default ? { default: true } : {}) };
            });
            const min = Math.max(0, Math.min(opts.length, Math.floor(Number(c.min ?? c.minValues ?? 1)) || 0));
            const max = Math.max(Math.max(1, min), Math.min(opts.length, Math.floor(Number(c.max ?? c.maxValues ?? 1)) || 1));
            return { type: 'select', id: c.id, placeholder: str(c.placeholder, 100) || 'Pick an option', min, max, options: opts, ...(c.disabled ? { disabled: true } : {}) };
          }
          if (c?.type !== 'button') fail(400, 'Components can be "button" or "select".');
          const style = ['primary', 'secondary', 'success', 'danger', 'link'].includes(c.style) ? c.style : 'secondary';
          const label = str(c.label, 80), emoji = emojiOf(c.emoji);
          if (!label && !emoji) fail(400, 'A button needs a label or an emoji.');
          const b = { type: 'button', style, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}), ...(c.disabled ? { disabled: true } : {}) };
          if (style === 'link') { if (!okUrl(c.url)) fail(400, 'A link button needs an http(s) url.'); b.url = c.url; }
          else { if (!okId(c.id)) fail(400, 'Each button needs an id (letters, numbers, _ - : . up to 100).'); if (ids.has(c.id)) fail(400, `The id "${c.id}" is used twice.`); ids.add(c.id); b.id = c.id; }
          return b;
        }),
      };
    });
    return rows.length ? rows : null;
  }
  // Pictures in embeds must be files the bot uploaded itself (POST /api/attachments), so they stay
  // private to whoever can see the message and nobody's browser is sent to another site.
  function embedPicture(bot, id) {
    if (!id) return undefined;
    const a = data.attachments[typeof id === 'object' ? id.id : id];
    if (!a || a.owner !== bot.id || a.kind !== 'image') fail(400, 'Embed pictures must be images this bot uploaded (POST /api/attachments, then use its id).');
    a.used = true; save.touch?.('attachments', a.id);
    return { id: a.id, url: a.url, name: a.name };
  }
  function cleanEmbeds(bot, list) {
    if (list == null) return undefined;
    if (!Array.isArray(list)) fail(400, 'embeds must be a list.');
    if (list.length > 5) fail(400, 'A message can have up to 5 embeds.');
    const out = list.map(e => {
      if (!e || typeof e !== 'object') fail(400, 'Each embed must be an object.');
      const fields = (Array.isArray(e.fields) ? e.fields : []).slice(0, 15).map(f => ({ name: str(f?.name, 100), value: str(f?.value, 600), ...(f?.inline ? { inline: true } : {}) })).filter(f => f.name || f.value);
      const em = {
        ...(e.title ? { title: str(e.title, 256) } : {}),
        ...(okUrl(e.url) ? { url: e.url } : {}),
        ...(e.description ? { description: str(e.description, 2000) } : {}),
        ...(okColor(e.color) ? { color: e.color.toLowerCase() } : {}),
        ...(e.author?.name ? { author: { name: str(e.author.name, 100) } } : {}),
        ...(fields.length ? { fields } : {}),
        ...(e.image ? { image: embedPicture(bot, e.image) } : {}),
        ...(e.thumbnail ? { thumbnail: embedPicture(bot, e.thumbnail) } : {}),
        ...(e.footer?.text || typeof e.footer === 'string' ? { footer: str(e.footer?.text ?? e.footer, 200) } : {}),
        ...(e.timestamp && !isNaN(new Date(e.timestamp)) ? { timestamp: new Date(e.timestamp).getTime() } : {}),
      };
      if (!Object.keys(em).length) fail(400, 'An embed needs at least a title, description, field or picture.');
      return em;
    });
    if (JSON.stringify(out).length > 12000) fail(400, 'Those embeds are too long.');
    return out.length ? out : null;
  }

  // ======================= pings from bots =======================
  // A bot can mention up to 10 people and 3 roles in one message, @everyone/@here once every
  // 30 minutes per server (4 a day), and ping up to 30 people a minute per server.
  function botPingLimits(conv, bot, content) {
    if (conv.kind !== 'channel' || !content) return;
    const sv = conv.server;
    const users = new Set();
    for (const m of content.matchAll(/(^|[^\w@])@([a-z0-9_.]{2,32})\b/gi)) { const u = userByName(m[2]); if (u && conv.members.includes(u.id) && !u.bot) users.add(u.id); }
    const big = conv.perms?.has('mention_everyone');
    const all = big && /(^|\s)@(everyone|here)\b/i.test(content);
    let roles = 0;
    for (const r of sv.roles || []) {
      if (r.everyone || !(r.mentionable || big)) continue;
      const re = new RegExp('(^|[^\\w@])@' + r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.])', 'i');
      if (re.test(content)) roles++;
    }
    if (users.size > 10) fail(400, 'Bots can mention up to 10 people in one message.');
    if (roles > 3) fail(400, 'Bots can mention up to 3 roles in one message.');
    if (all) {
      limit(`bot-all:${bot.id}:${sv.id}`, 1, 30 * 60e3, 'Bots can use @everyone or @here once every 30 minutes in a server.');
      limit(`bot-all-day:${bot.id}:${sv.id}`, 4, 864e5, 'Bots can use @everyone or @here 4 times a day in a server.');
    }
    for (let i = 0; i < users.size + roles * 3; i++) limit(`bot-ping:${bot.id}:${sv.id}`, 30, 60e3, "This bot is pinging people too fast. Wait a minute.");
  }

  // Bots (and only bots) may add embeds and components to a message.
  hooks.beforePost.push(({ conv, me, body, content, extra }) => {
    const wants = body.embeds != null || body.components != null;
    if (!devBot(me)) { if (wants) fail(403, 'Only bots can send embeds and buttons.'); return; }
    botPingLimits(conv, me, content);
    const embeds = cleanEmbeds(me, body.embeds), components = cleanComponents(body.components);
    if (embeds) extra.embeds = embeds;
    if (components) extra.components = components;
  });
  hooks.beforeEdit.push(({ conv, me, body, content, change }) => {
    if (!devBot(me)) { if (body.embeds != null || body.components != null) fail(403, 'Only bots can send embeds and buttons.'); return; }
    botPingLimits(conv, me, content);
    if ('embeds' in body) change.embeds = cleanEmbeds(me, body.embeds) || null;
    if ('components' in body) change.components = cleanComponents(body.components) || null;
  });

  // ======================= clicks, picks and forms =======================
  // Each click becomes an "interaction" the bot can answer for 15 minutes.
  const interactions = new Map(); // id -> { botId, userId, conv, messageId, at, modal? }
  const ephemerals = new Map();   // message id -> { userId, botId, conv, message, at } (never saved)
  setInterval(() => {
    const old = Date.now() - IX_TTL;
    for (const [k, v] of interactions) if (v.at < old) interactions.delete(k);
    for (const [k, v] of ephemerals) if (v.at < old) ephemerals.delete(k);
  }, 60e3).unref();
  const convFor = (user, key) => (typeof key === 'string' && key.startsWith('ch:') ? channelConv(user, key.slice(3)) : dmConv(user, String(key || '')));
  const findComponent = (m, id) => { for (const r of m.components || []) for (const c of r.items || []) if (c.id === id) return c; return null; };

  function openInteraction(me, bot, conv, convKey, messageId, extra) {
    if (!devBot(bot) || bot.app?.deleted) fail(404, "That bot isn't around anymore.");
    if (conv.kind === 'channel' && !conv.members.includes(bot.id)) fail(404, "That bot isn't in this server anymore.");
    const id = crypto.randomBytes(16).toString('hex');
    interactions.set(id, { botId: bot.id, userId: me.id, convKey, messageId, at: Date.now() });
    send(bot.id, 'interaction', {
      id, messageId, user: publicUser(me),
      ...(conv.kind === 'channel' ? { serverId: conv.server.id, channelId: conv.channel.id } : { dm: true, userId: me.id }),
      ...extra,
    });
    return id;
  }

  route('POST', '/api/interactions', async ({ me, body }) => {
    if (me.bot) fail(403, "Bots can't click buttons.");
    limit('ix:' + me.id, 10, 10e3, "You're clicking too fast.");
    const convKey = String(body.conv || '');
    const conv = convFor(me, convKey);
    if (conv.kind === 'channel' && !conv.perms.has('use_commands')) fail(403, "You don't have permission to use bot commands here.");
    const msgId = str(body.messageId, 64);
    let m, botId;
    const eph = ephemerals.get(msgId);
    if (eph) { if (eph.userId !== me.id) fail(404, 'That message no longer exists.'); m = eph.message; botId = eph.botId; }
    else { m = findMessage(conv, msgId).m; botId = m.authorId; }
    const c = findComponent(m, String(body.componentId || ''));
    if (!c || c.disabled) fail(400, "That button can't be used anymore.");
    let values;
    if (c.type === 'select') {
      values = [...new Set((Array.isArray(body.values) ? body.values : []).map(v => String(v)))];
      if (values.some(v => !c.options.some(o => o.value === v))) fail(400, "That isn't one of the choices.");
      if (values.length < c.min || values.length > c.max) fail(400, c.min === c.max ? `Pick ${c.min}.` : `Pick between ${c.min} and ${c.max}.`);
    }
    const id = openInteraction(me, z.data.users[botId], conv, convKey, msgId, { type: c.type === 'select' ? 'select' : 'button', componentId: c.id, ...(values ? { values } : {}), ...(eph ? { ephemeral: true } : {}) });
    return { id };
  });

  // Sending a form the bot showed.
  route('POST', '/api/interactions/:id/submit', async ({ me, params, body }) => {
    limit('ix:' + me.id, 10, 10e3, "You're clicking too fast.");
    const ix = interactions.get(params.id);
    if (!ix || ix.userId !== me.id || !ix.modal || Date.now() - ix.at > IX_TTL) fail(404, 'That form has expired. Try again.');
    const modal = ix.modal; delete ix.modal;
    const given = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const fields = {};
    for (const inp of modal.inputs) {
      const v = str(given[inp.id], inp.max).trim();
      if (inp.required && !v) fail(400, `Fill in "${inp.label}".`);
      if (v && v.length < inp.min) fail(400, `"${inp.label}" needs at least ${inp.min} characters.`);
      fields[inp.id] = v;
    }
    const conv = convFor(me, ix.convKey);
    const id = openInteraction(me, z.data.users[ix.botId], conv, ix.convKey, ix.messageId, { type: 'modal', modalId: modal.id, fields });
    return { id };
  });

  // The bot answers. type: "reply" (a new message; ephemeral:true for only the clicker),
  // "update" (change the message that was clicked), "modal" (show a form), or "ack" (nothing to show).
  route('POST', '/api/interactions/:id/respond', async ({ me, params, body }) => {
    if (!devBot(me)) fail(403, 'Only bots can do that.');
    limit('ix-r:' + me.id, 30, 10e3, 'This bot is answering too fast.');
    const ix = interactions.get(params.id);
    if (!ix || ix.botId !== me.id || Date.now() - ix.at > IX_TTL) fail(404, 'That interaction has expired (bots have 15 minutes to answer).');
    const person = data.users[ix.userId];
    if (!person) fail(404, 'That person is gone.');
    const personConv = convFor(person, ix.convKey);
    const type = String(body.type || 'reply');
    const done = () => send(person.id, 'ix-done', { id: params.id });
    if (type === 'ack') { done(); return { ok: true }; }
    if (type === 'modal') {
      const md = body.modal || {};
      if (!okId(md.id)) fail(400, 'A form needs an id.');
      const inputs = (Array.isArray(md.inputs) ? md.inputs : []).slice(0, 5).map(i => {
        if (!okId(i?.id)) fail(400, 'Each form field needs an id.');
        const max = Math.max(1, Math.min(4000, Math.floor(Number(i.max)) || 1000));
        return { id: i.id, label: str(i.label, 45) || i.id, style: i.style === 'paragraph' ? 'paragraph' : 'short', placeholder: str(i.placeholder, 100), required: i.required !== false, min: Math.max(0, Math.min(max, Math.floor(Number(i.min)) || 0)), max, value: str(i.value, max) };
      });
      if (!inputs.length) fail(400, 'A form needs at least one field.');
      ix.modal = { id: md.id, title: str(md.title, 45) || me.displayName, inputs };
      ix.at = Date.now();
      send(person.id, 'bot-modal', { id: params.id, bot: publicUser(me), modal: ix.modal });
      done();
      return { ok: true };
    }
    const content = str(body.content, 4000).trim();
    const embeds = cleanEmbeds(me, body.embeds), components = cleanComponents(body.components);
    if (type === 'update') {
      const eph = ephemerals.get(ix.messageId);
      if (eph) {
        eph.message = { ...eph.message, ...('content' in body ? { content } : {}), ...('embeds' in body ? { embeds } : {}), ...('components' in body ? { components } : {}), editedAt: Date.now() };
        send(person.id, 'bot-ephemeral', { conv: eph.conv, message: eph.message, author: publicUser(me) });
        done();
        return { ok: true };
      }
      const botConv = convFor(me, personConv.kind === 'dm' ? person.id : ix.convKey);
      const { st, i, m } = findMessage(botConv, ix.messageId);
      if (m.authorId !== me.id) fail(403, 'Bots can only update their own messages.');
      botPingLimits(botConv, me, 'content' in body ? content : '');
      const message = st.messages[i] = { ...m, ...('content' in body ? { content } : {}), ...('embeds' in body ? { embeds } : {}), ...('components' in body ? { components } : {}), editedAt: Date.now() };
      if (!message.content && !message.embeds?.length && !message.components?.length && !message.attachments) fail(400, "A message can't be empty.");
      save();
      emit(botConv, 'message-update', { message });
      done();
      return { message };
    }
    if (type !== 'reply') fail(400, 'type must be reply, update, modal or ack.');
    if (!content && !embeds && !components) fail(400, "You can't send an empty message.");
    if (body.ephemeral) {
      const message = { id: 'eph' + newId(), authorId: me.id, content, createdAt: Date.now(), ephemeral: true, ...(embeds ? { embeds } : {}), ...(components ? { components } : {}) };
      const convKey = personConv.kind === 'dm' ? me.id : ix.convKey;
      ephemerals.set(message.id, { userId: person.id, botId: me.id, conv: convKey, message, at: Date.now() });
      send(person.id, 'bot-ephemeral', { conv: convKey, message, author: publicUser(me) });
      done();
      return { message };
    }
    const botConv = convFor(me, personConv.kind === 'dm' ? person.id : ix.convKey);
    if (botConv.kind === 'channel') {
      if (!botConv.perms.has('send_messages')) fail(403, "This bot can't send messages in that channel.");
      limit('bot-msg:' + me.id, 25, 10e3, 'This bot is sending messages too fast.');
    }
    botPingLimits(botConv, me, content);
    const message = postMessage(botConv, me, content, { ...(embeds ? { embeds } : {}), ...(components ? { components } : {}) });
    done();
    return { message };
  });
};
