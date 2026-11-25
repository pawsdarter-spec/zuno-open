// ======================= Zuno 0.52: pictures on phones =======================
// Opening a picture on a phone shows it full screen with who sent it (and their message) at the
// bottom. Tap once to hide everything but the picture, tap again to bring it back. Pinch or
// double-tap to zoom, drag to look around, swipe down to close, and hold for Save, Forward, Share,
// Open in Browser and Jump to Message.
(() => {
  const phone52 = () => (typeof isPhone === 'function' ? isPhone() : innerWidth < 760);
  let uiOff = false; // remembered while you flip between pictures

  const ic = {
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l5 5-5 5"/><path d="M20 11H10a6 6 0 0 0-6 6v2"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m-4 4 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 0-3.2 6.4L20 20l-.8-3.4A8 8 0 0 0 20 12z"/><path d="M9 12h6m-2-2 2 2-2 2"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    react: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>',
  };

  // The message a picture came from (if it's in the open chat).
  const findMessage = src => {
    const node = $$('#messages [data-full], #thread-panel [data-full]').find(n => n.dataset.full === src);
    const row = node?.closest('.msg[data-id]');
    if (!row) return null;
    const conv = typeof activeConv === 'function' ? activeConv() : null;
    const m = conv && state.convos?.[conv]?.messages?.find(x => x.id === row.dataset.id);
    return m ? { m, conv } : null;
  };

  const absolute = src => { try { return new URL(src, location.href).href; } catch { return src; } };

  async function save(src, name) {
    try {
      const r = await fetch(src, { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = name || 'picture'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Saved');
    } catch {
      const a = document.createElement('a');
      a.href = src; a.download = name || ''; a.target = '_blank'; a.rel = 'noopener';
      document.body.append(a); a.click(); a.remove();
    }
  }
  async function share(src, name) {
    const url = absolute(src);
    try {
      if (navigator.share) {
        try {
          const r = await fetch(src, { credentials: 'same-origin' });
          const blob = await r.blob();
          const file = new File([blob], name || 'picture', { type: blob.type || 'image/png' });
          if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file] });
        } catch (err) { if (err?.name === 'AbortError') return; }
        return await navigator.share({ url });
      }
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch (err) { if (err?.name !== 'AbortError') toast("Couldn't share that", true); }
  }

  function holdSheet(ov, src, name, found) {
    if ($('.lbs52', ov)) return;
    const items = [
      ['save', 'Save', ic.save],
      found && typeof openForward === 'function' ? ['fwd', 'Forward', ic.fwd] : null,
      ['share', 'Share', ic.share],
      ['link', 'Copy Link', ic.link],
      ['open', 'Open in Browser', ic.open],
      found ? ['jump', 'Jump to Message', ic.jump] : null,
    ].filter(Boolean);
    const wrap = document.createElement('div');
    wrap.className = 'lbs52';
    wrap.innerHTML = `<div class="lbs52-dim"></div><div class="lbs52-sheet"><div class="lbs52-grab"></div><div class="lbs52-list">${items.map(([k, label, svg]) => `<button type="button" data-k="${k}">${svg}<span>${label}</span></button>`).join('')}</div></div>`;
    ov.append(wrap);
    // The finger that opened the menu lifts over it: that first click isn't a choice.
    let fresh = true;
    wrap.addEventListener('click', e => { if (fresh) { fresh = false; e.stopPropagation(); e.preventDefault(); } }, true);
    wrap.addEventListener('pointerdown', () => { fresh = false; }, true);
    const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); };
    $('.lbs52-dim', wrap).addEventListener('click', e => { e.stopPropagation(); close(); });
    // Drag the sheet down to put it away.
    const sheet = $('.lbs52-sheet', wrap);
    let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    sheet.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translate3d(0,${dy}px,0)`; }, { passive: true });
    sheet.addEventListener('touchend', () => { sheet.style.transition = ''; if (dy > 80) close(); else sheet.style.transform = ''; y0 = null; });
    $('.lbs52-list', wrap).addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      close();
      if (k === 'save') save(src, name);
      else if (k === 'share') share(src, name);
      else if (k === 'link') navigator.clipboard?.writeText(absolute(src)).then(() => toast('Link copied'), () => toast("Couldn't copy that", true));
      else if (k === 'open') window.open(absolute(src), '_blank', 'noopener');
      else if (k === 'fwd') { closeLayer(); openForward(found.conv, found.m.id); }
      else if (k === 'jump') { closeLayer(); jumpToMessage(found.m.id); }
    });
  }

  function phoneViewer(ov, src, name) {
    const box = $('.lb33', ov), stage = $('.lb33-stage', ov), img = $('.lb33-img', ov);
    if (!box || !stage || !img || ov.dataset.v52) return;
    ov.dataset.v52 = '1';
    ov.classList.add('v52');
    ov.classList.toggle('ui52-off', uiOff);
    const found = findMessage(src);

    // Who sent it, at the bottom.
    if (found) {
      const { m } = found, u = typeof user === 'function' ? user(m.authorId) : null;
      const text = (m.content || '').replace(/(\*\*|\*|__|~~|`)(.+?)\1/g, '$2').trim();
      const bar = document.createElement('div');
      bar.className = 'lbm52';
      bar.innerHTML = `<div class="lbm52-head">${u && typeof avatar === 'function' ? avatar(u, 40) : ''}<div class="lbm52-who"><b${u?.nameColor ? ` style="color:${esc(u.nameColor)}"` : ''}>${esc(u?.displayName || 'Someone')}</b><span>${esc(typeof fmtTime === 'function' ? fmtTime(m.createdAt) : '')}</span></div></div>`
        + (text ? `<div class="lbm52-text">${esc(text)}</div>` : '')
        + (typeof toggleReaction === 'function' && typeof openEmojiPicker === 'function' ? `<button type="button" class="lbm52-react">${ic.react}<span>React</span></button>` : '');
      ov.append(bar);
      $('.lbm52-react', bar)?.addEventListener('click', e => {
        e.stopPropagation();
        openEmojiPicker(e.currentTarget, emoji => { toggleReaction(m.id, emoji); toast(`Reacted ${emoji}`); }, { title: 'React' });
      });
      bar.addEventListener('click', e => e.stopPropagation());
    }

    // ---- our own gestures (the desktop ones stay for mice) ----
    const MAX = 6;
    let fit = 1, s = 1, tx = 0, ty = 0;
    const rect = () => stage.getBoundingClientRect();
    const measure = () => {
      if (!img.naturalWidth) return;
      const r = rect();
      fit = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight, 3);
    };
    const apply = (smooth, dim = 0) => {
      img.style.transition = smooth ? 'transform .26s cubic-bezier(.2,.9,.3,1)' : 'none';
      img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${fit * s})`;
      box.classList.toggle('zoomed', s > 1.01);
      ov.style.backgroundColor = dim ? `rgba(0,0,0,${0.92 * (1 - dim)})` : '';
    };
    const limits = sc => {
      const r = rect();
      return [Math.max(0, (img.naturalWidth * fit * sc - r.width) / 2), Math.max(0, (img.naturalHeight * fit * sc - r.height) / 2)];
    };
    const clamp = () => { const [mx, my] = limits(s); tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
    const settle = () => { if (s < 1) { s = 1; tx = 0; ty = 0; } if (s > MAX) s = MAX; clamp(); apply(true); };
    // Zoom so the point (cx, cy) on screen stays where it is.
    const zoomTo = (ns, cx, cy) => {
      const r = rect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
      tx = ox - (ox - tx) * (ns / s); ty = oy - (oy - ty) * (ns / s); s = ns;
      if (s <= 1.01) { s = 1; tx = 0; ty = 0; }
      clamp(); apply(true);
    };
    const ready = () => { measure(); s = 1; tx = 0; ty = 0; apply(false); };
    img.complete ? ready() : img.addEventListener('load', ready, { once: true });
    const onResize = () => { if (!ov.isConnected) return removeEventListener('resize', onResize); setTimeout(() => { measure(); clamp(); apply(false); }, 30); };
    addEventListener('resize', onResize);

    const pts = new Map();
    let g = null, lastTap = 0, tapTimer = 0, holdTimer = 0, held = false;
    const toggleUi = () => { uiOff = !uiOff; ov.classList.toggle('ui52-off', uiOff); };
    const mid = () => { const [a, b] = [...pts.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1])]; };

    ov.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !e.target.closest('.lb33-stage') || e.target.closest('.lbs52, .lbm52')) return;
      e.stopPropagation();
      try { stage.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      clearTimeout(holdTimer);
      if (pts.size === 1) {
        held = false;
        g = { kind: 'one', sx: e.clientX, sy: e.clientY, tx, ty, t: performance.now(), moved: false, lastY: e.clientY, lastT: performance.now(), vy: 0 };
        holdTimer = setTimeout(() => { if (g && !g.moved && pts.size === 1) { held = true; navigator.vibrate?.(12); holdSheet(ov, src, name, found); } }, 450);
      } else if (pts.size === 2) {
        const [mx, my, d] = mid();
        g = { kind: 'pinch', d, s, mx, my, tx, ty };
        clearTimeout(tapTimer);
      }
    }, true);
    ov.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      e.stopPropagation();
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (!g) return;
      if (g.kind === 'pinch' && pts.size === 2) {
        const [mx, my, d] = mid();
        const r = rect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let ns = g.s * d / g.d;
        if (ns > MAX) ns = MAX + (ns - MAX) * 0.25; // a little give past the limits
        if (ns < 1) ns = 1 - (1 - ns) * 0.4;
        // The spot that was under your fingers follows them.
        tx = (mx - cx) - (g.mx - cx - g.tx) * (ns / g.s);
        ty = (my - cy) - (g.my - cy - g.ty) * (ns / g.s);
        s = ns;
        apply(false);
        return;
      }
      if (g.kind !== 'one') return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) > 10) { g.moved = true; clearTimeout(holdTimer); }
      if (!g.moved) return;
      const now = performance.now();
      g.vy = (e.clientY - g.lastY) / Math.max(1, now - g.lastT); g.lastY = e.clientY; g.lastT = now;
      if (s > 1.01) {
        const [mx, my] = limits(s);
        let nx = g.tx + dx, ny = g.ty + dy;
        // Past the edge it drags slower, then springs back.
        if (Math.abs(nx) > mx) nx = Math.sign(nx) * (mx + (Math.abs(nx) - mx) * 0.3);
        if (Math.abs(ny) > my) ny = Math.sign(ny) * (my + (Math.abs(ny) - my) * 0.3);
        tx = nx; ty = ny; apply(false);
      } else if (g.down || (Math.abs(dy) > Math.abs(dx) * 1.2)) {
        // Not zoomed: drag up or down to close.
        g.down = true;
        tx = dx * 0.3; ty = dy;
        apply(false, Math.min(0.85, Math.abs(dy) / 450));
      }
    }, true);
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      e.stopPropagation();
      pts.delete(e.pointerId);
      clearTimeout(holdTimer);
      if (!g) return;
      if (g.kind === 'pinch') {
        if (pts.size === 1) { const [p] = [...pts.values()]; g = { kind: 'one', sx: p[0], sy: p[1], tx, ty, moved: true, lastY: p[1], lastT: performance.now(), vy: 0 }; settle(); return; }
        g = null; settle(); return;
      }
      if (pts.size) return;
      const one = g; g = null;
      if (held) return;
      if (one.down) {
        if (Math.abs(ty) > 130 || Math.abs(one.vy) > 0.7) {
          ty = (ty < 0 ? -1 : 1) * innerHeight; apply(true, 1);
          setTimeout(() => { if (ov.isConnected) dismissLayer(); }, 200);
        } else { tx = 0; ty = 0; apply(true); }
        return;
      }
      if (one.moved) { settle(); return; }
      // A tap: two quick ones zoom, one on its own shows or hides everything around the picture.
      const now = performance.now();
      if (now - lastTap < 300) {
        lastTap = 0; clearTimeout(tapTimer);
        if (s > 1.01) { s = 1; tx = 0; ty = 0; apply(true); } else zoomTo(2.5, e.clientX, e.clientY);
      } else {
        lastTap = now;
        tapTimer = setTimeout(toggleUi, 300);
      }
    };
    ov.addEventListener('pointerup', up, true);
    ov.addEventListener('pointercancel', up, true);
    // Taps are handled above: the old "click to zoom" and "click outside to close" are off on phones.
    ov.addEventListener('dblclick', e => { if (e.target.closest('.lb33-stage')) { e.stopPropagation(); e.preventDefault(); } }, true);
    ov.addEventListener('click', e => { if (e.target.closest('.lb33-stage') && !e.target.closest('.lbs52')) { e.stopPropagation(); e.preventDefault(); } }, true);
    // Holding a picture: our menu, not the browser's or the right-click one.
    ov.addEventListener('contextmenu', e => { if (e.target.closest('.lb33-stage')) { e.preventDefault(); e.stopPropagation(); } }, true);
    // Left/right swipes go to other pictures only when not zoomed and not dragging down.
    ov.addEventListener('touchend', e => { if (box.classList.contains('zoomed') || Math.abs(ty) > 20) e.stopPropagation(); }, true);
  }

  const _open = window.openLightbox;
  if (typeof _open === 'function') {
    window.openLightbox = function (src, name = '', ...rest) {
      const r = _open.call(this, src, name, ...rest);
      if (phone52()) {
        const ov = $('#layer .lb33-ov:last-of-type') || $$('#layer .lb33-ov').pop();
        if (ov) phoneViewer(ov, src, name);
      }
      return r;
    };
  }
})();
