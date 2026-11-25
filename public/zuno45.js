'use strict';
// Zuno 0.45: smoother and faster. Words with numbers and names in them in every language, dates in
// your language, the name-style fonts no longer hold up the first paint, and more (see below).

// ======================= languages: words with numbers and names =======================
{
  const T = (l, m) => m[l];
  const P = {
    members: { es: n => `${n} miembros`, pt: n => `${n} membros`, fr: n => `${n} membres`, de: n => `${n} Mitglieder`, it: n => `${n} membri`, nl: n => `${n} leden`, pl: n => `${n} członków`, tr: n => `${n} üye`, ja: n => `メンバー${n}人` },
    member: { es: '1 miembro', pt: '1 membro', fr: '1 membre', de: '1 Mitglied', it: '1 membro', nl: '1 lid', pl: '1 członek', tr: '1 üye', ja: 'メンバー1人' },
    people: { es: n => `${n} personas`, pt: n => `${n} pessoas`, fr: n => `${n} personnes`, de: n => `${n} Personen`, it: n => `${n} persone`, nl: n => `${n} mensen`, pl: n => `${n} osób`, tr: n => `${n} kişi`, ja: n => `${n}人` },
    since: { es: d => `Amigos desde ${d}`, pt: d => `Amigos desde ${d}`, fr: d => `Amis depuis le ${d}`, de: d => `Befreundet seit ${d}`, it: d => `Amici dal ${d}`, nl: d => `Vrienden sinds ${d}`, pl: d => `Znajomi od ${d}`, tr: d => `${d} tarihinden beri arkadaş`, ja: d => `${d}から友達` },
    mutual: { es: n => `${n} servidor${n == 1 ? '' : 'es'} en común`, pt: n => `${n} servidor${n == 1 ? '' : 'es'} em comum`, fr: n => `${n} serveur${n == 1 ? '' : 's'} en commun`, de: n => `${n} gemeinsame${n == 1 ? 'r' : ''} Server`, it: n => `${n} server in comune`, nl: n => `${n} gedeelde server${n == 1 ? '' : 's'}`, pl: n => `Wspólne serwery: ${n}`, tr: n => `${n} ortak sunucu`, ja: n => `共通のサーバー${n}つ` },
    today: { es: t => `Hoy a las ${t}`, pt: t => `Hoje às ${t}`, fr: t => `Aujourd'hui à ${t}`, de: t => `Heute um ${t}`, it: t => `Oggi alle ${t}`, nl: t => `Vandaag om ${t}`, pl: t => `Dzisiaj o ${t}`, tr: t => `Bugün ${t}`, ja: t => `今日 ${t}` },
    yesterday: { es: t => `Ayer a las ${t}`, pt: t => `Ontem às ${t}`, fr: t => `Hier à ${t}`, de: t => `Gestern um ${t}`, it: t => `Ieri alle ${t}`, nl: t => `Gisteren om ${t}`, pl: t => `Wczoraj o ${t}`, tr: t => `Dün ${t}`, ja: t => `昨日 ${t}` },
    joined: { es: d => `Se unió el ${d}`, pt: d => `Entrou em ${d}`, fr: d => `A rejoint le ${d}`, de: d => `Beigetreten am ${d}`, it: d => `Iscritto il ${d}`, nl: d => `Lid sinds ${d}`, pl: d => `Dołączono ${d}`, tr: d => `Katıldı: ${d}`, ja: d => `${d}に参加` },
    online: { es: 'En línea', pt: 'Online', fr: 'En ligne', de: 'Online', it: 'Online', nl: 'Online', pl: 'Dostępni', tr: 'Çevrimiçi', ja: 'オンライン' },
    offline: { es: 'Desconectados', pt: 'Offline', fr: 'Hors ligne', de: 'Offline', it: 'Offline', nl: 'Offline', pl: 'Niedostępni', tr: 'Çevrimdışı', ja: 'オフライン' },
    allFriends: { es: 'Todos los amigos', pt: 'Todos os amigos', fr: 'Tous les amis', de: 'Alle Freunde', it: 'Tutti gli amici', nl: 'Alle vrienden', pl: 'Wszyscy znajomi', tr: 'Tüm arkadaşlar', ja: 'すべての友達' },
    message: { es: x => `Mensaje a ${x}`, pt: x => `Conversar com ${x}`, fr: x => `Écrire à ${x}`, de: x => `Nachricht an ${x}`, it: x => `Scrivi a ${x}`, nl: x => `Bericht aan ${x}`, pl: x => `Napisz do ${x}`, tr: x => `${x} kişisine mesaj`, ja: x => `${x}にメッセージ` },
    greet: {
      es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' }, pt: { morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite' },
      fr: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' }, de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
      it: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' }, nl: { morning: 'Goedemorgen', afternoon: 'Goedemiddag', evening: 'Goedenavond' },
      pl: { morning: 'Dzień dobry', afternoon: 'Dzień dobry', evening: 'Dobry wieczór' }, tr: { morning: 'Günaydın', afternoon: 'İyi günler', evening: 'İyi akşamlar' },
      ja: { morning: 'おはよう', afternoon: 'こんにちは', evening: 'こんばんは' },
    },
    widgets: { es: 'Widgets del perfil', pt: 'Widgets do perfil', fr: 'Widgets du profil', de: 'Profil-Widgets', it: 'Widget del profilo', nl: 'Profielwidgets', pl: 'Widżety profilu', tr: 'Profil widget\'ları', ja: 'プロフィールウィジェット' },
    idle: { es: x => `${x} no está haciendo nada ahora`, pt: x => `${x} não está fazendo nada agora`, fr: x => `${x} ne fait rien en ce moment`, de: x => `${x} macht gerade nichts`, it: x => `${x} non sta facendo nulla ora`, nl: x => `${x} doet nu niets`, pl: x => `${x} teraz nic nie robi`, tr: x => `${x} şu anda bir şey yapmıyor`, ja: x => `${x}は今何もしていません` },
    used: { es: n => `No caduca. Usada ${n} ${n == 1 ? 'vez' : 'veces'}.`, pt: n => `Não expira. Usado ${n} ${n == 1 ? 'vez' : 'vezes'}.`, fr: n => `N'expire jamais. Utilisée ${n} fois.`, de: n => `Läuft nie ab. ${n}-mal genutzt.`, it: n => `Non scade mai. Usato ${n} ${n == 1 ? 'volta' : 'volte'}.`, nl: n => `Verloopt nooit. ${n} keer gebruikt.`, pl: n => `Nie wygasa. Użyto ${n} raz(y).`, tr: n => `Süresi dolmaz. ${n} kez kullanıldı.`, ja: n => `無期限。${n}回使用。` },
    youHave: { es: n => `Tienes ${n} miembros.`, pt: n => `Você tem ${n} membros.`, fr: n => `Tu as ${n} membres.`, de: n => `Du hast ${n} Mitglieder.`, it: n => `Hai ${n} membri.`, nl: n => `Je hebt ${n} leden.`, pl: n => `Masz ${n} członków.`, tr: n => `${n} üyen var.`, ja: n => `メンバーは${n}人です。` },
    confirmed: { es: n => `${n} de 5 reportes confirmados.`, pt: n => `${n} de 5 relatos confirmados.`, fr: n => `${n} signalements confirmés sur 5.`, de: n => `${n} von 5 bestätigten Meldungen.`, it: n => `${n} su 5 segnalazioni confermate.`, nl: n => `${n} van 5 bevestigde meldingen.`, pl: n => `${n} z 5 potwierdzonych zgłoszeń.`, tr: n => `5 onaylı rapordan ${n}.`, ja: n => `確認済みの報告 ${n}/5件。` },
    more: { es: n => `${n} más`, pt: n => `mais ${n}`, fr: n => `encore ${n}`, de: n => `noch ${n}`, it: n => `altre ${n}`, nl: n => `nog ${n}`, pl: n => `jeszcze ${n}`, tr: n => `${n} tane daha`, ja: n => `あと${n}件` },
    include: { es: v => `Incluiremos tu versión de Zuno (${v}) y tu sistema para que el equipo lo encuentre antes.`, pt: v => `Vamos incluir sua versão do Zuno (${v}) e seu sistema para a equipe achar mais rápido.`, fr: v => `On joindra ta version de Zuno (${v}) et ton système pour que l'équipe trouve plus vite.`, de: v => `Wir senden deine Zuno-Version (${v}) und dein System mit, damit das Team es schneller findet.`, it: v => `Includeremo la tua versione di Zuno (${v}) e il sistema così il team lo trova prima.`, nl: v => `We sturen je Zuno-versie (${v}) en systeem mee zodat het team het sneller vindt.`, pl: v => `Dołączymy wersję Zuno (${v}) i system, by zespół szybciej to znalazł.`, tr: v => `Ekip daha hızlı bulsun diye Zuno sürümünü (${v}) ve sistemini ekleyeceğiz.`, ja: v => `チームが早く見つけられるよう、Zunoのバージョン（${v}）とシステム情報を添えます。` },
    emoji: { es: s => `Sube hasta 50 emojis para todos en ${s}. Escribe`, pt: s => `Envie até 50 emojis para todos em ${s}. Digite`, fr: s => `Envoie jusqu'à 50 emojis pour tout le monde dans ${s}. Tape`, de: s => `Lade bis zu 50 Emojis für alle in ${s} hoch. Tippe`, it: s => `Carica fino a 50 emoji per tutti in ${s}. Scrivi`, nl: s => `Upload tot 50 emoji voor iedereen in ${s}. Typ`, pl: s => `Prześlij do 50 emoji dla wszystkich na ${s}. Wpisz`, tr: s => `${s} içindeki herkes için en fazla 50 emoji yükle. Kullanmak için`, ja: s => `${s}の全員が使える絵文字を最大50個アップロード。入力：` },
    stickers: { es: s => `Sube hasta 30 stickers para ${s}. Se pueden enviar desde el botón de stickers junto a GIF. PNG, GIF, WebP o JPG, hasta 512 KB.`, pt: s => `Envie até 30 figurinhas para ${s}. Dá para mandar pelo botão de figurinhas ao lado do GIF. PNG, GIF, WebP ou JPG, até 512 KB.`, fr: s => `Envoie jusqu'à 30 stickers pour ${s}. Ils s'envoient avec le bouton sticker à côté de GIF. PNG, GIF, WebP ou JPG, jusqu'à 512 Ko.`, de: s => `Lade bis zu 30 Sticker für ${s} hoch. Man sendet sie mit dem Sticker-Knopf neben GIF. PNG, GIF, WebP oder JPG, bis 512 KB.`, it: s => `Carica fino a 30 sticker per ${s}. Si inviano dal pulsante sticker accanto a GIF. PNG, GIF, WebP o JPG, fino a 512 KB.`, nl: s => `Upload tot 30 stickers voor ${s}. Te sturen met de stickerknop naast GIF. PNG, GIF, WebP of JPG, tot 512 KB.`, pl: s => `Prześlij do 30 naklejek dla ${s}. Wysyła się je przyciskiem obok GIF. PNG, GIF, WebP lub JPG, do 512 KB.`, tr: s => `${s} için en fazla 30 çıkartma yükle. GIF'in yanındaki çıkartma düğmesiyle gönderilir. PNG, GIF, WebP veya JPG, en fazla 512 KB.`, ja: s => `${s}のステッカーを最大30個。GIFの横のボタンから送れます。PNG、GIF、WebP、JPG、最大512 KB。` },
    sounds: { es: s => `Sonidos cortos que cualquiera en ${s} puede poner en una llamada (`, pt: s => `Sons curtos que qualquer pessoa em ${s} pode tocar numa chamada (`, fr: s => `Des sons courts que tout le monde dans ${s} peut jouer en appel (`, de: s => `Kurze Sounds, die jeder in ${s} im Anruf abspielen kann (`, it: s => `Suoni brevi che chiunque in ${s} può riprodurre in chiamata (`, nl: s => `Korte geluiden die iedereen in ${s} in een gesprek kan afspelen (`, pl: s => `Krótkie dźwięki, które każdy na ${s} może odtworzyć w rozmowie (`, tr: s => `${s} içindeki herkesin aramada çalabileceği kısa sesler (`, ja: s => `${s}の誰でも通話で鳴らせる短いサウンド（` },
    insights: { es: s => `Cómo le ha ido a ${s} en los últimos 30 días. Horas en tu zona horaria. Los bots no cuentan.`, pt: s => `Como ${s} foi nos últimos 30 dias. Horários no seu fuso. Bots não contam.`, fr: s => `L'activité de ${s} sur les 30 derniers jours. Heures dans ton fuseau. Les bots ne comptent pas.`, de: s => `So lief es für ${s} in den letzten 30 Tagen. Zeiten in deiner Zeitzone. Bots zählen nicht.`, it: s => `Come è andato ${s} negli ultimi 30 giorni. Orari nel tuo fuso. I bot non contano.`, nl: s => `Hoe ${s} het deed in de afgelopen 30 dagen. Tijden in jouw tijdzone. Bots tellen niet mee.`, pl: s => `Jak radził sobie ${s} w ostatnich 30 dniach. Godziny w twojej strefie. Boty się nie liczą.`, tr: s => `${s} son 30 günde nasıldı. Saatler senin saat diliminde. Botlar sayılmaz.`, ja: s => `${s}の過去30日間の様子。時刻はあなたのタイムゾーン。ボットは除外。` },
    roles: { es: n => `${n} roles`, pt: n => `${n} cargos`, fr: n => `${n} rôles`, de: n => `${n} Rollen`, it: n => `${n} ruoli`, nl: n => `${n} rollen`, pl: n => `Role: ${n}`, tr: n => `${n} rol`, ja: n => `ロール${n}個` },
  };
  if (LANG42 !== 'en' && typeof I18N42_PATTERNS === 'object') {
    const l = LANG42;
    // Dates inside these lines were already written in your language (see below), so they pass through.
    I18N42_PATTERNS[l] = [
      [/^(Online|Offline) — (\d+)$/, (m, a, n) => `${T(l, a === 'Online' ? P.online : P.offline)} — ${n}`],
      [/^All friends — (\d+)$/, (m, n) => `${T(l, P.allFriends)} — ${n}`],
      [/^Good (morning|afternoon|evening), (.+)$/, (m, t, n) => `${P.greet[l][t]}, ${n}`],
      [/^([\d,.]+) members$/, (m, n) => T(l, P.members)(n)],
      [/^1 member$/, () => T(l, P.member)],
      [/^([\d,.]+) people$/, (m, n) => T(l, P.people)(n)],
      [/^(🤝 )?Friends since (.+)$/, (m, e, d) => (e || '') + T(l, P.since)(d)],
      [/^([\d,]+) Mutual Servers?$/, (m, n) => T(l, P.mutual)(n)],
      [/^Today at (.+)$/, (m, t) => T(l, P.today)(t)],
      [/^Yesterday at (.+)$/, (m, t) => T(l, P.yesterday)(t)],
      [/^Joined (.+)$/, (m, d) => T(l, P.joined)(d)],
      [/^Profile Widgets (\d+ \/ \d+)$/, (m, n) => `${T(l, P.widgets)} ${n}`],
      [/^(\d+) roles?$/, (m, n) => T(l, P.roles)(n)],
      [/^Message (#.+|@.+|.+)$/, (m, x) => T(l, P.message)(x)],
      [/^(.+) isn't doing anything right now$/, (m, x) => T(l, P.idle)(x)],
      [/^Never expires\. Used (\d+) times?\.$/, (m, n) => T(l, P.used)(n)],
      [/^You have ([\d,.]+) members?\.$/, (m, n) => T(l, P.youHave)(n)],
      [/^(\d+) of 5 confirmed reports\.$/, (m, n) => T(l, P.confirmed)(n)],
      [/^(\d+) more$/, (m, n) => T(l, P.more)(n)],
      [/^We'll include your Zuno version \((.+)\) and system so the team can find it faster\.$/, (m, v) => T(l, P.include)(v)],
      [/^Upload up to 50 emoji for everyone in (.+)\. Type$/, (m, s) => T(l, P.emoji)(s)],
      [/^Upload up to 30 stickers for (.+?)\. (.+)$/, (m, s) => T(l, P.stickers)(s)],
      [/^Short sounds anyone in (.+) can play in a call \($/, (m, s) => T(l, P.sounds)(s)],
      [/^How (.+) has been doing over the last 30 days\. Times are in your time zone\. Bots don't count\.$/, (m, s) => T(l, P.insights)(s)],
    ];
    // Dates and times come out in your language too (when the code didn't ask for a particular one).
    const LOC = { pt: 'pt-BR' }[l] || l;
    for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
      const orig = Date.prototype[fn];
      Date.prototype[fn] = function (locales, opts) { return orig.call(this, locales === undefined ? LOC : locales, opts); };
    }
  }
}

// ======================= the name-style fonts load without holding up the first paint =======================
{
  const l = document.getElementById('namefonts45');
  if (l) l.media = 'all';
}

// ======================= Zuno Official account =======================
// The founder can add the Zuno account to Switch Accounts and use it like any other account: every
// DM Zuno has shows up, and anything sent from it is from Zuno. People can answer a message Zuno
// Official wrote by hand (not the automatic updates).
{
  let composing = false;
  const _renderComposer45 = renderComposer;
  renderComposer = function (...a) { composing = true; try { return _renderComposer45(...a); } finally { composing = false; } };
  const _relationshipWith45 = relationshipWith;
  relationshipWith = function (id) {
    const r = _relationshipWith45(id);
    if (!composing) return r;
    if (state.me?.system && r !== 'self') return 'friend';
    if (r === 'system' && (state.convos[id]?.messages || []).some(m => m.official)) return 'friend';
    return r;
  };
  if (typeof onLive26 === 'function') onLive26('message', d => {
    if (d?.message?.official && d.peerId && activeConv() === d.peerId) setTimeout(() => renderComposer(), 0);
  });
  const _openAccountSwitcher45 = openAccountSwitcher;
  openAccountSwitcher = function (...a) {
    const r = _openAccountSwitcher45(...a);
    if (!state.me?.isFounder || savedAccounts().some(x => x.id === 'zuno') || state.me.system) return r;
    const list = $('#layer .acct-list');
    if (!list) return r;
    list.insertAdjacentHTML('afterend', `<button class="btn btn-grey acct-add acct-official45" type="button"><img src="/logo.png" alt=""> Add Zuno Official</button>
      <p class="muted small acct-official45-note">Read and answer Zuno's DMs as Zuno. You'll confirm your password first.</p>`);
    $('#layer .acct-official45').addEventListener('click', async () => {
      try {
        const { token, account } = await api('POST', '/api/official/session');
        rememberAccount();
        const saved = savedAccounts().filter(x => x.id !== account.id);
        saved.push({ ...account, token });
        lsSet('zuno_accounts', saved.slice(0, MAX_ACCOUNTS + 1));
        await switchTo({ ...account, token });
      } catch (e) { if (e?.message) toast(e.message, true); }
    });
    return r;
  };
}

// ======================= running lighter =======================
// Timers that share a delay share one clock, and short ones rest while Zuno is hidden (not during
// calls, which need every tick).
{
  const nativeSet = window.setInterval.bind(window), nativeClear = window.clearInterval.bind(window), nativeClearT = window.clearTimeout.bind(window);
  const groups = new Map(); // delay -> { handle, jobs: Map(id -> [fn, args]) }
  const byId = new Map();   // id -> delay
  let next = 1e9;
  const resting = d => d <= 2000 && document.hidden && !(typeof Calls === 'object' && Calls?.room);
  window.setInterval = function (fn, delay = 0, ...args) {
    if (typeof fn !== 'function') return nativeSet(fn, delay, ...args);
    const d = Math.max(0, Number(delay) || 0);
    if (d < 100) return nativeSet(fn, d, ...args); // animation-like timers keep their own clock
    let g = groups.get(d);
    if (!g) {
      g = { jobs: new Map() };
      g.handle = nativeSet(() => {
        if (resting(d)) return;
        for (const [id, [f, a]] of [...g.jobs]) { if (!g.jobs.has(id)) continue; try { f(...a); } catch (err) { setTimeout(() => { throw err; }); } }
      }, d);
      groups.set(d, g);
    }
    const id = next++;
    g.jobs.set(id, [fn, args]);
    byId.set(id, d);
    return id;
  };
  const stop = id => {
    const d = byId.get(id);
    if (d === undefined) return false;
    byId.delete(id);
    const g = groups.get(d);
    g?.jobs.delete(id);
    if (g && !g.jobs.size) { nativeClear(g.handle); groups.delete(d); }
    return true;
  };
  window.clearInterval = id => { if (!stop(id)) nativeClear(id); };
  window.clearTimeout = id => { if (!stop(id)) nativeClearT(id); };
}

// While Zuno is hidden, moving things stop (CSS), and muted looping videos (profile backgrounds)
// pause. They also pause when scrolled out of sight.
{
  const sync = () => {
    document.documentElement.classList.toggle('hidden45', document.hidden);
    for (const v of document.querySelectorAll('video[autoplay][muted], video.pc-bg')) {
      if (document.hidden) { if (!v.paused) { v.dataset.rest45 = '1'; v.pause(); } }
      else if (v.dataset.rest45) { delete v.dataset.rest45; v.play().catch(() => {}); }
    }
  };
  document.addEventListener('visibilitychange', sync);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (!e.isIntersecting) { if (!v.paused) { v.dataset.off45 = '1'; v.pause(); } }
      else if (v.dataset.off45 && !document.hidden) { delete v.dataset.off45; v.play().catch(() => {}); }
    }
  }) : null;
  const seen = new WeakSet();
  const watchVideos = root => {
    if (!io || root.nodeType !== 1) return;
    const list = root.matches?.('video') ? [root] : root.querySelectorAll?.('video') || [];
    for (const v of list) if (!seen.has(v) && v.muted && v.loop) { seen.add(v); io.observe(v); }
  };
  // Media in messages that left the screen (another chat opened) lets go of its memory right away.
  const release = node => {
    if (node.nodeType !== 1 || node.isConnected) return;
    const list = node.matches?.('video, audio') ? [node] : node.querySelectorAll?.('video, audio') || [];
    for (const m of list) { if (m.isConnected) continue; try { m.pause(); m.removeAttribute('src'); m.load(); } catch {} io?.unobserve(m); }
  };
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) watchVideos(n);
      if (m.removedNodes.length) queueMicrotask(() => { for (const n of m.removedNodes) release(n); });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ======================= calls: tiles always fit the screen =======================
// Like Discord: everyone's tile is as big as it can be while all of them fit in the space there is
// (next to the voice channel's chat too), instead of a fixed width that stacked them off screen.
{
  const GAP = 12;
  const best = (n, W, H, ratio) => {
    let top = 0;
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const w = Math.min((W - GAP * (c - 1)) / c, ((H - GAP * (rows - 1)) / rows) * ratio);
      if (w > top) top = w;
    }
    return Math.max(110, Math.floor(top));
  };
  const fit = grid => {
    if (!grid.isConnected) return;
    const tiles = [...grid.children].filter(t => t.classList.contains('tile') && t.offsetParent !== null);
    // (0.47) Only touch the class when it changes: adding a class that's already there still counts as
    // a change for the watcher below, which ran this again every frame (constant work in every call,
    // and jittery game panels on iPads).
    if (grid.classList.contains('has-focus') || !tiles.length) { if (grid.classList.contains('fit45')) grid.classList.remove('fit45'); return; }
    const host = grid.closest('#call-slot, .voice-stage, .call-panel') || grid.parentElement;
    const hs = getComputedStyle(host);
    const padY = parseFloat(hs.paddingTop) + parseFloat(hs.paddingBottom);
    // Room left for the tiles: the host's height minus everything else in it (timer, buttons).
    let other = 0;
    for (const el of host.children) if (el !== grid && !el.contains(grid) && el.offsetParent !== null && getComputedStyle(el).position !== 'absolute') other += el.offsetHeight + 8;
    const W = grid.clientWidth;
    const H = Math.max(140, host.clientHeight - padY - other - 8);
    const ratio = 16 / 10;
    const w = best(tiles.length, W, H, ratio);
    if (!grid.classList.contains('fit45')) grid.classList.add('fit45');
    if (grid.style.getPropertyValue('--fit45-w') !== w + 'px') grid.style.setProperty('--fit45-w', w + 'px');
  };
  const watched = new WeakSet();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(entries => { for (const e of entries) for (const g of e.target.querySelectorAll?.('.call-tiles') || []) fit(g); }) : null;
  const scan = () => {
    for (const g of document.querySelectorAll('.call-tiles')) {
      fit(g);
      const host = g.closest('#call-slot, .voice-stage, .call-panel') || g.parentElement;
      if (ro && host && !watched.has(host)) { watched.add(host); ro.observe(host); }
    }
  };
  let queued = false;
  new MutationObserver(muts => {
    if (queued) return;
    if (!muts.some(m => (m.target.closest?.('.call-tiles, #call-slot, .voice-stage')) || [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.call-tiles, .tile, #call-slot *') || n.querySelector?.('.call-tiles'))))) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => requestAnimationFrame(scan));
}

// ======================= games: closing one is a vote =======================
// While a game is going and others are in the call, ✕ asks everyone. More than half have to say
// yes; the panel shows who voted yes and who voted no.
{
  const names = ids => ids.map(id => `<span class="gv45-who">${avatar(user(id) || { id, displayName: '?' }, 18)}<b>${esc(user(id)?.displayName || 'Someone')}</b></span>`).join('') || '<span class="muted small">Nobody yet</span>';
  const voteHtml = v => {
    const mine = v.yes.includes(state.me.id) ? 'yes' : v.no.includes(state.me.id) ? 'no' : '';
    const left = Math.max(0, Math.ceil((v.endsAt - Date.now()) / 1000));
    return `<div class="gv45" data-gv45>
      <div class="gv45-top"><b>Close the game?</b><span class="muted small">${esc(user(v.by)?.displayName || 'Someone')} asked · ${v.yes.length}/${v.need} yes needed · <span data-gv45-left>${left}</span>s</span></div>
      <div class="gv45-btns"><button class="btn btn-sm ${mine === 'yes' ? 'btn-red' : 'btn-grey'}" data-gv45-vote="1">Yes, close it</button><button class="btn btn-sm ${mine === 'no' ? 'btn-primary' : 'btn-grey'}" data-gv45-vote="0">No, keep playing</button></div>
      <div class="gv45-lists"><div><span class="gv45-label yes">Yes · ${v.yes.length}</span>${names(v.yes)}</div><div><span class="gv45-label no">No · ${v.no.length}</span>${names(v.no)}</div></div>
    </div>`;
  };
  let tick = 0;
  const _showGamePanel45 = showGamePanel;
  showGamePanel = function (...a) {
    const r = _showGamePanel45(...a);
    const panel = $('#game-panel'), v = game?.closeVote;
    if (panel && v && !game.over) {
      $('.gp-body', panel)?.insertAdjacentHTML('afterbegin', voteHtml(v));
      clearInterval(tick);
      tick = setInterval(() => { const el = $('[data-gv45-left]'); if (!el || !game?.closeVote) return clearInterval(tick); el.textContent = Math.max(0, Math.ceil((game.closeVote.endsAt - Date.now()) / 1000)); }, 1000);
    }
    return r;
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest('#game-panel [data-gv45-vote]');
    if (!b) return;
    try { await api('POST', '/api/games/close-vote', { room: gameRoom, yes: b.dataset.gv45Vote === '1' }); } catch (err) { toast(err.message, true); }
  });
  // ✕ on a game that's still going starts the vote (or votes yes) instead of asking "End the game?".
  document.addEventListener('click', async e => {
    const b = e.target.closest('#game-panel [data-gp=stop]');
    if (!b || !game || game.over) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const room = gameRoom;
    try {
      const r = await api('POST', '/api/games/stop', { room });
      if (!r.vote) { game = null; clearInterval(gameTick); $('#game-panel')?.remove(); }
      else toast('Asked everyone in the call to close the game.');
    } catch (err) { toast(err.message, true); }
  }, true);
  onLive26('game-vote', d => {
    if (d.room !== Calls.room) return;
    const who = ids => ids.map(id => user(id)?.displayName || 'Someone').join(', ');
    if (d.result === 'closed') toast(`The game was closed by vote (yes: ${who(d.yes)}${d.no.length ? `; no: ${who(d.no)}` : ''}).`);
    if (d.result === 'kept') toast(`The game keeps going${d.no.length ? ` (no: ${who(d.no)})` : ''}.`);
    if (d.result === 'expired') toast('The vote to close the game ran out of time.');
  });
}

// ======================= looks: soft change between pages =======================
{
  // (0.50) Played with the Web Animations API: the old way (class off, read offsetWidth, class on)
  // made the browser measure the whole page on every chat switch.
  const pulse = el => {
    if (!el?.animate || (typeof motionOff === 'function' && motionOff())) return;
    // The parts inside it, not the box itself (on phones the box slides with your finger).
    for (const c of el.querySelectorAll(':scope > :not(.topbar):not(#call-slot)')) {
      c._in45?.cancel();
      c._in45 = c.animate([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  };
  for (const name of ['openChannel', 'openDM', 'openGroup', 'showFriends']) {
    if (typeof window[name] !== 'function') continue;
    const orig = window[name];
    window[name] = function (...a) { const r = orig.apply(this, a); requestAnimationFrame(() => pulse($('#main'))); return r; };
  }
  if (typeof showSettingsSection === 'function') {
    const _sss45 = showSettingsSection;
    showSettingsSection = function (...a) { const r = _sss45.apply(this, a); requestAnimationFrame(() => pulse($('.settings-main'))); return r; };
  }
}

// ======================= messages that couldn't be sent =======================
// They stay in the chat with "Couldn't send · Retry · Delete", and go out by themselves when the
// connection comes back.
{
  const bar = '<div class="sf45"><span>Couldn\'t send.</span><button type="button" data-sf45="retry">Retry</button><button type="button" data-sf45="drop">Delete</button></div>';
  const _renderMessages45 = renderMessages;
  renderMessages = function (...a) {
    const r = _renderMessages45.apply(this, a);
    const convo = state.convos[activeConv()];
    for (const m of convo?.messages || []) {
      if (!m.failed) continue;
      const el = document.querySelector(`#messages .msg[data-id="${CSS.escape(m.id)}"]`);
      if (el && !el.querySelector('.sf45')) { el.classList.add('failed45'); el.insertAdjacentHTML('beforeend', bar); }
    }
    return r;
  };
  const retry = (conv, m) => {
    const convo = state.convos[conv];
    if (!convo) return;
    convo.messages = convo.messages.filter(x => x !== m);
    sendMessage(conv, m.retry.text, { attachments: m.retry.attachments || [], gif: m.retry.gif || null });
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('#messages [data-sf45]');
    if (!b) return;
    const conv = activeConv(), convo = state.convos[conv];
    const m = convo?.messages.find(x => x.id === b.closest('.msg')?.dataset.id);
    if (!m) return;
    if (b.dataset.sf45 === 'retry') retry(conv, m);
    else { convo.messages = convo.messages.filter(x => x !== m); renderMessages(true); }
  });
  const retryAll = () => {
    for (const [conv, convo] of Object.entries(state.convos || {})) for (const m of [...(convo.messages || [])]) if (m.failed) retry(conv, m);
  };
  addEventListener('online', () => setTimeout(retryAll, 1500));
  window.retryFailed45 = retryAll;
}

// ======================= 0.45.1 =======================
// The in-game overlay only shows while the PC app sees a game running (zuno27.js checks this).
if (window.zunoDesktop?.onActivity) window.zunoDesktop.onActivity(a => {
  const list = a?.list || (a ? [a] : []);
  window.zunoGame45 = list.some(x => x && x.type === 'playing');
});

// @mentions of people who aren't in this server show as plain text (they were never pinged).
{
  const _formatMessage451 = formatMessage;
  formatMessage = function (text, ...rest) {
    const html = _formatMessage451.call(this, text, ...rest);
    if (state.view?.type !== 'channel' || !html.includes('data-profile')) return html;
    const ids = state.serverMembers?.[state.currentServerId];
    if (!ids?.length) return html;
    const here = new Set(ids);
    return html.replace(/<span class="mention(?: me)?" data-profile="([^"]+)">@[^<]*<\/span>/g, (all, id) => (here.has(id) ? all : '@' + esc(user(id)?.username || '')));
  };
}

// Roles you can ping show up in the @ suggestions (with the role's color), after @everyone and @here.
// A role can be pinged when "Let anyone @mention this role" is on in its settings, or by people with
// the Mention @everyone permission.
{
  const base = AT_SPECIALS.filter(s => s.special === 'everyone' || s.special === 'here');
  document.addEventListener('input', e => {
    if (!e.target.matches?.('#composer-input, textarea')) return;
    const sv = state.view?.type === 'channel' && typeof currentServer === 'function' ? currentServer() : null;
    const big = sv && (typeof hasPerm === 'function' && (hasPerm(sv, 'mention_everyone') || sv.ownerId === state.me?.id));
    const roles = sv ? (sv.roles || []).filter(r => !r.everyone && !r.managed && (r.mentionable || big)).slice(0, 40)
      .map(r => ({ special: r.name.toLowerCase(), desc: r.mentionable ? 'Notify everyone with this role' : 'Notify everyone with this role (only you can ping it)', role45: r.color || '#9aa6a4' })) : [];
    AT_SPECIALS.splice(0, AT_SPECIALS.length, ...(big ? base : base), ...roles);
  }, true);
}

// Animated profile pictures (GIF / WebP) stand still, and only move while you hover over their
// message or name, while they're talking in a call, or on their profile. A hidden animation costs
// nothing, so busy chats get lighter too.
{
  const ANIM = /\.(gif|webp)(\?|#|$)/i;
  const stills = new Map(); // url -> Promise<dataURL | null>
  const still = url => {
    if (!stills.has(url)) stills.set(url, new Promise(ok => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const n = Math.min(256, img.naturalWidth || 128);
          c.width = n; c.height = Math.round(n * (img.naturalHeight || n) / (img.naturalWidth || n));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/png'));
        } catch { ok(null); }
      };
      img.onerror = () => ok(null);
      // Cloud pictures are read through Zuno (?direct=1), or the first frame can't be copied.
      img.src = /^\/uploads\//.test(url) ? url + (url.includes('?') ? '&' : '?') + 'direct=1' : url;
    }));
    return stills.get(url);
  };
  // Always moving on profile cards and full profiles.
  const ALWAYS = '.pcard, .pf43-side, .pf43, .profile-full, #profile-panel .pcard';
  const prep = img => {
    // (0.45.2) Only the picture itself: decorations (img.cdeco) have their own still frames.
    if (img.dataset.anim45 || img.matches('.cdeco, .still45, .twemoji') || !ANIM.test(img.getAttribute('src') || '') || img.closest(ALWAYS)) return;
    img.dataset.anim45 = '1';
    const url = img.getAttribute('src');
    still(url).then(src => {
      if (!src || !img.isConnected || img.previousElementSibling?.classList.contains('still45')) return;
      const s = document.createElement('img');
      s.className = 'still45'; s.alt = ''; s.src = src; s.draggable = false;
      img.before(s);
      img.classList.add('anim45');
    });
  };
  const scan = root => { if (root.nodeType !== 1) return; if (root.matches?.('.avatar img')) prep(root); for (const img of root.querySelectorAll?.('.avatar > img:not([data-anim45])') || []) prep(img); };
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) scan(n); }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

// Voice & Video: noise suppression has levels (Off / Standard / Strong) and the mic has an input
// sensitivity, like Discord. Strong and a manual sensitivity use a voice gate (see calls.js).
{
  const set = change => { try { localStorage.setItem('zuno_voice_settings', JSON.stringify({ ...Calls.voiceSettings(), ...change })); } catch {} };
  const _renderVoiceSettings45 = renderVoiceSettings;
  renderVoiceSettings = async function (body, ...a) {
    const r = await _renderVoiceSettings45.call(this, body, ...a);
    if (!body?.isConnected || $('.ns45', body)) return r;
    const v = Calls.voiceSettings();
    const level = !v.noiseSuppression ? 'off' : v.noiseLevel === 'strong' ? 'strong' : 'standard';
    const row = $('[data-vs="noiseSuppression"]', body)?.closest('.setting-row');
    if (row) {
      row.outerHTML = `<div class="setting-row ns45"><div><div class="setting-title">Noise suppression</div><div class="setting-desc">Standard filters out background noise like keyboards, fans and traffic. Strong also cuts your mic between words, so quiet noise never gets through.</div></div>
        <div class="seg45" role="radiogroup">${[['off', 'Off'], ['standard', 'Standard'], ['strong', 'Strong']].map(([k, t]) => `<button type="button" role="radio" aria-checked="${k === level}" class="${k === level ? 'on' : ''}" data-ns45="${k}">${t}</button>`).join('')}</div></div>`;
      $$('[data-ns45]', body).forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.ns45;
        set({ noiseSuppression: k !== 'off', noiseLevel: k === 'off' ? 'standard' : k });
        $$('[data-ns45]', body).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
        Calls.refreshMic();
      }));
    }
    const modeGroup = $('.input-mode', body)?.closest('.setting-group');
    if (modeGroup) {
      modeGroup.insertAdjacentHTML('afterend', `<div class="setting-group sens45${v.inputMode === 'ptt' ? ' hidden' : ''}"><h4 class="setting-head">Input sensitivity</h4>
        <label class="setting-row"><div><div class="setting-title">Automatically decide</div><div class="setting-desc">Zuno decides when you're talking. Turn it off to set the level yourself.</div></div><input type="checkbox" class="switch" data-sens45-auto${v.sensAuto ? ' checked' : ''}></label>
        <div class="sens45-bar${v.sensAuto ? ' auto' : ''}"><div class="sens45-meter"><i data-sens45-level></i><b data-sens45-mark></b></div>
        <input type="range" min="0" max="100" value="${Number(v.sens) || 40}" data-sens45${v.sensAuto ? ' disabled' : ''} aria-label="Input sensitivity"></div>
        <p class="muted small">Your mic only sends when the bar passes the line. Join a call (or press Let's Check) to see it move.</p></div>`);
      const g = $('.sens45', body), slider = $('[data-sens45]', g), mark = $('[data-sens45-mark]', g), lvl = $('[data-sens45-level]', g);
      const place = () => { mark.style.left = slider.value + '%'; };
      place();
      $('[data-sens45-auto]', g).addEventListener('change', e => { set({ sensAuto: e.target.checked }); slider.disabled = e.target.checked; g.querySelector('.sens45-bar').classList.toggle('auto', e.target.checked); });
      slider.addEventListener('input', () => { set({ sens: Number(slider.value) }); place(); });
      $$('[name=vs-mode]', body).forEach(rd => rd.addEventListener('change', () => g.classList.toggle('hidden', rd.value === 'ptt')));
      // Live level: from the call if you're in one, otherwise from Let's Check's own meter.
      const t = setInterval(() => {
        if (!g.isConnected) return clearInterval(t);
        let pct = 0;
        if (Calls.room) pct = Math.min(100, ((Calls.micLevel || 0) - 1.5) / 0.35);
        else { const w = parseFloat($('#vs-level', body)?.style.width || '0'); pct = w; }
        lvl.style.width = Math.max(0, pct) + '%';
        lvl.classList.toggle('over', pct > Number(slider.value));
      }, 100);
    }
    return r;
  };
}

// Forwarding, like Discord: a preview of what you're forwarding, pick up to 5 places (recent chats
// first, then groups and channels), one Send button. Forwarded messages say where they're from and
// can jump to the original.
{
  const MAX = 5;
  forwardHtml = function (m) {
    const f = m.forward;
    const media = typeof _mediaHtmlC === 'function' ? _mediaHtmlC({ gif: f.gif, attachments: f.attachments }) : '';
    const jump = f.from && f.fromId ? `<button type="button" class="fwd45-jump" data-fwd45="${esc(f.from)}" data-fwd45-id="${esc(f.fromId)}">Jump to original ›</button>` : '';
    return `<div class="fwd fwd45"><div class="fwd-h"><span class="fwd45-ico">${uiIcon('forward')}</span><i>Forwarded</i></div>
      <div class="fwd45-who">${avatar(user(f.authorId) || { id: f.authorId, displayName: f.authorName }, 18)}<b>${esc(f.authorName)}</b></div>
      ${f.content ? `<div class="content fwd-body">${formatMessage(f.content)}</div>` : ''}${f.poll ? `<div class="fwd-body muted">📊 ${esc(f.poll.question)}</div>` : ''}${media}
      <div class="fwd-time">${f.where ? `${esc(f.where)} · ` : ''}${fmtTime(f.createdAt)}${jump ? ' · ' + jump : ''}</div></div>`;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fwd45]');
    if (!b) return;
    e.preventDefault();
    jumpToSaved({ conv: b.dataset.fwd45, msgId: b.dataset.fwd45Id });
  });
  openForward = function (fromConv, id) {
    const m = state.convos[fromConv]?.messages.find(x => x.id === id);
    const recent = [...state.dms].sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const targets = [];
    for (const d of recent) { const u = user(d.userId); if (u && !u.system && !u.bot && (isFriend(u.id) || !d.pending)) targets.push({ conv: u.id, label: u.displayName, sub: '@' + u.username, av: avatar(u, 32), group: 'Direct messages' }); }
    for (const g of state.groups) targets.push({ conv: 'g:' + g.id, label: groupTitle(g), sub: `${g.members.length} members`, av: groupIcon(g, 32), group: 'Group chats' });
    for (const sv of state.servers) for (const c of sv.channels) if (c.type === 'text' && (c.perms || []).includes('send_messages')) targets.push({ conv: 'ch:' + c.id, label: '#' + c.name, sub: sv.name, av: sv.icon ? `<img class="fw45-sv" src="${esc(sv.icon)}" alt="">` : `<span class="fw-sv fw45-sv" style="--sv:${esc(sv.iconColor || 'var(--brand)')}">${esc([...sv.name][0] || '?')}</span>`, group: 'Channels' });
    const picked = new Set();
    const who = m ? user(m.authorId) : null;
    const preview = m ? `<div class="fw45-prev">${avatar(who || { id: m.authorId, displayName: '?' }, 24)}<div><b>${esc(who?.displayName || 'Someone')}</b><div class="fw45-prev-text">${m.content ? esc(m.content.slice(0, 220)) : m.attachments?.length ? `📎 ${m.attachments.length} file${m.attachments.length === 1 ? '' : 's'}` : m.gif ? 'GIF' : m.poll ? '📊 Poll' : ''}</div></div></div>` : '';
    const ov = openLayer(`<div class="dialog modal forward-dialog fw45"><h3>Forward to</h3><p class="muted small" style="margin:-4px 0 10px">Pick up to ${MAX} places.</p>
      <input class="qs-input fp-input" placeholder="Search" autocomplete="off"><div class="fp-list fw45-list"></div>
      ${preview}
      <input class="fw45-note" id="fw-note" maxlength="2000" placeholder="Add an optional message…">
      <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="send" disabled>Send</button></div></div>`);
    const send = $('[data-a=send]', ov);
    const sync = () => { send.disabled = !picked.size; send.textContent = picked.size > 1 ? `Send (${picked.size})` : 'Send'; };
    const draw = q => {
      const list = targets.filter(t => !q || t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q));
      let html = '', last = '';
      for (const t of list.slice(0, 80)) {
        if (t.group !== last) { html += `<div class="fw45-head">${esc(t.group)}</div>`; last = t.group; }
        html += `<label class="fw45-row${picked.has(t.conv) ? ' on' : ''}">${t.av}<div class="fp-who"><b>${esc(t.label)}</b><small>${esc(t.sub)}</small></div><input type="checkbox" data-to="${esc(t.conv)}"${picked.has(t.conv) ? ' checked' : ''}></label>`;
      }
      $('.fw45-list', ov).innerHTML = html || '<div class="fp-empty">Nowhere matches that.</div>';
      $$('[data-to]', ov).forEach(b => b.addEventListener('change', () => {
        if (b.checked && picked.size >= MAX) { b.checked = false; return toast(`You can forward to ${MAX} places at once.`, true); }
        b.checked ? picked.add(b.dataset.to) : picked.delete(b.dataset.to);
        b.closest('.fw45-row').classList.toggle('on', b.checked);
        sync();
      }));
    };
    $('.fp-input', ov).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
    $('[data-a=cancel]', ov).addEventListener('click', dismissLayer);
    send.addEventListener('click', async () => {
      send.disabled = true;
      const note = $('#fw-note', ov).value.trim();
      let ok = 0;
      for (const to of picked) {
        try { await api('POST', `${convBase(to)}/messages`, { content: note, forward: { conv: fromConv, id } }); ok++; }
        catch (err) { toast(err.message, true); }
      }
      if (ok) { closeLayer(); toast(ok === 1 ? 'Forwarded!' : `Forwarded to ${ok} places!`); } else sync();
    });
    draw('');
    $('.fp-input', ov).focus();
  };
}

// A time that shows in everyone's own time zone (<t:…>), picked from a calendar instead of typed.
{
  const FMT = [['f', 'Date and time'], ['F', 'Day, date and time'], ['t', 'Time'], ['d', 'Short date'], ['D', 'Long date'], ['R', 'Relative (in 2 hours)']];
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function openTimePicker() {
    const start = new Date(Date.now() + 3600e3); start.setMinutes(0, 0, 0);
    const ov = openLayer(`<form class="dialog modal tp45"><h3>Insert a time</h3><p class="muted small" style="margin:-4px 0 12px">Everyone sees it in their own time zone.</p>
      <label class="field">When<input type="datetime-local" name="when" value="${local(start)}" required></label>
      <label class="field">Show it as<select class="sc-select" name="fmt">${FMT.map(([k, t]) => `<option value="${k}"${k === 'f' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="tp45-prev"><span class="muted small">Looks like</span><b data-tp45-prev></b></div>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary">Insert</button></div></form>`);
    const f = $('form', ov) || ov.querySelector('.tp45');
    const stamp = () => Math.round(new Date(f.when.value).getTime() / 1000);
    const prev = () => { const s = stamp(); $('[data-tp45-prev]', f).innerHTML = isNaN(s) ? '' : fmtStamp(s * 1000, f.fmt.value); };
    f.addEventListener('input', prev); prev();
    $('[data-a=cancel]', f).addEventListener('click', dismissLayer);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const s = stamp();
      if (isNaN(s)) return;
      closeLayer();
      const ta = $('#composer-input');
      if (!ta) return;
      const text = `<t:${s}:${f.fmt.value}> `;
      const at = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, at) + text + ta.value.slice(ta.selectionEnd ?? at);
      ta.focus(); ta.setSelectionRange(at + text.length, at + text.length);
      ta.dispatchEvent(new Event('input'));
    });
  }
  window.openTimePicker45 = openTimePicker;
  const _composerMoreMenu45 = composerMoreMenu;
  composerMoreMenu = function (anchor) {
    const real = openMenu;
    openMenu = (a, items, ...rest) => { openMenu = real; return real(a, [...items, { label: 'Insert a Time', desc: 'Shows in everyone\'s time zone', icon: '<span class="mi-ico">🕓</span>', run: openTimePicker }], ...rest); };
    try { return _composerMoreMenu45(anchor); } finally { openMenu = real; }
  };
  const _renderComposer45t = renderComposer;
  renderComposer = function (...a) {
    const r = _renderComposer45t.apply(this, a);
    const sched = $('#composer-sched');
    if (sched && !$('#composer-time45')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'composer-time45'; b.className = sched.className; b.title = 'Insert a time (shows in everyone\'s time zone)';
      b.innerHTML = uiIcon('calendar');
      sched.before(b);
      b.addEventListener('click', openTimePicker);
    }
    return r;
  };
}

// Replying without pinging: the reply bar has an "@ On / Off" switch, like Discord.
{
  const _renderComposerExtras45 = renderComposerExtras;
  renderComposerExtras = function (...a) {
    const r = _renderComposerExtras45.apply(this, a);
    const bar = $('#composer-extras .reply-bar');
    const rep = state.replyTo;
    if (bar && rep && !$('.rp45', bar) && rep.authorId !== state.me.id) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rp45' + (rep.noPing ? '' : ' on');
      b.title = rep.noPing ? `${user(rep.authorId)?.displayName || 'They'} won't be pinged. Click to ping them.` : `${user(rep.authorId)?.displayName || 'They'} will be pinged. Click to reply quietly.`;
      b.innerHTML = `@ ${rep.noPing ? 'Off' : 'On'}`;
      b.addEventListener('click', () => { rep.noPing = !rep.noPing; renderComposerExtras(); $('#composer-input')?.focus(); });
      $('.rb-x', bar)?.before(b);
    }
    return r;
  };
}

// Mod View: right-click a member (if you can moderate) for one panel with everything about them.
{
  const MODP = ['kick_members', 'ban_members', 'manage_messages', 'timeout_members', 'moderate_members'];
  const canMod = sv => sv && (sv.ownerId === state.me.id || MODP.some(p => { try { return hasPerm(sv, p); } catch { return false; } }));
  const ago = ms => { const d = Math.floor((Date.now() - ms) / 864e5); return d < 1 ? 'today' : d === 1 ? '1 day ago' : d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`; };
  async function openModView(sv, uid) {
    let d;
    try { d = await api('GET', `/api/servers/${sv.id}/modview/${uid}`); } catch (e) { return toast(e.message, true); }
    const u = d.user;
    const fresh = Date.now() - d.createdAt < 7 * 864e5;
    const ov = openLayer(`<div class="dialog modal mv45"><div class="mv45-head">${avatar(u, 56)}<div><h3>${esc(u.displayName)}</h3><span class="muted">@${esc(u.username)}${d.owner ? ' · Server owner' : ''}</span></div><button class="icon-btn" data-a="close" aria-label="Close">${ICON.x}</button></div>
      <div class="mv45-facts">
        <div><span>Joined this server</span><b>${d.joinedAt ? `${fmtDay(d.joinedAt)} <small>(${ago(d.joinedAt)})</small>` : 'Unknown'}</b></div>
        <div><span>Account made</span><b class="${fresh ? 'warn' : ''}">${fmtDay(d.createdAt)} <small>(${ago(d.createdAt)})</small></b></div>
        <div><span>Messages here</span><b>${d.messageCount.toLocaleString()}</b></div>
        <div><span>Timeout</span><b class="${d.timedOutUntil ? 'warn' : ''}">${d.timedOutUntil ? `Until ${fmtTime(d.timedOutUntil)}` : 'None'}</b></div>
      </div>
      <div class="mv45-sec"><h4>Roles</h4><div class="mv45-roles">${d.roles.map(r => `<span class="mv45-role" style="--rc:${esc(r.color || '#9aa6a4')}">${esc(r.name)}</span>`).join('') || '<span class="muted small">No roles</span>'}</div></div>
      <div class="mv45-sec"><h4>Mod history</h4>${d.history.length ? `<div class="mv45-list">${d.history.map(h => `<div class="mv45-row"><b>${esc((typeof AUDIT_LABELS === 'object' && AUDIT_LABELS[h.action]) || h.action.replace(/_/g, ' '))}</b><span class="muted small">by ${esc(h.byName)} · ${fmtTime(h.at)}${h.detail ? ` · ${esc(h.detail)}` : ''}</span></div>`).join('')}</div>` : '<p class="muted small">Nothing yet. Clean record.</p>'}</div>
      <div class="mv45-sec"><h4>Latest messages</h4>${d.messages.length ? `<div class="mv45-list">${d.messages.map(m => `<button class="mv45-msg" data-mv45-go="${esc(m.channelId)}" data-mv45-id="${esc(m.id)}"><span class="muted small">#${esc(m.channel)} · ${fmtTime(m.createdAt)}</span><span>${esc(m.content)}</span></button>`).join('')}</div>` : '<p class="muted small">No messages in channels you can see.</p>'}</div>
      ${d.warnings?.length ? `<div class="mv45-sec"><h4>Warnings <small class="muted">(from Warden)</small></h4><div class="mv45-list">${d.warnings.map(w => `<div class="mv45-row"><span>${esc(w.reason || 'No reason')}</span><span class="muted small">${esc(w.byName)} · ${fmtTime(w.at)}</span></div>`).join('')}</div></div>` : ''}
      <div class="mv45-sec"><h4>Mod notes <small class="muted">(only moderators see these)</small></h4><div class="mv45-list" data-mv45-notes>${d.notes.map(n => `<div class="mv45-row"><span>${esc(n.text)}</span><span class="muted small">${esc(n.byName)} · ${fmtTime(n.at)}${n.by === state.me.id || sv.ownerId === state.me.id ? ` · <button class="btn-link mv45-del" data-mv45-del="${esc(n.id)}">Delete</button>` : ''}</span></div>`).join('') || '<p class="muted small">No notes yet.</p>'}</div>
        <form class="mv45-add"><input maxlength="500" placeholder="Add a note for the other moderators…"><button class="btn btn-primary btn-sm">Add</button></form></div>
    </div>`);
    $('[data-a=close]', ov).addEventListener('click', dismissLayer);
    $$('[data-mv45-go]', ov).forEach(b => b.addEventListener('click', () => { closeLayer(); jumpToSaved({ conv: 'ch:' + b.dataset.mv45Go, msgId: b.dataset.mv45Id }); }));
    $('.mv45-add', ov).addEventListener('submit', async e => {
      e.preventDefault();
      const inp = $('input', e.target);
      try { await api('POST', `/api/servers/${sv.id}/modview/${uid}/notes`, { text: inp.value }); openModView(sv, uid); } catch (err) { toast(err.message, true); }
    });
    $$('[data-mv45-del]', ov).forEach(b => b.addEventListener('click', async () => {
      try { await api('DELETE', `/api/servers/${sv.id}/modview/${uid}/notes/${b.dataset.mv45Del}`); openModView(sv, uid); } catch (err) { toast(err.message, true); }
    }));
  }
  window.openModView45 = openModView;
  const _openMemberMenu45 = openMemberMenu;
  openMemberMenu = function (sv, id, anchor, ...rest) {
    const s = (typeof svById === 'function' && svById(sv?.id)) || sv;
    if (!canMod(s) || id === state.me.id) return _openMemberMenu45.call(this, sv, id, anchor, ...rest);
    const real = openMenu;
    openMenu = (a, items, ...r) => { openMenu = real; return real(a, [{ label: 'Mod View', icon: uiIcon('shield'), desc: 'Their history, messages and notes', run: () => openModView(s, id) }, 'sep', ...items], ...r); };
    try { return _openMemberMenu45.call(this, sv, id, anchor, ...rest); } finally { openMenu = real; }
  };
}

// Server profiles, like Discord: a banner picture just for this server, and profile cards that say
// which one you're looking at, with a switch to see the person's main profile too.
{
  const mainFor = new Set(); // people whose main profile you switched to
  const _profileCard45 = profileCard;
  profileCard = function (u, opts) {
    const sv = typeof svNow === 'function' ? svNow() : null;
    const p = u && sv ? serverProfile(sv, u.id) : null;
    if (!p) return _profileCard45(u, opts);
    if (mainFor.has(u.id)) {
      // Drawn with their server profile set aside for a moment, so even the picture is the main one.
      const keep = sv.memberProfiles[u.id];
      delete sv.memberProfiles[u.id];
      let html;
      try { html = _profileCard45(u, opts); } finally { sv.memberProfiles[u.id] = keep; }
      return html.replace('<div class="pc-uname">', `<button type="button" class="pc-svprof sp45" data-sp45="${esc(u.id)}" title="Show their profile for this server">Main profile · <b>Show ${esc(sv.name)} profile</b></button><div class="pc-uname">`);
    }
    const html = _profileCard45(p.banner ? { ...u, profileBanner: p.banner } : u, opts);
    return html.replace(/<div class="pc-svprof"[^>]*>[^<]*<\/div>/, `<button type="button" class="pc-svprof sp45" data-sp45="${esc(u.id)}" title="Show their main profile">${esc(sv.name)} profile · <b>Show main profile</b></button>`);
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sp45]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.sp45;
    mainFor.has(id) ? mainFor.delete(id) : mainFor.add(id);
    // Draw the card again where it is.
    if (typeof openProfile === 'function' && b.closest('#layer')) openProfile(id);
    else if (typeof renderProfilePanel === 'function') renderProfilePanel();
  }, true);
  // The server profile window gets a banner picture.
  const _openServerProfile45 = openServerProfile;
  openServerProfile = function (sv) {
    const r = _openServerProfile45(sv);
    const form = $('#layer .sp-dialog');
    if (!form || $('.sp45-banner', form)) return r;
    const p = serverProfile(sv, state.me.id) || {};
    form.querySelector('.sp-bc')?.closest('.field')?.insertAdjacentHTML('beforebegin', `<div class="field sp45-banner">Server banner <span class="hint">(a picture across the top of your profile here; GIFs move)</span>
      <div class="sp45-prev" style="${p.banner?.url ? `background-image:url('${esc(p.banner.url)}')` : ''}">${p.banner?.url ? '' : '<span class="muted small">Uses your main banner</span>'}</div>
      <div class="row-btns"><button type="button" class="btn btn-grey btn-sm" data-sp45-up>Upload Banner</button>${p.banner ? '<button type="button" class="btn btn-link btn-sm" data-sp45-rm>Use main banner</button>' : ''}</div>
      <input type="file" class="hidden" data-sp45-file accept="image/png,image/jpeg,image/webp,image/gif"></div>`);
    const box = $('.sp45-banner', form);
    $('[data-sp45-up]', box).addEventListener('click', () => $('[data-sp45-file]', box).click());
    $('[data-sp45-file]', box).addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const prev = $('.sp45-prev', box);
      prev.innerHTML = '<span class="muted small">Uploading…</span>';
      try {
        const res = await fetch(`/api/servers/${sv.id}/my-profile/banner`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': file.type }, body: file });
        const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Upload failed.');
        prev.style.backgroundImage = `url('${d.profile.banner.url}')`; prev.innerHTML = '';
        sv.memberProfiles = { ...(sv.memberProfiles || {}), [state.me.id]: d.profile };
        toast('Server banner saved');
      } catch (err) { prev.innerHTML = ''; toast(err.message, true); }
    });
    $('[data-sp45-rm]', box)?.addEventListener('click', async () => {
      try { await api('PUT', `/api/servers/${sv.id}/my-profile`, { banner: null }); $('.sp45-prev', box).style.backgroundImage = ''; $('.sp45-prev', box).innerHTML = '<span class="muted small">Uses your main banner</span>'; toast('Back to your main banner'); refresh({ serverId: sv.id }); } catch (err) { toast(err.message, true); }
    });
    return r;
  };
}

// ======================= 0.45.1.1 =======================
// A name only looks like a ping if the message really pinged them. The server works out who was
// pinged (only people who can see the chat) and saves it on the message, so this goes by that.
{
  const fix = () => {
    const convo = state.convos?.[activeConv()];
    if (!convo?.messages?.length) return;
    const byId = new Map(convo.messages.map(m => [m.id, m]));
    for (const el of document.querySelectorAll('#messages .msg[data-id] .mention[data-profile]:not([data-ok45])')) {
      const m = byId.get(el.closest('.msg').dataset.id);
      if (!m || m.pending || m.failed) { el.dataset.ok45 = '1'; continue; }
      if (el.closest('.fwd, .reply-ref')) { el.dataset.ok45 = '1'; continue; } // quotes keep their look
      const id = el.dataset.profile;
      if ((m.mentions || []).includes(id) || (m.replyTo?.authorId === id && !m.replyTo.noPing)) { el.dataset.ok45 = '1'; continue; }
      el.replaceWith(document.createTextNode('@' + (user(id)?.username || el.textContent.replace(/^@/, ''))));
    }
  };
  const _renderMessages4511 = renderMessages;
  renderMessages = function (...a) { const r = _renderMessages4511.apply(this, a); try { fix(); } catch {} return r; };
  if (typeof renderMessagesSoon === 'function') {
    const _rms4511 = renderMessagesSoon;
    renderMessagesSoon = function (...a) { const r = _rms4511.apply(this, a); setTimeout(() => { try { fix(); } catch {} }, 60); return r; };
  }
}

// Links whose words hide where they go ([click here](https://…)) say where they lead before
// opening. "Trust this site" skips the question for that site from then on (on this device).
{
  const trusted = () => { try { return JSON.parse(localStorage.getItem('zuno_trusted_sites') || '[]'); } catch { return []; } };
  const trust = host => { try { localStorage.setItem('zuno_trusted_sites', JSON.stringify([...new Set([...trusted(), host])].slice(-200))); } catch {} };
  const norm = s => String(s || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
  document.addEventListener('click', e => {
    const a = e.target.closest?.('#messages a[href], .fwd a[href]');
    if (!a || e.defaultPrevented || a.dataset.ok45 || a.classList.contains('invite-link') || e.button > 0) return;
    let url;
    try { url = new URL(a.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    const text = a.textContent.trim();
    // The words already show the address: nothing hidden.
    if (!text || norm(text) === norm(url.href) || norm(url.href).startsWith(norm(text)) && /[./]/.test(text)) return;
    const host = url.hostname.replace(/^www\./, '');
    if (trusted().includes(host)) return;
    e.preventDefault(); e.stopPropagation();
    const ov = document.createElement('div');
    ov.className = 'overlay'; ov.style.zIndex = 200;
    ov.innerHTML = `<div class="dialog modal ml45"><h3>Leaving Zuno</h3>
      <p class="muted" style="margin:0 0 10px">This link goes to:</p>
      <div class="ml45-url"><b>${esc(host)}</b><span>${esc(url.pathname + url.search).slice(0, 140)}</span></div>
      <label class="ml45-trust"><input type="checkbox"> Trust ${esc(host)} links from now on</label>
      <div class="actions"><button class="btn btn-link" data-x>Go back</button><button class="btn btn-primary" data-go>Visit site</button></div></div>`;
    $('#layer').appendChild(ov);
    const close = () => ov.remove();
    $('[data-x]', ov).addEventListener('click', close);
    ov.addEventListener('mousedown', ev => { if (ev.target === ov) close(); });
    $('[data-go]', ov).addEventListener('click', () => { if ($('.ml45-trust input', ov).checked) trust(host); close(); window.open(url.href, '_blank', 'noopener,noreferrer'); });
  }, true);
}

// Bots that answer a /command show "Bot is thinking…" until the answer comes (or 15 seconds pass).
{
  const thinking = new Map(); // conv -> { el, timer, botId }
  const stop = conv => { const t = thinking.get(conv); if (!t) return; clearTimeout(t.timer); t.el?.remove(); thinking.delete(conv); };
  const show = (conv, botId) => {
    stop(conv);
    const bot = user(botId);
    const el = document.createElement('div');
    el.className = 'bt45';
    el.innerHTML = `${avatar(bot || { id: botId, displayName: 'Bot' }, 20)}<b>${esc(bot?.displayName || 'The bot')}</b><span>is thinking</span><i></i><i></i><i></i>`;
    const t = { el, botId, timer: setTimeout(() => stop(conv), 15000) };
    thinking.set(conv, t);
    place(conv);
  };
  const place = conv => { const t = thinking.get(conv); const box = $('#messages'); if (!t || activeConv() !== conv || !box) return; if (t.el.parentElement !== box) box.appendChild(t.el); t.el.scrollIntoView({ block: 'end' }); };
  const _renderMessages45b = renderMessages;
  renderMessages = function (...a) { const r = _renderMessages45b.apply(this, a); place(activeConv()); return r; };
  onLive26('bot-thinking', d => { if (d?.conv) { if (d.bot && !user(d.botId)) state.users[d.botId] = d.bot; show(d.conv, d.botId); } });
  onLive26('message', d => { const conv = d?.conv || d?.peerId; const t = thinking.get(conv); if (t && d.message?.authorId === t.botId) stop(conv); });
  window.botThinking45 = show;
}
