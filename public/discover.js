'use strict';
// Discover: browse servers that chose to be listed, and join them without an invite.

const COMPASS = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm3.6-12.6-5.1 2.2a1.6 1.6 0 0 0-.8.8l-2.2 5.1a.5.5 0 0 0 .6.6l5.1-2.2a1.6 1.6 0 0 0 .8-.8l2.2-5.1a.5.5 0 0 0-.6-.6ZM12 13.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"/></svg>';
const TAG_EMOJI = { Gaming: '🎮', Music: '🎵', Art: '🎨', Anime: '🌸', Study: '📚', Tech: '💻', Memes: '😂', Chill: '🌿', Creators: '🎬', Roleplay: '🎭', Sports: '⚽', 'Movies & TV': '🍿', Books: '📖', Science: '🔬', Community: '🏡', Language: '🗣️' };
const disc = { q: '', tag: '', sort: 'popular' };

// The rail button, under "Add a Server".
(function addRailButton() {
  const add = $('#add-server-btn');
  if (!add || $('#discover-btn')) return;
  add.insertAdjacentHTML('afterend', `<button class="rail-btn add discover" id="discover-btn" data-tip="Discover servers" aria-label="Discover servers">${COMPASS}</button>`);
  $('#discover-btn').addEventListener('click', () => showDiscover());
})();
const _renderRailD = renderRail;
renderRail = function (...a) { _renderRailD(...a); $('#discover-btn')?.classList.toggle('active', state.view.type === 'discover'); };

function discoverCard(sv) {
  return `<div class="disc-card" data-disc="${esc(sv.id)}">
    <div class="dc-banner" style="${sv.bannerColor ? `--bc:${esc(sv.bannerColor)}` : `--bc:${esc(sv.iconColor || '#04c5ae')}`}">${sv.banner ? `<img src="${esc(sv.banner)}" alt="" loading="lazy">` : ''}</div>
    <div class="dc-icon" style="--sv:${esc(sv.iconColor || '#04c5ae')}">${serverIcon(sv, 56)}</div>
    <div class="dc-body"><h4>${sv.official || sv.verified ? '<span class="official">✓</span> ' : ''}${sv.partnered ? partnerMark('icon') + ' ' : ''}${esc(sv.name)}</h4>
      <p>${esc(sv.description || 'No description yet.')}</p>
      <div class="dc-tags">${(sv.tags || []).slice(0, 3).map(t => `<span>${TAG_EMOJI[t] || ''} ${esc(t)}</span>`).join('')}</div>
      <div class="dc-stats">${sv.onlineCount != null ? `<span><i class="dot on"></i>${sv.onlineCount} online</span>` : ''}<span><i class="dot"></i>${sv.memberCount} member${sv.memberCount === 1 ? '' : 's'}</span>${sv.joined ? '<span class="dc-joined">Joined</span>' : ''}</div></div></div>`;
}

async function showDiscover() {
  if (state.view.type === 'dm') stopProfileSound();
  setWhere('Discover');
  state.view = { type: 'discover' };
  state.currentServerId = null;
  renderRail();
  renderSidebar();
  $('#app').classList.remove('show-nav');
  const main = $('#main');
  main.innerHTML = `<div class="topbar">${mobileNavButton()}<div class="title">${COMPASS} Discover</div></div>
    <div class="discover"><div class="disc-hero">
      <div class="dh-text"><h1>Find your people</h1><p>Communities on Zuno you can join right now, no invite needed.</p>
        <div class="dh-search"><input id="disc-q" placeholder="Search for gaming, art, study groups…" value="${esc(disc.q)}" autocomplete="off"></div></div>
      ${mascot('happy', 'dh-mascot')}</div>
      <div class="disc-bar"><div class="disc-tags" id="disc-tags"></div>
        <div class="segmented disc-sort">${[['popular', 'Popular'], ['active', 'Active now'], ['new', 'New']].map(([k, l]) => `<button data-sort="${k}" class="${disc.sort === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="disc-grid" id="disc-grid"><div class="fp-empty">Loading…</div></div>
      <div class="disc-foot muted small">Want your server here? Server Settings › Discovery.</div></div>`;
  wireMobileNav(main);
  let t;
  $('#disc-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { disc.q = e.target.value.trim(); loadDiscover(); }, 250); });
  // Picking a sort shows the whole list in that order (instead of the Trending home page).
  $$('[data-sort]', main).forEach(b => b.addEventListener('click', () => { disc.sort = b.dataset.sort; disc.sorted = true; $$('[data-sort]', main).forEach(x => x.classList.toggle('on', x === b)); loadDiscover(); }));
  loadDiscover();
}
async function loadDiscover() {
  const grid = $('#disc-grid');
  if (!grid) return;
  try {
    const d = await api('GET', `/api/discover?q=${encodeURIComponent(disc.q)}&tag=${encodeURIComponent(disc.tag)}&sort=${disc.sort}`);
    $('#disc-tags').innerHTML = [['', 'All'], ...d.tags.map(t => [t, t])].map(([k, l]) => `<button class="chip${disc.tag === k ? ' on' : ''}" data-dtag="${esc(k)}">${k ? TAG_EMOJI[k] + ' ' : '✨ '}${esc(l)}${k && d.tagCounts[k] ? ` <small>${d.tagCounts[k]}</small>` : ''}</button>`).join('');
    $$('[data-dtag]').forEach(b => b.addEventListener('click', () => { disc.tag = b.dataset.dtag; if (!disc.tag) { disc.sorted = false; disc.sort = 'popular'; $$('[data-sort]').forEach(x => x.classList.toggle('on', x.dataset.sort === 'popular')); } loadDiscover(); }));
    grid.innerHTML = d.servers.length ? d.servers.map(discoverCard).join('')
      : `<div class="empty-state" style="grid-column:1/-1">${mascot('curious')}<div class="title">Nothing here yet</div><div>${disc.q || disc.tag ? 'No servers match that. Try something else!' : 'No servers are listed yet. Be the first: Server Settings › Discovery.'}</div></div>`;
    $$('[data-disc]', grid).forEach(c => c.addEventListener('click', () => openDiscoverServer(c.dataset.disc)));
  } catch (e) { grid.innerHTML = `<div class="fp-empty">${esc(e.message)}</div>`; }
}
async function openDiscoverServer(id) {
  let sv;
  try { sv = (await api('GET', `/api/discover/${id}`)).server; } catch (e) { return toast(e.message, true); }
  const ov = openLayer(`<div class="dialog modal disc-detail">
    <div class="dd-banner" style="--bc:${esc(sv.bannerColor || sv.iconColor)}">${sv.banner ? `<img src="${esc(sv.banner)}" alt="">` : ''}</div>
    <div class="dd-head"><span class="dc-icon" style="--sv:${esc(sv.iconColor)}">${serverIcon(sv, 72)}</span>
      <div><h3>${sv.official || sv.verified ? '<span class="official">✓ Official</span> ' : ''}${sv.partnered ? partnerMark('tag') + ' ' : ''}${esc(sv.name)}</h3><div class="dc-stats"><span><i class="dot on"></i>${sv.onlineCount} online</span><span><i class="dot"></i>${sv.memberCount} members</span><span>Since ${new Date(sv.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div></div></div>
    <p class="dd-desc">${esc(sv.description || '')}</p>
    <div class="dc-tags">${(sv.tags || []).map(t => `<span>${TAG_EMOJI[t] || ''} ${esc(t)}</span>`).join('')}</div>
    ${sv.rules.length ? `<h4 class="setting-head">Rules</h4><div class="dd-rules">${sv.rules.map(r => `<div>${formatMessage(r)}</div>`).join('')}</div>` : ''}
    ${sv.channels.length ? `<h4 class="setting-head">Channels</h4><div class="dd-chs">${sv.channels.map(c => `<span>${c.type === 'voice' ? '🔊' : '#'} ${esc(c.name)}</span>`).join('')}</div>` : ''}
    ${sv.roles.length ? `<h4 class="setting-head">Roles</h4><div class="dd-chs">${sv.roles.map(r => `<span class="role-chip" style="--rc:${esc(r.color || '#9aa6a4')}"><i></i>${esc(r.name)}</span>`).join('')}</div>` : ''}
    <div class="actions"><span class="muted small">Made by ${esc(sv.owner?.displayName || '?')}</span><span style="flex:1"></span><button class="btn btn-link" data-a="cancel">Close</button>
      ${sv.joined ? '<button class="btn btn-primary" data-a="open">Open Server</button>' : sv.paused ? '<button class="btn btn-grey" disabled>Not taking new members</button>' : '<button class="btn btn-primary" data-a="join">Join Server</button>'}</div></div>`);
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  $('[data-a=open]', ov)?.addEventListener('click', () => { closeLayer(); openServer(sv.id); });
  $('[data-a=join]', ov)?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('POST', `/api/discover/${sv.id}/join`); burst(e.target, 18); await refresh({}); closeLayer(); toast(`Welcome to ${sv.name}! 🎉`); openServer(sv.id); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
}
