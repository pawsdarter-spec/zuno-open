// Zuno server: accounts, friends, direct messages, servers & channels, profiles, calls.
// Uses only Node's built-in modules, so there is nothing to install.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { data, save, flush, DATA_DIR } = require('./db');
const CONFIG = require('./config'); // the settings most people want to change (server/config.js)
data.servers ||= {};          // id -> { id, name, ownerId, iconColor, icon, members: [ids], channels: [{ id, name, type }], invite }
data.channelMessages ||= {};  // channelId -> { messages: [] }

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ACCENTS = ['mint', 'lagoon', 'grape', 'coral', 'sunny'];
const PREF_BOOLS = ['profileSounds', 'autoplaySounds', 'animatedBackgrounds', 'animatedBanners', 'reduceMotion',
  'desktopNotifications', 'notificationSound', 'sendTyping', 'showTyping', 'enterToSend', 'filterSpam'];
const PREF_DEFAULTS = {
  profileSounds: true, autoplaySounds: true, soundVolume: 60, animatedBackgrounds: true, animatedBanners: true,
  accent: 'mint', density: 'cozy', chatFontSize: 15, reduceMotion: false,
  desktopNotifications: true, notificationSound: true,
  sendTyping: true, showTyping: true, enterToSend: true,
  dmRequests: 'servers', filterSpam: true, // who can send message requests: everyone | servers | friends
};

const PORT = Number(process.env.PORT) || 3000;
const PKG = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')); } catch { return {}; } })();
const SERVER_VERSION = PKG.version || '0';
// Desktop apps older than this must update before they can use Zuno (keeps everyone together).
const MIN_DESKTOP = PKG.zunoMinDesktop || '0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------- hooks (server/features.js plugs into these) ----------
const hooks = { callDone: [], friend: [], posted: [], roomChange: [], rtcState: [], onEdit: [], onDelete: [], newSession: [], patchPrefs: [], beforeEdit: [], attachmentView: [], beforePost: [], afterPost: [], onJoin: [], onLeave: [], onReact: [], onRegister: [], publicUser: [], serverSummary: [], channelPerms: [], patchMe: [], patchServer: [], meExtras: [], groupView: null, login: [], rawRoutes: [], ringtone: null, onRead: [], dmExtras: [], canUseFlair: null, giftDelivered: [], canReadAttachment: [], autoBadges: [] };

// ---------- helpers ----------
const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const dmKey = (a, b) => [a, b].sort().join(':');
// Names people pick (usernames, display names, server names...) go through the name filter
// (server/namefilter.js). Hands the name back, or stops the request with a friendly error.
// Everything typed has invisible characters taken out; names also get fancy letters made plain.
const { badName, badUsername, NAME_ERROR, stripInvisible, plainName } = require('./namefilter');
const clean = (v, max) => stripInvisible(String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '')).trim().slice(0, max);
const cleanName = (v, max) => plainName(clean(v, max * 2)).slice(0, max);
const checkName = name => { name = name && plainName(name); if (name && badName(name)) fail(400, NAME_ERROR); return name; };
const aimod = require('./aimod');
// Profile text gets the word filter, then the AI judge (aimod.js) for what a word list misses.
// fields: { bio: 'text', 'display name': 'text', ... }. Pass only text that changed.
async function judgeText(fields) {
  for (const [field, t] of Object.entries(fields)) if (t && badName(t)) fail(400, field === 'username' || field === 'display name' ? NAME_ERROR : `That ${field} isn't allowed on Zuno. Please change it.`);
  const bad = await aimod.judge(fields);
  if (bad) fail(400, aimod.message(bad));
}
// ---------- Cloudflare Turnstile (the "are you human?" check on sign-up) ----------
// Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY (see docs/TURNSTILE_SETUP.md) and every new account
// needs a passing check, verified here with Cloudflare. Without the keys sign-ups work as before;
// set ZUNO_REQUIRE_TURNSTILE=1 to refuse sign-ups until the keys are in place instead.
// TURNSTILE_HOSTNAME (optional) also checks the token was made on your site.
const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const TURNSTILE_HOSTNAME = String(process.env.TURNSTILE_HOSTNAME || '').trim().toLowerCase();
const turnstileOn = () => !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
async function verifyTurnstile(token, req) {
  if (!turnstileOn()) {
    if (process.env.ZUNO_REQUIRE_TURNSTILE === '1') fail(503, 'Account verification is not set up yet. Please try again later.');
    return;
  }
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) fail(400, 'Please complete the bot verification before creating an account.');
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token.trim(), remoteip: clientIp(req) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Turnstile returned HTTP ${response.status}`);
    result = await response.json();
  } catch (err) {
    console.error('Turnstile verification request failed:', err.message);
    fail(503, 'Bot verification is temporarily unavailable. Please try again.');
  }
  if (!result?.success) fail(400, 'Bot verification failed. Please try again.');
  if (result.action !== 'register') fail(400, 'Bot verification did not match this action. Please try again.');
  if (TURNSTILE_HOSTNAME && String(result.hostname || '').toLowerCase() !== TURNSTILE_HOSTNAME) fail(400, 'Bot verification hostname did not match. Please try again.');
}

const USERNAME_RE = /^[a-z0-9_.]{2,32}$/;
const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const BANNER_COLORS = ['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#9b59b6', '#1abc9c', '#e67e22'];

// Hashing a password takes real work on purpose (so stolen hashes are slow to crack). It runs on
// Node's background threads, so a burst of logins never freezes chat for everyone else.
const scrypt = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
// The shortest password a new account (or a password change) can use. Older, shorter passwords still log in.
const MIN_PASSWORD = 8;
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(pw, salt)).toString('hex');
  return `${salt}:${hash}`;
}
async function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = await scrypt(pw, salt);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
// Used when a login names nobody, so "no such account" takes as long as "wrong password" and
// can't be used to find out which usernames exist.
const DUMMY_HASH = '00000000000000000000000000000000:' + '0'.repeat(128);

// ---------- the official Zuno account ----------
// Everyone gets a DM from Zuno: a welcome message, then a post for each new version.
// Nobody can reply to it, friend it, or log in as it.
const SYSTEM_ID = 'zuno';
const isSystem = id => id === SYSTEM_ID;
function ensureSystemUser() {
  data.users[SYSTEM_ID] = {
    ...(data.users[SYSTEM_ID] || {}),
    id: SYSTEM_ID, username: 'zuno', displayName: 'Zuno', system: true,
    email: null, passwordHash: null,
    avatar: '/logo.png', bannerColor: '#04c5ae', profileBanner: null, profileBackground: null, profileSound: null,
    bio: 'Hi! I\'m Zuno. I post updates and tips here. You can\'t reply to me, but I\'ll always say hi.',
    pronouns: '', customStatus: 'Here to help',
    status: 'online', createdAt: data.users[SYSTEM_ID]?.createdAt || Date.now(), lastRead: {},
  };
}
function systemMessage(userId, content) {
  const key = dmKey(userId, SYSTEM_ID);
  const dm = data.dms[key] ||= { messages: [] };
  const message = { id: newId(), authorId: SYSTEM_ID, content, createdAt: Date.now() };
  dm.messages.push(message);
  send(userId, 'message', { conv: SYSTEM_ID, peerId: SYSTEM_ID, message, author: publicUser(data.users[SYSTEM_ID]) });
  return message;
}
function welcomeText(u) {
  return [
    `Welcome to Zuno, **${u.displayName}**! I'm Zuno, and I'm so glad you're here.`,
    'A few things to try first:',
    '**Add your friends.** Open Friends, then Add Friend, and type their username.',
    '**Make your profile yours.** Settings, then Profiles: add a banner, a moving background and a profile sound that plays when people open your profile.',
    '**Make Zuno feel right.** Settings has an accent color, chat text size, notification sounds and more.',
    "I'll post here whenever Zuno gets an update. You can't reply to me, but I'll always say hi.",
  ].join('\n\n');
}
function welcome(u) {
  if (u.welcomed || u.system) return;
  u.welcomed = true;
  systemMessage(u.id, welcomeText(u));
}
// Post the notes from public/whats-new.json once per version.
function announceUpdate() {
  let notes;
  try { notes = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'whats-new.json'), 'utf8')); } catch { return; }
  if (!notes?.version) return;
  data.meta ||= {};
  if (data.meta.announced === notes.version) return;
  // A small fix that reuses the last notes doesn't send them again.
  const key = JSON.stringify([notes.title, notes.items]);
  if (data.meta.announcedKey === key) { data.meta.announced = notes.version; save(); return; }
  data.meta.announcedKey = key;
  const text = [`**Zuno ${notes.version} is here: ${notes.title}**`, ...notes.items.map(i => `• ${i}`)].join('\n');
  for (const u of Object.values(data.users)) {
    if (u.system || u.bot) continue;
    if (!u.welcomed) { welcome(u); continue; } // new to the Zuno DM: the welcome covers it
    systemMessage(u.id, text);
  }
  data.meta.announced = notes.version;
  save();
}

// ---------- the Testing bot ----------
// A helper account for trying Zuno alone: it accepts every friend request and replies "test".
const BOT_ID = 'testing';
const isBot = id => id === BOT_ID;
function ensureBotUser() {
  data.users[BOT_ID] = {
    ...(data.users[BOT_ID] || {}),
    id: BOT_ID, username: 'testing', displayName: 'Testing', bot: true,
    email: null, passwordHash: null, avatar: null, bannerColor: '#f0b232',
    bio: 'I accept every friend request and answer every message with "test". Handy for trying things out.',
    pronouns: 'it/its', customStatus: 'Testing, testing…',
    status: 'online', createdAt: data.users[BOT_ID]?.createdAt || Date.now(), lastRead: {}, welcomed: true,
  };
}
function botReply(conv) {
  const bot = data.users[BOT_ID];
  setTimeout(() => emitTyping(conv, bot), 400);
  setTimeout(() => postMessage(conv, bot, 'test'), 1400);
}

// ---------- profile badges ----------
// OG Supporter: everyone who joined in Zuno's early days (before ZUNO_OG_UNTIL).
// Zuno Staff: usernames listed in ZUNO_STAFF (set on the server), plus anyone staff gives it to.
const BADGES = ['zuno_manager', 'staff', 'creator_star', 'creator', 'bloom_early', 'bloom_month', 'bloom', 'gifter', 'bughunter_veteran', 'bughunter_senior', 'bughunter', 'art_manager', 'artist_talented', 'artist_senior', 'artist', 'og', 'founder', 'botdev', 'chatterbox', 'social', 'voice'];
const BADGE_RULES = { chatterbox: 500, social: 10, voiceHours: 10, seniorBugs: 5, veteranBugs: 15 }; // messages sent, friends, hours in voice, confirmed bug reports
const OG_UNTIL = Date.parse(process.env.ZUNO_OG_UNTIL || '2027-01-01T00:00:00Z');
// "syl" (once "veil") is Zuno's founder. More staff can be added with ZUNO_STAFF, or given the badge in the app.
const STAFF_NAMES = new Set([...CONFIG.STAFF, ...(process.env.ZUNO_STAFF || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)]);
// (0.53) Finding someone by username used to walk every account (for every @mention, friend
// request…). A small index answers straight away; it's rebuilt when the number of accounts changes
// or a lookup doesn't match (someone renamed).
let nameIndex = new Map(), nameIndexSize = -1, nameIndexAt = 0;
function userByName(name) {
  name = String(name || '').toLowerCase();
  const n = Object.keys(data.users).length;
  const fresh = () => { nameIndex = new Map(); for (const u of Object.values(data.users)) if (u?.username && !nameIndex.has(u.username)) nameIndex.set(u.username, u); nameIndexSize = n; nameIndexAt = Date.now(); };
  if (nameIndexSize !== n) fresh();
  let u = nameIndex.get(name);
  // A stale entry (renamed or removed) always refreshes; a plain miss at most every 2 seconds, so
  // words like @everyone don't rebuild it on every message.
  if (u && (u.username !== name || data.users[u.id] !== u)) { fresh(); u = nameIndex.get(name); }
  else if (!u && Date.now() - nameIndexAt > 2000) { fresh(); u = nameIndex.get(name); }
  return u && u.username === name ? u : null;
}
function isStaff(u) {
  if (!u) return false;
  if (u.system || STAFF_NAMES.has(u.username)) return true;
  const g = u.badgeGrants || [], r = u.badgeRemovals || [];
  return (g.includes('staff') && !r.includes('staff')) || (g.includes('zuno_manager') && !r.includes('zuno_manager'));
}
// Zuno Manager (0.44): staff in red, above the other staff. They can take away staff badges and
// remove staff members' things, like the founder can.
const isManager = u => !!u && ((u.badgeGrants || []).includes('zuno_manager') && !(u.badgeRemovals || []).includes('zuno_manager'));
const overStaff = me => isFounder(me.id) || isManager(me);
function badgesFor(u) {
  if (u.bot) return [];
  const auto = new Set();
  if (isStaff(u)) auto.add('staff');
  if (!u.system && u.createdAt < OG_UNTIL) auto.add('og');
  if (!u.system) {
    if (Object.values(data.servers).some(sv => sv.ownerId === u.id)) auto.add('founder');
    if ((u.stats?.messages || 0) >= BADGE_RULES.chatterbox) auto.add('chatterbox');
    if (friendIds(u.id).length >= BADGE_RULES.social) auto.add('social');
    if ((u.stats?.voiceMs || 0) >= BADGE_RULES.voiceHours * 3600e3) auto.add('voice');
    if ((u.bugsConfirmed || 0) >= BADGE_RULES.seniorBugs) auto.add('bughunter_senior');
    if ((u.bugsConfirmed || 0) >= BADGE_RULES.veteranBugs) auto.add('bughunter_veteran');
  }
  const tier = bloomTier(u);
  if (tier) auto.add(tier);
  // Early Bloom is a thank-you for supporting Zuno early, not Bloom itself: while they also have
  // Bloom right now, their current Bloom badge shows next to it.
  if (tier === 'bloom_early' && hasBloom(u)) auto.add(Date.now() - (u.bloom.streakStart || Date.now()) >= MONTH ? 'bloom_month' : 'bloom');
  for (const b of u.badgeGrants || []) if (!b.startsWith('bloom')) auto.add(b);
  if (!u.system) for (const fn of hooks.autoBadges) for (const b of fn(u) || []) auto.add(b);
  for (const b of u.badgeRemovals || []) if (!(b === 'staff' && STAFF_NAMES.has(u.username))) auto.delete(b);
  if (auto.has('bughunter_veteran')) auto.delete('bughunter_senior'); // each tier replaces the one before it
  if (auto.has('bughunter_senior') || auto.has('bughunter_veteran')) auto.delete('bughunter');
  if (auto.has('zuno_manager')) auto.delete('staff'); // the red Manager badge replaces the plain Staff one
  if (auto.has('art_manager')) { auto.delete('artist'); auto.delete('artist_senior'); }
  if (auto.has('artist_senior')) auto.delete('artist'); // the senior one replaces the first one // the golden one replaces the purple one
  return BADGES.filter(b => auto.has(b));
}

// ---------- Zuno Bloom (the $5/month subscription) ----------
// Paid through Stripe. Staff can also gift Bloom (handy for testing and giveaways).
const BLOOM_PRICE = CONFIG.BLOOM_PRICE;
const BLOOM_LAUNCH = Date.parse(process.env.ZUNO_BLOOM_LAUNCH || '2026-10-16T00:00:00Z');
const BLOOM_EARLY_UNTIL = (() => { const d = new Date(BLOOM_LAUNCH); d.setUTCMonth(d.getUTCMonth() + 6); return d.getTime(); })();
const MONTH = 30 * 24 * 3600e3;
const PERKS = CONFIG.PERKS; // upload sizes, message length and more: set in server/config.js
const BLOOM_ACCENTS = ['sakura', 'orchid', 'aurora'];
const bloomUntil = u => Math.max(u?.bloom?.paidUntil || 0, u?.bloom?.giftUntil || 0);
const hasBloom = u => !!u && !u.system && !u.bot && bloomUntil(u) > Date.now();
const perksFor = u => (hasBloom(u) ? PERKS.bloom : PERKS.free);
// Early Bloom (rainbow, permanent): first bought in Bloom's first 6 months. Full Bloom (purple): a month or more in a row. Otherwise the new-Bloom badge (teal).
function bloomTier(u) {
  if (!u || u.system || u.bot) return null;
  // Early Bloom is for keeps: it stays even after Bloom ends.
  if (u.bloom?.firstPaidAt && u.bloom.firstPaidAt < BLOOM_EARLY_UNTIL) return 'bloom_early';
  if (!hasBloom(u)) return null;
  if (Date.now() - (u.bloom.streakStart || Date.now()) >= MONTH) return 'bloom_month';
  return 'bloom';
}
function bloomStatus(u) {
  const b = u.bloom || {};
  return {
    active: hasBloom(u), tier: bloomTier(u), until: bloomUntil(u) || null, since: hasBloom(u) ? b.streakStart || null : null,
    paid: (b.paidUntil || 0) > Date.now(), gifted: (b.giftUntil || 0) > Date.now() && !((b.paidUntil || 0) > Date.now()),
    cancelAtEnd: !!b.cancelAtEnd, canManage: !!b.customerId,
  };
}
// Call before changing someone's Bloom time, then pass what it returns to afterBloomChange.
const bloomBefore = u => hasBloom(u);
function afterBloomChange(u, wasActive, { paid = false } = {}) {
  u.bloom ||= {};
  const now = hasBloom(u);
  if (now && !wasActive) {
    u.bloom.streakStart = Date.now();
    if (paid && !u.bloom.firstPaidAt) u.bloom.firstPaidAt = Date.now();
    systemMessage(u.id, `🌸 **Welcome to Zuno Bloom!**\n\nYour perks are on now: files up to 50 MB, longer messages, HD screen share, bigger profile media, and 2 Server Blooms to give your favorite servers (right-click a server › Bloom This Server).\n\nYour Bloom badge grows the longer you keep Bloom. Thank you for supporting Zuno! 💜`);
  } else if (paid && !u.bloom.firstPaidAt) u.bloom.firstPaidAt = Date.now();
  save();
  broadcastUser(u);
  send(u.id, 'me', privateMe(u));
}

// ---------- live connections (Server-Sent Events) ----------
const streams = new Map(); // userId -> Set<response>

function isOnline(id) { return streams.has(id) && streams.get(id).size > 0; }
function effectiveStatus(u) {
  if (u.system || u.id === BOT_ID || u.webhook || u.app?.builtin) return 'online';
  if (u.bot) return isOnline(u.id) || u.app?.rules?.some(r => r.enabled !== false) ? 'online' : 'offline'; // Bot Builder bots run on Zuno
  if (!isOnline(u.id) || u.status === 'invisible') return 'offline';
  return u.status || 'online';
}
// (0.45) One request often shows the same person many times (every server you share, every
// friend list). Their public card is worked out once per moment and reused; anything that changes
// a user clears it (saving, or telling people about the change).
let publicCache = new Map();
let publicCacheQueued = false;
function clearPublicCache() { if (publicCache.size) publicCache = new Map(); }
function publicUser(u) {
  if (!u) return null;
  const hit = publicCache.get(u);
  if (hit) return { ...hit };
  const card = publicUserFresh(u);
  publicCache.set(u, card);
  if (!publicCacheQueued) { publicCacheQueued = true; queueMicrotask(() => { publicCacheQueued = false; clearPublicCache(); }); }
  return { ...card };
}
function publicUserFresh(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    bannerColor: u.bannerColor,
    bio: u.bio,
    pronouns: u.pronouns,
    customStatus: u.customStatus,
    profileSound: u.profileSound || null,
    profileSoundName: u.profileSoundName || '',
    profileSoundOnce: !!u.profileSoundOnce, // play the sound once instead of looping
    profileBackground: u.profileBackground || null, // { url, type: 'video' | 'gif' }
    profileBanner: u.profileBanner || null,         // { url, type: 'image' | 'gif' }
    status: effectiveStatus(u),
    createdAt: u.createdAt,
    system: !!u.system,
    bot: !!u.bot,
    webhook: !!u.webhook,
    app: u.app && !u.app.deleted ? { public: !!u.app.public, ownerId: u.app.ownerId } : undefined,
    badges: badgesFor(u),
    bloom: hasBloom(u),
    nameColor: u.nameColor || null,
    profileTheme: u.profileTheme || null,
    ...hooks.publicUser.reduce((o, fn) => Object.assign(o, fn(u)), {}),
  };
}
// Only ever sent to the account owner: includes their email.
function privateMe(u) {
  const prefs = { ...PREF_DEFAULTS, ...(u.prefs || {}) };
  return { ...publicUser(u), statusPref: u.status, email: u.email || '', prefs, isStaff: isStaff(u), inboxCount: (u.inbox || []).length, suspendedUntil: isSuspended(u) ? u.suspendedUntil : null, bloomInfo: bloomStatus(u), limits: perksFor(u), favGifs: u.favGifs || [], blocked: u.blocked || [], ban: banView(u), isFounder: u.username === CONFIG.FOUNDER };
}
// What a banned person sees about their ban (and their appeal).
function banView(u) {
  if (!u.banned || u.banned.restored) return null;
  const b = u.banned;
  return { at: b.at, reason: b.reason || '', appealUntil: b.appealUntil, canAppeal: !b.appeal && !b.purged && b.appealUntil > Date.now(), appeal: b.appeal ? { text: b.appeal.text, at: b.appeal.at, status: b.appeal.status, note: b.appeal.note || '' } : null };
}
function areFriends(a, b) {
  return data.friendships.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
function friendIds(id) {
  return data.friendships.filter(f => f.includes(id)).map(([x, y]) => (x === id ? y : x));
}
// (0.45) The last couple of minutes of live events are kept for each person (numbered), so a
// dropped connection that comes back picks up exactly what it missed instead of reloading everything.
const REPLAY_MS = 120e3, REPLAY_MAX = 400, REPLAY_BYTES = 512 * 1024;
const replay = new Map(); // userId -> { seq, items: [{ seq, at, chunk }], bytes }
function remember(userId, event, data) {
  let r = replay.get(userId);
  if (!r) replay.set(userId, (r = { seq: 0, items: [], bytes: 0 }));
  const seq = ++r.seq;
  const chunk = `id: ${seq}\nevent: ${event}\ndata: ${data}\n\n`;
  r.items.push({ seq, at: Date.now(), chunk });
  r.bytes += chunk.length;
  const old = Date.now() - REPLAY_MS;
  while (r.items.length && (r.items.length > REPLAY_MAX || r.bytes > REPLAY_BYTES || r.items[0].at < old)) r.bytes -= r.items.shift().chunk.length;
  return chunk;
}
setInterval(() => { const old = Date.now() - REPLAY_MS; for (const [uid, r] of replay) if (!streams.has(uid) && (!r.items.length || r.items[r.items.length - 1].at < old)) replay.delete(uid); }, 60e3).unref();
function send(userId, event, payload) {
  const set = streams.get(userId);
  const data = JSON.stringify(payload);
  const r = replay.get(userId);
  if (!set) {
    // Gone for more than two minutes: stop keeping their events (the app reloads when it's back).
    if (r) { r.off ||= Date.now(); if (Date.now() - r.off > REPLAY_MS) replay.delete(userId); else remember(userId, event, data); }
    return;
  }
  if (r) r.off = 0;
  const chunk = remember(userId, event, data);
  for (const res of set) streamWrite(res, chunk);
}
// A live connection that has stopped reading (a frozen tab, a dead phone connection that never
// closed) would make the server hold every update meant for it in memory. Past 2 MB of unsent
// updates the connection is dropped; the app reconnects by itself and catches up.
const STREAM_BACKLOG = 2 * 1024 * 1024;
function streamWrite(res, chunk) {
  if (res.destroyed || res.writableEnded) return;
  if (res.writableLength > STREAM_BACKLOG) { try { res.destroy(); } catch {} return; }
  try { res.write(chunk); } catch {}
}
// Everyone who shares a server with this user.
// (0.45) Who is in which server, kept up to date by checking each server's member list cheaply
// (a server whose list changed is re-read; the rest are reused).
const memberIndex = new Map(); // serverId -> { list, len, set }
function serverMembersSet(sv) {
  let e = memberIndex.get(sv.id);
  const list = sv.members || [];
  if (!e || e.list !== list || e.len !== list.length || e.first !== list[0] || e.last !== list[list.length - 1]) {
    e = { list, len: list.length, first: list[0], last: list[list.length - 1], set: new Set(list) };
    memberIndex.set(sv.id, e);
  }
  return e.set;
}
function serverMates(id) {
  const out = new Set();
  for (const sv of Object.values(data.servers)) { const set = serverMembersSet(sv); if (set.has(id)) for (const m of set) if (m !== id) out.add(m); }
  if (memberIndex.size > Object.keys(data.servers).length + 50) for (const k of memberIndex.keys()) if (!data.servers[k]) memberIndex.delete(k);
  return out;
}
// Tell a user, their friends and their server-mates that their public profile changed.
function broadcastUser(u) {
  clearPublicCache();
  const pu = publicUser(u);
  send(u.id, 'user', pu);
  for (const f of new Set([...friendIds(u.id), ...serverMates(u.id)])) send(f, 'user', pu);
}
// (0.45) Pending friend requests as "from>to" pairs, rebuilt only when the list changes.
let requestPairsCache = { keys: '', set: new Set() };
function requestPairs() {
  const ids = Object.keys(data.friendRequests);
  const keys = ids.length + ':' + (ids[0] || '') + ':' + (ids[ids.length - 1] || '');
  if (keys !== requestPairsCache.keys || requestPairsCache.count !== ids.length) {
    const set = new Set();
    for (const r of Object.values(data.friendRequests)) set.add(r.from + '>' + r.to);
    requestPairsCache = { keys, count: ids.length, set };
  }
  return requestPairsCache.set;
}
function relationship(meId, otherId) {
  if (meId === otherId) return 'self';
  if (isSystem(otherId)) return 'system';
  if (areFriends(meId, otherId)) return 'friend';
  const pair = requestPairs();
  if (pair.has(meId + '>' + otherId)) return 'outgoing';
  if (pair.has(otherId + '>' + meId)) return 'incoming';
  return 'none';
}

// ---------- rate limits (keeps spam and password guessing in check once Zuno is online) ----------
const buckets = new Map(); // key -> { count, resetAt }
// (0.43.1) Big changes (deleting a server, giving it away, removing a passkey) need your password
// again within the last 10 minutes, even when you're logged in.
const REAUTH_MSG = "Confirm it's you to do that.";
// (0.53) The founder confirms with their password only, and it lasts an hour (moderation work
// shouldn't ask again every few minutes).
function needReauth(key) { const s = key && data.sessions[key]; const uid = typeof s === 'string' ? s : s?.uid; const ttl = uid && isFounder(uid) ? 60 * 60e3 : 10 * 60e3; if (!s || Date.now() - (s.reauthAt || 0) > ttl) fail(403, REAUTH_MSG); }
function limit(key, max, windowMs, message = 'Slow down a little and try again in a moment.') {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
  if (++b.count > max) fail(429, message);
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k); }, 60000).unref();
// Someone's real address, for speed limits, login alerts and the device map. On Render, Zuno sits
// behind Cloudflare, which sets CF-Connecting-IP itself and refuses requests that try to fake it.
// X-Forwarded-For can't be trusted on its own: anyone can put anything at the start of it.
function clientIp(req) {
  if (process.env.RENDER) {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf;
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
    if (hops.length >= 2) return hops[hops.length - 2]; // [... what the client sent, the client, Cloudflare]
  }
  if (process.env.ZUNO_TRUST_XFF === '1') return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  return req.socket.remoteAddress || '?';
}
// Route-level limits: [method, path pattern, max, window, who]
const LIMITS = [
  ['POST', /^\/api\/register$/, 5, 10 * 60e3, 'ip', 'Too many new accounts from here. Try again later.'],
  ['POST', /^\/api\/login$/, 10, 5 * 60e3, 'ip', 'Too many login attempts. Wait a few minutes and try again.'],
  ['POST', /\/messages$/, 25, 10e3, 'user', "You're sending messages too fast."],
  ['POST', /\/react$/, 40, 10e3, 'user', "You're reacting too fast."],
  ['POST', /^\/api\/friends\/requests$/, 20, 60e3, 'user', "You're sending friend requests too fast."],
  ['POST', /^\/api\/servers$/, 5, 10 * 60e3, 'user', "You're making servers too fast."],
  ['POST', /^\/api\/me\/(sound|background|banner)$|\/icon$/, 10, 60e3, 'user', "You're uploading too fast."],
  ['POST', /^\/api\/attachments$/, 20, 60e3, 'user', "You're uploading too fast."],
  ['POST', /^\/api\/reports$/, 10, 60 * 60e3, 'user', "You've sent a lot of reports. The Zuno team will get to them soon."],
];
function checkLimits(req, pathname, me) {
  // An overall ceiling on top of the per-action limits, so one person or script can't flood the API.
  if (!me) limit('api-ip:' + clientIp(req), 300, 60e3, 'Too many requests. Wait a minute and try again.');
  else if (req.method !== 'GET' && !me.bot) limit('api-w:' + me.id, 300, 60e3, "You're doing that too fast. Wait a minute.");
  for (const [method, re, max, win, who, msg] of LIMITS) {
    if (req.method === method && re.test(pathname)) limit(`${re}:${who === 'ip' ? clientIp(req) : me?.id || clientIp(req)}`, max, win, msg);
  }
}

// ---------- tiny router ----------
const routes = [];
// `raw` = accept a raw file upload up to that many bytes instead of JSON.
const route = (method, pattern, handler, { auth = true, raw = 0 } = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth, raw });
};

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// A short line for a chat list ("You: see you soon", "📷 Photo"), like a phone's messages app.
// Encrypted messages stay a lock: Zuno can't read them.
function messagePreview(m, meId) {
  if (!m) return null;
  let text;
  if (m.e2e) text = 'Encrypted message';
  else if (m.call) text = m.call.video ? '📹 Video call' : '📞 Call';
  else if (m.content) text = String(m.content).replace(/```[\s\S]*?```/g, '[code]').replace(/<:([a-z0-9_]{2,32}):[^>]+>/gi, ':$1:').replace(/^-#\s+|^#{1,3}\s+|[*_~`>|]{1,3}/gm, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  else if (m.sticker) text = '🏷️ Sticker';
  else if (m.gif) text = 'GIF';
  else if (m.poll) text = '📊 Poll';
  else if (m.attachments?.length) { const k = m.attachments[0].kind; text = k === 'image' ? '📷 Photo' : k === 'video' ? '🎬 Video' : k === 'voice' ? '🎤 Voice message' : '📎 File'; }
  else if (m.forward) text = '↪ Forwarded message';
  else text = '';
  return { text, mine: m.authorId === meId, by: m.authorId };
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1_600_000) { reject(new HttpError(413, 'That was too big to upload.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      // Keys like "__proto__" are dropped, so a request body can never change how objects behave.
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'), (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v))); }
      catch { reject(new HttpError(400, 'Bad request body.')); }
    });
    req.on('error', reject);
  });
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HttpError(413, `That file is too big (max ${Math.round(limit / 1048576 * 10) / 10} MB).`)); req.resume(); return; }
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, `That file is too big (max ${Math.round(limit / 1048576 * 10) / 10} MB).`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Sessions: sha256(token) -> { uid, createdAt, lastSeen, agent, h: 1 }. Only a fingerprint of each
// login token is stored, so someone who got hold of the database or a backup still couldn't log in
// as anyone. The real token only exists in the person's browser. ("h" marks a fingerprinted entry;
// older saves stored the token itself and are converted once, below.)
// A session nobody has used for SESSION_IDLE ends on its own.
const SESSION_IDLE = CONFIG.SESSION_IDLE_DAYS * 864e5;
const tokenKey = t => crypto.createHash('sha256').update(String(t)).digest('hex');
for (const [t, s] of Object.entries(data.sessions)) {
  if (s && typeof s === 'object' && s.h) continue;
  const rec = typeof s === 'string' ? { uid: s, createdAt: Date.now(), lastSeen: Date.now(), agent: '' } : s;
  delete data.sessions[t];
  if (rec?.uid) data.sessions[tokenKey(t)] = { ...rec, h: 1 };
}
// `key` is a session's fingerprint (what route handlers get as `token`).
function sessionFor(key) {
  const s = key && data.sessions[key];
  if (!s || typeof s !== 'object') return null;
  if (Date.now() - (s.lastSeen || 0) > SESSION_IDLE || (s.dieAt && Date.now() > s.dieAt)) { delete data.sessions[key]; save(); return null; }
  return s;
}
function userFromKey(key) {
  const s = sessionFor(key);
  if (!s) return null;
  if (Date.now() - s.lastSeen > 3600e3) { s.lastSeen = Date.now(); save(); }
  return data.users[s.uid] || null;
}
const userFromToken = token => (token ? userFromKey(tokenKey(token)) : null);
// Logins nobody has used for SESSION_IDLE are cleared out every hour (not only when someone tries
// them again), so old devices don't pile up in memory forever.
function sweepSessions() {
  const now = Date.now(), touched = new Set();
  for (const [k, s] of Object.entries(data.sessions)) {
    if (!s || typeof s !== 'object' || now - (s.lastSeen || 0) > SESSION_IDLE) { delete data.sessions[k]; if (s?.uid) touched.add(s.uid); }
  }
  for (const uid of touched) pruneDevices(uid);
  if (touched.size) save();
}
setInterval(sweepSessions, 3600e3).unref();

// The session also lives in an HttpOnly cookie, so the browser can load private pictures and
// files (which can't send an Authorization header) without the token ever appearing in a URL.
function cookieToken(req) {
  const raw = String(req?.headers?.cookie || '');
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith('zuno_session='));
  const token = match ? match.slice('zuno_session='.length) : '';
  return /^[a-f0-9]{64}$/i.test(token) ? token : null;
}
function sessionCookie(token, req, clear = false) {
  const secure = req?.headers?.['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  return `zuno_session=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=${clear ? 0 : 2592000}`;
}

// ---------- accounts ----------
// Hands back the real token (for the browser); only its fingerprint is kept.
function createSession(uid, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const key = tokenKey(token);
  data.sessions[key] = { uid, createdAt: Date.now(), lastSeen: Date.now(), agent: clean(req?.headers['user-agent'], 200), h: 1 };
  for (const fn of hooks.newSession) fn(data.users[uid], req, key);
  save();
  return token;
}
// Log someone out everywhere (except the session they keep, if any).
function endSessions(uid, keep = null) {
  for (const [t, s] of Object.entries(data.sessions)) if ((typeof s === 'string' ? s : s.uid) === uid && t !== keep) delete data.sessions[t];
  for (const res of streams.get(uid) || []) if (res.zunoToken !== keep) res.end();
  pruneDevices(uid);
  save();
}
// Encrypted-chat keys belong to the login that made them: when that login ends, its key stops
// getting new encrypted messages (so a stolen login can't keep reading after it's logged out).
// A session's short id: the start of its fingerprint (the same id older versions worked out from the token).
const sessionSid = key => String(key).slice(0, 16);
function liveSids(uid) { return new Set(Object.entries(data.sessions).filter(([, s]) => (typeof s === 'string' ? s : s.uid) === uid).map(([t]) => sessionSid(t))); }
function pruneDevices(uid) {
  const u = data.users[uid];
  if (!u?.e2eDevices?.length) return;
  const live = liveSids(uid);
  u.e2eDevices = u.e2eDevices.filter(d => d.sid && live.has(d.sid));
}

route('GET', '/api/public-config', async () => ({ turnstileEnabled: turnstileOn(), turnstileSiteKey: turnstileOn() ? TURNSTILE_SITE_KEY : null }), { auth: false });

route('POST', '/api/register', async ({ body, req, res }) => {
  await verifyTurnstile(body.turnstileToken, req);
  const email = clean(body.email, 254).toLowerCase();
  const username = clean(body.username, 64).toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email)) fail(400, 'Please enter a valid email address.');
  if (!USERNAME_RE.test(username)) fail(400, 'Usernames must be 2–32 characters: letters, numbers, _ and . only.');
  if (password.length < MIN_PASSWORD) fail(400, `Passwords need at least ${MIN_PASSWORD} characters.`);
  if (badUsername(username)) fail(400, NAME_ERROR);
  await judgeText({ username, 'display name': clean(body.displayName, 32) });
  if (Object.values(data.users).some(u => u.email === email)) fail(409, 'An account with that email already exists.');
  if ((data.bannedEmails || []).includes(sha(email))) fail(403, 'That email belongs to an account that was banned from Zuno.');
  if (CONFIG.RESERVED_USERNAMES.includes(username) || (STAFF_NAMES.has(username) && process.env.ZUNO_STAFF_SETUP !== '1') || Object.values(data.users).some(u => u.username === username) || (data.heldNames?.[username]?.until > Date.now())) fail(409, 'That username is already taken.');
  const id = newId();
  data.users[id] = {
    id, username, email,
    displayName: clean(body.displayName, 32) || username,
    passwordHash: await hashPassword(password),
    avatar: null,
    bannerColor: BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)],
    bio: '', pronouns: '', customStatus: '',
    profileSound: null, profileSoundName: '', profileBackground: null,
    status: 'online',
    createdAt: Date.now(),
    lastRead: {},
  };
  // New accounts already have the latest version's notes, so only the welcome is sent.
  welcome(data.users[id]);
  if (joinOfficial(data.users[id])) refreshServer(officialServer());
  save();
  hooks.onRegister.forEach(fn => fn(data.users[id]));
  const token = createSession(id, req);
  res.setHeader('Set-Cookie', sessionCookie(token, req));
  return { token };
}, { auth: false });

const loginFails = new Map(); // user id -> { n, at }
setInterval(() => { for (const [k, v] of loginFails) if (Date.now() - v.at > 15 * 60e3) loginFails.delete(k); }, 60e3).unref();
route('POST', '/api/login', async ({ body, req, res }) => {
  // "login" can be an email or a username.
  const login = clean(body.login ?? body.username, 254).toLowerCase();
  const user = Object.values(data.users).find(u => (login.includes('@') ? u.email === login : u.username === login))
    // A banned account can still log in by its old username while it can appeal.
    || (!login.includes('@') && Object.values(data.users).find(u => u.banned?.snapshot?.username === login));
  if (user && hooks.loginGate) hooks.loginGate(user, req); // (0.45.2) the founder's trusted-devices lock
  // Each account allows 10 wrong passwords per 15 minutes, wherever they come from.
  const lock = user && loginFails.get(user.id);
  if (lock && lock.n >= 10 && Date.now() - lock.at < 15 * 60e3) fail(429, 'Too many wrong passwords for this account. Wait 15 minutes, or reset your password.');
  const passwordOk = await checkPassword(String(body.password || ''), user ? user.passwordHash : DUMMY_HASH);
  // (0.43.1) Wrong passwords from one network are capped too (it can't just try account after account).
  const ipKey = 'ip:' + clientIp(req), ipLock = loginFails.get(ipKey);
  if (ipLock && ipLock.n >= 30 && Date.now() - ipLock.at < 15 * 60e3) fail(429, 'Too many wrong passwords from this network. Wait 15 minutes.');
  if (!user || !passwordOk) {
    loginFails.set(ipKey, { n: (ipLock && Date.now() - ipLock.at < 15 * 60e3 ? ipLock.n : 0) + 1, at: ipLock && Date.now() - ipLock.at < 15 * 60e3 ? ipLock.at : Date.now() });
    if (user) {
      const n = (lock && Date.now() - lock.at < 15 * 60e3 ? lock.n : 0) + 1;
      loginFails.set(user.id, { n, at: Date.now() });
      // The owner hears about it once, when the account gets locked for 15 minutes.
      if (n === 10 && !user.bot && !user.system) systemMessage(user.id, `⚠️ **Someone tried to log in to your account** and got the password wrong 10 times, so logging in is paused for 15 minutes.\n\nIf this wasn't you, your password still kept them out. To be safe, use a strong password and turn on two-factor login in **Settings › My Account**.`);
    }
    fail(401, 'Login or password is invalid.');
  }
  loginFails.delete(user.id);
  // Two-factor login answers with a second step instead of a token.
  for (const fn of hooks.login) { const step = fn(user, req); if (step) return step; }
  const token = createSession(user.id, req);
  res.setHeader('Set-Cookie', sessionCookie(token, req));
  return { token };
}, { auth: false });

route('POST', '/api/logout', async ({ me, token, req, res }) => {
  delete data.sessions[token]; if (me) pruneDevices(me.id); save();
  res.setHeader('Set-Cookie', sessionCookie('', req, true));
  return { ok: true };
});

// Everything the client needs on load.
route('GET', '/api/me', async ({ me }) => {
  const requests = Object.values(data.friendRequests)
    .filter(r => r.from === me.id || r.to === me.id)
    .map(r => {
      const incoming = r.to === me.id;
      return { id: r.id, direction: incoming ? 'incoming' : 'outgoing', user: publicUser(data.users[incoming ? r.from : r.to]), createdAt: r.createdAt };
    })
    .filter(r => r.user);

  const dms = [], messageRequests = [];
  for (const [key, dm] of Object.entries(data.dms)) {
    const ids = key.split(':');
    // Empty DMs show too once you've become friends (so a new friend lands in your DMs right away).
    if (!ids.includes(me.id) || !(dm.messages.length || (dm.friendsAt && !(dm.hiddenBy || []).includes(me.id)))) continue;
    const otherId = ids[0] === me.id ? ids[1] : ids[0];
    const other = data.users[otherId];
    // Closed DMs stay out of the list until a new message arrives (zuno28.js).
    if (me.closedDms?.[otherId] && me.closedDms[otherId] >= (dm.messages[dm.messages.length - 1]?.createdAt || dm.friendsAt || 0)) continue;
    if (!other || (!dm.messages.length && !areFriends(me.id, otherId))) continue;
    if (dm.request && areFriends(me.id, otherId)) { dm.accepted = true; delete dm.request; }
    if (dm.request?.to === me.id) { if (dm.request.status === 'pending' && !isBlocked(me.id, otherId)) messageRequests.push(requestView(me, dm, otherId)); continue; }
    const lastRead = me.lastRead?.[key] || 0;
    const last = dm.messages[dm.messages.length - 1];
    dms.push({
      user: publicUser(other),
      lastMessageAt: last?.createdAt || dm.friendsAt,
      last: messagePreview(last, me.id),
      unread: dm.messages.filter(m => m.authorId !== me.id && m.createdAt > lastRead).length,
      ...(dm.request ? { pending: true } : {}),
    });
  }
  dms.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const servers = Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => serverSummary(sv, me));

  return {
    me: privateMe(me),
    servers,
    friends: friendIds(me.id).map(id => publicUser(data.users[id])).filter(Boolean),
    requests,
    dms,
    messageRequests: messageRequests.sort((a, b) => b.at - a.at),
    ...hooks.meExtras.reduce((o, fn) => Object.assign(o, fn(me)), {}),
  };
});

// ---------- profile ----------
route('PATCH', '/api/me', async ({ me, body }) => {
  const text = {};
  if ('displayName' in body) text.displayName = cleanName(body.displayName, 32) || me.username;
  if ('pronouns' in body) text.pronouns = clean(body.pronouns, 24);
  if ('bio' in body) text.bio = clean(body.bio, perksFor(me).bio);
  if ('customStatus' in body) text.customStatus = clean(body.customStatus, 80);
  const LABEL = { displayName: 'display name', pronouns: 'pronouns', bio: 'bio', customStatus: 'status' };
  await judgeText(Object.fromEntries(Object.entries(text).filter(([k, v]) => v !== me[k]).map(([k, v]) => [LABEL[k], v])));
  Object.assign(me, text);
  if ('profileSoundOnce' in body) me.profileSoundOnce = !!body.profileSoundOnce;
  if ('bannerColor' in body) {
    if (!/^#[0-9a-f]{6}$/i.test(body.bannerColor)) fail(400, 'Banner color must be a hex color like #5865f2.');
    me.bannerColor = body.bannerColor;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) fail(400, 'Unknown status.');
    me.status = body.status;
  }
  if ('avatar' in body) {
    const a = body.avatar;
    const lim = perksFor(me);
    const gifCopy = typeof a === 'string' && (a === me.gifAvatarPending || (a === me.avatar && /^\/uploads\//.test(a)));
    if (a !== null && !gifCopy && !(typeof a === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a) && a.length < lim.avatar * 1.37 + 100)) {
      fail(400, 'Avatars can be a PNG, JPEG, WebP or GIF up to 1 MB.');
    }
    if (me.avatar !== a && /^\/uploads\//.test(me.avatar || '')) removeUpload(me.avatar); // the old picture
    if (a === me.gifAvatarPending) me.gifAvatarPending = undefined;
    // Pictures are kept as files, not inside the account: accounts stay small, so saving and
    // sending profiles around is fast.
    me.avatar = a?.startsWith('data:') ? avatarToFile(a) : a;
  }
  const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if ('nameColor' in body) {
    if (body.nameColor !== null && !hex(body.nameColor)) fail(400, 'Name color must be a hex color.');
    me.nameColor = body.nameColor;
  }
  if ('profileTheme' in body) {
    const t = body.profileTheme;
    if (t !== null && !(t && hex(t.primary) && hex(t.accent))) fail(400, 'Profile themes need two hex colors.');
    me.profileTheme = t ? { primary: t.primary, accent: t.accent } : null;
  }
  for (const fn of hooks.patchMe) fn(me, body);
  save();
  broadcastUser(me);
  return { me: privateMe(me) };
});

// ---------- profile sound & background uploads ----------
// Files are checked by their actual bytes, not just their name.
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return { ext: 'aac', type: 'audio' };
  if (buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: 'mp3', type: 'audio' };
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return { ext: 'gif', type: 'gif' };
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    // MP4, MOV, AVIF and iPhone HEIC photos all start this way; the "brand" after it says which.
    const brand = buf.slice(8, 12).toString('latin1');
    if (/^avi[fs]/.test(brand)) return { ext: 'avif', type: 'image' };
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brand)) return { ext: 'heic', type: 'image' };
    return { ext: 'mp4', type: 'video' };
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d && buf.readUInt32LE(2) === buf.length) return { ext: 'bmp', type: 'image' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', type: 'webm' };
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return { ext: 'ogg', type: 'audio' };
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return { ext: 'png', type: 'image' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WAVE') return { ext: 'wav', type: 'audio' };
  // Some MP3s start with padding, a broken tag or other junk before the first frame. Look further
  // in, and only count it when two frames in a row line up (so random bytes don't pass as audio).
  if (findMp3Frames(buf)) return { ext: 'mp3', type: 'audio' };
  return null;
}
const MP3_RATES = {
  '3,3': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '3,2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '3,1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2,3': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2,2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SAMPLES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function mp3FrameLength(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return 0;
  const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3;
  const bri = buf[i + 2] >> 4, sri = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
  if (ver === 1 || layer === 0 || bri === 0 || bri === 15 || sri === 3) return 0;
  const br = (MP3_RATES[`${ver === 3 ? 3 : 2},${ver === 3 ? layer : layer === 3 ? 3 : 2}`])[bri] * 1000;
  const sr = MP3_SAMPLES[ver][sri];
  if (layer === 3) return (Math.floor(12 * br / sr) + pad) * 4;
  return Math.floor((layer === 1 && ver !== 3 ? 72 : 144) * br / sr) + pad;
}
function findMp3Frames(buf) {
  const end = Math.min(buf.length - 4, 256 * 1024);
  for (let i = 0; i < end; i++) {
    const len = mp3FrameLength(buf, i);
    if (len && mp3FrameLength(buf, i + len)) return true;
  }
  return false;
}
// Audio a profile sound can be: MP3 plus the formats Macs and phones often save (M4A, WAV, AAC, OGG).
function soundKind(buf) {
  const k = sniff(buf);
  if (!k) return null;
  if (['mp3', 'wav', 'aac', 'ogg'].includes(k.ext)) return k.ext;
  if (k.ext === 'mp4' && /^(M4A |M4B |mp42|isom|iso2|dash)/.test(buf.slice(8, 12).toString('latin1'))) return 'm4a';
  return null;
}
// Uploads are written to the disk first. With cloud storage on (storage.js), each file is copied
// to the cloud right away and then removed from the disk, so the server's disk never fills up.
const storage = require('./storage');
function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const name = path.basename(url);
  fs.unlink(path.join(UPLOAD_DIR, name), () => {});
  if (storage.enabled()) storage.del(name).catch(() => {});
}
function toCloud(name, buf) {
  if (!storage.enabled()) return;
  storage.put(name, buf).then(() => fs.unlink(path.join(UPLOAD_DIR, name), () => {})).catch(err => console.warn('Cloud upload failed (kept on disk, will retry):', err.message));
}
function storeUpload(buf, ext) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${newId()}${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  toCloud(name, buf);
  return `/uploads/${name}`;
}
// Files still on the disk (from before cloud storage, or a failed copy) move to the cloud in the background.
// "data:image/png;base64,…" -> a stored file, "/uploads/<name>.png".
function avatarToFile(dataUrl) {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const kind = sniff(buf);
  if (!kind || !['png', 'jpg', 'webp', 'gif'].includes(kind.ext)) fail(400, 'Avatars can be a PNG, JPEG, WebP or GIF up to 1 MB.');
  return storeUpload(buf, kind.ext);
}
// Older accounts kept their picture inside the account; move those to files once, at start-up.
function moveAvatarsToFiles() {
  let n = 0;
  for (const u of Object.values(data.users)) {
    if (typeof u.avatar !== 'string' || !u.avatar.startsWith('data:image/') || u.avatar.startsWith('data:image/svg')) continue;
    try { u.avatar = avatarToFile(u.avatar); n++; } catch { u.avatar = null; }
  }
  if (n) { console.log(`Moved ${n} avatar${n === 1 ? '' : 's'} into files.`); save(); }
}
async function sweepToCloud() {
  if (!storage.enabled()) return;
  let names = [];
  try { names = fs.readdirSync(UPLOAD_DIR).filter(n => !n.startsWith('.')); } catch { return; }
  let moved = 0;
  for (const name of names) {
    try { await storage.put(name, fs.readFileSync(path.join(UPLOAD_DIR, name))); fs.unlinkSync(path.join(UPLOAD_DIR, name)); moved++; }
    catch (err) { console.warn('Moving', name, 'to the cloud failed:', err.message); break; }
  }
  if (moved) console.log(`Moved ${moved} upload${moved === 1 ? '' : 's'} to cloud storage.`);
}

route('POST', '/api/me/sound', async ({ me, body, req }) => {
  const ext = soundKind(body);
  if (!ext) fail(400, "That file doesn't look like audio Zuno can play. Try an MP3, M4A or WAV.");
  removeUpload(me.profileSound);
  me.profileSound = storeUpload(body, ext);
  me.profileSoundName = clean(decodeURIComponent(req.headers['x-file-name'] || 'sound.mp3'), 80);
  save(); broadcastUser(me);
  return { me: privateMe(me) };
}, { raw: me => perksFor(me).sound });

route('DELETE', '/api/me/sound', async ({ me }) => {
  removeUpload(me.profileSound);
  me.profileSound = null; me.profileSoundName = '';
  save(); broadcastUser(me);
  return { me: privateMe(me) };
});

route('POST', '/api/me/background', async ({ me, body }) => {
  const kind = sniff(body);
  if (!kind || !['mp4', 'gif'].includes(kind.ext)) fail(400, 'Profile backgrounds must be MP4 videos or GIFs.');
  removeUpload(me.profileBackground?.url);
  me.profileBackground = { url: storeUpload(body, kind.ext), type: kind.type };
  save(); broadcastUser(me);
  return { me: privateMe(me) };
}, { raw: me => perksFor(me).background });

route('DELETE', '/api/me/background', async ({ me }) => {
  removeUpload(me.profileBackground?.url);
  me.profileBackground = null;
  save(); broadcastUser(me);
  return { me: privateMe(me) };
});

route('POST', '/api/me/banner', async ({ me, body }) => {
  const kind = sniff(body);
  if (!kind || !['png', 'jpg', 'webp', 'gif'].includes(kind.ext)) fail(400, 'Banners must be PNG, JPG, WebP or GIF images.');
  removeUpload(me.profileBanner?.url);
  me.profileBanner = { url: storeUpload(body, kind.ext), type: kind.ext === 'gif' ? 'gif' : 'image' };
  save(); broadcastUser(me);
  return { me: privateMe(me) };
}, { raw: me => perksFor(me).banner });

// "Choose A Gif" for your avatar or banner: a GIF from the picker (KLIPY) or one you favorited
// from chat. Zuno keeps its own copy, so it never breaks if the original goes away.
const KLIPY_URL = /^https:\/\/([a-z0-9-]+\.)*klipy\.com\//i;
const LOCAL_GIF = /^\/uploads\/[a-z0-9]+\.gif$/;
async function readCapped(stream, max) {
  const chunks = []; let size = 0;
  for await (const c of stream) { size += c.length; if (size > max) throw new HttpError(413, `That GIF is too big (max ${Math.round(max / 1e6)} MB).`); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function fetchGifBytes(url, max) {
  if (LOCAL_GIF.test(url)) {
    const name = path.basename(url), file = path.join(UPLOAD_DIR, name);
    if (fs.existsSync(file)) { if (fs.statSync(file).size > max) fail(413, `That GIF is too big (max ${Math.round(max / 1e6)} MB).`); return fs.readFileSync(file); }
    const res = storage.enabled() ? await storage.get(name) : null;
    if (!res) fail(404, "That GIF isn't around anymore.");
    return readCapped(res, max);
  }
  // Only KLIPY's servers, following at most a few redirects that stay on KLIPY.
  for (let hop = 0; hop < 4; hop++) {
    if (!KLIPY_URL.test(url) || url.length > 600) fail(400, "That GIF can't be used.");
    let r;
    try { r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) }); } catch { fail(502, "Couldn't get that GIF. Try another."); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url).href; continue; }
    if (!r.ok) fail(502, "Couldn't get that GIF. Try another.");
    if (Number(r.headers.get('content-length')) > max) fail(413, `That GIF is too big (max ${Math.round(max / 1e6)} MB).`);
    return readCapped(r.body, max);
  }
  fail(502, "Couldn't get that GIF. Try another.");
}
const GIF_AVATAR_MAX = CONFIG.GIF_AVATAR_MAX;
route('POST', '/api/me/gif-media', async ({ me, body }) => {
  limit('gifmedia:' + me.id, 20, 60 * 60e3, "You've changed GIFs a lot this hour. Try again a bit later.");
  const kind = body.kind === 'banner' ? 'banner' : 'avatar';
  const max = kind === 'banner' ? perksFor(me).banner : GIF_AVATAR_MAX;
  let buf;
  try { buf = await fetchGifBytes(String(body.url || ''), max); }
  catch (e) {
    // A big GIF? The picker's smaller copy usually fits.
    if (e.status !== 413 || !body.preview || body.preview === body.url) throw e;
    buf = await fetchGifBytes(String(body.preview), max);
  }
  if (sniff(buf)?.ext !== 'gif') fail(400, "That isn't a GIF.");
  const url = storeUpload(buf, 'gif');
  if (kind === 'banner') {
    removeUpload(me.profileBanner?.url);
    me.profileBanner = { url, type: 'gif' };
  } else {
    // Becomes your avatar when you press Save Changes.
    if (me.gifAvatarPending && me.gifAvatarPending !== me.avatar) removeUpload(me.gifAvatarPending);
    me.gifAvatarPending = url;
  }
  save(); if (kind === 'banner') broadcastUser(me);
  return { url, me: privateMe(me) };
});

route('DELETE', '/api/me/banner', async ({ me }) => {
  removeUpload(me.profileBanner?.url);
  me.profileBanner = null;
  save(); broadcastUser(me);
  return { me: privateMe(me) };
});

// Personal settings (saved to the account so they follow you to any computer).
route('PATCH', '/api/me/prefs', async ({ me, body }) => {
  const prefs = { ...PREF_DEFAULTS, ...(me.prefs || {}) };
  for (const k of PREF_BOOLS) if (k in body) prefs[k] = !!body[k];
  if ('soundVolume' in body) prefs.soundVolume = Math.max(0, Math.min(100, Math.round(Number(body.soundVolume) || 0)));
  if ('chatFontSize' in body) prefs.chatFontSize = Math.max(12, Math.min(22, Math.round(Number(body.chatFontSize) || 15)));
  if ('accent' in body && (ACCENTS.includes(body.accent) || BLOOM_ACCENTS.includes(body.accent))) prefs.accent = body.accent;
  if ('density' in body && ['cozy', 'compact'].includes(body.density)) prefs.density = body.density;
  if ('dmRequests' in body && ['everyone', 'servers', 'friends'].includes(body.dmRequests)) prefs.dmRequests = body.dmRequests;
  for (const fn of hooks.patchPrefs) fn(me, prefs, body);
  me.prefs = prefs; save();
  return { me: privateMe(me) };
});

route('GET', '/api/users/:id', async ({ me, params }) => {
  const u = data.users[params.id];
  if (!u) fail(404, 'User not found.');
  return { user: publicUser(u), relationship: relationship(me.id, u.id) };
});

// Zuno Staff can give or take away badges. The founder's own badges, and the Staff badge itself,
// are the founder's alone.
route('POST', '/api/users/:id/badges', async ({ me, params, body, token }) => {
  needStaff(me);
  if (['staff', 'zuno_manager'].includes(String(body.badge || ''))) needReauth(token);
  const u = data.users[params.id];
  if (!u || u.system || u.bot) fail(404, 'User not found.');
  if (isFounder(u.id) && !isFounder(me.id)) fail(403, "Only the founder can change the founder's badges.");
  const badge = String(body.badge || '');
  if (!BADGES.includes(badge) || badge.startsWith('bloom')) fail(400, badge.startsWith('bloom') ? 'Bloom badges come from Bloom itself. Gift Bloom instead.' : 'Unknown badge.');
  if (badge === 'staff' && STAFF_NAMES.has(u.username) && !body.on) fail(400, 'This person is staff in the server settings, so the badge stays.');
  if (badge === 'staff' && u.id === me.id && !body.on) fail(400, "You can't remove your own staff badge.");
  if (badge === 'zuno_manager' && !isFounder(me.id)) fail(403, 'Only the founder can give or take away Zuno Manager.');
  if (badge === 'staff' && !overStaff(me)) fail(403, 'Only the founder or a Zuno Manager can give or take away the staff badge.');
  if (isStaff(u) && u.id !== me.id && !body.on && !overStaff(me)) fail(403, "Only the founder or a Zuno Manager can take badges from other staff.");
  const grants = new Set(u.badgeGrants || []), removals = new Set(u.badgeRemovals || []);
  if (body.on) { grants.add(badge); removals.delete(badge); } else { grants.delete(badge); removals.add(badge); }
  u.badgeGrants = [...grants]; u.badgeRemovals = [...removals];
  save(); broadcastUser(u);
  for (const fn of hooks.badgeChange || []) fn(u, badge, !!body.on, me);
  return { user: publicUser(u) };
});

// ---------- friends ----------
function refreshBoth(a, b) { send(a, 'refresh', {}); send(b, 'refresh', {}); }

route('POST', '/api/friends/requests', async ({ me, body }) => {
  // (0.43.1) Fewer for brand-new accounts (most spam bots are).
  const fresh = Date.now() - (me.createdAt || 0) < 3 * 864e5;
  limit('fr:' + me.id, fresh ? 10 : 40, 3600e3, fresh ? 'New accounts can send 10 friend requests an hour. Try again later.' : "You've sent a lot of friend requests. Try again in a bit.");
  const username = clean(body.username, 64).toLowerCase().replace(/^@/, '');
  const target = userByName(username);
  if (!target) fail(404, "Hm, didn't work. Double check that the username is correct.");
  if (target.id === me.id) fail(400, "You can't add yourself as a friend.");
  if (target.system) fail(400, "Zuno is the official Zuno account. It's already in your DMs!");
  if (areFriends(me.id, target.id)) fail(400, "You're already friends with that user!");
  if (target.webhook || (target.bot && target.id !== BOT_ID)) fail(400, "Bots can't be added as friends. Add them to a server instead.");
  if (isBlocked(me.id, target.id)) fail(403, (me.blocked || []).includes(target.id) ? 'You blocked this person. Unblock them first.' : "Hm, didn't work. Double check that the username is correct.");
  if (target.bot) { // the Testing bot says yes right away
    data.friendships.push([me.id, target.id]);
    save(); send(me.id, 'refresh', {});
    return { ok: true, accepted: true };
  }
  const existing = Object.values(data.friendRequests).find(r =>
    (r.from === me.id && r.to === target.id) || (r.from === target.id && r.to === me.id));
  if (existing) {
    if (existing.from === me.id) fail(400, 'You already sent them a friend request.');
    // They already asked us, so sending one back means accepting.
    delete data.friendRequests[existing.id];
    data.friendships.push([me.id, target.id]);
    for (const fn of hooks.friend) fn('accepted', target.id, me.id);
    save(); refreshBoth(me.id, target.id);
    return { ok: true, accepted: true };
  }
  const id = newId();
  data.friendRequests[id] = { id, from: me.id, to: target.id, createdAt: Date.now() };
  for (const fn of hooks.friend) fn('request', me.id, target.id);
  save(); refreshBoth(me.id, target.id);
  return { ok: true };
});

route('POST', '/api/friends/requests/:id/accept', async ({ me, params }) => {
  const r = data.friendRequests[params.id];
  if (!r || r.to !== me.id) fail(404, 'That friend request no longer exists.');
  delete data.friendRequests[r.id];
  if (!areFriends(r.from, r.to)) data.friendships.push([r.from, r.to]);
  for (const fn of hooks.friend) fn('accepted', r.from, r.to);
  save(); refreshBoth(r.from, r.to);
  return { ok: true };
});

// Decline (incoming) or cancel (outgoing).
route('DELETE', '/api/friends/requests/:id', async ({ me, params }) => {
  const r = data.friendRequests[params.id];
  if (!r || (r.to !== me.id && r.from !== me.id)) fail(404, 'That friend request no longer exists.');
  delete data.friendRequests[r.id];
  save(); refreshBoth(r.from, r.to);
  return { ok: true };
});

route('DELETE', '/api/friends/:userId', async ({ me, params }) => {
  const before = data.friendships.length;
  data.friendships = data.friendships.filter(([a, b]) => !((a === me.id && b === params.userId) || (a === params.userId && b === me.id)));
  if (data.friendships.length === before) fail(404, "You aren't friends with that user.");
  save(); refreshBoth(me.id, params.userId);
  return { ok: true };
});

// ---------- conversations: DMs and server text channels share one set of routes ----------
// A conversation knows who's in it and where its messages live.
//   DM:      /api/dms/:userId/...       (viewer's conversation id = the other user's id)
//   Channel: /api/channels/:channelId/... (conversation id = "ch:<channelId>")

// ---- blocking & message requests ----
// People who aren't your friends can "knock": send up to 3 messages that land in your Requests,
// not your DMs. Likely spam goes to Filtered instead, silently. Nothing reaches you until you accept.
const REQUEST_LIMIT = 3;
const isBlocked = (a, b) => (data.users[a]?.blocked || []).includes(b) || (data.users[b]?.blocked || []).includes(a);
const devBot = u => !!u?.bot && u.id !== BOT_ID;
const mutualServers = (a, b) => Object.values(data.servers).filter(sv => sv.members.includes(a) && sv.members.includes(b));
const mutualFriends = (a, b) => friendIds(a).filter(id => friendIds(b).includes(id));
const requestPrivacy = u => ({ ...PREF_DEFAULTS, ...(u.prefs || {}) }).dmRequests;
const SPAM_WORDS = /\b(free nitro|nitro|free bloom|gift ?card|crypto|airdrop|giveaway|steam ?gift|earn \$|cash ?app|investment|onlyfans|click (here|this|the link)|verify your account|claim (your|now))\b/i;
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|ru|xyz|gg|io|ly|me|link|click|top)\b/i;
function looksLikeSpam(sender, recipient, content) {
  let score = 0;
  const ageHours = (Date.now() - (sender.createdAt || 0)) / 3600e3;
  if (ageHours < 24) score += 2;
  if (LINK_RE.test(content)) score += 2;
  if (SPAM_WORDS.test(content)) score += 2;
  if (!mutualServers(sender.id, recipient.id).length) score += 1;
  if (!sender.avatar) score += 0.5;
  // The same opener sent to lots of people in the last hour.
  const recent = (sender.knocks || []).filter(k => k.at > Date.now() - 3600e3);
  if (recent.filter(k => k.text === content.slice(0, 80)).length >= 2) score += 3;
  if (recent.length >= 8) score += 2;
  if ((sender.declinedBy || 0) >= 3) score += 2;
  if ((sender.spamMarks || 0) >= 2) score += 3;
  return score >= 4;
}
const dmRecord = (a, b) => data.dms[dmKey(a, b)];
function dmMode(me, other) {
  // (0.45) The founder signed in as Zuno Official can write to anyone, and people can answer once
  // Zuno Official has written to them in person (not just the automatic updates).
  if (me.system) return 'open';
  if (other.system) {
    if (dmRecord(me.id, other.id)?.messages?.some(m => m.official)) return 'open';
    fail(403, "You can't reply to Zuno. It only sends updates and tips.");
  }
  if (isBlocked(me.id, other.id)) fail(403, "You can't message this person.");
  if (areFriends(me.id, other.id)) return 'open';
  // (0.46) Bots can DM people who share a server with them (unless they turned bot DMs off), and
  // people can write back.
  if (devBot(me) || devBot(other)) {
    const bot = devBot(me) ? me : other, person = bot === me ? other : me;
    if (person.bot || bot.app?.deleted) fail(403, "Bots can't message other bots.");
    const shared = mutualServers(bot.id, person.id).length > 0;
    const talked = dmRecord(me.id, other.id)?.messages?.some(m => m.authorId === bot.id);
    if (bot === me) {
      if (!shared) fail(403, 'Bots can only message people who share a server with them.');
      if (person.prefs?.botDms === false) fail(403, `${person.displayName} doesn't take messages from bots.`);
      limit('botdm:' + bot.id, 30, 60e3, 'This bot is sending DMs too fast. Slow down.');
      return 'open';
    }
    if (!shared && !talked) fail(403, "You can only message bots that are in one of your servers.");
    return 'open';
  }
  if (other.id === BOT_ID) fail(403, 'Add Testing as a friend first. It says yes right away!');
  const dm = dmRecord(me.id, other.id);
  if (dm?.accepted) return 'open';
  const req = dm?.request;
  if (req) {
    if (req.to === me.id) fail(403, 'Accept their message request to reply.');
    if (req.status === 'declined') fail(403, `${other.displayName} isn't taking messages from you right now.`);
    const mine = dm.messages.filter(m => m.authorId === me.id).length;
    if (mine >= REQUEST_LIMIT) fail(403, `You can send ${REQUEST_LIMIT} messages until ${other.displayName} accepts your request.`);
    return 'request';
  }
  const who = requestPrivacy(other);
  if (who === 'friends') fail(403, `${other.displayName} only gets messages from friends. Send a friend request instead.`);
  if (who === 'servers' && !mutualServers(me.id, other.id).length) fail(403, `${other.displayName} only gets message requests from people in their servers. Send a friend request instead.`);
  return 'new-request';
}
// What a pending request looks like to the person receiving it.
function requestView(me, dm, otherId) {
  const u = data.users[otherId];
  const theirs = dm.messages.filter(m => m.authorId === otherId);
  return {
    user: publicUser(u), at: dm.request.at, spam: !!dm.request.spam, count: theirs.length,
    preview: (theirs[0]?.content || (theirs[0]?.attachments ? 'Sent a file' : theirs[0]?.gif ? 'Sent a GIF' : '')).slice(0, 200),
    mutualServers: mutualServers(me.id, otherId).map(sv => ({ id: sv.id, name: sv.name })).slice(0, 5),
    mutualFriends: mutualFriends(me.id, otherId).length, accountAge: u ? Date.now() - u.createdAt : 0,
  };
}

function dmConv(me, userId) {
  const other = data.users[userId];
  if (!other || other.id === me.id) fail(404, 'User not found.');
  const key = dmKey(me.id, other.id);
  return {
    kind: 'dm', key, other, members: [me.id, other.id],
    store: () => (data.dms[key] ||= { messages: [] }),
    peek: () => data.dms[key],
    idFor: viewerId => (viewerId === me.id ? other.id : me.id),
    canWrite: () => dmMode(me, other),
    canModerate: () => false,
    perms: null,
  };
}
// A channel as seen by one person: only people who can see the channel get its events.
function channelConvFor(sv, ch, me = null) {
  ensureRoles(sv);
  const key = 'ch:' + ch.id;
  const perms = me ? permsIn(sv, ch, me.id) : new Set(PERM_KEYS);
  return {
    kind: 'channel', key, server: sv, channel: ch, perms,
    members: sv.members.filter(id => canView(sv, ch, id)),
    store: () => (data.channelMessages[ch.id] ||= { messages: [] }),
    peek: () => data.channelMessages[ch.id],
    idFor: () => key,
    canWrite: () => {
      if (!perms.has('send_messages')) fail(403, ch.readOnly ? 'This is an announcement channel. Only people allowed to post can send messages here.' : "You don't have permission to send messages in this channel.");
      if (ch.slowmode && !perms.has('bypass_slowmode') && !perms.has('manage_messages') && !perms.has('manage_channels')) {
        const k = ch.id + '|' + me.id, wait = (lastPost.get(k) || 0) + ch.slowmode * 1000 - Date.now();
        if (wait > 0) fail(429, `Slowmode is on. You can send another message in ${wait > 90e3 ? Math.ceil(wait / 60e3) + ' min' : Math.ceil(wait / 1000) + 's'}.`);
        lastPost.set(k, Date.now());
      }
      return 'open';
    },
    canModerate: () => perms.has('manage_messages'),
  };
}
function channelConv(me, channelId) {
  const { sv, ch } = findChannel(channelId);
  if (!sv || !sv.members.includes(me.id) || !canView(ensureRoles(sv), ch, me.id)) fail(404, 'Channel not found.');
  return channelConvFor(sv, ch, me);
}
// Group DMs: up to 10 friends in one chat. Conversation id = "g:<groupId>".
data.groups ||= {};        // id -> { id, name, icon, ownerId, members: [ids], createdAt }
data.groupMessages ||= {}; // groupId -> { messages: [] }
function groupConv(me, groupId) {
  const g = data.groups[groupId];
  if (!g || !g.members.includes(me.id)) fail(404, 'Group not found.');
  const key = 'g:' + g.id;
  return {
    kind: 'group', key, group: g, members: [...g.members],
    store: () => (data.groupMessages[g.id] ||= { messages: [] }),
    peek: () => data.groupMessages[g.id],
    idFor: () => key,
    canWrite: () => 'open',
    canModerate: () => g.ownerId === me.id,
    perms: null,
  };
}
function emit(conv, event, payload) {
  const req = conv.kind === 'dm' ? conv.peek()?.request : null;
  for (const id of conv.members) {
    // A pending request only shows up in the other person's Requests (Filtered ones stay silent).
    if (req && req.to === id) {
      if (req.status === 'declined') continue;
      if (event === 'message') { send(id, 'message-request', { from: conv.idFor(id), spam: !!req.spam }); continue; }
      continue;
    }
    send(id, event, { ...payload, conv: conv.idFor(id), ...(conv.kind === 'dm' ? { peerId: conv.idFor(id) } : conv.kind === 'group' ? { groupId: conv.group.id } : { serverId: conv.server.id, channelId: conv.channel.id }) });
  }
}
function emitTyping(conv, from) {
  for (const id of conv.members) if (id !== from.id) send(id, 'typing', { conv: conv.idFor(id), from: from.id });
}
// Who a message pings: @username, @RoleName, @everyone and @here.
function findMentions(content, conv, author) {
  const users = new Set(), roles = new Set();
  let everyone = false, here = false;
  const text = String(content);
  const named = new Set(); // every @name that matched a person here
  for (const m of text.matchAll(/(^|[^\w@])@([a-z0-9_.]{2,32})\b/gi)) {
    const u = userByName(m[2]);
    if (u && conv.members.includes(u.id)) { users.add(u.id); named.add(m[2].toLowerCase()); }
  }
  if (conv.kind === 'channel' && author) {
    const sv = conv.server;
    const big = author.system || conv.perms?.has('mention_everyone');
    if (/(^|\s)@everyone\b/i.test(text) && big) everyone = true;
    else if (/(^|\s)@here\b/i.test(text) && big) here = true;
    // A role is pinged only by its whole name ("@og" isn't "@ogre"), and when someone here has that
    // exact username, "@name" means the person, not the role (it used to ping both, and a role
    // named like the server owner pinged everyone with it whenever the owner was mentioned).
    for (const r of sv.roles) {
      if (r.everyone || !(r.mentionable || big)) continue;
      const name = r.name.toLowerCase();
      if (named.has(name)) continue;
      const re = new RegExp('(^|[^\\w@])@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.])', 'i');
      if (re.test(text)) roles.add(r.id);
    }
  }
  return { users: [...users], roles: [...roles], everyone, here };
}
function postMessage(conv, author, content, extra = {}) {
  const message = { id: newId(), authorId: author.id, content, createdAt: Date.now(), ...extra };
  const found = findMentions(content, conv, author);
  if (found.users.length) message.mentions = found.users;
  if (found.roles.length) message.mentionRoles = found.roles;
  if (found.everyone) message.mentionEveryone = true;
  if (found.here) message.mentionHere = true;
  conv.store().messages.push(message);
  for (const fn of hooks.posted) fn(conv, message, author);
  if (!author.system && !author.bot) {
    author.stats ||= {};
    const before = badgesFor(author).length;
    author.stats.messages = (author.stats.messages || 0) + 1;
    if (badgesFor(author).length !== before) broadcastUser(author); // just earned Chatterbox
  }
  author.lastRead ||= {};
  author.lastRead[conv.key] = message.createdAt;
  // Pings in servers go to each person's "Unchecked Pings" until they've seen them.
  if (conv.kind === 'channel') {
    const sv = conv.server;
    const pinged = new Set(found.users);
    if (extra.replyTo?.authorId && !extra.replyTo.noPing) pinged.add(extra.replyTo.authorId);
    if (found.everyone || found.here) for (const id of conv.members) if (found.everyone || effectiveStatus(data.users[id] || {}) !== 'offline') pinged.add(id);
    for (const rid of found.roles) for (const id of conv.members) if (rolesOf(sv, id).includes(rid)) pinged.add(id);
    pinged.delete(author.id);
    for (const uid of pinged) {
      const u = data.users[uid];
      if (!u || u.system || u.bot || !conv.members.includes(uid)) continue;
      u.inbox = [...(u.inbox || []).slice(-99), { id: message.id, serverId: sv.id, channelId: conv.channel.id, authorId: author.id, reply: !found.users.includes(uid) && extra.replyTo?.authorId === uid, at: message.createdAt }];
      send(uid, 'inbox', { count: u.inbox.length });
      save.touch('users', uid);
    }
  }
  // (0.45) Only this chat and the people it changed are written (see db.js).
  const where = conv.kind === 'dm' ? ['dms', conv.key] : conv.kind === 'channel' ? ['channelMessages', conv.channel.id] : conv.kind === 'group' ? ['groupMessages', conv.group.id] : null;
  if (where && save.touch) {
    save.touch(where[0], where[1]);
    save.touch('users', author.id);
    for (const a of extra.attachments || []) save.touch('attachments', a.id);
  } else save();
  emit(conv, 'message', { message, author: publicUser(author) });
  return message;
}
// Files people attach to messages (uploaded first, then sent with the message).
data.attachments ||= {};
const MAX_ATTACHMENT = 1_000_000;
function takeAttachments(me, ids, meta = {}) {
  if (!Array.isArray(ids) || !ids.length) return undefined;
  const max = perksFor(me).files;
  if (ids.length > max) fail(400, `You can attach up to ${max} files at once.`);
  return ids.map(id => {
    const a = data.attachments[id];
    if (!a || a.owner !== me.id) fail(400, 'That file is no longer available. Try attaching it again.');
    if (a.used) fail(400, 'That file was already sent.');
    a.used = true;
    const out = { id: a.id, url: a.url, name: a.name, size: a.size, kind: a.kind, ...(a.kind === 'voice' ? { duration: a.duration, wave: a.wave } : {}) };
    for (const fn of hooks.attachmentView) fn(a, out, meta?.[id] || {});
    return out;
  });
}
// GIFs must come from the GIF service, so nobody can sneak in other links.
function cleanGif(g) {
  if (!g) return undefined;
  // KLIPY GIFs, or GIFs people uploaded to Zuno (so they can be favorited and sent again).
  const ok = u => typeof u === 'string' && (/^https:\/\/([a-z0-9-]+\.)*klipy\.com\//i.test(u) || /^\/uploads\/[a-z0-9]+\.gif$/.test(u)) && u.length < 600;
  if (!ok(g.url)) fail(400, "That GIF couldn't be sent.");
  return { url: g.url, preview: ok(g.preview) ? g.preview : g.url, w: Math.min(2000, Number(g.w) || 0), h: Math.min(2000, Number(g.h) || 0), title: clean(g.title, 120) };
}
function cleanReply(conv, replyTo) {
  if (!replyTo) return undefined;
  const target = conv.peek()?.messages.find(m => m.id === replyTo);
  if (!target) return undefined;
  return { id: target.id, authorId: target.authorId, snippet: (target.content || (target.gif ? 'GIF' : target.attachments ? 'Attachment' : '')).slice(0, 120) };
}

function cleanContent(body, me) {
  const content = stripInvisible(String(body.content ?? '').replace(/\r\n/g, '\n')).trim();
  const max = perksFor(me).message;
  if (content.length > max) fail(400, `Messages can be up to ${max} characters.${max < 4000 ? ' Bloom lets you send up to 4000.' : ''}`);
  return content;
}
function findMessage(conv, msgId) {
  const st = conv.peek();
  const i = st ? st.messages.findIndex(m => m.id === msgId) : -1;
  if (i < 0) fail(404, 'That message no longer exists.');
  return { st, i, m: st.messages[i] };
}
// "/roll 2d6" in a server: if a bot in the server has that command, it gets told about it.
function botCommandFor(conv, me, content) {
  if (conv.kind !== 'channel' || !content.startsWith('/')) return null;
  const m = /^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(content);
  if (!m) return null;
  const name = m[1].toLowerCase();
  for (const id of conv.members) {
    const bot = data.users[id];
    if (!devBot(bot) || bot.app?.deleted) continue;
    if ((bot.app?.commands || []).some(c => c.name === name)) {
      if (!conv.perms.has('use_commands')) fail(403, "You don't have permission to use bot commands here.");
      return { name, args: (m[2] || '').trim().slice(0, 1000), botId: bot.id };
    }
  }
  return null;
}

for (const [prefix, resolve] of [['/api/dms/:target', dmConv], ['/api/channels/:target', channelConv], ['/api/groups/:target', groupConv]]) {
  route('GET', `${prefix}/messages`, async ({ me, params, query }) => {
    const conv = resolve(me, params.target);
    let msgs = conv.peek()?.messages || [];
    // Without "Read Message History" you only see what was sent after you joined.
    if (conv.kind === 'channel' && !conv.perms.has('read_history')) { const since = me.joinedAt?.[conv.server.id] || 0; msgs = msgs.filter(m => m.createdAt >= since); }
    const before = Number(query.get('before')) || Infinity;
    const older = msgs.filter(m => m.createdAt < before);
    const page = older.slice(-50);
    // Include everyone who wrote these messages, so names and avatars show even for people who left.
    const authors = [...new Set(page.map(m => m.authorId))].map(id => publicUser(data.users[id])).filter(Boolean);
    const dm = conv.kind === 'dm' ? conv.peek() : null;
    return {
      ...(conv.kind === 'dm' ? {
        user: publicUser(conv.other), relationship: relationship(me.id, conv.other.id),
        request: dm?.request ? { direction: dm.request.from === me.id ? 'outgoing' : 'incoming', status: dm.request.status, spam: !!dm.request.spam, limit: REQUEST_LIMIT } : null,
        accepted: !!dm?.accepted, blocked: (me.blocked || []).includes(conv.other.id),
        ...hooks.dmExtras.reduce((o, fn) => Object.assign(o, fn(conv, me)), {}),
      } : conv.kind === 'group' ? { group: hooks.groupView(conv.group, me) } : { channel: conv.channel, serverId: conv.server.id }),
      messages: page, hasMore: older.length > page.length, authors,
    };
  });

  route('POST', `${prefix}/messages`, async ({ me, params, body }) => {
    const conv = resolve(me, params.target);
    const mode = conv.canWrite();
    const content = cleanContent(body, me);
    const gif = cleanGif(body.gif);
    if (!content && !gif && !body.attachmentIds?.length && !body.poll && !body.forward && !body.e2e && !body.sticker) fail(400, "You can't send an empty message.");
    if (body.attachmentIds?.length && conv.kind === 'channel' && !conv.perms.has('attach_files')) fail(403, "You don't have permission to attach files in this channel.");
    const replyTo = cleanReply(conv, body.replyTo);
    const command = botCommandFor(conv, me, content);
    const attachments = takeAttachments(me, body.attachmentIds, body.attachmentMeta);
    const extra = {};
    if (gif) extra.gif = gif;
    if (attachments) extra.attachments = attachments;
    if (replyTo) extra.replyTo = body.replyPing === false ? { ...replyTo, noPing: true } : replyTo; // (0.45.1) reply without pinging
    if (command) extra.command = { name: command.name, botId: command.botId };
    for (const fn of hooks.beforePost) fn({ conv, me, body, content, extra });
    if (!content && !extra.gif && !extra.attachments && !extra.poll && !extra.forward && !extra.e2e && !extra.sticker) fail(400, "You can't send an empty message.");
    if (mode === 'new-request') {
      const fresh = Date.now() - (me.createdAt || 0) < 3 * 864e5;
      limit('knock:' + me.id, fresh ? 5 : 20, 3600e3, fresh ? 'New accounts can message 5 new people an hour. Try again later.' : "You've messaged a lot of new people. Try again in a bit.");
      const spam = ({ ...PREF_DEFAULTS, ...(conv.other.prefs || {}) }).filterSpam !== false && looksLikeSpam(me, conv.other, content);
      conv.store().request = { from: me.id, to: conv.other.id, at: Date.now(), status: 'pending', spam };
      me.knocks = [...(me.knocks || []).filter(k => k.at > Date.now() - 3600e3), { at: Date.now(), text: content.slice(0, 80) }].slice(-30);
    }
    const message = postMessage(conv, me, content, extra);
    if (conv.kind === 'dm' && conv.other.id === BOT_ID) botReply(conv);
    const handled = hooks.afterPost.some(fn => fn({ conv, me, message, command }) === 'handled');
    // (0.45.1.1) Everyone in the channel sees "<bot> is thinking…" until it answers.
    if (command && !handled && conv.kind === 'channel') for (const id of conv.members) send(id, 'bot-thinking', { conv: conv.idFor(id), botId: command.botId, bot: publicUser(data.users[command.botId]) });
    if (command && !handled) send(command.botId, 'command', { serverId: conv.server.id, channelId: conv.channel.id, messageId: message.id, name: command.name, args: command.args, user: publicUser(me) });
    return { message, request: mode !== 'open' ? { direction: 'outgoing', status: 'pending', limit: REQUEST_LIMIT } : null };
  });

  route('PATCH', `${prefix}/messages/:msgId`, async ({ me, params, body }) => {
    const conv = resolve(me, params.target);
    const { st, i, m } = findMessage(conv, params.msgId);
    if (m.authorId !== me.id) fail(403, 'You can only change your own messages.');
    if (conv.kind === 'dm' && dmMode(me, conv.other) !== 'open') fail(403, "You can't edit messages in this chat right now.");
    if (conv.kind === 'channel' && !conv.perms.has('send_messages')) fail(403, "You can't edit messages here right now.");
    const content = cleanContent(body, me);
    const change = {};
    for (const fn of hooks.beforeEdit) fn({ conv, me, m, body, content, change });
    if (!content && !m.gif && !m.attachments && !change.e2e) fail(400, "A message can't be empty. Delete it instead.");
    // Edit history: earlier versions stay viewable (the last 10).
    const edits = m.e2e ? m.edits : [...(m.edits || []), { content: m.content, at: m.editedAt || m.createdAt }].slice(-10);
    const message = st.messages[i] = { ...m, content, editedAt: Date.now(), ...(edits ? { edits } : {}), ...change };
    save();
    emit(conv, 'message-update', { message });
    for (const fn of hooks.onEdit) fn(conv, message);
    return { message };
  });

  route('DELETE', `${prefix}/messages/:msgId`, async ({ me, params }) => {
    const conv = resolve(me, params.target);
    const { st, i, m } = findMessage(conv, params.msgId);
    if (m.authorId !== me.id && !conv.canModerate()) fail(403, 'You can only delete your own messages.');
    st.messages.splice(i, 1);
    for (const fn of hooks.onDelete) fn(conv, m);
    if (m.authorId !== me.id && conv.kind === 'channel') audit(conv.server, me, 'message_delete', { type: 'member', id: m.authorId, name: data.users[m.authorId]?.displayName || '?' }, `in #${conv.channel.name}: "${(m.content || '').slice(0, 80)}"`);
    save();
    emit(conv, 'message-delete', { id: params.msgId });
    return { ok: true };
  });

  // Add or remove your emoji reaction.
  route('POST', `${prefix}/messages/:msgId/react`, async ({ me, params, body }) => {
    const conv = resolve(me, params.target);
    if (conv.kind === 'dm') dmMode(me, conv.other) === 'open' || fail(403, 'You can react once they accept your message request.');
    const { st, i, m } = findMessage(conv, params.msgId);
    const emoji = String(body.emoji || '').trim();
    const customEmoji = /^<:[a-z0-9_]{2,32}:[a-z0-9]{8,48}\.(png|gif|webp|jpg)>$/i.test(emoji); // a server's own emoji
    if (!emoji || (!customEmoji && (emoji.length > 16 || /[<>\s]/.test(emoji)))) fail(400, "That isn't an emoji Zuno knows.");
    const reactions = { ...(m.reactions || {}) };
    if (!(emoji in reactions) && Object.keys(reactions).length >= 20) fail(400, 'This message already has 20 different reactions.');
    // Joining a reaction that's already there is fine; starting a new one needs "Add Reactions".
    if (!(emoji in reactions) && conv.kind === 'channel' && !conv.perms.has('add_reactions')) fail(403, "You don't have permission to add new reactions here.");
    const who = new Set(reactions[emoji] || []);
    who.has(me.id) ? who.delete(me.id) : who.add(me.id);
    if (who.size) reactions[emoji] = [...who]; else delete reactions[emoji];
    const message = st.messages[i] = { ...m, reactions };
    save();
    emit(conv, 'message-update', { message });
    for (const fn of hooks.onReact) fn({ conv, me, message, emoji, added: who.has(me.id) });
    return { message };
  });

  route('POST', `${prefix}/typing`, async ({ me, params }) => {
    const conv = resolve(me, params.target);
    if (conv.kind === 'group' || (conv.kind === 'channel' ? conv.perms.has('send_messages') : !isBlocked(me.id, conv.other.id) && (areFriends(me.id, conv.other.id) || conv.peek()?.accepted))) emitTyping(conv, me);
    return { ok: true };
  });

  route('POST', `${prefix}/read`, async ({ me, params, body }) => {
    const conv = resolve(me, params.target);
    // "at" moves your read marker back (Mark Unread); without it, everything is read.
    const at = Number(body?.at);
    me.lastRead[conv.key] = at > 0 && at < Date.now() ? at : Date.now(); save();
    for (const fn of hooks.onRead) fn(conv, me, me.lastRead[conv.key]);
    return { ok: true };
  });
}

// Accept, decline or sort a message request. Declining is silent: they aren't told.
route('POST', '/api/dms/:userId/request', async ({ me, params, body }) => {
  const dm = dmRecord(me.id, params.userId);
  const req = dm?.request;
  if (!req || req.to !== me.id) fail(404, 'That message request is gone.');
  const sender = data.users[req.from];
  const action = String(body.action || '');
  if (action === 'accept') {
    dm.accepted = true; delete dm.request;
    me.lastRead[dmKey(me.id, req.from)] = Date.now();
    send(req.from, 'request-accepted', { userId: me.id });
  } else if (action === 'decline') {
    req.status = 'declined'; req.declinedAt = Date.now();
    if (sender) sender.declinedBy = (sender.declinedBy || 0) + 1;
  } else if (action === 'spam' || action === 'notspam') {
    req.spam = action === 'spam';
    if (sender && action === 'spam') sender.spamMarks = (sender.spamMarks || 0) + 1;
  } else fail(400, 'Unknown action.');
  save();
  send(me.id, 'refresh', {});
  return { ok: true };
});
// Block: they can't message you, friend you or send requests. Unblocking doesn't bring old requests back.
route('POST', '/api/users/:id/block', async ({ me, params, body }) => {
  const other = data.users[params.id];
  if (!other || other.id === me.id || other.system) fail(400, "You can't block that account.");
  const set = new Set(me.blocked || []);
  if (body.on === false) set.delete(other.id);
  else {
    set.add(other.id);
    data.friendships = data.friendships.filter(([a, b]) => !((a === me.id && b === other.id) || (a === other.id && b === me.id)));
    for (const r of Object.values(data.friendRequests)) if ((r.from === me.id && r.to === other.id) || (r.from === other.id && r.to === me.id)) delete data.friendRequests[r.id];
    const dm = dmRecord(me.id, other.id);
    if (dm?.request?.to === me.id) { dm.request.status = 'declined'; dm.request.declinedAt = Date.now(); }
  }
  me.blocked = [...set];
  save(); refreshBoth(me.id, other.id);
  return { blocked: me.blocked };
});
route('GET', '/api/me/blocked', async ({ me }) => ({ users: (me.blocked || []).map(id => publicUser(data.users[id])).filter(Boolean) }));

// ---------- attachments ----------
route('POST', '/api/attachments', async ({ me, body, req }) => {
  if (!body.length) fail(400, 'That file is empty.');
  const name = clean(decodeURIComponent(req.headers['x-file-name'] || 'file'), 120).replace(/[\\/:*?"<>|]/g, '_') || 'file';
  const kind = sniff(body);
  // Pictures and videos show in the chat; anything else is a file to download.
  const isImage = kind && ['png', 'jpg', 'webp', 'gif', 'avif', 'bmp'].includes(kind.ext);
  const isVideo = !isImage && kind && (kind.ext === 'mp4' ? !/^M4[AB] /.test(body.slice(8, 12).toString('latin1')) : kind.ext === 'webm') && req.headers['x-voice'] !== '1';
  // Voice messages: recorded audio (WebM/Ogg, or MP4 audio from iPhones) with a length and a waveform.
  const isVoice = req.headers['x-voice'] === '1' && kind && ['webm', 'ogg', 'mp4'].includes(kind.ext);
  const id = newId() + crypto.randomBytes(4).toString('hex');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = isVoice ? (kind.ext === 'mp4' ? 'm4a' : kind.ext) : isImage || isVideo ? kind.ext : 'bin';
  const file = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), body);
  toCloud(file, body);
  const a = data.attachments[id] = {
    id, owner: me.id, name: isVoice ? 'voice-message.' + ext : name, size: body.length, kind: isVoice ? 'voice' : isImage ? 'image' : isVideo ? 'video' : 'file', createdAt: Date.now(),
    url: isImage || isVoice || isVideo ? `/uploads/${file}` : `/files/${id}/${encodeURIComponent(name)}`, file,
  };
  if (isVoice) {
    a.duration = Math.max(0, Math.min(600, Number(req.headers['x-duration']) || 0));
    a.wave = String(req.headers['x-wave'] || '').split(',').slice(0, 64).map(n => Math.max(0, Math.min(99, Number(n) || 0)));
  }
  save();
  return { attachment: { id: a.id, url: a.url, name: a.name, size: a.size, kind: a.kind, duration: a.duration, wave: a.wave } };
}, { raw: me => perksFor(me).upload });

// ---------- Bloom payments (Stripe) ----------
// Needs STRIPE_SECRET_KEY in the server's environment. The price ID is in package.json (zunoBloomPrice),
// and Zuno sets up its own Stripe webhook the first time it starts with a key.
const https = require('https');
const PUBLIC_URL = (process.env.ZUNO_PUBLIC_URL || PKG.zunoServer || '').replace(/\/$/, '');
let lastStripeError = '';
// A short, secret-free status for /api/version, so problems can be seen without the server logs.
function bloomSetupStatus() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return 'no-key';
  if (!/^(sk|rk)_(test|live)_/.test(key.trim())) return 'key-looks-wrong';
  if (key !== key.trim()) return 'key-has-spaces';
  if (!PRICE_ID()) return 'no-price';
  if (!webhookSecret()) return `webhook-not-ready${lastStripeError ? ': ' + lastStripeError : ''}`;
  return `ready (${key.includes('_test_') ? 'test' : 'live'} mode)`;
}
const PRICE_ID = () => process.env.STRIPE_PRICE_ID || PKG.zunoBloomPrice || '';
// The webhook secret comes from the environment, or from the webhook Zuno creates for itself (see ensureStripeWebhook).
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || data.stripeWebhook?.secret || '';
const stripeReady = () => !!(process.env.STRIPE_SECRET_KEY && PRICE_ID() && webhookSecret());
function stripe(method, pathname, params = {}) {
  const form = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.stripe.com', path: `/v1/${pathname}${method === 'GET' && form ? `?${form}` : ''}`, method,
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(method !== 'GET' ? { 'Content-Length': Buffer.byteLength(form) } : {}) },
      timeout: 15000,
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(raw); } catch { j = {}; }
        if (res.statusCode >= 400) { console.error('Stripe error:', j.error?.message || raw.slice(0, 300)); lastStripeError = String(j.error?.message || `HTTP ${res.statusCode}`).slice(0, 200); return reject(new HttpError(502, 'The payment service had a problem. Try again in a moment.')); }
        resolve(j);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', err => { console.error('Stripe request failed:', err.message); reject(new HttpError(502, "Couldn't reach the payment service. Try again in a moment.")); });
    if (method !== 'GET') req.write(form);
    req.end();
  });
}
function verifyStripe(raw, header) {
  const parts = Object.fromEntries(String(header || '').split(',').map(kv => kv.split('=')).filter(x => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || '').split(',').filter(kv => kv.startsWith('v1=')).map(kv => kv.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const expected = crypto.createHmac('sha256', webhookSecret()).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return sigs.some(sig => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
const ACTIVE_SUB = ['active', 'trialing', 'past_due'];
function applySubscription(sub) {
  const uid = sub.metadata?.userId;
  const u = (uid && data.users[uid]) || Object.values(data.users).find(x => x.bloom?.customerId && x.bloom.customerId === sub.customer);
  if (!u) return console.warn('Bloom: no Zuno account for subscription', sub.id);
  const was = bloomBefore(u);
  u.bloom ||= {};
  const end = (sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0) * 1000;
  u.bloom.customerId = sub.customer || u.bloom.customerId;
  u.bloom.subId = sub.id;
  u.bloom.status = sub.status;
  u.bloom.cancelAtEnd = !!sub.cancel_at_period_end;
  // A day of grace so a renewal that's a little late doesn't flicker Bloom off.
  u.bloom.paidUntil = ACTIVE_SUB.includes(sub.status) ? end + 24 * 3600e3 : Math.min(u.bloom.paidUntil || 0, Date.now());
  afterBloomChange(u, was, { paid: ACTIVE_SUB.includes(sub.status) });
}

route('GET', '/api/bloom', async ({ me }) => ({ available: stripeReady(), price: BLOOM_PRICE, perks: PERKS, earlyUntil: BLOOM_EARLY_UNTIL, status: bloomStatus(me) }));

route('POST', '/api/bloom/checkout', async ({ me }) => {
  if (!stripeReady()) fail(503, "Bloom isn't open for purchases yet. Check back soon!");
  if ((me.bloom?.paidUntil || 0) > Date.now()) fail(400, 'You already have Bloom. Use Manage to change it.');
  const p = {
    mode: 'subscription', 'line_items[0][price]': PRICE_ID(), 'line_items[0][quantity]': '1', 'payment_method_types[0]': 'card',
    success_url: `${PUBLIC_URL}/bloom/thanks`, cancel_url: `${PUBLIC_URL}/bloom/thanks?canceled=1`,
    client_reference_id: me.id, 'metadata[userId]': me.id, 'subscription_data[metadata][userId]': me.id, allow_promotion_codes: 'true',
  };
  if (me.bloom?.customerId) p.customer = me.bloom.customerId; else if (me.email) p.customer_email = me.email;
  let session;
  try { session = await stripe('POST', 'checkout/sessions', p); }
  catch (err) { if (isStaff(me) && lastStripeError) fail(502, `Stripe said: ${lastStripeError}`); throw err; }
  return { url: session.url };
});

route('POST', '/api/bloom/portal', async ({ me }) => {
  if (!stripeReady() || !me.bloom?.customerId) fail(400, "There's no Bloom purchase on this account to manage.");
  const session = await stripe('POST', 'billing_portal/sessions', { customer: me.bloom.customerId, return_url: `${PUBLIC_URL}/bloom/thanks?manage=1` });
  return { url: session.url };
});

route('POST', '/api/stripe/webhook', async ({ req, body }) => {
  if (!stripeReady()) fail(503, 'Not set up.');
  if (!verifyStripe(body, req.headers['stripe-signature'])) fail(400, 'Bad signature.');
  const ev = JSON.parse(body.toString('utf8'));
  data.stripeEvents ||= [];
  if (data.stripeEvents.includes(ev.id)) return { received: true };
  data.stripeEvents = [...data.stripeEvents.slice(-500), ev.id];
  const o = ev.data?.object || {};
  if (ev.type === 'checkout.session.completed' && o.metadata?.kind === 'gift') {
    if (o.payment_status === 'paid') deliverGift(o.metadata);
  } else if (ev.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const u = data.users[o.client_reference_id || o.metadata?.userId];
    if (u) { u.bloom ||= {}; u.bloom.customerId = o.customer; save(); }
    if (o.subscription) applySubscription(await stripe('GET', `subscriptions/${o.subscription}`));
  } else if (ev.type.startsWith('customer.subscription.')) {
    applySubscription(o);
  } else if (ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded') {
    const subId = o.subscription || o.parent?.subscription_details?.subscription;
    if (subId) applySubscription(await stripe('GET', `subscriptions/${subId}`));
  }
  return { received: true };
}, { auth: false, raw: 1_000_000 });

// ---- gifting Bloom to a friend (a one-time payment) ----
const GIFT_PLANS = { 1: 500, 3: 1500, 12: 6000 }; // months -> price in cents
route('POST', '/api/bloom/gift-checkout', async ({ me, body }) => {
  if (!stripeReady()) fail(503, "Bloom gifts aren't open yet. Check back soon!");
  const to = data.users[body.to];
  const months = Number(body.months);
  if (!to || to.system || to.bot || to.id === me.id) fail(400, 'Pick a friend to gift Bloom to.');
  if (!areFriends(me.id, to.id)) fail(403, 'You can gift Bloom to your friends.');
  if (!GIFT_PLANS[months]) fail(400, 'Pick 1, 3 or 12 months.');
  const session = await stripe('POST', 'checkout/sessions', {
    mode: 'payment', 'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(GIFT_PLANS[months]),
    'line_items[0][price_data][product_data][name]': `Zuno Bloom gift: ${months} month${months > 1 ? 's' : ''} for ${to.displayName}`,
    success_url: `${PUBLIC_URL}/bloom/thanks?gift=1`, cancel_url: `${PUBLIC_URL}/bloom/thanks?canceled=1`,
    client_reference_id: me.id,
    'metadata[kind]': 'gift', 'metadata[from]': me.id, 'metadata[to]': to.id, 'metadata[months]': String(months),
    ...(me.email ? { customer_email: me.email } : {}),
  });
  return { url: session.url };
});
function deliverGift(meta) {
  const from = data.users[meta.from], to = data.users[meta.to], months = Number(meta.months) || 1;
  if (!to) return console.warn('Bloom gift: recipient not found', meta);
  const was = bloomBefore(to);
  to.bloom ||= {};
  to.bloom.giftUntil = Math.max(to.bloom.giftUntil || 0, Date.now()) + months * MONTH;
  if (from && areFriends(from.id, to.id)) postMessage(dmConv(from, to.id), from, '', { bloomGift: { months, to: to.id } });
  systemMessage(to.id, `🎁 **${from?.displayName || 'A friend'} gifted you ${months} month${months > 1 ? 's' : ''} of Zuno Bloom!**\n\nYour Bloom perks are on now. Have fun with them!`);
  afterBloomChange(to, was);
  for (const fn of hooks.giftDelivered) fn(from, to, months);
}

// Zuno creates its own Stripe webhook so nobody has to copy a signing secret by hand.
const STRIPE_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid'];
async function ensureStripeWebhook() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || process.env.STRIPE_WEBHOOK_SECRET || !/^https:\/\//.test(PUBLIC_URL)) return;
  const url = `${PUBLIC_URL}/api/stripe/webhook`;
  const keyTag = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  const saved = data.stripeWebhook;
  if (saved && saved.url === url && saved.keyTag === keyTag && saved.secret) return;
  try {
    const list = await stripe('GET', 'webhook_endpoints', { limit: '100' });
    for (const ep of list.data || []) if (ep.url === url) await stripe('DELETE', `webhook_endpoints/${ep.id}`).catch(() => {});
    const params = { url, description: 'Zuno Bloom (made by the Zuno server)' };
    STRIPE_EVENTS.forEach((e, i) => { params[`enabled_events[${i}]`] = e; });
    const ep = await stripe('POST', 'webhook_endpoints', params);
    data.stripeWebhook = { id: ep.id, url, secret: ep.secret, keyTag };
    save();
    console.log('Stripe webhook is set up for Bloom.');
  } catch (err) {
    console.error('Could not set up the Stripe webhook yet:', err.message);
    setTimeout(ensureStripeWebhook, 60 * 1000);
  }
}
setTimeout(ensureStripeWebhook, 3000);

// ---------- reports & moderation ----------
data.reports ||= {};
data.modLog ||= [];
const REPORT_REASONS = {
  spam: 'Spam or scam', harassment: 'Harassment or bullying', hate: 'Hate speech', sexual: 'Sexual content',
  minor: 'Involves someone under 18', selfharm: 'Self-harm or suicide', violence: 'Threats or violence', other: 'Something else',
};
const FOREVER = 8.64e15;
const isSuspended = u => (u?.suspendedUntil || 0) > Date.now();
// (0.53) Report counts are tallied once per request instead of once per person on the list.
let reportTally = null, reportTallyAt = 0;
const reportsAgainst = uid => { if (!reportTally || Date.now() - reportTallyAt > 2000) { reportTally = new Map(); for (const r of Object.values(data.reports)) reportTally.set(r.targetUserId, (reportTally.get(r.targetUserId) || 0) + 1); reportTallyAt = Date.now(); } return reportTally.get(uid) || 0; };
const modUser = u => u && ({ ...publicUser(u), suspendedUntil: isSuspended(u) ? u.suspendedUntil : null, warnings: u.mod?.warnings || 0, reportsAgainst: reportsAgainst(u.id), createdAt: u.createdAt, banned: !!(u.banned && !u.banned.restored), restorable: !!(u.banned && !u.banned.restored && !u.banned.purged && u.banned.snapshot) });
function convOf(me, conv) { conv = String(conv); return conv.startsWith('ch:') ? channelConv(me, conv.slice(3)) : conv.startsWith('g:') ? groupConv(me, conv.slice(2)) : dmConv(me, conv); }
// Rebuild a conversation for staff from a report, without needing to be in it.
function staffConv(where) {
  if (where.kind === 'dm') { const [a, b] = where.members; return dmConv(data.users[a], b); }
  if (where.kind === 'group') { const g = data.groups[where.groupId]; return g ? { kind: 'group', key: 'g:' + g.id, group: g, members: g.members, peek: () => data.groupMessages[g.id], idFor: () => 'g:' + g.id } : null; }
  const { sv, ch } = findChannel(where.channelId);
  if (!sv) return null;
  return { kind: 'channel', key: 'ch:' + ch.id, server: sv, channel: ch, members: sv.members, peek: () => data.channelMessages[ch.id], idFor: () => 'ch:' + ch.id };
}
// A Zuno ban also deletes the account: it's renamed DELETED_USER_<numbers>, everything on its
// profile is cleared, and it's removed from every server, group and friend list. Their old
// messages stay (shown as DELETED_USER_...). The email can't be used to sign up again.
//
// Appeals: for APPEAL_DAYS after a ban, the person can still log in, but only to see why they
// were banned and send one appeal (server/appeals.js). If staff approve it, their name and profile
// come back (servers and friends don't). If it's denied, or the time runs out, the login is wiped
// for good (purgeBannedAccount).
const APPEAL_DAYS = CONFIG.APPEAL_DAYS;
const PROFILE_FIELDS = ['username', 'displayName', 'avatar', 'bio', 'pronouns', 'customStatus', 'profileBanner', 'profileBackground', 'profileSound', 'profileSoundName',
  'widgets', 'connections', 'decoration', 'profileEffect', 'nameColor', 'profileTheme', 'badgeGrants', 'birthday'];
function deleteBannedAccount(u, reason = '') {
  let tag;
  do tag = String(Math.floor(10000000 + Math.random() * 90000000)); while (Object.values(data.users).some(x => x.username === 'deleted_user_' + tag));
  if (u.email) { data.bannedEmails ||= []; data.bannedEmails.push(sha(u.email.toLowerCase())); }
  for (const sv of Object.values(data.servers)) {
    if (!sv.members.includes(u.id)) continue;
    if (sv.ownerId === u.id) {
      // The server carries on: the longest-standing other member becomes the owner.
      const next = sv.members.find(id => id !== u.id && !data.users[id]?.bot && !data.users[id]?.system);
      if (next) { sv.ownerId = next; systemMessage(next, `👑 You're now the owner of **${sv.name}**, because its owner's account was removed.`); }
    }
    if (sv.official) sv.removedUsers = [...new Set([...(sv.removedUsers || []), u.id])];
    removeMember(sv, u.id);
  }
  for (const g of Object.values(data.groups || {})) if (g.members.includes(u.id)) { g.members = g.members.filter(id => id !== u.id); if (g.ownerId === u.id) g.ownerId = g.members[0] || null; }
  const friends = friendIds(u.id);
  data.friendships = data.friendships.filter(f => !f.includes(u.id));
  for (const [id, r] of Object.entries(data.friendRequests)) if (r.from === u.id || r.to === u.id) delete data.friendRequests[id];
  const snapshot = Object.fromEntries(PROFILE_FIELDS.map(k => [k, u[k]]));
  u.banned = { at: Date.now(), reason: clean(reason, 300), snapshot, appealUntil: Date.now() + APPEAL_DAYS * 864e5, appeal: null };
  Object.assign(u, {
    username: 'deleted_user_' + tag, displayName: 'DELETED_USER_' + tag, deleted: true, deletedAt: Date.now(),
    avatar: null, bio: '', pronouns: '', customStatus: '', profileBanner: null, profileBackground: null, profileSound: null, profileSoundName: '',
    widgets: [], connections: [], decoration: null, profileEffect: null, nameColor: null, profileTheme: null, activity: null, status: 'offline', statusPref: 'offline',
    badgeGrants: [], favGifs: [], birthday: null, notes: {},
  });
  for (const id of friends) send(id, 'refresh', {});
  send(u.id, 'me', privateMe(u));
}
// The end of the road: the login is wiped and the saved profile thrown away.
function purgeBannedAccount(u) {
  if (!u?.banned || u.banned.purged) return;
  const snap = u.banned.snapshot || {};
  removeUpload(snap.profileBanner?.url); removeUpload(snap.profileBackground?.url); removeUpload(snap.profileSound);
  if (/^\/uploads\//.test(snap.avatar || '')) removeUpload(snap.avatar);
  Object.assign(u, { email: null, passwordHash: null, passkeys: [], twoFactor: null, recoveryCodes: [] });
  u.banned = { ...u.banned, snapshot: null, purged: true };
  endSessions(u.id);
  save();
}
// An approved appeal: the name and profile come back and the ban is lifted.
function restoreBannedAccount(u) {
  const snap = u.banned?.snapshot;
  if (!snap) fail(400, "This account can't be restored any more.");
  const taken = Object.values(data.users).some(x => x.id !== u.id && x.username === snap.username);
  Object.assign(u, snap, { deleted: false, deletedAt: undefined, suspendedUntil: 0 });
  if (taken) u.username = snap.username.slice(0, 26) + Math.floor(1000 + Math.random() * 9000);
  if (u.email) data.bannedEmails = (data.bannedEmails || []).filter(h => h !== sha(u.email.toLowerCase()));
  u.banned = { ...u.banned, snapshot: null, restored: true };
  save(); broadcastUser(u); send(u.id, 'me', privateMe(u));
  return taken;
}
// Every hour: logins whose appeal time ran out (with no appeal waiting) are wiped.
setInterval(() => {
  for (const u of Object.values(data.users)) if (u.banned && !u.banned.purged && !u.banned.restored && u.banned.appealUntil < Date.now() && u.banned.appeal?.status !== 'pending') purgeBannedAccount(u);
}, 3600e3).unref();
function modAction(staff, target, action, { days = 0, note = '', reportId = null } = {}) {
  if (!target || target.system || target.bot) fail(400, "That account can't be moderated.");
  if (target.id === staff.id) fail(400, "You can't moderate yourself.");
  staffGuard(staff, target);
  target.mod ||= {};
  const why = note ? `\n\nReason: ${note}` : '';
  if (action === 'warn') {
    target.mod.warnings = (target.mod.warnings || 0) + 1;
    systemMessage(target.id, `⚠️ **A warning from the Zuno team.**${why}\n\nPlease follow the Terms of Service: ${PUBLIC_URL}/terms. More problems can lead to a timeout or a ban.`);
  } else if (action === 'timeout' || action === 'ban') {
    const until = action === 'ban' ? FOREVER : Date.now() + Math.max(1, Math.min(365, Number(days) || 1)) * 864e5;
    target.suspendedUntil = until;
    systemMessage(target.id, action === 'ban'
      ? `⛔ **Your account has been banned from Zuno** for breaking the Terms of Service.${why}\n\nThink it was a mistake? You can send one appeal in the next ${APPEAL_DAYS} days.`
      : `⏸️ **Your account is in a timeout for ${Math.round((until - Date.now()) / 864e5)} day(s).** You can read, but not send messages or make changes until it ends. The exact end time shows at the bottom of Zuno.${why}`);
    for (const id of userRooms(target.id)) leaveRoom(id, target.id);
    if (action === 'ban') deleteBannedAccount(target, note);
  } else if (action === 'unban') {
    // (0.53) Staff can lift a Zuno ban: the name and profile come back (servers and friends don't).
    if (!target.banned || target.banned.restored) fail(400, "They aren't banned.");
    if (target.banned.purged || !target.banned.snapshot) fail(400, 'This account was wiped after its ban, so it can\'t come back.');
    if (target.banned.appeal?.status === 'pending') target.banned.appeal = { ...target.banned.appeal, status: 'approved', decidedBy: staff.id, decidedAt: Date.now() };
    restoreBannedAccount(target);
    systemMessage(target.id, `✅ **Your Zuno ban was lifted.** Welcome back. Your name and profile are restored (servers and friends need re-adding).${why}`);
  } else if (action === 'unsuspend') {
    if (target.deleted) fail(400, "This account was deleted when it was banned. Use Unban to bring it back.");
    target.suspendedUntil = 0;
    systemMessage(target.id, '✅ **Your account is back to normal.** Thanks for your patience.');
  } else fail(400, 'Unknown action.');
  data.modLog.push({ at: Date.now(), by: staff.id, action, target: target.id, days: action === 'timeout' ? Number(days) || 1 : undefined, note: clean(note, 300), reportId });
  data.modLog = data.modLog.slice(-1000);
  save();
  send(target.id, 'me', privateMe(target));
  broadcastUser(target);
}

// How a message looks to staff in a report.
function reportSnap(x, revealed = {}) {
  const out = { id: x.id, authorId: x.authorId, content: x.content, gif: x.gif, sticker: x.sticker, attachments: x.attachments, createdAt: x.createdAt, e2eNotice: x.e2eNotice };
  if (x.e2e) { out.e2e = true; out.content = revealed[x.id] ?? ''; out.unlocked = x.id in revealed; }
  return out;
}
// Unlock one encrypted message with its message key (AES-256-GCM, as the app encrypts it).
function revealE2e(e, keyB64) {
  try {
    const key = Buffer.from(String(keyB64), 'base64url'), iv = Buffer.from(e.iv, 'base64url'), ct = Buffer.from(e.ct, 'base64url');
    if (key.length !== 32 || ct.length < 17) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(ct.subarray(ct.length - 16));
    return clean(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'), 4000);
  } catch { return null; }
}
route('POST', '/api/reports', async ({ me, body }) => {
  const reason = String(body.reason || '');
  if (!REPORT_REASONS[reason]) fail(400, 'Pick a reason for the report.');
  const conv = convOf(me, body.conv);
  const { st, i, m } = findMessage(conv, String(body.messageId || ''));
  if (m.authorId === me.id) fail(400, "You can't report your own message.");
  if (Object.values(data.reports).some(r => r.reporterId === me.id && r.message.id === m.id)) fail(400, "You've already reported this message. The Zuno team will look at it.");
  // Encrypted messages: the reporter's device hands over the keys to the reported message and the
  // ones before it. Zuno unlocks the stored scrambled text with them, so what staff read is exactly
  // what was sent (a made-up message wouldn't unlock).
  const revealed = {};
  for (const k of (Array.isArray(body.keys) ? body.keys : []).slice(0, 40)) {
    const x = st.messages.find(y => y.id === k?.id);
    const text = x?.e2e && revealE2e(x.e2e, k.key);
    if (text != null) revealed[x.id] = text;
  }
  const id = newId();
  data.reports[id] = {
    id, reporterId: me.id, targetUserId: m.authorId, reason, details: clean(body.details, 1000),
    where: conv.kind === 'dm' ? { kind: 'dm', members: conv.members } : conv.kind === 'group' ? { kind: 'group', groupId: conv.group.id, name: conv.group.name || 'a group' } : { kind: 'channel', channelId: conv.channel.id, serverId: conv.server.id, name: `#${conv.channel.name} in ${conv.server.name}` },
    message: reportSnap(m, revealed), context: st.messages.slice(Math.max(0, i - 4), i).map(x => reportSnap(x, revealed)),
    revealed, status: 'open', createdAt: Date.now(),
  };
  save();
  for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'reports', {});
  return { ok: true };
});

// "View related conversation": the messages around a reported one, with pictures and videos, so
// staff see what led up to it. Encrypted messages show only if the reporter's keys unlocked them.
route('GET', '/api/mod/reports/:id/context', async ({ me, params }) => {
  needStaff(me);
  const r = data.reports[params.id];
  if (!r) fail(404, 'That report no longer exists.');
  const msgs = staffConv(r.where)?.peek()?.messages || [];
  let at = msgs.findIndex(x => x.id === r.message.id);
  if (at < 0) at = msgs.findIndex(x => x.createdAt > r.message.createdAt) - 1;
  // At most 35 messages: mostly what came before the reported one, and a few after.
  const start = Math.max(0, at - 27);
  const list = at < -1 || !msgs.length ? [...r.context, r.message] : msgs.slice(start, start + 35).map(x => reportSnap(x, r.revealed || {}));
  if (!list.some(x => x.id === r.message.id)) list.push(r.message);
  list.sort((a, b) => a.createdAt - b.createdAt);
  const media = list.flatMap(x => (x.attachments || []).filter(a => a.kind === 'image' || a.kind === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(a.name || '')).map(a => ({ ...a, msgId: x.id, authorId: x.authorId, createdAt: x.createdAt })));
  return { messages: list, reportedId: r.message.id, media, authors: Object.fromEntries(list.map(x => [x.authorId, publicUser(data.users[x.authorId])])), where: r.where };
});

const reportView = r => ({ ...r, reasonLabel: REPORT_REASONS[r.reason], reporter: publicUser(data.users[r.reporterId]), target: modUser(data.users[r.targetUserId]), assignedStaff: publicUser(data.users[r.assignedTo]),
  internalNotes: (r.internalNotes || []).map(n => ({ ...n, staff: publicUser(data.users[n.by]) })),
  stillThere: !!staffConv(r.where)?.peek()?.messages.some(x => x.id === r.message.id),
  authors: Object.fromEntries([r.message, ...r.context].map(x => [x.authorId, publicUser(data.users[x.authorId])])) });
// (security) The Zuno Official session talks as Zuno; it can't use staff tools.
const needStaff = me => { if (!isStaff(me) || me.system) fail(403, 'Only Zuno Staff can do that.'); };
// The founder is above every other staff member: nobody else can use staff tools on veil, and only the founder
// can use them on other staff.
function staffGuard(me, u) {
  if (!u || u.id === me.id) return;
  if (isFounder(u.id) && !isFounder(me.id)) fail(403, "Only the founder can do that to the founder's account.");
  if (isManager(u) && !isFounder(me.id)) fail(403, 'Only the founder can do that to a Zuno Manager.');
  if (isStaff(u) && !overStaff(me)) fail(403, 'Only the founder or a Zuno Manager can do that to other staff.');
}
// Everything other staff do with staff tools, or in servers they don't own, goes to the founder right away.
function founder() { const u = userByName(CONFIG.FOUNDER); return u && !u.bot ? u : null; }
function tellFounder(actor, text, extra = {}) {
  const f = founder();
  if (!f || !actor || actor.id === f.id || actor.system || !isStaff(actor)) return;
  data.staffLog = [...(data.staffLog || []).slice(-499), { at: Date.now(), by: actor.id, text }];
  ctx2.notify?.(f.id, { type: 'staff', from: actor.id, title: 'Staff activity', text, ...extra });
  send(f.id, 'staff-activity', { by: publicUser(actor), text });
}
const nameOf = id => (data.users[id] ? '@' + data.users[id].username : 'someone');
function describeStaffAction(method, p, body, params) {
  let m;
  if ((m = /^\/api\/mod\/users\/([^/]+)$/.exec(p))) return `used "${String(body.action || '')}" on ${nameOf(m[1])}${body.note ? ` (${String(body.note).slice(0, 80)})` : ''}`;
  if ((m = /^\/api\/mod\/users\/([^/]+)\/reset-link$/.exec(p))) return `made a password reset link for ${nameOf(m[1])}`;
  if ((m = /^\/api\/mod\/users\/([^/]+)\/2fa-off$/.exec(p))) return `turned off two-factor login for ${nameOf(m[1])}`;
  if ((m = /^\/api\/users\/([^/]+)\/badges$/.exec(p))) return `${body.on ? 'gave' : 'removed'} the ${String(body.badge || '')} badge ${body.on ? 'to' : 'from'} ${nameOf(m[1])}`;
  if (/^\/api\/mod\/reports\//.test(p)) return `handled a report${body.action ? ` (${String(body.action)})` : ''}`;
  if (/^\/api\/bugs\//.test(p) && method !== 'POST') return 'updated a bug report';
  if (/^\/api\/status\/incidents/.test(p)) return method === 'POST' ? 'posted a status incident' : 'updated a status incident';
  if (/^\/api\/staff\/maintenance$/.test(p)) return method === 'DELETE' ? 'cancelled the maintenance notice' : 'scheduled a maintenance notice';
  if (/^\/api\/creations\/[^/]+\/review$/.test(p)) return `${body.approve ? 'approved' : 'turned down'} a Community creation${body.reason ? ` (${String(body.reason).slice(0, 80)})` : ''}`;
  if (/^\/api\/creator\/[^/]+\/review$/.test(p)) return `${body.approve ? 'approved' : 'turned down'} a Verified Creator application`;
  if (/^\/api\/suggestions\//.test(p) && method !== 'POST') return 'updated a suggestion';
  if (/^\/api\/appeals\//.test(p)) return 'handled an appeal';
  if (/^\/api\/(mod|staff|admin)\//.test(p)) return `${method} ${p}`;
  return null;
}

route('GET', '/api/mod/reports', async ({ me, query }) => {
  needStaff(me);
  const status = query.get('status') || 'open';
  const list = Object.values(data.reports).filter(r => status === 'all' || r.status === status).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  const counts = { open: Object.values(data.reports).filter(r => r.status === 'open').length };
  return { reports: list.map(reportView), counts };
});
route('POST', '/api/mod/reports/:id', async ({ me, params, body, token }) => {
  needStaff(me);
  if (body.action === 'ban') needReauth(token);
  const r = data.reports[params.id];
  if (!r) fail(404, 'Report not found.');
  const action = String(body.action || '');
  const note = clean(body.note, 300);
  // Triage: claim a report (so two people don't work on it), release it, or leave a note only staff
  // can see. The report stays open.
  if (action === 'claim' || action === 'unclaim') {
    if (action === 'claim') r.assignedTo = me.id;
    else if (!r.assignedTo || r.assignedTo === me.id || isFounder(me.id)) r.assignedTo = null;
    else fail(403, 'Only the assigned moderator or founder can unassign this report.');
    r.triageUpdatedAt = Date.now();
    data.modLog.push({ at: Date.now(), by: me.id, action: action === 'claim' ? 'claim-report' : 'unclaim-report', target: r.targetUserId, reportId: r.id });
    data.modLog = data.modLog.slice(-1000);
    save();
    for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'reports', {});
    tellFounder(me, `${action === 'claim' ? 'claimed' : 'unassigned'} report ${r.id}`);
    return { report: reportView(r) };
  }
  if (action === 'note') {
    if (!note) fail(400, 'Write an internal note first.');
    r.internalNotes ||= [];
    r.internalNotes.push({ id: newId(), by: me.id, at: Date.now(), text: note });
    r.internalNotes = r.internalNotes.slice(-50);
    r.triageUpdatedAt = Date.now();
    data.modLog.push({ at: Date.now(), by: me.id, action: 'report-note', target: r.targetUserId, note, reportId: r.id });
    data.modLog = data.modLog.slice(-1000);
    save();
    for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'reports', {});
    tellFounder(me, `added an internal note to report ${r.id}`);
    return { report: reportView(r) };
  }
  if (action === 'delete' || body.deleteMessage) {
    const conv = staffConv(r.where);
    const st = conv?.peek();
    const i = st ? st.messages.findIndex(x => x.id === r.message.id) : -1;
    if (i >= 0) { st.messages.splice(i, 1); emit(conv, 'message-delete', { id: r.message.id }); }
  }
  if (['warn', 'timeout', 'ban'].includes(action)) modAction(me, data.users[r.targetUserId], action, { days: body.days, note, reportId: r.id });
  if (!['dismiss', 'delete', 'warn', 'timeout', 'ban'].includes(action)) fail(400, 'Unknown action.');
  r.status = 'resolved';
  r.resolution = { action, by: me.id, at: Date.now(), note, days: action === 'timeout' ? Number(body.days) || 1 : undefined, deletedMessage: action === 'delete' || !!body.deleteMessage };
  if (action === 'delete' || action === 'dismiss') data.modLog.push({ at: Date.now(), by: me.id, action: action === 'delete' ? 'delete-message' : 'dismiss', target: r.targetUserId, note, reportId: r.id });
  const reporter = data.users[r.reporterId];
  if (reporter && action !== 'dismiss') systemMessage(reporter.id, '🛡️ Thanks for your report. The Zuno team looked at it and took action.');
  save();
  for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'reports', {});
  return { report: reportView(r) };
});
route('GET', '/api/mod/users', async ({ me, query }) => {
  needStaff(me);
  const q = clean(query.get('q'), 32).toLowerCase().replace(/^@/, '');
  let list = Object.values(data.users).filter(u => !u.system && !u.bot);
  if (q) list = list.filter(u => u.username.includes(q) || u.displayName.toLowerCase().includes(q));
  else list = list.filter(u => isSuspended(u) || u.mod?.warnings);
  return { users: list.slice(0, 40).map(modUser) };
});
route('POST', '/api/mod/users/:id', async ({ me, params, body, token }) => {
  needStaff(me);
  if (body.action === 'ban') needReauth(token); // a ban deletes the account: confirm it's really you
  modAction(me, data.users[params.id], String(body.action || ''), { days: body.days, note: clean(body.note, 300) });
  return { user: modUser(data.users[params.id]) };
});
route('GET', '/api/mod/log', async ({ me }) => {
  needStaff(me);
  return { log: data.modLog.slice(-100).reverse().map(e => ({ ...e, byUser: publicUser(data.users[e.by]), targetUser: publicUser(data.users[e.target]) })) };
});

// ---- Unchecked Pings ----
function inboxFor(u) {
  const live = (u.inbox || []).filter(p => {
    const { sv, ch } = findChannel(p.channelId);
    return sv && sv.members.includes(u.id) && canView(sv, ch, u.id) && (data.channelMessages[ch.id]?.messages || []).some(m => m.id === p.id);
  });
  if (live.length !== (u.inbox || []).length) { u.inbox = live; save(); }
  return live;
}
route('GET', '/api/me/inbox', async ({ me }) => ({
  pings: inboxFor(me).slice().reverse().map(p => {
    const { sv, ch } = findChannel(p.channelId);
    const m = data.channelMessages[ch.id].messages.find(x => x.id === p.id);
    return { ...p, serverName: sv.name, serverIcon: sv.icon || null, serverColor: sv.iconColor, channelName: ch.name, author: publicUser(data.users[p.authorId]), snippet: (m.content || (m.gif ? 'GIF' : m.attachments ? 'Attachment' : '')).slice(0, 160) };
  }),
}));
route('POST', '/api/me/inbox/seen', async ({ me, body }) => {
  const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
  const all = body.all ? String(body.all) : null; // "all" or a server id
  me.inbox = (me.inbox || []).filter(p => !(ids.has(p.id) || all === 'all' || p.serverId === all));
  save();
  return { count: me.inbox.length };
});

// ---- Account standing: your own moderation status ----
route('GET', '/api/me/standing', async ({ me }) => {
  const history = data.modLog.filter(e => e.target === me.id && e.action !== 'dismiss')
    .map(e => ({ action: e.action, at: e.at, note: e.note || '', days: e.days })).reverse().slice(0, 50);
  const recentWarnings = history.filter(e => e.action === 'warn' && e.at > Date.now() - 90 * 864e5).length; // warnings fade after 90 days
  const status = me.suspendedUntil >= FOREVER ? 'banned' : isSuspended(me) ? 'timeout' : recentWarnings ? 'warned' : 'good';
  return { status, suspendedUntil: isSuspended(me) ? me.suspendedUntil : null, warnings: recentWarnings, history };
});

// ---- find people on Zuno ----
route('GET', '/api/people/search', async ({ me, query }) => {
  const q = clean(query.get('q'), 32).toLowerCase().replace(/^@/, '');
  if (q.length < 2) return { users: [] };
  const mine = new Set(Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => sv.id));
  // Matches the username, the display name (accents ignored: "jose" finds "José"), a username the
  // person changed in the last month, and their nickname in a server you share.
  const fold = t => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fq = fold(q), MONTH = 30 * 864e5;
  const shared = Object.values(data.servers).filter(sv => mine.has(sv.id));
  const names = u => [u.username, fold(u.displayName), ...(u.pastUsernames || []).filter(p => Date.now() - (p.until || 0) < MONTH).map(p => p.name), ...shared.map(sv => fold(sv.nicks?.[u.id])).filter(Boolean)];
  const rank = u => (u.username === q ? 0 : u.username.startsWith(q) ? 1 : fold(u.displayName).startsWith(fq) ? 2 : 3);
  const users = Object.values(data.users)
    .filter(u => u.id !== me.id && !u.system && !u.webhook && !u.deleted && !(u.bot && u.id !== BOT_ID) && !isBlocked(me.id, u.id) && names(u).some(n => n.includes(fq)))
    .sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username))
    .slice(0, 15)
    .map(u => ({ ...publicUser(u), relationship: relationship(me.id, u.id), mutualServers: Object.values(data.servers).filter(sv => mine.has(sv.id) && sv.members.includes(u.id)).length }));
  return { users };
});

// ---- favorite GIFs, saved to the account so they follow you everywhere ----
route('PUT', '/api/me/fav-gifs', async ({ me, body }) => {
  const list = Array.isArray(body.gifs) ? body.gifs.slice(0, 100) : [];
  const out = [];
  for (const g of list) { try { const c = cleanGif(g); if (c && !out.some(x => x.url === c.url)) out.push(c); } catch {} }
  me.favGifs = out;
  save();
  return { favGifs: out };
});

// Only the founder can gift Bloom (staff used to be able to): { days } adds that many days, { days: 0 } removes gifted time.
route('POST', '/api/users/:id/bloom', async ({ me, params, body }) => {
  if (!isFounder(me.id)) fail(403, 'Only the founder can gift Bloom.');
  const u = data.users[params.id];
  if (!u || u.system || u.bot) fail(404, "That account can't have Bloom.");
  const days = Math.max(0, Math.min(366, Math.round(Number(body.days) || 0)));
  const was = bloomBefore(u);
  u.bloom ||= {};
  u.bloom.giftUntil = days ? Math.max(u.bloom.giftUntil || 0, Date.now()) + days * 24 * 3600e3 : 0;
  if (days && !was) systemMessage(u.id, `🎁 **${me.displayName} gifted you ${days} days of Zuno Bloom!**`);
  afterBloomChange(u, was);
  return { user: publicUser(u), bloom: bloomStatus(u) };
});

// ---------- GIFs (from KLIPY; the key stays on the server) ----------
const gifCache = new Map(); // query -> { at, results }
// KLIPY's results have nested size/format objects; find the GIF links in them without depending on exact names.
function gifLinks(obj) {
  const out = [];
  const walk = (o, trail) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.url === 'string' && /\.(gif|webp)(\?|$)/i.test(o.url)) out.push({ url: o.url, w: Number(o.width) || 0, h: Number(o.height) || 0, trail });
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, trail + '/' + k);
  };
  walk(obj, '');
  return out;
}
function normalizeGif(item) {
  if (!item || item.type === 'ad') return null;
  const links = gifLinks(item.file || item.files || item.media_formats || item).filter(l => /gif/i.test(l.url) || /gif/.test(l.trail));
  if (!links.length) return null;
  const pick = re => links.find(l => re.test(l.trail));
  const full = pick(/\/(md|hd)\//) || pick(/mediumgif|\/gif$/) || links[0];
  const small = pick(/\/(sm|xs)\//) || pick(/tinygif|nanogif/) || full;
  return { id: String(item.slug || item.id || full.url), url: full.url, preview: small.url, w: full.w || small.w, h: full.h || small.h, title: String(item.title || item.content_description || '').slice(0, 120) };
}
route('GET', '/api/gifs', async ({ me, query }) => {
  limit('gifs:' + me.id, 40, 60e3, "You're searching GIFs too fast.");
  const key = process.env.KLIPY_KEY || process.env.KLIP_KEY;
  if (!key) fail(503, 'GIFs are almost ready. Zuno is waiting for its GIF key.');
  const q = clean(query.get('q'), 80);
  const page = Math.max(1, Math.min(20, Number(query.get('page')) || 1));
  const cacheKey = `${q}|${page}`;
  const hit = gifCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.data;
  const params = new URLSearchParams({ per_page: '30', page: String(page), customer_id: me.id, locale: 'en_US', rating: 'pg-13' });
  if (q) params.set('q', q);
  const url = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${q ? 'search' : 'trending'}?${params}`;
  let json;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('status ' + r.status);
    json = await r.json();
  } catch (err) {
    console.warn('GIF search failed:', err.message);
    fail(502, "Couldn't load GIFs right now. Try again in a moment.");
  }
  const items = json?.data?.data || json?.data || json?.results || [];
  const results = (Array.isArray(items) ? items : []).map(normalizeGif).filter(Boolean);
  const data = { results, hasMore: !!(json?.data?.has_next) };
  gifCache.set(cacheKey, { at: Date.now(), data });
  if (gifCache.size > 300) gifCache.delete(gifCache.keys().next().value);
  return data;
});

// ---------- bug reports ----------
data.bugs ||= {};
const BUG_STATUS = ['new', 'acknowledged', 'fixed', 'not-a-bug'];
const BUG_LABEL = { new: 'New', acknowledged: 'Acknowledged', fixed: 'Fixed', 'not-a-bug': 'Not a bug' };
const BUG_CATEGORY = ['important', 'minor', 'cosmetic'];
const bugView = b => ({ ...b, reporter: publicUser(data.users[b.reporterId]) });
route('POST', '/api/bugs', async ({ me, body }) => {
  limit('bugs:' + me.id, 5, 60 * 60e3, "You've sent a lot of reports this hour. Thank you! Try again a bit later.");
  const title = clean(body.title, 100), details = clean(body.details, 2000), steps = clean(body.steps, 1000);
  if (title.length < 4) fail(400, 'Give the bug a short title.');
  if (details.length < 10) fail(400, 'Tell us a little more about what happened.');
  // Up to 6 screenshots (older apps send just one, as screenshotId).
  const shotIds = [...new Set([...(Array.isArray(body.screenshotIds) ? body.screenshotIds : []), ...(body.screenshotId ? [body.screenshotId] : [])])].slice(0, 6);
  const screenshots = shotIds.map(sid => {
    const a = data.attachments[sid];
    if (!a || a.owner !== me.id || a.kind !== 'image') fail(400, 'Screenshots need to be images.');
    return a;
  }).map(a => { a.used = true; return a.url; });
  const screenshot = screenshots[0];
  const id = newId();
  const category = BUG_CATEGORY.includes(body.category) ? body.category : 'minor';
  data.bugs[id] = { id, reporterId: me.id, title, details, steps, screenshot, screenshots: screenshots.length > 1 ? screenshots : undefined, category, version: clean(body.version, 20), platform: clean(body.platform, 60), status: 'new', createdAt: Date.now() };
  save();
  for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'bugs', {});
  return { bug: bugView(data.bugs[id]) };
});
route('GET', '/api/bugs', async ({ me, query }) => {
  const all = query.get('all') === '1';
  if (all && (!isStaff(me) || me.system)) fail(403, 'Only Zuno Staff can see every report.');
  const list = Object.values(data.bugs).filter(b => all || b.reporterId === me.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  return { bugs: list.map(bugView) };
});
route('PATCH', '/api/bugs/:id', async ({ me, params, body }) => {
  if (!isStaff(me) || me.system) fail(403, 'Only Zuno Staff can review reports.');
  const b = data.bugs[params.id];
  if (!b) fail(404, 'That report no longer exists.');
  // Dismissing (or changing the category) just tidies the inbox: the reporter isn't told.
  if ('dismissed' in body || ('category' in body && !('status' in body))) {
    if ('dismissed' in body) { b.dismissed = !!body.dismissed; b.dismissedBy = b.dismissed ? me.id : undefined; }
    if (BUG_CATEGORY.includes(body.category)) b.category = body.category;
    save();
    for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'bugs', {});
    return { bug: bugView(b) };
  }
  if (!BUG_STATUS.includes(body.status)) fail(400, 'Unknown status.');
  const was = b.status;
  b.status = body.status;
  if ('note' in body) b.note = clean(body.note, 500);
  b.reviewedBy = me.id; b.reviewedAt = Date.now();
  const reporter = data.users[b.reporterId];
  if (reporter && was !== b.status) {
    let earned = false, senior = false, veteran = false;
    const confirmed = st => ['acknowledged', 'fixed'].includes(st);
    // Confirmed reports are counted, and the 5th one earns the golden Senior Bug Hunter badge.
    if (confirmed(b.status) !== confirmed(was)) {
      const n0 = reporter.bugsConfirmed || 0;
      reporter.bugsConfirmed = Math.max(0, n0 + (confirmed(b.status) ? 1 : -1));
      senior = n0 < BADGE_RULES.seniorBugs && reporter.bugsConfirmed >= BADGE_RULES.seniorBugs;
      veteran = n0 < BADGE_RULES.veteranBugs && reporter.bugsConfirmed >= BADGE_RULES.veteranBugs;
    }
    if (confirmed(b.status)) {
      const grants = new Set(reporter.badgeGrants || []);
      const has = badgesFor(reporter);
      if (!has.includes('bughunter') && !has.includes('bughunter_senior') && !has.includes('bughunter_veteran')) { grants.add('bughunter'); earned = true; }
      reporter.badgeGrants = [...grants];
      reporter.badgeRemovals = (reporter.badgeRemovals || []).filter(x => x !== 'bughunter');
    }
    const lines = [`Your bug report **${b.title}** is now marked **${BUG_LABEL[b.status]}**.`];
    if (b.note) lines.push(`Note from the team: ${b.note}`);
    if (veteran) lines.push(`That's ${BADGE_RULES.veteranBugs} confirmed reports! You earned the **Veteran Bug Hunter** badge, forged in obsidian. 🌌🐛`);
    else if (senior) lines.push(`That's ${BADGE_RULES.seniorBugs} confirmed reports! You earned the golden **Senior Bug Hunter** badge. 🏆🐛`);
    else if (earned) lines.push('You earned the **Bug Hunter** badge. Thanks for helping make Zuno better! 🐛');
    const n = reporter.bugsConfirmed || 0;
    if (confirmed(b.status) && !senior && !veteran) {
      if (n < BADGE_RULES.seniorBugs) lines.push(`${BADGE_RULES.seniorBugs - n} more confirmed report${BADGE_RULES.seniorBugs - n === 1 ? '' : 's'} until the golden **Senior Bug Hunter** badge. 🏆`);
      else if (n < BADGE_RULES.veteranBugs) lines.push(`${BADGE_RULES.veteranBugs - n} more confirmed report${BADGE_RULES.veteranBugs - n === 1 ? '' : 's'} until the obsidian **Veteran Bug Hunter** badge. 🌌`);
    }
    systemMessage(reporter.id, lines.join('\n\n'));
    broadcastUser(reporter);
  }
  save();
  for (const u of Object.values(data.users)) if (isStaff(u) && !u.system) send(u.id, 'bugs', {});
  return { bug: bugView(b) };
});

// ---------- servers ----------
const SERVER_COLORS = ['#04c5ae', '#3aaefc', '#a37bff', '#ff7b6b', '#f0b232', '#23a55a', '#eb459e', '#e67e22'];
const channelName = (v, type) => {
  const n = clean(v, 32);
  return type === 'text' ? n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_\-À-￿]/g, '').slice(0, 32) : n;
};
function findChannel(channelId) {
  for (const sv of Object.values(data.servers)) {
    const ch = sv.channels.find(c => c.id === channelId);
    if (ch) return { sv, ch };
  }
  return {};
}
function getServer(me, id, { owner = false } = {}) {
  const sv = data.servers[id];
  if (!sv || !sv.members.includes(me.id)) fail(404, 'Server not found.');
  if (owner && sv.ownerId !== me.id) fail(403, 'Only the server owner can do that.');
  return sv;
}
const SLOWMODES = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
const lastPost = new Map(); // "channel|user" -> time, for slowmode
// The longest slowmode is 6 hours, so anything older than that can be forgotten.
setInterval(() => { const cutoff = Date.now() - 6 * 3600e3; for (const [k, at] of lastPost) if (at < cutoff) lastPost.delete(k); }, 10 * 60e3).unref();

// ---- roles & permissions ----
// Everything a role can allow. Checked on the server for every action, not just hidden in the app.
const PERM_INFO = {
  administrator: { label: 'Administrator', group: 'Advanced' },
  view_channels: { label: 'View Channels', group: 'General', channel: true },
  manage_channels: { label: 'Manage Channels', group: 'General', channel: true },
  manage_roles: { label: 'Manage Roles & Permissions', group: 'General', channel: true },
  manage_server: { label: 'Manage Server', group: 'General' },
  view_audit_log: { label: 'View Audit Log', group: 'General' },
  manage_integrations: { label: 'Manage Bots & Webhooks', group: 'General' },
  create_invites: { label: 'Create Invites', group: 'Members', channel: true },
  manage_invites: { label: 'Manage Invites', group: 'Members' },
  kick_members: { label: 'Kick Members', group: 'Members' },
  ban_members: { label: 'Ban Members', group: 'Members' },
  send_messages: { label: 'Send Messages', group: 'Text', channel: true },
  attach_files: { label: 'Attach Files', group: 'Text', channel: true },
  add_reactions: { label: 'Add Reactions', group: 'Text', channel: true },
  mention_everyone: { label: 'Mention @everyone and All Roles', group: 'Text', channel: true },
  manage_messages: { label: 'Manage Messages', group: 'Text', channel: true },
  read_history: { label: 'Read Message History', group: 'Text', channel: true },
  bypass_slowmode: { label: 'Bypass Slowmode', group: 'Text', channel: true },
  use_commands: { label: 'Use Bot Commands', group: 'Text', channel: true },
  connect: { label: 'Connect to Voice', group: 'Voice', channel: true },
  speak: { label: 'Speak', group: 'Voice', channel: true },
  video: { label: 'Video & Screen Share', group: 'Voice', channel: true },
};
const PERM_KEYS = Object.keys(PERM_INFO);
const DEFAULT_EVERYONE = ['view_channels', 'create_invites', 'send_messages', 'attach_files', 'add_reactions', 'read_history', 'use_commands', 'connect', 'speak', 'video'];
const MOD_PERMS = [...DEFAULT_EVERYONE, 'manage_messages', 'kick_members', 'ban_members', 'view_audit_log', 'bypass_slowmode', 'mention_everyone', 'manage_invites'];
const ROLE_COLOR_RE = /^#[0-9a-f]{6}$/i;
const cleanPerms = (list, channelOnly = false) => [...new Set((Array.isArray(list) ? list : []).filter(p => PERM_INFO[p] && (!channelOnly || PERM_INFO[p].channel)))];

// Older servers had a simple "mods" list. They become a Moderator role the first time Zuno sees them.
function ensureRoles(sv) {
  if (!Array.isArray(sv.roles) || !sv.roles.length) {
    sv.roles = [{ id: sv.id, name: '@everyone', color: null, perms: [...DEFAULT_EVERYONE], everyone: true }];
    sv.memberRoles = {};
    if ((sv.mods || []).length) {
      const r = { id: newId(), name: 'Moderator', color: '#3aaefc', perms: [...MOD_PERMS], hoist: true, mentionable: true };
      sv.roles.unshift(r);
      for (const uid of sv.mods) if (sv.members.includes(uid)) sv.memberRoles[uid] = [r.id];
    }
  }
  delete sv.mods;
  sv.memberRoles ||= {};
  sv.invites ||= [];
  sv.audit ||= [];
  sv.webhooks ||= [];
  sv.categories ||= [];
  return sv;
}
const everyoneRole = sv => sv.roles[sv.roles.length - 1];
const roleById = (sv, id) => sv.roles.find(r => r.id === id);
const rolesOf = (sv, uid) => (sv.memberRoles?.[uid] || []).filter(id => roleById(sv, id) && id !== sv.id);
// Lower number = higher in the list. The owner is above everything.
// Zuno Staff can see every channel and manage any server they're in, like an admin above every
// role. veil (the founder) ranks above every other staff member. The owner stays protected: staff
// can't act on the owner or do owner-only things.
const staffIn = uid => isStaff(data.users[uid]);
const isFounder = uid => data.users[uid]?.username === CONFIG.FOUNDER;
function topPos(sv, uid) {
  if (uid === sv.ownerId) return -1;
  if (isFounder(uid)) return -0.75;
  if (staffIn(uid)) return -0.5;
  const mine = rolesOf(sv, uid);
  let best = sv.roles.length - 1;
  sv.roles.forEach((r, i) => { if (i < best && mine.includes(r.id)) best = i; });
  return best;
}
function basePerms(sv, uid, asMember = false) {
  if (uid === sv.ownerId || (!asMember && staffIn(uid))) return new Set(PERM_KEYS);
  const p = new Set(everyoneRole(sv).perms);
  for (const id of rolesOf(sv, uid)) for (const x of roleById(sv, id).perms) p.add(x);
  return p.has('administrator') ? new Set(PERM_KEYS) : p;
}
// Channels in a category share the category's permissions unless they're "unsynced".
function overridesFor(sv, ch) {
  if (ch.categoryId && ch.synced !== false) {
    const cat = sv.categories.find(c => c.id === ch.categoryId);
    if (cat) return cat.overrides || [];
  }
  return ch.overrides || [];
}
// Zuno Staff can see and moderate every channel in a server they're in, but they only talk where
// they'd be allowed to as a normal member: no sending, reacting or speaking in a channel that's
// hidden from them or closed to them (they can still join a voice channel to listen).
const TALK_PERMS = ['send_messages', 'attach_files', 'add_reactions', 'mention_everyone', 'use_commands', 'speak', 'video', 'use_soundboard'];
function permsIn(sv, ch, uid) {
  if (uid !== sv.ownerId && staffIn(uid) && sv.members.includes(uid)) {
    const normal = memberPermsIn(sv, ch, uid, true);
    const p = new Set(PERM_KEYS);
    for (const k of TALK_PERMS) if (!normal.has(k)) p.delete(k);
    return p;
  }
  return memberPermsIn(sv, ch, uid);
}
function memberPermsIn(sv, ch, uid, asMember = false) {
  const base = basePerms(sv, uid, asMember);
  if (uid === sv.ownerId || base.has('administrator')) return base;
  const p = new Set(base);
  const ov = overridesFor(sv, ch);
  const everyone = ov.find(o => o.id === sv.id);
  for (const x of everyone?.deny || []) p.delete(x);
  for (const x of everyone?.allow || []) p.add(x);
  const mine = rolesOf(sv, uid);
  const roleOv = ov.filter(o => o.type === 'role' && o.id !== sv.id && mine.includes(o.id));
  for (const o of roleOv) for (const x of o.deny || []) p.delete(x);
  for (const o of roleOv) for (const x of o.allow || []) p.add(x);
  const member = ov.find(o => o.type === 'member' && o.id === uid);
  for (const x of member?.deny || []) p.delete(x);
  for (const x of member?.allow || []) p.add(x);
  // Announcement channels: only people who manage messages (or are allowed on purpose) can post.
  const allowedSend = [...roleOv, member].some(o => o?.allow?.includes('send_messages'));
  if (ch.readOnly && !p.has('manage_messages') && !allowedSend) p.delete('send_messages');
  if (!p.has('view_channels')) return new Set();
  if (ch.type === 'voice' && !p.has('connect')) { p.delete('speak'); p.delete('video'); }
  for (const fn of hooks.channelPerms) fn(sv, ch, uid, p);
  return p;
}
const can = (sv, uid, perm, ch = null) => (ch ? permsIn(sv, ch, uid) : basePerms(sv, uid)).has(perm);
const canView = (sv, ch, uid) => permsIn(sv, ch, uid).has('view_channels');
function need(sv, me, perm, ch = null, msg = null) {
  if (!can(sv, me.id, perm, ch)) fail(403, msg || `You need the "${PERM_INFO[perm].label}" permission to do that.`);
}
const isServerMod = (sv, uid) => can(sv, uid, 'manage_messages');
// You can act on someone (kick, ban, change roles) only if your highest role is above theirs.
const outranks = (sv, a, b) => a !== b && b !== sv.ownerId && (a === sv.ownerId || topPos(sv, a) < topPos(sv, b));
// You can edit a role only if it's below your highest role.
const canEditRole = (sv, uid, role) => uid === sv.ownerId || sv.roles.indexOf(role) > topPos(sv, uid);
// You can only hand out permissions you have yourself.
function checkGrant(sv, me, perms) {
  const mine = basePerms(sv, me.id);
  const extra = perms.filter(p => !mine.has(p));
  if (extra.length) fail(403, `You can't give out permissions you don't have: ${extra.map(p => PERM_INFO[p].label).join(', ')}.`);
}
function getManagedServer(me, id, perm = 'manage_messages') {
  const sv = getServer(me, id);
  need(sv, me, perm);
  return sv;
}

// ---- audit log ----
const AUDIT_LABEL = {
  voice_mute: 'server muted someone', voice_unmute: 'server unmuted someone', voice_deafen: 'server deafened someone', voice_undeafen: 'server undeafened someone', voice_disconnect: 'disconnected someone from voice',
  server_update: 'updated the server', channel_create: 'created a channel', channel_update: 'updated a channel', channel_delete: 'deleted a channel',
  channel_perms: 'changed channel permissions', category_create: 'created a category', category_update: 'updated a category', category_delete: 'deleted a category',
  category_perms: 'changed category permissions', layout: 'reordered channels', role_create: 'created a role', role_update: 'updated a role',
  role_delete: 'deleted a role', role_order: 'reordered roles', member_roles: "changed a member's roles", member_kick: 'kicked a member',
  member_ban: 'banned a member', member_unban: 'unbanned a member', invite_create: 'created an invite', invite_delete: 'deleted an invite',
  message_delete: "deleted a member's message", bot_add: 'added a bot', bot_remove: 'removed a bot', webhook_create: 'created a webhook',
  webhook_update: 'updated a webhook', webhook_delete: 'deleted a webhook', ownership: 'transferred ownership',
  emoji_create: 'added an emoji', emoji_delete: 'removed an emoji', sound_create: 'added a soundboard sound', sound_delete: 'removed a soundboard sound', member_nick: "changed a member's nickname", member_timeout: 'timed out a member', member_untimeout: 'removed a timeout', bot_config: 'set up a Zuno bot',
  automod_block: 'AutoMod blocked a message', automod_update: 'changed AutoMod', sticker_create: 'added a sticker', sticker_delete: 'removed a sticker',
  event_create: 'created an event', event_update: 'updated an event', event_delete: 'cancelled an event',
  member_warn: 'warned a member', member_unwarn: 'cleared warnings', channel_lock: 'locked a channel', channel_unlock: 'unlocked a channel', message_purge: 'cleared messages',
};
function audit(sv, by, action, target = null, detail = '') {
  sv.audit ||= [];
  sv.audit.push({ id: newId(), at: Date.now(), by: typeof by === 'string' ? by : by?.id, action, target, detail: String(detail || '').slice(0, 300) });
  if (sv.audit.length > 600) sv.audit.splice(0, sv.audit.length - 600);
  for (const uid of sv.members) if (can(sv, uid, 'view_audit_log')) send(uid, 'audit', { serverId: sv.id });
  const byId = typeof by === 'string' ? by : by?.id;
  if (byId && byId !== sv.ownerId && staffIn(byId) && !isFounder(byId) && !data.users[byId]?.system) tellFounder(data.users[byId], `${AUDIT_LABEL[action] || action}${target?.name ? ` (${target.name})` : ''} in ${sv.name}`, { server: sv.name, serverId: sv.id });
}
const changedKeys = (before, after, keys) => keys.filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));

// ---- Zuno Official: the server everyone is in ----
function officialServer() {
  const list = Object.values(data.servers);
  let sv = list.find(x => x.official);
  if (!sv) {
    sv = list.find(x => x.name.trim().toLowerCase() === 'zuno official' && isStaff(data.users[x.ownerId]));
    if (sv) { sv.official = true; save(); }
  }
  return sv || null;
}
function joinOfficial(u) {
  const sv = officialServer();
  if (!sv || !u || u.system || u.bot || sv.members.includes(u.id) || (sv.removedUsers || []).includes(u.id)) return false;
  sv.members.push(u.id);
  const auto = (sv.roles || []).filter(r => r.autoJoin && !r.everyone && !r.managed).map(r => r.id); // roles given on join
  if (auto.length) { sv.memberRoles ||= {}; sv.memberRoles[u.id] = [...new Set([...(sv.memberRoles[u.id] || []), ...auto])]; }
  u.joinedAt ||= {};
  u.joinedAt[sv.id] = Date.now(); // old messages don't count as unread
  return true;
}
function ensureOfficialMembers() {
  const sv = officialServer();
  if (!sv) return;
  let added = 0;
  for (const u of Object.values(data.users)) if (joinOfficial(u)) { added++; send(u.id, 'refresh', { serverId: sv.id }); }
  if (added) { save(); refreshServer(sv); console.log(`Added ${added} people to Zuno Official.`); }
}

const DISCOVERY_TAGS = ['Gaming', 'Music', 'Art', 'Anime', 'Study', 'Tech', 'Memes', 'Chill', 'Creators', 'Roleplay', 'Sports', 'Movies & TV', 'Books', 'Science', 'Community', 'Language'];
function serverSummary(sv, me) {
  ensureRoles(sv);
  const visible = sv.channels.filter(ch => canView(sv, ch, me.id));
  const manageChannels = can(sv, me.id, 'manage_channels');
  const managing = manageChannels || can(sv, me.id, 'manage_roles');
  return {
    id: sv.id, name: sv.name, ownerId: sv.ownerId, icon: sv.icon || null, iconColor: sv.iconColor, official: !!sv.official,
    banner: sv.banner || null, bannerColor: sv.bannerColor || null, accentColor: sv.accentColor || null,
    description: sv.description || '', tags: sv.tags || [], discoverable: !!sv.discoverable, vanity: sv.vanity || null,
    rulesChannelId: sv.rulesChannelId || null, minAccountAge: sv.minAccountAge || 0, createdAt: sv.createdAt,
    categories: sv.categories.filter(cat => managing || visible.some(c => c.categoryId === cat.id)),
    roles: sv.roles, memberRoles: sv.memberRoles, myPerms: [...basePerms(sv, me.id)],
    welcomeChannelId: sv.welcomeChannelId || null, welcomeMessages: sv.welcomeMessages !== false, invitesPaused: !!sv.invitesPaused,
    memberCount: sv.members.length,
    channels: visible.map(ch => {
      const perms = permsIn(sv, ch, me.id);
      const msgs = data.channelMessages[ch.id]?.messages || [];
      const lastRead = me.lastRead?.['ch:' + ch.id] || me.joinedAt?.[sv.id] || 0;
      const fresh = ch.type === 'text' ? msgs.filter(m => m.authorId !== me.id && m.createdAt > lastRead) : [];
      // Only messages that ping you (by name, @everyone/@here, one of your roles, or a reply) count as mentions.
      const mine = rolesOf(sv, me.id);
      const pingsMe = m => (m.mentions || []).includes(me.id) || m.mentionEveryone || m.mentionHere || (m.replyTo?.authorId === me.id && !m.replyTo.noPing) || (m.mentionRoles || []).some(r => mine.includes(r));
      // A channel not everyone can see lists only the people who can, so its member list leaves the rest out.
      const viewers = sv.members.length <= 2000 ? sv.members.filter(id => memberPermsIn(sv, ch, id, true).has('view_channels')) : null;
      return { ...ch, perms: [...perms], unread: fresh.length, mentions: fresh.filter(pingsMe).length, ...(viewers && viewers.length < sv.members.length ? { viewers } : {}) };
    }),
    voice: Object.fromEntries(visible.filter(c => c.type === 'voice').map(c => [c.id, roomMembers('vc:' + c.id)])),
    ...hooks.serverSummary.reduce((o, fn) => Object.assign(o, fn(sv, me)), {}),
  };
}
const refreshServer = sv => { for (const id of sv.members) send(id, 'refresh', { serverId: sv.id }); };

route('POST', '/api/servers', async ({ me, body }) => {
  const name = checkName(clean(body.name, 48));
  if (!name) fail(400, 'Give your server a name.');
  const id = newId();
  const sv = data.servers[id] = ensureRoles({
    id, name, ownerId: me.id, createdAt: Date.now(), icon: null,
    iconColor: SERVER_COLORS[Math.floor(Math.random() * SERVER_COLORS.length)],
    members: [me.id],
    channels: [{ id: newId(), name: 'general', type: 'text' }, { id: newId(), name: 'General', type: 'voice' }],
    invite: crypto.randomBytes(5).toString('base64url'),
  });
  postMessage(channelConv(me, sv.channels[0].id), data.users[SYSTEM_ID], `Welcome to **${name}**! This is the start of the server. Invite friends by clicking the server name at the top left, then Invite People.`);
  save(); refreshServer(sv);
  return { server: serverSummary(sv, me) };
});

route('GET', '/api/servers/:id', async ({ me, params }) => {
  const sv = ensureRoles(getServer(me, params.id));
  const bans = can(sv, me.id, 'ban_members') ? (sv.bans || []).map(b => ({ ...b, user: publicUser(data.users[b.userId]) })) : undefined;
  return {
    server: serverSummary(sv, me), members: sv.members.map(id => publicUser(data.users[id])).filter(Boolean),
    invite: can(sv, me.id, 'create_invites') ? sv.invite : null, bans,
    joined: can(sv, me.id, 'kick_members') ? Object.fromEntries(sv.members.map(id => [id, { at: data.users[id]?.joinedAt?.[sv.id] || null, via: sv.joinedVia?.[id] || null }])) : undefined,
  };
});

route('PATCH', '/api/servers/:id', async ({ me, params, body }) => {
  const sv = ensureRoles(getServer(me, params.id));
  const pauseOnly = Object.keys(body).every(k => k === 'invitesPaused');
  need(sv, me, pauseOnly && can(sv, me.id, 'manage_invites') ? 'manage_invites' : 'manage_server');
  const before = { ...sv };
  if ('name' in body) { const n = checkName(clean(body.name, 48)); if (!n) fail(400, 'Give your server a name.'); sv.name = n; }
  for (const k of ['iconColor', 'bannerColor', 'accentColor']) {
    if (!(k in body)) continue;
    if (body[k] && !ROLE_COLOR_RE.test(body[k])) fail(400, 'Pick a color like #04c5ae.');
    if (k === 'iconColor' && !body[k]) continue;
    sv[k] = body[k] || null;
  }
  if ('description' in body) sv.description = clean(body.description, 300);
  if ('welcomeMessages' in body) sv.welcomeMessages = !!body.welcomeMessages;
  for (const k of ['welcomeChannelId', 'rulesChannelId']) {
    if (!(k in body)) continue;
    if (body[k] && !sv.channels.some(c => c.id === body[k] && c.type === 'text')) fail(400, 'Pick a text channel.');
    sv[k] = body[k] || null;
  }
  if ('invitesPaused' in body) sv.invitesPaused = !!body.invitesPaused;
  for (const fn of hooks.patchServer) fn(sv, me, body);
  if ('minAccountAge' in body) { const v = Number(body.minAccountAge); if (![0, 1, 24, 168].includes(v)) fail(400, 'Pick an option from the list.'); sv.minAccountAge = v; }
  if ('tags' in body) sv.tags = (Array.isArray(body.tags) ? body.tags : []).filter(t => DISCOVERY_TAGS.includes(t)).slice(0, 5);
  if ('vanity' in body) {
    const v = String(body.vanity || '').toLowerCase().trim();
    if (v) {
      if (!/^[a-z0-9-]{3,24}$/.test(v)) fail(400, 'Custom invites use 3–24 letters, numbers and dashes.');
      if (Object.values(data.servers).some(x => x.id !== sv.id && (x.vanity === v || x.invite === v)) || (sv.invites || []).some(i => i.code === v)) fail(409, 'That custom invite is already taken.');
    }
    sv.vanity = v || null;
  }
  if ('discoverable' in body) {
    if (body.discoverable) {
      if ((sv.description || '').length < 10) fail(400, 'Add a description (at least 10 characters) so people know what the server is about.');
      if (!(sv.tags || []).length) fail(400, 'Pick at least one tag so people can find the server.');
    }
    sv.discoverable = !!body.discoverable;
  }
  const changed = changedKeys(before, sv, ['name', 'theme', 'iconColor', 'bannerColor', 'accentColor', 'description', 'welcomeMessages', 'welcomeChannelId', 'rulesChannelId', 'invitesPaused', 'minAccountAge', 'tags', 'vanity', 'discoverable']);
  if (changed.length) audit(sv, me, 'server_update', { type: 'server', id: sv.id, name: sv.name }, changed.join(', '));
  save(); refreshServer(sv);
  return { server: serverSummary(sv, me) };
});

for (const kind of ['icon', 'banner']) {
  route('POST', `/api/servers/:id/${kind}`, async ({ me, params, body }) => {
    const sv = ensureRoles(getServer(me, params.id));
    need(sv, me, 'manage_server');
    const k = sniff(body);
    if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, `Server ${kind}s must be PNG, JPG, WebP or GIF images.`);
    removeUpload(sv[kind]);
    sv[kind] = storeUpload(body, k.ext);
    audit(sv, me, 'server_update', { type: 'server', id: sv.id, name: sv.name }, kind);
    save(); refreshServer(sv);
    return { server: serverSummary(sv, me) };
  }, { raw: 10_000_000 });
  route('DELETE', `/api/servers/:id/${kind}`, async ({ me, params }) => {
    const sv = ensureRoles(getServer(me, params.id));
    need(sv, me, 'manage_server');
    removeUpload(sv[kind]); sv[kind] = null;
    audit(sv, me, 'server_update', { type: 'server', id: sv.id, name: sv.name }, `removed ${kind}`);
    save(); refreshServer(sv);
    return { server: serverSummary(sv, me) };
  });
}

route('DELETE', '/api/servers/:id', async ({ me, params, token }) => {
  const sv = getServer(me, params.id, { owner: true });
  needReauth(token);
  if (sv.official) fail(400, "Zuno Official can't be deleted. Everyone is in it.");
  const members = [...sv.members];
  for (const ch of sv.channels) { delete data.channelMessages[ch.id]; closeRoom('vc:' + ch.id); }
  removeUpload(sv.icon); removeUpload(sv.banner);
  delete data.servers[sv.id];
  save();
  for (const id of members) send(id, 'refresh', { serverId: sv.id, removed: true });
  return { ok: true };
});

function removeMember(sv, userId) {
  const wasIn = sv.members.includes(userId);
  sv.members = sv.members.filter(id => id !== userId);
  if (wasIn) for (const fn of hooks.onLeave) { try { fn(sv, data.users[userId]); } catch (e) { console.error('onLeave', e.message); } }
  if (sv.memberRoles) delete sv.memberRoles[userId];
  for (const ch of sv.channels) if (ch.type === 'voice') leaveRoom('vc:' + ch.id, userId);
  // A bot leaving takes its own role with it.
  const managed = sv.roles?.find(r => r.managed === userId);
  if (managed) dropRole(sv, managed.id);
  save(); refreshServer(sv);
  send(userId, 'refresh', { serverId: sv.id, removed: true });
}
function dropRole(sv, roleId) {
  sv.roles = sv.roles.filter(r => r.id !== roleId);
  for (const uid of Object.keys(sv.memberRoles || {})) sv.memberRoles[uid] = sv.memberRoles[uid].filter(id => id !== roleId);
  const strip = list => (list || []).filter(o => o.id !== roleId);
  for (const ch of sv.channels) ch.overrides = strip(ch.overrides);
  for (const cat of sv.categories || []) cat.overrides = strip(cat.overrides);
}
route('POST', '/api/servers/:id/leave', async ({ me, params }) => {
  const sv = getServer(me, params.id);
  if (sv.official) fail(400, "Everyone's in Zuno Official, so it can't be left.");
  if (sv.ownerId === me.id) fail(400, "Owners can't leave their own server. Delete it instead.");
  removeMember(sv, me.id);
  return { ok: true };
});
route('DELETE', '/api/servers/:id/members/:userId', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'kick_members');
  if (params.userId === me.id) fail(400, "You can't kick yourself.");
  if (!sv.members.includes(params.userId)) fail(404, "They aren't in this server.");
  if (!outranks(sv, me.id, params.userId)) fail(403, "You can't kick someone whose role is the same as or higher than yours.");
  if (sv.official) sv.removedUsers = [...new Set([...(sv.removedUsers || []), params.userId])]; // stays out until invited back
  const u = data.users[params.userId];
  audit(sv, me, u?.bot ? 'bot_remove' : 'member_kick', { type: 'member', id: params.userId, name: u?.displayName || '?' });
  removeMember(sv, params.userId);
  return { ok: true };
});

// ---- channels ----
route('POST', '/api/servers/:id/channels', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_channels');
  const type = body.type === 'voice' || body.type === 'stage' ? 'voice' : 'text';
  const layout = body.type === 'forum' || body.type === 'media' ? body.type : null; // forum & media channels are text channels laid out differently (zuno28.js)
  const name = channelName(body.name, type);
  if (!name) fail(400, 'Give the channel a name.');
  if (sv.channels.length >= 100) fail(400, 'A server can have up to 100 channels.');
  const ch = { id: newId(), name, type };
  if (body.categoryId && sv.categories.some(c => c.id === body.categoryId)) ch.categoryId = body.categoryId;
  if (body.topic) ch.topic = clean(body.topic, 200);
  if (body.readOnly && type === 'text') ch.readOnly = true;
  if (body.type === 'stage') ch.stage = true; // a stage: a voice channel where only speakers talk
  if (layout) ch.layout = layout;
  // A private channel: hidden from @everyone, visible to you (and the roles you picked).
  if (body.private) {
    ch.synced = false;
    ch.overrides = [{ id: sv.id, type: 'role', allow: [], deny: ['view_channels'] }, { id: me.id, type: 'member', allow: ['view_channels'], deny: [] },
      ...cleanIds(body.roles).filter(id => roleById(sv, id) && id !== sv.id).map(id => ({ id, type: 'role', allow: ['view_channels'], deny: [] }))];
  }
  const lastInCat = sv.channels.map((c, i) => [c, i]).filter(([c]) => (c.categoryId || null) === (ch.categoryId || null)).pop();
  if (lastInCat) sv.channels.splice(lastInCat[1] + 1, 0, ch); else sv.channels.push(ch);
  audit(sv, me, 'channel_create', { type: 'channel', id: ch.id, name: ch.name }, body.private ? 'private' : '');
  save(); refreshServer(sv);
  return { channel: ch };
});
const cleanIds = (v, max = 50) => (Array.isArray(v) ? v.map(String).slice(0, max) : []);
function channelForManager(me, id, perm = 'manage_channels') {
  const { sv, ch } = findChannel(id);
  if (!sv || !sv.members.includes(me.id) || !canView(sv, ch, me.id)) fail(404, 'Channel not found.');
  ensureRoles(sv);
  need(sv, me, perm, ch);
  return { sv, ch };
}
route('PATCH', '/api/channels/:id', async ({ me, params, body }) => {
  const { sv, ch } = channelForManager(me, params.id);
  const before = { ...ch };
  if ('name' in body) { const name = channelName(body.name, ch.type); if (!name) fail(400, 'Give the channel a name.'); ch.name = name; }
  if ('topic' in body) ch.topic = clean(body.topic, 200);
  if ('slowmode' in body) { const v = Number(body.slowmode); if (!SLOWMODES.includes(v)) fail(400, 'Pick a slowmode from the list.'); ch.slowmode = v; }
  if ('readOnly' in body) ch.readOnly = ch.type === 'text' && !!body.readOnly;
  if ('nsfw' in body) ch.nsfw = !!body.nsfw;
  if ('userLimit' in body) ch.userLimit = ch.type === 'voice' ? Math.max(0, Math.min(99, Math.round(Number(body.userLimit) || 0))) : 0;
  if ('categoryId' in body) {
    if (body.categoryId && !sv.categories.some(c => c.id === body.categoryId)) fail(400, 'That category no longer exists.');
    ch.categoryId = body.categoryId || null;
  }
  const changed = changedKeys(before, ch, ['name', 'topic', 'slowmode', 'readOnly', 'nsfw', 'userLimit', 'categoryId']);
  if (changed.length) audit(sv, me, 'channel_update', { type: 'channel', id: ch.id, name: ch.name }, changed.join(', '));
  save(); refreshServer(sv);
  return { channel: ch };
});
// Permission overrides: [{ id: roleId | userId, type: 'role' | 'member', allow: [...], deny: [...] }]
function cleanOverrides(sv, me, list, ch) {
  const out = [];
  for (const o of Array.isArray(list) ? list.slice(0, 60) : []) {
    const type = o?.type === 'member' ? 'member' : 'role';
    const id = String(o?.id || '');
    if (type === 'role' && !roleById(sv, id)) continue;
    if (type === 'member' && !sv.members.includes(id)) continue;
    const allow = cleanPerms(o.allow, true), deny = cleanPerms(o.deny, true).filter(p => !allow.includes(p));
    out.push({ id, type, allow, deny });
  }
  // You can only allow or deny permissions you have in that channel.
  const mine = ch ? permsIn(sv, ch, me.id) : basePerms(sv, me.id);
  const owner = me.id === sv.ownerId || basePerms(sv, me.id).has('administrator');
  if (!owner) {
    const touched = new Set(out.flatMap(o => [...o.allow, ...o.deny]));
    const bad = [...touched].filter(p => !mine.has(p));
    if (bad.length) fail(403, `You can't change permissions you don't have: ${bad.map(p => PERM_INFO[p].label).join(', ')}.`);
    // Don't let people lock themselves out of the channel.
    if (ch) {
      const test = { ...ch, overrides: out, synced: false };
      if (!permsIn(sv, test, me.id).has('manage_roles')) fail(400, "That would take away your own access to manage this channel's permissions.");
    }
  }
  return out;
}
route('PUT', '/api/channels/:id/overrides', async ({ me, params, body }) => {
  const { sv, ch } = channelForManager(me, params.id, 'manage_roles');
  if (body.synced && ch.categoryId) { ch.synced = true; audit(sv, me, 'channel_perms', { type: 'channel', id: ch.id, name: ch.name }, 'synced with category'); }
  else { ch.overrides = cleanOverrides(sv, me, body.overrides, ch); ch.synced = false; audit(sv, me, 'channel_perms', { type: 'channel', id: ch.id, name: ch.name }); }
  save(); refreshServer(sv);
  return { channel: ch };
});
route('DELETE', '/api/channels/:id', async ({ me, params }) => {
  const { sv, ch } = channelForManager(me, params.id);
  if (sv.channels.filter(c => c.type === 'text').length === 1 && ch.type === 'text') fail(400, 'A server needs at least one text channel.');
  sv.channels = sv.channels.filter(c => c.id !== ch.id);
  sv.webhooks = (sv.webhooks || []).filter(w => w.channelId !== ch.id);
  delete data.channelMessages[ch.id];
  closeRoom('vc:' + ch.id);
  audit(sv, me, 'channel_delete', { type: 'channel', id: ch.id, name: ch.name });
  save(); refreshServer(sv);
  return { ok: true };
});

// ---- categories & ordering ----
function findCategory(sv, id) { const cat = sv.categories.find(c => c.id === id); if (!cat) fail(404, 'Category not found.'); return cat; }
route('POST', '/api/servers/:id/categories', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_channels');
  const name = clean(body.name, 32).toUpperCase();
  if (!name) fail(400, 'Give the category a name.');
  if (sv.categories.length >= 25) fail(400, 'A server can have up to 25 categories.');
  const cat = { id: newId(), name, overrides: [] };
  if (body.private) cat.overrides = [{ id: sv.id, type: 'role', allow: [], deny: ['view_channels'] }, { id: me.id, type: 'member', allow: ['view_channels'], deny: [] }];
  sv.categories.push(cat);
  audit(sv, me, 'category_create', { type: 'category', id: cat.id, name });
  save(); refreshServer(sv);
  return { category: cat };
});
route('PATCH', '/api/servers/:id/categories/:catId', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_channels');
  const cat = findCategory(sv, params.catId);
  const name = clean(body.name, 32).toUpperCase();
  if (!name) fail(400, 'Give the category a name.');
  const old = cat.name; cat.name = name;
  audit(sv, me, 'category_update', { type: 'category', id: cat.id, name }, `renamed from ${old}`);
  save(); refreshServer(sv);
  return { category: cat };
});
route('PUT', '/api/servers/:id/categories/:catId/overrides', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  const cat = findCategory(sv, params.catId);
  cat.overrides = cleanOverrides(sv, me, body.overrides, null);
  // "Sync all": every channel in the category follows the category again.
  if (body.syncChannels) for (const ch of sv.channels) if (ch.categoryId === cat.id) ch.synced = true;
  audit(sv, me, 'category_perms', { type: 'category', id: cat.id, name: cat.name }, body.syncChannels ? 'and synced its channels' : '');
  save(); refreshServer(sv);
  return { category: cat };
});
route('DELETE', '/api/servers/:id/categories/:catId', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'manage_channels');
  const cat = findCategory(sv, params.catId);
  sv.categories = sv.categories.filter(c => c.id !== params.catId);
  for (const ch of sv.channels) if (ch.categoryId === params.catId) {
    // Channels keep the permissions they had from the category.
    if (ch.synced !== false) { ch.overrides = JSON.parse(JSON.stringify(cat.overrides || [])); ch.synced = false; }
    ch.categoryId = null;
  }
  audit(sv, me, 'category_delete', { type: 'category', id: cat.id, name: cat.name });
  save(); refreshServer(sv);
  return { ok: true };
});
// The whole layout at once: the order of categories, and every channel's place and category.
route('PUT', '/api/servers/:id/layout', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_channels');
  const cats = sv.categories;
  if (Array.isArray(body.categories)) {
    const order = body.categories.filter(id => cats.some(c => c.id === id));
    if (order.length === cats.length) sv.categories = order.map(id => cats.find(c => c.id === id));
  }
  if (Array.isArray(body.channels)) {
    const list = body.channels.filter(x => x && sv.channels.some(c => c.id === x.id));
    if (list.length !== sv.channels.length || new Set(list.map(x => x.id)).size !== list.length) fail(400, 'The channel list was out of date. Try again.');
    sv.channels = list.map(x => {
      const ch = sv.channels.find(c => c.id === x.id);
      ch.categoryId = x.categoryId && sv.categories.some(c => c.id === x.categoryId) ? x.categoryId : null;
      return ch;
    });
  }
  audit(sv, me, 'layout', { type: 'server', id: sv.id, name: sv.name });
  save(); refreshServer(sv);
  return { server: serverSummary(sv, me) };
});

// ---- roles ----
function cleanRoleFields(sv, me, role, body) {
  if ('name' in body) { const n = checkName(clean(body.name, 32).replace(/^@+/, '')); if (!n) fail(400, 'Give the role a name.'); if (!role.everyone) role.name = n; }
  if ('color' in body) { if (body.color && !ROLE_COLOR_RE.test(body.color)) fail(400, 'Pick a color like #04c5ae.'); if (!role.everyone) role.color = body.color || null; }
  if ('color2' in body) { if (body.color2 && !ROLE_COLOR_RE.test(body.color2)) fail(400, 'Pick a color like #04c5ae.'); if (!role.everyone) role.color2 = body.color2 || null; }
  if ('hoist' in body && !role.everyone) role.hoist = !!body.hoist;
  if ('mentionable' in body && !role.everyone) role.mentionable = !!body.mentionable;
  // "Give to people when they join": turning it on also gives the role to everyone already here.
  if ('autoJoin' in body && !role.everyone && !role.managed) {
    const on = !!body.autoJoin;
    if (on && !role.autoJoin) for (const uid of sv.members) if (!data.users[uid]?.bot) sv.memberRoles[uid] = [...new Set([...(sv.memberRoles[uid] || []), role.id])];
    role.autoJoin = on;
  }
  if ('icon' in body && !role.everyone) role.icon = clean(body.icon, 8) || null; // an emoji shown next to names
  if ('perms' in body) {
    const next = cleanPerms(body.perms);
    const added = next.filter(p => !role.perms.includes(p));
    if (me.id !== sv.ownerId) checkGrant(sv, me, added);
    role.perms = next;
  }
}
route('POST', '/api/servers/:id/roles', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  if (sv.roles.length >= 100) fail(400, 'A server can have up to 100 roles.');
  const role = { id: newId(), name: 'new role', color: null, perms: [...everyoneRole(sv).perms], hoist: false, mentionable: false };
  cleanRoleFields(sv, me, role, body);
  // New roles go at the bottom of the list, just above @everyone.
  sv.roles.splice(sv.roles.length - 1, 0, role);
  audit(sv, me, 'role_create', { type: 'role', id: role.id, name: role.name });
  save(); refreshServer(sv);
  return { role };
});
route('PATCH', '/api/servers/:id/roles/:roleId', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  const role = roleById(sv, params.roleId);
  if (!role) fail(404, 'Role not found.');
  if (!role.everyone && !canEditRole(sv, me.id, role)) fail(403, 'You can only edit roles below your highest role.');
  if (role.managed && ('perms' in body) && me.id !== sv.ownerId) fail(403, "This role belongs to a bot. Only the owner can change what it's allowed to do.");
  const before = JSON.parse(JSON.stringify(role));
  cleanRoleFields(sv, me, role, body);
  const changed = changedKeys(before, role, ['name', 'color', 'color2', 'hoist', 'mentionable', 'icon', 'perms', 'autoJoin']);
  if (changed.length) audit(sv, me, 'role_update', { type: 'role', id: role.id, name: role.name }, changed.join(', '));
  save(); refreshServer(sv);
  return { role };
});
route('DELETE', '/api/servers/:id/roles/:roleId', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  const role = roleById(sv, params.roleId);
  if (!role || role.everyone) fail(400, "The @everyone role can't be deleted.");
  if (role.managed) fail(400, 'This role belongs to a bot. Remove the bot to remove its role.');
  if (!canEditRole(sv, me.id, role)) fail(403, 'You can only delete roles below your highest role.');
  dropRole(sv, role.id);
  audit(sv, me, 'role_delete', { type: 'role', id: role.id, name: role.name });
  save(); refreshServer(sv);
  return { ok: true };
});
route('PUT', '/api/servers/:id/roles-order', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  const order = cleanIds(body.order, 250);
  const movable = sv.roles.filter(r => !r.everyone);
  if (order.length !== movable.length || !movable.every(r => order.includes(r.id))) fail(400, 'The role list was out of date. Try again.');
  const next = [...order.map(id => roleById(sv, id)), everyoneRole(sv)];
  // Roles at or above your highest one must stay where they are.
  if (me.id !== sv.ownerId) {
    const top = topPos(sv, me.id);
    for (let i = 0; i <= top; i++) if (next[i] !== sv.roles[i]) fail(403, 'You can only move roles below your highest role.');
  }
  sv.roles = next;
  audit(sv, me, 'role_order', { type: 'server', id: sv.id, name: sv.name });
  save(); refreshServer(sv);
  return { roles: sv.roles };
});
route('PUT', '/api/servers/:id/members/:userId/roles', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_roles');
  const uid = params.userId;
  if (!sv.members.includes(uid)) fail(404, "They aren't in this server.");
  // Administrators can also change roles for other people at their own level (another admin), just
  // never for someone above them or for the owner.
  // Zuno Staff only rank above everyone for kicks and bans; for roles they count by the roles they
  // actually have here, so a server's own admins can give them roles like anyone else.
  const theirPos = uid === sv.ownerId ? -1 : (() => { const mine = rolesOf(sv, uid); let best = sv.roles.length - 1; sv.roles.forEach((r, i) => { if (i < best && mine.includes(r.id)) best = i; }); return best; })();
  const adminPeer = basePerms(sv, me.id).has('administrator') && uid !== sv.ownerId && topPos(sv, me.id) <= theirPos;
  const above = me.id === sv.ownerId || (uid !== sv.ownerId && topPos(sv, me.id) < theirPos);
  if (uid !== me.id && !above && !adminPeer) fail(403, uid === sv.ownerId ? "Only the owner can change the owner's roles." : "You can't change roles for someone whose role is higher than yours.");
  const next = cleanIds(body.roles, 250).filter(id => roleById(sv, id) && id !== sv.id);
  const cur = rolesOf(sv, uid);
  const changes = [...next.filter(id => !cur.includes(id)), ...cur.filter(id => !next.includes(id))];
  for (const id of changes) {
    const role = roleById(sv, id);
    if (role.managed) fail(400, `${role.name} belongs to a bot and can't be given to people.`);
    if (!canEditRole(sv, me.id, role)) fail(403, `You can't give or take ${role.name}: it's not below your highest role.`);
  }
  sv.memberRoles[uid] = [...new Set(next)];
  const names = changes.map(id => (next.includes(id) ? '+' : '−') + roleById(sv, id).name).join(', ');
  if (changes.length) audit(sv, me, 'member_roles', { type: 'member', id: uid, name: data.users[uid]?.displayName || '?' }, names);
  save(); refreshServer(sv);
  return { roles: sv.memberRoles[uid] };
});
route('POST', '/api/servers/:id/transfer', async ({ me, params, body, token }) => {
  // (0.53) The founder can give any server to one of its members, even one they don't own or aren't in.
  const sv = isFounder(me.id) && !me.system ? data.servers[params.id] : getServer(me, params.id, { owner: true });
  if (!sv) fail(404, 'Server not found.');
  needReauth(token);
  if (String(body.userId || '') === sv.ownerId) fail(400, 'They already own it.');
  const uid = String(body.userId || '');
  const u = data.users[uid];
  if (!u || !sv.members.includes(uid) || u.bot) fail(400, 'Pick a member of the server.');
  sv.ownerId = uid;
  audit(sv, me, 'ownership', { type: 'member', id: uid, name: u.displayName });
  save(); refreshServer(sv); broadcastUser(me); broadcastUser(u);
  systemMessage(uid, `👑 **${me.displayName}** made you the owner of **${sv.name}**.`);
  return { ok: true };
});

// ---- bans ----
route('POST', '/api/servers/:id/bans', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'ban_members');
  const uid = String(body.userId || '');
  if (!data.users[uid] || uid === me.id) fail(400, "You can't ban that person.");
  if (sv.members.includes(uid) && !outranks(sv, me.id, uid)) fail(403, "You can't ban someone whose role is the same as or higher than yours.");
  if (uid === sv.ownerId) fail(400, "The owner can't be banned.");
  if (sv.official && isStaff(data.users[uid])) fail(400, "Staff can't be banned from Zuno Official.");
  sv.bans = (sv.bans || []).filter(b => b.userId !== uid);
  const reason = clean(body.reason, 200);
  sv.bans.push({ userId: uid, by: me.id, at: Date.now(), reason });
  // Optionally clear their recent messages (last hour / day / week).
  const wipe = { 0: 0, 1: 3600e3, 24: 864e5, 168: 7 * 864e5 }[Number(body.deleteHours) || 0] || 0;
  if (wipe) for (const ch of sv.channels) {
    const st = data.channelMessages[ch.id];
    if (!st) continue;
    const gone = st.messages.filter(m => m.authorId === uid && m.createdAt > Date.now() - wipe);
    if (!gone.length) continue;
    st.messages = st.messages.filter(m => !gone.includes(m));
    for (const m of gone) for (const id of sv.members) send(id, 'message-delete', { conv: 'ch:' + ch.id, id: m.id, serverId: sv.id, channelId: ch.id });
  }
  if (sv.official) sv.removedUsers = [...new Set([...(sv.removedUsers || []), uid])];
  audit(sv, me, 'member_ban', { type: 'member', id: uid, name: data.users[uid].displayName }, reason);
  if (sv.members.includes(uid)) removeMember(sv, uid); else { save(); refreshServer(sv); }
  return { ok: true };
});
route('DELETE', '/api/servers/:id/bans/:userId', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'ban_members');
  sv.bans = (sv.bans || []).filter(b => b.userId !== params.userId);
  if (sv.official) sv.removedUsers = (sv.removedUsers || []).filter(id => id !== params.userId);
  audit(sv, me, 'member_unban', { type: 'member', id: params.userId, name: data.users[params.userId]?.displayName || '?' });
  save(); refreshServer(sv);
  return { ok: true };
});

// ---- audit log ----
route('GET', '/api/servers/:id/audit', async ({ me, params, query }) => {
  const sv = getManagedServer(me, params.id, 'view_audit_log');
  const action = query.get('action'), by = query.get('userId'), before = Number(query.get('before')) || Infinity;
  // Search (who did it, who it was done to, or the details) and a date range.
  const q = String(query.get('q') || '').trim().toLowerCase(), since = Number(query.get('since')) || 0, until = Number(query.get('until')) || Infinity;
  const hit = e => !q || [AUDIT_LABEL[e.action] || e.action, e.detail, e.target?.name, data.users[e.by]?.displayName, data.users[e.by]?.username].some(x => String(x || '').toLowerCase().includes(q));
  const match = e => (!action || e.action === action) && (!by || e.by === by) && e.at >= since && e.at < until && hit(e);
  const list = sv.audit.filter(e => match(e) && e.at < before).slice(-50).reverse();
  return { entries: list.map(e => ({ ...e, label: AUDIT_LABEL[e.action] || e.action, byUser: publicUser(data.users[e.by]) })), actions: AUDIT_LABEL, hasMore: sv.audit.some(e => match(e) && e.at < (list[list.length - 1]?.at || 0)) };
});
route('GET', '/api/perms', async () => ({ perms: PERM_INFO, defaults: DEFAULT_EVERYONE, slowmodes: SLOWMODES, tags: DISCOVERY_TAGS }));

// ---- invites ----
// Each server has one main invite, plus any number of custom ones (expiry, use limits).
const INVITE_AGES = [0, 1800, 3600, 21600, 43200, 86400, 604800];
const INVITE_USES = [0, 1, 5, 10, 25, 50, 100];
function findInvite(code) {
  code = String(code || '');
  for (const sv of Object.values(data.servers)) {
    if (sv.invite === code || (sv.vanity && sv.vanity === code.toLowerCase())) return { sv, inv: null };
    const inv = (sv.invites || []).find(i => i.code === code);
    if (inv) {
      if (inv.expiresAt && inv.expiresAt < Date.now()) return { expired: true };
      if (inv.maxUses && inv.uses >= inv.maxUses) return { expired: true };
      return { sv, inv };
    }
  }
  return {};
}
function pruneInvites(sv) { sv.invites = (sv.invites || []).filter(i => !(i.expiresAt && i.expiresAt < Date.now()) && !(i.maxUses && i.uses >= i.maxUses)); }
const inviteView = (sv, i) => ({ ...i, creator: publicUser(data.users[i.by]), channelName: sv.channels.find(c => c.id === i.channelId)?.name || null });
route('GET', '/api/servers/:id/invites', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'create_invites');
  pruneInvites(sv);
  const all = can(sv, me.id, 'manage_invites');
  return { invites: sv.invites.filter(i => all || i.by === me.id).map(i => inviteView(sv, i)), main: sv.invite, mainUses: sv.mainUses || 0, vanity: sv.vanity || null, ages: INVITE_AGES, uses: INVITE_USES };
});
route('POST', '/api/servers/:id/invites', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'create_invites');
  if (sv.invitesPaused && !can(sv, me.id, 'manage_invites')) fail(403, 'Invites are paused in this server.');
  pruneInvites(sv);
  if (sv.invites.length >= 100) fail(400, 'This server has 100 invites already. Delete some first.');
  const age = Number(body.maxAge) || 0, uses = Number(body.maxUses) || 0;
  if (!INVITE_AGES.includes(age) || !INVITE_USES.includes(uses)) fail(400, 'Pick options from the list.');
  const channelId = body.channelId && sv.channels.some(c => c.id === body.channelId && c.type === 'text') ? body.channelId : null;
  const inv = { code: crypto.randomBytes(6).toString('base64url'), by: me.id, at: Date.now(), maxUses: uses, uses: 0, expiresAt: age ? Date.now() + age * 1000 : null, channelId };
  sv.invites.push(inv);
  audit(sv, me, 'invite_create', { type: 'invite', id: inv.code, name: inv.code }, [age ? `expires in ${age / 3600}h` : 'never expires', uses ? `${uses} uses` : 'unlimited uses'].join(', '));
  save();
  return { invite: inviteView(sv, inv) };
});
route('DELETE', '/api/servers/:id/invites/:code', async ({ me, params }) => {
  const sv = ensureRoles(getServer(me, params.id));
  const inv = sv.invites.find(i => i.code === params.code);
  if (!inv) fail(404, 'That invite no longer exists.');
  if (inv.by !== me.id) need(sv, me, 'manage_invites');
  sv.invites = sv.invites.filter(i => i !== inv);
  audit(sv, me, 'invite_delete', { type: 'invite', id: inv.code, name: inv.code });
  save();
  return { ok: true };
});
route('POST', '/api/servers/:id/invite/reset', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'manage_invites');
  sv.invite = crypto.randomBytes(5).toString('base64url');
  sv.mainUses = 0;
  audit(sv, me, 'invite_delete', { type: 'invite', id: 'main', name: 'main invite' }, 'reset the main invite');
  save();
  return { invite: sv.invite };
});
function invitePreview(sv, me) {
  return {
    id: sv.id, name: sv.name, icon: sv.icon, iconColor: sv.iconColor, banner: sv.banner || null, bannerColor: sv.bannerColor || null,
    description: sv.description || '', tags: sv.tags || [], memberCount: sv.members.length, official: !!sv.official || !!sv.verified, partnered: !!sv.partnered,
    onlineCount: sv.members.filter(id => data.users[id] && effectiveStatus(data.users[id]) !== 'offline').length,
    joined: sv.members.includes(me.id), paused: !!sv.invitesPaused, createdAt: sv.createdAt,
  };
}
route('GET', '/api/invites/:code', async ({ me, params }) => {
  const { sv, expired } = findInvite(params.code);
  if (!sv) fail(404, expired ? 'That invite has expired.' : 'That invite is invalid or has been reset.');
  return { server: invitePreview(sv, me), joined: sv.members.includes(me.id) };
});
// Everything that must be true for someone to join a server, however they got there.
function joinServer(sv, me, via) {
  ensureRoles(sv);
  if (sv.members.includes(me.id)) return;
  if ((sv.bans || []).some(b => b.userId === me.id)) fail(403, "You're banned from this server.");
  if (sv.invitesPaused) fail(403, "This server isn't taking new members right now.");
  if (sv.minAccountAge && Date.now() - me.createdAt < sv.minAccountAge * 3600e3) {
    fail(403, `This server only lets in accounts older than ${sv.minAccountAge >= 168 ? 'a week' : sv.minAccountAge >= 24 ? 'a day' : 'an hour'}. Try again later.`);
  }
  sv.members.push(me.id);
  if (sv.removedUsers) sv.removedUsers = sv.removedUsers.filter(id => id !== me.id);
  sv.joinedVia ||= {}; sv.joinedVia[me.id] = via;
  me.joinedAt ||= {}; me.joinedAt[sv.id] = Date.now();
  const general = sv.welcomeMessages === false ? null : sv.channels.find(c => c.id === sv.welcomeChannelId) || sv.channels.find(c => c.type === 'text');
  if (general) postMessage(channelConvFor(sv, general), data.users[SYSTEM_ID], `**${me.displayName}** just joined. Say hi!`);
  for (const fn of hooks.onJoin) fn(sv, me);
  save(); refreshServer(sv);
  broadcastUser(me);
}
route('POST', '/api/invites/:code/join', async ({ me, params }) => {
  const { sv, inv, expired } = findInvite(params.code);
  if (!sv) fail(404, expired ? 'That invite has expired.' : 'That invite is invalid or has been reset.');
  if (!sv.members.includes(me.id)) {
    joinServer(sv, me, inv ? inv.code : sv.vanity && params.code.toLowerCase() === sv.vanity ? 'custom invite' : 'main invite');
    if (inv) inv.uses++; else sv.mainUses = (sv.mainUses || 0) + 1;
    save();
  }
  return { server: serverSummary(sv, me), channelId: inv?.channelId || null };
});

// ---- server discovery ----
route('GET', '/api/discover', async ({ me, query }) => {
  const q = clean(query.get('q'), 60).toLowerCase(), tag = query.get('tag'), sort = query.get('sort') || 'popular';
  let list = Object.values(data.servers).filter(sv => (sv.discoverable || sv.official) && !(sv.bans || []).some(b => b.userId === me.id));
  if (q) list = list.filter(sv => sv.name.toLowerCase().includes(q) || (sv.description || '').toLowerCase().includes(q) || (sv.tags || []).some(t => t.toLowerCase().includes(q)));
  if (tag) list = list.filter(sv => (sv.tags || []).includes(tag));
  const online = sv => sv.members.filter(id => data.users[id] && effectiveStatus(data.users[id]) !== 'offline').length;
  list.sort(sort === 'new' ? (a, b) => b.createdAt - a.createdAt : sort === 'active' ? (a, b) => online(b) - online(a) : (a, b) => b.members.length - a.members.length);
  const tagCounts = {};
  for (const sv of Object.values(data.servers)) if (sv.discoverable) for (const t of sv.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
  return { servers: list.slice(0, 60).map(sv => invitePreview(sv, me)), tags: DISCOVERY_TAGS, tagCounts };
});
route('GET', '/api/discover/:id', async ({ me, params }) => {
  const sv = data.servers[params.id];
  if (!sv || !(sv.discoverable || sv.official)) fail(404, "That server isn't listed in Discover.");
  ensureRoles(sv);
  const publicChannels = sv.channels.filter(ch => {
    const ov = overridesFor(sv, ch).find(o => o.id === sv.id);
    return everyoneRole(sv).perms.includes('view_channels') ? !(ov?.deny || []).includes('view_channels') : (ov?.allow || []).includes('view_channels');
  }).map(ch => ({ name: ch.name, type: ch.type, topic: ch.topic || '' })).slice(0, 12);
  const rulesCh = sv.rulesChannelId && sv.channels.find(c => c.id === sv.rulesChannelId && c.type === 'text');
  const publicRules = rulesCh && !(overridesFor(sv, rulesCh).find(o => o.id === sv.id)?.deny || []).includes('view_channels') && everyoneRole(sv).perms.includes('view_channels');
  const rules = publicRules && data.channelMessages[rulesCh.id]?.messages.filter(m => m.authorId === sv.ownerId || m.authorId === SYSTEM_ID || (sv.members.includes(m.authorId) && isServerMod(sv, m.authorId))).slice(-3).map(m => (m.content || '').slice(0, 600));
  return { server: { ...invitePreview(sv, me), channels: publicChannels, roles: sv.roles.filter(r => !r.everyone && !r.managed && r.hoist).map(r => ({ name: r.name, color: r.color })).slice(0, 8), rules: rules || [], owner: publicUser(data.users[sv.ownerId]) } };
});
route('POST', '/api/discover/:id/join', async ({ me, params }) => {
  const sv = data.servers[params.id];
  if (!sv || !(sv.discoverable || sv.official)) fail(404, "That server isn't listed in Discover.");
  if (sv.official && (sv.removedUsers || []).includes(me.id)) fail(403, 'The Zuno team removed you from Zuno Official.');
  joinServer(sv, me, 'Discover');
  return { server: serverSummary(sv, me) };
});


// ---------- bots & integrations ----------
// Anyone can make a bot in Settings > Developer. A bot is an account that logs in with a token
// ("Authorization: Bot <token>"), joins servers it's added to, and follows the same permissions as people.
data.botTokens ||= {}; // sha256(token) -> bot user id
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function newBotToken(bot) {
  for (const [h, id] of Object.entries(data.botTokens)) if (id === bot.id) delete data.botTokens[h];
  const token = 'zb_' + bot.id + '.' + crypto.randomBytes(24).toString('base64url');
  data.botTokens[sha(token)] = bot.id;
  return token;
}
const botFromToken = t => { const id = t && data.botTokens[sha(t)]; const u = id && data.users[id]; return u && !u.app?.deleted ? u : null; };
// What bots are allowed to call. Everything else is for people only.
const BOT_ROUTES = [
  /^GET \/api\/me$/, /^GET \/api\/servers\/[^/]+$/, /^GET \/api\/users\/[^/]+$/, /^GET \/api\/perms$/,
  /^(GET|POST) \/api\/channels\/[^/]+\/messages$/, /^(PATCH|DELETE) \/api\/channels\/[^/]+\/messages\/[^/]+$/,
  /^POST \/api\/channels\/[^/]+\/messages\/[^/]+\/react$/, /^POST \/api\/channels\/[^/]+\/typing$/,
  /^(GET|PUT) \/api\/bots\/@me(\/commands)?$/, /^PATCH \/api\/bots\/@me$/,
  /^DELETE \/api\/servers\/[^/]+\/members\/[^/]+$/, /^PUT \/api\/servers\/[^/]+\/members\/[^/]+\/roles$/, /^POST \/api\/servers\/[^/]+\/bans$/,
  // (0.46) DMs, and managing roles and channel permissions (each route still checks the bot's own role permissions).
  /^(GET|POST) \/api\/dms\/[^/]+\/messages$/, /^(PATCH|DELETE) \/api\/dms\/[^/]+\/messages\/[^/]+$/,
  /^POST \/api\/servers\/[^/]+\/roles$/, /^(PATCH|DELETE) \/api\/servers\/[^/]+\/roles\/[^/]+$/,
  /^(PUT|DELETE) \/api\/servers\/[^/]+\/members\/[^/]+\/roles\/[^/]+$/,
  /^PATCH \/api\/channels\/[^/]+$/, /^PUT \/api\/channels\/[^/]+\/overrides$/, /^GET \/api\/channels\/[^/]+\/overrides$/,
];
const botAllowed = (method, pathname) => BOT_ROUTES.some(re => re.test(`${method} ${pathname}`));
// (security) A bot only ever reaches servers it's actually in, and channels it can see there,
// checked once for every request before any route runs (on top of each route's own checks).
function botScope(bot, pathname) {
  let m = /^\/api\/servers\/([^/]+)/.exec(pathname);
  if (m) { const sv = data.servers[decodeURIComponent(m[1])]; if (!sv || !Object.hasOwn(data.servers, sv.id) || !sv.members.includes(bot.id)) fail(404, 'Server not found.'); }
  m = /^\/api\/channels\/([^/]+)/.exec(pathname);
  if (m) { const { sv, ch } = findChannel(decodeURIComponent(m[1])); if (!sv || !ch || !sv.members.includes(bot.id) || !canView(ensureRoles(sv), ch, bot.id)) fail(404, 'Channel not found.'); }
}

function botUsername(name) {
  const base = (name.toLowerCase().replace(/[^a-z0-9_.]+/g, '').slice(0, 24) || 'bot');
  let u = base;
  while (u.length < 2 || CONFIG.RESERVED_USERNAMES.includes(u) || STAFF_NAMES.has(u) || Object.values(data.users).some(x => x.username === u)) u = base + Math.floor(1000 + Math.random() * 9000);
  return u;
}
function appView(bot, viewer) {
  const a = bot.app || {};
  const mine = viewer && a.ownerId === viewer.id;
  return {
    id: bot.id, name: bot.displayName, username: bot.username, avatar: bot.avatar, description: a.description || '', public: !!a.public, category: a.category || 'Other', tagline: a.tagline || '',
    perms: a.perms || [], commands: a.commands || [], createdAt: bot.createdAt, owner: publicUser(data.users[a.ownerId]),
    servers: mine ? Object.values(data.servers).filter(sv => sv.members.includes(bot.id)).map(sv => ({ id: sv.id, name: sv.name })) : undefined,
    online: isOnline(bot.id) || !!a.rules?.some(r => r.enabled !== false),
  };
}
function myApp(me, id) {
  const bot = data.users[id];
  if (!bot || !devBot(bot) || bot.app?.ownerId !== me.id || bot.app?.deleted) fail(404, 'Bot not found.');
  return bot;
}
route('GET', '/api/apps', async ({ me }) => ({
  apps: Object.values(data.users).filter(u => devBot(u) && u.app?.ownerId === me.id && !u.app.deleted).map(u => appView(u, me)),
  perms: PERM_INFO,
}));
route('POST', '/api/apps', async ({ me, body }) => {
  if (me.bot) fail(403, "Bots can't make bots.");
  const name = checkName(clean(body.name, 32));
  if (name.length < 2) fail(400, 'Give your bot a name (at least 2 characters).');
  if (Object.values(data.users).filter(u => devBot(u) && u.app?.ownerId === me.id && !u.app.deleted).length >= 10) fail(400, 'You can have up to 10 bots.');
  const id = newId();
  const bot = data.users[id] = {
    id, username: botUsername(name), email: null, displayName: name, passwordHash: null, bot: true,
    avatar: null, bannerColor: BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)], bio: clean(body.description, 190),
    pronouns: '', customStatus: '', status: 'online', createdAt: Date.now(), lastRead: {}, welcomed: true,
    app: { ownerId: me.id, description: clean(body.description, 400), public: false, perms: ['view_channels', 'send_messages', 'add_reactions', 'read_history', 'attach_files'], commands: [] },
  };
  const token = newBotToken(bot);
  save();
  return { app: appView(bot, me), token };
});
route('PATCH', '/api/apps/:id', async ({ me, params, body }) => {
  const bot = myApp(me, params.id);
  if ('name' in body) { const n = checkName(clean(body.name, 32)); if (n.length < 2) fail(400, 'Give your bot a name.'); bot.displayName = n; }
  if ('description' in body) { bot.app.description = clean(body.description, 400); bot.bio = bot.app.description.slice(0, 190); }
  if ('public' in body) { bot.app.public = !!body.public; hooks.patchApp46?.(bot); }
  if ('perms' in body) bot.app.perms = cleanPerms(body.perms).filter(p => p !== 'administrator' || body.allowAdmin);
  save(); broadcastUser(bot);
  return { app: appView(bot, me) };
});
route('POST', '/api/apps/:id/avatar', async ({ me, params, body }) => {
  const bot = myApp(me, params.id);
  const k = sniff(body);
  if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Bot avatars must be PNG, JPG, WebP or GIF images.');
  if (bot.avatar?.startsWith('/uploads/')) removeUpload(bot.avatar);
  bot.avatar = storeUpload(body, k.ext);
  save(); broadcastUser(bot);
  return { app: appView(bot, me) };
}, { raw: 2_000_000 });
route('POST', '/api/apps/:id/token', async ({ me, params }) => {
  const bot = myApp(me, params.id);
  const token = newBotToken(bot);
  for (const res of streams.get(bot.id) || []) res.end(); // the old token's connection closes
  save();
  return { token };
});
route('DELETE', '/api/apps/:id', async ({ me, params }) => {
  const bot = myApp(me, params.id);
  for (const sv of Object.values(data.servers)) if (sv.members.includes(bot.id)) removeMember(sv, bot.id);
  for (const [h, id] of Object.entries(data.botTokens)) if (id === bot.id) delete data.botTokens[h];
  for (const res of streams.get(bot.id) || []) res.end();
  bot.app.deleted = true; bot.displayName += ' (deleted)';
  save();
  return { ok: true };
});
// Anyone can look up a public bot (or their own) to add it to a server.
route('GET', '/api/apps/:id/public', async ({ me, params }) => {
  const bot = data.users[params.id];
  if (!devBot(bot) || bot.app?.deleted || (!bot.app?.public && bot.app?.ownerId !== me.id)) fail(404, "That bot doesn't exist or is private.");
  const servers = Object.values(data.servers).filter(sv => sv.members.includes(me.id) && can(ensureRoles(sv), me.id, 'manage_integrations')).map(sv => ({ id: sv.id, name: sv.name, icon: sv.icon, iconColor: sv.iconColor, has: sv.members.includes(bot.id) }));
  return { app: appView(bot, me), servers };
});
route('GET', '/api/apps-directory', async ({ me, query }) => {
  const q = clean(query.get('q'), 40).toLowerCase();
  const list = Object.values(data.users).filter(u => devBot(u) && !u.app?.deleted && u.app?.public && (!q || u.displayName.toLowerCase().includes(q) || (u.app.description || '').toLowerCase().includes(q)));
  const count = id => Object.values(data.servers).filter(sv => sv.members.includes(id)).length;
  return { apps: list.sort((a, b) => count(b.id) - count(a.id)).slice(0, 40).map(u => ({ ...appView(u, me), serverCount: count(u.id) })) };
});
// Add a bot to a server: it gets its own role with the permissions it asked for (only ones you have).
route('POST', '/api/servers/:id/bots', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  const bot = data.users[String(body.botId || '')];
  if (!devBot(bot) || bot.app?.deleted || (!bot.app?.public && bot.app?.ownerId !== me.id)) fail(404, "That bot doesn't exist or is private.");
  if (sv.members.includes(bot.id)) fail(400, `${bot.displayName} is already in this server.`);
  if ((sv.bans || []).some(b => b.userId === bot.id)) fail(403, 'That bot is banned from this server.');
  if (sv.members.filter(id => devBot(data.users[id])).length >= 25) fail(400, 'A server can have up to 25 bots.');
  const mine = basePerms(sv, me.id);
  const perms = cleanPerms(Array.isArray(body.perms) ? body.perms : bot.app.perms).filter(p => mine.has(p));
  sv.members.push(bot.id);
  const role = { id: newId(), name: bot.displayName, color: null, perms, hoist: false, mentionable: false, managed: bot.id };
  const at = me.id === sv.ownerId ? 0 : topPos(sv, me.id) + 1;
  sv.roles.splice(Math.min(at, sv.roles.length - 1), 0, role);
  sv.memberRoles[bot.id] = [role.id];
  bot.joinedAt ||= {}; bot.joinedAt[sv.id] = Date.now();
  sv.joinedVia ||= {}; sv.joinedVia[bot.id] = `added by ${me.displayName}`;
  audit(sv, me, 'bot_add', { type: 'member', id: bot.id, name: bot.displayName }, perms.map(p => PERM_INFO[p].label).join(', '));
  const general = sv.channels.find(c => c.id === sv.welcomeChannelId) || sv.channels.find(c => c.type === 'text');
  if (general && sv.welcomeMessages !== false) postMessage(channelConvFor(sv, general), data.users[SYSTEM_ID], `🤖 **${me.displayName}** added the bot **${bot.displayName}**.`);
  save(); refreshServer(sv);
  send(bot.id, 'server-join', { serverId: sv.id, name: sv.name });
  return { server: serverSummary(sv, me) };
});
// Bots manage themselves with their token.
route('GET', '/api/bots/@me', async ({ me }) => { if (!devBot(me)) fail(403, 'Only bots can do that.'); return { app: appView(me, null), servers: Object.values(data.servers).filter(sv => sv.members.includes(me.id)).map(sv => ({ id: sv.id, name: sv.name, channels: sv.channels.filter(c => canView(ensureRoles(sv), c, me.id)).map(c => ({ id: c.id, name: c.name, type: c.type })) })) }; });
route('PATCH', '/api/bots/@me', async ({ me, body }) => {
  if (!devBot(me)) fail(403, 'Only bots can do that.');
  if ('customStatus' in body) me.customStatus = checkName(clean(body.customStatus, 80));
  save(); broadcastUser(me);
  return { ok: true };
});
route('PUT', '/api/bots/@me/commands', async ({ me, body }) => {
  if (!devBot(me)) fail(403, 'Only bots can do that.');
  const list = (Array.isArray(body.commands) ? body.commands : []).slice(0, 25).map(c => ({
    name: String(c?.name || '').toLowerCase().trim(), description: clean(c?.description, 100), usage: clean(c?.usage, 60),
  })).filter(c => /^[a-z0-9_-]{1,32}$/.test(c.name));
  me.app.commands = list.filter((c, i) => list.findIndex(x => x.name === c.name) === i);
  save();
  for (const sv of Object.values(data.servers)) if (sv.members.includes(me.id)) refreshServer(sv);
  return { commands: me.app.commands };
});
route('GET', '/api/bots/@me/commands', async ({ me }) => { if (!devBot(me)) fail(403, 'Only bots can do that.'); return { commands: me.app.commands || [] }; });
// The commands people can use in a server (for the "/" menu in the message box).
route('GET', '/api/servers/:id/commands', async ({ me, params }) => {
  const sv = ensureRoles(getServer(me, params.id));
  const out = [];
  for (const id of sv.members) {
    const bot = data.users[id];
    if (!devBot(bot) || bot.app?.deleted) continue;
    for (const c of bot.app?.commands || []) out.push({ ...c, botId: bot.id, botName: bot.displayName, botAvatar: bot.avatar });
  }
  return { commands: out };
});

// ---- webhooks: post into a channel from anywhere with a secret URL ----
function webhookUser(w) {
  const id = 'wh_' + w.id;
  data.users[id] = { ...(data.users[id] || {}), id, username: 'webhook', displayName: w.name, bot: true, webhook: true, avatar: w.avatar || null, bannerColor: '#5c6b6a', email: null, passwordHash: null, bio: '', pronouns: '', customStatus: '', status: 'online', createdAt: data.users[id]?.createdAt || Date.now(), lastRead: {}, welcomed: true };
  return data.users[id];
}
const webhookView = (sv, w, token) => ({ id: w.id, name: w.name, channelId: w.channelId, channelName: sv.channels.find(c => c.id === w.channelId)?.name || '?', avatar: w.avatar || null, by: publicUser(data.users[w.by]), at: w.at, uses: w.uses || 0, ...(token ? { url: `/api/webhooks/${w.id}/${token}` } : {}) });
route('GET', '/api/servers/:id/integrations', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  return {
    webhooks: sv.webhooks.map(w => webhookView(sv, w)),
    bots: sv.members.filter(id => devBot(data.users[id])).map(id => ({ ...appView(data.users[id], me), role: sv.roles.find(r => r.managed === id) || null, addedVia: sv.joinedVia?.[id] || null })),
  };
});
route('POST', '/api/servers/:id/webhooks', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  const ch = sv.channels.find(c => c.id === body.channelId && c.type === 'text');
  if (!ch) fail(400, 'Pick a text channel for the webhook.');
  if (!can(sv, me.id, 'send_messages', ch)) fail(403, "You can only add webhooks to channels you can post in.");
  if (sv.webhooks.length >= 20) fail(400, 'A server can have up to 20 webhooks.');
  const token = crypto.randomBytes(24).toString('base64url');
  const w = { id: newId(), name: checkName(clean(body.name, 32)) || 'Captain Hook', channelId: ch.id, tokenHash: sha(token), by: me.id, at: Date.now(), uses: 0 };
  sv.webhooks.push(w); webhookUser(w);
  audit(sv, me, 'webhook_create', { type: 'webhook', id: w.id, name: w.name }, `in #${ch.name}`);
  save();
  return { webhook: webhookView(sv, w, token) };
});
route('PATCH', '/api/servers/:id/webhooks/:whId', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  const w = sv.webhooks.find(x => x.id === params.whId);
  if (!w) fail(404, 'Webhook not found.');
  if ('name' in body) w.name = checkName(clean(body.name, 32)) || w.name;
  if ('channelId' in body) { const nc = sv.channels.find(c => c.id === body.channelId && c.type === 'text'); if (!nc) fail(400, 'Pick a text channel.'); if (!can(sv, me.id, 'send_messages', nc)) fail(403, 'You can only point webhooks at channels you can post in.'); w.channelId = body.channelId; }
  let token;
  if (body.newUrl) { token = crypto.randomBytes(24).toString('base64url'); w.tokenHash = sha(token); }
  webhookUser(w);
  audit(sv, me, 'webhook_update', { type: 'webhook', id: w.id, name: w.name }, body.newUrl ? 'made a new URL' : '');
  save();
  return { webhook: webhookView(sv, w, token) };
});
route('POST', '/api/servers/:id/webhooks/:whId/avatar', async ({ me, params, body }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  const w = sv.webhooks.find(x => x.id === params.whId);
  if (!w) fail(404, 'Webhook not found.');
  const k = sniff(body);
  if (!k || !['png', 'jpg', 'webp', 'gif'].includes(k.ext)) fail(400, 'Use a PNG, JPG, WebP or GIF image.');
  removeUpload(w.avatar); w.avatar = storeUpload(body, k.ext); webhookUser(w);
  save();
  return { webhook: webhookView(sv, w) };
}, { raw: 2_000_000 });
route('DELETE', '/api/servers/:id/webhooks/:whId', async ({ me, params }) => {
  const sv = getManagedServer(me, params.id, 'manage_integrations');
  const w = sv.webhooks.find(x => x.id === params.whId);
  if (!w) fail(404, 'Webhook not found.');
  sv.webhooks = sv.webhooks.filter(x => x !== w);
  audit(sv, me, 'webhook_delete', { type: 'webhook', id: w.id, name: w.name });
  save();
  return { ok: true };
});
// The public end: POST { content, username?, avatarUrl? } to the secret URL.
route('POST', '/api/webhooks/:whId/:token', async ({ params, body, req }) => {
  let found = null;
  for (const sv of Object.values(data.servers)) { const w = (sv.webhooks || []).find(x => x.id === params.whId); if (w) { found = { sv, w }; break; } }
  if (!found || found.w.tokenHash !== sha(params.token)) fail(404, 'Unknown webhook.');
  const { sv, w } = found;
  limit('wh:' + w.id, 30, 60e3, 'This webhook is posting too fast (30 a minute).');
  limit('whip:' + clientIp(req), 60, 60e3, 'Too many webhook posts from here.');
  const ch = sv.channels.find(c => c.id === w.channelId);
  if (!ch) fail(404, 'The channel for this webhook is gone.');
  const content = String(body.content ?? body.text ?? '').replace(/\r\n/g, '\n').trim().slice(0, 2000);
  if (!content) fail(400, 'Send some "content".');
  const extra = { webhookId: w.id };
  const as = {};
  if (body.username) as.name = checkName(clean(body.username, 32));
  if (typeof body.avatarUrl === 'string' && /^https:\/\/[^\s"'<>]{4,400}$/.test(body.avatarUrl)) as.avatar = body.avatarUrl;
  if (as.name || as.avatar) extra.as = as;
  // Webhooks can't ping @everyone or roles.
  const conv = channelConvFor(sv, ch);
  conv.perms = new Set(['send_messages']);
  const message = postMessage(conv, webhookUser(w), content.replace(/@(everyone|here)\b/gi, '@​$1'), extra);
  w.uses = (w.uses || 0) + 1; save();
  return { id: message.id };
}, { auth: false });

// ---------- calls (voice, video, screen share) ----------
// Zuno only passes call setup messages between people; the audio and video go directly between computers.
// Rooms: "dm:<a>:<b>" for DM calls, "vc:<channelId>" for voice channels.
const rooms = new Map(); // roomId -> Map(userId -> { muted, deafened, video, screen })
const roomMembers = id => [...(rooms.get(id)?.keys() || [])];
function roomAccess(me, roomId) {
  if (roomId.startsWith('dm:')) {
    const ids = roomId.slice(3).split(':');
    if (ids.length !== 2 || !ids.includes(me.id)) fail(403, "You can't join that call.");
    const otherId = ids[0] === me.id ? ids[1] : ids[0];
    const other = data.users[otherId];
    if (!other || other.system) fail(403, "You can't call Zuno.");
    if (other.bot) fail(403, "Testing can't pick up calls. Try calling a friend!");
    if (!areFriends(me.id, otherId)) fail(403, 'You can only call your friends.');
    if (isBlocked(me.id, otherId)) fail(403, "You can't call this person.");
    return { kind: 'dm', allowed: ids, otherId };
  }
  // Group calls: "gc:<groupId>". Anyone in the group can start or join; it rings everyone else.
  if (roomId.startsWith('gc:')) {
    const g = data.groups[roomId.slice(3)];
    if (!g || !g.members.includes(me.id)) fail(404, 'Group not found.');
    return { kind: 'group', allowed: g.members, group: g };
  }
  if (roomId.startsWith('vc:')) {
    const { sv, ch } = findChannel(roomId.slice(3));
    if (!sv || ch.type !== 'voice' || !sv.members.includes(me.id) || !canView(ensureRoles(sv), ch, me.id)) fail(404, 'Voice channel not found.');
    return { kind: 'voice', allowed: sv.members.filter(id => canView(sv, ch, id)), server: sv, channel: ch };
  }
  fail(400, 'Unknown call.');
}
function voiceUpdate(roomId) {
  if (roomId.startsWith('gc:')) {
    const g = data.groups[roomId.slice(3)];
    if (g) for (const id of g.members) send(id, 'group-call', { groupId: g.id, users: roomMembers(roomId) });
    return;
  }
  if (!roomId.startsWith('vc:')) return;
  const { sv, ch } = findChannel(roomId.slice(3));
  if (sv) for (const id of sv.members.filter(x => canView(ensureRoles(sv), ch, x))) send(id, 'voice-state', { serverId: sv.id, channelId: ch.id, users: roomMembers(roomId) });
}

// ---- calls show up in the chat: "📞 Alex started a call", then "Missed call" or "Call ended · 5:23" ----
const callLog = new Map(); // roomId -> { msgId, by, answeredAt, declined }
function callConv(roomId, uid) {
  const u = data.users[uid];
  if (!u) return null;
  try {
    if (roomId.startsWith('dm:')) { const ids = roomId.slice(3).split(':'); return dmConv(u, ids[0] === uid ? ids[1] : ids[0]); }
    if (roomId.startsWith('gc:')) return groupConv(u, roomId.slice(3));
  } catch {}
  return null;
}
function callStarted(roomId, me, video) {
  const conv = callConv(roomId, me.id);
  if (!conv) return;
  const m = postMessage(conv, me, '', { call: { state: 'ringing', video: !!video, startedAt: Date.now(), joined: [me.id] } });
  callLog.set(roomId, { msgId: m.id, by: me.id, answeredAt: null, declined: false });
}
function callUpdate(roomId, change) {
  const log = callLog.get(roomId);
  if (!log) return;
  const conv = callConv(roomId, log.by) || callConv(roomId, (rooms.get(roomId) && [...rooms.get(roomId).keys()][0]) || '');
  const st = conv?.peek();
  const i = st ? st.messages.findIndex(m => m.id === log.msgId) : -1;
  if (i < 0) return;
  const m = st.messages[i];
  const call = typeof change === 'function' ? change(m.call) : { ...m.call, ...change };
  const message = st.messages[i] = { ...m, call };
  save();
  emit(conv, 'message-update', { message });
}
function callEnded(roomId) {
  const log = callLog.get(roomId);
  if (!log) return;
  const now = Date.now();
  callUpdate(roomId, c => ({ ...c, endedAt: now, state: log.answeredAt ? 'ended' : log.declined ? 'declined' : 'missed', duration: log.answeredAt ? now - log.answeredAt : 0 }));
  callLog.delete(roomId);
  if (!log.answeredAt && !log.declined) for (const fn of hooks.callDone) fn(roomId, log, callConv(roomId, log.by));
}
const voiceSince = new Map(); // "room|user" -> when they joined
// Losing access to a call (removed from the group, unfriended or blocked, a channel made private,
// roles changed, timed out, suspended) takes you out of it right away, so nobody keeps listening.
function stillInvited(uid, roomId) {
  const u = data.users[uid];
  if (!u || isSuspended(u)) return false;
  try {
    const a = roomAccess(u, roomId);
    if (a.kind === 'voice' && !can(a.server, uid, 'connect', a.channel)) return false;
    return true;
  } catch { return false; }
}
let roomSweep = null;
function enforceRoomAccess() {
  clearTimeout(roomSweep); roomSweep = null;
  for (const [roomId, room] of [...rooms]) for (const uid of [...room.keys()]) {
    if (stillInvited(uid, roomId)) continue;
    leaveRoom(roomId, uid);
    send(uid, 'call-ended', { room: roomId, removed: true });
  }
}
const soonEnforceRooms = () => { if (!roomSweep && rooms.size) roomSweep = setTimeout(enforceRoomAccess, 50); };
setInterval(() => rooms.size && enforceRoomAccess(), 5000).unref();
function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room || !room.has(userId)) return;
  room.delete(userId);
  const since = voiceSince.get(roomId + '|' + userId);
  voiceSince.delete(roomId + '|' + userId);
  const u = data.users[userId];
  if (since && u) { u.stats ||= {}; u.stats.voiceMs = (u.stats.voiceMs || 0) + (Date.now() - since); save(); }
  for (const id of room.keys()) send(id, 'rtc-peer-left', { room: roomId, userId });
  for (const fn of hooks.roomChange) fn(roomId, userId, 'leave', room);
  if (roomId.startsWith('dm:')) {
    // A DM call ends when either person leaves (and stops ringing if nobody answered).
    for (const id of roomId.slice(3).split(':')) if (id !== userId) send(id, 'call-ended', { room: roomId });
    rooms.delete(roomId);
    callEnded(roomId);
  } else if (!room.size) {
    rooms.delete(roomId);
    // The last person left a group call: stop it ringing for everyone.
    if (roomId.startsWith('gc:')) { for (const id of data.groups[roomId.slice(3)]?.members || []) send(id, 'call-ended', { room: roomId }); callEnded(roomId); }
  }
  voiceUpdate(roomId);
}
function closeRoom(roomId) {
  for (const id of roomMembers(roomId)) { send(id, 'call-ended', { room: roomId }); }
  rooms.delete(roomId);
}
const userRooms = userId => [...rooms.entries()].filter(([, r]) => r.has(userId)).map(([id]) => id);

route('POST', '/api/rtc/join', async ({ me, body }) => {
  const roomId = String(body.room || '');
  const access = roomAccess(me, roomId);
  if (roomId.startsWith('vc:')) {
    const { sv, ch } = findChannel(roomId.slice(3));
    const inside = roomMembers(roomId);
    if (!can(sv, me.id, 'connect', ch)) fail(403, "You don't have permission to join this voice channel.");
    if (ch?.userLimit && !inside.includes(me.id) && inside.length >= ch.userLimit && !can(sv, me.id, 'manage_channels', ch)) fail(403, `This voice channel is full (${ch.userLimit} people).`);
  }
  // One call at a time: leave any other call first.
  for (const other of userRooms(me.id)) if (other !== roomId) leaveRoom(other, me.id);
  const isNew = !rooms.get(roomId)?.size;
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);
  const peers = [...room.entries()].filter(([id]) => id !== me.id).map(([id, st]) => ({ userId: id, ...st }));
  room.set(me.id, { muted: !!body.muted || (access.kind === 'voice' && !can(access.server, me.id, 'speak', access.channel)), deafened: !!body.deafened, video: false, screen: false });
  for (const fn of hooks.roomChange) fn(roomId, me.id, 'join', room);
  if (!voiceSince.has(roomId + '|' + me.id)) voiceSince.set(roomId + '|' + me.id, Date.now());
  for (const p of peers) send(p.userId, 'rtc-peer-joined', { room: roomId, userId: me.id, user: publicUser(me), state: room.get(me.id) });
  // Starting a call rings the other person (or everyone in the group), and everyone hears the
  // same ringtone while it rings (null means their own).
  let ringtone = null;
  if (access.kind === 'dm' && !room.has(access.otherId)) {
    ringtone = hooks.ringtone ? hooks.ringtone(me, data.users[access.otherId]) : null;
    send(access.otherId, 'call-ring', { room: roomId, from: publicUser(me), peerId: me.id, video: !!body.video, ringtone });
  }
  if (access.kind === 'group' && isNew) {
    const g = access.group;
    ringtone = hooks.ringtone ? hooks.ringtone(...g.members.map(id => data.users[id])) : null;
    const info = { id: g.id, name: g.name || '', icon: g.icon || null, members: g.members.length };
    for (const id of g.members) if (id !== me.id) send(id, 'call-ring', { room: roomId, from: publicUser(me), group: info, video: !!body.video, ringtone });
  }
  if ((access.kind === 'dm' || access.kind === 'group') && isNew) callStarted(roomId, me, body.video);
  else if (callLog.has(roomId) && callLog.get(roomId).by !== me.id) {
    const log = callLog.get(roomId);
    log.answeredAt ||= Date.now();
    callUpdate(roomId, c => ({ ...c, state: 'ongoing', answeredAt: log.answeredAt, joined: [...new Set([...(c.joined || []), me.id])] }));
  }
  voiceUpdate(roomId);
  return { peers, users: peers.map(p => publicUser(data.users[p.userId])).filter(Boolean), ringtone };
});
route('POST', '/api/rtc/leave', async ({ me, body }) => {
  leaveRoom(String(body.room || ''), me.id);
  return { ok: true };
});
route('POST', '/api/rtc/decline', async ({ me, body }) => {
  const roomId = String(body.room || '');
  const access = roomAccess(me, roomId);
  if (access.kind === 'dm') {
    if (callLog.has(roomId)) callLog.get(roomId).declined = true;
    for (const id of roomMembers(roomId)) send(id, 'call-declined', { room: roomId, by: me.id });
  }
  return { ok: true };
});
route('POST', '/api/rtc/signal', async ({ me, body }) => {
  const room = rooms.get(String(body.room || ''));
  if (!room?.has(me.id) || !room.has(body.to)) return { ok: false };
  if (!stillInvited(me.id, String(body.room)) || !stillInvited(body.to, String(body.room))) { soonEnforceRooms(); return { ok: false }; }
  send(body.to, 'rtc-signal', { room: body.room, from: me.id, data: body.data });
  return { ok: true };
});
// Someone clipped the call: everyone in it is told, so nobody is clipped without knowing.
route('POST', '/api/rtc/clipped', async ({ me, body }) => {
  const room = String(body.room || '');
  if (!rooms.get(room)?.has(me.id)) return { ok: false };
  limit('clip:' + me.id, 10, 60e3, 'Slow down on the clips for a moment.');
  for (const id of roomMembers(room)) if (id !== me.id) send(id, 'clipped', { room, by: me.id, name: me.displayName });
  return { ok: true };
});
route('POST', '/api/rtc/state', async ({ me, body }) => {
  const room = rooms.get(String(body.room || ''));
  if (!room?.has(me.id)) return { ok: false };
  const st = { muted: !!body.muted, deafened: !!body.deafened, video: !!body.video, screen: !!body.screen };
  // Voice channel permissions: no "Speak" keeps you muted, no "Video" keeps your camera and screen off.
  const vc = String(body.room).startsWith('vc:') ? findChannel(String(body.room).slice(3)) : null;
  if (vc?.sv) {
    if (!st.muted && !can(vc.sv, me.id, 'speak', vc.ch)) fail(403, "You don't have permission to speak in this voice channel.");
    if ((st.video || st.screen) && !can(vc.sv, me.id, 'video', vc.ch)) fail(403, "You don't have permission to share video in this voice channel.");
  }
  for (const fn of hooks.rtcState) fn(String(body.room), me, st);
  room.set(me.id, st);
  for (const id of room.keys()) if (id !== me.id) send(id, 'rtc-state', { room: body.room, userId: me.id, ...st });
  return { ok: true };
});

// A browser's live connection (EventSource) can't send headers, so it swaps its login token for a
// short-lived, one-use ticket and connects with that.
const eventTickets = new Map();
setInterval(() => { const now = Date.now(); for (const [t, g] of eventTickets) if (g.expiresAt <= now) eventTickets.delete(t); }, 60e3).unref();
route('POST', '/api/events/ticket', async ({ token, me }) => {
  if (!token || !me || me.bot) fail(401, 'Not signed in.');
  const ticket = crypto.randomBytes(32).toString('hex');
  eventTickets.set(ticket, { sessionToken: token, uid: me.id, expiresAt: Date.now() + 30e3 });
  return { ticket, expiresIn: 30 };
});

// ---------- live event stream ----------
function openStream(req, res, user, token = null) {
  res.zunoToken = token;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform', // (0.53) no proxy may hold updates back to compress them
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  // Coming back after a drop: send what was missed, or ask the app to reload if that's not possible.
  const last = Number(new URL(req.url, 'http://x').searchParams.get('last'));
  if (last > 0) {
    const r = replay.get(user.id);
    const missed = r ? r.items.filter(i => i.seq > last) : null;
    const complete = r && r.seq >= last && (missed.length ? missed[0].seq === last + 1 : r.seq === last);
    if (complete) { for (const i of missed) res.write(i.chunk); res.write(`event: resumed\ndata: {"count":${missed.length}}\n\n`); }
    else res.write('event: resync\ndata: {}\n\n');
  }
  const wasOnline = isOnline(user.id);
  if (!streams.has(user.id)) streams.set(user.id, new Set());
  streams.get(user.id).add(res);
  if (!wasOnline) broadcastUser(user);

  const ping = setInterval(() => streamWrite(res, ': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    const set = streams.get(user.id);
    set?.delete(res);
    if (set && set.size === 0) {
      streams.delete(user.id);
      for (const roomId of userRooms(user.id)) leaveRoom(roomId, user.id);
      broadcastUser(user); // went offline
    }
  });
}

// ---------- static files ----------
const MIME = { '.mp3': 'audio/mpeg', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
// App files are kept in memory with a fingerprint (ETag), so a browser that already has the latest
// copy gets a tiny "not changed" answer instead of downloading it again.
const staticCache = new Map(); // file -> { mtime, buf, etag }
function serveStatic(pathname, res, req = null) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (se, st) => {
    const hit = !se && staticCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && pageFresh(hit)) return sendStatic(file, hit, req, res);
    fs.readFile(file, (err, buf) => {
      if (err) return staticFallback(res, req);
      const refs = path.extname(file) === '.html' ? [] : null;
      if (refs) buf = versionPage(buf, refs);
      const entry = { mtime: st.mtimeMs, buf, refs, etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"' };
      staticCache.set(file, entry);
      sendStatic(file, entry, req, res);
    });
  });
}
// ---------- faster loading (0.28) ----------
// The app page points at its scripts and styles with a version tag (/app.js?v=…, a fingerprint of
// the file). A versioned file never changes, so browsers keep it for a year and don't ask again:
// opening Zuno a second time no longer checks ~70 files one by one. A new version of a file gets a
// new tag, so updates still arrive straight away.
// Text files are also sent compressed (Brotli or gzip, made once per version and kept in memory),
// about a quarter of the size.
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt', '.webmanifest']);
const assetVersion = new Map(); // file -> { mtime, v }
function versionOf(rel) {
  const file = path.join(PUBLIC_DIR, rel);
  try {
    const st = fs.statSync(file);
    const hit = assetVersion.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit.v;
    const v = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 10);
    assetVersion.set(file, { mtime: st.mtimeMs, v });
    return v;
  } catch { return null; }
}
// (A page remembers which versions it was made with; if a script or style changes while Zuno is
// running, the page is made again.)
const pageFresh = entry => !entry.refs || entry.refs.every(([rel, v]) => versionOf(rel) === v);
function versionPage(buf, refs = []) {
  return Buffer.from(buf.toString('utf8').replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")(\/[A-Za-z0-9_.\/-]+\.(?:js|css))(")/g, (all, a, rel, b) => {
    const v = versionOf(rel);
    if (v) refs.push([rel, v]);
    return v ? `${a}${rel}?v=${v}${b}` : all;
  }));
}
let storageOriginCache;
function storageOrigin() {
  if (storageOriginCache !== undefined) return storageOriginCache;
  // Private chat files come from the bucket's own address, public pictures from S3_PUBLIC_URL.
  try { const list = [...new Set([process.env.S3_ENDPOINT, process.env.S3_PUBLIC_URL].filter(Boolean).map(u => new URL(u).origin))]; storageOriginCache = storage.enabled() && list.length ? list.map(o => `<${o}>; rel=preconnect`).join(', ') : null; } catch { storageOriginCache = null; }
  return storageOriginCache;
}
function sendStatic(file, entry, req, res) {
  // (0.45) The app page can point at one bundled script and stylesheet instead of ~85 files.
  // ?nobundle=1 always gets the plain page (the bundle's safety net uses it).
  if (hooks.indexPage && path.basename(file) === 'index.html' && !/[?&]nobundle=1/.test(req?.url || '')) entry = hooks.indexPage(entry) || entry;
  const { buf, etag } = entry;
  const ext = path.extname(file);
  // Only the file that was actually asked for is kept "forever"; the app page never is.
  const versioned = /[?&]v=[\w-]{6,}/.test(req?.url || '') && path.basename(file) !== 'index.html' && path.basename(req?.url?.split('?')[0] || '') === path.basename(file);
  const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
  // (0.48) The app page tells the browser to connect to the file storage early, so the first
  // pictures and videos in a chat start arriving sooner.
  if (ext === '.html' && storageOrigin()) head.Link = storageOrigin();
  // Cloudflare marks the tag as "weak" (W/"…") when it compresses the file, so compare without that.
  const sent = String(req?.headers['if-none-match'] || '').split(',').map(t => t.trim().replace(/^W\//, ''));
  if (sent.includes(etag)) { res.writeHead(304, head); return res.end(); }
  const accept = String(req?.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && buf.length > 1024 && req?.method !== 'HEAD') {
    if (/\bbr\b/.test(accept)) {
      entry.br ||= zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
      res.writeHead(200, { ...head, 'Content-Encoding': 'br', 'Content-Length': entry.br.length });
      return res.end(entry.br);
    }
    if (/\bgzip\b/.test(accept)) {
      entry.gz ||= zlib.gzipSync(buf, { level: 9 });
      res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': entry.gz.length });
      return res.end(entry.gz);
    }
  }
  res.writeHead(200, { ...head, 'Content-Length': buf.length });
  res.end(buf);
}
function staticFallback(res, req = null) {
  // A missing script, stylesheet or picture is a plain "not found", never the app page: during a
  // deploy the old server can be asked for a file only the new one has, and a page saved as a
  // stylesheet would break that browser until the file changes again.
  const askedPath = (req?.url || '').split('?')[0];
  if (/\.[a-z0-9]{1,5}$/i.test(askedPath) && !/\.html?$/i.test(askedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('Not found');
  }
  // Unknown paths fall back to the app page (served from the same in-memory cache as everything else).
  const file = path.join(PUBLIC_DIR, 'index.html');
  fs.stat(file, (se, st) => {
    if (se) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const hit = staticCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && pageFresh(hit)) return sendStatic(file, hit, req, res);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const refs = [];
      buf = versionPage(buf, refs);
      const entry = { mtime: st.mtimeMs, buf, refs, etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"' };
      staticCache.set(file, entry);
      sendStatic(file, entry, req, res);
    });
  });
}

// Uploaded sounds/videos. Supports "Range" requests so audio and video can stream and loop smoothly.
const MEDIA = { '.webm': 'video/webm', '.avif': 'image/avif', '.bmp': 'image/bmp', '.heic': 'image/heic', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
// Not on the disk? It's in the cloud: send people there, or pass it through (with Range for audio/video).
async function serveFromCloud(req, res, name, extra = {}) {
  if (!storage.enabled()) { res.writeHead(404); return res.end(); }
  // Send the browser straight to the cloud, so the file doesn't count against the server's bandwidth.
  // Private files get a link that only works for a day or two; public ones can use S3_PUBLIC_URL.
  // ?direct=1 passes the file through instead (the app uses it to copy or save a picture, since
  // reading a file from another site needs extra bucket settings).
  const isPrivate = /private/.test(extra['Cache-Control'] || '');
  if (!new URL(req.url, 'http://x').searchParams.has('direct')) {
    const pub = !isPrivate && !extra['Content-Disposition'] && storage.publicUrl(name);
    const download = /^attachment/.test(extra['Content-Disposition'] || '');
    const to = pub || storage.presignedUrl(name, {
      ...(extra['Content-Type'] ? { 'response-content-type': extra['Content-Type'] } : {}),
      ...(download ? { 'response-content-disposition': extra['Content-Disposition'] } : {}),
    });
    res.writeHead(302, { Location: to, 'Cache-Control': `${isPrivate ? 'private' : 'public'}, max-age=3600`, 'X-Content-Type-Options': 'nosniff' });
    return res.end();
  }
  try {
    const up = await storage.get(name, req.headers.range);
    if (!up) { res.writeHead(404); return res.end(); }
    const h = { 'Content-Type': extra['Content-Type'] || MEDIA[path.extname(name)] || storage.typeOf(name), 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', ...extra };
    for (const k of ['content-length', 'content-range']) if (up.headers[k]) h[k] = up.headers[k];
    res.writeHead(up.statusCode, h);
    pipeFile(up, res);
  } catch { res.writeHead(502); res.end(); }
}
function serveUpload(req, res, pathname, type = null, extra = null) {
  const file = path.join(UPLOAD_DIR, path.basename(decodeURIComponent(pathname)));
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return serveFromCloud(req, res, path.basename(file), extra || type ? { ...(type ? { 'Content-Type': type } : {}), 'Content-Disposition': 'inline', ...(extra || {}) } : {});
    const headers = { 'Content-Type': type || MEDIA[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', ...(extra || {}) };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return pipeFile(fs.createReadStream(file, { start, end }), res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    pipeFile(fs.createReadStream(file), res);
  });
}
// A file can disappear between checking it and reading it (moved to cloud storage, or an old avatar
// being replaced). Without an error handler that would crash the whole server, so it just ends
// this one response instead.
function pipeFile(stream, res) {
  stream.on('error', () => { try { res.destroy(); } catch {} });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

// ---------- private attachments ----------
// Files sent in chats (pictures, videos, voice messages, files) can only be opened by someone who
// can see a message they're in: the people in the DM or group, or members who can see the channel
// or thread. Also the person who uploaded it, and Zuno Staff (to moderate reports).
// Avatars, banners, emoji and other public pictures aren't attachments, so they stay public.
// The browser proves who you are with the HttpOnly session cookie (pictures can't send headers);
// bots and apps can use their Authorization header instead.
// Where each attachment was posted is remembered (attachmentWhere), so a check looks at one or two
// conversations, not all of Zuno. Answers are cached for a few minutes per person.
const attachmentWhere = new Map(); // attachment id -> Set of "kind|id" ("ch|channelId", "dm|key", "g|groupId", "th|threadId")
let attachmentScanAt = 0;
const fileToAttachment = new Map(); let fileMapAt = 0;
const accessCache = new Map(); // "userId|attachmentId" -> time
const attIdsOf = m => [...(m.attachments || []), ...(m.forward?.attachments || [])].map(a => a?.id).filter(Boolean);
function noteAttachments(where, m) { for (const id of attIdsOf(m)) { let s = attachmentWhere.get(id); if (!s) attachmentWhere.set(id, (s = new Set())); s.add(where); } }
function scanAttachments() {
  attachmentWhere.clear();
  for (const [key, st] of Object.entries(data.dms || {})) for (const m of st.messages || []) noteAttachments('dm|' + key, m);
  for (const [id, st] of Object.entries(data.groupMessages || {})) for (const m of st.messages || []) noteAttachments('g|' + id, m);
  for (const [id, st] of Object.entries(data.channelMessages || {})) for (const m of st.messages || []) noteAttachments('ch|' + id, m);
  for (const [id, t] of Object.entries(data.threads || {})) for (const m of t.messages || []) noteAttachments('th|' + id, m);
  attachmentScanAt = Date.now();
}
hooks.posted.push((conv, m) => {
  if (!attIdsOf(m).length) return;
  noteAttachments(conv.kind === 'dm' ? 'dm|' + conv.key : conv.kind === 'group' ? 'g|' + conv.group.id : 'ch|' + conv.channel.id, m);
});
function attachmentForFile(name) {
  // Attachment files are named after the attachment, so a brand-new upload is found straight away.
  const own = data.attachments[name.split('.')[0]];
  if (own?.file === name) return own;
  if (!fileToAttachment.has(name) && Date.now() - fileMapAt > 2000) {
    fileToAttachment.clear();
    for (const a of Object.values(data.attachments || {})) {
      if (a?.file) fileToAttachment.set(a.file, a.id);
      if (a?.thumb) fileToAttachment.set(path.basename(a.thumb), a.id);
    }
    fileMapAt = Date.now();
  }
  return data.attachments[fileToAttachment.get(name)] || null;
}
function messagesAt(where) {
  const [kind, id] = where.split('|');
  return kind === 'dm' ? data.dms[id]?.messages : kind === 'g' ? data.groupMessages?.[id]?.messages : kind === 'ch' ? data.channelMessages[id]?.messages : data.threads?.[id]?.messages;
}
function canSeeAt(user, where, msg) {
  const [kind, id] = where.split('|');
  if (kind === 'dm') return id.split(':').includes(user.id);
  if (kind === 'g') return !!data.groups?.[id]?.members?.includes(user.id);
  const chId = kind === 'th' ? data.threads?.[id]?.channelId : id;
  const { sv, ch } = findChannel(chId);
  if (!sv || !ch || !sv.members.includes(user.id) || !canView(ensureRoles(sv), ch, user.id)) return false;
  // Without "Read Message History", only what was posted after you joined.
  return permsIn(sv, ch, user.id).has('read_history') || msg.createdAt >= (user.joinedAt?.[sv.id] || 0);
}
function canReadAttachment(user, a) {
  if (!user || !a) return false;
  if (a.owner === user.id || isStaff(user)) return true;
  if (hooks.canReadAttachment.some(fn => fn(user, a))) return true; // e.g. a video being watched together in your call
  const key = user.id + '|' + a.id, hit = accessCache.get(key);
  if (hit && Date.now() - hit < 5 * 60e3) return true;
  if (!attachmentWhere.size || (!attachmentWhere.has(a.id) && Date.now() - attachmentScanAt > 10e3)) scanAttachments();
  // Thread replies don't go through postMessage, so a file just sent in a thread is looked for there.
  else if (!attachmentWhere.has(a.id)) for (const [id, t] of Object.entries(data.threads || {})) for (const m of t.messages || []) if (attIdsOf(m).includes(a.id)) noteAttachments('th|' + id, m);
  for (const where of attachmentWhere.get(a.id) || []) {
    // Still there? (A deleted message takes its files with it.)
    const msg = (messagesAt(where) || []).find(m => attIdsOf(m).includes(a.id));
    if (msg && canSeeAt(user, where, msg)) {
      if (accessCache.size > 20000) accessCache.clear();
      accessCache.set(key, Date.now());
      return true;
    }
  }
  return false;
}
// Who's asking for a file: the session cookie, or an Authorization header (bots and apps).
function mediaUser(req) {
  const authz = req.headers.authorization || '';
  if (authz.startsWith('Bot ')) return botFromToken(authz.slice(4).trim());
  if (authz.startsWith('Bearer ')) return userFromToken(authz.slice(7).trim());
  return userFromToken(cookieToken(req));
}
// Private files can be kept by the browser that opened them (they never change), but never by
// shared caches.
const PRIVATE_MEDIA = { 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
function denyMedia(res, signedIn) { res.writeHead(signedIn ? 404 : 401, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(); }

// ---------- server ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
// One bad request (a broken web address, a weird header) must never take the whole server down.
const server = http.createServer((req, res) => handleRequest(req, res).catch(err => {
  if (!(err instanceof URIError)) console.error('Request failed:', err);
  try { if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Bad request'); } catch {}
}));
async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // Big answers (your account on load, a page of messages, a server's member list) are sent
  // compressed when the browser can take it: a fraction of the size, so they arrive sooner.
  const json = (status, obj) => {
    const body = JSON.stringify(obj);
    const accept = String(req.headers['accept-encoding'] || '');
    if (body.length > 8192 && !res.headersSent && /\b(br|gzip)\b/.test(accept)) {
      const br = /\bbr\b/.test(accept);
      const done = (err, out) => {
        if (res.headersSent || res.destroyed) return;
        if (err) { res.writeHead(status, { 'Content-Type': 'application/json' }); return res.end(body); }
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Encoding': br ? 'br' : 'gzip', Vary: 'Accept-Encoding', 'Content-Length': out.length });
        res.end(out);
      };
      return br ? zlib.brotliCompress(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }, done) : zlib.gzip(body, { level: 6 }, done);
    }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body);
  };

  // Once ZUNO_CANONICAL_HOST is set (like heyzuno.uk), people opening the old onrender.com address
  // in a browser are sent to the new one. Only pages move: the API, uploads and live updates keep
  // answering on the old address, so older desktop apps and links keep working.
  const canon = process.env.ZUNO_CANONICAL_HOST;
  if (canon && req.method === 'GET' && /\.onrender\.com$/i.test(String(req.headers.host || '').split(':')[0])
    && !/^\/(api|uploads|files|events|ws)\b/.test(req.url) && /text\/html/.test(req.headers.accept || '')
    // An app installed from the old address (its start link, or a page asked for by Zuno's own
    // service worker) stays there: moving it would show a link bar at the top. move.js in the page
    // moves ordinary browser tabs over instead.
    && !req.headers['x-zuno-app'] && !/[?&]source=homescreen\b/.test(req.url)) {
    res.writeHead(301, { Location: `https://${canon}${req.url}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  // Basic safety headers for every response.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // Content Security Policy: the browser only runs Zuno's own scripts (plus YouTube's player for
  // Listen/Watch Together and the map library), never script written into a page or a message.
  // So even if someone sneaked code into a message, it couldn't run or steal logins.
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), autoplay=(self), fullscreen=(self "https://www.youtube.com" "https://www.youtube-nocookie.com"), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (req.headers['x-forwarded-proto'] === 'https' || /^https:/.test(PUBLIC_URL || '')) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  // Which version is running, so every open Zuno can switch to it.
  if (url.pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ version: SERVER_VERSION, minDesktop: MIN_DESKTOP, gifs: !!(process.env.KLIPY_KEY || process.env.KLIP_KEY), bloom: stripeReady() }));
  }
  if (url.pathname === '/bloom/thanks') return serveStatic('/bloom-thanks.html', res, req);
  if (url.pathname === '/terms') return serveStatic('/terms.html', res, req);
  if (url.pathname === '/privacy') return serveStatic('/privacy.html', res, req);
  if (url.pathname === '/security') return serveStatic('/security.html', res, req);
  // Where security researchers look for how to report a problem (RFC 9116).
  if (url.pathname === '/.well-known/security.txt') {
    const base = (PUBLIC_URL || 'https://heyzuno.uk');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    return res.end(`Contact: ${base}/security\nPolicy: ${base}/security\nExpires: ${new Date(Date.now() + 180 * 864e5).toISOString()}\nPreferred-Languages: en\n`);
  }
  if (url.pathname === '/status') return serveStatic('/status.html', res, req);
  // Uploaded files can never run as a page here, whatever is inside them.
  if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/files/')) res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (url.pathname.startsWith('/uploads/')) {
    // Pictures, videos and voice messages sent in chats are private (see "private attachments").
    const a = attachmentForFile(path.basename(decodeURIComponent(url.pathname)));
    if (a) { const u = mediaUser(req); if (!canReadAttachment(u, a)) return denyMedia(res, !!u); return serveUpload(req, res, url.pathname, null, PRIVATE_MEDIA); }
    return serveUpload(req, res, url.pathname);
  }
  if (url.pathname.startsWith('/files/')) {
    const a = data.attachments[url.pathname.split('/')[2]];
    if (!a) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end(); }
    const u = mediaUser(req);
    if (!canReadAttachment(u, a)) return denyMedia(res, !!u);
    // ?play=1: videos sent before Zuno played them in chat were saved as plain files; this lets
    // the chat play them (with seeking) instead of only offering a download.
    const playType = url.searchParams.get('play') === '1' && ({ '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm' })[path.extname(a.name).toLowerCase()];
    if (playType) return serveUpload(req, res, '/uploads/' + a.file, playType, PRIVATE_MEDIA);
    const download = { ...PRIVATE_MEDIA, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}` };
    // Streamed in pieces, so a big download doesn't sit in the server's memory all at once.
    const filePath = path.join(UPLOAD_DIR, a.file);
    return fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) return serveFromCloud(req, res, a.file, download);
      res.writeHead(200, { ...download, 'Content-Length': st.size });
      pipeFile(fs.createReadStream(filePath), res);
    });
  }
  for (const r of hooks.rawRoutes) if (url.pathname === r.path) return r.fn(req, res, url);
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res, req);

  if (req.method === 'GET' && url.pathname === '/api/events') {
    // People connect with a one-use ticket (POST /api/events/ticket), so the login token never
    // goes in a URL. Bots still connect with their token, as before.
    const ticket = url.searchParams.get('ticket');
    if (ticket) {
      const grant = eventTickets.get(ticket);
      eventTickets.delete(ticket); // one use, even when it has expired
      const user = grant && grant.expiresAt > Date.now() ? userFromKey(grant.sessionToken) : null;
      if (!user || user.id !== grant.uid) return json(401, { error: 'Event connection ticket expired. Reconnect to continue.' });
      return openStream(req, res, user, grant.sessionToken);
    }
    const auth = req.headers.authorization || '';
    const bot = botFromToken(url.searchParams.get('bot') || (auth.startsWith('Bot ') ? auth.slice(4).trim() : ''));
    if (!bot) return json(401, { error: 'Not signed in.' });
    return openStream(req, res, bot, null);
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    try {
      const authz = req.headers.authorization || '';
      const isBotAuth = authz.startsWith('Bot ');
      const rawToken = isBotAuth ? null : authz.replace(/^Bearer /, '') || null;
      const token = rawToken ? tokenKey(rawToken) : null; // handlers only ever see the fingerprint
      const me = isBotAuth ? botFromToken(authz.slice(4).trim()) : userFromKey(token);
      if (me && rawToken && !isBotAuth && cookieToken(req) !== rawToken) res.setHeader('Set-Cookie', sessionCookie(rawToken, req));
      if (r.auth && !me) fail(401, isBotAuth ? 'That bot token is invalid. Make a new one in Settings > Developer.' : 'Not signed in.');
      if (isBotAuth && me && !botAllowed(req.method, url.pathname)) fail(403, "Bots can't use that part of the API.");
      if (isBotAuth && me) botScope(me, url.pathname);
      if (me && isSuspended(me) && req.method !== 'GET' && !['/api/logout', '/api/rtc/leave', '/api/appeal'].includes(url.pathname) && !url.pathname.endsWith('/read'))
        fail(403, me.suspendedUntil >= FOREVER ? 'This account is banned from Zuno.' : "Your account is in a timeout, so you can't do that right now.");
      checkLimits(req, url.pathname, me);
      if (token && data.sessions[token] && typeof data.sessions[token] === 'object' && data.sessions[token].ip !== clientIp(req)) data.sessions[token].ip = clientIp(req);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      // An id like "__proto__" would look up the built-in object instead of a user or server.
      if (Object.values(params).some(v => UNSAFE_KEYS.has(v))) fail(404, 'Not found.');
      const body = r.raw ? await readRaw(req, typeof r.raw === 'function' ? (me ? r.raw(me) : 1_000_000) : r.raw)
        : ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const result = await r.handler({ req, res, me, token, params, body, query: url.searchParams });
      if (req.method !== 'GET') soonEnforceRooms();
      if (me && req.method !== 'GET' && !me.bot && isStaff(me)) {
        const what = describeStaffAction(req.method, url.pathname, body || {}, params);
        // Other staff: the founder hears about it. The founder's own actions just go in the activity feed.
        if (what) isFounder(me.id) ? (data.staffLog = [...(data.staffLog || []).slice(-499), { at: Date.now(), by: me.id, text: what }]) : tellFounder(me, what);
      }
      if (result?.__html) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(result.__html); }
      return json(200, result);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: 'Something went wrong on the server.' });
    }
  }
  json(404, { error: 'Not found.' });
}

// Start listening. Resolves with the port, or rejects (e.g. EADDRINUSE if something already uses it).
function start(port = PORT, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      if (!quiet) {
        console.log(`\n  Zuno is running!\n`);
        console.log(`  On this computer:   http://localhost:${port}`);
        for (const addrs of Object.values(os.networkInterfaces())) {
          for (const a of addrs || []) {
            if (a.family === 'IPv4' && !a.internal) console.log(`  On your Wi-Fi:      http://${a.address}:${port}`);
          }
        }
        console.log('\n  Press Ctrl+C to stop.\n');
      }
      resolve(port);
    });
  });
}

module.exports = { start, flush };

// Everything added in 0.14 (accounts, pins, polls, nicknames, Zuno bots, themes…) lives in features.js.
const feat = require('./features')({
  checkName, badUsername, NAME_ERROR, cleanName, stripInvisible, topPos, judgeText, staffGuard, pruneDevices, data, save, route, fail, hooks, clean, newId, send, emit, publicUser, privateMe, broadcastUser, postMessage, systemMessage,
  channelConv, channelConvFor, dmConv, groupConv, convOf, findChannel, findMessage, getServer, getManagedServer, ensureRoles, need, can, permsIn, canView, basePerms,
  outranks, canEditRole, roleById, rolesOf, audit, refreshServer, serverSummary, officialServer, isStaff, needStaff, hasBloom, isBlocked, areFriends,
  hashPassword, checkPassword, MIN_PASSWORD, createSession, endSessions, sessionFor, limit, clientIp, sniff, storeUpload, removeUpload, PERM_INFO, PERM_KEYS,
  DEFAULT_EVERYONE, SYSTEM_ID, PUBLIC_URL, EMAIL_RE, USERNAME_RE, devBot, rooms, roomMembers, leaveRoom, streams, isOnline, effectiveStatus, sha, dmKey,
  PKG, lastPost, removeMember, streamWrite, needReauth, isFounder,
});
const ctx2 = {
  isFounder, officialServer, messagePreview, checkName, badUsername, NAME_ERROR, cleanName, stripInvisible, topPos, judgeText, noteAttachmentFile: a => { if (a?.thumb) fileToAttachment.set(path.basename(a.thumb), a.id); }, purgeBannedAccount, restoreBannedAccount, tellFounder, APPEAL_DAYS,
  staffGuard, isManager, overStaff, pruneDevices, liveSids, sessionSid, data, save, route, fail, hooks, clean, newId, send, emit, publicUser, privateMe, broadcastUser, postMessage, systemMessage,
  dmConv, groupConv, channelConv, findMessage, getServer, ensureRoles, need, can, refreshServer, audit, isStaff, needStaff, isBlocked, areFriends,
  friendIds, createSession, endSessions, limit, clientIp, sniff, storeUpload, removeUpload, PERM_INFO, PERM_KEYS, SYSTEM_ID, PUBLIC_URL, dmKey,
  isOnline, PREF_BOOLS, PREF_DEFAULTS, checkPassword, sha, crypto, UPLOAD_DIR, needReauth, sessionCookie, tokenKey, REAUTH_MSG, rooms, roomMembers, permsIn, findChannel, DEFAULT_EVERYONE, convOf,
  hasBloom, perksFor, serverSummary, rolesOf, roleById, outranks, canView, getManagedServer, leaveRoom, streams, effectiveStatus, sessionFor, hashPassword, MIN_PASSWORD,
  PKG, streamWrite, dmRecord, clientIp, ACCENTS, BLOOM_ACCENTS, voiceUpdate, canEditRole, checkGrant, basePerms, SERVER_COLORS, channelConvFor, sendMail: (...a) => feat.sendMail(...a), feat,
  invitePreview, DISCOVERY_TAGS, effectiveStatus, isFounder, CONFIG, appView, devBot, getManagedServer, audit, isOnline,
  outranks, canReadAttachment, rolesOf, badgesFor, REPORT_REASONS, joinServer, friendIds, USERNAME_RE, STAFF_NAMES,
  removeMember, channelMessagesOf: id => data.channelMessages[id], userByName,
  svLimits: () => ({ emoji: 50, sounds: 24, level: 0 }), // Server Blooming raises these (community.js)
};
const social = require('./social')(ctx2);
require('./hangout')(ctx2);
require('./studio')(ctx2);
require('./community')(ctx2);
require('./secure')(ctx2);
require('./zuno19')(ctx2);
require('./profilemod')(ctx2);
require('./appeals')(ctx2);
require('./chatthemes')(ctx2);
require('./purge')(ctx2);
require('./zuno27')(ctx2);
require('./zuno28')(ctx2);
require('./zuno29')(ctx2);
require('./zuno30')(ctx2);
require('./zuno31')(ctx2);
require('./zuno32')(ctx2);
require('./zuno33')(ctx2);
require('./zuno35')(ctx2);
require('./zuno37')(ctx2);
require('./zuno38')(ctx2);
require('./zuno39')(ctx2);
require('./zuno40')(ctx2);
require('./zuno42')(ctx2);
require('./zuno43')(ctx2);
require('./zuno44')(ctx2);
require('./zuno45')(ctx2);
require('./zuno45').official(ctx2);
require('./zuno45').modview(ctx2);
require('./zuno46')(ctx2);
require('./zuno46').reviews(ctx2);
require('./zuno46').safety(ctx2);
require('./zuno47')(ctx2);
require('./zuno50')(ctx2);
require('./zuno53')(ctx2);

// Zuno's big lookup tables (users, servers, sessions…) don't inherit JavaScript's built-in object,
// so an id like "__proto__" or "constructor" finds nothing instead of something unexpected. Done in
// place, so every part of the code keeps pointing at the same tables.
function hardenTables() {
  for (const v of Object.values(data)) if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) Object.setPrototypeOf(v, null);
}
hardenTables();
setInterval(hardenTables, 60e3).unref(); // tables made later (data.x ||= {}) too
require('./zuno47').releases(ctx2);

// Prepare the Zuno account and post any new update notes.
ensureSystemUser();
ensureBotUser();
for (const sv of Object.values(data.servers)) ensureRoles(sv);
for (const u of Object.values(data.users)) if (!u.system && !u.welcomed) welcome(u);
announceUpdate();
ensureOfficialMembers();
setInterval(ensureOfficialMembers, 10 * 60 * 1000); // picks up the server if it's renamed to "Zuno Official" later
feat.start();
social.start();
moveAvatarsToFiles();
// Accounts in CONFIG.ALWAYS_BLOOM get gifted Bloom that never runs out.
for (const u of Object.values(data.users)) {
  if (!(CONFIG.ALWAYS_BLOOM || []).includes(u.username) || u.system || u.bot) continue;
  const FOREVER = Date.parse('2100-01-01T00:00:00Z');
  u.bloom ||= {};
  if ((u.bloom.giftUntil || 0) < FOREVER) { u.bloom.giftUntil = FOREVER; u.bloom.streakStart ||= Date.now(); save(); }
}
setTimeout(sweepToCloud, 5000);
setInterval(sweepToCloud, 3600e3).unref();
save();

// Run directly with `node server/index.js` / `npm start`.
// A mistake somewhere async shouldn't stop Zuno for everyone: log it and keep going.
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
if (require.main === module) {
  start().catch(err => {
    if (err.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is already in use. Is Zuno already running?\n`);
    else console.error(err);
    process.exit(1);
  });
  // Before shutting down (a new version going out), tell every open Zuno so it shows the
  // "Zuno is updating" screen right away instead of waiting to notice the server is gone.
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    flush();
    for (const set of streams.values()) for (const res of set) { try { res.write('event: server-restart\ndata: {}\n\n'); } catch {} }
    setTimeout(() => process.exit(0), 400);
  });
}
