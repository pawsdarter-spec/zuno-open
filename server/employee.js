'use strict';
// Zuno Employee Dashboard: staff-only user, profile, badge and naming-policy controls.
module.exports = function employee(z) {
  const { data, route, fail, clean, save, needStaff, staffGuard, publicUser, broadcastUser, send, systemMessage, judgeText, badUsername, NAME_ERROR, USERNAME_RE, CONFIG, STAFF_NAMES, isFounder, needReauth, crypto, limit, visitorTag } = z;
  const dashboardPassword = String(process.env.ZUNO_STAFF_DASHBOARD_PASSWORD || '');
  const dashboardAuthMs = 12 * 60 * 60 * 1000;
  const validAuth = token => { const session = token && data.sessions[token]; return !!(session && typeof session === 'object' && session.employeeAuthUntil > Date.now()); };
  // Password unlock is per signed-in Zuno session, expires after 12 hours, and never enters client storage.
  route('GET', '/api/employee/auth', async ({ me, token }) => {
    if (!me || !z.isStaff(me) || me.system) fail(403, 'Only Zuno Staff can sign in to the Employee Dashboard.');
    return { authenticated: validAuth(token), expiresAt: validAuth(token) ? data.sessions[token].employeeAuthUntil : null };
  });
  route('POST', '/api/employee/auth', async ({ req, me, token, body }) => {
    if (!me || !z.isStaff(me) || me.system) fail(403, 'Only Zuno Staff can sign in to the Employee Dashboard.');
    if (!dashboardPassword) fail(503, 'Employee Dashboard sign-in is not configured. Set ZUNO_STAFF_DASHBOARD_PASSWORD on the server.');
    limit('employee-auth:' + visitorTag(req), 5, 15 * 60e3, 'Too many staff sign-in attempts. Try again in 15 minutes.');
    const supplied = Buffer.from(String(body.password || ''));
    const expected = Buffer.from(dashboardPassword);
    const matches = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!matches) fail(403, 'Incorrect Employee Dashboard password.');
    const session = data.sessions[token];
    if (!session || typeof session !== 'object') fail(401, 'Your sign-in session expired. Sign in to Zuno again.');
    session.employeeAuthUntil = Date.now() + dashboardAuthMs;
    save();
    audit(me, 'employee-dashboard-sign-in', me.id, 'Staff dashboard unlocked for 12 hours');
    return { authenticated: true, expiresAt: session.employeeAuthUntil };
  });
  data.employeePolicies ||= { usernames: {}, vanities: {} };
  data.employeePolicies.usernames ||= {};
  data.employeePolicies.vanities ||= {};
  const human = u => u && !u.system && !u.bot && !u.webhook && !u.deleted;
  const audit = (me, action, target, note='') => {
    data.modLog ||= [];
    data.modLog.push({ at: Date.now(), by: me.id, action, target: target || null, note: clean(note, 300) });
    data.modLog = data.modLog.slice(-1000);
  };
  const policyName = (kind, name) => {
    const k = kind === 'vanity' ? 'vanities' : 'usernames';
    return { k, name: clean(name, 64).toLowerCase().replace(/^@/, '') };
  };
  route('GET', '/api/employee/users', async ({ me, query }) => {
    needStaff(me);
    const q = clean(query.get('q'), 64).toLowerCase().replace(/^@/, '');
    if (q.length < 2) return { users: [] };
    const users = Object.values(data.users).filter(human).filter(u => u.username.toLowerCase().includes(q) || String(u.displayName || '').toLowerCase().includes(q) || u.id === q).slice(0, 30);
    return { users: users.map(u => ({ ...publicUser(u), warnings: u.mod?.warnings || 0, suspendedUntil: u.suspendedUntil || 0, mutedUntil: u.mutedUntil || 0, dmOnly: !!u.dmOnly, banned: !!(u.banned && !u.banned.restored) })) };
  });
  route('POST', '/api/employee/users/:id/profile', async ({ me, params, body }) => {
    needStaff(me);
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'User not found.');
    staffGuard(me, u);
    const changed = [];
    if ('username' in body) {
      const name = clean(body.username, 40).toLowerCase().replace(/^@/, '');
      if (!USERNAME_RE.test(name)) fail(400, 'Usernames must be 2–32 characters: letters, numbers, _ and . only.');
      if (badUsername(name)) fail(400, NAME_ERROR);
      if (CONFIG.RESERVED_USERNAMES.includes(name) || (STAFF_NAMES.has(name) && !STAFF_NAMES.has(u.username))) fail(400, 'That username is reserved.');
      const policy = data.employeePolicies.usernames[name];
      if (policy) fail(409, `That username is ${policy.mode === 'blacklist' ? 'blacklisted' : 'on hold'} by Zuno staff.`);
      if (Object.values(data.users).some(x => x.id !== u.id && x.username === name)) fail(409, 'That username is already taken.');
      if (name !== u.username) { await judgeText({ username: name }); data.heldNames ||= {}; data.heldNames[u.username] = { id: u.id, until: Date.now() + 7 * 864e5 }; u.pastUsernames = [{ name: u.username, until: Date.now() }, ...(u.pastUsernames || [])].slice(0, 10); u.username = name; u.usernameChangedAt = Date.now(); changed.push('username'); }
    }
    if ('displayName' in body) {
      const v = z.cleanName(body.displayName, 32) || u.username;
      await judgeText({ 'display name': v });
      if (v !== u.displayName) { u.displayName = v; changed.push('display name'); }
    }
    if ('pronouns' in body) {
      const v = clean(body.pronouns, 24);
      await judgeText({ pronouns: v });
      if (v !== (u.pronouns || '')) { u.pronouns = v; changed.push('pronouns'); }
    }
    if (!changed.length) fail(400, 'No profile changes were made.');
    audit(me, 'employee-profile-edit', u.id, `Updated ${changed.join(', ')}`);
    save(); broadcastUser(u); send(u.id, 'me', z.privateMe(u));
    return { user: publicUser(u), changed };
  });
  route('POST', '/api/employee/users/:id/restrictions', async ({ me, params, body }) => {
    needStaff(me);
    const u = data.users[params.id];
    if (!human(u)) fail(404, 'User not found.');
    staffGuard(me, u);
    const changes = [];
    if ('dmOnly' in body) { u.dmOnly = !!body.dmOnly; if (u.dmOnly && z.rooms && z.roomMembers && z.leaveRoom) for (const roomId of [...z.rooms.keys()]) if (roomId.startsWith('vc:') && z.roomMembers(roomId).includes(u.id)) z.leaveRoom(roomId, u.id); changes.push(u.dmOnly ? 'restricted to DMs and DM calls' : 'removed DM-only restriction'); }
    if ('muteDays' in body) {
      const days = Math.max(0, Math.min(365, Math.round(Number(body.muteDays) || 0)));
      u.mutedUntil = days ? Date.now() + days * 864e5 : 0;
      changes.push(days ? `muted for ${days} day(s)` : 'unmuted');
    }
    if (!changes.length) fail(400, 'Choose a restriction to change.');
    audit(me, 'employee-restriction', u.id, changes.join('; '));
    if (body.dmOnly !== undefined) systemMessage(u.id, u.dmOnly ? '🔒 **Your account is limited to direct messages and direct-message calls.** You cannot post in servers or join server voice calls.' : '🔓 **Your DM-only account restriction has been lifted.**');
    if (body.muteDays !== undefined) systemMessage(u.id, u.mutedUntil > Date.now() ? `🔇 **Your account has been muted until ${new Date(u.mutedUntil).toLocaleString()}.**` : '🔊 **Your account mute has been lifted.**');
    save(); broadcastUser(u);
    return { user: { ...publicUser(u), mutedUntil: u.mutedUntil || 0, dmOnly: !!u.dmOnly } };
  });
  route('GET', '/api/employee/policies', async ({ me }) => {
    needStaff(me);
    return { policies: data.employeePolicies };
  });
  route('POST', '/api/employee/policies', async ({ me, body }) => {
    needStaff(me);
    const kind = body.kind === 'vanity' ? 'vanity' : body.kind === 'username' ? 'username' : null;
    if (!kind) fail(400, 'Choose username or vanity.');
    const { k, name } = policyName(kind, body.name);
    if (kind === 'username' && !USERNAME_RE.test(name)) fail(400, 'Enter a valid 2–32 character username.');
    if (kind === 'vanity' && !/^[a-z0-9-]{3,24}$/.test(name)) fail(400, 'Vanities must be 3–24 letters, numbers or dashes.');
    if (body.remove) {
      if (!data.employeePolicies[k][name]) fail(404, 'That policy was not found.');
      delete data.employeePolicies[k][name];
      audit(me, `employee-${kind}-policy-remove`, null, name);
    } else {
      const mode = body.mode === 'blacklist' && kind === 'username' ? 'blacklist' : 'hold';
      data.employeePolicies[k][name] = { mode, by: me.id, at: Date.now(), note: clean(body.note, 160) };
      audit(me, `employee-${kind}-${mode}`, null, name);
    }
    save();
    return { policies: data.employeePolicies };
  });
};
