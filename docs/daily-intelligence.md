# The product loop — full reports + daily updates

> Single home for the post-onboarding product loop: the two metered loops, the `/four` workspace, report history, and the beta report counter. Read `CLAUDE.md` first. Connector implementation lives in [`integrations.md`](integrations.md); entitlement lives in [`billing.md`](billing.md); beta grants in [`beta.md`](beta.md); the report engine in [`advisor.md`](advisor.md).

> **Rewritten 2026-07-27 (Phase 3).** The single "one full report per UTC day" loop is split in two: the **full report** is the main deliverable at **2 per rolling 7 days**, and the **daily update** is a short, one-click market delta at **1 per UTC day**. `/four` becomes a workspace once the first report completes. The file name is kept so the docs index link stays valid.

## Product contract

Two loops, metered independently:

| | Full report | Daily update |
|---|---|---|
| What | The ten-stage deliverable — market map, teardown, gaps, GTM, funding, 90-day plan | A 30-second delta against that report: what moved, your connected numbers, 3 moves |
| Cadence | **2 completed per rolling 7 days** | **1 per UTC day** |
| Company | Any company, each time | The company of the most recent completed report |
| Cost | Ten Sonnet calls + up to eight searches | One Sonnet call + up to two searches |
| Access | Pro, Agentic, or an active beta grant | Same gate |
| Beta grant | **Charged** — one report per completion | **Never charged** |
| Endpoint | `POST /api/advise` | `POST /api/daily-briefs` |

- **The workspace follows your most recent completed report.** There is no company lock: generate a full report on a different company and `/four` moves to it, and the daily update is cut against it from then on. Past reports stay browsable at `/four?report_id=…`.
- **Every completed report is kept.** The History pane lists them newest-first.
- A **failed** attempt never consumes an allowance slot, so retries are always allowed. A report still generating is resumed, not duplicated — and resuming is permitted even when the window is spent, because an unfinished report has not been charged yet.
- After access ends (beta expired/spent/revoked, or a lapsed subscription), **completed reports and past updates stay readable** but nothing new can be generated.

## The rolling window, precisely

`reserveReport(userId, input)` in [`lib/product.js`](../lib/product.js) is the gate, called before any model spend. It reads every `reports` row created inside the last 7 days (`listReportsInWindow`) and decides:

| State | Result |
|---|---|
| A **generating** report, < 10 min old | `resumed` — same report and sections continue. Checked **before** the cap. |
| A **generating** report, stale, **same** company | That row is reset and reused (its `report_id` sections stay valid) |
| A **generating** report, stale, **different** company | The stale row is failed and a fresh row opens — its saved sections describe the old company and must not be reused |
| **2 completed** inside the window | `weekly_limit` → `POST /api/advise` returns **429** with the allowance and the unlock date |
| Otherwise | A fresh `reports` row for the chosen company |

`allowanceFrom(rows)` computes `{ used, limit, remaining, window_days, next_available_at }`. With the limit spent, `next_available_at` is the **older** of the two most recent completed reports plus 7 days — the moment it falls out of the window. Constants live in `lib/product.js` as `FULL_REPORT_LIMIT` (2) and `FULL_REPORT_WINDOW_DAYS` (7).

The window filters on `created_at` rather than `completed_at` to keep it to one query; a report goes generating → completed within minutes, so the two are interchangeable for this arithmetic.

The beta report counter is charged in `api/advise.js` only on the section call that actually completes the report (`completeReport` transitions `generating → completed` exactly once), and only when `access.reason === 'beta-approved'`. **A daily update never touches the grant.** A beta grant is still 7 days / 7 reports; in practice the rolling window means a beta week yields 2 full reports plus daily updates.

## The daily update

[`lib/daily.js`](../lib/daily.js) cuts it in one `claude-sonnet-5` call with `thinking: { type: 'disabled' }` and the **basic** `web_search_20250305` tool (max 2 uses) — the same two rules the report pipeline follows, for the same deadline reasons.

- Input: the company identity plus `baseline_full_report` from the most recent completed `reports` row, `baseline_report_date`, and `collectMetrics(user.id)` from every configured connection.
- The system prompt frames it explicitly as a **delta against the baseline** — never a restatement of it.
- `max_tokens: 4000`. **Do not lower it** — at 1800 the full schema did not fit, so responses truncated mid-JSON and failed validation wholesale. A `stop_reason` of `max_tokens` is now detected and reported as its own retryable error.
- Output schema: `lead`, `market_competitor_movement`, `own_metrics`, `market_signals`, three `next_moves` each with a three-step checklist, `founder_to_talk_to`, `tool_prompt`, `sources`. Thin days set `no_material_change: true` rather than inventing movement.
- **Never say "nothing material changed today."** The prompt forbids that phrasing, `lib/daily.js` no longer overwrites the headline on a quiet day, and `product.js` renders a quiet day by omitting the status chip and the headline entirely — blank, not filler. The model still leads with the strongest real observation it can support.
- The disclosure that opens the rest of the brief ("See the full 30-second update") is styled as a **glowing green pill button** (`summary.daily-full-cta` in `auth.css`, with a dark-mode neon variant and a reduced-motion fallback), not a text link.
- **The pipeline gates on `normalizeBrief`, not `validBrief`.** `validBrief` remains the full contract the prompt asks for and is what the tests document, but failing the whole call over one missing optional block threw away a paid model call. `normalizeBrief` hard-requires only what the renderer cannot do without — `lead.headline` and at least one usable move — and repairs the rest: non-array sections become `[]`, moves cap at three, a move whose checklist isn't exactly three steps keeps the move and drops the checklist, and `founder_to_talk_to` / `tool_prompt` become `null` so `renderBrief` omits that panel instead of drawing an empty one. Anything repaired is logged as `[daily] brief accepted with gaps: …` so schema drift stays visible.
- **Text blocks must be joined with `''`, never `'\n'`.** With web search on, Claude splits its answer across several `text` blocks at citation boundaries, and those boundaries fall mid-token. A `'\n'` separator injects a literal newline into whatever JSON string the boundary lands in — an unescaped control character — so `JSON.parse` throws and the whole update fails as "did not return readable JSON". `api/advise.js` has always joined `''`; `lib/daily.js` did not until 2026-07-27. `joinText()` now owns this and is regression-tested.
- `extractJson` walks **every** `{` rather than only the first, so a brace inside the model's preamble ("Here is the shape {like this}…") cannot strand the parse on an unparseable slice.
- Connected metric values are used exactly as supplied — the model never invents or rewrites a revenue, churn, traffic or follower number.
- **`api/daily-briefs.js` needs `maxDuration: 60` in `vercel.json`**, alongside `api/advise.js`. Vercel's default is **10 seconds**, which a Sonnet call with two web searches never fits inside; without it every generation dies mid-flight. The model call itself aborts at 52s so the failure is recorded and retryable rather than the function being killed mid-write.

### When it says it could not prepare the update

`POST /api/daily-briefs` answers with a distinct status and `code` per cause — never one generic message. Check the Vercel function log, which prints `[daily-briefs] <code>: <detail>`.

| Response | `code` | Cause |
|---|---|---|
| 503 | `not_configured` | `ANTHROPIC_API_KEY` is absent |
| 503 | `unavailable` | The `daily_briefs` write was refused — `detail` carries the PostgREST reason. **`42703 column "report_id" … does not exist` means migration `202607270001` has not been run.** |
| 502 | `generation_failed` | The model call failed; `detail` is the provider's own message. A valid key with an empty Anthropic balance reads here as `400 … credit balance is too low`; a truncated response reads as "ran out of output room"; an unusable one names the missing field |
| 202 | `generating` | An attempt from the last 10 minutes is still running |
| 409 | `full_report_required` | No completed report to diff against |

## `/four` — the workspace

Before the first completed report `/four` is the marketing scroll it has always been: welcome hero, three-step guide, the engine, the specimen embed, beta and Pro cards. **The moment a completed report exists**, `product.js` adds `.is-workspace` to `<body>` and the page becomes an app shell:

```
┌ workspace header — company, website, report date, two meters ┐
│ Full reports: "1 of 2 left this week"   Daily update: "Ready" │
└──────────────────────────────────────────────────────────────┘
  nav rail            panes (one visible at a time)
  ├ Deliverable  →  report (main) + sticky daily rail   ← prime focus
  ├ Daily        →  the archive of past updates
  ├ Plan         →  gap analysis + 90-day plan, projected out of the report
  ├ Connections  →  Stripe / GA4 / LinkedIn
  ├ History      →  every completed report
  └ Billing      →  plan pill, beta card, Pro upgrade
```

- **The daily update lives beside the deliverable (2026-07-31).** The Deliverable pane is a two-column grid: `.deliverable-main` holds the engine and the rendered report, and `aside.deliverable-side` is a **344px sticky rail** (own scroll, `overscroll-behavior: contain`) holding the generate button, today's state, and the latest brief. `applyMode()` **moves** `[data-daily-live]` out of the Daily pane into the rail when the workspace turns on — moved, not cloned, for the same reason as the Plan projection (`findings.js` listeners). Because the rail is always on screen, `loadDaily()` now runs as soon as the workspace exists rather than on first visit to the Daily pane. **The Daily pane is now the archive**: its history buttons render the chosen brief into the rail and switch to the Deliverable pane. **At ≤1100px the rail stacks above the report**, not below.
- At **≤720px** the rail becomes a fixed bottom tab bar using each item's `data-short` label; `aria-label` carries the full name in both layouts.
- Panes deep-link by hash (`/four#daily`); `?report_id=…` still opens a past report in the Deliverable pane.
- **The Plan pane is a projection, not a copy.** `product.js` *moves* the `#gk-report-gaps` and `#gk-report-plan` nodes out of the rendered deliverable on every `gk:deliverable-rendered` event (dispatched by `advisor.js`). They are moved rather than cloned because `findings.js` has already bound checklist listeners to those nodes and cloning would duplicate finding keys. The report's own section nav links for those two stages are intercepted and switch panes instead of scrolling into a hidden pane.
- The specimen embed is the Deliverable pane's empty state and disappears once a real report exists.

## Storage

Run the migrations in order in the production Supabase SQL editor:

1. [`202607190001_beta_workspaces_daily_briefs.sql`](../supabase/migrations/202607190001_beta_workspaces_daily_briefs.sql) — `product_workspaces` (dormant) / `daily_briefs` / `integration_connections`
2. [`202607190002_finding_tasks.sql`](../supabase/migrations/202607190002_finding_tasks.sql)
3. [`202607190003_report_pipeline.sql`](../supabase/migrations/202607190003_report_pipeline.sql) — superseded by #5
4. [`202607240001_beta_applications.sql`](../supabase/migrations/202607240001_beta_applications.sql)
5. [`202607250001_daily_reports.sql`](../supabase/migrations/202607250001_daily_reports.sql) — **`reports`** + **`report_sections` re-keyed by `report_id`**
6. [`202607260001_report_expansion.sql`](../supabase/migrations/202607260001_report_expansion.sql) — expands the section constraint for the three expansion stages
7. [`202607270001_workspace_daily_updates.sql`](../supabase/migrations/202607270001_workspace_daily_updates.sql) — **`daily_briefs` gains `report_id` / `company_name` / `company_key`**; run before deploying the workspace code

- **`reports`**: one row per generated report. The rolling cap counts completed rows in the last 7 days. Owner-readable via RLS; all writes are service-role. No schema change was needed for the cadence — it is enforced entirely in `lib/product.js`.
- **`daily_briefs`**: one row per user per UTC day (`unique (user_id, brief_date)`), now carrying the report it was cut against. Rows written under the retired cron model have a null `report_id` and stay readable.
- **`report_sections`**: server-only per-report checkpoints keyed `(report_id, section)`. **No browser RLS policy** — it holds the internal research pack.
- **`finding_tasks`**: generated + founder-added checklist state, shared by report gaps and daily moves.
- **Dormant:** `product_workspaces` still exists and still backs `/api/daily-cron`, but nothing populates or schedules it.

## Files and flow

```
/four → product.js → GET /api/account
          → applyMode(): workspace vs. pre-report scroll
          → meters, allowance readout, beta card, history, connections
      → advisor.js → GET /api/advise[?report_id=…]
          → resumes an in-progress report, or renders the most recent / requested one
          → dispatches gk:deliverable-rendered → product.js projects the Plan pane
      → findings.js → GET/POST/PATCH/DELETE /api/finding-tasks

POST /api/advise            (full report — 2 per rolling 7 days)
  verify user → check access → (research) reserveReport = rolling-window gate
  → reserve section by report_id → research once → dependent sections → assemble
  → completeReport → (beta only) beta.consumeReport charges the grant

POST /api/daily-briefs      (daily update — 1 per UTC day)
  verify user → check access → getLatestCompletedReport (409 if none)
  → reserveDailyBrief(date, {report_id, company_name}) → one model call
  → completeDailyBrief.  The beta grant is never touched.
```

## Retired: the daily-brief cron

The pre-2026-07-25 model generated one full report, then short daily briefs on a locked company via a 07:00 UTC cron. The **cron** stays retired — it is out of `vercel.json`, and `api/daily-cron.js` / `lib/daily.js`'s workspace path are unscheduled. What has come back is the brief itself, re-pointed at `reports` and generated **on demand from the Daily pane**, never on a schedule. Always-on monitoring remains the Agentic story.

## Required environment

- `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `CRON_SECRET` is no longer used by an active schedule but the dormant endpoint still checks it if hit directly.

## Finding checklists and the report they belong to

`finding_tasks` state is keyed `(source_type, source_id)`. For `full_report`, **`source_id` is the report's own id** — each report carries its own checklist. `findings.js` sends `report_id` on GET and POST, `advisor.js` supplies it from `pipelineState.workspace.report_id`, and omitting it falls back to the latest completed report.

> **Fixed 2026-07-27.** `resolveSource('full_report', …)` used to read `product_workspaces`, which nothing has populated since the 2026-07-25 report-model change. Every full-report checklist had been answering **404 `source_not_found`** since then; it surfaced as `GET /api/finding-tasks?scope=full_report 404` in the console. It now reads `reports`. The old `source_id` was per-account, so under the multi-report model every report would also have shared one set of tasks.
