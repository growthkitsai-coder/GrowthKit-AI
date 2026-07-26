# Infrastructure — hosting, routing, caching, CI, workflow

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for hosting/accounts, `vercel.json`, SEO plumbing, the consistency checker + CI, and the day-to-day workflow. **Update it whenever any of that changes.**

## Hosting & accounts

- **Production domain:** **growthkitai.com** (canonical on every page).
- **Hosting:** Vercel, project `growthkit-ai` (id `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz`). **Pushing to `main` on GitHub auto-deploys.**
- **⚠ TWO Vercel accounts / TWO projects named `growthkit-ai` (discovered 2026-07-03).** The project above is the real one — it holds the growthkitai.com domains and the GitHub integration. But the local Vercel CLI and the Claude Vercel connector are logged in as **`avi-aggarwal14`**, which **cannot see that team**; `vercel link` therefore auto-created an empty duplicate (`prj_rS1BidALX24zStAipzNYnHSXFQS4` on `avi-aggarwal14s-projects`, no deployments, no domains) and `.vercel/project.json` points at it. **Anything done via the CLI/MCP from this repo — env vars, domains, logs — lands on the dead duplicate, not production.** This is how `ANTHROPIC_API_KEY` ended up "set" while production 503'd (see [`docs/advisor.md`](advisor.md)). Production changes must go through the dashboard of the account that owns the original team (or re-login the CLI to that account).
- **Beta deployment diagnosis (2026-07-26):** production correctly served the then-current manual-application beta flow, but `main` had removed `GK_BETA_EMAILS`, so redeploying after editing that env var could never grant access. The allowlist compatibility path was restored in code later that day. When verifying its deployment, use a cache-busted `product.js` and confirm it contains `beta-allowlist`, then validate authenticated `/api/account`; always set the env value on the original team project described above.
- **Domain regression (open, 2026-07-03):** the apex currently **307-redirects to `www.growthkitai.com`** — backwards; every canonical/OG/sitemap URL is the bare domain. Fix in the original project → Settings → Domains: `growthkitai.com` primary, `www` redirects to it.
- **GitHub:** repo https://github.com/growthkitsai-coder/GrowthKit-AI, account `growthkitsai-coder`. *(Credentials are NOT stored anywhere in this repo — every .md here is committed and the repo is public. Ask Avi; a Personal Access Token is the right pattern.)*
- **Search Console:** verified via both the `google-site-verification` meta tag in `index.html` and the file `googlea9dc9b0133a60f51.html`.
- **Analytics:** Vercel Web Analytics on every page via `/_vercel/insights/script.js`, preceded by a `window.va` queue shim + click listener emitting **custom events**: `cta_click` (clicks on `/waitlist` links and `.nav-cta`/`.btn-primary`, with page + section + href), `waitlist_signup` / `waitlist_error`, `onboarding_submitted` / `onboarding_error`, `status_check_failed`, `advisor_run` / `advisor_complete` / `advisor_error`. **Vercel records custom events on Pro/Enterprise only** — on Hobby they're silently ignored (pageviews still work), so don't conclude the wiring is broken if no events show up.
- **Server env vars** (Vercel, never in git — repo is public): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are required for product generation; product APIs fail closed when this gate is incomplete. Billing, private-beta, cron, and connector secrets are catalogued in [`docs/billing.md`](billing.md), [`docs/daily-intelligence.md`](daily-intelligence.md), and [`docs/integrations.md`](integrations.md). **Set them on the ORIGINAL project that serves growthkitai.com** — see the two-accounts warning above. Auth's client keys live in `auth-config.js`; the service-role key never does.

## vercel.json

- **Clean URLs:** a `rewrites` entry (`/privacy` → `/privacy.html`) AND a 301 `redirects` entry (`/privacy.html` → `/privacy`) per page. Current list: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status /specimen /pricing /onboarding /login /signup /reset /four` (onboarding + the four auth pages are noindex and out of the sitemap; the checker's `NO_SITEMAP` knows). **`/advisor` is retired** — `/advisor` and `/advisor.html` now **redirect to `/four`** (the tool moved behind login, 2026-06-12); advisor.html was deleted. Auth pages + the gated tool: see [`docs/auth.md`](auth.md).
- **Serverless product APIs:** Vercel auto-runs files under `/api/` with no route rewrite. They cover the full report, account state, billing/webhook, daily briefs/cron, persistent finding tasks, and OAuth integrations; shared server modules live under `lib/`. `stripe` is the only npm dependency. `vercel.json` keeps report/daily functions at the 60-second Hobby ceiling and schedules `/api/daily-cron` at `0 7 * * *` UTC. Vercel invokes it with `Authorization: Bearer $CRON_SECRET`; Hobby timing may drift within the 07:00 hour.
- **Cache headers:** images/fonts = `public, max-age=31536000, immutable`; **css/js = `public, max-age=0, must-revalidate`**. The css/js rule is load-bearing: `theme.css`/`theme.js` are not fingerprinted, and the previous 1h+stale-while-revalidate rule served day-old CSS after deploys — making shipped dark-mode work look broken and burning a whole debugging session (2026-06-11). ETag 304s make revalidation nearly free. **Never loosen this without fingerprinting the files first.**
- **Security headers** (all routes): HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`. **`security.html`'s terminal readout quotes these verbatim — update that page if they change.**
- **Noindex headers:** `X-Robots-Tag: noindex, nofollow` on `/d/(.*)` and `/deliverables/(.*)` (client deliverables — see deliverable-pipeline.md). `robots.txt` also disallows `/d/` and `/deliverables/`.

## SEO plumbing

- Every public page: canonical (correct URL), OpenGraph (`og:title/description/url/image` + 1200×630 `og-card.png`), Twitter card, JSON-LD, sitemap entry. `index.html` carries Organization + WebSite + WebPage + FAQPage schema; `careers.html` adds JobPosting; `pricing.html` adds Product+Offers. Match the pattern when adding pages — the checker enforces most of it.
- `sitemap.xml`, `robots.txt`, `site.webmanifest` at root.

## Guard rails — consistency checker + CI

Every page duplicates head/topbar/footer by hand, so cross-page consistency drifts silently. Two automated checks:

- **`scripts/check-site.mjs`** — plain Node ≥18, zero dependencies. **Run `node scripts/check-site.mjs` after any change to HTML, CSS, `sitemap.xml`, or `vercel.json`, before committing.** Fails on: placeholder `href="#"`/`href="/#"` on a public page; sitemap ↔ vercel.json rewrite/redirect parity breaks (or a listed file missing); a public page lacking canonical (with correct URL), `og:title/description/url/image`, `twitter:card`, or JSON-LD (404.html must stay noindex); footer link grids diverging (`#x` ↔ `/#x` normalized); `logo.html` leaking into sitemap or public links; any internal href/src that doesn't resolve to a file, clean URL, or real `id` anchor; `SCRIPT_URL` empty or mismatched between `waitlist.html` and `status.html`; or unbalanced blocks, comments, and strings in any root CSS file. Internal-link validation strips query strings before checking clean routes, so embed/state URLs such as `/specimen?embed=1` resolve against `/specimen`. **The exception lists at the top of the script (`INTERNAL_PAGES`, `NO_FOOTER`, `NO_SITEMAP`) must be kept current when pages are added.**
- **`.github/workflows/site-checks.yml`** — runs the checker on every push/PR + weekly Monday cron + manual dispatch, plus a **lychee** job for external URLs only (jsDelivr pins, Google Fonts, LinkedIn, Apps Script). Accepts `999` (LinkedIn's bot-block — don't "fix" it) and `429`; excludes `growthkitai.com` self-references (a new page's canonical 404s until the same push deploys) and the `fonts.gstatic.com` preconnect root. **`--base-url 'https://growthkitai.com/'` is load-bearing:** lychee v0.23 hard-errors on root-relative links (`/waitlist`, `/#engine`) in local files; base-url resolves them to production URLs which the exclude rule then skips. **Don't remove it or swap it for `--root-dir`** — root-dir resolves against the filesystem where clean URLs don't exist as files, and every page fails again (this exact failure ran on every push until 2026-06-11).
- **CI does not gate deploys** — Vercel ships on push regardless. A red ✗ means the live site shipped with a problem: fix and push again.

## Workflow

- Edit HTML directly; no build, no lint, no tests — but **run the checker before committing** (above).
- Local preview: open the file in a browser, or `vercel dev` for clean-URL rewrites.
- `git push origin main` → auto-deploy to growthkitai.com. (Commit policy and multi-tool rules live in CLAUDE.md.)
- Never commit `.env.local` (holds `VERCEL_OIDC_TOKEN`), `.vercel/`, `.env`/`.env.*`, or anything with credentials — all gitignored.
- Topbar / footer / `<head>` blocks are duplicated on every page — chrome changes mean editing **all** HTML files (see docs/pages.md for the canonical nav + footer grids).

## New-page checklist (the checker enforces 1–3)

1. `vercel.json` — add to both `rewrites` AND `redirects`.
2. `sitemap.xml` — add the URL block (unless deliberately noindex → add to the checker's `NO_SITEMAP` instead).
3. Footers/nav on every page, if the page is linked.
4. `scripts/check-site.mjs` exception lists if it's a special page (no footer / not in sitemap / internal).
5. Docs: `docs/pages.md` (description) + anything else the page touches, + a memory.md change-log entry.
6. `node scripts/check-site.mjs` green before commit.
