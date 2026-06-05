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
- `privacy.html` — UK/EEA-aware policy. **GrowthKit AI is the data controller.** Numbered sections (Who we are, What this policy covers, Information collected, Use, Legal basis (UK/EEA), Sharing, Cookies & analytics, International transfers, Retention, Security, Rights, Children, Third-party links, Disclaimers, Liability, Indemnification, Changes, Governing law, Contact).
- `terms.html` — numbered sections covering the agreement, definitions, eligibility, waitlist/pilots/beta, acceptable use, accounts, IP, fees, third parties, confidentiality, liability, termination, governing law.
- `404.html` — minimalist error page, `noindex, follow`. Links back to home + waitlist.
- `logo.html` — **internal** logo design reference page (five logo variants explored). Not linked from public nav. Not in sitemap.
- `theme.css`, `theme.js` — shared theme system.
- `vercel.json` — clean-URL rewrites + redirects + cache headers + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html`.
- `waitlist-apps-script.gs` — the Google Apps Script deployed as a Web App. Setup instructions are in the file header.
- Logo assets: `logo-lockup-cream.png`, `logo-lockup-dark.png`, `logo-mark-{64,128,256,512,1024}.png`, `logo-mark-cream-512.png`, `logo-mark-dark-512.png`, `logo.png`.
- **`.env.local`** (currently holds `VERCEL_OIDC_TOKEN`) and **`.vercel/`** are gitignored — don't commit either.

## Waitlist plumbing

- `waitlist.html` POSTs FormData (`name`, `email`, `updates`) to a Google Apps Script Web App via the `SCRIPT_URL` constant in the page's inline `<script>`. The current deployed URL is already set in the file.
- The Apps Script (`waitlist-apps-script.gs`) appends rows to **a Google Sheet that Avi owns personally** (under his Google account — *not* a service account, not a shared workspace). The script's `doPost` appends `[Timestamp, Name, Email, Wants updates]` and writes the header row on first signup. `doGet` returns the live signup count as JSON.
- **All waitlist data lives in that Google Sheet — it is the system of record.** No copy is stored on Vercel, in git, or anywhere else.
- **Failure modes to know:** (a) if `SCRIPT_URL` is empty the page shows "Form is not configured yet"; (b) **re-deploying as "New deployment" in Apps Script issues a new URL and breaks the page** until `SCRIPT_URL` is updated — always use "Manage deployments → pencil → New version" instead.

## Conventions

- **Each HTML page is self-contained.** Per-page CSS is inlined; only `theme.css` is shared. Don't extract CSS into shared files without a real reason — the inline pattern is deliberate (no bundler, fastest first paint).
- **Dark mode.** Driven by `data-theme="dark"` on `<html>`, persisted in `localStorage` under key `gk-theme`. Every `<head>` starts with a pre-paint inline script that sets the attribute before first paint to avoid a flash. Don't remove it. Dark-mode `body` background uses radial-gradient glows with `!important` because per-page inline `body { background: var(--bg); }` would otherwise win.
- **Clean URLs.** `vercel.json` rewrites `/privacy` → `/privacy.html` etc. and 301-redirects the `.html` form to the clean form. **When you add a new page, update both `vercel.json` (rewrites + redirects) and `sitemap.xml`.** The cleanURL list currently is: `/privacy /waitlist /contact /careers /methodology /terms`.
- **Topbar morphs into a floating pill on scroll** (`theme.css` handles the transition; pages add the `.scrolled` class via their own inline script when `window.scrollY > 24`).
- **Copy voice.** Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings for emphasis (this is *the* signature pattern — e.g. "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form"). Avoid corporate-speak. "A founder, not a form, will reply" recurs.
- **Color tokens** (light defaults — dark overrides in `theme.css`):
  - `--bg: #FAF8F4` cream · `--bg-2: #F2EFE8`
  - `--ink: #14130F` · `--ink-2: #2A2823` · `--muted: #6B6760`
  - `--accent: #1F4732` deep forest · `--accent-soft: #2E6249` · `--accent-pale: #B7E4CC` (used in dark mode closing CTA)
  - `--line: #E2DDD3` · `--line-2: #D4CEC1`
  - `--maxw: 1180px`
- **SEO.** Every public page has canonical, OpenGraph, Twitter card, JSON-LD structured data, and is listed in `sitemap.xml`. `index.html` includes Organization + WebSite + WebPage + FAQPage schema. Match the existing pattern when adding pages.
- **Footer.** Three-column (Product / Company / Legal). **Known placeholders:** the `Manifesto`, `Security`, and `Status` links all point to `#` — these pages don't exist yet. If creating them, also add to sitemap, vercel.json, and update all footers (they're duplicated across every page).
- **Reduced motion.** All animations have `@media (prefers-reduced-motion: reduce)` fallbacks.

## Workflow

- Edits are made directly to HTML files. No lint, no tests.
- Local preview: open the file in a browser, or `vercel dev` from the project root if you need to test clean-URL rewrites.
- `git push` to `main` → Vercel auto-deploys to growthkitai.com.
- Don't commit `.env.local`, `.vercel/`, or anything containing credentials.
- Footer/topbar/`<head>` blocks are **duplicated across every page** (no templating). When changing nav links, footer columns, the topbar morph behavior, or the pre-paint theme script, update **all** HTML files, not just one.

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
