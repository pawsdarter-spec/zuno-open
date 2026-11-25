'use strict';
// Zuno 0.32: change your username (handle). Password needed, once a day, and a last check of the
// spelling before it changes.

async function openUsernameChange() {
  let info;
  try { info = await api('GET', '/api/me/username'); } catch (e) { return toast(e.message, true); }
  if (info.staffLocked) return toast("Zuno Staff usernames are tied to the staff role, so they can't be changed here.", true);
  if (info.nextChangeAt) {
    const h = Math.ceil((info.nextChangeAt - Date.now()) / 3600e3);
    return toast(`You can change your username once a day. Try again in ${h} hour${h === 1 ? '' : 's'}.`, true);
  }
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.style.zIndex = 140;
  const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $('#layer').appendChild(ov);
  // Step 1: pick the name and type your password.
  const step1 = (name = '') => {
    ov.innerHTML = `<form class="dialog modal un-dlg"><h3>Change your username</h3>
      <p class="muted small" style="margin:-4px 0 14px">Your username is your @handle and what you log in with. You can change it <b>once a day</b>. Your old one, <b>@${esc(state.me.username)}</b>, is kept for you for 7 days so nobody else can take it.</p>
      <label class="field">New username<div class="un-in"><span>@</span><input name="u" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(name)}" placeholder="${esc(state.me.username)}"></div><span class="un-st muted small">Letters, numbers, _ and . only.</span></label>
      <label class="field">Your password<input name="pw" type="password" autocomplete="current-password" required></label>
      <div class="actions"><button type="button" class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="next" disabled>Continue</button></div></form>`;
    const f = $('form', ov), st = $('.un-st', ov), next = $('[data-a=next]', ov);
    $('[data-a=cancel]', ov).addEventListener('click', close);
    let ok = false, t = 0;
    const sync = () => { next.disabled = !(ok && f.pw.value); };
    const check = () => {
      clearTimeout(t);
      const v = f.u.value.trim().toLowerCase().replace(/^@/, '');
      if (f.u.value !== v) f.u.value = v;
      ok = false; sync();
      if (!v) { st.className = 'un-st muted small'; st.textContent = 'Letters, numbers, _ and . only.'; return; }
      if (!/^[a-z0-9_.]{2,32}$/.test(v)) { st.className = 'un-st bad small'; st.textContent = '2–32 characters: letters, numbers, _ and . only.'; return; }
      if (v === state.me.username) { st.className = 'un-st bad small'; st.textContent = "That's already your username."; return; }
      st.className = 'un-st muted small'; st.textContent = 'Checking…';
      t = setTimeout(async () => {
        try {
          const d = await api('GET', `/api/me/username?check=${encodeURIComponent(v)}`);
          if (f.u.value !== v) return;
          ok = !!d.check?.available;
          st.className = `un-st ${ok ? 'good' : 'bad'} small`;
          st.textContent = ok ? `✓ @${v} is available` : d.check?.blocked ? "That username isn't allowed on Zuno." : `@${v} is taken`;
          sync();
        } catch (e) { st.className = 'un-st bad small'; st.textContent = e.message; }
      }, 350);
    };
    f.u.addEventListener('input', check);
    f.pw.addEventListener('input', sync);
    if (name) check();
    setTimeout(() => f.u.focus(), 30);
    f.addEventListener('submit', e => { e.preventDefault(); if (!next.disabled) step2(f.u.value, f.pw.value); });
  };
  // Step 2: show it big and ask them to check the spelling.
  const step2 = (name, pw) => {
    ov.innerHTML = `<div class="dialog modal un-dlg"><h3>Is this spelled right?</h3>
      <div class="un-confirm"><span class="muted small">Your new username will be</span><b>@${esc(name)}</b><span class="un-from muted small">instead of @${esc(state.me.username)}</span></div>
      <p class="muted small">Check every letter. You won't be able to change it again for <b>24 hours</b>, and you'll use it to log in.</p>
      <div class="actions"><button class="btn btn-link" data-a="back">Back, let me fix it</button><button class="btn btn-primary" data-a="go">Yes, change it</button></div></div>`;
    $('[data-a=back]', ov).addEventListener('click', () => step1(name));
    $('[data-a=go]', ov).addEventListener('click', async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Changing…';
      try {
        const { me } = await api('POST', '/api/me/username', { username: name, password: pw });
        state.me = { ...state.me, ...me }; state.users[me.id] = { ...state.users[me.id], ...me };
        close(); toast(`You're now @${me.username} ✨`);
        renderUserPanel?.();
        if ($('.settings-nav [data-s="account"].active')) showSettingsSection('account');
      } catch (err) { toast(err.message, true); if (/password/i.test(err.message)) step1(name); else { b.disabled = false; b.textContent = 'Yes, change it'; } }
    });
  };
  step1();
}

// ======================= badges kept their color =======================
// Each badge's colored background is an SVG gradient found by id. With the same badge twice on the
// page (an old profile card, the Settings preview), every copy used the first one's gradient, and
// if that copy was hidden the fill failed, leaving just the icon lines. Every copy now gets its own ids.
(() => {
  let n = 0;
  for (const info of Object.values(BADGE_INFO)) {
    let raw = info.svg;
    if (typeof raw !== 'string') continue;
    Object.defineProperty(info, 'svg', {
      configurable: true, enumerable: true,
      get() {
        if (!/\sid="/.test(raw)) return raw;
        const s = '_b' + (++n).toString(36);
        return raw.replace(/\sid="([^"]+)"/g, ` id="$1${s}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${s})`).replace(/href="#([^"]+)"/g, `href="#$1${s}"`);
      },
      set(v) { raw = v; },
    });
  }
})();

// ======================= profile background stays put =======================
// The card scrolls, but its background (and profile effect) were sized to the visible part only,
// so scrolling down showed the bottom with no background. They now ride along with the scroll.
document.addEventListener('scroll', e => {
  const card = e.target;
  if (!(card instanceof Element) || !card.classList.contains('pcard')) return;
  card.style.setProperty('--pcy', card.scrollTop + 'px');
}, true);
