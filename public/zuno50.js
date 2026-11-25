'use strict';
// Zuno 0.50: smoother. Things that animate or work in the background only do it while you can see them.

// The "Loading older messages" spinner at the top of a chat only spins while it's on screen
// (spinning out of sight kept the phone redrawing every frame).
{
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) e.target.classList.toggle('lm-vis', e.isIntersecting); }) : null;
  let watched = null;
  const _renderMessages50 = renderMessages;
  renderMessages = function (...a) {
    const r = _renderMessages50.apply(this, a);
    const lm = document.getElementById('load-more');
    if (io && lm !== watched) { if (watched) io.unobserve(watched); watched = lm; if (lm) io.observe(lm); }
    return r;
  };
}

// Nothing keeps animating while Zuno is in the background (another tab, or the phone's screen off).
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('bg50', document.hidden));
