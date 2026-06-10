# GrowthKit AI

Marketing site for **GrowthKit AI** — a market-intelligence engine for founders. The product is software + operator review that produces four deliverables for seed → Series A teams: a **market map**, a **competitor teardown**, a **gap analysis**, and a **90-day plan** (~14 plays). Refreshed monthly. UK-based, serving GB / US / worldwide.

Tagline: *"Markets, dissected — not guessed."*  
Brand positioning: *consulting-grade work at SaaS prices.*

## Company facts

- **Founded:** 2026, London · Remote.
- **Status:** v0.4 (private beta).
- **Pricing:** free pilot tier for limited access; standard plans start at **$25/month** (full plan, refreshed monthly). 1-to-1 work with market-intel partners is direct-contact only.
- **Audience:** seed / Series A founders with a product. **Not** for pre-idea founders or large enterprises with their own market-intel teams.
- **Contact email:** `info@growthkitai.com` (referenced from every page).
- **Hiring (careers page):** two open Intern roles (Growth → "Head of Growth" track, Marketing → "CMO" track). Internship inquiries go to `info@growthkitai.com` with subject `Internship — GrowthKit AI`.

## People

- **Avi Aggarwal** — Co-Founder. The user (me, Claude, is talking to Avi). Personal LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/
- **Company LinkedIn:** https://www.linkedin.com/company/growth-kit-ai/

## Hosting & accounts

- **Production domain:** **growthkitai.com** (canonical in every page).
- **Hosting:** Vercel. Project `growthkit-ai` (id `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz`). Pushing to `main` on GitHub auto-deploys.
- **GitHub repo:** https://github.com/growthkitsai-coder/GrowthKit-AI
- **GitHub account:** `growthkitsai-coder` — https://github.com/growthkitsai-coder. *(Password is NOT stored here — CLAUDE.md is committed to git. Ask Avi for credentials when needed; never write them to tracked files. A Personal Access Token is the right pattern.)*
- **Analytics:** Vercel Web Analytics is injected on every page via `/_vercel/insights/script.js`.
- **Search Console:** Google verification via both meta tag (`google-site-verification` in `index.html`) and the file `googlea9dc9b0133a60f51.html`.

## Stack

- **Plain static site.** No build step, no framework, no package.json. Edit HTML directly and push.
- Per-page CSS is inlined in a single `<style>` block in `<head>`. The **only** shared CSS file is `theme.css` (dark-mode tokens + topbar pill morph + a few cross-page overrides). The **only** shared JS file is `theme.js` (theme toggle).
- External libs (loaded only by `index.html`): GSAP 3.13, ScrollTrigger, Lenis (smooth scroll) — all from jsDelivr.
- Fonts: Instrument Serif (display/headings, with frequent `<em>` italics for emphasis), Inter (body), JetBrains Mono (eyebrows, small caps labels). Loaded from Google Fonts.

## File layout

Everything lives at the repo root — no `src/`, no `public/`.

- `index.html` (~2400 lines) — landing page: hero with "Specimen №01" plate, pinned editorial problem morph, engine schematic, three-step process, FAQ, closing CTA, footer.
- `waitlist.html` — single-card signup form (Name, Work email, "wants updates" checkbox), morphs into a "You're on the list" success state.
- `methodology.html` — long-form pitch page. Sections: Hero → Mission → Marquee → 4 Pillars → 3 Steps → "Opinions we hold strongly" (5 tenets) → Final CTA.
- `careers.html` — Why-this-why-now → 4 perks → 2 role cards (Growth / Marketing Intern) → 3 application channels (email, company LinkedIn, Avi's LinkedIn).
- `contact.html` — short page with two channel cards (email + LinkedIn).
- `manifesto.html` — founding-document page ("The market is knowable"): preamble with drop cap → 7 numbered articles (5 Believe / 2 Reject, expanded from methodology's tenets) → "Specimen №00" signature plate → CTA.
- `security.html` — honest security-posture page ("Security by subtraction"): 4 posture cards → architecture section with a terminal readout of the real `vercel.json` response headers → full data inventory → responsible-disclosure steps (email, 2-business-day ack, credit-no-bounty) → "What we don't claim" honesty block (explicitly NOT SOC 2 / ISO 27001 — don't add badge claims).
- `status.html` — live status page. Checks run **client-side in the visitor's browser**: pings a CDN asset (`/logo-mark-64.png?ping=…`) and the waitlist Apps Script `doGet` endpoint, measures latency, renders operational/degraded chips + a master banner. The engine row is a static "private beta" chip (no public endpoint). Incident log is an honest empty state. **This page contains a second copy of `SCRIPT_URL`** (see Waitlist plumbing).
- `privacy.html` — UK/EEA-aware policy. **GrowthKit AI is the data controller.** Numbered sections (Who we are, What this policy covers, Information collected, Use, Legal basis (UK/EEA), Sharing, Cookies & analytics, International transfers, Retention, Security, Rights, Children, Third-party links, Disclaimers, Liability, Indemnification, Changes, Governing law, Contact).
- `terms.html` — numbered sections covering the agreement, definitions, eligibility, waitlist/pilots/beta, acceptable use, accounts, IP, fees, third parties, confidentiality, liability, termination, governing law.
- `404.html` — minimalist error page, `noindex, follow`. Links back to home + waitlist.
- `logo.html` — **internal** logo design reference page (five logo variants explored). Not linked from public nav. Not in sitemap.
- `theme.css`, `theme.js` — shared theme system.
- `vercel.json` — clean-URL rewrites + redirects + cache headers + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html`.
- `waitlist-apps-script.gs` — the Google Apps Script deployed as a Web App. Setup instructions are in the file header.
- `scripts/check-site.mjs` — zero-dependency Node consistency checker (see Guard rails). The only script in the repo.
- `.github/workflows/site-checks.yml` — GitHub Action: runs the checker + a lychee external-link check on every push/PR, weekly cron, and manual dispatch.
- Logo assets: `logo-lockup-cream.png`, `logo-lockup-dark.png`, `logo-mark-{64,128,256,512,1024}.png`, `logo-mark-cream-512.png`, `logo-mark-dark-512.png`, `logo.png`.
- **`.env.local`** (currently holds `VERCEL_OIDC_TOKEN`) and **`.vercel/`** are gitignored — don't commit either.

## Waitlist plumbing

- `waitlist.html` POSTs FormData (`name`, `email`, `updates`) to a Google Apps Script Web App via the `SCRIPT_URL` constant in the page's inline `<script>`. The current deployed URL is already set in the file.
- The Apps Script (`waitlist-apps-script.gs`) appends rows to **a Google Sheet that Avi owns personally** (under his Google account — *not* a service account, not a shared workspace). The script's `doPost` appends `[Timestamp, Name, Email, Wants updates]` and writes the header row on first signup. `doGet` returns the live signup count as JSON.
- **All waitlist data lives in that Google Sheet — it is the system of record.** No copy is stored on Vercel, in git, or anywhere else.
- **Failure modes to know:** (a) if `SCRIPT_URL` is empty the page shows "Form is not configured yet"; (b) **re-deploying as "New deployment" in Apps Script issues a new URL and breaks the page** until `SCRIPT_URL` is updated — always use "Manage deployments → pencil → New version" instead.
- **`SCRIPT_URL` now lives in TWO files:** `waitlist.html` (POST, form submit) and `status.html` (GET, live health check). If the deployment URL ever changes, update both.

## Conventions

- **Each HTML page is self-contained.** Per-page CSS is inlined; only `theme.css` is shared. Don't extract CSS into shared files without a real reason — the inline pattern is deliberate (no bundler, fastest first paint).
- **Dark mode.** Driven by `data-theme="dark"` on `<html>`, persisted in `localStorage` under key `gk-theme`. Every `<head>` starts with a pre-paint inline script that sets the attribute before first paint to avoid a flash. Don't remove it. Dark-mode `body` background uses radial-gradient glows with `!important` because per-page inline `body { background: var(--bg); }` would otherwise win.
- **Clean URLs.** `vercel.json` rewrites `/privacy` → `/privacy.html` etc. and 301-redirects the `.html` form to the clean form. **When you add a new page, update both `vercel.json` (rewrites + redirects) and `sitemap.xml`.** The cleanURL list currently is: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status`.
- **Topbar morphs into a floating pill on scroll** (`theme.css` handles the transition; pages add the `.scrolled` class via their own inline script when `window.scrollY > 24`).
- **Topbar nav (standardized 2026-06-10).** Every subpage uses Product (`/#engine`) / How it works (`/#process`) / Methodology (`/methodology`) / Contact (`/contact`). `index.html` uses its own anchors (Product / How it works / FAQ). Don't reintroduce the old "Customers → /#proof" link — that anchor doesn't exist.
- **Copy voice.** Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings for emphasis (this is *the* signature pattern — e.g. "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form"). Avoid corporate-speak. "A founder, not a form, will reply" recurs.
- **Color tokens** (light defaults — dark overrides in `theme.css`):
  - `--bg: #FAF8F4` cream · `--bg-2: #F2EFE8`
  - `--ink: #14130F` · `--ink-2: #2A2823` · `--muted: #6B6760`
  - `--accent: #1F4732` deep forest · `--accent-soft: #2E6249` · `--accent-pale: #B7E4CC` (used in dark mode closing CTA)
  - `--line: #E2DDD3` · `--line-2: #D4CEC1`
  - `--maxw: 1180px`
- **SEO.** Every public page has canonical, OpenGraph, Twitter card, JSON-LD structured data, and is listed in `sitemap.xml`. `index.html` includes Organization + WebSite + WebPage + FAQPage schema. Match the existing pattern when adding pages. (Enforced by `scripts/check-site.mjs` — `methodology.html` was missing all OG/Twitter/JSON-LD until 2026-06-10.)
- **Footer.** Three-column (Product / Company / Legal). As of 2026-06-10 there are **no placeholder links left**: Company = Manifesto / Methodology / Careers / Contact, Legal = Privacy / Terms / Security / Status, all pointing at real pages. Footers are still duplicated across every page — keep them in sync.
- **Dark mode "neon console" treatment (new pages only).** `manifesto.html`, `security.html`, and `status.html` carry an extra dark-mode layer in their inline CSS: electric spring-green neon (`--neon: #3EF59F`, `--neon-2: #8FFFC9`) with deep-forest panels (`--deep-1: #06140D`, `--deep-2: #0A1F15`, `--deep-3: #143524`), a fixed faint grid floor (`.dk-grid`) and a scanline sweep (`.dk-scan`). These decorative layers are `display:none` in light mode and only activate under `[data-theme="dark"]` — light mode on every page stays classic cream + forest. The older pages still use the softer mint (`--accent-pale`) dark treatment from `theme.css`. If extending the neon look to other pages, copy the pattern from one of these three.
- **Reduced motion.** All animations have `@media (prefers-reduced-motion: reduce)` fallbacks.

## Guard rails (consistency checker + CI)

Because every page duplicates its head/topbar/footer by hand, cross-page consistency drifts silently. Two automated checks guard against that:

- **`scripts/check-site.mjs`** — plain Node (≥18), zero dependencies. Run it locally with `node scripts/check-site.mjs` **after any change to HTML files, `sitemap.xml`, or `vercel.json`, before committing.** It fails if: a placeholder `href="#"` / `href="/#"` appears on a public page; `sitemap.xml` and `vercel.json` rewrites/redirects fall out of parity (or a listed page file is missing); a public page lacks canonical (with the correct URL), `og:title/description/url/image`, `twitter:card`, or JSON-LD; footers diverge across pages (link grid compared with `#x` ↔ `/#x` normalized); `logo.html` leaks into the sitemap or any public link; an internal href/src points at a non-existent file, clean URL, or `id` anchor; or `SCRIPT_URL` is empty/mismatched between `waitlist.html` and `status.html`. The page lists at the top of the script (`INTERNAL_PAGES`, `NO_FOOTER`, `NO_SITEMAP`) must be kept current when pages are added.
- **`.github/workflows/site-checks.yml`** — runs the checker on every push/PR, plus a **lychee** job that checks external URLs only (jsDelivr pins, Google Fonts, LinkedIn, Apps Script). It accepts `999` (LinkedIn bot-block) and `429`, excludes `growthkitai.com` self-references (a new page's canonical would 404 until the same push finishes deploying) and the `fonts.gstatic.com` preconnect root. A weekly Monday cron catches external links that die between pushes.
- **CI does not gate deploys** — Vercel deploys on push regardless. A red ✗ means the live site shipped with a problem: fix it and push again.

## Workflow

- Edits are made directly to HTML files. No lint, no tests — but **run `node scripts/check-site.mjs` before committing** any HTML/sitemap/vercel.json change (see Guard rails).
- Local preview: open the file in a browser, or `vercel dev` from the project root if you need to test clean-URL rewrites.
- `git push` to `main` → Vercel auto-deploys to growthkitai.com.
- Don't commit `.env.local`, `.vercel/`, or anything containing credentials.
- Footer/topbar/`<head>` blocks are **duplicated across every page** (no templating). When changing nav links, footer columns, the topbar morph behavior, or the pre-paint theme script, update **all** HTML files, not just one.

## Documentation upkeep (always, after every change)

This repo carries three Markdown context files. **Whenever anything durable changes — a page added/removed, a convention adopted, infrastructure or plumbing touched, a decision made — update all of the .md files that cover it, in the same session as the change, before committing.** Stale docs are how the two-tool setup (Cowork + Code) breaks. What belongs where:

- **`CLAUDE.md`** (this file) — the rulebook Claude reads. Company facts, hosting/accounts, stack, file layout, conventions, workflow, guard rails, tool-collaboration rules. Update when any of those change. Keep it prescriptive and current — no history here.
- **`AGENTS.md`** — deliberately just a pointer for non-Claude agents (Codex etc.): "read CLAUDE.md + memory.md, run the checker before pushing." **Do not duplicate content into it** — it drifted once and was cut down on purpose. Only touch it if the pointer itself goes stale (e.g. a file it names moves).
- **`memory.md`** — the shared notebook for durable knowledge: detailed page descriptions, design-system notes, sharp edges/gotchas, open items, and a dated **change log** (append an entry for every meaningful session). Update it whenever something non-obvious is learned or shipped.

When adding a new public page, the full checklist is: the page itself → `vercel.json` (rewrites + redirects) → `sitemap.xml` → footers/nav on every page → `scripts/check-site.mjs` page lists if it's an exception → run the checker → update CLAUDE.md, AGENTS.md, and memory.md.

## Working with Cowork and Claude Code

Avi runs both Claude Cowork (desktop app) and Claude Code (CLI inside VS Code) against this repo. Both tools read this file and `memory.md` from the repo root, so they share context. Two rules keep them from stepping on each other:

**Commit policy.** Whenever either tool changes a file, commit before the user switches to the other tool — otherwise the second tool may overwrite uncommitted work.

- **Claude Code: auto-commit any change.** After any successful edit, run `git add -A && git commit -m "<concise message describing the change>"`. Do not push automatically (Avi may want to bundle commits) unless he explicitly asks. If a commit fails (pre-commit hook, nothing to commit, etc.), surface the reason and stop.
- **Claude Cowork: prompt the user to commit.** Cowork does not run git on its own; after any meaningful file change, remind Avi to commit (or to switch to Claude Code to run the commit) before he moves to the other tool.
- Never commit `.env.local`, `.vercel/`, secrets, or anything from the auto-memory directory.

**Tool strengths — and when to redirect.** Each tool should recognize when a task fits the *other* tool better and tell Avi so. Don't refuse the task — do what you can, then suggest the better tool with one specific reason.

- **Claude Cowork is better for:** open-ended planning and brainstorming, market/competitor research with web browsing, copywriting and tone work, generating non-code deliverables (images, PDFs, decks, brand assets), connector-driven tasks (Gmail, Calendar, Notion, HubSpot, etc.), visual review of the deployed site via Claude in Chrome, scheduled recurring tasks, and any work that benefits from rich plugins (marketing, SEO, design, brand-guidelines, canvas-design, theme-factory).
- **Claude Code is better for:** actual HTML/CSS/JS edits — especially multi-file changes like footer/nav updates that span every page, git operations (branches, commits, rebases, diffs, pushes), running `vercel dev` locally, debugging via shell, fast file-level iteration inside VS Code, and anything where the diff matters more than the conversation.

**Redirection rule.** If Avi asks Cowork to do a multi-file refactor, a long debugging session, or anything that mostly produces a diff, point him to Claude Code. If Avi asks Claude Code to write fresh marketing copy, generate brand assets, or research competitors on the web, point him to Cowork. The phrasing should be brief, e.g. *"I can do this here, but Claude Code will be faster for a multi-file footer edit — want me to draft the change and you run it there?"*
