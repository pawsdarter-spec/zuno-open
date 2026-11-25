'use strict';
// Zuno Bloom: the $5/month subscription. Perks, the Bloom settings page, profile themes,
// name colors, Bloom accent colors, the growing Bloom badge, and staff gifting.

// ---- the Bloom badge grows: teal when you join, purple after a month, rainbow for early supporters ----
Object.assign(BADGE_INFO, {
  bloom: { label: 'Zuno Bloom', desc: 'Subscribed to Zuno Bloom', svg: '<img class="pbadge-img" src="/badges/bloom-new.png" alt="">' },
  bloom_month: { label: 'Full Bloom', desc: 'Has had Zuno Bloom for over a month', svg: '<img class="pbadge-img" src="/badges/bloom-month.png" alt="">' },
  bloom_early: { label: 'Early Bloom', desc: "Supported Zuno early by getting Bloom in its first 6 months. A thank-you that stays; it doesn't mean they have Bloom right now", svg: '<img class="pbadge-img" src="/badges/bloom-early.png" alt="">' },
});

const BLOOM_PERKS = [
  ['📁', 'Bigger uploads', 'Send files up to 50 MB, and up to 10 at once.', 'Free: 10 MB, 4 at once'],
  ['🌸', '2 Server Blooms', 'Bloom your favorite servers to unlock more emoji, sounds, bigger uploads and a banner for everyone there.', ''],
  ['💬', 'Say more', 'Messages up to 4,000 characters and a 400-character About Me.', 'Free: 2,000 and 190'],
  ['🖥️', 'HD screen share', 'Share your screen in 1080p at 60 FPS.', 'Free: 720p at 30 FPS'],
  ['🖼️', 'Bigger profile media', 'Banners up to 10 MB, backgrounds up to 25 MB, sounds up to 8 MB.', 'Free: 4, 8 and 3 MB'],
  ['🏅', 'A badge that grows', 'Your Bloom badge changes the longer you keep Bloom.', ''],
];

const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

function onMe(me) {
  const wasActive = !!state.me?.bloomInfo?.active;
  state.me = { ...state.me, ...me };
  state.users[me.id] = { ...state.users[me.id], ...me };
  applyPrefs();
  renderUserPanel();
  if ($('.settings-nav [data-s="bloom"].active')) renderBloom($('#settings-body'));
  if (me.bloomInfo?.active && !wasActive) { toast('🌸 Zuno Bloom is on! Enjoy your perks.'); burst($('#user-panel .avatar') || document.body, 24); }
}

// ======================= the Bloom page =======================
async function renderBloom(body) {
  let info;
  try { info = await api('GET', '/api/bloom'); } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const st = info.status;
  const tierName = { bloom: 'Zuno Bloom', bloom_month: 'Full Bloom', bloom_early: 'Early Bloom' }[st.tier];
  const tierImg = { bloom: 'bloom-new', bloom_month: 'bloom-month', bloom_early: 'bloom-early' }[st.tier] || 'bloom-new';
  const earlyOpen = Date.now() < info.earlyUntil;
  body.innerHTML = `
    <div class="bloom-hero${st.active ? ' on' : ''}">
      <div class="bh-petals" aria-hidden="true">${'<i></i>'.repeat(10)}</div>
      <img class="bh-icon" src="/badges/${tierImg}-512.png" alt="">
      <div class="bh-text">
        <div class="bh-kicker">${st.active ? 'You have' : 'Introducing'}</div>
        <h2>Zuno Bloom</h2>
        <p>${st.active ? `Thanks for supporting Zuno! Your badge right now: <b>${tierName}</b>.` : 'Bigger uploads, longer messages, HD screen share and 2 Server Blooms. And every Bloom helps keep Zuno growing.'}</p>
        <div class="bh-buy">
          ${st.active ? bloomStatusLine(st) : `<span class="bh-price"><b>${esc(info.price)}</b>/month</span>`}
          ${st.active
            ? (st.canManage ? '<button class="btn btn-bloom" id="bloom-manage">Manage Bloom</button>' : '')
            : info.available ? '<button class="btn btn-bloom" id="bloom-buy">Get Bloom</button>' : '<button class="btn btn-bloom" disabled>Coming very soon</button>'}
          ${st.gifted && info.available ? '<button class="btn btn-bloom ghost" id="bloom-buy">Subscribe to keep it</button>' : ''}
        </div>
        <div class="bh-note muted small" id="bloom-note"></div>
      </div>
    </div>

    <h4 class="setting-head" style="margin-top:28px">What you get</h4>
    <div class="bloom-perks">${BLOOM_PERKS.map(([ico, t, d, free]) => `<div class="bp-card"><span class="bp-ico">${ico}</span><b>${t}</b><span>${d}</span>${free ? `<small>${free}</small>` : ''}</div>`).join('')}</div>

    <h4 class="setting-head" style="margin-top:28px">Your badge grows with you</h4>
    <div class="bloom-tiers">
      ${[['bloom-new', 'Zuno Bloom', 'As soon as you get Bloom.', st.tier === 'bloom'],
         ['bloom-month', 'Full Bloom', 'After a month of Bloom in a row.', st.tier === 'bloom_month'],
         ['bloom-early', 'Early Bloom', `For everyone who gets Bloom in its first 6 months${earlyOpen ? `, until ${fmtDate(info.earlyUntil)}` : ''}. A thank-you for supporting Zuno early: the badge stays forever, even after Bloom ends (Bloom itself doesn't).`, st.tier === 'bloom_early']]
        .map(([img, n, d, on]) => `<div class="bt-card${on ? ' on' : ''}"><img src="/badges/${img}.png" alt=""><b>${n}</b><span>${d}</span>${on ? '<em>Yours</em>' : ''}</div>`).join('')}
    </div>
    ${earlyOpen && !st.active ? `<div class="bloom-early-cta"><img src="/badges/bloom-early.png" alt=""><div><b>Early Bloom is open.</b> Get Bloom before ${fmtDate(info.earlyUntil)} and your badge is rainbow from day one.</div></div>` : ''}

    <div class="bloom-gift-cta"><span class="bgc-ico">🎁</span><div><b>Gift Bloom to a friend</b><span>1, 3 or 12 months, paid once. It turns on for them right away.</span></div><button class="btn btn-bloom" id="bloom-gift-pick">Gift Bloom</button></div>

    <p class="muted small" style="margin-top:24px">Bloom renews every month and you can cancel any time from Manage Bloom. Your perks stay until the end of the month you've paid for. Payments are handled securely by Stripe; Zuno never sees your card. See the <a href="/terms#bloom" target="_blank">Terms of Service</a>.</p>`;

  const go = async (path, btn) => {
    btn.disabled = true;
    try {
      const { url } = await api('POST', path);
      window.open(url, '_blank');
      $('#bloom-note', body).textContent = path.endsWith('checkout')
        ? 'Finish up in your browser. Bloom turns on here by itself as soon as you\'re done.'
        : 'Your Bloom settings opened in your browser.';
    } catch (e) { toast(e.message, true); }
    btn.disabled = false;
  };
  $('#bloom-gift-pick', body)?.addEventListener('click', openGiftFriendPicker);
  $('#bloom-buy', body)?.addEventListener('click', e => go('/api/bloom/checkout', e.currentTarget));
  $('#bloom-manage', body)?.addEventListener('click', e => go('/api/bloom/portal', e.currentTarget));
}
function bloomStatusLine(st) {
  if (st.gifted) return `<span class="bh-price">Gifted until <b>${fmtDate(st.until)}</b></span>`;
  return `<span class="bh-price">${st.cancelAtEnd ? 'Ends' : 'Renews'} <b>${fmtDate(st.until - 24 * 3600e3)}</b></span>`;
}

// ======================= profile editor: theme & name color =======================
function bloomProfileFields(d) {
  const t = d.profileTheme || { primary: '#2a1f4d', accent: '#04c5ae' };
  return `<div class="field bloom-field">
    <span class="bf-title">🎨 Profile Colors</span>
    <div class="bf-row">
      <label class="bf-opt"><input type="checkbox" id="bf-theme-on"${d.profileTheme ? ' checked' : ''}> Profile theme</label>
      <input type="color" class="color-input" id="bf-pt1" value="${esc(t.primary)}" title="Main color">
      <input type="color" class="color-input" id="bf-pt2" value="${esc(t.accent)}" title="Accent color">
    </div>
    <div class="bf-row">
      <label class="bf-opt"><input type="checkbox" id="bf-name-on"${d.nameColor ? ' checked' : ''}> Name color</label>
      <input type="color" class="color-input" id="bf-name" value="${esc(d.nameColor || '#ff8fcf')}">
    </div>
    <span class="hint">Your theme colors your whole profile card. Your name color shows in every chat (a name style below overrides it).</span>
  </div>`;
}
function wireBloomProfileFields(form, d, update) {
  const sync = () => {
    d.profileTheme = $('#bf-theme-on', form).checked ? { primary: $('#bf-pt1', form).value, accent: $('#bf-pt2', form).value } : null;
    d.nameColor = $('#bf-name-on', form).checked ? $('#bf-name', form).value : null;
    update();
  };
  ['#bf-theme-on', '#bf-pt1', '#bf-pt2', '#bf-name-on', '#bf-name'].forEach(sel => $(sel, form).addEventListener('input', e => {
    if (e.target.type === 'color') $(sel.startsWith('#bf-pt') ? '#bf-theme-on' : '#bf-name-on', form).checked = true;
    sync();
  }));
}

// ======================= Bloom accent colors in Appearance =======================
const _renderAppearance = renderAppearance;
renderAppearance = function (body) {
  _renderAppearance(body);
  const group = $('.swatches', body)?.closest('.setting-group');
  if (!group) return;
  const p = prefs();
  const box = document.createElement('div');
  box.className = 'bloom-swatches';
  box.innerHTML = `<div class="bs-head">More colors</div>
    <div class="swatches">${Object.entries(BLOOM_ACCENTS).map(([k, [name, c]]) => `
      <button class="swatch-btn${p.accent === k ? ' on' : ''}" data-baccent="${k}" style="--c:${c}">
        <span class="dot"></span><span>${name}</span></button>`).join('')}</div>`;
  group.appendChild(box);
  $$('[data-baccent]', box).forEach(b => b.addEventListener('click', async () => {
    if (await savePref({ accent: b.dataset.baccent })) { renderAppearance(body); burst(b, 12); }
  }));
};

// ======================= gifting Bloom =======================
function openGiftFriendPicker() {
  const friends = (state.friends || []).map(user).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const ov = openLayer(`<div class="dialog modal bloom-gift">
    <h3>Who's getting Bloom?</h3>
    ${friends.length ? `<div class="gift-friends">${friends.map(f => `<button class="gift-friend" data-id="${esc(f.id)}">${avatar(f, 32)}<span>${esc(f.displayName)}<small>${esc(f.username)}</small></span></button>`).join('')}</div>`
      : '<p class="muted">Add some friends first, then you can gift them Bloom.</p>'}
    <div class="actions"><button class="btn btn-link" data-a="close">Cancel</button></div></div>`);
  $$('[data-id]', ov).forEach(b => b.addEventListener('click', () => openBloomGift(user(b.dataset.id))));
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
}

async function openBloomGift(u) {
  let available = false;
  try { available = (await api('GET', '/api/bloom')).available; } catch {}
  const friendOfMine = isFriend(u.id);
  const plans = [[1, '1 month', '$5'], [3, '3 months', '$15'], [12, '12 months', '$60']];
  const ov = openLayer(`<div class="dialog modal bloom-gift">
    <img src="/badges/bloom-new-512.png" alt="" class="bg-icon">
    <h3>Gift Bloom to ${esc(u.displayName)}</h3>
    ${friendOfMine ? (available ? `<p class="muted" style="margin:0 0 14px">You pay once. Bloom turns on for them right away, and they'll see your gift in your DM.</p>
      <div class="gift-plans">${plans.map(([m, l, p], i) => `<button class="gift-plan${i === 0 ? ' on' : ''}" data-months="${m}"><b>${l}</b><span>${p}</span></button>`).join('')}</div>
      <button class="btn btn-bloom" id="gift-pay" style="width:100%;margin-top:12px">Continue to payment</button>
      <div class="muted small" id="gift-note" style="margin-top:8px;min-height:18px"></div>`
      : '<p class="muted">Bloom gifts open as soon as Bloom does. Check back soon!</p>') : ''}
    ${state.me.isFounder ? `<div class="gift-staff"><h4 class="setting-head">Founder: gift for free</h4>
      <div class="bg-days">${[[7, '1 week'], [30, '1 month'], [90, '3 months'], [365, '1 year']].map(([d, l]) => `<button class="btn btn-grey btn-sm" data-days="${d}">${l}</button>`).join('')}</div>
      <button class="btn btn-link" data-days="0" style="color:#fa777c">Remove gifted Bloom</button></div>` : ''}
    <div class="actions"><button class="btn btn-primary" data-a="done">Done</button></div></div>`);
  let months = 1;
  $$('[data-months]', ov).forEach(b => b.addEventListener('click', () => { months = Number(b.dataset.months); $$('[data-months]', ov).forEach(x => x.classList.toggle('on', x === b)); }));
  $('#gift-pay', ov)?.addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const { url } = await api('POST', '/api/bloom/gift-checkout', { to: u.id, months });
      window.open(url, '_blank');
      $('#gift-note', ov).textContent = `Finish up in your browser. ${u.displayName} gets Bloom as soon as you're done.`;
    } catch (err) { toast(err.message, true); }
    btn.disabled = false;
  });
  $$('[data-days]', ov).forEach(b => b.addEventListener('click', async () => {
    try {
      const { user: nu, bloom } = await api('POST', `/api/users/${u.id}/bloom`, { days: Number(b.dataset.days) });
      state.users[nu.id] = { ...state.users[nu.id], ...nu };
      toast(bloom.active ? `${u.displayName} has Bloom until ${fmtDate(bloom.until)}` : `Removed gifted Bloom from ${u.displayName}`);
      if (bloom.active) burst(b, 16);
    } catch (e) { toast(e.message, true); }
  }));
  $('[data-a=done]', ov).addEventListener('click', dismissLayer);
}

// A gift shows up in the chat as a card.
const _mediaHtml = mediaHtml;
mediaHtml = function (m) {
  let html = _mediaHtml(m);
  if (m.bloomGift) {
    const to = user(m.bloomGift.to), from = user(m.authorId), mine = m.bloomGift.to === state.me.id;
    const n = m.bloomGift.months;
    html = `<div class="gift-card"><img src="/badges/bloom-new-512.png" alt="">
      <div><small>Bloom gift</small><b>${mine ? `${esc(from?.displayName || 'A friend')} gifted you ${n} month${n > 1 ? 's' : ''} of Zuno Bloom!` : `You gifted ${esc(to?.displayName || 'them')} ${n} month${n > 1 ? 's' : ''} of Zuno Bloom`}</b>
      <span>${mine ? 'Your perks are on now. 🌸' : 'Thanks for spreading the bloom. 🌸'}</span></div></div>` + html;
  }
  return html;
};
