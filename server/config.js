'use strict';
// ============================================================================================
//  Zuno settings you're most likely to want to change, all in one place.
//
//  Change a value, restart the server (npm start), done. Anything secret (API keys, passwords)
//  does NOT go here: those are environment variables, listed in docs/DEVELOPING.md.
//  Other tunables live next to the code that uses them; docs/DEVELOPING.md has a map.
// ============================================================================================

const MB = 1_000_000;

module.exports = {
  // ---- People ----
  // The founder: has the final say over every other staff member and hears about staff actions.
  FOUNDER: 'syl',
  // Zuno Staff by username (more can be added with the ZUNO_STAFF environment variable,
  // e.g. ZUNO_STAFF=alice,bob). These names can't be signed up for by anyone else.
  STAFF: ['syl'],
  // Usernames nobody can sign up with.
  RESERVED_USERNAMES: ['zuno', 'testing', 'veil'],
  // How long someone banned from Zuno has to send an appeal before their login is wiped.
  APPEAL_DAYS: 14,
  // Log a device out after this many days without using it.
  SESSION_IDLE_DAYS: 60,

  // ---- Zuno Bloom (the subscription) ----
  BLOOM_PRICE: '$5',
  // Accounts that always have Bloom, by username (no payment needed, never runs out).
  ALWAYS_BLOOM: ['syl'],
  // What everyone gets, and what Bloom raises it to. Sizes are in bytes.
  PERKS: {
    free: { upload: 10 * MB, files: 4, message: 2000, bio: 190, banner: 4 * MB, background: 8 * MB, sound: 3 * MB, avatar: 1 * MB, animatedAvatar: true, theme: true, hdScreen: false },
    bloom: { upload: 50 * MB, files: 10, message: 4000, bio: 400, banner: 10 * MB, background: 25 * MB, sound: 8 * MB, avatar: 1 * MB, animatedAvatar: true, theme: true, hdScreen: true },
  },

  // ---- Profiles ----
  // Biggest GIF someone can pick as their avatar with "Choose A Gif".
  GIF_AVATAR_MAX: 6 * MB,
  // Words that aren't allowed in names: see server/namefilter.js. The AI name judge's rules: server/aimod.js.
};
