'use strict';
// Ban appeals. Someone banned from Zuno can send ONE appeal within APPEAL_DAYS (server/config.js).
// Staff answer it in Settings › Moderation › Appeals:
//   - Approve: the account comes back (name and profile; not servers or friends).
//   - Deny: they get 24 hours to read the answer, then the login is wiped for good.
// The founder hears about every new appeal. Client side: public/zuno22.js.

module.exports = function appeals(z) {
  const { route, fail, clean, data, save, send, needStaff, publicUser, systemMessage, isStaff, privateMe } = z;
  const tellStaff = () => { for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'appeals', {}); };

  route('POST', '/api/appeal', async ({ me, body }) => {
    const b = me.banned;
    if (!b || b.restored) fail(400, "Your account isn't banned.");
    if (b.purged || b.appealUntil < Date.now()) fail(400, 'The time to appeal this ban has passed.');
    if (b.appeal) fail(400, "You've already sent an appeal. The Zuno team will answer it.");
    const text = clean(body.text, 1500);
    if (text.length < 20) fail(400, 'Tell the Zuno team a bit more (at least 20 characters).');
    b.appeal = { text, at: Date.now(), status: 'pending' };
    save(); tellStaff();
    const f = Object.values(data.users).find(u => u.username === require('./config').FOUNDER && !u.bot);
    if (f) z.notify?.(f.id, { type: 'staff', from: me.id, title: 'New ban appeal', text: `${b.snapshot?.displayName || me.displayName} appealed their ban.` });
    return { me: privateMe(me) };
  });

  const appealView = u => ({
    userId: u.id, was: u.banned.snapshot ? { username: u.banned.snapshot.username, displayName: u.banned.snapshot.displayName, avatar: u.banned.snapshot.avatar } : null,
    now: publicUser(u), bannedAt: u.banned.at, reason: u.banned.reason || '', appeal: u.banned.appeal,
    decidedBy: u.banned.appeal?.by ? publicUser(data.users[u.banned.appeal.by]) : null,
  });
  route('GET', '/api/mod/appeals', async ({ me }) => {
    needStaff(me);
    const all = Object.values(data.users).filter(u => u.banned?.appeal && !u.banned.appeal.deleted).map(appealView).sort((a, b) => b.appeal.at - a.appeal.at);
    return { pending: all.filter(a => a.appeal.status === 'pending'), decided: all.filter(a => a.appeal.status !== 'pending').slice(0, 50) };
  });

  route('POST', '/api/mod/appeals/:userId', async ({ me, params, body }) => {
    needStaff(me);
    const u = data.users[params.userId];
    const a = u?.banned?.appeal;
    if (!a) fail(404, 'That appeal no longer exists.');
    if (a.status !== 'pending') fail(400, 'This appeal was already answered.');
    z.staffGuard(me, u);
    const note = clean(body.note, 500);
    if (body.decision === 'approve') {
      a.status = 'approved'; a.by = me.id; a.decidedAt = Date.now(); a.note = note;
      const renamed = z.restoreBannedAccount(u);
      systemMessage(u.id, `✅ **Your appeal was approved and your account is back.**${note ? `\n\nNote from the team: ${note}` : ''}\n\nYou'll need to rejoin your servers and add your friends again.${renamed ? ` Someone took your old username while you were away, so yours is now **${u.username}** (change it any time).` : ''}`);
    } else if (body.decision === 'deny') {
      a.status = 'denied'; a.by = me.id; a.decidedAt = Date.now(); a.note = note;
      u.banned.appealUntil = Date.now() + 24 * 3600e3; // a day to read the answer, then it's wiped
    } else fail(400, 'Approve or deny the appeal.');
    data.modLog.push({ at: Date.now(), by: me.id, action: 'appeal_' + a.status, target: u.id, note });
    data.modLog = data.modLog.slice(-1000);
    save(); tellStaff();
    send(u.id, 'me', privateMe(u));
    return { ok: true, decision: a.status };
  });
};
