# Working on Zuno

Welcome! This guide is for anyone who wants to change Zuno's code. It covers how to run it, how the
pieces fit together, where every setting lives, and how to add something new without breaking
what's there.

Zuno is deliberately simple to work on:

- **No build step and no packages.** The server uses only Node's built-in modules. The app is plain
  JavaScript, HTML and CSS that the browser loads as-is. Edit a file, refresh, see it.
- **Comments are written in plain language** and say *why* something is done, not just what. Please
  keep it that way.

---

## 1. Run it

You need **Node 22 or newer** (for the built-in SQLite).

```
npm start          # starts the server on http://localhost:3000
npm test           # starts a throwaway server and checks ~30 areas of Zuno (never touches real data)
npm run app        # the desktop app window (Electron), pointed at the code in this folder
```

Your local data is saved in `data/` (delete it to start fresh). Sign up with any email; email
sending is off until it's configured, which is fine for local work.

To make yourself Zuno Staff locally, start the server with `ZUNO_STAFF=yourname ZUNO_STAFF_SETUP=1`,
sign up as `yourname`, then restart without `ZUNO_STAFF_SETUP`.

---

## 2. Where to change things (configuration)

| You want to change… | Go to |
| --- | --- |
| Upload sizes, message length, bio length, banner/background/sound sizes (free and Bloom) | `server/config.js` → `PERKS` |
| Bloom's price label | `server/config.js` → `BLOOM_PRICE` (the actual price is the Stripe price, see below) |
| Who is staff, who the founder is, reserved usernames | `server/config.js` → `STAFF`, `FOUNDER`, `RESERVED_USERNAMES` |
| How long an unused login lasts | `server/config.js` → `SESSION_IDLE_DAYS` |
| How long a banned person has to appeal | `server/config.js` → `APPEAL_DAYS` |
| Chat themes and wallpapers | `public/zuno22.js` → `CHAT_THEMES`, `WALLPAPERS` (and the same names in `server/chatthemes.js`) |
| Icons in menus, buttons, tabs and headings | `public/zuno25.js` → `UI_PATHS` (the drawings) and `UI_EMOJI` (which emoji becomes which icon). Write an emoji from that list at the start of a label and it's drawn as the icon. |
| Stream resolutions, frame rates and bitrates | `public/calls.js` → `STREAM_RES`, `STREAM_BITRATE` (Bloom check: `hdAllowed`) |
| Clips (length, shortcut, how they record) | `public/zuno26.js` → `CLIP_DEFAULTS`, `clipStart` |
| What staff can't do in channels hidden or closed to them | `server/index.js` → `TALK_PERMS` |
| Wordle words and trivia questions | `server/gamewords.js` (`ANSWERS`, `TRIVIA`) |
| Poll lengths, how polls end | `server/zuno27.js` → `POLL_LENGTHS`, `finishPoll` |
| Bot marketplace categories | `server/zuno27.js` → `BOT_CATEGORIES` (and `BOT_CAT_EMOJI` in `public/zuno27.js`) |
| What's on the admin dashboard | `server/zuno27.js` → `/api/admin/dashboard`, `public/zuno27.js` → `renderAdmin` |
| The in-game overlay | `electron/overlay.html` and `electron/app.js` (search for "in-game overlay") |
| The video player | `public/zuno22.js` (top) and `public/zuno22.css` |
| A chat theme's colors, scene, bubble style and send burst | `public/zuno22.js` → `CHAT_THEMES` (scenes are drawn in `public/zuno23.css`, search for `.sc-`) |
| Biggest GIF avatar | `server/config.js` → `GIF_AVATAR_MAX` |
| Words not allowed in names | `server/namefilter.js` (`ANYWHERE`, `WHOLE_WORD`, `PHRASES`, `ALLOWED`) |
| What the AI name judge blocks | `server/aimod.js` (`SYSTEM`, the instructions it follows) |
| Default user preferences | `server/index.js` → `PREF_DEFAULTS` (near the top) |
| Permissions and what @everyone gets | `server/index.js` → `PERM_INFO`, `DEFAULT_EVERYONE` |
| Badges | `server/index.js` → `BADGES`, and `public/app.js` → `BADGE_INFO` (pictures in `public/badges/`) |
| Seasonal events (dates, decorations) | `server/hangout.js` → `SEASONS` |
| Built-in Zuno Bots | `server/features.js` (search for `botAvatar`) |
| Built-in stickers | `public/zuno19.js` and `server/zuno19.js` (search for `zuno:hi`) |
| Colors, spacing, fonts | `public/styles.css` (`:root` variables at the top), newer tweaks in `public/zuno*.css` |
| The "What's new" popup after an update | `public/whats-new.json` |
| Terms of Service | `public/terms.html` (and `website/terms.html` for the download site) |
| App version | `package.json` → `version` |

### Secrets and services (environment variables)

Anything secret is an **environment variable**, never written in the code. On the live site they're
set in the Render dashboard (Environment tab). Locally, put them in front of the command:
`KLIPY_KEY=… npm start`. Staff can see what's on and what's missing in **Settings › Setup Status**.

| Variable | What it turns on |
| --- | --- |
| `PORT` | Port to listen on (default 3000). |
| `ZUNO_DATA_DIR` | Where data and uploads are saved (default `./data`). |
| `ZUNO_PUBLIC_URL` | The site's public address, used in emails and links. |
| `ZUNO_STORAGE` | `json` to use db.json instead of SQLite. |
| `ZUNO_STAFF`, `ZUNO_STAFF_SETUP` | Extra staff usernames; allow signing up as one (only while setting up). |
| `KLIPY_KEY` | GIF search. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Zuno Bloom payments. |
| `BREVO_API_KEY` or `RESEND_API_KEY`, `ZUNO_MAIL_FROM` | Emails (password resets, login alerts, email checks). |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_PUBLIC_URL` | Uploads in cloud storage (Cloudflare R2 / S3). |
| `ZUNO_TURN_URLS`, `ZUNO_TURN_USERNAME`, `ZUNO_TURN_CREDENTIAL` | A TURN relay so calls work on strict networks. |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify connections. |
| `ANTHROPIC_API_KEY`, `ZUNO_AI_MODEL`, `ZUNO_MOD_MODEL` | The AI name judge and written summaries in Catch me up. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME` | The sign-up bot check ([TURNSTILE_SETUP.md](TURNSTILE_SETUP.md)). |
| `ZUNO_REQUIRE_TURNSTILE` | `1` refuses sign-ups while the Turnstile keys are missing. |
| `ZUNO_TRANSLATE_EMAIL` | Higher limit on the free backup translator. |
| `ZUNO_SEASON` | Force `halloween` or `winter` for testing. |
| `ZUNO_BLOOM_LAUNCH`, `ZUNO_OG_UNTIL` | Dates for the early-Bloom and OG badges. |
| `ZUNO_GOOGLE_VERIFY` | Google Search Console verification file name. |
| `ZUNO_TRUST_XFF` | Tests only: trust the `X-Forwarded-For` header. Never set this in production. |
| `ZUNO_PUSH_CONTACT` | Optional contact (a `mailto:` or your site's address) sent to push services with phone notifications. Defaults to `ZUNO_PUBLIC_URL`. |
| `ZUNO_MEMORY_MB` | The server's memory limit, for the admin dashboard (default 512). |
| `ZUNO_PUSH_TEST_URL` | Tests only: lets a pretend push service on this computer receive notifications. Never set this in production. |

If a key ever ends up in a screenshot, chat or commit, **rotate it** (make a new one and delete the
old one) at the service's dashboard.

---

## 3. How it's put together

```
server/              the backend (Node, no packages)
  index.js           the core: HTTP server, router, accounts, friends, DMs, servers, roles, Bloom,
                     calls signalling, live updates (Server-Sent Events), security headers
  config.js          the settings most people want to change (see section 2)
  db.js              keeps everything in memory in `data` and saves changes to data/zuno.sqlite
  storage.js         optional cloud storage for uploads (R2 / S3)
  namefilter.js      blocks slurs and sexual words in names
  zuno27.js          0.27: status schedules, Polls 2.0, games, Discover home, appeals, marketplace, admin dashboard
  zuno28.js          0.28: Reply Later, slash commands, forum & media channels, videos together, server tags,
                     profile visitors & comments, Download My Data, phone notifications (Web Push)
  gamewords.js       words and questions for the voice channel games
  aimod.js           the AI name judge (a second look with Claude when ANTHROPIC_API_KEY is set)
  profilemod.js      staff: remove parts of someone's profile
  appeals.js         ban appeals (and what happens to a banned login)
  chatthemes.js      chat themes and wallpapers for DMs and groups
  purge.js           founder only: permanently deleting moderation records
  features.js        0.14: sessions & resets, pins, search, polls, nicknames, timeouts, Zuno Bots…
  social.js          0.14: group chats, activity & connections, birthdays, server emoji, link previews…
  hangout.js         0.15: soundboards, saved messages, read receipts, seasons, insights, widgets…
  studio.js          0.16: appearance, scheduled messages, pictures, drafts, search index, inbox…
  community.js       0.16: stages, role pickers, onboarding, Server Blooming, backups
  secure.js          0.16: passkeys, login alerts, encryption keys, status page
  zuno19.js          0.19: threads, translation, stickers, events, AutoMod, recovery codes…
public/              the app (what the browser loads)
  index.html         loads every script and stylesheet, in order
  app.js             the core client: helpers, api(), state, login, live events, chat, settings
  *.js               one file per feature area (each starts with a comment saying what's in it)
  zuno18-27.js       newer releases' changes
  styles.css         the base look; zuno14/15/16/19/20/21/22/23/25/26/27.css add to it
  sw.js              service worker: installable app and offline support
  whats-new.json     the update popup
electron/            the desktop app (Windows/Mac installer)
website/             the download page (GitHub Pages)
test/smoke.js        npm test
```

### The server

`server/index.js` makes a tiny router:

```js
route('POST', '/api/servers/:id/leave', async ({ me, params, body, query, req }) => {
  const sv = getServer(me, params.id);        // throws a 404/403 if you can't see it
  if (sv.ownerId === me.id) fail(400, "Owners can't leave their own server.");  // friendly error
  removeMember(sv, me.id);
  return { ok: true };                        // sent back as JSON
});
```

- `me` is the logged-in user (routes need a login unless `{ auth: false }` is passed).
- `fail(status, message)` stops the request; the message is shown to the person as-is, so write it
  for humans.
- Everything lives in `data` (plain objects: `data.users`, `data.servers`, `data.channelMessages`,
  `data.groups`, `data.attachments`, `data.reports`, `data.bugs`…). Change it, then call `save()`;
  saves are batched and only changed records are written.
- Tell people about a change with `send(userId, 'event-name', payload)`, `broadcastUser(user)` (their
  profile changed) or `refreshServer(sv)`.
- **Feature files** (`features.js`, `social.js`, … `profilemod.js`) are functions that get a toolbox
  object `z` with the helpers above (`z.route`, `z.data`, `z.save`, `z.fail`…), so they don't need
  to reach into index.js. They're loaded at the bottom of index.js (search for `require('./zuno19')`).
- **Hooks** let feature files add to core behavior without editing it: e.g.
  `hooks.publicUser.push(u => ({ widgets: u.widgets || [] }))` adds a field to every profile, and
  `hooks.beforePost.push(...)` can check a message before it's posted. The full list is the `hooks`
  object near the top of index.js.
- Uploads: `sniff(buffer)` checks what a file really is from its bytes, `storeUpload(buffer, ext)`
  saves it and returns `/uploads/<name>`, `removeUpload(url)` deletes it.
- Names people choose go through `checkName(name)` (the name filter). Profile text (usernames,
  display names, statuses, pronouns, bios, nicknames, voice statuses) goes through
  `await judgeText({ bio: text, ... })` instead: the word filter, then the AI judge in `aimod.js`.
  Pass only text that changed, so nobody is charged for re-checking old text.

### The app

There's no framework. Each file adds functions to the page, and **later files can wrap earlier
ones** to add behavior. This is the pattern you'll see everywhere:

```js
const _renderComposer20 = renderComposer;      // keep the old version
renderComposer = function (...a) {
  const r = _renderComposer20(...a);           // run it
  addSendButton();                             // then add to what it drew
  return r;
};
```

So **load order matters**: `public/index.html` loads `app.js` first and newer files after it; a file
can only wrap functions from files above it. Name the saved copy after your file (`_renderComposer20`)
so it never clashes with another file's copy.

Handy helpers from `app.js`: `$(selector, root)` / `$$(selector, root)` (querySelector/All),
`esc(text)` (always use it when putting text into HTML), `api(method, url, body)` (calls the server,
throws an Error with the friendly message), `toast(text, isError)`, `openLayer(html)` (a dialog),
`openMenu(anchor, items)` (a right-click style menu), `user(id)`, `avatar(user, size)`,
`state` (everything the app knows: `state.me`, `state.servers`, `state.convos`, `state.view`…).

Live updates arrive in `connect()` in app.js (`es.addEventListener('message', …)` and friends).

### Phones

Phone styles are in `@media (max-width: 760px)` blocks; most of the phone layout is in
`public/zuno21.css` and `public/zuno21.js` (settings as a list, bottom-sheet menus, the search bar).
Test with your browser's device toolbar (iPhone size) and on a real phone if you can.

---

## 4. Adding a feature (checklist)

1. **Server:** add routes in a feature file (or a new `server/yourfeature.js` loaded at the bottom
   of index.js with `require('./yourfeature')(ctx2)`). Check permissions (`need(sv, me, 'perm')`,
   `needStaff(me)`), clean every input (`clean(text, maxLength)`), and limit how often it can be
   used if it could be spammed (`limit(key, count, windowMs, message)`).
2. **App:** add your code in the newest `public/zunoNN.js` (or a new file, added to
   `public/index.html` *and* the `SHELL` list in `public/sw.js`).
3. **Styles:** in the newest `public/zunoNN.css`. Use the color variables (`var(--brand)`,
   `var(--text)`, `var(--muted)`, `var(--border)`…) so every theme works.
4. **Test:** add a check to `test/smoke.js` and run `npm test`.
5. **Release:** bump `version` in `package.json`, describe it in `public/whats-new.json`, bump the
   cache name in `public/sw.js` (`zuno-shell-vNN`) if you added or renamed files, and add a line to
   README.md.

### Security rules (please don't skip)

- Never trust the browser: check permissions on the server for every route.
- Always `esc()` text before putting it into HTML.
- Never put keys or passwords in the code. Use environment variables.
- Uploaded files are checked by their bytes (`sniff`), never by their name or type header.
- Message attachments are private: `/uploads/<file>` and `/files/<id>/…` only answer people who can
  see a message the file is in (or its owner, or staff), checked by `canReadAttachment` in
  `server/index.js`. Browsers prove who they are with the `zuno_session` cookie (HttpOnly), so
  `<img>` and `<video>` tags work without a token in the URL. Avatars, banners and other profile
  pictures stay public. With cloud storage on, after the check the browser is sent to a presigned
  bucket link (`storage.presignedUrl`, good for a day or two) so files don't use the host's
  bandwidth. Code that reads a picture's pixels (copy, save, crop) uses `directUrl()` in
  `public/polish.js`, which asks Zuno to pass the file through instead.
- The live event stream never takes the login token in its URL: the app gets a 30-second, one-use
  ticket from `POST /api/events/ticket` (`LiveStream` in `public/app.js`). Bots connect with
  `Authorization: Bot <token>`. (Tokens in the address, `?bot=`, are refused since 0.57; a browser can POST `/api/events/ticket` with that header and connect with `?ticket=`.)
- Scripts must be separate `.js` files (the Content Security Policy blocks scripts written inside
  HTML pages).

---

### Keeping it fast

- The chat is redrawn as a whole (`renderMessages`). Keep per-message work cheap: no searching
  `convo.messages` for every row (make a `Map` once), no reading sizes (`getBoundingClientRect`,
  `scrollHeight`, `offsetTop`) in loops after changing the page, and no new `Intl` formatters per message.
- Messages out of view skip layout and painting (`content-visibility` in `public/zuno26.css`).
- `prefs()` is cached until your settings change; call it freely.
- A `MutationObserver` on the whole page runs for every change anywhere (typing included): check
  early that the change is one you care about, and batch work to the next frame.
- App files are sent with an ETag, so browsers that already have them get a quick "not changed".

## 5. Tests

`npm test` runs `test/smoke.js` (a throwaway server, then real API calls through every major area)
, `test/cloud.js` (cloud storage against a pretend S3) and `test/security.js` (sign-in cookies,
event stream tickets, who can open attachments, the Turnstile config). All three must pass before anything goes to
`main`.

## 6. Releasing

`main` is live: Render deploys every push to `main` within about a minute (people see the
"Zuno is updating" screen meanwhile). Work on a branch, test, then merge into `main`.

## 7. Troubleshooting

**Spotify doesn't show as an activity.** There are two ways it can show up:
- *Desktop app:* Zuno reads Spotify's window title ("Artist - Song") on Windows, or asks Spotify on
  a Mac (the first time, macOS asks permission for Zuno to control Spotify; say yes). Spotify has to
  be playing, and **Settings › Activity Privacy › Share my activity** has to be on. The desktop app's
  own code (electron/) only updates when a new installer is released (GitHub Actions › "Release
  Zuno", or push a `v*` tag).
- *Anywhere (web and phones):* needs `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` on the server
  and the person to press Connect in Settings › Connections. While the Spotify app is in
  "development mode" on developer.spotify.com, only accounts added to it under **User Management**
  can connect.


## Bot embeds, buttons, menus and forms (0.57)

Code: `server/zuno57.js`, `public/zuno57.js`, `public/zuno57.css`.

- Bots (only bots) can add `embeds` (up to 5: `title`, `url`, `description`, `color` `#rrggbb`,
  `author.name`, up to 15 `fields` `{ name, value, inline }`, `image` / `thumbnail`, `footer`,
  `timestamp`) and `components` (up to 5 rows; a row is up to 5 buttons or one select) to
  `POST`/`PATCH` messages. Embed pictures must be image attachments the bot uploaded itself
  (`POST /api/attachments` is open to bots), so they stay private like any attachment.
- Buttons: `{ type: 'button', id, label, emoji, style: primary|secondary|success|danger|link, url (link only), disabled }`.
  Selects: `{ type: 'select', id, placeholder, min, max, options: [{ label, value, description, emoji, default }] }`.
- A click (`POST /api/interactions`) sends the bot an `interaction` event `{ id, type: button|select|modal, componentId, values, fields, messageId, channelId|dm, user }`.
  The bot answers within 15 minutes with `POST /api/interactions/:id/respond`:
  `{ type: 'reply', content, embeds, components, ephemeral }`, `{ type: 'update', ... }` (edits the clicked message),
  `{ type: 'modal', modal: { id, title, inputs: [{ id, label, style: short|paragraph, placeholder, required, min, max, value }] } }`, or `{ type: 'ack' }`.
  Ephemeral replies are never saved; they live in memory for 15 minutes so their buttons work.
- Limits: bots mention at most 10 people and 3 roles per message, `@everyone`/`@here` once per 30 minutes per server
  (4 a day), 30 pings a minute per server. Bots with Manage Channels can make channels: 3 per server per 10 minutes,
  10 per server a day, 20 a day overall.
