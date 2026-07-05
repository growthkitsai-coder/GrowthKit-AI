/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit Live — the engine (shared, used on /four).
   Takes a company name (+ optional website / one-liner), streams /api/advise
   (which web-searches for real competitors and returns ONE JSON deliverable),
   shows a live progress log while it works, then renders the full specimen
   deliverable: subject brief, positioning, a plotted market-map SVG, a
   competitor teardown table, gap-analysis cards with score meters, a 90-day
   plan, and the sources it used. Handles presets, copy / share-link / PDF, and
   share-link prefill. Saves each deliverable to the signed-in user's account.
   No dependencies. ES5-style for broad browser support (no build step).

   Wire protocol from /api/advise: newline-delimited JSON (NDJSON), one object
   per line — {type:"status",stage:"search"|"writing",n} while it works, then a
   terminal {type:"done", deliverable:{…}} or {type:"error", message}.

   Markup contract — a root with [data-gk-advisor] containing:
     [data-gk-presets]  form[data-gk-form] with
       [data-gk-field="company"|"website"|"about"|"company_url"]
       [data-gk-submit]  [data-gk-error]
     [data-gk-output] with
       [data-gk-stream-wrap] > [data-gk-status], [data-gk-stream]
       [data-gk-deliverable]  [data-gk-actions]
   Root attr data-gk-full="1" → Save-as-PDF + share-link autorun.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var DASH = '\\u2014\\u2013\\u2012\\u2015\\-'; // legacy-read dash class (escaped unicode)

  // Real companies as example inputs for the QUICK read — the engine profiles
  // whatever you enter and finds ITS competitors, so presets are real names.
  var PRESETS = [
    { label: 'Jobber', company: 'Jobber', website: 'getjobber.com', competitors: 'ServiceTitan, Housecall Pro, FieldEdge', moves: '' },
    { label: 'Otter.ai', company: 'Otter.ai', website: 'otter.ai', competitors: 'Fireflies, Fathom, plus native Zoom/Teams summaries', moves: '' },
    { label: 'Ramp', company: 'Ramp', website: 'ramp.com', competitors: 'Brex, Bill.com, Airbase', moves: '' }
  ];

  // Long-onboarding profile — grouped, all optional. Single source of truth for
  // the form (advisor.js builds it), for collection, and for the text sent to
  // the engine. { k:key, l:label, ph:placeholder, t:1 → textarea }.
  var PROFILE_GROUPS = [
    { title: 'Company', fields: [
      { k: 'startup_name', l: 'Startup name', ph: 'e.g. Crewline' },
      { k: 'website', l: 'Website', ph: 'e.g. crewline.io' },
      { k: 'one_sentence', l: 'Your startup in one sentence', ph: 'What you do, in a line' },
      { k: 'how_long', l: 'How long have you been building it?', ph: 'e.g. 8 months' },
      { k: 'problem', l: 'What problem are you solving?', t: 1 },
      { k: 'industry', l: 'What industry?', ph: 'e.g. HVAC field service' },
      { k: 'stage', l: 'What stage is the product?', ph: 'idea / MVP / launched / scaling' }
    ] },
    { title: 'Team & founders', fields: [
      { k: 'founders', l: 'Solo founder or co-founders?', ph: 'e.g. 2 co-founders' },
      { k: 'employees', l: 'How many employees?', ph: 'e.g. 3' },
      { k: 'background', l: 'Founder background', ph: 'technical / repeat founder / non-technical' },
      { k: 'hours', l: 'Hours a week dedicated?', ph: 'e.g. full-time, 60h' }
    ] },
    { title: 'Product', fields: [
      { k: 'walkthrough', l: "Walk me through the product as if I'm the customer", t: 1 },
      { k: 'differentiator', l: 'The one thing you do better than anything else', t: 1 },
      { k: 'access', l: 'How do customers access it?', ph: 'web app / mobile / API / …' }
    ] },
    { title: 'Customers & ICP', fields: [
      { k: 'ideal_customer', l: 'Describe your ideal customer', t: 1 },
      { k: 'b2b', l: 'If B2B: company size, industry, buyer vs. user', t: 1 },
      { k: 'b2c', l: 'If B2C: age, income, lifestyle, where they hang out online', t: 1 },
      { k: 'customer_convos', l: 'Talked to customers? How many, and what did they say?', t: 1 }
    ] },
    { title: 'Traction', fields: [
      { k: 'users_signups', l: 'Users / signups', ph: 'e.g. 1,200 signups' },
      { k: 'mrr_arr', l: 'MRR and ARR', ph: 'e.g. $4k MRR' },
      { k: 'paying', l: 'Paying customers?', ph: 'e.g. 38' },
      { k: 'churn', l: 'Monthly churn', ph: 'how many leave each month' },
      { k: 'proof_point', l: 'Biggest proof point', t: 1 }
    ] },
    { title: 'Market & competition', fields: [
      { k: 'competitors', l: 'Top 3 competitors', t: 1 },
      { k: 'market_leader', l: 'Who is the market leader?', ph: 'e.g. ServiceTitan' },
      { k: 'adjacent', l: 'Any adjacent markets?' },
      { k: 'marketing_channels', l: 'Current marketing channels', t: 1 }
    ] },
    { title: 'Pricing & fundraising', fields: [
      { k: 'pricing_model', l: 'Pricing model', ph: 'e.g. $30/seat/mo' },
      { k: 'pricing_tested', l: 'Tested different pricing?', t: 1 },
      { k: 'raised_funding', l: 'Have you raised funding?', ph: 'e.g. pre-seed $300k' },
      { k: 'want_vc', l: 'Do you want to raise VC?', ph: 'yes / no / later' }
    ] }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Escape everything, then allow a literal <em>…</em> back through (titles use it).
  function richEm(s) {
    return esc(s).replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  }
  function pad2(n) { n = parseInt(n, 10); if (isNaN(n)) n = 0; return (n < 10 ? '0' : '') + n; }
  function para(t) { return esc(String(t || '').trim()).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, ' '); }
  // Like para(), but lets a literal <em>…</em> through (positioning may emphasize).
  function richPara(t) { return richEm(String(t || '').trim()).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, ' '); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Long onboarding: build / collect / serialize the profile ──
  function longFormHtml() {
    var h = '';
    for (var g = 0; g < PROFILE_GROUPS.length; g++) {
      var grp = PROFILE_GROUPS[g], fh = '';
      for (var i = 0; i < grp.fields.length; i++) {
        var f = grp.fields[i];
        var input = f.t
          ? '<textarea class="gk-input" data-gk-pfield="' + f.k + '" maxlength="600" placeholder="' + esc(f.ph || '') + '"></textarea>'
          : '<input class="gk-input" data-gk-pfield="' + f.k + '" maxlength="240" placeholder="' + esc(f.ph || '') + '" autocomplete="off">';
        fh += '<div class="gk-field-group"><label class="gk-label">' + esc(f.l) + '</label>' + input + '</div>';
      }
      h += '<details class="gk-group"' + (g === 0 ? ' open' : '') + '><summary class="gk-group-head">'
        + '<span class="gk-group-title">' + esc(grp.title) + '</span>'
        + '<span class="gk-group-n">' + grp.fields.length + ' fields</span>'
        + '<span class="gk-group-caret" aria-hidden="true">▾</span></summary>'
        + '<div class="gk-group-body">' + fh + '</div></details>';
    }
    return h;
  }
  function collectProfile(mount) {
    var out = {}, els = mount.querySelectorAll('[data-gk-pfield]');
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute('data-gk-pfield'), v = (els[i].value || '').trim();
      if (v) out[k] = v;
    }
    return out;
  }
  function prefillProfile(mount, data) {
    if (!data) return;
    var els = mount.querySelectorAll('[data-gk-pfield]');
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute('data-gk-pfield');
      if (data[k] != null) els[i].value = data[k];
    }
  }
  // Serialize the filled profile into the labelled text block sent to the engine.
  function profileToText(obj) {
    var out = [];
    for (var g = 0; g < PROFILE_GROUPS.length; g++) {
      var grp = PROFILE_GROUPS[g], seg = [];
      for (var i = 0; i < grp.fields.length; i++) {
        var f = grp.fields[i];
        if (obj[f.k]) seg.push('- ' + f.l + ': ' + obj[f.k]);
      }
      if (seg.length) { out.push(grp.title.toUpperCase(), seg.join('\n'), ''); }
    }
    return out.join('\n').trim();
  }

  // ── Market map: plot vendors into the specimen's SVG geometry ──
  // viewBox 0 0 880 560; plot area x:90→810 (720w), y:60(top)→480(bottom, 420h).
  // Input coords are 0–100: x = price (0 cheap → 100 dear), y = depth (0 → 100).
  function px(x) { return 90 + clamp(num(x), 0, 100) / 100 * 720; }
  function py(y) { return 480 - clamp(num(y), 0, 100) / 100 * 420; }

  function buildMap(m, subjectName) {
    if (!m) return '';
    var s = '<svg class="map-svg" viewBox="0 0 880 560" role="img" aria-label="Market map: price versus workflow depth, competitors plotted against the subject company.">';
    // gridlines
    var gx = [90, 270, 450, 630, 810], gy = [60, 165, 270, 375, 480];
    for (var i = 0; i < gx.length; i++) s += '<line class="gridline" x1="' + gx[i] + '" y1="60" x2="' + gx[i] + '" y2="480"/>';
    for (var j = 0; j < 4; j++) s += '<line class="gridline" x1="90" y1="' + gy[j] + '" x2="810" y2="' + gy[j] + '"/>';
    // axes + caps + labels
    s += '<line class="axis" x1="90" y1="480" x2="810" y2="480"/><line class="axis" x1="90" y1="60" x2="90" y2="480"/>';
    s += '<polygon class="axis-cap" points="810,475 822,480 810,485"/><polygon class="axis-cap" points="85,60 90,48 95,60"/>';
    s += '<text class="axis-label" x="450" y="530" text-anchor="middle">' + esc(m.x_axis || 'price per seat / month →') + '</text>';
    s += '<text class="axis-label" x="-270" y="40" transform="rotate(-90)" text-anchor="middle">' + esc(m.y_axis || 'workflow depth →') + '</text>';
    var ticks = (m.x_ticks && m.x_ticks.length === 5) ? m.x_ticks : ['$0', '$50', '$120', '$220', '$350+'];
    for (var k = 0; k < 5; k++) s += '<text class="tick-label" x="' + gx[k] + '" y="503" text-anchor="middle">' + esc(ticks[k]) + '</text>';
    // gap zone (x,y = bottom-left corner in 0–100)
    if (m.gap) {
      var gX = px(m.gap.x), gW = clamp(num(m.gap.w), 4, 100) / 100 * 720;
      var gBottom = py(m.gap.y), gH = clamp(num(m.gap.h), 4, 100) / 100 * 420, gY = gBottom - gH;
      if (gX + gW > 810) gW = 810 - gX; if (gY < 60) { gH -= (60 - gY); gY = 60; }
      s += '<rect class="gap-zone" x="' + gX.toFixed(0) + '" y="' + gY.toFixed(0) + '" width="' + gW.toFixed(0) + '" height="' + gH.toFixed(0) + '" rx="10"/>';
      s += '<text class="gap-label" x="' + (gX + 20).toFixed(0) + '" y="' + (gY + 30).toFixed(0) + '">' + esc(m.gap.label || 'the gap') + '</text>';
      if (m.gap.sub) s += '<text class="dot-sub" x="' + (gX + 20).toFixed(0) + '" y="' + (gY + 48).toFixed(0) + '">' + esc(m.gap.sub) + '</text>';
    }
    // competitors
    var v = (m.vendors || []).slice(0, 11);
    for (var d = 0; d < v.length; d++) {
      var cx = px(v[d].x), cy = py(v[d].y);
      var right = cx <= 660, lx = right ? cx + 17 : cx - 16, anc = right ? 'start' : 'end';
      s += '<circle class="dot" cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="8"/>';
      s += '<text class="dot-label" x="' + lx.toFixed(0) + '" y="' + (cy - 2).toFixed(0) + '" text-anchor="' + anc + '">' + esc(v[d].name) + '</text>';
      if (v[d].sub) s += '<text class="dot-sub" x="' + lx.toFixed(0) + '" y="' + (cy + 13).toFixed(0) + '" text-anchor="' + anc + '">' + esc(v[d].sub) + '</text>';
    }
    // the subject
    if (m.subject_point) {
      var sx = px(m.subject_point.x), sy = py(m.subject_point.y);
      s += '<circle class="you-ring" cx="' + sx.toFixed(0) + '" cy="' + sy.toFixed(0) + '" r="17"/>';
      s += '<circle class="you-dot" cx="' + sx.toFixed(0) + '" cy="' + sy.toFixed(0) + '" r="9"/>';
      s += '<text class="dot-label you-label" x="' + sx.toFixed(0) + '" y="' + (sy + 34).toFixed(0) + '" text-anchor="middle">' + esc(String(subjectName || 'YOU').toUpperCase()) + '</text>';
    }
    s += '</svg>';
    var legend = '<div class="map-legend"><span><i class="swatch s-comp"></i>competitor</span><span><i class="swatch s-you"></i>' + esc(subjectName || 'your company') + '</span><span><i class="swatch s-gap"></i>identified gap zone</span></div>';
    return '<div class="gk-map in"><div class="map-svg-wrap">' + s + '</div>' + legend + '</div>';
  }

  // ── Render the full JSON deliverable ──
  function renderDeliverable(d) {
    if (!d || !d.subject) return '';
    var n = 0;
    function label(t) { n++; return '<div class="gk-dv-label"><span class="gk-n">' + pad2(n) + '</span>' + esc(t) + '</div>'; }
    function sec(t, inner, cls) { return '<div class="gk-dv-sec ' + (cls || '') + '">' + label(t) + inner + '</div>'; }

    var html = '<div class="gk-dv">';

    // Header — subject brief + draft badge
    html += '<div class="gk-dv-head">'
      + '<div class="gk-dv-brief">'
      + '<div class="gk-dv-eyebrow"><span class="num">/</span>Deliverable · ' + esc(d.subject.segment || 'market read') + '</div>'
      + '<h2>' + esc(d.subject.name) + '</h2>'
      + (d.subject.one_liner ? '<p class="gk-dv-oneliner">' + esc(d.subject.one_liner) + '</p>' : '')
      + '</div>'
      + '<div class="gk-dv-badge" title="Generated from live web research — check key numbers before acting.">AI research draft — verify key numbers</div>'
      + '</div>';

    // 01 Positioning
    if (d.positioning) html += sec('Positioning read', '<div class="gk-pos"><p>' + richPara(d.positioning) + '</p></div>');

    // 02 Market map
    if (d.market_map) html += sec('Market map', buildMap(d.market_map, d.subject.name));

    // 03 Teardown
    if (d.teardown && d.teardown.length) {
      var rows = '<div class="tt-row tt-head"><div>Competitor</div><div>Wedge &amp; motion</div><div>Pricing</div><div>Where they\'re soft</div></div>';
      for (var i = 0; i < d.teardown.length; i++) {
        var t = d.teardown[i];
        rows += '<div class="tt-row">'
          + '<div class="c-name">' + esc(t.name) + (t.tag ? '<small>' + esc(t.tag) + '</small>' : '') + '</div>'
          + '<div class="c-body">' + esc(t.wedge) + '</div>'
          + '<div class="c-price">' + esc(t.price || '—') + (t.price_note ? '<small>' + esc(t.price_note) + '</small>' : '') + '</div>'
          + '<div class="c-soft"><strong>Soft underneath:</strong> ' + esc(t.soft) + '</div>'
          + '</div>';
      }
      html += sec('Competitor teardown', '<div class="gk-panel">' + rows + '</div>');
    }

    // 04 Gap analysis
    if (d.gaps && d.gaps.length) {
      var cards = '';
      for (var g = 0; g < d.gaps.length; g++) {
        var c = d.gaps[g], w = clamp(num(c.meter, 60), 0, 100);
        cards += '<div class="gap-card in" style="--w:' + w + '%">'
          + '<div class="ghost" aria-hidden="true">' + pad2(g + 1) + '</div>'
          + '<div class="top-row"><span class="tag">' + esc(c.tag || ('Gap ' + pad2(g + 1))) + '</span>'
          + (c.score ? '<span class="score">' + esc(c.score) + '<small>' + esc(c.score_label || 'score') + '</small></span>' : '') + '</div>'
          + '<h3>' + richEm(c.title) + '</h3>'
          + '<p>' + esc(c.body) + '</p>'
          + '<div class="gap-meter"><span>opening</span><span class="bar"><i></i></span><span>' + w + '</span></div>'
          + '</div>';
      }
      html += sec('Gap analysis', '<div class="gap-grid">' + cards + '</div>');
    }

    // 05 90-day plan
    if (d.plan && d.plan.length) {
      var plays = '';
      for (var p = 0; p < d.plan.length; p++) {
        var pl = d.plan[p];
        plays += '<div class="play">'
          + '<div class="p-num">' + pad2(p + 1) + '</div>'
          + '<div><h3>' + richEm(pl.title) + '</h3>' + (pl.body ? '<p>' + esc(pl.body) + '</p>' : '') + '</div>'
          + '<div class="p-meta">'
          + (pl.horizon ? '<div><b>When</b> ' + esc(pl.horizon) + '</div>' : '')
          + (pl.first_move ? '<div><b>First move</b> ' + esc(pl.first_move) + '</div>' : '')
          + (pl.kill ? '<div class="kill"><b>Kill criteria</b> ' + esc(pl.kill) + '</div>' : '')
          + '</div></div>';
      }
      html += sec('90-day plan', '<div class="play-list">' + plays + '</div>');
    }

    // 06 Sources + honesty note
    var footInner = '';
    if (d.citations && d.citations.length) {
      var cites = '';
      for (var s2 = 0; s2 < d.citations.length; s2++) {
        var ct = d.citations[s2], url = String(ct.url || '');
        if (!/^https?:\/\//i.test(url)) continue;
        var host = '';
        try { host = url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, ''); } catch (e) {}
        cites += '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow"><span class="cite-host">' + esc(host) + '</span>' + esc(ct.title || url) + '<span class="cite-arr">↗</span></a></li>';
      }
      if (cites) footInner += '<ul class="gk-cites">' + cites + '</ul>';
    }
    if (d.note) footInner += '<p class="gk-dv-honest">' + esc(d.note) + '</p>';
    if (footInner) html += sec('Sources & honesty', footInner, 'gk-dv-foot');

    html += '</div>';
    return html;
  }

  // ── Legacy: render an old-format text read (01/02/03/04 sections) ──
  // Kept so reads saved before the JSON deliverable still open cleanly.
  function parseLegacy(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    var re = /^[ \t]*(0[1-4])[ \t]*\/[ \t]*.+$/gm, marks = [], m;
    while ((m = re.exec(text)) !== null) marks.push({ key: m[1], start: m.index, end: re.lastIndex });
    if (marks.length < 2) return null;
    var secn = {};
    for (var i = 0; i < marks.length; i++) secn[marks[i].key] = text.slice(marks[i].end, (i + 1 < marks.length) ? marks[i + 1].start : text.length).trim();
    var stripRe = new RegExp('^[' + DASH + '\\*\\u2022]\\s+');
    var gaps = (secn['02'] || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      .filter(function (l) { return stripRe.test(l); }).map(function (l) { return l.replace(stripRe, '').trim(); });
    return { positioning: secn['01'] || '', gaps: gaps, plays: secn['03'] || '', addon: secn['04'] || '' };
  }
  function renderLegacy(raw) {
    var p = parseLegacy(raw);
    if (!p) return '<pre class="gk-stream" style="white-space:pre-wrap">' + esc(raw) + '</pre>';
    var h = '<div class="gk-dv">';
    if (p.positioning) h += '<div class="gk-dv-sec"><div class="gk-dv-label"><span class="gk-n">01</span>Positioning</div><div class="gk-pos"><p>' + para(p.positioning) + '</p></div></div>';
    if (p.gaps.length) {
      var cc = '';
      for (var i = 0; i < p.gaps.length; i++) cc += '<div class="gap-card in" style="--w:60%"><div class="top-row"><span class="tag">Gap ' + pad2(i + 1) + '</span></div><p>' + esc(p.gaps[i]) + '</p></div>';
      h += '<div class="gk-dv-sec"><div class="gk-dv-label"><span class="gk-n">02</span>Competitor gaps</div><div class="gap-grid">' + cc + '</div></div>';
    }
    if (p.plays) h += '<div class="gk-dv-sec"><div class="gk-dv-label"><span class="gk-n">03</span>Growth plays</div><div class="gk-pos"><p>' + para(p.plays) + '</p></div></div>';
    if (p.addon) h += '<div class="gk-dv-sec"><div class="gk-dv-label"><span class="gk-n">04</span>What the full teardown adds</div><div class="gk-pos"><p>' + para(p.addon) + '</p></div></div>';
    return h + '</div>';
  }

  // ── Init one engine instance ──
  function init(root) {
    if (root.__gkInit) return; root.__gkInit = true;
    var full = root.getAttribute('data-gk-full') === '1';
    var form = root.querySelector('[data-gk-form]');
    if (!form) return;
    var q = function (s) { return root.querySelector(s); };
    var field = function (nm) { return root.querySelector('[data-gk-field="' + nm + '"]'); };
    var submit = q('[data-gk-submit]');
    var submitLabel = submit ? (submit.querySelector('[data-gk-submit-label]') || submit) : null;
    var errorEl = q('[data-gk-error]');
    var statusEl = q('[data-gk-status]');
    var streamEl = q('[data-gk-stream]');
    var deliverableEl = q('[data-gk-deliverable]');
    var actionsEl = q('[data-gk-actions]');
    var presetsEl = q('[data-gk-presets]');
    // Onboarding chooser + panels (new). Degrade gracefully if absent.
    var modesEl = q('[data-gk-modes]');
    var consoleEl = q('[data-gk-console]');
    var shortPanel = q('[data-gk-panel="short"]');
    var longPanel = q('[data-gk-panel="long"]');
    var longMount = q('[data-gk-long-mount]');
    var loadedAt = Date.now();
    var running = false;
    var lastJson = null;   // the deliverable object (for save + actions)
    var currentMode = null;
    var profileLoaded = false;

    // Build the long-onboarding form once (so prefill has targets).
    if (longMount) longMount.innerHTML = longFormHtml();

    // Quick-read presets.
    if (presetsEl) {
      for (var i = 0; i < PRESETS.length; i++) {
        (function (preset) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'gk-preset';
          b.innerHTML = '<span class="gk-preset-tag">try</span>' + esc(preset.label);
          b.addEventListener('click', function () {
            if (field('company')) field('company').value = preset.company;
            if (field('website')) field('website').value = preset.website;
            if (field('competitors')) field('competitors').value = preset.competitors;
            if (field('moves')) field('moves').value = preset.moves;
            if (field('company')) field('company').focus();
          });
          presetsEl.appendChild(b);
        })(PRESETS[i]);
      }
    }

    // ── Mode chooser ──
    function setMode(m, opts) {
      opts = opts || {};
      currentMode = m;
      if (modesEl) modesEl.style.display = 'none';
      if (consoleEl) consoleEl.style.display = '';
      if (shortPanel) shortPanel.style.display = (m === 'short') ? '' : 'none';
      if (longPanel) longPanel.style.display = (m === 'long') ? '' : 'none';
      if (submitLabel) submitLabel.textContent = 'Generate deliverable';
      if (m === 'long') { ensureProfile(); if (!opts.silent) focusFirst(longMount); }
      else if (!opts.silent && field('company')) field('company').focus();
      if (window.va) window.va('event', { name: 'advisor_mode', data: { mode: m } });
    }
    function toChooser() {
      currentMode = null;
      if (consoleEl) consoleEl.style.display = 'none';
      if (modesEl) modesEl.style.display = '';
    }
    function focusFirst(scope) { try { var el = scope && scope.querySelector('input, textarea'); if (el) el.focus(); } catch (e) {} }

    var modeBtns = root.querySelectorAll('[data-gk-mode]');
    for (var mb = 0; mb < modeBtns.length; mb++) {
      (function (btn) { btn.addEventListener('click', function () { setMode(btn.getAttribute('data-gk-mode')); }); })(modeBtns[mb]);
    }
    var switchBtns = root.querySelectorAll('[data-gk-switch]');
    for (var sb = 0; sb < switchBtns.length; sb++) { switchBtns[sb].addEventListener('click', function () { toChooser(); }); }
    // No chooser in the markup → behave as a plain short console.
    if (!modesEl && consoleEl) { setMode('short', { silent: true }); }
    else if (!modesEl) { currentMode = 'short'; }

    // ── Saved profile (Supabase `profiles`) ──
    function getUid() {
      return (window.GKAuth && window.GKAuth.client)
        ? window.GKAuth.client.auth.getSession().then(function (s) { return (s && s.data && s.data.session && s.data.session.user) ? s.data.session.user.id : null; }).catch(function () { return null; })
        : Promise.resolve(null);
    }
    function ensureProfile() {
      if (profileLoaded || !longMount) return;
      profileLoaded = true;
      if (!(window.GKAuth && window.GKAuth.client)) return;
      getUid().then(function (uid) {
        if (!uid) return;
        try {
          window.GKAuth.client.from('profiles').select('data').eq('user_id', uid).maybeSingle().then(function (r) {
            if (r && !r.error && r.data && r.data.data) prefillProfile(longMount, r.data.data);
          });
        } catch (e) {}
      });
    }
    function saveProfile(obj) {
      if (!obj || !Object.keys(obj).length || !(window.GKAuth && window.GKAuth.client)) return;
      getUid().then(function (uid) {
        if (!uid) return;
        try { window.GKAuth.client.from('profiles').upsert({ user_id: uid, data: obj, updated_at: new Date().toISOString() }).then(function () {}); } catch (e) {}
      });
    }

    function setStatus(t) { if (statusEl) statusEl.innerHTML = t; }
    function log(line) { if (streamEl) { streamEl.textContent += (streamEl.textContent ? '\n' : '') + line; streamEl.scrollTop = streamEl.scrollHeight; } }
    function fail(msg) {
      root.classList.remove('is-running');
      if (errorEl) errorEl.textContent = msg;
      if (window.va) window.va('event', { name: 'advisor_error', data: { surface: full ? 'page' : 'home', message: String(msg).slice(0, 120) } });
    }

    function onStatus(evt) {
      if (evt.stage === 'search') {
        if (evt.n <= 1) { setStatus('scanning the web for competitors<span class="gk-blink">_</span>'); log('→ scanning the web for competitors…'); }
        else { setStatus('cross-checking sources · pass ' + evt.n + '<span class="gk-blink">_</span>'); log('→ cross-checking sources (pass ' + evt.n + ')…'); }
      } else if (evt.stage === 'writing') {
        setStatus('dissecting competitors · plotting the map<span class="gk-blink">_</span>');
        log('→ dissecting competitors, plotting the market map, drafting the plan…');
      }
    }

    async function run(opts) {
      opts = opts || {};
      if (running) return;
      var mode = currentMode || 'short';
      var company = '', website = '', competitors = '', moves = '', profileText = '', profileObj = null;
      if (mode === 'long') {
        profileObj = collectProfile(longMount);
        company = (profileObj.startup_name || '').trim();
        website = (profileObj.website || '').trim();
        profileText = profileToText(profileObj);
      } else {
        company = field('company') ? field('company').value.trim() : '';
        website = field('website') ? field('website').value.trim() : '';
        competitors = field('competitors') ? field('competitors').value.trim() : '';
        moves = field('moves') ? field('moves').value.trim() : '';
      }
      if (!company) {
        if (errorEl) errorEl.textContent = (mode === 'long') ? 'Add your startup name (top of the Company section) to generate a deliverable.' : 'Enter your company name to generate a deliverable.';
        if (mode === 'long') { if (longMount) { var sn = longMount.querySelector('[data-gk-pfield="startup_name"]'); if (sn) { var det = sn.closest('details'); if (det) det.open = true; sn.focus(); } } }
        else if (field('company')) field('company').focus();
        return;
      }
      if (errorEl) errorEl.textContent = '';
      running = true; lastJson = null;
      if (submit) submit.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Working…';
      if (streamEl) streamEl.textContent = '';
      if (deliverableEl) deliverableEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';
      root.classList.remove('is-done');
      root.classList.add('is-running');
      setStatus('reading your company<span class="gk-blink">_</span>');
      log('→ reading your company…');

      if (window.va) window.va('event', { name: 'advisor_run', data: { surface: full ? 'page' : 'home', mode: mode, hasWebsite: !!website, hasContext: !!(competitors || moves || profileText) } });

      var payload = {
        mode: mode, company: company, website: website,
        competitors: competitors, moves: moves, profile_text: profileText,
        company_url: field('company_url') ? field('company_url').value || '' : '',
        t: opts.auto ? '6000' : String(Date.now() - loadedAt)
      };

      try {
        var headers = { 'Content-Type': 'application/json' };
        try {
          if (window.GKAuth && window.GKAuth.client) {
            var sess = await window.GKAuth.client.auth.getSession();
            var tok = sess && sess.data && sess.data.session && sess.data.session.access_token;
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
          }
        } catch (e) {}

        var res = await fetch('/api/advise', { method: 'POST', headers: headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          var msg = 'The run failed — please try again.';
          try { var er = await res.json(); if (er && er.error) msg = er.error; } catch (e) {}
          throw new Error(msg);
        }
        if (!res.body) throw new Error('Streaming is not supported in this browser.');

        // Read NDJSON: split on newlines, JSON.parse each complete line.
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', done = false, terminalErr = null;
        for (;;) {
          var c = await reader.read();
          if (c.done) break;
          buf += dec.decode(c.value, { stream: true });
          var nl;
          while ((nl = buf.indexOf('\n')) !== -1) {
            var line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            var evt; try { evt = JSON.parse(line); } catch (e) { continue; }
            if (evt.type === 'status') onStatus(evt);
            else if (evt.type === 'done') { lastJson = evt.deliverable; done = true; }
            else if (evt.type === 'error') terminalErr = evt.message || 'Something went wrong.';
          }
        }

        if (terminalErr && !done) throw new Error(terminalErr);
        if (!done || !lastJson || !lastJson.subject) throw new Error('The engine returned an empty deliverable — give it another go.');

        if (deliverableEl) {
          deliverableEl.innerHTML = renderDeliverable(lastJson);
          root.classList.add('is-done'); // hides the progress log, reveals the deliverable
        }
        renderActions(company, website, competitors, moves);
        // Long mode: persist the profile so it pre-fills next time.
        if (mode === 'long') saveProfile(profileObj);
        saveRead(company, mode === 'long' ? (profileObj.competitors || '') : competitors, mode === 'long' ? '' : moves, lastJson);
        if (window.va) window.va('event', { name: 'advisor_complete', data: { surface: full ? 'page' : 'home', mode: mode, vendors: (lastJson.market_map && lastJson.market_map.vendors ? lastJson.market_map.vendors.length : 0) } });
      } catch (err) {
        fail((err && err.message) ? err.message : 'Something went wrong — please try again.');
      }

      running = false;
      if (submit) submit.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Run another';
      root.classList.remove('is-running');
    }

    // Persist to the signed-in user's account (Supabase `reads` table). Columns
    // reused: product=company (the history label), competitors + moves hold the
    // quick-read context, output=the deliverable JSON string.
    function saveRead(company, competitors, moves, deliverable) {
      if (!window.GK_SAVE_READS || !window.GKAuth || !window.GKAuth.client) return;
      try {
        window.GKAuth.client.from('reads').insert({
          product: company, competitors: competitors, moves: moves, output: JSON.stringify(deliverable)
        }).then(function (r) {
          if (!r || r.error) return;
          if (typeof window.GK_RELOAD_READS === 'function') window.GK_RELOAD_READS();
        });
      } catch (e) {}
    }

    function shareUrl(company, website, competitors, moves) {
      var qs = '?co=' + encodeURIComponent(company);
      if (website) qs += '&w=' + encodeURIComponent(website);
      if (competitors) qs += '&c=' + encodeURIComponent(competitors);
      if (moves) qs += '&m=' + encodeURIComponent(moves);
      return location.origin + '/four' + qs;
    }

    function renderActions(company, website, competitors, moves) {
      if (!actionsEl) return;
      actionsEl.innerHTML = '';
      var mk = function (lbl, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = 'gk-act ' + (cls || ''); b.innerHTML = lbl; actionsEl.appendChild(b); return b; };
      var cLink = mk('Copy share link');
      cLink.addEventListener('click', function () { copy(shareUrl(company, website, competitors, moves), cLink, 'Copy share link'); });
      var pdf = mk('Save as PDF');
      pdf.addEventListener('click', function () { window.print(); });
    }

    function copy(text, btn, original) {
      var done = function () { btn.innerHTML = 'Copied ✓'; setTimeout(function () { btn.innerHTML = original; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
      try { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e) {}
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

    // Share-link prefill (full page) → quick read, fill + auto-run.
    if (full) {
      try {
        var sp = new URLSearchParams(location.search), co = sp.get('co');
        if (co) {
          setMode('short', { silent: true });
          if (field('company')) field('company').value = co;
          if (sp.get('w') && field('website')) field('website').value = sp.get('w');
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

  // Render a previously-saved read into a container — used by /four's history
  // panel. New reads are the deliverable JSON; older reads are plain engine text.
  function renderInto(container, raw) {
    if (!container) return false;
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) {}
    if (obj && obj.subject) { container.innerHTML = renderDeliverable(obj); return true; }
    container.innerHTML = renderLegacy(raw || '');
    return true;
  }

  window.GKAdvisor = { init: init, render: renderInto };
})();
