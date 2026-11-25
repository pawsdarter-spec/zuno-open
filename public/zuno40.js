'use strict';
// Bot Developer badge: made a bot that's in at least one server.
BADGE_INFO.botdev = {
  label: 'Bot Developer', desc: 'Made a bot that people use on Zuno',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgBotdev" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b9cff"/><stop offset="1" stop-color="#5a4fd6"/></linearGradient></defs>
    <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="6.5" fill="url(#bgBotdev)"/>
    <path d="M12 4.2v2.2" stroke="#e8ebff" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="4" r="1.3" fill="#ffd166"/>
    <rect x="5.6" y="7.2" width="12.8" height="9.6" rx="3.2" fill="#e8ebff"/>
    <circle cx="9.4" cy="11.4" r="1.5" fill="#5a4fd6"/><circle cx="14.6" cy="11.4" r="1.5" fill="#5a4fd6"/>
    <path d="M9.6 14.4h4.8" stroke="#5a4fd6" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M7.4 19.4l1.6-1.8M16.6 19.4l-1.6-1.8" stroke="#e8ebff" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};
// Zuno 0.40: the Bot Builder (Settings › Developer). Make a bot without writing code: start from a
// template, then add "When … → do …" rules. Zuno runs them, so the bot works with no computer on.

{
  // Dialogs here sit on top of Settings (openLayer would close Settings first).
  const over = html => {
    const ov = document.createElement('div');
    ov.className = 'overlay bb-over';
    ov.innerHTML = html;
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    $('#layer').appendChild(ov);
    return ov;
  };
  addEventListener('keydown', e => { if (e.key === 'Escape') { const ov = $('#layer .bb-over:last-child'); if (ov) { e.stopImmediatePropagation(); ov.remove(); } } }, true);
  const ask = (title, text, okLabel) => (typeof confirmOver === 'function' ? confirmOver(title, text, okLabel) : Promise.resolve(confirm(title)));
  // The bot token window, on top of Settings too.
  showToken = function (token, name) {
    const ov = over(`<div class="dialog modal"><h3>🔑 ${esc(name)}'s token</h3>
      <p>This is your bot's password. <b>Copy it now</b>: Zuno only shows it once. Never share it or put it in public code. If it leaks, make a new one.</p>
      <div class="copy-row"><input readonly value="${esc(token)}"><button class="btn btn-primary btn-sm" data-c>Copy</button></div>
      <div class="actions"><button class="btn btn-primary" data-a="ok">I saved it</button></div></div>`);
    $('[data-c]', ov).addEventListener('click', e => { copyText(token, 'Token'); e.target.textContent = 'Copied!'; });
    $('[data-a=ok]', ov).addEventListener('click', () => ov.remove());
  };
  const TEMPLATES = [
    { key: 'code', icon: '💻', name: 'Code it myself', desc: 'Get a token and starter code. Full control.', rules: [] },
    { key: 'blank', icon: '🧩', name: 'Bot Builder (blank)', desc: 'No code. Add your own rules.', rules: [] },
    { key: 'welcome', icon: '👋', name: 'Welcomer', desc: 'Greets everyone who joins your server.', rules: [
      { on: 'join', name: 'Welcome', actions: [{ type: 'send', channel: '', text: 'Welcome to **{server}**, {mention}! 🎉 You are member #{members}.' }] },
    ] },
    { key: 'responder', icon: '💬', name: 'Auto-responder', desc: 'Answers when people say certain things.', rules: [
      { on: 'message', match: 'contains', text: 'hello bot', cooldown: 10, actions: [{ type: 'reply', text: 'Hi {user}! 👋' }, { type: 'react', emoji: '👋' }] },
      { on: 'message', match: 'exact', text: 'good night', cooldown: 30, actions: [{ type: 'reply', text: '{random:Sleep well, {user}! 🌙|Good night! 💤|Sweet dreams! ✨}' }] },
    ] },
    { key: 'fun', icon: '🎲', name: 'Fun commands', desc: '/roll, /coin, /8ball and /pick.', rules: [
      { on: 'command', command: 'roll', description: 'Roll a die', usage: '', actions: [{ type: 'reply', text: '🎲 {user} rolled **{dice:6}**' }] },
      { on: 'command', command: 'coin', description: 'Flip a coin', actions: [{ type: 'reply', text: '🪙 It landed on **{random:heads|tails}**!' }] },
      { on: 'command', command: '8ball', description: 'Ask the magic 8 ball', usage: '[question]', actions: [{ type: 'reply', text: '🎱 {random:Yes!|No.|Maybe…|Ask again later.|Definitely.|Not a chance.|It is certain.|Very doubtful.}' }] },
      { on: 'command', command: 'pick', description: 'Pick a number from 1 to 100', actions: [{ type: 'reply', text: '🔢 I pick **{number:1-100}**' }] },
    ] },
    { key: 'roles', icon: '🏷️', name: 'Role giver', desc: '/verify gives people a role.', rules: [
      { on: 'command', command: 'verify', description: 'Get the Verified role', actions: [{ type: 'role', role: 'Verified' }, { type: 'reply', text: '✅ You’re verified, {user}!' }] },
    ] },
  ];

  // ---------- making a bot: pick how ----------
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('#dev-new');
    if (!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const body = $('#settings-body') || btn.closest('#settings-body');
    let tpl = 'blank';
    const ov = over(`<form class="dialog modal bb-new"><h3>New Bot</h3>
      <label class="field">Name<input name="name" maxlength="32" required placeholder="Helpful Robot"></label>
      <label class="field">What does it do? <span class="hint">(optional)</span><textarea name="description" maxlength="400" placeholder="Rolls dice, welcomes people…"></textarea></label>
      <div class="field-label">Start with</div>
      <div class="bb-tpls">${TEMPLATES.map(t => `<button type="button" class="bb-tpl${t.key === tpl ? ' on' : ''}" data-tpl="${t.key}"><span class="bb-tpl-i">${uiIcon({ code: 'laptop', blank: 'puzzle', welcome: 'wave', responder: 'chat', fun: 'dice', roles: 'tag' }[t.key] || 'bot')}</span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>
      <p class="muted small">By making a bot you agree to follow the <a href="/terms" target="_blank">Terms of Service</a>. Bots that spam or harm people get removed.</p>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Create Bot</button></div></form>`);
    $$('[data-tpl]', ov).forEach(b => b.addEventListener('click', () => { tpl = b.dataset.tpl; $$('[data-tpl]', ov).forEach(x => x.classList.toggle('on', x === b)); }));
    $('[data-a=cancel]', ov).addEventListener('click', () => ov.remove());
    $('form', ov).addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, t = TEMPLATES.find(x => x.key === tpl);
      try {
        const r = await api('POST', '/api/apps', { name: f.name.value, description: f.description.value });
        if (t.rules.length) await api('PUT', `/api/apps/${r.app.id}/builder`, { rules: t.rules });
        ov.remove(); devSel = r.app.id;
        await renderDeveloper(body);
        if (tpl === 'code') showToken(r.token, r.app.name);
        else toast(t.rules.length ? `${r.app.name} is ready. Add it to a server to try it!` : 'Now add some rules to your bot.');
      } catch (err) { toast(err.message, true); }
    });
    $('[name=name]', ov).focus();
  }, true);

  // ---------- the builder on a bot's page ----------
  const ON_LABEL = { message: 'Someone sends a message', command: 'Someone uses a /command', join: 'Someone joins the server' };
  const MATCH_LABEL = { contains: 'contains', exact: 'is exactly', starts: 'starts with', any: 'is anything' };
  const ACT_LABEL = { reply: 'Reply', send: 'Send a message', react: 'React', role: 'Give a role', unrole: 'Take away a role' };
  const VARS = '{user} {mention} {server} {channel} {members} {args} {dice} {dice:20} {number:1-10} {random:a|b|c}';
  const whenText = r => r.on === 'command' ? `<code>/${esc(r.command)}${r.usage ? ' ' + esc(r.usage) : ''}</code>` : r.on === 'join' ? 'Someone joins' : r.match === 'any' ? 'Any message' : `Message ${MATCH_LABEL[r.match]} “${esc(r.text)}”`;
  const doText = a => a.type === 'reply' ? `Reply “${esc(a.text.slice(0, 60))}${a.text.length > 60 ? '…' : ''}”` : a.type === 'send' ? `Send in #${esc(a.channel || 'same channel')}` : a.type === 'react' ? `React ${esc(a.emoji)}` : `${a.type === 'role' ? 'Give' : 'Take'} @${esc(a.role)}`;

  function ruleEditor(rule, onSave) {
    const r = JSON.parse(JSON.stringify(rule || { on: 'message', match: 'contains', text: '', cooldown: 5, actions: [{ type: 'reply', text: '' }] }));
    const ov = over(`<form class="dialog modal bb-ed"><h3>${rule ? 'Edit rule' : 'New rule'}</h3><div class="bb-ed-body"></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save Rule</button></div></form>`);
    const box = $('.bb-ed-body', ov);
    const draw = () => {
      box.innerHTML = `<div class="bb-sec"><div class="bb-h">When</div>
        <select class="bb-in" data-k="on">${Object.entries(ON_LABEL).map(([k, v]) => `<option value="${k}"${r.on === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        ${r.on === 'message' ? `<div class="bb-row"><span>and it</span><select class="bb-in" data-k="match">${Object.entries(MATCH_LABEL).map(([k, v]) => `<option value="${k}"${r.match === k ? ' selected' : ''}>${v}</option>`).join('')}</select>${r.match !== 'any' ? `<input class="bb-in" data-k="text" maxlength="100" placeholder="hello" value="${esc(r.text || '')}">` : ''}</div>
          <div class="bb-row"><span>in</span><input class="bb-in" data-k="channel" maxlength="32" placeholder="any channel" value="${esc(r.channel || '')}"><span>wait</span><input class="bb-in bb-num" type="number" min="0" max="3600" data-k="cooldown" value="${r.cooldown ?? 5}"><span>sec between</span></div>` : ''}
        ${r.on === 'command' ? `<div class="bb-row"><span>/</span><input class="bb-in" data-k="command" maxlength="32" placeholder="roll" value="${esc(r.command || '')}"><input class="bb-in" data-k="usage" maxlength="60" placeholder="[extra words] (optional)" value="${esc(r.usage || '')}"></div>
          <input class="bb-in" data-k="description" maxlength="100" placeholder="What it does (shows in the / menu)" value="${esc(r.description || '')}">` : ''}
        ${r.on === 'join' ? `<div class="bb-row"><span>post in</span><input class="bb-in" data-k="channel" maxlength="32" placeholder="the welcome channel" value="${esc(r.channel || '')}"></div>` : ''}</div>
        <div class="bb-sec"><div class="bb-h">Do</div>${r.actions.map((a, i) => `<div class="bb-act" data-i="${i}">
          <div class="bb-row"><select class="bb-in" data-a="type">${Object.entries(ACT_LABEL).filter(([k]) => !(r.on === 'join' && (k === 'reply' || k === 'react'))).map(([k, v]) => `<option value="${k}"${a.type === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          ${a.type === 'send' ? `<span>in #</span><input class="bb-in" data-a="channel" maxlength="32" placeholder="${r.on === 'join' ? 'welcome channel' : 'same channel'}" value="${esc(a.channel || '')}">` : ''}
          ${a.type === 'react' ? `<input class="bb-in bb-emo" data-a="emoji" maxlength="16" placeholder="👍" value="${esc(a.emoji || '')}">` : ''}
          ${a.type === 'role' || a.type === 'unrole' ? `<span>@</span><input class="bb-in" data-a="role" maxlength="32" placeholder="Role name" value="${esc(a.role || '')}">` : ''}
          <button type="button" class="icon-btn bb-x" data-del="${i}" title="Remove">✕</button></div>
          ${a.type === 'reply' || a.type === 'send' ? `<textarea class="bb-in" data-a="text" maxlength="1500" rows="2" placeholder="Hi {user}!">${esc(a.text || '')}</textarea>` : ''}</div>`).join('')}
          ${r.actions.length < 5 ? '<button type="button" class="btn btn-grey btn-sm" data-add>+ Add action</button>' : ''}
          <p class="muted small bb-vars">Fill-ins: ${VARS.split(' ').map(v => `<code data-var="${esc(v)}">${esc(v)}</code>`).join(' ')}</p></div>`;
      $$('[data-k]', box).forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        r[el.dataset.k] = el.type === 'number' ? Number(el.value) : el.value;
        if (el.tagName === 'SELECT') { if (r.on === 'join') r.actions.forEach(a => { if (a.type === 'reply' || a.type === 'react') { a.type = 'send'; a.text ||= 'Welcome {mention}!'; } }); draw(); }
      }));
      $$('.bb-act', box).forEach(row => {
        const a = r.actions[+row.dataset.i];
        $$('[data-a]', row).forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { a[el.dataset.a] = el.value; if (el.tagName === 'SELECT') draw(); }));
      });
      $$('[data-del]', box).forEach(b => b.addEventListener('click', () => { r.actions.splice(+b.dataset.del, 1); draw(); }));
      $('[data-add]', box)?.addEventListener('click', () => { r.actions.push({ type: r.on === 'join' ? 'send' : 'reply', text: '' }); draw(); });
      // Clicking a fill-in puts it in the last text box you used.
      let lastText = null;
      $$('textarea', box).forEach(t => t.addEventListener('focus', () => { lastText = t; }));
      $$('[data-var]', box).forEach(c => c.addEventListener('mousedown', e => {
        e.preventDefault();
        const t = lastText || $('textarea', box);
        if (!t) return;
        const at = t.selectionStart ?? t.value.length;
        t.value = t.value.slice(0, at) + c.dataset.var + t.value.slice(t.selectionEnd ?? at);
        t.dispatchEvent(new Event('input')); t.focus();
      }));
    };
    draw();
    $('[data-a=cancel]', ov).addEventListener('click', () => ov.remove());
    $('form', ov).addEventListener('submit', async e => { e.preventDefault(); if (await onSave(r)) ov.remove(); });
  }

  async function drawBuilder(sec, app) {
    let d;
    try { d = await api('GET', `/api/apps/${app.id}/builder`); } catch (e) { sec.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    let rules = d.rules;
    const saveRules = async next => {
      try { const r = await api('PUT', `/api/apps/${app.id}/builder`, { rules: next }); rules = r.rules; draw(); return true; }
      catch (e) { toast(e.message, true); return false; }
    };
    const draw = () => {
      sec.innerHTML = `<h4 class="setting-head">🧩 Bot Builder <span class="muted small">no code needed</span></h4>
        <p class="muted small" style="margin:0 0 10px">Rules run on Zuno, so your bot works even when your computer is off. They can live alongside your own code.</p>
        <div class="bb-status"><input class="bb-in" id="bb-status" maxlength="80" placeholder="Status (like “Type /roll”)" value="${esc(d.status)}"><button class="btn btn-grey btn-sm" id="bb-status-save">Set Status</button></div>
        <div class="bb-rules">${rules.map((r, i) => `<div class="bb-rule${r.enabled === false ? ' off' : ''}">
          <input type="checkbox" class="switch bb-sw" title="On / off" data-on="${i}"${r.enabled !== false ? ' checked' : ''}>
          <div class="bb-rule-t"><div>${whenText(r)}</div><small class="muted">${r.actions.map(doText).join(' · ')}</small></div>
          <button class="btn btn-grey btn-sm" data-edit="${i}">Edit</button><button class="icon-btn bb-x" data-rm="${i}" title="Delete rule">✕</button></div>`).join('') || `<div class="bb-empty muted small">No rules yet. Add one, like “when someone says hello, reply Hi!”.</div>`}</div>
        ${rules.length < 25 ? '<button class="btn btn-primary btn-sm" id="bb-add">+ Add Rule</button>' : ''}
        <div class="bb-test"><div class="bb-h">Try it</div><div class="bb-row"><input class="bb-in" id="bb-try" maxlength="500" placeholder="Type a message or /command"><button class="btn btn-grey btn-sm" id="bb-try-go">Try</button><button class="btn btn-grey btn-sm" id="bb-try-join">Try a join</button></div><div class="bb-out"></div></div>
        <details class="bb-log"${d.log.length ? '' : ' hidden'}><summary>Recent activity (${d.log.length})</summary><div>${d.log.map(l => `<div class="bb-log-r ${l.ok ? 'ok' : 'bad'}"><span>${l.ok ? '✓' : '⚠'}</span><b>${esc(l.rule)}</b><span class="muted">${esc(l.server)} · ${new Date(l.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>${l.note ? `<div class="bb-log-n">${esc(l.note)}</div>` : ''}</div>`).join('')}<button class="btn btn-link btn-sm" id="bb-log-clear">Clear</button></div></details>`;
      $('#bb-add', sec)?.addEventListener('click', () => ruleEditor(null, r => saveRules([...rules, r])));
      $$('[data-edit]', sec).forEach(b => b.addEventListener('click', () => ruleEditor(rules[+b.dataset.edit], r => saveRules(rules.map((x, i) => (i === +b.dataset.edit ? r : x))))));
      $$('[data-rm]', sec).forEach(b => b.addEventListener('click', async () => { if (await ask('Delete this rule?', 'The bot stops doing it right away.', 'Delete')) saveRules(rules.filter((_, i) => i !== +b.dataset.rm)); }));
      $$('[data-on]', sec).forEach(c => c.addEventListener('change', () => saveRules(rules.map((x, i) => (i === +c.dataset.on ? { ...x, enabled: c.checked } : x)))));
      $('#bb-status-save', sec).addEventListener('click', async () => { try { const r = await api('PUT', `/api/apps/${app.id}/status`, { status: $('#bb-status', sec).value }); d.status = r.status; toast(r.status ? 'Status set' : 'Status cleared'); } catch (e) { toast(e.message, true); } });
      const tryIt = async join => {
        const out = $('.bb-out', sec);
        try {
          const r = await api('POST', `/api/apps/${app.id}/builder/test`, { text: $('#bb-try', sec).value, join });
          out.innerHTML = !r.matched ? '<div class="muted small">No rule matched that.</div>' : r.actions.map(a => `<div class="bb-o">${a.kind === 'reply' ? '↩️ Replies' : a.kind === 'send' ? `📨 In #${esc(a.channel)}` : a.kind === 'react' ? `Reacts ${esc(a.emoji)}` : `${a.kind === 'role' ? 'Gives' : 'Takes away'} @${esc(a.role)}`}${a.text ? `<div class="bb-o-t">${esc(a.text)}</div>` : ''}</div>`).join('');
        } catch (e) { out.innerHTML = `<div class="muted small">${esc(e.message)}</div>`; }
      };
      $('#bb-try-go', sec).addEventListener('click', () => tryIt(false));
      $('#bb-try', sec).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryIt(false); } });
      $('#bb-try-join', sec).addEventListener('click', () => tryIt(true));
      $('#bb-log-clear', sec)?.addEventListener('click', async () => { await api('DELETE', `/api/apps/${app.id}/builder/log`).catch(() => {}); d.log = []; draw(); });
    };
    draw();
  }

  const _renderBotPage40 = renderBotPage;
  renderBotPage = async function (body, app, perms) {
    const r = await _renderBotPage40(body, app, perms);
    if (!$('.bb-section', body)) {
      const sec = document.createElement('div');
      sec.className = 'setting-group bb-section';
      $('#bot-form', body)?.after(sec);
      drawBuilder(sec, app);
    }
    // Python starter code too.
    const code = $('.code-sample', body);
    if (code && !$('.bb-lang', body)) {
      const tabs = document.createElement('div');
      tabs.className = 'bb-lang';
      tabs.innerHTML = '<button type="button" class="on" data-lang="js">JavaScript</button><button type="button" data-lang="py">Python</button>';
      code.closest('.code-wrap').before(tabs);
      let lang = 'js';
      $$('button', tabs).forEach(b => b.addEventListener('click', () => {
        lang = b.dataset.lang;
        $$('button', tabs).forEach(x => x.classList.toggle('on', x === b));
        code.textContent = lang === 'py' ? pythonCode() : sampleCode();
      }));
      $('#code-copy', body)?.addEventListener('click', e => { if (lang === 'py') { e.stopImmediatePropagation(); copyText(pythonCode(), 'Starter code'); e.target.textContent = 'Copied!'; } }, true);
    }
    return r;
  };

  function pythonCode() {
    return `# Zuno bot starter (Python 3.8+, needs: pip install requests). Run: python bot.py
import json, os, random, requests

TOKEN = os.environ.get("ZUNO_BOT_TOKEN", "paste your token here")
ZUNO = "${location.origin}"
H = {"Authorization": "Bot " + TOKEN, "Content-Type": "application/json"}

def api(method, path, body=None):
    return requests.request(method, ZUNO + path, headers=H, json=body).json()

# Tell Zuno which /commands your bot has. They show up in the message box.
api("PUT", "/api/bots/@me/commands", {"commands": [
    {"name": "ping", "description": "Check that I am awake"},
    {"name": "roll", "description": "Roll a die", "usage": "[sides]"},
]})

def on_command(c):
    def reply(text):
        api("POST", f"/api/channels/{c['channelId']}/messages", {"content": text, "replyTo": c["messageId"]})
    if c["name"] == "ping":
        reply("Pong! 🏓")
    if c["name"] == "roll":
        sides = int(c["args"]) if c["args"].isdigit() else 6
        reply(f"🎲 {c['user']['displayName']} rolled **{random.randint(1, sides)}**")

# Listen for live events (messages, commands, joins).
print("Bot is online!")
with requests.get(ZUNO + "/api/events", headers=H, stream=True) as res:
    event = None
    for line in res.iter_lines(decode_unicode=True):
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            data = json.loads(line[6:])
            if event == "command":
                on_command(data)
            elif event == "message" and data["message"]["content"] == "hello bot":
                api("POST", f"/api/channels/{data['channelId']}/messages", {"content": "Hi there! 👋"})
`;
  }
}
