// Security checks: sign-in cookies, the Turnstile config, event stream tickets and private attachments.
// Run with `node test/security.js` (npm test runs it after the smoke test).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 41000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zuno-security-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201ae0a0f0b0000000049454e44ae426082', 'hex');
let server;

async function request(method, url, { token, cookie, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = cookie;
  if (body && !raw) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: raw || (body ? JSON.stringify(body) : undefined) });
  return { res, data: await res.json().catch(() => ({})) };
}
async function ok(method, url, body, token) {
  const { res, data } = await request(method, url, { token, body });
  assert.equal(res.status, 200, `${method} ${url}: ${JSON.stringify(data)}`);
  return data;
}
let fakeIp = 0;
async function register(username) {
  // Each sign-up comes from its own address, so the new-account limit doesn't kick in.
  const { res, data } = await request('POST', '/api/register', { headers: { 'X-Forwarded-For': `10.8.0.${++fakeIp}` }, body: { email: `${username}@test.dev`, username, password: 'testing123', displayName: username } });
  assert.equal(res.status, 200, `register ${username}: ${JSON.stringify(data)}`);
  const set = res.headers.get('set-cookie') || '';
  assert.ok(set.startsWith('zuno_session='), 'signing up sets the session cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  return { token: data.token, cookie: set.split(';')[0], id: (await ok('GET', '/api/me', null, data.token)).me.id };
}
async function upload(token, buf, name) {
  const { res, data } = await request('POST', '/api/attachments', { token, raw: buf, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': name } });
  assert.equal(res.status, 200, JSON.stringify(data));
  return data.attachment;
}
const get = (url, headers = {}) => fetch(BASE + url, { headers });
// Opens the event stream and gives back the status (the stream itself is closed right away).
async function streamStatus(url, headers = {}) {
  const ac = new AbortController();
  const res = await fetch(BASE + url, { headers, signal: ac.signal });
  ac.abort();
  return res.status;
}
function step(name, fn) { step.list.push([name, fn]); }
step.list = [];

step('Turnstile is off without keys, and the secret key never reaches the browser', async () => {
  const { res, data } = await request('GET', '/api/public-config');
  assert.equal(res.status, 200);
  assert.equal(data.turnstileEnabled, false);
  assert.equal(data.turnstileSecretKey, undefined);
  assert.ok(!JSON.stringify(data).toLowerCase().includes('secret'));
});

step('reserved names inside usernames are refused by the server, punctuation included', async () => {
  const a = '\x64iscord', b = '\x64isband';
  for (const username of [`${a}fan`, `my${b}alt`, a.split('').join('.'), `${b.slice(0, 3)}.${b.slice(3)}.user`]) {
    const { res } = await request('POST', '/api/register', {
      headers: { 'X-Forwarded-For': `10.9.0.${++fakeIp}` },
      body: { email: `reserved${fakeIp}@test.dev`, username, password: 'testing123', displayName: 'Reserved test' },
    });
    assert.equal(res.status, 400, `${username} must be rejected`);
  }
});

step('sign-in cookies: set on login, cleared on logout', async () => {
  const u = await register('cookiecat');
  const login = await request('POST', '/api/login', { body: { username: 'cookiecat', password: 'testing123' } });
  assert.equal(login.res.status, 200, JSON.stringify(login.data));
  assert.match(login.res.headers.get('set-cookie') || '', /^zuno_session=[^;]+; /);
  const out = await request('POST', '/api/logout', { token: login.data.token, body: {} });
  assert.match(out.res.headers.get('set-cookie') || '', /zuno_session=;.*Max-Age=0/i);
  assert.ok(u.token);
});

step('event stream: one-use tickets, no login token in the URL, bots still connect', async () => {
  const u = await register('ticketfox');
  const t = (await ok('POST', '/api/events/ticket', {}, u.token)).ticket;
  assert.match(t, /^[a-f0-9]{64}$/);
  assert.equal(await streamStatus(`/api/events?ticket=${t}`), 200);
  assert.equal(await streamStatus(`/api/events?ticket=${t}`), 401, 'a ticket only works once');
  assert.equal(await streamStatus(`/api/events?token=${u.token}`), 401, 'the login token in the URL no longer works');
  assert.equal(await streamStatus('/api/events?ticket=nope'), 401);
  assert.equal((await request('POST', '/api/events/ticket', { body: {} })).res.status, 401);

  const app = (await ok('POST', '/api/apps', { name: 'Ticket Bot', description: 'test' }, u.token)).app;
  const bot = (await ok('POST', `/api/apps/${app.id}/token`, {}, u.token)).token;
  assert.equal(await streamStatus('/api/events', { Authorization: `Bot ${bot}` }), 200, 'bots connect with the Bot header');
  assert.equal(await streamStatus(`/api/events?bot=${encodeURIComponent(bot)}`), 200, 'bots connect with ?bot=');
  assert.ok([401, 403].includes((await request('POST', '/api/events/ticket', { headers: { Authorization: `Bot ${bot}` }, body: {} })).res.status), "bots don't use tickets");
});

step('Employee Dashboard: staff-only profile, badge, naming and restriction controls', async () => {
  const staff = await register('employee_staff');
  const target = await register('employee_target');
  const outsider = await register('employee_outsider');
  assert.equal((await request('GET', '/api/employee/users?q=employee', { token: outsider.token })).res.status, 403, 'non-staff cannot search employee users');
  assert.equal((await request('GET', '/api/employee/users?q=employee', { token: staff.token })).res.status, 403, 'staff must unlock the dashboard before using staff APIs');
  assert.equal((await request('POST', `/api/users/${target.id}/badges`, { token: staff.token, body: { badge: 'artist', on: true } })).res.status, 403, 'badge API requires the dashboard unlock');
  assert.equal((await request('POST', `/api/mod/users/${target.id}/profile`, { token: staff.token, body: { parts: ['bio'] } })).res.status, 403, 'moderation API requires the dashboard unlock');
  assert.equal((await request('POST', '/api/employee/auth', { token: staff.token, body: { password: 'incorrect-password' } })).res.status, 403, 'incorrect dashboard password is rejected');
  await ok('POST', '/api/employee/auth', { password: 'ZUNO_TEST_STAFF_PASSWORD' }, staff.token);
  const found = await ok('GET', '/api/employee/users?q=employee', null, staff.token);
  assert.ok(found.users.some(u => u.id === target.id));
  const changed = await ok('POST', `/api/employee/users/${target.id}/profile`, { username: 'employee_renamed', displayName: 'Employee Renamed', pronouns: 'they/them' }, staff.token);
  assert.equal(changed.user.username, 'employee_renamed');
  assert.equal(changed.user.pronouns, 'they/them');
  await ok('POST', `/api/users/${target.id}/badges`, { badge: 'artist', on: true }, staff.token);
  const badged = await ok('GET', `/api/users/${target.id}`, null, staff.token);
  assert.ok(badged.user.badges.includes('artist'));

  await ok('POST', '/api/employee/policies', { kind: 'username', name: 'held_employee', mode: 'hold' }, staff.token);
  const held = await request('POST', '/api/register', { headers: { 'X-Forwarded-For': '10.8.0.250' }, body: { email: 'held_employee@test.dev', username: 'held_employee', password: 'testing123' } });
  assert.equal(held.res.status, 409, 'held usernames cannot be registered');
  await ok('POST', '/api/employee/policies', { kind: 'vanity', name: 'held-vanity', mode: 'hold' }, staff.token);
  const { server: owned } = await ok('POST', '/api/servers', { name: 'Employee Test Server' }, target.token);
  const heldVanity = await request('PATCH', `/api/servers/${owned.id}`, { token: target.token, body: { vanity: 'held-vanity' } });
  assert.equal(heldVanity.res.status, 409, 'held server vanities cannot be claimed');
  const lockedVanity = await request('PATCH', `/api/servers/${owned.id}`, { token: target.token, body: { vanity: 'employee-server' } });
  assert.equal(lockedVanity.res.status, 403, 'custom invite links are locked below 10 members');
  const inviteCode = (await ok('GET', `/api/servers/${owned.id}`, null, target.token)).invite;
  for (let i = 0; i < 9; i++) {
    const member = await register(`vanity_member_${i}`);
    await ok('POST', `/api/invites/${inviteCode}/join`, {}, member.token);
  }
  const unlockedServer = (await ok('GET', `/api/servers/${owned.id}`, null, target.token)).server;
  assert.equal(unlockedServer.memberCount, 10, 'the server reaches the 10-member threshold');
  assert.equal(unlockedServer.vanityUnlocked, true, 'the server summary reports the vanity unlock');
  const vanitySaved = await ok('PATCH', `/api/servers/${owned.id}`, { vanity: 'employee-server' }, target.token);
  assert.equal(vanitySaved.server.vanity, 'employee-server', 'custom invite links can be set at 10 members');

  const { server: dmServer } = await ok('POST', '/api/servers', { name: 'DM-only Test Server' }, target.token);
  const serverInfo = await ok('GET', `/api/servers/${dmServer.id}`, null, target.token);
  const textChannel = serverInfo.server.channels.find(c => c.type === 'text');
  const voice = (await ok('POST', `/api/servers/${dmServer.id}/channels`, { name: 'Voice Test', type: 'voice' }, target.token)).channel;
  const parentMessage = (await ok('POST', `/api/channels/${textChannel.id}/messages`, { content: 'thread parent' }, target.token)).message;
  const thread = (await ok('POST', `/api/channels/${textChannel.id}/messages/${parentMessage.id}/thread`, { name: 'Thread before restriction' }, target.token)).thread;
  await ok('POST', '/api/friends/requests', { username: 'employee_staff' }, target.token);
  await ok('POST', '/api/friends/requests', { username: 'employee_renamed' }, staff.token); // reciprocal request accepts the pending one
  await ok('POST', `/api/employee/users/${target.id}/restrictions`, { dmOnly: true }, staff.token);
  const blockedPost = await request('POST', `/api/channels/${textChannel.id}/messages`, { token: target.token, body: { content: 'should not post' } });
  assert.equal(blockedPost.res.status, 403, 'DM-only users cannot post in server channels');
  const blockedThread = await request('POST', `/api/threads/${thread.id}/messages`, { token: target.token, body: { content: 'thread bypass' } });
  assert.equal(blockedThread.res.status, 403, 'DM-only users cannot post in server threads');
  const blockedVoice = await request('POST', '/api/rtc/join', { token: target.token, body: { room: `vc:${voice.id}` } });
  assert.equal(blockedVoice.res.status, 403, 'DM-only users cannot join server voice calls');
  await ok('POST', `/api/dms/${staff.id}/messages`, { content: 'DM still works' }, target.token);
  const dmRoom = `dm:${[target.id, staff.id].sort().join(':')}`;
  await ok('POST', '/api/rtc/join', { room: dmRoom }, target.token);
  await ok('POST', '/api/rtc/leave', { room: dmRoom }, target.token);
  await ok('POST', `/api/employee/users/${target.id}/restrictions`, { muteDays: 1 }, staff.token);
  const mutedDM = await request('POST', `/api/dms/${staff.id}/messages`, { token: target.token, body: { content: 'muted message' } });
  assert.equal(mutedDM.res.status, 403, 'muted users cannot send DMs');
  const standing = await ok('GET', '/api/me/standing', null, target.token);
  assert.equal(standing.dmOnly, true);
  assert.ok(standing.mutedUntil);
  await ok('POST', `/api/employee/users/${target.id}/restrictions`, { muteDays: 0, dmOnly: false }, staff.token);
  const standingAfter = await ok('GET', '/api/me/standing', null, target.token);
  assert.equal(standingAfter.dmOnly, false);
  assert.equal(standingAfter.mutedUntil, null);
});

step('attachments: only people who can see the message can open the file', async () => {
  const owner = await register('auditowner');
  const friend = await register('auditfriend');
  const outsider = await register('auditoutsider');
  const veil = await register('syl'); // staff
  await ok('POST', '/api/friends/requests', { username: 'auditfriend' }, owner.token);
  await ok('POST', '/api/friends/requests', { username: 'auditowner' }, friend.token);

  const pic = await upload(owner.token, PNG, 'cat.png');
  const doc = await upload(owner.token, Buffer.from('private attachment regression test'), 'private.txt');
  assert.match(pic.url, /^\/uploads\//, 'pictures keep their /uploads URL');
  assert.match(doc.url, /^\/files\//);

  for (const url of [pic.url, doc.url]) {
    assert.equal((await get(url)).status, 401, `${url}: signed out`);
    assert.equal((await get(url, { Cookie: owner.cookie })).status, 200, `${url}: the owner can preview it before sending`);
    assert.equal((await get(url, { Cookie: friend.cookie })).status, 404, `${url}: not sent yet`);
  }
  const sent = (await ok('POST', `/api/dms/${friend.id}/messages`, { content: 'files', attachmentIds: [pic.id, doc.id] }, owner.token)).message;
  for (const url of [pic.url, doc.url]) {
    assert.equal((await get(url, { Cookie: friend.cookie })).status, 200, `${url}: the person it was sent to`);
    assert.equal((await get(url, { Authorization: `Bearer ${friend.token}` })).status, 200, `${url}: with the Bearer header too`);
    assert.equal((await get(url, { Cookie: outsider.cookie })).status, 404, `${url}: someone else`);
    assert.equal((await get(url, { Cookie: veil.cookie })).status, 200, `${url}: staff checking a report`);
  }
  const head = await get(pic.url, { Cookie: friend.cookie });
  assert.match(head.headers.get('cache-control') || '', /private/);
  assert.equal(head.headers.get('x-content-type-options'), 'nosniff');
  const part = await get(pic.url, { Cookie: friend.cookie, Range: 'bytes=0-7' });
  assert.equal(part.status, 206, 'videos and voice messages can still seek');
  assert.equal(Buffer.from(await part.arrayBuffer()).length, 8);
  assert.match((await get(doc.url, { Cookie: friend.cookie })).headers.get('content-disposition') || '', /attachment/);
  assert.ok(sent.id);

  // In a server: members can open it, people outside the server can't.
  const { server } = await ok('POST', '/api/servers', { name: 'Vault' }, owner.token);
  const general = server.channels.find(c => c.type !== 'voice' && c.type !== 'category').id;
  const { invite } = await ok('GET', `/api/servers/${server.id}`, null, owner.token);
  await ok('POST', `/api/invites/${invite}/join`, {}, friend.token);
  const shot = await upload(owner.token, PNG, 'shot.png');
  const { res: tr, data: td } = await request('POST', `/api/attachments/${shot.id}/thumb`, { token: owner.token, raw: PNG, headers: { 'Content-Type': 'application/octet-stream', 'X-Width': '1', 'X-Height': '1' } });
  assert.equal(tr.status, 200, JSON.stringify(td));
  assert.equal((await get(td.thumb, { Cookie: outsider.cookie })).status, 404, 'a fresh preview is private too');
  await ok('POST', `/api/channels/${general}/messages`, { content: '', attachmentIds: [shot.id] }, owner.token);
  assert.equal((await get(shot.url, { Cookie: friend.cookie })).status, 200, 'a server member');
  assert.equal((await get(td.thumb, { Cookie: friend.cookie })).status, 200, 'a server member sees the preview');
  assert.equal((await get(shot.url, { Cookie: outsider.cookie })).status, 404, 'not in the server');
});

step('avatars and other public pictures stay public', async () => {
  const u = await register('avatarowl');
  const app = (await ok('POST', '/api/apps', { name: 'Owl Bot', description: 'test' }, u.token)).app;
  const { res, data } = await request('POST', `/api/apps/${app.id}/avatar`, { token: u.token, raw: PNG, headers: { 'Content-Type': 'application/octet-stream' } });
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.match(data.app.avatar, /^\/uploads\//);
  assert.equal((await get(data.app.avatar)).status, 200, 'anyone can load an avatar');
});

async function main() {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), ZUNO_DATA_DIR: DIR, STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', ZUNO_STAFF_SETUP: '1', ZUNO_STAFF: 'employee_staff', ZUNO_TRUST_XFF: '1', ZUNO_SIGNUP_NET_MAX: '100000', TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '', ZUNO_REQUIRE_TURNSTILE: '', ANTHROPIC_API_KEY: '', ZUNO_STAFF_DASHBOARD_PASSWORD: 'ZUNO_TEST_STAFF_PASSWORD' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', d => { output += d; });
  server.stderr.on('data', d => { output += d; });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    try { ready = (await fetch(BASE + '/healthz')).ok; } catch {}
    if (!ready) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, `server did not start: ${output.slice(-1000)}`);
  let failed = 0;
  for (const [name, fn] of step.list) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  }
  if (failed) { console.log(`\n${failed} security check(s) failed.`); process.exitCode = 1; }
  else console.log(`\nAll ${step.list.length} security checks passed.`);
}
main().catch(err => { console.error('Security test failed:', err); process.exitCode = 1; }).finally(async () => {
  if (server) server.kill();
  await new Promise(r => setTimeout(r, 150));
  fs.rmSync(DIR, { recursive: true, force: true });
});
