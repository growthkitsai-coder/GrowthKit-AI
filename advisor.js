/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit Live — Advisor logic (shared).
   Streams /api/advise, then parses the read into a DESIGNED deliverable
   (positioning panel, competitor-gap cards, play cards). Handles presets,
   copy / share-link / print, and share-link prefill. No dependencies.

   Markup contract — a root with [data-gk-advisor] containing:
     [data-gk-presets]      (optional) preset buttons render here
     form[data-gk-form] with:
       [data-gk-field="product"|"competitors"|"moves"|"company_url"]
       [data-gk-submit]  [data-gk-error]
     [data-gk-output] with:
       [data-gk-stream-wrap] > [data-gk-status], [data-gk-stream]
       [data-gk-deliverable]
       [data-gk-actions]
   Root attrs: data-gk-full="1" → enables Save-as-PDF + share-link autorun.
   Auto-inits every [data-gk-advisor] on DOMContentLoaded.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PRESETS = [
    {
      label: 'HVAC field-service SaaS',
      product: "A scheduling and dispatch app for independent HVAC contractors — one- to five-person crews book jobs, dispatch techs, and invoice from their phone. ICP: owner-operators doing $200k–$2M/yr who currently run on whiteboards and texts.",
      competitors: "ServiceTitan (enterprise, expensive, long onboarding), Jobber, Housecall Pro, plus a few regional point tools.",
      moves: "Housecall Pro just launched an AI dispatcher; ServiceTitan keeps moving upmarket and raised prices; Jobber has been quiet on product."
    },
    {
      label: 'AI meeting notetaker',
      product: "An AI notetaker that joins calls, writes the summary, and pushes action items into the tools a team already uses. ICP: 10–50-person B2B sales and CS teams.",
      competitors: "Otter, Fireflies, Gong (enterprise), plus the native summaries now baked into Zoom and Teams.",
      moves: "Zoom and Teams are bundling AI summaries for free; Gong is pushing 'revenue intelligence' upmarket; Fireflies is competing on price."
    },
    {
      label: 'Bookkeeping for freelancers',
      product: "Automated bookkeeping and tax-set-aside for solo freelancers and creators — connects their bank, categorizes income, and tells them what to put away for tax. ICP: US 1099 earners making $40k–$200k.",
      competitors: "QuickBooks Solopreneur, Found, Lili, plus spreadsheets and 'my accountant'.",
      moves: "QuickBooks is pushing its solopreneur tier hard; Found raised and is expanding banking; a few new AI-tax startups just launched."
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { n = parseInt(n, 10); if (isNaN(n)) n = 0; return (n < 10 ? '0' : '') + n; }
  function para(text) { return esc(String(text || '').trim()).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, ' '); }

  // ── Parse the streamed plain-text read into structured sections ──
  function parseRead(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    var re = /^[ \t]*(0[1-4])[ \t]*\/[ \t]*.+$/gm;
    var marks = [], m;
    while ((m = re.exec(text)) !== null) marks.push({ key: m[1], start: m.index, end: re.lastIndex });
    if (marks.length < 2) return null;
    var sec = {};
    for (var i = 0; i < marks.length; i++) {
      var to = (i + 1 < marks.length) ? marks[i + 1].start : text.length;
      sec[marks[i].key] = text.slice(marks[i].end, to).trim();
    }
    var gaps = (sec['02'] || '').split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return /^[—–-]\s+/.test(l); })
      .map(function (l) { return l.replace(/^[—–-]\s+/, '').trim(); })
      .filter(Boolean);
    var plays = parsePlays(sec['03'] || '');
    var out = { positioning: sec['01'] || '', gaps: gaps, plays: plays, addon: sec['04'] || '' };
    if (!out.positioning && !gaps.length && !plays.length) return null;
    return out;
  }

  function parsePlays(block) {
    var re = /^[ \t]*Play[ \t]+(\d+)[ \t]*[—–-][ \t]*(.+)$/gm;
    var heads = [], m;
    while ((m = re.exec(block)) !== null) heads.push({ num: m[1], name: m[2].trim(), start: m.index, end: re.lastIndex });
    var out = [];
    for (var i = 0; i < heads.length; i++) {
      var body = block.slice(heads[i].end, (i + 1 < heads.length) ? heads[i + 1].start : block.length);
      out.push({
        num: heads[i].num, name: heads[i].name,
        why: grabLabel(body, 'Why now'),
        first: grabLabel(body, 'First move'),
        kill: grabLabel(body, 'Kill criteria')
      });
    }
    return out;
  }
  function grabLabel(body, label) {
    var r = new RegExp('[—–-]\\s*' + label + '\\s*:?\\s*(.+)', 'i');
    var mm = body.match(r);
    return mm ? mm[1].trim() : '';
  }

  // ── Render the designed deliverable ──
  function renderDeliverable(p) {
    var html = '', order = 0;
    function sec(label, inner, cls) {
      order++;
      return '<div class="gk-sec gk-reveal ' + (cls || '') + '" style="animation-delay:' + (order * 80) + 'ms">'
        + '<div class="gk-sec-label"><span class="gk-n">' + pad2(order) + '</span>' + esc(label) + '</div>'
        + inner + '</div>';
    }
    if (p.positioning) html += sec('Positioning', '<div class="gk-pos"><p>' + para(p.positioning) + '</p></div>');
    if (p.gaps.length) {
      var cards = '';
      for (var i = 0; i < p.gaps.length; i++) {
        cards += '<div class="gk-gap gk-reveal" style="animation-delay:' + (order * 80 + 120 + i * 70) + 'ms">'
          + '<span class="gk-gap-n">' + pad2(i + 1) + '</span>'
          + '<div class="gk-gap-tag">Gap ' + pad2(i + 1) + '</div>'
          + '<div class="gk-gap-body">' + esc(p.gaps[i]) + '</div></div>';
      }
      html += sec('Competitor gaps', '<div class="gk-gaps">' + cards + '</div>');
    }
    if (p.plays.length) {
      var pcards = '';
      for (var j = 0; j < p.plays.length; j++) {
        var pl = p.plays[j], rows = '';
        if (pl.why) rows += row('Why now', pl.why, '');
        if (pl.first) rows += row('First move', pl.first, '');
        if (pl.kill) rows += row('Kill criteria', pl.kill, 'gk-kill');
        pcards += '<div class="gk-play gk-reveal" style="animation-delay:' + (order * 80 + 120 + j * 80) + 'ms">'
          + '<div class="gk-play-badge">' + pad2(pl.num || (j + 1)) + '</div>'
          + '<div><div class="gk-play-name">' + esc(pl.name) + '</div>' + rows + '</div></div>';
      }
      html += sec('Growth plays', '<div class="gk-plays">' + pcards + '</div>');
    }
    if (p.addon) html += sec('What the full teardown adds', '<div class="gk-addon"><p>' + para(p.addon) + '</p></div>');
    return html;
  }
  function row(k, v, cls) {
    return '<div class="gk-play-row ' + (cls || '') + '"><div class="gk-play-k">' + esc(k) + '</div><div class="gk-play-v">' + esc(v) + '</div></div>';
  }

  // ── Init one advisor instance ──
  function init(root) {
    if (root.__gkInit) return; root.__gkInit = true;
    var full = root.getAttribute('data-gk-full') === '1';
    var form = root.querySelector('[data-gk-form]');
    if (!form) return;
    var q = function (sel) { return root.querySelector(sel); };
    var field = function (n) { return root.querySelector('[data-gk-field="' + n + '"]'); };
    var submit = q('[data-gk-submit]');
    var submitLabel = submit ? (submit.querySelector('[data-gk-submit-label]') || submit) : null;
    var errorEl = q('[data-gk-error]');
    var statusEl = q('[data-gk-status]');
    var streamEl = q('[data-gk-stream]');
    var deliverableEl = q('[data-gk-deliverable]');
    var actionsEl = q('[data-gk-actions]');
    var presetsEl = q('[data-gk-presets]');
    var loadedAt = Date.now();
    var running = false;
    var lastText = '';

    // Presets
    if (presetsEl) {
      for (var i = 0; i < PRESETS.length; i++) {
        (function (preset) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'gk-preset';
          b.innerHTML = '<span class="gk-preset-tag">try</span>' + esc(preset.label);
          b.addEventListener('click', function () {
            if (field('product')) field('product').value = preset.product;
            if (field('competitors')) field('competitors').value = preset.competitors;
            if (field('moves')) field('moves').value = preset.moves;
            if (field('product')) field('product').focus();
          });
          presetsEl.appendChild(b);
        })(PRESETS[i]);
      }
    }

    function setStatus(t) { if (statusEl) statusEl.innerHTML = t; }
    function fail(msg) {
      root.classList.remove('is-running');
      if (errorEl) errorEl.textContent = msg;
      if (window.va) window.va('event', { name: 'advisor_error', data: { surface: full ? 'page' : 'home', message: String(msg).slice(0, 120) } });
    }

    async function run(opts) {
      opts = opts || {};
      if (running) return;
      var product = field('product') ? field('product').value.trim() : '';
      if (!product) {
        if (errorEl) errorEl.textContent = 'Tell us what your product is and who it serves to get a read.';
        if (field('product')) field('product').focus();
        return;
      }
      if (errorEl) errorEl.textContent = '';
      running = true;
      if (submit) submit.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Reading…';
      if (streamEl) streamEl.textContent = '';
      if (deliverableEl) deliverableEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';
      root.classList.remove('is-done');
      root.classList.add('is-running');
      setStatus('analyzing your market<span class="gk-blink">_</span>');

      var competitors = field('competitors') ? field('competitors').value.trim() : '';
      var moves = field('moves') ? field('moves').value.trim() : '';
      if (window.va) window.va('event', { name: 'advisor_run', data: { surface: full ? 'page' : 'home', hasCompetitors: !!competitors, hasMoves: !!moves } });

      var payload = {
        product: product, competitors: competitors, moves: moves,
        company_url: field('company_url') ? field('company_url').value || '' : '',
        // share-link autoruns are legitimate humans — clear the min-fill gate
        t: opts.auto ? '6000' : String(Date.now() - loadedAt)
      };

      try {
        var res = await fetch('/api/advise', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!res.ok) {
          var msg = 'The read failed — please try again.';
          try { var d = await res.json(); if (d && d.error) msg = d.error; } catch (e) {}
          throw new Error(msg);
        }
        if (!res.body) throw new Error('Streaming is not supported in this browser.');
        setStatus('reading the field<span class="gk-blink">_</span>');
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        lastText = '';
        for (;;) {
          var c = await reader.read();
          if (c.done) break;
          var chunk = dec.decode(c.value, { stream: true });
          if (chunk) { lastText += chunk; if (streamEl) { streamEl.textContent = lastText; streamEl.scrollTop = streamEl.scrollHeight; } }
        }
        if (!lastText.trim()) throw new Error('The engine returned an empty read — give it another go.');

        var parsed = parseRead(lastText);
        if (parsed && deliverableEl) {
          deliverableEl.innerHTML = renderDeliverable(parsed);
          root.classList.add('is-done'); // hides the stream, reveals the deliverable
        } else {
          // Parsing fell through — keep the streamed text visible rather than fail.
          root.classList.remove('is-running');
        }
        renderActions(product, competitors, moves);
        if (window.va) window.va('event', { name: 'advisor_complete', data: { surface: full ? 'page' : 'home', chars: lastText.length, parsed: !!parsed } });
      } catch (err) {
        fail((err && err.message) ? err.message : 'Something went wrong — please try again.');
      }

      running = false;
      if (submit) submit.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Run another read';
      root.classList.remove('is-running');
    }

    function shareUrl(product, competitors, moves) {
      var base = location.origin + '/advisor';
      var qs = '?p=' + encodeURIComponent(product);
      if (competitors) qs += '&c=' + encodeURIComponent(competitors);
      if (moves) qs += '&m=' + encodeURIComponent(moves);
      return base + qs;
    }

    function renderActions(product, competitors, moves) {
      if (!actionsEl) return;
      actionsEl.innerHTML = '';
      var mk = function (label, cls) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'gk-act ' + (cls || '');
        b.innerHTML = label; actionsEl.appendChild(b); return b;
      };
      var copyText = mk('Copy read');
      copyText.addEventListener('click', function () { copy(lastText, copyText, 'Copy read'); });
      var copyLink = mk('Copy share link');
      copyLink.addEventListener('click', function () { copy(shareUrl(product, competitors, moves), copyLink, 'Copy share link'); });
      if (full) {
        var pdf = mk('Save as PDF');
        pdf.addEventListener('click', function () { window.print(); });
      } else {
        var a = document.createElement('a');
        a.className = 'gk-act gk-act-go'; a.href = shareUrl(product, competitors, moves);
        a.innerHTML = 'Open the full read <span class="gk-arr">↗</span>';
        actionsEl.appendChild(a);
      }
    }

    function copy(text, btn, original) {
      var done = function () { btn.innerHTML = 'Copied ✓'; setTimeout(function () { btn.innerHTML = original; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e) {}
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

    // Share-link prefill (full page only) → fill + auto-run.
    if (full) {
      try {
        var sp = new URLSearchParams(location.search);
        var pp = sp.get('p');
        if (pp && field('product')) {
          field('product').value = pp;
          if (sp.get('c') && field('competitors')) field('competitors').value = sp.get('c');
          if (sp.get('m') && field('moves')) field('moves').value = sp.get('m');
          run({ auto: true });
        }
      } catch (e) {}
    }
  }

  function boot() {
    var roots = document.querySelectorAll('[data-gk-advisor]');
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GKAdvisor = { init: init };
})();
