# Auth — login / signup + the gated tool (Supabase)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. Single home for user auth. **Update it whenever the auth pages, flows, or provider config change.**

## What it is

Custom-designed **`/login`** and **`/signup`** (email + password **and** Google **and** GitHub), **`/reset`** (password reset), and **`/four`** — which is now **the product itself, behind login**: the GrowthKit Live tool, gated so only signed-in users reach it, with each user's past reads saved to their account. Auth is **Supabase Auth**, loaded from a CDN — no build step, no auth server of ours. Supabase stores every user, hashes passwords, manages sessions, sends the confirmation + reset emails, and runs the Google/GitHub OAuth flows. All four pages are `noindex` and out of the sitemap. The public tool page `/advisor` is **retired** — it now redirects to `/four`, and the homepage shows a "create a free account / log in" CTA instead of the embedded tool. (Microsoft/Azure was dropped 2026-07-05 — personal-MSA tenant setup was too painful; the OAuth wiring is generic `data-auth-oauth`, so any Supabase provider can be re-added by dropping in a button.)

## Files

- `login.html` / `signup.html` / `reset.html` / `four.html` — pages (`<body data-auth-page="…">`). No footer; minimal top bar.
- **`auth.css`** — shared card/form styling + the `/four` tool-page + read-history styling (light + dark).
- **`auth.js`** — creates the Supabase client; wires each page by `data-auth-page`; email/password sign-up + sign-in; **OAuth via `data-auth-oauth="google|github"`** (generic — any Supabase provider works by adding a button); password reset; remember-me; **redirect-if-already-signed-in** (login/signup bounce to `/four`); and on `/four` the **gate** (redirect to `/login` if not signed in, reveal the app if signed in) + **loads the user's saved reads**.
- **`advisor.js` / `advisor.css`** — the engine itself, reused on `/four`. As of **2026-07-05** the tool takes a **company name (+ optional website + one-liner)**, web-searches for competitors, and renders a full **specimen-grade JSON deliverable** (market map, teardown, gaps, 90-day plan, sources) — see [`docs/advisor.md`](advisor.md). `advisor.js` attaches the Supabase access token to `/api/advise`, **saves each deliverable** to Supabase (`window.GK_SAVE_READS`), and exposes `GKAdvisor.render()` (JSON-aware, with a legacy fallback for older text reads) so `/four` can re-view a saved deliverable.
- **`auth-config.js`** — paste `SUPABASE_URL` + `SUPABASE_ANON_KEY` (+ `REDIRECT_AFTER_LOGIN='/four'`). **Until filled, pages show "not configured" and disable the forms.**
- Supabase SDK per page from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (before `auth-config.js`, then `auth.js`, then `advisor.js` on `/four`).

## ⚠ Setup — do this once (nothing works until you do)

**1. Create the Supabase project.** [supabase.com](https://supabase.com) → New project. **Project Settings → API** → copy **Project URL** → `SUPABASE_URL` and **anon public** key → `SUPABASE_ANON_KEY` in `auth-config.js`. The anon key is safe to serve publicly (RLS protects data). **Never** expose the `service_role` key.

**2. Email + password.** Authentication → Providers → **Email**: enable, turn **ON "Confirm email"** (that's the email-verification step).

**3. Google.** Google Cloud Console → APIs & Services → OAuth consent screen (External) → Credentials → **Create OAuth client ID → Web application** → Authorized redirect URI **`https://<project-ref>.supabase.co/auth/v1/callback`** (copy it from Supabase's Google screen). Then Supabase → Authentication → Providers → **Google** → enable, paste Client ID + secret.

**4. GitHub.** GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. Application name `GrowthKit AI`; Homepage URL `https://growthkitai.com`; **Authorization callback URL** `https://<project-ref>.supabase.co/auth/v1/callback`. Register → copy the **Client ID**, then **Generate a new client secret** and copy it. In Supabase → Authentication → Providers → **GitHub** → enable, paste the Client ID + secret. (No special scopes needed — Supabase requests `user:email` so private-email GitHub accounts still return an email.)

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

**7. Paste the two values into `auth-config.js`, commit, deploy.** Sign-in + the gated tool are now live.

**8. (Recommended) Gate the API too.** So `/api/advise` can't be run anonymously, add the same two values as **Vercel env vars** (Project → Settings → Environment Variables): **`SUPABASE_URL`** and **`SUPABASE_ANON_KEY`**. When present, the function requires a valid Supabase token on every call (it verifies via Supabase's `/auth/v1/user`). When absent, the API stays open — so set these once auth is working. ⚠ Make sure they're on the **same Vercel project that serves growthkitai.com** (there's a known duplicate-project trap — see `docs/advisor.md`).

## Flows (auth.js / advisor.js)

- **Sign up:** `signUp({email,password,options:{emailRedirectTo: origin+'/four'}})`; with Confirm-email on → "check your email" state; link lands on `/four`.
- **Log in / Google / GitHub:** `signInWithPassword` / `signInWithOAuth({provider:'google'|'github', options:{redirectTo: origin+'/four'}})` → `/four`.
- **Already signed in** on `/login` or `/signup` → auto-redirect to `/four`.
- **Reset:** `resetPasswordForEmail(email,{redirectTo: origin+'/reset'})` → `/reset` detects `PASSWORD_RECOVERY` → set-new-password → `updateUser({password})`.
- **`/four` (gated):** `getSession()`; if signed in → reveal the tool + email + Sign out, set `window.GK_SAVE_READS=true`, and load the user's saved reads (most recent 12) into the history panel; if not → redirect to `/login`. Clicking a saved read re-renders it via `GKAdvisor.render`.
- **Every read** is inserted into `reads` (user_id defaults to `auth.uid()`); `/api/advise` is called with `Authorization: Bearer <supabase access token>`.
- **Remember me** routes the session to `localStorage` (default) vs `sessionStorage`; `flowType:'implicit'`.

## Notes / still open

- **No real dashboard yet** — `/four` is the tool + saved reads; there's no other product-behind-login surface. Route-gating is client-side on `/four` plus the server-side API check.
- Routing: `vercel.json` has clean URLs for `/login /signup /reset /four` (all in the checker's `NO_SITEMAP` + `NO_FOOTER`); `/advisor` + `/advisor.html` **redirect to `/four`**. "Log in" is in every marketing top bar; the footer "Growth Advisor" link points to `/four`. Supabase CDN is the only new external dependency.
