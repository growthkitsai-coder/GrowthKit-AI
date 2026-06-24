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
- **Pricing (updated 2026-06-10):** free Pilot tier (invite-only, from the waitlist); **Basic $30/month** (full deliverable set, refreshed monthly); **Premium Agentic $200/month** (Basic + continuous agentic monitoring, mid-cycle alerts, plan re-cuts, operator review on every refresh). 1-to-1 partner work is direct-contact only. **`pricing.html` is the public source of truth** (Product+Offer JSON-LD in its head); the index FAQ repeats the numbers and links to `/pricing` — keep all three in sync when prices change.
- **Audience:** seed / Series A founders with a product. **Not** pre-idea founders or enterprises with their own market-intel teams.
- **Contact:** `info@growthkitai.com` (referenced from every page).
- **Hiring:** two open Intern roles (Growth → "Head of Growth" track, Marketing → "CMO" track); applications to the contact email, subject `Internship — GrowthKit AI`.

## People

- **Avi Aggarwal** — Co-Founder. The user (me, Claude, is talking to Avi). Personal LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/
- **Company LinkedIn:** https://www.linkedin.com/company/growth-kit-ai/

## Stack

**Plain static site + one serverless function.** No build step, no framework, no package.json. Per-page CSS is inlined in each page's `<head>`; the only shared files are `theme.css` (theme system) and `theme.js` (toggle). GSAP/ScrollTrigger/Lenis load on `index.html` only (jsDelivr). Fonts: Instrument Serif / Inter / JetBrains Mono (Google Fonts). Hosted on Vercel; **pushing to `main` auto-deploys to growthkitai.com**.

**The one exception to "static":** `api/advise.js` — a Vercel serverless function powering the Growth Advisor (`/advisor`), the live Claude-powered product. It's the repo's only server code and only API secret (`ANTHROPIC_API_KEY`, a Vercel env var — **never in git; the repo is public**). Still zero npm deps, no build step. Full detail: `docs/advisor.md`. **Set the env var in the Vercel dashboard or the Advisor returns "not configured".**

## The docs set — where everything lives

This file holds the **rules**. The deep reference material lives in five topic files under `docs/`. **Before working in an area, open its file. After working in an area, update its file.**

| File | Single home for |
|---|---|
| [`docs/pages.md`](docs/pages.md) | Every page: what it is, sections, schema, dark-mode state, footers/topbar nav grids, image/OG assets |
| [`docs/design-system.md`](docs/design-system.md) | Color tokens, fonts, copy voice, the neon-console dark-mode architecture (keyframes, patterns, hard rules), theme mechanics |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Hosting/accounts, analytics events, `vercel.json` (clean URLs, cache, security headers), SEO plumbing, the consistency checker + CI, workflow, new-page checklist |
| [`docs/forms-and-data.md`](docs/forms-and-data.md) | Waitlist + onboarding pipelines, both Apps Scripts, `SCRIPT_URL` rules, Sheets as system of record, anti-spam |
| [`docs/deliverable-pipeline.md`](docs/deliverable-pipeline.md) | Phase 4 product code: generator, template, `clients/`, `d/`, token URLs, the repo-is-public security model |
| [`docs/advisor.md`](docs/advisor.md) | The live product: the `/advisor` page + `api/advise.js` serverless function, Claude model/prompt, `ANTHROPIC_API_KEY` setup, streaming, rate limiting, cost |

`memory.md` holds the **dated change log** (append after every task), sharp edges/gotchas, and open action items. `AGENTS.md` is a pointer for non-Claude agents.

## Conventions (the rules — details in the docs set)

- **Each HTML page is self-contained.** Don't extract inline CSS into shared files without a real reason — the pattern is deliberate (no bundler, fastest first paint).
- **Light mode is untouchable site DNA** (cream + forest). **Dark mode is the "neon console"** — a deliberately different aesthetic. All dark work goes under `:root[data-theme="dark"]`; every animation gets a reduced-motion fallback; shared neon layer lives in `theme.css`. Full architecture + pattern vocabulary: `docs/design-system.md`.
- **Clean URLs:** every public page needs a `vercel.json` rewrite + redirect AND a sitemap entry. Follow the new-page checklist in `docs/infrastructure.md`.
- **Copy voice:** confident, operator-grade, no fluff; em-dashes for asides; italic `<em>` inside headings is *the* signature pattern ("Markets, <em>dissected</em>"). "A founder, not a form, will reply" recurs.
- **SEO:** every public page has canonical, OG (+ `og-card.png`), Twitter card, JSON-LD, sitemap entry — the checker enforces it.
- **Chrome is duplicated, not templated:** topbar/footer/`<head>` blocks repeat on every page. Chrome changes mean editing ALL pages; the checker enforces identical footer grids. Canonical grids: `docs/pages.md`.
- **Run `node scripts/check-site.mjs` before committing** any change to HTML / `sitemap.xml` / `vercel.json`. CI re-runs it plus an external-link check on every push, but **CI does not gate deploys** — red ✗ means the live site shipped broken. Details: `docs/infrastructure.md`.
- **Never commit secrets:** `.env*`, `.vercel/`, credentials, the `ANTHROPIC_API_KEY` (it lives only as a Vercel env var), client data (`clients/*`, `d/*` are gitignored except demos). Every .md file here is committed to a public repo — treat them as public.

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
