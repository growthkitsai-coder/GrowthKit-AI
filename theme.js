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

  btn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.classList.add('theme-anim');
    if (next === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    syncAria();
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
    setTimeout(function () { root.classList.remove('theme-anim'); }, 500);
  });

  // If the user hasn't picked a theme explicitly and the OS preference
  // changes (e.g. macOS auto night-shift), follow it.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var listener = function (e) {
      var saved;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
      if (saved) return; // user has an explicit choice — don't override
      root.classList.add('theme-anim');
      if (e.matches) root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      syncAria();
      setTimeout(function () { root.classList.remove('theme-anim'); }, 500);
    };
    if (mq.addEventListener) mq.addEventListener('change', listener);
    else if (mq.addListener) mq.addListener(listener); // older Safari
  }
})();
