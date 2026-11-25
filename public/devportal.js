'use strict';
// Settings › Developer: make bots, get their tokens, and add them to servers.
// Also the "/" command menu in the message box for bots in the server.

let devSel = null;
async function renderDeveloper(body) {
  let d;
  try { d = await api('GET', '/api/apps'); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const app = d.apps.find(a => a.id === devSel);
  if (app) return renderBotPage(body, app, d.perms);
  body.innerHTML = `<h2>Developer</h2>
    <div class="dev-hero"><div><h3>${uiIcon('bot')} Build a bot for Zuno</h3><p class="muted">Bots can read and send messages, react, give roles and answer <b>/commands</b>, with the same permissions as people. Build one with no code using the <b>Bot Builder</b>, or run your own code. Webhooks are even simpler: find them in Server Settings › Bots & Webhooks.</p></div>
      <button class="btn btn-primary" id="dev-new">${ICON.plus} New Bot</button></div>
    <h4 class="setting-head">Your bots <span class="muted">${d.apps.length}/10</span></h4>
    <div class="dev-grid">${d.apps.map(a => `<button class="dev-card" data-app="${esc(a.id)}">${avatar({ ...a, displayName: a.name }, 56)}<b>${esc(a.name)}</b><small>${a.servers.length} server${a.servers.length === 1 ? '' : 's'} · ${a.online ? '<span class="int-on">● online</span>' : 'offline'}</small>${a.public ? '<span class="chip on small">Public</span>' : ''}</button>`).join('') || `<div class="empty-state">${mascot('curious')}<div class="title">No bots yet</div><div>Make your first one, it only takes a second.</div></div>`}</div>`;
  $('#dev-new', body).addEventListener('click', () => {
    const ov = openLayer(`<form class="dialog modal"><h3>New Bot</h3>
      <label class="field">Name<input name="name" maxlength="32" required placeholder="Helpful Robot"></label>
      <label class="field">What does it do? <span class="hint">(optional)</span><textarea name="description" maxlength="400" placeholder="Rolls dice, tells jokes…"></textarea></label>
      <p class="muted small">By making a bot you agree to follow the <a href="/terms" target="_blank">Terms of Service</a>. Bots that spam or harm people get removed.</p>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Bot</button></div></form>`);
    $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
    $('form', ov).addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('POST', '/api/apps', { name: e.target.name.value, description: e.target.description.value }); dismissLayer(); devSel = r.app.id; await renderDeveloper(body); showToken(r.token, r.app.name); }
      catch (err) { toast(err.message, true); }
    });
    $('[name=name]', ov).focus();
  });
  $$('[data-app]', body).forEach(b => b.addEventListener('click', () => { devSel = b.dataset.app; renderDeveloper(body); }));
}
function showToken(token, name) {
  const ov = openLayer(`<div class="dialog modal"><h3>🔑 ${esc(name)}'s token</h3>
    <p>This is your bot's password. <b>Copy it now</b>: Zuno only shows it once. Never share it or put it in public code. If it leaks, make a new one.</p>
    <div class="copy-row"><input readonly value="${esc(token)}" id="tok"><button class="btn btn-primary btn-sm" id="tok-copy">Copy</button></div>
    <div class="actions"><button class="btn btn-primary" data-a="ok">I saved it</button></div></div>`);
  $('#tok-copy', ov).addEventListener('click', e => { copyText(token, 'Token'); e.target.textContent = 'Copied!'; });
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
}
function sampleCode() {
  return `// Zuno bot starter (Node 18 or newer). Save as bot.js, then run: node bot.js
const TOKEN = process.env.ZUNO_BOT_TOKEN; // paste your token here or set it as an env variable
const ZUNO = '${location.origin}';
const api = (method, path, body) => fetch(ZUNO + path, {
  method, headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}).then(r => r.json());

async function main() {
  // Tell Zuno which /commands your bot has. They show up in the message box.
  await api('PUT', '/api/bots/@me/commands', { commands: [
    { name: 'ping', description: 'Check that I am awake' },
    { name: 'roll', description: 'Roll a die', usage: '[sides]' },
  ] });
  // Listen for live events (messages, commands, joins).
  const res = await fetch(ZUNO + '/api/events', { headers: { Authorization: 'Bot ' + TOKEN } });
  const dec = new TextDecoder(); let buf = '';
  console.log('Bot is online!');
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\\n\\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || 'null');
      if (event === 'command') await onCommand(data);
      if (event === 'message' && data.message.content === 'hello bot') {
        await api('POST', \`/api/channels/\${data.channelId}/messages\`, { content: 'Hi there! 👋' });
      }
    }
  }
}
async function onCommand(c) {
  const reply = content => api('POST', \`/api/channels/\${c.channelId}/messages\`, { content, replyTo: c.messageId });
  if (c.name === 'ping') await reply('Pong! 🏓');
  if (c.name === 'roll') await reply(\`🎲 \${c.user.displayName} rolled **\${1 + Math.floor(Math.random() * (Number(c.args) || 6))}**\`);
}
main().catch(e => { console.error(e); process.exit(1); });
`;
}
async function renderBotPage(body, app, perms) {
  const groups = ['General', 'Members', 'Text', 'Voice'];
  const want = new Set(app.perms);
  body.innerHTML = `<button class="btn btn-link btn-sm" id="dev-back" style="padding-left:0">‹ All bots</button>
    <div class="bot-head">${avatar({ ...app, displayName: app.name }, 80)}<div style="flex:1;min-width:0"><h2 style="margin:0">${esc(app.name)} <span class="official bot-tag">Bot</span></h2>
      <div class="muted small">@${esc(app.username)} · ID <code>${esc(app.id)}</code> · ${app.online ? '<span class="int-on">● online</span>' : 'offline'}</div>
      <div class="row-btns" style="margin-top:8px"><button class="btn btn-grey btn-sm" id="bot-av">Change Avatar</button><input type="file" id="bot-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
      <button class="btn btn-primary btn-sm" id="bot-add">Add to Server</button><button class="btn btn-grey btn-sm" id="bot-link">Copy Add Link</button></div></div></div>
    <form id="bot-form" class="setting-group">
      <label class="field">Name<input name="name" maxlength="32" value="${esc(app.name)}"></label>
      <label class="field">Description<textarea name="description" maxlength="400">${esc(app.description)}</textarea></label>
      <button class="btn btn-primary btn-sm">Save</button></form>
    <div class="setting-group">${ssToggle('public', 'Public bot', "Anyone can add it to servers they manage, and it shows in the public bot list. Off: only you can add it.", app.public)}</div>
    <div class="setting-group"><h4 class="setting-head">Permissions it asks for</h4><p class="muted small" style="margin:0 0 8px">When someone adds the bot, these are pre-checked. They can only give ones they have.</p>
      <div class="ab-perms">${groups.map(g => Object.entries(perms).filter(([, v]) => v.group === g).map(([k, v]) => `<label class="priv-role"><input type="checkbox" value="${k}"${want.has(k) ? ' checked' : ''}> ${esc(v.label)}</label>`).join('')).join('')}</div></div>
    <div class="setting-group"><h4 class="setting-head">Commands</h4>
      ${app.commands.length ? `<div class="int-cmds">${app.commands.map(c => `<div><code>/${esc(c.name)}${c.usage ? ' ' + esc(c.usage) : ''}</code> <span class="muted small">${esc(c.description)}</span></div>`).join('')}</div>` : '<p class="muted small">Your code sets these with <code>PUT /api/bots/@me/commands</code>. See the starter code below.</p>'}</div>
    <div class="setting-group"><h4 class="setting-head">In ${app.servers.length} server${app.servers.length === 1 ? '' : 's'}</h4>${app.servers.map(s => `<span class="chip">${esc(s.name)}</span>`).join(' ') || '<span class="muted small">Not in any servers yet.</span>'}</div>
    <div class="setting-group"><h4 class="setting-head">Starter code</h4>
      <p class="muted small" style="margin:0 0 8px">A tiny working bot with <code>/ping</code> and <code>/roll</code>. Bots sign in with <code>Authorization: Bot &lt;token&gt;</code> and use the same API as the app.</p>
      <div class="code-wrap"><button class="btn btn-grey btn-sm code-copy" id="code-copy">Copy</button><pre class="code-sample">${esc(sampleCode())}</pre></div></div>
    <div class="setting-group danger-zone"><h4 class="setting-head">Token & danger zone</h4>
      <div class="setting-row"><div><div class="setting-title">Reset token</div><div class="setting-desc">Makes a new token. The old one stops working and the bot disconnects.</div></div><button class="btn btn-grey btn-sm" id="bot-token">Reset Token</button></div>
      <div class="setting-row"><div><div class="setting-title">Delete bot</div><div class="setting-desc">Removes it from every server. Its messages stay.</div></div><button class="btn btn-red btn-sm" id="bot-del">Delete</button></div></div>`;
  const reload = async () => { const d = await api('GET', '/api/apps'); const a = d.apps.find(x => x.id === app.id); if (a) renderBotPage(body, a, d.perms); else { devSel = null; renderDeveloper(body); } };
  $('#dev-back', body).addEventListener('click', () => { devSel = null; renderDeveloper(body); });
  $('#bot-form', body).addEventListener('submit', async e => { e.preventDefault(); try { await api('PATCH', `/api/apps/${app.id}`, { name: e.target.name.value, description: e.target.description.value }); toast('Bot saved'); reload(); } catch (err) { toast(err.message, true); } });
  $('[name=public]', body).addEventListener('change', async e => { try { await api('PATCH', `/api/apps/${app.id}`, { public: e.target.checked }); toast(e.target.checked ? 'Your bot is public' : 'Your bot is private'); } catch (err) { toast(err.message, true); } });
  $$('.ab-perms input', body).forEach(i => i.addEventListener('change', async () => { try { await api('PATCH', `/api/apps/${app.id}`, { perms: $$('.ab-perms input:checked', body).map(x => x.value), allowAdmin: true }); } catch (err) { toast(err.message, true); } }));
  $('#bot-av', body).addEventListener('click', () => $('#bot-file', body).click());
  $('#bot-file', body).addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'image/gif' && window.openImageEditor) { const blob = await openImageEditor(file, { shape: 'circle', title: 'Adjust the bot avatar' }); if (!blob) return; file = new File([blob], 'a.webp', { type: 'image/webp' }); }
    try { const res = await fetch(`/api/apps/${app.id}/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file }); const r = await res.json(); if (!res.ok) throw new Error(r.error); toast('Avatar updated'); reload(); } catch (err) { toast(err.message, true); }
  });
  $('#bot-add', body).addEventListener('click', () => addBotToServer(app.id, null, reload));
  $('#bot-link', body).addEventListener('click', () => copyText(`zuno.bot/${app.id}`, 'Add link'));
  $('#code-copy', body).addEventListener('click', e => { copyText(sampleCode(), 'Starter code'); e.target.textContent = 'Copied!'; });
  $('#bot-token', body).addEventListener('click', () => confirmDialog('Reset token?', 'Your bot stops working until you give it the new token.', 'Reset Token', async () => { try { const { token } = await api('POST', `/api/apps/${app.id}/token`); showToken(token, app.name); } catch (e) { toast(e.message, true); } }));
  $('#bot-del', body).addEventListener('click', () => confirmDialog(`Delete ${app.name}?`, "It leaves every server and can't sign in anymore. This can't be undone.", 'Delete Bot', async () => { try { await api('DELETE', `/api/apps/${app.id}`); toast('Bot deleted'); devSel = null; renderDeveloper(body); } catch (e) { toast(e.message, true); } }));
}

// zuno.bot/<id> links in chat open the "add bot" dialog.
document.addEventListener('click', e => {
  const a = e.target.closest('[data-addbot]');
  if (!a) return;
  e.preventDefault();
  addBotToServer(a.dataset.addbot);
});
const _formatMessageB = formatMessage;
formatMessage = function (text) { return _formatMessageB(text).replace(/\bzuno\.bot\/([a-z0-9]{8,32})\b/g, '<a href="#" class="invite-link" data-addbot="$1">🤖 zuno.bot/$1</a>'); };

// ======================= "/" commands in the message box =======================
const cmdCache = {}; // serverId -> { at, list }
async function serverCommands(sid) {
  const c = cmdCache[sid];
  if (c && Date.now() - c.at < 60e3) return c.list;
  try { const { commands } = await api('GET', `/api/servers/${sid}/commands`); cmdCache[sid] = { at: Date.now(), list: commands }; return commands; } catch { return []; }
}
let cmdMenu = null;
const closeCmdMenu = () => { cmdMenu?.el.remove(); cmdMenu = null; };
document.addEventListener('input', async e => {
  const ta = e.target;
  if (ta.id !== 'composer-input' || state.view.type !== 'channel') return;
  const m = /^\/([a-z0-9_-]*)$/i.exec(ta.value);
  if (!m) return closeCmdMenu();
  const sv = currentServer();
  if (!sv || !chHas(currentChannel(), 'use_commands')) return closeCmdMenu();
  const list = (await serverCommands(sv.id)).filter(c => c.name.startsWith(m[1].toLowerCase())).slice(0, 8);
  if (ta.value !== '/' + m[1]) return;
  closeCmdMenu();
  if (!list.length) return;
  const el = document.createElement('div');
  el.className = 'cmd-menu';
  el.innerHTML = `<div class="cm-head">Commands</div>${list.map((c, i) => `<button class="cm-item${i ? '' : ' on'}" data-i="${i}">${avatar({ id: c.botId, displayName: c.botName, avatar: c.botAvatar }, 22)}<b>/${esc(c.name)}</b>${c.usage ? `<span class="cm-usage">${esc(c.usage)}</span>` : ''}<span class="cm-desc">${esc(c.description)}</span><span class="cm-bot">${esc(c.botName)}</span></button>`).join('')}`;
  $('#composer').prepend(el);
  cmdMenu = { el, list, i: 0, ta };
  $$('.cm-item', el).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pickCmd(Number(b.dataset.i)); }));
});
function pickCmd(i) {
  if (!cmdMenu) return;
  const c = cmdMenu.list[i], ta = cmdMenu.ta;
  ta.value = `/${c.name} `; ta.focus();
  ta.dispatchEvent(new Event('input'));
  closeCmdMenu();
}
document.addEventListener('keydown', e => {
  if (!cmdMenu || e.target !== cmdMenu.ta) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopImmediatePropagation();
    cmdMenu.i = (cmdMenu.i + (e.key === 'ArrowDown' ? 1 : -1) + cmdMenu.list.length) % cmdMenu.list.length;
    $$('.cm-item', cmdMenu.el).forEach((b, j) => b.classList.toggle('on', j === cmdMenu.i));
  } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); pickCmd(cmdMenu.i); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeCmdMenu(); }
}, true);
document.addEventListener('focusout', e => { if (cmdMenu && e.target === cmdMenu.ta) setTimeout(closeCmdMenu, 120); });
