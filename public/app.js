'use strict';
// Zuno client. Plain JavaScript, no build step.
// Sections: helpers → api → state → auth → live events → sidebar → friends → DMs → profiles → settings → boot

// ======================= helpers =======================
// The window's width, remembered. Asking the browser for innerWidth while the page is changing
// makes it measure the whole page first, and some checks run very often. (0.50)
let VW = innerWidth;
addEventListener('resize', () => { VW = innerWidth; }, { passive: true });
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Zuno the mascot, drawn in SVG so it can blink and wiggle. mood: 'happy' | 'sleepy' | 'curious'
function mascot(mood = 'happy', extraClass = '') {
  const eyes = mood === 'sleepy'
    ? '<g class="zm-eyes"><path d="M37 72 q8 7 16 0" stroke="#0d6f66" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M67 72 q8 7 16 0" stroke="#0d6f66" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>'
    : `<g class="zm-eyes"><ellipse cx="45" cy="${mood === 'curious' ? 67 : 70}" rx="8" ry="11" fill="#0d6f66"/><ellipse cx="75" cy="${mood === 'curious' ? 67 : 70}" rx="8" ry="11" fill="#0d6f66"/><ellipse cx="42.5" cy="${mood === 'curious' ? 62 : 65}" rx="3" ry="4" fill="#c8faf3"/><ellipse cx="72.5" cy="${mood === 'curious' ? 62 : 65}" rx="3" ry="4" fill="#c8faf3"/></g>`;
  const lines = mood === 'happy' ? '<g stroke="#7fe3d6" stroke-width="5" stroke-linecap="round" opacity=".8"><path d="M22 34 l-6 -9"/><path d="M12 48 l-10 -3"/><path d="M98 34 l6 -9"/><path d="M108 48 l10 -3"/></g>' : '';
  return `<svg class="zm ${extraClass}" viewBox="0 0 120 100" aria-hidden="true">
    <defs><linearGradient id="zmBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2fdf9"/><stop offset="1" stop-color="#9eefe5"/></linearGradient></defs>
    ${lines}
    <g class="zm-sprout"><path d="M57 35 C48 20 52 7 61 2 C66 14 67 26 62 35Z" fill="#c6f8f1"/><path d="M62 36 C66 23 74 15 85 15 C83 27 75 35 64 38Z" fill="#b2f3ea"/></g>
    <path d="M10 100 C10 60 32 33 60 33 C88 33 110 60 110 100Z" fill="url(#zmBody)"/>
    ${eyes}
    <ellipse cx="20" cy="97" rx="13" ry="8" fill="#d2fbf5"/><ellipse cx="100" cy="97" rx="13" ry="8" fill="#d2fbf5"/>
  </svg>`;
}

const motionOff = () => document.documentElement.classList.contains('reduce-motion'); // (0.38) only Zuno's own switch, so animations play by default

// A little burst of mint sparkles from an element (or a point).
function burst(target, count = 14) {
  if (motionOff() || !target) return;
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : target.x, y = r ? r.top + r.height / 2 : target.y;
  const colors = ['#04c5ae', '#cffbf5', '#7fe3d6', '#f0b232', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.className = 'spark' + (i % 3 === 0 ? ' star' : '');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 26 + Math.random() * 34;
    s.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 10}px;animation-delay:${Math.random() * 60}ms`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

const ICON = {
  friends: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0v1H5v-1Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle fill="currentColor" cx="12" cy="5" r="2"/><circle fill="currentColor" cx="12" cy="12" r="2"/><circle fill="currentColor" cx="12" cy="19" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.2 16.2 4.9 12l-1.4 1.4 5.7 5.7L20.5 7.8l-1.4-1.4z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.4 4.2 12 10.6 5.6 4.2 4.2 5.6l6.4 6.4-6.4 6.4 1.4 1.4 6.4-6.4 6.4 6.4 1.4-1.4-6.4-6.4 6.4-6.4z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 14a8 8 0 0 1-6-2.7c.7-2 3.2-3.3 6-3.3s5.3 1.3 6 3.3A8 8 0 0 1 12 20Z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  minimize: '<svg viewBox="0 0 12 12"><rect fill="currentColor" x="1" y="5.5" width="10" height="1.2" rx=".6"/></svg>',
  maximize: '<svg viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" stroke-width="1.2" x="1.6" y="1.6" width="8.8" height="8.8" rx="2"/></svg>',
  restore: '<svg viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" stroke-width="1.2" x="1.4" y="3.4" width="7.2" height="7.2" rx="1.6"/><path fill="none" stroke="currentColor" stroke-width="1.2" d="M3.6 3.2V2.8a1.4 1.4 0 0 1 1.4-1.4h4.2a1.4 1.4 0 0 1 1.4 1.4V7a1.4 1.4 0 0 1-1.4 1.4h-.4"/></svg>',
  close: '<svg viewBox="0 0 12 12"><path stroke="currentColor" stroke-width="1.3" stroke-linecap="round" d="M2.5 2.5l7 7m0-7l-7 7"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  hangup: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.77 7.46 7 12 7s8.66 1.77 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.47a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>',
  screen: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h16V6zm8 1.5 3.5 3.5H13v3h-2v-3H8.5z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
  micOff: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 11h-2a5 5 0 0 1-.6 2.4l1.5 1.5A7 7 0 0 0 19 11zm-4 .2V5a3 3 0 0 0-5.9-.8zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.5 2.6l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a6.9 6.9 0 0 0 3.6-1.5L19.7 21 21 19.7z"/></svg>',
  headphones: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5a7 7 0 0 1 14 0h-2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>',
  deafen: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.3 2 2 3.3l3 3A8.9 8.9 0 0 0 3 12v7a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5a7 7 0 0 1 1.4-4.3L17 18.4V20a1 1 0 0 0 1 1h1.4l1.3 1.3L22 21zM12 5a7 7 0 0 1 7 7h-2a1 1 0 0 0-.8.4l4.5 4.5A2 2 0 0 0 21 16v-4a9 9 0 0 0-13.4-7.9L9 5.6A7 7 0 0 1 12 5z"/></svg>',
  smile: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5a5.5 5.5 0 0 0 5.1-3.5H6.9a5.5 5.5 0 0 0 5.1 3.5z"/></svg>',
  hash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 3h2l-.7 4h4l.7-4h2l-.7 4H21v2h-3.6l-.7 4H20v2h-3.6l-.7 4h-2l.7-4h-4l-.7 4h-2l.7-4H5v-2h3.6l.7-4H6V7h3.6zm1 6-.7 4h4l.7-4z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
  members: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19a6 6 0 0 1 12 0v1H2zm13.5 1v-1a7.5 7.5 0 0 0-1.8-4.9A5 5 0 0 1 22 18v2z"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM8.5 20a4.5 4.5 0 0 1-3.2-7.7l2.5-2.5 1.4 1.4-2.5 2.5a2.5 2.5 0 1 0 3.5 3.5l2.5-2.5 1.4 1.4-2.5 2.5a4.5 4.5 0 0 1-3.1 1.4zm7.7-6.4-1.4-1.4 2.5-2.5a2.5 2.5 0 1 0-3.5-3.5l-2.5 2.5-1.4-1.4 2.5-2.5a4.5 4.5 0 0 1 6.4 6.4z"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 8V4l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM8 13h8v2H8zm0 4h8v2H8z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM4 18h16v2H4z"/></svg>',
  bug: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14.6 3.9 16.4 2l1.1 1.1-1.9 1.9A5 5 0 0 1 17 8h2v2h-2v2h2v2h-2v1a5 5 0 0 1-10 0v-1H5v-2h2v-2H5V8h2a5 5 0 0 1 1.4-3L6.5 3.1 7.6 2l1.8 1.9a5 5 0 0 1 5.2 0zM11 10v8h2v-8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>',
};

const STATUS_LABEL = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
const AVATAR_COLORS = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#9b59b6', '#1abc9c', '#e67e22'];
function colorFor(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

function avatar(u, size = 32, status = false) {
  if (!u) return '';
  const letter = esc((u.displayName || u.username || '?').trim()[0]?.toUpperCase() || '?');
  const inner = u.avatar ? `<img src="${esc(u.avatar)}" alt="" decoding="async" loading="lazy">` : letter;
  const bg = u.avatar ? 'transparent' : colorFor(u.id);
  const dot = status ? `<i class="status-dot s-${esc(u.status || 'offline')}"></i>` : '';
  const deco = u.decoration && size >= 20 && typeof decorationSvg === 'function' ? decorationSvg(u.decoration) : '';
  return `<div class="avatar${deco ? ' has-deco' : ''}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${bg}">${inner}${deco}${dot}</div>`;
}

function maskEmail(email) {
  if (!email) return 'No email on file';
  const [name, domain] = email.split('@');
  return '*'.repeat(Math.max(4, name.length)) + '@' + domain;
}

// The little check badge shown next to the official Zuno account.
function officialTag(u) {
  return u?.system ? `<span class="official" title="Official Zuno account"><svg viewBox="0 0 16 16" width="10" height="10"><path fill="currentColor" d="M6.4 11.6 2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8z"/></svg>Official</span>` : '';
}

// ---- profile badges ----
const BADGE_INFO = {
  staff: {
    label: 'Zuno Staff', desc: 'Part of the team that makes Zuno',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgStaff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fe3cd"/><stop offset="1" stop-color="#079c8a"/></linearGradient></defs>
      <path d="M12 1.6 20.6 5v6.3c0 5.3-3.6 9.5-8.6 11.1-5-1.6-8.6-5.8-8.6-11.1V5z" fill="url(#bgStaff)"/>
      <path d="M6.4 17.2c0-3.6 2.5-6.2 5.6-6.2s5.6 2.6 5.6 6.2z" fill="#e2fdf9"/>
      <path d="M11.4 11.2c-.8-1.4-.5-2.7.4-3.3.5 1.2.5 2.3.2 3.3zm.9.1c.4-1.3 1.3-2 2.4-2-.2 1.1-1 1.8-2.4 2z" fill="#e2fdf9"/>
      <ellipse cx="10.2" cy="14.4" rx=".9" ry="1.25" fill="#0d6f66"/><ellipse cx="13.8" cy="14.4" rx=".9" ry="1.25" fill="#0d6f66"/></svg>`,
  },
  og: {
    label: 'OG Supporter', desc: 'Joined Zuno in its early days',
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bgOg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f0a21b"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#bgOg)"/><circle cx="12" cy="12" r="8.2" fill="none" stroke="#fff4cc" stroke-width="1" opacity=".7"/>
      <path d="M12 18.5v-6" stroke="#5a3b00" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M12 12.6c-3.6.2-5.3-1.7-5.4-4.6 3.2 0 5.2 1.6 5.4 4.6z" fill="#2f9e5b"/><path d="M12 11.4c.2-3.2 2.2-5 5.6-4.9-.1 3.1-2 4.9-5.6 4.9z" fill="#3ec46f"/></svg>`,
  },
};
function badgeRow(u) {
  const list = (u.badges || []).filter(b => BADGE_INFO[b]);
  if (!list.length) return '';
  // The server sends badges most valuable first; only the first 6 show, in one row, and "+N"
  // opens a window with all of them.
  const SHOW = 6, extra = list.length > SHOW ? list.length - SHOW : 0;
  return `<div class="pc-badges"${extra ? ' data-tray="1"' : ''}>${list.map((b, i) => `<span class="pbadge${i >= SHOW ? ' tray-more' : ''}" tabindex="0" data-badge="${b}" aria-label="${BADGE_INFO[b].label}">${BADGE_INFO[b].svg}
    <span class="pbadge-tip"><b>${BADGE_INFO[b].label}</b>${BADGE_INFO[b].desc}</span></span>`).join('')}${extra ? `<button type="button" class="tray38" title="Show all badges">+${extra}</button>` : ''}</div>`;
}

function botTag(u) { return u?.webhook ? '<span class="official bot-tag" title="Posted by a webhook">Webhook</span>' : u?.bot ? '<span class="official bot-tag" title="A bot account">Bot</span>' : ''; }
// Does this message ping me? (@me, @everyone, @here, or a role I have)
function msgMentionsMe(m, serverId = state.currentServerId) {
  if ((m.mentions || []).includes(state.me.id)) return true;
  if (m.authorId === state.me.id) return false;
  if (m.mentionEveryone || m.mentionHere) return true;
  const sv = state.servers.find(s => s.id === serverId);
  return !!(m.mentionRoles || []).length && (m.mentionRoles || []).some(r => (sv?.memberRoles?.[state.me.id] || []).includes(r));
}
// The color of someone's highest colored role in the server you're looking at.
function topRole(uid, sv = (typeof currentServer === 'function' ? currentServer() : null), pick = r => r.color) {
  if (!sv || !sv.roles || state.view.type === 'dm') return null;
  const mine = sv.memberRoles?.[uid] || [];
  return sv.roles.find(r => !r.everyone && mine.includes(r.id) && pick(r)) || null;
}
const roleColorFor = uid => topRole(uid)?.color || null;
const roleIconHtml = r => (r.iconUrl ? `<img class="role-icon img" src="${esc(r.iconUrl)}" alt="" title="${esc(r.name)}">` : r.icon ? `<span class="role-icon" title="${esc(r.name)}">${esc(r.icon)}</span>` : '');
const roleIconFor = uid => { const r = topRole(uid, undefined, r => r.icon || r.iconUrl); return r ? roleIconHtml(r) : ''; };
// A role's color as CSS: one color, or a gradient across the name.
// Only real colors (#rrggbb) ever reach a style attribute.
const safeColor = c => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null);
const roleCss = r => (!safeColor(r?.color) ? '' : safeColor(r.color2) ? `background:linear-gradient(90deg,${r.color},${r.color2});-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${r.color}`);
// How a name looks in the current server: Bloom name color first, then the highest colored role.
function nameStyle(u) {
  if (safeColor(u?.nameColor)) return ` style="color:${esc(u.nameColor)}"`;
  const css = roleCss(topRole(u?.id));
  return css ? ` style="${esc(css)}"` : '';
}
// Server nicknames win over display names inside that server.
function nameIn(u, sv = state.view.type === 'channel' && typeof currentServer === 'function' ? currentServer() : null) {
  return (u && sv?.nicks?.[u.id]) || u?.displayName || 'Unknown';
}

function statusLine(u) { return u.customStatus ? `${u.customStatusEmoji ? u.customStatusEmoji + ' ' : ''}${u.customStatus}` : STATUS_LABEL[u.status] || 'Offline'; }

function fmtTime(ts) {
  const d = new Date(ts);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= today) return `Today at ${t}`;
  if (ts >= today - 864e5) return `Yesterday at ${t}`;
  return `${d.toLocaleDateString()} ${t}`;
}
const fmtShort = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const fmtDay = ts => DAY_FORMAT.format(ts);

// Light markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`, ```blocks```, links.
// "@everyone" and "@here" only look like a ping when they really pinged people (the sender needs
// permission for that); otherwise they're plain text, so nobody thinks everyone was pinged.
const pingPills = (html, m) => html
  .replace(/<span class="mention everyone">@everyone<\/span>/g, m.mentionEveryone ? '$&' : '@everyone')
  .replace(/<span class="mention everyone">@here<\/span>/g, m.mentionHere ? '$&' : '@here');
function formatMessage(text) {
  const blocks = [], links = [];
  let s = esc(text).replace(/```(?:(\w*)\n)?([\s\S]+?)```/g, (_, lang, code) => { blocks.push({ lang: lang || '', code }); return `\u0000${blocks.length - 1}\u0000`; });
  // [text](https://link) — kept aside so the plain-link step doesn't touch it.
  s = s.replace(/\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)<]+)\)/g, (_, label, url) => { links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" title="${url}">${label}</a>`); return `\u0001${links.length - 1}\u0001`; });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\bzuno\.invite\/([A-Za-z0-9_-]{3,32})\b/g, '<a href="#" class="invite-link" data-invite="$1">zuno.invite/$1</a>')
    .replace(/\|\|([^|\n]+)\|\|/g, '<span class="spoiler" tabindex="0" title="Spoiler: click to show">$1</span>')
    .replace(/(^|[\s(])@([a-z0-9_.]{2,32})\b/gi, (all, pre, name) => {
      const u = Object.values(state.users).find(x => x.username === name.toLowerCase());
      if (!u) window.lookupMention?.(name.toLowerCase()); // (0.39) fetched, then shown by display name
      return u ? `${pre}<span class="mention${u.id === state.me?.id ? ' me' : ''}" data-profile="${esc(u.id)}">@${esc(u.displayName)}</span>` : all;
    })
    .replace(/(^|[\s(])@(everyone|here)\b/g, '$1<span class="mention everyone">@$2</span>')
    .replace(/&lt;t:(\d{1,13})(?::([tTdDfFR]))?&gt;/g, (_, t, f) => fmtStamp(Number(t) * 1000, f || 'f'))
    .replace(/&lt;#([A-Za-z0-9_-]{4,40})&gt;/g, (all, id) => { const ch = (typeof currentServer === 'function' ? currentServer() : null)?.channels.find(c => c.id === id); return ch ? `<span class="mention channel" data-goto-ch="${esc(id)}">#${esc(ch.name)}</span>` : '#unknown-channel'; });
  // @Role mentions, in the role's color.
  const sv = state.view.type === 'channel' && typeof currentServer === 'function' ? currentServer() : null;
  for (const r of [...(sv?.roles || [])].filter(r => !r.everyone).sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp('(^|[\\s(])@' + esc(r.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'gi');
    s = s.replace(re, `$1<span class="mention role" style="--rc:${esc(r.color || '#9aa6a4')}">@${esc(r.name)}</span>`);
  }
  // Line starts: "> " quote, "# " headings, "-# " small text, "- " / "1. " lists.
  const parts = s.split('\n').map(line => {
    if (line.startsWith('&gt; ')) return { q: true, html: line.slice(5) };
    let m;
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) return { block: true, html: `<div class="md-h md-h${m[1].length}">${m[2]}</div>` };
    if ((m = /^-# (.+)$/.exec(line))) return { block: true, html: `<div class="md-sub">${m[1]}</div>` };
    if ((m = /^\s*[-*] (.+)$/.exec(line))) return { block: true, html: `<div class="md-li">${m[1]}</div>` };
    if ((m = /^\s*(\d{1,3})\. (.+)$/.exec(line))) return { block: true, html: `<div class="md-li num" data-n="${m[1]}.">${m[2]}</div>` };
    return { html: line };
  });
  let out = '';
  parts.forEach((p, i) => {
    const prev = parts[i - 1];
    if (p.q) { out += prev?.q ? `<br>${p.html}` : `<blockquote>${p.html}`; if (!parts[i + 1]?.q) out += '</blockquote>'; return; }
    if (i > 0 && !p.block && !prev.block && !prev.q) out += '<br>';
    out += p.html;
  });
  return out.replace(/\u0001(\d+)\u0001/g, (_, i) => links[i]).replace(/\u0000(\d+)\u0000/g, (_, i) => codeBlockHtml(blocks[i]));
}
// <t:1700000000:R> timestamps, shown in each person's own time zone.
function fmtStamp(ms, f) {
  const d = new Date(ms);
  if (isNaN(d)) return '';
  const opts = { t: { timeStyle: 'short' }, T: { timeStyle: 'medium' }, d: { dateStyle: 'short' }, D: { dateStyle: 'long' }, f: { dateStyle: 'long', timeStyle: 'short' }, F: { dateStyle: 'full', timeStyle: 'short' } };
  let text;
  if (f === 'R') {
    const diff = (ms - Date.now()) / 1000, abs = Math.abs(diff);
    const [n, unit] = abs < 60 ? [diff, 'second'] : abs < 3600 ? [diff / 60, 'minute'] : abs < 86400 ? [diff / 3600, 'hour'] : abs < 2592000 ? [diff / 86400, 'day'] : abs < 31536000 ? [diff / 2592000, 'month'] : [diff / 31536000, 'year'];
    text = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(n), unit);
  } else text = new Intl.DateTimeFormat(undefined, opts[f] || opts.f).format(d);
  return `<span class="md-ts" title="${esc(new Intl.DateTimeFormat(undefined, opts.F).format(d))}">${esc(text)}</span>`;
}

let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.innerHTML = (isErr ? '' : mascot('happy')) + `<span>${esc(msg)}</span>`;
  el.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ======================= api =======================
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.me) signOutLocal();
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

// ======================= state =======================
const state = {
  token: localStorage.getItem('zuno_token'),
  me: null,
  users: {},            // id -> public user (single source of truth for names/avatars/status)
  friends: [],          // user ids
  requests: [],         // { id, direction, userId, createdAt }
  dms: [],              // { userId, lastMessageAt, unread }
  view: { type: 'friends', tab: 'online' },
  convos: {},           // conversation id -> { messages, hasMore, loaded }
  drafts: {},           // conversation id -> unsent text
  typing: {},           // conversation id -> { userId: expires at }
  servers: [],          // servers you're in (from /api/me)
  groups: [],           // group DMs you're in
  currentServerId: null,
  serverMembers: {},    // serverId -> [userIds]
  showMembers: true,
  showProfilePanel: true,
  friendFilter: '',
  es: null,
};

const user = id => state.users[id];
const isFriend = id => state.friends.includes(id);
function relationshipWith(id) {
  if (id === state.me?.id) return 'self';
  if (user(id)?.system) return 'system';
  if (isFriend(id)) return 'friend';
  const r = state.requests.find(r => r.userId === id);
  return r ? r.direction : 'none';
}

async function loadState() {
  const d = await api('GET', '/api/me');
  state.me = d.me;
  applyPrefs();
  for (const u of [...d.friends, ...d.requests.map(r => r.user), ...d.dms.map(x => x.user)]) state.users[u.id] = u;
  state.users[d.me.id] = d.me;
  state.friends = d.friends.map(u => u.id);
  state.requests = d.requests.map(r => ({ id: r.id, direction: r.direction, userId: r.user.id, createdAt: r.createdAt }));
  // Keep conversations opened locally that have no messages yet.
  const local = state.dms.filter(x => x.local && !d.dms.some(y => y.user.id === x.userId));
  state.dms = [...d.dms.map(x => ({ userId: x.user.id, lastMessageAt: x.lastMessageAt, last: x.last || null, unread: x.unread, pending: !!x.pending })), ...local];
  state.servers = d.servers || [];
  state.groups = d.groups || [];
  for (const g of state.groups) for (const u of g.members) state.users[u.id] = { ...state.users[u.id], ...u };
  state.messageRequests = d.messageRequests || [];
  // 0.15: seasonal events, close friends, and how you've arranged DMs and servers.
  Object.assign(state, { season: d.season || null, collected: d.collected || [], closeFriends: d.closeFriends || [], closeStatuses: d.closeStatuses || {}, myCfStatus: d.myCfStatus || null, dmLayout: d.dmLayout || { pinned: [], cats: [] }, railLayout: d.railLayout || [],
    // 0.16
    statusPresets: d.statusPresets || [], serverDrafts: d.drafts || {}, scheduled: d.scheduled || [], notifSound: d.notifSound || null, notifUnread: d.notifUnread || 0, serverBlooms: d.serverBlooms || { total: 0, used: [] }, passkeys: d.passkeys || [], favEmojis: d.favEmojis || [] });
  for (const r of state.messageRequests) state.users[r.user.id] = { ...state.users[r.user.id], ...r.user };
  state.dms = state.dms.filter(x => !state.messageRequests.some(r => r.user.id === x.userId && x.local));
  const active = activePeer();
  if (active) { const e = state.dms.find(x => x.userId === active); if (e) e.unread = 0; }
  if (state.view.type === 'channel') { const ch = currentChannel(); if (ch) ch.unread = 0; }
  if (state.view.type === 'group') { const g = state.groups.find(x => x.id === state.view.groupId); if (g) g.unread = 0; }
}

const activePeer = () => (state.view.type === 'dm' ? state.view.peerId : null);

// ======================= auth =======================
// Cloudflare Turnstile on the sign-up form, when the server has its keys (GET /api/public-config).
let turnstileSiteKey = null, turnstileWidgetId = null, turnstileScriptLoading = false, turnstileScriptReady = false;
async function loadTurnstileConfig() {
  try {
    const cfg = await api('GET', '/api/public-config');
    turnstileSiteKey = cfg.turnstileEnabled ? cfg.turnstileSiteKey : null;
    if (turnstileSiteKey) loadTurnstileScript();
    syncTurnstileWidget();
  } catch {}
}
function loadTurnstileScript() {
  if (window.turnstile) { turnstileScriptReady = true; syncTurnstileWidget(); return; }
  if (turnstileScriptLoading) return;
  turnstileScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true; script.defer = true;
  script.onload = () => { turnstileScriptReady = true; syncTurnstileWidget(); };
  script.onerror = () => { turnstileScriptLoading = false; const help = $('#turnstile-help'); if (help) help.textContent = 'Security verification could not load. Check your connection and try again.'; };
  document.head.appendChild(script);
}
function syncTurnstileWidget() {
  const wrap = $('#turnstile-wrap');
  const register = $('#auth')?.classList.contains('register');
  if (!wrap) return;
  // Only shown when sign-ups need it.
  wrap.style.display = register && turnstileSiteKey ? '' : 'none';
  const help = $('#turnstile-help');
  if (help && register && turnstileSiteKey && !help.textContent) help.textContent = 'Complete the security check to create your account.';
  if (!register || !turnstileSiteKey || !turnstileScriptReady || !window.turnstile) return;
  if (turnstileWidgetId !== null) { try { window.turnstile.reset(turnstileWidgetId); } catch {} return; }
  turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
    sitekey: turnstileSiteKey, action: 'register', theme: 'auto',
    callback: () => { const help = $('#turnstile-help'); if (help) help.textContent = 'Security check complete.'; },
    'expired-callback': () => { const help = $('#turnstile-help'); if (help) help.textContent = 'Security check expired. Please complete it again.'; },
    'error-callback': () => { const help = $('#turnstile-help'); if (help) help.textContent = 'Security check failed to load. Please try again.'; },
  });
}
loadTurnstileConfig();

function showAuth() {
  setWhere('');
  $('#auth-mascot').innerHTML = mascot('happy', 'zm-wiggle');
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  // zuno…/signup opens straight to Create an account.
  setAuthMode(/^\/(signup|register)\/?$/i.test(location.pathname) || /^#(signup|register)$/i.test(location.hash));
}
function setAuthMode(register) {
  const auth = $('#auth');
  auth.classList.toggle('register', register);
  $('#auth-title').textContent = register ? 'Create an account' : 'Welcome back!';
  $('#auth-sub').textContent = register ? 'Pick a username your friends can find you by.' : "We're so excited to see you again!";
  $('#auth-submit').textContent = register ? 'Continue' : 'Log In';
  $('#auth-switch-text').textContent = register ? 'Already have an account?' : 'Need an account?';
  $('#auth-switch').textContent = register ? 'Log In' : 'Register';
  $('#auth-switch').href = register ? '/' : '/signup'; // works even before the app's scripts run
  $('#auth-form [name=password]').autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-form [name=email]').required = register;
  $('#login-label').textContent = register ? 'Username' : 'Email or Username';
  $('#auth-form [name=username]').maxLength = register ? 32 : 254;
  $('#auth-error').textContent = '';
  syncTurnstileWidget();
}
if (window.zunoDesktop) {
  const link = $('#auth-server');
  link.classList.remove('hidden');
  link.addEventListener('click', e => { e.preventDefault(); window.zunoDesktop.openServerSettings(); });
}
$('#auth-switch').addEventListener('click', e => { e.preventDefault(); setAuthMode(!$('#auth').classList.contains('register')); });
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const register = $('#auth').classList.contains('register');
  const body = register
    ? { email: form.email.value, username: form.username.value, displayName: form.displayName.value, password: form.password.value, turnstileToken: form.querySelector('[name="cf-turnstile-response"]')?.value || '' }
    : { login: form.username.value, password: form.password.value };
  const btn = $('#auth-submit');
  // Quick feedback only; the server (server/namefilter.js) is what actually enforces this.
  if (register && /\x64is(cord|band)/i.test(body.username)) {
    $('#auth-error').textContent = "That name isn't allowed on Zuno. Please pick something else.";
    return;
  }
  btn.disabled = true;
  try {
    if (register && turnstileSiteKey && !body.turnstileToken) throw new Error('Please complete the bot verification first.');
    let r = await api('POST', register ? '/api/register' : '/api/login', body);
    if (r.mfa) r = await askTwoFactor(r.ticket); // two-factor login: one more step
    if (!r?.token) return;
    const { token } = r;
    state.token = token;
    localStorage.setItem('zuno_token', token);
    form.reset();
    await start();
  } catch (err) {
    $('#auth-error').textContent = err.message;
    if (register && turnstileWidgetId !== null && window.turnstile) { try { window.turnstile.reset(turnstileWidgetId); } catch {} }
  } finally {
    btn.disabled = false;
  }
});

async function signOut() {
  try { await api('POST', '/api/logout'); } catch {}
  signOutLocal();
}
function signOutLocal() {
  state.es?.close();
  localStorage.removeItem('zuno_token');
  Calls.hangup({ quiet: true });
  Object.assign(state, { token: null, me: null, users: {}, friends: [], requests: [], dms: [], convos: {}, drafts: {}, servers: [], currentServerId: null, serverMembers: {}, view: { type: 'friends', tab: 'online' } });
  closeLayer();
  showAuth();
}

// ======================= live events =======================
// The live connection. The browser swaps its login token for a short, one-use ticket and connects
// with that, so the token never goes in a URL (see /api/events/ticket). LiveStream looks like an
// EventSource to the rest of Zuno: listeners can be added straight away, they carry over to every
// reconnect, and dropped connections come back by themselves with a fresh ticket.
class LiveStream {
  constructor(token) { this.token = token; this.listeners = new Map(); this.es = null; this.readyState = 0; this.closed = false; this.open(); }
  async open() {
    if (this.closed) return;
    let ticket;
    try { ({ ticket } = await api('POST', '/api/events/ticket')); }
    catch (e) {
      // Signed out: stop. Anything else (offline, restarting): try again soon.
      if (/not signed in/i.test(e.message || '') || state.token !== this.token) return this.close();
      return this.retry(5000);
    }
    if (this.closed || state.token !== this.token) return;
    const es = this.es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}${this.lastId ? `&last=${encodeURIComponent(this.lastId)}` : ''}`);
    for (const type of this.listeners.keys()) this.attach(es, type);
    es.addEventListener('open', () => { this.readyState = 1; });
    es.addEventListener('error', () => {
      if (this.es !== es) return;
      es.close(); // its own retry would reuse the spent ticket
      this.readyState = 0;
      this.retry(2000);
    });
  }
  retry(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.open(), ms); }
  attach(es, type) { es.addEventListener(type, e => { if (e.lastEventId) this.lastId = e.lastEventId; for (const fn of [...(this.listeners.get(type) || [])]) { try { fn(e); } catch (err) { console.error(err); } } }); }
  addEventListener(type, fn) {
    let set = this.listeners.get(type);
    if (!set) { this.listeners.set(type, (set = new Set())); if (this.es) this.attach(this.es, type); }
    set.add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  close() { this.closed = true; clearTimeout(this.timer); this.es?.close(); this.es = null; this.readyState = 2; }
}
function connect() {
  state.es?.close();
  const es = new LiveStream(state.token);
  state.es = es;
  let opened = false;
  // Catch up after a reconnect: (0.45) the server replays what was missed and says "resumed"; if it
  // can't (it restarted, or too much happened), it says "resync" and everything reloads as before.
  let waitResume = 0;
  es.addEventListener('open', () => {
    if (opened) { checkServerVersion(); clearTimeout(waitResume); waitResume = setTimeout(() => refresh(), es.lastId ? 4000 : 0); }
    opened = true;
  });
  es.addEventListener('resumed', () => clearTimeout(waitResume));
  es.addEventListener('resync', () => { clearTimeout(waitResume); refresh(); });
  es.addEventListener('user', e => onUser(JSON.parse(e.data)));
  es.addEventListener('inbox', e => onInbox(JSON.parse(e.data)));
  es.addEventListener('me', e => { onMe(JSON.parse(e.data)); renderSuspendBanner(); });
  es.addEventListener('reports', () => { if ($('.settings-nav [data-s="moderation"].active')) renderModeration($('#settings-body')); else if ($('.settings-nav [data-s="employee"].active')) renderEmployeeDashboard($('#settings-body')); else api('GET', '/api/mod/reports?status=open').then(r => setModBadge(r.counts.open)).catch(() => {}); });
  es.addEventListener('bugs', () => { const b = $('.settings-nav [data-s="buginbox"].active'); if (b) renderBugInbox($('#settings-body'), $('.bug-filter .on')?.dataset.filter || 'new'); });
  es.addEventListener('refresh', e => refresh(JSON.parse(e.data || '{}')));
  es.addEventListener('message', e => onMessage(JSON.parse(e.data)));
  es.addEventListener('typing', e => onTyping(JSON.parse(e.data)));
  es.addEventListener('message-update', e => {
    const { conv, message } = JSON.parse(e.data);
    const m = state.convos[conv]?.messages.find(x => x.id === message.id);
    if (m) { Object.assign(m, message); if (activeConv() === conv && state.editing?.id !== m.id) renderMessagesSoon(); }
  });
  es.addEventListener('message-delete', e => {
    const { conv, id } = JSON.parse(e.data);
    const row = activeConv() === conv && $(`.msg[data-id="${CSS.escape(id)}"]`);
    if (row && !row.classList.contains('removing')) { row.classList.add('removing'); setTimeout(() => removeMessage(conv, id), 180); }
    else if (!row) removeMessage(conv, id);
  });
  es.addEventListener('voice-state', e => onVoiceState(JSON.parse(e.data)));
  for (const ev of ['call-ring', 'call-ended', 'call-declined', 'rtc-peer-joined', 'rtc-peer-left', 'rtc-signal', 'rtc-state', 'rtc-relay']) {
    es.addEventListener(ev, e => Calls.onEvent(ev, JSON.parse(e.data)));
  }
  // Reconnecting (with a new ticket) is handled inside LiveStream.
}

async function refresh(info = {}) {
  try { await loadState(); } catch { return; }
  // Kicked, left, or the server was deleted while you were looking at it.
  if (state.currentServerId && !currentServer()) {
    if (info.removed) toast('You are no longer in that server.', true);
    return showFriends('online');
  }
  if (info.serverId && state.serverMembers[info.serverId]) { if (svById(info.serverId)) await loadServerMembers(info.serverId); else delete state.serverMembers[info.serverId]; } // (0.47) not for a server you just left
  renderRail();
  renderSidebar();
  renderUserPanel();
  if (state.view.type === 'friends') renderFriendsBody();
  else if (state.view.type === 'channel' && !currentChannel()) openServer(state.currentServerId);
  else if (state.view.type === 'voice') renderVoiceStage();
  else { renderDMHeader(); renderComposer(); renderProfilePanel(); }
}

function onUser(u) {
  state.users[u.id] = { ...state.users[u.id], ...u };
  if (u.id === state.me?.id) { state.me = { ...state.me, ...u }; renderUserPanel(); }
  if (state.currentServerId) renderServerSidebar(); else renderDMList();
  if (state.view.type === 'friends') renderFriendsBody();
  else if (state.view.type === 'channel') { renderMemberList(); renderMessages(); }
  else if (state.view.type === 'voice') renderVoiceStage();
  else if (u.id === activePeer() || u.id === state.me.id) { renderDMHeader(); renderProfilePanel(); renderMessages(); }
}

function onMessage(payload) {
  const { message, author } = payload;
  const conv = payload.conv || payload.peerId;
  if (author) state.users[author.id] = { ...state.users[author.id], ...author };
  if (isChannelConv(conv)) return onChannelMessage(conv, payload);
  if (isGroupConv(conv)) return onGroupMessage(conv, payload);
  const peerId = conv;
  const convo = state.convos[peerId];
  if (convo?.loaded) {
    if (!convo.messages.some(m => m.id === message.id)) {
      const pending = message.authorId === state.me.id && convo.messages.find(m => m.pending && m.content === message.content);
      if (pending) Object.assign(pending, message, { pending: false });
      else convo.messages.push(message);
    }
  }
  let entry = state.dms.find(x => x.userId === peerId);
  if (!entry) { entry = { userId: peerId, lastMessageAt: 0, unread: 0 }; state.dms.push(entry); }
  entry.lastMessageAt = message.createdAt;
  if (typeof messagePreview48 === 'function') entry.last = messagePreview48(message);
  entry.local = false;
  const viewing = activePeer() === peerId && !document.hidden;
  if (message.authorId !== state.me.id) {
    if (state.typing[peerId]) delete state.typing[peerId][message.authorId];
    if (viewing) api('POST', `/api/dms/${peerId}/read`).catch(() => {});
    else entry.unread++;
    notify(peerId, message);
  }
  state.dms.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  renderDMList();
  if (activePeer() === peerId) { renderMessagesSoon(); renderTyping(); }
}

// A soft two-note "pop" for new messages, made on the fly (no sound file needed).
let audioCtx = null;
function playPing() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([freq, at]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.18, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + at); o.stop(t + at + 0.25);
    });
  } catch {}
}

// (0.38) Code blocks: the language on top, a Copy button, and line numbers on longer ones.
function codeBlockHtml({ lang, code }) {
  const lines = code.replace(/\n$/, '').split('\n');
  const numbered = lines.length > 4;
  const body = numbered ? lines.map(l => `<span class="cl">${l || ' '}</span>`).join('\n') : lines.join('\n');
  return `<div class="code38"><div class="code38-top"><span>${esc(lang) || 'code'}</span><button type="button" class="code38-copy" data-copy-code>Copy</button></div><pre${numbered ? ' class="numbered"' : ''}><code>${body}</code></pre></div>`;
}
// Desktop notification for a new message when Zuno isn't in front (skipped on Do Not Disturb).
function notify(peerId, message) {
  if (state.me.statusPref === 'dnd' || message.call) return; // calls ring on their own
  if (!document.hidden && activePeer() === peerId) return; // you're looking at their DM: no sound, no pop-up
  if (prefs().notificationSound) playPing();
  if (!('Notification' in window) || !prefs().desktopNotifications) return;
  const send = () => {
    const u = user(peerId);
    const n = new Notification(u?.displayName || 'New message', { body: (message.content || (message.attachments?.length ? 'Sent a file' : message.sticker ? 'Sent a sticker' : 'Sent a message')).slice(0, 200), icon: u?.avatar || '/logo.png', silent: false });
    n.onclick = () => { window.zunoDesktop?.focus(); window.focus(); openDM(peerId); n.close(); setTimeout(() => $('#composer-input')?.focus(), 500); };
  };
  if (Notification.permission === 'granted') send();
  else if (Notification.permission === 'default') Notification.requestPermission().then(p => p === 'granted' && send());
}

// Messages in server channels: add them if open, otherwise count them as unread.
function onChannelMessage(conv, { message, serverId, channelId }) {
  const convo = state.convos[conv];
  if (convo?.loaded && !convo.messages.some(m => m.id === message.id)) {
    const pending = message.authorId === state.me.id && convo.messages.find(m => m.pending && m.content === message.content);
    if (pending) Object.assign(pending, message, { pending: false });
    else convo.messages.push(message);
  }
  if (message.authorId !== state.me.id) {
    if (state.typing[conv]) delete state.typing[conv][message.authorId];
    if (msgMentionsMe(message, serverId) || message.replyTo?.authorId === state.me.id) notifyMention(conv, serverId, channelId, message);
    const viewing = activeConv() === conv && !document.hidden;
    if (viewing) api('POST', `${convBase(conv)}/read`).catch(() => {});
    else {
      const ch = state.servers.find(sv => sv.id === serverId)?.channels.find(c => c.id === channelId);
      if (ch) ch.unread = (ch.unread || 0) + 1;
      renderRail();
      if (state.currentServerId === serverId) renderServerSidebar();
    }
  }
  if (activeConv() === conv) { renderMessagesSoon(); renderTyping(); }
}

function onTyping({ conv, from }) {
  if (!prefs().showTyping) return;
  conv ||= from;
  (state.typing[conv] ||= {})[from] = Date.now() + 6000;
  if (activeConv() === conv) renderTyping();
  setTimeout(() => activeConv() === conv && renderTyping(), 6100);
}

document.addEventListener('visibilitychange', () => {
  const conv = activeConv();
  if (!document.hidden && conv) markRead(conv);
});
function markRead(conv) {
  if (isChannelConv(conv)) {
    // (0.39) The channel named, wherever it is (it used to only clear the one you had open, so
    // "Mark As Read" on a server left its dot on).
    const id = conv.slice(3);
    const ch = state.servers.flatMap(sv => sv.channels).find(c => c.id === id) || currentChannel();
    if (ch?.unread || ch?.mentions) { ch.unread = 0; if (ch.mentions) ch.mentions = 0; renderServerSidebar(); renderRail(); }
  } else if (isGroupConv(conv)) {
    const g = state.groups.find(x => 'g:' + x.id === conv);
    if (g?.unread) { g.unread = 0; renderDMList(); }
  } else {
    const e = state.dms.find(x => x.userId === conv);
    if (e?.unread) { e.unread = 0; renderDMList(); }
  }
  api('POST', `${convBase(conv)}/read`).catch(() => {});
}

// ======================= sidebar =======================
// The left column shows your DMs at home, or the channel list inside a server.
function renderSidebar() {
  if (state.currentServerId) return renderServerSidebar();
  const side = $('#sidebar');
  if (side.dataset.mode !== 'home') {
    side.dataset.mode = 'home';
    $('#sidebar-top').innerHTML = '<button class="search-btn" id="find-btn">Find or start a conversation</button>';
    $('#sidebar-scroll').innerHTML = `
      <button class="nav-item" id="nav-friends">${ICON.friends} Friends <span class="badge hidden" id="friends-badge"></span></button>
      <button class="nav-item" id="nav-requests">${ICON.chat} Message Requests <span class="badge hidden" id="requests-badge"></span></button>
      <button class="nav-item nav-bloom-side" id="nav-bloom"><img src="/badges/bloom-new.png" alt="">Zuno Bloom</button>
      <div class="section-label dm-label"><span>Direct Messages</span><button class="sec-add" id="dm-new" title="Find people to message">${ICON.plus}</button></div>
      <div id="dm-list"></div>`;
    $('#find-btn').addEventListener('click', () => openFindPeople());
    $('#dm-new').addEventListener('click', () => openFindPeople());
    $('#nav-bloom').addEventListener('click', () => openSettings('bloom'));
    $('#nav-requests').addEventListener('click', () => showRequests('requests'));
    $('#nav-friends').addEventListener('click', () => showFriends(state.view.type === 'friends' ? state.view.tab : 'online'));
  }
  renderDMList();
  renderFriendsBadge();
}

function renderFriendsBadge() {
  const n = state.requests.filter(r => r.direction === 'incoming').length;
  const b = $('#friends-badge');
  if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
  $('#nav-friends')?.classList.toggle('active', state.view.type === 'friends');
  const reqs = (state.messageRequests || []).filter(r => !r.spam).length;
  const rb = $('#requests-badge');
  if (rb) { rb.textContent = reqs; rb.classList.toggle('hidden', !reqs); }
  $('#nav-requests')?.classList.toggle('active', state.view.type === 'requests');
  const home = $('#home-btn');
  if (home) home.dataset.badge = n + reqs + state.dms.reduce((t, x) => t + (x.unread || 0), 0) + state.groups.reduce((t, g) => t + (g.unread || 0), 0) || '';
}

let prevUnread = {};
function renderDMList() {
  const list = $('#dm-list');
  if (!list) { renderFriendsBadge(); return; }
  const items = [...state.dms.filter(x => user(x.userId)), ...state.groups.map(g => ({ group: g, lastMessageAt: g.lastMessageAt }))].sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  if (!items.length) { list.innerHTML = '<div class="dm-empty">No conversations yet. Message a friend to start one.</div>'; }
  else {
    const itemHtml = x => {
      if (x.group) return groupListItem(x.group);
      const u = user(x.userId);
      const active = activePeer() === u.id;
      const cf = state.closeStatuses?.[u.id];
      return `<button class="dm-item${active ? ' active' : ''}${x.unread ? ' unread' : ''}" data-id="${esc(u.id)}" data-conv="${esc(u.id)}">
        ${avatar(u, 32, true)}
        <div class="meta"><div class="name">${esc(u.displayName)}${u.birthdayToday ? ' <span title="Birthday today!">🎂</span>' : ''}${state.closeFriends?.includes(u.id) ? ' <span class="cf-star" title="Close friend">★</span>' : ''}${officialTag(u)}</div>${x.pending ? '<div class="sub">Message request sent</div>' : cf ? `<div class="sub cf-sub">★ ${esc([cf.emoji, cf.text || (cf.image ? 'Shared a photo' : '')].filter(Boolean).join(' '))}</div>` : activityLine(u) ? `<div class="sub">${activityLine(u)}</div>` : u.customStatus ? `<div class="sub">${esc(statusLine(u))}</div>` : ''}</div>
        ${x.unread ? `<span class="badge${x.unread > (prevUnread[u.id] || 0) ? ' pop' : ''}">${x.unread > 99 ? '99+' : x.unread}</span>` : ''}
      </button>`;
    };
    // Pinned conversations first, then your categories, then everything else (newest first).
    const keyOf = x => (x.group ? 'g:' + x.group.id : x.userId);
    const byKey = new Map(items.map(x => [keyOf(x), x]));
    const lay = state.dmLayout || { pinned: [], cats: [] };
    const used = new Set();
    const take = keys => keys.map(k => byKey.get(k)).filter(x => x && !used.has(keyOf(x)) && used.add(keyOf(x)));
    const pinned = take(lay.pinned || []);
    const cats = (lay.cats || []).map(c => ({ ...c, list: take(c.convs || []).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)) }));
    const rest = items.filter(x => !used.has(keyOf(x)));
    const head = (label, id, collapsed, n, kind = '') => `<div class="dm-sec${collapsed ? ' collapsed' : ''}"${id ? ` data-dmcat="${esc(id)}"` : ''}${kind ? ` data-dmsec="${kind}"` : ''}><span>${id ? '<i class="dm-caret">▾</i>' : ''}${esc(label)}</span>${n && collapsed ? `<b class="dm-sec-n">${n}</b>` : ''}</div>`;
    list.innerHTML = (pinned.length ? head('📌 Pinned', null, false, 0, 'pinned') + pinned.map(itemHtml).join('') : '')
      + cats.map(c => head(c.name, c.id, c.collapsed, c.list.reduce((n, x) => n + ((x.group ? x.group.unread : x.unread) || 0), 0)) + (c.collapsed ? '' : c.list.map(itemHtml).join('') || '<div class="dm-cat-empty">Right-click a conversation to move it here.</div>')).join('')
      + (pinned.length || cats.length ? head('Direct Messages', null, false, 0, 'rest') : '') + rest.map(itemHtml).join('');
    $$('.dm-item', list).forEach(b => { const x = state.dms.find(d => d.userId === b.dataset.id); if (x && x.unread > (prevUnread[x.userId] || 0)) b.classList.add('nudge'); });
    prevUnread = Object.fromEntries(state.dms.map(x => [x.userId, x.unread || 0]));
    $$('.dm-item[data-id]', list).forEach(b => b.addEventListener('click', () => openDM(b.dataset.id)));
    $$('.dm-item[data-group]', list).forEach(b => b.addEventListener('click', () => openGroup(b.dataset.group)));
  }
  const unread = state.dms.reduce((n, x) => n + (x.unread || 0), 0) + state.groups.reduce((n, g) => n + (g.unread || 0), 0);
  document.title = unread ? `(${unread}) Zuno` : 'Zuno';
  window.zunoDesktop?.setBadge(unread);
  renderFriendsBadge();
}

function renderUserPanel() {
  const me = state.me;
  const shown = { ...me, status: me.statusPref === 'invisible' ? 'invisible' : me.statusPref };
  $('#user-panel').innerHTML = `
    <button class="me-btn on-panel" id="me-btn" title="Set status">
      ${avatar(shown, 32, true)}
      <div style="min-width:0"><div class="name">${esc(me.displayName)}</div><div class="sub">${esc(me.customStatus || STATUS_LABEL[shown.status])}</div></div>
    </button>
    <button class="icon-btn${Calls.muted ? ' off' : ''}" id="mute-btn" title="${Calls.muted ? 'Unmute' : 'Mute'}">${Calls.muted ? ICON.micOff : ICON.mic}</button>
    <button class="icon-btn${Calls.deafened ? ' off' : ''}" id="deafen-btn" title="${Calls.deafened ? 'Undeafen' : 'Deafen'}">${Calls.deafened ? ICON.deafen : ICON.headphones}</button>
    <button class="icon-btn" id="settings-btn" title="User Settings">${ICON.gear}</button>`;
  $('#mute-btn').addEventListener('click', () => Calls.toggleMute());
  $('#deafen-btn').addEventListener('click', () => Calls.toggleDeafen());
  $('#me-btn').addEventListener('click', e => openStatusMenu(e.currentTarget));
  $('#settings-btn').addEventListener('click', () => openSettings('account'));
}

$('#home-btn').addEventListener('click', () => showFriends('online'));

function mobileNavButton() { return `<button class="icon-btn mobile-only" data-act="nav" title="Menu">${ICON.menu}</button>`; }
function wireMobileNav(root) {
  $$('[data-act=nav]', root).forEach(b => b.addEventListener('click', () => $('#app').classList.add('show-nav')));
}
document.addEventListener('click', e => {
  if (e.target.closest('.dm-item, #nav-friends')) $('#app').classList.remove('show-nav');
});

// ======================= friends page =======================
function showFriends(tab = 'online') {
  if (state.view.type === 'dm') stopProfileSound();
  setWhere('Friends');
  state.view = { type: 'friends', tab };
  state.currentServerId = null;
  renderRail();
  renderSidebar();
  const pending = state.requests.filter(r => r.direction === 'incoming').length;
  const main = $('#main');
  main.innerHTML = `
    <div class="topbar">
      ${mobileNavButton()}
      <div class="title">${ICON.friends} Friends</div>
      <div class="divider"></div>
      ${['online', 'all', 'pending'].map(t => `<button class="tab${tab === t ? ' active' : ''}" data-tab="${t}">${t === 'online' ? 'Online' : t === 'all' ? 'All' : 'Pending'}${t === 'pending' && pending ? ` <span class="badge" style="margin:0">${pending}</span>` : ''}</button>`).join('')}
      <button class="tab add${tab === 'add' ? ' active' : ''}" data-tab="add">Add Friend</button>
    </div>
    <div class="body-row"><div class="friends" id="friends-body"></div></div>`;
  $$('[data-tab]', main).forEach(b => b.addEventListener('click', () => showFriends(b.dataset.tab)));
  wireMobileNav(main);
  renderDMList();
  if (tab === 'add') renderAddFriend();
  else {
    $('#friends-body').innerHTML = `<input class="friends-search" id="friends-search" placeholder="Search" value="${esc(state.friendFilter)}"><div id="friend-list"></div>`;
    $('#friends-search').addEventListener('input', e => { state.friendFilter = e.target.value; renderFriendsBody(); });
    renderFriendsBody();
  }
}

function renderFriendsBody() {
  if (state.view.type !== 'friends') return;
  const tab = state.view.tab;
  // Update the pending count on the tab without redrawing the whole page.
  const pendingTab = $('[data-tab=pending]');
  if (pendingTab) {
    const n = state.requests.filter(r => r.direction === 'incoming').length;
    pendingTab.innerHTML = `Pending${n ? ` <span class="badge" style="margin:0">${n}</span>` : ''}`;
  }
  const list = $('#friend-list');
  if (!list) return;
  const q = state.friendFilter.trim().toLowerCase();
  const match = u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q);
  const byName = (a, b) => a.displayName.localeCompare(b.displayName);

  if (tab === 'pending') {
    const rows = state.requests.map(r => ({ r, u: user(r.userId) })).filter(x => x.u && match(x.u))
      .sort((a, b) => (a.r.direction === b.r.direction ? b.r.createdAt - a.r.createdAt : a.r.direction === 'incoming' ? -1 : 1));
    if (!rows.length) { list.innerHTML = emptyState('curious', 'All caught up', 'There are no pending friend requests right now.'); return; }
    list.innerHTML = `<div class="list-label">Pending — ${rows.length}</div>` + rows.map(({ r, u }) => `
      <div class="friend-row" data-user="${esc(u.id)}">
        ${avatar(u, 32, true).replace('class="avatar"', 'class="avatar on-main"')}
        <div class="meta"><div class="name">${esc(u.displayName)}<span class="uname">${esc(u.username)}</span></div>
          <div class="sub">${r.direction === 'incoming' ? 'Incoming Friend Request' : 'Outgoing Friend Request'}</div></div>
        ${r.direction === 'incoming' ? `<button class="round-btn ok" title="Accept" data-accept="${esc(r.id)}">${ICON.check}</button>` : ''}
        <button class="round-btn no" title="${r.direction === 'incoming' ? 'Ignore' : 'Cancel'}" data-reject="${esc(r.id)}">${ICON.x}</button>
      </div>`).join('');
  } else {
    const friends = state.friends.map(user).filter(Boolean).filter(match).filter(u => tab === 'all' || u.status !== 'offline').sort(byName);
    if (!friends.length) {
      list.innerHTML = state.friends.length
        ? (q ? emptyState('curious', 'No matches', 'No friends match that search.') : emptyState('sleepy', 'It\'s quiet in here', 'None of your friends are online right now.'))
        : emptyState('happy', 'Let\'s find your people', 'Add a friend by their username to start chatting.', true);
      $('[data-goto-add]', list)?.addEventListener('click', () => showFriends('add'));
      return;
    }
    list.innerHTML = `<div class="list-label">${tab === 'online' ? 'Online' : 'All friends'} — ${friends.length}</div>` + friends.map(u => `
      <div class="friend-row" data-user="${esc(u.id)}" data-open>
        ${avatar(u, 32, true).replace('class="avatar"', 'class="avatar on-main"')}
        <div class="meta"><div class="name">${esc(u.displayName)}${state.closeFriends?.includes(u.id) ? ' <span class="cf-star" title="Close friend">★</span>' : ''}<span class="uname">${esc(u.username)}</span></div>
          <div class="sub">${esc(statusLine(u))}</div></div>
        <button class="round-btn" title="Message" data-msg="${esc(u.id)}">${ICON.chat}</button>
        <button class="round-btn" title="More" data-more="${esc(u.id)}">${ICON.more}</button>
      </div>`).join('');
  }

  $$('.friend-row', list).forEach(row => row.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    if (row.hasAttribute('data-open')) openDM(row.dataset.user); else openProfile(row.dataset.user);
  }));
  $$('[data-msg]', list).forEach(b => b.addEventListener('click', () => openDM(b.dataset.msg)));
  $$('[data-more]', list).forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.more;
    openMenu(b, [
      { label: 'Profile', run: () => openProfile(id) },
      { label: 'Message', run: () => openDM(id) },
      'sep',
      { label: 'Remove Friend', danger: true, run: () => confirmRemoveFriend(id) },
    ]);
  }));
  $$('[data-accept]', list).forEach(b => b.addEventListener('click', () => acceptRequest(b.dataset.accept, b)));
  $$('[data-reject]', list).forEach(b => b.addEventListener('click', () => rejectRequest(b.dataset.reject)));
}

function emptyState(mood, title, text, addBtn = false) {
  return `<div class="empty-state">${mascot(mood)}<div class="title">${esc(title)}</div><div>${esc(text)}</div>${addBtn ? '<button class="btn btn-primary" style="margin-top:16px" data-goto-add>Add Friend</button>' : ''}</div>`;
}

function renderAddFriend() {
  const body = $('#friends-body');
  body.innerHTML = `
    <form class="add-friend" id="add-form">
      <h2>Add Friend</h2>
      <p>You can add friends with their Zuno username.</p>
      <div class="add-box" id="add-box">
        <input id="add-input" placeholder="You can add friends with their Zuno username." autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="33">
        <button class="btn btn-primary btn-sm" id="add-btn" disabled>Send Friend Request</button>
      </div>
      <div class="add-msg" id="add-msg"></div>
    </form>`;
  const input = $('#add-input'), btn = $('#add-btn'), box = $('#add-box'), msg = $('#add-msg');
  input.focus();
  input.addEventListener('input', () => { btn.disabled = !input.value.trim(); box.className = 'add-box'; msg.textContent = ''; });
  $('#add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/friends/requests', { username: name });
      box.className = 'add-box ok';
      msg.className = 'add-msg ok';
      msg.textContent = r.accepted ? `You and ${name} are now friends!` : `Friend request sent to ${name}.`;
      burst(btn);
      input.value = '';
    } catch (err) {
      box.className = 'add-box err';
      msg.className = 'add-msg err';
      msg.textContent = err.message;
      btn.disabled = false;
    }
  });
}

async function acceptRequest(id, el) {
  try {
    await api('POST', `/api/friends/requests/${id}/accept`);
    if (el) {
      burst(el, 18);
      el.closest('.friend-row')?.classList.add('leaving');
      await new Promise(r => setTimeout(r, 280));
    }
    await refresh();
  } catch (e) { toast(e.message, true); }
}
async function rejectRequest(id) {
  try { await api('DELETE', `/api/friends/requests/${id}`); await refresh(); } catch (e) { toast(e.message, true); }
}
async function sendRequest(username) {
  try { await api('POST', '/api/friends/requests', { username }); toast('Friend request sent!'); await refresh(); } catch (e) { toast(e.message, true); }
}
function confirmRemoveFriend(id) {
  const u = user(id);
  confirmDialog(`Remove '${u.displayName}'`, `Are you sure you want to remove ${u.displayName} from your friends?`, 'Remove Friend', async () => {
    try { await api('DELETE', `/api/friends/${id}`); await refresh(); } catch (e) { toast(e.message, true); }
  });
}

// ======================= conversations (DMs and server channels) =======================
// A conversation id is the other person's id for a DM, or "ch:<channelId>" for a server channel.
const isChannelConv = conv => typeof conv === 'string' && conv.startsWith('ch:');
const isGroupConv = conv => typeof conv === 'string' && conv.startsWith('g:');
const convBase = conv => (isChannelConv(conv) ? `/api/channels/${conv.slice(3)}` : isGroupConv(conv) ? `/api/groups/${conv.slice(2)}` : `/api/dms/${conv}`);
const activeConv = () => (state.view.type === 'dm' ? state.view.peerId : state.view.type === 'channel' ? 'ch:' + state.view.channelId : state.view.type === 'group' ? 'g:' + state.view.groupId : null);

function chatLayout({ title, actions = '', side = '' }) {
  return `
    <div class="topbar">
      ${mobileNavButton()}
      <div class="title" id="dm-title">${title}</div>
      <div class="spacer"></div>
      ${actions}
    </div>
    <div id="call-slot"></div>
    <div class="body-row">
      <div class="chat">
        <div class="messages" id="messages"></div>
        <div class="composer" id="composer"></div>
        <div class="typing" id="typing"></div>
      </div>
      ${side}
    </div>`;
}

async function openDM(peerId) {
  closeLayer();
  if (!user(peerId)) {
    try { const { user: u } = await api('GET', `/api/users/${peerId}`); state.users[u.id] = u; } catch (e) { return toast(e.message, true); }
  }
  if (state.view.type === 'dm' && state.view.peerId !== peerId) stopProfileSound();
  if (!state.dms.some(x => x.userId === peerId)) state.dms.unshift({ userId: peerId, lastMessageAt: Date.now(), unread: 0, local: true });
  state.view = { type: 'dm', peerId };
  state.currentServerId = null;
  setWhere(user(peerId)?.displayName || '');
  $('#app').classList.remove('show-nav');

  const u = user(peerId);
  const canCall = relationshipWith(peerId) === 'friend' && !u.bot;
  const main = $('#main');
  main.innerHTML = chatLayout({
    title: '',
    actions: `${canCall ? `<button class="icon-btn" id="call-voice" title="Start a voice call">${ICON.phone}</button><button class="icon-btn" id="call-video" title="Start a video call">${ICON.video}</button>` : ''}
      <button class="icon-btn" id="toggle-panel" title="Show User Profile">${ICON.profile}</button>`,
    side: `<aside class="profile-panel${state.showProfilePanel ? '' : ' hidden'}" id="profile-panel"></aside>`,
  });
  wireMobileNav(main);
  $('#toggle-panel').addEventListener('click', () => {
    state.showProfilePanel = !state.showProfilePanel;
    $('#profile-panel').classList.toggle('hidden', !state.showProfilePanel);
    if (!state.showProfilePanel && profileAudio?.source === 'panel') stopProfileSound();
  });
  $('#call-voice')?.addEventListener('click', () => Calls.startDM(peerId, { video: false }));
  $('#call-video')?.addEventListener('click', () => Calls.startDM(peerId, { video: true }));
  renderDMHeader();
  renderComposer();
  renderProfilePanel();
  renderTyping();
  renderSidebar();
  renderRail();
  Calls.renderSlot();
  markRead(peerId);
  await loadConversation(peerId, () => { renderDMHeader(); renderProfilePanel({ autoplay: true }); });
}

// Load a conversation's history the first time it's opened.
async function loadConversation(conv, after) {
  rememberUnreadForDivider(conv);
  const convo = state.convos[conv];
  if (convo?.loaded) { renderMessages(true); after?.(); return; }
  $('#messages').innerHTML = typeof skel53 === 'function' ? skel53('messages') : '<div class="spacer"></div><div class="muted" style="padding:16px">Loading…</div>';
  try {
    const r = await api('GET', `${convBase(conv)}/messages`);
    if (r.user) state.users[r.user.id] = { ...state.users[r.user.id], ...r.user };
    for (const a of r.authors || []) state.users[a.id] = { ...a, ...state.users[a.id] };
    // Keep anything sent or received while the history was loading.
    const early = (state.convos[conv]?.messages || []).filter(m => !r.messages.some(x => x.id === m.id));
    state.convos[conv] = { messages: [...r.messages, ...early], hasMore: r.hasMore, loaded: true, meta: { request: r.request || null, accepted: !!r.accepted, blocked: !!r.blocked, peerSeen: r.peerSeen ?? null, e2e: !!r.e2e } };
    if (activeConv() === conv && !isChannelConv(conv)) renderComposer();
    placeDivider(conv);
    if (activeConv() === conv) { renderMessages(true); after?.(); }
  } catch (e) { toast(e.message, true); }
}

function renderDMHeader() {
  const el = $('#dm-title');
  if (!el) return;
  if (state.view.type === 'group') return renderGroupHeader(el);
  if (state.view.type === 'channel') {
    const ch = currentChannel();
    if (ch) el.innerHTML = `${ch.type === 'voice' ? `<span class="hash vc-ico">${ICON.speaker}</span>` : '<span class="hash">#</span>'}<span class="ch-title">${esc(ch.name)}</span>`;
    return;
  }
  const u = user(activePeer());
  if (!u) return;
  el.innerHTML = `<span class="on-main" style="display:flex;cursor:pointer" id="dm-title-av">${avatar(u, 24, true)}</span>
    <span style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="dm-title-name">${esc(u.displayName)}</span>${officialTag(u)}${botTag(u)}`;
  $('#dm-title-av').addEventListener('click', () => openProfile(u.id));
  $('#dm-title-name').addEventListener('click', () => openProfile(u.id));
}

function renderProfilePanel({ autoplay = false } = {}) {
  if (state.view.type === 'channel') return renderMemberList();
  if (state.view.type === 'group') return renderGroupMembers();
  const el = $('#profile-panel');
  const u = user(activePeer());
  if (!el || !u) return;
  mountCard(el, profileCard(u, { size: 80 }), { autoplaySound: autoplay && state.showProfilePanel, source: 'panel' });
}

function chatIntro(conv) {
  if (isGroupConv(conv)) return groupIntro(conv);
  if (isChannelConv(conv)) {
    const ch = currentChannel();
    if (ch?.type === 'voice') return `<div class="chat-intro"><div class="intro-hash">${ICON.speaker}</div><h2>${esc(ch.name)} chat</h2>
      <div class="muted">Messages for everyone in <b>${esc(ch.name)}</b>, even when they aren't in the call.</div></div>`;
    return `<div class="chat-intro"><div class="intro-hash">#</div><h2>Welcome to #${esc(ch?.name || '')}!</h2>
      <div class="muted">This is the start of the <b>#${esc(ch?.name || '')}</b> channel.</div></div>`;
  }
  const peer = user(conv);
  return `<div class="chat-intro">${avatar(peer, 80)}<h2>${esc(peer.displayName)}</h2><div class="uname">${esc(peer.username)}</div>
    <div class="muted">This is the beginning of your direct message history with <b>${esc(peer.displayName)}</b>.</div></div>`;
}

function reactionsHtml(m) {
  const entries = Object.entries(m.reactions || {});
  if (!entries.length) return '';
  return `<div class="reactions">${entries.map(([emoji, ids]) => {
    const names = ids.map(id => user(id)?.displayName || 'Someone');
    const label = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    return `<button class="rx${ids.includes(state.me.id) ? ' on' : ''}" data-rx="${esc(emoji)}" data-msg="${esc(m.id)}" title="${esc(label)} reacted with ${esc(emoji)}"><span class="rx-e">${esc(emoji)}</span><b>${ids.length}</b></button>`;
  }).join('')}<button class="rx rx-add" data-rx-add="${esc(m.id)}" title="Add Reaction">${ICON.smile}</button></div>`;
}

function canModerate(conv) {
  if (!isChannelConv(conv)) return false;
  return (currentChannel()?.perms || []).includes('manage_messages');
}

// Puts the chat's rows on the page, keeping every row whose HTML hasn't changed since last time
// (matched by message id): those aren't read, rebuilt or measured again. Returns the new elements.
// A different chat, or ?fullredraw=1, always starts from scratch.
const FULL_REDRAW = /[?&]fullredraw=1/.test(location.search);
const ROW_ID = /^\s*<div class="msg[^"]*"(?: style="[^"]*")? data-id="([^"]+)"/;
const rowCmp = h => h.replace(/ enter" style="animation-delay:-\d+ms"/, '"'); // the pop-in timing doesn't count as a change
function patchMessages(el, parts, conv) {
  const tpl = document.createElement('template');
  const build = h => { tpl.innerHTML = h; return [...tpl.content.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim()); };
  const reset = FULL_REDRAW || el.__conv48 !== conv;
  const old = reset ? new Map() : el.__rows48 || new Map();
  const rows = new Map(), fresh = [], final = [];
  parts.forEach((h, i) => {
    const id = ROW_ID.exec(h)?.[1];
    let key = id ? 'm:' + id : 'x:' + h;
    if (rows.has(key)) key += '#' + i;
    const cmp = rowCmp(h), was = old.get(key);
    let nodes;
    if (was && was.cmp === cmp && was.nodes.every(n => n.parentNode === el)) { nodes = was.nodes; old.delete(key); }
    else { nodes = build(h); fresh.push(...nodes.filter(n => n.nodeType === 1)); }
    rows.set(key, { cmp, nodes });
    final.push(...nodes);
  });
  if (reset) el.replaceChildren(...final);
  else {
    const keep = new Set(final);
    for (const c of [...el.childNodes]) if (!keep.has(c)) c.remove();
    let at = el.firstChild;
    for (const n of final) { if (n === at) { at = at.nextSibling; continue; } el.insertBefore(n, at); }
  }
  el.__rows48 = rows; el.__conv48 = conv;
  return fresh;
}

// Messages arriving close together (a busy channel) are drawn once, on the next frame, instead of
// redrawing the whole chat for each one.
let renderSoonFrame = null;
function renderMessagesSoon() {
  if (renderSoonFrame) return;
  renderSoonFrame = requestAnimationFrame(() => { renderSoonFrame = null; renderMessages(); });
}

function renderMessages(forceBottom = false) {
  const conv = activeConv();
  const el = $('#messages');
  const convo = state.convos[conv];
  if (!el || !convo?.loaded) return;
  el.classList.toggle('in-dm', !isChannelConv(conv));
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;

  // Only the newest ~150 messages are drawn; scrolling up draws (or loads) older ones.
  const WINDOW = VW <= 760 ? 80 : 150; // phones draw fewer, so chats stay quick
  // (0.43.1) After jumping far back, only a window around that spot is drawn (convo.to), with
  // "Show newer messages" at its end, instead of everything from there to now.
  if (convo.from == null || (convo.to == null && nearBottom && convo.messages.length - convo.from > WINDOW + 60)) { convo.from = Math.max(0, convo.messages.length - WINDOW); convo.to = null; }
  convo.from = Math.min(convo.from, Math.max(0, convo.messages.length - 1));
  const parts = ['<div class="spacer"></div>']; // one entry per row, so unchanged rows can be kept without being read again
  if (convo.from > 0 || convo.hasMore) parts.push('<button class="btn btn-grey btn-sm load-more" id="load-more">Load older messages</button>');
  else parts.push(chatIntro(conv));

  // Only messages that weren't on screen before get the pop-in animation.
  const firstPaint = !convo.seen;
  convo.seen ||= new Set();
  const mod = canModerate(conv);
  let prev = convo.messages[convo.from - 1] || null;
  for (const m of convo.messages.slice(convo.from, convo.to ?? undefined)) {
    // New messages pop in. Re-renders keep the pop going from where it was, and a sent
    // message that already popped in as "sending…" doesn't pop again once confirmed.
    const tmpKey = 'tmp:' + m.authorId + ':' + m.content;
    convo.enterAt ||= {};
    if (!convo.seen.has(m.id)) {
      if (!m.pending && convo.enterAt[tmpKey]) { convo.enterAt[m.id] = convo.enterAt[tmpKey]; delete convo.enterAt[tmpKey]; }
      else if (!firstPaint) convo.enterAt[m.pending ? tmpKey : m.id] = Date.now();
    }
    const startedAt = convo.enterAt[m.pending ? tmpKey : m.id];
    const elapsed = startedAt ? Date.now() - startedAt : Infinity;
    const enter = elapsed < 380 ? ` enter" style="animation-delay:-${elapsed}ms` : '';
    convo.seen.add(m.id);
    const sameDay = prev && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
    if (!sameDay) parts.push(`<div class="day-divider"><span>${fmtDay(m.createdAt)}</span></div>`);
    const grouped = prev && sameDay && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 7 * 60e3 && !m.replyTo && convo.dividerId !== m.id;
    const base = user(m.authorId) || { id: m.authorId, displayName: 'Unknown', username: 'unknown' };
    const a = m.as ? { ...base, displayName: m.as.name || base.displayName, avatar: m.as.avatar || base.avatar } : base;
    const mine = m.authorId === state.me.id && !m.pending;
    const editing = state.editing?.id === m.id;
    const tools = m.pending || editing ? '' : `<div class="msg-tools">
        <button data-react="${esc(m.id)}" title="Add Reaction">${ICON.smile}</button>
        ${a.system ? '' : `<button data-reply="${esc(m.id)}" title="Reply">${ICON.reply}</button>`}
        ${mine ? `<button data-edit="${esc(m.id)}" title="Edit">${ICON.pencil}</button>` : ''}
        ${mine || mod ? `<button data-del="${esc(m.id)}" title="Delete" class="danger">${ICON.trash}</button>` : ''}</div>`;
    const body = editing
      ? `<div class="edit-wrap"><textarea class="edit-box" maxlength="${limits().message}">${esc(m.content)}</textarea>
          <div class="edit-hint">Esc to <a href="#" data-edit-cancel>cancel</a>, Enter to <a href="#" data-edit-save>save</a></div></div>`
      : `${m.content ? `<div class="content${isJumbo(m.content) ? ' jumbo' : ''}">${pingPills(formatMessage(m.content), m)}${m.editedAt ? `<span class="edited" title="${esc(fmtTime(m.editedAt))}">(edited)</span>` : ''}</div>` : ''}${mediaHtml(m)}${reactionsHtml(m)}`;
    const mentionsMe = msgMentionsMe(m) || (m.replyTo && m.replyTo.authorId === state.me.id && !m.replyTo.noPing && m.authorId !== state.me.id);
    const cls = `${m.authorId === state.me.id ? ' mine' : ''}${m.pending ? ' pending' : ''}${a.system ? ' from-zuno' : ''}${editing ? ' editing' : ''}${mentionsMe || m.mentionEveryone || m.mentionHere ? ' mentioned' : ''}${m.mentionEveryone || m.mentionHere ? ' ping-all' : ''}${m.replyTo ? ' has-reply' : ''}`;
    if (convo.dividerId === m.id) parts.push('<div class="new-divider"><span>New</span></div>');
    parts.push(grouped
      ? `<div class="msg${cls}${enter}" data-id="${esc(m.id)}"><span class="hover-time">${fmtShort(m.createdAt)}</span>${body}${tools}</div>`
      : `<div class="msg head${cls}${enter}" data-id="${esc(m.id)}">
          ${m.replyTo ? replyRefHtml(m.replyTo) : ''}
          <span data-profile="${esc(a.id)}">${avatar(a, 40)}</span>
          <div><span class="author" data-profile="${esc(a.id)}"${nameStyle(a)}>${esc(m.as ? a.displayName : nameIn(a))}</span>${roleIconFor(a.id)}${officialTag(a)}${botTag(a)}<span class="time">${fmtTime(m.createdAt)}</span></div>
          ${body}${tools}</div>`);
    prev = m;
  }
  if (convo.to != null && convo.to < convo.messages.length) parts.push('<button class="btn btn-grey btn-sm load-more load-newer" id="load-newer">Show newer messages</button>');
  const keptEdit = $('.edit-box', el)?.value; // keep an edit in progress across re-renders
  // (0.50) Only messages that are new or changed are rebuilt; the rest stay exactly as they are
  // (pictures stay loaded, videos keep playing, nothing is measured again). Redrawing every message
  // for each new one made busy chats stutter on phones.
  const fresh = patchMessages(el, parts, conv);
  if (keptEdit !== undefined && $('.edit-box', el)) $('.edit-box', el).value = keptEdit;
  // Buttons are wired up only on the new rows (kept rows already have theirs).
  const $f = sel => fresh.flatMap(n => (n.matches(sel) ? [n, ...n.querySelectorAll(sel)] : [...n.querySelectorAll(sel)]));
  $f('[data-profile]').forEach(n => n.addEventListener('click', () => openProfile(n.dataset.profile)));
  $f('#load-more').forEach(b => b.addEventListener('click', loadOlder));
  $f('#load-newer').forEach(b => b.addEventListener('click', () => { const top = el.scrollTop; convo.to = convo.to + 150 >= convo.messages.length ? null : convo.to + 150; if (convo.to == null) convo.from = Math.max(convo.from, convo.messages.length - 400); renderMessages(); el.scrollTop = top; }));
  $f('[data-invite]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openInviteLink(a.dataset.invite); }));
  $f('[data-reply]').forEach(b => b.addEventListener('click', () => startReply(b.dataset.reply)));
  $f('[data-jump]').forEach(b => b.addEventListener('click', () => jumpToAny(activeConv(), b.dataset.jump)));
  $f('.spoiler').forEach(sp => sp.addEventListener('click', () => sp.classList.add('shown')));
  $f('[data-full]').forEach(img => img.addEventListener('click', () => openLightbox(img.dataset.full, img.dataset.name)));
  wireJumpToPresent(el);
  $f('[data-edit]').forEach(b => b.addEventListener('click', () => startEdit(b.dataset.edit)));
  $f('[data-del]').forEach(b => b.addEventListener('click', e => deleteMessage(b.dataset.del, e.shiftKey)));
  $f('[data-rx]').forEach(b => b.addEventListener('click', () => toggleReaction(b.dataset.msg, b.dataset.rx, b)));
  $f('[data-react], [data-rx-add]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.react || b.dataset.rxAdd;
    openEmojiPicker(b, emoji => toggleReaction(id, emoji), { title: 'Add a reaction' });
  }));
  const box = $('.edit-box', el);
  if (box && fresh.some(n => n.contains(box))) wireEditBox(box);
  if (forceBottom || nearBottom) el.scrollTop = el.scrollHeight;
}

async function toggleReaction(msgId, emoji, el) {
  const conv = activeConv();
  const m = state.convos[conv]?.messages.find(x => x.id === msgId);
  if (!m) return;
  const had = (m.reactions?.[emoji] || []).includes(state.me.id);
  try {
    const { message } = await api('POST', `${convBase(conv)}/messages/${msgId}/react`, { emoji });
    Object.assign(m, message);
    if (activeConv() === conv) renderMessages();
    if (!had) burst($(`.msg[data-id="${CSS.escape(msgId)}"] .rx[data-rx="${CSS.escape(emoji)}"]`), 8);
  } catch (e) { toast(e.message, true); }
}

// ---- editing & deleting messages ----
function startEdit(id) {
  state.editing = { conv: activeConv(), id };
  renderMessages();
}
function stopEdit() {
  state.editing = null;
  renderMessages();
  $('#composer-input')?.focus();
}
function wireEditBox(box) {
  const grow = () => { box.style.height = 'auto'; box.style.height = box.scrollHeight + 'px'; };
  grow();
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  box.addEventListener('input', grow);
  const save = async () => {
    const { conv, id } = state.editing || {};
    const text = replaceShortcodes(box.value.trim());
    const m = state.convos[conv]?.messages.find(x => x.id === id);
    if (!m) return stopEdit();
    if (!text) return deleteMessage(id);
    if (text === m.content) return stopEdit();
    try {
      const { message } = await api('PATCH', `${convBase(conv)}/messages/${id}`, { content: text });
      Object.assign(m, message);
      stopEdit();
    } catch (e) { toast(e.message, true); }
  };
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEdit(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
  });
  $('[data-edit-cancel]').addEventListener('click', e => { e.preventDefault(); stopEdit(); });
  $('[data-edit-save]').addEventListener('click', e => { e.preventDefault(); save(); });
}
function deleteMessage(id, skipConfirm = false) {
  const conv = activeConv();
  const go = async () => {
    try {
      const row = $(`.msg[data-id="${CSS.escape(id)}"]`);
      row?.classList.add('removing');
      await api('DELETE', `${convBase(conv)}/messages/${id}`);
      await new Promise(r => setTimeout(r, 180));
      removeMessage(conv, id);
    } catch (e) { toast(e.message, true); $(`.msg[data-id="${CSS.escape(id)}"]`)?.classList.remove('removing'); }
  };
  if (skipConfirm) return go();
  confirmDialog('Delete message', 'Are you sure you want to delete this message? (Tip: hold Shift while clicking delete to skip this.)', 'Delete', go);
}
function removeMessage(conv, id) {
  const convo = state.convos[conv];
  if (!convo) return;
  convo.messages = convo.messages.filter(m => m.id !== id);
  if (state.editing?.id === id) state.editing = null;
  if (activeConv() === conv) renderMessages();
}

async function loadOlder() {
  const conv = activeConv();
  const convo = state.convos[conv];
  const el = $('#messages');
  if (!convo || !el || convo.loadingOlder) return;
  // Older messages already in memory are just drawn; otherwise ask the server.
  if (convo.from > 0) {
    const fromBottom = el.scrollHeight - el.scrollTop;
    convo.from = Math.max(0, convo.from - 100);
    renderMessages();
    el.scrollTop = el.scrollHeight - fromBottom;
    return;
  }
  if (!convo.hasMore) return;
  convo.loadingOlder = true;
  setTimeout(() => { convo.loadingOlder = false; }, 400);
  const oldest = convo.messages[0]?.createdAt || Date.now();
  const fromBottom = el.scrollHeight - el.scrollTop;
  try {
    const r = await api('GET', `${convBase(conv)}/messages?before=${oldest}`);
    for (const a of r.authors || []) state.users[a.id] = { ...a, ...state.users[a.id] };
    convo.messages = [...r.messages, ...convo.messages];
    convo.hasMore = r.hasMore;
    convo.from = (convo.from || 0) + r.messages.length - Math.min(r.messages.length, 100);
    renderMessages();
    el.scrollTop = el.scrollHeight - fromBottom; // stay at the same spot
  } catch (e) { toast(e.message, true); }
}

function renderComposer() {
  const el = $('#composer');
  const conv = activeConv();
  if (!el || !conv) return;
  const channel = isChannelConv(conv) || isGroupConv(conv); // groups type like a channel: no friend or request checks
  const u = channel ? null : user(conv);
  if (!channel && !u) return;
  const meta = channel ? null : state.convos[conv]?.meta;
  const reqState = meta ? (meta.blocked ? 'blocked' : meta.request ? `${meta.request.direction}-${meta.request.status}` : meta.accepted ? 'accepted' : 'none') : 'loading';
  const rel = channel ? 'channel:' + conv : relationshipWith(conv) === 'friend' || relationshipWith(conv) === 'system' ? relationshipWith(conv) : `dm:${relationshipWith(conv)}:${reqState}`;
  if (el.dataset.rel === rel) return; // don't wipe what they're typing
  el.dataset.rel = rel;

  if (rel === 'system') {
    el.innerHTML = `<div class="composer-locked zuno-lock">${mascot('happy')}<span>This is Zuno's official channel for updates and tips. You can't reply here.</span></div>`;
    return;
  }
  if (!channel && rel !== 'friend' && dmLockedComposer(el, u, meta)) return;
  if (false) {
    const action = rel === 'incoming'
      ? `<button class="btn btn-green btn-sm" id="lock-act">Accept Friend Request</button>`
      : rel === 'outgoing' ? `<span>Friend request sent.</span>`
      : `<button class="btn btn-primary btn-sm" id="lock-act">Send Friend Request</button>`;
    el.innerHTML = `<div class="composer-locked">You need to be friends with ${esc(u.displayName)} to send messages. ${action}</div>`;
    $('#lock-act')?.addEventListener('click', () => {
      const req = state.requests.find(r => r.userId === conv && r.direction === 'incoming');
      req ? acceptRequest(req.id) : sendRequest(u.username);
    });
    return;
  }

  const placeholder = isGroupConv(conv) ? `Message ${groupTitle(state.groups.find(g => 'g:' + g.id === conv))}` : channel ? `Message #${currentChannel()?.name || ''}` : rel !== 'friend' && !meta?.accepted && !u.bot ? `Send ${u.displayName} a message request` : `Message @${u.displayName}`;
  el.innerHTML = `${!channel && rel !== 'friend' && !meta?.accepted ? dmRequestNote(u, meta) : ''}<div id="composer-extras"></div><div class="composer-box"><button class="composer-plus" id="composer-plus" title="Upload a file (up to ${mb(limits().upload)})" aria-label="Upload a file">${ICON.plus}</button><input type="file" id="composer-file" class="hidden" multiple>
    <textarea id="composer-input" rows="1" maxlength="${limits().message}" placeholder="${esc(placeholder)}"></textarea>
    <button class="composer-gif" id="composer-gif" title="Send a GIF" aria-label="Send a GIF"><span>GIF</span></button>
    <button class="composer-emoji" id="composer-emoji" title="Emoji" aria-label="Emoji"><span class="ce-face">😀</span></button></div>`;
  const ta = $('#composer-input');
  ta.value = state.drafts[conv] || '';
  // Fits the box to its text. While you're just typing more on the same line nothing needs to
  // change, so the (slow) re-measure only happens when the text wraps or gets shorter.
  let grownLen = -1;
  const grow = () => {
    const len = ta.value.length;
    if (len >= grownLen && grownLen >= 0 && ta.scrollHeight <= ta.clientHeight + 1) { grownLen = len; return; }
    grownLen = len;
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.5) + 'px';
  };
  grow();
  if (window.matchMedia('(pointer: fine)').matches) ta.focus();
  wireEmojiAutocomplete(ta, el);
  wireMentionAutocomplete(ta, el);
  wireComposerExtras(conv, ta);
  // The emoji button shows a random face on hover, like a little slot machine.
  const faces = ['😀', '😎', '🥳', '😺', '🤩', '😜', '🤠', '😇', '🥰', '🤖'];
  $('#composer-emoji').addEventListener('mouseenter', e => { $('.ce-face', e.currentTarget).textContent = faces[Math.floor(Math.random() * faces.length)]; });
  $('#composer-emoji').addEventListener('click', e => openEmojiPicker(e.currentTarget, emoji => {
    const at = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, at) + emoji + ta.value.slice(ta.selectionEnd ?? at);
    ta.focus(); ta.setSelectionRange(at + emoji.length, at + emoji.length);
    ta.dispatchEvent(new Event('input'));
  }));
  let lastTyping = 0;
  ta.addEventListener('input', () => {
    state.drafts[conv] = ta.value;
    grow();
    updateCharCount(ta);
    if (prefs().sendTyping && ta.value.trim() && Date.now() - lastTyping > 4000) {
      lastTyping = Date.now();
      api('POST', `${convBase(conv)}/typing`).catch(() => {});
    }
  });
  ta.addEventListener('keydown', e => {
    // Up arrow in an empty box edits your last message.
    if (e.key === 'ArrowUp' && !ta.value) {
      const last = [...(state.convos[conv]?.messages || [])].reverse().find(m => m.authorId === state.me.id && !m.pending);
      if (last) { e.preventDefault(); startEdit(last.id); }
      return;
    }
    const sendKey = prefs().enterToSend ? (e.key === 'Enter' && !e.shiftKey) : (e.key === 'Enter' && (e.ctrlKey || e.metaKey));
    if (sendKey && !e.isComposing) {
      e.preventDefault();
      const text = replaceShortcodes(ta.value.trim());
      const files = readyUploads(conv);
      if (!text && !files.length) return;
      if (uploadsBusy(conv)) return toast('Wait for your file to finish uploading.', true);
      ta.value = ''; state.drafts[conv] = ''; grow(); lastTyping = 0; updateCharCount(ta);
      sendMessage(conv, text, { attachments: files });
    }
  });
}

async function sendMessage(conv, text, { attachments = [], gif = null } = {}) {
  // (0.45.1.1) A chat first touched by sending isn't "loaded": its history still comes in when it's
  // opened (it used to count as loaded with only the new message, so the DM looked brand new).
  const fresh = !state.convos[conv];
  const convo = state.convos[conv] ||= { messages: [], hasMore: false, loaded: false };
  if (fresh && activeConv() === conv) loadConversation(conv);
  const replyTo = state.replyTo?.conv === conv ? state.replyTo : null;
  const temp = {
    id: 'tmp-' + Math.random().toString(36).slice(2), authorId: state.me.id, content: text, createdAt: Date.now(), pending: true,
    ...(gif ? { gif } : {}), ...(attachments.length ? { attachments } : {}),
    ...(replyTo ? { replyTo: { id: replyTo.id, authorId: replyTo.authorId, snippet: replyTo.snippet } } : {}),
  };
  convo.messages.push(temp);
  convo.dividerId = null; // you've caught up
  clearReply(); clearUploads(conv);
  renderMessages(true);
  try {
    const { message } = await api('POST', `${convBase(conv)}/messages`, {
      content: text, ...(gif ? { gif } : {}), ...(attachments.length ? { attachmentIds: attachments.map(a => a.id) } : {}),
      ...(replyTo ? { replyTo: replyTo.id, ...(replyTo.noPing ? { replyPing: false } : {}) } : {}),
    });
    // The live event may have already swapped the placeholder for the real message.
    const i = convo.messages.indexOf(temp);
    if (temp.pending && i >= 0) {
      if (convo.messages.some(m => m.id === message.id)) convo.messages.splice(i, 1);
      else convo.messages[i] = message;
    }
  } catch (e) {
    // (0.45) A connection problem keeps the message in the chat, marked "Couldn't send", with Retry.
    // (Anything the server said no to, like slowmode, goes back in the message box as before.)
    if (e instanceof TypeError || navigator.onLine === false || /offline|Something went wrong|catch up|reach Zuno/i.test(e.message || '')) {
      temp.failed = true; temp.retry = { text, gif, attachments };
      if (activeConv() === conv) renderMessages(true);
      return;
    }
    convo.messages = convo.messages.filter(m => m !== temp);
    state.drafts[conv] = text;
    const ta = $('#composer-input'); if (ta && activeConv() === conv && !ta.value) ta.value = text;
    toast(e.message, true);
  }
  if (activeConv() === conv) renderMessages(true);
}

function renderTyping() {
  const el = $('#typing');
  const conv = activeConv();
  if (!el) return;
  const now = Date.now();
  const who = Object.entries(state.typing[conv] || {}).filter(([, t]) => t > now).map(([id]) => user(id)?.displayName).filter(Boolean);
  const typing = who.length > 0;
  const label = who.length === 1 ? `<b>${esc(who[0])}</b> is typing…`
    : who.length === 2 ? `<b>${esc(who[0])}</b> and <b>${esc(who[1])}</b> are typing…`
    : `<b>Several people</b> are typing…`;
  if (typing && el.dataset.who !== who.join('|')) el.innerHTML = `<span class="peek">${mascot('curious')}</span><span class="dots"><i></i><i></i><i></i></span><span>${label}</span>`;
  else if (!typing) el.innerHTML = '';
  el.dataset.who = typing ? who.join('|') : '';
}

// ======================= profiles =======================
const PREF_DEFAULTS = {
  profileSounds: true, autoplaySounds: true, soundVolume: 60, animatedBackgrounds: true, animatedBanners: true,
  accent: 'mint', density: 'cozy', chatFontSize: 15, reduceMotion: false,
  desktopNotifications: true, notificationSound: true, sendTyping: true, showTyping: true, enterToSend: true,
  shareActivity: true, typedEffects: true,
};
const ACCENTS = { mint: ['Mint', '#04c5ae'], lagoon: ['Lagoon', '#3aaefc'], grape: ['Grape', '#a37bff'], coral: ['Coral', '#ff7b6b'], sunny: ['Sunny', '#ffc23d'] };
const BLOOM_ACCENTS = { sakura: ['Sakura', '#ff8fcf'], orchid: ['Orchid', '#b67cff'], aurora: ['Aurora', 'linear-gradient(135deg,#ff8fcf,#b67cff,#5ee7d0)'] };

// Apply look-and-feel settings to the whole page.
function applyPrefs() {
  const p = prefs(), root = document.documentElement;
  root.dataset.accent = p.accent;
  root.dataset.density = p.density;
  root.style.setProperty('--chat-fs', p.chatFontSize + 'px');
  root.classList.toggle('reduce-motion', p.reduceMotion);
}
// Asked for many times per redraw: the merged settings are kept until your settings change.
let prefsFor = null, prefsMerged = null;
const prefs = () => { const p = state.me?.prefs; if (p !== prefsFor || !prefsMerged) { prefsFor = p; prefsMerged = { ...PREF_DEFAULTS, ...(p || {}) }; } return prefsMerged; };
// What this account can do (bigger with Zuno Bloom). Comes from the server.
const limits = () => state.me?.limits || { upload: 10e6, files: 4, message: 2000, bio: 190, banner: 4e6, background: 8e6, sound: 3e6, avatar: 1e6, animatedAvatar: true, theme: true, hdScreen: false };
const mb = n => `${Math.round(n / 1e5) / 10} MB`.replace('.0 ', ' ');

function profileCard(u, { size = 80, actions = '' } = {}) {
  const p = prefs();
  const bg = u.profileBackground;
  const media = !bg ? ''
    : bg.type === 'video'
      ? (p.animatedBackgrounds
        ? `<video class="pc-bg" src="${esc(bg.url)}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback noplaybackrate" tabindex="-1" aria-hidden="true"></video>`
        : `<video class="pc-bg" src="${esc(bg.url)}#t=0.1" muted playsinline preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback noplaybackrate" tabindex="-1" aria-hidden="true"></video>`)
      : `<img class="pc-bg" src="${esc(bg.url)}" alt=""${p.animatedBackgrounds ? '' : ' data-freeze'}>`;
  const bn = u.profileBanner;
  const banner = bn
    ? `<div class="banner has-img"><img class="pc-banner" src="${esc(bn.url)}" alt=""${bn.type === 'gif' && !p.animatedBanners ? ' data-freeze' : ''}></div>`
    : `<div class="banner" style="background:${bg ? 'transparent' : esc(u.bannerColor || '#0aa896')}"></div>`;
  const sound = u.profileSound && p.profileSounds
    ? `<button class="pc-sound" data-sound="${esc(u.profileSound)}"${u.profileSoundOnce ? ' data-once="1"' : ''} title="Play profile sound">
        <span class="pc-sound-icon">${ICON.play}</span><span class="pc-sound-name">${esc(u.profileSoundName || 'Profile sound')}</span></button>`
    : '';
  const th = u.profileTheme;
  return `<div class="pcard on-card${bg ? ' has-bg' : ''}${th ? ' themed' : ''}${u.profileEffect ? ' has-fx' : ''}"${th ? ` style="--pt1:${esc(th.primary)};--pt2:${esc(th.accent)}"` : ''}>
    ${media}
    ${typeof profileEffectHtml === 'function' ? profileEffectHtml(u.profileEffect) : ''}
    ${banner}
    ${sound}
    <div class="pc-head">${avatar(u, size, true)}${badgeRow(u)}</div>
    <div class="pc-body">
      <div class="pc-name-row"><div class="pc-name"${u.nameColor ? ` style="color:${esc(u.nameColor)}"` : ''}>${esc(u.displayName)}${officialTag(u)}</div>${u.customStatus || u.customStatusEmoji ? `<div class="pc-custom pc-bubble" title="${esc(u.customStatus || '')}">${u.customStatusEmoji ? `<span class="pc-cs-emoji">${esc(u.customStatusEmoji)}</span>` : ''}<span class="pc-cs-text">${esc(u.customStatus || '')}</span></div>` : ''}</div>
      <div class="pc-uname">${esc(u.username)}</div>
      ${u.pronouns ? `<div class="pc-pronouns">${esc(u.pronouns)}</div>` : ''}
      <hr>
      ${typeof profileExtrasHtml === 'function' ? profileExtrasHtml(u) : ''}
      ${u.bio ? `<h4>About Me</h4><div class="pc-bio">${esc(u.bio).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')}</div>` : ''}
      <h4>Member Since</h4>
      <div class="pc-since">${new Date(u.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      ${actions ? `<div class="pc-actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

// Put a profile card into a container. If the same background video is already
// playing there, keep that element so it doesn't restart on every update.
function mountCard(container, html, { autoplaySound = false, source = 'panel' } = {}) {
  const keep = sel => {
    const old = $(sel, container);
    return newRoot => {
      const fresh = $(sel, newRoot);
      if (old && fresh && old.tagName === fresh.tagName && old.getAttribute('src') === fresh.getAttribute('src')
          && old.hasAttribute('data-freeze') === fresh.hasAttribute('data-freeze') && old.hasAttribute('autoplay') === fresh.hasAttribute('autoplay')) fresh.replaceWith(old);
    };
  };
  const keepBg = keep('.pc-bg'), keepBanner = keep('.pc-banner');
  container.innerHTML = html;
  keepBg(container); keepBanner(container);
  $$('img[data-freeze]', container).forEach(freezeImage);
  const btn = $('.pc-sound', container);
  if (btn) {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleProfileSound(btn.dataset.sound, source, !!btn.dataset.once); });
    if (autoplaySound && prefs().autoplaySounds) playProfileSound(btn.dataset.sound, source, !!btn.dataset.once);
    syncSoundButtons();
  }
}

// Show only the first frame of a GIF (used when animations are turned off).
function freezeImage(img) {
  if (img.dataset.frozen) return;
  const draw = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      img.dataset.frozen = '1';
      img.src = c.toDataURL('image/png');
    } catch {
      // From cloud storage the pixels can't be read: load it once through Zuno and try again.
      if (!img.dataset.direct && typeof directUrl === 'function' && directUrl(img.src) !== img.src) { img.dataset.direct = '1'; img.addEventListener('load', draw, { once: true }); img.src = directUrl(img.src); }
    }
  };
  if (img.complete && img.naturalWidth) draw(); else img.addEventListener('load', draw, { once: true });
}

// ---- profile sound playback (one sound at a time) ----
let profileAudio = null;
function playProfileSound(url, source = 'panel', once = false) {
  stopProfileSound();
  if (!prefs().profileSounds) return;
  profileAudio = new Audio(url);
  profileAudio.source = source;
  profileAudio.loop = !once; // loops while the profile is open, unless its owner chose to play it once
  profileAudio.volume = prefs().soundVolume / 100;
  for (const ev of ['play', 'pause', 'ended']) profileAudio.addEventListener(ev, syncSoundButtons);
  profileAudio.play().catch(() => syncSoundButtons()); // the browser may block autoplay; the button still works
}
function toggleProfileSound(url, source, once) {
  if (profileAudio && profileAudio.src.endsWith(url)) {
    if (profileAudio.paused) { if (profileAudio.ended) profileAudio.currentTime = 0; profileAudio.play(); }
    else profileAudio.pause();
  } else playProfileSound(url, source, once);
}
function stopProfileSound() {
  if (!profileAudio) return;
  profileAudio.pause();
  profileAudio = null;
  syncSoundButtons();
}
function syncSoundButtons() {
  for (const b of $$('.pc-sound')) {
    const playing = profileAudio && !profileAudio.paused && profileAudio.src.endsWith(b.dataset.sound);
    b.classList.toggle('playing', !!playing);
    $('.pc-sound-icon', b).innerHTML = playing ? ICON.pause : ICON.play;
    b.title = playing ? 'Pause profile sound' : 'Play profile sound';
  }
}

async function openProfile(id) {
  let u = user(id), rel = relationshipWith(id);
  try { const r = await api('GET', `/api/users/${id}`); u = state.users[id] = { ...state.users[id], ...r.user }; rel = r.relationship; }
  catch (e) { if (!u) return toast(e.message, true); }
  const req = state.requests.find(r => r.userId === id);
  const actions = {
    system: '',
    self: `<button class="btn btn-primary" data-a="edit">Edit Profile</button>`,
    friend: `<button class="btn btn-primary" data-a="msg">${ICON.chat.replace('<svg', '<svg width="16" height="16"')} Message</button><button class="btn btn-grey" data-a="remove">Remove Friend</button>`,
    incoming: `<button class="btn btn-green" data-a="accept">Accept</button><button class="btn btn-grey" data-a="reject">Ignore</button>`,
    outgoing: `<button class="btn btn-grey" disabled>Request Sent</button><button class="btn btn-grey" data-a="reject">Cancel</button>`,
    none: `<button class="btn btn-green" data-a="add" title="Send Friend Request">Add Friend</button>`,
  }[rel];
  const giftBtn = !u.system && !u.bot && u.id !== state.me.id && (rel === 'friend' || state.me.isFounder) ? '<button class="pc-gift" data-a="gift"><img src="/badges/bloom-new.png" alt="">Gift Bloom</button>' : '';
  const ov = openLayer('<div class="modal"></div>');
  mountCard($('.modal', ov), profileCard(u, { size: 80, actions: actions + giftBtn }), { autoplaySound: true, source: 'popout' });

  const on = (a, fn) => $(`[data-a=${a}]`, ov)?.addEventListener('click', () => { closeLayer(); fn(); });
  on('edit', () => openSettings('profile'));
  on('msg', () => openDM(id));
  on('remove', () => confirmRemoveFriend(id));
  on('accept', () => acceptRequest(req.id));
  on('reject', () => rejectRequest(req.id));
  on('add', () => sendRequest(u.username));
  on('gift', () => openBloomGift(u));
  on('resetlink', () => openResetLink(u));
  if (typeof wireProfileExtras === 'function') wireProfileExtras(ov, u);
}

// ======================= layers: overlays, menus, dialogs =======================
function openLayer(html) {
  closeLayer();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = html;
  ov.addEventListener('mousedown', e => { if (e.target === ov) dismissLayer(); });
  $('#layer').appendChild(ov);
  return ov;
}
// Close with a short ease-away animation (used for Escape and clicking outside).
function dismissLayer() {
  const ov = $('#layer .overlay:last-child');
  if (!ov || motionOff()) return closeLayer();
  ov.classList.add('leaving');
  setTimeout(() => { if (ov.isConnected) closeLayer(); }, 150);
}
function closeLayer() {
  $('#layer').innerHTML = '';
  if (profileAudio?.source === 'popout') stopProfileSound();
}

function openMenu(anchor, items) {
  closeLayer();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = items.map((it, i) => it === 'sep' ? '<div class="sep"></div>'
    : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${esc(it.label)}${it.desc ? `<span class="desc">${esc(it.desc)}</span>` : ''}</span></button>`).join('');
  const shield = document.createElement('div');
  shield.style.cssText = 'position:fixed;inset:0;z-index:119';
  shield.addEventListener('mousedown', closeLayer);
  $('#layer').append(shield, menu);
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let top = r.bottom + 6, left = r.left;
  if (top + mr.height > innerHeight - 8) top = r.top - mr.height - 6;
  if (left + mr.width > innerWidth - 8) left = innerWidth - mr.width - 8;
  menu.style.top = Math.max(8, top) + 'px';
  menu.style.left = Math.max(8, left) + 'px';
  $$('[data-i]', menu).forEach(b => b.addEventListener('click', () => { closeLayer(); items[b.dataset.i].run(); }));
}

// A menu that opens on top of a dialog without closing it (e.g. "Add role or member" in a
// permissions editor). Picking an item or clicking away closes only the menu.
function openMenuOver(anchor, items) {
  $$('.menu.menu-over, .menu-over-shield').forEach(n => n.remove());
  const menu = document.createElement('div');
  menu.className = 'menu menu-over';
  menu.style.zIndex = 160;
  menu.innerHTML = items.map((it, i) => it === 'sep' ? '<div class="sep"></div>'
    : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${esc(it.label)}${it.desc ? `<span class="desc">${esc(it.desc)}</span>` : ''}</span></button>`).join('') || '<div class="fp-empty">Nothing left to add.</div>';
  const shield = document.createElement('div');
  shield.className = 'menu-over-shield';
  shield.style.cssText = 'position:fixed;inset:0;z-index:159';
  const close = () => { menu.remove(); shield.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  shield.addEventListener('mousedown', close);
  $('#layer').append(shield, menu);
  menu.style.maxHeight = innerHeight - 16 + 'px'; menu.style.overflowY = 'auto';
  const r = anchor.getBoundingClientRect(), mr = menu.getBoundingClientRect();
  let top = r.bottom + 6, left = r.left;
  if (top + mr.height > innerHeight - 8) top = r.top - mr.height - 6;
  if (left + mr.width > innerWidth - 8) left = innerWidth - mr.width - 8;
  menu.style.top = Math.max(8, top) + 'px'; menu.style.left = Math.max(8, left) + 'px';
  $$('[data-i]', menu).forEach(b => b.addEventListener('click', () => { close(); items[b.dataset.i].run(); }));
}

function confirmDialog(title, text, okLabel, onOk) {
  const ov = openLayer(`<div class="dialog modal" style="max-width:440px">
    <h3>${esc(title)}</h3><div>${esc(text)}</div>
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red" data-a="ok">${esc(okLabel)}</button></div></div>`);
  $('[data-a=cancel]', ov).addEventListener('click', closeLayer);
  $('[data-a=ok]', ov).addEventListener('click', () => { closeLayer(); onOk(); });
}

function openStatusMenu(anchor) {
  const dot = s => `<span class="swatch s-${s}"></span>`;
  openMenu(anchor, [
    { label: 'Online', icon: dot('online'), run: () => setStatus('online') },
    { label: 'Idle', icon: dot('idle'), run: () => setStatus('idle') },
    { label: 'Do Not Disturb', icon: dot('dnd'), desc: 'You will still get messages', run: () => setStatus('dnd') },
    { label: 'Invisible', icon: dot('invisible'), desc: 'You will appear offline', run: () => setStatus('invisible') },
    'sep',
    { label: state.me.customStatus ? 'Edit Custom Status' : 'Set Custom Status', run: openCustomStatus },
    'sep',
    { label: 'Change Avatar', icon: '<span class="mi-ico">📷</span>', run: quickChangeAvatar },
    ...(state.me.avatar ? [{ label: 'Remove Avatar', icon: '<span class="mi-ico">🗑️</span>', run: quickRemoveAvatar }] : []),
    { label: 'Edit Profile', icon: '<span class="mi-ico">✏️</span>', run: () => openSettings('profile') },
  ]);
}
async function setStatus(status) {
  try { const { me } = await api('PATCH', '/api/me', { status }); state.me = me; state.users[me.id] = me; renderUserPanel(); }
  catch (e) { toast(e.message, true); }
}
function openCustomStatus() {
  let emoji = state.me.customStatusEmoji || '';
  const ov = openLayer(`<form class="dialog modal">
    <h3>Set a custom status</h3>
    <label class="field">What's cookin', ${esc(state.me.displayName)}?<div class="cs-row"><button type="button" class="cs-emoji" id="cs-emoji" title="Pick an emoji">${esc(emoji) || '😀'}</button><input name="cs" maxlength="80" value="${esc(state.me.customStatus)}" placeholder="Support has arrived!"></div></label>
    <label class="field">Clear after<select name="until" class="sc-select"><option value="0">Don't clear</option><option value="1800000">30 minutes</option><option value="3600000">1 hour</option><option value="14400000">4 hours</option><option value="today">Today</option><option value="604800000">This week</option></select></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="clear">Clear</button><button class="btn btn-primary">Save</button></div></form>`);
  const form = $('form', ov);
  form.cs.focus();
  $('#cs-emoji', ov).addEventListener('click', e => openEmojiPicker(e.currentTarget, x => { emoji = x; $('#cs-emoji', ov).textContent = x; }, { title: 'Status emoji' }));
  const untilOf = v => { if (v === 'today') { const d = new Date(); d.setHours(23, 59, 59, 0); return d.getTime(); } return Number(v) ? Date.now() + Number(v) : 0; };
  const save = async (v, clear) => {
    try { const { me } = await api('PATCH', '/api/me', { customStatus: v, customStatusEmoji: clear ? null : emoji || null, customStatusUntil: clear ? 0 : untilOf(form.until.value) }); state.me = { ...state.me, ...me }; state.users[me.id] = state.me; renderUserPanel(); closeLayer(); }
    catch (e) { toast(e.message, true); }
  };
  form.addEventListener('submit', e => { e.preventDefault(); save(form.cs.value); });
  $('[data-a=clear]', ov).addEventListener('click', () => save('', true));
}

function openSwitcher() {
  const ov = openLayer(`<div class="switcher modal" style="max-width:560px">
    <input id="sw-input" placeholder="Where would you like to go?" autocomplete="off">
    <div class="results" id="sw-results"></div></div>`);
  const input = $('#sw-input', ov), results = $('#sw-results', ov);
  let sel = 0, items = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const ids = [...new Set([...state.dms.map(x => x.userId), ...state.friends])];
    items = ids.map(user).filter(Boolean).filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.includes(q)).slice(0, 20);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    results.innerHTML = items.length ? items.map((u, i) => `<button class="result on-main${i === sel ? ' sel' : ''}" data-i="${i}">${avatar(u, 24, true)}<b>${esc(u.displayName)}</b><span class="muted">${esc(u.username)}</span></button>`).join('')
      : `<div class="muted" style="padding:8px">${state.friends.length ? 'No matches.' : 'Add some friends first, then find them here.'}</div>`;
    $$('[data-i]', results).forEach(b => b.addEventListener('click', () => openDM(items[b.dataset.i].id)));
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) openDM(items[sel].id);
  });
  draw();
  input.focus();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('.emoji-picker')) return closeEmojiPicker();
    if ($('.settings')) closeSettings();
    else dismissLayer();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.me) { e.preventDefault(); openSwitcher(); }
});

// ======================= settings =======================
let settingsDraft = null;

function openSettings(section = 'account') {
  closeLayer();
  const el = document.createElement('div');
  el.className = 'settings';
  el.innerHTML = `
    <div class="settings-nav"><div>
      <h5>User Settings</h5>
      <button data-s="account">My Account</button>
      <button data-s="profile">Profiles</button>
      <button data-s="media">Profile Effects</button>
      <button data-s="privacy">Privacy & Safety</button>
      <button data-s="standing">Account Standing</button>
      <button data-s="bloom" class="nav-bloom"><img src="/badges/bloom-new.png" alt="">Zuno Bloom</button>
      <h5 style="margin-top:12px">App Settings</h5>
      <button data-s="appearance">Appearance</button>
      <button data-s="notifications">Notifications</button>
      <button data-s="chat">Chat</button>
      <button data-s="about">About Zuno</button>
      <h5 style="margin-top:12px">Build</h5>
      <button data-s="developer">Developer</button>
      <h5 style="margin-top:12px">Help</h5>
      <button data-s="bugs">Report a Bug</button>
      ${state.me.isStaff ? '<button data-s="buginbox">Bug Reports</button><button data-s="employee">Employee Dashboard</button><button data-s="moderation">Moderation</button>' : ''}
      <div class="sep"></div>
      <button data-s="switch47">Switch Accounts</button>
      <button data-s="logout" style="color:#fa777c">Log Out</button>
    </div></div>
    <div class="settings-main"><div id="settings-body"></div></div>
    <button class="settings-close" id="settings-close"><span>✕</span>ESC</button>`;
  $('#layer').appendChild(el);
  $$('[data-s]', el).forEach(b => b.addEventListener('click', () => {
    if (b.dataset.s === 'logout') return confirmLogout();
    if (b.dataset.s === 'switch47') { if (settingsDraft && isDraftDirty()) return closeSettings(); settingsDraft = null; return openAccountSwitcher(); } // (0.47) phones had no way to reach it
    showSettingsSection(b.dataset.s);
  }));
  $('#settings-close').addEventListener('click', closeSettings);
  showSettingsSection(section);
}

function closeSettings() {
  if (settingsDraft && isDraftDirty()) {
    const bar = $('.save-bar');
    if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = 'pop .15s ease-out'; bar.style.background = '#a12d2f'; setTimeout(() => (bar.style.background = ''), 600); }
    return;
  }
  settingsDraft = null;
  closeLayer();
}

function confirmLogout() {
  const box = document.createElement('div');
  box.className = 'overlay';
  box.style.zIndex = 130;
  box.innerHTML = `<div class="dialog modal"><h3>Log Out</h3><div>Are you sure you want to log out?</div>
    <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-red" data-a="ok">Log Out</button></div></div>`;
  $('#layer').appendChild(box);
  $('[data-a=cancel]', box).addEventListener('click', () => box.remove());
  $('[data-a=ok]', box).addEventListener('click', () => { settingsDraft = null; signOut(); });
}

function showSettingsSection(section) {
  if (settingsDraft && isDraftDirty() && section !== 'profile') return closeSettings(); // flashes the save bar
  $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === section));
  const body = $('#settings-body');
  const me = state.me;
  if (section === 'media') { settingsDraft = null; return renderMediaSettings(body); }
  if (section === 'appearance') { settingsDraft = null; return renderAppearance(body); }
  if (section === 'notifications') { settingsDraft = null; return renderNotifications(body); }
  if (section === 'chat') { settingsDraft = null; return renderChatSettings(body); }
  if (section === 'about') { settingsDraft = null; return renderAbout(body); }
  if (section === 'bloom') { settingsDraft = null; return renderBloom(body); }
  if (section === 'standing') { settingsDraft = null; return renderStanding(body); }
  if (section === 'privacy') { settingsDraft = null; return renderPrivacy(body); }
  if (section === 'developer') { settingsDraft = null; return renderDeveloper(body); }
  if (section === 'employee') { settingsDraft = null; return renderEmployeeDashboard(body); }
  if (section === 'moderation') { settingsDraft = null; return renderModerationGated(body); }
  if (section === 'bugs') { settingsDraft = null; return renderBugReport(body); }
  if (section === 'buginbox') { settingsDraft = null; return renderBugInbox(body); }
  if (section === 'account') {
    settingsDraft = null;
    body.innerHTML = `
      <h2>My Account</h2>
      <div class="account-card on-card">
        <div class="banner" style="background:${esc(me.bannerColor)}"></div>
        <div class="row">${avatar({ ...me, status: me.statusPref }, 80, true)}<div class="who">${esc(me.displayName)}</div>
          <button class="btn btn-primary" style="margin-top:38px" id="go-profile">Edit User Profile</button></div>
        <div class="info">
          <div><small>Display Name</small>${esc(me.displayName)}</div>
          <div class="acc-uname"><small>Username</small>@${esc(me.username)}<button class="btn btn-grey btn-sm" id="uname-edit" style="margin-left:auto">Edit</button></div>
          <div><small>Email</small><span id="email-text">${esc(maskEmail(me.email))}</span>
            ${me.email ? '<button class="btn btn-link" id="email-reveal" style="color:var(--link)">Reveal</button>' : ''}</div>
          <div><small>Member Since</small>${new Date(me.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>`;
    $('#go-profile').addEventListener('click', () => showSettingsSection('profile'));
    $('#uname-edit')?.addEventListener('click', () => openUsernameChange());
    $('#email-reveal')?.addEventListener('click', e => {
      const shown = e.target.textContent === 'Hide';
      $('#email-text').textContent = shown ? maskEmail(me.email) : me.email;
      e.target.textContent = shown ? 'Reveal' : 'Hide';
    });
    return;
  }

  // Profiles
  settingsDraft = settingsDraft || { displayName: me.displayName, pronouns: me.pronouns, bio: me.bio, customStatus: me.customStatus, bannerColor: me.bannerColor, avatar: me.avatar, nameColor: me.nameColor || null, profileTheme: me.profileTheme || null, decoration: me.decoration || null, profileEffect: me.profileEffect || null };
  const d = settingsDraft;
  body.innerHTML = `
    <h2>Profiles</h2>
    <div class="profile-editor">
      <form id="profile-form" autocomplete="off">
        <label class="field">Display Name<input name="displayName" maxlength="32" value="${esc(d.displayName)}"></label>
        <label class="field">Pronouns<input name="pronouns" maxlength="24" value="${esc(d.pronouns)}" placeholder="Add your pronouns"></label>
        <div class="field">Avatar
          <div class="editor-row">
            <button type="button" class="btn btn-primary btn-sm" id="avatar-change">Change Avatar</button>
            <button type="button" class="btn btn-link" id="avatar-remove"${d.avatar ? '' : ' disabled'}>Remove Avatar</button>
            <input type="file" id="avatar-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
          </div>
        </div>
        <div class="field">Banner Color
          <div class="editor-row"><input type="color" class="color-input" name="bannerColor" value="${esc(d.bannerColor)}"><span class="muted" id="banner-hex">${esc(d.bannerColor)}</span></div>
          ${me.profileBanner ? '<span class="hint" style="display:block;margin-top:6px">Hidden while you have a banner image.</span>' : me.profileBackground ? '<span class="hint" style="display:block;margin-top:6px">Hidden while you have a profile background.</span>' : ''}
        </div>
        <div class="field">Profile Banner
          <span class="hint" style="display:block;margin-top:4px">A PNG, JPG, WebP or GIF (up to ${mb(limits().banner)}) across the top of your profile. GIFs animate.</span>
          <div class="editor-row">
            <button type="button" class="btn btn-primary btn-sm" id="banner-upload">${me.profileBanner ? 'Change Banner' : 'Upload Banner'}</button>
            <button type="button" class="btn btn-link" id="banner-remove"${me.profileBanner ? '' : ' disabled'}>Remove</button>
            <span class="muted small" id="banner-status"></span>
            <input type="file" id="banner-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
          </div>
        </div>
        <div class="field">Profile Background
          <span class="hint" style="display:block;margin-top:4px">An MP4 video or GIF (up to ${mb(limits().background)}) that plays behind your whole profile.</span>
          <div class="editor-row">
            <button type="button" class="btn btn-primary btn-sm" id="bg-upload">${me.profileBackground ? 'Change Background' : 'Upload MP4 or GIF'}</button>
            <button type="button" class="btn btn-link" id="bg-remove"${me.profileBackground ? '' : ' disabled'}>Remove</button>
            <span class="muted small" id="bg-status"></span>
            <input type="file" id="bg-file" class="hidden" accept="video/mp4,image/gif,.mp4,.gif">
          </div>
        </div>
        <div class="field">Profile Sound
          <span class="hint" style="display:block;margin-top:4px">An MP3, M4A or WAV (up to ${mb(limits().sound)}) that plays when someone opens your profile.</span>
          <div class="editor-row">
            <button type="button" class="btn btn-primary btn-sm" id="sound-upload">${me.profileSound ? 'Change Sound' : 'Upload Sound'}</button>
            <button type="button" class="btn btn-link" id="sound-remove"${me.profileSound ? '' : ' disabled'}>Remove</button>
            <span class="muted small" id="sound-status">${esc(me.profileSoundName)}</span>
            <input type="file" id="sound-file" class="hidden" accept="audio/*,.mp3,.m4a,.wav,.aac">
          </div>
          <div class="sound-mode" role="radiogroup" aria-label="How your sound plays">
            <label><input type="radio" name="soundMode" value="loop"${me.profileSoundOnce ? '' : ' checked'}> Loop</label>
            <label><input type="radio" name="soundMode" value="once"${me.profileSoundOnce ? ' checked' : ''}> Play once</label>
          </div>
        </div>
        ${flairProfileFields(d)}
        ${bloomProfileFields(d)}
        <label class="field">Custom Status<input name="customStatus" maxlength="80" value="${esc(d.customStatus)}" placeholder="What are you up to?"></label>
        <label class="field">About Me <span class="char-count" id="bio-count">${limits().bio - (d.bio || '').length}</span>
          <span class="hint" style="display:block;margin-top:4px">You can use this to tell people a bit about yourself.</span>
          <textarea name="bio" maxlength="${limits().bio}">${esc(d.bio)}</textarea></label>
      </form>
      <div class="preview"><div class="preview-label">Preview</div><div id="profile-preview"></div></div>
    </div>
    <div id="save-bar-slot"></div>`;

  const form = $('#profile-form');
  const update = () => {
    mountCard($('#profile-preview'), profileCard({ ...me, ...d, displayName: d.displayName.trim() || me.username, status: me.statusPref === 'invisible' ? 'invisible' : me.statusPref }, { size: 80 }));
    $('#bio-count').textContent = limits().bio - d.bio.length;
    $('#banner-hex').textContent = d.bannerColor;
    $('#avatar-remove').disabled = !d.avatar;
    renderSaveBar();
  };
  form.addEventListener('input', e => { if (e.target.name in d) d[e.target.name] = e.target.value; update(); });
  wireBloomProfileFields(form, d, update);
  wireFlairFields(form, d, update);
  $('#avatar-change').addEventListener('click', () => $('#avatar-file').click());
  $('#avatar-remove').addEventListener('click', () => { d.avatar = null; update(); });
  $('#avatar-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const data = await avatarFromFile(file); // opens the picture editor (crop, zoom, rotate)
    if (data) { d.avatar = data; update(); }
  });
  // Click the avatar in the preview to change it, or drop a picture on it.
  const previewBox = $('#profile-preview');
  previewBox.addEventListener('click', e => { if (e.target.closest('.pc-head .avatar')) $('#avatar-file').click(); });
  previewBox.addEventListener('dragover', e => { if (e.target.closest('.pc-head .avatar')) e.preventDefault(); });
  previewBox.addEventListener('drop', async e => {
    if (!e.target.closest('.pc-head .avatar')) return;
    e.preventDefault();
    const data = await avatarFromFile(e.dataTransfer.files[0]);
    if (data) { d.avatar = data; update(); }
  });
  wireMediaUpload('banner', '#banner-upload', '#banner-remove', '#banner-file', '#banner-status', limits().banner);
  wireMediaUpload('background', '#bg-upload', '#bg-remove', '#bg-file', '#bg-status', limits().background);
  wireMediaUpload('sound', '#sound-upload', '#sound-remove', '#sound-file', '#sound-status', limits().sound);
  // Loop or play once: saved right away, like the sound itself.
  $$('[name=soundMode]').forEach(r => r.addEventListener('change', async e => {
    e.stopPropagation();
    try {
      const { me } = await api('PATCH', '/api/me', { profileSoundOnce: e.target.value === 'once' });
      state.me = me; state.users[me.id] = me;
      toast(e.target.value === 'once' ? 'Your profile sound will play once.' : 'Your profile sound will loop.');
    } catch (err) { toast(err.message, true); }
  }));
  $('.sound-mode')?.addEventListener('input', e => e.stopPropagation());
  update();
}

// Profile sound/background upload: sent straight to the server (not part of the Save Changes draft).
function wireMediaUpload(kind, uploadSel, removeSel, fileSel, statusSel, maxBytes) {
  const status = $(statusSel);
  const label = kind;
  $(uploadSel).addEventListener('click', () => $(fileSel).click());
  $(fileSel).addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let body = file;
    if (kind === 'banner' && /^image\/(png|jpeg|webp)$/.test(file.type)) {
      const blob = await openImageEditor(file, { shape: 'banner' }); // crop and position the banner
      if (!blob) return;
      body = new File([blob], 'banner.webp', { type: 'image/webp' });
    }
    if (body.size > maxBytes) return toast(`That file is too big (max ${mb(maxBytes)}).${state.me.bloomInfo?.active ? '' : ' Zuno Bloom raises the limit.'}`, true);
    $(uploadSel).disabled = true;
    status.textContent = 'Uploading…';
    try {
      const res = await fetch(`/api/me/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': body.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(body.name) },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      state.me = data.me; state.users[data.me.id] = data.me;
      toast(`Profile ${label} updated!`);
      if ($('#settings-body')) showSettingsSection('profile');
    } catch (err) {
      toast(err.message, true);
      status.textContent = '';
      $(uploadSel).disabled = false;
    }
  });
  $(removeSel).addEventListener('click', async () => {
    try {
      stopProfileSound();
      const { me } = await api('DELETE', `/api/me/${kind}`);
      state.me = me; state.users[me.id] = me;
      showSettingsSection('profile');
    } catch (err) { toast(err.message, true); }
  });
}

// ---- shared bits for settings pages ----
function prefToggle(key, title, desc, disabled = false) {
  return `<label class="setting-row${disabled ? ' disabled' : ''}">
    <div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div>
    <input type="checkbox" class="switch" data-pref="${key}"${prefs()[key] ? ' checked' : ''}${disabled ? ' disabled' : ''}></label>`;
}
async function savePref(change) {
  try {
    const { me } = await api('PATCH', '/api/me/prefs', change);
    state.me = me; state.users[me.id] = me;
    applyPrefs();
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
// Wire every switch on a page; rerender the page after each change so dependent rows update.
function wireToggles(body, rerender, after) {
  $$('[data-pref]', body).forEach(cb => cb.addEventListener('change', async () => {
    if (await savePref({ [cb.dataset.pref]: cb.checked })) { after?.(cb.dataset.pref, cb.checked); rerender(body); }
    else cb.checked = !cb.checked;
  }));
}

function renderAppearance(body) {
  const p = prefs();
  body.innerHTML = `
    <h2>Appearance</h2>
    <div class="setting-group">
      <h4 class="setting-head">Accent color</h4>
      <p class="setting-desc" style="margin:0 0 12px">Used for buttons, switches, links and highlights.</p>
      <div class="swatches">${Object.entries(ACCENTS).map(([k, [name, hex]]) => `
        <button class="swatch-btn${p.accent === k ? ' on' : ''}" data-accent="${k}" style="--c:${hex}" aria-pressed="${p.accent === k}">
          <span class="dot"></span><span>${name}</span></button>`).join('')}</div>
    </div>
    <div class="setting-group">
      <h4 class="setting-head">Messages</h4>
      <div class="setting-row">
        <div><div class="setting-title">Message spacing</div><div class="setting-desc">Compact fits more messages on screen.</div></div>
        <div class="segmented">${['cozy', 'compact'].map(d => `<button data-density="${d}" class="${p.density === d ? 'on' : ''}">${d === 'cozy' ? 'Cozy' : 'Compact'}</button>`).join('')}</div>
      </div>
      <div class="setting-row">
        <div><div class="setting-title">Chat text size</div><div class="setting-desc">The size of messages in your DMs.</div></div>
        <div class="vol"><input type="range" min="12" max="22" step="1" value="${p.chatFontSize}" id="pref-fs"><span id="pref-fs-val">${p.chatFontSize}px</span></div>
      </div>
      <div class="preview-msg"><div class="msg head"><span>${avatar(state.me, 40)}</span><div><span class="author"${state.me.nameColor ? ` style="color:${esc(state.me.nameColor)}"` : ""}>${esc(state.me.displayName)}</span><span class="time">Today at 4:20 PM</span></div>
        <div class="content">This is how your messages will look. Pretty cozy, right?</div></div></div>
    </div>
    <div class="setting-group">
      <h4 class="setting-head">Motion</h4>
      ${prefToggle('reduceMotion', 'Reduce motion', 'Turn off bouncy animations, sparkles and the start-up pop.')}
    </div>`;
  $$('[data-accent]', body).forEach(b => b.addEventListener('click', async () => { if (await savePref({ accent: b.dataset.accent })) { renderAppearance(body); burst(b, 10); } }));
  $$('[data-density]', body).forEach(b => b.addEventListener('click', async () => { if (await savePref({ density: b.dataset.density })) renderAppearance(body); }));
  const fs = $('#pref-fs', body);
  fs.addEventListener('input', () => { $('#pref-fs-val', body).textContent = fs.value + 'px'; document.documentElement.style.setProperty('--chat-fs', fs.value + 'px'); });
  fs.addEventListener('change', () => savePref({ chatFontSize: Number(fs.value) }));
  wireToggles(body, renderAppearance);
}

function renderNotifications(body) {
  const p = prefs();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  body.innerHTML = `
    <h2>Notifications</h2>
    <p class="muted" style="margin:-8px 0 20px">You only get notified about messages when you're not already looking at that chat. Do Not Disturb silences everything.</p>
    <div class="setting-group">
      ${prefToggle('desktopNotifications', 'Desktop notifications', perm === 'denied' ? 'Notifications are blocked for Zuno in your system settings.' : 'Show a pop-up with the message when someone DMs you.')}
      ${prefToggle('notificationSound', 'Message sound', 'Play a soft pop when a new message arrives.')}
      <div class="setting-row"><div><div class="setting-title">Try it</div><div class="setting-desc">Hear the message sound and see a test notification.</div></div>
        <button class="btn btn-grey btn-sm" id="test-notif">Send a test</button></div>
    </div>`;
  wireToggles(body, renderNotifications, (k, v) => { if (k === 'desktopNotifications' && v && perm === 'default') Notification.requestPermission(); });
  $('#test-notif', body).addEventListener('click', async e => {
    if (prefs().notificationSound) playPing();
    burst(e.target, 8);
    if (prefs().desktopNotifications && 'Notification' in window) {
      const go = () => new Notification('Zuno', { body: 'Notifications are working!', icon: '/logo.png' });
      if (Notification.permission === 'granted') go();
      else if (Notification.permission === 'default' && (await Notification.requestPermission()) === 'granted') go();
    }
  });
}

function renderChatSettings(body) {
  body.innerHTML = `
    <h2>Chat</h2>
    <div class="setting-group">
      <h4 class="setting-head">Typing</h4>
      ${prefToggle('sendTyping', 'Let friends see when I\'m typing', 'When off, nobody sees "is typing…" while you write.')}
      ${prefToggle('showTyping', 'Show when friends are typing', 'Zuno peeks up over the message box while they write.')}
    </div>
    <div class="setting-group">
      <h4 class="setting-head">Sending</h4>
      ${prefToggle('enterToSend', 'Press Enter to send', 'When off, Enter makes a new line and Ctrl+Enter sends.')}
    </div>
    <div class="setting-group">
      <h4 class="setting-head">Shortcuts</h4>
      <div class="shortcuts">
        ${[['Ctrl', 'K', 'Find a conversation'], ['↑', '', 'Edit your last message (in an empty message box)'], ['Shift', 'Enter', 'New line'], ['Esc', '', 'Close a window or cancel an edit'], ['Shift', 'Click delete', 'Delete a message without asking']]
          .map(([a, b, d]) => `<div class="shortcut"><span>${d}</span><span><kbd>${a}</kbd>${b ? `<kbd>${b}</kbd>` : ''}</span></div>`).join('')}
      </div>
    </div>`;
  wireToggles(body, renderChatSettings);
}

// Settings › About Zuno. The Zuno version is the one everyone is on (the server's); the desktop
// app's own version (its window and installer) is shown separately, since it updates less often.
async function renderAbout(body) {
  let notes = {}, info = {}, server = '';
  try { notes = await (await fetch('/whats-new.json', { cache: 'no-store' })).json(); } catch {}
  try { server = (await (await fetch('/api/version', { cache: 'no-store' })).json()).version || ''; } catch {}
  try { info = window.zunoDesktop?.version ? await window.zunoDesktop.version() : {}; } catch {}
  const version = server || notes.version || 'unknown';
  const viaElectron = info.execPath && /electron\.exe$/i.test(info.execPath);
  const oldPlace = info.execPath && /\\Program Files/i.test(info.execPath);
  const appOld = info.version && typeof verLess === 'function' && verLess(info.version, version);
  body.innerHTML = `
    <h2>About Zuno</h2>
    <div class="about-card">
      ${mascot('happy', 'zm-wiggle')}
      <div>
        <div class="about-name">Zuno</div>
        <div class="muted">Version <b>${esc(version)}</b>${info.version ? ` · desktop app ${esc(info.version)}` : ' · in your browser'}</div>
        <div class="about-actions">
          <button class="btn btn-primary btn-sm" id="about-new">See what's new</button>
          <button class="btn btn-grey btn-sm" id="about-dm">Open the Zuno DM</button>
          <a class="btn btn-grey btn-sm" href="/status" target="_blank" rel="noopener">Zuno status</a>
          <a class="btn btn-grey btn-sm" href="/terms" target="_blank" rel="noopener">Terms of Service</a>
          <a class="btn btn-grey btn-sm" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>
          <a class="btn btn-grey btn-sm" href="/security" target="_blank" rel="noopener">Report a security problem</a>
          <button class="btn btn-grey btn-sm" id="about-bug">Report a Bug</button>
        </div>
      </div>
    </div>
    ${notes.items?.length ? `<div class="setting-group about-latest"><h4 class="setting-head">New in ${esc(notes.version)}${notes.title ? ` · ${esc(notes.title)}` : ''}</h4><ul>${notes.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
    ${viaElectron || oldPlace ? `<div class="about-warn"><b>${viaElectron ? 'This Zuno is running through Electron.' : "This Zuno is an old copy that can't update itself."}</b>
      ${viaElectron ? "That's why the taskbar shows the Electron icon." : ''} Install the real Zuno from the website and open it from the Start menu.
      <a class="btn btn-primary btn-sm" href="https://heyzuno.uk/download" target="_blank">Download Zuno</a></div>` : ''}
    ${appOld ? `<p class="muted small" style="margin-top:12px">Everything in Zuno is up to date. The desktop app's window (${esc(info.version)}) updates separately, less often: things like game and Spotify detection come with its next update.</p>` : ''}
    ${info.execPath ? `<p class="muted small" style="margin-top:12px">Running from: <code>${esc(info.execPath)}</code></p>` : ''}
    <p class="muted" style="margin-top:16px">${window.zunoDesktop ? "Zuno updates on its own: new versions load as soon as they're out, and the app shows a Restart bar when its window has an update." : "You're using Zuno in a web browser. New versions load on their own (you'll see a short \"Zuno is updating\" screen)."}</p>`;
  $('#about-new', body).addEventListener('click', () => { closeSettingsNow(); showWhatsNew(version); });
  $('#about-dm', body).addEventListener('click', () => { closeSettingsNow(); openDM('zuno'); });
  $('#about-bug', body).addEventListener('click', () => showSettingsSection('bugs'));
}
function closeSettingsNow() { settingsDraft = null; closeLayer(); }

function renderMediaSettings(body) {
  const p = prefs();
  const toggle = (key, title, desc, disabled = false) => `
    <label class="setting-row${disabled ? ' disabled' : ''}">
      <div><div class="setting-title">${title}</div><div class="setting-desc">${desc}</div></div>
      <input type="checkbox" class="switch" data-pref="${key}"${p[key] ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    </label>`;
  body.innerHTML = `
    <h2>Profile Effects</h2>
    <p class="muted" style="margin:-8px 0 20px">Choose how other people's profiles play for you. This doesn't change your own profile. These settings are saved to your account.</p>
    <div class="setting-group">
      <h4 class="setting-head">Profile Sounds</h4>
      ${toggle('profileSounds', 'Play profile sounds', 'Turn this off to never hear anyone\'s profile MP3.')}
      ${toggle('autoplaySounds', 'Play automatically', 'Start a profile\'s sound as soon as you open it. When off, press the play button instead.', !p.profileSounds)}
      <div class="setting-row${p.profileSounds ? '' : ' disabled'}">
        <div><div class="setting-title">Sound volume</div><div class="setting-desc">How loud profile sounds play.</div></div>
        <div class="vol"><input type="range" min="0" max="100" step="5" value="${p.soundVolume}" id="pref-volume"${p.profileSounds ? '' : ' disabled'}><span id="pref-volume-val">${p.soundVolume}%</span></div>
      </div>
    </div>
    <div class="setting-group">
      <h4 class="setting-head">Animations</h4>
      ${toggle('animatedBackgrounds', 'Animated profile backgrounds', 'Play MP4 and GIF profile backgrounds. When off, you\'ll see a still frame.')}
      ${toggle('animatedBanners', 'Animated banners', 'Play GIF banners. When off, you\'ll see a still frame.')}
    </div>`;
  const savePrefs = async change => {
    try {
      if (!(await savePref(change))) return false;
      if (profileAudio) {
        if (!prefs().profileSounds) stopProfileSound();
        else profileAudio.volume = prefs().soundVolume / 100;
      }
      if (state.view.type === 'dm') renderProfilePanel();
      return true;
    } catch (e) { toast(e.message, true); return false; }
  };
  $$('[data-pref]', body).forEach(cb => cb.addEventListener('change', async () => {
    if (await savePrefs({ [cb.dataset.pref]: cb.checked })) renderMediaSettings(body);
    else cb.checked = !cb.checked;
  }));
  const vol = $('#pref-volume', body);
  vol.addEventListener('input', () => {
    $('#pref-volume-val', body).textContent = vol.value + '%';
    if (profileAudio) profileAudio.volume = vol.value / 100;
  });
  vol.addEventListener('change', () => savePrefs({ soundVolume: Number(vol.value) }));
}

const draftDiff = (a, b) => JSON.stringify(a ?? '') !== JSON.stringify(b ?? '');
function isDraftDirty() {
  const me = state.me, d = settingsDraft;
  return d && Object.keys(d).some(k => draftDiff(d[k], me[k]));
}

function renderSaveBar() {
  const slot = $('#save-bar-slot');
  if (!slot) return;
  if (!isDraftDirty()) { slot.innerHTML = ''; return; }
  if ($('.save-bar', slot)) return;
  slot.innerHTML = `<div class="save-bar"><span class="msg-text">Careful — you have unsaved changes!</span>
    <button class="btn btn-link" id="draft-reset">Reset</button><button class="btn btn-green btn-sm" id="draft-save">Save Changes</button></div>`;
  $('#draft-reset').addEventListener('click', () => { settingsDraft = null; showSettingsSection('profile'); });
  $('#draft-save').addEventListener('click', async e => {
    e.target.disabled = true;
    try {
      const changes = {};
      for (const k of Object.keys(settingsDraft)) if (draftDiff(settingsDraft[k], state.me[k])) changes[k] = settingsDraft[k];
      const { me } = await api('PATCH', '/api/me', changes);
      state.me = me; state.users[me.id] = me;
      settingsDraft = null;
      renderUserPanel();
      showSettingsSection('profile');
      toast('Profile saved');
      burst($('#profile-preview .pc-head .avatar') || $('#profile-preview'), 18);
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
}

// Crop to a square and shrink so avatars stay small.
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/webp', 0.9);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.9);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// ======================= boot =======================
async function start() {
  await loadState();
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderUserPanel();
  renderRail();
  showFriends(state.requests.some(r => r.direction === 'incoming') ? 'pending' : 'online');
  connect();
}

// ---- custom title bar (desktop app only) ----
function setupTitlebar() {
  const bar = $('#titlebar');
  if (!window.zunoDesktop?.windowControl) return;
  document.documentElement.classList.add('desktop');
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="tb-brand"><img src="/logo.png" alt=""><span>Zuno</span></div>
    <div class="tb-where" id="tb-where"></div>
    <div class="tb-controls">
      <button class="tb-btn" data-win="minimize" title="Minimize" aria-label="Minimize">${ICON.minimize}</button>
      <button class="tb-btn" data-win="maximize" title="Maximize" aria-label="Maximize" id="tb-max">${ICON.maximize}</button>
      <button class="tb-btn tb-close" data-win="close" title="Close" aria-label="Close">${ICON.close}</button>
    </div>`;
  $$('[data-win]', bar).forEach(b => b.addEventListener('click', async () => {
    const st = await window.zunoDesktop.windowControl(b.dataset.win);
    if (st && b.dataset.win === 'maximize') setMax(st.maximized);
  }));
  function setMax(max) {
    const b = $('#tb-max');
    b.innerHTML = max ? ICON.restore : ICON.maximize;
    b.title = max ? 'Restore' : 'Maximize';
    document.documentElement.classList.toggle('maximized', max);
  }
  window.zunoDesktop.onWindowState(st => setMax(st.maximized));
  window.zunoDesktop.windowControl('state').then(st => st && setMax(st.maximized));
}
function setWhere(text) {
  const el = $('#tb-where');
  if (el) el.textContent = text || '';
}
setupTitlebar();

// ---- updates (desktop app only) ----
function showUpdateBar(version) {
  if ($('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `${mascot('happy')}<div class="txt"><b>Zuno ${esc(version)} is ready</b>Restart to start using it.</div>
    <button class="btn btn-link" data-a="later">Later</button><button class="btn btn-primary btn-sm" data-a="restart">Restart</button>`;
  document.body.appendChild(bar);
  $('[data-a=later]', bar).addEventListener('click', () => bar.remove());
  $('[data-a=restart]', bar).addEventListener('click', () => window.zunoDesktop.restart());
}

async function showWhatsNew(version) {
  let notes = null;
  try { notes = await (await fetch('/whats-new.json', { cache: 'no-store' })).json(); } catch {}
  const items = notes?.version === version ? notes.items : [];
  const ov = openLayer(`<div class="dialog modal whats-new">
    ${mascot('happy', 'zm-wiggle')}
    <h3>${esc(notes?.version === version ? notes.title : 'Zuno was updated')}</h3>
    <div class="ver">Version ${esc(version)}</div>
    ${items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    <div class="actions"><button class="btn btn-primary" data-a="ok">Nice</button></div></div>`);
  $('[data-a=ok]', ov).addEventListener('click', dismissLayer);
  burst($('.zm', ov), 16);
}

async function checkVersion() {
  if (!window.zunoDesktop?.version) return;
  window.zunoDesktop.onUpdateReady(showUpdateBar);
  try {
    const v = await window.zunoDesktop.version();
    if (v.readyVersion) showUpdateBar(v.readyVersion);
    if (v.updatedFrom && state.me) showWhatsNew(v.version);
  } catch {}
}


// ======================= staying on the latest version =======================
// Zuno's screens come from the server. When the server updates (it restarts, so the live
// connection drops and comes back), every open Zuno switches to the new version too.
let loadedVersion = null;
async function checkServerVersion() {
  let v;
  try { v = (await (await fetch('/api/version', { cache: 'no-store' })).json()).version; } catch { return; }
  if (!loadedVersion) { loadedVersion = v; return; }
  if (v === loadedVersion) return;
  // Don't interrupt a call: offer the reload instead.
  if (Calls.room) return showReloadBar(v);
  // (0.47) Never more than once every 2 minutes, so a server that's restarting can't cause a loop.
  try { if (Date.now() - Number(sessionStorage.getItem('zuno_ver_reload') || 0) < 120e3) return; sessionStorage.setItem('zuno_ver_reload', String(Date.now())); } catch { return; }
  location.reload();
}
function showReloadBar(version) {
  if ($('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `${mascot('happy')}<div class="txt"><b>Zuno ${esc(version)} is ready</b>It'll load when you leave this call.</div>
    <button class="btn btn-primary btn-sm" data-a="now">Load now</button>`;
  document.body.appendChild(bar);
  $('[data-a=now]', bar).addEventListener('click', () => location.reload());
  const wait = setInterval(() => { if (!Calls.room) { clearInterval(wait); location.reload(); } }, 3000);
}
checkServerVersion();
setInterval(checkServerVersion, 5 * 60 * 1000);
