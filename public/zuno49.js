'use strict';
// Zuno 0.49 (phones): swipe gestures like big chat apps, a "Messages" home, and more life.
//  - Swipe right anywhere in a chat: the chat slides away and your servers and chats appear. It
//    follows your finger; let go past the middle or flick fast to open it, otherwise it slides back.
//    Swipe left (or tap the edge of the chat) to go back.
//  - Swipe a message to the left to reply to it.

const isPhone49 = () => VW <= 760;

// ======================= the side menu follows your finger =======================
{
  const app = document.getElementById('app');
  const PEEK = 56; // how much of the chat stays visible while the menu is open
  let g = null; // the gesture in progress
  const busy = () => document.querySelector('#layer .overlay, #layer .settings, #layer .menu, #layer .m-sheet, #thread-panel, .lightbox, .lb33, body.in-call-full');
  // Things that scroll or drag sideways on their own keep their swipes.
  const ownsSwipe = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches?.('input, textarea, select, [contenteditable="true"], .zp, video, .gallery, .msg-media, .quick-react, .tb-tools, pre, code, .emoji-picker, .gif-picker, .slider, [data-noswipe]')) return true;
      if (n.scrollWidth > n.clientWidth + 4) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  };
  const main = () => app.querySelector('.main');
  const width = () => innerWidth - PEEK;
  // (0.50.1) Only the chat panel moves, and at most once per frame: no style changes on the rest
  // of the app (they made the browser redo every element's style on each finger movement).
  let raf = 0, pendingX = 0, mEl = null;
  const setX = x => {
    pendingX = Math.max(0, Math.min(width(), x));
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (mEl) mEl.style.transform = `translate3d(${pendingX}px,0,0)`; });
  };
  const finish = open => {
    const m = main();
    cancelAnimationFrame(raf); raf = 0;
    if (m) m.style.transform = '';
    app.classList.toggle('show-nav', open);
    if (!open) document.activeElement?.blur?.();
  };

  document.addEventListener('touchstart', e => {
    g = null;
    if (!isPhone49() || e.touches.length !== 1 || app.classList.contains('hidden') || busy()) return;
    const t = e.touches[0];
    const open = app.classList.contains('show-nav');
    const inMain = !!e.target.closest('.main');
    if (!open && !inMain) return;
    if (!open && ownsSwipe(e.target)) return;
    g = { x0: t.clientX, y0: t.clientY, open, decided: false, horiz: false, row: open ? null : e.target.closest('#messages .msg[data-id]:not(.pending)'), pts: [[t.clientX, performance.now()]], mode: null };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.decided = true;
      g.horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (!g.horiz) { g = null; return; }
      // Which gesture: a message swiped left = reply; otherwise the side menu.
      if (!g.open && dx < 0 && g.row) g.mode = 'reply';
      else if (!g.open && dx > 0) g.mode = 'open';
      else if (g.open && dx < 0) g.mode = 'close';
      else { g = null; return; }
      if (g.mode !== 'reply') { mEl = main(); mEl?.classList.add('drag49m'); } // only the chat panel changes, so nothing else is restyled
    }
    g.pts.push([t.clientX, performance.now()]);
    if (g.pts.length > 6) g.pts.shift();
    if (g.mode === 'reply') {
      const x = Math.max(-96, Math.min(0, dx));
      g.row.style.transform = `translateX(${x}px)`;
      g.row.classList.add('swipe49');
      const ready = x < -64;
      if (ready && !g.row.classList.contains('ready49')) navigator.vibrate?.(8);
      g.row.classList.toggle('ready49', ready);
      g.row.style.setProperty('--sw49', Math.min(1, -x / 64).toFixed(2));
      return;
    }
    setX(g.mode === 'open' ? dx : width() + dx);
  }, { passive: true }); // never holds up scrolling; sideways swipes are Zuno's through touch-action in the CSS

  const end = () => {
    if (!g || !g.mode) { g = null; return; }
    const pts = g.pts, a = pts[0], b = pts[pts.length - 1];
    const v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]); // px per ms; + is to the right
    const dx = b[0] - g.x0;
    if (g.mode === 'reply') {
      const row = g.row, go = dx < -64;
      row.style.transition = 'transform .25s var(--ease-out, ease-out)';
      row.style.transform = '';
      setTimeout(() => { row.style.transition = ''; row.classList.remove('swipe49', 'ready49'); row.style.removeProperty('--sw49'); }, 260);
      if (go) startReply(row.dataset.id);
    } else {
      mEl?.classList.remove('drag49m');
      const at = g.mode === 'open' ? dx : width() + dx; // where the chat is now
      // A quick flick decides on its own; a slow drag goes by how far it got.
      const open = Math.abs(v) > 0.45 ? v > 0 : at > width() / 2;
      finish(open);
    }
    g = null;
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });

  // With the menu open, tapping the edge of the chat that still shows brings it back.
  document.addEventListener('click', e => {
    if (!isPhone49() || !app.classList.contains('show-nav') || !e.target.closest('.main')) return;
    e.preventDefault(); e.stopPropagation();
    finish(false);
  }, true);
}

// ======================= "Messages" at the top of your chats =======================
// Like big chat apps on phones: a title, search, Add Friends and a new-chat button.
const _renderSidebar49 = renderSidebar;
renderSidebar = function (...a) {
  const r = _renderSidebar49(...a);
  const top = $('#sidebar-top');
  if (!top || state.currentServerId) return r;
  // Friends / Message Requests / Bloom side by side, as chips that scroll sideways if they don't fit.
  const items = $$('#sidebar-scroll > .nav-item');
  if (items.length && !items[0].parentElement.classList.contains('chips49')) {
    const row = document.createElement('div');
    row.className = 'chips49';
    items[0].before(row);
    row.append(...items);
  }
  // Short names, so all the chips fit on a phone.
  for (const [id, from, to] of [['nav-requests', 'Message Requests', 'Requests'], ['nav-bloom', 'Zuno Bloom', 'Bloom']]) {
    const b = document.getElementById(id);
    if (!b) continue;
    for (const n of b.childNodes) if (n.nodeType === 3 && n.textContent.trim() === from) n.textContent = n.textContent.replace(from, to);
    for (const sp of b.querySelectorAll('span')) if (sp.childElementCount === 0 && sp.textContent.trim() === from) sp.textContent = to;
  }
  if (!$('.mh49', top)) {
    top.insertAdjacentHTML('afterbegin', `<div class="mh49"><h2>Messages</h2><div class="mh49-row">
      <button type="button" class="mh49-ic" data-mh49="search" title="Search" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>
      <button type="button" class="mh49-add" data-mh49="add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M19 8v6M16 11h6"/></svg>Add Friends</button>
      <button type="button" class="mh49-new" data-mh49="new" title="New message or group" aria-label="New message or group"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
    </div></div>`);
    $$('[data-mh49]', top).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.mh49;
      if (k === 'search') $('#find-btn')?.click();
      if (k === 'add') { showFriends('add'); $('#app').classList.remove('show-nav'); }
      if (k === 'new') $('#group-new')?.click();
    }));
  }
  return r;
};

// ======================= a little more life =======================
// The chat list slides in row by row when you open it; new tabs give a small bounce.
{
  const app = document.getElementById('app');
  let was = app.classList.contains('show-nav');
  new MutationObserver(() => {
    const now = app.classList.contains('show-nav');
    if (now && !was && isPhone49()) {
      $$('#dm-list > .dm-item, #sidebar-scroll .ch-item').slice(0, 14).forEach((el, i) => {
        el.classList.remove('in49'); void el.offsetWidth;
        el.style.setProperty('--i49', i);
        el.classList.add('in49');
      });
    }
    was = now;
  }).observe(app, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('click', e => {
    const b = e.target.closest('.tabbar38 button');
    if (!b) return;
    b.classList.remove('bounce49'); void b.offsetWidth; b.classList.add('bounce49');
  });
}
