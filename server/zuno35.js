'use strict';
// Zuno 0.35

module.exports = function (z) {
  const { data, save, route, fail, hooks } = z;

  // ======================= #suggestions in Zuno Official =======================
  // Set up once as a proper suggestions board: guidelines, tags (the status ones are staff-only),
  // a post template, and voting. Only empty settings get filled, and it never runs again, so
  // everything stays editable from ⚙ Tags & guidelines.
  setTimeout(() => {
    const sv = z.officialServer?.();
    const ch = sv?.channels.find(c => c.type === 'text' && /^suggestions?$/i.test(c.name.replace(/[^a-z]/gi, '')));
    if (!ch || ch.suggestionsSetUp) return;
    if (!ch.layout) ch.layout = 'forum';
    if (!ch.topic) ch.topic = 'Ideas to make Zuno better. Vote with 👍 / 👎, and the team picks from the top.';
    if (!ch.guidelines) ch.guidelines = [
      '💡 **How suggestions work**',
      '1. **Search first.** If it\'s already been suggested, vote 👍 on that post and add your thoughts there.',
      '2. **One idea per post**, with a clear title (like "Pin messages in DMs").',
      '3. **Say why.** What would it fix, and who would use it? Screenshots or mockups help a lot.',
      '4. **Vote with 👍 / 👎.** The most upvoted ideas get looked at first.',
      '5. **Keep it kind.** Disagree with the idea, not the person. No spam, vote begging or bumping.',
      '6. **Bugs go to Settings › Report a Bug**, where they get fixed faster. Private ideas: Settings › Suggestions.',
      '',
      '🛡️ The team sets a status on each post: 👀 Reviewing, 📅 Planned, ✅ Added, ❌ Declined or 🔁 Duplicate.',
    ].join('\n');
    if (!ch.forumTags?.length) {
      const id = () => z.newId().slice(-8);
      ch.forumTags = [
        { id: id(), name: 'Feature', emoji: '✨' }, { id: id(), name: 'Design', emoji: '🎨' }, { id: id(), name: 'Mobile', emoji: '📱' },
        { id: id(), name: 'Profiles', emoji: '🪪' }, { id: id(), name: 'Servers', emoji: '🏠' }, { id: id(), name: 'Calls & Games', emoji: '🎮' },
        { id: id(), name: 'Bots', emoji: '🤖' }, { id: id(), name: 'Safety', emoji: '🛡️' }, { id: id(), name: 'Other', emoji: '💭' },
        { id: id(), name: 'Reviewing', emoji: '👀', mod: true }, { id: id(), name: 'Planned', emoji: '📅', mod: true }, { id: id(), name: 'Added', emoji: '✅', mod: true },
        { id: id(), name: 'Declined', emoji: '❌', mod: true }, { id: id(), name: 'Duplicate', emoji: '🔁', mod: true },
      ];
      ch.requireTag = true;
    }
    if (!ch.postTemplate) ch.postTemplate = "**What's the idea?**\n\n\n**Why would it help?**\n\n\n**Anything else?** (screenshots, examples)\n";
    ch.voting = true;
    ch.suggestionsSetUp = true;
    save();
    z.refreshServer?.(sv);
    console.log('Set up #' + ch.name + ' in Zuno Official as a suggestions forum.');
  }, 1500);

  // ======================= your name color in servers =======================
  // In servers your highest colored role decides your name color. If you'd rather everyone sees
  // your own name color (or name style) there instead, turn this on: it's what others see, not
  // just you (the "Show role colors" setting only changes what you see).
  hooks.publicUser.push(u => (u.keepOwnColor ? { keepOwnColor: true } : {}));
  route('PATCH', '/api/me/own-color', async ({ me, body }) => {
    me.keepOwnColor = !!body.on || undefined;
    save();
    z.broadcastUser(me);
    return { keepOwnColor: !!me.keepOwnColor };
  });
};
