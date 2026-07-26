# Auth — login / signup + the gated tool (Supabase)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. Single home for user auth. **Update it whenever the auth pages, flows, or provider config change.**

## What it is

Custom-designed **`/login`** and **`/signup`** (email + password **and** Google **and** GitHub), **`/reset`** (password reset), and **`/four`**, the signed-in product dashboard. Supabase Auth stores users, hashes passwords, manages sessions, sends confirmation/reset emails, and runs sign-in OAuth. Everyone may create a Free account; Free onboarding is saved, but the final step requires Pro to execute the deliverable and offers the public specimen instead. Pro, Agentic, and temporary beta-Pro grants unlock generation, daily intelligence, and read-only data connections. All four pages are `noindex` and out of the sitemap.

## Files

- `login.html` / `signup.html` / `reset.html` / `four.html` — pages (`<body data-auth-page="…">`). No footer; minimal top bar.
- **`auth.css`** — shared card/form styling + the `/four` dashboard, daily brief, finding checklists, integration, and legacy read-history styling (light + dark). Below 680px the header keeps the status dot/sign-out/theme controls and hides the account email label so the bar cannot overflow.
- **`auth.js`** — creates the Supabase client; wires each page by `data-auth-page`; email/password sign-up + sign-in; **OAuth via `data-auth-oauth="google|github"`** (generic — any Supabase provider works by adding a button); password reset; remember-me; **redirect-if-already-signed-in** (login/signup bounce to `/four`); and on `/four` the **gate** (redirect to `/login` if not signed in, reveal the app if signed in) + **loads the user's saved reads**.
- **`advisor.js` / `advisor.css`** — the one-time full-report wizard and specimen-grade renderer. It attaches the Supabase access token to `/api/advise`; the server reserves the user's company before generation and persists the authoritative baseline. Legacy `reads` entries remain viewable.
- **`product.js`** — loads `/api/account`, switches `/four` between Free locked preview/onboarding, completed-report, and entitled daily states, renders daily briefs, and manages Stripe/Google Analytics/LinkedIn connections. See [`daily-intelligence.md`](daily-intelligence.md) and [`integrations.md`](integrations.md).
- The `/four` product-status line surfaces safe beta denial diagnostics from `/api/account`. **Updated 2026-07-24:** the reasons are now `beta-pending`, `beta-expired`, `beta-reports-spent`, `beta-revoked`, and `beta-disabled` — the old signed-in-email-mismatch reason is gone because beta access no longer matches on email at all, it keys off an approved `beta_applications` row for the Supabase user id. A signed-in account applies from the `/four` beta card; Avi approves at `/admin.html`. See [`beta.md`](beta.md).
- **`findings.js`** — renders the shared weekly-move/checklist/founder-introduction action layer and persists generated/custom task state through authenticated `/api/finding-tasks` calls.
- **`auth-config.js`** — paste `SUPABASE_URL` + `SUPABASE_ANON_KEY` (+ `REDIRECT_AFTER_LOGIN='/four'`). **Until filled, pages show "not configured" and disable the forms.**
- Supabase SDK per page from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (before `auth-config.js`, then `auth.js`, then `advisor.js` on `/four`).

## ⚠ Setup — do this once (nothing works until you do)

**1. Create the Supabase project.** [supabase.com](https://supabase.com) → New project. **Project Settings → API** → copy **Project URL** → `SUPABASE_URL` and **anon public** key → `SUPABASE_ANON_KEY` in `auth-config.js`. The anon key is safe to serve publicly (RLS protects data). **Never** expose the `service_role` key.

**2. Email + password.** Authentication → Providers → **Email**: enable, turn **ON "Confirm email"** (that's the email-verification step).

**3. Google.** Google Cloud Console → APIs & Services → OAuth consent screen (External) → Credentials → **Create OAuth client ID → Web application** → Authorized redirect URI **`https://<project-ref>.supabase.co/auth/v1/callback`** (copy it from Supabase's Google screen). Then Supabase → Authentication → Providers → **Google** → enable, paste Client ID + secret.

**3b. Google branding — make the consent screen say "GrowthKit AI", not `<ref>.supabase.co`** (Avi request 2026-07-05). Google's "to continue to …" line shows the raw Supabase domain until branding is configured. In Google Cloud Console → **Google Auth Platform → Branding** (formerly "OAuth consent screen"): **App name** `GrowthKit AI`, user support email, **Authorized domains** → add `growthkitai.com`, homepage `https://growthkitai.com`, privacy `https://growthkitai.com/privacy`, ToS `https://growthkitai.com/terms`; then **Audience → Publish app** (In production). The prompt then reads "to continue to GrowthKit AI". Adding a **logo** triggers Google's brand-verification review (days; needs the authorized domain verified in Search Console — already done for growthkitai.com) — optional, do it for polish. **Caveat:** small print may still mention the supabase.co redirect; the only way to remove supabase.co entirely is Supabase's **Custom Domains** add-on (paid) — point e.g. `auth.growthkitai.com` at Supabase, update the Google client's redirect URI AND `SUPABASE_URL` in `auth-config.js`. Not done; revisit if branding matters at launch.

**4. GitHub.** GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. Application name `GrowthKit AI`; Homepage URL `https://growthkitai.com`; **Authorization callback URL** `https://<project-ref>.supabase.co/auth/v1/callback`. Register → copy the **Client ID**, then **Generate a new client secret** and copy it. In Supabase → Authentication → Providers → **GitHub** → enable, paste the Client ID + secret. (No special scopes needed — Supabase requests `user:email` so private-email GitHub accounts still return an email.) **Branding note (2026-07-05):** the authorize screen's "Authorizing will redirect to `https://<ref>.supabase.co`" fine print **cannot be rebranded** — GitHub always shows the real callback domain (anti-phishing); only the paid Supabase Custom Domains add-on changes it (see step 3b's caveat). Free polish: upload the GrowthKit logo in the OAuth App settings ("Application logo").

**5. URL configuration.** Supabase → Authentication → **URL Configuration** → **Site URL** `https://growthkitai.com`; **Redirect URLs**: add `https://growthkitai.com/four` and `https://growthkitai.com/reset` (+ `http://localhost:3000/*` for `vercel dev`).

**6. Create the `reads` table** (stores each user's saved reads, protected by row-level security so users only see their own). Supabase → **SQL Editor** → run:

```sql
create table public.reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  product text,
  competitors text,
  moves text,
  output text
);
alter table public.reads enable row level security;
create policy "own reads - select" on public.reads for select using (auth.uid() = user_id);
create policy "own reads - insert" on public.reads for insert with check (auth.uid() = user_id);
```

**6b. Create the `profiles` table** (stores each user's **onboarding-wizard answers** as one JSON row, so the wizard pre-fills on return; row-level security so users only touch their own). Supabase → **SQL Editor** → run:

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
alter table public.profiles enable row level security;
create policy "own profile - all" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

The `reads` and `profiles` tables are independent; the tool works without `profiles` (the wizard just won't persist/pre-fill its answers), but add it so onboarding sticks.

**7. Paste the two values into `auth-config.js`, commit, deploy.** Sign-in + the gated tool are now live.

**8. Configure the server gate.** Add **`SUPABASE_URL`**, **`SUPABASE_ANON_KEY`**, and **`SUPABASE_SERVICE_ROLE_KEY`** as Vercel server env vars. Product APIs fail closed when these are absent; the service-role value must never appear in browser code. Make sure all values are on the same Vercel project that serves growthkitai.com.

**8b. ⚠ RUN EVERY MIGRATION — the product is dead without them.** `reads` + `profiles` above are NOT enough. Supabase → **SQL Editor** → paste and run each of these **in order**:

1. [`202607190001_beta_workspaces_daily_briefs.sql`](../supabase/migrations/202607190001_beta_workspaces_daily_briefs.sql) → `product_workspaces`, `daily_briefs`, `integration_connections`
2. [`202607190002_finding_tasks.sql`](../supabase/migrations/202607190002_finding_tasks.sql) → `finding_tasks`
3. [`202607190003_report_pipeline.sql`](../supabase/migrations/202607190003_report_pipeline.sql) → `report_sections`
4. [`202607240001_beta_applications.sql`](../supabase/migrations/202607240001_beta_applications.sql) → `beta_applications`

All are `create table if not exists`, so re-running is safe. **Symptom when skipped (hit for real on 2026-07-24):** `getWorkspace()` gets PostgREST `PGRST205 "Could not find the table 'public.product_workspaces'"`, so `GET /api/account` returns **503 "Your workspace is not available yet"**, and `/four` shows **"We could not confirm your plan. Please try again."** It looks exactly like an Anthropic/API-key outage but no model call is ever made. **Verify quickly** (service-role key, never commit it):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$SUPABASE_URL/rest/v1/product_workspaces?select=user_id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

`200` = table exists. `404` = migration not run.

## Flows (auth.js / advisor.js)

- **Sign up:** `signUp({email,password,options:{emailRedirectTo: origin+'/four'}})`; with Confirm-email on → "check your email" state; link lands on `/four`.
- **Log in / Google / GitHub:** `signInWithPassword` / `signInWithOAuth({provider:'google'|'github', options:{redirectTo: origin+'/four'}})` → `/four`.
- **Already signed in** on `/login` or `/signup` → auto-redirect to `/four`.
- **Reset:** `resetPasswordForEmail(email,{redirectTo: origin+'/reset'})` → `/reset` detects `PASSWORD_RECOVERY` → set-new-password → `updateUser({password})`.
- **`/four` (gated):** `getSession()` redirects signed-out visitors to `/login`. Signed-in users get server-authoritative access/workspace state from `/api/account`. Free accounts may complete onboarding and see a locked dashboard preview; the review action saves `profiles.data` (including an onboarding-complete marker), then shows “Purchase Pro to generate your deliverable” with Upgrade-to-Pro and specimen actions instead of calling the engine. Pro, Agentic, and beta-Pro accounts generate and receive daily/integration surfaces. If access later ends, the completed report remains readable, while daily intelligence and integrations lock.
- **`/four` onboarding (redesigned 2026-07-08; entitlement gate 2026-07-22):** the signed-in user goes through a **13-step adaptive wizard** covering the full ~25-question startup profile, then review. Before any model call, `advisor.js` awaits the profile upsert and `/api/account` entitlement check. Free users get the saved paywall/specimen state; entitled users enter the seven-stage engine. The saved `_onboarding_complete` marker returns upgraded users directly to review. Fast-track is subject to the same save-before-check rule. `advisor.js` renders from `STEPS`, serializes `profile_text`, and stores one JSON profile row per user.
- **`/four` (gated):** `getSession()` redirects signed-out visitors to `/login`. Signed-in users get a server-authoritative access/workspace state from `/api/account`; no-access accounts see the Pro upgrade, eligible new accounts see onboarding, and completed accounts see today's daily brief plus connected-data controls. New full-report gaps and daily findings are working documents: generated and custom tasks persist independently from the report JSON, and every finding offers a prefilled email request for a relevant founder introduction.
- **`/four` (gated):** `getSession()`; if signed in → reveal the tool + email + Sign out, set `window.GK_SAVE_READS=true`, and load the user's saved reads (most recent 12) into the history panel; if not → redirect to `/login`. Clicking a saved read re-renders it via `GKAdvisor.render`.
- **`/four` post-login workspace (2026-07-18):** above the engine, signed-in users land on a **welcome workspace** — a cycling typewriter greeting, the "Your market intelligence workspace." subtitle, a 3-step getting-started guide with a CTA into the wizard, a scrollable embedded `/specimen`, and a prominent "Go Pro" upgrade card (Stripe checkout via `billing.js`). See [`docs/pages.md`](pages.md) / [`docs/billing.md`](billing.md).
- **`/four` onboarding (redesigned 2026-07-08):** the signed-in user goes through a **13-step adaptive wizard** covering the full ~25-question startup profile — fast single-choice screens (industry, stage, adaptive business model) plus themed **grouped** screens (Nutshell, Team, Product, Customers, Traction, Market & competition, Pricing & funding), then a review → one "Generate deliverable" button → the web-searching engine, then a premium animated loading sequence. It's mostly multiple-choice, with text only where a question is genuinely open. A **fast-track** link on the first screen generates from just a company name. `advisor.js` renders the steps from its `STEPS` config, serializes the answers into a labelled `profile_text`, and **upserts the answers object to Supabase `profiles`** (one JSON row per user) so the wizard pre-fills next time. See [`docs/advisor.md`](advisor.md).
- **One full report** is stored authoritatively in `product_workspaces`; the older `reads` table remains a browser-readable history mirror for compatibility. `/api/advise` and all product APIs require `Authorization: Bearer <supabase access token>`.
- **Remember me** routes the session to `localStorage` (default) vs `sessionStorage`; `flowType:'implicit'`.

## Notes / still open

- `/four` is now the dashboard: one-time report onboarding, daily briefs, billing state, integration setup, and legacy reads. Route visibility is client-side, but every paid/beta capability is enforced by server APIs.
- Routing: `vercel.json` has clean URLs for `/login /signup /reset /four` (all in the checker's `NO_SITEMAP` + `NO_FOOTER`); `/advisor` + `/advisor.html` **redirect to `/four`**. "Log in" is in every marketing top bar; the footer "Growth Advisor" link points to `/four`. Supabase CDN is the only new external dependency.
