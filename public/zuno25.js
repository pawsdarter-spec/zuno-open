// Zuno 0.25: proper icons instead of emoji in menus, buttons, headings and settings, and
// jumping to a message that always lands (even far back, even while pictures load).

// ======================= icons =======================
// Line icons in one style (24×24, 2px round strokes, like the rest of Zuno's toolbar). Any emoji in
// this list that starts a menu item, button, tab or heading is swapped for its icon as it's drawn.
// Messages, names, reactions, the emoji picker and anything people typed are never touched.
const UI_PATHS = {
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3M14 9l2 2"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15v4M17 17h4M5 3v3M3.5 4.5h3"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 7 10 4 12 3c2 1 2 4 0 6.5ZM14.5 12c2.5-2 5.5-2 6.5 0-1 2-4 2-6.5 0ZM12 14.5c2 2.5 2 5.5 0 6.5-2-1-2-4 0-6.5ZM9.5 12C7 14 4 14 3 12c1-2 4-2 6.5 0Z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  party: '<path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/><path d="m22 2-2.2.8a3 3 0 0 0-1.9 3.3c.1.9-.6 1.7-1.5 1.7h-.4c-.9 0-1.6.7-1.6 1.6V10"/><path d="M11 13 6.8 8.8a1 1 0 0 0-1.6.3L4 11.3l8.7 8.7 2.2-1.2a1 1 0 0 0 .3-1.6Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.6-.8 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 11c0-5-4.5-9-10-9Z"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4H8M2 14h1M21 14h1M9 13v2M15 13v2"/>',
  cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  volumeOff: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
  gamepad: '<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  thread: '<path d="M7 4v16M17 4v16M7 8h10M7 16h10"/>',
  pin: '<path d="M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-2M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  wave: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  paperclip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.9-2.9l8-8"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  crown: '<path d="M11.6 3.3a.5.5 0 0 1 .9 0l3 5.7a1 1 0 0 0 1.5.3l4.3-3.7a.5.5 0 0 1 .8.5l-2.8 10.3a1 1 0 0 1-1 .7H5.8a1 1 0 0 1-1-.7L2 6.1a.5.5 0 0 1 .8-.5L7 9.3a1 1 0 0 0 1.5-.3zM5 21h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.9 1.9 0 0 1-2 0L2 7"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  forward: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  broom: '<path d="m13 11 9-9M14.6 12.6c.8.8.9 2.1.2 3L10 22l-8-8 6.4-4.8c.9-.7 2.2-.6 3 .2Z"/><path d="m6.8 10.4 6.8 6.8M5 17l1.5-1.5"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01"/><path d="M13 4.6v16a.6.6 0 0 1-.7.5L5 19.6V5.6a2 2 0 0 1 1.5-1.9l5-1.3a1 1 0 0 1 1.5 1z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  mapPin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  sleep: '<path d="M4 4h6l-6 8h6M14 12h6l-6 8h6"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  hook: '<path d="M16 6V4a2 2 0 1 0-4 0v10a4 4 0 1 1-8 0v-2"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.7 5.1A10.7 10.7 0 0 1 22 12a13.5 13.5 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  hammer: '<path d="m15 12-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9M17.6 15 22 10.6M20.9 11.7l-1.3-1.3c-.4-.4-.6-.9-.6-1.4v-.9l-2.3-2.3a5.5 5.5 0 0 0-3.9-1.6H9l.9.8A6.2 6.2 0 0 1 12 9.6V11l2 2h.9c.5 0 1 .2 1.4.6l1.3 1.3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19"/><circle cx="12" cy="12" r="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chain: '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/>',
  updown: '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.4 1.5 1.5 2.7 2.5 2.7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  warning: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3M12 9v4M12 17h.01"/>',
  tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
  sprout: '<path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  unread: '<path d="M22 10.5V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="m2 7 8.97 5.7a1.9 1.9 0 0 0 2 0L16 10.8"/><circle cx="19" cy="5" r="3" fill="currentColor"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 12.9 17 22l-5-3-5 3 1.5-9.1"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  flask: '<path d="M10 2v7.5L4.5 19A2 2 0 0 0 6.2 22h11.6a2 2 0 0 0 1.7-3L14 9.5V2M8.5 2h7M7 16h10"/>',
  puzzle: '<path d="M15.4 2.9a1 1 0 0 0-1.4 0L12.3 4.6a2.5 2.5 0 1 1-2.9 2.9L4.6 12.3a1 1 0 0 0 0 1.4l1.6 1.6a2.5 2.5 0 1 1 2.9 2.9l1.6 1.6a1 1 0 0 0 1.4 0l1.7-1.7a2.5 2.5 0 1 0 2.9-2.9l4.8-4.8a1 1 0 0 0 0-1.4z"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.4-6.4 2.1 2.1-6.4z"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
};
const UI_EMOJI = {
  '🔒': 'lock', '🔐': 'lock', '🔓': 'unlock', '🔑': 'key', '🗝️': 'key', '✨': 'sparkles', '🌸': 'flower', '💮': 'flower',
  '🎵': 'music', '🎶': 'music', '✏️': 'pencil', '✎': 'pencil', '📝': 'note', '🎉': 'party', '🥳': 'party', '➕': 'plus',
  '😀': 'smile', '🙂': 'smile', '📁': 'folder', '📂': 'folder', '💬': 'chat', '💭': 'chat', '🗨️': 'chat', '🎨': 'palette',
  '🤖': 'bot', '🎂': 'cake', '🔊': 'volume', '🔈': 'volume', '🔇': 'volumeOff', '▶': 'play', '▶️': 'play', '⏸️': 'pause', '⏸': 'pause',
  '⏰': 'alarm', '🎮': 'gamepad', '🕹️': 'gamepad', '🖼️': 'image', '🖼': 'image', '🌙': 'moon', '🛡️': 'shield', '🧵': 'thread',
  '📌': 'pin', '📍': 'mapPin', '🏷️': 'tag', '📅': 'calendar', '🗓️': 'calendar', '🎁': 'gift', '🔔': 'bell', '🔕': 'bellOff',
  '📊': 'chart', '⭐': 'star', '🌟': 'star', '★': 'star', '🔖': 'bookmark', '❤️': 'heart', '❤': 'heart', '💖': 'heart',
  '⏳': 'hourglass', '⌛': 'hourglass', '📷': 'camera', '📸': 'camera', '🗑️': 'trash', '🗑': 'trash', '👥': 'users', '👤': 'user',
  '🧑': 'user', '👋': 'wave', '🌐': 'globe', '🌍': 'globe', '💻': 'laptop', '🖥️': 'monitor', '📱': 'phone', '📞': 'call',
  '☎️': 'call', '📎': 'paperclip', '✋': 'hand', '💾': 'save', '🎧': 'headphones', '🔗': 'link', '📚': 'book', '📖': 'book',
  '🎬': 'film', '🎥': 'film', '🚀': 'rocket', '👑': 'crown', '☀️': 'sun', '🛠️': 'wrench', '🔧': 'wrench', '⚙️': 'gear',
  '✉️': 'mail', '💌': 'mail', '📩': 'mail', '⌨️': 'keyboard', '🎤': 'mic', '🎙️': 'mic', '🎙': 'mic', '↩️': 'reply', '↪': 'forward',
  '↪️': 'forward', '🧹': 'broom', '🚪': 'door', '✂️': 'scissors', '⛔': 'ban', '🚫': 'ban', '✅': 'checkCircle', '✔️': 'check',
  '☑️': 'checkCircle', '❓': 'help', '💤': 'sleep', '📋': 'clipboard', '🪝': 'hook', '📢': 'megaphone', '📣': 'megaphone',
  '👁️': 'eye', '👁': 'eye', '🙈': 'eyeOff', '🔨': 'hammer', '🚩': 'flag', '🔁': 'repeat', '📡': 'radio', '🕒': 'clock',
  '⛓️': 'chain', '↕️': 'updown', '📤': 'upload', '🔍': 'search', '🏆': 'trophy', '🔥': 'flame', '❌': 'x', '⚠️': 'warning',
  '🌆': 'moon', '🌃': 'moon', '🌅': 'sun', '🌤️': 'sun', '👢': 'door', '🕊️': 'unlock', '↩': 'reply', '🏅': 'award', '#️⃣': 'hash', '📈': 'chart', '🧪': 'flask', '🧩': 'puzzle', '🎟️': 'ticket', '🗒️': 'note', '📄': 'note', '📦': 'box', '🔎': 'search', '🧭': 'compass', '📺': 'tv', '💡': 'bulb', '🌱': 'sprout', '🌿': 'sprout', '🔴': 'dot', '🔵': 'unread',
};
const uiIcon = name => `<svg class="ui-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_PATHS[name] || ''}</svg>`;

// Where icons go: Zuno's own controls and headings.
const UI_IC_PLACES = '.menu button, .mi-ico, h2, .greet, .tpl-e, .role-pill, .lp-ch, [class$="-ico"], [class*="-ico "], .sec-add, .composer-poll, .bf-title, .pack-play, .sm-pin, .field > label, .pane-head, .modal h4, .btn, .icon-btn, .tab, .settings-nav [data-s], .setting-head, .dialog > h3, .modal > h3, .dialog h4, .pop-head, .m-set-title, .ctx-head, [role="tab"], .seg button, .chip';
// Where they never go: things people wrote or picked, and emoji-picking itself.
const UI_IC_SKIP = '.ob-ico, .ei-ico, .wg-e-ico, .msg-body, .msg-text, .markup, .reactions, .reaction, .emoji-picker, .ep-body, .ep-grid, .ep-cats, [data-emoji], [data-react], [data-rx-add], .status-presets, .wg, textarea, input, select, [contenteditable], .no-ui-ic, .toast, .rx, .sticker-picker, .sound-btn, .soundboard';
const UI_LEAD = new RegExp(`^(\\s*)(${Object.keys(UI_EMOJI).sort((a, b) => b.length - a.length).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?\\s*`, 'u');

function iconizeEl(el) {
  if (el.dataset.uiIc || el.closest(UI_IC_SKIP)) return;
  el.dataset.uiIc = '1';
  // The first bit of text in it, skipping any icon or picture already there.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const t = walker.nextNode();
  if (!t || t.parentElement.closest('svg, img') || t.parentElement.closest(UI_IC_SKIP)) return;
  const m = UI_LEAD.exec(t.textContent);
  if (!m) return;
  const name = UI_EMOJI[m[2]];
  const holder = document.createElement('span');
  holder.className = 'ui-ic-wrap';
  holder.innerHTML = uiIcon(name);
  const rest = t.textContent.slice(m[0].length);
  t.parentNode.insertBefore(holder, t);
  if (rest) t.textContent = rest;
  else { t.remove(); holder.classList.add('alone'); }
  el.classList.add('has-ui-ic');
}
function iconizeIn(root) {
  if (!root || root.nodeType !== 1) return;
  // Messages are what people wrote: never looked through (and it keeps chat redraws quick).
  if (root.matches('.msg, .spacer, .chat-intro, .new-divider, .day-divider') || root.closest?.('#messages, .msg-body, .markup, .emoji-picker')) return;
  if (root.matches(UI_IC_PLACES)) iconizeEl(root);
  for (const el of root.querySelectorAll(UI_IC_PLACES)) iconizeEl(el);
}
new MutationObserver(list => {
  for (const r of list) {
    for (const n of r.addedNodes) {
      if (n.nodeType === 1) iconizeIn(n);
      // A button's text was swapped (e.g. "🔔 Mute" -> "🔕 Unmute").
      else if (n.nodeType === 3 && UI_LEAD.test(n.textContent)) { const el = n.parentElement?.closest(UI_IC_PLACES); if (el) { delete el.dataset.uiIc; iconizeEl(el); } }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
iconizeIn(document.body);

// ======================= jumping to a message =======================
// Draws the part of the chat the message is in (even far back), lets go of the bottom so nothing
// pulls you away, and keeps it in the middle while pictures above it finish loading.
jumpToMessage = function (id) {
  const el = $('#messages'), convo = state.convos[activeConv()];
  const i = convo?.messages.findIndex(m => m.id === id) ?? -1;
  if (!el || i < 0) return toast("Couldn't find that message. It may have been deleted.", true);
  stickToBottom = false;
  const sel = `.msg[data-id="${CSS.escape(id)}"]`;
  if (!$(sel, el)) {
    convo.from = Math.max(0, i - 40);
    el.scrollTop = 0; // so the redraw doesn't think you're at the bottom and go back to the newest messages
    renderMessages();
  }
  const row = $(sel, el);
  if (!row) return toast("Couldn't find that message. It may have been deleted.", true);
  const center = () => {
    const r = row.getBoundingClientRect(), b = el.getBoundingClientRect();
    el.scrollTop += r.top - b.top - (b.height - r.height) / 2;
    stickToBottom = false;
    lastMsgTop = el.scrollTop;
  };
  center();
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  // Pictures and previews above it can still load and push it down: keep it centered for a few
  // seconds, unless you start scrolling yourself.
  const intent = lastScrollIntent, until = Date.now() + 3000;
  const keep = () => { if (lastScrollIntent !== intent || !row.isConnected || Date.now() > until) return; center(); setTimeout(keep, 120); };
  setTimeout(keep, 120);
};
// Jump to a message, loading older history page by page until it's there. (Loading older
// messages has a short cooldown, so each page waits for it instead of giving up after one.)
jumpToAny = async function (conv, id) {
  if (activeConv() !== conv || !id) return;
  for (let i = 0; i < 60; i++) {
    const convo = state.convos[conv];
    if (convo?.messages.some(m => m.id === id)) return jumpToMessage(id);
    if (!convo?.hasMore || activeConv() !== conv) break;
    while (convo.loadingOlder) await new Promise(r => setTimeout(r, 80));
    const before = convo.messages.length;
    convo.from = 0; // older messages go straight in; no need to draw them on the way
    await loadOlder();
    if (convo.messages.length === before && !convo.hasMore) break;
  }
  toast("Couldn't find that message. It may have been deleted.", true);
};
