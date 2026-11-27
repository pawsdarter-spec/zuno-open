# Zuno

> **Open source.** This is the source code of [Zuno](https://heyzuno.uk), written from scratch for Zuno: plain Node.js on the server and plain JavaScript in the browser, with no frameworks. Copyright © 2026 Paws ([@pawsdarter-spec](https://github.com/pawsdarter-spec)). Licensed under the **GNU Affero General Public License v3.0** (see [`LICENSE`](LICENSE)): you can read, run and change it, but if you run a changed copy as a website, you must share your code under the same license. Found a security problem? See [heyzuno.uk/security](https://heyzuno.uk/security).

A chat app for you and your friends: accounts, friends, live direct messages, and profiles you can really make your own.

## What's in it

- **Accounts:** sign up with an email, username and password, and log in with either. Passwords are hashed. Change your password or email in Settings › My Account, see every device you're logged in on and log out the ones you don't recognize. Devices you don't use for 60 days log out on their own.
- **Forgot your password?** With email set up (see Configuration), Zuno emails a reset link. Without it, Zuno Staff can make a one-hour reset link from someone's profile.
- **Friends, DMs and message requests:** add friends by username; people who aren't friends can knock with up to 3 messages. Block anyone.
- **Group chats:** up to 10 friends in one chat, with a name and icon. Anyone can add friends; the owner can remove people.
- **Activity status & connections:** the desktop app shows which game you're playing and your Spotify song (from a list of known games, nothing else). Show your GitHub, YouTube, Twitch, Steam and more on your profile. A real Spotify connection works from anywhere when Spotify keys are set (see Configuration).
- **Birthdays & anniversaries:** set your birthday in My Account and friends see a 🎂 that day; Zuno celebrates friendship anniversaries in your DM. Profiles show mutual friends and servers.
- **Servers:** categories, text, voice and announcement channels, slowmode, private channels, invites, Discover, bans and an audit log. Start from a template (Friends, Gaming, Study, Community, Creators), pick a **server theme**, and follow the "Get your server ready" checklist.
- **Roles:** 25 permissions, channel overrides, role colors that can **fade between two colors**, and emoji or **picture** role icons. A role can be **given to everyone who joins** (turning it on also gives it to everyone already there). Right-click anyone (in chat, the member list or a voice channel) to **Add Roles**, change their **nickname** or **time them out**.
- **Zuno Bots:** ready-made bots anyone can add with one click: Guardian (AutoMod), Greeter, Party (fun commands), Levels (XP and role rewards), Remind Me, Polls and Starboard. You can also build your own in Settings › Developer.
- **Chat:** replies, reactions, mentions (type `@` for @everyone, @here and people, narrowing as you type), GIFs, files (paste or drop them anywhere, several pictures show as a grid), **voice messages**, **server emoji**, **link previews** (YouTube plays in chat), **jump to unread** and **mark unread**, **typed effects**, **polls** (see who voted for what), **pinned messages**, **search** (`from:name`, `has:image`, `pinned:true`), **forwarding**, and rich text (`**bold**`, `# headings`, `- lists`, `[links](https://…)`, `-# small text`, `<t:1700000000:R>` timestamps). Messages sit on the left; on phones your own DM messages show on the right.
- **Look & sound (all free):** Dark, Midnight, Dim and Light themes, your own picture as the app background (with darken and blur), zoom, color saturation, high contrast, square avatars, a 24-hour clock, and switches for chat avatars, role colors, GIF autoplay and link previews. **Name styles** give your name a font and an effect (gradient, flowing, glow, neon, rainbow). **Status presets** set your emoji, message and status in one click. Pick a message **sound pack** (Classic, Bubbly, Retro, Soft, Chime) or upload your own MP3.
- **Profiles:** **animated avatars (free)**, name colors and profile themes (free), banners, MP4/GIF backgrounds, profile sounds (loop or play once), **avatar decorations**, **animated profile effects**, **profile widgets** (favorite games, a song on repeat, a photo, a text box, favorite things), a switch to turn off other people's profile videos and sounds (Settings › Profile Effects), a status emoji that can clear itself, and private **notes** on other people's profiles.
- **Zuno Wrapped:** a yearly recap of your top friends, servers, emoji and busiest hour (your avatar menu › Zuno Wrapped).
- **Passkeys:** log in with your fingerprint, face or phone instead of a password (Settings › My Account › Passkeys, then "Log in with a passkey"). Checked by Zuno itself with Node's own crypto, no extra services.
- **New-login alerts:** logging in from a new browser or device sends you a message (and an email, when email is set up).
- **End-to-end encrypted DMs:** tap the 🔒 in a DM to lock new messages so only the two of you can read them, on your own devices. Each device makes its own key; Zuno only stores scrambled text and shows a safety number you can compare. (Text only for now; pictures and files aren't encrypted yet.)
- **Offline mode:** Zuno opens without a connection and shows your recent chats; messages you send offline wait on your device and go out when you're back.
- **Status page:** `/status` shows whether Zuno is up, response times, 90 days of uptime and any incidents (staff post them).
- **Two-factor login:** authenticator-app codes with backup codes (Settings › My Account). Staff can turn it off for someone who's locked out.
- **Calls:** voice and video calls, **group calls** (everyone in the group rings), voice channels and screen sharing, with a lively ringtone and **noise suppression** (Settings › Voice & Video: pick a microphone, noise suppression, echo cancellation, auto gain, mic test). Every call shows up in the chat as a message (missed, declined, or how long it lasted) with Join and Call Back buttons. Calls retry once if the connection drops, and can use a TURN relay for strict networks.
- **Your volume for each person:** right-click someone in a call (or long-press on a phone) to mute them just for you or set their volume from 0% to 200%. Saved on your device.
- **Uploads:** files up to 10 MB (50 MB with Bloom). Pictures (PNG, JPG, GIF, WebP, AVIF, BMP) and videos (MP4, MOV, WebM) show and play right in the chat; iPhone HEIC photos are turned into JPEGs when the browser can; other files show what kind of file they are. Uploaded GIFs can be favorited and sent again from the GIF picker.
- **GIF avatars and banners:** Change Avatar / Upload Banner › Choose A Gif picks from your favorites or a search. Zuno keeps its own copy of the GIF.
- **Phones (0.21):** Settings and Server Settings open as a list you tap into, with a Back button; right-click menus slide up from the bottom; the search, profile and member buttons work; call buttons fit the screen; and there's a send button.
- **Voice channel games:** ▶ in a call: Wordle Race (everyone gets the same word, sees each other's colours but not letters), Trivia Night (8 questions, points for speed) and Connect Four.
- **Polls 2.0:** ranked choice (instant runoff), anonymous, hide results until the end, let everyone add answers, 15 minutes to 2 weeks, end early. Zuno replies with the result when a poll ends.
- **Pin Board:** Pins › Open board: every pin as a card, filtered by type or person, searchable.
- **Status schedules:** status menu › Schedule Status, e.g. Do Not Disturb on weekdays 9–5 with an optional custom status. Custom statuses show as a bubble next to your name on your profile.
- **Discover:** Trending this week, New & rising, and a row per category.
- **Server ban appeals:** Settings › Account Standing lists servers you're banned from, with Appeal. Moderators answer in Server Settings › Bans.
- **Bot Marketplace:** every public bot with categories, ratings and reviews (Discover › Bot Marketplace, or Server Settings › Bots & Webhooks). Bot makers set a category and tagline in Settings › Developer.
- **Bloom gifting events:** the founder starts one from the admin dashboard; gifting Bloom while it runs earns the Gift Giver badge.
- **Admin dashboard:** Settings › Admin Dashboard, founder only: people, activity, Bloom, moderation queues and server health.
- **In-game overlay (desktop app):** who's in your call and who's talking, floating over windowed/borderless games. Shift+` hides it. Settings › Voice & Video.
- **Spotify links** in bios and messages open in the Spotify app (the web player if it isn't installed).
- **Stream quality:** pick 480p, 720p, 1080p, 1440p or Source and 15, 30 or 60 FPS when you go live (right-click the share button, or the quality button, to change it while live). 1080p and up and 60 FPS need Zuno Bloom or Server Blooming level 2.
- **Clips:** turn on in Settings › Voice & Video › Clips (or press the clip button in a call). Zuno keeps the last 15, 30 or 60 seconds of the call on your device; press clip (Ctrl+Shift+C by default) to save it. Everyone in the call is told. Send one with **+ › Send A Clip**.
- **Chat in voice channels:** every voice channel has its own chat (**Chat** at the top of the voice channel), with the call shown above it.
- **Blocking:** Block or Unblock from someone's profile, their right-click menu in a server, or a DM's right-click menu. In servers and groups, their messages fold into "Blocked message" (click Show to read it).
- **Message from a profile:** type in the "Message @name" box at the bottom of someone's profile.
- **Message box:** `:sob:` turns into 😭 as soon as you finish typing it, and @mentions that will really ping someone are highlighted while you type.
- **Staff in servers:** Zuno Staff can see every channel of a server they're in, but can only talk where a normal member with their roles could.
- **Bigger streams:** click or tap a video or screen share (or ⤢) to make it fill the call; again to shrink it.
- **Name filter:** slurs and sexual words can't be used in usernames, display names, nicknames, statuses, pronouns, bios, voice channel statuses, or server, group, role and bot names (`server/namefilter.js`). Phrases that point to a slur ("hard R", "soft A") are blocked too.
- **AI name judge:** with `ANTHROPIC_API_KEY` set, usernames, display names, statuses, pronouns, bios (also per-server ones), nicknames and voice channel statuses get a second look from Claude, which catches disguised slurs, innuendo and hate the word list misses, and tells the person why (`server/aimod.js`). Only changed text is checked and answers are remembered for a day. If the AI can't be reached, the word filter's answer stands.
- **Profile moderation:** staff can take down single widgets, a bio, status, avatar, banner, background or sound from someone's profile (Moderate profile, on their profile). They're told what and why.
- **Zuno bans delete the account:** it becomes DELETED_USER_<numbers>, leaves every server, group and friend list, and its email can't sign up again.
- **Ban appeals:** for 14 days (`APPEAL_DAYS` in server/config.js) the banned person can still log in, only to see why and send one appeal. Staff answer in Settings › Moderation › Appeals: approving brings their name and profile back (not servers or friends); denying, or the time running out, wipes the login.
- **Video player:** Zuno's own player for videos in chat: drag to seek, speed, volume, picture-in-picture, fullscreen, download, keyboard shortcuts and double-tap to skip on phones. A playing video keeps going when new messages arrive.
- **Chat themes & wallpapers:** 🎨 in a DM or group: 21 themes, each with an animated scene (petals, bubbles, stars, neon grid, lava lamp, aurora, snow, hearts…), its own bubble style, a tinted top bar and message box, and an emoji burst when you send. A wallpaper or your own picture (with a darken slider) can replace the scene. Everyone in the chat sees it.
- **Encrypted group chats:** the 🔒 in a group turns on end-to-end encryption for everyone in it (each message is locked for every member's devices). New DMs and groups offer encryption right away.
- **Reports in encrypted chats:** the reporter's device shares the keys for the reported message and up to 30 before it; Zuno unlocks the stored text with them, so staff see exactly what was sent (marked "verified"). Staff can open **View related conversation** on any report for up to 35 messages around it, with their pictures and videos. Staff can **claim** a report so others know it's being handled (and release it again), and leave **internal notes** on it that only staff see; both show up in the moderation log. A walkthrough for new staff is in [docs/MODERATION_GUIDE.md](docs/MODERATION_GUIDE.md). Only the founder can permanently delete reports, bug reports, appeals and moderation log entries (server/purge.js).
- **Search tags:** type `from:` in a search box to pick a person; it becomes a `from:@name` tag and what you type after finds their messages.
- **Phones:** + opens your photos and videos right away; ⋯ has the camera (photo or video), files, polls, scheduling and stickers.
- **Bug reports:** reporters pick Important, Minor or Cosmetic; staff can filter by category, change it, and dismiss or restore reports.
- **Streams:** hover someone's screen share for its own volume, mute and Stop Watching (right-click the tile for Watch Stream to bring it back).
- **Push to Talk:** Settings › Voice & Video › Input mode. Hold your key (` to start, changeable) or the Hold to Talk button in the call.
- **Soundboard:** play sounds for everyone in a call (🎵 in the call controls). Zuno has 8 built in; servers can upload up to 24 of their own (MP3, 5 seconds, 512 KB each) in Server Settings › Soundboard, controlled by the Use Soundboard permission.
- **Scheduled messages, edit history, pictures:** schedule a message with the ⏰ in the message box; click "(edited)" to see earlier versions; add alt text and spoilers to pictures before sending. Big pictures are shrunk (WebP) and get a small preview, so chats load fast. Drafts follow you between devices.
- **Search everywhere:** Ctrl+Shift+F (or the search button with a +) searches every DM, group and server you're in at once, so you can find a conversation by what was said in it. A word index keeps search instant.
- **Notification inbox:** the 🔔 in the top bar collects mentions, replies, reactions, friend requests, missed calls and reminders.
- **Saved messages & reminders:** right-click a message to save it or pick **Remind Me in 1 Hour** (or later); Zuno DMs you the reminder. Find everything under 🔖 in the top bar.
- **Read receipts:** "Seen" under your last DM message once they've read it. Either person can turn it off (Settings › Privacy & Safety), which hides it both ways.
- **Close Friends:** pick close friends (from their profile or your status menu) and share a Close Friends status, with a photo, that only they see. It disappears after 1 to 24 hours.
- **Hold and drag:** press on a channel, category, role or DM and move it: it follows your pointer and drops where the line shows. Channels can go into other categories, and DMs into your categories (or onto Pinned).
- **Writing:** select text in the message box for a formatting bar (bold, italic, underline, strikethrough, hidden/spoiler, code, quote, link), or use Ctrl+B / Ctrl+I / Ctrl+U. The message you're replying to stays highlighted, and hovering a reply lights up the message it answers.
- **Emoji:** favorite emoji (right-click one in the picker, or the ☆) at the top of the picker. Click a server emoji in chat to see which server it's from, and join it if it's public.
- **Organizing:** pin DMs to the top or sort them into your own categories (right-click a conversation); drag servers onto each other to make **server folders** with a name and color.
- **Friend suggestions:** "People you may know" from mutual friends and small servers you share (Friends › Add Friend), with a ✕ to hide anyone.
- **Account switching:** stay logged into up to 5 accounts on one device and switch from your status menu.
- **Threads:** right-click a message in a server and pick **Create Thread** for a side conversation that opens next to the chat. The message shows how many replies it has; the 🧵 button in the top bar lists a channel's threads. Whoever started it (or a moderator) can rename or close it.
- **Translate:** right-click any message and pick **Translate** to read it in your language (free, no key needed).
- **Stickers:** the sticker button next to GIF. Zuno has 12 of its own; servers can upload up to 30 (Server Settings › Stickers), which people in the server can send anywhere.
- **Catch me up:** the ✨ button in the top bar (or **Catch me up** in the "new messages" bar) sums up what you missed: who talked, what's for you, the most-reacted messages, questions, pins, polls, threads and links. With `ANTHROPIC_API_KEY` set it also writes a short summary.
- **Saved message folders:** sort saved messages (🔖) into folders with the 📁 button; right-click a folder to rename or delete it.
- **Listen Together & Watch Together:** in any call, the ▶ button plays YouTube in sync for everyone in it. Listen Together (music) is free; Watch Together (video) is a Bloom perk. Anyone in the call can add to the queue, play, pause and skip.
- **Screen sharing with sound:** tick "Share audio" when you pick what to share. 720p for everyone, 1080p with Zuno Bloom.
- **Events:** plan game nights and watch parties (the 📅 Events row at the top of a server's channels). Members mark themselves interested and get reminded 15 minutes before and when it starts. Needs the new Manage Events permission.
- **AutoMod:** Server Settings › AutoMod blocks words (with `*wildcards*`), links (except sites you allow), invites, mention spam, shouting and repeated messages, can time people out, and can post alerts in a channel. Every block is in the audit log, which can now be searched and filtered by date.
- **0.28:** forum and media channels (Create Channel), Watch Together for videos sent in chat (▶ in a call), slash commands (`/`), Reply Later (right-click a message), server tags (Server Settings › Server Tag; members wear them from the server menu), profile comments and opt-in profile visitors (Privacy & Safety), Download My Data, phone notifications through Web Push (Settings › Notifications), mini mode for calls (⧉ or Ctrl+Shift+M), Close DM, spoilers after sending, voice channel chat beside the call, a pop-out for streams, zooming into fullscreen streams, and a steadier chat.
- **Recovery codes:** Settings › My Account › Recovery codes makes 10 one-time codes. "Use a recovery code" on the login screen gets you back in if you forget your password and can't reach your email.
- **Where you're logged in:** Settings › My Account shows your devices on a map (city level, from each device's internet address).
- **Keyboard shortcuts:** Ctrl+/ shows them all (also linked under the message box on computers). New: Alt+↑/↓ to move between channels or DMs, Ctrl+Shift+M mute, Ctrl+Shift+D deafen, Ctrl+E emoji, Ctrl+Shift+S saved messages, Ctrl+Shift+U catch me up, Ctrl+, settings.
- **Phones:** swipe a message right to reply; swipe from the left edge for the menu; extra top-bar buttons are under ⋯.
- **Maintenance notices & updates:** staff schedule a notice in Settings › Setup Status and a banner counts down in every open Zuno. When the server restarts for an update, everyone sees a "Zuno is updating" screen until it's back, then Zuno reloads itself.
- **Bug reports:** the yellow 🐞 button on the server bar (under Discover) or your menu › Report a Bug. Add a screenshot from a file, paste one (Ctrl+V), or take one right from the report form.
- **Seasonal events:** snow in December, pumpkins and bats in October, and limited decorations and profile effects you can only pick up during the event (you keep them). Turn the effects off in Settings › Appearance.
- **Stage channels:** speakers talk, everyone else listens and can raise a hand ✋; stage moderators (Manage Stage or Manage Channels) invite people up and set a topic. Voice channels can also have a **status** ("grinding ranked 🎮") that clears itself when everyone leaves.
- **Role pickers & onboarding:** post a message with buttons (or emoji reactions) that hand out roles, and ask new members a few questions when they join to give them roles to match (Server Settings › Role Pickers and Onboarding).
- **Server Blooming:** Zuno Bloom comes with 2 Server Blooms. Bloomed servers level up (2, 6 and 12 Blooms) for more emoji and soundboard slots, HD screen share in voice and a glow in the server list.
- **Server backups:** download a server's setup (roles, permissions, channels, onboarding, settings) as a file, or from the 5 automatic daily copies, and turn it into a new server any time (Server Settings › Backups, or Add a Server).
- **Per-server profiles:** a different avatar, nickname, bio, pronouns and banner color in each server (server menu › Edit Server Profile).
- **Server insights:** owners and moderators see members, growth, active members, messages per day and the busiest hours (Server Settings › Server Insights).
- **Zuno Bloom:** the $5/month subscription (Stripe), with gifting.
- **Safety:** reports, a staff moderation panel, account standing, and the rules in Zuno Official's #rules channel.

## Get Zuno

Download it from **https://heyzuno.uk/download** and run `Zuno-Setup.exe`. Zuno then lives in your Start menu and on your desktop, so you can pin it to the taskbar. Everyone uses the same online server, and Zuno updates itself.

`Start Zuno (Windows).bat` in this folder just opens the installed app (or the website, if Zuno isn't installed yet).

## Updates

The installed Zuno (from Zuno Setup.exe) remembers this folder. Every time it opens, it runs the newest code from here, so you never need to rebuild or reinstall to get updates. When a new version lands while Zuno is open, a bar appears at the top with a **Restart** button. After restarting you'll see what's new.

Keep this folder where it is. If you move or delete it, the installed Zuno goes back to the version it was installed with.

## Make an installer (Zuno Setup.exe)

Double-click **Build Zuno Installer (Windows).bat**. When it's done, the installer opens by itself (it's saved as `dist\Zuno Setup.exe`). You can give that file to friends, and they install Zuno like any other program. Because the installer isn't code-signed yet, Windows may show a "Windows protected your PC" warning. Click **More info → Run anyway**.

## Just the server (no app window)

`npm start` runs only the server, at http://localhost:3000, for testing in a browser.

## Where things are saved

- Desktop app: in your app-data folder (on Windows: `%APPDATA%\Zuno\data`)
- `npm start`: in the `data` folder here

Everything is kept in `zuno.sqlite` (SQLite, built into Node 22 and newer), which only writes what changed, so saving stays quick however big Zuno gets. The first time a server starts on SQLite it moves everything over from the old `db.json` (and keeps it as `db.json.imported`). On an older Node, Zuno keeps using `db.json`. Set `ZUNO_STORAGE=json` to force that.

Uploads go in `uploads/`, or in cloud storage when it's set up (see Configuration). With cloud storage on, new uploads go straight to the cloud and older ones are moved over in the background, so the server's disk never fills up.

Delete that `data` folder to start fresh.

## How it's put together

**Want to work on Zuno?** Start with [docs/DEVELOPING.md](docs/DEVELOPING.md): how to run it, where every setting lives, how the code fits together, and a checklist for adding features. The settings most people change (upload sizes, staff, Bloom perks) are all in `server/config.js`.

```
electron/           the desktop app window (main.js), server settings screen (connect.html)
server/index.js     the backend: accounts, friends, messages, servers, roles, Bloom, calls, live updates
server/features.js  0.14 features: sessions & resets, pins, search, polls, nicknames, timeouts, themes, templates, Zuno Bots
server/social.js    0.14 features: group chats, activity & connections, birthdays, server emoji, link previews, Wrapped, two-factor login
server/hangout.js   0.15 features: soundboards, saved messages, read receipts, seasonal events, insights, close friends, layouts, widgets
server/studio.js    0.16: appearance, name styles, presets, drafts, scheduled messages, pictures, the search index, server profiles, suggestions, inbox
server/community.js 0.16: stage channels, voice channel status, role pickers, onboarding, Server Blooming, server backups
server/secure.js    0.16: passkeys, new-login alerts, end-to-end encryption keys, the status page
server/zuno19.js    0.19: threads, translation, stickers, saved folders, catch me up, Listen/Watch Together, events, AutoMod, recovery codes, device map, maintenance notices
server/config.js    the settings most people want to change: upload sizes and other perks, staff, reserved names
server/namefilter.js blocks slurs and sexual words in usernames and other names
server/profilemod.js staff: take down parts of someone's profile (widgets, bio, avatar…)
server/appeals.js   ban appeals: one appeal per ban, answered by staff
server/chatthemes.js chat themes and wallpapers for DMs and groups
server/purge.js     founder only: permanently delete reports, bug reports, appeals and log entries
server/db.js        saves everything to data/zuno.sqlite (only what changed, with daily backups), or data/db.json on older Node
server/storage.js   cloud storage for uploads (Cloudflare R2, Amazon S3 or anything S3-compatible), no packages needed
public/             the app itself: index.html, styles.css, app.js and one file per feature area
docs/DEVELOPING.md  the guide for people working on the code
docs/TURNSTILE_SETUP.md   turning on the sign-up bot check
docs/MODERATION_GUIDE.md  how staff handle reports, appeals and bans
test/smoke.js       npm test (with test/cloud.js, which checks cloud storage against a pretend S3, and test/security.js)
build/            app icons used by the installer
```

## Configuration

Everything optional is turned on with environment variables in the Render dashboard (Environment tab). Never put keys in the code. Zuno Staff can see what's on and what's missing in **Settings › Setup Status**.

| Variable | What it does |
| --- | --- |
| `ZUNO_DATA_DIR` | Where accounts and uploads are saved (render.yaml sets this to the disk). Zuno also keeps a daily backup of the last 3 days in `backups/` there. |
| `KLIPY_KEY` | GIF search (free key at klipy.com/developers). |
| `STRIPE_SECRET_KEY` | Zuno Bloom payments. Zuno creates its own Stripe webhook. |
| `BREVO_API_KEY` | Password reset and email-check emails, the easy way: free at brevo.com, no domain needed. Add your email as a sender in Brevo, then set `ZUNO_MAIL_FROM` to it, like `Zuno <you@gmail.com>`. |
| `RESEND_API_KEY` | The other email option (resend.com). Its test sender only delivers to your own Resend email, so to email anyone else you need your own domain verified in Resend and `ZUNO_MAIL_FROM` on it. |
| `ZUNO_TURN_URLS`, `ZUNO_TURN_USERNAME`, `ZUNO_TURN_CREDENTIAL` | A TURN relay so calls work on school, work and phone networks. |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Lets people connect Spotify so their song shows from any device. Make an app at developer.spotify.com with the redirect URL `<your address>/api/connections/spotify/callback`. (The desktop app shows Spotify songs without this.) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Keep uploads in cloud storage instead of the server's disk. For Cloudflare R2: make a bucket, then an R2 API token with Object Read & Write; the endpoint looks like `https://<account id>.r2.cloudflarestorage.com`. `S3_REGION` defaults to `auto` (right for R2; use your bucket's region for Amazon S3). With cloud storage on, browsers download pictures, videos and files straight from the bucket (R2 doesn't charge for downloads), so they don't use up the host's bandwidth: Zuno checks who's asking, then sends them on with a link that only works for that file for a day or two. Optional `S3_PUBLIC_URL`: the bucket's public address, used for public pictures like avatars. |
| `ZUNO_STORAGE` | Set to `json` to keep using db.json instead of SQLite. |
| `ZUNO_SEASON` | Force a seasonal event for testing: `halloween` or `winter`. Normally October and December turn them on by themselves. |
| `ZUNO_STAFF` | Extra staff usernames, comma-separated. |
| `ZUNO_STAFF_SETUP` | Staff usernames (veil and `ZUNO_STAFF`) can't be registered by anyone. Set this to `1` only while creating a new staff account, then remove it. |
| `ZUNO_GOOGLE_VERIFY` | Optional: the file name Google Search Console gives you for the "HTML file" check (like `google1234abcd.html`), so you can prove the site is yours and ask Google to list it. |
| `ANTHROPIC_API_KEY` | Optional: turns on the **AI name judge** and adds a short written summary to **Catch me up** (key from console.anthropic.com). `ZUNO_MOD_MODEL` picks the judge's model and `ZUNO_AI_MODEL` the summary's (both default to `claude-haiku-5-5`, the fast, cheap one; `claude-opus-5-5` judges more carefully but costs more and is slower). Without a key, both still work: the word filter alone checks names, and Catch me up skips the written summary. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional: Cloudflare Turnstile, the "are you human?" check on sign-up, so bots can't make accounts in bulk. Free; set up in a few minutes with [docs/TURNSTILE_SETUP.md](docs/TURNSTILE_SETUP.md). The secret key stays on the server; the browser only ever gets the site key. Optional `TURNSTILE_HOSTNAME` (like `zuno-tau7.onrender.com`) also checks the check was done on your site. Without the keys, sign-up works as before. |
| `ZUNO_REQUIRE_TURNSTILE` | Set to `1` to refuse new sign-ups while the Turnstile keys are missing (instead of letting them through). |
| `ZUNO_TRANSLATE_EMAIL` | Optional: an email address sent to the free backup translation service, which raises its daily limit. |

## Security

Every page is sent with a Content Security Policy (only Zuno's own scripts, plus YouTube's player and the map library, can run), HSTS, a Permissions-Policy and frame protection. Logins are limited per account as well as per address, two-factor codes lock after 10 wrong tries, adding a passkey needs your password, and encrypted-chat keys belong to the login that made them. Calls re-check who's allowed every few seconds and after every change.

The pictures, videos, voice messages and files people send are private: only people who can see the message (plus the sender and staff) can open them, even with the link. Browsers prove who they are with an HttpOnly sign-in cookie, so the login token never goes in a URL; the live event stream uses a 30-second, one-use ticket instead. Avatars and banners stay public. With the Turnstile keys set, new accounts need to pass Cloudflare's "are you human?" check (see [docs/TURNSTILE_SETUP.md](docs/TURNSTILE_SETUP.md)). `test/security.js` checks all of this.

Found a security problem? Email **support@heyzuno.uk** with **[Security]** at the start of the subject, or see [heyzuno.uk/security](https://heyzuno.uk/security).

## Testing

`npm test` (36 checks, then the cloud storage and security checks) starts a throwaway server with an empty data folder and checks accounts, sessions, password resets, two-factor login, DMs, group chats, servers, roles, nicknames, timeouts, polls, search, forwarding, voice messages, server emoji, link-preview safety, Wrapped, the Zuno Bots, the Zuno Official rules, calls as messages and group calls, soundboards, saved messages and reminders, read receipts, seasonal flair, insights, close friends, layouts, widgets, and cloud storage, and 0.16's features: name styles and themes, scheduled messages, edit history, picture alt text, search everywhere, the inbox, friend suggestions, stages, role pickers, onboarding, Server Blooming, backups, passkeys (with a pretend authenticator), login alerts and encrypted DMs, and 0.19's threads, stickers, saved folders, catch me up, AutoMod, audit search, events, recovery codes, the device map, maintenance notices and Listen Together. It never touches real data.

## Going online (website + downloads)

Everything is set up in this folder. These steps need your own accounts, so they're done once, by you.

1. **Put this folder on GitHub.** Make a free account at github.com, create a repository named `zuno`, and upload this folder to it (GitHub Desktop is the easiest way). Don't upload `node_modules`, `dist` or `data`; the `.gitignore` file skips them automatically.
2. **Start the online server.** Make an account at render.com, choose **New > Blueprint**, and pick your `zuno` repository. Render reads `render.yaml` and starts the server. You'll get an address like `https://zuno-xxxx.onrender.com`. Running it around the clock with a disk for your data is a paid plan.
3. **Tell the app where the server is.** In your GitHub repository go to **Settings > Secrets and variables > Actions > Variables** and add `ZUNO_SERVER` with your Render address.
4. **Turn on the website.** In the repository go to **Settings > Pages** and set the source to **GitHub Actions**. The site in `website/` goes live at `https://YOUR-NAME.github.io/zuno`.
5. **Publish a version.** In the repository open **Actions > Release Zuno > Run workflow**, or push a tag like `v0.6.0`. GitHub builds `Zuno-Setup.exe` and attaches it to a release. The website's download button always points at the newest one, and installed copies update themselves.

For each new version: change `version` in `package.json`, update `public/whats-new.json`, upload the changes, and run **Release Zuno** again.

Files involved: `render.yaml` (server hosting), `.github/workflows/release.yml` (builds the installer), `.github/workflows/website.yml` (publishes the site), `website/` (the site itself).
