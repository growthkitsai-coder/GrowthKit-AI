/* GrowthKit /four — the workspace.
 *
 * Two loops, metered separately (see docs/daily-intelligence.md):
 *   • the FULL report  — the main deliverable, 2 per rolling 7 days
 *   • the DAILY update — a short one-click market delta, 1 per UTC day
 *
 * Before the first completed report /four is the marketing scroll it has always
 * been. The moment one exists this file adds .is-workspace to <body>, which
 * turns the page into an app shell: a left rail (bottom tab bar on mobile) over
 * six panes, with the deliverable as the prime focus and everything else a tap
 * away. Panes are markup in four.html; this file owns state and routing.
 */
(function () {
  'use strict';

  var PANES = ['deliverable', 'daily', 'plan', 'connections', 'history', 'billing'];

  var dailyBusy = false;
  var accountCache = null;
  var dailyRows = null;
  var allowanceTimer = null;
  var activePane = 'deliverable';
  var isWorkspace = false;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(value) {
    var url = String(value || '');
    return /^https:\/\//i.test(url) ? url : '';
  }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
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
          data.__status = r.status;
          return data;
        });
      });
    });
  }

  function todayUtc() { return new Date().toISOString().slice(0, 10); }

  /** "2d 04:11:07" — coarse enough to read, precise enough to feel live. */
  function countdown(msRemaining) {
    var seconds = Math.max(0, Math.floor(msRemaining / 1000));
    var days = Math.floor(seconds / 86400);
    var hh = String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0');
    var mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    var ss = String(seconds % 60).padStart(2, '0');
    return (days ? days + 'd ' : '') + hh + ':' + mm + ':' + ss;
  }

  // ── Pane routing ──────────────────────────────────────────────────────────

  function setPane(name, options) {
    if (PANES.indexOf(name) === -1) name = 'deliverable';
    activePane = name;
    qsa('[data-pane]').forEach(function (pane) {
      pane.classList.toggle('is-active', pane.getAttribute('data-pane') === name);
    });
    qsa('[data-pane-link]').forEach(function (link) {
      var on = link.getAttribute('data-pane-link') === name;
      link.classList.toggle('is-active', on);
      link.setAttribute('aria-current', on ? 'page' : 'false');
    });
    if (isWorkspace && !(options && options.silent)) {
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
      window.scrollTo({ top: 0, behavior: (options && options.instant) ? 'auto' : 'smooth' });
    }
    if (name === 'daily' && isWorkspace && dailyRows === null) loadDaily();
  }

  function paneFromHash() {
    var hash = String(location.hash || '').replace(/^#/, '');
    return PANES.indexOf(hash) !== -1 ? hash : null;
  }

  // ── Workspace chrome ──────────────────────────────────────────────────────

  function planLabel(access) {
    if (!access.allowed) return 'free account';
    if (access.reason === 'beta-allowlist' || access.reason === 'beta-open' || access.reason === 'beta-approved') return 'beta access';
    return (access.plan === 'agentic' ? 'agentic' : 'pro') + ' · active';
  }

  /**
   * Flip /four between the pre-first-report scroll and the workspace shell. The
   * only trigger is a completed report: `account.company` is the most recent
   * one, and the company the workspace follows.
   */
  function applyMode(account) {
    var company = account && account.company;
    isWorkspace = Boolean(company);
    document.body.classList.toggle('is-workspace', isWorkspace);

    var head = qs('[data-workspace-head]');
    var nav = qs('[data-workspace-nav]');
    if (head) head.hidden = !isWorkspace;
    if (nav) nav.hidden = !isWorkspace;
    show(qs('[data-welcome]'), !isWorkspace);
    show(qs('[data-guide]'), !isWorkspace);
    // The specimen is the empty state for the Deliverable pane — once there's a
    // real report to read, a sample of one is just noise.
    show(qs('[data-specimen]'), !isWorkspace);

    if (!isWorkspace) {
      // Everything back in one scroll, in the original order.
      qsa('[data-pane]').forEach(function (pane) { pane.classList.add('is-active'); });
      return;
    }

    var access = (account && account.access) || {};
    var nameEl = qs('[data-workspace-company]');
    var metaEl = qs('[data-workspace-meta]');
    var planEl = qs('[data-workspace-plan]');
    if (nameEl) nameEl.textContent = company.company_name || 'Your company';
    if (planEl) planEl.textContent = planLabel(access);
    if (metaEl) {
      var site = safeUrl(company.website);
      var host = '';
      if (site) { try { host = site.replace(/^https:\/\//i, '').replace(/\/.*$/, ''); } catch (e) {} }
      metaEl.innerHTML = (host ? '<a href="' + esc(site) + '" target="_blank" rel="noopener">' + esc(host) + '</a> · ' : '') +
        'Report cut ' + esc(String(company.report_date || '').slice(0, 10));
    }

    // In workspace mode the plan pill and billing controls belong under Billing,
    // not floating above the deliverable.
    var slot = qs('[data-billing-slot]');
    var billing = qs('[data-gk-billing]');
    var status = qs('[data-product-status]');
    if (slot && billing && billing.parentNode !== slot) slot.appendChild(billing);
    if (slot && status && status.parentNode !== slot) slot.appendChild(status);
  }

  function renderMeters(account) {
    var full = (account && account.full_report) || {};
    var allowance = full.allowance || {};
    var daily = (account && account.daily) || {};
    var access = (account && account.access) || {};

    var reportMeter = qs('[data-meter-report]');
    var reportValue = qs('[data-meter-report-value]');
    var reportNote = qs('[data-meter-report-note]');
    if (reportValue && reportNote) {
      var remaining = typeof allowance.remaining === 'number' ? allowance.remaining : 0;
      var limit = allowance.limit || 2;
      if (!access.allowed) {
        reportValue.textContent = 'Locked';
        reportNote.textContent = 'Pro or a beta grant generates reports';
      } else if (full.status === 'generating') {
        reportValue.textContent = 'Running';
        reportNote.textContent = 'A report is generating — open the Deliverable pane';
      } else {
        reportValue.textContent = remaining + ' of ' + limit;
        reportNote.textContent = remaining > 0
          ? 'left this week · any company'
          : 'used · ' + (allowance.next_available_at ? 'next on ' + String(allowance.next_available_at).slice(0, 10) : 'resets on a 7-day roll');
      }
      if (reportMeter) reportMeter.classList.toggle('is-ready', Boolean(access.allowed && remaining > 0 && full.status !== 'generating'));
    }

    var dailyMeter = qs('[data-meter-daily]');
    var dailyValue = qs('[data-meter-daily-value]');
    var dailyNote = qs('[data-meter-daily-note]');
    var dot = qs('[data-nav-daily-dot]');
    if (dailyValue && dailyNote) {
      if (daily.status === 'locked') {
        dailyValue.textContent = 'Locked';
        dailyNote.textContent = 'Cut your full report first';
      } else if (daily.status === 'completed') {
        dailyValue.textContent = 'Done';
        dailyNote.textContent = 'Today\'s update is ready to read';
      } else if (daily.status === 'generating') {
        dailyValue.textContent = 'Running';
        dailyNote.textContent = 'Preparing today\'s update';
      } else if (!access.allowed) {
        dailyValue.textContent = 'Locked';
        dailyNote.textContent = 'Pro or a beta grant unlocks daily updates';
      } else {
        dailyValue.textContent = 'Ready';
        dailyNote.textContent = 'One click · resets 00:00 UTC';
      }
      if (dailyMeter) dailyMeter.classList.toggle('is-ready', daily.status === 'none' && Boolean(access.allowed));
    }
    // Nudge toward the Daily pane only when there is something to do there.
    if (dot) dot.hidden = !(daily.status === 'none' && access.allowed);
  }

  /**
   * The allowance readout under the engine. Ticks toward the moment the next
   * full-report slot re-enters the rolling window. Presentation only — the
   * server's reserveReport check stays authoritative.
   */
  function renderAllowance(account) {
    var host = qs('[data-allowance]');
    var label = qs('[data-allowance-label]', host);
    if (!host || !label) return;
    if (allowanceTimer) { clearInterval(allowanceTimer); allowanceTimer = null; }

    var access = (account && account.access) || {};
    var full = (account && account.full_report) || {};
    var allowance = full.allowance || {};
    if (!access.allowed) { host.hidden = true; return; }
    host.hidden = false;

    var unlockAt = allowance.next_available_at ? new Date(allowance.next_available_at).getTime() : 0;

    function update() {
      if (full.status === 'generating') {
        host.classList.remove('is-counting');
        label.textContent = 'Report generating';
        return;
      }
      if (allowance.remaining > 0) {
        host.classList.remove('is-counting');
        label.textContent = allowance.remaining + ' of ' + allowance.limit + ' full reports left this week';
        return;
      }
      var remainingMs = unlockAt - Date.now();
      if (!unlockAt || remainingMs <= 0) {
        host.classList.remove('is-counting');
        label.textContent = 'Full report ready';
        if (allowanceTimer) { clearInterval(allowanceTimer); allowanceTimer = null; }
        return;
      }
      host.classList.add('is-counting');
      label.textContent = 'Next full report in ' + countdown(remainingMs);
    }
    update();
    if (allowance.remaining <= 0 && unlockAt) allowanceTimer = setInterval(update, 1000);
  }

  function renderStatus(account) {
    var status = qs('[data-product-status]');
    if (!status) return;
    var access = (account && account.access) || {};
    var full = (account && account.full_report) || {};
    var allowance = full.allowance || {};

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
      return;
    }

    if (access.reason === 'beta-allowlist' || access.reason === 'beta-open') {
      status.innerHTML = '<span class="status-dot"></span>Beta access · Pro included';
    } else if (access.reason === 'beta-approved') {
      var b = access.beta || account.beta || {};
      var left = typeof b.reports_remaining === 'number' ? b.reports_remaining : '?';
      status.innerHTML = '<span class="status-dot"></span>Beta access · ' + esc(left) +
        ' of ' + esc(b.reports_limit || 7) + ' full reports left';
    } else if (access.plan === 'agentic') {
      status.innerHTML = '<span class="status-dot"></span>Agentic subscription · active';
    } else {
      status.innerHTML = '<span class="status-dot"></span>Pro subscription · active';
    }
    status.innerHTML += '<span class="status-company">' +
      (allowance.remaining > 0
        ? esc(allowance.remaining) + ' of ' + esc(allowance.limit) + ' full reports left this week'
        : 'Weekly reports used — daily updates keep running') +
      '</span>';
  }

  function renderAccount(account) {
    accountCache = account;
    var access = (account && account.access) || {};
    var reports = (account && account.reports) || [];

    applyMode(account);
    renderStatus(account);
    renderMeters(account);
    renderAllowance(account);

    // Completed reports stay readable after access ends, so keep the engine
    // visible for anyone who has history even once generation locks.
    var advisor = qs('[data-gk-advisor]');
    if (advisor) advisor.style.display = (access.allowed || reports.length > 0) ? '' : 'none';
    show(qs('[data-locked-dashboard]'), !access.allowed);
    show(qs('[data-integrations]'), access.allowed);

    renderBeta(access, account);
    renderHistory(reports);
    renderDailyGate(account);
    // loadIntegrations re-renders the nudge from the live list; without access
    // it never runs, so clear it here in case access lapsed mid-session.
    if (access.allowed) loadIntegrations();
    else { var nudge = qs('[data-connect-nudge]'); if (nudge) nudge.hidden = true; }
    if (isWorkspace && dailyRows === null && activePane === 'daily') loadDaily();
    projectPlan();
  }

  /**
   * The report-history list: every completed report, newest first, each linking
   * to /four?report_id=… which advisor.js renders on load.
   */
  function renderHistory(reports) {
    var host = qs('[data-history]');
    var list = qs('[data-history-list]');
    var empty = qs('[data-history-empty]');
    if (!host || !list) return;
    var has = Boolean(reports && reports.length);
    show(host, has);
    // The empty note is workspace furniture — the pre-first-report scroll has
    // its own guide and shouldn't grow an extra placeholder.
    show(empty, !has && isWorkspace);
    if (!has) return;
    var current = '';
    try { current = new URLSearchParams(window.location.search).get('report_id') || ''; } catch (e) {}
    list.innerHTML = reports.map(function (r) {
      var date = String(r.report_date || '').slice(0, 10);
      return '<a class="report-history-item' + (r.id === current ? ' is-current' : '') +
        '" href="/four?report_id=' + encodeURIComponent(r.id) + '">' +
        '<span class="rh-company">' + esc(r.company_name || 'Report') + '</span>' +
        '<span class="rh-date">' + esc(date) + '</span></a>';
    }).join('');
  }

  /**
   * The beta panel. Applying grants nothing — a pending row waits for Avi to
   * approve it in /admin.html. Shown only to accounts without a paid
   * subscription; a subscriber has no reason to apply and api/beta.js refuses.
   */
  function renderBeta(access, account) {
    var host = qs('[data-beta]');
    if (!host) return;
    var body = qs('[data-beta-body]');
    var reason = access.reason;

    if (reason === 'subscription' || reason === 'beta-allowlist' || reason === 'beta-open') {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';

    if (access.allowed && reason === 'beta-approved') {
      var b = access.beta || (account && account.beta) || {};
      var until = b.expires_at ? new Date(b.expires_at) : null;
      var untilText = until && !isNaN(until.getTime()) ? until.toISOString().slice(0, 10) : '';
      body.innerHTML = '<p class="beta-live"><b>You\'re in the beta.</b> ' +
        esc(b.reports_remaining) + ' of ' + esc(b.reports_limit) + ' full reports left' +
        (untilText ? ', until <b>' + esc(untilText) + '</b>' : '') +
        '. Two full reports a week is the cadence, and daily updates are free of the counter. ' +
        'Whichever runs out first ends the beta — then it\'s Pro at £20/month.</p>';
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
      body.innerHTML = '<p>' + done + ' To keep cutting reports and daily updates, go Pro.</p>' +
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
      '<p>Beta testers get the full engine for a week — <b>two full reports a week</b> ' +
      'plus a <b>daily update</b> on what moved, up to 7 reports. Applications are approved by hand.</p>' +
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

  // ── The Plan pane ─────────────────────────────────────────────────────────

  /**
   * Lift the gap analysis and the 90-day plan out of the rendered deliverable
   * into the Plan pane. They are MOVED, not cloned: findings.js has already
   * bound checklist listeners to those nodes, and cloning would duplicate the
   * finding keys. advisor.js re-renders the deliverable on every pipeline tick,
   * so this re-runs on each gk:deliverable-rendered event.
   */
  function projectPlan() {
    var target = qs('[data-plan-projection]');
    if (!target || !isWorkspace) return;
    var deliverable = qs('[data-gk-deliverable]');
    var gaps = deliverable && qs('#gk-report-gaps', deliverable);
    var plan = deliverable && qs('#gk-report-plan', deliverable);
    if (!gaps && !plan) return;
    target.innerHTML = '';
    if (gaps) target.appendChild(gaps);
    if (plan) target.appendChild(plan);
  }

  // ── The daily update ──────────────────────────────────────────────────────

  function renderDailyGate(account) {
    var button = qs('[data-daily-generate]');
    var state = qs('[data-daily-state]');
    var daily = (account && account.daily) || {};
    var access = (account && account.access) || {};
    if (!button) return;

    var brief = qs('[data-daily-brief]');
    if (daily.status === 'locked') {
      button.disabled = true;
      button.textContent = 'Generate today\'s update';
      if (state && !(brief && brief.innerHTML)) {
        state.style.display = '';
        state.textContent = 'The daily update is a delta against your full report — cut that first and this unlocks.';
      }
      return;
    }
    if (!access.allowed) {
      button.disabled = true;
      button.textContent = 'Pro required';
      return;
    }
    button.disabled = daily.status === 'completed' || daily.status === 'generating';
    button.textContent = daily.status === 'completed'
      ? 'Today\'s update is in'
      : (daily.status === 'generating' ? 'Preparing…' : 'Generate today\'s update');
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
    var company = row.company_name || (accountCache && accountCache.company && accountCache.company.company_name) || '';
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
          company: company
        })
        : '';
      return '<li><span class="daily-priority">0' + esc(m.priority) + '</span><div><strong>' + esc(finding) + '</strong><span>' + esc(m.because) + '</span>' + work + '</div></li>';
    }).join('');
    // Optional blocks — normalizeBrief in lib/daily.js nulls these when the
    // model omitted them, so draw nothing rather than an empty panel.
    var founder = b.founder_to_talk_to;
    var founderUrl = founder ? safeUrl(founder.public_url) : '';
    var tool = b.tool_prompt;
    var twoUp = '';
    if (founder || tool) {
      twoUp = '<div class="daily-two-up">' +
        (founder ? '<div><h4>Founder to learn from today</h4><strong>' + esc(founder.name) + (founder.company ? ' · ' + esc(founder.company) : '') + '</strong><p>' + esc(founder.why_today) + '</p>' + (founderUrl ? '<a href="' + esc(founderUrl) + '" target="_blank" rel="noopener">View public profile ↗</a>' : '') + '</div>' : '') +
        (tool ? '<div><h4>Use GrowthKit next</h4><strong>' + esc(tool.tool) + '</strong><p>' + esc(tool.reason) + '</p><code>' + esc(tool.prompt) + '</code></div>' : '') +
        '</div>';
    }
    var sources = (b.sources || []).map(function (s) {
      var url = safeUrl(s.url);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(s.title || url) + ' ↗</a>' : '';
    }).join('');

    host.innerHTML = '<div class="daily-brief-meta"><span>' + esc(row.brief_date || b.brief_date) + ' · UTC' + (company ? ' · ' + esc(company) : '') + '</span><span class="daily-signal ' + (noChange ? 'is-quiet' : '') + '">' + (noChange ? 'No material change today' : 'Material change detected') + '</span></div>' +
      '<h3>' + esc(lead.headline || (noChange ? 'No material change today' : 'Today’s market signal')) + '</h3>' +
      '<p class="daily-lead">' + esc(lead.detail) + '</p>' +
      '<p class="daily-why">' + esc(lead.why_it_matters) + '</p>' +
      '<details><summary>See the full 30-second update</summary>' +
        (movement ? '<div class="daily-section"><h4>Market & competitor movement</h4><ul>' + movement + '</ul></div>' : '') +
        (metrics ? '<div class="daily-section"><h4>Your metrics</h4><ul class="daily-metrics">' + metrics + '</ul></div>' : '') +
        (signals ? '<div class="daily-section"><h4>Market signals</h4><ul>' + signals + '</ul></div>' : '') +
        '<div class="daily-section"><h4>Next ' + (b.next_moves || []).length + ' moves</h4><ol class="daily-moves">' + moves + '</ol></div>' +
        twoUp +
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
    (rows || []).filter(function (row) { return row.status === 'completed'; }).slice(1, 10).forEach(function (row) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.brief_date;
      button.title = row.company_name ? row.brief_date + ' · ' + row.company_name : row.brief_date;
      button.addEventListener('click', function () { renderBrief(row); });
      host.appendChild(button);
    });
  }

  function generateDaily() {
    if (dailyBusy) return;
    dailyBusy = true;
    var button = qs('[data-daily-generate]');
    var state = qs('[data-daily-state]');
    if (button) { button.disabled = true; button.classList.add('is-busy'); button.textContent = 'Scanning the market…'; }
    if (state) { state.style.display = ''; state.textContent = 'Scanning the market and your connected metrics…'; }
    api('/api/daily-briefs', { method: 'POST', body: {} }).then(function (data) {
      if (data.__status === 202) {
        if (state) state.textContent = 'Today\'s update is already being prepared — check back in a moment.';
        return;
      }
      if (data.brief) renderBrief(data.brief);
      loadDaily();
    }).catch(function (err) {
      if (state) { state.style.display = ''; state.textContent = err.message || 'Today\'s update could not be prepared.'; }
    }).finally(function () {
      dailyBusy = false;
      if (button) button.classList.remove('is-busy');
      refresh();
    });
  }

  function loadDaily() {
    return api('/api/daily-briefs', { method: 'GET' }).then(function (data) {
      dailyRows = data.briefs || [];
      var latest = dailyRows.filter(function (row) { return row.status === 'completed'; })[0];
      if (latest) renderBrief(latest);
      else {
        var state = qs('[data-daily-state]');
        var locked = accountCache && accountCache.daily && accountCache.daily.status === 'locked';
        if (state && !locked) {
          state.style.display = '';
          state.textContent = 'No update yet. Generate today\'s in one click — it takes about half a minute.';
        }
      }
      renderDailyHistory(dailyRows);
    }).catch(function (err) {
      dailyRows = [];
      var state = qs('[data-daily-state]');
      if (state) { state.style.display = ''; state.textContent = err.message || 'Daily updates are unavailable.'; }
    });
  }

  // ── Connections ───────────────────────────────────────────────────────────

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

  /**
   * The standing "add your connections" nudge under the panes. Driven by the
   * live connection list, and hidden once all three providers are connected —
   * a prompt to connect what you already connected is just noise.
   */
  function renderConnectNudge(connections) {
    var host = qs('[data-connect-nudge]');
    if (!host) return;
    var access = (accountCache && accountCache.access) || {};
    var list = connections || [];
    var missing = list.filter(function (c) { return !c.connected; });
    // Connections are a paid feature, so there is nothing to nudge a free
    // account toward here — the Pro card already makes that case.
    if (!access.allowed || !list.length || !missing.length) { host.hidden = true; return; }

    var note = qs('[data-connect-note]', host);
    if (note) {
      var names = missing.map(function (c) { return providerNames[c.provider] || c.provider; });
      var joined = names.length > 1
        ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
        : names[0];
      note.textContent = joined + (names.length > 1 ? ' feed' : ' feeds') +
        ' your real numbers into every report and daily update.';
    }
    host.hidden = false;
  }

  function loadIntegrations() {
    api('/api/integrations', { method: 'GET' }).then(function (data) {
      renderIntegrations(data.connections || []);
      renderConnectNudge(data.connections || []);
    }).catch(function (err) {
      var host = qs('[data-integrations-list]');
      if (host) host.innerHTML = '<div class="daily-state">' + esc(err.message || 'Connections are unavailable.') + '</div>';
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function refresh() {
    return api('/api/account', { method: 'GET' }).then(function (account) {
      renderAccount(account);
    }).catch(function (err) {
      var status = qs('[data-product-status]');
      if (status) status.textContent = err.message || 'Account status is unavailable.';
    });
  }

  function boot() {
    qsa('[data-pane-link]').forEach(function (link) {
      link.addEventListener('click', function () { setPane(link.getAttribute('data-pane-link')); });
    });
    window.addEventListener('hashchange', function () {
      var pane = paneFromHash();
      if (pane && isWorkspace) setPane(pane, { silent: true, instant: true });
    });

    var generate = qs('[data-daily-generate]');
    if (generate) generate.addEventListener('click', generateDaily);

    var connectCta = qs('[data-connect-cta]');
    if (connectCta) {
      connectCta.addEventListener('click', function () {
        if (isWorkspace) { setPane('connections'); return; }
        // Pre-report the panes are one scroll, so take them to the panel.
        var panel = qs('[data-integrations]');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // Delegated: the apply button is re-rendered on every renderAccount pass,
    // so binding it directly would go stale.
    var betaHost = qs('[data-beta]');
    if (betaHost) {
      betaHost.addEventListener('click', function (e) {
        var button = e.target.closest('[data-beta-apply]');
        if (button) applyForBeta(button);
      });
    }

    // The report's own section nav still lists Gaps and 90-day plan, but those
    // sections now live in the Plan pane — send the founder there instead of
    // scrolling to a node inside a hidden pane.
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('[data-gk-nav-stage]');
      if (!link || !isWorkspace) return;
      var stage = link.getAttribute('data-gk-nav-stage');
      if (stage === 'gap_analysis' || stage === 'plan') {
        e.preventDefault();
        setPane('plan');
      }
    });

    document.addEventListener('gk:deliverable-rendered', projectPlan);

    var initial = paneFromHash();
    if (initial) activePane = initial;
    refresh().then(function () {
      if (isWorkspace) setPane(activePane, { silent: true, instant: true });
    });
  }

  window.GK_PRODUCT_REFRESH = refresh;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
