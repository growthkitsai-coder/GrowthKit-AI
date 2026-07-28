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
  'If signals are genuinely thin, set no_material_change=true and still lead with the strongest useful observation you can support. Never write "No material change today" or any equivalent filler — the UI simply omits the status label when nothing moved.',
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

/**
 * Concatenate the model's text blocks.
 *
 * The separator MUST be '' — with web search enabled, Claude splits its answer
 * across several `text` blocks at citation boundaries, and those boundaries fall
 * mid-token. Joining with '\n' injected a literal newline into whatever JSON
 * string a boundary happened to land in, which is an unescaped control
 * character, so JSON.parse threw and the whole update failed as "did not return
 * readable JSON". api/advise.js has always joined with '' — this did not.
 */
function joinText(content) {
  return (content || [])
    .filter(function (block) { return block && block.type === 'text'; })
    .map(function (block) { return block.text || ''; })
    .join('');
}

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Search-enabled responses often open with a sentence of preamble before the
  // JSON. Walk every '{' rather than only the first, so a brace inside that
  // preamble cannot strand the parse on an unparseable slice.
  let start = cleaned.indexOf('{');
  while (start !== -1) {
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
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) {}
        break;
      }
    }
    start = cleaned.indexOf('{', start + 1);
  }
  return null;
}

function cleanMove(move, index) {
  if (!move || !(move.finding || move.action)) return null;
  const checklist = Array.isArray(move.checklist)
    ? move.checklist.filter(function (task) { return typeof task === 'string' && task.trim(); })
    : [];
  return {
    priority: Number(move.priority) || index + 1,
    finding: move.finding || move.action,
    action: move.action || move.finding,
    because: move.because || '',
    // findings.js only builds a checklist shell for exactly three steps; a
    // short one is dropped rather than rendered half-formed.
    checklist: checklist.length === 3 ? checklist : []
  };
}

/**
 * Repair a nearly-good response instead of throwing the whole call away.
 *
 * `validBrief` below is the full contract, and the prompt still asks for it. But
 * a single missing optional block used to fail the entire update and cost the
 * founder a model call, so the pipeline gates on this instead: hard-require only
 * what the renderer cannot do without — a lead headline and at least one usable
 * move — and normalize the rest. `missing` is logged so drift stays visible.
 */
function normalizeBrief(raw) {
  const missing = [];
  if (!raw || typeof raw !== 'object') return { ok: false, missing: ['response'] };
  const lead = raw.lead || {};
  if (!lead.headline) return { ok: false, missing: ['lead.headline'] };

  const moves = (Array.isArray(raw.next_moves) ? raw.next_moves : [])
    .map(cleanMove).filter(Boolean).slice(0, 3);
  if (!moves.length) return { ok: false, missing: ['next_moves'] };
  if (moves.length !== 3) missing.push('next_moves(' + moves.length + '/3)');
  moves.forEach(function (move, i) { if (!move.checklist.length) missing.push('next_moves[' + i + '].checklist'); });

  const list = function (value, name) {
    if (Array.isArray(value)) return value;
    missing.push(name);
    return [];
  };
  const brief = {
    brief_date: raw.brief_date,
    no_material_change: Boolean(raw.no_material_change),
    lead: { headline: lead.headline, detail: lead.detail || '', why_it_matters: lead.why_it_matters || '' },
    market_competitor_movement: list(raw.market_competitor_movement, 'market_competitor_movement'),
    own_metrics: list(raw.own_metrics, 'own_metrics'),
    market_signals: list(raw.market_signals, 'market_signals'),
    next_moves: moves,
    // Optional blocks: null tells the renderer to omit the panel entirely
    // rather than draw an empty one.
    founder_to_talk_to: (raw.founder_to_talk_to && raw.founder_to_talk_to.name) ? raw.founder_to_talk_to : null,
    tool_prompt: (raw.tool_prompt && raw.tool_prompt.tool) ? raw.tool_prompt : null,
    sources: list(raw.sources, 'sources')
  };
  if (!brief.founder_to_talk_to) missing.push('founder_to_talk_to');
  if (!brief.tool_prompt) missing.push('tool_prompt');
  return { ok: true, brief: brief, missing: missing };
}

/** The full contract the prompt asks for. Kept as the documented target. */
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
        // 1800 could not fit the full schema — lead + three sections + three
        // moves with three checklist steps each + founder + tool + sources —
        // so responses truncated mid-JSON and failed validation wholesale.
        max_tokens: 4000,
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
    const text = joinText(data.content);
    if (data.stop_reason === 'max_tokens') {
      throw new Error('The daily update ran out of output room before it finished. Try it again.');
    }
    const parsed = extractJson(text);
    if (!parsed) {
      // Carry an excerpt so a recurrence is diagnosable from the response
      // itself rather than needing a log dive. It is the founder's own data.
      const excerpt = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      throw new Error('The daily update did not return readable JSON. Try it again.' +
        (excerpt ? ' The engine said: "' + excerpt + '…"' : ' (the model returned no text at all.)'));
    }
    const normalized = normalizeBrief(parsed);
    if (!normalized.ok) {
      throw new Error('The daily update was missing ' + normalized.missing.join(', ') + '. Try it again.');
    }
    if (normalized.missing.length) {
      console.warn('[daily] brief accepted with gaps: %s', normalized.missing.join(', '));
    }
    const brief = normalized.brief;
    // A quiet day used to be overwritten with "No material change today". Avi's
    // rule: never say that — keep whatever real observation the model led with,
    // and let the renderer drop the status chip instead.
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

module.exports = { generateDailyBrief, extractJson, joinText, validBrief, normalizeBrief };
