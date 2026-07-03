# Auth — login / signup (Supabase)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. Single home for user auth. **Update it whenever the auth pages, flows, or provider config change.**

## What it is

Custom-designed **`/login`** and **`/signup`** pages (email + password **and** Google), plus **`/reset`** (password reset) and **`/four`** (a placeholder "you're in" landing shown after login — the real dashboard is TODO). Auth is handled by **Supabase Auth**, loaded from a CDN — no build step, no server code of ours. Supabase stores every user, hashes passwords, manages sessions, sends the confirmation + reset emails, and runs the Google OAuth flow. All four pages are `noindex` and out of the sitemap (app pages, not marketing).

## Files

- `login.html` / `signup.html` / `reset.html` / `four.html` — the pages (`<body data-auth-page="…">`). No footer; minimal top bar (brand + theme toggle). Standard light "Studio" + dark "neon console".
- **`auth.css`** — shared card/form styling (light + dark).
- **`auth.js`** — shared logic: creates the Supabase client, wires each page by its `data-auth-page`, handles email/password sign-up + sign-in, Google OAuth, password reset (request + set-new), "remember me", and the signed-in check on `/four`. Turns Supabase errors into friendlier copy.
- **`auth-config.js`** — the two values you paste in (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) + `REDIRECT_AFTER_LOGIN` (`/four`). **Until both are filled, the pages show "sign-in isn't configured yet" and disable the forms** (same pattern as the Advisor before its key).
- Supabase SDK is loaded per page from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (before `auth-config.js`, then `auth.js`).

## ⚠ Setup — REQUIRED before sign-in works (do this once)

**1. Create the Supabase project.** [supabase.com](https://supabase.com) → New project (free tier). Then **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL` in `auth-config.js`
   - **anon public** key → `SUPABASE_ANON_KEY` in `auth-config.js`
   The anon key is **safe to commit/serve** (it's the publishable key; Row-Level Security protects data). **Never** put the `service_role` key anywhere client-side.

**2. Email + password.** Authentication → Providers → **Email**: enable it, and turn **ON "Confirm email"** (this is the email-verification step — new signups must click the emailed link before they can log in).

**3. Google sign-in.** Two halves:
   - **Google Cloud Console** → APIs & Services → OAuth consent screen (External, add your email as a test user or publish) → Credentials → **Create OAuth client ID** → *Web application*. Under **Authorized redirect URIs** add exactly: `https://<your-project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase's Google provider screen). Copy the **Client ID** + **Client secret**.
   - **Supabase** → Authentication → Providers → **Google**: enable, paste the Client ID + secret, save.

**4. URL configuration.** Supabase → Authentication → **URL Configuration**:
   - **Site URL:** `https://growthkitai.com`
   - **Redirect URLs:** add `https://growthkitai.com/four` and `https://growthkitai.com/reset` (and `http://localhost:3000/four` etc. if you test locally with `vercel dev`).

**5. Paste the two values into `auth-config.js`, commit, deploy.** Sign-in is now live. Every signup appears under Authentication → Users in the Supabase dashboard — that's the record that lets people log back in.

## Flows (in `auth.js`)

- **Sign up:** `signUp({email, password, options:{emailRedirectTo: origin+'/four'}})`. With "Confirm email" on, no session is created yet → the page swaps to a "check your email" state. The confirmation link lands them on `/four`.
- **Log in:** `signInWithPassword` → redirect to `/four`.
- **Google:** `signInWithOAuth({provider:'google', options:{redirectTo: origin+'/four'}})` → Google → back to `/four`.
- **Reset:** `resetPasswordForEmail(email, {redirectTo: origin+'/reset'})` sends a link; `/reset` detects the recovery return (`PASSWORD_RECOVERY` / `type=recovery`), shows a "set new password" form, and calls `updateUser({password})`.
- **Remember me** (login): a custom storage adapter routes the session to `localStorage` (persist across restarts, default) or `sessionStorage` (cleared on close) based on the checkbox. Uses `flowType: 'implicit'` so OAuth/recovery tokens come back in the URL hash and are handled by `detectSessionInUrl`.
- **`/four`:** on load, `getSession()`; if signed in, shows the email + Sign out; if not, redirects to `/login` after a short beat (to let an OAuth/confirm redirect settle).

## Not yet done / notes

- **`/four` is a placeholder** — no route-gating anywhere else yet, no real dashboard. Post-login just lands here (per the brief). Building the actual product-behind-login is the next step.
- **Login/signup aren't linked from the site nav** (the brief was "just make the pages"). To surface them, add a "Log in" link to the topbar across pages — a multi-file chrome edit — when ready.
- Routing: `vercel.json` has clean-URL rewrites+redirects for `/login /signup /reset /four`; all four are in `check-site.mjs`'s `NO_SITEMAP` + `NO_FOOTER`. The Supabase CDN URL is the only new external dependency (CI lychee will ping it).
