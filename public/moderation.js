'use strict';
// Reporting messages, the staff Moderation panel, and the notice shown to suspended accounts.

const REPORT_REASONS = [
  ['spam', 'Spam or scam', 'Ads, fake links, phishing or tricks'],
  ['harassment', 'Harassment or bullying', 'Picking on, insulting or threatening someone'],
  ['hate', 'Hate speech', "Attacking people for who they are"],
  ['sexual', 'Sexual content', 'Sexual or explicit content nobody asked for'],
  ['minor', 'Involves someone under 18', 'Anything sexual or unsafe involving a minor'],
  ['selfharm', 'Self-harm or suicide', 'Someone may be in danger'],
  ['violence', 'Threats or violence', 'Threats, gore or encouraging violence'],
  ['other', 'Something else', 'Tell us in the box below'],
];

// ======================= reporting a message =======================
function openReportDialog(conv, msgId) {
  const m = state.convos[conv]?.messages.find(x => x.id === msgId);
  if (!m) return;
  const a = user(m.authorId);
  const ov = openLayer(`<form class="dialog modal report-dialog">
    <h3>Report message</h3>
    <div class="rp-quote">${avatar(a || { displayName: '?' }, 24)}<div><b>${esc(a?.displayName || 'Someone')}</b><div>${m.content ? formatMessage(m.content.slice(0, 300)) : m.gif ? '<i>GIF</i>' : '<i>Attachment</i>'}</div></div></div>
    ${m.e2e ? `<p class="rp-e2e">🔒 This chat is end-to-end encrypted, so the Zuno team can't read it on their own. Sending this report shares <b>this message and up to 30 before it</b> with the Zuno team, only so they can review it.</p>` : ''}
    <p class="muted small" style="margin:12px 0 8px">What's wrong with it? Only the Zuno team sees reports, and ${esc(a?.displayName || 'they')} won't know it was you.</p>
    <div class="rp-reasons">${REPORT_REASONS.map(([k, l, d], i) => `<label class="rp-reason"><input type="radio" name="reason" value="${k}"${i === 0 ? '' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
    <label class="field" style="margin-top:12px">Anything else? <span class="hint">(optional)</span><textarea name="details" maxlength="1000" placeholder="Tell the Zuno team what happened"></textarea></label>
    <p class="muted small rp-danger hidden">If someone is in danger right now, contact your local emergency number.</p>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red" data-a="send" disabled>Send Report</button></div></form>`);
  const form = $('form', ov);
  form.addEventListener('change', () => {
    $('[data-a=send]', ov).disabled = !form.reason.value;
    $('.rp-danger', ov).classList.toggle('hidden', !['selfharm', 'violence', 'minor'].includes(form.reason.value));
  });
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('[data-a=send]', ov); btn.disabled = true;
    try {
      const keys = typeof e2eReportKeys === 'function' ? await e2eReportKeys(conv, msgId) : [];
      await api('POST', '/api/reports', { conv, messageId: msgId, reason: form.reason.value, details: form.details.value, keys });
      dismissLayer();
      toast('Thanks. Your report was sent to the Zuno team.');
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ======================= moderation panel (staff) =======================
const MOD_ACTION = { 'claim-report': 'Claimed report', 'unclaim-report': 'Unassigned report', 'report-note': 'Added internal note', appeal_approved: 'Approved the appeal of', appeal_denied: 'Denied the appeal of', profile: 'Moderated the profile of', dismiss: 'Dismissed', delete: 'Deleted the message', warn: 'Warned', timeout: 'Timed out', ban: 'Banned', unsuspend: 'Lifted suspension', 'delete-message': 'Deleted a message' };
const fmtUntil = t => (t >= 8.64e15 ? 'Banned' : `Timed out until ${new Date(t).toLocaleString()}`);
let modTab = 'reports', modStatus = 'open';

async function renderModeration(body) {
  body.innerHTML = `
    <h2>Moderation</h2>
    <div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}" class="${modTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="mod-body" style="margin-top:16px"><div class="muted">Loading…</div></div>`;
  $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
  const box = $('#mod-body', body);
  try {
    if (modTab === 'reports') await modReports(box, body);
    else if (modTab === 'appeals') await modAppeals(box);
    else if (modTab === 'users') modPeople(box);
    else await modLogView(box);
  } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; }
}

// One message as staff see it. Encrypted ones show the text the reporter's keys unlocked (checked
// against what was actually sent), or a lock if they couldn't be unlocked.
function msgHtml(x, authors, hot = false) {
  const a = authors[x.authorId] || { displayName: 'Deleted user' };
  const media = f => f.kind === 'image' ? `<img class="mod-media" src="${esc(f.url)}" alt="" data-full="${esc(f.url)}">`
    : f.kind === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(f.name || '') ? `<video class="mod-media" controls preload="metadata" playsinline src="${esc(f.kind === 'video' ? f.url : f.url + '?play=1')}"></video>`
    : `<div class="muted small">📎 <a href="${esc(f.url)}" download="${esc(f.name)}">${esc(f.name)}</a></div>`;
  const lock = x.e2e ? (x.unlocked ? '<span class="mod-e2e ok" title="Encrypted message, unlocked with the reporter\'s key and checked against what was sent">🔓 encrypted · verified</span>' : '<span class="mod-e2e">🔒 encrypted, not shared</span>') : '';
  return `<div class="mod-msg${hot ? ' hot' : ''}" data-mid="${esc(x.id)}">${avatar(a, 24)}<div><b>${esc(a.displayName)}</b> <small class="muted">${fmtTime(x.createdAt)}</small> ${lock}
    <div>${x.e2eNotice ? `<i class="muted">${x.e2eNotice === 'on' ? '🔒 turned on end-to-end encryption' : '🔓 turned off end-to-end encryption'}</i>` : ''}${x.content ? formatMessage(x.content) : ''}${x.gif ? `<img class="mod-media" src="${esc(x.gif.preview || x.gif.url)}" alt="GIF">` : ''}${x.sticker ? '<div class="muted small">[sticker]</div>' : ''}${(x.attachments || []).map(media).join('')}</div></div></div>`;
}
// "View related conversation": what was said around the reported message, plus every picture
// and video in that stretch.
async function openReportContext(id) {
  let d;
  try { d = await api('GET', `/api/mod/reports/${id}/context`); } catch (e) { return toast(e.message, true); }
  // Opens on top of Settings (the usual window would close the Moderation page underneath).
  const ov = document.createElement('div');
  ov.className = 'overlay rc-overlay';
  ov.innerHTML = (`<div class="modal report-context"><div class="rc-head"><h3>Related conversation</h3><span class="muted small">${d.where.kind === 'dm' ? 'Direct messages' : d.where.kind === 'group' ? esc(d.where.name || 'Group chat') : esc(d.where.name || '')} · ${d.messages.length} messages</span><button class="icon-btn" data-a="close" aria-label="Close">✕</button></div>
    ${d.media.length ? `<div class="rc-media"><div class="setting-head">Pictures & videos (${d.media.length})</div><div class="rc-grid">${d.media.map(f => f.kind === 'image' ? `<button class="rc-tile" data-jump="${esc(f.msgId)}"><img src="${esc(f.url)}" alt=""></button>` : `<div class="rc-tile"><video controls preload="metadata" playsinline src="${esc(f.kind === 'video' ? f.url : f.url + '?play=1')}"></video></div>`).join('')}</div></div>` : ''}
    <div class="rc-thread">${d.messages.map(x => msgHtml(x, d.authors, x.id === d.reportedId)).join('')}</div></div>`);
  $('#layer').appendChild(ov);
  const close = () => { ov.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $('[data-a=close]', ov).addEventListener('click', close);
  $$('.mod-media[data-full]', ov).forEach(img => img.addEventListener('click', () => window.open(img.dataset.full, '_blank')));
  $$('[data-jump]', ov).forEach(b => b.addEventListener('click', () => $(`.rc-thread [data-mid="${CSS.escape(b.dataset.jump)}"]`, ov)?.scrollIntoView({ block: 'center', behavior: 'smooth' })));
  setTimeout(() => $('.rc-thread .mod-msg.hot', ov)?.scrollIntoView({ block: 'center' }), 50);
}

async function modReports(box, body) {
  const { reports, counts } = await api('GET', `/api/mod/reports?status=${modStatus}`);
  setModBadge(counts.open);
  box.innerHTML = `<div class="segmented bug-filter">${[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => `<button data-ms="${k}" class="${modStatus === k ? 'on' : ''}">${l}${k === 'open' && counts.open ? ` <span class="count">${counts.open}</span>` : ''}</button>`).join('')}</div>
    <div style="margin-top:14px">${reports.length ? reports.map(r => `<div class="bug-card mod-card" data-r="${esc(r.id)}">
      <div class="bug-head"><b><span class="mod-reason r-${esc(r.reason)}">${esc(r.reasonLabel)}</span> against ${esc(r.target?.displayName || 'deleted user')} <span class="muted">(${esc(r.target?.username || '?')})</span></b>
        ${r.status === 'open' ? '<span class="bug-pill s-new">Open</span>' : `<span class="bug-pill s-fixed">${esc(MOD_ACTION[r.resolution?.action] || 'Resolved')}</span>`}</div>
      <div class="bug-who muted">Reported by ${esc(r.reporter?.displayName || '?')} · ${fmtTime(r.createdAt)} · ${r.where.kind === 'dm' ? 'in a DM' : esc(r.where.name)}
        ${r.target ? ` · ${r.target.warnings} warning${r.target.warnings === 1 ? '' : 's'}, ${r.target.reportsAgainst} report${r.target.reportsAgainst === 1 ? '' : 's'}` : ''}${r.target?.suspendedUntil ? ` · <b class="mod-sus">${esc(fmtUntil(r.target.suspendedUntil))}</b>` : ''}</div>
      ${r.details ? `<div class="bug-steps"><small>Reporter says</small>${esc(r.details)}</div>` : ''}
      <div class="mod-triage" style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px">
        <div class="muted small">Assigned to: <b>${esc(r.assignedStaff?.displayName || 'Nobody yet')}</b></div>
        ${r.status === 'open' ? `<div class="actions" style="margin-top:6px"><button class="btn btn-sm btn-grey" data-triage="${r.assignedTo === state.me.id ? 'unclaim' : 'claim'}">${r.assignedTo === state.me.id ? 'Release report' : r.assignedTo ? 'Take over report' : 'Claim report'}</button></div>` : ''}
        ${(r.internalNotes || []).length ? `<div style="margin-top:8px"><b class="small">Staff-only notes</b>${r.internalNotes.map(n => `<div class="muted small" style="margin-top:4px">${esc(n.staff?.displayName || 'Staff')} · ${fmtTime(n.at)}: ${esc(n.text)}</div>`).join('')}</div>` : ''}
        ${r.status === 'open' ? `<div class="actions" style="margin-top:8px"><input class="mod-internal-note" maxlength="300" placeholder="Internal note (staff only)"><button class="btn btn-sm btn-grey" data-triage="note">Save note</button></div>` : ''}
      </div>
      <div class="mod-thread">${r.context.map(x => msgHtml(x, r.authors)).join('')}${msgHtml(r.message, r.authors, true)}</div>
      ${!r.stillThere ? '<div class="muted small">This message has been deleted.</div>' : ''}
      <button class="btn btn-link btn-sm rc-open" data-context="${esc(r.id)}">💬 View related conversation</button>${state.me.isFounder ? `<button class="btn btn-link btn-sm purge-btn" data-purge-report="${esc(r.id)}">🗑 Delete report for good</button>` : ''}
      ${r.status === 'open' ? `<div class="bug-actions">
        <input class="bug-note" maxlength="300" placeholder="Note (sent to them with a warning, timeout or ban)">
        <label class="mod-del"><input type="checkbox" class="mod-delete"${r.stillThere ? ' checked' : ' disabled'}> Delete message</label>
        <button class="btn btn-sm btn-grey" data-act="dismiss">Dismiss</button>
        <button class="btn btn-sm btn-grey" data-act="delete"${r.stillThere ? '' : ' disabled'}>Only delete</button>
        <button class="btn btn-sm btn-primary" data-act="warn">Warn</button>
        <select class="mod-days"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option></select>
        <button class="btn btn-sm btn-primary" data-act="timeout">Timeout</button>
        <button class="btn btn-sm btn-red" data-act="ban">Ban</button></div>`
      : `<div class="muted small">${esc(MOD_ACTION[r.resolution?.action] || 'Resolved')}${r.resolution?.days ? ` for ${r.resolution.days} day(s)` : ''} by ${esc(user(r.resolution?.by)?.displayName || 'staff')} · ${fmtTime(r.resolution?.at)}${r.resolution?.note ? ` · "${esc(r.resolution.note)}"` : ''}</div>`}
    </div>`).join('') : `<div class="empty-state">${mascot('happy')}<div class="title">All clear</div><div>No ${modStatus === 'all' ? '' : modStatus + ' '}reports.</div></div>`}</div>`;
  $$('[data-ms]', box).forEach(b => b.addEventListener('click', () => { modStatus = b.dataset.ms; renderModeration(body); }));
  $$('[data-context]', box).forEach(b => b.addEventListener('click', () => openReportContext(b.dataset.context)));
  $$('[data-purge-report]', box).forEach(b => b.addEventListener('click', () => purgeThing(`/api/mod/reports/${b.dataset.purgeReport}`, 'this report', () => renderModeration(body))));
  $$('.mod-card [data-triage]', box).forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('[data-r]'), action = b.dataset.triage;
    const note = action === 'note' ? $('.mod-internal-note', card).value.trim() : '';
    if (action === 'note' && !note) return toast('Write an internal note first.', true);
    b.disabled = true;
    try {
      await api('POST', `/api/mod/reports/${card.dataset.r}`, { action, note });
      toast(action === 'note' ? 'Internal note saved (staff only).' : action === 'claim' ? 'Report assigned to you.' : 'Report released.');
      await renderModeration(body);
    } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  $$('.mod-card [data-act]', box).forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('[data-r]'), action = b.dataset.act;
    if (action === 'ban' && !confirm('Ban this account from Zuno? This deletes it: it becomes DELETED_USER_…, is removed from every server, and its email can\'t sign up again. This can\'t be undone.')) return;
    try {
      await api('POST', `/api/mod/reports/${card.dataset.r}`, { action, note: $('.bug-note', card).value, days: Number($('.mod-days', card).value), deleteMessage: action !== 'dismiss' && $('.mod-delete', card).checked });
      toast(`Done: ${MOD_ACTION[action]}`);
      renderModeration(body);
    } catch (e) { toast(e.message, true); }
  }));
}

function modPeople(box) {
  box.innerHTML = `<input class="qs-input" id="mod-q" placeholder="Search people by name or username" autocomplete="off">
    <p class="muted small" style="margin:8px 0">Leave it empty to see everyone who's been warned or suspended.</p><div id="mod-users"></div>`;
  const q = $('#mod-q', box), list = $('#mod-users', box);
  let t;
  const draw = async () => {
    const { users } = await api('GET', `/api/mod/users?q=${encodeURIComponent(q.value.trim())}`);
    list.innerHTML = users.length ? users.map(u => `<div class="bug-row mod-user" data-u="${esc(u.id)}">${avatar(u, 36)}
      <div style="flex:1;min-width:0"><b>${esc(u.displayName)}</b> <span class="muted">${esc(u.username)}</span>
        <div class="muted small">Joined ${new Date(u.createdAt).toLocaleDateString()} · ${u.warnings} warning${u.warnings === 1 ? '' : 's'} · ${u.reportsAgainst} report${u.reportsAgainst === 1 ? '' : 's'}${u.suspendedUntil ? ` · <b class="mod-sus">${esc(fmtUntil(u.suspendedUntil))}</b>` : ''}</div></div>
      <div class="mod-user-acts">${u.suspendedUntil ? '<button class="btn btn-sm btn-green" data-ua="unsuspend">Lift</button>' : ''}
        <button class="btn btn-sm btn-grey" data-ua="warn">Warn</button><button class="btn btn-sm btn-grey" data-ua="timeout">Timeout 7d</button><button class="btn btn-sm btn-red" data-ua="ban">Ban</button></div></div>`).join('')
      : `<div class="fp-empty">${q.value.trim() ? 'Nobody matches that.' : 'Nobody has been warned or suspended.'}</div>`;
    $$('[data-ua]', list).forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('[data-u]').dataset.u, action = b.dataset.ua;
      if (action === 'ban' && !confirm('Ban this account from Zuno? This deletes it: it becomes DELETED_USER_…, is removed from every server, and its email can\'t sign up again. This can\'t be undone.')) return;
      const note = action === 'unsuspend' ? '' : await askText(MOD_ACTION[action] || 'Reason', { desc: 'They will see this reason.', placeholder: 'Reason (optional)', ok: 'Confirm', danger: action === 'ban' });
      if (note === null) return;
      try { await api('POST', `/api/mod/users/${id}`, { action, days: 7, note }); toast(`Done: ${MOD_ACTION[action]}`); draw(); }
      catch (e) { toast(e.message, true); }
    }));
  };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
  draw();
}

// Founder only: delete a moderation record for good (server/purge.js).
function purgeThing(url, what, after) {
  if (!confirm(`Permanently delete ${what}? This can't be undone.`)) return;
  api('DELETE', url).then(() => { toast('Deleted for good'); after?.(); }).catch(e => toast(e.message, true));
}
async function modLogView(box) {
  const { log } = await api('GET', '/api/mod/log');
  box.innerHTML = log.length ? log.map(e => `<div class="bug-row">${state.me.isFounder ? `<button class="icon-btn purge-x" title="Delete this entry for good" data-purge-log="${e.at}|${esc(e.by)}">🗑</button>` : ''}<div style="flex:1"><b>${esc(e.byUser?.displayName || 'Staff')}</b> ${esc((MOD_ACTION[e.action] || e.action).toLowerCase())} <b>${esc(e.targetUser?.displayName || 'someone')}</b>${e.days ? ` for ${e.days} day(s)` : ''}
    <div class="muted small">${fmtTime(e.at)}${e.note ? ` · "${esc(e.note)}"` : ''}</div></div></div>`).join('') : '<div class="fp-empty">Nothing has happened yet.</div>';
  $$('[data-purge-log]', box).forEach(b => b.addEventListener('click', () => { const [at, by] = b.dataset.purgeLog.split('|'); purgeThing(`/api/mod/log?at=${at}&by=${encodeURIComponent(by)}`, 'this log entry', () => modLogView(box)); }));
}

function setModBadge(n) {
  const b = $('.settings-nav [data-s="moderation"]');
  if (b) b.innerHTML = `Moderation${n ? ` <span class="count">${n}</span>` : ''}`;
}

// ======================= suspended notice =======================
function renderSuspendBanner() {
  const until = state.me?.suspendedUntil;
  let bar = $('#suspend-bar');
  if (!until) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'suspend-bar'; bar.className = 'suspend-bar'; document.body.appendChild(bar); }
  bar.innerHTML = until >= 8.64e15
    ? '⛔ This account is banned from Zuno. You can read, but you can\'t post. <a href="/terms" target="_blank">Terms of Service</a>'
    : `⏸️ Your account is in a timeout until <b>${esc(new Date(until).toLocaleString())}</b>. You can read, but not send messages. <a href="/terms" target="_blank">Terms of Service</a>`;
}
setInterval(renderSuspendBanner, 5000);
