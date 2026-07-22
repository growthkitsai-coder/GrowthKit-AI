# Daily intelligence — one company, one full report, ongoing briefs

> Single home for the post-onboarding product loop: workspace locking, the one-full-report rule, daily brief generation/storage, and the GMT cron. Read `CLAUDE.md` first. Connector implementation lives in [`integrations.md`](integrations.md); entitlement lives in [`billing.md`](billing.md).

## Product contract

- Every beta, Pro, or Agentic account is tied to **one company**.
- The first-report pipeline locks the company before research, then checkpoints seven calls independently. The report becomes complete only when all public sections have been assembled; the internal research pack is never part of the visible report.
- Daily brief GET and POST, the UTC cron, and connected-data APIs all call the same server-side entitlement gate. Free, canceled, past-due, and expired-beta accounts receive no new daily updates and cannot fetch daily history or use integrations. Their completed full report remains readable; this exception applies only to the report, not ongoing intelligence.
- Failed/stale generations can retry the same company. A completed report cannot be regenerated. Support can reset a mistaken company manually after verifying the request to `info@growthkitai.com` (SQL is at the bottom of the migration). A reset clears the workspace, daily/legacy reads, saved profile, and provider connections so data from the mistaken company cannot leak into the replacement; the user must reconnect providers.
- Immediately after the full report, `/four` requests the first daily brief. After that, a secured Vercel cron runs at **07:00 UTC/GMT** every day; opening `/four` also fills a missing brief for the current UTC date.
- A daily brief is a 30-second read: one lead signal, collapsed detail, market/competitor movement, connected own metrics, market signals, three evidence-led findings with concrete moves, one founder to learn from, and one relevant GrowthKit tool prompt. Each new finding includes a persistent three-step checklist, founder-added tasks, and a finding-specific introduction email.
- If the scan is quiet, the model sets `no_material_change=true` and leads with **"No material change today"**, while still surfacing the strongest defensible observation. It never invents connected metrics.

## Storage

Run all migrations, in order, in the production Supabase SQL editor before deploy:

1. [`202607190001_beta_workspaces_daily_briefs.sql`](../supabase/migrations/202607190001_beta_workspaces_daily_briefs.sql)
2. [`202607190002_finding_tasks.sql`](../supabase/migrations/202607190002_finding_tasks.sql)
3. [`202607190003_report_pipeline.sql`](../supabase/migrations/202607190003_report_pipeline.sql)

- `product_workspaces`: one row per user; immutable company identity, report status, completed JSON baseline, profile context, UTC timezone.
- `daily_briefs`: unique `(user_id, brief_date)`; idempotent generation state and final JSON.
- `finding_tasks`: generated and founder-added tasks keyed to a full-report gap or dated daily finding. Completion state is separate from immutable report/brief JSON.
- `report_sections`: server-only stage checkpoints, including the internal research pack; no browser RLS policy.
- Both expose read-only RLS to the owner. All writes use the server-only Supabase service role.
- `integration_connections` is created by the same migration but has no browser policy; see integrations.md.

The API reserves a workspace before spending model/search credits. A generation left in `generating` for more than 10 minutes is considered stale and may retry. Workspace retries use the previous `updated_at` as an optimistic lock; daily generation uses insert-only first reservation plus an optimistic stale-retry update. The unique user/date constraint therefore prevents duplicate cron or browser requests from both spending model credits.

## Files and flow

```
/four → product.js → GET /api/account
                  → GET/POST /api/daily-briefs
      → findings.js → GET/POST/PATCH/DELETE /api/finding-tasks

GET/POST /api/advise
  verify signed-in user → check paid/beta access → reserve company workspace
  → research once → generate/checkpoint dependent sections → assemble baseline

GET /api/daily-cron at 07:00 UTC
  verify Bearer CRON_SECRET → completed workspaces → re-check current access
  → generate one brief per UTC date

lib/daily.js
  baseline full report + profile + connected metrics + live web search
  → compact JSON brief → daily_briefs

lib/findings.js
  authoritative full report or dated brief → synchronize generated tasks
  → create/check/delete founder tasks in finding_tasks
```

`api/daily-cron.js` checks up to 100 completed workspaces concurrently. Current Vercel Hobby cron restrictions allow one invocation per day and may run at any point within the 07:00 hour; function duration is still capped at 60 seconds. At a materially larger active cohort, move fan-out to a durable queue/workflow rather than increasing concurrency indefinitely.

## Daily JSON contract

`brief_date`, `no_material_change`, `lead`, `market_competitor_movement`, `own_metrics`, `market_signals`, exactly three `next_moves`, `founder_to_talk_to`, `tool_prompt`, and `sources`. Every `next_moves` item requires `priority`, the specific `finding`, a concrete `action` for this week, `because`, and exactly three checklist tasks. The server rejects incomplete responses and forces the lead headline to "No material change today" when the quiet flag is true. The browser escapes all model strings and only links absolute HTTPS source/profile URLs. Existing stored briefs are not retrofitted; the working-document layer appears only on briefs generated under the new contract.

The founder-introduction CTA is generated locally as a prefilled `mailto:info@growthkitai.com` link containing the company, exact finding, and next move. It does not use the model or spend tokens.

## Required environment

- Existing: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- New: `CRON_SECRET` (random 16+ characters; Vercel sends it as `Authorization: Bearer ...`).
- Optional: `GK_DAILY_MODEL` (defaults to `claude-sonnet-5`).

The daily function uses at most two live web searches and 1,800 output tokens. Connected metrics are gathered before the model call and passed as structured JSON.
