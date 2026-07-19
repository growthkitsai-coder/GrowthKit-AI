-- GrowthKit AI: one-company workspaces, one full report, daily briefs,
-- and encrypted third-party integration tokens.
-- Run in the production Supabase SQL editor before deploying the matching code.

create table if not exists public.product_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  company_key text not null,
  website text,
  competitors text,
  profile_text text,
  full_report_status text not null default 'generating'
    check (full_report_status in ('generating', 'completed', 'failed')),
  full_report jsonb,
  full_report_started_at timestamptz,
  full_report_completed_at timestamptz,
  daily_briefs_started_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_workspaces enable row level security;
drop policy if exists "own workspace - select" on public.product_workspaces;
create policy "own workspace - select" on public.product_workspaces
  for select using (auth.uid() = user_id);

create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  status text not null default 'generating'
    check (status in ('generating', 'completed', 'failed')),
  brief jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create index if not exists daily_briefs_user_date_idx
  on public.daily_briefs (user_id, brief_date desc);

alter table public.daily_briefs enable row level security;
drop policy if exists "own daily briefs - select" on public.daily_briefs;
create policy "own daily briefs - select" on public.daily_briefs
  for select using (auth.uid() = user_id);

create table if not exists public.integration_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'google_analytics', 'linkedin')),
  provider_account_id text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integration_connections enable row level security;
-- No browser policies: OAuth tokens and provider metadata are server-only.
-- The dashboard reads sanitized connection state through /api/integrations.

comment on table public.product_workspaces is
  'One immutable company and one completed full report per GrowthKit user. Service-role writes only.';
comment on table public.daily_briefs is
  'One UTC/GMT daily intelligence brief per user. Service-role writes only.';
comment on table public.integration_connections is
  'AES-256-GCM encrypted OAuth credentials. Never expose ciphertext to clients.';

-- Support reset procedure (run manually after verifying the request):
-- delete from public.finding_tasks where user_id = '<uuid>';
-- delete from public.report_sections where user_id = '<uuid>';
-- delete from public.daily_briefs where user_id = '<uuid>';
-- delete from public.integration_connections where user_id = '<uuid>';
-- delete from public.reads where user_id = '<uuid>';
-- delete from public.profiles where user_id = '<uuid>';
-- delete from public.product_workspaces where user_id = '<uuid>';
