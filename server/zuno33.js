'use strict';
// Zuno 0.34: the founder's username moves from "veil" to "syl" (display name Syl), once.
// Founder, staff and always-Bloom are set by username in config.js, which now says "syl", so the
// rename happens right as the server starts, before anyone can sign in.

module.exports = function (z) {
  const { data, save } = z;
  const OLD = 'veil', NEW = z.CONFIG.FOUNDER;
  renameFounder();
  addFreefall();

  function renameFounder() {
  const old = Object.values(data.users).find(u => u.username === OLD && !u.bot && !u.system);
  if (!old || OLD === NEW) return;
  // If someone else already has the new name, they're moved aside first (and told why).
  const other = Object.values(data.users).find(u => u.username === NEW && u.id !== old.id);
  if (other) {
    let alt = NEW + '_' + other.id.slice(-4).toLowerCase(), i = 1;
    while (Object.values(data.users).some(u => u.username === alt)) alt = NEW + '_' + other.id.slice(-4).toLowerCase() + i++;
    other.pastUsernames = [...(other.pastUsernames || []), { name: other.username, until: Date.now() }];
    other.username = alt;
    z.systemMessage(other.id, `Your username was changed to **@${alt}** because **@${NEW}** is reserved for Zuno's founder. Sorry about that! You can pick a different one in Settings › My Account.`);
  }
  old.pastUsernames = [...(old.pastUsernames || []), { name: OLD, until: Date.now() }];
  old.username = NEW;
  if (!old.displayName || /^veil$/i.test(old.displayName)) old.displayName = 'Syl';
  save();
  console.log(`Renamed the founder @${OLD} to @${NEW}.`);
  }

  // "Freefall": a full-profile effect made from Syl's GIF, faded to nothing at the edges and 70%
  // see-through overall. It ships with the app and goes into Community once, already approved.
  // If staff ever remove it, it stays removed.
  function addFreefall() {
    data.creations ||= {};
    const URL = '/community/syl-freefall-2.webp'; // -2: the first one showed white where it should be see-through
    const have = Object.values(data.creations).find(c => c.seed === 'syl-freefall');
    if (have) { if (have.url !== URL) { have.url = URL; save(); } return; }
    const founder = Object.values(data.users).find(u => u.username === NEW && !u.bot && !u.system);
    if (!founder) return;
    const id = z.newId();
    data.creations[id] = { id, kind: 'effect', name: 'Freefall', url: URL, animated: true, by: founder.id, at: Date.now(), approvedAt: Date.now(), status: 'approved', seed: 'syl-freefall' };
    if (!z.badgesFor(founder).includes('artist')) {
      founder.badgeGrants = [...new Set([...(founder.badgeGrants || []), 'artist'])];
      founder.badgeRemovals = (founder.badgeRemovals || []).filter(x => x !== 'artist');
    }
    save();
    console.log('Added the Freefall profile effect to Community.');
  }
};
