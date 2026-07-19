-- GrowthKit AI: persistent generated and founder-added tasks for report findings.
-- Run after 202607190001_beta_workspaces_daily_briefs.sql.

create table if not exists public.finding_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('full_report', 'daily_brief')),
  source_id text not null,
  finding_key text not null,
  task_key text not null,
  label text not null check (char_length(label) between 1 and 180),
  origin text not null check (origin in ('generated', 'custom')),
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, finding_key, task_key)
);

create index if not exists finding_tasks_source_idx
  on public.finding_tasks (user_id, source_type, source_id, finding_key, sort_order);

alter table public.finding_tasks enable row level security;
drop policy if exists "own finding tasks - select" on public.finding_tasks;
create policy "own finding tasks - select" on public.finding_tasks
  for select using (auth.uid() = user_id);

comment on table public.finding_tasks is
  'Generated and founder-added checklist progress for full-report gaps and daily findings. Service-role writes only.';
