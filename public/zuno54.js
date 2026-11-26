'use strict';
// Zuno 0.54: #channel mentions, profile access, Flair settings and profile frames.

// #channel references are resolved only against text channels in the current server. The link
// carries a channel ID (not a user-controlled URL), and navigation still checks normal permissions.
function wireChannelAutocomplete54(ta, container) {
  let box = null, items = [], sel = 0, range = null;
  const close = () => { box?.remove(); box = null; items = []; range = null; };
  const pick = i => {
    const ch = items[i]; if (!ch || !range) return;
    const token = '#' + ch.name + ' ';
    ta.value = ta.value.slice(0, range[0]) + token + ta.value.slice(range[1]);
    const pos = range[0] + token.length; ta.setSelectionRange(pos, pos); close(); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const draw = q => {
    if (!items.length) return close();
    if (!box) { box = document.createElement('div'); box.className = 'ep-suggest channel-suggest54'; container.prepend(box); }
    box.innerHTML = `<div class="ep-suggest-head">${q ? `Channels matching <b>#${esc(q)}</b>` : 'Mention a channel'}</div>` + items.map((ch, i) => `<button class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ch-suggest54-hash">#</span><b>${esc(ch.name)}</b></button>`).join('');
    $$('[data-i]', box).forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); pick(Number(b.dataset.i)); }));
  };
  ta.addEventListener('input', () => {
    if (state.view?.type !== 'channel') return close();
    const upto = ta.value.slice(0, ta.selectionStart), m = /(^|\s)#([a-z0-9_-]{0,64})$/i.exec(upto);
    if (!m) return close();
    const sv = currentServer(), q = m[2].toLowerCase();
    if (!sv) return close();
    range = [ta.selectionStart - m[2].length - 1, ta.selectionStart];
    const channels = (sv.channels || []).filter(c => c.type === 'text' && (c.perms || []).includes('view_channels'));
    items = channels.filter(c => !q || c.name.toLowerCase().includes(q)).sort((a,b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 8);
    sel = 0; draw(q);
  });
  ta.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; draw(ta.value.slice(range[0] + 1, range[1])); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; draw(ta.value.slice(range[0] + 1, range[1])); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  ta.addEventListener('blur', () => setTimeout(close, 120));
}
const _wireMentionAutocomplete54 = wireMentionAutocomplete;
wireMentionAutocomplete = function (ta, container) { _wireMentionAutocomplete54(ta, container); wireChannelAutocomplete54(ta, container); };

const _formatMessage54 = formatMessage;
formatMessage = function (text) {
  let html = _formatMessage54(text);
  const sv = state.view?.type === 'channel' && typeof currentServer === 'function' ? currentServer() : null;
  if (!sv) return html;
  const channels = (sv.channels || []).filter(c => c.type === 'text');
  for (const ch of channels) {
    const name = String(ch.name || '').toLowerCase();
    if (!/^[a-z0-9_-]{1,64}$/.test(name)) continue;
    const re = new RegExp('(^|[\\s(])#' + name + '(?![a-z0-9_-])', 'gi');
    html = html.replace(re, (all, prefix) => `${prefix}<span class="mention channel" role="link" tabindex="0" data-goto-ch="${esc(ch.id)}" data-goto-sv="${esc(sv.id)}">#${esc(ch.name)}</span>`);
  }
  return html;
};

document.addEventListener('click', e => {
  const link = e.target.closest?.('[data-goto-ch][data-goto-sv]');
  if (!link) return;
  e.preventDefault(); e.stopPropagation();
  const sv = svById(link.dataset.gotoSv);
  const ch = sv?.channels?.find(c => c.id === link.dataset.gotoCh && c.type === 'text');
  if (!sv || !ch) return toast('That channel is no longer available.', true);
  if (!(ch.perms || []).includes('view_channels')) return toast("You can't view that channel.", true);
  openChannel(sv.id, ch.id);
}, true);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-goto-ch][data-goto-sv]')) { e.preventDefault(); e.target.click(); }
});

// A dedicated entry makes opening your own profile distinct from changing your online status.
const _renderUserPanel54 = renderUserPanel;
renderUserPanel = function (...args) {
  const result = _renderUserPanel54(...args);
  $('#me-btn')?.addEventListener('click', e => { if (e.target.closest('.avatar')) { e.stopImmediatePropagation(); openProfile(state.me.id); } }, true);
  return result;
};

const _openStatusMenu54 = openStatusMenu;
openStatusMenu = function (anchor) {
  openMenu(anchor, [
    { label: 'View My Profile', icon: '<span class="mi-ico">👤</span>', run: () => openProfile(state.me.id) },
    'sep',
    { label: 'Online', icon: '<span class="swatch s-online"></span>', run: () => setStatus('online') },
    { label: 'Idle', icon: '<span class="swatch s-idle"></span>', run: () => setStatus('idle') },
    { label: 'Do Not Disturb', icon: '<span class="swatch s-dnd"></span>', desc: 'You will still get messages', run: () => setStatus('dnd') },
    { label: 'Invisible', icon: '<span class="swatch s-invisible"></span>', desc: 'You will appear offline', run: () => setStatus('invisible') },
    'sep',
    { label: state.me.customStatus ? 'Edit Custom Status' : 'Set Custom Status', run: openCustomStatus },
    'sep',
    { label: 'Change Avatar', icon: '<span class="mi-ico">📷</span>', run: quickChangeAvatar },
    ...(state.me.avatar ? [{ label: 'Remove Avatar', icon: '<span class="mi-ico">🗑️</span>', run: quickRemoveAvatar }] : []),
    { label: 'Edit Profile', icon: '<span class="mi-ico">✏️</span>', run: () => openSettings('profile') },
  ]);
};

// Profile frames are lightweight CSS treatments around the profile card, separate from avatar
// decorations. They are public profile settings and are validated again by the server.
const _profileCard54 = profileCard;
profileCard = function (u, opts) {
  const html = _profileCard54(u, opts);
  const opacity = Math.max(0.1, Math.min(1, Number(u.profileBackgroundOpacity ?? 1)));
  const frame = ['aurora', 'gold', 'neon', 'rose', 'ice'].includes(u.profileFrame) ? u.profileFrame : '';
  return html.replace(/<div class="pcard([^"]*)"(?: style="([^"]*)")?/, (_, classes, oldStyle = '') => `<div class="pcard${classes}${frame ? ` pf54-frame pf54-${frame}` : ''}" style="--pc-bg-opacity:${opacity};${oldStyle}"`);
};

// The server summary includes channel fields, so flair is available to every member without an
// extra request. Display it only beside text channels.
const _renderServerSidebar54 = renderServerSidebar;
renderServerSidebar = function (...args) {
  const result = _renderServerSidebar54(...args);
  const sv = currentServer();
  if (!sv) return result;
  for (const item of $$('#sidebar .ch-item[data-ch]')) {
    const ch = sv.channels.find(c => c.id === item.dataset.ch && c.type === 'text');
    const icon = $('.ch-ico', item);
    if (ch?.flair && icon && !icon.dataset.flair54) {
      icon.dataset.flair54 = '1';
      icon.insertAdjacentHTML('afterbegin', `<span class="ch-flair54-emoji">${esc(ch.flair)}</span>`);
      icon.classList.add('ch-flair54');
    }
  }
  return result;
};

// Add the owner/manager-only Flair page to Server Settings.
if (typeof SS_SECTIONS !== 'undefined' && !SS_SECTIONS.some(x => x.key === 'flair')) {
  SS_SECTIONS.push({ group: 'Roles & Channels', key: 'flair', label: 'Flair', need: 'manage_channels', words: 'emoji flair text channels icons' });
  SS_SETTINGS.push(['flair', 'Channel emoji flair']);
}
const _showServerSection54 = showServerSection;
showServerSection = async function (section, openCh) {
  if (section !== 'flair') return _showServerSection54(section, openCh);
  const sv = svById(svSettings?.id), body = $('#ss-body');
  if (!sv || !body) return;
  svSettings.section = section;
  $$('.server-settings-page [data-ss]').forEach(b => b.classList.toggle('active', b.dataset.ss === section));
  const text = (sv.channels || []).filter(c => c.type === 'text');
  body.innerHTML = `<h2>Flair</h2><p class="muted">Add one emoji beside any text channel in the channel list. Only members with Manage Channels can edit these.</p>
    <form id="flair54-form"><div class="setting-group">${text.map(c => `<label class="setting-row"><div><div class="setting-title">#${esc(c.name)}</div><div class="setting-desc">Choose an emoji to show beside this channel.</div></div><input name="${esc(c.id)}" maxlength="16" value="${esc(c.flair || '')}" placeholder="✨" aria-label="Flair for ${esc(c.name)}" style="width:64px;text-align:center"></label>`).join('') || '<div class="muted small">There are no text channels yet.</div>'}</div><button class="btn btn-primary" style="margin-top:12px">Save Flair</button></form>`;
  const form = $('#flair54-form', body);
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const channels = text.map(c => ({ id: c.id, emoji: form.elements[c.id].value.trim() }));
    try {
      await api('PATCH', `/api/servers/${sv.id}/channel-flair`, { channels });
      toast('Channel flair saved'); await refresh({}); if (svSettings) showServerSection('flair');
    } catch (err) { toast(err.message, true); }
  });
};

// Add profile opacity and frame choices to the existing profile editor's draft model.
const _showSettingsSection54 = showSettingsSection;
showSettingsSection = function (section, ...args) {
  if (section === 'profile') {
    settingsDraft ||= { displayName: state.me.displayName, pronouns: state.me.pronouns, bio: state.me.bio, customStatus: state.me.customStatus, bannerColor: state.me.bannerColor, avatar: state.me.avatar, nameColor: state.me.nameColor || null, profileTheme: state.me.profileTheme || null, decoration: state.me.decoration || null, profileEffect: state.me.profileEffect || null };
    if (!('profileBackgroundOpacity' in settingsDraft)) settingsDraft.profileBackgroundOpacity = state.me.profileBackgroundOpacity ?? 1;
    if (!('profileFrame' in settingsDraft)) settingsDraft.profileFrame = state.me.profileFrame || null;
  }
  const result = _showSettingsSection54(section, ...args);
  if (section !== 'profile') return result;
  const form = $('#profile-form');
  if (!form || $('#pf54-controls')) return result;
  const controls = document.createElement('div');
  controls.id = 'pf54-controls';
  controls.innerHTML = `<div class="field"><b>Profile background opacity</b><span class="hint">Adjust how visible your background looks behind your profile.</span><div class="pf54-opacity"><input type="range" name="profileBackgroundOpacity" min="0.1" max="1" step="0.05" value="${Number(settingsDraft.profileBackgroundOpacity)}"><output>${Math.round(Number(settingsDraft.profileBackgroundOpacity) * 100)}%</output></div></div>
    <label class="field">Profile Frame<select name="profileFrame" class="sc-select">${[['none','No frame'],['aurora','Aurora'],['gold','Gold'],['neon','Neon'],['rose','Rose'],['ice','Ice']].map(([v,l]) => `<option value="${v}"${settingsDraft.profileFrame === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="hint">Choose a decorative border around your profile card.</span></label>`;
  const bio = $('[name="bio"]', form)?.closest('.field');
  (bio || form.lastElementChild)?.before(controls);
  const sync = () => {
    const range = $('[name="profileBackgroundOpacity"]', controls), output = $('output', controls);
    settingsDraft.profileBackgroundOpacity = Number(range.value);
    const pickedFrame = $('[name="profileFrame"]', controls).value;
    settingsDraft.profileFrame = pickedFrame === 'none' && !state.me.profileFrame ? null : pickedFrame;
    output.textContent = Math.round(Number(range.value) * 100) + '%';
    const preview = $('#profile-preview .pcard');
    if (preview) { preview.style.setProperty('--pc-bg-opacity', String(settingsDraft.profileBackgroundOpacity)); preview.classList.remove('pf54-frame','pf54-aurora','pf54-gold','pf54-neon','pf54-rose','pf54-ice'); if (settingsDraft.profileFrame && settingsDraft.profileFrame !== 'none') preview.classList.add('pf54-frame', 'pf54-' + settingsDraft.profileFrame); }
    renderSaveBar();
  };
  controls.addEventListener('input', sync);
  controls.addEventListener('change', sync);
  sync();
  return result;
};
