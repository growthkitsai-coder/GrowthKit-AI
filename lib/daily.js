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

async function generateDailyBrief(user, workspace) {
  const date = utcDate();
  const existing = await getDailyBrief(user.id, date);
  if (existing && existing.status === 'completed') return { ok: true, existing: true, row: existing };

  const reservation = await reserveDailyBrief(user.id, date);
  if (!reservation.ok) {
    if (reservation.code === 'exists') return { ok: true, existing: true, row: reservation.brief };
    return { ok: false, code: reservation.code };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await failDailyBrief(user.id, date, 'Daily model is not configured');
    return { ok: false, code: 'not_configured' };
  }

  try {
    const metrics = await collectMetrics(user.id);
    const input = {
      date_utc: date,
      company: {
        name: workspace.company_name,
        website: workspace.website,
        competitors: workspace.competitors,
        profile: workspace.profile_text
      },
      baseline_full_report: workspace.full_report,
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
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }],
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Build today\'s brief from this account context:\n' + JSON.stringify(input) }]
      })
    });
    if (!r.ok) throw new Error('Daily intelligence model returned ' + r.status);
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
    await failDailyBrief(user.id, date, err.message || 'Daily brief failed');
    return { ok: false, code: 'generation_failed', error: err.message };
  }
}

module.exports = { generateDailyBrief, extractJson, validBrief };
