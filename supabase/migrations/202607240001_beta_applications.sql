-- GrowthKit AI — beta applications + approvals (2026-07-24)
--
-- Replaces the hand-pasted GK_BETA_EMAILS Vercel env var as the source of truth
-- for who may use the beta. Avi approves applicants; approval starts a window
-- that ends after 7 DAYS **or** 7 FULL REPORTS, whichever comes first.
--
-- Why a table and not the env var: approving someone previously meant editing a
-- Vercel env var and redeploying. This makes approval instant, auditable, and
-- revocable, and lets the server count reports against the grant.
--
-- Run this in Supabase → SQL Editor. It is idempotent.
--
-- ⚠ This table contains customer email addresses. It is PII: never export it
--   into this repo, into any .md file, or into logs. The repo is public.

create table if not exists public.beta_applications (
  user_id            uuid primary key references auth.users (id) on delete cascade,

  -- Snapshot of the address at apply time. The access check still matches on the
  -- live Supabase identity email (see lib/subscriptions.js) — this column exists
  -- so the admin list is readable without joining auth.users.
  email              text not null,

  -- pending → approved → (expired | revoked). 'pending' is the state an applicant
  -- sits in until Avi acts; it grants nothing.
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'expired', 'revoked')),

  note               text,                    -- optional "why I want in" from the applicant
  applied_at         timestamptz not null default now(),

  -- Set when Avi approves. The 7-day clock starts here, NOT at apply time.
  approved_at        timestamptz,
  approved_by        uuid references auth.users (id),

  -- Hard end of the window: least(approved_at + 7 days, exhaustion of reports).
  -- Stored explicitly so the boundary survives a change to the 7-day constant.
  expires_at         timestamptz,

  -- Full reports consumed against this grant. Enforced server-side in lib/beta.js;
  -- a grant is spent when reports_used >= reports_limit.
  reports_used       integer not null default 0 check (reports_used >= 0),
  reports_limit      integer not null default 7 check (reports_limit >= 0),

  revoked_at         timestamptz,
  updated_at         timestamptz not null default now()
);

-- The admin list is "newest applications first"; approvals are looked up per user
-- by primary key, so only the list ordering needs help.
create index if not exists beta_applications_status_applied_idx
  on public.beta_applications (status, applied_at desc);

-- Email lookup supports reconciling an approval against a signed-in identity.
create index if not exists beta_applications_email_idx
  on public.beta_applications (lower(email));

alter table public.beta_applications enable row level security;

-- A user may read ONLY their own row, and may never write any column: applying
-- goes through api/beta.js and approving through api/admin-beta.js, both of which
-- use the service_role key. If a user could write, they could approve themselves.
drop policy if exists "beta_applications_select_own" on public.beta_applications;
create policy "beta_applications_select_own"
  on public.beta_applications for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies are defined on purpose. With RLS enabled and
-- no policy, those operations are denied for every non-service_role caller.

comment on table  public.beta_applications is
  'Beta tester applications and approvals. Written only by the server (service_role). Contains PII — never export.';
comment on column public.beta_applications.expires_at is
  'End of the beta grant: approved_at + 7 days. The grant also ends early once reports_used reaches reports_limit.';
comment on column public.beta_applications.reports_used is
  'Full reports generated against this beta grant. Incremented server-side when a report starts.';
