'use strict';
// Zuno 0.32: changing your username (handle). Needs your password, works once a day, and your old
// name is held for you for 7 days so nobody can grab it to pretend to be you.

module.exports = function (z) {
  const { data, save, route, fail, clean } = z;
  const DAY = 864e5, HOLD = 7 * DAY;
  data.heldNames ||= {};

  const taken = (name, me) =>
    Object.values(data.users).some(u => u.id !== me.id && u.username === name) ||
    (data.heldNames[name]?.until > Date.now() && data.heldNames[name].id !== me.id) ||
    z.CONFIG.RESERVED_USERNAMES.includes(name) || (z.STAFF_NAMES.has(name) && !z.STAFF_NAMES.has(me.username));

  route('GET', '/api/me/username', async ({ me, query }) => {
    const next = (me.usernameChangedAt || 0) + DAY;
    const name = clean(query.get('check') || '', 40).toLowerCase().replace(/^@/, '');
    const out = { username: me.username, nextChangeAt: next > Date.now() ? next : null, staffLocked: z.STAFF_NAMES.has(me.username) };
    if (name) {
      const blocked = z.badUsername(name);
      out.check = { name, valid: z.USERNAME_RE.test(name) && !blocked, blocked, available: !blocked && z.USERNAME_RE.test(name) && name !== me.username && !taken(name, me) };
    }
    return out;
  });

  route('POST', '/api/me/username', async ({ me, body }) => {
    if (me.system || me.bot) fail(403, "This account's username can't be changed.");
    if (z.STAFF_NAMES.has(me.username)) fail(403, 'Zuno Staff usernames are tied to the staff role, so they can\'t be changed here.');
    const name = clean(body.username, 40).toLowerCase().replace(/^@/, '');
    if (!z.USERNAME_RE.test(name)) fail(400, 'Usernames must be 2–32 characters: letters, numbers, _ and . only.');
    if (name === me.username) fail(400, "That's already your username.");
    if (z.badUsername(name)) fail(400, z.NAME_ERROR);
    const wait = (me.usernameChangedAt || 0) + DAY - Date.now();
    if (wait > 0) fail(429, `You can change your username once a day. Try again in ${Math.ceil(wait / 3600e3)} hour${Math.ceil(wait / 3600e3) === 1 ? '' : 's'}.`);
    z.limit('uname:' + me.id, 10, 3600e3, 'Too many tries. Wait a bit and try again.');
    if (!(await z.checkPassword(String(body.password || ''), me.passwordHash))) fail(403, "That password isn't right.");
    if (taken(name, me)) fail(409, 'That username is already taken.');
    await z.judgeText({ username: name });
    const old = me.username;
    // Hold the old name for 7 days so only you can take it back.
    data.heldNames[old] = { id: me.id, until: Date.now() + HOLD };
    if (data.heldNames[name]?.id === me.id) delete data.heldNames[name];
    for (const [k, v] of Object.entries(data.heldNames)) if (v.until < Date.now()) delete data.heldNames[k];
    me.username = name;
    me.usernameChangedAt = Date.now();
    me.pastUsernames = [{ name: old, until: Date.now() }, ...(me.pastUsernames || [])].slice(0, 10);
    save();
    z.broadcastUser(me);
    z.send(me.id, 'me', z.privateMe(me));
    return { me: z.privateMe(me), old };
  });

  // ======================= moving to heyzuno.uk without logging out =======================
  // The old onrender.com address sends you to the new one. Logins are saved per address, so the old
  // page asks for a one-time code (good for 60 seconds, usable once) and hands it to the new one,
  // which trades it for a fresh login.
  const handoffs = new Map(); // code -> { uid, exp }
  route('POST', '/api/me/handoff', async ({ me }) => {
    z.limit('handoff:' + me.id, 10, 3600e3, 'Too many tries. Log in on the new address instead.');
    for (const [k, v] of handoffs) if (v.exp < Date.now()) handoffs.delete(k);
    const code = z.crypto.randomBytes(24).toString('base64url');
    handoffs.set(code, { uid: me.id, exp: Date.now() + 60e3 });
    return { code };
  });
  route('POST', '/api/handoff/redeem', async ({ body, req }) => {
    z.limit('redeem:' + z.clientIp(req), 20, 3600e3, 'Too many tries. Log in normally.');
    const h = handoffs.get(String(body.code || ''));
    handoffs.delete(String(body.code || ''));
    if (!h || h.exp < Date.now() || !data.users[h.uid] || data.users[h.uid].deleted) fail(400, 'That link expired. Log in normally.');
    return { token: z.createSession(h.uid, req) };
  }, { auth: false });
};
