'use strict';
// Zuno emoji: the picker, :shortcode: support, and helpers for reactions.
// Each entry is "emoji name another_name ..." — the first name is the :shortcode:.
const EMOJI_DATA = [
  ['Smileys', '😀', `😀 grinning|😃 smiley|😄 smile|😁 grin|😆 laughing|😅 sweat_smile|🤣 rofl|😂 joy|🙂 slight_smile|🙃 upside_down|😉 wink|😊 blush|😇 innocent|🥰 smiling_hearts|😍 heart_eyes|🤩 star_struck|😘 kiss|😗 kissing|😚 kissing_closed_eyes|😋 yum|😛 tongue|😜 winking_tongue|🤪 zany|😝 squinting_tongue|🤑 money_mouth|🤗 hug|🤭 hand_over_mouth|🤫 shush|🤔 thinking|🤐 zipper_mouth|🤨 raised_eyebrow|😐 neutral|😑 expressionless|😶 no_mouth|😏 smirk|😒 unamused|🙄 eye_roll|😬 grimace|😌 relieved|😔 pensive|😪 sleepy|🤤 drool|😴 sleeping|😷 mask|🤒 sick|🤕 hurt|🤢 nauseated|🤮 vomit|🥵 hot|🥶 cold|🥴 woozy|😵 dizzy|🤯 mind_blown|🤠 cowboy|🥳 party|😎 sunglasses|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 slight_frown|😮 open_mouth|😯 hushed|😲 astonished|😳 flushed|🥺 pleading|😦 frowning|😧 anguished|😨 fearful|😰 anxious|😥 sad_relieved|😢 cry|😭 sob|😱 scream|😖 confounded|😣 persevere|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph|😡 rage|😠 angry|🤬 cursing|😈 smiling_imp|👿 imp|💀 skull|💩 poop|🤡 clown|👻 ghost|👽 alien|👾 space_invader|🤖 robot|😺 smiley_cat|😹 joy_cat|😻 heart_eyes_cat|😿 crying_cat|🙈 see_no_evil|🙉 hear_no_evil|🙊 speak_no_evil`],
  ['People', '👋', `👋 wave|🤚 raised_back_hand|✋ raised_hand|🖖 vulcan|👌 ok_hand|🤌 pinched_fingers|✌️ peace|🤞 crossed_fingers|🤟 love_you|🤘 rock_on|🤙 call_me|👈 point_left|👉 point_right|👆 point_up|👇 point_down|☝️ index_up|👍 thumbsup +1 like|👎 thumbsdown -1|✊ fist|👊 punch|🤛 left_fist|🤜 right_fist|👏 clap|🙌 raised_hands|👐 open_hands|🤲 palms_up|🤝 handshake|🙏 pray thanks|✍️ writing|💅 nail_polish|💪 muscle flex|🦾 robot_arm|🧠 brain|👀 eyes|👁️ eye|👅 tongue_out|👄 lips|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👱 blond|👨 man|👩 woman|🧓 older_person|👴 old_man|👵 old_woman|🙍 frowning_person|🙋 raising_hand|🤷 shrug|🤦 facepalm|🙇 bow|💁 tipping_hand|🙆 ok_person|🙅 no_person|💃 dancer|🕺 man_dancing|🏃 runner|🚶 walking|🧍 standing|🧘 meditate|🛀 bath|🧑‍💻 technologist coder|🧑‍🎤 singer|🧑‍🎨 artist|🧑‍🚀 astronaut|🥷 ninja|🦸 superhero|🧙 mage|🧛 vampire|🧟 zombie|🧞 genie|👑 crown|🎩 tophat|🧢 cap|👓 glasses|🕶️ dark_sunglasses`],
  ['Nature', '🐶', `🐶 dog|🐱 cat|🐭 mouse|🐹 hamster|🐰 rabbit|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦅 eagle|🦉 owl|🦇 bat|🐺 wolf|🐗 boar|🐴 horse|🦄 unicorn|🐝 bee|🐛 bug|🦋 butterfly|🐌 snail|🐞 ladybug|🐢 turtle|🐍 snake|🦎 lizard|🦖 t_rex|🐙 octopus|🦑 squid|🦐 shrimp|🦀 crab|🐠 tropical_fish|🐟 fish|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🦓 zebra|🦒 giraffe|🐘 elephant|🦔 hedgehog|🐿️ chipmunk|🦦 otter|🦥 sloth|🌵 cactus|🎄 christmas_tree|🌲 evergreen|🌳 tree|🌴 palm_tree|🌱 seedling sprout|🌿 herb|🍀 four_leaf_clover|🍁 maple_leaf|🍂 fallen_leaf|🍄 mushroom|🌷 tulip|🌹 rose|🌻 sunflower|🌸 cherry_blossom|💐 bouquet|🌞 sun_face|🌝 full_moon_face|🌙 moon|⭐ star|🌟 glowing_star|✨ sparkles|⚡ zap|🔥 fire lit|🌈 rainbow|☀️ sunny|⛅ partly_sunny|☁️ cloud|🌧️ rain|⛈️ storm|❄️ snowflake|☃️ snowman|🌊 wave_water|💧 droplet|🌍 earth`],
  ['Food', '🍕', `🍏 green_apple|🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🌶️ hot_pepper|🌽 corn|🥕 carrot|🥔 potato|🥐 croissant|🍞 bread|🥨 pretzel|🧀 cheese|🥚 egg|🍳 cooking|🥞 pancakes|🧇 waffle|🥓 bacon|🍗 drumstick|🍖 meat|🌭 hotdog|🍔 burger|🍟 fries|🍕 pizza|🥪 sandwich|🌮 taco|🌯 burrito|🥗 salad|🍝 spaghetti|🍜 ramen|🍲 stew|🍛 curry|🍣 sushi|🍱 bento|🥟 dumpling|🍤 fried_shrimp|🍙 rice_ball|🍚 rice|🍥 fish_cake|🍡 dango|🍦 ice_cream|🍩 donut|🍪 cookie|🎂 birthday cake|🍰 cake_slice|🧁 cupcake|🍫 chocolate|🍬 candy|🍭 lollipop|🍯 honey|🍼 baby_bottle|☕ coffee|🍵 tea|🧋 boba bubble_tea|🥤 soda|🧃 juice|🍺 beer|🍻 beers|🥂 champagne|🍷 wine|🍹 tropical_drink|🧊 ice`],
  ['Activities', '🎮', `⚽ soccer|🏀 basketball|🏈 football|⚾ baseball|🎾 tennis|🏐 volleyball|🏉 rugby|🎱 8ball|🏓 ping_pong|🏸 badminton|🥅 goal|🏒 hockey|⛳ golf|🏹 bow_and_arrow|🎣 fishing|🥊 boxing|🥋 martial_arts|⛸️ ice_skate|🎿 ski|🛹 skateboard|🏆 trophy|🥇 gold_medal|🥈 silver_medal|🥉 bronze_medal|🏅 medal|🎖️ military_medal|🎗️ ribbon|🎫 ticket|🎪 circus|🎭 theater|🎨 art|🎬 clapper movie|🎤 microphone mic|🎧 headphones|🎼 score|🎹 piano|🥁 drum|🎷 sax|🎺 trumpet|🎸 guitar|🎻 violin|🎲 dice|♟️ chess|🎯 dart bullseye|🎳 bowling|🎮 video_game controller|🕹️ joystick|🧩 puzzle|🧸 teddy_bear|🎉 tada party_popper|🎊 confetti|🎈 balloon|🎁 gift present|🎀 bow_ribbon|🪅 pinata|🎃 jack_o_lantern|🎆 fireworks|🎇 sparkler`],
  ['Travel', '🚀', `🚗 car|🚕 taxi|🚙 suv|🚌 bus|🏎️ race_car|🚓 police_car|🚑 ambulance|🚒 fire_engine|🚚 truck|🚜 tractor|🛵 scooter|🚲 bike|🛴 kick_scooter|🚨 siren|🚄 train|✈️ airplane|🛫 departure|🛬 arrival|🚁 helicopter|🚀 rocket|🛸 ufo|⛵ sailboat|🚤 speedboat|🛳️ cruise|⚓ anchor|🗺️ map|🧭 compass|🏔️ mountain|🌋 volcano|🏕️ camping|🏖️ beach|🏝️ island|🏜️ desert|🏠 house|🏡 home|🏢 office|🏥 hospital|🏫 school|🏰 castle|🗼 tower|🗽 statue_of_liberty|⛲ fountain|🎡 ferris_wheel|🎢 roller_coaster|🌃 night|🌆 city_dusk|🌉 bridge|🌅 sunrise|🌄 sunrise_mountains|🌌 milky_way`],
  ['Objects', '💡', `⌚ watch|📱 phone|💻 laptop|⌨️ keyboard|🖥️ desktop|🖱️ computer_mouse|🕹️ arcade|💾 floppy|💿 cd|📷 camera|📸 camera_flash|📹 video_camera|🎥 movie_camera|📞 telephone|☎️ landline|📺 tv|📻 radio|🎙️ studio_mic|⏰ alarm|⌛ hourglass|🔋 battery|🔌 plug|💡 bulb idea|🔦 flashlight|🕯️ candle|💸 money_wings|💵 dollar|💰 moneybag|💳 credit_card|💎 gem|⚖️ scales|🔧 wrench|🔨 hammer|⚒️ hammer_pick|🛠️ tools|⚙️ gear|🧲 magnet|🔫 water_gun|💣 bomb|🔪 knife|🛡️ shield|🔮 crystal_ball|🧿 nazar|💈 barber|🔭 telescope|🔬 microscope|💊 pill|💉 syringe|🧬 dna|🧪 test_tube|🧹 broom|🧺 basket|🧻 roll|🚽 toilet|🛁 bathtub|🔑 key|🗝️ old_key|🚪 door|🛋️ couch|🛏️ bed|🧸 plush|🖼️ frame|🛒 cart|🎈 balloon2|✉️ envelope|📩 incoming_envelope|📦 package|📝 memo note|📚 books|📖 book|🔖 bookmark|📎 paperclip|✂️ scissors|📌 pushpin|📍 pin|🔒 lock|🔓 unlock|🔔 bell|🔕 no_bell|📣 megaphone|💬 speech|💭 thought|🗯️ anger_bubble`],
  ['Symbols', '❤️', `❤️ heart|🧡 orange_heart|💛 yellow_heart|💚 green_heart|💙 blue_heart|💜 purple_heart|🖤 black_heart|🤍 white_heart|🤎 brown_heart|💔 broken_heart|❣️ heart_exclamation|💕 two_hearts|💞 revolving_hearts|💓 heartbeat|💗 growing_heart|💖 sparkling_heart|💘 cupid|💝 gift_heart|💟 heart_decoration|☮️ peace_symbol|✝️ cross|☯️ yin_yang|♈ aries|⛎ ophiuchus|🆗 ok|🆒 cool|🆕 new|🆓 free|🆙 up|🆘 sos|⛔ no_entry|🚫 prohibited|❌ x cross_mark|⭕ o|✅ white_check_mark check|☑️ ballot_check|✔️ heavy_check|❗ exclamation|❓ question|❕ grey_exclamation|❔ grey_question|‼️ bangbang|⁉️ interrobang|💯 100 hundred|🔅 dim|🔆 bright|⚠️ warning|♻️ recycle|🔱 trident|⚜️ fleur_de_lis|🔰 beginner|💤 zzz|🎵 musical_note|🎶 notes|➕ plus|➖ minus|➗ divide|✖️ multiply|♾️ infinity|💲 dollar_sign|©️ copyright|®️ registered|™️ tm|🔴 red_circle|🟠 orange_circle|🟡 yellow_circle|🟢 green_circle|🔵 blue_circle|🟣 purple_circle|⚫ black_circle|⚪ white_circle|🟥 red_square|🟩 green_square|🟦 blue_square|⬛ black_square|⬜ white_square|🔶 orange_diamond|🔷 blue_diamond|🔺 red_triangle|🔻 red_triangle_down|💠 diamond_dot|🔘 radio_button|🏁 checkered_flag|🚩 red_flag|🏳️ white_flag|🏴 black_flag|🏳️‍🌈 rainbow_flag`],
];

// name -> emoji, plus a flat list for searching.
const EMOJI = [];
const EMOJI_BY_NAME = {};
for (const [category, , list] of EMOJI_DATA) {
  for (const entry of list.split('|')) {
    const [char, ...names] = entry.trim().split(' ');
    if (!char || !names.length) continue;
    const e = { char, names, category };
    EMOJI.push(e);
    for (const n of names) if (!EMOJI_BY_NAME[n]) EMOJI_BY_NAME[n] = char;
  }
}
const emojiName = char => EMOJI.find(e => e.char === char)?.names[0] || '';

// Turn :shortcodes: into emoji (used when sending).
function replaceShortcodes(text) {
  return text.replace(/(^|[^\w`]):([a-z0-9_+\-]{1,32}):/gi, (all, pre, name) => (EMOJI_BY_NAME[name.toLowerCase()] ? pre + EMOJI_BY_NAME[name.toLowerCase()] : all));
}

// A message made only of emoji (up to 27) is shown big.
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u;
function isJumbo(text) {
  if (!text || text.length > 120 || !EMOJI_ONLY_RE.test(text) || /^[\d#*\s]+$/.test(text)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.replace(/\s/g, ''))].length;
  return count > 0 && count <= 27;
}

// Recently used, remembered on this computer.
function recentEmoji() { try { return JSON.parse(localStorage.getItem('zuno_recent_emoji') || '[]'); } catch { return []; } }
function rememberEmoji(char) {
  try { localStorage.setItem('zuno_recent_emoji', JSON.stringify([char, ...recentEmoji().filter(c => c !== char)].slice(0, 24))); } catch {}
}

// ---------- the picker ----------
// openEmojiPicker(anchorEl, onPick) shows a popover next to the anchor.
function openEmojiPicker(anchor, onPick, { title = 'Pick an emoji' } = {}) {
  closeEmojiPicker();
  const pop = document.createElement('div');
  pop.className = 'emoji-picker';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', title);
  const cats = [['Recent', '🕘'], ...EMOJI_DATA.map(([c, icon]) => [c, icon])];
  pop.innerHTML = `
    <div class="ep-top"><input class="ep-search" placeholder="Find the perfect emoji" autocomplete="off" spellcheck="false"></div>
    <div class="ep-body">
      <nav class="ep-cats">${cats.map(([c, icon]) => `<button data-cat="${c}" title="${c}">${icon}</button>`).join('')}</nav>
      <div class="ep-grid"></div>
    </div>
    <div class="ep-foot"><span class="ep-preview-char"></span><span class="ep-preview-name">Hover an emoji</span></div>`;
  const shield = document.createElement('div');
  shield.className = 'ep-shield';
  shield.addEventListener('mousedown', closeEmojiPicker);
  document.body.append(shield, pop);

  const grid = $('.ep-grid', pop), search = $('.ep-search', pop);
  const cell = e => `<button class="ep-e" data-char="${e.char}" data-name="${e.names[0]}">${e.char}</button>`;
  const drawAll = () => {
    const recent = recentEmoji().map(c => EMOJI.find(e => e.char === c) || { char: c, names: [''] });
    grid.innerHTML = (recent.length ? `<h6 data-sec="Recent">Recently used</h6><div class="ep-row">${recent.map(cell).join('')}</div>` : '')
      + EMOJI_DATA.map(([c]) => `<h6 data-sec="${c}">${c}</h6><div class="ep-row">${EMOJI.filter(e => e.category === c).map(cell).join('')}</div>`).join('');
  };
  const drawSearch = q => {
    const hits = EMOJI.filter(e => e.names.some(n => n.includes(q)));
    grid.innerHTML = hits.length ? `<div class="ep-row">${hits.map(cell).join('')}</div>` : `<div class="ep-empty">No emoji match "${esc(q)}".</div>`;
  };
  drawAll();
  search.addEventListener('input', () => { const q = search.value.trim().toLowerCase().replace(/:/g, ''); q ? drawSearch(q) : drawAll(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeEmojiPicker(); }
    if (e.key === 'Enter') { const first = $('.ep-e', grid); if (first) first.click(); }
  });
  grid.addEventListener('mouseover', e => {
    const b = e.target.closest('.ep-e');
    if (!b) return;
    $('.ep-preview-char', pop).textContent = b.dataset.char;
    $('.ep-preview-name', pop).textContent = b.dataset.name ? `:${b.dataset.name}:` : '';
  });
  grid.addEventListener('click', e => {
    const b = e.target.closest('.ep-e');
    if (!b) return;
    rememberEmoji(b.dataset.char);
    const keepOpen = e.shiftKey; // shift-click picks several
    onPick(b.dataset.char);
    if (!keepOpen) closeEmojiPicker();
  });
  $$('[data-cat]', pop).forEach(b => b.addEventListener('click', () => {
    search.value = ''; drawAll();
    const h = $(`[data-sec="${b.dataset.cat}"]`, grid);
    if (h) grid.scrollTop = h.offsetTop - grid.offsetTop;
  }));

  // Place it next to the anchor, inside the window.
  const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.top - pr.height - 8, left = r.right - pr.width;
  if (top < 44) top = Math.min(innerHeight - pr.height - 8, r.bottom + 8);
  left = Math.max(8, Math.min(left, innerWidth - pr.width - 8));
  pop.style.top = top + 'px'; pop.style.left = left + 'px';
  search.focus();
}
function closeEmojiPicker() { $$('.emoji-picker, .ep-shield').forEach(n => n.remove()); }

// ---------- :shortcode: suggestions while typing ----------
// Shows a list above the message box when you type ":" followed by two letters.
function wireEmojiAutocomplete(ta, container) {
  let box = null, items = [], sel = 0, range = null;
  const close = () => { box?.remove(); box = null; items = []; };
  const pick = i => {
    const e = items[i];
    if (!e || !range) return;
    ta.value = ta.value.slice(0, range[0]) + e.char + ' ' + ta.value.slice(range[1]);
    const pos = range[0] + e.char.length + 1;
    ta.setSelectionRange(pos, pos);
    rememberEmoji(e.char);
    close();
    ta.dispatchEvent(new Event('input'));
  };
  const draw = () => {
    if (!items.length) return close();
    if (!box) { box = document.createElement('div'); box.className = 'ep-suggest'; container.prepend(box); }
    box.innerHTML = `<div class="ep-suggest-head">Emoji matching <b>:${esc(ta.value.slice(range[0] + 1, range[1]))}</b></div>` + items.map((e, i) =>
      `<button class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="c">${e.img ? `<img class="cemoji" src="${esc(e.img)}" alt="">` : e.char}</span>:${esc(e.names[0])}:</button>`).join('');
    $$('[data-i]', box).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pick(Number(b.dataset.i)); }));
  };
  ta.addEventListener('input', () => {
    const upto = ta.value.slice(0, ta.selectionStart);
    const m = /(^|\s):([a-z0-9_+\-]{2,32})$/i.exec(upto);
    if (!m) return close();
    const q = m[2].toLowerCase();
    range = [ta.selectionStart - m[2].length - 1, ta.selectionStart];
    items = (typeof customEmojiMatches === 'function' ? customEmojiMatches(q) : []).concat(EMOJI.filter(e => e.names.some(n => n.startsWith(q)))).concat(EMOJI.filter(e => !e.names.some(n => n.startsWith(q)) && e.names.some(n => n.includes(q)))).slice(0, 8);
    sel = 0;
    draw();
  });
  ta.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  ta.addEventListener('blur', () => setTimeout(close, 120));
}
