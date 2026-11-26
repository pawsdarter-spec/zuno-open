'use strict';
// Profile flair: avatar decorations (drawn around your picture everywhere) and animated profile
// effects (play over your profile card). Plus notes and server roles on profile cards.

// ======================= avatar decorations =======================
// Drawn in a 100×100 box; the avatar is the circle in the middle (radius ~37).
const DECORATIONS = {
  sprout: { name: 'Sprout', svg: `<g class="dk-sway"><path d="M48 15C40 4 43-5 51-9c5 10 5 18 1 24Z" fill="#c6f8f1"/><path d="M52 16c3-10 10-16 19-15-2 10-9 15-18 17Z" fill="#7fe3d6"/></g>` },
  halo: { name: 'Halo', svg: `<g class="dk-bob"><ellipse cx="50" cy="6" rx="22" ry="6" fill="none" stroke="#ffe58a" stroke-width="4"/><ellipse cx="50" cy="6" rx="22" ry="6" fill="none" stroke="#fff6c9" stroke-width="1.5" opacity=".9"/></g>` },
  cat: { name: 'Cat Ears', svg: `<path d="M17 30 14 3l22 14Z" fill="#2b2f33"/><path d="M19 25 18 10l11 8Z" fill="#ff9fc3"/><path d="M83 30l3-27-22 14Z" fill="#2b2f33"/><path d="M81 25l1-15-11 8Z" fill="#ff9fc3"/>` },
  crown: { name: 'Crown', svg: `<g transform="translate(0 1) rotate(-6 50 9)"><path d="M30 18 34 0l9 10 7-13 7 13 9-10 4 18Z" fill="#f6c343" stroke="#b7791f" stroke-width="1.5"/><circle cx="50" cy="9" r="2.6" fill="#ef4444"/><circle cx="38" cy="12" r="2" fill="#3aaefc"/><circle cx="62" cy="12" r="2" fill="#23a55a"/></g>` },
  flames: { name: 'Flames', svg: `<g class="dk-flicker">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path transform="rotate(${a} 50 50)" d="M50 2c-6 8-6 13 0 17 6-4 6-9 0-17Z" fill="#ff7a1a"/><path transform="rotate(${a + 22} 50 50)" d="M50 6c-3 5-3 8 0 10 3-2 3-5 0-10Z" fill="#ffd166"/>`).join('')}</g>` },
  rainbow: { name: 'Rainbow Ring', svg: `<defs><linearGradient id="dkRb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f6d"/><stop offset=".25" stop-color="#ffc371"/><stop offset=".5" stop-color="#5ee7d0"/><stop offset=".75" stop-color="#5865f2"/><stop offset="1" stop-color="#eb459e"/></linearGradient></defs><circle class="dk-spin" cx="50" cy="50" r="41" fill="none" stroke="url(#dkRb)" stroke-width="5"/>` },
  bubbles: { name: 'Bubbles', svg: `<g class="dk-float">${[[84, 70, 6], [92, 52, 4], [78, 88, 4.5], [14, 80, 5], [8, 62, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(160,240,230,.18)" stroke="#a8f0e6" stroke-width="1.2"/><circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 4}" fill="#fff"/>`).join('')}</g>` },
  headphones: { name: 'Headphones', svg: `<path d="M12 52C12 22 30 6 50 6s38 16 38 46" fill="none" stroke="#1f2933" stroke-width="7" stroke-linecap="round"/><path d="M12 52C12 22 30 6 50 6s38 16 38 46" fill="none" stroke="#04c5ae" stroke-width="2.5" stroke-linecap="round"/><rect x="3" y="44" width="14" height="26" rx="6" fill="#04c5ae"/><rect x="83" y="44" width="14" height="26" rx="6" fill="#04c5ae"/>` },
  flowers: { name: 'Flower Crown', svg: [[20, 26, '#ff8fcf'], [32, 15, '#ffd166'], [50, 11, '#ff7b6b'], [68, 15, '#b67cff'], [80, 26, '#ff8fcf']].map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse transform="rotate(${a})" cx="0" cy="-4.5" rx="3" ry="4.5" fill="${c}"/>`).join('')}<circle r="2.6" fill="#fff4b0"/></g>`).join('') + '<path d="M14 34c10-14 22-22 36-23 14 1 26 9 36 23" fill="none" stroke="#3ec46f" stroke-width="2"/>' },
  horns: { name: 'Little Horns', svg: `<path d="M22 22C14 14 13 4 18-2c2 9 8 14 14 16Z" fill="#e5484d"/><path d="M78 22c8-8 9-18 4-24-2 9-8 14-14 16Z" fill="#e5484d"/>` },
  neon: { name: 'Neon', svg: `<circle class="dk-pulse" cx="50" cy="50" r="41" fill="none" stroke="#5ee7f7" stroke-width="3.5" style="filter:drop-shadow(0 0 3px #5ee7f7) drop-shadow(0 0 6px #eb459e)"/>` },
  stars: { name: 'Orbiting Stars', svg: `<g class="dk-spin slow">${[0, 120, 240].map(a => `<path transform="rotate(${a} 50 50) translate(50 4)" d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z" fill="#ffe58a"/>`).join('')}</g>` },
  bunny: { name: 'Bunny Ears', svg: `<g class="dk-sway"><ellipse cx="34" cy="2" rx="7" ry="18" transform="rotate(-12 34 2)" fill="#f5f5f5"/><ellipse cx="34" cy="3" rx="3.5" ry="12" transform="rotate(-12 34 3)" fill="#ffc2d6"/><ellipse cx="66" cy="2" rx="7" ry="18" transform="rotate(12 66 2)" fill="#f5f5f5"/><ellipse cx="66" cy="3" rx="3.5" ry="12" transform="rotate(12 66 3)" fill="#ffc2d6"/></g>` },
  leaves: { name: 'Vines', svg: (() => { const v = `<path d="M16 80C2 60 4 34 22 16" fill="none" stroke="#2f9e5b" stroke-width="2.5"/>${[[10, 64, -40], [8, 46, -10], [14, 30, 20], [24, 18, 50]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.2" transform="rotate(${r} ${x} ${y})" fill="#3ec46f"/>`).join('')}`; return v + `<g transform="translate(100 0) scale(-1 1)">${v}</g>`; })() },
  hearts: { name: 'Hearts', svg: `<g class="dk-float">${[[86, 26, 1], [92, 46, .7], [12, 30, .8], [80, 82, .6]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6-6-1a4 4 0 0 1 6-5 4 4 0 0 1 6 5Z" fill="#ff5f8f"/>`).join('')}</g>` },
  collar: { name: 'Collar', svg: `<path d="M19.7 67.5A35 35 0 0 0 80.3 67.5" fill="none" stroke="#6e1a27" stroke-width="8.5" stroke-linecap="round"/><path d="M19.7 67.5A35 35 0 0 0 80.3 67.5" fill="none" stroke="#c83349" stroke-width="6" stroke-linecap="round"/><path d="M21.5 69A33.5 33.5 0 0 0 78.5 69" fill="none" stroke="#ff8a9b" stroke-width="1" opacity=".5"/>${[[72.5, 76.8], [62, 82.9], [38, 82.9], [27.5, 76.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#ffe7a3" stroke="#b7791f" stroke-width=".6"/>`).join('')}<circle cx="50" cy="87.5" r="3.2" fill="none" stroke="#d9a334" stroke-width="1.8"/><g class="dk-swing"><path d="M50 99.5l-6.2-6.2a3.8 3.8 0 0 1 6.2-4.4 3.8 3.8 0 0 1 6.2 4.4Z" fill="#f6c343" stroke="#a16207" stroke-width="1"/><path d="M47.6 92.4a1.8 1.8 0 0 1 1.8-1.3" stroke="#fff4c2" stroke-width=".9" fill="none"/></g>` },
  glitch: { name: 'Glitch', svg: `<g class="dk-glitch"><circle cx="48" cy="50" r="40" fill="none" stroke="#ff2a6d" stroke-width="2.5" opacity=".85"/><circle cx="52" cy="50" r="40" fill="none" stroke="#05d9e8" stroke-width="2.5" opacity=".85"/></g>` },
  // Limited: only during their seasonal event (you keep the ones you used).
  pumpkin: { name: 'Pumpkin', season: 'halloween', svg: `<g transform="translate(78 18)"><g class="dk-bob"><path d="M-1-11c1-4 4-6 7-6" fill="none" stroke="#3b7a2a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="-6" cy="0" rx="7" ry="10" fill="#e8730c"/><ellipse cx="6" cy="0" rx="7" ry="10" fill="#e8730c"/><ellipse cx="0" cy="0" rx="7" ry="11" fill="#ff8c1a"/><path d="M-6-2l2-4 2 4Zm8 0 2-4 2 4ZM-6 4c3 3 9 3 12 0l-3 1-1-1-1 1-2-1-1 1Z" fill="#3a1800"/></g></g>` },
  witch_hat: { name: 'Witch Hat', season: 'halloween', svg: `<g transform="translate(-1 0) rotate(-7 51 19)"><path d="M50-14C44 0 38 8 34 18h34C62 10 58 0 63-4 58-6 54-10 50-14Z" fill="#2d1b47"/><ellipse cx="51" cy="19" rx="30" ry="6" fill="#3d2563"/><rect x="35" y="12" width="32" height="5" rx="1" fill="#ff8c1a"/><rect x="47" y="11" width="7" height="7" rx="1" fill="none" stroke="#ffd166" stroke-width="1.6"/></g>` },
  bat_wings: { name: 'Bat Wings', season: 'halloween', svg: `<g class="dk-flap"><path d="M15 46C6 40 0 30-2 22c4 4 8 4 10 2 0 4 3 6 6 5-1 4 1 7 4 8Z" fill="#2b2140" stroke="#8a5cf6" stroke-width="1"/><path d="M85 46c9-6 15-16 17-24-4 4-8 4-10 2 0 4-3 6-6 5 1 4-1 7-4 8Z" fill="#2b2140" stroke="#8a5cf6" stroke-width="1"/></g>` },
  santa_hat: { name: 'Santa Hat', season: 'winter', svg: `<g transform="translate(-4 0) rotate(-6 50 20)"><path d="M28 20C30 4 44-6 60-4c10 1 18 10 22 22-6-6-12-9-16-8l3 10Z" fill="#e5383b"/><rect x="24" y="15" width="50" height="10" rx="5" fill="#fff"/><circle cx="83" cy="20" r="6" fill="#fff"/></g>` },
  snow_globe: { name: 'Snowflakes', season: 'winter', svg: `<g class="dk-spin slow">${[0, 60, 120, 180, 240, 300].map((a, i) => `<g transform="rotate(${a} 50 50) translate(50 ${i % 2 ? 8 : 4})"><path d="M0-4V4M-3.5-2 3.5 2M-3.5 2 3.5-2" stroke="#dff6ff" stroke-width="1.4" stroke-linecap="round"/></g>`).join('')}</g><circle cx="50" cy="50" r="41" fill="none" stroke="#bfe9ff" stroke-width="2" opacity=".55"/>` },
  antlers: { name: 'Reindeer Antlers', season: 'winter', svg: `<g fill="none" stroke="#8b5a2b" stroke-width="4" stroke-linecap="round"><path d="M32 18C26 8 24 0 26-8M28 6l-9-4M26-2l-6-6"/><path d="M68 18c6-10 8-18 6-26M72 6l9-4M74-2l6-6"/></g><circle cx="50" cy="96" r="5" fill="#e5383b" class="dk-pulse"/>` },
};
// Seasonal (limited) flair shows in the picker during its event, or once you've picked it up.
const flairShown = (k, v) => !v.season || state.season?.key === v.season || (state.collected || []).includes(k) || state.me?.decoration === k || state.me?.profileEffect === k;
const limitedTag = v => (v.season ? '<span class="ltd-tag">Limited</span>' : '');
function decorationSvg(key) {
  const d = DECORATIONS[key];
  return d ? `<svg class="deco deco-${key}" viewBox="0 0 100 100" aria-hidden="true">${d.svg}</svg>` : '';
}

// ======================= profile effects =======================
const EFFECTS = {
  sparkles: { name: 'Sparkles', n: 14, char: '✦' },
  snow: { name: 'Snowfall', n: 26 },
  hearts: { name: 'Floating Hearts', n: 12, char: '❤' },
  bubbles: { name: 'Bubbles', n: 14 },
  fireflies: { name: 'Fireflies', n: 14 },
  confetti: { name: 'Confetti', n: 26 },
  petals: { name: 'Cherry Petals', n: 16 },
  stars: { name: 'Starry Night', n: 22 },
  rain: { name: 'Rain', n: 30 },
  embers: { name: 'Embers', n: 18 },
  aurora: { name: 'Aurora', n: 3 },
  leaves: { name: 'Falling Leaves', n: 10, char: '🍃' },
  music: { name: 'Music Notes', n: 12, chars: ['♪', '♫', '♬'] },
  pixels: { name: 'Pixels', n: 20 },
  spooky: { name: 'Spooky Night', n: 10, chars: ['🦇', '👻', '🦇', '🎃'], season: 'halloween' },
  blizzard: { name: 'Blizzard', n: 44, season: 'winter' },
};
// Same positions every time (so the card doesn't jump on re-render), spread out by a tiny hash.
const fxRand = (i, salt) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
function profileEffectHtml(key) {
  const fx = EFFECTS[key];
  if (!fx) return '';
  let html = '';
  for (let i = 0; i < fx.n; i++) {
    const x = Math.round(fxRand(i, 1) * 100), d = (fxRand(i, 2) * 6).toFixed(2), t = (4 + fxRand(i, 3) * 5).toFixed(2), s = (0.6 + fxRand(i, 4) * 0.9).toFixed(2), y = Math.round(fxRand(i, 5) * 100);
    const ch = fx.chars ? fx.chars[i % fx.chars.length] : fx.char || '';
    html += `<i style="--x:${x}%;--y:${y}%;--d:-${d}s;--t:${t}s;--s:${s};--h:${Math.round(fxRand(i, 6) * 360)}">${ch}</i>`;
  }
  return `<div class="pfx pfx-${key}" aria-hidden="true">${html}</div>`;
}

// ======================= picking them in Settings › Profiles =======================
function flairProfileFields(d) {
  const me = state.me;
  const decos = [['', 'None', {}], ...Object.entries(DECORATIONS).filter(([k, v]) => flairShown(k, v)).map(([k, v]) => [k, v.name, v])];
  const fxs = [['', 'None', {}], ...Object.entries(EFFECTS).filter(([k, v]) => flairShown(k, v)).map(([k, v]) => [k, v.name, v])];
  return `<div class="field">Avatar Decoration <span class="hint">(shows around your picture everywhere)</span>
      <div class="flair-grid" id="deco-grid">${decos.map(([k, name, v]) => `<button type="button" class="flair-opt${(d.decoration || '') === k ? ' on' : ''}${v.season ? ' ltd' : ''}" data-deco="${k}" title="${esc(name)}">
        ${limitedTag(v)}${k ? avatar({ ...me, avatar: d.avatar, decoration: k }, 44) : `<span class="flair-none">✕</span>`}<small>${esc(name)}</small></button>`).join('')}</div></div>
    <div class="field">Profile Effect <span class="hint">(plays over your profile when people open it)</span>
      <div class="flair-grid fx" id="fx-grid">${fxs.map(([k, name, v]) => `<button type="button" class="flair-opt fx-opt${(d.profileEffect || '') === k ? ' on' : ''}${v.season ? ' ltd' : ''}" data-fx="${k}" title="${esc(name)}">
        ${limitedTag(v)}<span class="fx-swatch">${k ? profileEffectHtml(k) : '<span class="flair-none">✕</span>'}</span><small>${esc(name)}</small></button>`).join('')}</div></div>`;
}
function wireFlairFields(form, d, update) {
  $$('[data-deco]', form).forEach(b => b.addEventListener('click', () => {
    d.decoration = b.dataset.deco || null;
    $$('[data-deco]', form).forEach(x => x.classList.toggle('on', x === b));
    update(); burst(b, 6);
  }));
  $$('[data-fx]', form).forEach(b => b.addEventListener('click', () => {
    d.profileEffect = b.dataset.fx || null;
    $$('[data-fx]', form).forEach(x => x.classList.toggle('on', x === b));
    update();
  }));
}

// ======================= notes & server roles on profile cards =======================
state.extras = { mutes: {}, notes: {}, emailVerified: false, emailReady: false };
async function loadExtras() { try { state.extras = await api('GET', '/api/me/extras'); } catch {} }
function profileExtrasHtml(u) {
  if (!state.me || u.system) return '';
  const self = u.id === state.me.id; // your own profile shows your roles too (0.28), just no note
  let html = '';
  const sv = state.view.type === 'channel' || state.view.type === 'voice' ? currentServer() : null;
  if (sv && (state.serverMembers[sv.id] || []).includes(u.id)) {
    const mine = sv.memberRoles?.[u.id] || [];
    const roles = sv.roles.filter(r => !r.everyone && mine.includes(r.id)); // highest role first, like the server's role list
    const canAdd = hasPerm(sv, 'manage_roles') && (self || !rolesLockedMe(sv, u.id)) && u.id !== sv.ownerId;
    if (roles.length || canAdd) {
      html += `<h4>Roles in ${esc(sv.name)}</h4><div class="mr-chips pc-roles">${roles.map(r => `<span class="role-chip" style="--rc:${esc(r.color || '#9aa6a4')}">${canAdd && !r.managed && canEditRoleMe(sv, r) ? `<button class="rc-x56" data-pc-unrole="${esc(r.id)}" data-uid="${esc(u.id)}" title="Remove ${esc(r.name)}" aria-label="Remove ${esc(r.name)}">✕</button>` : '<i></i>'}${roleIconHtml(r)}${esc(r.name)}</span>`).join('')}
        ${canAdd ? `<button class="role-chip add" data-pc-addrole="${esc(u.id)}" title="Add Roles">+ Add Roles</button>` : ''}</div>`;
    }
    if (sv.nicks?.[u.id]) html += `<div class="muted small pc-nick">Nickname here: <b>${esc(sv.nicks[u.id])}</b></div>`;
  }
  if (!u.bot && !self) html += `<h4>Note <span class="muted small">(only you can see this)</span></h4><textarea class="pc-note" data-note="${esc(u.id)}" maxlength="256" rows="2" placeholder="Click to add a note">${esc(state.extras.notes?.[u.id] || '')}</textarea>`;
  return html;
}
function wireProfileExtras(ov, u) {
  $('[data-pc-addrole]', ov)?.addEventListener('click', e => openRolePicker(currentServer(), u.id, e.currentTarget));
}
document.addEventListener('change', async e => {
  const t = e.target.closest?.('textarea.pc-note');
  if (!t) return;
  try { const { note } = await api('PUT', `/api/users/${t.dataset.note}/note`, { note: t.value }); state.extras.notes ||= {}; if (note) state.extras.notes[t.dataset.note] = note; else delete state.extras.notes[t.dataset.note]; toast('Note saved'); }
  catch (err) { toast(err.message, true); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches?.('textarea.pc-note')) { e.preventDefault(); e.target.blur(); } });

// Staff: a one-hour password reset link for someone who's locked out.
async function openResetLink(u) {
  try {
    const { url } = await api('POST', `/api/mod/users/${u.id}/reset-link`);
    const ov = openLayer(`<div class="dialog modal"><h3>Reset link for ${esc(u.displayName)}</h3>
      <p class="muted" style="margin:0 0 12px">Send this to them privately. It works once, for 1 hour, and logs them out everywhere else.</p>
      <div class="copy-row"><input readonly value="${esc(url)}"><button class="btn btn-primary btn-sm" id="rl-copy">Copy</button></div>
      <div class="actions"><button class="btn btn-primary" data-a="ok">Done</button></div></div>`);
    $('#rl-copy', ov).addEventListener('click', e => { copyText(url, 'Reset link'); e.target.textContent = 'Copied!'; });
    $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  } catch (e) { toast(e.message, true); }
}
