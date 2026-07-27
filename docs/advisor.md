# GrowthKit Live — report engine

> Single home for the authenticated `/four` report engine. Read [`CLAUDE.md`](../CLAUDE.md) first. Update this file whenever the model, stages, schemas, limits, renderer, or persistence contract changes.

> **Status: enabled.** `api/advise.js` runs a ten-call, dependency-aware pipeline. Every call is independently persisted and has a 52-second server deadline. `GK_ADVISOR_DISABLED=1` remains the immediate cost kill switch.

## Product and entitlement

GrowthKit Live is behind login at `/four`. The 13-step adaptive wizard captures the founder profile; fast-track can start from only a company name. `POST /api/advise` requires Pro, Agentic, or a current beta grant before it reserves a report or spends model tokens. `GET /api/advise` deliberately remains available to the report owner after access ends, so completed work is still readable.

Eligible accounts can generate **two full reports per rolling 7 days**, on any company each time — the cap is enforced by `reserveReport` and returns HTTP 429 with code `weekly_limit` and the unlock date. The short **daily update** is a separate, cheaper loop metered at one per UTC day; see [`daily-intelligence.md`](daily-intelligence.md). Reports are immutable once assembled, appear newest-first in history, and reopen with `/four?report_id=…`. Expansion fields introduced on 2026-07-26 are **new-report only**: legacy completed reports mark the three new stages `not_applicable` and retain their original layout.

Once a report completes, `/four` becomes a workspace shell. `renderPipeline` and `renderInto` dispatch `gk:deliverable-rendered` on `document` after every render so the workspace can project the gap-analysis and 90-day-plan sections into its Plan pane; the deliverable re-renders on each pipeline tick, so that projection is re-applied every time rather than done once.

The generated report contains:

1. Subject brief and positioning.
2. TAM, SAM, and SOM with methods, confidence, and caveats.
3. Three to five ranked target segments.
4. A five-year market-trend chart when comparable public data exists.
5. Indexed search demand, normalized 0–100, when live indexed evidence exists. It is never presented as keyword volume.
6. Market map and four-company competitor teardown.
7. Three gap analyses with weekly moves and persistent checklists.
8. Exactly three ranked GTM plays.
9. A scored window of opportunity with horizon, triggers, risks, and next move.
10. A six-play 90-day plan.
11. Funding landscape: five-axis radar, funded comparables, active investors, and recent rounds.
12. Weekly Stripe, Google Analytics, and LinkedIn metrics for every connection configured when the report is generated.
13. Consolidated sources and an explicit AI-draft/verification note.

## Ten-stage architecture

```text
research (live search; internal)
├─ subject_positioning
├─ market_map ── competitor_teardown ── gap_analysis
└─ opportunity (live search)
   └─ capital_metrics (live search + direct connected-metric snapshot)

research + positioning + opportunity + teardown + gaps
└─ strategy_timing

opportunity + capital_metrics ── sources
all public dependencies + sources ── plan
all ten complete ── reports.full_report (report_version: 2)
```

The three expansion stages—`opportunity`, `strategy_timing`, and `capital_metrics`—are exactly three additional Anthropic calls. They are split rather than folded into an existing prompt so each can be retried without repaying successful work.

- `api/advise.js` validates access, stage dependencies, and each JSON contract; reserves/checkpoints one stage; omits the internal research pack from browser state; and assembles `reports.full_report` only after all ten stages complete.
- `advisor.js` schedules dependency-ready stages, resumes interrupted reports, polls in-progress work, and renders section-local failures with retry controls. Desktop uses sticky report navigation; mobile uses a horizontally scrolling section navigator. In workspace mode `product.js` intercepts the report nav's Gaps and 90-day-plan links and switches to the Plan pane instead of scrolling.
- `advisor.css` owns report layout and visual components, including sizing and segment cards, evidence line charts, GTM/window cards, funding radar/lists, and connected metric cards.
- `lib/integrations.js` collects first-party provider values. The model never receives, estimates, or rewrites those values.
- `findings.js` plus `/api/finding-tasks` owns persistent generated/custom checklist state and founder-introduction actions.

## Storage and migration

- `reports`: one row per full report, including company identity, UTC `report_date`, status, final `full_report`, and timestamps. The 2-per-rolling-7-days cap is enforced in code, not schema.
- `report_sections`: server-only checkpoint rows keyed by `(report_id, section)`. It contains the internal research pack and has no browser read policy.
- `profiles`: saved wizard answers.
- `finding_tasks`: persistent checklist state.
- `reads`: legacy compatibility only.

Run [`202607260001_report_expansion.sql`](../supabase/migrations/202607260001_report_expansion.sql) **before deploying the ten-stage code**. It expands the `report_sections.section` check constraint to accept `opportunity`, `strategy_timing`, and `capital_metrics`. The migration is non-destructive. Fresh databases get the same constraint from `202607250001_daily_reports.sql`.

If production shows **“This section could not be reserved”** first on Market opportunity while earlier stages completed, the production constraint was not expanded. Run the whole migration file in Supabase SQL Editor, then retry Market opportunity; completed earlier stages are cached. The migration deliberately contains only the two constraint statements—no optional quoted table comment—because a truncated dashboard paste of that comment previously produced PostgreSQL `42601 unterminated quoted string`.

## Model and evidence contract

- Model: `claude-sonnet-5`, low effort, non-streaming JSON.
- Thinking must remain explicitly disabled. Omitting the flag enables adaptive thinking and previously pushed web-search calls past the 52-second deadline.
- Search stages use basic `web_search_20250305`, never `web_search_20260209`; the newer dynamic-filtering variant previously added enough latency to cause repeatable 504s.
- Research uses up to two searches and a 5,200-token ceiling. Opportunity and capital/funding use up to three searches each. Other stages use only the saved research/dependency pack.
- Opportunity must use ranges or “not defensible” where public evidence cannot support precision. Trend and demand charts use `available=false` with empty points rather than invented series.
- Funding radar scores are directional synthesis, not audited facts. Funding lists include direct sources when available.
- Connected metrics are fetched concurrently with the funding model call and are bounded to 20 seconds. A timeout is rendered as a provider-snapshot error, not misreported as “no connections”.
- Every model stage has its own validator. If a schema changes, update its validator, dependency map, renderer, tests, migration constraint if applicable, and this file together.

## Limits, retries, and cost

- Vercel `maxDuration` is 60 seconds; Anthropic calls abort at 52 seconds. Only the failed section is retried.
- A successful report costs ten Sonnet calls and up to eight basic web-search uses. Completed stages are cached.
- Initial research retains the hidden honeypot and 2.5-second minimum-fill check.
- Rate limit: 30 stage attempts per IP per 10 minutes, leaving room for ten calls plus targeted retries. Durable KV is preferred; memory is the fallback.
- Responses use `Cache-Control: no-store`.

## Setup and production diagnostics

Required Vercel variables include `ANTHROPIC_API_KEY` plus the Supabase variables documented in [`auth.md`](auth.md). The key needs API credit and web-search access. A valid key with an empty Anthropic balance returns HTTP 400, not 401, and appears as a retryable stage failure.

There have historically been two Vercel projects named `growthkit-ai`. The project serving `growthkitai.com` is the source of truth for environment variables and deployments; setting a key on the unused duplicate has no effect. Never commit keys or provider credentials.

## Privacy and analytics

Founder inputs and public-web queries go to Anthropic. Completed reports and profile context are stored in the account. Connected provider values are retrieved server-side and stored only as the report-time snapshot described in [`integrations.md`](integrations.md).

Current browser analytics events are `advisor_run`, `advisor_complete`, and `advisor_error`. Reported market sizes, indexed demand, and funding data remain AI-assisted research and must be verified before material decisions.
