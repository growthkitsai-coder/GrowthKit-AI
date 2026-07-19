-- GrowthKit AI: independently persisted first-report pipeline sections.
-- The research pack stays server-only; clients receive only generated report sections.

create table if not exists public.report_sections (
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in (
    'research',
    'subject_positioning',
    'market_map',
    'competitor_teardown',
    'gap_analysis',
    'plan',
    'sources'
  )),
  status text not null default 'generating'
    check (status in ('generating', 'completed', 'failed')),
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.report_sections enable row level security;
-- Intentionally no browser policy. The API returns report sections but never the research pack.

comment on table public.report_sections is
  'Server-only checkpoints for the seven-call first-report pipeline, including the internal research pack.';
