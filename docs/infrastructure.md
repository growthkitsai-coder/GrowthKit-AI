# Infrastructure — hosting, routing, caching, CI, workflow

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for hosting/accounts, `vercel.json`, SEO plumbing, the consistency checker + CI, and the day-to-day workflow. **Update it whenever any of that changes.**

## Hosting & accounts

- **Production domain:** **growthkitai.com** (canonical on every page).
- **Hosting:** Vercel, project `growthkit-ai` (id `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz`). **Pushing to `main` on GitHub auto-deploys.**
- **GitHub:** repo https://github.com/growthkitsai-coder/GrowthKit-AI, account `growthkitsai-coder`. *(Credentials are NOT stored anywhere in this repo — every .md here is committed and the repo is public. Ask Avi; a Personal Access Token is the right pattern.)*
- **Search Console:** verified via both the `google-site-verification` meta tag in `index.html` and the file `googlea9dc9b0133a60f51.html`.
- **Analytics:** Vercel Web Analytics on every page via `/_vercel/insights/script.js`, preceded by a `window.va` queue shim + click listener emitting **custom events**: `cta_click` (clicks on `/waitlist` links and `.nav-cta`/`.btn-primary`, with page + section + href), `waitlist_signup` / `waitlist_error`, `onboarding_submitted` / `onboarding_error`, `status_check_failed`, `advisor_run` / `advisor_complete` / `advisor_error`. **Vercel records custom events on Pro/Enterprise only** — on Hobby they're silently ignored (pageviews still work), so don't conclude the wiring is broken if no events show up.
- **Server secret:** `ANTHROPIC_API_KEY` — a Vercel env var (Production + Preview), read only by `api/advise.js`. **Never in git** (the repo is public). Set it in the Vercel dashboard; see [`docs/advisor.md`](advisor.md). Until it's set, `/advisor` returns "not configured".

## vercel.json

- **Clean URLs:** a `rewrites` entry (`/privacy` → `/privacy.html`) AND a 301 `redirects` entry (`/privacy.html` → `/privacy`) per page. Current list: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status /specimen /pricing /onboarding /advisor` (onboarding is noindex and deliberately out of the sitemap; the checker's `NO_SITEMAP` list knows).
- **Serverless function (since 2026-06-12 — the repo's first backend):** `api/advise.js` powers the Growth Advisor (`/advisor`). Vercel auto-runs anything under `/api/` as a function — no rewrite needed. It's CommonJS with zero npm deps (raw `fetch`), so there's still no `package.json` / build step. **`vercel.json` `functions` sets `api/advise.js` → `maxDuration: 60`** (Hobby ceiling; the Claude call must finish inside it). Full detail — model, prompt, the **required `ANTHROPIC_API_KEY` env var**, rate limiting — in [`docs/advisor.md`](advisor.md). The repo is otherwise still a plain static site; this one function is the only exception.
- **Cache headers:** images/fonts = `public, max-age=31536000, immutable`; **css/js = `public, max-age=0, must-revalidate`**. The css/js rule is load-bearing: `theme.css`/`theme.js` are not fingerprinted, and the previous 1h+stale-while-revalidate rule served day-old CSS after deploys — making shipped dark-mode work look broken and burning a whole debugging session (2026-06-11). ETag 304s make revalidation nearly free. **Never loosen this without fingerprinting the files first.**
- **Security headers** (all routes): HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`. **`security.html`'s terminal readout quotes these verbatim — update that page if they change.**
- **Noindex headers:** `X-Robots-Tag: noindex, nofollow` on `/d/(.*)` and `/deliverables/(.*)` (client deliverables — see deliverable-pipeline.md). `robots.txt` also disallows `/d/` and `/deliverables/`.

## SEO plumbing

- Every public page: canonical (correct URL), OpenGraph (`og:title/description/url/image` + 1200×630 `og-card.png`), Twitter card, JSON-LD, sitemap entry. `index.html` carries Organization + WebSite + WebPage + FAQPage schema; `careers.html` adds JobPosting; `pricing.html` adds Product+Offers. Match the pattern when adding pages — the checker enforces most of it.
- `sitemap.xml`, `robots.txt`, `site.webmanifest` at root.

## Guard rails — consistency checker + CI

Every page duplicates head/topbar/footer by hand, so cross-page consistency drifts silently. Two automated checks:

- **`scripts/check-site.mjs`** — plain Node ≥18, zero dependencies. **Run `node scripts/check-site.mjs` after any change to HTML / `sitemap.xml` / `vercel.json`, before committing.** Fails on: placeholder `href="#"`/`href="/#"` on a public page; sitemap ↔ vercel.json rewrite/redirect parity breaks (or a listed file missing); a public page lacking canonical (with correct URL), `og:title/description/url/image`, `twitter:card`, or JSON-LD (404.html must stay noindex); footer link grids diverging (`#x` ↔ `/#x` normalized); `logo.html` leaking into sitemap or public links; any internal href/src that doesn't resolve to a file, clean URL, or real `id` anchor; `SCRIPT_URL` empty or mismatched between `waitlist.html` and `status.html`. **The exception lists at the top of the script (`INTERNAL_PAGES`, `NO_FOOTER`, `NO_SITEMAP`) must be kept current when pages are added.**
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
