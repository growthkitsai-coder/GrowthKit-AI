-- GrowthKit AI — workspace + daily updates (Phase 3, 2026-07-27)
--
-- Splits the product loop in two:
--   • the FULL report  — the main deliverable, max 2 completed per rolling 7 days
--   • the DAILY update — a short one-click market delta, 1 per UTC day
--
-- The full-report cadence is enforced entirely in lib/product.js (reserveReport
-- counts completed `reports` rows inside the rolling window), so no schema
-- change is needed for it. What DOES need schema: a daily update must know which
-- company it is about, because /four now follows the founder's most recent
-- report and that company can change.
--
-- `daily_briefs` keeps its name and its unique (user_id, brief_date) — one
-- update per UTC day, whichever company is active — and gains a pointer to the
-- report it was cut against.
--
-- Run in Supabase → SQL Editor, after 202607260001_report_expansion.sql.
-- Idempotent and non-destructive.

alter table public.daily_briefs
  add column if not exists report_id    uuid references public.reports(id) on delete set null,
  add column if not exists company_name text,
  add column if not exists company_key  text;

-- The Daily pane lists updates for the active company, newest first.
create index if not exists daily_briefs_user_company_idx
  on public.daily_briefs (user_id, company_key, brief_date desc);

comment on column public.daily_briefs.report_id is
  'The full report this update was cut against — the baseline the model diffs the market since.';
comment on column public.daily_briefs.company_name is
  'Company the update covers, denormalized from reports so history survives a deleted report.';

-- Rows written under the retired one-company cron model have no report_id. They
-- stay readable; the Daily pane simply shows them under their brief_date.
