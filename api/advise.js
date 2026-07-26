/**
 * GrowthKit first-report pipeline.
 *
 * Ten short, persisted Anthropic calls replace the old all-in-one generation:
 * research -> subject/positioning + market map + sources (parallel) -> teardown
 * -> gaps -> plan, plus three independently persisted expansion calls for
 * opportunity, GTM/timing, and capital/connected metrics. Every call has a
 * 52-second server deadline and can be retried independently. The internal
 * research pack is never returned to the browser.
 */
'use strict';

const { checkAccess, verifyUserToken, bearer } = require('../lib/subscriptions');
const {
  configured: productConfigured,
  reserveReport,
  getActiveReport,
  getReportById,
  listReports,
  completeReport,
  failReport,
  listReportSections,
  reserveReportSection,
  completeReportSection,
  failReportSection
} = require('../lib/product');
const beta = require('../lib/beta');
const { collectMetrics } = require('../lib/integrations');

const ADVISOR_ENABLED = true;
const MODEL = 'claude-sonnet-5';
const CALL_TIMEOUT_MS = 52 * 1000;
const MIN_FILL_MS = 2500;
const RATE_MAX = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const CAP = { company: 160, website: 300, competitors: 1200, moves: 1200, profile: 8000 };

const STAGES = [
  'research', 'subject_positioning', 'market_map', 'competitor_teardown',
  'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics', 'plan', 'sources'
];
const DEPENDENCIES = {
  research: [],
  subject_positioning: ['research'],
  market_map: ['research'],
  competitor_teardown: ['research', 'market_map'],
  gap_analysis: ['research', 'competitor_teardown'],
  opportunity: ['research'],
  strategy_timing: ['research', 'subject_positioning', 'opportunity', 'competitor_teardown', 'gap_analysis'],
  capital_metrics: ['research', 'opportunity'],
  plan: ['research', 'subject_positioning', 'market_map', 'competitor_teardown', 'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics', 'sources'],
  sources: ['research', 'opportunity', 'capital_metrics']
};

const STAGE_CONFIG = {
  research: {
    // 5200, not 3600: the heavy schema below (6 competitors × 6 fields + facts +
    // pricing + trends + sources) overran 3600 and truncated the JSON mid-array,
    // which failed validation as "incomplete data" (a 502, not a timeout). 5200 is
    // a ceiling it doesn't hit — a full pack lands ~3600 out-tokens / ~35s, well
    // under the 52s deadline (measured 2026-07-26). Trimmed 6-8→6 competitors and
    // 4-10→4-6 sources to keep both the token and time budgets comfortable.
    maxTokens: 5200,
    searches: 2,
    instruction: [
      'Do research only. Do not write the report, recommendations, positioning, gaps, or roadmap.',
      'Build a compact factual knowledge base for every later call. Identify the exact company and its market, then research real competitors, pricing, customer type, and current market trends.',
      'Return exactly: {"company":string,"website":string,"industry":string,"customer_type":string,"company_facts":[string],"competitors":[{"name":string,"website":string,"positioning":string,"pricing":string,"customer_type":string,"evidence":string}],"pricing":[string],"market_trends":[string],"sources":[{"title":string,"url":string,"supports":string}]}',
      'Include exactly 6 real competitors and 4-6 useful sources. Use best-effort language instead of invented precision.'
    ].join('\n')
  },
  subject_positioning: {
    maxTokens: 1100,
    instruction: [
      'Generate only the subject brief and positioning read.',
      'Return exactly: {"subject":{"name":string,"one_liner":string,"segment":string},"positioning":string}',
      'The positioning must be 2-3 specific sentences and end with the positioning truth the founder most needs to act on.'
    ].join('\n')
  },
  market_map: {
    maxTokens: 2200,
    instruction: [
      'Generate only the market map. Do not write competitor cards, gaps, or recommendations.',
      'Return exactly: {"market_map":{"x_axis":string,"y_axis":string,"x_ticks":[string,string,string,string,string],"vendors":[{"name":string,"sub":string,"x":number,"y":number}],"subject_point":{"x":number,"y":number},"gap":{"label":string,"sub":string,"x":number,"y":number,"w":number,"h":number}}}',
      'Use 6-8 competitors from the research pack. Coordinates are 0-100: x is price and y is workflow depth.'
    ].join('\n')
  },
  competitor_teardown: {
    maxTokens: 2400,
    instruction: [
      'Generate only four competitor cards, using the research pack and market map.',
      'Return exactly: {"teardown":[{"name":string,"tag":string,"wedge":string,"price":string,"price_note":string,"soft":string,"next_move":string}]}',
      'Choose exactly four strategically important competitors. Each soft spot must lead to one concrete next move the founder can test this week.'
    ].join('\n')
  },
  gap_analysis: {
    maxTokens: 3000,
    instruction: [
      'Generate only three gap analyses with weekly actions and checklists.',
      'Return exactly: {"gaps":[{"tag":string,"title":string,"body":string,"score":string,"score_label":string,"meter":number,"next_move":string,"checklist":[string,string,string]}]}',
      'Each gap must be traceable to the competitor teardown. Make next_move executable this week and every checklist exactly three short verb-led tasks.'
    ].join('\n')
  },
  opportunity: {
    maxTokens: 4200,
    searches: 3,
    instruction: [
      'Generate only the quantified market opportunity section using current live web evidence where defensible.',
      'Return exactly: {"market_opportunity":{"tam":{"value":string,"label":string,"method":string,"confidence":string},"sam":{"value":string,"label":string,"method":string,"confidence":string},"som":{"value":string,"label":string,"method":string,"confidence":string},"target_segments":[{"name":string,"buyer":string,"why_now":string,"entry_wedge":string,"priority":number}],"market_trend":{"available":boolean,"period":string,"unit":string,"points":[{"label":string,"value":number}],"takeaway":string,"methodology":string},"search_demand":{"available":boolean,"query":string,"period":string,"points":[{"label":string,"value":number}],"peak_label":string,"takeaway":string,"methodology":string},"caveats":[string]},"opportunity_sources":[{"title":string,"url":string}]}',
      'Use a bottom-up sizing method when the research supports buyer counts and pricing; triangulate with top-down sources where useful. Never invent precision: use ranges or "Not defensible from public data" when needed.',
      'Return exactly 3-5 target segments ranked by priority. Market trend should cover five years with five annual points when comparable data exists. Search demand is indexed interest, not keyword volume: use up to 12 time points normalized 0-100 only when live indexed evidence exists; otherwise set available=false and return an empty points array.',
      'Include 2-6 direct sources used by this call.'
    ].join('\n')
  },
  strategy_timing: {
    maxTokens: 3200,
    instruction: [
      'Generate only the GTM strategy and window-of-opportunity section from the supplied research, opportunity, teardown, and gaps.',
      'Return exactly: {"gtm_strategy":[{"priority":number,"segment":string,"channel":string,"motion":string,"message":string,"first_test":string,"metric":string}],"window_of_opportunity":{"status":string,"score":number,"horizon":string,"why_now":[string],"triggers":[string],"risks":[string],"next_move":string}}',
      'Return exactly 3 GTM plays ranked by priority. Each play must name a target segment, specific channel, sales/marketing motion, message, first test, and measurable metric.',
      'The window score is 0-100. Status must be open, opening, closing, or unclear. Be decisive but show the evidence, triggers, and risks behind the timing call.'
    ].join('\n')
  },
  capital_metrics: {
    maxTokens: 4000,
    searches: 3,
    instruction: [
      'Generate only the funding landscape. The server attaches connected weekly metrics separately after this call; do not transform, estimate, or repeat them.',
      'Return exactly: {"funding_landscape":{"available":boolean,"radar_axes":[string,string,string,string,string],"radar_entities":[{"name":string,"values":[number,number,number,number,number]}],"comparable_companies":[{"company":string,"total_funding":string,"last_round":string,"date":string,"investors":[string]}],"active_investors":[{"name":string,"fit":string,"thesis":string,"recent_relevant_bet":string}],"recent_rounds":[{"company":string,"round":string,"amount":string,"date":string,"investors":[string]}],"takeaway":string,"caveat":string},"funding_sources":[{"title":string,"url":string}]}',
      'Cover all three views when live evidence exists: funded comparable companies, active investors, and recent relevant rounds. Use 3-5 radar entities across exactly five axes with 0-100 comparative scores; scores are directional synthesis, never claimed as audited facts.',
      'If evidence is too thin, set available=false, keep arrays empty, and explain the limitation. Include 2-6 direct sources used by this call.'
    ].join('\n')
  },
  plan: {
    maxTokens: 3000,
    instruction: [
      'Generate only the 90-day roadmap. Reference the positioning, market map, competitor teardown, and gaps already produced.',
      'Return exactly: {"plan":[{"horizon":string,"title":string,"body":string,"first_move":string,"kill":string}]}',
      'Create exactly six sequenced plays across 90 days. Keep an emphasis on immediate next steps, measurable learning, and explicit kill criteria.'
    ].join('\n')
  },
  sources: {
    maxTokens: 1500,
    instruction: [
      'Generate only the consolidated sources list and honesty note from the research pack plus the opportunity and funding sources.',
      'Return exactly: {"citations":[{"title":string,"url":string}],"note":string}',
      'Use 5-12 actual supplied sources, deduplicated. The note must say this is an AI research draft, market sizes/indexed demand/funding figures should be verified, and minor inference may be present.'
    ].join('\n')
  }
};

const BASE_SYSTEM = [
  'You are the GrowthKit AI market-intelligence engine for seed and Series A founders.',
  'Voice: confident, operator-grade, specific, concise, and grounded. Keep the founder moving toward a decision.',
  'Return only one valid JSON object with double-quoted keys and no markdown or code fences.',
  'Use the supplied research pack as the factual base. If this call has live web search, use it for current evidence; otherwise use only supplied information plus clearly limited inference.',
  'Never claim that a minor inference was directly sourced.'
].join('\n');
const RESEARCH_SYSTEM = [
  'You are the GrowthKit AI market researcher for seed and Series A founders.',
  'Research only. Collect grounded facts into the requested JSON knowledge base; do not write report prose or recommendations.',
  'Return only one valid JSON object with double-quoted keys and no markdown or code fences.'
].join('\n');

const clean = (value, cap) => String(value == null ? '' : value).slice(0, cap || 200).trim();

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function rateLimitedDurable(cfg, ip) {
  const windowSec = Math.floor(RATE_WINDOW_MS / 1000);
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `gk:advise:rl:${ip}:${bucket}`;
  const response = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSec * 2]])
  });
  if (!response.ok) throw new Error('kv ' + response.status);
  const output = await response.json();
  return Number(output && output[0] && output[0].result) > RATE_MAX;
}

const hits = new Map();
function rateLimitedMemory(ip) {
  const now = Date.now();
  const entries = (hits.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (entries.length >= RATE_MAX) { hits.set(ip, entries); return true; }
  entries.push(now);
  hits.set(ip, entries);
  return false;
}

async function isRateLimited(ip) {
  const cfg = kvConfig();
  if (cfg) {
    try { return await rateLimitedDurable(cfg, ip); } catch (_) {}
  }
  return rateLimitedMemory(ip);
}

function extractJson(text) {
  if (!text) return null;
  let source = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = source.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      source = source.slice(start, i + 1);
      break;
    }
  }
  try { return JSON.parse(source); } catch (_) { return null; }
}

function validStage(stage, output) {
  if (!output || typeof output !== 'object') return false;
  if (stage === 'research') return Boolean(output.company && output.industry && Array.isArray(output.competitors) && output.competitors.length >= 4 && Array.isArray(output.sources));
  if (stage === 'subject_positioning') return Boolean(output.subject && output.subject.name && output.positioning);
  if (stage === 'market_map') return Boolean(output.market_map && Array.isArray(output.market_map.vendors) && output.market_map.vendors.length >= 4);
  if (stage === 'competitor_teardown') return Boolean(Array.isArray(output.teardown) && output.teardown.length === 4 && output.teardown.every((item) => item.name && item.soft && item.next_move));
  if (stage === 'gap_analysis') return Boolean(Array.isArray(output.gaps) && output.gaps.length === 3 && output.gaps.every((gap) => gap.title && gap.next_move && Array.isArray(gap.checklist) && gap.checklist.length === 3));
  if (stage === 'opportunity') {
    const m = output.market_opportunity;
    const validSeries = (series, maxPoints) => Boolean(series && Array.isArray(series.points) &&
      (!series.available || (series.points.length >= 2 && series.points.length <= maxPoints &&
        series.points.every((point) => point.label && Number.isFinite(Number(point.value))))));
    return Boolean(m && m.tam && m.tam.value && m.sam && m.sam.value && m.som && m.som.value &&
      Array.isArray(m.target_segments) && m.target_segments.length >= 3 && m.target_segments.length <= 5 &&
      validSeries(m.market_trend, 5) && validSeries(m.search_demand, 12) &&
      m.search_demand.points.every((point) => Number(point.value) >= 0 && Number(point.value) <= 100));
  }
  if (stage === 'strategy_timing') {
    const window = output.window_of_opportunity;
    return Boolean(Array.isArray(output.gtm_strategy) && output.gtm_strategy.length === 3 &&
      output.gtm_strategy.every((play) => play.segment && play.channel && play.first_test && play.metric) &&
      window && ['open', 'opening', 'closing', 'unclear'].indexOf(window.status) !== -1 &&
      Number.isFinite(Number(window.score)) && Number(window.score) >= 0 && Number(window.score) <= 100 &&
      window.next_move);
  }
  if (stage === 'capital_metrics') {
    const f = output.funding_landscape;
    if (!f || !Array.isArray(f.radar_axes) || !Array.isArray(f.radar_entities) ||
      !Array.isArray(f.comparable_companies) || !Array.isArray(f.active_investors) || !Array.isArray(f.recent_rounds)) return false;
    if (!f.available) return true;
    return Boolean(f.radar_axes.length === 5 && f.radar_entities.length >= 3 && f.radar_entities.length <= 5 &&
      f.radar_entities.every((entity) => entity.name && Array.isArray(entity.values) && entity.values.length === 5 &&
        entity.values.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)) &&
      f.comparable_companies.length && f.active_investors.length && f.recent_rounds.length);
  }
  if (stage === 'plan') return Boolean(Array.isArray(output.plan) && output.plan.length === 6 && output.plan.every((play) => play.title && play.first_move));
  if (stage === 'sources') return Boolean(Array.isArray(output.citations) && output.citations.length >= 1 && output.note);
  return false;
}

function rowsByStage(rows) {
  return (rows || []).reduce((all, row) => { all[row.section] = row; return all; }, {});
}

// The wire key stays `workspace` (advisor.js reads pipeline.workspace) but it now
// projects the CURRENT report — full_report_status carries the report's status,
// and report identity fields ride alongside for the daily/history model.
function publicState(report, rows) {
  const byStage = rowsByStage(rows);
  const deliverable = report && report.status === 'completed' && report.full_report
    ? Object.assign({}, report.full_report)
    : {};
  const legacyCompleted = Boolean(report && report.status === 'completed' && Number(deliverable.report_version || 1) < 2);
  const expansionStages = ['opportunity', 'strategy_timing', 'capital_metrics'];
  STAGES.forEach((stage) => {
    if (stage === 'research') return;
    if (byStage[stage] && byStage[stage].status === 'completed') Object.assign(deliverable, byStage[stage].output || {});
  });
  const stages = {};
  STAGES.forEach((stage) => {
    const row = byStage[stage];
    const stale = row && row.status === 'generating' && Date.now() - new Date(row.started_at || row.updated_at).getTime() > CALL_TIMEOUT_MS + 8000;
    stages[stage] = row
      ? { status: stale ? 'failed' : row.status, error: stale ? 'This section did not finish within the time limit. Try it again.' : (row.error || null) }
      : { status: legacyCompleted && expansionStages.indexOf(stage) !== -1 ? 'not_applicable' : 'pending', error: null };
  });
  return {
    workspace: report ? {
      report_id: report.id,
      company_name: report.company_name,
      website: report.website,
      full_report_status: report.status,
      report_date: report.report_date || null,
      completed_at: report.completed_at || null
    } : null,
    stages,
    deliverable
  };
}

function dependencyContext(stage, byStage) {
  const context = { research_pack: byStage.research.output };
  if (stage === 'competitor_teardown') Object.assign(context, byStage.market_map.output);
  if (stage === 'gap_analysis') Object.assign(context, byStage.competitor_teardown.output);
  if (stage === 'strategy_timing') {
    ['subject_positioning', 'opportunity', 'competitor_teardown', 'gap_analysis'].forEach((name) => Object.assign(context, byStage[name].output));
  }
  if (stage === 'capital_metrics') {
    Object.assign(context, byStage.opportunity.output);
  }
  if (stage === 'sources') {
    Object.assign(context, byStage.opportunity.output, byStage.capital_metrics.output);
  }
  if (stage === 'plan') {
    ['subject_positioning', 'market_map', 'competitor_teardown', 'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics', 'sources'].forEach((name) => Object.assign(context, byStage[name].output));
  }
  return context;
}

function researchInput(workspace) {
  return {
    company: workspace.company_name,
    website: workspace.website || '',
    known_competitors: workspace.competitors || '',
    founder_profile: workspace.profile_text || ''
  };
}

function collectMetricsBounded(userId) {
  return new Promise((resolve) => {
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ _error: 'The connected-metrics snapshot timed out during report generation.' });
    }, 20 * 1000);
    collectMetrics(userId).then((metrics) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(metrics);
    }).catch(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ _error: 'The connected-metrics snapshot could not be completed.' });
    });
  });
}

async function callAnthropic(apiKey, stage, context) {
  const config = STAGE_CONFIG[stage];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const payload = {
      model: MODEL,
      max_tokens: config.maxTokens,
      output_config: { effort: 'low' },
      // Thinking is OFF. On claude-sonnet-5, omitting `thinking` runs ADAPTIVE
      // thinking by default — that plus web search blew past the 52s deadline and
      // 504'd every research call (measured 2026-07-25). Disabling it cut the
      // research call from ~68s to ~22s. We hand the model explicit per-stage
      // instructions and JSON schemas, so it doesn't need to deliberate.
      thinking: { type: 'disabled' },
      system: (stage === 'research' ? RESEARCH_SYSTEM : BASE_SYSTEM) + '\n\nYOUR ONLY TASK FOR THIS CALL:\n' + config.instruction,
      messages: [{ role: 'user', content: JSON.stringify(context) }]
    };
    // Search-enabled stages use the basic variant, NOT web_search_20260209. The
    // _20260209 variant runs
    // code-execution "dynamic filtering" under the hood, which added ~45s and was
    // the other half of the timeout. The basic variant returns results directly.
    if (config.searches) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: config.searches }];
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = clean(await response.text().catch(() => ''), 300);
      const error = new Error(response.status === 429 ? 'The engine is busy. Try this section again shortly.' : 'The engine returned an error for this section.');
      error.status = response.status === 429 ? 429 : 502;
      error.detail = detail;
      throw error;
    }
    const body = await response.json();
    const text = (body.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('');
    const output = extractJson(text);
    if (!validStage(stage, output)) {
      const error = new Error('This section returned incomplete data. Try it again.');
      error.status = 502;
      throw error;
    }
    return output;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error('This section took longer than 52 seconds. Try it again.');
      timeoutError.status = 504;
      timeoutError.code = 'section_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticated(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !productConfigured()) {
    res.status(503).json({ error: 'Account access is not configured on the server.' });
    return null;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) { res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); return null; }
  return user;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }

  const user = await authenticated(req, res);
  if (!user) return;
  if (req.method === 'GET') {
    // ?report_id=… views a specific past report; otherwise resolve the report to
    // show: today's in-progress one (to resume the pipeline), else the most
    // recent completed report (so a returning founder sees their last one).
    const wantId = clean((req.query && req.query.report_id) || '', 80);
    let report = null;
    if (wantId) {
      report = await getReportById(user.id, wantId);
    } else {
      report = await getActiveReport(user.id);
      if (!report) {
        const recent = await listReports(user.id, 1);
        if (recent.length) report = await getReportById(user.id, recent[0].id);
      }
    }
    const rows = report ? await listReportSections(report.id) : [];
    res.status(200).json(publicState(report, rows));
    return;
  }

  const access = await checkAccess(user);
  if (!access.allowed) {
    // reason lets the client show the precise state (pending / expired / spent).
    res.status(402).json({ error: 'Purchase Pro to generate your deliverable.', code: 'subscription_required', reason: access.reason });
    return;
  }
  if (!ADVISOR_ENABLED || process.env.GK_ADVISOR_DISABLED === '1') { res.status(503).json({ error: 'GrowthKit Live is paused while we upgrade the engine.' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'The engine is not configured yet.' }); return; }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const stage = clean(body.stage, 40);
  if (STAGES.indexOf(stage) === -1) { res.status(400).json({ error: 'Choose a valid report section.' }); return; }
  if (clean(body.company_url, 400)) { res.status(200).json({}); return; }
  const elapsed = parseInt(body.t, 10);
  if (stage === 'research' && !isNaN(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) { res.status(200).json({}); return; }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (await isRateLimited(ip)) { res.status(429).json({ error: 'Too many section attempts. Give it a couple of minutes and try again.' }); return; }

  // Resolve the report this call operates on. Research reserves today's report
  // (and enforces the one-a-day limit); later stages attach to the report that
  // research already opened today.
  let report;
  if (stage === 'research') {
    const input = {
      company: clean(body.company, CAP.company),
      website: clean(body.website, CAP.website),
      competitors: clean(body.competitors, CAP.competitors),
      profile: clean(body.profile_text, CAP.profile)
    };
    const reserved = await reserveReport(user.id, input);
    if (!reserved.ok) {
      if (reserved.code === 'daily_limit') {
        res.status(429).json({
          error: "You've generated today's report. Your next one unlocks at 00:00 UTC.",
          code: 'daily_limit'
        });
        return;
      }
      if (reserved.code === 'no_company') { res.status(400).json({ error: 'Enter your company name to start the report.' }); return; }
      res.status(503).json({ error: 'The report workspace is unavailable.', code: reserved.code });
      return;
    }
    report = reserved.report;
  } else {
    report = await getActiveReport(user.id);
    if (!report) {
      res.status(409).json({ error: 'Start a report with the research step first.', code: 'dependency_missing' });
      return;
    }
  }
  const reportId = report.id;

  let rows = await listReportSections(reportId);
  let byStage = rowsByStage(rows);
  const missing = DEPENDENCIES[stage].filter((name) => !byStage[name] || byStage[name].status !== 'completed');
  if (missing.length) { res.status(409).json({ error: 'Finish the required earlier sections first.', code: 'dependency_missing', missing }); return; }

  const reservation = await reserveReportSection(reportId, stage);
  if (!reservation.ok) {
    if (reservation.code === 'completed') {
      rows = await listReportSections(reportId);
      res.status(200).json(Object.assign({ stage, cached: true }, publicState(report, rows)));
      return;
    }
    res.status(reservation.code === 'in_progress' ? 409 : 503).json({
      error: reservation.code === 'in_progress' ? 'This section is already being generated.' : 'This section could not be reserved.',
      code: reservation.code
    });
    return;
  }

  try {
    // Connected providers are fetched in parallel with the capital landscape
    // model call so their network latency does not stack on top of the 52s model
    // deadline. The model never transforms these first-party values.
    const metricsPromise = stage === 'capital_metrics'
      ? collectMetricsBounded(user.id)
      : null;
    const context = stage === 'research' ? researchInput(report) : dependencyContext(stage, byStage);
    const output = await callAnthropic(process.env.ANTHROPIC_API_KEY, stage, context);
    if (metricsPromise) output.weekly_metrics = await metricsPromise;
    const saved = await completeReportSection(reportId, stage, output);
    if (!saved) throw Object.assign(new Error('This section finished but could not be saved. Try it again.'), { status: 502 });

    rows = await listReportSections(reportId);
    byStage = rowsByStage(rows);
    const allComplete = STAGES.every((name) => byStage[name] && byStage[name].status === 'completed');
    if (allComplete) {
      const deliverable = {};
      STAGES.forEach((name) => { if (name !== 'research') Object.assign(deliverable, byStage[name].output || {}); });
      deliverable.report_version = 2;
      const didComplete = await completeReport(reportId, deliverable);
      // Charge the beta grant exactly once — only on the transition that actually
      // marked the report complete, and only for a beta (not paid) generation.
      if (didComplete && access.reason === 'beta-approved') await beta.consumeReport(user.id);
      report = (await getReportById(user.id, reportId)) || report;
    }
    res.status(200).json(Object.assign({ stage, report_completed: allComplete }, publicState(report, rows)));
  } catch (error) {
    const message = error && error.message ? error.message : 'This section failed. Try it again.';
    await failReportSection(reportId, stage, message);
    if (stage === 'research') await failReport(reportId);
    rows = await listReportSections(reportId);
    res.status(error.status || 502).json(Object.assign({ error: message, code: error.code || 'section_failed', stage }, publicState(report, rows)));
  }
};

module.exports.extractJson = extractJson;
module.exports.validStage = validStage;
module.exports.publicState = publicState;
