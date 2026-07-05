/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit AI — auth logic (Supabase, no build step).
   Loaded (in order, plain <script> at end of body) AFTER the Supabase UMD
   bundle and auth-config.js. Each page sets <body data-auth-page="…">.
     login  — email/password + Google + Microsoft; → /four
     signup — email/password + Google + Microsoft; email-confirm state; → /four
     reset  — request link / set new password
     four   — GATED: the product lives here. Redirects to /login if not signed
              in; reveals the tool + the user's saved read history when signed in.
   OAuth buttons use data-auth-oauth="google|azure". Setup + provider steps and
   the `reads` table SQL are in docs/auth.md.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var cfg = window.GK_AUTH_CONFIG || {};
  var lib = window.supabase;
  var REDIRECT = cfg.REDIRECT_AFTER_LOGIN || '/four';
  var origin = location.origin;
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && lib && lib.createClient);

  // "Remember me": localStorage (persist) vs sessionStorage (until close).
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
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
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
    $$('[data-auth-form] button, [data-auth-form] input, [data-auth-oauth], [data-auth-reset-request] button, [data-auth-reset-request] input, [data-auth-reset-new] button, [data-auth-reset-new] input').forEach(function (n) { n.disabled = true; });
  }

  // ── OAuth (Google + Microsoft/azure) ──
  function wireOAuth() {
    $$('[data-auth-oauth]').forEach(function (btn) {
      var provider = btn.getAttribute('data-auth-oauth');
      btn.addEventListener('click', function () {
        if (!configured) return notConfigured();
        clearAlert(); busy(btn, true, 'Redirecting…');
        var opts = { redirectTo: origin + REDIRECT };
        if (provider === 'azure') opts.scopes = 'email openid profile';
        client.auth.signInWithOAuth({ provider: provider, options: opts })
          .then(function (r) { if (r && r.error) { showAlert(r.error.message, 'error'); busy(btn, false); } });
      });
    });
  }

  function wireLogin() {
    redirectIfAuthed();
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
    redirectIfAuthed();
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

  // ── /four — the gated product page ──
  function wireFour() {
    var checking = $('[data-four-checking]');
    var app = $('[data-four-app]');
    var signout = $('[data-auth-signout]');

    if (!configured) {
      if (checking) checking.innerHTML = 'Sign-in isn’t configured yet — add your Supabase keys in <span class="mono">auth-config.js</span> (see docs/auth.md). The tool will unlock once auth is live.';
      return;
    }

    var settled = false;
    function reveal(session) {
      if (settled) return; settled = true;
      if (checking) checking.style.display = 'none';
      if (app) app.style.display = '';
      $$('[data-auth-email]').forEach(function (n) { n.textContent = (session.user && session.user.email) || 'signed in'; });
      window.GK_SAVE_READS = true;              // tell advisor.js to persist reads
      window.GK_RELOAD_READS = loadReads;       // advisor.js calls this after a save
      loadReads();
    }
    client.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (s) return reveal(s);
      setTimeout(function () { if (!settled) location.href = '/login'; }, 1300);
    });
    client.auth.onAuthStateChange(function (_e, s) { if (s) reveal(s); });

    if (signout) signout.addEventListener('click', function () {
      client.auth.signOut().then(function () { location.href = '/login'; });
    });
  }

  // Load the signed-in user's saved reads into the history panel.
  function loadReads() {
    var list = $('[data-reads-list]');
    var empty = $('[data-reads-empty]');
    var wrap = $('[data-reads]');
    if (!list || !client) return;
    client.from('reads').select('id,created_at,product,output').order('created_at', { ascending: false }).limit(12).then(function (res) {
      if (res.error) {
        // Most likely the `reads` table/policies aren't set up yet — hide the panel silently.
        if (wrap) wrap.style.display = 'none';
        return;
      }
      var rows = res.data || [];
      if (wrap) wrap.style.display = '';
      if (!rows.length) { list.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      list.innerHTML = '';
      rows.forEach(function (row) {
        var item = document.createElement('button');
        item.type = 'button'; item.className = 'reads-item';
        var when = fmtDate(row.created_at);
        var title = (row.product || '').replace(/\s+/g, ' ').trim().slice(0, 84) || 'Untitled read';
        item.innerHTML = '<span class="reads-when">' + esc(when) + '</span><span class="reads-title">' + esc(title) + '</span><span class="reads-arr">↗</span>';
        item.addEventListener('click', function () { viewRead(row); });
        list.appendChild(item);
      });
    });
  }

  function viewRead(row) {
    var viewer = $('[data-reads-viewer]');
    var body = $('[data-reads-viewer-body]');
    if (!viewer || !body) return;
    if (window.GKAdvisor && window.GKAdvisor.render) window.GKAdvisor.render(body, row.output || '');
    else body.textContent = row.output || '';
    viewer.style.display = '';
    viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fmtDate(iso) {
    try { var d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // Send already-signed-in users straight to the app (login/signup pages).
  function redirectIfAuthed() {
    if (!client) return;
    client.auth.getSession().then(function (r) { if (r.data && r.data.session) location.href = REDIRECT; });
  }

  function friendly(err) {
    var m = (err && err.message) || 'Something went wrong — please try again.';
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
    if (/user already registered/i.test(m)) return 'An account with that email already exists — try logging in.';
    return m;
  }

  function boot() {
    wireOAuth();
    var page = document.body.getAttribute('data-auth-page');
    if (page === 'login') wireLogin();
    else if (page === 'signup') wireSignup();
    else if (page === 'reset') wireReset();
    else if (page === 'four') wireFour();
    if (!configured && page && page !== 'four') notConfigured();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GKAuth = { client: client, configured: configured };
})();
