'use strict';
// Profile moderation (Zuno Staff only): take down parts of someone's profile that break the rules:
// single widgets, the bio, custom status, pronouns, display name, avatar, banner, background or
// profile sound. The person gets a message from Zuno saying what was removed and why, and it's
// written to the moderation log (Settings › Moderation).
//
// Client side: public/zuno21.js adds a "Moderate profile" button to profiles for staff.

module.exports = function profileMod(z) {
  const { route, fail, clean, data, save, systemMessage, broadcastUser, needStaff, staffGuard, removeUpload, publicUser } = z;

  // What staff can remove, and what each one resets to.
  const PARTS = {
    avatar: { label: 'avatar', reset: u => { if (/^\/uploads\//.test(u.avatar || '')) removeUpload(u.avatar); u.avatar = null; } },
    banner: { label: 'banner', reset: u => { removeUpload(u.profileBanner?.url); u.profileBanner = null; } },
    background: { label: 'profile background', reset: u => { removeUpload(u.profileBackground?.url); u.profileBackground = null; } },
    sound: { label: 'profile sound', reset: u => { removeUpload(u.profileSound); u.profileSound = null; u.profileSoundName = ''; } },
    bio: { label: 'About Me', reset: u => { u.bio = ''; } },
    status: { label: 'custom status', reset: u => { u.customStatus = ''; } },
    pronouns: { label: 'pronouns', reset: u => { u.pronouns = ''; } },
    displayName: { label: 'display name', reset: u => { u.displayName = u.username; } },
    widgets: { label: 'all profile widgets', reset: u => { for (const w of u.widgets || []) if (w.type === 'photo') removeUpload(w.url); u.widgets = []; } },
  };

  route('POST', '/api/mod/users/:id/profile', async ({ me, params, body }) => {
    needStaff(me);
    const u = data.users[params.id];
    if (!u || u.system || u.bot) fail(404, "That account can't be moderated.");
    staffGuard(me, u);
    const parts = (Array.isArray(body.parts) ? body.parts : []).filter(p => PARTS[p]);
    // Single widgets, by their position on the profile.
    const widgetIdx = (Array.isArray(body.widgets) ? body.widgets : []).map(Number).filter(i => Number.isInteger(i) && u.widgets?.[i]);
    if (!parts.length && !widgetIdx.length) fail(400, 'Pick what to remove.');
    const removed = parts.map(p => PARTS[p].label);
    if (widgetIdx.length && !parts.includes('widgets')) {
      const gone = new Set(widgetIdx);
      for (const i of gone) if (u.widgets[i].type === 'photo') removeUpload(u.widgets[i].url);
      removed.push(`${gone.size} profile widget${gone.size === 1 ? '' : 's'} (${[...gone].map(i => `“${u.widgets[i].title || u.widgets[i].type}”`).join(', ')})`);
      u.widgets = u.widgets.filter((_, i) => !gone.has(i));
    }
    for (const p of parts) PARTS[p].reset(u);
    const note = clean(body.note, 300);
    systemMessage(u.id, `🛡️ **The Zuno team removed something from your profile:** ${removed.join(', ')}.${note ? `\n\nReason: ${note}` : ''}\n\nPlease keep your profile within the Terms of Service: ${z.PUBLIC_URL}/terms.`);
    data.modLog.push({ at: Date.now(), by: me.id, action: 'profile', target: u.id, note: `Removed ${removed.join(', ')}${note ? ` — ${note}` : ''}`.slice(0, 300) });
    data.modLog = data.modLog.slice(-1000);
    save(); broadcastUser(u);
    return { user: publicUser(u) };
  });
};
