// GrowthKit AI — theme toggle wiring.
// The pre-paint inline script in <head> has already set data-theme on
// <html> based on saved preference / system preference, so we just need
// to keep the button's aria state in sync and handle clicks.
(function () {
  'use strict';

  var STORAGE_KEY = 'gk-theme';
  var root = document.documentElement;
  var btn  = document.querySelector('.theme-toggle');
  if (!btn) return;

  function isDark() {
    return root.getAttribute('data-theme') === 'dark';
  }

  function syncAria() {
    var dark = isDark();
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  syncAria();

  function toggle() {
    var next = isDark() ? 'light' : 'dark';
    root.classList.add('theme-anim');
    if (next === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    syncAria();
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
    setTimeout(function () { root.classList.remove('theme-anim'); }, 500);
  }

  btn.addEventListener('click', toggle);
})();

// ────────────────────────────────────────────────────────────────
// Shared ambient-polish handlers.
//
// `.spotlight-card` — a soft glow follows the pointer across the card.
//   CSS reads --mx / --my (in px relative to the card's bounding rect)
//   and renders a radial gradient on the child .spotlight element.
//
// `.magnetic` — the element gently follows the pointer when hovered.
//   CSS reads --mx / --my (in px) and applies translate3d via transform.
//
// Both handlers are no-ops without the matching CSS class, so this is
// safe to load on every page. Disabled on touch (no hover capability)
// and `prefers-reduced-motion` users (motion only).
// ────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  if (!hasHover) return;

  var prefersReduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Spotlight is fine under reduced-motion (it's only a hover state,
  // not an animation) — keep it on for everyone with a pointer.
  document.querySelectorAll('.spotlight-card').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  if (prefersReduce) return;

  document.querySelectorAll('.magnetic').forEach(function (btn) {
    var raf = null;
    btn.addEventListener('pointermove', function (e) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) * 0.20;
        var dy = (e.clientY - r.top - r.height / 2) * 0.20;
        btn.style.setProperty('--mx', Math.max(-10, Math.min(10, dx)) + 'px');
        btn.style.setProperty('--my', Math.max(-10, Math.min(10, dy)) + 'px');
      });
    });
    btn.addEventListener('pointerleave', function () {
      btn.style.setProperty('--mx', '0px');
      btn.style.setProperty('--my', '0px');
    });
  });
})();
