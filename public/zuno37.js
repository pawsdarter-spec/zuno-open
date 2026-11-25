'use strict';
// Zuno 0.37: Verified Creator and Star Creator badges, applying for Verified Creator in My Account,
// and reviewing applications in Moderation.

// ======================= the badges =======================
BADGE_INFO.creator = {
  label: 'Verified Creator', desc: 'Makes videos about Zuno',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgCreator" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b8b"/><stop offset="1" stop-color="#d4145a"/></linearGradient></defs>
    <rect x="1.8" y="4" width="20.4" height="16" rx="5" fill="url(#bgCreator)"/>
    <path d="M9.6 8.6v6.8c0 .6.6.9 1.1.6l5.4-3.4c.5-.3.5-.9 0-1.2l-5.4-3.4c-.5-.3-1.1 0-1.1.6z" fill="#fff"/>
    <circle cx="19.2" cy="18.6" r="4" fill="#2fbf71" stroke="#0c1312" stroke-width="1.2"/><path d="m17.4 18.6 1.3 1.3 2.3-2.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
BADGE_INFO.creator_star = {
  label: 'Star Creator', desc: 'One of Zuno’s standout creators',
  svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgStarC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
    <path d="M12 1.5l2.9 6.2 6.7.8-5 4.6 1.3 6.7L12 16.5l-5.9 3.3 1.3-6.7-5-4.6 6.7-.8z" fill="url(#bgStarC)" stroke="#b45309" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M10.5 8.9v5.2c0 .4.5.7.8.5l4.1-2.6c.3-.2.3-.7 0-.9l-4.1-2.6c-.3-.3-.8 0-.8.4z" fill="#fff"/></svg>`,
};

// ======================= My Account › Verified Creator =======================
const CR37_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm6 3.5v7l6-3.5z"/></svg>';
async function creatorCard37(body) {
  if (!body?.isConnected || $('.cr37', body)) return;
  const card = document.createElement('div');
  card.className = 'cr37';
  card.style.order = 450; // after Account Standing
  card.innerHTML = '<div class="muted small">Loading…</div>';
  body.appendChild(card);
  let d;
  try { d = await api('GET', '/api/creator/application'); } catch (e) { card.remove(); return; }
  const a = d.application, need = (d.needSubs || 1000).toLocaleString();
  const head = `<div class="pf-card-head"><span class="m36-ic cr37-ic">${CR37_ICON}</span><h3>Verified Creator</h3><span>Make videos about Zuno? Get the badge and post in #videos.</span></div>`;
  const badgeLine = `<span class="cr37-badge">${BADGE_INFO.creator.svg}<b>Verified Creator</b></span>`;
  if (d.hasBadge) { card.innerHTML = `${head}<div class="cr37-state ok">${badgeLine}<span>You're a creator on Zuno. You can post in <b>#videos</b> in Zuno Official. Thank you! 🎬</span></div>`; return; }
  if (a?.status === 'pending') { card.innerHTML = `${head}<div class="cr37-state wait"><b>⏳ Your application is waiting for review</b><span class="muted small">Sent ${esc(fmtTime(a.at))}. You'll get a Zuno DM when the team has looked at it.</span></div>`; return; }
  const declined = a?.status === 'declined' ? `<div class="cr37-state no"><b>Your last application wasn't approved</b><span class="small">Why: ${esc(a.reason || '—')}</span></div>` : '';
  card.innerHTML = `${head}${declined}
    <ul class="cr37-needs"><li>${uiIcon('checkCircle')} <b>${esc(need)}+ subscribers</b> on your channel</li><li>${uiIcon('checkCircle')} At least <b>one video about Zuno</b></li><li>${uiIcon('checkCircle')} Proof it's your channel: put <code>Zuno: ${esc(state.me.username)}</code> in your channel description (you can remove it after)</li></ul>
    <button type="button" class="btn btn-primary btn-sm" data-cr-open>Apply for Verified Creator</button>
    <form class="cr37-form" hidden>
      <label class="field">Your channel <span class="req">*</span><input name="channel" type="url" maxlength="300" placeholder="https://youtube.com/@yourchannel" required></label>
      <label class="field">Subscribers <span class="req">*</span><input name="subs" type="number" min="${d.needSubs || 1000}" step="1" placeholder="${esc(need)}" required></label>
      <label class="field">Your video about Zuno <span class="req">*</span><input name="video" type="url" maxlength="300" placeholder="https://youtube.com/watch?v=…" required></label>
      <label class="field">Proof it's you <span class="req">*</span><input name="proof" maxlength="300" placeholder="Where to find &quot;Zuno: ${esc(state.me.username)}&quot; (like: in my channel's About section)" required></label>
      <label class="field">Anything else <span class="hint">(optional)</span><textarea name="info" maxlength="600" rows="3" placeholder="Other channels, what you make, anything that helps"></textarea></label>
      <div class="row-btns"><button class="btn btn-primary btn-sm" data-cr-send>Send</button><button type="button" class="btn btn-link btn-sm" data-cr-cancel>Cancel</button></div>
    </form>`;
  const form = $('.cr37-form', card), open = $('[data-cr-open]', card);
  open.addEventListener('click', () => { form.hidden = false; open.hidden = true; form.channel.focus(); });
  $('[data-cr-cancel]', card).addEventListener('click', () => { form.hidden = true; open.hidden = false; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('[data-cr-send]', form);
    btn.disabled = true;
    try {
      await api('POST', '/api/creator/application', { channel: form.channel.value.trim(), subs: Number(form.subs.value), video: form.video.value.trim(), proof: form.proof.value.trim(), info: form.info.value.trim() });
      toast('Application sent 🎬');
      card.remove(); creatorCard37(body);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}
const _showSettingsSection37 = showSettingsSection;
showSettingsSection = function (section, ...a) {
  const r = _showSettingsSection37(section, ...a);
  if (section === 'account' || section === 'standing') Promise.resolve(r).then(() => setTimeout(() => creatorCard37($('#settings-body')), 50));
  return r;
};

// ======================= Moderation › Verified Creators =======================
const _renderModeration37 = renderModeration;
renderModeration = async function (body) {
  if (modTab !== 'creators') {
    const r = await _renderModeration37(body);
    addCreatorsTab37(body);
    return r;
  }
  body.innerHTML = `<h2>Moderation</h2><div class="segmented mod-tabs">${[['reports', 'Reports'], ['appeals', 'Appeals'], ['users', 'People'], ['log', 'Log']].map(([k, l]) => `<button data-mt="${k}">${l}</button>`).join('')}</div><div id="mod-body" style="margin-top:16px"></div>`;
  $$('[data-mt]', body).forEach(b => b.addEventListener('click', () => { modTab = b.dataset.mt; renderModeration(body); }));
  addCreationsTab?.(body);
  addCreatorsTab37(body);
  drawCreatorReview37($('#mod-body', body));
};
function addCreatorsTab37(body) {
  const tabs = $('.mod-tabs', body);
  if (!tabs || $('[data-mt37]', tabs)) return;
  if (modTab === 'creators') $$('button', tabs).forEach(b => b.classList.remove('on'));
  tabs.insertAdjacentHTML('beforeend', `<button data-mt37 class="${modTab === 'creators' ? 'on' : ''}">Verified Creators<span class="cm-count" hidden></span></button>`);
  $('[data-mt37]', tabs).addEventListener('click', () => { modTab = 'creators'; renderModeration(body); });
  api('GET', '/api/creator/review/count').then(d => { const n = $('[data-mt37] .cm-count', tabs); if (n && d.pending) { n.hidden = false; n.textContent = d.pending; } }).catch(() => {});
}
async function drawCreatorReview37(box) {
  if (!box) return;
  let d;
  try { d = await api('GET', '/api/creator/review'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  for (const a of [...d.pending, ...d.recent]) if (a.user) state.users[a.user.id] = { ...state.users[a.user.id], ...a.user };
  const lnk = u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a>`;
  box.innerHTML = `<p class="muted small" style="margin:0 0 12px">Open their channel and check: ${'1,000'}+ subscribers, at least one video about Zuno, and <b>"Zuno: their username"</b> in the channel description. Approving gives them the Verified Creator badge, which lets them post in #videos.</p>
    ${d.pending.length ? d.pending.map(a => `<div class="cr37-rv" data-crv="${esc(a.id)}">
      <button class="rv-maker" data-maker="${esc(a.by)}">${a.user ? avatar(a.user, 26) : ''}<span><b>${esc(a.user?.displayName || 'Deleted user')}</b> <span class="muted">@${esc(a.user?.username || '?')}</span></span></button>
      <div class="cr37-rows">
        <div><span>Channel</span>${lnk(a.channel)}</div>
        <div><span>Subscribers</span><b>${esc(Number(a.subs).toLocaleString())}</b></div>
        <div><span>Video</span>${lnk(a.video)}</div>
        <div><span>Proof</span>${esc(a.proof)}</div>
        ${a.info ? `<div><span>More</span>${esc(a.info)}</div>` : ''}
        <div><span>Sent</span>${esc(fmtTime(a.at))}</div>
      </div>
      <input class="rv-reason" maxlength="300" placeholder="Why not? (needed to turn it down; they'll see this)">
      <div class="rv-acts"><button class="btn btn-green btn-sm" data-ok>Approve</button><button class="btn btn-red btn-sm" data-no>Turn down</button></div></div>`).join('')
      : '<div class="empty-state"><div class="title">All caught up</div><div>No creator applications waiting.</div></div>'}
    ${d.recent.length ? `<h4 class="setting-head" style="margin-top:22px">Decided lately</h4><div class="rv-recent">${d.recent.map(a => `<div class="rv-row">${a.user ? avatar(a.user, 22) : ''}<b>${esc(a.user?.displayName || 'Deleted user')}</b><span class="cm-st ${a.status === 'approved' ? 'ok' : 'no'}">${a.status === 'approved' ? 'Approved' : 'Turned down'}</span><span class="muted small">by ${esc(a.reviewedBy || '?')}</span></div>`).join('')}</div>` : ''}`;
  $$('[data-maker]', box).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.maker)));
  const decide = async (id, approve, reason) => {
    try { await api('PATCH', `/api/creator/${id}/review`, { approve, reason }); toast(approve ? 'Approved 🎬' : 'Turned down'); drawCreatorReview37(box); }
    catch (e) { toast(e.message, true); }
  };
  $$('[data-crv]', box).forEach(card => {
    $('[data-ok]', card).addEventListener('click', () => decide(card.dataset.crv, true));
    $('[data-no]', card).addEventListener('click', () => { const why = $('.rv-reason', card).value.trim(); if (!why) { $('.rv-reason', card).focus(); return toast('Say why first, so they know what to fix', true); } decide(card.dataset.crv, false, why); });
  });
}
onLive26?.('creator-apps', () => {
  if (!$('.settings-nav [data-s="moderation"].active')) return;
  if (modTab === 'creators') drawCreatorReview37($('#mod-body'));
  else { $('[data-mt37]')?.remove(); addCreatorsTab37($('#settings-body')); }
});

// The badge manager lists the creator badges right after Staff.
(() => {
  const order = ['staff', 'creator_star', 'creator'];
  const rest = Object.keys(BADGE_INFO).filter(k => !order.includes(k));
  const all = Object.fromEntries([...order, ...rest].filter(k => BADGE_INFO[k]).map(k => [k, BADGE_INFO[k]]));
  for (const k of Object.keys(BADGE_INFO)) delete BADGE_INFO[k];
  Object.assign(BADGE_INFO, all);
})();
