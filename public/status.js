'use strict';
// Moved out of the page so the site's security policy can block scripts written inside pages.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { ok: 'Working', degraded: 'Slow', major: 'Down', minor: 'Some problems', off: 'Off' };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} minutes` : s < 86400 ? `${Math.round(s / 3600)} hours` : `${Math.round(s / 86400)} days`; };
async function load() {
  const root = document.getElementById('root');
  let d;
  try { const r = await fetch('/api/status'); d = await r.json(); if (!r.ok) throw new Error(); }
  catch { root.innerHTML = '<div class="banner major"><span class="dot"></span><div><b>Zuno isn\'t answering</b><small>It may be restarting or down. This page keeps trying.</small></div></div>'; return; }
  const days = d.days, known = days.filter(x => x.uptime != null);
  const avg = known.length ? (known.reduce((a, x) => a + x.uptime, 0) / known.length) : null;
  const head = { ok: ['All systems working', 'Everything on Zuno is running normally.'], degraded: ['Some things are slow', 'Zuno is up, but parts of it are having trouble.'], major: ['Zuno is having a big problem', 'We know and are working on it.'] }[d.overall] || ['Checking…', ''];
  const color = u => (u == null ? '' : u >= 99.5 ? 'ok' : u >= 95 ? 'degraded' : 'major');
  root.innerHTML = `
    <div class="banner ${d.overall}"><span class="dot"></span><div><b>${head[0]}</b><small>${head[1]}</small></div></div>
    <div class="stats"><div class="stat"><b>${avg != null ? avg.toFixed(2) + '%' : '—'}</b><span>Uptime, last 90 days</span></div><div class="stat"><b>${d.responseMs != null ? d.responseMs + ' ms' : '—'}</b><span>Response time (last hour)</span></div><div class="stat"><b>${ago(d.upSince)}</b><span>Since the last restart</span></div></div>
    <div class="card">${d.components.map(c => `<div class="row ${c.status}"><span class="name">${esc(c.name)}</span><span class="detail">${esc(c.detail)}</span><span class="pill">${LABEL[c.status]}</span></div>`).join('')}</div>
    <h2>Uptime</h2>
    <div class="card uptime"><div class="bars">${days.map(x => `<i class="${x.uptime == null ? 'nodata' : color(x.uptime)}" data-tip="${esc(new Date(x.day + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} · ${x.uptime == null ? 'No data yet' : x.uptime + '% up'}"></i>`).join('')}</div>
      <div class="axis"><span>90 days ago</span><span>Today</span></div></div>
    <h2>Incidents</h2>
    <div class="card">${d.incidents.length ? d.incidents.map(i => `<div class="incident"><b>${esc(i.title)}</b> <span class="pill ${i.status === 'resolved' ? 'ok' : i.impact}">${esc(i.status[0].toUpperCase() + i.status.slice(1))}</span>${i.updates.slice().reverse().map(u => `<div class="upd"><b>${esc(u.status)}</b> · ${esc(new Date(u.at).toLocaleString())}${u.text ? ' — ' + esc(u.text) : ''}</div>`).join('')}</div>`).join('') : '<div class="row"><span class="muted">No incidents in the last two weeks. 🌿</span></div>'}</div>
    <p class="muted" style="font-size:13px">Zuno ${esc(d.version)} · ${d.online} ${d.online === 1 ? 'person' : 'people'} online right now</p>`;
}
const tip = document.getElementById('tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest('[data-tip]');
  if (!t) return tip.classList.remove('on');
  tip.textContent = t.dataset.tip; tip.classList.add('on');
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px';
  tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
});
load();
setInterval(load, 60e3);
