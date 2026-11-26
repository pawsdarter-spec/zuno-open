// Zuno smoke test: starts a fresh server with its own empty data folder, then walks through
// the main features over the real API. Run it with `npm test`. Nothing touches your real data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zuno-test-'));
let server = null;

// A pretend Claude API for the AI name judge: blocks any field with "spicyword" in it.
const http = require('http');
const AI_PORT = PORT + 100;
const aiCalls = [];
const fakeAi = http.createServer((req, res) => {
  let buf = '';
  req.on('data', d => { buf += d; });
  req.on('end', () => {
    const body = JSON.parse(buf);
    aiCalls.push(body);
    const fields = [...body.messages[0].content.matchAll(/<field name="([^"]+)">([^<]*)<\/field>/g)];
    const verdicts = fields.map(([, field, text]) => ({ field, allowed: !/spicyword/i.test(text), category: /spicyword/i.test(text) ? 'sexual' : 'none' }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ verdicts }) }] }));
  });
});

function boot() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, ZUNO_DATA_DIR: DIR, STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', ZUNO_STAFF_SETUP: '1', ZUNO_TRUST_XFF: '1', ZUNO_SHIELD_MAX: '100000', ZUNO_SIGNUP_NET_MAX: '100000', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://localhost:${AI_PORT}`, ZUNO_PUSH_TEST_URL: `http://localhost:${AI_PORT + 1}/push/`, ZUNO_STAFF_DASHBOARD_PASSWORD: 'ZUNO_TEST_STAFF_PASSWORD' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    server.stdout.on('data', d => { out += d; if (out.includes('Zuno is running')) resolve(); });
    server.stderr.on('data', d => process.stderr.write(d));
    server.on('exit', code => reject(new Error('server exited ' + code)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
}
function stop() {
  return new Promise(resolve => { if (!server) return resolve(); server.removeAllListeners('exit'); server.on('exit', resolve); server.kill('SIGTERM'); });
}

async function api(method, url, body, token, raw) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
const ok = async (...a) => { const r = await api(...a); if (r.status !== 200) throw new Error(`${a[0]} ${a[1]} -> ${r.status} ${r.error}`); return r; };
const no = async (status, ...a) => { const r = await api(...a); assert.strictEqual(r.status, status, `${a[0]} ${a[1]} should be ${status}, got ${r.status} ${r.error || ''}`); return r; };
const unlockStaff = async token => ok('POST', '/api/employee/auth', { password: 'ZUNO_TEST_STAFF_PASSWORD' }, token);

const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const ctx = {};

step('register and log in', async () => {
  ctx.veil = (await ok('POST', '/api/register', { email: 'syl@test.dev', username: 'syl', password: 'secret12' })).token;
  ctx.alice = (await ok('POST', '/api/register', { email: 'alice@test.dev', username: 'alice', password: 'secret12' })).token;
  ctx.bob = (await ok('POST', '/api/register', { email: 'bob@test.dev', username: 'bob', password: 'secret12' })).token;
  // (security) Staff tools that can take over or delete accounts need a fresh "Confirm it's you".
  await no(403, 'POST', `/api/mod/users/x/reset-link`, {}, ctx.veil);
  await ok('POST', '/api/me/reauth', { password: 'secret12' }, ctx.veil);
  await unlockStaff(ctx.veil);
  const login = await ok('POST', '/api/login', { login: 'alice', password: 'secret12' });
  ctx.alice2 = login.token;
  await no(401, 'POST', '/api/login', { login: 'alice', password: 'nope' });
  ctx.aliceId = (await ok('GET', '/api/me', null, ctx.alice)).me.id;
  ctx.bobId = (await ok('GET', '/api/me', null, ctx.bob)).me.id;
});
step('sessions: list, log out others, change password', async () => {
  const { sessions } = await ok('GET', '/api/me/sessions', null, ctx.alice);
  assert.strictEqual(sessions.length, 2);
  assert.ok(sessions[0].current);
  await ok('POST', '/api/me/sessions/logout-others', {}, ctx.alice);
  await no(401, 'GET', '/api/me', null, ctx.alice2);
  await no(400, 'POST', '/api/me/password', { current: 'wrong', next: 'newpass12' }, ctx.alice);
  const changed = await ok('POST', '/api/me/password', { current: 'secret12', next: 'newpass12' }, ctx.alice);
  // (0.43.1) This device gets a brand-new login too; the old one stops working.
  assert.ok(changed.rotatedToken);
  await no(401, 'GET', '/api/me', null, ctx.alice);
  ctx.alice = changed.rotatedToken;
  await ok('GET', '/api/me', null, ctx.alice);
  await ok('POST', '/api/login', { login: 'alice@test.dev', password: 'newpass12' });
});
step('password reset (staff link, email off)', async () => {
  const f = await ok('POST', '/api/password/forgot', { login: 'bob' });
  assert.strictEqual(f.email, false);
  await no(403, 'POST', `/api/mod/users/${ctx.bobId}/reset-link`, {}, ctx.alice);
  const { url } = await ok('POST', `/api/mod/users/${ctx.bobId}/reset-link`, {}, ctx.veil);
  const token = new URL(url).searchParams.get('token');
  const r = await ok('POST', '/api/password/reset', { token, password: 'bobnew12' });
  await no(401, 'GET', '/api/me', null, ctx.bob); // old sessions end
  ctx.bob = r.token;
  await no(400, 'POST', '/api/password/reset', { token, password: 'again123' }); // links work once
});
step('friends and DMs', async () => {
  await ok('POST', '/api/friends/requests', { username: 'bob' }, ctx.alice);
  await ok('POST', '/api/friends/requests', { username: 'alice' }, ctx.bob);
  const m = await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: 'hi **bob**' }, ctx.alice);
  ctx.dmMsg = m.message.id;
  await ok('POST', `/api/dms/${ctx.bobId}/messages/${ctx.dmMsg}/pin`, {}, ctx.alice);
  const pins = await ok('GET', `/api/dms/${ctx.aliceId}/pins`, null, ctx.bob);
  assert.strictEqual(pins.pins.length, 1);
});
step('profile flair, notes, status expiry', async () => {
  const { me } = await ok('PATCH', '/api/me', { decoration: 'sprout', profileEffect: 'snow', customStatus: 'brb', customStatusUntil: Date.now() + 3600e3 }, ctx.alice);
  assert.strictEqual(me.decoration, 'sprout');
  assert.strictEqual(me.profileEffect, 'snow');
  await no(400, 'PATCH', '/api/me', { decoration: 'nope' }, ctx.alice);
  await ok('PUT', `/api/users/${ctx.bobId}/note`, { note: 'met at camp' }, ctx.alice);
  assert.strictEqual((await ok('GET', '/api/me/extras', null, ctx.alice)).notes[ctx.bobId], 'met at camp');
});
step('servers: template, theme, roles with gradients', async () => {
  const { server } = await ok('POST', '/api/servers', { name: 'Night Owls' }, ctx.alice);
  ctx.sv = server.id;
  const t = await ok('POST', `/api/servers/${ctx.sv}/template`, { template: 'gaming' }, ctx.alice);
  assert.ok(t.server.categories.length >= 3);
  assert.strictEqual(t.server.theme, 'galaxy');
  ctx.general = t.server.channels.find(c => c.name === 'general').id;
  ctx.mod = t.server.roles.find(r => r.name === 'Moderator').id;
  await ok('PATCH', `/api/servers/${ctx.sv}`, { theme: 'sakura' }, ctx.alice);
  const { role } = await ok('PATCH', `/api/servers/${ctx.sv}/roles/${ctx.mod}`, { color: '#ff0000', color2: '#0000ff' }, ctx.alice);
  assert.strictEqual(role.color2, '#0000ff');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201ae0a0f0b0000000049454e44ae426082', 'hex');
  const icon = await api('POST', `/api/servers/${ctx.sv}/roles/${ctx.mod}/icon`, png, ctx.alice, true);
  assert.strictEqual(icon.status, 200, icon.error);
  assert.ok(icon.role.iconUrl.startsWith('/uploads/'));
});
step('joining, nicknames, add roles, timeouts', async () => {
  const { invite } = await ok('GET', `/api/servers/${ctx.sv}`, null, ctx.alice);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.bob);
  await ok('PUT', `/api/servers/${ctx.sv}/members/${ctx.bobId}/nick`, { nick: 'Bobby' }, ctx.bob);
  await no(403, 'PUT', `/api/servers/${ctx.sv}/members/${ctx.aliceId}/nick`, { nick: 'x' }, ctx.bob);
  await ok('PUT', `/api/servers/${ctx.sv}/members/${ctx.bobId}/roles`, { roles: [ctx.mod] }, ctx.alice);
  await ok('PUT', `/api/servers/${ctx.sv}/members/${ctx.bobId}/roles`, { roles: [] }, ctx.alice);
  await ok('POST', `/api/servers/${ctx.sv}/members/${ctx.bobId}/timeout`, { minutes: 5 }, ctx.alice);
  await no(403, 'POST', `/api/channels/${ctx.general}/messages`, { content: 'let me talk' }, ctx.bob);
  await ok('POST', `/api/servers/${ctx.sv}/members/${ctx.bobId}/timeout`, { minutes: 0 }, ctx.alice);
  await ok('POST', `/api/channels/${ctx.general}/messages`, { content: 'thanks!' }, ctx.bob);
});
step('polls, votes, search, forwarding', async () => {
  const { message } = await ok('POST', `/api/channels/${ctx.general}/messages`, { content: '', poll: { question: 'Pizza or tacos?', options: ['Pizza', 'Tacos'], hours: 24 } }, ctx.alice);
  assert.strictEqual(message.poll.options.length, 2);
  await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/vote`, { option: '1' }, ctx.bob);
  const v = await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/vote`, { option: '2' }, ctx.bob);
  assert.deepStrictEqual(v.message.poll.options.map(o => o.votes.length), [0, 1]); // one answer at a time
  const s = await ok('GET', `/api/channels/${ctx.general}/search?q=thanks from:bob`, null, ctx.alice);
  assert.strictEqual(s.results.length, 1);
  const fw = await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: '', forward: { conv: 'ch:' + ctx.general, id: s.results[0].id } }, ctx.alice);
  assert.strictEqual(fw.message.forward.content, 'thanks!');
});
step('Zuno bots: party, guardian, levels, polls', async () => {
  for (const key of ['party', 'guardian', 'levels', 'polls', 'reminders']) await ok('POST', `/api/servers/${ctx.sv}/bots`, { botId: 'zbot_' + key }, ctx.alice);
  await ok('PUT', `/api/servers/${ctx.sv}/zunobots/guardian`, { config: { words: ['badword'], caps: true } }, ctx.alice);
  const blocked = await no(403, 'POST', `/api/channels/${ctx.general}/messages`, { content: 'you are a badword' }, ctx.bob);
  assert.ok(blocked.error.includes('Guardian'));
  await no(403, 'POST', `/api/channels/${ctx.general}/messages`, { content: 'WHY IS EVERYONE SO LOUD TODAY' }, ctx.bob);
  await ok('POST', `/api/channels/${ctx.general}/messages`, { content: '/roll 2d6' }, ctx.bob);
  await ok('POST', `/api/channels/${ctx.general}/messages`, { content: '/poll Best day? | Sat | Sun' }, ctx.bob);
  await ok('POST', `/api/channels/${ctx.general}/messages`, { content: '/remind 5m drink water' }, ctx.bob);
  await new Promise(r => setTimeout(r, 900));
  const { messages } = await ok('GET', `/api/channels/${ctx.general}/messages`, null, ctx.bob);
  const fromBots = messages.filter(m => m.authorId.startsWith('zbot_'));
  assert.ok(fromBots.some(m => m.content.includes('rolled')), 'party replied');
  assert.ok(fromBots.some(m => m.poll?.question === 'Best day?'), 'poll bot posted a poll');
  assert.ok(fromBots.some(m => m.content.includes("I'll remind you")), 'reminder set');
  const zb = await ok('GET', `/api/servers/${ctx.sv}/zunobots`, null, ctx.alice);
  assert.ok(zb.bots.find(b => b.key === 'guardian').added);
});
step('Zuno Official gets its rules with the Terms link', async () => {
  const { server } = await ok('POST', '/api/servers', { name: 'Zuno Official' }, ctx.veil);
  await stop(); await boot(); // the rules are added when the server starts
  const me = await ok('GET', '/api/me', null, ctx.alice);
  const off = me.servers.find(s => s.id === server.id);
  assert.ok(off, 'alice was added to Zuno Official');
  const rules = off.channels.find(c => c.id === off.rulesChannelId);
  assert.ok(rules && rules.readOnly);
  const { messages } = await ok('GET', `/api/channels/${rules.id}/messages`, null, ctx.alice);
  assert.ok(messages.some(m => m.content.includes('/terms') && m.pinned));
  await no(403, 'POST', `/api/channels/${rules.id}/messages`, { content: 'hi' }, ctx.alice);
  await stop(); await boot(); // and they're only posted once
  const again = await ok('GET', `/api/channels/${rules.id}/messages`, null, ctx.alice);
  assert.strictEqual(again.messages.filter(m => m.content.includes('Zuno Official Rules')).length, 1);
});
step('group DMs', async () => {
  const carol = (await ok('POST', '/api/register', { email: 'carol@test.dev', username: 'carol', password: 'secret12' })).token;
  ctx.carolId = (await ok('GET', '/api/me', null, carol)).me.id;
  await ok('POST', '/api/friends/requests', { username: 'carol' }, ctx.alice);
  await ok('POST', '/api/friends/requests', { username: 'alice' }, carol);
  await no(400, 'POST', '/api/groups', { userIds: [ctx.bobId] }, ctx.alice); // needs 2+ friends
  const { group } = await ok('POST', '/api/groups', { userIds: [ctx.bobId, ctx.carolId], name: 'Trio' }, ctx.alice);
  ctx.group = group.id;
  await ok('POST', `/api/groups/${group.id}/messages`, { content: 'hey both' }, ctx.alice);
  const { messages } = await ok('GET', `/api/groups/${group.id}/messages`, null, carol);
  assert.ok(messages.some(m => m.content === 'hey both'));
  const me = await ok('GET', '/api/me', null, ctx.bob);
  assert.strictEqual(me.groups.find(g => g.id === group.id).unread >= 1, true);
  await ok('POST', `/api/groups/${group.id}/messages/${messages.find(m => m.content === 'hey both').id}/pin`, {}, carol);
  await ok('DELETE', `/api/groups/${group.id}/members/${ctx.carolId}`, {}, carol);
  await no(404, 'GET', `/api/groups/${group.id}/messages`, null, carol);
});
step('activity, connections, birthdays, mutuals', async () => {
  await ok('POST', '/api/me/activity', { activity: { type: 'playing', name: 'Minecraft', source: 'desktop' } }, ctx.alice);
  // Alice has no live connection in this test, so her activity is hidden (it only shows while online).
  await ok('PUT', '/api/me/connections/github', { name: 'alice-dev' }, ctx.alice);
  await no(400, 'PUT', '/api/me/connections/github', { name: 'bad name!' }, ctx.alice);
  const t = new Date();
  await ok('PATCH', '/api/me', { birthday: { m: t.getUTCMonth() + 1, d: t.getUTCDate() }, tz: 'UTC' }, ctx.alice);
  const { user } = await ok('GET', `/api/users/${ctx.aliceId}`, null, ctx.bob);
  assert.strictEqual(user.birthdayToday, true);
  assert.ok(user.connections.some(c => c.type === 'github' && c.name === 'alice-dev'));
  const mu = await ok('GET', `/api/users/${ctx.aliceId}/mutuals`, null, ctx.bob);
  assert.ok(mu.servers.some(sv => sv.id === ctx.sv));
  assert.ok(mu.friendSince);
});
step('server emoji, voice messages, mark unread', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201ae0a0f0b0000000049454e44ae426082', 'hex');
  const res = await fetch(`${BASE}/api/servers/${ctx.sv}/emojis`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-Emoji-Name': 'pog' }, body: png });
  const { emoji } = await res.json();
  assert.strictEqual(emoji.name, 'pog');
  const { message } = await ok('POST', `/api/channels/${ctx.general}/messages`, { content: `nice <:pog:${emoji.id}>` }, ctx.alice);
  await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/react`, { emoji: `<:pog:${emoji.id}>` }, ctx.bob);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200)]);
  const up = await (await fetch(`${BASE}/api/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-Voice': '1', 'X-Duration': '3.2', 'X-Wave': '10,50,90' }, body: webm })).json();
  assert.strictEqual(up.attachment.kind, 'voice');
  const v = await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: '', attachmentIds: [up.attachment.id] }, ctx.alice);
  assert.deepStrictEqual(v.message.attachments[0].wave, [10, 50, 90]);
  await ok('POST', `/api/channels/${ctx.general}/read`, { at: message.createdAt - 1 }, ctx.bob);
  const me = await ok('GET', '/api/me', null, ctx.bob);
  assert.ok(me.servers.find(s => s.id === ctx.sv).channels.find(c => c.id === ctx.general).unread >= 1);
});
step('link previews never reach private addresses', async () => {
  const r = await ok('GET', `/api/embed?url=${encodeURIComponent('http://127.0.0.1:' + PORT + '/healthz')}`, null, ctx.alice);
  assert.strictEqual(r.embed, null);
  const img = await fetch(`${BASE}/api/embed/img?u=${encodeURIComponent('http://example.com/a.png')}&s=wrong`);
  assert.strictEqual(img.status, 403);
});
step('Zuno Wrapped', async () => {
  const { wrapped } = await ok('GET', '/api/me/wrapped', null, ctx.alice);
  assert.ok(wrapped.messages >= 3);
  assert.ok(wrapped.topFriends.length >= 1);
  assert.ok(wrapped.persona);
});
step('two-factor login', async () => {
  const crypto = require('crypto');
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const dec = str => { let bits = ''; for (const c of str) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  const code = (secret, offset = 0) => { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset)); const h = crypto.createHmac('sha1', dec(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
  const { secret } = await ok('POST', '/api/me/2fa/setup', { password: 'bobnew12' }, ctx.bob);
  await no(400, 'POST', '/api/me/2fa/enable', { code: '000000' }, ctx.bob);
  const { backupCodes } = await ok('POST', '/api/me/2fa/enable', { code: code(secret) }, ctx.bob);
  assert.strictEqual(backupCodes.length, 10);
  const step1 = await ok('POST', '/api/login', { login: 'bob', password: 'bobnew12' });
  assert.ok(step1.mfa && !step1.token);
  await no(401, 'POST', '/api/login/2fa', { ticket: step1.ticket, code: '123456' });
  const done = await ok('POST', '/api/login/2fa', { ticket: step1.ticket, code: backupCodes[0] });
  assert.ok(done.token);
  const again = await ok('POST', '/api/login', { login: 'bob', password: 'bobnew12' });
  await no(401, 'POST', '/api/login/2fa', { ticket: again.ticket, code: backupCodes[0] }); // backup codes work once
  ctx.bob = done.token;
  ctx.bobBackup = backupCodes;
});
step('ringtones: JJK fans get a special one, everyone else their own', async () => {
  const join = async (tok, peer) => { const r = await ok('POST', '/api/rtc/join', { room: 'dm:' + [ctx.aliceId, peer].sort().join(':') }, tok); await ok('POST', '/api/rtc/leave', { room: 'dm:' + [ctx.aliceId, peer].sort().join(':') }, tok); return r.ringtone; };
  assert.strictEqual(await join(ctx.alice, ctx.bobId), null);
  await ok('PATCH', '/api/me', { bio: 'nah id win. Gojo is the strongest' }, ctx.bob);
  // (0.43.1) JJK tones play half the time (so "Call Song" gets heard too): try a few calls.
  const special = async () => { for (let i = 0; i < 14; i++) { const t = await join(ctx.alice, ctx.bobId); if (t) return t; } return null; };
  assert.ok(['SpecialTone', 'BlueTone', 'AizoTone'].includes(await special()));
  await ok('PATCH', '/api/me', { bio: 'just a regular person', customStatus: 'watching JJK' }, ctx.bob);
  assert.ok(await special(), 'status counts too');
  await ok('PATCH', '/api/me', { customStatus: 'organizing my todo list' }, ctx.bob);
  assert.strictEqual(await join(ctx.alice, ctx.bobId), null, 'everyday words don\'t count');
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(300)]);
  const r = await (await fetch(`${BASE}/api/me/ringtone`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-File-Name': 'my-song.mp3' }, body: mp3 })).json();
  assert.strictEqual(r.ringtone.name, 'my-song.mp3');
  assert.strictEqual((await ok('GET', '/api/me/extras', null, ctx.alice)).ringtone.name, 'my-song.mp3');
  const tone = await fetch(`${BASE}/tones/SpecialTone.mp3`);
  assert.strictEqual(tone.headers.get('content-type'), 'audio/mpeg');
});
step('calls show up as messages; group calls ring everyone', async () => {
  const mk = async n => { const t = (await ok('POST', '/api/register', { email: n + '@test.dev', username: n, password: 'secret12' })).token; return { t, id: (await ok('GET', '/api/me', null, t)).me.id }; };
  const [x, y, w] = [await mk('xena'), await mk('yuri'), await mk('wren')];
  for (const [a, b] of [[x, y], [x, w], [y, w]]) { await ok('POST', '/api/friends/requests', { username: (await ok('GET', '/api/me', null, b.t)).me.username }, a.t); await ok('POST', '/api/friends/requests', { username: (await ok('GET', '/api/me', null, a.t)).me.username }, b.t); }
  const room = 'dm:' + [x.id, y.id].sort().join(':');
  await ok('POST', '/api/rtc/join', { room }, x.t);
  await ok('POST', '/api/rtc/leave', { room }, x.t); // nobody picked up
  let msgs = (await ok('GET', `/api/dms/${y.id}/messages`, null, x.t)).messages;
  assert.strictEqual(msgs[msgs.length - 1].call.state, 'missed');
  await ok('POST', '/api/rtc/join', { room }, x.t);
  await ok('POST', '/api/rtc/join', { room }, y.t);
  await new Promise(r => setTimeout(r, 1100));
  await ok('POST', '/api/rtc/leave', { room }, y.t);
  msgs = (await ok('GET', `/api/dms/${y.id}/messages`, null, x.t)).messages;
  const last = msgs[msgs.length - 1].call;
  assert.ok(last.state === 'ended' && last.duration >= 1000, 'answered call shows how long it lasted');
  const { group } = await ok('POST', '/api/groups', { userIds: [y.id, w.id] }, x.t);
  const groom = 'gc:' + group.id;
  await ok('POST', '/api/rtc/join', { room: groom }, x.t);
  const r2 = await ok('POST', '/api/rtc/join', { room: groom }, w.t);
  assert.strictEqual(r2.peers.length, 1);
  assert.deepStrictEqual((await ok('GET', '/api/me', null, y.t)).groups.find(g => g.id === group.id).call.sort(), [x.id, w.id].sort());
  await ok('POST', '/api/rtc/sound', { room: groom, sound: 'zuno:tada' }, w.t);
  await no(429, 'POST', '/api/rtc/sound', { room: groom, sound: 'zuno:ding' }, w.t); // one at a time
  await ok('POST', '/api/rtc/leave', { room: groom }, x.t);
  await ok('POST', '/api/rtc/leave', { room: groom }, w.t);
  const gm = (await ok('GET', `/api/groups/${group.id}/messages`, null, y.t)).messages.filter(m => m.call);
  assert.strictEqual(gm[gm.length - 1].call.state, 'ended');
  ctx.x = x; ctx.y = y;
});
step('soundboards, saved messages, read receipts', async () => {
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400)]);
  const up = await (await fetch(`${BASE}/api/servers/${ctx.sv}/sounds`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-Sound-Name': 'bruh', 'X-Sound-Emoji': encodeURIComponent('😐'), 'X-Duration': '1.2' }, body: mp3 })).json();
  assert.strictEqual(up.sound.name, 'bruh');
  const long = await fetch(`${BASE}/api/servers/${ctx.sv}/sounds`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-Sound-Name': 'long one', 'X-Duration': '9' }, body: mp3 });
  assert.strictEqual(long.status, 400, 'sounds longer than 5 seconds are refused');
  const { x, y } = ctx;
  const m = (await ok('POST', `/api/dms/${y.id}/messages`, { content: 'remember to buy milk' }, x.t)).message;
  await ok('POST', '/api/me/saved', { conv: y.id, msgId: m.id, remindIn: 60e3 }, x.t);
  const saved = (await ok('GET', '/api/me/saved', null, x.t)).saved;
  assert.ok(saved[0].remindAt && saved[0].snap.content.includes('milk'));
  await ok('POST', `/api/dms/${x.id}/read`, {}, y.t);
  assert.ok((await ok('GET', `/api/dms/${y.id}/messages`, null, x.t)).peerSeen >= m.createdAt, 'Seen shows');
  await ok('PATCH', '/api/me/prefs', { readReceipts: false }, y.t);
  assert.strictEqual((await ok('GET', `/api/dms/${y.id}/messages`, null, x.t)).peerSeen, null, 'and hides when turned off');
});
step('seasonal decorations, insights, close friends, layouts, widgets', async () => {
  const { x, y } = ctx;
  const me = await ok('GET', '/api/me', null, x.t);
  const ev = me.season?.key;
  const [inSeason, outOfSeason] = ev === 'halloween' ? ['pumpkin', 'santa_hat'] : ev === 'winter' ? ['santa_hat', 'pumpkin'] : [null, 'pumpkin'];
  if (inSeason) await ok('PATCH', '/api/me', { decoration: inSeason }, x.t);
  await no(400, 'PATCH', '/api/me', { decoration: outOfSeason }, x.t);
  const ins = await ok('GET', `/api/servers/${ctx.sv}/insights?tz=0`, null, ctx.alice);
  assert.ok(ins.messages30 > 0 && ins.daily.length === 30 && ins.heat.length === 7 && ins.topMembers.length);
  await no(403, 'GET', `/api/servers/${ctx.sv}/insights`, null, ctx.bob);
  await ok('PUT', `/api/me/close-friends/${y.id}`, { on: true }, x.t);
  await ok('PUT', '/api/me/cf-status', { text: 'secret plans 🤫', hours: 4 }, x.t);
  assert.strictEqual((await ok('GET', '/api/me', null, y.t)).closeStatuses[x.id].text, 'secret plans 🤫');
  assert.ok(!(await ok('GET', '/api/me', null, ctx.alice)).closeStatuses?.[x.id], 'others never see it');
  await ok('PUT', '/api/me/dm-layout', { pinned: [y.id], cats: [{ name: 'Besties', convs: [y.id, 'g:abc'] }] }, x.t);
  const lay = (await ok('GET', '/api/me', null, x.t)).dmLayout;
  assert.deepStrictEqual(lay.pinned, [y.id]);
  assert.ok(!lay.cats[0].convs.includes(y.id), 'a pinned chat is only in one place');
  const { server: s2 } = await ok('POST', '/api/servers', { name: 'Second' }, ctx.alice);
  await ok('PUT', '/api/me/rail-layout', { layout: [{ name: 'Games', servers: [ctx.sv, s2.id, 'notmine'] }] }, ctx.alice);
  assert.deepStrictEqual((await ok('GET', '/api/me', null, ctx.alice)).railLayout[0].servers, [ctx.sv, s2.id]);
  await ok('PATCH', '/api/me', { widgets: [{ type: 'games', items: [{ name: 'Minecraft', emoji: '⛏️' }] }, { type: 'song', title: 'Specialz', artist: 'King Gnu' }, { type: 'nope' }] }, x.t);
  assert.strictEqual((await ok('GET', `/api/users/${x.id}`, null, y.t)).user.widgets.length, 2);
});
step('0.16: appearance, name styles, presets, drafts, scheduled messages, edit history, pictures, search', async () => {
  const { x, y } = ctx;
  const me = (await ok('PATCH', '/api/me/prefs', { appTheme: 'light', uiScale: 115, hour24: true, soundPack: 'retro' }, x.t)).me;
  assert.ok(me.prefs.appTheme === 'light' && me.prefs.uiScale === 115 && me.prefs.hour24 && me.prefs.soundPack === 'retro');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const bg = await (await fetch(`${BASE}/api/me/app-background`, { method: 'POST', headers: { Authorization: `Bearer ${x.t}` }, body: png })).json();
  assert.ok(bg.me.prefs.appBg.url.startsWith('/uploads/'), 'anyone can set an app background');
  await ok('PATCH', '/api/me', { nameColor: '#ff00aa', profileTheme: { primary: '#111111', accent: '#222222' }, nameStyle: { font: 'pixel', effect: 'animated', colors: ['#ff0000', '#00ff00'] } }, x.t);
  const pub = (await ok('GET', `/api/users/${x.id}`, null, y.t)).user;
  assert.ok(pub.nameColor === '#ff00aa' && pub.profileTheme && pub.nameStyle.font === 'pixel', 'name colors, themes and name styles are free');
  await ok('PUT', '/api/me/status-presets', { presets: [{ emoji: '📚', text: 'Studying', status: 'dnd', clearAfter: 3600e3 }] }, x.t);
  assert.strictEqual((await ok('GET', '/api/me', null, x.t)).statusPresets[0].text, 'Studying');
  await ok('PUT', '/api/me/drafts', { conv: y.id, text: 'half a thought' }, x.t);
  assert.strictEqual((await ok('GET', '/api/me', null, x.t)).drafts[y.id].text, 'half a thought');
  const sent = (await ok('POST', `/api/dms/${y.id}/messages`, { content: 'the zebra crossing story' }, x.t)).message;
  assert.ok(!(await ok('GET', '/api/me', null, x.t)).drafts[y.id], 'sending clears the draft everywhere');
  await ok('PATCH', `/api/dms/${y.id}/messages/${sent.id}`, { content: 'the giraffe crossing story' }, x.t);
  const edited = (await ok('GET', `/api/dms/${x.id}/messages`, null, y.t)).messages.find(m => m.id === sent.id);
  assert.strictEqual(edited.edits[0].content, 'the zebra crossing story', 'edit history keeps the old version');
  await no(400, 'POST', '/api/me/scheduled', { conv: y.id, content: 'too soon', at: Date.now() + 1000 }, x.t);
  const sch = (await ok('POST', '/api/me/scheduled', { conv: y.id, content: 'scheduled hello', at: Date.now() + 40e3 }, x.t)).scheduled;
  assert.ok(sch.id);
  await ok('PATCH', `/api/me/scheduled/${sch.id}`, { at: Date.now() + 31e3 }, x.t);
  assert.strictEqual((await ok('GET', '/api/me/scheduled', null, x.t)).scheduled.length, 1);
  await ok('DELETE', `/api/me/scheduled/${sch.id}`, null, x.t);
  const up = await (await fetch(`${BASE}/api/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${x.t}`, 'X-File-Name': 'cat.png' }, body: png })).json();
  await (await fetch(`${BASE}/api/attachments/${up.attachment.id}/thumb`, { method: 'POST', headers: { Authorization: `Bearer ${x.t}`, 'X-Width': '800', 'X-Height': '600' }, body: png })).json();
  const pic = (await ok('POST', `/api/dms/${y.id}/messages`, { content: '', attachmentIds: [up.attachment.id], attachmentMeta: { [up.attachment.id]: { alt: 'a sleepy cat', spoiler: true } } }, x.t)).message;
  const a = pic.attachments[0];
  assert.ok(a.alt === 'a sleepy cat' && a.spoiler && a.thumb && a.w === 800, 'pictures keep alt text, spoiler, size and a preview');
  const s1 = await ok('GET', '/api/search?q=giraf', null, y.t);
  assert.ok(s1.results.some(r => r.message.id === sent.id && r.where.kind === 'dm'), 'search everywhere finds words by their start');
  assert.ok(!(await ok('GET', '/api/search?q=giraffe', null, ctx.bob)).results.some(r => r.message.id === sent.id), "and never finds other people's DMs");
  assert.ok((await ok('GET', `/api/dms/${x.id}/search?q=sleepy`, null, y.t)).results.some(r => r.id === pic.id), 'alt text is searchable');
});
step('0.16: notifications, friend suggestions, per-server profiles, notification sound', async () => {
  const { x, y } = ctx;
  await ok('POST', `/api/channels/${ctx.general}/messages`, { content: 'hey @bob look' }, ctx.alice);
  const n = await ok('GET', '/api/me/notifications', null, ctx.bob);
  assert.ok(n.unread >= 1 && n.items.some(i => i.type === 'mention'), 'mentions land in the inbox');
  await ok('POST', '/api/me/notifications/seen', {}, ctx.bob);
  assert.strictEqual((await ok('GET', '/api/me/notifications', null, ctx.bob)).unread, 0);
  const sug = await ok('GET', '/api/friends/suggestions', null, ctx.bob);
  assert.ok(Array.isArray(sug.suggestions));
  const z = (await ok('POST', '/api/register', { email: 'zed@test.dev', username: 'zed', password: 'secret12' })).token;
  await ok('POST', '/api/friends/requests', { username: 'zed' }, x.t); await ok('POST', '/api/friends/requests', { username: 'xena' }, z);
  const zs = await ok('GET', '/api/friends/suggestions', null, z);
  assert.ok(zs.suggestions.some(s => s.user.id === y.id && s.mutualFriends >= 1), 'friends of friends are suggested');
  await ok('POST', `/api/friends/suggestions/${y.id}/dismiss`, {}, z);
  assert.ok(!(await ok('GET', '/api/friends/suggestions', null, z)).suggestions.some(s => s.user.id === y.id));
  await ok('PUT', `/api/servers/${ctx.sv}/my-profile`, { bio: 'mod here', pronouns: 'they/them' }, ctx.bob);
  const svs = (await ok('GET', '/api/me', null, ctx.alice)).servers.find(s => s.id === ctx.sv);
  assert.strictEqual(svs.memberProfiles[ctx.bobId].bio, 'mod here');
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]);
  const ns = await (await fetch(`${BASE}/api/me/notif-sound`, { method: 'POST', headers: { Authorization: `Bearer ${x.t}`, 'X-File-Name': 'boop.mp3' }, body: mp3 })).json();
  assert.ok(ns.notifSound.url && ns.me.prefs.soundPack === 'custom');
});
step('0.16: stage channels, voice status, role pickers, onboarding, blooming, backups', async () => {
  const sv = ctx.sv;
  const stage = (await ok('POST', `/api/servers/${sv}/channels`, { name: 'Town Hall', type: 'stage' }, ctx.alice)).channel;
  assert.ok(stage.stage && stage.type === 'voice');
  await ok('POST', '/api/rtc/join', { room: 'vc:' + stage.id }, ctx.alice);
  await ok('POST', '/api/rtc/join', { room: 'vc:' + stage.id }, ctx.bob);
  await no(403, 'POST', '/api/rtc/state', { room: 'vc:' + stage.id, muted: false }, ctx.bob); // the audience listens
  await ok('POST', `/api/stage/${stage.id}/hand`, {}, ctx.bob);
  let st = (await ok('GET', '/api/me', null, ctx.alice)).servers.find(s => s.id === sv).stages[stage.id];
  assert.ok(st.speakers.includes(ctx.aliceId) && st.hands.includes(ctx.bobId));
  await ok('POST', `/api/stage/${stage.id}/speaker`, { userId: ctx.bobId, on: true }, ctx.alice);
  await ok('POST', '/api/rtc/state', { room: 'vc:' + stage.id, muted: false }, ctx.bob);
  await ok('PUT', `/api/stage/${stage.id}/topic`, { topic: 'Monthly Q&A' }, ctx.alice);
  await ok('PUT', `/api/channels/${stage.id}/voice-status`, { text: 'Q&A time 🎤' }, ctx.bob);
  assert.strictEqual((await ok('GET', '/api/me', null, ctx.alice)).servers.find(s => s.id === sv).channels.find(c => c.id === stage.id).voiceStatus.text, 'Q&A time 🎤');
  await ok('POST', '/api/rtc/leave', { room: 'vc:' + stage.id }, ctx.alice);
  await ok('POST', '/api/rtc/leave', { room: 'vc:' + stage.id }, ctx.bob);
  assert.ok(!(await ok('GET', '/api/me', null, ctx.alice)).servers.find(s => s.id === sv).channels.find(c => c.id === stage.id).voiceStatus, 'status clears when everyone leaves');
  const gamer = (await ok('POST', `/api/servers/${sv}/roles`, { name: 'Gamer', color: '#00ff00' }, ctx.alice)).role;
  const artist = (await ok('POST', `/api/servers/${sv}/roles`, { name: 'Artist', color: '#ff00ff' }, ctx.alice)).role;
  const { message } = await ok('POST', `/api/servers/${sv}/role-pickers`, { channelId: ctx.general, title: 'Pick one', multi: false, options: [{ roleId: gamer.id, emoji: '🎮' }, { roleId: artist.id, emoji: '🎨' }] }, ctx.alice);
  await no(403, 'POST', `/api/servers/${sv}/role-pickers`, { channelId: ctx.general, options: [{ roleId: gamer.id }] }, ctx.bob);
  let r = await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/pick`, { roleId: gamer.id }, ctx.bob);
  assert.ok(r.roles.includes(gamer.id));
  r = await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/pick`, { roleId: artist.id }, ctx.bob);
  assert.ok(r.roles.includes(artist.id) && !r.roles.includes(gamer.id), 'single-choice pickers swap roles');
  await ok('POST', `/api/channels/${ctx.general}/messages/${message.id}/react`, { emoji: '🎮' }, ctx.bob);
  assert.ok((await ok('GET', '/api/me', null, ctx.alice)).servers.find(s => s.id === sv).memberRoles[ctx.bobId].includes(gamer.id), 'reacting picks too');
  await ok('PUT', `/api/servers/${sv}/onboarding`, { enabled: true, questions: [{ id: 'q1', title: 'What brings you here?', required: true, options: [{ id: 'o1', label: 'Games', roleIds: [gamer.id] }, { id: 'o2', label: 'Art', roleIds: [artist.id] }] }] }, ctx.alice);
  const me2 = ctx.veil;
  const inv = (await ok('GET', `/api/servers/${sv}`, null, ctx.alice)).invite;
  await ok('POST', `/api/invites/${inv}/join`, {}, me2);
  const view = (await ok('GET', '/api/me', null, me2)).servers.find(s => s.id === sv);
  assert.ok(view.onboarding.enabled && !view.onboarded);
  await no(400, 'POST', `/api/servers/${sv}/onboarding/answers`, { answers: {} }, me2);
  const ans = await ok('POST', `/api/servers/${sv}/onboarding/answers`, { answers: { q1: ['o2'] } }, me2);
  assert.ok(ans.roles.includes(artist.id));
  await no(403, 'POST', `/api/servers/${sv}/bloom`, {}, ctx.bob); // Server Blooms come with Bloom
  await ok('POST', `/api/users/${ctx.bobId}/bloom`, { days: 30 }, ctx.veil);
  await ok('POST', `/api/servers/${sv}/bloom`, {}, ctx.bob);
  const b = await ok('POST', `/api/servers/${sv}/bloom`, {}, ctx.bob);
  assert.ok(b.blooming.count === 2 && b.blooming.level === 1 && b.blooming.perks.emoji === 100);
  await no(400, 'POST', `/api/servers/${sv}/bloom`, {}, ctx.bob);
  await ok('DELETE', `/api/servers/${sv}/bloom`, null, ctx.bob);
  const { backup } = await ok('GET', `/api/servers/${sv}/backup`, null, ctx.alice);
  assert.ok(backup.zunoBackup === 1 && backup.roles.some(rr => rr.name === 'Gamer') && !backup.members);
  await no(403, 'GET', `/api/servers/${sv}/backup`, null, ctx.bob);
  const { server: copy } = await ok('POST', '/api/servers/from-backup', { backup }, ctx.bob);
  assert.ok(copy.id !== sv && copy.ownerId === ctx.bobId && copy.roles.some(rr => rr.name === 'Gamer') && copy.channels.length === backup.channels.length);
  assert.ok(!copy.roles.some(rr => rr.id === gamer.id), 'restored servers get fresh ids');
});
step('0.16: passkeys, login alerts, encrypted DMs, status page', async () => {
  const crypto = require('crypto');
  const enc = v => { // a tiny CBOR writer, like an authenticator
    const head = (mt, n) => n < 24 ? Buffer.from([mt << 5 | n]) : n < 256 ? Buffer.from([mt << 5 | 24, n]) : Buffer.from([mt << 5 | 25, n >> 8, n & 255]);
    if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
    if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
    if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
    const entries = v instanceof Map ? [...v] : Object.entries(v);
    return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [enc(k), enc(x)])]);
  };
  const origin = BASE, rpId = 'localhost';
  // (security) With two-factor on, adding a passkey needs "Confirm it's you" with the code too.
  await no(403, 'POST', '/api/me/passkeys/options', { password: 'bobnew12' }, ctx.bob);
  await no(400, 'POST', '/api/me/reauth', { password: 'bobnew12' }, ctx.bob);
  await ok('POST', '/api/me/reauth', { password: 'bobnew12', code: ctx.bobBackup[1] }, ctx.bob);
  await no(400, 'POST', '/api/me/passkeys/options', { password: 'nope' }, ctx.bob);
  const opts = await ok('POST', '/api/me/passkeys/options', { password: 'bobnew12' }, ctx.bob);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(16);
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const rpHash = crypto.createHash('sha256').update(rpId).digest();
  const authData = Buffer.concat([rpHash, Buffer.from([0x45]), Buffer.from([0, 0, 0, 1]), Buffer.alloc(16), Buffer.from([0, 16]), credId, enc(cose)]);
  const cd = t => Buffer.from(JSON.stringify({ type: t, challenge: t === 'webauthn.create' ? opts.challenge : ctx.ch, origin })).toString('base64url');
  await ok('POST', '/api/me/passkeys', { name: 'Test key', clientDataJSON: cd('webauthn.create'), attestationObject: enc({ fmt: 'none', attStmt: {}, authData }).toString('base64url') }, ctx.bob);
  assert.strictEqual((await ok('GET', '/api/me', null, ctx.bob)).passkeys.length, 1);
  ctx.ch = (await ok('POST', '/api/login/passkey/options', {})).challenge;
  const ad2 = Buffer.concat([rpHash, Buffer.from([0x05]), Buffer.from([0, 0, 0, 2])]);
  const cdj = cd('webauthn.get');
  const sig = crypto.sign('sha256', Buffer.concat([ad2, crypto.createHash('sha256').update(Buffer.from(cdj, 'base64url')).digest()]), privateKey);
  const login = await ok('POST', '/api/login/passkey', { id: credId.toString('base64url'), clientDataJSON: cdj, authenticatorData: ad2.toString('base64url'), signature: sig.toString('base64url') });
  assert.strictEqual((await ok('GET', '/api/me', null, login.token)).me.id, ctx.bobId, 'logging in with a passkey works');
  ctx.ch = (await ok('POST', '/api/login/passkey/options', {})).challenge;
  const bad = crypto.sign('sha256', Buffer.from('something else'), privateKey);
  await no(401, 'POST', '/api/login/passkey', { id: credId.toString('base64url'), clientDataJSON: cd('webauthn.get'), authenticatorData: Buffer.concat([rpHash, Buffer.from([0x05]), Buffer.from([0, 0, 0, 3])]).toString('base64url'), signature: bad.toString('base64url') });
  // A login from a new kind of device gets a message.
  const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' }, body: JSON.stringify({ login: 'yuri', password: 'secret12' }) });
  assert.strictEqual(r.status, 200, 'password login: ' + JSON.stringify(await r.clone().json()));
  const zm = (await ok('GET', '/api/me', null, ctx.y.t)).dms.find(d => d.user.username === 'zuno');
  const zmsgs = (await ok('GET', `/api/dms/${zm.user.id}/messages`, null, ctx.y.t)).messages;
  assert.ok(zmsgs.some(m => /New login/.test(m.content) && /iPhone/.test(m.content)), 'new-login alert');
  // Encrypted DMs: Zuno only stores ciphertext.
  const { x, y } = ctx;
  const key = () => { const k = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }); return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }; };
  await no(400, 'PUT', `/api/dms/${y.id}/e2e`, { on: true }, x.t);
  await ok('PUT', '/api/me/e2e/devices', { id: 'devx0001', key: key(), name: 'Laptop' }, x.t);
  await ok('PUT', '/api/me/e2e/devices', { id: 'devy0001', key: key(), name: 'Phone' }, y.t);
  await ok('PUT', `/api/dms/${y.id}/e2e`, { on: true }, x.t);
  const e2e = { v: 1, from: 'devx0001', iv: 'aaaaaaaaaaaaaaaa', ct: 'Y2lwaGVydGV4dA', keys: { devy0001: { iv: 'bbbbbbbbbbbbbbbb', k: 'a2V5' }, devx0001: { iv: 'cccccccccccccccc', k: 'a2V5' } } };
  const em = (await ok('POST', `/api/dms/${y.id}/messages`, { content: '', e2e }, x.t)).message;
  assert.ok(em.e2e.ct === 'Y2lwaGVydGV4dA' && em.e2e.fromKey && !em.content);
  await no(400, 'POST', `/api/dms/${y.id}/messages`, { content: '', e2e: { ...e2e, from: 'notmine1' } }, x.t);
  assert.strictEqual((await ok('GET', `/api/dms/${x.id}/messages`, null, y.t)).e2e, true);
  const status = await ok('GET', '/api/status');
  assert.ok(status.components.length >= 5 && status.days.length === 90);
});
step('0.17: favorite emoji, where an emoji is from, profile media switch', async () => {
  const { x } = ctx;
  await ok('PUT', '/api/me/fav-emojis', { emojis: ['🔥', '<:pog:abcdef12345.png>', '<script>', '🔥'] }, x.t);
  assert.deepStrictEqual((await ok('GET', '/api/me', null, x.t)).favEmojis, ['🔥', '<:pog:abcdef12345.png>']);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await (await fetch(`${BASE}/api/servers/${ctx.sv}/emojis`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'Content-Type': 'image/png', 'X-Emoji-Name': 'wave' }, body: png })).json();
  const info = await ok('GET', `/api/emojis/${up.emoji.id}`, null, x.t);
  assert.ok(info.emoji.name === 'wave');
  await ok('PATCH', `/api/servers/${ctx.sv}`, { discoverable: true }, ctx.alice).catch(() => {});
  const mine = await ok('GET', `/api/emojis/${up.emoji.id}`, null, ctx.alice);
  assert.ok(mine.server.joined && mine.server.name, 'members see the server it comes from');
  const me = (await ok('PATCH', '/api/me/prefs', { othersProfileMedia: false }, x.t)).me;
  assert.strictEqual(me.prefs.othersProfileMedia, false);
});
step('new friends land in each other\'s DMs', async () => {
  const p = (await ok('POST', '/api/login', { login: 'yuri', password: 'secret12' })).token, q = ctx.veil;
  const qName = (await ok('GET', '/api/me', null, q)).me.username, pName = (await ok('GET', '/api/me', null, p)).me.username;
  await ok('POST', '/api/friends/requests', { username: qName }, p);
  const req = (await ok('GET', '/api/me', null, q)).requests.find(r => r.direction === 'incoming');
  await ok('POST', `/api/friends/requests/${req.id}/accept`, {}, q);
  assert.ok((await ok('GET', '/api/me', null, p)).dms.some(d => d.user.username === qName), 'the one who asked sees the DM');
  assert.ok((await ok('GET', '/api/me', null, q)).dms.some(d => d.user.username === pName), 'the one who accepted sees it too');
});
step('staff setup status and call config', async () => {
  const st = await ok('GET', '/api/admin/status', null, ctx.veil);
  assert.ok(st.checks.find(c => c.key === 'storage').ok);
  await no(403, 'GET', '/api/admin/status', null, ctx.alice);
  const rtc = await ok('GET', '/api/rtc/config', null, ctx.alice);
  assert.ok(rtc.iceServers.length >= 1);
});

step('0.19: threads, stickers, saved folders, catch me up, AutoMod, audit search, events', async () => {
  const { server } = await ok('POST', '/api/servers', { name: 'Plaza' }, ctx.alice);
  const { invite } = await ok('GET', `/api/servers/${server.id}`, null, ctx.alice);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.bob);
  const sv = (await ok('GET', `/api/servers/${server.id}`, null, ctx.alice)).server;
  const ch = sv.channels.find(c => c.type === 'text').id, vc = sv.channels.find(c => c.type === 'voice').id;
  // Threads
  const first = (await ok('POST', `/api/channels/${ch}/messages`, { content: 'Movie pick?' }, ctx.alice)).message;
  const { thread } = await ok('POST', `/api/channels/${ch}/messages/${first.id}/thread`, { name: 'Movies' }, ctx.bob);
  await ok('POST', `/api/threads/${thread.id}/messages`, { content: 'Dune!' }, ctx.bob);
  assert.strictEqual((await ok('GET', `/api/channels/${ch}/messages`, null, ctx.alice)).messages.find(m => m.id === first.id).thread.count, 1);
  await no(404, 'GET', `/api/threads/${thread.id}`, null, ctx.veil);
  // Stickers: Zuno's own, and a server's
  await no(400, 'POST', `/api/channels/${ch}/messages`, { sticker: { id: 'zuno:hi' } }, ctx.bob); // built-in stickers were retired in 0.51
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201ae0a0f0b0000000049454e44ae426082', 'hex');
  const res = await fetch(`${BASE}/api/servers/${sv.id}/stickers`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.alice}`, 'X-Sticker-Name': 'Wave' }, body: png });
  const up = await res.json();
  assert.strictEqual(res.status, 200, up.error);
  await ok('POST', `/api/channels/${ch}/messages`, { sticker: { id: up.sticker.id, serverId: sv.id } }, ctx.bob);
  await no(400, 'POST', `/api/channels/${ch}/messages`, { sticker: { id: 'nope', serverId: sv.id } }, ctx.bob);
  // Saved message folders
  await ok('POST', '/api/me/saved', { conv: 'ch:' + ch, msgId: first.id }, ctx.bob);
  await ok('POST', '/api/me/saved-folders', { name: 'Ideas' }, ctx.bob);
  const saved = (await ok('GET', '/api/me/saved', null, ctx.bob)).saved.find(x => x.msgId === first.id);
  await ok('PATCH', `/api/me/saved/${saved.id}`, { folder: 'Ideas' }, ctx.bob);
  assert.strictEqual((await ok('GET', '/api/me/saved', null, ctx.bob)).saved.find(x => x.msgId === first.id).folder, 'Ideas');
  // Catch me up
  const cu = await ok('GET', `/api/catchup?conv=ch:${ch}&since=${Date.now() - 3600e3}`, null, ctx.alice);
  assert.ok(cu.count >= 3 && cu.people.length === 2 && cu.threads.length === 1);
  // AutoMod blocks, and the audit log can be searched
  await ok('PATCH', `/api/servers/${sv.id}/automod`, { enabled: true, words: 'banana', invites: true }, ctx.alice);
  await no(403, 'POST', `/api/channels/${ch}/messages`, { content: 'banana split' }, ctx.bob);
  await no(403, 'POST', `/api/threads/${thread.id}/messages`, { content: 'BANANA' }, ctx.bob);
  await ok('POST', `/api/channels/${ch}/messages`, { content: 'bananas are fine' }, ctx.bob);
  const audit = await ok('GET', `/api/servers/${sv.id}/audit?q=blocked`, null, ctx.alice);
  assert.ok(audit.entries.length === 2 && audit.entries.every(e => e.action === 'automod_block'));
  // Events
  const ev = (await ok('POST', `/api/servers/${sv.id}/events`, { name: 'Movie night', startAt: Date.now() + 7200e3, where: { type: 'voice', channelId: vc } }, ctx.alice)).event;
  await no(403, 'POST', `/api/servers/${sv.id}/events`, { name: 'Nope', startAt: Date.now() + 7200e3 }, ctx.bob);
  assert.strictEqual((await ok('POST', `/api/servers/${sv.id}/events/${ev.id}/interested`, {}, ctx.bob)).event.interested, 2);
});
step('0.19: recovery codes, device map, maintenance notice, Listen Together', async () => {
  const t = (await ok('POST', '/api/login', { login: 'yuri', password: 'secret12' })).token;
  await no(400, 'POST', '/api/me/recovery-codes', { password: 'wrong' }, t);
  const { codes } = await ok('POST', '/api/me/recovery-codes', { password: 'secret12' }, t);
  assert.strictEqual(codes.length, 10);
  await no(401, 'POST', '/api/recover', { login: 'yuri', code: 'AAAA-BBBB', password: 'newpass12' });
  const r = await ok('POST', '/api/recover', { login: 'yuri', code: codes[3], password: 'newpass12' });
  assert.strictEqual(r.left, 9);
  await no(401, 'POST', '/api/recover', { login: 'yuri', code: codes[3], password: 'newpass22' });
  await ok('POST', '/api/login', { login: 'yuri', password: 'newpass12' });
  assert.ok((await ok('GET', '/api/me/sessions/map', null, r.token)).sessions.some(s => s.current));
  await no(403, 'POST', '/api/staff/maintenance', { at: Date.now() + 600e3, minutes: 5 }, r.token);
  await ok('POST', '/api/staff/maintenance', { at: Date.now() + 600e3, minutes: 5 }, ctx.veil);
  assert.strictEqual((await ok('GET', '/api/maintenance')).maintenance.minutes, 5);
  await ok('DELETE', '/api/staff/maintenance', null, ctx.veil);
  const room = 'dm:' + [ctx.aliceId, ctx.bobId].sort().join(':');
  await ok('POST', '/api/rtc/join', { room }, ctx.alice);
  await no(403, 'POST', '/api/activity/start', { room, type: 'listen' }, ctx.bob);
  await ok('POST', '/api/rtc/join', { room }, ctx.bob);
  assert.strictEqual((await ok('POST', '/api/activity/start', { room, type: 'listen' }, ctx.bob)).activity.type, 'listen');
  await no(400, 'POST', '/api/activity/add', { room, url: 'https://example.com/not-youtube' }, ctx.alice);
  await ok('POST', '/api/rtc/leave', { room }, ctx.alice); await ok('POST', '/api/rtc/leave', { room }, ctx.bob);
});

step('staff: see every channel, owner stays protected, veil hears about staff actions', async () => {
  const { server } = await ok('POST', '/api/servers', { name: 'Hideout' }, ctx.alice);
  const { channel } = await ok('POST', `/api/servers/${server.id}/channels`, { name: 'secret', type: 'text', private: true }, ctx.alice);
  const { invite } = await ok('GET', `/api/servers/${server.id}`, null, ctx.alice);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.veil);
  assert.ok((await ok('GET', `/api/servers/${server.id}`, null, ctx.veil)).server.channels.some(c => c.id === channel.id));
  await ok('PATCH', `/api/servers/${server.id}`, { name: 'Hideout 2' }, ctx.veil);
  await no(403, 'DELETE', `/api/servers/${server.id}/members/${ctx.aliceId}`, null, ctx.veil);
  await no(403, 'DELETE', `/api/servers/${server.id}`, null, ctx.veil);
  await no(403, 'POST', `/api/users/${ctx.aliceId}/badges`, { badge: 'staff', on: true }, ctx.bob);
});

// Sign-ups from their own pretend address, so these don't run into the per-address sign-up limit.
let fakeIp = 0;
async function signup(body) {
  const res = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${++fakeIp}` }, body: JSON.stringify(body) });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
step('0.21: name filter, profile moderation, a Zuno ban deletes the account, avatars as files, short invites', async () => {
  const { badName } = require('../server/namefilter');
  for (const n of ['N1GG3R', 'n.i.g.g.a', 'xXpornXx', 'sexy_girl', 'peacock_nigger', '111111cock11111', '$$dick$$']) assert.ok(badName(n), n + ' should be blocked');
  for (const n of ['Sussex', 'grape', 'Scunthorpe', 'peacock', 'therapist', 'Night Owls', 'Nigeria', 'cocktail', 'Dickens99', 'Analog 4']) assert.ok(!badName(n), n + ' should be fine');
  assert.strictEqual((await signup({ email: 'p@test.dev', username: 'pornking', password: 'secret12' })).status, 400);
  const t = (await signup({ email: 'tess@test.dev', username: 'tess', password: 'secret12' })).token;
  await no(400, 'PATCH', '/api/me', { displayName: 'P0rn Star' }, t);
  await no(400, 'POST', '/api/servers', { name: 'hentai club' }, t);
  // An avatar sent as a picture is kept as a file, not inside the account.
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0dc4d2a90000000049454e44ae426082', 'hex').toString('base64');
  const me = (await ok('PATCH', '/api/me', { avatar: png, widgets: [{ type: 'text', title: 'Hi', body: 'hello' }, { type: 'text', title: 'Bad', body: 'bad stuff' }], bio: 'bio' }, t)).me;
  assert.match(me.avatar, /^\/uploads\/[a-z0-9]+\.png$/);
  // Staff take down one widget and the bio; members can't.
  const tid = me.id;
  await no(403, 'POST', `/api/mod/users/${tid}/profile`, { parts: ['bio'] }, ctx.alice);
  const after = (await ok('POST', `/api/mod/users/${tid}/profile`, { parts: ['bio'], widgets: [1], note: 'test' }, ctx.veil)).user;
  assert.strictEqual(after.bio, ''); assert.deepStrictEqual(after.widgets.map(w => w.title), ['Hi']);
  // Custom invites unlock at 10 members and remain available once unlocked.
  const { server } = await ok('POST', '/api/servers', { name: 'Owls' }, t);
  await no(403, 'PATCH', `/api/servers/${server.id}`, { vanity: 'owl' }, t);
  const mainInvite = (await ok('GET', `/api/servers/${server.id}`, null, t)).invite;
  for (let i = 0; i < 9; i++) {
    const member = await signup({ email: `owl${i}@test.dev`, username: `owlmember${i}`, password: 'secret12' });
    assert.strictEqual(member.status, 200);
    await ok('POST', `/api/invites/${mainInvite}/join`, {}, member.token);
  }
  const reachedTen = (await ok('GET', `/api/servers/${server.id}`, null, t)).server;
  assert.strictEqual(reachedTen.memberCount, 10);
  assert.strictEqual(reachedTen.vanityUnlocked, true);
  await ok('PATCH', `/api/servers/${server.id}`, { vanity: 'owl' }, t);
  await ok('POST', '/api/invites/owl/join', {}, ctx.alice);
  // A Zuno ban deletes the account.
  await ok('POST', `/api/mod/users/${tid}`, { action: 'ban', note: 'test' }, ctx.veil);
  const gone = (await ok('GET', `/api/users/${tid}`, null, ctx.alice)).user;
  assert.match(gone.username, /^deleted_user_\d+$/); assert.match(gone.displayName, /^DELETED_USER_\d+$/);
  assert.ok(!(await ok('GET', `/api/servers/${server.id}`, null, ctx.alice)).server.members?.includes?.(tid));
  assert.ok([403, 409].includes((await signup({ email: 'tess@test.dev', username: 'tess2', password: 'secret12' })).status));
  // Appeals: the banned login can still see the ban and send one appeal; nothing else.
  const banned = (await ok('GET', '/api/me', null, t)).me;
  assert.ok(banned.ban?.canAppeal && banned.ban.reason === 'test');
  await no(403, 'POST', '/api/servers', { name: 'nope' }, t);
  await no(400, 'POST', '/api/appeal', { text: 'short' }, t);
  await ok('POST', '/api/appeal', { text: 'I think this was a mistake, please look again.' }, t);
  await no(400, 'POST', '/api/appeal', { text: 'And another appeal, which is not allowed.' }, t);
  await no(403, 'GET', '/api/mod/appeals', null, ctx.alice);
  assert.strictEqual((await ok('GET', '/api/mod/appeals', null, ctx.veil)).pending[0].was.username, 'tess');
  // The old username still logs in while the appeal is open.
  assert.ok((await ok('POST', '/api/login', { login: 'tess', password: 'secret12' })).token);
  await ok('POST', `/api/mod/appeals/${tid}`, { decision: 'approve', note: 'Sorry!' }, ctx.veil);
  const back = (await ok('GET', '/api/me', null, t)).me;
  assert.strictEqual(back.username, 'tess'); assert.ok(!back.ban && !back.suspendedUntil);
  await ok('POST', '/api/servers', { name: 'Back again' }, t);
  // A denied appeal: a day to read the answer, then the login is wiped.
  await ok('POST', `/api/mod/users/${tid}`, { action: 'ban', note: 'again' }, ctx.veil);
  await ok('POST', '/api/appeal', { text: 'Please, one more chance, I promise.' }, t);
  await ok('POST', `/api/mod/appeals/${tid}`, { decision: 'deny', note: 'No.' }, ctx.veil);
  const denied = (await ok('GET', '/api/me', null, t)).me.ban;
  assert.strictEqual(denied.appeal.status, 'denied'); assert.ok(!denied.canAppeal);
});

step('0.22: chat themes & wallpapers for DMs', async () => {
  await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: 'theme time' }, ctx.alice);
  await no(400, 'PUT', `/api/dms/${ctx.bobId}/theme`, { theme: 'neon-nope' }, ctx.alice);
  await ok('PUT', `/api/dms/${ctx.bobId}/theme`, { theme: 'ocean', wallpaper: { preset: 'stars' } }, ctx.alice);
  const t = (await ok('GET', '/api/chat-themes', null, ctx.bob)).themes[ctx.aliceId];
  assert.strictEqual(t.theme, 'ocean'); assert.strictEqual(t.wallpaper.preset, 'stars');
  await no(400, 'PUT', `/api/dms/${ctx.bobId}/theme`, { wallpaper: { url: '/uploads/not-mine.png' } }, ctx.alice);
});

step('0.23.1: only the founder can permanently delete moderation records', async () => {
  const bug = (await ok('POST', '/api/bugs', { title: 'Purge me', details: 'A report to delete for good' }, ctx.bob)).bug;
  await no(403, 'DELETE', `/api/bugs/${bug.id}`, null, ctx.bob);
  await ok('DELETE', `/api/bugs/${bug.id}`, null, ctx.veil);
  assert.ok(!(await ok('GET', '/api/bugs?all=1', null, ctx.veil)).bugs.some(b => b.id === bug.id));
  const log = (await ok('GET', '/api/mod/log', null, ctx.veil)).log;
  if (log.length) {
    const e = log[0];
    await no(403, 'DELETE', `/api/mod/log?at=${e.at}&by=${e.by}`, null, ctx.bob);
    await ok('DELETE', `/api/mod/log?at=${e.at}&by=${e.by}`, null, ctx.veil);
  }
  assert.strictEqual((await ok('GET', '/api/me', null, ctx.veil)).me.isFounder, true);
  assert.strictEqual((await ok('GET', '/api/me', null, ctx.bob)).me.isFounder, false);
});

step('0.24: the AI judge checks bios, statuses, names, nicknames and voice channel statuses', async () => {
  const { badName } = require('../server/namefilter');
  for (const n of ['Hard R', 'soft-a', 'the n word']) assert.ok(badName(n), n + ' should be blocked');
  for (const n of ['hardrock', 'software', 'hard rain']) assert.ok(!badName(n), n + ' should be fine');
  // The word filter now covers bios and voice statuses too, before the AI is even asked.
  const t = (await signup({ email: 'judge@test.dev', username: 'judgey', password: 'secret12' })).token;
  await no(400, 'PATCH', '/api/me', { bio: 'Sex' }, t);
  // What the word list misses, the AI judge catches.
  const before = aiCalls.length;
  const r = await no(400, 'PATCH', '/api/me', { bio: 'totally a spicyword bio' }, t);
  assert.match(r.error, /bio isn't allowed.*sexual/);
  assert.strictEqual(aiCalls.at(-1).output_config.format.type, 'json_schema');
  await ok('PATCH', '/api/me', { bio: 'I like cats', customStatus: 'grinding ranked 🎮' }, t);
  // Unchanged text and text it's already seen aren't sent again.
  const n = aiCalls.length;
  await ok('PATCH', '/api/me', { bio: 'I like cats', customStatus: 'grinding ranked 🎮', bannerColor: '#112233' }, t);
  await no(400, 'PATCH', '/api/me', { bio: 'totally a spicyword bio' }, t);
  assert.strictEqual(aiCalls.length, n);
  assert.ok(n > before);
  assert.strictEqual((await signup({ email: 'judge2@test.dev', username: 'spicyword', password: 'secret12' })).status, 400);
  const { server } = await ok('POST', '/api/servers', { name: 'Judge Hall' }, t);
  const vc = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'Lounge', type: 'voice' }, t)).channel;
  await no(400, 'PUT', `/api/channels/${vc.id}/voice-status`, { text: 'hard R hours' }, t);
  await no(400, 'PUT', `/api/channels/${vc.id}/voice-status`, { text: 'spicyword time' }, t);
  await ok('PUT', `/api/channels/${vc.id}/voice-status`, { text: 'chilling 🎧' }, t);
  await no(400, 'PUT', `/api/servers/${server.id}/my-profile`, { bio: 'server spicyword' }, t);
  const me = (await ok('GET', '/api/me', null, t)).me;
  await no(400, 'PUT', `/api/servers/${server.id}/members/${me.id}/nick`, { nick: 'spicyword' }, t);
  await ok('PUT', `/api/servers/${server.id}/members/${me.id}/nick`, { nick: 'Judge' }, t);
});

step('0.26: chat in voice channels, staff see hidden channels read-only, clip notices', async () => {
  const { server } = await ok('POST', '/api/servers', { name: 'Voicey' }, ctx.alice);
  const vc = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'Lounge', type: 'voice' }, ctx.alice)).channel;
  const sent = (await ok('POST', `/api/channels/${vc.id}/messages`, { content: 'hi from the voice chat' }, ctx.alice)).message;
  assert.ok((await ok('GET', `/api/channels/${vc.id}/messages`, null, ctx.alice)).messages.some(m => m.id === sent.id));
  // Staff: a hidden channel shows up, can be read, but not posted in.
  const secret = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'mods-only', type: 'text', private: true }, ctx.alice)).channel;
  await ok('POST', `/api/channels/${secret.id}/messages`, { content: 'secret plans' }, ctx.alice);
  const { invite } = await ok('GET', `/api/servers/${server.id}`, null, ctx.alice);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.veil);
  const seen = (await ok('GET', `/api/servers/${server.id}`, null, ctx.veil)).server.channels.find(c => c.id === secret.id);
  assert.ok(seen && seen.perms.includes('view_channels') && !seen.perms.includes('send_messages'));
  assert.ok((await ok('GET', `/api/channels/${secret.id}/messages`, null, ctx.veil)).messages.some(m => m.content === 'secret plans'));
  await no(403, 'POST', `/api/channels/${secret.id}/messages`, { content: 'staff here' }, ctx.veil);
  // ...but in a channel everyone can talk in, staff talk normally.
  await ok('POST', `/api/channels/${vc.id}/messages`, { content: 'staff saying hi' }, ctx.veil);
  // Clip notices only for people in the call.
  const room = 'vc:' + vc.id;
  assert.strictEqual((await ok('POST', '/api/rtc/clipped', { room }, ctx.alice)).ok, false);
  await ok('POST', '/api/rtc/join', { room }, ctx.alice);
  assert.strictEqual((await ok('POST', '/api/rtc/clipped', { room }, ctx.alice)).ok, true);
  await ok('POST', '/api/rtc/leave', { room }, ctx.alice);
});

step('0.27: status schedules, Polls 2.0, games, Discover home, server appeals, marketplace, admin dashboard', async () => {
  // Status schedule: a rule covering every day, all day, is on straight away.
  const all = { status: 'dnd', from: '00:00', to: '23:59', days: [0, 1, 2, 3, 4, 5, 6], text: 'heads down' };
  const sch = await ok('PUT', '/api/me/status-schedule', { rules: [all], timeZone: 'UTC' }, ctx.bob);
  assert.ok(sch.active);
  let me = (await ok('GET', '/api/me', null, ctx.bob)).me;
  assert.strictEqual(me.statusPref, 'dnd'); assert.strictEqual(me.customStatus, 'heads down');
  await ok('PUT', '/api/me/status-schedule', { rules: [] }, ctx.bob);
  me = (await ok('GET', '/api/me', null, ctx.bob)).me;
  assert.notStrictEqual(me.statusPref, 'dnd'); assert.notStrictEqual(me.customStatus, 'heads down'); // what they had before comes back
  await no(400, 'PUT', '/api/me/status-schedule', { rules: [all], timeZone: 'Not/AZone' }, ctx.bob);

  // Polls 2.0: anonymous ranked poll keeps votes private and works out the winner by runoff.
  const { server } = await ok('POST', '/api/servers', { name: 'Poll Place' }, ctx.alice);
  const { invite } = await ok('GET', `/api/servers/${server.id}`, null, ctx.alice);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.bob);
  const ch = (await ok('GET', `/api/servers/${server.id}`, null, ctx.alice)).server.channels.find(c => c.type === 'text');
  const base = `/api/channels/${ch.id}/messages`;
  const poll = (await ok('POST', base, { content: '', poll: { question: 'Best snack?', options: ['Chips', 'Fruit', 'Cookies'], hours: 0.25, ranked: true, anonymous: true, open: true } }, ctx.alice)).message;
  assert.ok(poll.poll.ranked && poll.poll.anonymous && poll.poll.endsAt - Date.now() < 16 * 60e3);
  await no(400, 'POST', `${base}/${poll.id}/vote`, { option: '1' }, ctx.bob);
  await ok('POST', `${base}/${poll.id}/poll`, { action: 'vote', options: ['2', '1'] }, ctx.bob);
  const v = (await ok('POST', `${base}/${poll.id}/poll`, { action: 'vote', options: ['1', '3'] }, ctx.alice)).message;
  assert.ok(v.poll.options.every(o => !o.votes.length), 'no voter ids in an anonymous poll');
  assert.strictEqual(v.poll.voters, 2);
  assert.deepStrictEqual((await ok('GET', `${base}/${poll.id}/poll`, null, ctx.bob)).mine, ['2', '1']);
  await ok('POST', `${base}/${poll.id}/poll`, { action: 'add', text: 'Popcorn' }, ctx.bob);
  await no(403, 'POST', `${base}/${poll.id}/poll`, { action: 'end' }, ctx.bob);
  const ended = (await ok('POST', `${base}/${poll.id}/poll`, { action: 'end' }, ctx.alice)).message;
  assert.ok(ended.poll.closed && ended.poll.rounds.length >= 1);
  await no(400, 'POST', `${base}/${poll.id}/poll`, { action: 'vote', options: ['1'] }, ctx.bob);
  const after = (await ok('GET', `${base}`, null, ctx.alice)).messages;
  assert.ok(after.some(m => m.replyTo?.id === poll.id && /ranked poll/.test(m.content)), 'Zuno posts the result');

  // Games in a voice channel.
  const vc = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'Games', type: 'voice' }, ctx.alice)).channel;
  const room = 'vc:' + vc.id;
  await no(403, 'POST', '/api/games/start', { room, type: 'wordle' }, ctx.alice);
  await ok('POST', '/api/rtc/join', { room }, ctx.alice); await ok('POST', '/api/rtc/join', { room }, ctx.bob);
  let g = (await ok('POST', '/api/games/start', { room, type: 'wordle' }, ctx.alice)).game;
  assert.strictEqual(g.word, undefined, 'the word stays secret');
  await no(400, 'POST', '/api/games/move', { room, guess: 'abc' }, ctx.alice);
  g = (await ok('POST', '/api/games/move', { room, guess: 'crane' }, ctx.alice)).game;
  assert.strictEqual(g.players[0].rows[0].marks.length, 5);
  const bobView = (await ok('GET', `/api/games?room=${encodeURIComponent(room)}`, null, ctx.bob)).game;
  assert.ok(bobView.players[0].rows[0].word === undefined, "others can't see your letters");
  // 0.45.1: a game that's still going can't be replaced or closed without a vote.
  await no(409, 'POST', '/api/games/start', { room, type: 'connect4' }, ctx.alice);
  const vote = await ok('POST', '/api/games/stop', { room }, ctx.alice);
  assert.ok(vote.vote, 'closing a running game starts a vote');
  assert.deepStrictEqual((await ok('GET', `/api/games?room=${encodeURIComponent(room)}`, null, ctx.bob)).game.closeVote.yes, [ctx.aliceId], 'everyone sees who voted yes');
  await ok('POST', '/api/games/close-vote', { room, yes: true }, ctx.bob);
  assert.strictEqual((await ok('GET', `/api/games?room=${encodeURIComponent(room)}`, null, ctx.bob)).game, null, 'a majority closes it');
  g = (await ok('POST', '/api/games/start', { room, type: 'connect4' }, ctx.alice)).game;
  for (const [who, col] of [[ctx.alice, 0], [ctx.bob, 1], [ctx.alice, 0], [ctx.bob, 1], [ctx.alice, 0], [ctx.bob, 1]]) await ok('POST', '/api/games/move', { room, col }, who);
  await no(400, 'POST', '/api/games/move', { room, col: 3 }, ctx.bob);
  g = (await ok('POST', '/api/games/move', { room, col: 0 }, ctx.alice)).game;
  assert.ok(g.over && g.winner === ctx.aliceId && g.line.length >= 4);
  g = (await ok('POST', '/api/games/start', { room, type: 'trivia' }, ctx.alice)).game;
  assert.strictEqual(g.question.right, undefined);
  await ok('POST', '/api/games/move', { room, pick: 0 }, ctx.alice);
  g = (await ok('POST', '/api/games/move', { room, pick: 1 }, ctx.bob)).game;
  assert.strictEqual(g.phase, 'reveal');
  await ok('POST', '/api/games/stop', { room }, ctx.alice);
  await ok('POST', '/api/games/close-vote', { room, yes: true }, ctx.bob);
  // 0.28: someone leaving a game doesn't leave everyone else stuck.
  g = (await ok('POST', '/api/games/start', { room, type: 'connect4' }, ctx.alice)).game;
  await ok('POST', '/api/games/move', { room, col: 0 }, ctx.alice); await ok('POST', '/api/games/move', { room, col: 1 }, ctx.bob);
  await ok('POST', '/api/rtc/leave', { room }, ctx.bob);
  g = (await ok('GET', `/api/games?room=${encodeURIComponent(room)}`, null, ctx.alice)).game;
  assert.ok(g.over && g.winner === ctx.aliceId && g.forfeit === ctx.bobId, 'leaving Connect Four forfeits');
  await ok('POST', '/api/rtc/join', { room }, ctx.bob);
  g = (await ok('POST', '/api/games/start', { room, type: 'wordle' }, ctx.alice)).game;
  await ok('POST', '/api/games/move', { room, guess: 'crane' }, ctx.bob);
  for (const w of ['slate', 'pious', 'dwarf', 'gumbo', 'hymns', 'jokey']) { const r = await api('POST', '/api/games/move', { room, guess: w }, ctx.alice); if (r.game?.players?.find(p => p.id === ctx.aliceId)?.done) break; }
  await ok('POST', '/api/rtc/leave', { room }, ctx.bob);
  g = (await ok('GET', `/api/games?room=${encodeURIComponent(room)}`, null, ctx.alice)).game;
  assert.ok(g.over && g.word, "Wordle ends when the only other player leaves");
  // Trivia answers are shuffled, so the right one isn't always in the same place.
  const rights = new Set();
  for (let i = 0; i < 12 && rights.size < 3; i++) {
    await ok('POST', '/api/games/stop', { room }, ctx.alice);
    await ok('POST', '/api/games/start', { room, type: 'trivia' }, ctx.alice);
    g = (await ok('POST', '/api/games/move', { room, pick: 0 }, ctx.alice)).game;
    rights.add(g.question.right);
  }
  assert.ok(rights.size >= 3, 'trivia answers are shuffled');
  await ok('POST', '/api/games/stop', { room }, ctx.alice);
  await ok('POST', '/api/rtc/leave', { room }, ctx.alice);

  // Discover home.
  await ok('PATCH', `/api/servers/${server.id}`, { tags: ['Gaming'], discoverable: true, description: 'Polls and games' }, ctx.alice).catch(() => {});
  const home = await ok('GET', '/api/discover-home', null, ctx.bob);
  assert.ok(Array.isArray(home.trending) && Array.isArray(home.categories));

  // Server ban appeals.
  await ok('POST', `/api/servers/${server.id}/bans`, { userId: ctx.bobId, reason: 'spam' }, ctx.alice);
  const bans = (await ok('GET', '/api/me/server-bans', null, ctx.bob)).bans;
  assert.ok(bans.some(b => b.serverId === server.id && b.canAppeal));
  await no(400, 'POST', `/api/servers/${server.id}/appeal`, { text: 'pls' }, ctx.bob);
  await ok('POST', `/api/servers/${server.id}/appeal`, { text: 'Sorry, it was my little brother. It will not happen again.' }, ctx.bob);
  await no(400, 'POST', `/api/servers/${server.id}/appeal`, { text: 'Please please please let me back' }, ctx.bob);
  const appeals = (await ok('GET', `/api/servers/${server.id}/appeals`, null, ctx.alice)).appeals;
  assert.strictEqual(appeals[0].appeal.status, 'pending');
  await ok('POST', `/api/servers/${server.id}/appeals/${ctx.bobId}`, { decision: 'approve', note: 'Welcome back' }, ctx.alice);
  assert.ok(!(await ok('GET', '/api/me/server-bans', null, ctx.bob)).bans.some(b => b.serverId === server.id));

  // Bot marketplace.
  const made = await ok('POST', '/api/apps', { name: 'Dice Buddy', description: 'Rolls dice' }, ctx.alice), app = made.app;
  await ok('PATCH', `/api/apps/${app.id}`, { public: true }, ctx.alice);
  await ok('PATCH', `/api/apps/${app.id}/listing`, { category: 'Games', tagline: 'Roll anything' }, ctx.alice);
  // (0.45.2) Listing needs a staff review: a description, a command, then approval.
  await no(400, 'POST', `/api/apps/${app.id}/review`, {}, ctx.alice);
  await ok('PATCH', `/api/apps/${app.id}`, { description: 'Rolls dice of any size for your server.' }, ctx.alice);
  await fetch(BASE + '/api/bots/@me/commands', { method: 'PUT', headers: { Authorization: `Bot ${made.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ commands: [{ name: 'roll', description: 'Roll a dice' }] }) });
  await ok('POST', `/api/apps/${app.id}/review`, { message: 'Try /roll' }, ctx.alice);
  assert.ok(!(await ok('GET', '/api/marketplace?category=Games', null, ctx.bob)).bots.some(b => b.id === app.id));
  await no(403, 'POST', `/api/staff/bot-reviews/${app.id}`, { approve: true }, ctx.bob);
  await ok('POST', `/api/staff/bot-reviews/${app.id}`, { approve: true }, ctx.veil);
  const market = await ok('GET', '/api/marketplace?category=Games', null, ctx.bob);
  assert.ok(market.bots.some(b => b.id === app.id && b.tagline === 'Roll anything'));
  await no(403, 'PUT', `/api/marketplace/${app.id}/review`, { stars: 5 }, ctx.bob);
  await ok('POST', `/api/invites/${invite}/join`, {}, ctx.bob);
  await ok('POST', `/api/servers/${server.id}/bots`, { botId: app.id }, ctx.alice);
  await no(400, 'PUT', `/api/marketplace/${app.id}/review`, { stars: 5 }, ctx.alice);
  const rated = await ok('PUT', `/api/marketplace/${app.id}/review`, { stars: 4, text: 'Fun!' }, ctx.bob);
  assert.deepStrictEqual(rated.rating, { avg: 4, count: 1 });

  // The admin dashboard is the founder's alone.
  await no(403, 'GET', '/api/admin/dashboard', null, ctx.alice);
  const dash = await ok('GET', '/api/admin/dashboard', null, ctx.veil);
  assert.ok(dash.people.total >= 3 && dash.activity.messages.length === 14 && dash.people.signups.length === 30);
  await no(403, 'POST', '/api/admin/site-update', { title: 'Not allowed', summary: 'Nope' }, ctx.alice);
  const published = await ok('POST', '/api/admin/site-update', { version: '0.55.0', title: 'A new Zuno update', summary: 'New features are here.', fixes: ['Fixed a loading issue'] }, ctx.veil);
  assert.strictEqual(published.update.version, '0.55.0');
  assert.strictEqual(published.update.fixes[0], 'Fixed a loading issue');
  const latestUpdate = await ok('GET', '/api/site-update', null, ctx.bob);
  assert.strictEqual(latestUpdate.update.id, published.update.id);
  assert.strictEqual((await ok('GET', '/api/admin/dashboard', null, ctx.veil)).siteUpdate.id, published.update.id);
  await ok('PUT', '/api/admin/gift-event', { name: 'Test Gifting', days: 3, goal: 10 }, ctx.veil);
  assert.strictEqual((await ok('GET', '/api/gift-event', null, ctx.bob)).event.name, 'Test Gifting');
  await ok('PUT', '/api/admin/gift-event', { stop: true }, ctx.veil);
});


// A pretend push service: decrypts what Zuno sends with this "device's" keys (RFC 8291).
const pushInbox = [];
const pushUA = require('crypto').createECDH('prime256v1'); pushUA.generateKeys();
const pushAuth = require('crypto').randomBytes(16);
const fakePush = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    try {
      const C = require('crypto'), buf = Buffer.concat(chunks);
      const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
      const h = (k, d) => C.createHmac('sha256', k).update(d).digest();
      const uaPub = pushUA.getPublicKey(), shared = pushUA.computeSecret(asPub);
      const ikm = h(h(pushAuth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
      const prk = h(salt, ikm);
      const cek = h(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
      const nonce = h(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
      const d = C.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(-16));
      const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
      pushInbox.push({ auth: req.headers.authorization, note: JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString()) });
    } catch (e) { pushInbox.push({ error: e.message }); }
    res.writeHead(201); res.end();
  });
});
step('0.28: Reply Later, slash commands, forum & media channels, videos together, server tags, profile comments, data download, phone notifications', async () => {
  const server = (await ok('POST', '/api/servers', { name: 'Forum Club' }, ctx.veil)).server;
  const code = (await ok('GET', `/api/servers/${server.id}`, null, ctx.veil)).invite;
  await ok('POST', `/api/invites/${code}/join`, {}, ctx.bob); await ok('POST', `/api/invites/${code}/join`, {}, ctx.alice);
  // forum
  const forum = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'help', type: 'forum' }, ctx.veil)).channel;
  assert.strictEqual(forum.layout, 'forum');
  const tags = (await ok('PATCH', `/api/channels/${forum.id}/forum`, { tags: [{ name: 'Question' }, { name: 'Bug' }], requireTag: true }, ctx.veil)).channel.forumTags;
  await no(400, 'POST', `/api/channels/${forum.id}/messages`, { content: 'no title' }, ctx.bob);
  await no(400, 'POST', `/api/channels/${forum.id}/messages`, { content: 'no tag', post: { title: 'Hi' } }, ctx.bob);
  const post = (await ok('POST', `/api/channels/${forum.id}/messages`, { content: 'How?', post: { title: 'How do I?', tags: [tags[0].id] } }, ctx.bob)).message;
  assert.ok(post.thread && post.post.title === 'How do I?');
  await ok('POST', `/api/threads/${post.thread.id}/messages`, { content: 'Like this' }, ctx.alice);
  const posts = (await ok('GET', `/api/channels/${forum.id}/posts`, null, ctx.bob)).posts;
  assert.strictEqual(posts[0].replies, 1);
  await ok('PATCH', `/api/channels/${forum.id}/posts/${post.id}`, { title: 'How do I add a bot?' }, ctx.bob);
  // media needs a picture or video, and doesn't lose the file when it says no
  const media = (await ok('POST', `/api/servers/${server.id}/channels`, { name: 'art', type: 'media' }, ctx.veil)).channel;
  await no(400, 'POST', `/api/channels/${media.id}/messages`, { content: 'words only' }, ctx.bob);
  // reply later
  const dm = (await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: 'got a sec?' }, ctx.alice)).message;
  assert.strictEqual((await ok('POST', '/api/me/reply-later', { conv: ctx.aliceId, msgId: dm.id }, ctx.bob)).items.length, 1);
  await ok('POST', `/api/dms/${ctx.aliceId}/messages`, { content: 'sure' }, ctx.bob);
  assert.strictEqual((await ok('GET', '/api/me/reply-later', null, ctx.bob)).items.length, 0, 'answering clears it');
  // slash commands list
  assert.ok(Array.isArray((await ok('GET', `/api/channels/${forum.id}/commands`, null, ctx.bob)).commands));
  // mentions: @name means the person, not a role named the same
  const role = (await ok('POST', `/api/servers/${server.id}/roles`, { name: 'bob', mentionable: true }, ctx.veil));
  const general = server.channels.find(c => c.type === 'text');
  const m = (await ok('POST', `/api/channels/${general.id}/messages`, { content: '@bob hi' }, ctx.alice)).message;
  assert.ok(m.mentions.includes(ctx.bobId) && !(m.mentionRoles || []).length);
  // server tags
  await no(400, 'PATCH', `/api/servers/${server.id}/tag`, { text: 'TOOLONG' }, ctx.veil);
  await ok('PATCH', `/api/servers/${server.id}/tag`, { text: 'fc' }, ctx.veil);
  await ok('PATCH', '/api/me/server-tag', { serverId: server.id }, ctx.bob);
  assert.strictEqual((await ok('GET', `/api/users/${ctx.bobId}`, null, ctx.alice)).user.serverTag.text, 'FC');
  // profile comments: friends by default, owner can delete, can be turned off
  const c = (await ok('POST', `/api/users/${ctx.bobId}/comments`, { text: 'hey!' }, ctx.alice)).comment;
  await ok('DELETE', `/api/users/${ctx.bobId}/comments/${c.id}`, {}, ctx.bob);
  await ok('PATCH', '/api/me/profile-social', { comments: 'off', visitors: true }, ctx.bob);
  await no(403, 'POST', `/api/users/${ctx.bobId}/comments`, { text: 'hey again' }, ctx.alice);
  // data download: no secrets
  const res = await fetch(BASE + '/api/me/export', { headers: { Authorization: `Bearer ${ctx.alice}` } });
  const text = await res.text();
  assert.ok(res.headers.get('content-disposition').includes('attachment') && text.includes('"account"'));
  assert.ok(!text.includes('passwordHash') && !text.includes(ctx.alice), 'no password hash or login token in the download');
  // phone notifications: subscribe a pretend device, get an encrypted, signed notification
  await new Promise(r => fakePush.listen(AI_PORT + 1, r));
  const key = (await ok('GET', '/api/push/key', null, ctx.bob)).key;
  assert.strictEqual(Buffer.from(key, 'base64url').length, 65);
  await no(400, 'POST', '/api/push/subscribe', { endpoint: 'https://evil.example/x', keys: { p256dh: pushUA.getPublicKey().toString('base64url'), auth: pushAuth.toString('base64url') } }, ctx.bob);
  await ok('POST', '/api/push/subscribe', { endpoint: `http://localhost:${AI_PORT + 1}/push/bob`, keys: { p256dh: pushUA.getPublicKey().toString('base64url'), auth: pushAuth.toString('base64url') } }, ctx.bob);
  await ok('POST', `/api/dms/${ctx.bobId}/messages`, { content: 'are you there?' }, ctx.alice);
  for (let i = 0; i < 30 && !pushInbox.length; i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(pushInbox[0] && !pushInbox[0].error, 'push arrived and decrypted: ' + JSON.stringify(pushInbox[0]));
  assert.strictEqual(pushInbox[0].note.body, 'are you there?');
  assert.ok(/^vapid t=.+, k=/.test(pushInbox[0].auth));
  fakePush.close();
});
step('0.29: hide badges, Senior Bug Hunter', async () => {
  // five confirmed reports earn the golden badge, which replaces the purple one
  for (let i = 0; i < 5; i++) {
    const bug = (await ok('POST', '/api/bugs', { title: 'Bug ' + i, details: 'Something broke, number ' + i }, ctx.alice)).bug;
    await ok('PATCH', `/api/bugs/${bug.id}`, { status: i % 2 ? 'fixed' : 'acknowledged' }, ctx.veil);
  }
  let me = (await ok('GET', '/api/me', null, ctx.alice)).me;
  assert.ok(me.badges.includes('bughunter_senior') && !me.badges.includes('bughunter'), 'senior replaces bug hunter: ' + me.badges);
  // hiding a badge takes it off your public profile but you still own it
  const v = await ok('PATCH', '/api/me/badges', { hidden: ['bughunter_senior', 'not_a_badge'] }, ctx.alice);
  assert.deepStrictEqual(v.hidden, ['bughunter_senior']);
  assert.ok(v.owned.includes('bughunter_senior'));
  const seen = (await ok('GET', `/api/users/${ctx.aliceId}`, null, ctx.bob).catch(() => null))?.user || (await ok('GET', '/api/me', null, ctx.alice)).me;
  assert.ok(!seen.badges.includes('bughunter_senior'), 'hidden badge does not show');
  await ok('PATCH', '/api/me/badges', { hidden: [] }, ctx.alice);
  me = (await ok('GET', '/api/me', null, ctx.alice)).me;
  assert.ok(me.badges.includes('bughunter_senior'), 'shown again');
});
// A real (blank, see-through) PNG of any size, for the creation checks.
function blankPng(w, h) {
  const zlib = require('zlib');
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
step('0.30: community creations, wearing them, the Artist badge, favorite stickers, comments open by default', async () => {
  const send = async (kind, buf, extra = '') => fetch(`${BASE}/api/creations?kind=${kind}&name=Cozy%20Scarf${extra}`, { method: 'POST', headers: { Authorization: `Bearer ${ctx.bob}`, 'Content-Type': 'image/png' }, body: buf });
  assert.strictEqual((await send('decoration', blankPng(512, 512))).status, 400, 'must tick "I made this myself"');
  assert.strictEqual((await send('decoration', blankPng(512, 300), '&own=1')).status, 400, 'decorations are square');
  assert.strictEqual((await send('banner', blankPng(300, 300), '&own=1')).status, 400, 'banners are long and thin');
  const r = await send('decoration', blankPng(512, 512), '&own=1');
  const { creation } = await r.json();
  assert.strictEqual(r.status, 200); assert.strictEqual(creation.status, 'pending');
  assert.ok(!(await ok('GET', '/api/creations?kind=decoration', null, ctx.alice)).creations.some(c => c.id === creation.id), 'not public until approved');
  await no(403, 'GET', '/api/creations/review', null, ctx.alice);
  assert.ok((await ok('GET', '/api/creations/review', null, ctx.veil)).pending.some(c => c.id === creation.id));
  await no(400, 'PATCH', `/api/creations/${creation.id}/review`, { approve: false }, ctx.veil); // a reason is needed
  await ok('PATCH', `/api/creations/${creation.id}/review`, { approve: true }, ctx.veil);
  const bob = (await ok('GET', '/api/me', null, ctx.bob)).me;
  assert.ok(bob.badges.includes('artist'), 'first approved one earns Artist');
  await ok('PATCH', '/api/me/wear', { kind: 'decoration', id: creation.id }, ctx.alice);
  const alice = (await ok('GET', '/api/me', null, ctx.alice)).me;
  assert.strictEqual(alice.communityDeco?.id, creation.id);
  await ok('PATCH', '/api/me/wear', { kind: 'banner', id: 'preset:aurora' }, ctx.alice);
  await no(400, 'PATCH', '/api/me/wear', { kind: 'banner', id: 'preset:nope' }, ctx.alice);
  assert.ok((await ok('GET', `/api/users/${ctx.bobId}/creations`, null, ctx.alice)).creations.length === 1);
  // deleting takes it off everyone
  await ok('DELETE', `/api/creations/${creation.id}`, null, ctx.bob);
  assert.ok(!(await ok('GET', '/api/me', null, ctx.alice)).me.communityDeco);
  // favorite stickers
  await ok('PUT', '/api/me/fav-stickers', { favs: [{ id: 'zuno:hi' }, { id: 'abc', serverId: 'sv1' }] }, ctx.alice);
  assert.strictEqual((await ok('GET', '/api/me/fav-stickers', null, ctx.alice)).favs.length, 2);
  // comments are open to everyone by default
  assert.strictEqual((await ok('GET', `/api/users/${ctx.aliceId}/comments`, null, ctx.bob)).mode, 'everyone');
});
step('0.31: bug hunter progress, profile likes, profile reports, suggestions, tag cards, artist favorites', async () => {
  const p = await ok('GET', '/api/bugs/progress', null, ctx.bob);
  assert.strictEqual(p.need, 5); assert.ok(p.left >= 0);
  // likes: one per person, not your own
  await no(400, 'POST', `/api/users/${ctx.aliceId}/like`, {}, ctx.alice);
  let l = await ok('POST', `/api/users/${ctx.aliceId}/like`, {}, ctx.bob);
  assert.deepStrictEqual([l.count, l.liked], [1, true]);
  l = await ok('POST', `/api/users/${ctx.aliceId}/like`, {}, ctx.bob);
  assert.strictEqual(l.count, 1, 'liking twice still counts once');
  assert.strictEqual((await ok('GET', `/api/users/${ctx.aliceId}/likes`, null, ctx.veil)).count, 1);
  l = await ok('POST', `/api/users/${ctx.aliceId}/like`, { on: false }, ctx.bob);
  assert.strictEqual(l.count, 0);
  // reporting a profile lands in moderation
  await no(400, 'POST', '/api/reports/profile', { userId: ctx.aliceId, reason: 'nope' }, ctx.bob);
  await ok('POST', '/api/reports/profile', { userId: ctx.aliceId, reason: 'spam', details: 'weird bio' }, ctx.bob);
  await no(400, 'POST', '/api/reports/profile', { userId: ctx.aliceId, reason: 'spam' }, ctx.bob);
  // suggestions: send, staff decide, only staff see everyone's
  const { suggestion } = await ok('POST', '/api/suggestions', { title: 'Pin messages in DMs', details: 'please', kind: 'feature' }, ctx.bob);
  await no(403, 'GET', '/api/suggestions', null, ctx.bob);
  assert.ok((await ok('GET', '/api/suggestions?status=new', null, ctx.veil)).suggestions.some(s => s.id === suggestion.id));
  await ok('PATCH', `/api/suggestions/${suggestion.id}`, { status: 'planned', note: 'Coming soon' }, ctx.veil);
  assert.strictEqual((await ok('GET', '/api/suggestions/mine', null, ctx.bob)).suggestions[0].status, 'planned');
  // server tag card: invite-only servers can't be joined from a tag
  const sv = (await ok('GET', '/api/me', null, ctx.alice)).servers[0];
  await ok('PATCH', `/api/servers/${sv.id}/tag`, { text: 'TEST' }, ctx.alice);
  const card = await ok('GET', `/api/servers/${sv.id}/tag-card`, null, ctx.veil);
  assert.strictEqual(card.name, sv.name);
  if (!card.joined && !card.joinable) await no(403, 'POST', `/api/servers/${sv.id}/join-from-tag`, {}, ctx.veil);
  // artist progress is readable
  const ap = await ok('GET', '/api/me/artist-progress', null, ctx.bob);
  assert.strictEqual(ap.needApproved, 5);
});
step('0.32: change your username (password, once a day, old name held)', async () => {
  const PW = 'bobnew12';
  const me0 = (await ok('GET', '/api/me', null, ctx.bob)).me;
  const old = me0.username, next = 'bobby' + Date.now().toString(36).slice(-5);
  assert.strictEqual((await ok('GET', `/api/me/username?check=${me0.username}`, null, ctx.bob)).check.available, false);
  await no(403, 'POST', '/api/me/username', { username: next, password: 'wrong-password' }, ctx.bob);
  await no(409, 'POST', '/api/me/username', { username: 'alice', password: PW }, ctx.bob);
  const r = await ok('POST', '/api/me/username', { username: next, password: PW }, ctx.bob);
  assert.strictEqual(r.me.username, next);
  await no(429, 'POST', '/api/me/username', { username: next + 'x', password: PW }, ctx.bob); // once a day
  // the old name is held: nobody else can register it
  assert.strictEqual((await ok('GET', `/api/me/username?check=${old}`, null, ctx.alice)).check.available, false);
});
step('0.34: Veteran Bug Hunter, founder-only Bloom, staff badges, veil reserved', async () => {
  // alice has 5 confirmed (0.29): Senior, and the next goal is Veteran at 15
  const p = await ok('GET', '/api/bugs/progress', null, ctx.alice);
  assert.ok(p.senior && !p.veteran && p.veteranNeed === 15 && p.need === 15 && p.left === 10, JSON.stringify(p));
  // other staff can't gift Bloom or hand out badges any more; the founder can
  await ok('POST', `/api/users/${ctx.aliceId}/badges`, { badge: 'staff', on: true }, ctx.veil);
  await unlockStaff(ctx.alice);
  await no(403, 'POST', `/api/users/${ctx.bobId}/bloom`, { days: 7 }, ctx.alice);
  // (0.37) staff can manage other people's badges, but not the Staff badge or the founder's badges
  await ok('POST', `/api/users/${ctx.bobId}/badges`, { badge: 'creator_star', on: true }, ctx.alice);
  await ok('POST', `/api/users/${ctx.bobId}/badges`, { badge: 'creator_star', on: false }, ctx.alice);
  await no(403, 'POST', `/api/users/${ctx.bobId}/badges`, { badge: 'staff', on: true }, ctx.alice);
  await no(403, 'POST', `/api/users/${ctx.veilId || (await ok('GET', '/api/me', null, ctx.veil)).me.id}/badges`, { badge: 'og', on: false }, ctx.alice);
  await no(403, 'POST', `/api/users/${ctx.bobId}/badges`, { badge: 'og', on: true }, ctx.bob);
  await ok('POST', `/api/users/${ctx.bobId}/bloom`, { days: 0 }, ctx.veil);
  await ok('POST', `/api/users/${ctx.aliceId}/badges`, { badge: 'staff', on: false }, ctx.veil);
  // the founder's old name can't be taken
  assert.strictEqual((await ok('GET', '/api/me/username?check=veil', null, ctx.bob)).check.available, false, 'veil is reserved');
});
(async () => {
  let failed = 0;
  await new Promise(r => fakeAi.listen(AI_PORT, r));
  try { await boot(); } catch (e) { console.error('Could not start the server:', e.message); process.exit(1); }
  for (const [name, fn] of steps) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  }
  await stop();
  fakeAi.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(failed ? `\n${failed} of ${steps.length} checks failed.` : `\nAll ${steps.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
