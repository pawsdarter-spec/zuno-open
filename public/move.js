'use strict';
// (0.53) The start-up sketch looks like what's about to open: the sign-in page, a chat in a
// server, a DM, or your list of chats (zuno53.css).
try {
  const v = JSON.parse(sessionStorage.getItem('zuno_last_view') || 'null');
  document.documentElement.dataset.sk53 = !localStorage.getItem('zuno_token') ? 'auth'
    : /[?&]open=|\/invite\//.test(location.href) ? 'server'
    : v?.type === 'channel' ? 'server' : v?.type === 'dm' || v?.type === 'group' ? 'dm' : 'friends';
} catch {}
// Zuno lives at heyzuno.uk now. Opening the old onrender.com address moves you there, logged in.
(function () {
  const NEW_HOST = 'heyzuno.uk';
  const here = location.hostname;
  // On heyzuno.uk: a #handoff=… code from the old address logs you in here.
  const m = /[#&]handoff=([A-Za-z0-9_-]{20,64})/.exec(location.hash);
  if (m && here === NEW_HOST) {
    history.replaceState(null, '', location.pathname + location.search);
    if (!localStorage.getItem('zuno_token')) {
      // Done before the app starts, so it opens already logged in.
      const x = new XMLHttpRequest();
      x.open('POST', '/api/handoff/redeem', false);
      x.setRequestHeader('Content-Type', 'application/json');
      try { x.send(JSON.stringify({ code: m[1] })); const r = JSON.parse(x.responseText || '{}'); if (r.token) localStorage.setItem('zuno_token', r.token); } catch {}
    }
    return;
  }
  if (!/\.onrender\.com$/i.test(here) || window.zunoDesktop) return;
  // Installed as an app from the old address: moving would take it outside the address it was
  // installed for, and the browser then shows a bar with the link at the top. It stays here
  // instead (it's the same Zuno), and offers to move over in the app.
  const installed = ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen'].some(m => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone;
  if (installed) { window.zunoOldInstall = true; return; }
  const to = 'https://' + NEW_HOST + location.pathname + location.search;
  const token = localStorage.getItem('zuno_token');
  document.documentElement.style.visibility = 'hidden';
  if (!token) return location.replace(to + location.hash);
  fetch('/api/me/handoff', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
    .then(r => r.ok ? r.json() : {})
    .then(d => location.replace(to + (d.code ? '#handoff=' + d.code : location.hash)))
    .catch(() => location.replace(to + location.hash));
})();
