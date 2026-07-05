/**
 * GrowthKit AI — Advisor endpoint (the product, v1).
 *
 * A Vercel serverless function: the ONLY server-side code in the repo, and the
 * only place an API key is read. It takes a founder's description of their
 * product + competitors and streams back an operator-grade growth read from
 * Claude (Opus 4.8). Zero npm dependencies — raw fetch against the Anthropic
 * Messages API, parsed SSE forwarded to the browser as a plain-text stream.
 *
 * ── Setup (one-time, in the Vercel dashboard — NOT in this repo) ──
 *   Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`
 *   (Production + Preview). Redeploy. The repo is PUBLIC — never commit the key.
 *   Without the env var the endpoint returns a friendly "not configured" error.
 *
 * ── Limits to know ──
 *   - maxDuration is set to 60s in vercel.json (Hobby ceiling). The prompt is
 *     scoped + max_tokens capped so Opus finishes well inside it.
 *   - Rate limiting is in-memory per warm instance (best-effort; resets on cold
 *     start, not shared across instances). Durable limiting needs Vercel KV /
 *     Upstash — see docs/advisor.md. Honeypot + min-fill-time stop casual bots.
 *   - Every call costs money (Opus tokens). Inputs are length-capped and
 *     max_tokens is bounded to keep per-call cost predictable.
 */

'use strict';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 4000;
const FIELD_CAP = 2000; // per-field input character cap
const MIN_FILL_MS = 2500; // submissions faster than this are dropped as bots
const RATE_MAX = 6; // accepted runs per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

const clean = (v) => String(v == null ? '' : v).slice(0, FIELD_CAP).trim();

const SYSTEM_PROMPT = [
  "You are the GrowthKit AI market-intelligence engine, producing a fast, focused growth read for a founder based on what they tell you about their product and what their competitors are doing.",
  "",
  "GrowthKit AI turns market and competitor signal into decisions for seed and Series A founders. Voice: confident, operator-grade, specific, no fluff. Use em-dashes for asides. Never corporate-speak, never hype. You are talking to a founder who has a live product and limited time.",
  "",
  "What this read IS: a sharp, opinionated first cut grounded in what the founder described and your knowledge of how markets like theirs behave. What it is NOT: the full GrowthKit deliverable — that one is built on live demand data, mined competitor complaints, and operator review, and refreshes monthly. Be honest about that line. If the founder's input is thin, say what you'd need to go deeper rather than inventing specifics.",
  "",
  "Hard rules:",
  "- Be specific to THEIR market. Name the competitors they gave you. React to the moves they described. Never produce generic advice that would apply to any startup ('do content marketing', 'improve onboarding') — every play must be defensible from something they told you or a real dynamic of their category.",
  "- No preamble, no sign-off, no meta-commentary about being an AI. Output ONLY the structured read below.",
  "- Plain text, terminal-readout style. Use the exact section headers shown. Use '— ' dashes for bullets. No markdown bold/italics, no tables, no code fences.",
  "- Keep it tight and skimmable. Every line earns its place.",
  "",
  "Output EXACTLY these sections, in this order:",
  "",
  "01 / POSITIONING READ",
  "Two or three sentences: where this product actually sits in its market today, and the one positioning truth the founder most needs to hear.",
  "",
  "02 / COMPETITOR GAPS",
  "Three gaps — places where the named competitors are soft, slow, or over-serving — each as a '— ' bullet naming the competitor and the specific opening it leaves.",
  "",
  "03 / GROWTH PLAYS",
  "Four plays, numbered 01–04. For each, on its own lines:",
  "  Play NN — <one-line name>",
  "  — Why now: <tied to a specific competitor move or market dynamic>",
  "  — First move: <the concrete first action this week>",
  "  — Kill criteria: <the signal that says stop>",
  "",
  "04 / WHAT THE FULL TEARDOWN ADDS",
  "Two or three sentences, honest: what the paid GrowthKit deliverable (market map, competitor teardown, gap analysis, 90-day plan with ~14 plays, refreshed monthly, operator-reviewed) would add beyond this fast read — given specifically what was thin in their input."
].join('\n');

function buildUserMessage({ product, competitors, moves }) {
  const parts = [
    'A founder wants a growth read. Here is what they told us:',
    '',
    'PRODUCT / ICP:',
    product || '(not provided)',
    '',
    'KNOWN COMPETITORS:',
    competitors || '(none named — work from the product description and the category)',
    '',
    'RECENT COMPETITOR MOVES THEY HAVE NOTICED:',
    moves || '(none provided)',
    '',
    'Produce the structured read now.'
  ];
  return parts.join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'The advisor is not configured yet — no API key set on the server.' });
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
      res.status(401).json({ error: 'Please sign in to use the advisor.' });
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
  if (clean(body.company_url)) {
    res.status(200).end('');
    return;
  }

  // Minimum fill time — the page sends ms since load.
  const elapsed = parseInt(body.t, 10);
  if (!isNaN(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    res.status(200).end('');
    return;
  }

  const product = clean(body.product);
  const competitors = clean(body.competitors);
  const moves = clean(body.moves);
  if (!product) {
    res.status(400).json({ error: 'Tell us what your product is and who it serves to get a read.' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (await isRateLimited(ip)) {
    res.status(429).json({ error: "You've run a few reads in a row — give it a couple of minutes and try again." });
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
        output_config: { effort: 'high' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage({ product, competitors, moves }) }]
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

  // Stream Anthropic's SSE, forward only the text deltas to the browser as
  // a plain-text stream. The page reads response.body and appends.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
          res.write(evt.delta.text);
        } else if (evt.type === 'error') {
          res.write('\n\n[the engine stopped early — please try again]');
        }
      }
    }
  } catch (err) {
    // If the stream breaks mid-flight the client still keeps what arrived.
    try { res.write('\n\n[connection interrupted — partial read above]'); } catch (_) {}
  }

  res.end();
};
