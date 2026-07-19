# GrowthKit Live (the Advisor) — the live product (Claude-powered, web-searching)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the Advisor — the site's **first server-side code and first API secret**. **Update it whenever the function, prompt, model, deliverable schema, or limits change.**

> **Status: enabled.** `api/advise.js` is live when configured; `GK_ADVISOR_DISABLED=1` remains the immediate cost kill switch. The 60-second Hobby timeout risk remains, so a slow full report can still be cut off.

## What it is

The product, branded **GrowthKit Live**, lives **behind login at `/four`** (see [`docs/auth.md`](auth.md)). A signed-in founder is taken through a **premium, adaptive onboarding wizard** (redesigned 2026-07-08) — a progress bar, mostly **multiple-choice cards + chips**, with text only where a question is genuinely open. It's **13 steps** covering the full ~25-question startup profile: fast single-choice "spine" screens (**industry**, **stage**, adaptive **business model**) plus **themed grouped screens** (Nutshell, Team, Product, Customers, Traction, Market & competition, Pricing & funding) that each hold several sub-questions, then a **review**. The business-model step's title + options **adapt to the chosen industry**. A **fast-track** link on the first screen lets people in a hurry generate from just a company name. Either way the engine **actually searches the live web** (built-in `web_search` tool) to find and dissect that company's **real** competitors and returns a **full specimen-grade deliverable** — the same shape as [`specimen.html`](../specimen.html). More context just makes the deliverable sharper; the engine underneath is identical for the wizard and the fast-track.

The deliverable has:

1. **Subject brief** — company name, one-liner, segment.
2. **Positioning read** — where they sit + the one truth they need to hear.
3. **Market map** — a plotted **SVG scatter** (price × workflow depth) with real competitors, the subject highlighted, and an identified gap zone. Coordinates are computed by Claude (0–100 on each axis) and drawn into the specimen's SVG geometry client-side.
4. **Competitor teardown** — a table: wedge & motion, pricing, and where each rival is soft.
5. **Gap analysis** — cards with score meters, one concrete move to execute this week, a persistent three-step checklist, founder-added tasks, and a finding-specific founder-introduction email to `info@growthkitai.com`.
6. **90-day plan** — a timeline of 6–8 plays (when / first move / kill criteria).
7. **Sources** — the actual pages Claude cited, plus an honesty note.

Presented **confident + cited** (like the specimen) with a small **"AI research draft — verify key numbers"** badge, because numbers are web-researched estimates. Each account can complete this full deliverable once for one locked company; it is stored in `product_workspaces` as the daily-intelligence baseline. `/advisor` (the old public page) is retired → redirects to `/four`.

**After generation:** the action row opens the daily brief or saves the full report as PDF. Re-run/share-link controls were removed because they conflict with the one-company, one-report contract. Support may manually reset a mistaken company after verifying the request.

## Architecture — first backend in the repo

```
four.html  (gated page; adaptive onboarding WIZARD → premium loading sequence → deliverable)
   |  POST /api/advise  { mode, company, website, competitors, moves, profile_text, company_url, t }
   |    (mode='wizard' or 'short' for the fast-track — the API ignores mode; wizard answers
   |     are serialized client-side into profile_text; known-competitors ride in `competitors`)
   |  Authorization: Bearer <supabase access token>
   v
api/advise.js  (Vercel serverless function)
   |  verify session + paid/private-beta access + reserve product workspace
   |  ANTHROPIC_API_KEY (Vercel env var; NEVER in git — repo is public)
   |  model claude-sonnet-5, effort low, stream:true, tools:[web_search_20260209 max_uses 2]
   v
Anthropic Messages API  (Claude runs the search loop server-side, then emits ONE JSON deliverable)
   |  advise.js parses Anthropic's SSE and forwards a small NDJSON PROGRESS stream:
   |    {"type":"status","stage":"search"|"writing",...}  ← while it works
   |    {"type":"done","deliverable":{…}}  |  {"type":"error","message":…}
   v
advisor.js  reads NDJSON → shows a premium scripted RESEARCH SEQUENCE (animated status
            checklist, not the raw events) → on `done` renders the JSON deliverable
            (buildMap SVG, teardown table, actionable gaps, plan, citations) → saves to Supabase

findings.js → GET/POST/PATCH/DELETE /api/finding-tasks
            → persistent generated/custom tasks without mutating the report JSON
```

- **`api/advise.js`** — zero npm dependencies (raw `fetch`, hand-parses Anthropic SSE), CommonJS, no build step. It fails closed unless the Supabase URL, anon key, and service-role key are configured; verifies the access token and paid/private-beta entitlement; then reserves the user's company workspace before calling Anthropic. A completed full report cannot be generated again. It accumulates and validates the model JSON, persists the authoritative baseline, and sends one `done` event. It does not stream partial JSON to the browser.
- **`advisor.js`** — the shared engine (ES5, no deps), loaded only by `four.html`. Owns the **wizard state machine** (config-driven, mirroring the old `PROFILE_GROUPS` pattern: `STEPS` + `INDUSTRY_OPTS`/`STAGE_OPTS`/`MODEL_BY_INDUSTRY`/`FOCUS_PRE`/`FOCUS_EST`/`CHANNELS`/`SHARPEN_FIELDS`; single-select cards auto-advance, multi-select chips + Continue, a review screen with per-answer Edit). Serializes answers → labelled `profile_text` via `answersToProfileText()`. On generate it reads the NDJSON stream but **ignores the status events** — the loading UI is a **scripted research sequence** (`LOADING_PHRASES`, an animated checklist + progress bar that eases to ~92% and completes honestly on the real `done`; phrases personalize with the website host + industry; reduced-motion falls back to a static list). Then `renderDeliverable(json)` builds the whole designed deliverable as a string. `buildMap()` maps 0–100 vendor coords into the specimen SVG geometry (viewBox `0 0 880 560`; plot area x:90→810, y:480(bottom)→60(top)). Gap cards render the generated weekly move and ask `findings.js` to hydrate task state. Titles/positioning may contain a literal `<em>…</em>` (allowed through `richEm`/`richPara`; everything else is HTML-escaped). Saves the deliverable JSON to Supabase and exposes `GKAdvisor.render(container, raw)` — **JSON-aware, with a legacy fallback** so reads saved before all this (plain `01/02/03/04` engine text) still open.
- **`findings.js` + `api/finding-tasks.js` + `lib/findings.js`** — shared working-document layer for full gaps and daily findings. The browser builds a prefilled `mailto:` link locally (no model call) containing the company, exact finding, and next move. Generated tasks are synchronized only from the authoritative stored JSON; founders may add up to 12 custom tasks per finding, check/uncheck any task, and delete custom tasks. The API requires a valid Supabase bearer token plus paid/beta access and uses service-role writes.
- **`advisor.css`** — the console shell + the deliverable component styles. The deliverable classes **mirror `specimen.html`** (`.map-svg`+dots/axes/gap-zone, `.tt-row`, `.gap-card`+`.gap-meter`, `.play`+`.p-meta`) so generated output matches the sample. Map dots "plot themselves" and gap meters fill via CSS entrance animations (`gkPlot`/`gkFill`), with reduced-motion + print fallbacks.
- **Onboarding (the wizard):** `four.html` mounts the wizard into `[data-gk-wizard]` inside the console; `advisor.js` renders each step from its `STEPS` config (step kinds: `text` = company, `single` = full-screen choice cards that auto-advance, `multi` = full-screen chips, `group` = a themed screen of several sub-fields — each `single`/`multi`/`text`/`textarea` — and `review`). It keeps one `answers` object and on generate serializes it into a labelled `profile_text`: a `BUSINESS PROFILE` block (the step-level single/multi choices — industry, stage, business model, channels) followed by one block per **grouped step**, titled by section (`YOUR STARTUP IN A NUTSHELL`, `YOU & THE TEAM`, `THE PRODUCT`, `YOUR CUSTOMERS`, `TRACTION`, `MARKET & COMPETITION`, `PRICING & FUNDING`). Only `company`, `website`, and `competitors` (the "top 3 competitors" field in the Market group) map to their own payload fields — **everything else lives in `profile_text`**, so no backend change was needed. The full `answers` object is **upserted to Supabase `profiles`** (one JSON `data` row per `user_id`, RLS-protected) and **pre-fills the wizard on return**. `mode` (`wizard`/`short`) rides in the payload for analytics only (the API ignores it). Trust copy names GrowthKit's **proprietary market-intelligence models** — no AI provider is named in the UI (2026-07-08).
- **Storage:** `product_workspaces` is authoritative for the locked company and full-report baseline. `finding_tasks` stores generated/custom task state separately so the immutable baseline is never rewritten. The existing `reads` table remains a compatibility history mirror; `profiles` stores wizard answers. See [`daily-intelligence.md`](daily-intelligence.md) and [`auth.md`](auth.md).

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

- **Model: `claude-sonnet-5`** (switched from `claude-opus-4-8` on 2026-07-07 — Sonnet is ~2× faster/cheaper, better odds inside 60s; supports the same `web_search_20260209` tool + `effort`), `output_config: { effort: "low" }`, `stream: true`, `max_tokens: 6000`, `tools: [{ type:"web_search_20260209", name:"web_search", max_uses: 2 }]`. **Tuned 2026-07-07 to fit the 60s Hobby ceiling** — the first version (effort `medium`, `max_uses 4`, `max_tokens 8000`) **consistently timed out** in production, surfacing as the client's "run was cut off" message (the stream ends with no `done`/`error` event). Dropping to `low` effort + 2 searches + trimmed output counts (below) is the free "fit-in-60s" fix Avi chose over Vercel Pro. If depth suffers, the durable fix is Pro + `maxDuration` ~180 in `vercel.json` (no other change).
- **System prompt** (in `api/advise.js`) makes Claude the GrowthKit engine and **defines the exact JSON schema** it must return (subject / positioning / market_map{vendors,subject_point,gap} / teardown / gaps / plan / citations / note), with **fixed counts to bound generation time**: 6–8 vendors, exactly 4 teardown rows, exactly 3 gaps, exactly 6 plays. Every gap requires `next_move` plus exactly three verb-led `checklist` tasks tied to that gap. The server rejects a report missing this action contract. It is told it has a **hard ~55s budget**, to **run at most 2 searches** and write the JSON as soon as it can plot the map, prefer real named competitors, treat numbers as best-effort estimates, and emit **only** the JSON object (no prose/markdown/code fences). `<em>` is allowed literally inside title strings.
- **Changing the schema:** if you edit the schema in the system prompt, update `renderDeliverable()` / `buildMap()` in `advisor.js` to match. Coordinates are 0–100: x = price (0 cheap → 100 dear), y = workflow depth (0 shallow → 100 deep); the gap rect's `x,y` is its **bottom-left** corner.

## Limits, cost & abuse protection

- **`maxDuration: 60`** in `vercel.json` (Hobby ceiling; Pro allows 300). **This is the tight constraint:** web search + a full deliverable is genuinely close to 60s. Searches are capped at 2, effort is `low`, and the prompt asks Claude to be efficient — but a **slow run can still time out**, in which case the browser shows "took too long — try again". If timeouts become common, move to **Vercel Pro** and bump `maxDuration` to ~120–180 in `vercel.json` (no code change needed) — that's the clean fix for full-fidelity depth.
- **Every run costs real money:** Sonnet tokens **plus web searches**. Inputs are capped, `max_tokens` bounded, searches capped at 2, and the tool is **behind login + rate-limited**.
- **Abuse protection:** hidden `company_url` honeypot (silent drop), `t` minimum-fill-time (2.5s, silent drop), and a **per-IP rate limit** (6 runs / 10 min). The limiter is **durable-capable**: connect a KV store (Vercel KV / Upstash via the Vercel Marketplace — env vars `KV_REST_API_URL`+`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`+`_TOKEN`) and it uses a shared Redis fixed-window counter; with no store it falls back to per-warm-instance in-memory. **Connect Upstash before any hard promotion** (2-click Marketplace add, no code change) — web searches make each run pricier than before.
- The function sets `Cache-Control: no-store`.

## Analytics events

`advisor_run` (on submit; flags whether website/about were filled), `advisor_complete` (vendor count on the map), `advisor_error` (message). Same `window.va` system as the rest of the site — Pro/Enterprise-only recording (see [`docs/infrastructure.md`](infrastructure.md)).

## Privacy / legal disclosure

The engine sends the founder's inputs to **Anthropic's API** and Claude **searches the public web**. The completed report and profile context are stored in the account as the baseline for ongoing daily briefs.

- **`privacy.html` (v1.1):** §03 lists Advisor inputs; §04 notes inputs go to the AI provider; §06 names **Anthropic, PBC** as the AI sub-processor. **Still open:** privacy/terms predate the web-search behavior — when next touched, note that Claude performs live web searches to generate the deliverable and that reported numbers are AI estimates, not verified facts.
- **`terms.html`:** §08 free-Advisor clause (inputs go to Anthropic; don't submit confidential info); §15 notes the free tool is an illustrative automated read, not the operator-reviewed paid deliverable — **now doubly true** (web-researched estimates; add a "verify before acting" line when next editing).
- `privacy.html`, `terms.html`, and `security.html` describe account storage, generated reports/daily briefs, connected provider data, and the Anthropic processing flow.

## Local dev

`vercel dev` runs the function locally; put `ANTHROPIC_API_KEY=...` in a local `.env` (gitignored). Opening `four.html` as a plain file won't reach `/api/advise`. Quick offline checks: `node --check api/advise.js && node --check advisor.js`; the renderer + `extractJson` are pure functions and can be unit-tested by stubbing a minimal `document` and calling `window.GKAdvisor.render`.
