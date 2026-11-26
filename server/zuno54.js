'use strict';
// Zuno 0.54: channel mentions, text-channel flair, profile opacity and profile frames.
module.exports = function (z) {
  const { data, save, route, fail, hooks, clean } = z;
  const frames = new Set(['none', 'aurora', 'gold', 'neon', 'rose', 'ice']);
  const oneEmoji = value => {
    const text = String(value || '').trim();
    if (!text) return '';
    const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
    return parts.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(text) ? text : null;
  };

  hooks.patchMe.push((me, body) => {
    if ('profileBackgroundOpacity' in body) {
      const n = Number(body.profileBackgroundOpacity);
      if (!Number.isFinite(n) || n < 0.1 || n > 1) fail(400, 'Background opacity must be between 10% and 100%.');
      me.profileBackgroundOpacity = Math.round(n * 100) / 100;
    }
    if ('profileFrame' in body) {
      const frame = String(body.profileFrame || 'none');
      if (!frames.has(frame)) fail(400, 'Pick a valid profile frame.');
      me.profileFrame = frame === 'none' ? null : frame;
    }
  });
  hooks.publicUser.push(u => ({
    profileBackgroundOpacity: Number.isFinite(Number(u.profileBackgroundOpacity)) ? Math.max(0.1, Math.min(1, Number(u.profileBackgroundOpacity))) : 1,
    profileFrame: frames.has(u.profileFrame) && u.profileFrame !== 'none' ? u.profileFrame : null,
  }));

  // Only server members with manage_channels can set emoji flair, and only text channels accept it.
  route('PATCH', '/api/servers/:id/channel-flair', async ({ me, params, body }) => {
    const sv = z.getServer(me, params.id);
    z.need(sv, me, 'manage_channels');
    if (!Array.isArray(body.channels) || body.channels.length > 200) fail(400, 'Send a valid list of text channels.');
    const seen = new Set();
    for (const item of body.channels) {
      const id = String(item?.id || '');
      if (seen.has(id)) continue;
      seen.add(id);
      const ch = sv.channels.find(c => c.id === id && c.type === 'text');
      if (!ch) fail(400, 'Flair can only be set on text channels in this server.');
      const emoji = oneEmoji(item.emoji);
      if (emoji === null) fail(400, 'Use one emoji per channel.');
      if (emoji) ch.flair = emoji; else delete ch.flair;
    }
    save();
    z.refreshServer(sv);
    return { channels: sv.channels.filter(c => c.type === 'text').map(c => ({ id: c.id, flair: c.flair || '' })) };
  });
};
