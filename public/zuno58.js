// Zuno 0.58: the switch for calls through Cloudflare's call server, in the Admin Dashboard.
// New calls follow the switch; calls already going on keep the way they started.
const _renderAdmin58 = renderAdmin;
renderAdmin = async function (body, quiet = false) {
  const r = await _renderAdmin58(body, quiet);
  const dash = $('.admin-dash', body);
  if (!dash || $('.ad-sfu58', dash)) return r;
  let st;
  try { st = await api('GET', '/api/admin/sfu'); } catch { return r; }
  const anchor = $('.ad-source', dash) || $('.ad-update-publisher', dash);
  if (!anchor) return r;
  const box = document.createElement('div');
  box.className = 'setting-group ad-sfu58';
  const draw = s => {
    box.innerHTML = `<h4 class="setting-head">Calls</h4>
      <label class="setting-row${s.configured ? '' : ' disabled'}">
        <div><div class="setting-title">New calls (Cloudflare call server)</div>
        <div class="setting-desc">${s.configured
          ? 'Calls go through Cloudflare instead of straight between people: steadier, nobody connects to anyone else, and big calls cost each person one upload. New calls use this switch; calls already going on keep the way they started.'
          : 'Add ZUNO_CF_SFU_APP_ID and ZUNO_CF_SFU_APP_SECRET on the server first.'}${s.rooms ? ` <b>${s.rooms}</b> call${s.rooms === 1 ? '' : 's'} using it right now.` : ''}</div></div>
        <input type="checkbox" class="switch" id="ad-sfu58"${s.on ? ' checked' : ''}${s.configured ? '' : ' disabled'}></label>`;
    $('#ad-sfu58', box).addEventListener('change', async e => {
      const on = e.target.checked;
      e.target.disabled = true;
      try { draw(await api('PUT', '/api/admin/sfu', { on })); toast(on ? 'New calls are on. Calls started from now on use them.' : 'New calls are off. Calls started from now on use the old way.'); }
      catch (err) { toast(err.message, true); e.target.checked = !on; e.target.disabled = false; }
    });
  };
  draw(st);
  anchor.before(box);
  return r;
};
