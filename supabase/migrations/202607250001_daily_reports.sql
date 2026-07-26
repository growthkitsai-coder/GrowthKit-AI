-- GrowthKit AI — daily full reports (Phase 2, 2026-07-25)
--
-- Replaces the one-company / one-report model with **one full report per UTC day,
-- on any company**, keeping every past report browsable. Beta grants 7 of these
-- (7 days or 7 reports, whichever first — see lib/beta.js); Pro gets one a day
-- ongoing. The old daily-*brief* cron model is retired.
--
-- Safe to run as-is: the report tables were empty when this shipped, so the
-- report_sections recreate below loses nothing. `product_workspaces` and
-- `daily_briefs` are intentionally left in place but dormant — the retired
-- brief endpoints still reference them and must keep loading.
--
-- Run in Supabase → SQL Editor, after the earlier migrations. Idempotent.

-- ── reports: many per user, one row per generated report ────────────────────
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- The UTC calendar day this report was started. The one-a-day limit counts
  -- COMPLETED reports for the current report_date (enforced in lib/product.js).
  report_date    date not null,

  company_name   text not null,
  company_key    text not null,          -- normalized name; lets us dedupe/label
  website        text,
  competitors    text,
  profile_text   text,

  status         text not null default 'generating'
                 check (status in ('generating', 'completed', 'failed')),
  full_report    jsonb,                  -- the assembled deliverable (safe to expose to the owner)

  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- History is "this user's reports, newest first"; the daily-limit check filters
-- by (user_id, report_date). Both are covered here.
create index if not exists reports_user_created_idx on public.reports (user_id, created_at desc);
create index if not exists reports_user_date_idx    on public.reports (user_id, report_date);

alter table public.reports enable row level security;
-- The owner may read their own reports (the deliverable is shown to them anyway).
-- All writes go through the service role in lib/product.js — no write policy.
drop policy if exists "own reports - select" on public.reports;
create policy "own reports - select" on public.reports
  for select using (auth.uid() = user_id);

comment on table public.reports is
  'One full report per row; one COMPLETED report per user per UTC day. Service-role writes only.';
comment on column public.reports.report_date is
  'UTC day the report was started. The one-a-day limit counts completed reports for the current date.';

-- ── report_sections: re-keyed from (user_id, section) to (report_id, section) ─
-- Empty at ship time, so a clean recreate is lossless and simpler than an ALTER.
drop table if exists public.report_sections;
create table public.report_sections (
  report_id    uuid not null references public.reports(id) on delete cascade,
  section      text not null check (section in (
    'research', 'subject_positioning', 'market_map', 'competitor_teardown',
    'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics',
    'plan', 'sources'
  )),
  status       text not null default 'generating'
               check (status in ('generating', 'completed', 'failed')),
  output       jsonb,
  error        text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (report_id, section)
);
alter table public.report_sections enable row level security;
-- Intentionally NO browser policy: report_sections holds the internal research
-- pack, which must never reach the client. The API returns generated sections
-- only, never research.

comment on table public.report_sections is
  'Server-only per-report pipeline checkpoints, including the internal research pack. No browser policy.';

-- ── Support reset (run manually after verifying a request) ──────────────────
-- delete from public.finding_tasks where user_id = '<uuid>';
-- delete from public.reports where user_id = '<uuid>';   -- cascades report_sections
-- delete from public.reads where user_id = '<uuid>';
-- delete from public.profiles where user_id = '<uuid>';
