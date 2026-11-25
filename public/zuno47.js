// Zuno 0.46: adding a bot shows what it can do, bots can DM you, streams zoom in and out with the
// mouse wheel, more app themes, and a few fixes.

if (typeof PREF_DEFAULTS === 'object' && !('botDms' in PREF_DEFAULTS)) PREF_DEFAULTS.botDms = true;

// ======================= more app themes =======================
Object.assign(APP_THEMES, {
  ocean: ['Ocean', '#13233a', '#0a1424'], grape: ['Grape', '#251a35', '#160f22'], rose: ['Rose', '#2f1a24', '#1d0f16'],
  forest: ['Forest', '#18281c', '#0d1810'], ember: ['Ember', '#2c1d16', '#1a100b'], slate: ['Slate', '#23262b', '#15171a'],
  mocha: ['Mocha', '#2a221d', '#1a1411'], nebula: ['Nebula', '#1b1d3a', '#0f1024'], crimson: ['Crimson', '#2a1214', '#170809'],
  arctic: ['Arctic', '#1c2833', '#111a22'], sakura: ['Sakura', '#fff5f8', '#f4dbe4'], sand: ['Sand', '#fbf6ec', '#ece2cf'],
});

// ======================= game pictures that don't load =======================
// A game or song picture that fails to load (a blocked site, an expired link) shows the plain
// controller or note icon instead of a broken image.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.f47) return;
  if (!img.matches('.ac42-art, img.act-art, .am44-art img, .pf43-game img')) return;
  img.dataset.f47 = '1';
  const music = !!img.closest('.listening, [data-kind="music"]');
  const ph = document.createElement('span');
  ph.className = (img.className || '') + ' art-ph47';
  ph.innerHTML = uiIcon(music ? 'music' : 'gamepad');
  img.replaceWith(ph);
}, true);

// ======================= adding a bot: what it will be able to do =======================
// One window for every way of adding a bot (the Bot Marketplace, an add link, Settings › Developer,
// the Zuno Bots in Server Settings): pick the server, check what it can do, then Authorize.
const PERM_DESC47 = {
  administrator: 'Every permission, and it skips every channel rule. Only give this to bots you trust completely.',
  view_channels: 'See the channels it has access to.', manage_channels: 'Create, edit and delete channels.',
  manage_roles: 'Create and edit roles below its own, give them to people and change channel permissions.',
  manage_server: "Change the server's name, picture and settings.", view_audit_log: 'Read the audit log.',
  manage_integrations: 'Add and remove other bots and webhooks.', create_invites: 'Make invite links.', manage_invites: 'Delete invite links.',
  kick_members: 'Remove people from the server.', ban_members: 'Ban people from the server.', send_messages: 'Send messages in channels.',
  attach_files: 'Send files and pictures.', add_reactions: 'React to messages.', mention_everyone: 'Ping @everyone, @here and every role.',
  manage_messages: "Delete and pin other people's messages.", read_history: 'Read messages sent before it joined.',
  bypass_slowmode: 'Skip slowmode.', use_commands: 'Use other bots\' commands.', connect: 'Join voice channels.', speak: 'Talk in voice channels.', video: 'Share video in voice channels.',
};
const RISKY47 = new Set(['administrator', 'manage_server', 'manage_roles', 'manage_channels', 'ban_members', 'kick_members', 'manage_integrations', 'mention_everyone']);
async function authorizeBot47(botId, { serverId = null, after } = {}) {
  let d;
  try { d = await api('GET', `/api/apps/${encodeURIComponent(botId)}/authorize`); } catch (e) { return toast(e.message, true); }
  const app = d.app, free = d.servers.filter(s => !s.has);
  if (!free.length) return toast(d.servers.length ? `${app.name} is already in every server you can add bots to.` : 'You need the Manage Bots & Webhooks permission in a server to add bots.', true);
  let sid = free.some(s => s.id === serverId) ? serverId : free[0].id;
  const ov = document.createElement('div');
  ov.className = 'overlay ab47-ov';
  $('#layer').appendChild(ov);
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 160); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const svIcon = s => (s.icon ? `<img src="${esc(s.icon)}" alt="">` : `<span style="background:${esc(s.iconColor || 'var(--brand)')}">${esc((s.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>`);
  const since = new Date(app.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const head = `<div class="ab47-head"><div class="ab47-pair"><div class="ab47-av">${avatar({ ...app, id: app.id, displayName: app.name }, 72)}</div><i class="ab47-dots"><b></b><b></b><b></b></i><div class="ab47-av">${avatar(state.me, 72)}</div></div>
    <div class="ab47-name">${esc(app.name)} <span class="official bot-tag">Bot</span></div><div class="ab47-sub">wants to join one of your servers</div>
    <div class="ab47-who">Signed in as <b>@${esc(state.me.username)}</b></div></div>`;
  const facts = () => `<div class="ab47-facts">
      ${app.builtIn ? `<div>${uiIcon('shield')}<span>Made by Zuno</span></div>` : `<div>${uiIcon('user')}<span>Made by <b>${esc(app.owner?.displayName || 'someone')}</b></span></div>`}
      <div>${uiIcon('clock')}<span>Around since ${esc(since)}</span></div>
      <div>${uiIcon('users')}<span>In ${app.serverCount} server${app.serverCount === 1 ? '' : 's'}</span></div>
      ${!app.builtIn ? `<div>${uiIcon('mail')}<span>It can send you DMs while you share a server. You can turn that off in Settings › Privacy & Safety.</span></div>` : ''}
      ${!app.builtIn && !app.listed ? `<div class="warn">${uiIcon('warning')}<span>Not checked by Zuno yet. Only add bots you trust.</span></div>` : ''}
      <div>${uiIcon('lock')}<span>It can't read your DMs with other people or log in as you.</span></div></div>`;
  const step1 = () => {
    ov.innerHTML = `<div class="dialog modal ab47">${head}
      <label class="ab47-label">Add to server</label>
      <div class="ab47-servers">${free.map(s => `<button type="button" class="ab47-sv${s.id === sid ? ' on' : ''}" data-sv="${esc(s.id)}"><span class="ab47-svi">${svIcon(s)}</span><span class="ab47-svn">${esc(s.name)}</span>${s.id === sid ? `<span class="ab47-tick">${uiIcon('check')}</span>` : ''}</button>`).join('')}</div>
      <p class="ab47-note">You can only add bots to servers where you have <b>Manage Bots &amp; Webhooks</b>.</p>
      <div class="ab47-acts"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button type="button" class="btn btn-primary" data-a="next">Continue</button></div></div>`;
    $$('[data-sv]', ov).forEach(b => b.addEventListener('click', () => { sid = b.dataset.sv; step1(); }));
    $('[data-a=cancel]', ov).addEventListener('click', close);
    $('[data-a=next]', ov).addEventListener('click', step2);
  };
  const step2 = () => {
    const sv = free.find(s => s.id === sid), mine = new Set(sv.mine || []);
    const owner = mine.has('administrator');
    const perms = (app.perms || []).filter(p => d.perms[p]);
    ov.innerHTML = `<div class="dialog modal ab47">${head}
      <div class="ab47-to"><span class="ab47-svi">${svIcon(sv)}</span><span>Adding to <b>${esc(sv.name)}</b></span></div>
      <label class="ab47-label">${esc(app.name)} will be able to</label>
      <div class="ab47-perms">${perms.map(p => { const ok = owner || mine.has(p); return `<label class="ab47-perm${ok ? '' : ' off'}${RISKY47.has(p) ? ' risky' : ''}"><input type="checkbox" value="${esc(p)}"${ok ? ' checked' : ' disabled'}><span class="ab47-box">${uiIcon('check')}</span><span class="ab47-pt"><b>${esc(d.perms[p].label)}</b><small>${esc(ok ? (PERM_DESC47[p] || '') : "You don't have this permission yourself, so you can't give it.")}</small></span></label>`; }).join('') || `<div class="ab47-empty">${uiIcon('check')} Read and send messages where it's allowed. Nothing else.</div>`}</div>
      ${facts()}
      <p class="ab47-note">You can change what it's allowed to do later in Server Settings › Roles.</p>
      <div class="ab47-acts"><button type="button" class="btn btn-link" data-a="back">Back</button><button type="button" class="btn btn-primary" data-a="go">Authorize</button></div></div>`;
    $('[data-a=back]', ov).addEventListener('click', step1);
    $('[data-a=go]', ov).addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        await api('POST', `/api/servers/${sid}/bots`, { botId: app.id, perms: $$('.ab47-perms input:checked', ov).map(i => i.value) });
        done(sv);
        await refresh({ serverId: sid });
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
  };
  const fromSettings = !!(serverId && after);
  const done = sv => {
    ov.innerHTML = `<div class="dialog modal ab47 ab47-done"><div class="ab47-ok">${uiIcon('check')}</div><h3>Authorized</h3>
      <p><b>${esc(app.name)}</b> was added to <b>${esc(sv.name)}</b>.</p>
      <div class="ab47-acts"><button type="button" class="btn btn-grey" data-a="close">Close</button>${!fromSettings ? `<button type="button" class="btn btn-primary" data-a="open">Go to ${esc(sv.name)}</button>` : ''}</div></div>`;
    $('[data-a=close]', ov).addEventListener('click', () => { close(); after?.(); });
    $('[data-a=open]', ov)?.addEventListener('click', () => { close(); after?.(); openServer(sv.id); });
    setTimeout(() => { try { burst($('.ab47-ok', ov), 16); } catch {} }, 60);
  };
  step1();
}
addBotToServer = function (botId, serverId = null, after) { return authorizeBot47(botId, { serverId, after }); };

// The Zuno Bots in Server Settings use the same window, then open their setup.
{
  const _ss47 = ssIntegrations;
  ssIntegrations = async function (body, sv) {
    const r = await _ss47(body, sv);
    for (const btn of $$('[data-zb-add]', body)) {
      const card = btn.closest('[data-zb]');
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener('click', () => authorizeBot47('zbot_' + card.dataset.zb, {
        serverId: sv.id,
        after: async () => {
          await refresh({ serverId: sv.id });
          await ssIntegrations(body, svById(sv.id) || sv);
          try {
            const { bots } = await api('GET', `/api/servers/${sv.id}/zunobots`);
            const b = bots.find(x => x.key === card.dataset.zb);
            if (b?.added && b.setup && !b.saved) openZunoBotSetup(svById(sv.id) || sv, b, () => ssIntegrations(body, svById(sv.id) || sv));
          } catch {}
        },
      }));
    }
    return r;
  };
}

// ======================= bots can DM you =======================
// Message a bot from its right-click menu (when you share a server with it).
{
  const _omm47 = openMemberMenu;
  openMemberMenu = function (sv, id, anchor) {
    const u = user(id);
    if (!u?.bot || String(id).startsWith('zbot_') || id === 'testing') return _omm47(sv, id, anchor);
    return withMenuExtra(items => (items.some(x => x?.label === 'Message') ? items : [items[0], { label: 'Message', icon: `<span class="mi-ico">${uiIcon('chat')}</span>`, run: () => openDM(id) }, ...items.slice(1)]), () => _omm47(sv, id, anchor));
  };
  const _rp47 = renderPrivacy;
  renderPrivacy = async function (body, ...a) {
    const r = await _rp47(body, ...a);
    if (body && !$('.bd47', body)) {
      const g = document.createElement('div');
      g.className = 'setting-group bd47';
      g.innerHTML = prefToggle('botDms', 'Messages from bots', "Bots in your servers can send you DMs (like a reminder or a moderation notice). Turn this off and they can't.");
      const after = $$('.setting-group', body)[1];
      after ? after.after(g) : body.appendChild(g);
      wireToggles(g, () => {});
    }
    return r;
  };
}

// ======================= streams: zoom in and out with the mouse wheel =======================
// A stream you click on (or watch full screen, or pop out) always shows the whole picture first.
// Scroll to zoom in toward the pointer and back out, drag to look around, double-click or "Fit"
// to see everything again.
{
  const Z = new WeakMap();
  // (0.47) Any call tile showing video (focused or not, in a voice channel, a DM call or mini mode),
  // the popped-out stream, and a chat video only while it's full screen (so the chat still scrolls).
  const holderOf = el => el?.closest?.('.tile.has-video, .tile.screen, .tile:fullscreen, #stream-pop, .zp:fullscreen, .zp-fakefull .zp');
  const videoIn = h => h && (h.querySelector('video[data-vid]') || h.querySelector('video'));
  const apply = (v, z) => {
    v.style.transformOrigin = 'center center';
    v.style.transform = z.s > 1.001 ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    v.style.cursor = z.s > 1.001 ? 'grab' : '';
    const h = holderOf(v);
    if (!h) return;
    let chip = $('.sz47', h);
    if (z.s <= 1.001) { chip?.remove(); return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'sz47';
      chip.innerHTML = `<button type="button" data-z47="-1" title="Zoom out">−</button><span></span><button type="button" data-z47="1" title="Zoom in">+</button><button type="button" data-z47="0" class="fit">Fit</button>`;
      chip.addEventListener('click', e => {
        const b = e.target.closest('[data-z47]'); if (!b) return;
        e.stopPropagation();
        const vv = videoIn(h); if (!vv) return;
        const d = +b.dataset.z47;
        zoomTo(vv, d === 0 ? 1 : (Z.get(vv)?.s || 1) * (d > 0 ? 1.4 : 1 / 1.4));
      });
      chip.addEventListener('pointerdown', e => e.stopPropagation());
      chip.addEventListener('dblclick', e => e.stopPropagation());
      h.appendChild(chip);
    }
    $('span', chip).textContent = Math.round(z.s * 100) + '%';
  };
  const clamp = (v, z) => {
    const mx = (v.clientWidth * (z.s - 1)) / 2, my = (v.clientHeight * (z.s - 1)) / 2;
    z.x = Math.max(-mx, Math.min(mx, z.x)); z.y = Math.max(-my, Math.min(my, z.y));
  };
  function zoomTo(v, next, cx = 0, cy = 0) {
    const z = Z.get(v) || { s: 1, x: 0, y: 0 };
    next = Math.max(1, Math.min(8, next));
    z.x = (z.x - cx) * (next / z.s) + cx; z.y = (z.y - cy) * (next / z.s) + cy; z.s = next;
    if (z.s <= 1.001) { z.s = 1; z.x = 0; z.y = 0; }
    clamp(v, z); Z.set(v, z); apply(v, z);
  }
  window.addEventListener('wheel', e => {
    if (e.target.closest?.('button, input, select, .sz47, .vol, [class*="volume"]')) return;
    const h = holderOf(e.target), v = videoIn(h);
    if (!v || !v.videoWidth) return;
    e.preventDefault(); e.stopPropagation();
    const r = v.getBoundingClientRect();
    const z = Z.get(v) || { s: 1 };
    zoomTo(v, z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  }, { passive: false, capture: true });
  let drag = null, moved = false;
  window.addEventListener('pointerdown', e => {
    const h = holderOf(e.target), v = videoIn(h), z = v && Z.get(v);
    if (!z || z.s <= 1.001 || e.button !== 0 || e.target.closest('button, input, select')) return;
    drag = { v, z, x: e.clientX, y: e.clientY, ox: z.x, oy: z.y }; moved = false;
    v.style.cursor = 'grabbing';
    e.stopPropagation();
  }, true);
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) moved = true;
    drag.z.x = drag.ox + e.clientX - drag.x; drag.z.y = drag.oy + e.clientY - drag.y;
    clamp(drag.v, drag.z); apply(drag.v, drag.z);
  }, true);
  window.addEventListener('pointerup', () => { if (drag) { drag.v.style.cursor = 'grab'; drag = null; } }, true);
  // A drag while zoomed isn't a click (clicking a tile un-focuses it).
  window.addEventListener('click', e => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener('dblclick', e => {
    const h = holderOf(e.target), v = videoIn(h);
    if (v && Z.get(v)?.s > 1.001) { e.stopPropagation(); e.preventDefault(); zoomTo(v, 1); }
  }, true);
  // Leaving focus or full screen goes back to the whole picture.
  const reset = () => { for (const v of $$('video[data-vid], #stream-pop video, .zp video')) { if (Z.get(v)?.s > 1.001 && !holderOf(v)) { Z.delete(v); v.style.transform = ''; v.style.cursor = ''; } } };
  document.addEventListener('fullscreenchange', () => { for (const v of $$('video[data-vid]')) { Z.delete(v); v.style.transform = ''; v.style.cursor = ''; } $$('.sz47').forEach(x => x.remove()); });
  setInterval(reset, 1500);
}

// ======================= right-click menus: no doubled items =======================
// Several features add to the same DM menu. When the language isn't English, one copy could already
// be translated while the other wasn't yet, so "Block" (and "Profile") showed up twice.
function dedupeMenu47() {
  const m = $('#layer .menu');
  if (!m) return;
  const seen = new Set();
  const labelOf = b => { const c = b.cloneNode(true); c.querySelectorAll('.mi-ico, .desc, svg, img').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  for (const b of [...m.querySelectorAll(':scope > button')]) {
    const t = labelOf(b);
    const k = (typeof tr42 === 'function' ? tr42(t) : t).toLowerCase();
    if (!k) continue;
    if (seen.has(k)) b.remove(); else seen.add(k);
  }
  let prevSep = true;
  for (const n of [...m.children]) { const sep = n.classList.contains('sep'); if (sep && prevSep) n.remove(); else prevSep = sep; }
  if (m.lastElementChild?.classList.contains('sep')) m.lastElementChild.remove();
}
document.addEventListener('contextmenu', e => {
  if (!e.target.closest?.('#dm-list .dm-item, [data-member], .member')) return;
  for (const d of [30, 120, 400]) setTimeout(dedupeMenu47, d);
});

// ======================= pictures: open over what you were looking at =======================
// (0.47) Viewing someone's picture from their profile (or any window) opens on top of it, and
// closing the picture brings you back to the profile instead of closing both. Clicking any empty
// part of the viewer (the bar at the bottom too) closes it.
{
  const _olb47 = openLightbox;
  openLightbox = function (src, name = '', ...rest) {
    const layer = $('#layer');
    for (const old of $$(':scope > .overlay[data-stack47]', layer)) old.remove();
    const keep = [...layer.children].filter(n => !n.classList.contains('menu'));
    keep.forEach(n => n.remove());
    const r = _olb47(src, name, ...rest);
    const ov = layer.lastElementChild;
    if (keep.length && ov) { ov.dataset.stack47 = '1'; layer.prepend(...keep); }
    if (ov && !$('.lb33-x47, .lb-x47', ov)) {
      const x = document.createElement('button');
      x.type = 'button'; x.className = $('.lb33', ov) ? 'lb33-x47' : 'lb-x47'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close');
      x.innerHTML = uiIcon('x');
      x.addEventListener('click', e => { e.stopPropagation(); dismissLayer(); });
      ov.appendChild(x);
    }
    return r;
  };
  const _cl47 = closeLayer;
  closeLayer = function (...a) {
    const top = $('#layer > .overlay:last-child');
    if (top?.dataset.stack47) { top.remove(); $$('#layer > .menu').forEach(m => m.remove()); setTimeout(() => document.dispatchEvent(new Event('layer-uncovered47')), 0); return; }
    return _cl47(...a);
  };
  // Opens something with openLayer on top of what's already open (instead of closing it).
  window.stackOver47 = async function (run) {
    const layer = $('#layer');
    const keep = [...layer.children].filter(n => n.classList.contains('overlay'));
    if (!keep.length) return run();
    keep.forEach(n => n.remove());
    let r;
    try { r = await run(); } finally {
      const top = layer.lastElementChild;
      if (top && !keep.includes(top) && top.classList.contains('overlay')) top.dataset.stack47 = '1';
      layer.prepend(...keep.filter(n => !n.isConnected));
    }
    return r;
  };
  // The channel and category permission editor opens over Server Settings or channel settings.
  const _ope47 = openPermEditor;
  openPermEditor = function (...a) { return stackOver47(() => _ope47(...a)); };
  document.addEventListener('click', e => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('#layer .lb33-ov, #layer .lightbox')) return;
    if (t.closest('img, video, button, a, input, .lb33-btn, .lb38-nav, .lb-nav, .lb33-pct, .lb33-name')) return;
    if (t.matches('.lb33, .lb33-bar, .lightbox, .lb-bar, .lb33-ov')) dismissLayer();
  });
}

// ======================= menus over dialogs: stay on screen, with a search box =======================
// (0.47) "Add role or member" in a big server listed every role and person in one tall menu that
// ran off the top and bottom of the window. It's now a shorter list next to the button that you
// can scroll and search.
openMenuOver = function (anchor, items) {
  $$('.menu.menu-over, .menu-over-shield').forEach(n => n.remove());
  const menu = document.createElement('div');
  menu.className = 'menu menu-over mo47';
  menu.style.zIndex = 170;
  const many = items.filter(x => x !== 'sep').length > 10;
  menu.innerHTML = (many ? `<div class="mo47-search"><input type="search" placeholder="${esc(tr42?.('Search') || 'Search')}" aria-label="Search"></div>` : '')
    + `<div class="mo47-list">${items.map((it, i) => it === 'sep' ? '<div class="sep"></div>'
      : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${esc(it.label)}${it.desc ? `<span class="desc">${esc(it.desc)}</span>` : ''}</span></button>`).join('') || '<div class="fp-empty">Nothing left to add.</div>'}</div>`;
  const shield = document.createElement('div');
  shield.className = 'menu-over-shield';
  shield.style.cssText = 'position:fixed;inset:0;z-index:169';
  const close = () => { menu.remove(); shield.remove(); document.removeEventListener('keydown', onKey, true); removeEventListener('resize', close); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', close);
  shield.addEventListener('mousedown', close);
  $('#layer').append(shield, menu);
  const topEdge = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tb')) || 0) + 8;
  const r = anchor.getBoundingClientRect();
  const below = innerHeight - 8 - (r.bottom + 6), above = r.top - 6 - topEdge;
  const room = Math.max(below, above);
  const h = Math.min(420, Math.max(160, room));
  menu.style.maxHeight = h + 'px';
  const mr = menu.getBoundingClientRect();
  let top = below >= Math.min(mr.height, 300) || below >= above ? r.bottom + 6 : r.top - 6 - mr.height;
  top = Math.max(topEdge, Math.min(innerHeight - 8 - mr.height, top));
  let left = Math.min(r.left, innerWidth - 8 - mr.width);
  menu.style.top = top + 'px'; menu.style.left = Math.max(8, left) + 'px';
  menu.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; close(); items[b.dataset.i].run(); });
  const q = $('.mo47-search input', menu);
  if (q) {
    q.addEventListener('input', () => {
      const v = q.value.trim().toLowerCase();
      for (const b of $$('[data-i]', menu)) b.hidden = !!v && !b.textContent.toLowerCase().includes(v);
      for (const s of $$('.sep', menu)) s.hidden = !!v;
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $$('[data-i]', menu).find(x => !x.hidden); if (b) { e.preventDefault(); b.click(); } } });
    setTimeout(() => q.focus(), 0);
  }
};

// ======================= a simpler message menu =======================
// (0.47) Right-clicking a message: your reactions on top, then just the five things people do most
// (Reply, Edit, Forward, Copy, Pin), "More" for everything else, and Delete at the bottom.
compactMessageMenu = function (menu, x, y) {
  const MAIN = ['Reply', 'Edit Message', 'Forward', 'Copy Text', 'Pin Message', 'Unpin Message'];
  const LAST = ['Delete Message'];
  const HIDE = ['Remind Me in 1 Hour'];
  const keyOf = t => { t = t.trim(); for (const k of [...MAIN, ...LAST, ...HIDE]) if (k === t || (typeof tr42 === 'function' && tr42(k) === t)) return k; return t; };
  const label = b => { const s = b.querySelector(':scope > span:last-child'); return ((s?.childNodes[0]?.textContent) ?? b.textContent).trim(); };
  const quick = menu.querySelector(':scope > .quick-react');
  const main = [], more = [], last = [];
  for (const b of menu.querySelectorAll(':scope > button')) {
    const k = keyOf(label(b));
    if (HIDE.includes(k)) continue;
    if (MAIN.includes(k)) main.push([b, k]);
    else if (LAST.includes(k)) last.push(b);
    else more.push(b);
  }
  main.sort((a, b) => MAIN.indexOf(a[1]) - MAIN.indexOf(b[1]));
  menu.textContent = '';
  menu.classList.add('msg-menu', 'mm47');
  if (quick) menu.append(quick);
  if (quick && main.length) menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  for (const [b] of main) menu.append(b);
  if (more.length) {
    const m = document.createElement('button');
    m.className = 'has-ui-ic mm47-more';
    m.innerHTML = `<span class="mi-ico">⋯</span><span>${esc(typeof tr42 === 'function' ? tr42('More') : 'More')}</span><span class="mm-chev">›</span>`;
    m.addEventListener('click', () => {
      const r = m.getBoundingClientRect();
      const at = { getBoundingClientRect: () => ({ left: r.right - 8, right: r.right, top: r.top - 6, bottom: r.top - 6, width: 0, height: 0 }) };
      openMenu(at, more.map(b => ({ label: label(b), icon: b.querySelector('.mi-ico')?.outerHTML || '', danger: b.classList.contains('danger'), run: () => b.click() })));
    });
    menu.append(m);
  }
  if (last.length) { menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); menu.append(...last); }
  menu.style.top = y + 'px'; menu.style.left = x + 'px';
  keepMenuOnScreen();
};

// ======================= developer tools warning =======================
// (0.47) Scammers tell people to paste code into the browser console ("to get free Bloom"), which
// hands over their account. The console now shows a big warning, and the usual shortcuts for
// opening developer tools are switched off where the browser allows it (the PC app has no
// developer tools at all).
(() => {
  try {
    const big = 'color:#ff4d5e;font-size:44px;font-weight:900;-webkit-text-stroke:1px #000;';
    const txt = 'font-size:16px;line-height:1.5;';
    console.log('%cStop!', big);
    console.log("%cThis is a browser feature for developers. If someone told you to copy and paste something here, it's a scam: it gives them your Zuno account.", txt);
    console.log('%cIf you didn\'t open this on purpose, close it now.', txt + 'font-weight:700;');
  } catch {}
  addEventListener('keydown', e => {
    const k = String(e.key || '').toUpperCase();
    if (k === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(k)) || (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(k)) || ((e.ctrlKey || e.metaKey) && k === 'U')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();

// ======================= voice changer (beta) in Voice & Video =======================
{
  const _rvs47 = renderVoiceSettings;
  renderVoiceSettings = async function (body, ...a) {
    const r = await _rvs47.call(this, body, ...a);
    if (!body?.isConnected || $('.vfx47', body) || !Calls.voiceFxList) return r;
    const v = Calls.voiceSettings(), cur = v.fx || 'off';
    const g = document.createElement('div');
    g.className = 'setting-group vfx47';
    g.innerHTML = `<h4 class="setting-head">Voice changer <span class="beta47">Beta</span></h4>
      <p class="muted small" style="margin:0 0 10px">Everyone in your calls hears your voice changed. It adds a tiny delay; turn it off for normal calls.</p>
      <div class="vfx47-list" role="radiogroup">${Object.entries(Calls.voiceFxList).map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === cur}" class="vfx47-opt${k === cur ? ' on' : ''}" data-vfx="${k}">${esc(tr42?.(l) || l)}</button>`).join('')}</div>`;
    const after = $('.ns45', body)?.closest('.setting-group') || $$('.setting-group', body)[0];
    after ? after.after(g) : body.appendChild(g);
    $$('[data-vfx]', g).forEach(b => b.addEventListener('click', () => {
      voiceSet44({ fx: b.dataset.vfx });
      $$('[data-vfx]', g).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      Calls.refreshMic();
    }));
    return r;
  };
}

// ======================= iPad and iPhone: the app doesn't zoom like a web page =======================
// (0.47) Tapping a text box made Safari zoom the whole page in (and it stayed zoomed), and pinching
// zoomed the whole app so menus and panels ended up in the wrong places. Pictures and streams still
// zoom on their own; the rest of Zuno stays the size it is.
if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) {
  const ownZoom = t => t instanceof Element && t.closest('.lb33-ov, .lightbox, .tile, #stream-pop, .zp, .map-wrap, .leaflet-container');
  document.addEventListener('gesturestart', e => { if (!ownZoom(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !ownZoom(e.target)) e.preventDefault(); }, { passive: false });
  // If Safari zoomed in anyway (for example after rotating), put it back when the keyboard closes.
  visualViewport?.addEventListener('resize', () => { if (visualViewport.scale > 1.01 && !document.activeElement?.matches?.('input, textarea, [contenteditable]')) { const m = document.querySelector('meta[name=viewport]'); if (m) { const c = m.content; m.content = c + ', user-scalable=no'; setTimeout(() => { m.content = c; }, 300); } } });
}

// ======================= unread count on the tab's icon =======================
// (0.47, suggested by Treehouse) The little Zuno icon on the browser tab shows a red circle with how
// many unread DMs and mentions you have, like the number in the tab's title.
{
  const BASE = '/logo.png';
  let img = null, last = -1;
  const count = () => {
    let n = (state.dms || []).reduce((a, x) => a + (x.unread || 0), 0) + (state.groups || []).reduce((a, g) => a + (g.unread || 0), 0);
    for (const sv of state.servers || []) {
      if (sv.muted) continue;
      for (const ch of sv.channels || []) if (ch.unread && ch.mentions) n += ch.mentions;
    }
    return n;
  };
  const link = () => {
    let l = document.querySelector('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    return l;
  };
  const draw = n => {
    if (n === last) return;
    last = n;
    if (!n) { link().href = BASE; return; }
    const go = () => {
      const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, S, S);
      const t = n > 99 ? '99+' : String(n), r = t.length > 2 ? 22 : 19;
      x.beginPath(); x.arc(S - r, S - r, r, 0, Math.PI * 2); x.fillStyle = '#f23f43'; x.fill();
      x.lineWidth = 4; x.strokeStyle = '#111'; x.stroke();
      x.fillStyle = '#fff'; x.font = `800 ${t.length > 2 ? 20 : t.length > 1 ? 24 : 28}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(t, S - r, S - r + 1);
      try { link().href = c.toDataURL('image/png'); } catch {}
    };
    if (img?.complete && img.naturalWidth) return go();
    img = new Image(); img.onload = go; img.src = BASE;
  };
  const tick = () => { if (state.me && !window.zunoDesktop) draw(count()); };
  const _rdl47 = renderDMList;
  renderDMList = function (...a) { const r = _rdl47(...a); tick(); return r; };
  const _rr47 = renderRail;
  renderRail = function (...a) { const r = _rr47(...a); tick(); return r; };
}
