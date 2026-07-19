# GrowthKit AI

> ## 🚨 NON-NEGOTIABLE — UPDATE THE .md FILES AFTER **EVERY** PIECE OF WORK 🚨
>
> **This applies to EVERY agent and EVERY tool — Claude Code, Claude Cowork, Codex, or anything else — doing ANY work of ANY kind anywhere in this folder/codebase.** The moment your work is done — a feature, a bug fix, a copy tweak, a config change, a new file, a one-line edit, *anything* — you MUST, in that same session, **before you consider the task finished**:
>
> 1. **Append a dated change-log entry to `memory.md`** outlining exactly what you did.
> 2. **Update the relevant `docs/*.md` topic file(s)** — pages, design system, infrastructure, forms, pipeline — wherever your work made a description stale (see "The docs set" below for what lives where).
> 3. **Update `CLAUDE.md` (this file)** — if the work changed any rule, convention, company fact, or workflow recorded here.
> 4. **`AGENTS.md`** stays a pointer — touch it only if the pointer itself went stale.
>
> **No exceptions. Nothing is "too small to document."** Multiple agents work in this repo and the .md files are their only shared memory — undocumented work is how they overwrite and contradict each other. **A task is NOT complete until the .md files describe what was done.**

> ## 🚨 NON-NEGOTIABLE — ASK AVI INPUT QUESTIONS **BEFORE** STARTING ANY TASK 🚨
>
> **Every agent, every tool, every task: before going off and doing the work, ask Avi as many clarifying input questions as you want/need** — scope, design intent, copy voice, priorities, what "done" looks like — so the task is done to *his* standard, not your assumption of it. Never silently guess on something Avi could settle in one answer.
>
> - **For any important or large-scale work** (new pages, redesigns, refactors spanning files, infrastructure/plumbing changes, anything touching many files or hard to undo): **ask a MINIMUM of ~5 meaningful questions and wait for his answers BEFORE starting.** Meaningful = questions whose answers would genuinely change what you build (audience, scope boundaries, visual references, trade-offs, what to leave untouched) — not filler asked to hit the count.
> - For small/mechanical tasks (a typo, a one-line fix, a clearly specified tweak): the minimum doesn't apply, but still ask anything that's genuinely ambiguous before editing.
> - Ask the questions **up front in one batch** where possible, not spread mid-task after work has already gone a wrong direction.

Marketing site for **GrowthKit AI** — a market-intelligence engine for founders. The product is software + operator review that produces four deliverables for seed → Series A teams: a **market map**, a **competitor teardown**, a **gap analysis**, and a **90-day plan** (~14 plays). Refreshed monthly. UK-based, serving GB / US / worldwide.

Tagline: *"Markets, dissected — not guessed."*  
Brand positioning: *consulting-grade work at SaaS prices.*

## Company facts

- **Founded:** 2026, London · Remote. **Status:** v0.4 (private beta).
- **Pricing (updated 2026-06-10):** free Pilot tier (invite-only, from the waitlist); **Basic $30/month** (full deliverable set, refreshed monthly); **Premium Agentic $200/month** (Basic + continuous agentic monitoring, mid-cycle alerts, plan re-cuts, operator review on every refresh). 1-to-1 partner work is direct-contact only. **`pricing.html` is the public source of truth** (Product+Offer JSON-LD in its head); the index FAQ repeats the numbers and links to `/pricing` — keep all three in sync when prices change. **Stripe billing went live 2026-07-18 with a single "Pro" monthly price** — note the mismatch with the two marketed tiers (Basic/Premium), flagged in `docs/billing.md` to reconcile. The engine is **un-paused** (was paused 2026-07-07); pause via the `GK_ADVISOR_DISABLED=1` Vercel env var if needed.
- **Product access (updated 2026-07-19):** everyone may create an account and buy Pro. Only emails in the private Vercel `GK_BETA_EMAILS` allowlist receive free Pro-equivalent beta access. Matching trims/lowercases; `GK_BETA_ENABLED=0` halts free beta immediately. Every eligible account gets one company, one full report, then ongoing daily briefs in `/four` on a UTC/GMT day boundary. Never put the allowlist or customer PII in this public repo.
- **Audience:** seed / Series A founders with a product. **Not** pre-idea founders or enterprises with their own market-intel teams.
- **Contact:** `info@growthkitai.com` (referenced from every page).
- **Hiring:** two open Intern roles (Growth → "Head of Growth" track, Marketing → "CMO" track); applications to the contact email, subject `Internship — GrowthKit AI`.

## People

- **Avi Aggarwal** — Co-Founder. The user (me, Claude, is talking to Avi). Personal LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/
- **Company LinkedIn:** https://www.linkedin.com/company/growth-kit-ai/

## Stack

**Plain static site + serverless functions.** No build step, no framework. **One npm dependency** (`stripe`, in `package.json` — added 2026-07-18 for billing; `node_modules` gitignored, Vercel installs on deploy). Per-page CSS is inlined in each page's `<head>`; shared files are `theme.css` + `theme.js` (theme system), `advisor.css` + `advisor.js` (the GrowthKit Live tool — now **behind login on `/four`**; see `docs/advisor.md`), and `auth.css` + `auth.js` + `auth-config.js` (the `/login` `/signup` `/reset` `/four` pages, Supabase Auth via CDN, Google + GitHub — see `docs/auth.md`). **The tool is gated: `/advisor` is retired (→ `/four`), every top bar has a "Log in" link.** GSAP/ScrollTrigger/Lenis load on `index.html` only (jsDelivr), as does `threads.js` (zero-dep vanilla-WebGL dark-hero effect — see `docs/design-system.md`). Fonts: Instrument Serif / Inter / JetBrains Mono (Google Fonts). Hosted on Vercel; **pushing to `main` auto-deploys to growthkitai.com**.

**The exceptions to "static" — the `api/` serverless functions:** `api/advise.js` powers **GrowthKit Live** (the gated tool on `/four`); given a company name it uses Claude's **web_search** tool to dissect that company's real competitors and returns a specimen-grade JSON deliverable. Billing functions power paid Pro; account/daily APIs enforce one company and generate UTC daily briefs; integration APIs provide encrypted read-only Stripe Connect, GA4, and LinkedIn connections. Server secrets live only in the Vercel dashboard and product APIs fail closed when required auth/storage settings are absent. Full detail: `docs/advisor.md`, `docs/billing.md`, `docs/daily-intelligence.md`, and `docs/integrations.md`.

## The docs set — where everything lives

This file holds the **rules**. The deep reference material lives in five topic files under `docs/`. **Before working in an area, open its file. After working in an area, update its file.**

| File | Single home for |
|---|---|
| [`docs/pages.md`](docs/pages.md) | Every page: what it is, sections, schema, dark-mode state, footers/topbar nav grids, image/OG assets |
| [`docs/design-system.md`](docs/design-system.md) | Color tokens, fonts, copy voice, the neon-console dark-mode architecture (keyframes, patterns, hard rules), theme mechanics |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Hosting/accounts, analytics events, `vercel.json` (clean URLs, cache, security headers), SEO plumbing, the consistency checker + CI, workflow, new-page checklist |
| [`docs/forms-and-data.md`](docs/forms-and-data.md) | Waitlist + onboarding pipelines, both Apps Scripts, `SCRIPT_URL` rules, Sheets as system of record, anti-spam |
| [`docs/deliverable-pipeline.md`](docs/deliverable-pipeline.md) | Phase 4 product code: generator, template, `clients/`, `d/`, token URLs, the repo-is-public security model |
| [`docs/advisor.md`](docs/advisor.md) | The live product: the gated tool on `/four` + `api/advise.js` serverless function, Claude model/prompt, **web search + the JSON deliverable schema**, `ANTHROPIC_API_KEY` setup, NDJSON progress stream, rate limiting, cost |
| [`docs/auth.md`](docs/auth.md) | User auth: the `/login` `/signup` `/reset` `/four` pages, Supabase setup (incl. Google OAuth), `auth-config.js`, the shared `auth.css`/`auth.js` |
| [`docs/billing.md`](docs/billing.md) | Stripe subscriptions: `api/checkout.js` `api/portal.js` `api/stripe-webhook.js`, the `subscriptions` table, the beta/Pro access gate, `billing.js`, env vars + Stripe dashboard setup |
| [`docs/daily-intelligence.md`](docs/daily-intelligence.md) | One-company workspace, one full report, ongoing daily brief contract, storage, GMT cron, and support reset |
| [`docs/integrations.md`](docs/integrations.md) | Stripe Connect, Google Analytics, and LinkedIn OAuth, encrypted tokens, metrics, scopes, and provider setup |

`memory.md` holds the **dated change log** (append after every task), sharp edges/gotchas, and open action items. `AGENTS.md` is a pointer for non-Claude agents.

## Conventions (the rules — details in the docs set)

- **Each HTML page is self-contained.** Don't extract inline CSS into shared files without a real reason — the pattern is deliberate (no bundler, fastest first paint).
- **Light mode is untouchable site DNA** (cream + forest), but **dark mode is now the default first load** (unless the visitor saved light mode). **Dark mode is the "neon console"** — a deliberately different aesthetic. All dark work goes under `:root[data-theme="dark"]`; every animation gets a reduced-motion fallback; shared neon layer lives in `theme.css`. Full architecture + pattern vocabulary: `docs/design-system.md`.
- **Clean URLs:** every public page needs a `vercel.json` rewrite + redirect AND a sitemap entry. Follow the new-page checklist in `docs/infrastructure.md`.
- **Copy voice:** confident, operator-grade, no fluff; em-dashes for asides; italic `<em>` inside headings is *the* signature pattern ("Markets, <em>dissected</em>"). "A founder, not a form, will reply" recurs.
- **SEO:** every public page has canonical, OG (+ `og-card.png`), Twitter card, JSON-LD, sitemap entry — the checker enforces it.
- **Chrome is duplicated, not templated:** topbar/footer/`<head>` blocks repeat on every page. Chrome changes mean editing ALL pages; the checker enforces identical footer grids. Canonical grids: `docs/pages.md`.
- **Run `node scripts/check-site.mjs` before committing** any change to HTML / `sitemap.xml` / `vercel.json`. CI re-runs it plus an external-link check on every push, but **CI does not gate deploys** — red ✗ means the live site shipped broken. Details: `docs/infrastructure.md`.
- **Never commit secrets or PII:** `.env*`, `.vercel/`, `node_modules`, credentials, Anthropic/Stripe/OAuth secrets, token-encryption/state secrets, `CRON_SECRET`, the private `GK_BETA_EMAILS` allowlist, the Supabase `SUPABASE_SERVICE_ROLE_KEY` (all live only as Vercel env vars), or client data (`clients/*`, `d/*` are gitignored except demos). Stripe **price** ids and the Supabase **anon** key are public and safe. Every .md file here is committed to a public repo — treat them as public.

## Working with Cowork and Claude Code

Avi runs both Claude Cowork (desktop app) and Claude Code (CLI in VS Code) against this repo. Both read this file + `memory.md` + `docs/`. Two rules keep them from stepping on each other:

**Commit policy.** Whenever either tool changes a file, commit before the user switches to the other tool — otherwise the second tool may overwrite uncommitted work.

- **Claude Code: auto-commit any change.** After any successful edit, `git add` the files you changed and commit with a concise message. Do not push automatically (Avi may want to bundle commits) unless he explicitly asks. If a commit fails, surface the reason and stop. If the tree contains changes you didn't make, commit **only your own files by explicit path** — never `git add -A` over a parallel session's work.
- **Claude Cowork: prompt the user to commit.** Cowork doesn't run git; after any meaningful change, remind Avi to commit (or to switch to Code to commit) before changing tools.
- **One agent session at a time.** Parallel sessions in this one working tree have repeatedly swept each other's half-finished work into commits and collided mid-edit. Serialize; commit between sessions.

**Tool strengths — redirect when the other tool fits better** (don't refuse; do what you can, then suggest the better tool with one specific reason):

- **Cowork:** open-ended planning/brainstorming, web research, copywriting and tone work, generating non-code deliverables (images, PDFs, decks), connector tasks (Gmail, Calendar, Notion…), visual review of the deployed site via Claude in Chrome, scheduled recurring tasks, rich plugins (marketing, SEO, design, canvas-design…).
- **Claude Code:** actual HTML/CSS/JS edits (especially multi-file chrome changes), git operations, `vercel dev`, shell debugging, fast file-level iteration — anything where the diff matters more than the conversation.

Example redirect phrasing: *"I can do this here, but Claude Code will be faster for a multi-file footer edit — want me to draft the change and you run it there?"*
