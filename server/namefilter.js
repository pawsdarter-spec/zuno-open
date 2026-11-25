'use strict';
// Name filter: stops slurs and sexual words in usernames, bios, statuses, display names, nicknames, server names,
// group names, role names and bot names. Anything it passes gets a second look from the AI judge in
// aimod.js when ANTHROPIC_API_KEY is set.
//
// HOW IT WORKS
//   A name is first "flattened" so tricks don't get past it:
//     - lower case, accents removed (é -> e)
//     - look-alike numbers and symbols swapped for letters (n1gg3r -> nigger, p0rn -> porn)
//     - spaces, dots, dashes and underscores removed (p.o.r.n -> porn)
//     - repeated letters squashed (pooorrn -> porn)
//   Then it's checked against the two lists below.
//
// HOW TO CHANGE IT
//   - ANYWHERE: blocked if it appears anywhere in the flattened name ("xXpornXx" is blocked).
//     Only put words here that don't hide inside normal words.
//   - PHRASES: blocked when the words appear together ("hard r" blocks "Hard R" but not "hardrock").
//   - WHOLE_WORD: blocked only as a separate word ("sex" blocks "sex god" but not "Sussex").
//   Add a word in lower case, plain letters. Run `npm test` afterwards: test/smoke.js checks that
//   normal names (Sussex, grape, Scunthorpe, peacock...) still pass.

const ANYWHERE = [
  // slurs (both spellings are caught: the "hard r" and the "soft a")
  'nigger', 'nigga', 'niggr', 'nigglet', 'nigra', 'faggot', 'fagot', 'tranny', 'retard', 'kike', 'kyke', 'spic', 'chink', 'coon',
  'wetback', 'beaner', 'raghead', 'towelhead', 'sandnig', 'shemale', 'mongoloid', 'cunt', 'jigaboo', 'porchmonkey', 'zipperhead',
  // sexual
  'porn', 'hentai', 'pussy', 'penis', 'vagina', 'blowjob', 'handjob', 'dildo', 'onlyfans', 'xxx', 'nudes', 'boobs',
  'titties', 'titty', 'sexy', 'cumshot', 'creampie', 'gangbang', 'bdsm', 'orgasm', 'masturbat', 'erection', 'futanari', 'nsfw', 'cocksuck', 'slut', 'whore', 'cumslut', 'jizz', 'rapist', 'pedophil', 'paedophil', 'molest', 'incest', 'bestiality',
  // hate
  'hitler', 'nazi', 'kkk', 'swastika', 'heilhitler',
];
const WHOLE_WORD = ['sex', 'cum', 'cock', 'dick', 'tits', 'rape', 'raping', 'anal', 'nude', 'fag', 'fags', 'nig', 'nigs', 'hoe', 'hoes', 'milf', 'pedo',
  'dyke', 'dykes', 'gook', 'gooks', 'paki', 'pakis', 'negro', 'negros', 'negroes', 'spaz', 'spastic', 'tard', 'tards', 'thot', 'thots',
  'horny', 'semen', 'boob', 'boobie', 'boobies', 'clit', 'twat', 'twats', 'pussies', 'cumming', 'dicks', 'cocks'];
// Swear words that are fine in a status or bio but not in a username (badUsername only).
const USERNAME_ONLY = ['fuck', 'fuk', 'shit', 'bitch', 'asshole', 'motherf', 'dickhead', 'wank', 'bastard', 'nonce'];
// Phrases that point to a slur without writing it, matched as whole words ("hard R" but not "hardrock").
// Other platforms' names can't be used inside usernames (impersonation). Written encoded on purpose.
const USERNAME_RESERVED_SUBSTRINGS = ['\x64iscord', '\x64isband'];
const PHRASES = ['hard r', 'hard er', 'soft a', 'with the r', 'n word', 'nword', 'n wrd', 'f slur', 'n slur'];
// Normal words that contain a blocked word by accident; these never count.
const ALLOWED = ['scunthorpe', 'cocktail', 'peacock', 'hancock', 'dickens', 'spice', 'spicy', 'raccoon', 'cocoon', 'tycoon', 'coonhound', 'analysis', 'analog', 'canal', 'shoe', 'whoever', 'nightingale', 'snigger', 'therapist', 'montenegro', 'gobbledygook', 'cunningham', 'scunthorpe', 'retardant'];

const LOOKALIKE = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', '£': 'e', 'ß': 'ss' };

function flatten(text) {
  let s = String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = [...s].map(ch => LOOKALIKE[ch] ?? ch).join('');
  return s;
}
const squash = s => s.replace(/([a-z])\1+/g, (m, c) => (c === 'g' ? 'gg' : c)); // "niiggggerr" -> "nigger"
// Extra spellings: q for g, l for i, vv for w ("niqqa", "nlgga", "vvhore").
const variants = s => [...new Set([s, s.replace(/q/g, 'g'), s.replace(/l/g, 'i'), s.replace(/vv/g, 'w')])];

function badName(text) {
  let flat = flatten(text);
  // Take out the normal words first (so "peacock" passes but "peacock_<slur>" still doesn't).
  for (const word of ALLOWED) flat = flat.split(word).join(' ');
  const raw = flat.replace(/[^a-z]+/g, '');
  const candidates = [...variants(raw), ...variants(squash(raw))];
  // Words with double letters ("boobs") are matched as written; the rest also after squashing.
  if (ANYWHERE.some(w => candidates.some(c => c.includes(w)))) return true;
  const words = flat.split(/[^a-z]+/).filter(Boolean);
  const spaced = ` ${words.join(' ')} `;
  if (PHRASES.some(p => spaced.includes(` ${p} `))) return true;
  for (const w of words) for (const v of [...variants(w), ...variants(squash(w))]) if (WHOLE_WORD.includes(v)) return true;
  // Numbers and symbols used as padding around a word ("1111cock1111", "$$dick$$"): read them as
  // spaces too, not only as look-alike letters, so the word still stands on its own.
  let plain = String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const word of ALLOWED) plain = plain.split(word).join(' ');
  for (const w of plain.split(/[^a-z]+/).filter(Boolean)) for (const v of [...variants(w), ...variants(squash(w))]) if (WHOLE_WORD.includes(v)) return true;
  return false;
}

// Usernames are stricter: everything above plus plain swearing.
function badUsername(text) {
  if (badName(text)) return true;
  let flat = flatten(text);
  for (const word of ALLOWED) flat = flat.split(word).join(' ');
  const raw = flat.replace(/[^a-z]+/g, '');
  const candidates = [...variants(raw), ...variants(squash(raw))];
  return USERNAME_ONLY.some(w => candidates.some(c => c.includes(w)))
    || USERNAME_RESERVED_SUBSTRINGS.some(w => candidates.some(c => c.includes(w)));
}

const NAME_ERROR = "That name isn't allowed on Zuno. Please pick something else.";

// ---------- invisible characters & fancy letters ----------
// Invisible characters (zero-width spaces, blank "filler" letters, direction flips...) are taken
// out of everything people type. The zero-width joiner stays only inside emoji (👨‍👩‍👧), and the
// zero-width non-joiner only between letters (some languages need it).
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​‎‏‪-‮⁠-⁯⠀ㅤ︀-︎﻿ﾠ￰-￸]|\u{1d159}|[\u{1d173}-\u{1d17a}]|[\u{e0000}-\u{e001f}]|[\u{e0080}-\u{e0fff}]/gu;
function stripInvisible(text) {
  let s = String(text ?? '');
  // FE0F (emoji style) is only kept right after something that can be an emoji.
  s = s.replace(/(^|[^\p{Extended_Pictographic}\p{Emoji_Component}⃣])️/gu, '$1');
  s = s.replace(/‍/gu, (m, i, all) => {
    const before = all.slice(0, i), after = all.slice(i + 1);
    return /[\p{Extended_Pictographic}️\u{1f3fb}-\u{1f3ff}]$/u.test(before) && /^[\p{Extended_Pictographic}♀♂⚕⚖✈❤]/u.test(after) ? m : '';
  });
  s = s.replace(/‌/gu, (m, i, all) => (/\p{L}$/u.test(all.slice(0, i)) && /^\p{L}/u.test(all.slice(i + 1)) ? m : ''));
  return s.replace(INVISIBLE, '');
}
// Names in "fancy" letters (𝓟𝓪𝔀𝓼, 𝕻𝖆𝖜𝖘, ⓟⓐⓦⓢ, Ｐａｗｓ, ᴘᴀᴡꜱ) become plain letters, and odd spaces
// become normal ones. Emoji are left alone.
const SMALL_CAPS = { 'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z' };
const FANCY = /[\u{1d400}-\u{1d7ff}①-ⓁⓃ-⓿❶-➓！-～\u{1f100}-\u{1f10c}\u{1f110}-\u{1f12f}\u{1f130}-\u{1f149}\u{1f150}-\u{1f169}\u{1f170}-\u{1f17d}\u{1f180}-\u{1f189}]|[ᴀ-ᴢʟʀɪɴʙɢʜʏꜰꜱǫ]/gu;
const KEEP_EMOJI = new Set(['\u{1f170}', '\u{1f171}', '\u{1f17e}', '\u{1f17f}']); // 🅰 🅱 🅾 🅿 are emoji
function plainName(text) {
  let s = stripInvisible(text);
  s = s.replace(FANCY, ch => {
    if (KEEP_EMOJI.has(ch)) return ch;
    if (SMALL_CAPS[ch]) return SMALL_CAPS[ch];
    const n = ch.normalize('NFKC');
    if (n !== ch) return n;
    // Squared / negative letters (🄰 🅐 🅰) have no plain form in Unicode, so work it out.
    const cp = ch.codePointAt(0);
    for (const base of [0x1f130, 0x1f150, 0x1f170, 0x1f110]) if (cp >= base && cp < base + 26) return String.fromCharCode(65 + cp - base);
    return ch;
  });
  return s.replace(/[   -   　]/g, ' ').replace(/ {2,}/g, ' ').trim();
}

module.exports = { badName, badUsername, NAME_ERROR, stripInvisible, plainName };
