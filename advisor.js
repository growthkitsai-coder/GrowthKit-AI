/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit Live — the engine (shared, used on /four).
   Runs a premium, adaptive multi-step ONBOARDING WIZARD (company → industry →
   stage → adaptive business-model → adaptive growth-focus → channels → optional
   sharpen → review), then orchestrates the seven-stage /api/advise pipeline.
   Research searches the web once; later calls use its saved knowledge pack.
   Sections render and persist as they finish, producing the specimen deliverable:
   subject brief, positioning, a plotted market-map SVG, a competitor teardown
   table, gap-analysis cards with score meters, a 90-day plan, and the sources.
   A one-screen "fast-track" path is available for people in a hurry. Handles
   copy / share-link / PDF, share-link prefill, and saves each deliverable +
   profile to the signed-in user's account. No dependencies. ES5-style for broad
   browser support (no build step).

   Wire protocol from /api/advise: GET returns resumable pipeline state; POST with
   {stage} runs one dependency-ready section and returns the updated public state.
   The internal research output never reaches the browser. Each stage has its own
   timeout/error/retry state, while completed sections remain visible and saved.

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
    { v: 'aiml', l: 'AI / ML product', d: 'A model or AI-native product at the core' },
    { v: 'healthtech', l: 'Health / biotech', d: 'Care, wellness, medical or life sciences' },
    { v: 'edtech', l: 'Edtech', d: 'Learning, training or education' },
    { v: 'devtools', l: 'Developer tools / infra', d: 'APIs, infrastructure, tooling for builders' },
    { v: 'media', l: 'Media / content / creator', d: 'Content, publishing or the creator economy' },
    { v: 'services', l: 'Services / agency', d: 'Done-for-you or productized services' },
    { v: 'hardware', l: 'Hardware / physical', d: 'A physical product or device' },
    { v: 'other', l: 'Other', d: 'Tell us in a word' }
  ];
  var STAGE_OPTS = [
    { v: 'idea', l: 'Just an idea', d: 'Pre-build — validating the concept' },
    { v: 'prelaunch', l: 'Pre-launch', d: 'Still building — not live yet' },
    { v: 'early_users', l: 'Pre-revenue, early users', d: 'Live with users, not charging yet' },
    { v: 'early_rev', l: 'Early revenue', d: 'First paying customers' },
    { v: 'growing', l: 'Growing', d: 'Revenue climbing, repeatable' },
    { v: 'scaling', l: 'Scaling', d: 'Pouring fuel on what works' },
    { v: 'established', l: 'Established', d: 'Post-PMF, durable business' },
    { v: 'other', l: 'Other', d: 'Tell us in a word' }
  ];
  // The business-model step adapts to the chosen industry.
  var MODEL_BY_INDUSTRY = {
    saas:        { title: 'How do you go to market?',       opts: [ { v: 'plg', l: 'Product-led / self-serve' }, { v: 'sales', l: 'Sales-led' }, { v: 'hybrid', l: 'Hybrid' }, { v: 'community', l: 'Community-led' }, { v: 'unsure', l: 'Still figuring it out' }, { v: 'other', l: 'Other' } ] },
    ecommerce:   { title: 'What best describes your model?', opts: [ { v: 'dtc', l: 'Single-brand DTC' }, { v: 'sub', l: 'Subscription / replenishment' }, { v: 'multi', l: 'Multi-brand or marketplace' }, { v: 'wholesale', l: 'Wholesale + DTC' }, { v: 'retail', l: 'Retail / in-store' }, { v: 'other', l: 'Other' } ] },
    marketplace: { title: 'Where is your harder side?',      opts: [ { v: 'supply', l: 'Supply-constrained' }, { v: 'demand', l: 'Demand-constrained' }, { v: 'balanced', l: 'Roughly balanced' }, { v: 'managed', l: 'Managed marketplace' }, { v: 'early', l: 'Just getting started' }, { v: 'other', l: 'Other' } ] },
    fintech:     { title: 'Who do you serve?',               opts: [ { v: 'consumer', l: 'Consumers' }, { v: 'smb', l: 'Small businesses' }, { v: 'enterprise', l: 'Enterprise' }, { v: 'infra', l: 'Infrastructure / API' }, { v: 'other', l: 'Other' } ] },
    consumer:    { title: 'How do you monetize?',            opts: [ { v: 'sub', l: 'Subscription' }, { v: 'ads', l: 'Ad-supported / free' }, { v: 'freemium', l: 'Freemium' }, { v: 'iap', l: 'In-app purchases' }, { v: 'onetime', l: 'One-time purchase' }, { v: 'other', l: 'Other' } ] },
    services:    { title: 'How is the work packaged?',       opts: [ { v: 'productized', l: 'Productized service' }, { v: 'bespoke', l: 'Bespoke / custom' }, { v: 'retainer', l: 'Retainer' }, { v: 'project', l: 'Project-based' }, { v: 'other', l: 'Other' } ] },
    hardware:    { title: 'How do you sell it?',             opts: [ { v: 'dtc', l: 'Direct-to-consumer' }, { v: 'retail', l: 'Retail / distribution' }, { v: 'b2b', l: 'B2B / wholesale' }, { v: 'hybrid', l: 'Hybrid' }, { v: 'subscription', l: 'Hardware + subscription' }, { v: 'other', l: 'Other' } ] },
    other:       { title: 'How do you make money?',          opts: [ { v: 'sub', l: 'Subscription' }, { v: 'transactional', l: 'Transactional / per-use' }, { v: 'onetime', l: 'One-time sales' }, { v: 'unsure', l: 'Not sure yet' }, { v: 'other', l: 'Other' } ] }
  };
  var CHANNELS = { title: 'Which channels are you using today?', sub: 'Multi-select — even “nothing yet” is a useful signal.', opts: [
    { v: 'seo', l: 'SEO / content' }, { v: 'paid', l: 'Paid ads' }, { v: 'outbound', l: 'Outbound / sales' }, { v: 'social', l: 'Social / community' },
    { v: 'referral', l: 'Referrals / word of mouth' }, { v: 'partner', l: 'Partnerships' }, { v: 'marketplace', l: 'Marketplaces / app stores' }, { v: 'email', l: 'Email / lifecycle' },
    { v: 'events', l: 'Events / webinars' }, { v: 'influencer', l: 'Influencers / creators' }, { v: 'pr', l: 'PR / press' }, { v: 'none', l: 'Nothing yet' }, { v: 'other', l: 'Other' } ] };
  // Option sets for the multiple-choice sub-fields inside the grouped steps.
  var OPT = {
    how_long:   [ { v: 'lt3', l: 'Under 3 months' }, { v: '3-6', l: '3–6 months' }, { v: '6-12', l: '6–12 months' }, { v: '1-2y', l: '1–2 years' }, { v: '2-3y', l: '2–3 years' }, { v: '3y+', l: '3+ years' }, { v: 'other', l: 'Other' } ],
    founders:   [ { v: 'solo', l: 'Solo founder' }, { v: '2', l: '2 co-founders' }, { v: '3', l: '3 co-founders' }, { v: '4+', l: '4+ co-founders' }, { v: 'other', l: 'Other' } ],
    employees:  [ { v: '0', l: 'Just us' }, { v: '2-5', l: '2–5' }, { v: '6-10', l: '6–10' }, { v: '11-25', l: '11–25' }, { v: '26-50', l: '26–50' }, { v: '51+', l: '51+' }, { v: 'other', l: 'Other' } ],
    background: [ { v: 'technical', l: 'Technical' }, { v: 'nontechnical', l: 'Non-technical' }, { v: 'repeat', l: 'Repeat founder' }, { v: 'firsttime', l: 'First-time founder' }, { v: 'domain', l: 'Domain expert' }, { v: 'industry', l: 'Industry insider' }, { v: 'sales', l: 'Sales / GTM' }, { v: 'design', l: 'Design / product' }, { v: 'other', l: 'Other' } ],
    hours:      [ { v: 'ft', l: 'Full-time' }, { v: 'pt', l: 'Part-time' }, { v: 'nights', l: 'Nights & weekends' }, { v: 'side', l: 'Side project for now' }, { v: 'other', l: 'Other' } ],
    access:     [ { v: 'web', l: 'Web app' }, { v: 'mobile', l: 'Mobile app' }, { v: 'desktop', l: 'Desktop app' }, { v: 'api', l: 'API' }, { v: 'extension', l: 'Browser extension' }, { v: 'physical', l: 'Physical product' }, { v: 'multiple', l: 'Multiple' }, { v: 'other', l: 'Other' } ],
    convos:     [ { v: 'many', l: 'Yes — many' }, { v: 'few', l: 'A few' }, { v: 'ongoing', l: 'Constantly — it’s a habit' }, { v: 'notyet', l: 'Not yet' }, { v: 'other', l: 'Other' } ],
    pricing:    [ { v: 'sub', l: 'Subscription' }, { v: 'seat', l: 'Per-seat' }, { v: 'usage', l: 'Usage-based' }, { v: 'tiered', l: 'Tiered plans' }, { v: 'onetime', l: 'One-time' }, { v: 'freemium', l: 'Freemium' }, { v: 'commission', l: 'Commission / take-rate' }, { v: 'free', l: 'Free for now' }, { v: 'notset', l: 'Not set yet' }, { v: 'other', l: 'Other' } ],
    funding:    [ { v: 'boot', l: 'Bootstrapped' }, { v: 'angel', l: 'Angel / friends & family' }, { v: 'preseed', l: 'Pre-seed' }, { v: 'seed', l: 'Seed' }, { v: 'seriesa', l: 'Series A' }, { v: 'seriesb', l: 'Series B+' }, { v: 'grant', l: 'Grant / accelerator' }, { v: 'raising', l: 'Raising now' }, { v: 'other', l: 'Other' } ],
    want_vc:    [ { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }, { v: 'maybe', l: 'Maybe later' }, { v: 'raised', l: 'Already raised' }, { v: 'other', l: 'Other' } ]
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
  function hasOther(opts) { for (var i = 0; i < opts.length; i++) if (opts[i].v === 'other') return true; return false; }
  function otherOf(a, k) { return String(a[k + '__other'] || '').trim(); }
  function singleLabel(opts, a, k) { var v = a[k]; if (v == null || v === '') return ''; if (v === 'other') return otherOf(a, k) || 'Other'; return labelOf(opts, v); }
  function multiLabel(opts, a, k) { var arr = a[k] || [], o = []; for (var i = 0; i < arr.length; i++) { var lab = arr[i] === 'other' ? (otherOf(a, k) || 'Other') : labelOf(opts, arr[i]); if (lab) o.push(lab); } return o.join(', '); }

  // ── Resolve a single answer to its human-readable value (for serialize + review).
  // Step-level single/multi read `options`; grouped sub-fields carry their own.
  function fieldValue(field, a) {
    var v = a[field.k];
    if (v == null || v === '' || (isArr(v) && !v.length)) return '';
    if (field.type === 'multi') return multiLabel(field.options, a, field.k);
    if (field.type === 'single') return singleLabel(field.options, a, field.k);
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
        var lab = (st.kind === 'multi') ? multiLabel(opts, a, st.id) : singleLabel(opts, a, st.id);
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

  function buildEvidenceChart(series, title, unit) {
    var points = series && Array.isArray(series.points) ? series.points.slice(0, 12) : [];
    if (!series || series.available === false || points.length < 2) {
      return '<div class="gk-data-empty"><strong>' + esc(title) + '</strong><p>' + esc(series && (series.takeaway || series.methodology) || 'Comparable live data was not available for this market.') + '</p></div>';
    }
    var values = points.map(function (point) { return num(point.value, 0); });
    var min = Math.min.apply(Math, values), max = Math.max.apply(Math, values);
    if (min === max) { min = 0; max = max || 1; }
    var left = 54, right = 694, top = 24, bottom = 202;
    var coords = points.map(function (point, index) {
      var x = left + (points.length === 1 ? 0 : index / (points.length - 1) * (right - left));
      var y = bottom - ((num(point.value, 0) - min) / (max - min) * (bottom - top));
      return { x: x, y: y, label: point.label, value: point.value };
    });
    var line = coords.map(function (point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' ');
    var svg = '<svg class="gk-evidence-svg" viewBox="0 0 720 245" role="img" aria-label="' + esc(title) + '">';
    for (var g = 0; g < 4; g++) {
      var gy = top + g / 3 * (bottom - top);
      svg += '<line class="gk-chart-grid" x1="' + left + '" y1="' + gy.toFixed(1) + '" x2="' + right + '" y2="' + gy.toFixed(1) + '"/>';
    }
    svg += '<polyline class="gk-chart-line" points="' + line + '"/>';
    for (var i = 0; i < coords.length; i++) {
      var showLabel = coords.length <= 6 || i === 0 || i === coords.length - 1 || i % 3 === 0;
      svg += '<circle class="gk-chart-dot" cx="' + coords[i].x.toFixed(1) + '" cy="' + coords[i].y.toFixed(1) + '" r="4"/>';
      if (showLabel) svg += '<text class="gk-chart-label" x="' + coords[i].x.toFixed(1) + '" y="229" text-anchor="middle">' + esc(coords[i].label) + '</text>';
    }
    svg += '</svg>';
    return '<div class="gk-evidence-card"><div class="gk-evidence-head"><div><strong>' + esc(title) + '</strong><span>' + esc(series.period || '') + '</span></div><span>' + esc(unit || series.unit || 'index') + '</span></div>'
      + svg + '<p class="gk-evidence-takeaway">' + esc(series.takeaway || '') + '</p>'
      + (series.methodology ? '<small class="gk-method">' + esc(series.methodology) + '</small>' : '') + '</div>';
  }

  function buildFundingRadar(funding) {
    if (!funding || funding.available === false || !Array.isArray(funding.radar_axes) || funding.radar_axes.length !== 5 || !funding.radar_entities || !funding.radar_entities.length) return '';
    var axes = funding.radar_axes.slice(0, 5), entities = funding.radar_entities.slice(0, 4);
    var cx = 180, cy = 154, radius = 106;
    function polar(index, scale) {
      var angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
      return { x: cx + Math.cos(angle) * radius * scale, y: cy + Math.sin(angle) * radius * scale };
    }
    function polygon(scale) {
      var out = [];
      for (var i = 0; i < 5; i++) { var p = polar(i, scale); out.push(p.x.toFixed(1) + ',' + p.y.toFixed(1)); }
      return out.join(' ');
    }
    var svg = '<svg class="gk-radar-svg" viewBox="0 0 360 310" role="img" aria-label="Funding landscape radar">';
    for (var ring = 1; ring <= 4; ring++) svg += '<polygon class="gk-radar-grid" points="' + polygon(ring / 4) + '"/>';
    for (var a = 0; a < 5; a++) {
      var edge = polar(a, 1), lab = polar(a, 1.18);
      svg += '<line class="gk-radar-axis" x1="' + cx + '" y1="' + cy + '" x2="' + edge.x.toFixed(1) + '" y2="' + edge.y.toFixed(1) + '"/>';
      svg += '<text class="gk-radar-label" x="' + lab.x.toFixed(1) + '" y="' + lab.y.toFixed(1) + '" text-anchor="middle">' + esc(axes[a]) + '</text>';
    }
    for (var e = 0; e < entities.length; e++) {
      var vals = Array.isArray(entities[e].values) ? entities[e].values.slice(0, 5) : [];
      if (vals.length !== 5) continue;
      var pts = vals.map(function (value, index) {
        var p = polar(index, clamp(num(value, 0), 0, 100) / 100);
        return p.x.toFixed(1) + ',' + p.y.toFixed(1);
      }).join(' ');
      svg += '<polygon class="gk-radar-shape radar-' + e + '" points="' + pts + '"/>';
    }
    svg += '</svg>';
    var legend = '<div class="gk-radar-legend">';
    for (var l = 0; l < entities.length; l++) legend += '<span><i class="radar-' + l + '"></i>' + esc(entities[l].name) + '</span>';
    return '<div class="gk-radar">' + svg + legend + '</div></div>';
  }

  function metricNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
  }
  function metricMoney(minor, currency) {
    var n = Number(minor);
    if (!isFinite(n)) return '—';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency || 'GBP').toUpperCase(), maximumFractionDigits: 0 }).format(n / 100); }
    catch (e) { return metricNumber(n / 100) + ' ' + String(currency || '').toUpperCase(); }
  }
  function renderWeeklyMetrics(metrics) {
    metrics = metrics || {};
    if (metrics._error) {
      return '<div class="gk-data-empty"><strong>Weekly metrics</strong><p>' + esc(metrics._error) + ' Reconnect or retry this section to capture fresh values.</p></div>';
    }
    var providers = [
      { key: 'stripe', name: 'Stripe' },
      { key: 'google_analytics', name: 'Google Analytics' },
      { key: 'linkedin', name: 'LinkedIn' }
    ];
    var cards = '';
    for (var i = 0; i < providers.length; i++) {
      var entry = metrics[providers[i].key];
      if (!entry || !entry.connected) continue;
      if (entry.error) {
        cards += '<article class="gk-metric-provider"><div class="gk-metric-provider-head"><strong>' + esc(providers[i].name) + '</strong><span>Needs attention</span></div><p class="gk-metric-error">' + esc(entry.error) + '</p></article>';
        continue;
      }
      var data = entry.data || {}, cells = '';
      if (providers[i].key === 'stripe') {
        cells += '<div><span>New customers · 7d</span><strong>' + metricNumber(data.signups_7d) + '</strong></div>';
        cells += '<div><span>Revenue · 7d</span><strong>' + metricMoney(data.revenue_7d_minor, data.currency) + '</strong></div>';
        cells += '<div><span>Subscription churn · 7d</span><strong>' + metricNumber(data.churned_subscriptions_7d) + '</strong></div>';
      } else if (providers[i].key === 'google_analytics') {
        var total = data.seven_day_total || {};
        cells += '<div><span>Active users · 7d</span><strong>' + metricNumber(total.active_users) + '</strong></div>';
        cells += '<div><span>Sessions · 7d</span><strong>' + metricNumber(total.sessions) + '</strong></div>';
        cells += '<div><span>New users · 7d</span><strong>' + metricNumber(total.new_users) + '</strong></div>';
      } else {
        cells += '<div><span>Followers gained · 7d</span><strong>' + metricNumber(data.seven_day_followers_gained) + '</strong></div>';
        cells += '<div><span>Impressions · 7d</span><strong>' + metricNumber(data.seven_day_impressions) + '</strong></div>';
        cells += '<div><span>Clicks · 7d</span><strong>' + metricNumber(data.seven_day_clicks) + '</strong></div>';
      }
      cards += '<article class="gk-metric-provider"><div class="gk-metric-provider-head"><strong>' + esc(providers[i].name) + '</strong><span>Connected · live snapshot</span></div><div class="gk-metric-grid">' + cells + '</div></article>';
    }
    return cards
      ? '<div class="gk-weekly-metrics"><div class="gk-subhead"><span>First-party evidence</span><h3>Weekly metrics</h3><p>Captured directly from every configured connection when this report was generated.</p></div>' + cards + '</div>'
      : '<div class="gk-data-empty"><strong>Weekly metrics</strong><p>No data connections were configured when this report was generated.</p></div>';
  }

  // ── Render the full or partially completed JSON deliverable ──
  function renderDeliverable(d, pipeline) {
    d = d || {};
    pipeline = pipeline || {};
    var stageState = pipeline.stages || {};
    var workspace = pipeline.workspace || {};
    var n = 0;
    function label(t) { n++; return '<div class="gk-dv-label"><span class="gk-n">' + pad2(n) + '</span>' + esc(t) + '</div>'; }
    function pending(stage, title) {
      var state = stageState[stage] || { status: 'pending' };
      var message = state.status === 'failed'
        ? esc(state.error || 'This section did not finish.')
        : state.status === 'generating' ? 'Generating this section…' : 'Waiting for the required analysis…';
      return '<div class="gk-section-state is-' + esc(state.status) + '"><span class="gk-section-state-icon" aria-hidden="true"></span><div><strong>' + esc(title) + '</strong><p>' + message + '</p></div>'
        + (state.status === 'failed' ? '<button type="button" class="gk-section-retry" data-gk-retry="' + esc(stage) + '">Try again</button>' : '') + '</div>';
    }
    function sec(id, stage, title, inner, cls) {
      return '<section id="gk-report-' + id + '" data-gk-report-section="' + esc(stage) + '" class="gk-dv-sec ' + (cls || '') + '">' + label(title) + (inner || pending(stage, title)) + '</section>';
    }
    function navItem(id, stage, title) {
      var inferred = (stage === 'subject_positioning' && d.subject && d.positioning)
        || (stage === 'market_map' && d.market_map)
        || (stage === 'competitor_teardown' && d.teardown)
        || (stage === 'gap_analysis' && d.gaps)
        || (stage === 'opportunity' && d.market_opportunity)
        || (stage === 'strategy_timing' && d.gtm_strategy && d.window_of_opportunity)
        || (stage === 'capital_metrics' && d.funding_landscape)
        || (stage === 'plan' && d.plan)
        || (stage === 'sources' && d.citations);
      var status = stageState[stage] && stageState[stage].status || (inferred ? 'completed' : 'pending');
      return '<a href="#gk-report-' + id + '" data-gk-nav-stage="' + esc(stage) + '" class="is-' + esc(status) + '"><span aria-hidden="true"></span>' + esc(title) + '</a>';
    }

    var subject = d.subject || {};
    var subjectName = subject.name || workspace.company_name || 'Your company';
    var expandedReport = Boolean(d.market_opportunity || d.gtm_strategy || d.funding_landscape ||
      (stageState.opportunity && stageState.opportunity.status !== 'not_applicable'));
    var html = '<div class="gk-dv"><div class="gk-report-layout"><aside class="gk-report-nav" aria-label="Report sections"><div class="gk-report-nav-title">First report</div>'
      + navItem('overview', 'subject_positioning', 'Overview')
      + (expandedReport ? navItem('opportunity', 'opportunity', 'Market opportunity') : '')
      + navItem('market', 'market_map', 'Market map')
      + navItem('competitors', 'competitor_teardown', 'Competitors')
      + navItem('gaps', 'gap_analysis', 'Gaps & next moves')
      + (expandedReport ? navItem('strategy', 'strategy_timing', 'GTM + timing') : '')
      + navItem('plan', 'plan', '90-day plan')
      + (expandedReport ? navItem('capital', 'capital_metrics', 'Funding + metrics') : '')
      + navItem('sources', 'sources', 'Sources')
      + '</aside><div class="gk-report-content">';

    // Header — company identity + draft badge
    html += '<div class="gk-dv-head">'
      + '<div class="gk-dv-brief">'
      + '<div class="gk-dv-eyebrow"><span class="num">/</span>Deliverable · ' + esc(subject.segment || 'market intelligence') + '</div>'
      + '<h2>' + esc(subjectName) + '</h2>'
      + (subject.one_liner ? '<p class="gk-dv-oneliner">' + esc(subject.one_liner) + '</p>' : '')
      + '</div>'
      + '<div class="gk-dv-badge" title="Generated from live web research — check key numbers before acting.">AI research draft — verify key numbers</div>'
      + '</div>';

    // 01 Subject brief + positioning
    var overview = d.positioning ? '<div class="gk-pos"><p>' + richPara(d.positioning) + '</p></div>' : '';
    html += sec('overview', 'subject_positioning', 'Subject brief + positioning', overview);

    // 02 Market opportunity
    var opportunity = '', mo = d.market_opportunity;
    if (mo) {
      var sizes = ['tam', 'sam', 'som'].map(function (key) {
        var item = mo[key] || {};
        return '<article class="gk-size-card"><span>' + key.toUpperCase() + '</span><strong>' + esc(item.value || 'Not defensible') + '</strong><p>' + esc(item.label || '') + '</p><small>' + esc(item.method || '') + (item.confidence ? ' · ' + esc(item.confidence) : '') + '</small></article>';
      }).join('');
      var segments = '';
      for (var sg = 0; sg < (mo.target_segments || []).length; sg++) {
        var segment = mo.target_segments[sg];
        segments += '<article class="gk-segment-card"><span>0' + esc(segment.priority || (sg + 1)) + '</span><div><h3>' + esc(segment.name) + '</h3><p>' + esc(segment.why_now) + '</p><dl><div><dt>Buyer</dt><dd>' + esc(segment.buyer) + '</dd></div><div><dt>Entry wedge</dt><dd>' + esc(segment.entry_wedge) + '</dd></div></dl></div></article>';
      }
      opportunity = '<div class="gk-size-grid">' + sizes + '</div>'
        + '<div class="gk-subhead"><span>Priority order</span><h3>Segments to target</h3></div><div class="gk-segment-grid">' + segments + '</div>'
        + '<div class="gk-evidence-grid">'
        + buildEvidenceChart(mo.market_trend, 'Five-year market trend', mo.market_trend && mo.market_trend.unit)
        + buildEvidenceChart(mo.search_demand, 'Indexed search demand', '0–100 interest index')
        + '</div>';
      if (mo.caveats && mo.caveats.length) opportunity += '<div class="gk-caveats"><strong>Sizing caveats</strong><ul>' + mo.caveats.map(function (caveat) { return '<li>' + esc(caveat) + '</li>'; }).join('') + '</ul></div>';
    }
    if (expandedReport) html += sec('opportunity', 'opportunity', 'Market opportunity', opportunity);

    // 03 Market map
    html += sec('market', 'market_map', 'Market map', d.market_map ? buildMap(d.market_map, subjectName) : '');

    // 04 Teardown
    var teardown = '';
    if (d.teardown && d.teardown.length) {
      var rows = '<div class="tt-row tt-head"><div>Competitor</div><div>Wedge &amp; motion</div><div>Pricing</div><div>Opening + next move</div></div>';
      for (var i = 0; i < d.teardown.length; i++) {
        var t = d.teardown[i];
        rows += '<div class="tt-row">'
          + '<div class="c-name">' + esc(t.name) + (t.tag ? '<small>' + esc(t.tag) + '</small>' : '') + '</div>'
          + '<div class="c-body">' + esc(t.wedge) + '</div>'
          + '<div class="c-price">' + esc(t.price || '—') + (t.price_note ? '<small>' + esc(t.price_note) + '</small>' : '') + '</div>'
          + '<div class="c-soft"><strong>Opening:</strong> ' + esc(t.soft)
          + (t.next_move ? '<span class="gk-inline-next"><b>Next move this week</b>' + esc(t.next_move) + '</span>' : '') + '</div>'
          + '</div>';
      }
      teardown = '<div class="gk-panel">' + rows + '</div>';
    }
    html += sec('competitors', 'competitor_teardown', 'Competitor teardown', teardown);

    // 05 Gap analysis
    var gapAnalysis = '';
    if (d.gaps && d.gaps.length) {
      var cards = '';
      for (var g = 0; g < d.gaps.length; g++) {
        var c = d.gaps[g], w = clamp(num(c.meter, 60), 0, 100);
        var work = window.GKFindings && Array.isArray(c.checklist) && c.checklist.length === 3
          ? window.GKFindings.shell({ findingKey: 'gap-' + pad2(g + 1), finding: c.title, nextMove: c.next_move, company: subjectName })
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
      gapAnalysis = '<div class="gk-next-banner"><span>Priority</span><strong>Every gap below includes the move to run this week.</strong></div><div class="gap-grid">' + cards + '</div>';
    }
    html += sec('gaps', 'gap_analysis', 'Gap analysis + next moves', gapAnalysis);

    // 06 GTM strategy + window of opportunity
    var strategy = '';
    if (d.gtm_strategy && d.window_of_opportunity) {
      var gtm = '';
      for (var gs = 0; gs < d.gtm_strategy.length; gs++) {
        var play = d.gtm_strategy[gs];
        gtm += '<article class="gk-gtm-card"><div class="gk-gtm-rank">0' + esc(play.priority || (gs + 1)) + '</div><div><span>' + esc(play.segment) + ' · ' + esc(play.channel) + '</span><h3>' + esc(play.motion) + '</h3><p>' + esc(play.message) + '</p><dl><div><dt>First test</dt><dd>' + esc(play.first_test) + '</dd></div><div><dt>Measure</dt><dd>' + esc(play.metric) + '</dd></div></dl></div></article>';
      }
      var win = d.window_of_opportunity, score = clamp(num(win.score, 0), 0, 100);
      var bullets = function (items) { return '<ul>' + (items || []).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>'; };
      strategy = '<div class="gk-gtm-grid">' + gtm + '</div><article class="gk-window-card" style="--window:' + score + '%">'
        + '<div class="gk-window-score"><span>' + esc(win.status) + '</span><strong>' + score + '<small>/100</small></strong><i><b></b></i><em>' + esc(win.horizon) + '</em></div>'
        + '<div class="gk-window-body"><h3>Window of opportunity</h3><div class="gk-window-cols"><div><span>Why now</span>' + bullets(win.why_now) + '</div><div><span>Triggers</span>' + bullets(win.triggers) + '</div><div><span>Risks</span>' + bullets(win.risks) + '</div></div>'
        + '<p class="gk-window-next"><b>Move now</b>' + esc(win.next_move) + '</p></div></article>';
    }
    if (expandedReport) html += sec('strategy', 'strategy_timing', 'GTM strategy + window of opportunity', strategy);

    // 07 90-day plan
    var plan = '';
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
      plan = '<div class="gk-next-banner"><span>Start here</span><strong>Take the first move before expanding the roadmap.</strong></div><div class="play-list">' + plays + '</div>';
    }
    html += sec('plan', 'plan', '90-day plan', plan);

    // 08 Funding landscape + connected weekly metrics
    var capital = '', funding = d.funding_landscape;
    if (funding) {
      var comps = (funding.comparable_companies || []).map(function (item) {
        return '<li><strong>' + esc(item.company) + '</strong><span>' + esc(item.total_funding) + ' · ' + esc(item.last_round) + (item.date ? ' · ' + esc(item.date) : '') + '</span><small>' + esc((item.investors || []).join(', ')) + '</small></li>';
      }).join('');
      var investors = (funding.active_investors || []).map(function (item) {
        return '<li><strong>' + esc(item.name) + '</strong><span>' + esc(item.fit) + '</span><small>' + esc(item.thesis) + (item.recent_relevant_bet ? ' · Recent: ' + esc(item.recent_relevant_bet) : '') + '</small></li>';
      }).join('');
      var rounds = (funding.recent_rounds || []).map(function (item) {
        return '<li><strong>' + esc(item.company) + '</strong><span>' + esc(item.round) + ' · ' + esc(item.amount) + ' · ' + esc(item.date) + '</span><small>' + esc((item.investors || []).join(', ')) + '</small></li>';
      }).join('');
      if (funding.available === false) {
        capital = '<div class="gk-data-empty"><strong>Funding landscape</strong><p>' + esc(funding.caveat || funding.takeaway || 'Comparable live funding data was not available.') + '</p></div>';
      } else {
        capital = '<div class="gk-funding-top">' + buildFundingRadar(funding) + '<div class="gk-funding-read"><span>Capital signal</span><h3>Funding landscape</h3><p>' + esc(funding.takeaway) + '</p><small>' + esc(funding.caveat) + '</small></div></div>'
          + '<div class="gk-funding-lists"><article><h4>Funded comparables</h4><ul>' + comps + '</ul></article><article><h4>Active investors</h4><ul>' + investors + '</ul></article><article><h4>Recent rounds</h4><ul>' + rounds + '</ul></article></div>';
      }
      capital += renderWeeklyMetrics(d.weekly_metrics);
    }
    if (expandedReport) html += sec('capital', 'capital_metrics', 'Funding landscape + weekly metrics', capital);

    // 09 Sources + honesty note
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
    html += sec('sources', 'sources', 'Sources + honesty', footInner, 'gk-dv-foot');

    html += '</div></div></div>';
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
    var pipelineState = null;
    var activeStages = {};
    var reportSaved = false;
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

    function otherInput(key, active, val) {
      return '<input class="gk-input gk-other" data-gk-other="' + esc(key) + '" maxlength="120" placeholder="Tell us more\u2026" autocomplete="off" value="' + esc(val || '') + '"' + (active ? '' : ' style="display:none"') + '>';
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
      h += '</div>';
      if (hasOther(opts)) h += otherInput(step.id, answers[step.id] === 'other', answers[step.id + '__other']);
      return h;
    }

    function chipBody(step) {
      var opts = resolve(step.options, answers) || [], sel = answers[step.id] || [];
      var h = '<div class="gk-chips">';
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i], on = sel.indexOf(o.v) !== -1;
        h += '<button type="button" class="gk-chip' + (on ? ' is-selected' : '') + '" data-v="' + esc(o.v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(o.l) + '</button>';
      }
      h += '</div>';
      if (hasOther(opts)) h += otherInput(step.id, sel.indexOf('other') !== -1, answers[step.id + '__other']);
      return h;
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
          if (hasOther(opts)) {
            var oact = f.type === 'multi' ? ((answers[f.k] || []).indexOf('other') !== -1) : (answers[f.k] === 'other');
            ctrl += otherInput(f.k, oact, answers[f.k + '__other']);
          }
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
          var v = (st.kind === 'multi') ? multiLabel(opts, answers, st.id) : singleLabel(opts, answers, st.id);
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
      // nav
      var backBtn = wizardEl.querySelector('[data-gk-back]');
      if (backBtn) backBtn.addEventListener('click', back);
      var nextBtn = wizardEl.querySelector('[data-gk-next]');
      if (nextBtn) nextBtn.addEventListener('click', primary);
      // "Other" fill-in inputs (any step kind)
      var oths = wizardEl.querySelectorAll('.gk-other');
      for (var oo = 0; oo < oths.length; oo++) (function (inp) {
        inp.addEventListener('input', function () { answers[inp.getAttribute('data-gk-other') + '__other'] = inp.value; touchOn(); });
      })(oths[oo]);

      if (step.kind === 'text') {
        // presets
        var pbtns = wizardEl.querySelectorAll('[data-preset]');
        for (var i = 0; i < pbtns.length; i++) (function (btn) {
          btn.addEventListener('click', function () {
            var p = PRESETS[parseInt(btn.getAttribute('data-preset'), 10)];
            answers.company = p.company; answers.website = p.website;
            touchOn();
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
            var cv = btn.getAttribute('data-v');
            answers[step.id] = cv;
            var all = wizardEl.querySelectorAll('.gk-choice');
            for (var a = 0; a < all.length; a++) all[a].classList.remove('is-selected');
            btn.classList.add('is-selected');
            setNextEnabled(true);
            clearError();
            var oin = wizardEl.querySelector('.gk-other[data-gk-other="' + step.id + '"]');
            if (cv === 'other') { if (oin) { oin.style.display = ''; oin.focus(); } return; }
            if (oin) oin.style.display = 'none';
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
            if (v === 'other') { var oin = wizardEl.querySelector('.gk-other[data-gk-other="' + step.id + '"]'); if (oin) { oin.style.display = on ? '' : 'none'; if (on) oin.focus(); } }
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
              if (v === 'other') { var oinm = wizardEl.querySelector('.gk-other[data-gk-other="' + k + '"]'); if (oinm) { oinm.style.display = on ? '' : 'none'; if (on) oinm.focus(); } }
            } else { // single (radio within the field)
              answers[k] = v;
              var sibs = wizardEl.querySelectorAll('.gk-pill[data-field="' + k + '"]');
              for (var s = 0; s < sibs.length; s++) {
                var isMe = sibs[s] === btn;
                sibs[s].classList.toggle('is-selected', isMe);
                sibs[s].setAttribute('aria-pressed', isMe ? 'true' : 'false');
              }
              var oins = wizardEl.querySelector('.gk-other[data-gk-other="' + k + '"]');
              if (oins) { var showo = (v === 'other'); oins.style.display = showo ? '' : 'none'; if (showo) oins.focus(); }
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
              if (saved._onboarding_complete) {
                var reviewIndex = stepIndexById('review');
                if (reviewIndex !== -1) idx = reviewIndex;
              }
              renderStep();
            }
          });
        } catch (e) {}
      });
    }
    function saveProfile(obj) {
      if (!obj || !Object.keys(obj).length || !(window.GKAuth && window.GKAuth.client)) return Promise.resolve(false);
      return getUid().then(function (uid) {
        if (!uid) return false;
        try {
          return window.GKAuth.client.from('profiles').upsert({ user_id: uid, data: obj, updated_at: new Date().toISOString() })
            .then(function (r) { return !(r && r.error); }).catch(function () { return false; });
        } catch (e) { return false; }
      });
    }

    async function accountAccess() {
      try {
        var headers = await apiHeaders();
        var res = await fetch('/api/account', { headers: headers });
        var data = await res.json().catch(function () { return {}; });
        return res.ok && data.access ? data.access : null;
      } catch (e) { return null; }
    }

    function renderAccessWall() {
      running = false;
      root.classList.remove('is-running', 'is-done');
      if (progressLabel) progressLabel.textContent = 'Onboarding saved';
      if (progressFill) progressFill.style.width = '100%';
      wizardEl.innerHTML = '<div class="gk-access-wall">'
        + '<span class="gk-access-kicker">Your onboarding is saved</span>'
        + '<h2>Purchase Pro to generate your deliverable.</h2>'
        + '<p>Free accounts can complete onboarding and preview the dashboard, but the engine, daily intelligence, and connected data unlock with Pro. For the time being, read our specimen to see the work before you buy.</p>'
        + '<div class="gk-access-actions"><button type="button" class="gk-run" data-gk-upgrade-pro>Upgrade to Pro <span class="gk-arr">→</span></button>'
        + '<a class="gk-access-specimen" href="/specimen">Read the specimen</a></div></div>';
      var upgrade = wizardEl.querySelector('[data-gk-upgrade-pro]');
      if (upgrade) upgrade.addEventListener('click', function () {
        if (window.GKBilling && window.GKBilling.checkout) window.GKBilling.checkout('pro');
        else window.location.href = '/pricing';
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

    var PIPELINE_STAGES = [
      'research', 'subject_positioning', 'market_map', 'competitor_teardown',
      'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics', 'sources', 'plan'
    ];
    var PIPELINE_DEPS = {
      research: [],
      subject_positioning: ['research'],
      market_map: ['research'],
      competitor_teardown: ['research', 'market_map'],
      gap_analysis: ['research', 'competitor_teardown'],
      opportunity: ['research'],
      strategy_timing: ['research', 'subject_positioning', 'opportunity', 'competitor_teardown', 'gap_analysis'],
      capital_metrics: ['research', 'opportunity'],
      sources: ['research', 'opportunity', 'capital_metrics'],
      plan: ['research', 'subject_positioning', 'market_map', 'competitor_teardown', 'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics', 'sources']
    };

    async function apiHeaders() {
      var headers = { 'Content-Type': 'application/json' };
      try {
        if (window.GKAuth && window.GKAuth.client) {
          var sess = await window.GKAuth.client.auth.getSession();
          var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
          if (token) headers.Authorization = 'Bearer ' + token;
        }
      } catch (e) {}
      return headers;
    }

    function stageStatus(stage) {
      return pipelineState && pipelineState.stages && pipelineState.stages[stage]
        ? pipelineState.stages[stage].status : 'pending';
    }

    function mergePipeline(data) {
      if (!data) return;
      pipelineState = {
        workspace: data.workspace || (pipelineState && pipelineState.workspace) || null,
        stages: data.stages || (pipelineState && pipelineState.stages) || {},
        deliverable: data.deliverable || (pipelineState && pipelineState.deliverable) || {}
      };
      lastJson = pipelineState.deliverable;
      if (pipelineState.workspace && pipelineState.workspace.company_name) answers.company = pipelineState.workspace.company_name;
      if (pipelineState.workspace && pipelineState.workspace.website && !answers.website) answers.website = pipelineState.workspace.website;
    }

    function renderResearchFailure() {
      var research = pipelineState && pipelineState.stages && pipelineState.stages.research;
      if (!research || research.status !== 'failed') return false;
      root.classList.remove('is-done');
      root.classList.add('is-running');
      stopLoading(false);
      loadingEl.innerHTML = '<div class="gk-section-state is-failed gk-research-failed"><span class="gk-section-state-icon" aria-hidden="true"></span><div><strong>Research pack did not finish</strong><p>'
        + esc(research.error || 'The research call failed.') + '</p></div><button type="button" class="gk-section-retry" data-gk-retry="research">Try again</button></div>';
      var retry = loadingEl.querySelector('[data-gk-retry="research"]');
      if (retry) retry.addEventListener('click', function () { callStage('research', {}); });
      return true;
    }

    function bindReportControls() {
      if (!deliverableEl) return;
      var retries = deliverableEl.querySelectorAll('[data-gk-retry]');
      for (var i = 0; i < retries.length; i++) (function (button) {
        button.addEventListener('click', function () { callStage(button.getAttribute('data-gk-retry'), {}); });
      })(retries[i]);
    }

    function renderPipeline() {
      if (!pipelineState || !pipelineState.stages) return;
      if (renderResearchFailure()) return;
      if (stageStatus('research') !== 'completed') return;
      stopLoading(true);
      root.classList.remove('is-running');
      root.classList.add('is-done');
      if (deliverableEl) {
        deliverableEl.innerHTML = renderDeliverable(lastJson || {}, pipelineState);
        bindReportControls();
        if (window.GKFindings && lastJson && lastJson.gaps) window.GKFindings.hydrate(deliverableEl, { scope: 'full_report' });
      }
    }

    function dependenciesComplete(stage) {
      var deps = PIPELINE_DEPS[stage] || [];
      for (var i = 0; i < deps.length; i++) if (stageStatus(deps[i]) !== 'completed') return false;
      return true;
    }

    function allStagesComplete() {
      for (var i = 0; i < PIPELINE_STAGES.length; i++) if (stageStatus(PIPELINE_STAGES[i]) !== 'completed') return false;
      return true;
    }

    function hasGeneratingStages() {
      for (var i = 0; i < PIPELINE_STAGES.length; i++) if (stageStatus(PIPELINE_STAGES[i]) === 'generating') return true;
      return false;
    }

    function finishPipeline() {
      if (!allStagesComplete()) return;
      running = false;
      renderPipeline();
      var company = pipelineState.workspace && pipelineState.workspace.company_name || answers.company || '';
      renderActions(company, answers.website || '', answers.competitors || '', '');
      if (!reportSaved) {
        reportSaved = true;
        saveRead(company, answers.competitors || '', '', lastJson);
        if (window.va) window.va('event', { name: 'advisor_complete', data: { surface: full ? 'page' : 'home', mode: 'pipeline', vendors: (lastJson.market_map && lastJson.market_map.vendors || []).length } });
      }
      if (typeof window.GK_PRODUCT_REFRESH === 'function') window.GK_PRODUCT_REFRESH({ generateDaily: true });
    }

    function schedulePipeline() {
      if (!pipelineState || !pipelineState.workspace) return;
      if (allStagesComplete()) { finishPipeline(); return; }
      for (var i = 0; i < PIPELINE_STAGES.length; i++) {
        var stage = PIPELINE_STAGES[i];
        if (stageStatus(stage) === 'pending' && !activeStages[stage] && dependenciesComplete(stage)) callStage(stage, {});
      }
    }

    async function callStage(stage, initialPayload) {
      if (!stage || activeStages[stage]) return;
      activeStages[stage] = true;
      if (pipelineState && pipelineState.stages) pipelineState.stages[stage] = { status: 'generating', error: null };
      if (stage === 'research') {
        root.classList.remove('is-done'); root.classList.add('is-running');
        startLoading({ website: answers.website, industry: answers.industry });
      } else renderPipeline();

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeout = controller ? setTimeout(function () { controller.abort(); }, 55000) : null;
      try {
        var headers = await apiHeaders();
        var payload = Object.assign({ stage: stage }, initialPayload || {});
        var res = await fetch('/api/advise', { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: controller ? controller.signal : undefined });
        var data = await res.json().catch(function () { return {}; });
        mergePipeline(data);
        if (!res.ok) throw new Error(data.error || 'This section failed. Try it again.');
        renderPipeline();
      } catch (err) {
        if (!pipelineState) pipelineState = { workspace: null, stages: {}, deliverable: {} };
        if (!pipelineState.stages) pipelineState.stages = {};
        pipelineState.stages[stage] = {
          status: 'failed',
          error: err && err.name === 'AbortError' ? 'This section took longer than 55 seconds. Try it again.' : (err.message || 'This section failed. Try it again.')
        };
        renderPipeline();
        if (stage === 'research' && !renderResearchFailure()) fail(pipelineState.stages[stage].error);
        if (window.va) window.va('event', { name: 'advisor_error', data: { surface: full ? 'page' : 'home', stage: stage, message: String(pipelineState.stages[stage].error).slice(0, 120) } });
      } finally {
        if (timeout) clearTimeout(timeout);
        activeStages[stage] = false;
        schedulePipeline();
      }
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
      running = true;
      var savedAnswers = Object.assign({}, answers);
      if (!fast) savedAnswers._onboarding_complete = true;
      var saved = await saveProfile(savedAnswers);
      if (!saved) {
        running = false;
        showError('We could not save your onboarding yet. Please try again.');
        return;
      }
      var access = await accountAccess();
      if (!access) {
        running = false;
        showError('We could not confirm your plan. Please try again.');
        return;
      }
      if (!access.allowed) {
        renderAccessWall();
        return;
      }

      lastJson = null; pipelineState = null;
      root.classList.remove('is-done');
      root.classList.add('is-running');
      if (restartBtn) restartBtn.hidden = true;
      if (deliverableEl) deliverableEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';

      if (window.va) window.va('event', { name: 'advisor_run', data: { surface: full ? 'page' : 'home', mode: mode, hasWebsite: !!website, hasContext: !!(competitors || profileText) } });

      var payload = {
        mode: mode, company: company, website: website,
        competitors: competitors, moves: moves, profile_text: profileText,
        company_url: field('company_url') ? field('company_url').value || '' : '',
        t: opts.auto ? '6000' : String(Date.now() - loadedAt)
      };

      await callStage('research', payload);
    }

    async function restorePipeline() {
      if (running) return;
      try {
        var headers = await apiHeaders();
        // A history link is /four?report_id=…; without it we resolve today's
        // in-progress report (to resume) or the most recent completed one.
        var wantId = '';
        try { wantId = new URLSearchParams(window.location.search).get('report_id') || ''; } catch (e) {}
        var url = '/api/advise' + (wantId ? '?report_id=' + encodeURIComponent(wantId) : '');
        var res = await fetch(url, { method: 'GET', headers: headers });
        if (!res.ok) return;
        var data = await res.json();
        if (!data.workspace) return;
        mergePipeline(data);
        if (data.workspace.full_report_status === 'completed') {
          reportSaved = true;
          root.style.display = '';
          renderPipeline();
          renderActions(data.workspace.company_name || '', data.workspace.website || '', '', '');
          return;
        }
        running = true;
        if (stageStatus('research') === 'completed') renderPipeline();
        else if (stageStatus('research') === 'failed') renderResearchFailure();
        else {
          root.classList.add('is-running');
          if (stageStatus('research') === 'generating') startLoading({ website: data.workspace.website || '' });
        }
        schedulePipeline();
        if (hasGeneratingStages()) setTimeout(pollPipeline, 3000);
      } catch (e) {}
    }

    async function pollPipeline() {
      try {
        var headers = await apiHeaders();
        var res = await fetch('/api/advise', { method: 'GET', headers: headers });
        if (!res.ok) return;
        mergePipeline(await res.json());
        renderPipeline();
        schedulePipeline();
        if (hasGeneratingStages()) setTimeout(pollPipeline, 3000);
      } catch (e) {}
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

    function renderActions(company, website, competitors, moves) {
      if (!actionsEl) return;
      actionsEl.innerHTML = '';
      var mk = function (lbl, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = 'gk-act ' + (cls || ''); b.innerHTML = lbl; actionsEl.appendChild(b); return b; };
      // Daily briefs are retired; the product loop is now "generate another
      // report" (one per UTC day). New report → back to the wizard; the server
      // enforces the one-a-day limit if today's is already done.
      var again = mk('New report', 'gk-act-go');
      again.addEventListener('click', function () {
        // Clear any ?report_id= from a history view so the wizard starts clean.
        try {
          if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
        restart(true);
      });
      var pdf = mk('Save as PDF');
      pdf.addEventListener('click', function () { window.print(); });
    }

    // Enter within the form (e.g. a text step) advances rather than reloading.
    form.addEventListener('submit', function (e) { e.preventDefault(); if (!running) primary(); });

    // First paint, then try to pre-fill from the saved profile.
    renderStep();
    ensureProfile();
    setTimeout(restorePipeline, 700);

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
