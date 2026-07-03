/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit AI — auth logic (Supabase, no build step).
   Loaded (in order, all defer) AFTER the Supabase UMD bundle and auth-config.js:
     <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script defer src="auth-config.js"></script>
     <script defer src="auth.js"></script>
   Each page sets <body data-auth-page="login|signup|reset|four"> and includes the
   shared markup (data-auth-* hooks). If Supabase isn't configured yet, the pages
   render but show a "not configured" notice and disable the forms.
   Setup + Google provider steps: docs/auth.md.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var cfg = window.GK_AUTH_CONFIG || {};
  var lib = window.supabase; // the Supabase UMD global (createClient lives here)
  var REDIRECT = cfg.REDIRECT_AFTER_LOGIN || '/four';
  var origin = location.origin;
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && lib && lib.createClient);

  // "Remember me": route session storage to localStorage (persist across
  // browser restarts) when true, sessionStorage (cleared on close) when false.
  // Default true. Reads from both so an existing session is always found.
  var remember = true;
  var storageAdapter = {
    getItem: function (k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) { try { (remember ? localStorage : sessionStorage).setItem(k, v); (remember ? sessionStorage : localStorage).removeItem(k); } catch (e) {} },
    removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }
  };

  var client = configured ? lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { storage: storageAdapter, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  }) : null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function alertEl() { return $('[data-auth-alert]'); }
  function showAlert(msg, kind) { var b = alertEl(); if (b) { b.textContent = msg; b.className = 'auth-alert show ' + (kind || 'error'); } }
  function clearAlert() { var b = alertEl(); if (b) { b.textContent = ''; b.className = 'auth-alert'; } }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { if (btn.dataset._l == null) btn.dataset._l = btn.textContent; btn.textContent = label || 'Working…'; btn.disabled = true; }
    else { if (btn.dataset._l != null) btn.textContent = btn.dataset._l; btn.disabled = false; }
  }
  function notConfigured() {
    showAlert('Sign-in isn’t configured yet — add your Supabase keys in auth-config.js. (See docs/auth.md.)', 'error');
    [].forEach.call(document.querySelectorAll('[data-auth-form] button, [data-auth-form] input, [data-auth-google]'), function (n) { n.disabled = true; });
  }

  function wireGoogle() {
    var g = $('[data-auth-google]');
    if (!g) return;
    g.addEventListener('click', function () {
      if (!configured) return notConfigured();
      clearAlert(); busy(g, true, 'Redirecting to Google…');
      client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin + REDIRECT } })
        .then(function (r) { if (r && r.error) { showAlert(r.error.message, 'error'); busy(g, false); } });
    });
  }

  function wireLogin() {
    var form = $('[data-auth-form]'); if (!form) return;
    var rememberEl = $('[data-auth-remember]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!configured) return notConfigured();
      clearAlert();
      var email = (form.email.value || '').trim(), password = form.password.value || '';
      if (!email || !password) return showAlert('Enter your email and password.', 'error');
      remember = rememberEl ? !!rememberEl.checked : true;
      var btn = $('.auth-submit', form); busy(btn, true, 'Signing in…');
      client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) { showAlert(friendly(r.error), 'error'); busy(btn, false); return; }
        location.href = REDIRECT;
      });
    });
  }

  function wireSignup() {
    var form = $('[data-auth-form]'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!configured) return notConfigured();
      clearAlert();
      var email = (form.email.value || '').trim(), password = form.password.value || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAlert('Enter a valid email address.', 'error');
      if (password.length < 8) return showAlert('Use a password of at least 8 characters.', 'error');
      var btn = $('.auth-submit', form); busy(btn, true, 'Creating account…');
      client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: origin + REDIRECT } }).then(function (r) {
        if (r.error) { showAlert(friendly(r.error), 'error'); busy(btn, false); return; }
        // Email confirmation on → no session yet; show the check-your-email state.
        if (r.data && r.data.session) { location.href = REDIRECT; return; }
        form.style.display = 'none';
        var ok = $('[data-auth-confirm]'); if (ok) { ok.style.display = 'block'; var em = $('[data-auth-confirm-email]', ok); if (em) em.textContent = email; }
        clearAlert();
      });
    });
  }

  function wireReset() {
    var reqForm = $('[data-auth-reset-request]');
    var newForm = $('[data-auth-reset-new]');
    function showNew() { if (reqForm) reqForm.style.display = 'none'; if (newForm) newForm.style.display = 'block'; var h = $('[data-auth-title]'); if (h) h.textContent = 'Set a new password.'; }
    // Supabase fires PASSWORD_RECOVERY once it processes the emailed link.
    if (client) client.auth.onAuthStateChange(function (evt) { if (evt === 'PASSWORD_RECOVERY') showNew(); });
    if (/type=recovery/.test(location.hash)) showNew();

    if (reqForm) reqForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!configured) return notConfigured();
      clearAlert();
      var email = (reqForm.email.value || '').trim();
      if (!email) return showAlert('Enter your email.', 'error');
      var btn = $('.auth-submit', reqForm); busy(btn, true, 'Sending link…');
      client.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset' }).then(function (r) {
        busy(btn, false);
        if (r.error) { showAlert(friendly(r.error), 'error'); return; }
        showAlert('If an account exists for ' + email + ', a password-reset link is on its way.', 'success');
      });
    });

    if (newForm) newForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!configured) return notConfigured();
      clearAlert();
      var pw = newForm.password.value || '';
      if (pw.length < 8) return showAlert('Use a password of at least 8 characters.', 'error');
      var btn = $('.auth-submit', newForm); busy(btn, true, 'Updating…');
      client.auth.updateUser({ password: pw }).then(function (r) {
        if (r.error) { showAlert(friendly(r.error), 'error'); busy(btn, false); return; }
        showAlert('Password updated — taking you in…', 'success');
        setTimeout(function () { location.href = REDIRECT; }, 900);
      });
    });
  }

  function wireFour() {
    var emailEl = $('[data-auth-email]');
    var signout = $('[data-auth-signout]');
    if (!configured) { if (emailEl) emailEl.textContent = 'demo mode — auth not configured'; return; }
    var settled = false;
    function show(session) { settled = true; if (emailEl) emailEl.textContent = (session.user && session.user.email) || 'signed in'; }
    client.auth.onAuthStateChange(function (_evt, session) { if (session && !settled) show(session); });
    client.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (session) return show(session);
      // Allow a beat for a redirect (OAuth / confirm) to be processed, then bounce.
      setTimeout(function () { if (!settled) location.href = '/login'; }, 1400);
    });
    if (signout) signout.addEventListener('click', function () {
      if (!client) { location.href = '/login'; return; }
      client.auth.signOut().then(function () { location.href = '/login'; });
    });
  }

  // Turn Supabase error objects into friendlier copy where it helps.
  function friendly(err) {
    var m = (err && err.message) || 'Something went wrong — please try again.';
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
    if (/user already registered/i.test(m)) return 'An account with that email already exists — try logging in.';
    return m;
  }

  function boot() {
    wireGoogle();
    var page = document.body.getAttribute('data-auth-page');
    if (page === 'login') wireLogin();
    else if (page === 'signup') wireSignup();
    else if (page === 'reset') wireReset();
    else if (page === 'four') wireFour();
    if (!configured && page !== 'four') notConfigured();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GKAuth = { client: client, configured: configured };
})();
