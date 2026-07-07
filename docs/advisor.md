# GrowthKit Live (the Advisor) — the live product (Claude-powered, web-searching)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the Advisor — the site's **first server-side code and first API secret**. **Update it whenever the function, prompt, model, deliverable schema, or limits change.**

## What it is

The product, branded **GrowthKit Live**, lives **behind login at `/four`** (see [`docs/auth.md`](auth.md)). A signed-in founder first picks an **onboarding mode** — **Quick read** (company name + optional website / known competitors / recent moves) or **Full profile** (a ~30-field grouped startup profile, all optional, saved to their account) — then the engine **actually searches the live web** (Anthropic's built-in `web_search` tool) to find and dissect that company's **real** competitors and returns a **full specimen-grade deliverable** — the same shape as [`specimen.html`](../specimen.html). More context (competitors, traction, ICP, pricing) just makes the deliverable sharper; the engine underneath is identical for both modes.

The deliverable has:

1. **Subject brief** — company name, one-liner, segment.
2. **Positioning read** — where they sit + the one truth they need to hear.
3. **Market map** — a plotted **SVG scatter** (price × workflow depth) with real competitors, the subject highlighted, and an identified gap zone. Coordinates are computed by Claude (0–100 on each axis) and drawn into the specimen's SVG geometry client-side.
4. **Competitor teardown** — a table: wedge & motion, pricing, and where each rival is soft.
5. **Gap analysis** — cards with score meters.
6. **90-day plan** — a timeline of 6–8 plays (when / first move / kill criteria).
7. **Sources** — the actual pages Claude cited, plus an honesty note.

Presented **confident + cited** (like the specimen) with a small **"AI research draft — verify key numbers"** badge, because numbers are web-researched estimates. Every deliverable is **saved to the user's account** (Supabase `reads`). `/advisor` (the old public page) is retired → redirects to `/four`; the homepage shows a "create a free account / log in" CTA.

**Ease-of-use:** one-click **example presets** fill the form with real companies (Jobber / Otter.ai / Ramp); after a run, **Copy share link** (a `/four?co=…&w=…&a=…` URL that re-runs the same inputs) + **Save as PDF** (print stylesheet).

## Architecture — first backend in the repo

```
four.html  (gated page; onboarding chooser → short/long form; progress log + deliverable)
   |  POST /api/advise  { mode, company, website, competitors, moves, profile_text, company_url, t }
   |  Authorization: Bearer <supabase access token>
   v
api/advise.js  (Vercel serverless function — the ONLY server code, the ONLY secret reader)
   |  ANTHROPIC_API_KEY (Vercel env var; NEVER in git — repo is public)
   |  model claude-opus-4-8, effort medium, stream:true, tools:[web_search_20260209 max_uses 4]
   v
Anthropic Messages API  (Claude runs the search loop server-side, then emits ONE JSON deliverable)
   |  advise.js parses Anthropic's SSE and forwards a small NDJSON PROGRESS stream:
   |    {"type":"status","stage":"search"|"writing",...}  ← while it works
   |    {"type":"done","deliverable":{…}}  |  {"type":"error","message":…}
   v
advisor.js  reads NDJSON → shows a live progress log → renders the JSON deliverable
            (buildMap SVG, teardown table, gap meters, plan, citations) → saves to Supabase
```

- **`api/advise.js`** — zero npm dependencies (raw `fetch`, hand-parses Anthropic SSE), CommonJS, no build step. Reads `process.env.ANTHROPIC_API_KEY`; without it, returns a 503 "not configured". Requires a valid Supabase token when `SUPABASE_URL`+`SUPABASE_ANON_KEY` are set on the server. It **accumulates the model's final text server-side, extracts the JSON object** (`extractJson` — tolerant of code fences / trailing prose / braces-in-strings), and sends it as one `done` event. It does **not** stream tokens to the browser — the browser can't render partial JSON — instead it streams progress events so a slow run keeps the connection alive. `stop_reason: "pause_turn"` (server tool loop cap) is not continued in v1; if it ever fires the run ends with an error and the user retries.
- **`advisor.js`** — the shared engine (ES5, no deps), loaded only by `four.html`. Reads the NDJSON stream, appends each status to a **live progress log** (terminal-readout feel), then on `done` calls `renderDeliverable(json)` which builds the whole designed deliverable as a string. `buildMap()` maps 0–100 vendor coords into the specimen SVG geometry (viewBox `0 0 880 560`; plot area x:90→810, y:480(bottom)→60(top)). Titles/positioning may contain a literal `<em>…</em>` (allowed through `richEm`/`richPara`; everything else is HTML-escaped). Saves the deliverable JSON to Supabase and exposes `GKAdvisor.render(container, raw)` — **JSON-aware, with a legacy fallback** so reads saved before this change (plain `01/02/03/04` engine text) still open.
- **`advisor.css`** — the console shell + the deliverable component styles. The deliverable classes **mirror `specimen.html`** (`.map-svg`+dots/axes/gap-zone, `.tt-row`, `.gap-card`+`.gap-meter`, `.play`+`.p-meta`) so generated output matches the sample. Map dots "plot themselves" and gap meters fill via CSS entrance animations (`gkPlot`/`gkFill`), with reduced-motion + print fallbacks.
- **Onboarding (short/long):** `four.html` shows a **chooser** (Quick read / Full profile); `advisor.js` builds the long form from its `PROFILE_GROUPS` config into `[data-gk-long-mount]`, serializes filled fields into the labelled `profile_text` sent to the engine, and **upserts the long profile to Supabase `profiles`** (one JSON `data` row per `user_id`, RLS-protected) so it pre-fills on return. Quick-read presets (Jobber / Otter.ai / Ramp) fill the short fields. `mode` rides in the payload and analytics.
- **The `reads` columns are repurposed** (no schema change): `product`=company name (the history label), `competitors`+`moves`=the quick-read context (empty in long mode), `output`=the **deliverable JSON string**. The `profiles` table (long-onboarding profile) is separate. See [`docs/auth.md`](auth.md).

## Setup — REQUIRED before it works (one-time, in the Vercel dashboard)

1. Vercel → the project that serves growthkitai.com → Settings → Environment Variables → add **`ANTHROPIC_API_KEY`** (Production + Preview), value = an Anthropic API key from console.anthropic.com. **The key must have web-search / server-tools access** (standard keys do).
2. Redeploy so the function picks up the env var.
3. **Never put the key in the repo** — every file here is public. `.env`/`.env.*` are gitignored for local `vercel dev`.

**Status (2026-07-05): Avi reports he added `ANTHROPIC_API_KEY` to the Vercel project himself.** If production still 503s "not configured", it's the two-accounts trap below — the key must be on the project that actually serves the domain, not the empty duplicate. Re-verify with `curl -s https://growthkitai.com/api/advise -X POST -H 'content-type: application/json' -d '{"company":"x","t":"6000"}'` (expect a 401 "please sign in" when Supabase gating is on, or an NDJSON stream — **not** a 503).

### ⚠ The two-Vercel-projects trap (still worth knowing)

There have been **two Vercel projects named `growthkit-ai` on two different accounts**. Only one serves the domain; env vars set on the other do nothing.

| | Serves growthkitai.com? | Where the key must live |
|---|---|---|
| **Original** — `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz` (GitHub-connected, auto-deploys on push) | **YES** (holds the domains) | **HERE** |
| **Duplicate** — `prj_rS1BidALX24zStAipzNYnHSXFQS4` on `avi-aggarwal14s-projects` — auto-created when the CLI (logged in as `avi-aggarwal14`) couldn't see the original team | NO (zero deployments/domains) | wasted here |

The local `.vercel/project.json` + the Vercel CLI/MCP point at the **duplicate**; that login can't see the original team, so **agents can't fix env vars from the repo** — it's a dashboard action for Avi on the account owning the original project. While there, also make apex `growthkitai.com` the **primary** and `www` the redirect (currently backwards — apex 307s to www, contradicting every canonical URL, and can cause flaky asset fetches).

## Model, prompt & the deliverable contract

- **Model: `claude-opus-4-8`**, `output_config: { effort: "low" }`, `stream: true`, `max_tokens: 6000`, `tools: [{ type:"web_search_20260209", name:"web_search", max_uses: 2 }]`. **Tuned 2026-07-07 to fit the 60s Hobby ceiling** — the first version (effort `medium`, `max_uses 4`, `max_tokens 8000`) **consistently timed out** in production, surfacing as the client's "run was cut off" message (the stream ends with no `done`/`error` event). Dropping to `low` effort + 2 searches + trimmed output counts (below) is the free "fit-in-60s" fix Avi chose over Vercel Pro. If depth suffers, the durable fix is Pro + `maxDuration` ~180 in `vercel.json` (no other change).
- **System prompt** (in `api/advise.js`) makes Claude the GrowthKit engine and **defines the exact JSON schema** it must return (subject / positioning / market_map{vendors,subject_point,gap} / teardown / gaps / plan / citations / note), with **fixed counts to bound generation time**: 6–8 vendors, exactly 4 teardown rows, exactly 3 gaps, exactly 6 plays. It is told it has a **hard ~55s budget**, to **run at most 2 searches** and write the JSON as soon as it can plot the map, prefer real named competitors, treat numbers as best-effort estimates, and emit **only** the JSON object (no prose/markdown/code fences). `<em>` is allowed literally inside title strings.
- **Changing the schema:** if you edit the schema in the system prompt, update `renderDeliverable()` / `buildMap()` in `advisor.js` to match. Coordinates are 0–100: x = price (0 cheap → 100 dear), y = workflow depth (0 shallow → 100 deep); the gap rect's `x,y` is its **bottom-left** corner.

## Limits, cost & abuse protection

- **`maxDuration: 60`** in `vercel.json` (Hobby ceiling; Pro allows 300). **This is the tight constraint:** web search + a full deliverable is genuinely close to 60s. Searches are capped at 4, effort is `medium`, and the prompt asks Claude to be efficient — but a **slow run can still time out**, in which case the browser shows "took too long — try again". If timeouts become common, move to **Vercel Pro** and bump `maxDuration` to ~120–180 in `vercel.json` (no code change needed) — that's the clean fix for full-fidelity depth.
- **Every run costs real money:** Opus tokens **plus web searches** (~$10 / 1,000 searches; up to 4 per run). Inputs are capped (company 160 / website 300 / about 800 chars), `max_tokens` bounded, searches capped, and the tool is **behind login + rate-limited**.
- **Abuse protection:** hidden `company_url` honeypot (silent drop), `t` minimum-fill-time (2.5s, silent drop), and a **per-IP rate limit** (6 runs / 10 min). The limiter is **durable-capable**: connect a KV store (Vercel KV / Upstash via the Vercel Marketplace — env vars `KV_REST_API_URL`+`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`+`_TOKEN`) and it uses a shared Redis fixed-window counter; with no store it falls back to per-warm-instance in-memory. **Connect Upstash before any hard promotion** (2-click Marketplace add, no code change) — web searches make each run pricier than before.
- The function sets `Cache-Control: no-store`.

## Analytics events

`advisor_run` (on submit; flags whether website/about were filled), `advisor_complete` (vendor count on the map), `advisor_error` (message). Same `window.va` system as the rest of the site — Pro/Enterprise-only recording (see [`docs/infrastructure.md`](infrastructure.md)).

## Privacy / legal disclosure

The engine sends the founder's inputs to **Anthropic's API** and Claude **searches the public web**. The page states inputs go to Anthropic and the deliverable is saved to the account; nothing beyond that is persisted by us.

- **`privacy.html` (v1.1):** §03 lists Advisor inputs; §04 notes inputs go to the AI provider; §06 names **Anthropic, PBC** as the AI sub-processor. **Still open:** privacy/terms predate the web-search behavior — when next touched, note that Claude performs live web searches to generate the deliverable and that reported numbers are AI estimates, not verified facts.
- **`terms.html`:** §08 free-Advisor clause (inputs go to Anthropic; don't submit confidential info); §15 notes the free tool is an illustrative automated read, not the operator-reviewed paid deliverable — **now doubly true** (web-researched estimates; add a "verify before acting" line when next editing).
- **Still open:** `security.html`'s data-inventory doesn't yet mention the `/api/advise` endpoint, the Anthropic flow, or the web-search egress — update when next touching that page.

## Local dev

`vercel dev` runs the function locally; put `ANTHROPIC_API_KEY=...` in a local `.env` (gitignored). Opening `four.html` as a plain file won't reach `/api/advise`. Quick offline checks: `node --check api/advise.js && node --check advisor.js`; the renderer + `extractJson` are pure functions and can be unit-tested by stubbing a minimal `document` and calling `window.GKAdvisor.render`.
