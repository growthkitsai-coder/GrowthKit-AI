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

> ## 🚨 NON-NEGOTIABLE — COMMIT AFTER **EVERY SINGLE FILE** YOU FINISH 🚨
>
> **This applies to ABSOLUTELY EVERY session and every tool — Claude Code, Claude Cowork, Codex, anything else.** The moment you are done writing in a file — however many lines, one or a thousand — **commit that file immediately**. Do **not** batch several files into one commit at the end of the task, and do **not** wait until the whole task is finished. **One finished file = one commit.** Avi wants a dense, granular commit history.
>
> - **Per file, not per task.** Finished `advisor.js`? Commit it. Then edit `advisor.css`? Commit that separately when you're done with it. A ten-file task should produce ~ten commits.
> - **Commit only your own files, by explicit path** — `git add path/to/file`, **never `git add -A`**, which sweeps a parallel session's half-finished work into your commit.
> - **Commit finished units, not broken mid-edits.** "Done with that file" means it's coherent — syntax-valid, not half-refactored. Don't commit a file you're about to keep editing in the same breath.
> - **Still run `node scripts/check-site.mjs` before committing** any change to HTML / `sitemap.xml` / `vercel.json` (see Conventions below).
> - **Still don't push automatically** — pushing remains opt-in unless Avi explicitly asks (see Commit policy below). Commit often, push when told.
> - **Commit messages can be anything** — short, terse, throwaway, whatever. There is no message-quality rule here; don't block or slow a commit over wording.

Marketing site for **GrowthKit AI** — a market-intelligence engine for founders. The product is software + operator review that produces four deliverables for seed → Series A teams: a **market map**, a **competitor teardown**, a **gap analysis**, and a **90-day plan** (~14 plays). Refreshed monthly. UK-based, serving GB / US / worldwide.

Tagline: *"Markets, dissected — not guessed."*  
Brand positioning: *consulting-grade work at SaaS prices.*

## Company facts

- **Founded:** 2026, London · Remote. **Status:** v0.4 (private beta).
- **Pricing (updated 2026-07-24): exactly three tiers.** **Free £0** saves onboarding and shows a locked dashboard preview + public specimen, but cannot execute a deliverable, receive daily intelligence, or use data connections. **Pro £20/month displayed** (Stripe currently charges £19.99/month) unlocks the full deliverable, dashboard, daily intelligence, and read-only connections. **Agentic is COMING SOON and displays no price (updated 2026-07-24)** — it is positioned publicly as *the* product GrowthKit is building toward (always-on monitoring, mid-cycle alerts, plan re-cuts, priority operator review), with Pro framed as the first, smaller slice of it. **Agentic will be priced on usage (API/token cost), not a flat monthly subscription** — never publish a monthly figure for it. Its card shows a "Coming soon" tag, the readout "Usage-based", and a `/waitlist` CTA (no Stripe checkout). Beta is not a fourth tier: allowlisted beta users receive temporary Pro-equivalent access. 1-to-1 partner work is direct-contact only. **`pricing.html` is the public source of truth** (Product+Offer JSON-LD in its head; the Agentic Offer carries no `price` and uses `availability: PreOrder`); the index FAQ repeats the numbers and links to `/pricing` — keep all three in sync when prices change. See `docs/billing.md` for the display-versus-checkout distinction. The engine is **un-paused**; pause via `GK_ADVISOR_DISABLED=1` if needed. **The engine also needs credit on the Anthropic account** — a valid key with a zero balance returns HTTP 400 `invalid_request_error` ("credit balance is too low"), which looks like an outage, not a billing problem.
- **Product access (updated 2026-07-26):** everyone may create a Free account and save onboarding. Only Pro, Agentic, or a current beta grant may execute the deliverable or use integrations. There are two private-beta entry paths: **(1) an exact normalized verified email in the private `GK_BETA_EMAILS` Vercel value receives unrestricted Pro-equivalent beta access**, and **(2) everyone else may apply** (`/four` → beta card → `POST /api/beta`) for Avi to approve by hand at `/admin.html`; an approved application ends after **7 days or 7 full reports, whichever comes first**. The allowlist accepts comma/newline/semicolon lists or a JSON string array, trims/lowercases exact addresses, checks the top-level Supabase email plus verified OAuth identity email locations, and never trusts user-editable metadata. Admin rights come from `GK_ADMIN_USER_IDS` (Supabase **user ids**, never emails) and fail closed. A paid subscription is always checked first. `GK_BETA_ENABLED=0` halts both beta paths instantly; `GK_BETA_EXPIRES_AT` ends both at once. **Full detail: `docs/beta.md`.** If paid/beta access ends, completed reports remain readable, but generating new ones locks. **Product model (rewritten 2026-07-27, Phase 3) — two loops, metered separately:** the **full report** is the main deliverable at **2 completed per rolling 7 days**, on any company (no company lock); the **daily update** is a short, one-click market delta at **1 per UTC day**, cut against the most recent completed report. Both need Pro/Agentic/beta, but **only full reports charge the beta counter** — a database-approved grant is still 7 days / 7 reports, which the rolling window makes ~2 full reports plus daily updates per beta week. Once the first report completes, `/four` becomes a **workspace app shell** (Deliverable · Daily · Plan · Connections · History · Billing) that follows the company of the latest report; before that it stays the marketing scroll. Every past report is browsable at `/four?report_id=…`. The daily-brief **cron** stays retired — the update is on-demand only. See `docs/daily-intelligence.md`. Never put the allowlist or customer PII in this public repo.
- **Audience:** seed / Series A founders with a product. **Not** pre-idea founders or enterprises with their own market-intel teams.
- **Contact:** `info@growthkitai.com` (referenced from every page).
- **Hiring:** two open Intern roles (Growth → "Head of Growth" track, Marketing → "CMO" track); applications to the contact email, subject `Internship — GrowthKit AI`.

## People

- **Avi Aggarwal** — Co-Founder. The user (me, Claude, is talking to Avi). Personal LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/
- **Company LinkedIn:** https://www.linkedin.com/company/growth-kit-ai/

## Stack

**Plain static site + serverless functions.** No build step, no framework. **One npm dependency** (`stripe`, in `package.json` — added 2026-07-18 for billing; `node_modules` gitignored, Vercel installs on deploy). Per-page CSS is inlined in each page's `<head>`; shared files are `theme.css` + `theme.js` (theme system), `advisor.css` + `advisor.js` (the GrowthKit Live tool — now **behind login on `/four`**; see `docs/advisor.md`), and `auth.css` + `auth.js` + `auth-config.js` (the `/login` `/signup` `/reset` `/four` pages, Supabase Auth via CDN, Google + GitHub — see `docs/auth.md`). **`auth.css` owns the `/four` page chrome including the workspace app shell** (everything under `body.is-workspace`), and `product.js` owns its state — `advisor.css`/`advisor.js` own only the engine and the rendered report. **The tool is gated: `/advisor` is retired (→ `/four`), every top bar has a "Log in" link.** GSAP/ScrollTrigger/Lenis load on `index.html` only (jsDelivr), as does `threads.js` (zero-dep vanilla-WebGL dark-hero effect — see `docs/design-system.md`). Fonts: Instrument Serif / Inter / JetBrains Mono (Google Fonts). Hosted on Vercel; **pushing to `main` auto-deploys to growthkitai.com**.

**The exceptions to "static" — the `api/` serverless functions:** `api/advise.js` powers **GrowthKit Live** (the gated tool on `/four`) through a ten-call, dependency-aware report pipeline. Research, quantified opportunity, and funding use live web search; the internal research pack stays server-only. Ten independently persisted stages have 52-second deadlines and section-only retries. The three expansion calls add TAM/SAM/SOM + segments/trend/indexed demand, GTM + timing, and funding + a direct snapshot of every configured connection; they apply to newly generated reports only. Billing functions power paid Pro; `api/advise.js` + `api/account.js` enforce **2 full reports per rolling 7 days** on any company and keep a browsable report history, while `api/daily-briefs.js` + `lib/daily.js` cut the **one-a-day short update** on demand (one Sonnet call, never charged to a beta grant; the old cron stays retired); integration APIs provide encrypted read-only Stripe Connect, GA4, and LinkedIn connections. Server secrets live only in the Vercel dashboard and product APIs fail closed when required auth/storage settings are absent. Full detail: `docs/advisor.md`, `docs/billing.md`, `docs/daily-intelligence.md`, and `docs/integrations.md`.

## The docs set — where everything lives

This file holds the **rules**. The deep reference material lives in five topic files under `docs/`. **Before working in an area, open its file. After working in an area, update its file.**

| File | Single home for |
|---|---|
| [`docs/pages.md`](docs/pages.md) | Every page: what it is, sections, schema, dark-mode state, footers/topbar nav grids, image/OG assets |
| [`docs/design-system.md`](docs/design-system.md) | Color tokens, fonts, copy voice, the neon-console dark-mode architecture (keyframes, patterns, hard rules), theme mechanics |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Hosting/accounts, analytics events, `vercel.json` (clean URLs, cache, security headers), SEO plumbing, the consistency checker + CI, workflow, new-page checklist |
| [`docs/forms-and-data.md`](docs/forms-and-data.md) | Waitlist + onboarding pipelines, both Apps Scripts, `SCRIPT_URL` rules, Sheets as system of record, anti-spam |
| [`docs/deliverable-pipeline.md`](docs/deliverable-pipeline.md) | Phase 4 product code: generator, template, `clients/`, `d/`, token URLs, the repo-is-public security model |
| [`docs/advisor.md`](docs/advisor.md) | The live product: the gated tool on `/four`, ten-call report pipeline, live-evidence stages, connected-metric snapshot, Claude schemas, persistence/retry behavior, `ANTHROPIC_API_KEY`, rate limiting, cost |
| [`docs/auth.md`](docs/auth.md) | User auth: the `/login` `/signup` `/reset` `/four` pages, Supabase setup (incl. Google OAuth), `auth-config.js`, the shared `auth.css`/`auth.js` |
| [`docs/billing.md`](docs/billing.md) | Stripe subscriptions: `api/checkout.js` `api/portal.js` `api/stripe-webhook.js`, the `subscriptions` table, the beta/Pro access gate, `billing.js`, env vars + Stripe dashboard setup |
| [`docs/beta.md`](docs/beta.md) | Beta access: the `beta_applications` table, applying, Avi's approval console (`/admin.html`), the 7-day/7-report grant, `GK_ADMIN_USER_IDS` |
| [`docs/daily-intelligence.md`](docs/daily-intelligence.md) | The two-loop product model: full reports (2 per rolling 7 days), the one-a-day daily update, the `/four` workspace shell and its panes, report history, beta report counter, retired cron |
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

- **Claude Code: auto-commit, one commit per finished file** (see the COMMIT AFTER EVERY SINGLE FILE mandate at the top). As soon as you're done writing in a file, `git add <that file>` and commit it — message can be anything, don't overthink it — and don't batch files or wait for the end of the task. Do not push automatically (Avi may want to bundle commits) unless he explicitly asks. If a commit fails, surface the reason and stop. If the tree contains changes you didn't make, commit **only your own files by explicit path** — never `git add -A` over a parallel session's work.
- **Claude Cowork: prompt the user to commit.** Cowork doesn't run git; after any meaningful change, remind Avi to commit (or to switch to Code to commit) before changing tools.
- **One agent session at a time.** Parallel sessions in this one working tree have repeatedly swept each other's half-finished work into commits and collided mid-edit. Serialize; commit between sessions.

**Tool strengths — redirect when the other tool fits better** (don't refuse; do what you can, then suggest the better tool with one specific reason):

- **Cowork:** open-ended planning/brainstorming, web research, copywriting and tone work, generating non-code deliverables (images, PDFs, decks), connector tasks (Gmail, Calendar, Notion…), visual review of the deployed site via Claude in Chrome, scheduled recurring tasks, rich plugins (marketing, SEO, design, canvas-design…).
- **Claude Code:** actual HTML/CSS/JS edits (especially multi-file chrome changes), git operations, `vercel dev`, shell debugging, fast file-level iteration — anything where the diff matters more than the conversation.

Example redirect phrasing: *"I can do this here, but Claude Code will be faster for a multi-file footer edit — want me to draft the change and you run it there?"*
