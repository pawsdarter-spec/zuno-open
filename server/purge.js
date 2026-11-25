'use strict';
// Permanently deleting moderation records. Only the founder (FOUNDER in server/config.js) can do
// this; other staff can resolve, dismiss and answer things, but never wipe them. Each delete is
// written to the founder's staff log so there's still a trace that something was removed.

module.exports = function purge(z) {
  const { route, fail, data, save, send, isStaff, isFounder } = z;
  const founderOnly = me => { if (!isFounder(me.id)) fail(403, 'Only the founder can permanently delete moderation records.'); };
  const note = (me, text) => { data.staffLog = [...(data.staffLog || []).slice(-499), { at: Date.now(), by: me.id, text }]; save(); };
  const ping = ev => { for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, ev, {}); };

  route('DELETE', '/api/mod/reports/:id', async ({ me, params }) => {
    founderOnly(me);
    if (!data.reports[params.id]) fail(404, 'That report no longer exists.');
    delete data.reports[params.id];
    note(me, 'permanently deleted a report'); ping('reports');
    return { ok: true };
  });
  route('DELETE', '/api/bugs/:id', async ({ me, params }) => {
    founderOnly(me);
    const b = data.bugs[params.id];
    if (!b) fail(404, 'That bug report no longer exists.');
    for (const url of new Set([b.screenshot, ...(b.screenshots || [])].filter(Boolean))) z.removeUpload(url);
    delete data.bugs[params.id];
    note(me, `permanently deleted the bug report "${b.title}"`); ping('bugs');
    return { ok: true };
  });
  // An answered appeal disappears from the list (the ban itself stays as it is).
  route('DELETE', '/api/mod/appeals/:userId', async ({ me, params }) => {
    founderOnly(me);
    const a = data.users[params.userId]?.banned?.appeal;
    if (!a || a.deleted) fail(404, 'That appeal no longer exists.');
    if (a.status === 'pending') fail(400, 'Answer the appeal before deleting it.');
    a.deleted = true; a.text = '';
    note(me, 'permanently deleted an appeal'); ping('appeals');
    return { ok: true };
  });
  // One entry from the moderation log, picked by when it happened and who did it.
  route('DELETE', '/api/mod/log', async ({ me, query }) => {
    founderOnly(me);
    const at = Number(query.get('at')), by = query.get('by');
    const before = data.modLog.length;
    data.modLog = data.modLog.filter(e => !(e.at === at && e.by === by));
    if (data.modLog.length === before) fail(404, 'That log entry no longer exists.');
    note(me, 'permanently deleted a moderation log entry');
    return { ok: true };
  });
};
