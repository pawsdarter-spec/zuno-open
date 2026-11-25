'use strict';
// Zuno 0.35

// ======================= role colors in servers =======================
// A role's color (gradients too) now shows on your name in servers even when you have a name style
// with an effect; your font stays. To keep your own color/style in servers instead, there's a
// switch under Settings › Profiles › Name Style, and that one changes what everyone sees.
const _nameStyle35 = nameStyle;
nameStyle = function (u) {
  const inServer = state.view.type === 'channel' || state.view.type === 'voice';
  const own = !!(u?.keepOwnColor && (u.nameColor || u.nameStyle));
  if (inServer && u && !own && prefs().showRoleColors !== false) {
    const r = topRole(u.id);
    if (r && safeColor(r.color)) {
      const font = u.nameStyle?.font && u.nameStyle.font !== 'default' ? ` data-nf="${esc(u.nameStyle.font)}" data-nx="none"` : '';
      return `${font} style="${esc(roleCss(r))}"`;
    }
  }
  if (own) return u.nameStyle ? nameStyleAttrs(u) : ` style="color:${esc(u.nameColor)}"`;
  return _nameStyle35(u);
};

// The switch, under Name Style.
const _nameStyleEditor35 = nameStyleEditor;
nameStyleEditor = function (body) {
  _nameStyleEditor35(body);
  const g = $('#ns-editor', body);
  if (!g || $('#own-color', g)) return;
  g.insertAdjacentHTML('beforeend', `<label class="setting-row own-color-row" style="margin-top:14px">
    <div style="flex:1"><div class="setting-title">Keep my own name color in servers</div>
    <div class="setting-desc">Normally your highest colored role colors your name in a server. Turn this on and everyone sees your own name color or style there instead.</div></div>
    <input type="checkbox" class="switch" id="own-color"${state.me.keepOwnColor ? ' checked' : ''}></label>`);
  $('#own-color', g).addEventListener('change', async e => {
    try {
      const r = await api('PATCH', '/api/me/own-color', { on: e.target.checked });
      state.me.keepOwnColor = r.keepOwnColor; if (state.users[state.me.id]) state.users[state.me.id].keepOwnColor = r.keepOwnColor;
      toast(r.keepOwnColor ? 'Your own name color shows in servers' : 'Role colors show on your name in servers');
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
  });
};

// ======================= nothing goes off screen =======================
// Menus, popovers, cards and tooltips are placed next to what you clicked, which near an edge (or
// on a phone) could push them past the side of the screen. Each one is now nudged back inside as
// soon as it appears or changes size, keeping an 8px gap from the edges.
(() => {
  const SEL = '.menu, .tag-card, .rx-card, .emoji-picker, .cmd-menu, .from-pop, .rail-tip, .ch-tip, .ring-card, .pf-menu, .pbadge-tip, .ask33-card, .tc-card';
  const GAP = 8;
  const fit = el => {
    if (!el.isConnected || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
    // Phone menus are full-width sheets at the bottom on purpose: leave those alone.
    if (el.matches('.m-sheet') || el.closest('.m-sheet')) { if (el.dataset.nudge) { el.style.translate = ''; delete el.dataset.nudge; } return; }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    // Too big for the screen: cap it and let it scroll.
    if (el.offsetWidth > vw - GAP * 2) { el.style.maxWidth = `${vw - GAP * 2}px`; el.style.minWidth = '0'; el.style.boxSizing = 'border-box'; }
    if (el.offsetHeight > vh - GAP * 2 && !el.matches('.pbadge-tip, .rail-tip, .ch-tip')) { el.style.maxHeight = `${vh - GAP * 2}px`; el.style.overflowY = 'auto'; }
    // Measure where it is without any earlier nudge, then nudge it in.
    const prev = el.dataset.nudge ? el.dataset.nudge.split(',').map(Number) : [0, 0];
    const r = el.getBoundingClientRect();
    const left = r.left - prev[0], right = r.right - prev[0], top = r.top - prev[1], bottom = r.bottom - prev[1];
    let dx = 0, dy = 0;
    if (right > vw - GAP) dx = vw - GAP - right;
    if (left + dx < GAP) dx = GAP - left;
    if (bottom > vh - GAP) dy = vh - GAP - bottom;
    if (top + dy < GAP) dy = GAP - top;
    // (0.38.2) Whole pixels, and tiny differences are ignored: moving it changes its style, which
    // made this run again, and sub-pixel sizes came out slightly different every time, so menus
    // (like Add Roles on a profile) kept twitching and flashing.
    dx = Math.round(dx); dy = Math.round(dy);
    if (Math.abs(dx - prev[0]) < 2 && Math.abs(dy - prev[1]) < 2) return;
    el.dataset.nudge = `${dx},${dy}`;
    el.style.translate = dx || dy ? `${dx}px ${dy}px` : '';
  };
  const seen = new WeakSet();
  const ro = new ResizeObserver(entries => entries.forEach(e => fit(e.target)));
  const watch = el => { if (seen.has(el)) return fit(el); seen.add(el); ro.observe(el); requestAnimationFrame(() => fit(el)); };
  const scan = node => {
    if (!(node instanceof Element)) return;
    if (node.matches(SEL)) watch(node);
    node.querySelectorAll?.(SEL).forEach(el => { if (el.offsetWidth) watch(el); });
  };
  new MutationObserver(list => { for (const m of list) { m.addedNodes.forEach(scan); if (m.type === 'attributes' && m.target.matches?.(SEL)) requestAnimationFrame(() => fit(m.target)); } })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  // Hover tooltips (CSS-only) get checked when they show.
  document.addEventListener('mouseover', e => { const t = e.target.closest?.('.pbadge'); const tip = t && $('.pbadge-tip', t); if (tip) requestAnimationFrame(() => setTimeout(() => fit(tip), 160)); }, { passive: true });
  addEventListener('resize', () => document.querySelectorAll(SEL).forEach(el => { if (el.offsetWidth) fit(el); }));
  window.zunoKeepOnScreen = fit;
  // Pop-in animations scale things down while they play, so look again once they finish.
  document.addEventListener('animationend', e => { if (e.target.matches?.(SEL)) fit(e.target); }, true);
})();

// A yes/no box that opens over whatever window is open (confirmDialog closes it first).
function confirmOver(title, text, ok = 'OK', danger = true) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'ask33';
    wrap.innerHTML = `<div class="ask33-card" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="ask33-acts"><button class="btn btn-grey" data-no>Cancel</button><button class="btn ${danger ? 'btn-red' : 'btn-primary'}" data-ok>${esc(ok)}</button></div></div>`;
    ($('#layer') || document.body).appendChild(wrap);
    const done = v => { removeEventListener('keydown', keys, true); wrap.remove(); resolve(v); };
    const keys = e => {
      // (0.38.3) Closed some other way: let go of the keyboard, and never answer "yes" for it.
      if (!wrap.isConnected) { removeEventListener('keydown', keys, true); resolve(false); return; }
      if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    addEventListener('keydown', keys, true);
    $('[data-no]', wrap).addEventListener('click', () => done(false));
    $('[data-ok]', wrap).addEventListener('click', () => done(true));
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) done(false); });
    setTimeout(() => $('[data-ok]', wrap).focus(), 20);
  });
}

// ======================= events: more you can do =======================
// "Add to calendar": a .ics file any calendar app opens.
function eventIcs(sv, e) {
  const ts = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const txt = t => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const ch = e.where.type === 'voice' && sv.channels.find(c => c.id === e.where.channelId);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zuno//Events//EN', 'BEGIN:VEVENT', `UID:${e.id}@zuno`, `DTSTAMP:${ts(Date.now())}`, `DTSTART:${ts(e.startAt)}`, `DTEND:${ts(e.endAt || e.startAt + 2 * 3600e3)}`,
    `SUMMARY:${txt(e.name)}`, `DESCRIPTION:${txt((e.description ? e.description + '\n\n' : '') + `On Zuno, in ${sv.name}`)}`, `LOCATION:${txt(ch ? `🔊 ${ch.name} (${sv.name} on Zuno)` : e.where.text || sv.name)}`,
    ...(e.repeat === 'weekly' ? ['RRULE:FREQ=WEEKLY'] : []), 'END:VEVENT', 'END:VCALENDAR'];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = `${e.name.replace(/[^\w\- ]+/g, '').trim() || 'event'}.ics`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// "In 2 h 15 min"
function eventCountdown(t) {
  const ms = t - Date.now();
  if (ms <= 0) return 'starting now';
  const m = Math.round(ms / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return 'in ' + (d ? `${d} d${h ? ` ${h} h` : ''}` : h ? `${h} h${mm ? ` ${mm} min` : ''}` : `${Math.max(1, mm)} min`);
}
// Everyone who's interested in an event.
async function openEventPeople(sv, e) {
  let d;
  try { d = await api('GET', `/api/servers/${sv.id}/events/${e.id}/people`); } catch (err) { return toast(err.message, true); }
  const wrap = document.createElement('div');
  wrap.className = 'ask33';
  wrap.innerHTML = `<div class="ask33-card ev-people"><h3>⭐ Interested in ${esc(e.name)}</h3>
    <div class="ev-pl">${d.people.length ? d.people.map(u => `<button class="vis-row" data-p="${esc(u.id)}">${avatar(u, 32)}<div><b>${esc(u.displayName)}</b><span class="muted small">@${esc(u.username)}</span></div></button>`).join('') : '<div class="fp-empty">Nobody yet.</div>'}</div>
    <div class="ask33-acts"><button class="btn btn-primary" data-x>Done</button></div></div>`;
  ($('#layer') || document.body).appendChild(wrap);
  for (const u of d.people) state.users[u.id] = { ...state.users[u.id], ...u };
  const close = () => wrap.remove();
  $('[data-x]', wrap).addEventListener('click', close);
  wrap.addEventListener('mousedown', ev => { if (ev.target === wrap) close(); });
  $$('[data-p]', wrap).forEach(b => b.addEventListener('click', () => { close(); closeLayer(); openProfile(b.dataset.p); }));
}

// ======================= video fullscreen that always works =======================
// Some phones (and the Android app) refuse the browser's fullscreen, so the button did nothing.
// When that happens, the player fills the screen itself instead, and the exit button, Esc or the
// phone's back gesture bring it back. With real fullscreen, wide videos also turn sideways.
(() => {
  let fake = null; // { zp, spot }
  const setBtn = (zp, full) => {
    const b = $('.zp-full', zp);
    if (!b) return;
    b.innerHTML = full ? ZP_ICON.exitFull : ZP_ICON.full;
    b.title = full ? 'Exit fullscreen' : 'Fullscreen'; b.setAttribute('aria-label', b.title);
  };
  const enterFake = zp => {
    const spot = document.createComment('zp');
    zp.before(spot);
    const host = document.createElement('div');
    host.className = 'zp-fakefull';
    document.body.appendChild(host);
    host.appendChild(zp); // moving it in the same moment keeps it playing
    zp.classList.add('is-full');
    fake = { zp, spot, host };
    setBtn(zp, true); zp.focus({ preventScroll: true }); zpWake(zp);
    try { history.pushState({ zpFull: 1 }, ''); } catch {}
  };
  const exitFake = (fromBack = false) => {
    if (!fake) return;
    const { zp, spot, host } = fake;
    fake = null;
    // The chat may have redrawn meanwhile: then it goes back in place of its redrawn copy.
    const fresh = !spot.isConnected && $(`#messages .zp[data-zp="${CSS.escape(zp.dataset.zp || '')}"]`);
    if (spot.isConnected) spot.replaceWith(zp); else if (fresh) fresh.replaceWith(zp); else zp.remove();
    host.remove();
    zp.classList.remove('is-full'); setBtn(zp, false);
    if (!fromBack && history.state?.zpFull) try { history.back(); } catch {}
  };
  addEventListener('popstate', () => exitFake(true));
  addEventListener('keydown', e => { if (fake && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exitFake(); } }, true);
  zpFullscreen = async function (zp) {
    const v = zpVideo(zp);
    if (fake) return exitFake();
    if (document.fullscreenElement) return document.exitFullscreen();
    if (zp.requestFullscreen) {
      try {
        await zp.requestFullscreen({ navigationUI: 'hide' });
        if (v.videoWidth > v.videoHeight) screen.orientation?.lock?.('landscape').catch(() => {});
        return;
      } catch {}
    }
    // iPhone: only the video itself can go fullscreen.
    if (v.webkitEnterFullscreen && /iP(hone|od|ad)/.test(navigator.userAgent)) return v.webkitEnterFullscreen();
    enterFake(zp);
  };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) screen.orientation?.unlock?.(); });
})();

// ======================= "N new messages" bar goes away once you've seen them =======================
// It showed whenever the "new" line was above you, and also when that line wasn't drawn at all
// (older messages get unloaded), so it could stay after you'd read everything. Now, once you reach
// the bottom of the chat or the line comes into view, those messages count as seen and the bar
// stays gone (the line itself stays as a marker).
const _updateUnreadBar35 = updateUnreadBar;
updateUnreadBar = function (...a) {
  const el = $('#messages'), convo = state.convos[activeConv()];
  if (el && convo?.dividerId) {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const div = $('.new-divider', el);
    const box = el.getBoundingClientRect(), r = div?.getBoundingClientRect();
    const lineSeen = r && r.bottom > box.top && r.top < box.bottom;
    if ((atBottom && document.hasFocus()) || lineSeen) convo.barSeenFor = convo.dividerId;
    if (convo.barSeenFor === convo.dividerId) { $('.chat .unread-bar')?.remove(); return; }
  }
  return _updateUnreadBar35(...a);
};
// Coming back to the window at the bottom of a chat counts as seeing it too.
addEventListener('focus', () => { try { updateUnreadBar(); } catch {} });

// ======================= forum voting =======================
// In a forum with Voting on, a post's thread starts with 👍 / 👎 buttons (they're the post's own
// reactions, so the counts match everywhere).
const _drawThread35 = drawThread;
drawThread = function (...a) {
  const r = _drawThread35(...a);
  const tv = threadView, box = $('#thread-panel .tp-parent');
  const d = tv && forum.data[tv.thread?.channelId];
  if (!box || !tv.parent?.post || !d?.voting) return r;
  $('.fm-votebar', box)?.remove();
  const rx = tv.parent.reactions || {}, up = rx['👍'] || [], down = rx['👎'] || [];
  box.insertAdjacentHTML('beforeend', `<div class="fm-votebar"><span class="muted small">Vote on this post</span>
    <button class="fm-vote up${up.includes(state.me.id) ? ' on' : ''}" data-fmvote="👍">👍 <b>${up.length}</b></button>
    <button class="fm-vote down${down.includes(state.me.id) ? ' on' : ''}" data-fmvote="👎">👎 <b>${down.length}</b></button></div>`);
  $$('[data-fmvote]', box).forEach(b => b.addEventListener('click', async () => {
    const emoji = b.dataset.fmvote, other = emoji === '👍' ? '👎' : '👍';
    try {
      // One vote each: voting the other way takes back the first.
      const cur = tv.parent.reactions || {};
      if ((cur[other] || []).includes(state.me.id)) tv.parent = (await api('POST', `/api/channels/${tv.thread.channelId}/messages/${tv.parent.id}/react`, { emoji: other })).message || tv.parent;
      const res = await api('POST', `/api/channels/${tv.thread.channelId}/messages/${tv.parent.id}/react`, { emoji });
      if (res.message) tv.parent = res.message;
      drawThread();
      reloadForumSoon?.(tv.thread.channelId);
    } catch (e) { toast(e.message, true); }
  }));
  return r;
};
