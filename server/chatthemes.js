'use strict';
// Chat themes and wallpapers for DMs and group chats. Either person (or anyone in a group) picks a
// theme (colors for the bubbles and buttons) and a wallpaper (a built-in one or their own picture),
// and everyone in that chat sees it. Client side: public/zuno22.js (the theme list lives there too).

module.exports = function chatThemes(z) {
  const { route, fail, clean, data, save, send, dmConv, groupConv, sniff, storeUpload, removeUpload } = z;
  data.chatThemes ||= {}; // conversation key ("dm:<a>:<b>" or "g:<groupId>") -> { theme, wallpaper, by, at }

  // Keep these in step with CHAT_THEMES / WALLPAPERS in public/zuno22.js.
  const THEMES = ['default', 'ocean', 'sunset', 'forest', 'galaxy', 'sakura', 'lava', 'neon', 'terminal', 'lemon', 'aurora', 'dreamy', 'winter', 'love', 'coffee',
    'candy', 'grape', 'rose', 'midnight', 'mono', 'mint'];
  // 'none' = the theme's own animated scene; 'plain' = nothing behind the chat.
  const WALLPAPERS = ['none', 'plain', 'dots', 'grid', 'waves', 'stars', 'hearts', 'aurora', 'dusk', 'leaves', 'confetti'];
  const keyFor = conv => (conv.kind === 'dm' ? 'dm:' + conv.key : conv.key);

  function setTheme(me, conv, body) {
    if (conv.kind === 'dm' && !conv.peek() && !z.areFriends(me.id, conv.other.id)) fail(403, 'Say hi first, then pick a theme.');
    const cur = data.chatThemes[keyFor(conv)] || {};
    const next = { ...cur };
    if ('theme' in body) {
      if (!THEMES.includes(body.theme)) fail(400, 'Pick a theme from the list.');
      next.theme = body.theme;
    }
    if ('wallpaper' in body) {
      const w = body.wallpaper || { preset: 'none' };
      if (w.url) {
        // Only a picture you uploaded for this (see below) can be a wallpaper.
        if (!(me.wallpaperUploads || []).includes(w.url) && w.url !== cur.wallpaper?.url) fail(400, 'Upload the picture first.');
        next.wallpaper = { url: w.url, dim: Math.max(0, Math.min(80, Number(w.dim) || 0)) };
      } else {
        if (!WALLPAPERS.includes(w.preset)) fail(400, 'Pick a wallpaper from the list.');
        next.wallpaper = w.preset === 'none' ? null : { preset: w.preset };
      }
      if (cur.wallpaper?.url && cur.wallpaper.url !== next.wallpaper?.url) removeUpload(cur.wallpaper.url);
    }
    next.by = me.id; next.at = Date.now();
    data.chatThemes[keyFor(conv)] = next;
    save();
    for (const id of conv.members) send(id, 'chat-theme', { conv: conv.kind === 'dm' ? (id === me.id ? conv.other.id : me.id) : conv.key, theme: next, by: me.id });
    return { theme: next };
  }
  route('PUT', '/api/dms/:userId/theme', async ({ me, params, body }) => setTheme(me, dmConv(me, params.userId), body));
  route('PUT', '/api/groups/:id/theme', async ({ me, params, body }) => setTheme(me, groupConv(me, params.id), body));

  // Every chat theme you can see, keyed the way the app names chats (the other person's id for a
  // DM, "g:<id>" for a group).
  route('GET', '/api/chat-themes', async ({ me }) => {
    const out = {};
    for (const [k, v] of Object.entries(data.chatThemes)) {
      if (k.startsWith('dm:')) {
        const [a, b] = k.slice(3).split(':');
        if (a === me.id) out[b] = v; else if (b === me.id) out[a] = v;
      } else if (k.startsWith('g:') && data.groups[k.slice(2)]?.members.includes(me.id)) out[k] = v;
    }
    return { themes: out };
  });

  // Your own picture as a wallpaper.
  route('POST', '/api/chat-wallpaper', async ({ me, body }) => {
    z.limit('wallpaper:' + me.id, 20, 3600e3, "You've uploaded a lot of wallpapers. Try again later.");
    const k = sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Wallpapers can be PNG, JPG, WebP or GIF pictures.');
    const url = storeUpload(body, k.ext);
    me.wallpaperUploads = [...(me.wallpaperUploads || []), url].slice(-5);
    save();
    return { url };
  }, { raw: 8_000_000 });
};
