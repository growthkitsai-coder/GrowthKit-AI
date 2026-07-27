'use strict';

const {
  utcDate,
  getDailyBrief,
  reserveDailyBrief,
  completeDailyBrief,
  failDailyBrief
} = require('./product');
const { collectMetrics } = require('./integrations');

const MODEL = process.env.GK_DAILY_MODEL || 'claude-sonnet-5';

const SYSTEM = [
  'You are GrowthKit Daily, a market-intelligence editor for busy seed and Series A founders.',
  'You are writing a short DELTA against the founder\'s existing full report, which is supplied as baseline_full_report. Never restate the baseline — say what moved since it was cut.',
  'Produce a 30-second brief, not a full report. Lead with the single most important change since the previous UTC day.',
  'Use web search to check competitor pricing/features, funding, new entrants, campaign/content spikes, category trends, relevant news, and regulatory or macro movement.',
  'Use connected first-party metrics exactly as supplied. Never invent a signup, revenue, churn, traffic, follower, or engagement number.',
  'If signals are genuinely thin, set no_material_change=true and say "No material change today" while still surfacing the strongest useful observation you can support.',
  'The action layer must react to today\'s evidence: exactly three prioritized findings and moves, one relevant founder worth learning from today, and one prompt for the most relevant GrowthKit tool.',
  'Return ONLY valid JSON matching this shape:',
  '{',
  '  "brief_date": "YYYY-MM-DD",',
  '  "no_material_change": boolean,',
  '  "lead": { "headline": string, "detail": string, "why_it_matters": string },',
  '  "market_competitor_movement": [{ "label": string, "detail": string, "source_url": string|null }],',
  '  "own_metrics": [{ "label": string, "value": string, "delta": string, "source": "Stripe"|"Google Analytics"|"LinkedIn" }],',
  '  "market_signals": [{ "label": string, "detail": string, "source_url": string|null }],',
  '  "next_moves": [{ "priority": 1|2|3, "finding": string (the specific observed gap or change this responds to), "action": string (a concrete move to execute this week), "because": string, "checklist": [string, string, string] (exactly 3 short steps, each starting with a verb) }],',
  '  "founder_to_talk_to": { "name": string, "company": string, "why_today": string, "public_url": string|null },',
  '  "tool_prompt": { "tool": string, "reason": string, "prompt": string },',
  '  "sources": [{ "title": string, "url": string }]',
  '}',
  'Each action and checklist must be specific to its finding and executable this week. Keep arrays short: 0-4 movement items, only connected own metrics, 0-3 market signals, exactly 3 next moves, 2-6 sources. No markdown.'
].join('\n');

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0, string = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (string) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') string = false;
    } else if (ch === '"') string = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { return null; }
    }
  }
  return null;
}

function validBrief(brief) {
  return Boolean(
    brief && brief.lead && brief.lead.headline &&
    Array.isArray(brief.market_competitor_movement) &&
    Array.isArray(brief.own_metrics) &&
    Array.isArray(brief.market_signals) &&
    Array.isArray(brief.next_moves) && brief.next_moves.length === 3 &&
    brief.next_moves.every(function (move) {
      return move && move.finding && move.action && move.because &&
        Array.isArray(move.checklist) && move.checklist.length === 3 &&
        move.checklist.every(function (task) { return typeof task === 'string' && task.trim(); });
    }) &&
    brief.founder_to_talk_to && brief.tool_prompt && Array.isArray(brief.sources)
  );
}

/**
 * Cut today's short market update for a founder, against `report` — the most
 * recent COMPLETED row in `reports`, which is the company /four is following.
 * One update per UTC day (the daily_briefs unique key). This is metered
 * separately from the full report and never charges the beta report grant.
 */
async function generateDailyBrief(user, report) {
  const date = utcDate();
  const existing = await getDailyBrief(user.id, date);
  if (existing && existing.status === 'completed') return { ok: true, existing: true, row: existing };

  const reservation = await reserveDailyBrief(user.id, date, {
    report_id: report.id,
    company_name: report.company_name
  });
  if (!reservation.ok) {
    if (reservation.code === 'exists') return { ok: true, existing: true, row: reservation.brief };
    // `detail` carries the PostgREST message. The usual cause of a storage
    // failure here is migration 202607270001 not having been run, so the
    // report_id/company_name columns this writes do not exist yet.
    return { ok: false, code: reservation.code, detail: reservation.detail || null };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await failDailyBrief(user.id, date, 'Daily model is not configured');
    return { ok: false, code: 'not_configured' };
  }

  // Vercel gives this function 60s (vercel.json). Abort the model call at 52s so
  // the failure is recorded and retryable instead of the whole function being
  // killed mid-write — the same bound api/advise.js uses per stage.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const deadline = controller ? setTimeout(function () { controller.abort(); }, 52000) : null;

  try {
    const metrics = await collectMetrics(user.id);
    const input = {
      date_utc: date,
      company: {
        name: report.company_name,
        website: report.website,
        competitors: report.competitors,
        profile: report.profile_text
      },
      baseline_full_report: report.full_report,
      baseline_report_date: report.report_date || null,
      connected_metrics: metrics
    };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        output_config: { effort: 'low' },
        // Same two rules as the report pipeline (docs/advisor.md): thinking OFF,
        // and the BASIC search tool — web_search_20260209 added enough latency to
        // push this past the serverless deadline.
        thinking: { type: 'disabled' },
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Build today\'s brief from this account context:\n' + JSON.stringify(input) }]
      }),
      signal: controller ? controller.signal : undefined
    });
    if (!r.ok) {
      // Surface the provider's own reason. A valid key with no credit answers
      // 400 invalid_request_error ("credit balance is too low"), which reads
      // like an outage but is a billing problem — see CLAUDE.md.
      let reason = '';
      try {
        const errorBody = await r.json();
        reason = (errorBody && errorBody.error && errorBody.error.message) || '';
      } catch (_) {}
      throw new Error('Daily intelligence model returned ' + r.status + (reason ? ': ' + reason : ''));
    }
    const data = await r.json();
    const text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
    const brief = extractJson(text);
    if (!validBrief(brief)) throw new Error('Daily intelligence response was incomplete');
    if (brief.no_material_change) brief.lead.headline = 'No material change today';
    brief.brief_date = date;
    const row = await completeDailyBrief(user.id, date, brief);
    if (!row) throw new Error('Daily brief could not be saved');
    return { ok: true, existing: false, row: row };
  } catch (err) {
    const message = (err && err.name === 'AbortError')
      ? 'The daily update took longer than 52 seconds. Try it again.'
      : (err && err.message) || 'Daily brief failed';
    await failDailyBrief(user.id, date, message);
    return { ok: false, code: 'generation_failed', detail: message };
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

module.exports = { generateDailyBrief, extractJson, validBrief };
