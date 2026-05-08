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

  // The "try dark mode →" prompt next to the toggle is also clickable
  // for users who target the text rather than the icon.
  var prompt = document.querySelector('.theme-prompt');
  if (prompt) prompt.addEventListener('click', toggle);
})();
