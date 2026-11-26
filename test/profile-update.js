// Integration checks for Zuno 0.54 profile and channel updates.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const PORT = 42000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zuno-profile54-'));
let server;
async function request(method, url, token, body) {
  const res = await fetch(BASE + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function ok(method, url, token, body) {
  const r = await request(method, url, token, body);
  assert.equal(r.status, 200, `${method} ${url}: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function register(username) {
  const r = await ok('POST', '/api/register', null, { email: `${username}@test.dev`, username, password: 'testing123', displayName: username });
  return r.token;
}
(async () => {
  try {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, ZUNO_DATA_DIR: DIR, STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', ZUNO_TRUST_XFF: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      let out = ''; server.stdout.on('data', d => { out += d; if (out.includes('Zuno is running')) resolve(); });
      server.on('exit', code => reject(new Error('server exited ' + code)));
      setTimeout(() => reject(new Error('server did not start')), 8000);
    });
    const owner = await register('profile_owner');
    const viewer = await register('profile_viewer');
    const { me } = await ok('GET', '/api/me', owner);
    await ok('PATCH', '/api/me', owner, { profileBackgroundOpacity: 0.45, profileFrame: 'aurora' });
    const updated = await ok('GET', '/api/me', owner);
    assert.equal(updated.me.profileBackgroundOpacity, 0.45);
    assert.equal(updated.me.profileFrame, 'aurora');
    assert.equal((await request('PATCH', '/api/me', owner, { profileBackgroundOpacity: 2 })).status, 400, 'opacity is range checked');
    const { server: sv } = await ok('POST', '/api/servers', owner, { name: 'Flair Test' });
    const text = sv.channels.find(c => c.type === 'text');
    const voice = sv.channels.find(c => c.type === 'voice');
    await ok('PATCH', `/api/servers/${sv.id}/channel-flair`, owner, { channels: [{ id: text.id, emoji: '✨' }] });
    const { server: fresh } = await ok('GET', `/api/servers/${sv.id}`, owner);
    assert.equal(fresh.channels.find(c => c.id === text.id).flair, '✨');
    assert.equal((await request('PATCH', `/api/servers/${sv.id}/channel-flair`, viewer, { channels: [{ id: text.id, emoji: '🌟' }] })).status, 404, 'non-members cannot set channel flair');
    assert.equal((await request('PATCH', `/api/servers/${sv.id}/channel-flair`, owner, { channels: [{ id: voice.id, emoji: '🎧' }] })).status, 400, 'voice channels cannot receive flair');
    await ok('POST', `/api/users/${me.id}/view`, viewer, {});
    await ok('POST', `/api/users/${me.id}/like`, viewer, { on: true });
    await ok('POST', `/api/users/${me.id}/comments`, viewer, { text: 'Nice profile!' });
    const stats = await ok('GET', '/api/me/profile-stats', owner);
    assert.equal(stats.totalViews, 1);
    assert.equal(stats.likes, 1);
    assert.equal(stats.comments, 1);
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'zuno54.js'), 'utf8');
    assert.match(js, /wireChannelAutocomplete54/);
    assert.match(js, /data-goto-ch/);
    assert.match(js, /View My Profile/);
    console.log('Profile/channel update checks passed.');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally {
    if (server) await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
    fs.rmSync(DIR, { recursive: true, force: true });
  }
})();
