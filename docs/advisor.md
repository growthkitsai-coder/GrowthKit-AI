# GrowthKit Live (the Advisor) — the live product (Claude-powered, web-searching)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the Advisor — the site's **first server-side code and first API secret**. **Update it whenever the function, prompt, model, deliverable schema, or limits change.**

> **Status: enabled.** `api/advise.js` is live when configured; `GK_ADVISOR_DISABLED=1` remains the immediate cost kill switch. First reports use seven independently persisted calls with a 52-second server deadline, so one slow section can be retried without losing finished work.

## What it is

The product, branded **GrowthKit Live**, lives **behind login at `/four`** (see [`docs/auth.md`](auth.md)). A signed-in founder is taken through a **premium, adaptive onboarding wizard** (redesigned 2026-07-08) — a progress bar, mostly **multiple-choice cards + chips**, with text only where a question is genuinely open. It's **13 steps** covering the full ~25-question startup profile: fast single-choice "spine" screens (**industry**, **stage**, adaptive **business model**) plus **themed grouped screens** (Nutshell, Team, Product, Customers, Traction, Market & competition, Pricing & funding) that each hold several sub-questions, then a **review**. The business-model step's title + options **adapt to the chosen industry**. A **fast-track** link on the first screen lets people in a hurry generate from just a company name. Either way the engine **actually searches the live web** (built-in `web_search` tool) to find and dissect that company's **real** competitors and returns a **full specimen-grade deliverable** — the same shape as [`specimen.html`](../specimen.html). More context just makes the deliverable sharper; the engine underneath is identical for the wizard and the fast-track.

The deliverable has:

1. **Subject brief** — company name, one-liner, segment.
2. **Positioning read** — where they sit + the one truth they need to hear.
3. **Market map** — a plotted **SVG scatter** (price × workflow depth) with real competitors, the subject highlighted, and an identified gap zone. Coordinates are computed by Claude (0–100 on each axis) and drawn into the specimen's SVG geometry client-side.
4. **Competitor teardown** — a table: wedge & motion, pricing, where each rival is soft, and one concrete move to run this week.
5. **Gap analysis** — cards with score meters, one concrete move to execute this week, a persistent three-step checklist, founder-added tasks, and a finding-specific founder-introduction email to `info@growthkitai.com`.
6. **90-day plan** — a timeline of exactly 6 plays (when / first move / kill criteria).
7. **Sources** — the actual pages Claude cited, plus an honesty note.

Presented **confident + cited** (like the specimen) with a small **"AI research draft — verify key numbers"** badge, because numbers are web-researched estimates. Each account can complete this full deliverable once for one locked company; it is stored in `product_workspaces` as the daily-intelligence baseline. `/advisor` (the old public page) is retired → redirects to `/four`.

**After generation:** the action row opens the daily brief or saves the full report as PDF. Re-run/share-link controls were removed because they conflict with the one-company, one-report contract. Support may manually reset a mistaken company after verifying the request.

## Architecture — first backend in the repo

```
four.html  (gated wizard → research → progressively rendered report)
   |  POST /api/advise { stage, initial input on research only }
   |  GET  /api/advise → resume state; research output is always omitted
   v
api/advise.js  verify access → enforce dependencies → reserve/checkpoint one stage
   |  Call 1: research pack (only call with web search; internal)
   |    ├─ Call 2: subject + positioning ─┐
   |    ├─ Call 3: market map ────────────┼─ parallel
   |    └─ Call 7: sources + honesty ─────┘
   |  Call 3 → Call 4: teardown → Call 5: gaps/actions/checklists
   |  Everything above → Call 6: 90-day plan
   v
report_sections  independent server-only checkpoints; 52-second deadline per call
   |  all seven complete → assemble product_workspaces.full_report
   v
advisor.js  schedule/resume/poll → sticky section navigation → section-local retry

findings.js → /api/finding-tasks → persistent generated/custom tasks
```

- **`api/advise.js`** — stage-based JSON API, CommonJS, no build step. `GET` returns the workspace, public stage states, and completed public sections; it never returns research. `POST` runs one named stage, validates dependencies/schema, and checkpoints it. Completed stages return cached state without model spend. The final immutable report is assembled only after all seven stages complete.
- **`advisor.js`** — owns both the adaptive wizard and browser-side dependency scheduler. After research, subject/positioning, market map, and sources run in parallel; teardown, gaps, and plan unlock in order. Refresh polls server-side calls, resumes pending work, and leaves failed sections in place with `Try again`; completed reports reopen directly from authoritative pipeline state even if the legacy `reads` mirror was never inserted. The report uses a sticky desktop sidebar and horizontally scrolling mobile section navigator. `buildMap()`, finding-task hydration, escaped rich text, and legacy saved-read support remain.
- **`findings.js` + `api/finding-tasks.js` + `lib/findings.js`** — shared working-document layer for full gaps and daily findings. The browser builds a prefilled `mailto:` link locally (no model call) containing the company, exact finding, and next move. Generated tasks are synchronized only from the authoritative stored JSON; founders may add up to 12 custom tasks per finding, check/uncheck any task, and delete custom tasks. The API requires a valid Supabase bearer token plus paid/beta access and uses service-role writes.
- **`advisor.css`** — the console shell, progressive section states, sticky navigation, and specimen-matching report components. Competitor rows, gap cards, and the roadmap visually prioritize next actions. Map dots plot themselves; the revealed gap zone remains translucent.
- **Onboarding (the wizard):** `four.html` mounts the wizard into `[data-gk-wizard]` inside the console; `advisor.js` renders each step from its `STEPS` config (step kinds: `text` = company, `single` = full-screen choice cards that auto-advance, `multi` = full-screen chips, `group` = a themed screen of several sub-fields — each `single`/`multi`/`text`/`textarea` — and `review`). It keeps one `answers` object and on generate serializes it into a labelled `profile_text`: a `BUSINESS PROFILE` block (the step-level single/multi choices — industry, stage, business model, channels) followed by one block per **grouped step**, titled by section (`YOUR STARTUP IN A NUTSHELL`, `YOU & THE TEAM`, `THE PRODUCT`, `YOUR CUSTOMERS`, `TRACTION`, `MARKET & COMPETITION`, `PRICING & FUNDING`). Only `company`, `website`, and `competitors` (the "top 3 competitors" field in the Market group) map to their own payload fields — **everything else lives in `profile_text`**, so no backend change was needed. The full `answers` object is **upserted to Supabase `profiles`** (one JSON `data` row per `user_id`, RLS-protected) and **pre-fills the wizard on return**. `mode` (`wizard`/`short`) rides in the payload for analytics only (the API ignores it). Trust copy names GrowthKit's **proprietary market-intelligence models** — no AI provider is named in the UI (2026-07-08).
- **Storage:** `report_sections` is server-only and stores one checkpoint per user/stage, including the internal research pack. `product_workspaces` remains authoritative for the locked company and final baseline. `finding_tasks` stores task state; `reads` is a compatibility mirror; `profiles` stores wizard answers.
- **`api/advise.js`** — zero npm dependencies (raw `fetch`, hand-parses Anthropic SSE), CommonJS, no build step. Reads `process.env.ANTHROPIC_API_KEY`; without it, returns a 503 "not configured". Requires a valid Supabase token when `SUPABASE_URL`+`SUPABASE_ANON_KEY` are set on the server. It **accumulates the model's final text server-side, extracts the JSON object** (`extractJson` — tolerant of code fences / trailing prose / braces-in-strings), and sends it as one `done` event. It does **not** stream tokens to the browser — the browser can't render partial JSON — instead it streams progress events so a slow run keeps the connection alive. `stop_reason: "pause_turn"` (server tool loop cap) is not continued in v1; if it ever fires the run ends with an error and the user retries.
- **`advisor.js`** — the shared engine (ES5, no deps), loaded only by `four.html`. Owns the **wizard state machine** (config-driven, mirroring the old `PROFILE_GROUPS` pattern: `STEPS` + `INDUSTRY_OPTS`/`STAGE_OPTS`/`MODEL_BY_INDUSTRY`/`FOCUS_PRE`/`FOCUS_EST`/`CHANNELS`/`SHARPEN_FIELDS`; single-select cards auto-advance, multi-select chips + Continue, a review screen with per-answer Edit). Serializes answers → labelled `profile_text` via `answersToProfileText()`. On generate it reads the NDJSON stream but **ignores the status events** — the loading UI is a **scripted research sequence** (`LOADING_PHRASES`, an animated checklist + progress bar that eases to ~92% and completes honestly on the real `done`; phrases personalize with the website host + industry; reduced-motion falls back to a static list). Then `renderDeliverable(json)` builds the whole designed deliverable as a string — **unchanged**. `buildMap()` maps 0–100 vendor coords into the specimen SVG geometry (viewBox `0 0 880 560`; plot area x:90→810, y:480(bottom)→60(top)). Titles/positioning may contain a literal `<em>…</em>` (allowed through `richEm`/`richPara`; everything else is HTML-escaped). Saves the deliverable JSON to Supabase and exposes `GKAdvisor.render(container, raw)` — **JSON-aware, with a legacy fallback** so reads saved before all this (plain `01/02/03/04` engine text) still open.
- **`advisor.css`** — the console shell + the deliverable component styles. The deliverable classes **mirror `specimen.html`** (`.map-svg`+dots/axes/gap-zone, `.tt-row`, `.gap-card`+`.gap-meter`, `.play`+`.p-meta`) so generated output matches the sample. Map dots "plot themselves" and gap meters fill via CSS entrance animations (`gkPlot`/`gkFill`), with reduced-motion + print fallbacks.
- **Onboarding (the wizard):** `four.html` mounts the wizard into `[data-gk-wizard]` inside the console; `advisor.js` renders each step from its `STEPS` config (step kinds: `text` = company, `single` = full-screen choice cards that auto-advance, `multi` = full-screen chips, `group` = a themed screen of several sub-fields — each `single`/`multi`/`text`/`textarea` — and `review`). Every `single`/`multi` option set (the step-level `INDUSTRY_OPTS`/`STAGE_OPTS`/`MODEL_BY_INDUSTRY`/`CHANNELS` and the grouped-field `OPT.*`) carries an **`{ v: 'other' }` option that reveals an inline fill-in** (`.gk-other`, `data-gk-other="<key>"`; text stored in `answers['<key>__other']`). Selecting "Other" on a single step **does not auto-advance** (so the user can type); `singleLabel()`/`multiLabel()` resolve `'other'` to the typed text for both the review and `profile_text` (added 2026-07-18). It keeps one `answers` object and on generate serializes it into a labelled `profile_text`: a `BUSINESS PROFILE` block (the step-level single/multi choices — industry, stage, business model, channels) followed by one block per **grouped step**, titled by section (`YOUR STARTUP IN A NUTSHELL`, `YOU & THE TEAM`, `THE PRODUCT`, `YOUR CUSTOMERS`, `TRACTION`, `MARKET & COMPETITION`, `PRICING & FUNDING`). Only `company`, `website`, and `competitors` (the "top 3 competitors" field in the Market group) map to their own payload fields — **everything else lives in `profile_text`**, so no backend change was needed. The full `answers` object is **upserted to Supabase `profiles`** (one JSON `data` row per `user_id`, RLS-protected) and **pre-fills the wizard on return**. `mode` (`wizard`/`short`) rides in the payload for analytics only (the API ignores it). Trust copy names GrowthKit's **proprietary market-intelligence models** — no AI provider is named in the UI (2026-07-08).
- **The `reads` columns are repurposed** (no schema change): `product`=company name (the history label), `competitors`=known competitors (if given) / `moves`=empty, `output`=the **deliverable JSON string**. The `profiles` table (the wizard answers) is separate. See [`docs/auth.md`](auth.md).

## Setup — REQUIRED before it works (one-time, in the Vercel dashboard)

1. Vercel → the project that serves growthkitai.com → Settings → Environment Variables → add **`ANTHROPIC_API_KEY`** (Production + Preview), value = an Anthropic API key from console.anthropic.com. **The key must have web-search / server-tools access** (standard keys do).
2. Redeploy so the function picks up the env var.
3. **Never put the key in the repo** — every file here is public. `.env`/`.env.*` are gitignored for local `vercel dev`.

**Status (2026-07-05): Avi reports he added `ANTHROPIC_API_KEY` to the Vercel project himself.** If production still 503s "not configured", it is probably the two-accounts trap below. An unauthenticated `GET /api/advise` should return 401, not 503.

### ⚠ The two-Vercel-projects trap (still worth knowing)

There have been **two Vercel projects named `growthkit-ai` on two different accounts**. Only one serves the domain; env vars set on the other do nothing.

| | Serves growthkitai.com? | Where the key must live |
|---|---|---|
| **Original** — `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz` (GitHub-connected, auto-deploys on push) | **YES** (holds the domains) | **HERE** |
| **Duplicate** — `prj_rS1BidALX24zStAipzNYnHSXFQS4` on `avi-aggarwal14s-projects` — auto-created when the CLI (logged in as `avi-aggarwal14`) couldn't see the original team | NO (zero deployments/domains) | wasted here |

The local `.vercel/project.json` + the Vercel CLI/MCP point at the **duplicate**; that login can't see the original team, so **agents can't fix env vars from the repo** — it's a dashboard action for Avi on the account owning the original project. While there, also make apex `growthkitai.com` the **primary** and `www` the redirect (currently backwards — apex 307s to www, contradicting every canonical URL, and can cause flaky asset fetches).

## Model, prompt & the deliverable contract

- **Model:** all seven stages use `claude-sonnet-5` with low effort and non-streaming JSON responses. Only research receives `web_search_20260209` (maximum two uses, 3,600 output tokens). Later calls receive the saved research pack and only the completed dependency sections they need; output budgets range from 1,000 to 3,000 tokens.
- **Contracts:** research returns company/industry/customer type, company facts, 6–8 competitors, pricing, trends, and sources. The six public calls return subject+positioning; map; exactly four teardown cards with a weekly next move; exactly three gaps with a weekly move and three-step checklist; exactly six roadmap plays; and citations+honesty. Every stage has its own validator.
- **Changing the schema:** if you edit the schema in the system prompt, update `renderDeliverable()` / `buildMap()` in `advisor.js` to match. Coordinates are 0–100: x = price (0 cheap → 100 dear), y = workflow depth (0 shallow → 100 deep); the gap rect's `x,y` is its **bottom-left** corner.

## Limits, cost & abuse protection

- **`maxDuration: 60`** remains in `vercel.json`; every Anthropic call is aborted server-side at 52 seconds and browser-side at 55 seconds. A timeout marks only that section failed and exposes a targeted retry. Easy calls return immediately.
- **Every report costs seven Sonnet calls plus up to two web searches.** Completed stages are cached, so retries and refreshes do not repay for successful work.
- **Abuse protection:** hidden honeypot, 2.5-second minimum fill time on initial research, and 30 stage attempts / 10 minutes per IP. The larger count accommodates seven calls plus retries. Upstash/Vercel KV remains the durable option; in-memory limiting is the fallback.
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
