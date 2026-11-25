'use strict';
// People: activity status, connections (Spotify and socials), birthdays, mutual friends & servers,
// friendship anniversaries, typed effects, two-factor login and Zuno Wrapped.

// ======================= activity status =======================
const ACT_VERB = { playing: 'Playing', listening: 'Listening to', watching: 'Watching', streaming: 'Streaming', competing: 'Competing in' };
const ACT_ICON = { playing: '🎮', listening: '🎧', watching: '📺', streaming: '📡', competing: '🏆' };
function activityLine(u) {
  const a = u?.activity;
  if (!a) return '';
  return `<span class="act-line">${ACT_ICON[a.type] || '✨'} ${ACT_VERB[a.type] || ''} <b>${esc(a.name === 'Spotify' && a.details ? a.details : a.name)}</b></span>`;
}
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
function activityCard(u) {
  const a = u.activity;
  if (!a) return '';
  const spotify = a.name === 'Spotify';
  const timing = a.end
    ? `<div class="act-bar" data-start="${a.start}" data-end="${a.end}"><i></i></div><div class="act-times"><span data-elapsed="${a.start}">0:00</span><span>${clock(a.end - a.start)}</span></div>`
    : `<div class="act-time muted small"><span data-elapsed="${a.start}"></span> elapsed</div>`;
  return `<h4>${spotify ? 'Listening to Spotify' : `${ACT_VERB[a.type] || ''} ${a.type === 'playing' ? 'a game' : ''}`}</h4>
    <div class="act-card${spotify ? ' spotify' : ''}">
      ${a.art ? `<img class="act-art" src="${esc(a.art)}" alt="">` : `<span class="act-art ph">${spotify ? '🎵' : ACT_ICON[a.type] || '✨'}</span>`}
      <div class="act-info"><b>${esc(spotify ? a.details || 'Spotify' : a.name)}</b>${spotify ? (a.state ? `<span>by ${esc(a.state)}</span>` : '') : `${a.details ? `<span>${esc(a.details)}</span>` : ''}${a.state ? `<span>${esc(a.state)}</span>` : ''}`}${timing}</div>
    </div>`;
}
// Keep activity clocks and Spotify progress bars moving.
setInterval(() => {
  for (const el of $$('[data-elapsed]')) el.textContent = clock(Date.now() - Number(el.dataset.elapsed));
  for (const bar of $$('.act-bar')) { const s = Number(bar.dataset.start), e = Number(bar.dataset.end); $('i', bar).style.width = Math.min(100, ((Date.now() - s) / (e - s)) * 100) + '%'; }
}, 1000);

// The desktop app reports which game (or Spotify song) is open.
if (window.zunoDesktop?.onActivity) {
  let last = '';
  window.zunoDesktop.onActivity(a => {
    const key = JSON.stringify(a);
    if (key === last && !a) return;
    last = key;
    if (!state.token || !prefs().shareActivity) return;
    // (0.43.1) Newer apps report everything at once ({ list }), like a game and a song together.
    if (a?.list) return api('POST', '/api/me/activity', { activities: a.list, source: 'desktop' }).catch(() => {});
    api('POST', '/api/me/activity', a ? { activity: { ...a, source: 'desktop' } } : { activity: null, source: 'desktop' }).catch(() => {});
  });
}

// ======================= connections =======================
// The real logos (Simple Icons, simpleicons.org), drawn white on each brand's color.
const BRAND_PATHS = {
  bluesky: 'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z',
  github: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  instagram: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  playstation: 'M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z',
  reddit: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z',
  roblox: 'M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z',
  spotify: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  steam: 'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z',
  tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  xbox: 'M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  website: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8ZM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96ZM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A8 8 0 0 1 5.08 16Zm2.95-8H5.08a8 8 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.03 8ZM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96ZM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4Zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38Z',
};
const brandSvg = k => `<svg class="brand-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${BRAND_PATHS[k]}"/></svg>`;
const CONNECTION_INFO = {
  spotify: { name: 'Spotify', color: '#1db954', icon: brandSvg('spotify'), url: null },
  github: { name: 'GitHub', color: '#24292f', icon: brandSvg('github'), url: n => `https://github.com/${n}` },
  youtube: { name: 'YouTube', color: '#ff0033', icon: brandSvg('youtube'), url: n => `https://youtube.com/${n.startsWith('@') ? n : '@' + n}` },
  twitch: { name: 'Twitch', color: '#9146ff', icon: brandSvg('twitch'), url: n => `https://twitch.tv/${n}` },
  x: { name: 'X', color: '#000000', icon: brandSvg('x'), url: n => `https://x.com/${n}` },
  instagram: { name: 'Instagram', color: '#e1306c', icon: brandSvg('instagram'), url: n => `https://instagram.com/${n}` },
  tiktok: { name: 'TikTok', color: '#000000', icon: brandSvg('tiktok'), url: n => `https://tiktok.com/@${n}` },
  bluesky: { name: 'Bluesky', color: '#1185fe', icon: brandSvg('bluesky'), url: n => `https://bsky.app/profile/${n}` },
  steam: { name: 'Steam', color: '#66c0f4', icon: brandSvg('steam'), url: n => (/^7656\d{13}$/.test(n) ? `https://steamcommunity.com/profiles/${n}` : `https://steamcommunity.com/id/${n}`) },
  reddit: { name: 'Reddit', color: '#ff4500', icon: brandSvg('reddit'), url: n => `https://reddit.com/user/${n}` },
  roblox: { name: 'Roblox', color: '#e2231a', icon: brandSvg('roblox'), url: null },
  xbox: { name: 'Xbox', color: '#107c10', icon: brandSvg('xbox'), url: null },
  playstation: { name: 'PlayStation', color: '#0070d1', icon: brandSvg('playstation'), url: null },
  website: { name: 'Website', color: '#04c5ae', icon: brandSvg('website'), url: n => n },
};
function connectionsHtml(u) {
  const list = (u.connections || []).filter(c => CONNECTION_INFO[c.type]);
  if (!list.length) return '';
  return `<h4>Connections</h4><div class="conn-list">${list.map(c => {
    const info = CONNECTION_INFO[c.type], url = info.url?.(c.name);
    const label = c.type === 'website' ? c.name.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40) : c.name;
    const inner = `<span class="conn-ico" style="--cc:${info.color}">${info.icon}</span><span class="conn-name">${esc(label)}${c.verified ? ' <span class="conn-ok" title="Verified">✓</span>' : ''}</span>`;
    return url ? `<a class="conn" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(info.name)}">${inner}</a>` : `<span class="conn" title="${esc(info.name)}">${inner}</span>`;
  }).join('')}</div>`;
}
async function renderConnections(body) {
  settingsDraft = null;
  let d;
  try { d = await api('GET', '/api/me/connections'); } catch (e) { body.innerHTML = `<h2>Connections</h2><p>${esc(e.message)}</p>`; return; }
  const mine = Object.fromEntries(d.connections.map(c => [c.type, c]));
  body.innerHTML = `<h2>Connections</h2>
    <p class="muted" style="margin:-8px 0 16px">Show your other accounts on your profile. Spotify shows what you're listening to, live.</p>
    <div class="conn-add">${Object.entries(CONNECTION_INFO).map(([k, info]) => `<button class="conn-tile${mine[k] ? ' on' : ''}" data-ctype="${k}" title="${esc(info.name)}"><span class="conn-ico big" style="--cc:${info.color}">${info.icon}</span><small>${esc(info.name)}</small></button>`).join('')}</div>
    <div class="setting-group" id="conn-mine">${d.connections.length ? d.connections.map(c => {
      const info = CONNECTION_INFO[c.type] || { name: c.type, icon: '🔗', color: '#888' };
      return `<div class="sec-dev" data-c="${esc(c.type)}"><span class="conn-ico" style="--cc:${info.color}">${info.icon}</span>
        <div style="flex:1;min-width:0"><b>${esc(info.name)}</b>${c.verified ? ' <span class="ok-pill">✓ Connected</span>' : ''}<div class="muted small">${esc(c.name)}</div></div>
        <label class="conn-show" title="Show on your profile"><span class="muted small">On profile</span><input type="checkbox" class="switch" data-cshow${c.show !== false ? ' checked' : ''}></label>
        <button class="icon-btn danger" data-crm title="Remove">✕</button></div>`;
    }).join('') : '<div class="fp-empty">No connections yet. Pick one above!</div>'}</div>
    ${window.zunoDesktop ? `<p class="muted small conn-tip">${uiIcon('headphones')} Tip: the Zuno desktop app shows your Spotify song on its own, even without connecting.</p>` : ''}`;
  $$('[data-ctype]', body).forEach(b => b.addEventListener('click', () => addConnection(b.dataset.ctype, d.spotifyReady, () => renderConnections(body))));
  $$('[data-c]', body).forEach(r => {
    const type = r.dataset.c;
    $('[data-cshow]', r).addEventListener('change', async e => { try { await api('PUT', `/api/me/connections/${type}`, { show: e.target.checked }); } catch (err) { toast(err.message, true); } });
    $('[data-crm]', r).addEventListener('click', async () => { try { await api('DELETE', `/api/me/connections/${type}`); toast('Removed'); renderConnections(body); } catch (err) { toast(err.message, true); } });
  });
}
async function addConnection(type, spotifyReady, done) {
  const info = CONNECTION_INFO[type];
  if (type === 'spotify') {
    if (!spotifyReady) return toast(window.zunoDesktop ? "Spotify connecting isn't set up on this Zuno yet, but the desktop app already shows your Spotify song." : "Spotify connecting isn't set up on this Zuno yet.", true);
    try { const { url } = await api('GET', '/api/connections/spotify/start'); window.open(url, '_blank'); toast('Finish connecting in the Spotify tab'); } catch (e) { toast(e.message, true); }
    return;
  }
  const ov = openLayer(`<form class="dialog modal"><h3><span class="conn-ico" style="--cc:${info.color}">${info.icon}</span> Add ${esc(info.name)}</h3>
    <label class="field">${type === 'website' ? 'Link' : 'Username'}<input name="n" required maxlength="200" placeholder="${type === 'website' ? 'https://…' : type === 'steam' ? 'Paste your Steam profile link' : 'your username'}" autocapitalize="off" spellcheck="false">${type === 'steam' ? '<span class="hint" style="display:block;margin-top:6px">Easiest: on Steam, open your profile, copy the link (steamcommunity.com/id/… or /profiles/…) and paste it here. Your display name won\'t work.</span>' : ''}</label>
    <p class="muted small">Anyone who opens your profile can see this. Zuno doesn't check that it's really yours.</p>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Add</button></div></form>`);
  const f = $('form', ov);
  f.n.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PUT', `/api/me/connections/${type}`, { name: f.n.value.trim() }); closeLayer(); toast(`${info.name} added`); done(); }
    catch (err) { toast(err.message, true); }
  });
}

// ======================= birthdays =======================
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const birthdayText = b => (b ? `${MONTHS[b.m - 1]} ${b.d}` : '');
// Confetti once a day: on your own birthday, and when you open a friend's DM on theirs.
function birthdayConfetti(u) {
  if (!u?.birthdayToday) return;
  const k = `zuno_bday_${u.id}_${new Date().toDateString()}`;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch {}
  setTimeout(() => screenEffect('birthday'), 400);
  if (u.id !== state.me.id) toast(`🎂 It's ${u.displayName}'s birthday today! Say happy birthday!`);
}

// ======================= mutual friends & servers on profiles =======================
const mutualCache = new Map();
async function loadMutuals(box, id) {
  if (!box || id === state.me.id || user(id)?.system || user(id)?.bot) return;
  let d = mutualCache.get(id);
  if (!d || Date.now() - d.at > 60e3) { try { d = { ...(await api('GET', `/api/users/${id}/mutuals`)), at: Date.now() }; mutualCache.set(id, d); } catch { return; } }
  const slot = $(`.pc-mutuals[data-mutuals="${CSS.escape(id)}"]`, box);
  if (!slot) return;
  slot.innerHTML = `${d.friendSince ? `<div class="pc-since-friends">🤝 Friends since ${new Date(d.friendSince).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
    ${d.servers.length ? `<details class="pc-mut"><summary>${d.servers.length} Mutual Server${d.servers.length === 1 ? '' : 's'}</summary>${d.servers.map(sv => `<button class="pc-mut-row" data-msv="${esc(sv.id)}"><span class="pi-sv" style="--sv:${esc(sv.iconColor)}">${sv.icon ? `<img src="${esc(sv.icon)}" alt="">` : esc([...sv.name][0] || '?')}</span>${esc(sv.name)}${sv.nick ? ` <span class="muted small">as ${esc(sv.nick)}</span>` : ''}</button>`).join('')}</details>` : ''}
    ${d.friends.length ? `<details class="pc-mut"><summary>${d.friends.length} Mutual Friend${d.friends.length === 1 ? '' : 's'}</summary>${d.friends.map(u => `<button class="pc-mut-row" data-mfr="${esc(u.id)}">${avatar(u, 24)}${esc(u.displayName)}</button>`).join('')}</details>` : ''}`;
  $$('[data-msv]', slot).forEach(b => b.addEventListener('click', () => { closeLayer(); openServer(b.dataset.msv); }));
  $$('[data-mfr]', slot).forEach(b => b.addEventListener('click', () => openProfile(b.dataset.mfr)));
}

// Profile cards: activity, birthday, connections and mutuals, before the older extras.
const _profileExtrasP = profileExtrasHtml;
profileExtrasHtml = function (u) {
  if (!state.me) return '';
  const bday = u.birthday ? `<h4>Birthday</h4><div class="pc-bday">${u.birthdayToday ? '🎂 <b>Today!</b> Happy birthday! 🎉' : `🎂 ${birthdayText(u.birthday)}`}</div>` : '';
  return `${activityCard(u)}${bday}${connectionsHtml(u)}${u.id !== state.me.id && !u.bot && !u.system ? `<div class="pc-mutuals" data-mutuals="${esc(u.id)}"></div>` : ''}${_profileExtrasP(u)}`;
};
const _wireProfileExtrasP = wireProfileExtras;
wireProfileExtras = function (ov, u) { _wireProfileExtrasP(ov, u); loadMutuals(ov, u.id); };
const _renderProfilePanelP = renderProfilePanel;
renderProfilePanel = function (opts) {
  _renderProfilePanelP(opts);
  if (state.view.type === 'dm') { const u = user(activePeer()); loadMutuals($('#profile-panel'), activePeer()); birthdayConfetti(u); }
};

// ======================= typed effects =======================
// A few words make the screen celebrate when a message arrives in the chat you're looking at.
// (0.38) Words no longer set off screen effects (hearts, confetti…); only anniversaries celebrate.
const EFFECT_WORDS = [];
function screenEffect(kind) {
  if (motionOff() || !prefs().typedEffects || $('.screen-fx')) return;
  const fx = document.createElement('div');
  fx.className = `screen-fx sfx-${kind}`;
  const parts = { birthday: ['🎈', '🎂', '🎉', '🎈', '🥳', '✨'], hearts: ['❤️', '💖', '💕', '💗'], snow: ['❄️', '❅', '❆'], stars: ['✦', '⭐', '✧', '🌙'] }[kind];
  const n = kind === 'confetti' || kind === 'birthday' ? 70 : 34;
  let html = '';
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 100, d = Math.random() * 1.2, t = 2.2 + Math.random() * 1.8, r = Math.random() * 720 - 360, h = Math.floor(Math.random() * 360);
    const ch = parts && (kind !== 'birthday' || i % 2) ? parts[i % parts.length] : '';
    html += `<i class="${ch ? 'e' : 'c'}" style="left:${x}%;animation-delay:${d}s;animation-duration:${t}s;--r:${r}deg;--h:${h}">${ch}</i>`;
  }
  fx.innerHTML = html;
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 5200);
}
const _onMessageP = onMessage;
onMessage = function (payload) {
  _onMessageP(payload);
  const m = payload.message, conv = payload.conv || payload.peerId;
  if (!m || document.hidden || conv !== activeConv()) return;
  if (m.celebrate === 'anniversary') return screenEffect('confetti');
  const hit = EFFECT_WORDS.find(([re]) => re.test(m.content || ''));
  if (hit) screenEffect(hit[1]);
};

// ======================= settings: Connections, Activity, Birthday, Two-factor, Wrapped =======================
const _openSettingsP = openSettings;
openSettings = function (section) {
  _openSettingsP(section);
  const nav = $('.settings:not(.server-settings-page) .settings-nav > div');
  if (!nav) return;
  const add = (key, label, after) => {
    if ($(`[data-s="${key}"]`, nav)) return;
    const b = document.createElement('button');
    b.dataset.s = key; b.innerHTML = label;
    $(`[data-s="${after}"]`, nav)?.after(b);
    b.addEventListener('click', () => showSettingsSection(key));
  };
  add('connections', 'Connections', 'media');
  add('activity', 'Activity Privacy', 'privacy');
  add('wrapped', '🎁 Zuno Wrapped', 'bloom');
  US_WORDS.connections = 'connections spotify github youtube twitch socials accounts link';
  US_WORDS.activity = 'activity status playing game spotify listening share privacy';
  US_WORDS.wrapped = 'wrapped recap year stats';
  if (!US_WORDS.account.includes('birthday')) US_WORDS.account += ' birthday two-factor 2fa authenticator security code';
  if (!US_WORDS.notifications.includes('ringtone')) US_WORDS.notifications += ' ringtone ringing call mp3';
  if (['connections', 'activity'].includes(section)) showSettingsSection(section);
};
const _showSectionP = showSettingsSection;
showSettingsSection = function (section) {
  if (['connections', 'activity', 'wrapped'].includes(section)) {
    if (settingsDraft && isDraftDirty()) return closeSettings();
    $$('.settings-nav [data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === section));
    const body = $('#settings-body');
    if (section === 'connections') return renderConnections(body);
    if (section === 'activity') return renderActivitySettings(body);
    closeSettingsNow(); return openWrapped();
  }
  _showSectionP(section);
  if (section === 'account' && $('#settings-body .account-card')) renderAccountExtras($('#settings-body'));
  if (section === 'notifications') renderRingtone($('#settings-body'));
};
function renderActivitySettings(body) {
  settingsDraft = null;
  const a = state.users[state.me.id]?.activity;
  body.innerHTML = `<h2>Activity Privacy</h2>
    <div class="setting-group">${prefToggle('shareActivity', 'Share my activity', 'Show the game you\'re playing and the song you\'re listening to on your profile and in member lists.')}</div>
    <div class="setting-group"><h4 class="setting-head">Right now</h4>
      ${a ? `<div class="act-now">${activityCard(state.users[state.me.id])}</div>` : `<p class="muted">${window.zunoDesktop ? "Nothing detected yet. Open a game (or play something in Spotify) and it shows up here within a minute." : 'Activity is detected by the Zuno desktop app. In a browser, connect Spotify in Connections.'}</p>`}
      ${window.zunoDesktop ? '<p class="muted small">Zuno only looks for known games and Spotify. It never looks at your files or anything else.</p>' : ''}</div>`;
  wireToggles(body, renderActivitySettings, (k, v) => { if (k === 'shareActivity' && !v) api('POST', '/api/me/activity', { activity: null }).catch(() => {}); });
}
async function renderAccountExtras(body) {
  const ex = state.extras || {};
  const b = ex.birthday;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="setting-group"><h4 class="setting-head">Birthday</h4>
      <div class="bday-row"><select id="bd-m" class="sc-select"><option value="">Month</option>${MONTHS.map((m, i) => `<option value="${i + 1}"${b?.m === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select>
        <select id="bd-d" class="sc-select"><option value="">Day</option>${Array.from({ length: 31 }, (_, i) => `<option${b?.d === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" id="bd-save">Save</button>${b ? '<button class="btn btn-link btn-sm" id="bd-clear">Remove</button>' : ''}</div>
      <p class="muted small">Friends see a ${uiIcon('cake')} next to your name on your birthday. Only the month and day are shown, never your age.</p></div>
    <div class="setting-group"><h4 class="setting-head">Two-factor login</h4>
      <div class="setting-row"><div><div class="setting-title">${ex.twoFactor ? '🔐 On' : 'Off'}${ex.twoFactor ? ' <span class="ok-pill">Protected</span>' : ''}</div>
        <div class="setting-desc">${ex.twoFactor ? `Logging in needs a code from your authenticator app. ${ex.backupLeft} backup code${ex.backupLeft === 1 ? '' : 's'} left.` : 'Ask for a code from an authenticator app (like Google Authenticator, Authy or 1Password) when you log in, so a stolen password isn\'t enough.'}</div></div>
        <div class="row-btns">${ex.twoFactor ? '<button class="btn btn-grey btn-sm" id="tf-codes">New Backup Codes</button><button class="btn btn-red btn-sm" id="tf-off">Turn Off</button>' : '<button class="btn btn-primary btn-sm" id="tf-on">Turn On</button>'}</div></div></div>`;
  const anchor = $('#settings-body .account-card');
  anchor.after(wrap);
  const saveBday = async birthday => {
    try { await api('PATCH', '/api/me', { birthday, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); state.extras.birthday = birthday; toast(birthday ? 'Birthday saved 🎂' : 'Birthday removed'); showSettingsSection('account'); }
    catch (e) { toast(e.message, true); }
  };
  $('#bd-save', wrap).addEventListener('click', () => { const m = Number($('#bd-m', wrap).value), d = Number($('#bd-d', wrap).value); if (!m || !d) return toast('Pick a month and a day.', true); saveBday({ m, d }); });
  $('#bd-clear', wrap)?.addEventListener('click', () => saveBday(null));
  $('#tf-on', wrap)?.addEventListener('click', setupTwoFactor);
  $('#tf-off', wrap)?.addEventListener('click', () => twoFactorPrompt('Turn off two-factor login', 'Your password and a code from your app (or a backup code).', true, async (password, code) => {
    await api('POST', '/api/me/2fa/disable', { password, code }); await loadExtras(); toast('Two-factor login is off'); showSettingsSection('account');
  }));
  $('#tf-codes', wrap)?.addEventListener('click', () => twoFactorPrompt('New backup codes', 'Enter a code from your app. Your old backup codes stop working.', false, async (_p, code) => {
    const { backupCodes } = await api('POST', '/api/me/2fa/backup-codes', { code }); await loadExtras(); showBackupCodes(backupCodes);
  }));
}

// ======================= ringtone =======================
// Your own MP3 rings when someone calls you. Only you hear it.
function renderRingtone(body) {
  const rt = state.extras?.ringtone;
  const g = document.createElement('div');
  g.className = 'setting-group';
  g.innerHTML = `<h4 class="setting-head">Ringtone</h4>
    <p class="setting-desc" style="margin:0 0 10px">What you hear when someone calls you. Only you hear your ringtone.</p>
    <div class="rt-list">
      <div class="rt-row${rt ? '' : ' on'}"><span class="rt-ico">🌱</span><div style="flex:1;min-width:0"><b>Zuno</b><div class="muted small">Zuno's own ringtone</div></div><button class="btn btn-grey btn-sm" data-rt-play="">▶ Play</button></div>
      ${rt ? `<div class="rt-row on"><span class="rt-ico">🎵</span><div style="flex:1;min-width:0"><b>${esc(rt.name)}</b><div class="muted small">Your MP3 · in use</div></div><button class="btn btn-grey btn-sm" data-rt-play="${esc(rt.url)}">▶ Play</button><button class="btn btn-link btn-sm" id="rt-remove">Use Zuno's</button></div>` : ''}
    </div>
    <button class="btn btn-primary btn-sm" id="rt-upload" style="margin-top:10px">${rt ? 'Change MP3' : 'Upload an MP3'}</button><span class="muted small" id="rt-status" style="margin-left:8px">Up to 4 MB.</span>
    <input type="file" id="rt-file" class="hidden" accept="audio/mpeg,.mp3">`;
  body.appendChild(g);
  let stop = null;
  $$('[data-rt-play]', g).forEach(b => b.addEventListener('click', () => {
    if (b.dataset.playing) { stop?.(); delete b.dataset.playing; b.textContent = '▶ Play'; return; }
    $$('[data-rt-play]', g).forEach(x => { delete x.dataset.playing; x.textContent = '▶ Play'; });
    stop = Calls.previewRing(b.dataset.rtPlay || null);
    b.dataset.playing = '1'; b.textContent = '■ Stop';
    setTimeout(() => { if (b.dataset.playing) { delete b.dataset.playing; b.textContent = '▶ Play'; } }, 8000);
  }));
  $('#rt-upload', g).addEventListener('click', () => $('#rt-file', g).click());
  $('#rt-file', g).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4e6) return toast('That MP3 is too big (max 4 MB).', true);
    $('#rt-status', g).textContent = 'Uploading…';
    try {
      const res = await fetch('/api/me/ringtone', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'audio/mpeg', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      state.extras.ringtone = d.ringtone; toast('Ringtone set 🎵'); stop?.(); showSettingsSection('notifications');
    } catch (err) { toast(err.message, true); $('#rt-status', g).textContent = ''; }
  });
  $('#rt-remove', g)?.addEventListener('click', async () => {
    try { await api('DELETE', '/api/me/ringtone'); state.extras.ringtone = null; stop?.(); showSettingsSection('notifications'); } catch (err) { toast(err.message, true); }
  });
}

// ======================= two-factor login =======================
function loadQrLib() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
}
async function setupTwoFactor() {
  const ov = openLayer(`<form class="dialog modal tf-dialog"><h3>🔐 Turn on two-factor login</h3>
    <label class="field">First, your password<input name="pw" type="password" required autocomplete="current-password"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Next</button></div></form>`);
  const f = $('form', ov);
  f.pw.focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    let d;
    try { d = await api('POST', '/api/me/2fa/setup', { password: f.pw.value }); } catch (err) { return toast(err.message, true); }
    let qr = '';
    try { await loadQrLib(); const q = qrcode(0, 'M'); q.addData(d.uri); q.make(); qr = q.createSvgTag({ cellSize: 5, margin: 3, scalable: true }); } catch {}
    const ov2 = openLayer(`<form class="dialog modal tf-dialog"><h3>🔐 Scan with your authenticator app</h3>
      <ol class="tf-steps"><li>Open an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, 1Password…).</li><li>Add an account and scan this code.</li><li>Type the 6-digit code it shows.</li></ol>
      <div class="tf-qr">${qr || '<div class="muted small">The QR code couldn\'t load. Use the key below.</div>'}</div>
      <div class="muted small" style="text-align:center">Can't scan? Type this key: <code class="tf-key">${esc(d.secret.match(/.{1,4}/g).join(' '))}</code></div>
      <label class="field">6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="123 456"></label>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Turn On</button></div></form>`);
    const f2 = $('form', ov2);
    f2.code.focus();
    $('[data-a=cancel]', ov2).addEventListener('click', dismissLayer);
    f2.addEventListener('submit', async ev => {
      ev.preventDefault();
      try { const { backupCodes } = await api('POST', '/api/me/2fa/enable', { code: f2.code.value }); await loadExtras(); showBackupCodes(backupCodes, true); }
      catch (err) { toast(err.message, true); }
    });
  });
}
function showBackupCodes(codes, fresh = false) {
  const text = `Zuno backup codes for ${state.me.username}\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const ov = openLayer(`<div class="dialog modal tf-dialog"><h3>${fresh ? '✅ Two-factor login is on!' : '🔑 Your new backup codes'}</h3>
    <p class="muted" style="margin:0 0 10px">If you lose your phone, each of these codes lets you log in once. Save them now: Zuno won't show them again.${fresh ? ' Other devices were logged out.' : ''}</p>
    <div class="tf-codes">${codes.map(c => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="actions"><button class="btn btn-grey" data-a="copy">Copy</button><button class="btn btn-grey" data-a="save">Download</button><button class="btn btn-primary" data-a="ok">I saved them</button></div></div>`);
  $('[data-a=copy]', ov).addEventListener('click', e => { navigator.clipboard.writeText(text); e.target.textContent = 'Copied!'; });
  $('[data-a=save]', ov).addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'zuno-backup-codes.txt'; a.click(); });
  $('[data-a=ok]', ov).addEventListener('click', () => { closeLayer(); if ($('#settings-body')) showSettingsSection('account'); else openSettings('account'); });
}
function twoFactorPrompt(title, desc, needPassword, run) {
  const ov = openLayer(`<form class="dialog modal"><h3>${esc(title)}</h3><p class="muted" style="margin:0 0 12px">${esc(desc)}</p>
    ${needPassword ? '<label class="field">Password<input name="pw" type="password" required autocomplete="current-password"></label>' : ''}
    <label class="field">Code<input name="code" required autocomplete="one-time-code" maxlength="12" placeholder="123456 or a backup code"></label>
    <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Continue</button></div></form>`);
  const f = $('form', ov);
  (f.pw || f.code).focus();
  $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
  f.addEventListener('submit', async e => { e.preventDefault(); try { await run(f.pw?.value, f.code.value.trim()); } catch (err) { toast(err.message, true); } });
}
// The second step of logging in. Resolves with { token }, or null if they back out.
function askTwoFactor(ticket) {
  return new Promise(resolve => {
    const ov = openLayer(`<form class="dialog modal tf-dialog">${mascot('curious')}<h3>Two-factor login</h3>
      <p class="muted" style="margin:0 0 12px;text-align:center">Open your authenticator app and type the 6-digit code for Zuno.</p>
      <label class="field">Code<input name="code" required autocomplete="one-time-code" inputmode="numeric" maxlength="12" placeholder="123456"></label>
      <p class="muted small">Lost your phone? Type one of your backup codes instead.</p>
      <div class="form-error" id="tf-err"></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Back</button><button class="btn btn-primary">Log In</button></div></form>`);
    const f = $('form', ov);
    f.code.focus();
    $('[data-a=cancel]', ov).addEventListener('click', () => { closeLayer(); resolve(null); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('POST', '/api/login/2fa', { ticket, code: f.code.value.trim() }); closeLayer(); resolve(r); }
      catch (err) { $('#tf-err', ov).textContent = err.message; if (/took too long|again/.test(err.message)) setTimeout(() => { closeLayer(); resolve(null); }, 1500); }
    });
  });
}

// ======================= Zuno Wrapped =======================
async function openWrapped(year) {
  let w;
  try { w = (await api('GET', `/api/me/wrapped${year ? `?year=${year}` : ''}`)).wrapped; } catch (e) { return toast(e.message, true); }
  const fmt = n => Number(n || 0).toLocaleString();
  const hourLabel = h => new Date(2020, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
  const maxH = Math.max(1, ...w.hours);
  const slides = [];
  slides.push(`<div class="wr-big">${mascot('happy', 'zm-wiggle')}</div><div class="wr-kicker">Zuno Wrapped</div><h1 class="wr-title">Your ${w.year}<br>on Zuno</h1><p class="wr-sub">Tap to see how your year went. ✨</p>`);
  if (!w.messages) slides.push(`<div class="wr-big">🌱</div><h1 class="wr-title">Your story is just starting</h1><p class="wr-sub">You haven't sent many messages yet this year. Go say hi to your friends, and check back later!</p>`);
  else {
    slides.push(`<div class="wr-kicker">You sent</div><div class="wr-num" data-count="${w.messages}">0</div><div class="wr-kicker">messages</div><p class="wr-sub">That's ${fmt(w.words)} words, about ${fmt(Math.max(1, Math.round(w.words / 250)))} pages of a book. 📖</p>`);
    if (w.persona) slides.push(`<div class="wr-big">${w.persona[1]}</div><div class="wr-kicker">You're a</div><h1 class="wr-title">${esc(w.persona[0])}</h1><p class="wr-sub">${esc(w.persona[2])} Your busiest hour: <b>${hourLabel(w.peakHour)}</b>.</p>
      <div class="wr-hours">${w.hours.map((n, h) => `<i style="height:${Math.max(4, (n / maxH) * 100)}%" class="${h === w.peakHour ? 'peak' : ''}" title="${hourLabel(h)}: ${n}"></i>`).join('')}</div>`);
    if (w.topFriends.length) slides.push(`<div class="wr-kicker">Your people</div><h1 class="wr-title">Top friends</h1><div class="wr-list">${w.topFriends.map((f, i) => `<div class="wr-row" style="animation-delay:${0.15 + i * 0.12}s"><span class="wr-rank">${i + 1}</span>${avatar(f.user, 44)}<b>${esc(f.user.displayName)}</b><span>${fmt(f.count)} messages</span></div>`).join('')}</div>`);
    if (w.topServers.length) slides.push(`<div class="wr-kicker">Where you hung out</div><h1 class="wr-title">Top servers</h1><div class="wr-list">${w.topServers.map((sv, i) => `<div class="wr-row" style="animation-delay:${0.15 + i * 0.12}s"><span class="wr-rank">${i + 1}</span><span class="pi-sv wr-sv" style="--sv:${esc(sv.iconColor)}">${sv.icon ? `<img src="${esc(sv.icon)}" alt="">` : esc([...sv.name][0] || '?')}</span><b>${esc(sv.name)}</b><span>${fmt(sv.count)}</span></div>`).join('')}</div>${w.topChannel ? `<p class="wr-sub">Favorite channel: <b>#${esc(w.topChannel.name)}</b> in ${esc(w.topChannel.server)}</p>` : ''}`);
    if (w.topEmoji.length) slides.push(`<div class="wr-kicker">Your vibe in emoji</div><div class="wr-emoji">${w.topEmoji.map((e, i) => `<span style="animation-delay:${i * 0.12}s">${renderEmojiToken(e.emoji)}<small>${fmt(e.count)}×</small></span>`).join('')}</div><p class="wr-sub">${renderEmojiToken(w.topEmoji[0].emoji)} was your favorite, used ${fmt(w.topEmoji[0].count)} times.</p>`);
    slides.push(`<div class="wr-kicker">The little things</div><div class="wr-grid">
      <div><b data-count="${w.daysActive}">0</b><small>${w.daysActive === 1 ? 'day' : 'days'} you chatted</small></div><div><b data-count="${w.streak}">0</b><small>${w.streak === 1 ? 'day' : 'days'} best streak 🔥</small></div>
      <div><b data-count="${w.reactionsGiven}">0</b><small>reactions given</small></div><div><b data-count="${w.reactionsGot}">0</b><small>reactions you got</small></div>
      <div><b data-count="${w.gifs}">0</b><small>GIFs sent</small></div><div><b data-count="${w.voice}">0</b><small>voice messages</small></div>
      ${w.newFriends ? `<div><b data-count="${w.newFriends}">0</b><small>new friends</small></div>` : ''}${w.voiceHours ? `<div><b data-count="${w.voiceHours}">0</b><small>hours in voice</small></div>` : ''}</div>`);
  }
  const summary = `My Zuno Wrapped ${w.year} 🎁\n${fmt(w.messages)} messages · ${fmt(w.daysActive)} days · best streak ${w.streak} days${w.persona ? `\nI'm a ${w.persona[0]} ${w.persona[1]}` : ''}${w.topEmoji[0] ? `\nFavorite emoji: ${w.topEmoji[0].emoji}` : ''}`;
  slides.push(`<div class="wr-card"><div class="wr-kicker">Zuno Wrapped ${w.year}</div>${avatar(state.me, 72)}<h2>${esc(state.me.displayName)}</h2>
    <div class="wr-card-stats"><div><b>${fmt(w.messages)}</b><small>messages</small></div><div><b>${fmt(w.daysActive)}</b><small>days</small></div><div><b>${w.persona ? w.persona[1] : '🌱'}</b><small>${esc(w.persona?.[0] || 'Newcomer')}</small></div></div>
    ${w.topFriends[0] ? `<div class="wr-card-line">Top friend: <b>${esc(w.topFriends[0].user.displayName)}</b></div>` : ''}${w.topEmoji[0] ? `<div class="wr-card-line">Favorite emoji: ${renderEmojiToken(w.topEmoji[0].emoji)}</div>` : ''}</div>
    <div class="wr-acts"><button class="btn btn-primary" data-wr="copy">Copy to share</button><button class="btn btn-grey" data-wr="close">Done</button></div>`);
  const ov = document.createElement('div');
  ov.className = 'wrapped';
  ov.innerHTML = `<div class="wr-bars">${slides.map(() => '<i><b></b></i>').join('')}</div><button class="wr-x" aria-label="Close">✕</button><div class="wr-stage"></div><button class="wr-nav prev" aria-label="Back"></button><button class="wr-nav next" aria-label="Next"></button>`;
  document.body.appendChild(ov);
  let i = 0;
  const show = n => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    $('.wr-stage', ov).innerHTML = `<div class="wr-slide s${i % 5}">${slides[i]}</div>`;
    $$('.wr-bars i', ov).forEach((b, k) => b.className = k < i ? 'done' : k === i ? 'now' : '');
    for (const el of $$('[data-count]', ov)) { const to = Number(el.dataset.count), t0 = performance.now(); const tick = t => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - (1 - p) ** 3)).toLocaleString(); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    $('[data-wr=copy]', ov)?.addEventListener('click', e => { e.stopPropagation(); navigator.clipboard.writeText(summary); e.target.textContent = 'Copied!'; burst(e.target, 14); });
    $('[data-wr=close]', ov)?.addEventListener('click', e => { e.stopPropagation(); close(); });
    if (i === slides.length - 1) screenEffect('confetti');
  };
  const close = () => { ov.remove(); document.removeEventListener('keydown', keys); };
  const keys = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' || e.key === ' ') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  document.addEventListener('keydown', keys);
  $('.wr-x', ov).addEventListener('click', close);
  $('.wr-nav.next', ov).addEventListener('click', () => show(i + 1));
  $('.wr-nav.prev', ov).addEventListener('click', () => show(i - 1));
  show(0);
}
// Your own menu (click your avatar) gets Zuno Wrapped too.
const _openStatusMenuP = openStatusMenu;
openStatusMenu = function (anchor) {
  _openStatusMenuP(anchor);
  addMenuItem({ label: 'Zuno Wrapped', icon: ico('🎁'), run: () => openWrapped() });
};

// ======================= start-up =======================
const _startP = start;
start = async function () {
  await _startP();
  // Your time zone, so birthdays start at your midnight.
  api('PATCH', '/api/me', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
  birthdayConfetti(state.users[state.me.id] || state.me);
  if (state.me.birthdayToday) toast(`🎂 Happy birthday, ${state.me.displayName}!`);
};
