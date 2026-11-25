// Zuno's service worker: lets Zuno be installed on phones and open quickly, even offline.
// It always tries the network first, so everyone gets the newest Zuno; saved copies are only used
// when there's no connection. Your recent chats are saved per account (offline mode) and cleared
// when you log out.
const CACHE = 'zuno-shell-v52';
const API_CACHE = 'zuno-api-v1';
const SHELL = ['/', '/lang45.js', '/styles.css', '/app.js', '/emoji.js', '/servers.js', '/calls.js', '/extras.js', '/bloom.js', '/polish.js', '/moderation.js', '/serverconfig.js', '/pings.js', '/roles.js', '/discover.js', '/devportal.js', '/requests.js', '/flair.js', '/serverplus.js', '/chatplus.js', '/account.js', '/groups.js', '/people.js', '/media.js', '/hangout.js', '/look.js', '/chat16.js', '/community16.js', '/secure16.js', '/handy.js', '/zuno18.js', '/zuno19.js', '/zuno20.js', '/zuno21.js', '/zuno22.js', '/zuno23.js', '/zuno25.js', '/zuno26.js', '/zuno27.js', '/zuno28.js', '/zuno29.js', '/zuno30.js', '/zuno31.js', '/zuno32.js', '/zuno33.js', '/zuno35.js', '/zuno36.js', '/zuno37.js', '/zuno38.js', '/zuno39.js', '/zuno40.js', '/zuno41.js', '/zuno42.js', '/zuno43.js', '/zuno44.js', '/zuno45.js', '/zuno46.js', '/zuno47.js', '/zuno48.js', '/zuno49.js', '/zuno50.js', '/boot.js', '/zuno14.css', '/zuno15.css', '/zuno16.css', '/zuno19.css', '/zuno20.css', '/zuno21.css', '/zuno22.css', '/zuno23.css', '/zuno25.css', '/zuno26.css', '/zuno27.css', '/zuno28.css', '/zuno29.css', '/zuno30.css', '/zuno31.css', '/zuno32.css', '/zuno33.css', '/zuno35.css', '/zuno36.css', '/zuno37.css', '/zuno38.css', '/zuno39.css', '/zuno40.css', '/zuno41.css', '/zuno42.css', '/zuno43.css', '/zuno44.css', '/zuno45.css', '/zuno46.css', '/zuno47.css', '/zuno48.css', '/zuno49.css', '/zuno50.css', '/logo.png', '/icon-192.png', '/status.html', '/status.js'];
// What gets saved for offline reading: everything the app loads on start, and chat messages.
const OFFLINE_API = [/^\/api\/me$/, /^\/api\/me\/extras$/, /^\/api\/(dms|channels|groups)\/[^/]+\/messages$/, /^\/api\/servers\/[^/]+$/, /^\/api\/version$/];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== API_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data?.type === 'clear-api') caches.delete(API_CACHE); });
// Each account's saved copies are kept apart (by a fingerprint of its login, never the login itself).
async function apiKey(req, url) {
  const auth = req.headers.get('Authorization') || '';
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth));
  const who = [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${url.origin}${url.pathname}?__who=${who}`;
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (url.search || !OFFLINE_API.some(re => re.test(url.pathname)) || !e.request.headers.get('Authorization')) return;
    e.respondWith((async () => {
      const key = await apiKey(e.request, url);
      try {
        const res = await fetch(e.request);
        if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then(c => c.put(key, copy)); }
        if (res.status >= 502 && res.status <= 504) return (await caches.match(key)) || res; // restarting: use the saved copy
        return res;
      } catch (err) {
        const saved = await caches.match(key);
        if (saved) return saved;
        // (0.38) No connection and nothing saved: a normal "offline" answer the app understands,
        // instead of an error in the console.
        return new Response(JSON.stringify({ error: "You're offline. Zuno will catch up when you're back." }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/files/')) return;
  // (0.47) Downloads go straight to the network (they redirect to cloud storage, which this worker
  // can't follow for other sites, so it used to answer with the app instead of the installer).
  if (url.pathname.startsWith('/download/') || url.pathname === '/download') return;
  const path = url.pathname === '/status' ? '/status.html' : url.pathname;
  // (0.38) App files carry their version in the address (?v=…), so a saved copy is always right:
  // it's used straight away, with no trip to the network and no re-saving on every start. (Asking
  // the network for every one of ~75 files each time made Zuno slow to open.)
  if (url.searchParams.has('v') && e.request.mode !== 'navigate') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) { c.put(e.request.url, res.clone()); if (SHELL.includes(path)) c.put(path, res.clone()); }
      return res;
    }).catch(() => caches.match(path).then(r => r || fetch(e.request))));
    return;
  }
  // On the old onrender address, pages are asked for without the server's move to heyzuno.uk: an
  // app installed from there has to stay there (moving shows a link bar at the top), and move.js in
  // the page moves everyone else over, logged in.
  const oldHost = e.request.mode === 'navigate' && /\.onrender\.com$/i.test(location.hostname);
  const get = () => (oldHost ? fetch(url.href, { headers: { 'X-Zuno-App': '1' }, credentials: 'same-origin', cache: 'no-store' }) : fetch(e.request));
  e.respondWith(get().then(res => {
    if (res.ok && SHELL.includes(path)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(path, copy)); }
    if (res.status >= 502 && res.status <= 504) return caches.match(path).then(r => r || (path === '/' || !path.includes('.') ? caches.match('/') : null)).then(r => r || res);
    return res;
  }).catch(() => caches.match(path).then(r => r || caches.match('/'))));
});

// ---------- phone notifications (0.28) ----------
// The server sends each notification encrypted for this device; the browser decrypts it and
// hands it here. Tapping it opens (or focuses) Zuno on that chat.
self.addEventListener('push', e => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch { n = { body: e.data?.text() || '' }; }
  e.waitUntil((async () => {
    // (Always shown: phones stop delivering notifications to apps that receive one and show
    // nothing. The server already skips sending while you're looking at Zuno.)
    await self.registration.showNotification(n.title || 'Zuno', {
      body: n.body || '', tag: n.tag || undefined, renotify: !!n.tag, icon: n.icon && /^\//.test(n.icon) ? n.icon : '/icon-192.png', badge: '/icon-192.png',
      data: { open: n.open || null, url: n.url || '/' }, requireInteraction: !!n.call, vibrate: n.call ? [300, 150, 300, 150, 300] : [120],
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = e.notification.data?.open || null;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins[0];
    if (w) { await w.focus(); w.postMessage({ type: 'zuno-open', open }); return; }
    await self.clients.openWindow(open ? `/?open=${encodeURIComponent(open)}` : '/');
  })());
});
