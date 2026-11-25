'use strict';
// Zuno 0.41: #channel links, a formatting bar for messages, and the Editor (draw your own
// decorations, profile effects and name banners right in Zuno, over the kit).

// ======================= #channel links =======================
// Typing "#" in a server shows its channels; "#general" in a message becomes a link to it.
{
  const chanPool = () => {
    const sv = state.view?.type === 'channel' && typeof currentServer === 'function' ? currentServer() : null;
    return (sv?.channels || []).filter(c => c.type !== 'voice' && c.type !== 'category');
  };
  const _formatMessage41 = formatMessage;
  formatMessage = function (text) {
    const html = _formatMessage41(text);
    if (!html.includes('#')) return html;
    const chans = chanPool();
    if (!chans.length) return html;
    const byName = new Map();
    for (const c of chans) if (!byName.has(c.name.toLowerCase())) byName.set(c.name.toLowerCase(), c);
    // Match the server's real channel names (longest first), so names with emoji,
    // symbols like "│" or spaces (forums) link too, not only plain letters.
    const byEsc = new Map([...byName.values()].map(c => [esc(c.name).toLowerCase(), c]));
    const alts = [...byEsc.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const NAME = new RegExp(`(^|[\\s(])#(${alts.join('|')})(?![\\p{L}\\p{N}_-])`, 'giu');
    let skip = 0, afterMention = false;
    // Only plain text is changed: never inside a tag, code, a link or an existing mention.
    return html.split(/(<[^>]+>)/).map(seg => {
      if (seg.startsWith('<')) {
        const m = /^<(\/?)(code|pre|a)\b/i.exec(seg);
        if (m) skip = Math.max(0, skip + (m[1] ? -1 : 1));
        afterMention = /^<span[^>]*class="mention/.test(seg);
        return seg;
      }
      if (skip || afterMention) { afterMention = false; return seg; }
      return seg.replace(NAME, (all, pre, name) => {
        const c = byEsc.get(name.toLowerCase());
        return c ? `${pre}<span class="mention channel" data-goto-ch="${esc(c.id)}">#${esc(c.name)}</span>` : all;
      });
    }).join('');
  };

  function wireChannelAc(ta, container) {
    let box = null, items = [], sel = 0, range = null;
    const close = () => { box?.remove(); box = null; items = []; };
    const pick = i => {
      const c = items[i];
      if (!c || !range) return;
      const text = '#' + c.name + ' ';
      ta.value = ta.value.slice(0, range[0]) + text + ta.value.slice(range[1]);
      const pos = range[0] + text.length;
      ta.setSelectionRange(pos, pos);
      close();
      ta.dispatchEvent(new Event('input'));
    };
    const draw = q => {
      if (!box) { box = document.createElement('div'); box.className = 'ep-suggest at-suggest ch41-suggest'; container.prepend(box); }
      box.innerHTML = `<div class="ep-suggest-head">${q ? `Channels matching <b>#${esc(q)}</b>` : 'Link a channel'}</div>` + items.map((c, i) =>
        `<button class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="at-ico">#</span><b>${esc(c.name)}</b>${c.topic ? `<span class="at-sub">${esc(c.topic.slice(0, 40))}</span>` : ''}</button>`).join('');
      $$('[data-i]', box).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pick(Number(b.dataset.i)); }));
    };
    ta.addEventListener('input', () => {
      if (state.view?.type !== 'channel') return close();
      const upto = ta.value.slice(0, ta.selectionStart);
      // "# " (with a space) is a heading, so only "#" right before letters is a channel.
      const m = /(^|\s)#([\p{L}\p{N}_-]{0,40})$/u.exec(upto);
      if (!m) return close();
      const q = m[2].toLowerCase();
      range = [ta.selectionStart - m[2].length - 1, ta.selectionStart];
      items = chanPool().map(c => { const n = c.name.toLowerCase(); return [n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2, c]; })
        .filter(x => x[0] < 2).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, 8).map(x => x[1]);
      sel = 0;
      items.length ? draw(q) : close();
    });
    ta.addEventListener('keydown', e => {
      if (!box) return;
      const q = range ? ta.value.slice(range[0] + 1, range[1]).toLowerCase() : '';
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; draw(q); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; draw(q); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    ta.addEventListener('blur', () => setTimeout(close, 120));
  }
  const _wireMention41 = wireMentionAutocomplete;
  wireMentionAutocomplete = function (ta, container) {
    const r = _wireMention41(ta, container);
    try { wireChannelAc(ta, container); } catch {}
    return r;
  };
}

// ======================= formatting bar =======================
// Select text in the message box: a small bar offers bold, italic, headings (big text), quotes and
// so on, so people don't need to know the ** and # tricks. Ctrl+B / I / U work too.
{
  const FIELD = '#composer-input, .edit-box';
  const ACTS = [
    ['b', '<b>B</b>', 'Bold (Ctrl+B)', 'wrap', '**'], ['i', '<i>I</i>', 'Italic (Ctrl+I)', 'wrap', '*'], ['u', '<u>U</u>', 'Underline (Ctrl+U)', 'wrap', '__'],
    ['s', '<s>S</s>', 'Strikethrough', 'wrap', '~~'], ['sp', '<span class="fb41-sp">▒</span>', 'Spoiler', 'wrap', '||'], ['code', '&lt;/&gt;', 'Code', 'wrap', '`'], null,
    ['h1', 'H1', 'Big heading', 'line', '# '], ['h2', 'H2', 'Heading', 'line', '## '], ['h3', 'H3', 'Small heading', 'line', '### '], ['sub', '<small>-#</small>', 'Small grey text', 'line', '-# '], null,
    ['q', '❝', 'Quote', 'line', '> '], ['li', '•', 'List', 'line', '- '],
  ];
  const SIZE_FAMILY = ['# ', '## ', '### ', '-# '];
  let bar = null, field = null;
  const changed = ta => { ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); };
  function wrap(ta, mark) {
    const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b);
    const before = v.slice(a - mark.length, a), after = v.slice(b, b + mark.length);
    // "*" next to "**" is bold, not italic.
    const lone = mark !== '*' || (v[a - 2] !== '*' && v[b + 1] !== '*');
    if (before === mark && after === mark && lone) { ta.setRangeText(sel, a - mark.length, b + mark.length, 'select'); }
    else if (sel.length > mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) { ta.setRangeText(sel.slice(mark.length, -mark.length), a, b, 'select'); }
    else { ta.setRangeText(mark + sel + mark, a, b); ta.setSelectionRange(a + mark.length, b + mark.length); }
    changed(ta);
  }
  function line(ta, prefix) {
    const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    const ls = v.lastIndexOf('\n', a - 1) + 1;
    let le = v.indexOf('\n', b > a && v[b - 1] === '\n' ? b - 1 : b);
    if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const all = lines.every(l => l.startsWith(prefix));
    const out = lines.map(l => {
      if (all) return l.slice(prefix.length);
      if (SIZE_FAMILY.includes(prefix)) for (const p of [...SIZE_FAMILY].sort((x, y) => y.length - x.length)) if (l.startsWith(p)) { l = l.slice(p.length); break; }
      return l.startsWith(prefix) ? l : prefix + l;
    }).join('\n');
    ta.setRangeText(out, ls, le, 'select');
    changed(ta);
  }
  const run = (ta, key) => { const act = ACTS.find(x => x && x[0] === key); if (act) (act[3] === 'wrap' ? wrap : line)(ta, act[4]); place(); };
  function hide() { bar?.remove(); bar = null; field = null; }
  function place() {
    const ta = document.activeElement;
    if (!ta?.matches?.(FIELD) || ta.selectionStart === ta.selectionEnd || !ta.isConnected) return hide();
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'fb41';
      bar.setAttribute('role', 'toolbar');
      bar.innerHTML = ACTS.map(x => x ? `<button type="button" data-fb="${x[0]}" title="${esc(x[2])}" aria-label="${esc(x[2])}">${x[1]}</button>` : '<i></i>').join('');
      bar.addEventListener('mousedown', e => e.preventDefault()); // keeps the selection
      bar.addEventListener('click', e => { const b = e.target.closest('[data-fb]'); if (b && field) run(field, b.dataset.fb); });
      document.body.appendChild(bar);
    }
    field = ta;
    const r = ta.getBoundingClientRect(), w = bar.offsetWidth, h = bar.offsetHeight;
    const left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left + 6)));
    const top = Math.round(r.top - h - 10 < 8 ? r.bottom + 8 : r.top - h - 10);
    if (bar.style.left !== left + 'px') bar.style.left = left + 'px';
    if (bar.style.top !== top + 'px') bar.style.top = top + 'px';
  }
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  document.addEventListener('selectionchange', later);
  document.addEventListener('select', later, true);
  document.addEventListener('keyup', later, true);
  document.addEventListener('mouseup', later, true);
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.(FIELD)) hide(); }, 0), true);
  addEventListener('resize', hide);
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !e.target?.matches?.(FIELD)) return;
    const key = { b: 'b', i: 'i', u: 'u' }[e.key.toLowerCase()];
    if (!key || e.target.selectionStart === e.target.selectionEnd) return;
    e.preventDefault(); e.stopPropagation();
    run(e.target, key);
  }, true);
}

// ======================= the Editor =======================
// "Make your own" › Open the Editor: draw, add shapes, text, symbols, emoji and pictures over the
// kit, make things move, and see it on you as you go. Saving only keeps your art, never the kit.
{
  // (0.45) The Editor is a big file, so it downloads the first time someone opens it.
  let editorLoad = null;
  const loadEditor = () => editorLoad ||= new Promise((ok, bad) => {
    if (window.openEditor41Real) return ok();
    const s = document.createElement('script');
    const v = window.ASSET_V45?.['/editor41.js'];
    s.src = '/editor41.js' + (v ? '?v=' + v : '');
    s.onload = () => ok();
    s.onerror = () => { editorLoad = null; bad(new Error("Couldn't open the Editor. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  const openEditor = (...a) => loadEditor().then(() => window.openEditor41Real(...a)).catch(e => toast(e.message, true));
  window.openEditor41 = openEditor;

  // "Make your own": draw it in the Editor, or upload a picture like before.
  if (typeof drawMake === 'function') {
    const _drawMake41 = drawMake;
    drawMake = function (box) {
      const r = _drawMake41(box);
      const drop = $('#cm-drop', box);
      if (drop && !$('.ed41-start', box)) {
        const h = drop.closest('.mk-in')?.querySelector('h4');
        if (h) h.textContent = 'Draw it, or upload it';
        drop.insertAdjacentHTML('beforebegin', `<div class="ed41-start"><button type="button" class="btn btn-primary ed41-open"><span>✏️</span> Open the Editor</button>
          <span class="muted small">Draw, add shapes, text and symbols over the kit, and make it move. Or drop a picture you made below.</span></div>`);
        $('.ed41-open', box).addEventListener('click', () => openEditor(makeKind, (file, k) => {
          // Back on the Make page, the drawing goes in as if it had been uploaded.
          const put = () => {
            const inp = $('#cm-file');
            if (!inp) return;
            const dt = new DataTransfer(); dt.items.add(file);
            inp.files = dt.files; inp.dispatchEvent(new Event('change'));
            $('#cm-name')?.focus();
          };
          if (k !== makeKind) { makeKind = k; drawMake(box); }
          put();
          toast('Added! Give it a name and send it in.');
        }));
      }
      return r;
    };
  }
}
