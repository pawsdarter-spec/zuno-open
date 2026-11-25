'use strict';
// Runs last, after every other Zuno script has loaded.

// Start-up: Zuno pops up for a moment, then the app appears.
// (0.45) The splash is a sketch of the app (in index.html) that shows the moment the page opens.
const bootStart = Date.now();
function hideSplash() {
  requestAnimationFrame(() => $('#splash').classList.add('gone'));
  // (0.50) Once it has faded, take it off the page for good: hidden, its shimmer kept animating
  // in the background and made phones redraw styles 60 times a second.
  setTimeout(() => { const s = $('#splash'); if (s?.classList.contains('gone')) s.style.display = 'none'; }, 450);
}

(async () => {
  if (!state.token) { showAuth(); hideSplash(); return; }
  // No connection isn't a reason to log out: keep trying (saved chats show meanwhile when possible).
  for (;;) {
    try { await start(); break; }
    catch (e) {
      if (!(e instanceof TypeError) && navigator.onLine !== false) { signOutLocal(); break; }
      $('#splash')?.classList.add('offline-wait');
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  hideSplash();
  setTimeout(checkVersion, 800);
})();
