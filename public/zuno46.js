// Zuno 0.45.2: name styles save with "Save Changes", clearer Zuno Bot setup (with every new option),
// Warden setup, and the bot review queue in Settings › Developer.

// ======================= profile: the Name Style is part of "Save Changes" =======================
// Picking a font or colour used to need its own "Save Name Style" button. If you changed your picture
// too and pressed Save Changes, the name style was thrown away. Now it joins the same draft.
{
  const _nse46 = nameStyleEditor;
  nameStyleEditor = function (body) {
    const r = _nse46(body);
    const g = body && $('#ns-editor', body);
    if (!g || g.dataset.d46) return r;
    g.dataset.d46 = '1';
    let solid = !!state.me.nameStyle?.solid;
    const read = () => {
      const font = $('[data-nsf].on', g)?.dataset.nsf || 'default', effect = $('[data-nsx].on', g)?.dataset.nsx || 'none';
      const colors = [$('#ns-c1', g).value, $('#ns-c2', g).value];
      return font === 'default' && effect === 'none' && !solid ? null : { font, effect, colors, ...(solid ? { solid: true } : {}) };
    };
    const sync = () => { if (!settingsDraft) return; settingsDraft.nameStyle = read(); renderSaveBar(); };
    g.addEventListener('click', e => { if (e.target.closest('[data-nsf], [data-nsx]')) setTimeout(sync); });
    $('#ns-c1', g).addEventListener('input', () => { solid = true; sync(); });
    $('#ns-c2', g).addEventListener('input', sync);
    return r;
  };
  // Things saved straight away (a decoration from the picker, the name style button…) while other
  // changes wait in the draft must not be undone when Save Changes sends the older values.
  const BASE46 = new WeakMap();
  const _ss46 = showSettingsSection;
  showSettingsSection = function (...a) {
    const r = _ss46(...a);
    if (settingsDraft && !BASE46.has(settingsDraft)) BASE46.set(settingsDraft, JSON.parse(JSON.stringify(settingsDraft)));
    return r;
  };
  const rebase = () => {
    const d = settingsDraft, b = d && BASE46.get(d);
    if (!b) return;
    for (const k of Object.keys(b)) {
      const now = state.me[k] ?? null;
      if (!draftDiff(d[k], b[k]) && draftDiff(d[k], now)) { d[k] = now; b[k] = now; }
    }
    if ('nameStyle' in d && !draftDiff(d.nameStyle, state.me.nameStyle ?? null)) delete d.nameStyle;
  };
  const _dirty46 = isDraftDirty;
  isDraftDirty = function () { rebase(); return _dirty46(); };
  document.addEventListener('click', e => { if (e.target.closest?.('#draft-save')) rebase(); }, true);
}

// ======================= Zuno Bots: a summary of how each bot is set up =======================
function zbSummary46(b, sv) {
  const c = b.config || {}, chName = id => { const x = (sv.channels || []).find(y => y.id === id); return x ? '#' + x.name : null; };
  const role = id => (sv.roles || []).find(r => r.id === id)?.name;
  let bits = [];
  if (b.key === 'guardian') {
    const on = [c.words?.length, c.invites, c.links, c.spam, c.caps, c.mentions, c.emojis, c.lines, c.zalgo].filter(Boolean).length;
    bits = [`Watching for ${on} thing${on === 1 ? '' : 's'}`, c.timeoutMinutes ? `${c.timeoutMinutes} min timeouts` : null, chName(c.logChannelId) ? `logs in ${chName(c.logChannelId)}` : null];
  } else if (b.key === 'greeter') bits = [`Welcomes in ${chName(c.channelId) || 'the welcome channel'}`, role(c.roleId) ? `gives ${role(c.roleId)}` : null, c.goodbye ? 'says goodbye' : null];
  else if (b.key === 'levels') bits = [c.announce ? `Level ups in ${chName(c.channelId) || 'the same channel'}` : 'Level ups are quiet', c.rewards?.length ? `${c.rewards.length} role reward${c.rewards.length === 1 ? '' : 's'}` : null, c.rate && c.rate !== 1 ? `${c.rate}× XP` : null];
  else if (b.key === 'starboard') bits = chName(c.channelId) ? [`${c.threshold} ${c.emoji} sends to ${chName(c.channelId)}`] : [];
  else if (b.key === 'warden') bits = [chName(c.logChannelId) ? `Mod log in ${chName(c.logChannelId)}` : 'No mod log yet', c.timeoutAt ? `timeout at ${c.timeoutAt} warnings` : null, c.raidJoins ? 'raid alerts on' : null];
  else return '';
  bits = bits.filter(Boolean);
  if (!b.saved || !bits.length) return `<div class="zb-sum46 todo">${uiIcon('warning')}<span>Not set up yet. Press Set Up to choose how it works.</span></div>`;
  return `<div class="zb-sum46">${uiIcon('check')}<span>${bits.map(esc).join(' · ')}</span></div>`;
}

openZunoBotSetup = function (sv, b, after) {
  const c = b.config;
  const text = sv.channels.filter(x => x.type === 'text');
  const chSel = (name, val, none = 'Same channel as the message') => `<select name="${name}" class="sc-select"><option value="">${esc(none)}</option>${text.map(x => `<option value="${esc(x.id)}"${x.id === val ? ' selected' : ''}>#${esc(x.name)}</option>`).join('')}</select>`;
  const roles = sv.roles.filter(r => !r.everyone && !r.managed && (typeof canEditRoleMe !== 'function' || canEditRoleMe(sv, r)));
  const roleSel = (name, val) => `<select name="${name}" class="sc-select"><option value="">None</option>${roles.map(r => `<option value="${esc(r.id)}"${r.id === val ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
  const sel = (name, opts, val) => `<select name="${name}" class="sc-select" data-num46="${typeof opts[0][0] === 'number' ? 1 : ''}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(c[name] ?? val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tog = (name, title, desc) => `<label class="setting-row"><div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div><input type="checkbox" class="switch" name="${name}"${c[name] ? ' checked' : ''}></label>`;
  const chips = (name, items, chosen = []) => `<div class="zb-chips46" data-multi46="${name}">${items.map(([id, label]) => `<label class="zb-chip46"><input type="checkbox" value="${esc(id)}"${chosen.includes(id) ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('') || '<span class="muted small">Nothing to pick yet.</span>'}</div>`;
  const head = t => `<div class="zb-sec46">${t}</div>`;
  const textChips = (name) => chips(name, text.map(x => [x.id, '#' + x.name]), c[name] || []);
  let fields = '';
  if (b.key === 'guardian') fields = `
    ${head('Filters')}
    <label class="field">Blocked words <span class="hint">(comma-separated; whole words, or phrases with spaces)</span><textarea name="words" rows="2" placeholder="word1, word2, some phrase">${esc(c.words.join(', '))}</textarea></label>
    ${tog('invites', 'Block invite links', 'Stops links to other servers.')}${tog('links', 'Block links', 'Only people who can manage messages can post links.')}
    <label class="field">Links that are always fine <span class="hint">(when links are blocked; comma-separated sites)</span><input name="allowLinks" placeholder="youtube.com, heyzuno.uk" value="${esc((c.allowLinks || []).join(', '))}"></label>
    ${tog('spam', 'Block spam', 'Too many messages in a few seconds, or the same message 3 times.')}${tog('caps', 'Block shouting', 'Messages that are mostly CAPITAL LETTERS.')}
    ${tog('zalgo', 'Block glitchy text', 'Letters stacked with lots of accent marks.')}
    <div class="zb-row46"><label class="field">Most mentions <span class="hint">(0 = no limit)</span><input name="mentions" type="number" min="0" max="50" value="${c.mentions}"></label>
    <label class="field">Most emoji <span class="hint">(0 = no limit)</span><input name="emojis" type="number" min="0" max="100" value="${c.emojis || 0}"></label>
    <label class="field">Most lines <span class="hint">(0 = no limit)</span><input name="lines" type="number" min="0" max="200" value="${c.lines || 0}"></label></div>
    ${head('What happens')}
    <label class="field">When someone breaks a rule${sel('timeoutMinutes', [[0, 'Just block the message'], [1, 'Block and time out for 1 minute'], [5, 'Block and time out for 5 minutes'], [10, 'Block and time out for 10 minutes'], [60, 'Block and time out for 1 hour'], [1440, 'Block and time out for 1 day']], 0)}</label>
    <label class="field">Log blocked messages in${chSel('logChannelId', c.logChannelId, "Don't log")}</label>
    ${head('Who Guardian ignores')}
    <div class="field">Roles${chips('exemptRoles', sv.roles.filter(r => !r.everyone && !r.managed).map(r => [r.id, r.name]), c.exemptRoles || [])}</div>
    <div class="field">Channels${textChips('exemptChannels')}</div>
    <p class="muted small">The owner and people who can manage messages are never blocked.</p>`;
  if (b.key === 'greeter') fields = `
    ${head('Welcome')}
    <label class="field">Welcome channel${chSel('channelId', c.channelId, "The server's welcome channel")}</label>
    <label class="field">Message <span class="hint">({user} pings them, {name} is their name, {server}, {count} and {rules} work too)</span><textarea name="message" rows="3" maxlength="500">${esc(c.message)}</textarea></label>
    <div class="zb-row46"><label class="field">Give new members a role${roleSel('roleId', c.roleId)}</label><label class="field">And another role${roleSel('extraRoleId', c.extraRoleId)}</label></div>
    ${tog('milestones', 'Celebrate milestones', 'Post a message at 10, 25, 50, 75 and every 100 members.')}
    ${head('Goodbye')}
    ${tog('goodbye', 'Say goodbye', 'Post a message when someone leaves.')}
    <label class="field">Goodbye channel${chSel('goodbyeChannelId', c.goodbyeChannelId, 'Same as the welcome channel')}</label>
    <label class="field">Goodbye message<textarea name="goodbyeMessage" rows="2" maxlength="500">${esc(c.goodbyeMessage || '')}</textarea></label>
    <p class="muted small">Tip: you can turn off Zuno's own "just joined" message in Overview › Welcome messages.</p>`;
  if (b.key === 'levels') fields = `
    ${tog('announce', 'Announce level ups', 'Post a message when someone reaches a new level.')}
    <label class="field">Announce in${chSel('channelId', c.channelId)}</label>
    <label class="field">Level-up message <span class="hint">({user}, {name} and {level} work)</span><input name="message" maxlength="300" value="${esc(c.message || '')}"></label>
    <label class="field">XP speed${sel('rate', [[0.5, 'Slow (0.5×)'], [1, 'Normal'], [1.5, 'Fast (1.5×)'], [2, 'Double (2×)'], [3, 'Triple (3×)']], 1)}</label>
    <div class="field">Channels that give no XP${textChips('noXpChannels')}</div>
    <div class="field">Role rewards <span class="hint">(give a role when someone reaches a level)</span>
      <div id="lv-rewards">${[...c.rewards, { level: '', roleId: '' }].map(r => `<div class="copy-row lv-row"><input type="number" min="1" max="200" placeholder="Level" value="${esc(r.level)}" data-lv>${roleSel('lvrole', r.roleId)}</div>`).join('')}</div>
      <button type="button" class="btn btn-link btn-sm" id="lv-more">＋ Add another</button></div>`;
  if (b.key === 'starboard') fields = `
    <label class="field">Starboard channel${chSel('channelId', c.channelId, 'Pick a channel')}</label>
    <div class="zb-row46"><label class="field">Stars needed<input name="threshold" type="number" min="1" max="50" value="${c.threshold}"></label>
    <label class="field">Emoji<div class="copy-row"><input name="emoji" maxlength="16" value="${esc(c.emoji)}"><button type="button" class="btn btn-grey btn-sm" id="sb-emoji">Pick</button></div></label></div>
    ${tog('selfStar', 'Count your own star', 'Off: starring your own message doesn\'t count.')}`;
  if (b.key === 'warden') fields = `
    ${head('Mod log')}
    <label class="field">Post moderation actions and reports in${chSel('logChannelId', c.logChannelId, "Don't log")}</label>
    ${tog('reports', 'Let members use /report', 'Reports go quietly to the mod log channel.')}
    ${tog('logJoins', 'Log joins and leaves', 'With how old each account is.')}
    ${tog('logDeletes', 'Log deleted messages', 'Shows what a message said after it was deleted.')}
    ${head('Warnings add up')}
    <div class="zb-row46"><label class="field">Time out at<input name="timeoutAt" type="number" min="0" max="20" value="${c.timeoutAt}"><span class="hint">warnings (0 = off)</span></label>
    <label class="field">for${sel('timeoutMinutes', [[5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [10080, '1 week']], 60)}</label></div>
    <div class="zb-row46"><label class="field">Kick at<input name="kickAt" type="number" min="0" max="20" value="${c.kickAt}"><span class="hint">warnings (0 = off)</span></label>
    <label class="field">Ban at<input name="banAt" type="number" min="0" max="20" value="${c.banAt}"><span class="hint">warnings (0 = off)</span></label></div>
    <label class="field">Warnings expire after${sel('warnExpireDays', [[0, 'Never'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [90, '90 days']], 30)}</label>
    ${head('Raids and new accounts')}
    <label class="field">Raid alert when${sel('raidJoins', [[0, 'Off'], [5, '5 people join within 15 seconds'], [10, '10 people join within 15 seconds'], [20, '20 people join within 15 seconds']], 0)}</label>
    ${tog('raidPause', 'Pause invites during a raid', 'Nobody new can join until you turn invites back on.')}
    <div class="zb-row46"><label class="field">Accounts younger than${sel('newAccountDays', [[0, 'Off'], [1, '1 day'], [3, '3 days'], [7, '7 days'], [30, '30 days']], 0)}</label>
    <label class="field">get${sel('newAccountAction', [['none', 'Nothing'], ['timeout', 'A 1 hour timeout'], ['kick', 'Kicked']], 'none')}</label></div>
    <p class="muted small">Warden can only act on people below its own role. Move the Warden role up in Roles if a command says it can't.</p>`;
  // (0.45.2) Opens over Server Settings instead of closing it, so you land back on the bot cards
  // and can see what you picked.
  const ov = document.createElement('div');
  ov.className = 'overlay zb-over46';
  ov.innerHTML = `<form class="dialog modal zb-setup" role="dialog" aria-modal="true"><div class="ab-head">${avatar({ id: b.id, displayName: b.name, avatar: b.avatar }, 48)}<div><h3>Set up ${esc(b.name)}</h3><div class="muted small">${esc(b.desc)}</div></div></div>${fields}
    <div class="zb-cmds46"><span class="muted small">Commands:</span> ${b.commands.map(x => `<code title="${esc(x.description)}">/${esc(x.name)}</code>`).join(' ')}</div>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
  ($('#layer') || document.body).appendChild(ov);
  const keys = e => { if (!ov.isConnected) return removeEventListener('keydown', keys, true); if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { removeEventListener('keydown', keys, true); ov.remove(); };
  addEventListener('keydown', keys, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const f = $('form', ov);
  $('[data-a=cancel]', ov).addEventListener('click', close);
  $('#lv-more', ov)?.addEventListener('click', () => { const row = $('.lv-row', ov).cloneNode(true); $('[data-lv]', row).value = ''; $('select', row).value = ''; $('#lv-rewards', ov).appendChild(row); });
  $('#sb-emoji', ov)?.addEventListener('click', e => openEmojiPicker(e.currentTarget, x => (f.emoji.value = x)));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const config = {};
    for (const el of f.elements) {
      if (!el.name || el.name === 'lvrole' || el.closest('[data-multi46]')) continue;
      config[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' || (el.tagName === 'SELECT' && el.dataset.num46) ? Number(el.value) : el.value;
    }
    for (const g of $$('[data-multi46]', f)) config[g.dataset.multi46] = $$('input:checked', g).map(i => i.value);
    if (b.key === 'levels') config.rewards = $$('.lv-row', ov).map(r => ({ level: Number($('[data-lv]', r).value), roleId: $('select', r).value })).filter(r => r.level && r.roleId);
    const btn = $('.btn-primary', f); btn.disabled = true;
    try { await api('PUT', `/api/servers/${sv.id}/zunobots/${b.key}`, { config }); close(); toast(`${b.name} is set up. Your choices are saved.`); after?.(); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  });
};

// ======================= Settings › Developer: getting a bot into the Bot Marketplace =======================
// Public bots now go through a quick review by Zuno staff before they're listed.
async function botReview46(body, app) {
  if (!body || !app || $('.br46', body)) return;
  let st;
  try { st = await api('GET', `/api/apps/${app.id}/review`); } catch { return; }
  const row = $('[name=public]', body)?.closest('.setting-group');
  if (!row) return;
  const box = document.createElement('div');
  box.className = 'setting-group br46';
  const label = { none: 'Not submitted', pending: 'Waiting for review', approved: 'Listed in the Bot Marketplace', declined: 'Changes needed' }[st.state] || st.state;
  box.innerHTML = `<h4 class="setting-head">Bot Marketplace</h4>
    <div class="br46-state ${esc(st.state)}">${uiIcon(st.state === 'approved' ? 'check' : st.state === 'declined' ? 'warning' : 'clock')}<b>${esc(label)}</b></div>
    ${st.state === 'declined' && st.note ? `<p class="br46-note">${esc(st.note)}</p>` : ''}
    <p class="setting-desc">Public bots can be added by anyone with the bot's link. To be listed in the Bot Marketplace, Zuno staff check it first: it needs a description, at least one command, and to follow the Zuno rules. ${st.state === 'approved' ? 'Big changes to your bot may be checked again.' : ''}</p>
    ${st.state === 'none' || st.state === 'declined' ? `<label class="field">Anything the reviewers should know? <span class="hint">(optional)</span><textarea class="br46-msg" rows="2" maxlength="500" placeholder="What does it do? Which commands should we try?"></textarea></label><button class="btn btn-primary btn-sm br46-go">${st.state === 'declined' ? 'Send it again' : 'Submit for review'}</button>` : ''}
    ${st.state === 'pending' ? '<button class="btn btn-grey btn-sm br46-cancel">Cancel request</button>' : ''}
    <p class="muted small" style="margin-top:10px">Building a bot? Read the <a href="/developers" target="_blank" rel="noopener">Zuno bot API reference</a>.</p>`;
  row.after(box);
  $('.br46-go', box)?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('POST', `/api/apps/${app.id}/review`, { message: $('.br46-msg', box)?.value || '' }); toast('Sent for review! You\'ll get a DM from Zuno when it\'s checked.'); box.remove(); botReview46(body, app); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
  $('.br46-cancel', box)?.addEventListener('click', async () => { try { await api('DELETE', `/api/apps/${app.id}/review`); box.remove(); botReview46(body, app); } catch (err) { toast(err.message, true); } });
}
{
  const _rbp46 = renderBotPage;
  renderBotPage = async function (body, app, perms) {
    const r = await _rbp46(body, app, perms);
    const desc = $('[name=public]', body)?.closest('.setting-row')?.querySelector('.setting-desc');
    if (desc) desc.textContent = 'Anyone with the add link can put it in servers they manage. To be listed in the Bot Marketplace, submit it for review below. Off: only you can add it.';
    botReview46(body, app);
    return r;
  };
}

// ======================= Moderation › Bot Reviews (Zuno staff) =======================
{
  const _rm46 = renderModeration;
  renderModeration = async function (body) {
    if (modTab !== 'botrev46') { const r = await _rm46(body); addBotRevTab46(body); return r; }
    body.innerHTML = `<h2>Moderation</h2><div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}">${l}</button>`).join('')}</div><div id="mod-body" style="margin-top:16px"></div>`;
    $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
    for (const fn of [typeof addCreationsTab === 'function' && addCreationsTab, typeof addCreatorsTab37 === 'function' && addCreatorsTab37, typeof addStaffActTab === 'function' && addStaffActTab]) if (fn) try { fn(body); } catch {}
    $$('.mod-tabs button', body).forEach(b => b.classList.remove('on'));
    addBotRevTab46(body);
    drawBotReviews46($('#mod-body', body));
  };
}
function addBotRevTab46(body) {
  const tabs = $('.mod-tabs', body);
  if (!tabs || $('[data-mt46]', tabs)) return;
  tabs.insertAdjacentHTML('beforeend', `<button data-mt46 class="${modTab === 'botrev46' ? 'on' : ''}">Bot Reviews<span class="cm-count" hidden></span></button>`);
  $('[data-mt46]', tabs).addEventListener('click', () => { modTab = 'botrev46'; renderModeration(body); });
  api('GET', '/api/staff/bot-reviews/count').then(d => { const n = $('[data-mt46] .cm-count', tabs); if (n && d.pending) { n.hidden = false; n.textContent = d.pending; } }).catch(() => {});
}
async function drawBotReviews46(box) {
  if (!box) return;
  let d;
  try { d = await api('GET', '/api/staff/bot-reviews'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  for (const b of d.pending) if (b.owner) state.users[b.owner.id] = { ...state.users[b.owner.id], ...b.owner };
  box.innerHTML = `<p class="muted small" style="margin:0 0 12px">Approve bots that work, do what their description says and follow the rules. Try a command or two in a test server first (Add to a test server, and check the bot is online). Turning one down needs a reason: the owner sees it in their Zuno DM.</p>
    ${d.pending.length ? d.pending.map(b => `<div class="br46-card" data-br="${esc(b.id)}">
      <div class="br46-top">${avatar({ id: b.id, displayName: b.name, avatar: b.avatar }, 48)}<div class="br46-who"><b>${esc(b.name)}</b> <span class="muted small">@${esc(b.username)} · ${esc(b.category)} · ${b.online ? '<span class="int-on">● online</span>' : 'offline'} · in ${b.servers} server${b.servers === 1 ? '' : 's'}</span>
        <div class="muted small">by <button class="rv-maker" data-maker="${esc(b.owner?.id || '')}">${b.owner ? avatar(b.owner, 18) : ''}<span>${esc(b.owner?.displayName || 'Deleted user')}</span></button> · sent ${esc(fmtTime(b.at))}</div></div></div>
      ${b.tagline ? `<div class="br46-tag">${esc(b.tagline)}</div>` : ''}<p class="br46-desc">${esc(b.description)}</p>
      ${b.message ? `<div class="br46-msg"><span class="muted small">Note from the owner</span>${esc(b.message)}</div>` : ''}
      <div class="br46-cmds">${b.commands.map(c => `<code title="${esc(c.description)}">/${esc(c.name)}${c.usage ? ' ' + esc(c.usage) : ''}</code>`).join(' ')}</div>
      <div class="muted small">Asks for: ${b.perms.map(esc).join(', ') || 'nothing special'}</div>
      <input class="rv-reason" maxlength="300" placeholder="What should they change? (needed to turn it down)">
      <div class="rv-acts"><button class="btn btn-green btn-sm" data-ok>Approve</button><button class="btn btn-red btn-sm" data-no>Turn down</button><button class="btn btn-grey btn-sm" data-link>Add to a test server</button></div></div>`).join('')
      : '<div class="empty-state"><div class="title">All caught up</div><div>No bots waiting for review.</div></div>'}
    ${d.recent.length ? `<h4 class="setting-head" style="margin-top:22px">Decided this week</h4>${d.recent.map(b => `<div class="br46-row">${avatar({ id: b.id, displayName: b.name, avatar: b.avatar }, 24)}<b>${esc(b.name)}</b><span class="cm-st ${b.state === 'approved' ? 'approved' : 'rejected'}">${b.state === 'approved' ? 'Approved' : 'Turned down'}</span><span class="muted small">by ${esc(b.decidedBy)} · ${esc(fmtTime(b.decidedAt))}${b.note ? ' · ' + esc(b.note) : ''}</span>${b.listed ? `<button class="btn btn-link btn-sm" data-unlist="${esc(b.id)}">Take down</button>` : ''}</div>`).join('')}` : ''}`;
  $$('[data-maker]', box).forEach(b => b.dataset.maker && b.addEventListener('click', () => openProfile(b.dataset.maker)));
  const decide = async (id, approve, note, unlist = false) => {
    try { await api('POST', `/api/staff/bot-reviews/${id}`, { approve, note, unlist }); toast(approve ? 'Approved. It\'s in the Bot Marketplace now.' : unlist ? 'Taken down' : 'Turned down'); drawBotReviews46(box); } catch (e) { toast(e.message, true); }
  };
  $$('[data-br]', box).forEach(card => {
    const id = card.dataset.br;
    $('[data-ok]', card).addEventListener('click', () => decide(id, true));
    $('[data-no]', card).addEventListener('click', () => { const why = $('.rv-reason', card).value.trim(); if (!why) { $('.rv-reason', card).focus(); return toast('Say what to change first', true); } decide(id, false, why); });
    $('[data-link]', card).addEventListener('click', () => addBotToServer(id));
  });
  $$('[data-unlist]', box).forEach(b => b.addEventListener('click', async () => {
    const why = await askText('Take it out of the marketplace?', { desc: 'The owner sees your reason in their Zuno DM.', placeholder: 'Why?', ok: 'Take down', danger: true });
    if (why) decide(b.dataset.unlist, false, why, true);
  }));
}
onLive26?.('bot-review', () => { if (modTab === 'botrev46' && $('.mod-tabs [data-mt46].on')) drawBotReviews46($('#mod-body')); });

// Inbox: Warden's raid alerts.
if (typeof NOTIF_TEXT === 'object') NOTIF_TEXT.raid46 = n => `🚨 Raid alert in <b>${esc(n.title || 'a server')}</b>: ${esc(n.text || 'lots of people joined at once.')}`;

// "Confirm it's you" also asks for the two-factor code when the account has it on.
askPassword43 = function () {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay'; ov.style.zIndex = 200;
    ov.innerHTML = `<form class="dialog modal" style="max-width:380px"><h3>${uiIcon('lock')} Confirm it's you</h3>
      <p class="muted" style="margin:0 0 12px">For your safety, type your password to do this.</p>
      <label class="field">Password<input name="pw" type="password" required autocomplete="current-password"></label>
      <label class="field" data-code46 hidden>Two-factor code <span class="hint">(from your authenticator app, or a backup code)</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="16"></label>
      <div class="form-error"></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Confirm</button></div></form>`;
    $('#layer').appendChild(ov);
    const f = $('form', ov);
    f.pw.focus();
    const done = v => { ov.remove(); resolve(v); };
    $('[data-a=cancel]', ov).addEventListener('click', () => done(false));
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    const showCode = () => { const c = $('[data-code46]', ov); if (c.hidden) { c.hidden = false; f.code.focus(); } };
    api('GET', '/api/me/extras').then(x => { if (x?.confirmCode) $('[data-code46]', ov).hidden = false; }).catch(() => {});
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { await _api431('POST', '/api/me/reauth', { password: f.pw.value, code: f.code.value }); done(true); }
      catch (err) { $('.form-error', ov).textContent = err.message; if (/code/i.test(err.message)) showCode(); }
    });
  });
};

// ======================= Settings › My Account: Trusted devices only (the founder) =======================
{
  const _ssDev46 = showSettingsSection;
  showSettingsSection = function (section, ...rest) {
    const r = _ssDev46(section, ...rest);
    if (section === 'account' && state.me?.isStaff) setTimeout(() => drawDeviceLock46($('#settings-body')), 50);
    return r;
  };
}
async function drawDeviceLock46(body, d) {
  if (!body) return;
  if (!d) { try { d = await api('GET', '/api/me/device-lock'); } catch { return; } }
  let box = $('.dl46', body);
  if (!box) { box = document.createElement('div'); box.className = 'setting-group dl46'; const after = $('.account-card', body); after ? after.after(box) : body.appendChild(box); }
  box.innerHTML = `<h4 class="setting-head">Trusted devices only</h4>
    <label class="setting-row"><div><div class="setting-title">Only my trusted devices can log in</div><div class="setting-desc">Every login from any other device is refused, even with the right password, code or reset link. Trust each browser and the Zuno app you use first.</div></div><input type="checkbox" class="switch" data-dl-on${d.on ? ' checked' : ''}${d.unlockedByServer ? ' disabled' : ''}></label>
    ${d.unlockedByServer ? '<p class="br46-note">The lock is paused by the server (ZUNO_FOUNDER_UNLOCK). Remove that setting on Render once you\'ve trusted your new device.</p>' : ''}
    <div class="dl46-list">${d.devices.map(x => `<div class="dl46-row"><span>${uiIcon(x.current ? 'check' : 'shield')}</span><div><b>${esc(x.name)}</b>${x.current ? ' <span class="int-on">this device</span>' : ''}<div class="muted small">Added ${esc(fmtTime(x.at))}${x.lastUsed ? ` · last login ${esc(fmtTime(x.lastUsed))}` : ''}</div></div><button class="btn btn-link btn-sm" data-dl-rm="${esc(x.id)}">Remove</button></div>`).join('') || '<p class="muted small">No trusted devices yet.</p>'}</div>
    ${d.thisTrusted ? '' : '<button class="btn btn-primary btn-sm" data-dl-trust>Trust this device</button>'}
    <p class="muted small" style="margin-top:10px">Lost all your devices or cleared your browser? Set <code>ZUNO_FOUNDER_UNLOCK=1</code> on Render, log in, trust the new device, then remove it.</p>`;
  const redo = x => drawDeviceLock46(body, x);
  $('[data-dl-trust]', box)?.addEventListener('click', async e => { e.target.disabled = true; try { redo(await api('POST', '/api/me/device-lock/trust', {})); toast('This device is trusted'); } catch (err) { toast(err.message, true); e.target.disabled = false; } });
  $$('[data-dl-rm]', box).forEach(b => b.addEventListener('click', async () => { try { redo(await api('DELETE', `/api/me/device-lock/devices/${b.dataset.dlRm}`)); } catch (err) { toast(err.message, true); } }));
  $('[data-dl-on]', box)?.addEventListener('change', async e => {
    const on = e.target.checked;
    try { redo(await api('POST', '/api/me/device-lock', { on })); toast(on ? 'Only your trusted devices can log in now' : 'Any device can log in again'); }
    catch (err) { e.target.checked = !on; toast(err.message, true); }
  });
}
