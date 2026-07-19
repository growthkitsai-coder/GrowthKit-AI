/* GrowthKit /four product state: entitlement, daily briefs, and integrations. */
(function () {
  'use strict';

  var dailyBusy = false;
  var accountCache = null;

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

  function renderAccount(account) {
    accountCache = account;
    var status = qs('[data-product-status]');
    var advisor = qs('[data-gk-advisor]');
    var daily = qs('[data-daily]');
    var access = account && account.access || {};
    var workspace = account && account.workspace;

    if (status) {
      if (!access.allowed) {
        status.innerHTML = '<span class="status-dot"></span>Free account · Pro required to generate reports';
      } else if (access.reason === 'beta-allowlist' || access.reason === 'beta-open') {
        status.innerHTML = '<span class="status-dot"></span>Beta Pro access · included until beta closes';
      } else {
        status.innerHTML = '<span class="status-dot"></span>Pro subscription · active';
      }
      if (workspace && workspace.company_name) {
        status.innerHTML += '<span class="status-company">Company · ' + esc(workspace.company_name) + '</span>';
      }
    }

    var fullDone = workspace && workspace.full_report_status === 'completed';
    var generating = workspace && workspace.full_report_status === 'generating';
    if (advisor) advisor.style.display = access.allowed && !fullDone && !generating ? '' : 'none';
    if (daily) daily.style.display = access.allowed && fullDone ? '' : 'none';
    if (fullDone) loadDaily(true);
    loadIntegrations();
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
    refresh();
  }

  window.GK_PRODUCT_REFRESH = refresh;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
