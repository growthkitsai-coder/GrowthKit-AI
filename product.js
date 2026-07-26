/* GrowthKit /four product state: entitlement, daily reports, history, and integrations. */
(function () {
  'use strict';

  var dailyBusy = false;
  var accountCache = null;
  var countdownTimer = null;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(value) {
    var url = String(value || '');
    return /^https:\/\//i.test(url) ? url : '';
  }
  function token() {
    var client = window.GKAuth && window.GKAuth.client;
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) {
      return r && r.data && r.data.session && r.data.session.access_token;
    }).catch(function () { return null; });
  }
  function api(url, options) {
    return token().then(function (tok) {
      var opts = options || {};
      opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
      if (tok) opts.headers.authorization = 'Bearer ' + tok;
      if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
      return fetch(url, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok && r.status !== 202) throw new Error(data.error || 'Request failed.');
          return data;
        });
      });
    });
  }

  function todayUtc() { return new Date().toISOString().slice(0, 10); }

  function renderDailyCountdown(access, today) {
    var host = qs('[data-daily-countdown]');
    var label = qs('[data-daily-countdown-label]', host);
    if (!host || !label) return;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (!access || !access.allowed) { host.hidden = true; return; }
    host.hidden = false;
    var unlockAt = null;
    if (today && today.status === 'completed') {
      var renderedAt = new Date();
      unlockAt = Date.UTC(renderedAt.getUTCFullYear(), renderedAt.getUTCMonth(), renderedAt.getUTCDate() + 1);
    }

    function update() {
      if (!today || today.status !== 'completed') {
        host.classList.remove('is-counting');
        label.textContent = 'Daily report ready';
        return;
      }
      var remaining = Math.max(0, unlockAt - Date.now());
      if (remaining <= 0) {
        host.classList.remove('is-counting');
        label.textContent = 'Daily report ready';
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        return;
      }
      var seconds = Math.floor(remaining / 1000);
      var hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
      var mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      var ss = String(seconds % 60).padStart(2, '0');
      host.classList.add('is-counting');
      label.textContent = 'Daily report coming in ' + hh + ':' + mm + ':' + ss;
    }
    update();
    if (today && today.status === 'completed') countdownTimer = setInterval(update, 1000);
  }

  function renderAccount(account) {
    accountCache = account;
    var status = qs('[data-product-status]');
    var advisor = qs('[data-gk-advisor]');
    var daily = qs('[data-daily]');
    var locked = qs('[data-locked-dashboard]');
    var integrations = qs('[data-integrations]');
    var access = account && account.access || {};
    var today = (account && account.today) || {};
    var reports = (account && account.reports) || [];
    var doneToday = today.status === 'completed';

    if (status) {
      if (!access.allowed) {
        // Reasons come from checkAccess in lib/subscriptions.js. Each is safe to
        // show: none of them reveal anything about other accounts.
        var deniedMessage = 'Free account · Pro required to generate reports';
        if (access.reason === 'beta-pending') deniedMessage = 'Free account · beta application awaiting approval';
        else if (access.reason === 'beta-expired') deniedMessage = 'Free account · your beta week has ended';
        else if (access.reason === 'beta-reports-spent') deniedMessage = 'Free account · all 7 beta reports used';
        else if (access.reason === 'beta-revoked') deniedMessage = 'Free account · beta access was withdrawn';
        else if (access.reason === 'beta-disabled') deniedMessage = 'Free account · the beta is currently closed';
        status.innerHTML = '<span class="status-dot"></span>' + deniedMessage;
      } else if (access.reason === 'beta-allowlist') {
        status.innerHTML = '<span class="status-dot"></span>Beta access · Pro included';
      } else if (access.reason === 'beta-approved') {
        var b = access.beta || {};
        var left = typeof b.reports_remaining === 'number' ? b.reports_remaining : '?';
        status.innerHTML = '<span class="status-dot"></span>Beta access · ' + esc(left) +
          ' of ' + esc(b.reports_limit || 7) + ' reports left';
      } else if (access.plan === 'agentic') {
        status.innerHTML = '<span class="status-dot"></span>Agentic subscription · active';
      } else {
        status.innerHTML = '<span class="status-dot"></span>Pro subscription · active';
      }
      // The daily affordance: one report per UTC day. When today's is done, say
      // so and when the next unlocks; otherwise invite the next one.
      if (access.allowed) {
        status.innerHTML += '<span class="status-company">' +
          (doneToday ? "Today's report is complete" : 'One report ready to generate today') +
          '</span>';
      }
    }
    renderDailyCountdown(access, today);

    // Completed reports stay readable after access ends, so keep the advisor
    // visible for anyone who has history even once generation locks.
    var showAdvisor = access.allowed || reports.length > 0;
    if (advisor) advisor.style.display = showAdvisor ? '' : 'none';
    if (daily) daily.style.display = 'none'; // daily briefs retired
    if (locked) locked.style.display = access.allowed ? 'none' : '';
    if (integrations) integrations.style.display = access.allowed ? '' : 'none';
    renderBeta(access);
    renderHistory(reports);
    if (access.allowed) loadIntegrations();
  }

  /**
   * The report-history list: every completed report, newest first, each linking
   * to /four?report_id=… which advisor.js renders on load.
   */
  function renderHistory(reports) {
    var host = qs('[data-history]');
    var list = qs('[data-history-list]');
    if (!host || !list) return;
    if (!reports || !reports.length) { host.style.display = 'none'; return; }
    host.style.display = '';
    list.innerHTML = reports.map(function (r) {
      var date = String(r.report_date || '').slice(0, 10);
      return '<a class="report-history-item" href="/four?report_id=' + encodeURIComponent(r.id) + '">' +
        '<span class="rh-company">' + esc(r.company_name || 'Report') + '</span>' +
        '<span class="rh-date">' + esc(date) + '</span></a>';
    }).join('');
  }

  /**
   * The beta panel. Applying grants nothing — a pending row waits for Avi to
   * approve it in /admin.html. Shown only to accounts without a paid
   * subscription; a subscriber has no reason to apply and api/beta.js refuses.
   */
  function renderBeta(access) {
    var host = qs('[data-beta]');
    if (!host) return;
    var body = qs('[data-beta-body]');
    var reason = access.reason;

    if (access.reason === 'subscription' || access.reason === 'beta-allowlist') {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';

    if (access.allowed && reason === 'beta-approved') {
      var b = access.beta || {};
      var until = b.expires_at ? new Date(b.expires_at) : null;
      var untilText = until && !isNaN(until.getTime()) ? until.toISOString().slice(0, 10) : '';
      body.innerHTML = '<p class="beta-live"><b>You\'re in the beta.</b> ' +
        esc(b.reports_remaining) + ' of ' + esc(b.reports_limit) + ' full reports left' +
        (untilText ? ', until <b>' + esc(untilText) + '</b>' : '') +
        '. Whichever runs out first ends the beta — then it\'s Pro at £20/month.</p>';
      return;
    }

    if (reason === 'beta-pending') {
      body.innerHTML = '<p>Your application is in. A founder reviews these by hand — ' +
        'you\'ll get access the moment it\'s approved.</p>';
      return;
    }

    if (reason === 'beta-expired' || reason === 'beta-reports-spent' || reason === 'beta-revoked') {
      var done = reason === 'beta-reports-spent'
        ? 'You used all 7 beta reports.'
        : (reason === 'beta-revoked' ? 'Your beta access was withdrawn.' : 'Your beta week has ended.');
      body.innerHTML = '<p>' + done + ' To keep generating a report a day, go Pro.</p>' +
        '<div class="beta-actions"><button type="button" class="beta-btn" data-gk-checkout data-gk-plan="pro">Upgrade to Pro →</button></div>';
      if (window.GKBilling && window.GKBilling.wire) window.GKBilling.wire(host);
      return;
    }

    if (reason === 'beta-disabled' || reason === 'beta-unavailable') {
      body.innerHTML = '<p>The beta is closed right now. Pro is available whenever you are.</p>';
      return;
    }

    // beta-not-applied (or anything unrecognised) — offer the application.
    body.innerHTML =
      '<p>Beta testers get <b>one full report a day for a week</b> — 7 reports, free. ' +
      'Applications are approved by hand.</p>' +
      '<label class="beta-label" for="beta-note">Anything we should know? <span>(optional)</span></label>' +
      '<textarea id="beta-note" class="beta-note" rows="3" maxlength="1000" ' +
      'placeholder="What are you building, and which market do you want dissected?"></textarea>' +
      '<div class="beta-actions"><button type="button" class="beta-btn" data-beta-apply>Apply to be a beta tester →</button></div>';
  }

  function applyForBeta(button) {
    var note = qs('#beta-note');
    var body = qs('[data-beta-body]');
    button.disabled = true;
    button.textContent = 'Sending…';
    api('/api/beta', { method: 'POST', body: { note: note ? note.value : '' } })
      .then(function () {
        body.innerHTML = '<p><b>Application received.</b> A founder reviews these by hand — ' +
          'you\'ll get access the moment it\'s approved.</p>';
      })
      .catch(function (err) {
        body.innerHTML = '<p class="beta-error">' + esc(err.message || 'That did not send. Try again shortly.') + '</p>';
      });
  }

  function movementItem(item) {
    var link = safeUrl(item && item.source_url);
    return '<li><strong>' + esc(item && (item.label || item.title)) + '</strong><span>' + esc(item && item.detail) + '</span>' +
      (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + '</li>';
  }

  function renderBrief(row) {
    var host = qs('[data-daily-brief]');
    var state = qs('[data-daily-state]');
    if (!host || !row || !row.brief) return;
    var b = row.brief;
    var lead = b.lead || {};
    var noChange = Boolean(b.no_material_change);
    var movement = (b.market_competitor_movement || []).map(movementItem).join('');
    var metrics = (b.own_metrics || []).map(function (m) {
      return '<li><strong>' + esc(m.label) + '</strong><span class="daily-metric">' + esc(m.value) + '</span><span>' + esc(m.delta) + '</span><small>' + esc(m.source) + '</small></li>';
    }).join('');
    var signals = (b.market_signals || []).map(movementItem).join('');
    var moves = (b.next_moves || []).map(function (m, moveIndex) {
      var finding = m.finding || m.action;
      var work = window.GKFindings && m.finding && Array.isArray(m.checklist) && m.checklist.length === 3
        ? window.GKFindings.shell({
          findingKey: 'move-0' + (moveIndex + 1),
          finding: finding,
          nextMove: m.action,
          company: accountCache && accountCache.workspace && accountCache.workspace.company_name
        })
        : '';
      return '<li><span class="daily-priority">0' + esc(m.priority) + '</span><div><strong>' + esc(finding) + '</strong><span>' + esc(m.because) + '</span>' + work + '</div></li>';
    }).join('');
    var founder = b.founder_to_talk_to || {};
    var founderUrl = safeUrl(founder.public_url);
    var tool = b.tool_prompt || {};
    var sources = (b.sources || []).map(function (s) {
      var url = safeUrl(s.url);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(s.title || url) + ' ↗</a>' : '';
    }).join('');

    host.innerHTML = '<div class="daily-brief-meta"><span>' + esc(row.brief_date || b.brief_date) + ' · GMT</span><span class="daily-signal ' + (noChange ? 'is-quiet' : '') + '">' + (noChange ? 'No material change today' : 'Material change detected') + '</span></div>' +
      '<h3>' + esc(lead.headline || (noChange ? 'No material change today' : 'Today’s market signal')) + '</h3>' +
      '<p class="daily-lead">' + esc(lead.detail) + '</p>' +
      '<p class="daily-why">' + esc(lead.why_it_matters) + '</p>' +
      '<details><summary>See the full 30-second brief</summary>' +
        (movement ? '<div class="daily-section"><h4>Market & competitor movement</h4><ul>' + movement + '</ul></div>' : '') +
        (metrics ? '<div class="daily-section"><h4>Your metrics</h4><ul class="daily-metrics">' + metrics + '</ul></div>' : '') +
        (signals ? '<div class="daily-section"><h4>Market signals</h4><ul>' + signals + '</ul></div>' : '') +
        '<div class="daily-section"><h4>Next 3 moves</h4><ol class="daily-moves">' + moves + '</ol></div>' +
        '<div class="daily-two-up"><div><h4>Founder to learn from today</h4><strong>' + esc(founder.name) + (founder.company ? ' · ' + esc(founder.company) : '') + '</strong><p>' + esc(founder.why_today) + '</p>' + (founderUrl ? '<a href="' + esc(founderUrl) + '" target="_blank" rel="noopener">View public profile ↗</a>' : '') + '</div>' +
        '<div><h4>Use GrowthKit next</h4><strong>' + esc(tool.tool) + '</strong><p>' + esc(tool.reason) + '</p><code>' + esc(tool.prompt) + '</code></div></div>' +
        (sources ? '<div class="daily-sources"><h4>Sources</h4>' + sources + '</div>' : '') +
      '</details>';
    host.style.display = '';
    if (state) state.style.display = 'none';
    if (window.GKFindings) window.GKFindings.hydrate(host, { scope: 'daily_brief', date: row.brief_date || b.brief_date });
  }

  function renderDailyHistory(rows) {
    var host = qs('[data-daily-history]');
    if (!host) return;
    host.innerHTML = '';
    (rows || []).slice(1, 8).forEach(function (row) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.brief_date;
      button.addEventListener('click', function () { renderBrief(row); });
      host.appendChild(button);
    });
  }

  function generateDaily(scroll) {
    if (dailyBusy) return;
    dailyBusy = true;
    var state = qs('[data-daily-state]');
    if (state) { state.style.display = ''; state.textContent = 'Scanning the market and connected metrics…'; }
    api('/api/daily-briefs', { method: 'POST', body: {} }).then(function (data) {
      if (data.brief) renderBrief(data.brief);
      loadDaily(false);
      if (scroll) { var panel = qs('[data-daily]'); if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }).catch(function (err) {
      if (state) state.textContent = err.message || 'Today’s brief could not be prepared.';
    }).finally(function () { dailyBusy = false; });
  }

  function loadDaily(generateIfMissing) {
    api('/api/daily-briefs', { method: 'GET' }).then(function (data) {
      var rows = data.briefs || [];
      if (rows[0] && rows[0].status === 'completed') renderBrief(rows[0]);
      renderDailyHistory(rows);
      if (generateIfMissing && (!rows[0] || rows[0].brief_date !== todayUtc() || rows[0].status !== 'completed')) generateDaily(false);
    }).catch(function (err) {
      var state = qs('[data-daily-state]');
      if (state) state.textContent = err.message || 'Daily intelligence is unavailable.';
    });
  }

  var providerNames = { stripe: 'Stripe', google_analytics: 'Google Analytics', linkedin: 'LinkedIn' };
  var providerCopy = {
    stripe: 'Yesterday’s customers, revenue, and subscription churn.',
    google_analytics: 'Traffic, active users, sessions, and new-user movement.',
    linkedin: 'Page follower growth and organic content engagement.'
  };
  var providerIcons = { stripe: 'gkl-stripe', google_analytics: 'gkl-analytics', linkedin: 'gkl-linkedin' };

  function integrationConfig(connection) {
    var config = connection.config || {};
    if (connection.provider === 'google_analytics' && connection.connected && (config.properties || []).length) {
      return '<label>Property<select data-integration-property="google_analytics">' + config.properties.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (String(p.id) === String(config.property_id) ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') + '</select></label>';
    }
    if (connection.provider === 'linkedin' && connection.connected) {
      var orgs = config.organizations || [];
      if (orgs.length) {
        return '<label>Company Page<select data-integration-property="linkedin">' + orgs.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (String(p.id) === String(config.organization_id) ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select></label>';
      }
      return '<label>LinkedIn Page ID<input inputmode="numeric" value="' + esc(config.organization_id || '') + '" data-linkedin-page placeholder="12345678"></label><button type="button" class="integration-save" data-integration-save="linkedin">Save Page</button>';
    }
    return '';
  }

  function renderIntegrations(connections) {
    var host = qs('[data-integrations-list]');
    if (!host) return;
    host.innerHTML = (connections || []).map(function (c) {
      return '<article class="integration-card" data-provider="' + esc(c.provider) + '">' +
        '<div class="integration-icon"><svg aria-hidden="true"><use href="#' + providerIcons[c.provider] + '"></use></svg></div>' +
        '<div class="integration-body"><div class="integration-title"><h3>' + esc(providerNames[c.provider]) + '</h3><span class="integration-state ' + (c.connected ? 'is-connected' : '') + '">' + (c.connected ? 'Connected' : 'Not connected') + '</span></div><p>' + esc(providerCopy[c.provider]) + '</p>' + integrationConfig(c) + '</div>' +
        '<button type="button" class="integration-action" data-integration-action="' + (c.connected ? 'disconnect' : 'connect') + '" data-provider="' + esc(c.provider) + '">' + (c.connected ? 'Disconnect' : 'Connect') + '</button>' +
      '</article>';
    }).join('');

    host.querySelectorAll('[data-integration-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        api('/api/integrations', { method: 'POST', body: { action: button.getAttribute('data-integration-action'), provider: button.getAttribute('data-provider') } })
          .then(function (data) { if (data.url) location.href = data.url; else loadIntegrations(); })
          .catch(function (err) { alert(err.message || 'Connection failed.'); button.disabled = false; });
      });
    });
    host.querySelectorAll('[data-integration-property]').forEach(function (select) {
      select.addEventListener('change', function () {
        var provider = select.getAttribute('data-integration-property');
        var body = { action: 'configure', provider: provider };
        if (provider === 'google_analytics') body.property_id = select.value;
        else body.organization_id = select.value;
        api('/api/integrations', { method: 'POST', body: body }).then(loadIntegrations).catch(function (err) { alert(err.message); });
      });
    });
    host.querySelectorAll('[data-integration-save="linkedin"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var card = button.closest('[data-provider="linkedin"]');
        var input = qs('[data-linkedin-page]', card);
        api('/api/integrations', { method: 'POST', body: { action: 'configure', provider: 'linkedin', organization_id: input && input.value } }).then(loadIntegrations).catch(function (err) { alert(err.message); });
      });
    });
  }

  function loadIntegrations() {
    api('/api/integrations', { method: 'GET' }).then(function (data) {
      renderIntegrations(data.connections || []);
    }).catch(function (err) {
      var host = qs('[data-integrations-list]');
      if (host) host.innerHTML = '<div class="daily-state">' + esc(err.message || 'Connections are unavailable.') + '</div>';
    });
  }

  function refresh(options) {
    options = options || {};
    api('/api/account', { method: 'GET' }).then(function (account) {
      renderAccount(account);
      if (options.generateDaily && account.workspace && account.workspace.full_report_status === 'completed') generateDaily(Boolean(options.scroll));
    }).catch(function (err) {
      var status = qs('[data-product-status]');
      if (status) status.textContent = err.message || 'Account status is unavailable.';
    });
  }

  function boot() {
    var refreshButton = qs('[data-daily-refresh]');
    if (refreshButton) refreshButton.addEventListener('click', function () { generateDaily(false); });
    // Delegated: the apply button is re-rendered on every renderAccount pass,
    // so binding it directly would go stale.
    var betaHost = qs('[data-beta]');
    if (betaHost) {
      betaHost.addEventListener('click', function (e) {
        var button = e.target.closest('[data-beta-apply]');
        if (button) applyForBeta(button);
      });
    }
    refresh();
  }

  window.GK_PRODUCT_REFRESH = refresh;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
