/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit AI — client-side billing glue (Stripe).

   Loaded on /pricing and /four (after supabase-js + auth-config.js + auth.js so
   window.GKAuth.client exists). This is UX ONLY — access is enforced
   server-side in api/advise.js. Here we just:
     • [data-gk-checkout]  → POST /api/checkout, redirect to Stripe (or /signup
                             if not signed in). Optional [data-gk-price="price_…"].
     • [data-gk-portal]    → POST /api/portal, redirect to the Stripe portal.
     • [data-gk-billing]   → (optional container on /four) render the user's plan
                             status + the right button (Upgrade vs Manage).

   Endpoints, env vars and the subscriptions table: docs/billing.md.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function client() { return (window.GKAuth && window.GKAuth.client) || null; }

  function token() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession()
      .then(function (r) { return (r && r.data && r.data.session && r.data.session.access_token) || null; })
      .catch(function () { return null; });
  }

  function nextParam() { return encodeURIComponent(window.location.pathname + window.location.search); }
  function go(url) { window.location.href = url; }

  function post(url, tok, body) {
    var headers = { 'content-type': 'application/json' };
    if (tok) headers.authorization = 'Bearer ' + tok;
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); });
  }

  // Start Stripe Checkout. Signed-out visitors go to /signup first (they land on
  // /four, where they can subscribe).
  function checkout(price) {
    return token().then(function (tok) {
      if (!tok) { go('/signup?next=' + nextParam()); return; }
      return post('/api/checkout', tok, price ? { price: price } : {}).then(function (x) {
        if (x.ok && x.data && x.data.url) go(x.data.url);
        else alert((x.data && x.data.error) || 'Could not start checkout. Please try again.');
      });
    }).catch(function () { alert('Could not start checkout. Please try again.'); });
  }

  function portal() {
    return token().then(function (tok) {
      if (!tok) { go('/login?next=' + nextParam()); return; }
      return post('/api/portal', tok, {}).then(function (x) {
        if (x.ok && x.data && x.data.url) go(x.data.url);
        else alert((x.data && x.data.error) || 'Could not open the billing portal.');
      });
    }).catch(function () { alert('Could not open the billing portal.'); });
  }

  // Render server-authoritative plan status on /four. /api/account applies the
  // same paid-subscription/private-beta rules as the engine.
  function renderStatus() {
    var box = document.querySelector('[data-gk-billing]');
    var c = client();
    if (!box || !c) return;

    function upgrade() {
      box.innerHTML = '<span class="four-billing-plan">Free account</span>' +
        '<button type="button" class="four-billing-btn" data-gk-checkout>Go Pro →</button>';
    }
    function manage(status) {
      box.innerHTML = '<span class="four-billing-plan is-pro">Pro · ' + status + '</span>' +
        '<button type="button" class="four-billing-btn" data-gk-portal>Manage billing</button>';
    }
    function beta() {
      box.innerHTML = '<span class="four-billing-plan is-pro">Beta Pro · included</span>';
    }

    token().then(function (tok) {
      if (!tok) { upgrade(); wire(box); return; }
      return fetch('/api/account', { headers: { authorization: 'Bearer ' + tok } })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
          var access = result.data && result.data.access;
          if (result.ok && access && access.reason === 'subscription') manage(access.status);
          else if (result.ok && access && access.allowed) beta();
          else upgrade();
          wire(box);
        });
    }).catch(function () { upgrade(); wire(box); });
  }

  function wire(root) {
    (root || document).querySelectorAll('[data-gk-checkout]').forEach(function (el) {
      if (el.__gkw) return; el.__gkw = 1;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        checkout(el.getAttribute('data-gk-price') || undefined);
      });
    });
    (root || document).querySelectorAll('[data-gk-portal]').forEach(function (el) {
      if (el.__gkw) return; el.__gkw = 1;
      el.addEventListener('click', function (e) { e.preventDefault(); portal(); });
    });
  }

  function init() { wire(document); renderStatus(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.GKBilling = { checkout: checkout, portal: portal };
})();
