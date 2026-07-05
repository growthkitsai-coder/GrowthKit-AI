/**
 * GrowthKit AI — Advisor endpoint (the live product).
 *
 * A Vercel serverless function: the ONLY server-side code in the repo, and the
 * only place an API key is read. The signed-in user gives us a company name
 * (plus optional website + one-liner) and Claude (Opus 4.8) actually SEARCHES
 * THE WEB — Anthropic's built-in web_search tool — to find and dissect that
 * company's real competitors, then returns a full specimen-grade deliverable as
 * one JSON object: a plotted market map, a competitor teardown, gap analysis,
 * a 90-day plan, and the sources it used. The browser renders that JSON into
 * the designed deliverable (see advisor.js).
 *
 * Zero npm dependencies — raw fetch against the Anthropic Messages API. We parse
 * Anthropic's SSE server-side and forward a small NDJSON progress stream to the
 * browser (one JSON object per line): {type:"status"} events while it searches
 * and writes, then a final {type:"done", deliverable:{...}} (or {type:"error"}).
 * Streaming keeps the connection alive so a slow run doesn't hit a timeout.
 *
 * ── Setup (one-time, in the Vercel dashboard — NOT in this repo) ──
 *   Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`
 *   (Production + Preview). Redeploy. The repo is PUBLIC — never commit the key.
 *   Without the env var the endpoint returns a friendly "not configured" error.
 *   ⚠ It must be on the SAME Vercel project that serves growthkitai.com — see the
 *   two-accounts / duplicate-project trap in docs/advisor.md.
 *
 * ── Limits to know ──
 *   - maxDuration is 60s in vercel.json (Hobby ceiling). Web search + a full
 *     deliverable is genuinely tight: searches are capped (WEB_SEARCH_MAX_USES),
 *     effort is 'medium', and the prompt asks Claude to be efficient so it lands
 *     inside the window. A slow run can still time out — the browser surfaces a
 *     "took too long, try again" message. If it bites often, move to Vercel Pro
 *     (maxDuration 300) and this file needs no change beyond vercel.json.
 *   - Each run costs real money: Opus tokens + web searches (~$10 / 1k searches).
 *     Inputs are length-capped, searches capped, max_tokens bounded, and the tool
 *     is behind login + rate-limited to keep per-call and abuse cost predictable.
 *   - Numbers Claude reports are web-researched estimates and can be wrong; the
 *     deliverable is presented as an "AI research draft — verify key numbers"
 *     with its sources shown. See docs/advisor.md.
 */

'use strict';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 8000;
const WEB_SEARCH_MAX_USES = 4; // cap live searches to stay inside the 60s window
const MIN_FILL_MS = 2500; // submissions faster than this are dropped as bots
const RATE_MAX = 6; // accepted runs per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Per-field input character caps. Two onboarding modes feed the same engine:
//   short — company + website + known competitors + recent moves
//   long  — company + website + a formatted founder-profile text block
const CAP = { company: 160, website: 300, competitors: 1200, moves: 1200, profile: 8000 };

// ── Durable rate limiting (preferred) ──────────────────────────────────────
// Uses Redis over Upstash's REST API when a KV store is connected — shared
// across every serverless instance and surviving cold starts. Works with
// Vercel KV / the Vercel Marketplace Upstash integration (KV_REST_API_URL +
// KV_REST_API_TOKEN) or a direct Upstash integration (UPSTASH_REDIS_REST_URL +
// _TOKEN). No store connected → transparently falls back to the in-memory
// limiter below. Connecting a store is a 2-click Marketplace add; no code
// change needed. See docs/advisor.md.
function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// Fixed-window counter, bucketed into the key so it auto-resets. One HTTP
// round trip (INCR + EXPIRE pipelined).
async function rateLimitedDurable(cfg, ip) {
  const windowSec = Math.floor(RATE_WINDOW_MS / 1000);
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `gk:advise:rl:${ip}:${bucket}`;
  const r = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSec * 2]])
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  const out = await r.json(); // [{ result: N }, { result: 1 }]
  const count = Array.isArray(out) && out[0] ? Number(out[0].result) : 0;
  return count > RATE_MAX;
}

// ── In-memory fallback (best-effort; per warm instance only) ────────────────
const hits = new Map(); // ip -> [timestamps]
function rateLimitedMemory(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  // opportunistic cleanup so the Map can't grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

async function isRateLimited(ip) {
  const cfg = kvConfig();
  if (cfg) {
    try { return await rateLimitedDurable(cfg, ip); }
    catch (_) { /* KV hiccup — fall through to the in-memory backstop */ }
  }
  return rateLimitedMemory(ip);
}

const clean = (v, cap) => String(v == null ? '' : v).slice(0, cap || 200).trim();

// ── The deliverable contract ────────────────────────────────────────────────
// Claude returns ONE JSON object shaped like this. The browser renders it into
// the specimen deliverable. Coordinates are 0–100 in both axes:
//   x = price per seat (0 = cheapest / free, 100 = most expensive)
//   y = workflow depth (0 = shallow point tool, 100 = deep end-to-end platform)
const SYSTEM_PROMPT = [
  "You are the GrowthKit AI market-intelligence engine. A signed-in founder gives you their company name — and possibly a website, known competitors, recent competitor moves, or a detailed startup profile. You have a web_search tool. Use it to find and dissect that company's REAL competitors, then return one specimen-grade deliverable.",
  "",
  "GrowthKit AI turns market and competitor signal into decisions for seed and Series A founders. Voice: confident, operator-grade, specific, no fluff — but every claim is grounded in what you actually found on the web, not invented. You are talking to a founder with a live product and limited time.",
  "",
  "HOW TO WORK (be fast — you are on a strict time budget):",
  "- Run AT MOST " + WEB_SEARCH_MAX_USES + " web searches, total. Spend them well: identify the category and the real named competitors; check a couple of competitors' positioning/pricing; find the gap. Do not over-explore.",
  "- Use the company's website/profile to pin down WHICH company this is (names can be ambiguous) and its actual segment. If you genuinely cannot identify the company or its market from the name + web, still produce your best-effort read of the most likely category and say so honestly in the positioning line.",
  "- If the founder listed competitors (or a market leader), treat them as strong hints — verify them and expand the set with search, don't just accept the list. If they gave a detailed profile (traction, pricing, ICP, stage), ground the positioning, gaps and plan in it specifically.",
  "- Prefer real, named competitors you found. Pricing and market numbers are best-effort estimates from what you read — reasonable, not fabricated precision. It is fine to write a price as a range or 'est.'",
  "",
  "OUTPUT: return ONLY a single JSON object — no prose before or after, no markdown, no code fences. It MUST match this shape exactly (all fields required unless marked optional):",
  "{",
  '  "subject": { "name": string, "one_liner": string (what they do, one line), "segment": string (the market/category, e.g. "HVAC field-service SaaS") },',
  '  "positioning": string (2–3 sentences: where this company actually sits today and the one positioning truth the founder most needs to hear),',
  '  "market_map": {',
  '    "x_axis": string (label for the price axis, e.g. "price per seat / month →"),',
  '    "y_axis": string (label for the depth axis, e.g. "workflow depth →"),',
  '    "x_ticks": [string, string, string, string, string] (5 left→right price ticks, e.g. ["$0","$50","$120","$220","$350+"]),',
  '    "vendors": [ { "name": string, "sub": string (2–4 word descriptor), "x": number 0–100 (price), "y": number 0–100 (workflow depth) } ]  (6–10 real competitors),',
  '    "subject_point": { "x": number 0–100, "y": number 0–100 } (where the founder\'s company sits),',
  '    "gap": { "label": string (short, e.g. "the gap"), "sub": string (one line, e.g. "deep workflow · owner-operator price"), "x": number 0–100 (left edge), "y": number 0–100 (bottom edge), "w": number 0–100 (width), "h": number 0–100 (height) }',
  '  },',
  '  "teardown": [ { "name": string, "tag": string (2–4 word label, e.g. "enterprise incumbent"), "wedge": string (1–2 sentences: their wedge and go-to-market motion), "price": string (short, e.g. "$129/seat/mo"), "price_note": string (e.g. "monthly, per-seat"), "soft": string (1–2 sentences: the specific opening they leave — where they are soft, slow, or over-serving) } ]  (4–6 competitors),',
  '  "gaps": [ { "tag": string (e.g. "Gap 01"), "title": string (a sharp headline, may wrap one key word in <em>…</em> for emphasis), "body": string (2–3 sentences on the opening and why it is real), "score": string (e.g. "7.4"), "score_label": string (e.g. "opportunity"), "meter": number 0–100 (fill for the strength bar) } ]  (3–4 gaps),',
  '  "plan": [ { "horizon": string (e.g. "Days 1–30"), "title": string (the play, may use <em>…</em>), "body": string (1–2 sentences on the move), "first_move": string (the concrete first action), "kill": string (the signal that says stop) } ]  (6–8 plays across the 90 days),',
  '  "citations": [ { "title": string, "url": string } ]  (3–8 of the actual sources you used),',
  '  "note": string (one honest line: this is an AI first-draft from live web research — verify key numbers — and what the full monthly GrowthKit deliverable adds beyond it)',
  "}",
  "",
  "Rules: valid JSON only (double-quoted keys/strings, no trailing commas, no comments). Do not escape the <em> tags — write them literally inside the relevant string values. Keep every string tight and skimmable. Be specific to THIS company's real market; never generic advice that would fit any startup."
].join('\n');

function buildUserMessage({ company, website, competitors, moves, profile }) {
  const parts = [
    'Produce the deliverable for this company. Search the web to identify it and its real competitors.',
    '',
    'COMPANY NAME: ' + company,
    'WEBSITE: ' + (website || '(not provided)')
  ];
  if (competitors) parts.push('', 'KNOWN COMPETITORS (hints — verify and expand with search): ' + competitors);
  if (moves) parts.push('', 'RECENT COMPETITOR MOVES THEY HAVE NOTICED: ' + moves);
  if (profile) parts.push('', 'FOUNDER PROFILE (ground the read in this):', profile);
  if (!competitors && !moves && !profile) parts.push('', '(No extra context provided — infer the segment and competitors from the name and the web.)');
  parts.push('', 'Return only the JSON object.');
  return parts.join('\n');
}

// Pull the first balanced top-level JSON object out of the model's text. The
// model is told to emit only JSON, but this is defensive against a stray word
// or a code fence sneaking in.
function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { s = s.slice(start, i + 1); break; } }
  }
  try { return JSON.parse(s); } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'The engine is not configured yet — no API key set on the server.' });
    return;
  }

  // Require a signed-in user — the tool lives behind login. Enforced only when
  // Supabase is configured on the server (SUPABASE_URL + SUPABASE_ANON_KEY env
  // vars), so nothing breaks before auth is wired up. Verifies the caller's
  // Supabase access token by asking Supabase who it belongs to.
  const sbUrl = process.env.SUPABASE_URL;
  const sbAnon = process.env.SUPABASE_ANON_KEY;
  if (sbUrl && sbAnon) {
    const authz = req.headers['authorization'] || '';
    const token = authz.indexOf('Bearer ') === 0 ? authz.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Please sign in to use the engine.' });
      return;
    }
    try {
      const ur = await fetch(sbUrl.replace(/\/+$/, '') + '/auth/v1/user', {
        headers: { authorization: 'Bearer ' + token, apikey: sbAnon }
      });
      if (!ur.ok) {
        res.status(401).json({ error: 'Your session has expired — please sign in again.' });
        return;
      }
    } catch (e) {
      res.status(401).json({ error: 'Could not verify your session — please sign in again.' });
      return;
    }
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};

  // Honeypot: a hidden field humans never fill. Drop silently with a 200.
  if (clean(body.company_url, 400)) {
    res.status(200).end('');
    return;
  }

  // Minimum fill time — the page sends ms since load.
  const elapsed = parseInt(body.t, 10);
  if (!isNaN(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    res.status(200).end('');
    return;
  }

  const company = clean(body.company, CAP.company);
  const website = clean(body.website, CAP.website);
  const competitors = clean(body.competitors, CAP.competitors);
  const moves = clean(body.moves, CAP.moves);
  const profile = clean(body.profile_text, CAP.profile);
  if (!company) {
    res.status(400).json({ error: 'Enter your company name to generate a deliverable.' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (await isRateLimited(ip)) {
    res.status(429).json({ error: "You've run a few deliverables in a row — give it a couple of minutes and try again." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        output_config: { effort: 'medium' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }],
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage({ company, website, competitors, moves, profile }) }]
      })
    });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach the engine. Try again in a moment." });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { detail = (await upstream.text()).slice(0, 300); } catch (_) {}
    const status = upstream.status === 429 ? 429 : 502;
    res.status(status).json({ error: 'The engine returned an error.', status: upstream.status, detail });
    return;
  }

  // From here we always 200 and stream NDJSON progress events. The browser reads
  // response.body line by line: {type:"status"} while it works, then a terminal
  // {type:"done", deliverable} or {type:"error", message}.
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.status(200);
  const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch (_) {} };

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';        // accumulated final text (the JSON)
  let searchCount = 0;
  let announcedWriting = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines; split on newlines and read data: lines.
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let evt;
        try { evt = JSON.parse(payload); } catch (_) { continue; }

        if (evt.type === 'content_block_start' && evt.content_block) {
          const t = evt.content_block.type;
          if (t === 'server_tool_use' && evt.content_block.name === 'web_search') {
            searchCount++;
            send({ type: 'status', stage: 'search', n: searchCount });
          } else if (t === 'text' && !announcedWriting) {
            announcedWriting = true;
            send({ type: 'status', stage: 'writing' });
          }
        } else if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
          answer += evt.delta.text;
        } else if (evt.type === 'error') {
          send({ type: 'error', message: 'The engine stopped early — please try again.' });
        }
      }
    }
  } catch (err) {
    send({ type: 'error', message: 'The connection was interrupted — please try again.' });
    res.end();
    return;
  }

  const deliverable = extractJson(answer);
  if (deliverable && deliverable.subject) {
    send({ type: 'done', deliverable: deliverable });
  } else {
    send({ type: 'error', message: 'The engine could not finish a full deliverable in time — please try again.' });
  }
  res.end();
};
