/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit Live — the engine (shared, used on /four).
   Runs a premium, adaptive multi-step ONBOARDING WIZARD (company → industry →
   stage → adaptive business-model → adaptive growth-focus → channels → optional
   sharpen → review), then streams /api/advise (which web-searches for real
   competitors and returns ONE JSON deliverable), shows a premium animated
   research sequence while it works, then renders the full specimen deliverable:
   subject brief, positioning, a plotted market-map SVG, a competitor teardown
   table, gap-analysis cards with score meters, a 90-day plan, and the sources.
   A one-screen "fast-track" path is available for people in a hurry. Handles
   copy / share-link / PDF, share-link prefill, and saves each deliverable +
   profile to the signed-in user's account. No dependencies. ES5-style for broad
   browser support (no build step).

   Wire protocol from /api/advise: newline-delimited JSON (NDJSON), one object
   per line — {type:"status",stage:"search"|"writing",n} while it works, then a
   terminal {type:"done", deliverable:{…}} or {type:"error", message}. The status
   events are ignored here — the loading sequence is scripted and honest: it
   animates until the real terminal event lands.

   Markup contract — a root with [data-gk-advisor] containing:
     form[data-gk-form] with [data-gk-wizard] (steps rendered here),
       [data-gk-field="company_url"] (honeypot), [data-gk-error]
     [data-gk-progress] with [data-gk-progress-fill], [data-gk-progress-label]
     [data-gk-output] with [data-gk-loading], [data-gk-deliverable], [data-gk-actions]
   Root attr data-gk-full="1" → Save-as-PDF + share-link autorun.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var DASH = '\\u2014\\u2013\\u2012\\u2015\\-'; // legacy-read dash class (escaped unicode)

  // Real companies as example fills for the first step — the engine profiles
  // whatever you enter and finds ITS competitors, so presets are real names.
  var PRESETS = [
    { label: 'Jobber', company: 'Jobber', website: 'getjobber.com' },
    { label: 'Otter.ai', company: 'Otter.ai', website: 'otter.ai' },
    { label: 'Ramp', company: 'Ramp', website: 'ramp.com' }
  ];

  // ── Wizard config — the single source of truth for the adaptive onboarding.
  // Answers are stored by key: single-choice holds an option VALUE, multi holds
  // an array of VALUES, text/textarea holds the string. Labels are resolved from
  // the option lists at serialize time, so the text sent to the engine reads in
  // plain English. Steps are one of: 'text' (company), 'single' (a full-screen
  // choice-card question, auto-advances), 'multi' (full-screen chips), 'group'
  // (a themed screen with several sub-fields — each single/multi/text/textarea),
  // or 'review'. The full ~25-question profile lives in the 'group' steps.
  var INDUSTRY_OPTS = [
    { v: 'saas', l: 'SaaS / B2B software', d: 'Software sold to other businesses' },
    { v: 'ecommerce', l: 'Ecommerce / DTC', d: 'Selling physical or digital goods online' },
    { v: 'marketplace', l: 'Marketplace / platform', d: 'Connecting buyers and sellers' },
    { v: 'fintech', l: 'Fintech', d: 'Payments, banking, lending or finance tools' },
    { v: 'consumer', l: 'Consumer app', d: 'A product people use in their personal life' },
    { v: 'services', l: 'Services / agency', d: 'Done-for-you or productized services' },
    { v: 'hardware', l: 'Hardware / physical', d: 'A physical product or device' },
    { v: 'other', l: 'Something else', d: 'The engine adapts as we go' }
  ];
  var STAGE_OPTS = [
    { v: 'prelaunch', l: 'Pre-launch', d: 'Still building — not live yet' },
    { v: 'early_users', l: 'Pre-revenue, early users', d: 'Live with users, not charging yet' },
    { v: 'early_rev', l: 'Early revenue', d: 'First paying customers' },
    { v: 'growing', l: 'Growing', d: 'Revenue climbing, repeatable' },
    { v: 'scaling', l: 'Scaling', d: 'Pouring fuel on what works' }
  ];
  // The business-model step adapts to the chosen industry.
  var MODEL_BY_INDUSTRY = {
    saas:        { title: 'How do you go to market?',       opts: [ { v: 'plg', l: 'Product-led / self-serve' }, { v: 'sales', l: 'Sales-led' }, { v: 'hybrid', l: 'Hybrid' }, { v: 'unsure', l: 'Still figuring it out' } ] },
    ecommerce:   { title: 'What best describes your model?', opts: [ { v: 'dtc', l: 'Single-brand DTC' }, { v: 'sub', l: 'Subscription / replenishment' }, { v: 'multi', l: 'Multi-brand or marketplace' }, { v: 'wholesale', l: 'Wholesale + DTC' } ] },
    marketplace: { title: 'Where is your harder side?',      opts: [ { v: 'supply', l: 'Supply-constrained' }, { v: 'demand', l: 'Demand-constrained' }, { v: 'balanced', l: 'Roughly balanced' }, { v: 'early', l: 'Just getting started' } ] },
    fintech:     { title: 'Who do you serve?',               opts: [ { v: 'consumer', l: 'Consumers' }, { v: 'smb', l: 'Small businesses' }, { v: 'enterprise', l: 'Enterprise' }, { v: 'infra', l: 'Infrastructure / API' } ] },
    consumer:    { title: 'How do you monetize?',            opts: [ { v: 'sub', l: 'Subscription' }, { v: 'ads', l: 'Ad-supported / free' }, { v: 'freemium', l: 'Freemium' }, { v: 'onetime', l: 'One-time purchase' } ] },
    services:    { title: 'How is the work packaged?',       opts: [ { v: 'productized', l: 'Productized service' }, { v: 'bespoke', l: 'Bespoke / custom' }, { v: 'retainer', l: 'Retainer' }, { v: 'project', l: 'Project-based' } ] },
    hardware:    { title: 'How do you sell it?',             opts: [ { v: 'dtc', l: 'Direct-to-consumer' }, { v: 'retail', l: 'Retail / distribution' }, { v: 'b2b', l: 'B2B / wholesale' }, { v: 'hybrid', l: 'Hybrid' } ] },
    other:       { title: 'How do you make money?',          opts: [ { v: 'sub', l: 'Subscription' }, { v: 'transactional', l: 'Transactional / per-use' }, { v: 'onetime', l: 'One-time sales' }, { v: 'unsure', l: 'Not sure yet' } ] }
  };
  var CHANNELS = { title: 'Which channels are you using today?', sub: 'Multi-select — even “nothing yet” is a useful signal.', opts: [
    { v: 'seo', l: 'SEO / content' }, { v: 'paid', l: 'Paid ads' }, { v: 'outbound', l: 'Outbound / sales' }, { v: 'social', l: 'Social / community' },
    { v: 'referral', l: 'Referrals / word of mouth' }, { v: 'partner', l: 'Partnerships' }, { v: 'marketplace', l: 'Marketplaces / app stores' }, { v: 'none', l: 'Nothing yet' } ] };
  // Option sets for the multiple-choice sub-fields inside the grouped steps.
  var OPT = {
    how_long:   [ { v: 'lt3', l: 'Under 3 months' }, { v: '3-6', l: '3–6 months' }, { v: '6-12', l: '6–12 months' }, { v: '1-2y', l: '1–2 years' }, { v: '2y+', l: '2+ years' } ],
    founders:   [ { v: 'solo', l: 'Solo founder' }, { v: '2', l: '2 co-founders' }, { v: '3+', l: '3+ co-founders' } ],
    employees:  [ { v: '0', l: 'Just us' }, { v: '2-5', l: '2–5' }, { v: '6-10', l: '6–10' }, { v: '11+', l: '11+' } ],
    background: [ { v: 'technical', l: 'Technical' }, { v: 'nontechnical', l: 'Non-technical' }, { v: 'repeat', l: 'Repeat founder' }, { v: 'domain', l: 'Domain expert' } ],
    hours:      [ { v: 'ft', l: 'Full-time' }, { v: 'pt', l: 'Part-time' }, { v: 'nights', l: 'Nights & weekends' } ],
    access:     [ { v: 'web', l: 'Web app' }, { v: 'mobile', l: 'Mobile app' }, { v: 'api', l: 'API' }, { v: 'physical', l: 'Physical product' }, { v: 'multiple', l: 'Multiple' } ],
    convos:     [ { v: 'many', l: 'Yes — many' }, { v: 'few', l: 'A few' }, { v: 'notyet', l: 'Not yet' } ],
    pricing:    [ { v: 'sub', l: 'Subscription' }, { v: 'seat', l: 'Per-seat' }, { v: 'usage', l: 'Usage-based' }, { v: 'onetime', l: 'One-time' }, { v: 'freemium', l: 'Freemium' }, { v: 'notset', l: 'Not set yet' } ],
    funding:    [ { v: 'boot', l: 'Bootstrapped' }, { v: 'preseed', l: 'Pre-seed' }, { v: 'seed', l: 'Seed' }, { v: 'seriesa', l: 'Series A+' }, { v: 'raising', l: 'Raising now' } ],
    want_vc:    [ { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }, { v: 'maybe', l: 'Maybe later' } ]
  };
  function modelCfg(a) { return MODEL_BY_INDUSTRY[a.industry] || MODEL_BY_INDUSTRY.other; }

  // The step sequence. title/sub/options may be functions of the answers so the
  // wizard adapts. Grouped steps carry `fields:[{k,l,type,options?,ph?}]`.
  var STEPS = [
    { id: 'company', kind: 'text' },
    { id: 'industry', kind: 'single', title: 'What industry are you in?', sub: 'This tunes every question that follows.', options: INDUSTRY_OPTS, slabel: 'Industry' },
    { id: 'stage', kind: 'single', title: 'What stage is the product?', sub: 'So the plan matches where you actually are.', options: STAGE_OPTS, slabel: 'Stage' },
    { id: 'nutshell', kind: 'group', title: 'Your startup in a nutshell', sub: 'The essentials — a line or two each is plenty.', fields: [
      { k: 'one_sentence', l: 'Your startup in one sentence', type: 'text', ph: 'What you do, in a line' },
      { k: 'problem', l: 'What problem are you solving?', type: 'textarea', ph: 'The pain you remove' },
      { k: 'how_long', l: 'How long have you been working on it?', type: 'single', options: OPT.how_long }
    ] },
    { id: 'team', kind: 'group', title: 'You & the team', sub: 'Who is building this.', fields: [
      { k: 'founders', l: 'Solo founder or co-founders?', type: 'single', options: OPT.founders },
      { k: 'employees', l: 'How many employees?', type: 'single', options: OPT.employees },
      { k: 'background', l: 'Founder background', type: 'multi', options: OPT.background },
      { k: 'hours', l: 'Hours a week dedicated?', type: 'single', options: OPT.hours }
    ] },
    { id: 'product', kind: 'group', title: 'The product', fields: [
      { k: 'walkthrough', l: "Walk me through the product as if I'm the customer", type: 'textarea', ph: 'From first click to the aha moment' },
      { k: 'access', l: 'How do customers access it?', type: 'single', options: OPT.access }
    ] },
    { id: 'customers', kind: 'group', title: 'Your customers', fields: [
      { k: 'ideal_customer', l: 'Describe your ideal customer', type: 'textarea', ph: 'Who they are, what they need' },
      { k: 'customer_convos', l: 'Have you talked to customers?', type: 'single', options: OPT.convos },
      { k: 'convos_detail', l: 'If so — how many, and what did they say?', type: 'textarea', ph: 'The signal you heard' }
    ] },
    { id: 'traction', kind: 'group', title: 'Traction', sub: 'Rough numbers are fine — skip what you do not have yet.', fields: [
      { k: 'users_signups', l: 'Users / signups', type: 'text', ph: 'e.g. 1,200 signups' },
      { k: 'mrr_arr', l: 'MRR and ARR', type: 'text', ph: 'e.g. $4k MRR' },
      { k: 'paying', l: 'Paying customers?', type: 'text', ph: 'e.g. 38' },
      { k: 'churn', l: 'Monthly churn (how many leave each month)', type: 'text', ph: 'e.g. ~5% / 6 accounts' },
      { k: 'proof_point', l: 'Your biggest proof point', type: 'textarea', ph: 'The thing that makes people believe' }
    ] },
    { id: 'market', kind: 'group', title: 'Market & competition', fields: [
      { k: 'competitors', l: 'Your top 3 competitors', type: 'textarea', ph: 'e.g. ServiceTitan, Housecall Pro, FieldEdge' },
      { k: 'market_leader', l: 'Who is the market leader?', type: 'text', ph: 'e.g. ServiceTitan' }
    ] },
    { id: 'model', kind: 'single', title: function (a) { return modelCfg(a).title; }, sub: 'Pick the closest — it sharpens the competitor cut.', options: function (a) { return modelCfg(a).opts; }, slabel: 'Business model / motion' },
    { id: 'pricing', kind: 'group', title: 'Pricing & funding', fields: [
      { k: 'pricing_model', l: 'Pricing model', type: 'single', options: OPT.pricing },
      { k: 'raised_funding', l: 'Have you raised funding?', type: 'single', options: OPT.funding },
      { k: 'want_vc', l: 'Do you want to raise VC?', type: 'single', options: OPT.want_vc }
    ] },
    { id: 'channels', kind: 'multi', title: CHANNELS.title, sub: CHANNELS.sub, options: CHANNELS.opts, slabel: 'Current marketing channels' },
    { id: 'review', kind: 'review', title: 'Ready when you are.', sub: 'A quick look before the engine runs.' }
  ];
  function stepById(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i]; return null; }

  // Premium loading — a scripted research sequence. Advances on a timer and
  // completes honestly when the real deliverable lands.
  var LOADING_PHRASES = [
    'Understanding your business…',
    'Reading your company website…',
    'Identifying your market…',
    'Analysing competitors…',
    'Mapping customer positioning…',
    'Detecting growth opportunities…',
    'Evaluating acquisition channels…',
    'Building your growth profile…',
    'Generating strategic recommendations…'
  ];
  var INDUSTRY_SHORT = { saas: 'SaaS', ecommerce: 'ecommerce', marketplace: 'marketplace', fintech: 'fintech', consumer: 'consumer-app', services: 'services', hardware: 'hardware' };

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
  function resolve(x, a) { return (typeof x === 'function') ? x(a) : x; }
  function hostOf(u) { try { return String(u).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]; } catch (e) { return u; } }
  function labelOf(opts, v) { for (var i = 0; i < opts.length; i++) if (opts[i].v === v) return opts[i].l; return ''; }
  function labelsOf(opts, arr) { var o = []; for (var i = 0; i < (arr || []).length; i++) { var l = labelOf(opts, arr[i]); if (l) o.push(l); } return o; }

  // ── Resolve a single answer to its human-readable value (for serialize + review).
  // Step-level single/multi read `options`; grouped sub-fields carry their own.
  function fieldValue(field, a) {
    var v = a[field.k];
    if (v == null || v === '' || (isArr(v) && !v.length)) return '';
    if (field.type === 'multi') return labelsOf(field.options, v).join(', ');
    if (field.type === 'single') return labelOf(field.options, v);
    return String(v); // text / textarea
  }
  function isArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }

  // ── Serialize the wizard answers into the labelled text sent to the engine.
  // company / website / competitors map to their own payload fields; every other
  // answer (all ~25 profile questions) becomes the FOUNDER PROFILE text, grouped
  // by section, well under the 8000-char cap.
  function answersToProfileText(a) {
    var out = [];
    // Step-level single/multi choices → one BUSINESS PROFILE block.
    var biz = [];
    for (var s = 0; s < STEPS.length; s++) {
      var st = STEPS[s];
      if ((st.kind === 'single' || st.kind === 'multi') && st.slabel) {
        var opts = resolve(st.options, a);
        var lab = (st.kind === 'multi') ? labelsOf(opts, a[st.id]).join(', ') : labelOf(opts, a[st.id]);
        if (lab) biz.push('- ' + st.slabel + ': ' + lab);
      }
    }
    if (biz.length) out.push('BUSINESS PROFILE', biz.join('\n'), '');
    // Grouped steps → one block each, under the step title.
    for (var g = 0; g < STEPS.length; g++) {
      var grp = STEPS[g];
      if (grp.kind !== 'group') continue;
      var lines = [];
      for (var f = 0; f < grp.fields.length; f++) {
        var fld = grp.fields[f];
        if (fld.k === 'competitors') continue; // rides in the payload `competitors` field
        var val = fieldValue(fld, a);
        if (val) lines.push('- ' + fld.l + ': ' + val);
      }
      if (lines.length) out.push(grp.title.toUpperCase(), lines.join('\n'), '');
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
        var work = window.GKFindings && Array.isArray(c.checklist) && c.checklist.length === 3
          ? window.GKFindings.shell({ findingKey: 'gap-' + pad2(g + 1), finding: c.title, nextMove: c.next_move, company: d.subject.name })
          : '';
        cards += '<div class="gap-card in" style="--w:' + w + '%">'
          + '<div class="ghost" aria-hidden="true">' + pad2(g + 1) + '</div>'
          + '<div class="top-row"><span class="tag">' + esc(c.tag || ('Gap ' + pad2(g + 1))) + '</span>'
          + (c.score ? '<span class="score">' + esc(c.score) + '<small>' + esc(c.score_label || 'score') + '</small></span>' : '') + '</div>'
          + '<h3>' + richEm(c.title) + '</h3>'
          + '<p>' + esc(c.body) + '</p>'
          + '<div class="gap-meter"><span>opening</span><span class="bar"><i></i></span><span>' + w + '</span></div>'
          + work
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
    var wizardEl = q('[data-gk-wizard]');
    var errorEl = q('[data-gk-error]');
    var progressEl = q('[data-gk-progress]');
    var progressFill = q('[data-gk-progress-fill]');
    var progressLabel = q('[data-gk-progress-label]');
    var loadingEl = q('[data-gk-loading]');
    var deliverableEl = q('[data-gk-deliverable]');
    var actionsEl = q('[data-gk-actions]');
    var restartBtn = q('[data-gk-restart]');
    var loadedAt = Date.now();
    var running = false;
    var lastJson = null;   // the deliverable object (for save + actions)
    var answers = {};      // wizard state
    var idx = 0;           // current visible-step index
    var touched = false;   // user has interacted (guards async prefill clobber)
    var profileLoaded = false;

    function visibleSteps() {
      var out = [];
      for (var i = 0; i < STEPS.length; i++) { var st = STEPS[i]; if (!st.when || st.when(answers)) out.push(st); }
      return out;
    }
    function stepIndexById(id) { var steps = visibleSteps(); for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return i; return -1; }

    // ── Render the current step ──
    function renderStep() {
      var steps = visibleSteps();
      idx = clamp(idx, 0, steps.length - 1);
      var step = steps[idx];
      // progress
      var pct = (idx + 1) / steps.length * 100;
      if (progressFill) progressFill.style.width = pct.toFixed(1) + '%';
      if (progressLabel) progressLabel.textContent = (step.kind === 'review') ? 'Review' : ('Step ' + (idx + 1) + ' of ' + steps.length);

      var h = '<div class="gk-step" data-step="' + step.id + '">';
      h += '<div class="gk-step-head"><h2 class="gk-step-title">' + richEm(resolve(step.title, answers) || '') + '</h2>';
      var sub = resolve(step.sub, answers);
      if (sub) h += '<p class="gk-step-sub">' + esc(sub) + '</p>';
      h += '</div>';
      h += '<div class="gk-step-body">' + bodyHtml(step) + '</div>';
      h += navHtml(step, steps.length);
      h += '</div>';
      wizardEl.innerHTML = h;
      wire(step);
    }

    function bodyHtml(step) {
      if (step.kind === 'text') return companyBody();
      if (step.kind === 'single') return choiceBody(step);
      if (step.kind === 'multi') return chipBody(step);
      if (step.kind === 'group') return groupBody(step);
      if (step.kind === 'review') return reviewBody();
      return '';
    }

    function companyBody() {
      var presets = '';
      for (var i = 0; i < PRESETS.length; i++) presets += '<button type="button" class="gk-preset" data-preset="' + i + '"><span class="gk-preset-tag">try</span>' + esc(PRESETS[i].label) + '</button>';
      return ''
        + '<div class="gk-presets" aria-label="Example companies">' + presets + '</div>'
        + '<div class="gk-field-group">'
        + '<label class="gk-label" for="gk-company">Your company name</label>'
        + '<input id="gk-company" class="gk-input" data-gk-input="company" maxlength="160" placeholder="e.g. Jobber" autocomplete="off" value="' + esc(answers.company || '') + '">'
        + '</div>'
        + '<div class="gk-field-group" style="margin-bottom:0;">'
        + '<label class="gk-label" for="gk-website">Website <span class="gk-opt">— optional, pins down which company</span></label>'
        + '<input id="gk-website" class="gk-input" data-gk-input="website" maxlength="300" placeholder="e.g. getjobber.com" autocomplete="off" value="' + esc(answers.website || '') + '">'
        + '</div>'
        + '<button type="button" class="gk-fasttrack" data-gk-fasttrack>In a hurry? Fast-track with just your company name <span class="gk-arr">→</span></button>';
    }

    function choiceBody(step) {
      var opts = resolve(step.options, answers) || [];
      var h = '<div class="gk-choices">';
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i], on = answers[step.id] === o.v;
        h += '<button type="button" class="gk-choice' + (on ? ' is-selected' : '') + '" data-v="' + esc(o.v) + '">'
          + '<span class="gk-choice-l">' + esc(o.l) + '</span>'
          + (o.d ? '<span class="gk-choice-d">' + esc(o.d) + '</span>' : '')
          + '<span class="gk-choice-tick" aria-hidden="true">✓</span>'
          + '</button>';
      }
      return h + '</div>';
    }

    function chipBody(step) {
      var opts = resolve(step.options, answers) || [], sel = answers[step.id] || [];
      var h = '<div class="gk-chips">';
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i], on = sel.indexOf(o.v) !== -1;
        h += '<button type="button" class="gk-chip' + (on ? ' is-selected' : '') + '" data-v="' + esc(o.v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(o.l) + '</button>';
      }
      return h + '</div>';
    }

    // A themed screen of several sub-questions (each single/multi/text/textarea).
    function groupBody(step) {
      var h = '';
      for (var i = 0; i < step.fields.length; i++) {
        var f = step.fields[i], val = esc(answers[f.k] || ''), ctrl = '';
        if (f.type === 'single' || f.type === 'multi') {
          var opts = f.options || [], sel = f.type === 'multi' ? (answers[f.k] || []) : null;
          ctrl = '<div class="gk-pills">';
          for (var o = 0; o < opts.length; o++) {
            var on = f.type === 'multi' ? (sel.indexOf(opts[o].v) !== -1) : (answers[f.k] === opts[o].v);
            ctrl += '<button type="button" class="gk-pill' + (on ? ' is-selected' : '') + '" data-field="' + esc(f.k) + '" data-ftype="' + f.type + '" data-v="' + esc(opts[o].v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(opts[o].l) + '</button>';
          }
          ctrl += '</div>';
        } else if (f.type === 'textarea') {
          ctrl = '<textarea class="gk-input" data-gk-input="' + f.k + '" maxlength="600" placeholder="' + esc(f.ph || '') + '">' + val + '</textarea>';
        } else {
          ctrl = '<input class="gk-input" data-gk-input="' + f.k + '" maxlength="240" placeholder="' + esc(f.ph || '') + '" autocomplete="off" value="' + val + '">';
        }
        h += '<div class="gk-qfield"><label class="gk-qlabel">' + esc(f.l) + '</label>' + ctrl + '</div>';
      }
      return h;
    }

    // Review lists every answered field, grouped by step, each row editable.
    function reviewBody() {
      var rows = [];
      var website = answers.website ? (' · ' + answers.website) : '';
      rows.push({ id: 'company', k: 'Company', v: (answers.company || '') + website });
      for (var s = 0; s < STEPS.length; s++) {
        var st = STEPS[s];
        if (st.kind === 'single' || st.kind === 'multi') {
          if (!st.slabel) continue;
          var opts = resolve(st.options, answers);
          var v = (st.kind === 'multi') ? labelsOf(opts, answers[st.id]).join(', ') : labelOf(opts, answers[st.id]);
          if (v) rows.push({ id: st.id, k: st.slabel, v: v });
        } else if (st.kind === 'group') {
          for (var f = 0; f < st.fields.length; f++) {
            var val = fieldValue(st.fields[f], answers);
            if (val) rows.push({ id: st.id, k: st.fields[f].l, v: val });
          }
        }
      }
      var h = '<div class="gk-review">';
      for (var i = 0; i < rows.length; i++) {
        h += '<div class="gk-review-row"><div class="gk-review-k">' + esc(rows[i].k) + '</div>'
          + '<div class="gk-review-v">' + esc(rows[i].v) + '</div>'
          + '<button type="button" class="gk-review-edit" data-edit="' + esc(rows[i].id) + '">Edit</button></div>';
      }
      h += '</div>';
      return h;
    }

    function navHtml(step, total) {
      var isReview = step.kind === 'review';
      var primaryLabel = isReview ? 'Generate deliverable' : 'Continue';
      var needPick = (step.kind === 'single' && !answers[step.id]) || (step.kind === 'text' && !(answers.company || '').trim());
      var h = '<div class="gk-nav">';
      h += (idx > 0) ? '<button type="button" class="gk-nav-back" data-gk-back>← Back</button>' : '<span class="gk-nav-spacer"></span>';
      h += '<button type="button" class="gk-run gk-nav-next" data-gk-next' + (needPick ? ' disabled' : '') + '>'
        + '<span>' + esc(primaryLabel) + '</span> <span class="gk-arr">→</span></button>';
      h += '</div>';
      return h;
    }

    // ── Wire the current step's interactions ──
    function wire(step) {
      touchOn();
      // nav
      var backBtn = wizardEl.querySelector('[data-gk-back]');
      if (backBtn) backBtn.addEventListener('click', back);
      var nextBtn = wizardEl.querySelector('[data-gk-next]');
      if (nextBtn) nextBtn.addEventListener('click', primary);

      if (step.kind === 'text') {
        // presets
        var pbtns = wizardEl.querySelectorAll('[data-preset]');
        for (var i = 0; i < pbtns.length; i++) (function (btn) {
          btn.addEventListener('click', function () {
            var p = PRESETS[parseInt(btn.getAttribute('data-preset'), 10)];
            answers.company = p.company; answers.website = p.website;
            var ci = wizardEl.querySelector('[data-gk-input="company"]'); if (ci) ci.value = p.company;
            var wi = wizardEl.querySelector('[data-gk-input="website"]'); if (wi) { wi.value = p.website; }
            setNextEnabled(true); if (ci) ci.focus();
          });
        })(pbtns[i]);
        // inputs
        bindInput('company', function () { setNextEnabled(!!(answers.company || '').trim()); });
        bindInput('website');
        var ft = wizardEl.querySelector('[data-gk-fasttrack]');
        if (ft) ft.addEventListener('click', function () {
          if (!(answers.company || '').trim()) { showError('Enter your company name to fast-track.'); focusInput('company'); return; }
          run({ fast: true });
        });
        focusInput('company');
      } else if (step.kind === 'single') {
        var cbtns = wizardEl.querySelectorAll('.gk-choice');
        for (var c = 0; c < cbtns.length; c++) (function (btn) {
          btn.addEventListener('click', function () {
            answers[step.id] = btn.getAttribute('data-v');
            var all = wizardEl.querySelectorAll('.gk-choice');
            for (var a = 0; a < all.length; a++) all[a].classList.remove('is-selected');
            btn.classList.add('is-selected');
            setNextEnabled(true);
            clearError();
            setTimeout(function () { if (!running) primary(); }, 200);
          });
        })(cbtns[c]);
      } else if (step.kind === 'multi') {
        if (!answers[step.id]) answers[step.id] = [];
        var mbtns = wizardEl.querySelectorAll('.gk-chip');
        for (var mm = 0; mm < mbtns.length; mm++) (function (btn) {
          btn.addEventListener('click', function () {
            var v = btn.getAttribute('data-v'), arr = answers[step.id], at = arr.indexOf(v);
            if (at === -1) arr.push(v); else arr.splice(at, 1);
            var on = arr.indexOf(v) !== -1;
            btn.classList.toggle('is-selected', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        })(mbtns[mm]);
      } else if (step.kind === 'group') {
        for (var f = 0; f < step.fields.length; f++) {
          var fk = step.fields[f];
          if (fk.type === 'text' || fk.type === 'textarea') bindInput(fk.k);
        }
        var pills = wizardEl.querySelectorAll('.gk-pill');
        for (var pi = 0; pi < pills.length; pi++) (function (btn) {
          btn.addEventListener('click', function () {
            var k = btn.getAttribute('data-field'), ftype = btn.getAttribute('data-ftype'), v = btn.getAttribute('data-v');
            touchOn();
            if (ftype === 'multi') {
              if (!answers[k]) answers[k] = [];
              var arr = answers[k], at = arr.indexOf(v);
              if (at === -1) arr.push(v); else arr.splice(at, 1);
              var on = arr.indexOf(v) !== -1;
              btn.classList.toggle('is-selected', on);
              btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            } else { // single (radio within the field)
              answers[k] = v;
              var sibs = wizardEl.querySelectorAll('.gk-pill[data-field="' + k + '"]');
              for (var s = 0; s < sibs.length; s++) {
                var isMe = sibs[s] === btn;
                sibs[s].classList.toggle('is-selected', isMe);
                sibs[s].setAttribute('aria-pressed', isMe ? 'true' : 'false');
              }
            }
          });
        })(pills[pi]);
      } else if (step.kind === 'review') {
        var ebtns = wizardEl.querySelectorAll('[data-edit]');
        for (var e = 0; e < ebtns.length; e++) (function (btn) {
          btn.addEventListener('click', function () {
            var si = stepIndexById(btn.getAttribute('data-edit'));
            if (si !== -1) { idx = si; renderStep(); }
          });
        })(ebtns[e]);
      }
    }

    function bindInput(key, extra) {
      var el = wizardEl.querySelector('[data-gk-input="' + key + '"]');
      if (!el) return;
      el.addEventListener('input', function () { answers[key] = el.value; touchOn(); if (extra) extra(); });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && el.tagName !== 'TEXTAREA') { ev.preventDefault(); primary(); }
      });
    }
    function focusInput(key) { try { var el = wizardEl.querySelector('[data-gk-input="' + key + '"]'); if (el) el.focus(); } catch (e) {} }
    function setNextEnabled(on) { var b = wizardEl.querySelector('[data-gk-next]'); if (b) b.disabled = !on; }
    function touchOn() { touched = true; }
    function showError(msg) { if (errorEl) errorEl.textContent = msg; }
    function clearError() { if (errorEl) errorEl.textContent = ''; }

    // ── Navigation ──
    function primary() {
      var steps = visibleSteps(), step = steps[idx];
      if (step.kind === 'review') { run(); return; }
      if (!validateStep(step)) return;
      captureInputs();
      clearError();
      idx++; renderStep();
    }
    function back() { if (idx > 0) { captureInputs(); idx--; renderStep(); } }
    function validateStep(step) {
      if (step.kind === 'text' && !(answers.company || '').trim()) { showError('Enter your company name to continue.'); focusInput('company'); return false; }
      if (step.kind === 'single' && !answers[step.id]) { showError('Pick one to continue.'); return false; }
      return true;
    }
    function captureInputs() {
      var els = wizardEl.querySelectorAll('[data-gk-input]');
      for (var i = 0; i < els.length; i++) answers[els[i].getAttribute('data-gk-input')] = els[i].value;
    }

    // ── Restart ──
    function restart(clear) {
      stopLoading(false);
      running = false;
      root.classList.remove('is-running'); root.classList.remove('is-done');
      if (deliverableEl) deliverableEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';
      clearError();
      if (clear) { answers = {}; touched = false; }
      idx = 0; renderStep();
      if (restartBtn) restartBtn.hidden = true;
      try { window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); } catch (e) {}
    }
    if (restartBtn) restartBtn.addEventListener('click', function () { restart(true); });

    // ── Saved profile (Supabase `profiles`) — pre-fills the wizard on return ──
    function getUid() {
      return (window.GKAuth && window.GKAuth.client)
        ? window.GKAuth.client.auth.getSession().then(function (s) { return (s && s.data && s.data.session && s.data.session.user) ? s.data.session.user.id : null; }).catch(function () { return null; })
        : Promise.resolve(null);
    }
    function ensureProfile() {
      if (profileLoaded || !(window.GKAuth && window.GKAuth.client)) return;
      profileLoaded = true;
      getUid().then(function (uid) {
        if (!uid) return;
        try {
          window.GKAuth.client.from('profiles').select('data').eq('user_id', uid).maybeSingle().then(function (r) {
            if (r && !r.error && r.data && r.data.data && !touched && idx === 0 && !running) {
              var saved = r.data.data;
              for (var k in saved) if (saved.hasOwnProperty(k) && answers[k] == null) answers[k] = saved[k];
              renderStep();
            }
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

    // ── Premium loading sequence ──
    var loadTimer = null, progTimer = null, loadIdx = 0, loadDone = false, progVal = 0;
    function reducedMotion() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
    function buildPhrases(ctx) {
      var p = LOADING_PHRASES.slice();
      if (ctx.website) p[1] = 'Reading ' + hostOf(ctx.website) + '…';
      if (ctx.industry && INDUSTRY_SHORT[ctx.industry]) p[3] = 'Analysing ' + INDUSTRY_SHORT[ctx.industry] + ' competitors…';
      return p;
    }
    function startLoading(ctx) {
      var phrases = buildPhrases(ctx || {});
      loadIdx = 0; loadDone = false; progVal = 0;
      var items = '';
      for (var i = 0; i < phrases.length; i++) items += '<li class="gk-load-item" data-i="' + i + '"><span class="gk-load-ic" aria-hidden="true"></span><span class="gk-load-tx">' + esc(phrases[i]) + '</span></li>';
      loadingEl.innerHTML = ''
        + '<div class="gk-load-head"><span class="gk-load-orb" aria-hidden="true"></span>'
        + '<span class="gk-load-title">Researching ' + esc(answers.company || 'your company') + '</span></div>'
        + '<ul class="gk-load-list">' + items + '</ul>'
        + '<div class="gk-load-bar"><i class="gk-load-fill" data-load-fill></i></div>';
      setActive(0);
      if (reducedMotion()) return; // static list; completes on done
      loadTimer = setInterval(function () {
        if (loadIdx < phrases.length - 1) { loadIdx++; setActive(loadIdx); }
      }, 2900);
      progTimer = setInterval(tickProg, 380);
    }
    function setActive(i) {
      var lis = loadingEl.querySelectorAll('.gk-load-item');
      for (var j = 0; j < lis.length; j++) {
        lis[j].classList.remove('is-active', 'is-done', 'is-pending');
        lis[j].classList.add(j < i ? 'is-done' : (j === i ? 'is-active' : 'is-pending'));
      }
    }
    function tickProg() {
      var target = loadDone ? 100 : 92;
      progVal += (target - progVal) * 0.055 + 0.35;
      if (progVal > target) progVal = target;
      var f = loadingEl.querySelector('[data-load-fill]'); if (f) f.style.width = progVal.toFixed(1) + '%';
    }
    function stopLoading(success) {
      loadDone = true;
      if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
      if (progTimer) { clearInterval(progTimer); progTimer = null; }
      if (success && loadingEl) {
        var lis = loadingEl.querySelectorAll('.gk-load-item');
        for (var j = 0; j < lis.length; j++) { lis[j].classList.remove('is-active', 'is-pending'); lis[j].classList.add('is-done'); }
        var f = loadingEl.querySelector('[data-load-fill]'); if (f) f.style.width = '100%';
      }
    }

    function fail(msg) {
      root.classList.remove('is-running');
      stopLoading(false);
      if (restartBtn) restartBtn.hidden = false;
      showError(msg);
      if (window.va) window.va('event', { name: 'advisor_error', data: { surface: full ? 'page' : 'home', message: String(msg).slice(0, 120) } });
    }

    // ── Run ──
    async function run(opts) {
      opts = opts || {};
      if (running) return;
      captureInputs();
      var fast = !!opts.fast || !!opts.auto;
      var mode = fast ? 'short' : 'wizard';
      var company = (answers.company || '').trim();
      var website = (answers.website || '').trim();
      var competitors = '', moves = '', profileText = '';
      if (!fast) { competitors = (answers.competitors || '').trim(); profileText = answersToProfileText(answers); }

      if (!company) {
        showError('Enter your company name to generate a deliverable.');
        idx = stepIndexById('company'); if (idx < 0) idx = 0; renderStep(); focusInput('company');
        return;
      }
      clearError();
      running = true; lastJson = null;
      root.classList.remove('is-done');
      root.classList.add('is-running');
      if (restartBtn) restartBtn.hidden = false;
      if (deliverableEl) deliverableEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';
      startLoading({ website: website, industry: answers.industry });

      if (window.va) window.va('event', { name: 'advisor_run', data: { surface: full ? 'page' : 'home', mode: mode, hasWebsite: !!website, hasContext: !!(competitors || profileText) } });

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
          try { var er = await res.json(); if (er && er.error) { msg = er.error; if (er.detail) msg += ' [' + (er.status || res.status) + ': ' + String(er.detail).slice(0, 200) + ']'; } } catch (e) {}
          throw new Error(msg);
        }
        if (!res.body) throw new Error('Streaming is not supported in this browser.');

        // Read NDJSON: split on newlines, JSON.parse each complete line. The
        // status events are ignored — the loading sequence is scripted.
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
            if (evt.type === 'done') { lastJson = evt.deliverable; done = true; }
            else if (evt.type === 'error') terminalErr = evt.message || 'Something went wrong.';
          }
        }

        if (terminalErr && !done) throw new Error(terminalErr);
        if (!done || !lastJson || !lastJson.subject) throw new Error('The run was cut off before it finished (the engine hit the server time limit). Try again — a well-known company usually completes faster.');

        stopLoading(true);
        await wait(520); // let the sequence settle to 100% before the reveal
        if (deliverableEl) {
          deliverableEl.innerHTML = renderDeliverable(lastJson);
          if (window.GKFindings) window.GKFindings.hydrate(deliverableEl, { scope: 'full_report' });
          root.classList.remove('is-running');
          root.classList.add('is-done'); // hides the wizard, reveals the deliverable
        }
        renderActions(company, website, competitors, moves);
        if (!fast) saveProfile(answers);
        saveRead(company, competitors, moves, lastJson);
        if (typeof window.GK_PRODUCT_REFRESH === 'function') window.GK_PRODUCT_REFRESH({ generateDaily: true });
        if (window.va) window.va('event', { name: 'advisor_complete', data: { surface: full ? 'page' : 'home', mode: mode, vendors: (lastJson.market_map && lastJson.market_map.vendors ? lastJson.market_map.vendors.length : 0) } });
      } catch (err) {
        fail((err && err.message) ? err.message : 'Something went wrong — please try again.');
      }
      running = false;
    }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

    function renderActions(company, website, competitors, moves) {
      if (!actionsEl) return;
      actionsEl.innerHTML = '';
      var mk = function (lbl, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = 'gk-act ' + (cls || ''); b.innerHTML = lbl; actionsEl.appendChild(b); return b; };
      var daily = mk('Open daily brief', 'gk-act-go');
      daily.addEventListener('click', function () {
        if (typeof window.GK_PRODUCT_REFRESH === 'function') window.GK_PRODUCT_REFRESH({ generateDaily: true, scroll: true });
      });
      var pdf = mk('Save as PDF');
      pdf.addEventListener('click', function () { window.print(); });
    }

    // Enter within the form (e.g. a text step) advances rather than reloading.
    form.addEventListener('submit', function (e) { e.preventDefault(); if (!running) primary(); });

    // First paint, then try to pre-fill from the saved profile.
    renderStep();
    ensureProfile();

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
    if (obj && obj.subject) {
      container.innerHTML = renderDeliverable(obj);
      if (window.GKFindings) window.GKFindings.hydrate(container, { scope: 'full_report' });
      return true;
    }
    container.innerHTML = renderLegacy(raw || '');
    return true;
  }

  window.GKAdvisor = { init: init, render: renderInto };
})();
