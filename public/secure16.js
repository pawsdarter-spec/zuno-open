'use strict';
// Zuno 0.16, safety and reliability: passkeys, end-to-end encrypted DMs, offline mode, and a link
// to the status page.

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));

// ======================= passkeys =======================
const passkeysOk = () => !!(window.PublicKeyCredential && navigator.credentials?.create);
// Asks for your password before something sensitive. Resolves to the password, or '' if cancelled.
function askPassword(title, text) {
  return new Promise(resolve => {
    const ov = openLayer(`<form class="dialog modal"><h3>${esc(title)}</h3><p class="muted" style="margin:0 0 12px">${esc(text)}</p>
      <label class="field">Your password<input name="password" type="password" required autocomplete="current-password"></label>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Continue</button></div></form>`);
    const f = $('form', ov);
    f.password.focus();
    $('[data-a=cancel]', ov).addEventListener('click', () => { dismissLayer(); resolve(''); });
    f.addEventListener('submit', e => { e.preventDefault(); const v = f.password.value; closeLayer(); resolve(v); });
  });
}
async function addPasskey() {
  if (!passkeysOk()) return toast("This browser can't use passkeys.", true);
  try {
    const password = await askPassword('Add a passkey', 'Type your password to add a passkey to your account.');
    if (!password) return;
    const o = await api('POST', '/api/me/passkeys/options', { password });
    const cred = await navigator.credentials.create({ publicKey: {
      ...o, challenge: unb64u(o.challenge), user: { ...o.user, id: unb64u(o.user.id) },
      excludeCredentials: o.excludeCredentials.map(c => ({ ...c, id: unb64u(c.id) })),
    } });
    if (!cred) return;
    const name = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows Hello' : 'Passkey';
    await api('POST', '/api/me/passkeys', { name, clientDataJSON: b64u(cred.response.clientDataJSON), attestationObject: b64u(cred.response.attestationObject) });
    toast('🔑 Passkey added! Next time, log in with it.');
    state.passkeys = (await api('GET', '/api/me')).passkeys || [];
    if ($('#settings-body .account-card')) showSettingsSection('account');
  } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || 'Adding the passkey failed.', true); }
}
async function loginWithPasskey(btn) {
  if (!passkeysOk()) return toast("This browser can't use passkeys.", true);
  btn && (btn.disabled = true);
  try {
    const o = await api('POST', '/api/login/passkey/options');
    const cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout } });
    if (!cred) return;
    const r = cred.response;
    const { token } = await api('POST', '/api/login/passkey', { id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) });
    state.token = token;
    localStorage.setItem('zuno_token', token);
    await start();
  } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') $('#auth-error').textContent = e.message || 'That passkey didn\'t work.'; }
  finally { btn && (btn.disabled = false); }
}
const _showAuthP = showAuth;
showAuth = function (...a) {
  _showAuthP(...a);
  const form = $('#auth-form');
  if (!form || $('#pk-login', form) || !passkeysOk()) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'pk-login'; b.className = 'btn btn-grey btn-block pk-login login-only';
  b.innerHTML = '🔑 Log in with a passkey';
  $('#auth-submit', form)?.after(b);
  b.addEventListener('click', () => loginWithPasskey(b));
};
const _showSettingsSectionP = showSettingsSection;
showSettingsSection = function (section) {
  _showSettingsSectionP(section);
  const body = $('#settings-body');
  if (section === 'account' && $('.account-card', body)) renderPasskeys(body);
  if (section === 'about') addStatusLink(body);
};
function renderPasskeys(body) {
  const list = state.passkeys || [];
  const g = document.createElement('div');
  g.className = 'setting-group'; g.id = 'pk-group';
  g.innerHTML = `<h4 class="setting-head">Passkeys</h4>
    <p class="setting-desc" style="margin:0 0 10px">Log in with your fingerprint, face or phone instead of a password. Passkeys can't be guessed or phished.</p>
    ${list.map(k => `<div class="bug-row pk-row"><span class="pk-ico">🔑</span><div style="flex:1;min-width:0"><b>${esc(k.name)}</b><div class="muted small">Added ${esc(new Date(k.createdAt).toLocaleDateString())}${k.lastUsed ? ` · last used ${esc(fmtTime(k.lastUsed))}` : ''}</div></div><button class="btn btn-link btn-sm" data-pkren="${esc(k.id)}">Rename</button><button class="btn btn-grey btn-sm" data-pkdel="${esc(k.id)}">Remove</button></div>`).join('')}
    <button class="btn btn-primary btn-sm" id="pk-add"${passkeysOk() ? '' : ' disabled title="This browser can\'t use passkeys"'}>Add a Passkey</button>`;
  const after = $('#settings-body .account-card').nextElementSibling;
  (after || $('.account-card', body)).after(g);
  $('#pk-add', g).addEventListener('click', addPasskey);
  $$('[data-pkdel]', g).forEach(b => b.addEventListener('click', () => confirmDialog('Remove this passkey?', "You won't be able to log in with it anymore.", 'Remove', async () => {
    try { await api('DELETE', `/api/me/passkeys/${b.dataset.pkdel}`); state.passkeys = state.passkeys.filter(k => k.id !== b.dataset.pkdel); showSettingsSection('account'); } catch (e) { toast(e.message, true); }
  })));
  $$('[data-pkren]', g).forEach(b => b.addEventListener('click', async () => {
    const k = list.find(x => x.id === b.dataset.pkren);
    const name = await askText('Name this passkey', { value: k.name, ok: 'Save', required: true, max: 40 });
    if (name) api('PATCH', `/api/me/passkeys/${k.id}`, { name }).then(r => { Object.assign(k, r.passkey); showSettingsSection('account'); }).catch(e => toast(e.message, true));
  }));
}

// ======================= end-to-end encrypted DMs =======================
// Each device has its own key pair (the private key can't leave this browser). A message is locked
// with a fresh key, and that key is locked separately for every device of both people.
const E2E_DB = 'zuno-e2e';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(E2E_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode), st = tx.objectStore('keys');
      const req = fn(st);
      tx.oncomplete = () => { resolve(req?.result); open.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
let myDevice = null; // { id, privateKey, publicJwk }
let deviceLoading = null; // one load at a time (a page full of encrypted messages used to start dozens)
function ensureDevice() {
  if (!window.crypto?.subtle || !window.indexedDB || !state.me) return Promise.resolve(null);
  if (myDevice?.uid === state.me.id) return Promise.resolve(myDevice);
  if (deviceLoading?.uid === state.me.id) return deviceLoading;
  const uid = state.me.id;
  deviceLoading = (async () => {
    try {
      let d = await idb('readonly', st => st.get(uid));
      if (!d) {
        const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
        const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
        d = { id: 'd' + b64u(crypto.getRandomValues(new Uint8Array(12))), privateKey: kp.privateKey, publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
        await idb('readwrite', st => st.put(d, uid));
      }
      if (state.me?.id !== uid) return null;
      myDevice = { ...d, uid };
      await registerDevice();
      return myDevice;
    } catch { return null; } finally { deviceLoading = null; }
  })();
  deviceLoading.uid = uid;
  return deviceLoading;
}
// Tells Zuno about this device's public key. If that fails (offline, say), the key still works
// for reading here, and it tries again a bit later.
async function registerDevice(tries = 0) {
  const d = myDevice;
  if (!d) return;
  const name = /Electron|Zuno/.test(navigator.userAgent) ? 'Zuno desktop' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Edg\//.test(navigator.userAgent) ? 'Edge' : /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' : 'Chrome';
  try { await api('PUT', '/api/me/e2e/devices', { id: d.id, key: d.publicJwk, name }); }
  catch { if (tries < 5 && myDevice === d) setTimeout(() => registerDevice(tries + 1), 5000 * (tries + 1)); }
}
const devicesCache = new Map(); // userId -> { at, devices }
// Public keys only (safe to keep): remembered so encrypted messages can be written offline.
function lsKeys(uid, devices) {
  try {
    const all = JSON.parse(localStorage.getItem('zuno_e2e_keys') || '{}');
    if (!devices) return all[uid] || null;
    all[uid] = devices; localStorage.setItem('zuno_e2e_keys', JSON.stringify(all));
  } catch { return null; }
}
async function devicesOf(uid, fresh = false) {
  const c = devicesCache.get(uid);
  if (c && !fresh && Date.now() - c.at < 5 * 60e3) return c.devices;
  try {
    const { devices } = await _apiE('GET', `/api/users/${uid}/e2e`);
    devicesCache.set(uid, { at: Date.now(), devices });
    lsKeys(uid, devices);
    return devices;
  } catch (e) {
    // Offline: use the keys we saw last (saved on this device), so the message can wait to be sent.
    const saved = c?.devices || lsKeys(uid);
    if (saved) return saved;
    throw e;
  }
}
const importPub = jwk => crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = (priv, pubKey) => crypto.subtle.deriveKey({ name: 'ECDH', public: pubKey }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const plainCache = new Map(); // ciphertext -> text
async function encryptFor(peerId, text) {
  const dev = await ensureDevice();
  if (!dev) throw new Error("This browser can't encrypt messages. Turn off encryption for this chat, or use another browser.");
  const targets = [...await devicesOf(peerId, true), ...await devicesOf(state.me.id, true)];
  if (!targets.some(d => d.id === dev.id)) targets.push({ id: dev.id, key: dev.publicJwk });
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text));
  const keys = {};
  for (const t of targets) {
    const s = await shared(dev.privateKey, await importPub(t.key));
    const kiv = crypto.getRandomValues(new Uint8Array(12));
    keys[t.id] = { iv: b64u(kiv), k: b64u(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: kiv }, s, raw)) };
  }
  const e2e = { v: 1, from: dev.id, iv: b64u(iv), ct: b64u(ct), keys };
  plainCache.set(e2e.ct, text);
  return e2e;
}
async function decrypt(e) {
  if (plainCache.has(e.ct)) return plainCache.get(e.ct);
  const dev = await ensureDevice();
  if (!dev) return null; // not ready (or can't encrypt here): don't remember it as unreadable
  const mine = e.keys?.[dev.id];
  if (!mine) { plainCache.set(e.ct, null); return null; }
  try {
    // A key shared from another of your devices says which device locked it (fk).
    const s = await shared(dev.privateKey, await importPub(mine.fk || e.fromKey));
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(mine.iv) }, s, unb64u(mine.k));
    const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const text = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(e.iv) }, k, unb64u(e.ct)));
    plainCache.set(e.ct, text);
    return text;
  } catch { plainCache.set(e.ct, null); return null; }
}
const NO_KEY = '*This message was encrypted for your other devices, so it can\'t be read here.*';
// Show messages decrypted: their text goes back in place just before drawing.
const _renderMessagesE = renderMessages;
let decrypting = false;
renderMessages = function (...a) {
  const convo = state.convos[activeConv()];
  const waiting = [];
  for (const m of convo?.messages || []) {
    if (!m.e2e) continue;
    if (plainCache.has(m.e2e.ct)) m.content = plainCache.get(m.e2e.ct) ?? NO_KEY;
    else { m.content = '…'; waiting.push(m); }
  }
  _renderMessagesE(...a);
  // (0.48) No lock in front of each encrypted message: the 🔒 button at the top shows the chat is encrypted.
  if (waiting.length && !decrypting) {
    decrypting = true;
    Promise.all(waiting.map(m => decrypt(m.e2e))).finally(() => { decrypting = false; if (activeConv()) renderMessages(); });
  }
};
// Sending and editing in an encrypted DM.
const _apiE = api;
api = async function (method, url, body) {
  const dm = /^\/api\/dms\/([^/]+)\/messages(?:\/([^/]+))?$/.exec(url);
  if (dm && body?.content && (method === 'POST' && !dm[2] || method === 'PATCH' && dm[2])) {
    const peer = dm[1], convo = state.convos[peer];
    const editing = method === 'PATCH' && convo?.messages.find(m => m.id === dm[2])?.e2e;
    if (convo?.meta?.e2e || editing) body = { ...body, content: '', e2e: await encryptFor(peer, body.content) };
  }
  return offlineAware(method, url, body);
};
// Desktop notifications can't show what's inside.
const _notifyE = notify;
notify = function (peerId, message) { return _notifyE(peerId, message.e2e ? { ...message, content: '🔒 Encrypted message' } : message); };
const _mediaHtmlE = mediaHtml;
mediaHtml = function (m) {
  if (m.e2eNotice) { const who = m.authorId === state.me.id ? 'You' : user(m.authorId)?.displayName || 'They'; return `<div class="e2e-notice">${m.e2eNotice === 'on' ? '🔒' : '🔓'} <b>${esc(who)}</b> turned ${m.e2eNotice === 'on' ? 'on end-to-end encryption. New messages can only be read on your and their devices, not by Zuno.' : 'off end-to-end encryption for new messages.'}</div>`; }
  return _mediaHtmlE(m);
};
// The lock in a DM's top bar.
const LOCK_ICO = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"/></svg>';
const _renderDMHeaderE = renderDMHeader;
renderDMHeader = function () {
  _renderDMHeaderE();
  const conv = activeConv(), bar = $('#main .topbar');
  if (!bar || !conv || isChannelConv(conv) || isGroupConv(conv) || user(conv)?.system || user(conv)?.bot) return;
  $('#e2e-btn', bar)?.remove();
  const on = !!state.convos[conv]?.meta?.e2e;
  const b = document.createElement('button');
  b.className = 'icon-btn' + (on ? ' e2e-on' : ''); b.id = 'e2e-btn'; b.title = on ? 'End-to-end encrypted' : 'Turn on end-to-end encryption';
  b.innerHTML = LOCK_ICO;
  const spot = $('#search-all-btn', bar) || $('#saved-btn', bar) || $('.tb-tools', bar);
  if (spot) spot.before(b); else bar.appendChild(b);
  b.addEventListener('click', () => openE2e(conv));
};
async function safetyNumber(peer) {
  const all = [...await devicesOf(state.me.id, true), ...await devicesOf(peer, true)].map(d => d.key.x + d.key.y).sort().join('|');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(all)));
  let digits = '';
  for (let i = 0; i < 30; i += 2) digits += String(((h[i] << 8) | h[i + 1]) % 100000).padStart(5, '0');
  return digits.match(/.{5}/g).slice(0, 12).join(' ');
}
async function openE2e(peer) {
  const u = user(peer), convo = state.convos[peer];
  const on = !!convo?.meta?.e2e;
  await ensureDevice();
  const num = on ? await safetyNumber(peer).catch(() => '') : '';
  const ov = openLayer(`<div class="dialog modal e2e-dialog"><div class="e2e-hero">${LOCK_ICO}</div><h3>${on ? 'This chat is end-to-end encrypted' : 'End-to-end encryption'}</h3>
    <p>${on ? `New messages between you and <b>${esc(u?.displayName || '')}</b> are locked on your devices. Zuno only ever stores scrambled text it can't read.` : `Lock new messages so only you and <b>${esc(u?.displayName || '')}</b> can read them, on the devices you each use Zuno on. Not even Zuno can read them.`}</p>
    <ul class="e2e-notes"><li>Encrypted messages can't be searched, and links don't get previews.</li><li>A new device can't read messages sent before it was set up.</li><li>Pictures and files aren't encrypted yet, only text.</li></ul>
    ${on && num ? `<div class="e2e-num"><div class="muted small">Safety number. Compare it with ${esc(u?.displayName || 'them')} in person or on a call: if it matches, nobody is listening in.</div><code>${esc(num)}</code></div>` : ''}
    <div class="actions"><button class="btn btn-link" data-a="close">Close</button><button class="btn ${on ? 'btn-grey' : 'btn-primary'}" data-a="toggle">${on ? 'Turn Off' : 'Turn On Encryption'}</button></div></div>`);
  $('[data-a=close]', ov).addEventListener('click', dismissLayer);
  $('[data-a=toggle]', ov).addEventListener('click', async () => {
    try { const r = await _apiE('PUT', `/api/dms/${peer}/e2e`, { on: !on }); if (convo?.meta) convo.meta.e2e = r.e2e; closeLayer(); renderDMHeader(); toast(r.e2e ? '🔒 Encryption is on for this chat' : 'Encryption is off for new messages'); }
    catch (e) { toast(e.message, true); }
  });
}
const _startE = start;
start = async function () { await _startE(); ensureDevice(); setTimeout(flushOutbox, 2000); };

// ======================= offline mode =======================
// The service worker keeps your recent chats so Zuno opens without a connection, and messages you
// send while offline go out when you're back.
let offlineWaiters = [];
window.addEventListener('online', () => { renderOffline(); const w = offlineWaiters; offlineWaiters = []; w.forEach(r => r()); });
window.addEventListener('offline', renderOffline);
const backOnline = () => new Promise(r => (navigator.onLine ? setTimeout(r, 3000) : offlineWaiters.push(r)));
// The outbox is saved on this device, so messages wait even if Zuno is closed or reloaded.
const outbox = { get: () => { try { return JSON.parse(localStorage.getItem('zuno_outbox') || '[]'); } catch { return []; } }, set: l => { try { localStorage.setItem('zuno_outbox', JSON.stringify(l)); } catch {} } };
const retrying = new Set();
async function offlineAware(method, url, body) {
  const sending = method === 'POST' && /\/messages$/.test(url);
  let saved = null;
  for (let tries = 0; ; tries++) {
    try {
      const r = await _apiE(method, url, body);
      if (saved) { outbox.set(outbox.get().filter(x => x.id !== saved)); retrying.delete(saved); }
      return r;
    } catch (e) {
      if (!(e instanceof TypeError) || !sending || tries > 200) { if (saved) { outbox.set(outbox.get().filter(x => x.id !== saved)); retrying.delete(saved); } throw e; }
      if (!saved) { saved = Math.random().toString(36).slice(2); retrying.add(saved); outbox.set([...outbox.get(), { id: saved, uid: state.me?.id, url, body, at: Date.now() }].slice(-50)); }
      renderOffline(true);
      await backOnline();
    }
  }
}
// Messages left in the outbox from before a reload go out once there's a connection.
let flushing = false;
async function flushOutbox() {
  if (flushing || !navigator.onLine || !state.me) return;
  flushing = true;
  for (const item of outbox.get()) {
    if (retrying.has(item.id) || item.uid !== state.me.id) continue;
    try { await _apiE('POST', item.url, item.body); outbox.set(outbox.get().filter(x => x.id !== item.id)); }
    catch (e) { if (e instanceof TypeError) break; outbox.set(outbox.get().filter(x => x.id !== item.id)); toast(`A message you wrote offline couldn't be sent: ${e.message}`, true); }
  }
  flushing = false;
}
window.addEventListener('online', () => setTimeout(flushOutbox, 1500));
function renderOffline(force) {
  const off = force === true || !navigator.onLine;
  let bar = $('#offline-bar');
  if (!off) { bar?.remove(); document.documentElement.classList.remove('is-offline'); return; }
  document.documentElement.classList.add('is-offline');
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'offline-bar'; bar.className = 'offline-bar';
  bar.innerHTML = "📡 You're offline. You can read saved chats, and anything you send goes out when you're back.";
  document.body.appendChild(bar);
}
renderOffline();
const _signOutLocalE = signOutLocal;
signOutLocal = function () { try { navigator.serviceWorker?.controller?.postMessage({ type: 'clear-api' }); } catch {} myDevice = null; return _signOutLocalE(); };

// ======================= status page =======================
function addStatusLink(body) {
  if (!body || $('#status-link', body)) return;
  const p = document.createElement('p');
  p.id = 'status-link';
  p.innerHTML = '<a href="/status" target="_blank" rel="noopener">📶 Zuno status</a> <span class="muted small">— is Zuno up? Uptime, response times and incidents.</span>';
  body.appendChild(p);
}

// ======================= live events =======================
function hookSecureEvents(es) {
  es.addEventListener('e2e-keys', e => { try { devicesCache.delete(JSON.parse(e.data).userId); } catch {} });
}
(function waitEsE() {
  if (!state.es) return setTimeout(waitEsE, 800);
  hookSecureEvents(state.es);
  const _connectE = connect;
  connect = function () { _connectE(); hookSecureEvents(state.es); };
})();
