# Daily reports — one full report per day, any company

> Single home for the post-onboarding product loop: the daily-report model, the one-a-day limit, report history, and the beta report counter. Read `CLAUDE.md` first. Connector implementation lives in [`integrations.md`](integrations.md); entitlement lives in [`billing.md`](billing.md); beta grants in [`beta.md`](beta.md).

> **Rewritten 2026-07-25 (Phase 2).** This replaced the old *one-company / one-report / daily-brief* model. Every account can now generate **one full report per UTC day, on any company they choose**, and browse every past report. The daily-*brief* cron system is **retired** (dormant code, no schedule). The file name is kept so the docs index link stays valid.

## Product contract

- A signed-in account with access (Pro, Agentic, or an active beta grant) can generate **one full report per UTC calendar day**. Each day's report can be a **different company** — there is no company lock.
- The report is the same seven-call specimen-grade deliverable as before (research → subject/positioning + market map + sources → teardown → gaps → plan). The internal research pack is never returned to the browser.
- **Every completed report is kept and browsable.** `/four` lists them newest-first; each links to `/four?report_id=…`, which re-renders that report.
- The one-a-day limit counts **completed** reports for the current UTC date. A report still generating is resumed, not duplicated; a **failed** attempt does not consume the day, so retries are always allowed until one completes.
- **Beta grants are metered in reports.** A beta account gets **7 reports across 7 days** (whichever runs out first — see [`beta.md`](beta.md)). One report is charged against the grant when it completes; the daily limit still caps them at one a day, so the practical shape is one a day for a week. Pro/Agentic get one a day with no total cap.
- After access ends (beta expired/spent/revoked, or a lapsed subscription), **completed reports stay readable** but no new report can be generated — the same "your work survives, generation locks" rule as before.

## The daily limit, precisely

`reserveReport(userId, input)` in [`lib/product.js`](../lib/product.js) is the gate, called before any model spend:

| State today (UTC) | Result |
|---|---|
| A **completed** report exists | `daily_limit` → `POST /api/advise` returns **429** "Your next one unlocks at 00:00 UTC." |
| A **generating** report, < 10 min old | Resumed — the same report and its sections continue. |
| A **generating** report, stale (> 10 min) | That row is reset and reused (its `report_id` sections stay valid). |
| Only a **failed** report, or none | A fresh `reports` row is created for the chosen company. |

The beta report counter is charged in `api/advise.js` only on the section call that actually completes the report (`completeReport` transitions `generating → completed` exactly once), and only when `access.reason === 'beta-approved'` — a paid generation never touches the grant.

## Storage

Run the migrations in order in the production Supabase SQL editor:

1. [`202607190001_beta_workspaces_daily_briefs.sql`](../supabase/migrations/202607190001_beta_workspaces_daily_briefs.sql) — legacy; `product_workspaces` / `daily_briefs` / `integration_connections`
2. [`202607190002_finding_tasks.sql`](../supabase/migrations/202607190002_finding_tasks.sql)
3. [`202607190003_report_pipeline.sql`](../supabase/migrations/202607190003_report_pipeline.sql) — creates the old `report_sections`; superseded by #5
4. [`202607240001_beta_applications.sql`](../supabase/migrations/202607240001_beta_applications.sql)
5. [`202607250001_daily_reports.sql`](../supabase/migrations/202607250001_daily_reports.sql) — **`reports`** + **`report_sections` re-keyed by `report_id`**

- **`reports`**: one row per generated report — `report_date` (the UTC day), company identity, `status`, the assembled `full_report` JSON, timestamps. Owner-readable via RLS (the deliverable is theirs); all writes are service-role. The one-a-day limit counts completed rows for the current `report_date`.
- **`report_sections`**: server-only per-report pipeline checkpoints, now keyed `(report_id, section)` so each day's report keeps its own seven checkpoints. **No browser RLS policy** — it holds the internal research pack.
- **`finding_tasks`**: unchanged; generated + founder-added checklist state, keyed to a report's gaps.
- **Dormant:** `product_workspaces` and `daily_briefs` still exist and still back the retired `/api/daily-briefs` + `/api/daily-cron` endpoints, but nothing populates or schedules them under the new model.

## Files and flow

```
/four → product.js → GET /api/account
          → renders today's one-a-day state, the beta card, and the report history list
      → advisor.js → GET /api/advise[?report_id=…]
          → resumes today's in-progress report, or renders the most recent / requested one
      → findings.js → GET/POST/PATCH/DELETE /api/finding-tasks

POST /api/advise
  verify user → check access → (research) reserveReport = one-a-day gate + today's report row
  → reserve section by report_id → research once → dependent sections → assemble
  → completeReport → (beta only) beta.consumeReport charges the grant
```

The seven-stage pipeline, its 52-second per-call deadline, section-only retries, and the scripted loading UI are all unchanged — see [`advisor.md`](advisor.md). Only the reservation/identity layer changed: reports are now many-per-user and keyed by `report_id`, not one-per-user.

## Retired: daily briefs

The old model generated one full report, then short daily *briefs* on that locked company via a 07:00 UTC cron. That is gone: the cron is removed from `vercel.json`, and `lib/daily.js` / `api/daily-cron.js` / `api/daily-briefs.js` are dormant (they read `product_workspaces`, which the new path never fills). The `[data-daily]` panel on `/four` is permanently hidden. The code is left in place rather than deleted so nothing breaks on load; a future "continuous monitoring" feature (Agentic) may revive or replace it.

## Required environment

- `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `CRON_SECRET` is no longer used by an active schedule (the cron is retired) but the dormant endpoint still checks it if hit directly.
