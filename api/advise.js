/**
 * GrowthKit first-report pipeline.
 *
 * Seven short, persisted Anthropic calls replace the old all-in-one generation:
 * research -> subject/positioning + market map + sources (parallel) -> teardown
 * -> gaps -> plan. Every call has a 52-second server deadline and can be retried
 * independently. The internal research pack is never returned to the browser.
 */
'use strict';

const { checkAccess, verifyUserToken, bearer } = require('../lib/subscriptions');
const {
  configured: productConfigured,
  getWorkspace,
  ensureWorkspace,
  listReportSections,
  reserveReportSection,
  completeReportSection,
  failReportSection,
  completeWorkspace
} = require('../lib/product');

const ADVISOR_ENABLED = true;
const MODEL = 'claude-sonnet-5';
const CALL_TIMEOUT_MS = 52 * 1000;
const MIN_FILL_MS = 2500;
const RATE_MAX = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const CAP = { company: 160, website: 300, competitors: 1200, moves: 1200, profile: 8000 };

const STAGES = [
  'research', 'subject_positioning', 'market_map', 'competitor_teardown',
  'gap_analysis', 'plan', 'sources'
];
const DEPENDENCIES = {
  research: [],
  subject_positioning: ['research'],
  market_map: ['research'],
  competitor_teardown: ['research', 'market_map'],
  gap_analysis: ['research', 'competitor_teardown'],
  plan: ['research', 'subject_positioning', 'market_map', 'competitor_teardown', 'gap_analysis', 'sources'],
  sources: ['research']
};

const STAGE_CONFIG = {
  research: {
    maxTokens: 3600,
    searches: 2,
    instruction: [
      'Do research only. Do not write the report, recommendations, positioning, gaps, or roadmap.',
      'Build a compact factual knowledge base for every later call. Identify the exact company and its market, then research real competitors, pricing, customer type, and current market trends.',
      'Return exactly: {"company":string,"website":string,"industry":string,"customer_type":string,"company_facts":[string],"competitors":[{"name":string,"website":string,"positioning":string,"pricing":string,"customer_type":string,"evidence":string}],"pricing":[string],"market_trends":[string],"sources":[{"title":string,"url":string,"supports":string}]}',
      'Include 6-8 real competitors and 4-10 useful sources. Use best-effort language instead of invented precision.'
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
  plan: {
    maxTokens: 3000,
    instruction: [
      'Generate only the 90-day roadmap. Reference the positioning, market map, competitor teardown, and gaps already produced.',
      'Return exactly: {"plan":[{"horizon":string,"title":string,"body":string,"first_move":string,"kill":string}]}',
      'Create exactly six sequenced plays across 90 days. Keep an emphasis on immediate next steps, measurable learning, and explicit kill criteria.'
    ].join('\n')
  },
  sources: {
    maxTokens: 1000,
    instruction: [
      'Generate only the sources list and honesty note from the research pack.',
      'Return exactly: {"citations":[{"title":string,"url":string}],"note":string}',
      'Use 3-8 actual research-pack sources. The note must say this is an AI research draft, key numbers should be verified, and minor inference may be present.'
    ].join('\n')
  }
};

const BASE_SYSTEM = [
  'You are the GrowthKit AI market-intelligence engine for seed and Series A founders.',
  'Voice: confident, operator-grade, specific, concise, and grounded. Keep the founder moving toward a decision.',
  'Return only one valid JSON object with double-quoted keys and no markdown or code fences.',
  'Here is the research pack. Use only this information unless you need minor inference.',
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
  if (stage === 'plan') return Boolean(Array.isArray(output.plan) && output.plan.length === 6 && output.plan.every((play) => play.title && play.first_move));
  if (stage === 'sources') return Boolean(Array.isArray(output.citations) && output.citations.length >= 1 && output.note);
  return false;
}

function rowsByStage(rows) {
  return (rows || []).reduce((all, row) => { all[row.section] = row; return all; }, {});
}

function publicState(workspace, rows) {
  const byStage = rowsByStage(rows);
  const deliverable = {};
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
      : { status: 'pending', error: null };
  });
  return {
    workspace: workspace ? {
      company_name: workspace.company_name,
      website: workspace.website,
      full_report_status: workspace.full_report_status
    } : null,
    stages,
    deliverable
  };
}

function dependencyContext(stage, byStage) {
  const context = { research_pack: byStage.research.output };
  if (stage === 'competitor_teardown') Object.assign(context, byStage.market_map.output);
  if (stage === 'gap_analysis') Object.assign(context, byStage.competitor_teardown.output);
  if (stage === 'plan') {
    ['subject_positioning', 'market_map', 'competitor_teardown', 'gap_analysis', 'sources'].forEach((name) => Object.assign(context, byStage[name].output));
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

async function callAnthropic(apiKey, stage, context) {
  const config = STAGE_CONFIG[stage];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const payload = {
      model: MODEL,
      max_tokens: config.maxTokens,
      output_config: { effort: 'low' },
      system: (stage === 'research' ? RESEARCH_SYSTEM : BASE_SYSTEM) + '\n\nYOUR ONLY TASK FOR THIS CALL:\n' + config.instruction,
      messages: [{ role: 'user', content: JSON.stringify(context) }]
    };
    if (config.searches) payload.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.searches }];
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
    const workspaceResult = await getWorkspace(user.id);
    const rows = await listReportSections(user.id);
    res.status(200).json(publicState(workspaceResult.workspace, rows));
    return;
  }

  const access = await checkAccess(user);
  if (!access.allowed) { res.status(402).json({ error: 'Purchase Pro to generate your deliverable.', code: 'subscription_required' }); return; }
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

  let workspaceResult = await getWorkspace(user.id);
  let workspace = workspaceResult.workspace;
  if (stage === 'research') {
    const input = {
      company: clean(body.company, CAP.company) || (workspace && workspace.company_name),
      website: clean(body.website, CAP.website),
      competitors: clean(body.competitors, CAP.competitors),
      profile: clean(body.profile_text, CAP.profile)
    };
    if (!input.company) { res.status(400).json({ error: 'Enter your company name to start the report.' }); return; }
    const ensured = await ensureWorkspace(user.id, input);
    if (!ensured.ok) {
      const message = ensured.code === 'company_locked'
        ? 'Your account is already linked to ' + (ensured.company || 'another company') + '.'
        : ensured.code === 'full_report_complete' ? 'Your full report has already been generated.' : 'The report workspace is unavailable.';
      res.status(ensured.code === 'workspace_unavailable' ? 503 : 409).json({ error: message, code: ensured.code });
      return;
    }
    workspace = ensured.workspace;
  } else if (!workspace) {
    res.status(409).json({ error: 'Research must run before this section.', code: 'dependency_missing' });
    return;
  }

  let rows = await listReportSections(user.id);
  let byStage = rowsByStage(rows);
  const missing = DEPENDENCIES[stage].filter((name) => !byStage[name] || byStage[name].status !== 'completed');
  if (missing.length) { res.status(409).json({ error: 'Finish the required earlier sections first.', code: 'dependency_missing', missing }); return; }

  const reservation = await reserveReportSection(user.id, stage);
  if (!reservation.ok) {
    if (reservation.code === 'completed') {
      rows = await listReportSections(user.id);
      res.status(200).json(Object.assign({ stage, cached: true }, publicState(workspace, rows)));
      return;
    }
    res.status(reservation.code === 'in_progress' ? 409 : 503).json({
      error: reservation.code === 'in_progress' ? 'This section is already being generated.' : 'This section could not be reserved.',
      code: reservation.code
    });
    return;
  }

  try {
    const context = stage === 'research' ? researchInput(workspace) : dependencyContext(stage, byStage);
    const output = await callAnthropic(process.env.ANTHROPIC_API_KEY, stage, context);
    const saved = await completeReportSection(user.id, stage, output);
    if (!saved) throw Object.assign(new Error('This section finished but could not be saved. Try it again.'), { status: 502 });

    rows = await listReportSections(user.id);
    byStage = rowsByStage(rows);
    const allComplete = STAGES.every((name) => byStage[name] && byStage[name].status === 'completed');
    if (allComplete) {
      const deliverable = {};
      STAGES.forEach((name) => { if (name !== 'research') Object.assign(deliverable, byStage[name].output || {}); });
      await completeWorkspace(user.id, deliverable);
      workspace = (await getWorkspace(user.id)).workspace;
    }
    res.status(200).json(Object.assign({ stage, report_completed: allComplete }, publicState(workspace, rows)));
  } catch (error) {
    const message = error && error.message ? error.message : 'This section failed. Try it again.';
    await failReportSection(user.id, stage, message);
    rows = await listReportSections(user.id);
    res.status(error.status || 502).json(Object.assign({ error: message, code: error.code || 'section_failed', stage }, publicState(workspace, rows)));
  }
};

module.exports.extractJson = extractJson;
module.exports.validStage = validStage;
module.exports.publicState = publicState;
