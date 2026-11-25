'use strict';
// Zuno 0.50: #official-links in Zuno Official, one message from Zuno with every link people need.
// The channel is made once (announcement style: only the team can post). The message is kept up to
// date: when the list below changes in an update, Zuno edits its message instead of posting again.

module.exports = function (z) {
  const { data, save, newId } = z;
  const linksText = sv => {
    const base = (process.env.ZUNO_PUBLIC_URL || 'https://heyzuno.uk').replace(/\/$/, '');
    return [
      '# 🔗 Official Zuno links',
      'Everything official, in one place. If a link isn\'t here, it isn\'t from Zuno.',
      '',
      `**🌐 Zuno:** ${base}`,
      `**💻 Zuno for PC:** ${base}/download/`,
      `**📶 Is Zuno up?** ${base}/status`,
      `**🤖 Make a bot:** ${base}/developers`,
      `**📜 Terms of Service:** ${base}/terms`,
      `**🔒 Privacy Policy:** ${base}/privacy`,
      `**🛡️ Report a security problem:** ${base}/security`,
      '**🧑‍💻 Zuno is open source:** https://github.com/pawsdarter-spec/zuno-open',
      sv.invite ? `**📨 Invite friends to Zuno Official:** zuno.invite/${sv.invite}` : '',
      '',
      '-# Found a bug? Settings › Report a Bug. Zuno and the Zuno team will never ask for your password or a login code.',
    ].filter(l => l !== '').join('\n').replace('\n**🌐', '\n\n**🌐').replace('\n-#', '\n\n-#');
  };
  const isLinks = ch => ch?.type === 'text' && /^official-?links$/i.test(String(ch.name || ''));

  setTimeout(() => {
    try {
      const sv = z.officialServer?.();
      if (!sv) return;
      let ch = sv.channels.find(isLinks);
      if (!ch) {
        ch = { id: newId(), name: 'official-links', type: 'text', readOnly: true, topic: 'Every official Zuno link in one place.' };
        // At the very top of the first category, where people look first.
        const first = sv.channels.find(c => c.type === 'text');
        if (first?.categoryId) ch.categoryId = first.categoryId;
        const at = sv.channels.indexOf(first);
        sv.channels.splice(at < 0 ? 0 : at, 0, ch);
        console.log('Made #official-links in Zuno Official.');
      }
      const conv = z.channelConvFor(sv, ch);
      const text = linksText(sv);
      const st = data.channelMessages?.[ch.id];
      const old = sv.officialLinksMsg && st?.messages?.find(m => m.id === sv.officialLinksMsg);
      if (old) {
        if (old.content !== text) {
          const i = st.messages.indexOf(old);
          const message = st.messages[i] = { ...old, content: text, noEmbed: true, editedAt: Date.now() };
          z.emit(conv, 'message-update', { message });
        }
      } else {
        const m = z.postMessage(conv, data.users.zuno, text, {});
        const list = data.channelMessages?.[ch.id]?.messages || [];
        const mine = list.find(x => x.id === m?.id) || list[list.length - 1];
        if (mine) { mine.noEmbed = true; sv.officialLinksMsg = mine.id; }
      }
      save();
      z.refreshServer?.(sv);
    } catch (e) { console.error('official links:', e.message); }
  }, 2200);
};
