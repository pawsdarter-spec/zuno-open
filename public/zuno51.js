// ======================= Zuno 0.51 =======================
// Phones: emoji, GIF and sticker pickers open as a sheet where the keyboard would be, and never pop
// the keyboard up (it only comes up when you tap a search box yourself). Picking an emoji keeps the
// sheet open, like Discord. Profiles open as a sheet from the bottom that you can drag down to close.
// Big screens: a Discord-like frame (one panel with a rounded corner, your account bar across the
// bottom of the left side).
(() => {
  const phone51 = () => (typeof isPhone === 'function' ? isPhone() : innerWidth < 760);

  // ---------- no keyboard when a picker opens ----------
  let quietUntil = 0;
  const quiet = ms => { quietUntil = performance.now() + ms; };
  const _focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...a) {
    if (performance.now() < quietUntil && this.matches?.('input, textarea, [contenteditable="true"]')) return;
    return _focus.apply(this, a);
  };
  // Tapping a text box yourself always works.
  document.addEventListener('pointerdown', e => { if (e.target.closest?.('input, textarea, [contenteditable="true"]')) quietUntil = 0; }, true);
  // Taps inside a picker (choosing an emoji or sticker) don't bring the keyboard back either.
  document.addEventListener('pointerdown', e => {
    if (phone51() && e.target.closest?.('.emoji-picker, .sticker-pop') && !e.target.closest('input')) quiet(900);
  }, true);

  const hush = name => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (anchor, ...rest) {
      if (!phone51()) return orig.call(this, anchor, ...rest);
      const ae = document.activeElement;
      if (ae && ae.matches?.('input, textarea')) ae.blur();
      quiet(2500);
      const r = orig.call(this, anchor, ...rest);
      if (name === 'openEmojiPicker' && anchor?.id === 'composer-emoji') $$('.emoji-picker').pop()?.classList.add('cmp51');
      return r;
    };
  };
  ['openEmojiPicker', 'openGifPicker', 'openStickerPicker'].forEach(hush);

  // Emoji picked from the message box: the sheet stays open so you can add more.
  const _close = window.closeEmojiPicker;
  if (typeof _close === 'function') {
    let keep = false;
    document.addEventListener('pointerdown', e => { keep = phone51() && !!e.target.closest?.('.emoji-picker.cmp51 .ep-e'); }, true);
    window.closeEmojiPicker = function (...a) {
      if (keep) { keep = false; return; }
      return _close.apply(this, a);
    };
  }

  // While a picker sheet is open the chat makes room for it, so the message box sits on top of it.
  const room = () => {
    const sheet = phone51() && ($('.emoji-picker') || $('#layer .sticker-pop'));
    const root = document.documentElement;
    if (!sheet) { if (root.classList.contains('pk51')) { root.classList.remove('pk51'); root.style.removeProperty('--pk51'); } return; }
    const msgs = $('#messages');
    const atBottom = msgs && msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
    // Taps above the sheet reach the chat (tapping the message box brings the keyboard back).
    $$('.ep-shield').forEach(s => { s.style.pointerEvents = 'none'; });
    const sh = sheet.previousElementSibling;
    if (sheet.classList.contains('sticker-pop') && sh && !sh.className) sh.style.pointerEvents = 'none';
    root.style.setProperty('--pk51', sheet.offsetHeight + 'px');
    root.classList.add('pk51');
    if (atBottom) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  };
  const closeSheet = () => {
    if ($('.emoji-picker')) closeEmojiPicker.call(null);
    if ($('#layer .sticker-pop')) closeLayer();
  };
  let swallow = null;
  document.addEventListener('pointerdown', e => {
    if (!document.documentElement.classList.contains('pk51')) return;
    const t = e.target;
    if (t.closest?.('.emoji-picker, #layer .sticker-pop, #layer .menu')) return;
    // The emoji button while the sheet is open switches to the keyboard, like Discord.
    const btn = t.closest?.('#composer-emoji, #composer-gif, #composer-more');
    $$('.emoji-picker.cmp51').forEach(p => p.classList.remove('cmp51'));
    closeSheet();
    if (btn?.id === 'composer-emoji') swallow = btn;
  }, true);
  document.addEventListener('click', e => {
    if (swallow && e.target.closest?.('button') === swallow) {
      e.stopPropagation(); e.preventDefault();
      if (swallow.id === 'composer-emoji') { quietUntil = 0; const ta = $('#composer-input'); if (ta) _focus.call(ta); }
    }
    swallow = null;
  }, true);
  let rq = 0;
  const later = () => { if (!rq) rq = requestAnimationFrame(() => { rq = 0; room(); }); };
  new MutationObserver(later).observe(document.body, { childList: true });
  const layer = $('#layer');
  if (layer) new MutationObserver(later).observe(layer, { childList: true });

  // ---------- message box: the ⋯ button tucks away while you type (like Discord) ----------
  document.addEventListener('input', e => {
    if (e.target.id !== 'composer-input') return;
    const box = e.target.closest('.composer-box');
    if (box) box.classList.toggle('typing51', !!e.target.value);
  }, true);

  // ---------- profiles on phones: a sheet from the bottom ----------
  const CALL = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  const VID = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>';
  const MSG = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>';

  const sheetify = (modal, id) => {
    if (modal.dataset.s51) return;
    modal.dataset.s51 = '1';
    const ov = modal.closest('.overlay');
    ov?.classList.add('sheet51-ov');
    modal.classList.add('sheet51');
    const grab = document.createElement('div');
    grab.className = 'grab51';
    modal.prepend(grab);

    // Message / Call / Video as big buttons under the picture.
    const msgBtn = $('.pf-bar [data-a="msg"]', modal);
    const head = $('.pc-head', modal);
    if (msgBtn && head && id !== state.me?.id) {
      const friend = typeof relationshipWith === 'function' && relationshipWith(id) === 'friend' && !state.users?.[id]?.bot;
      const row = document.createElement('div');
      row.className = 'acts51';
      row.innerHTML = `<button type="button" data-x51="msg">${MSG}<span>Message</span></button>`
        + (friend && typeof Calls !== 'undefined' && Calls.startDM ? `<button type="button" data-x51="call">${CALL}<span>Call</span></button><button type="button" data-x51="video">${VID}<span>Video</span></button>` : '');
      head.after(row);
      modal.classList.add('has-acts51');
      row.addEventListener('click', e => {
        const b = e.target.closest('[data-x51]');
        if (!b) return;
        const what = b.dataset.x51;
        if (what === 'msg') return msgBtn.click();
        closeLayer();
        Calls.startDM(id, { video: what === 'video' });
      });
    }

    // Drag down to close (from the top part, or anywhere once the card is scrolled to the top).
    const card = $('.pcard', modal);
    let y0 = 0, t0 = 0, dy = 0, drag = false, armed = false, raf = 0, lastY = 0, lastT = 0, v = 0;
    const set = () => { raf = 0; modal.style.transform = `translate3d(0,${Math.max(0, dy)}px,0)`; if (ov) ov.style.backgroundColor = `rgba(0,0,0,${0.6 * Math.max(0, 1 - dy / 500)})`; };
    modal.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || e.target.closest('input, textarea, .pf-menu')) { armed = false; return; }
      armed = !card || card.scrollTop <= 0 || !!e.target.closest('.grab51, .banner, .pc-head');
      y0 = lastY = e.touches[0].clientY; t0 = lastT = performance.now(); dy = 0; drag = false; v = 0;
    }, { passive: true });
    modal.addEventListener('touchmove', e => {
      if (!armed) return;
      const y = e.touches[0].clientY, now = performance.now();
      const d = y - y0;
      if (!drag) {
        if (d > 8) { drag = true; modal.classList.add('drag51'); y0 = y; }
        else if (d < -4) { armed = false; return; }
        else return;
      }
      e.preventDefault();
      dy = y - y0;
      v = (y - lastY) / Math.max(1, now - lastT); lastY = y; lastT = now;
      if (!raf) raf = requestAnimationFrame(set);
    }, { passive: false });
    const end = () => {
      if (!drag) return;
      drag = false; armed = false;
      modal.classList.remove('drag51');
      if (dy > 140 || v > 0.6) {
        modal.style.transform = 'translate3d(0,110%,0)';
        if (ov) ov.style.backgroundColor = 'rgba(0,0,0,0)';
        setTimeout(() => { if (modal.isConnected) closeLayer(); }, 220);
      } else {
        modal.style.transform = '';
        if (ov) ov.style.backgroundColor = '';
      }
      void t0;
    };
    modal.addEventListener('touchend', end);
    modal.addEventListener('touchcancel', end);
  };

  const _open = window.openProfile;
  if (typeof _open === 'function') {
    window.openProfile = function (id, ...rest) {
      const r = _open.call(this, id, ...rest);
      if (phone51()) {
        let n = 0;
        const tick = () => {
          const modal = $('#layer .modal:has(> .pcard)');
          if (modal) return sheetify(modal, id);
          if (++n < 40) setTimeout(tick, 50);
        };
        tick();
      }
      return r;
    };
  }

  // ---------- big screens: Discord-like frame ----------
  // The account bar (and the voice bar above it) move into a dock across the bottom of the dock
  // and the side list. Moved back when the window gets narrow.
  const wide = () => matchMedia('(min-width: 1000px)').matches && !matchMedia('(pointer: coarse)').matches;
  let dock = null, ro = null;
  const placeDock = () => {
    const up = $('#user-panel'), vb = $('#voice-bar'), side = $('#sidebar');
    if (!up || !vb || !side) return;
    const root = document.documentElement;
    if (wide()) {
      if (!dock) {
        dock = document.createElement('div');
        dock.className = 'dock51';
        ro = new ResizeObserver(() => root.style.setProperty('--dock51', (dock.offsetHeight + 16) + 'px'));
        ro.observe(dock);
      }
      if (up.parentNode !== dock) { dock.append(vb, up); document.body.append(dock); }
      root.classList.add('frame51');
    } else if (dock && up.parentNode === dock) {
      side.append(vb, up);
      dock.remove();
      root.classList.remove('frame51');
    }
  };
  placeDock();
  addEventListener('resize', () => { clearTimeout(placeDock.t); placeDock.t = setTimeout(placeDock, 120); });
})();
