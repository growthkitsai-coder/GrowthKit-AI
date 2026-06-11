# GrowthKit AI

Marketing site for **GrowthKit AI** — a market-intelligence engine for founders. The product is software + operator review that produces four deliverables for seed → Series A teams: a **market map**, a **competitor teardown**, a **gap analysis**, and a **90-day plan** (~14 plays). Refreshed monthly. UK-based, serving GB / US / worldwide.

Tagline: *"Markets, dissected — not guessed."*  
Brand positioning: *consulting-grade work at SaaS prices.*

## Company facts

- **Founded:** 2026, London · Remote.
- **Status:** v0.4 (private beta).
- **Pricing (updated 2026-06-10):** free pilot tier for limited access (invite-only, from the waitlist); **Basic $30/month** (market map, teardown, gap analysis, 90-day plan — refreshed monthly); **Premium Agentic $200/month** (everything in Basic + continuous agentic monitoring, mid-cycle alerts, plan re-cuts, operator review on every refresh). 1-to-1 work with market-intel partners is direct-contact only. **`pricing.html` is the public source of truth** (with Product+Offer JSON-LD); the index FAQ repeats the numbers and links to `/pricing` — keep the two in sync when prices change.
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
- **Analytics:** Vercel Web Analytics is injected on every page via `/_vercel/insights/script.js`, preceded by a `window.va` queue shim + a click listener that emits **custom events**: `cta_click` (clicks on `/waitlist` links and `.nav-cta`/`.btn-primary`, with page + section + href), `waitlist_signup` / `waitlist_error` (waitlist.html form), `status_check_failed` (status.html health checks). Vercel only records custom events on **Pro/Enterprise** — on Hobby they are silently ignored (pageviews still work), so don't conclude the wiring is broken if no events show up.
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
- `careers.html` — Why-this-why-now → 4 perks → 2 role cards (Growth / Marketing Intern) → 3 application channels (email, company LinkedIn, Avi's LinkedIn). Head carries **JobPosting JSON-LD** for both roles (remote, GB/US, `validThrough` 2026-12-31 — bump it or remove the postings when the roles close, or Google flags them stale).
- `contact.html` — short page with two channel cards (email + LinkedIn).
- `manifesto.html` — founding-document page ("The market is knowable"): preamble with drop cap → 7 numbered articles (5 Believe / 2 Reject, expanded from methodology's tenets) → "Specimen №00" signature plate → CTA.
- `security.html` — honest security-posture page ("Security by subtraction"): 4 posture cards → architecture section with a terminal readout of the real `vercel.json` response headers → full data inventory → responsible-disclosure steps (email, 2-business-day ack, credit-no-bounty) → "What we don't claim" honesty block (explicitly NOT SOC 2 / ISO 27001 — don't add badge claims).
- `status.html` — live status page. Checks run **client-side in the visitor's browser**: pings a CDN asset (`/logo-mark-64.png?ping=…`) and the waitlist Apps Script `doGet` endpoint, measures latency, renders operational/degraded chips + a master banner. The engine row is a static "private beta" chip (no public endpoint). Incident log is an honest empty state. **This page contains a second copy of `SCRIPT_URL`** (see Waitlist plumbing).
- `privacy.html` — UK/EEA-aware policy. **GrowthKit AI is the data controller.** Numbered sections (Who we are, What this policy covers, Information collected, Use, Legal basis (UK/EEA), Sharing, Cookies & analytics, International transfers, Retention, Security, Rights, Children, Third-party links, Disclaimers, Liability, Indemnification, Changes, Governing law, Contact).
- `terms.html` — numbered sections covering the agreement, definitions, eligibility, waitlist/pilots/beta, acceptable use, accounts, IP, fees, third parties, confidentiality, liability, termination, governing law.
- `specimen.html` — **the sample deliverable** ("Specimen №02 — this is the specimen"): a full GrowthKit teardown of **Crewline, a fictional company** in field-service software for independent HVAC contractors. Subject-brief plate (with an honesty note: fictional subject, real method, illustrative numbers) → hand-built SVG market map (11 fictional-composite vendors, gap zone marked) → competitor teardown table (3 of 6 rows visible) → gap analysis (2 of 4 cards visible) → 90-day plan (plays 01–03 visible, 04–14 redacted). Redacted blocks use blurred placeholder content (`filter: blur` + `aria-hidden` + `user-select:none`) under a "join the waitlist" overlay card. All analysis copy is placeholder-grade — refine in Cowork.
- `pricing.html` — three plan cards: Pilot ($0, invite-only from waitlist), Basic ($30/mo, full deliverable set refreshed monthly), Premium Agentic ($200/mo, featured — continuous monitoring, mid-cycle alerts, plan re-cuts). Partner strip (1-to-1 = direct contact), plain-language small print, CTA to /specimen. Head carries **Product + 3 Offer JSON-LD** with `UnitPriceSpecification` — update it when prices change.
- `onboarding.html` — **structured client intake** (Phase 4, Step 2). `noindex`, has a clean URL (`/onboarding`) but is deliberately NOT in the sitemap or any nav/footer — it's sent privately to accepted clients. Form: company, website, contact, work email, stage, market description, known competitors, ICP, notes. POSTs to its own Apps Script (`onboarding-apps-script.gs`) via a `SCRIPT_URL` constant that is **currently empty** — deploy the script and fill it in. Honeypot field is `fax` (NOT `company` — onboarding has a real company field). Emits `onboarding_submitted` / `onboarding_error` analytics events.
- `onboarding-apps-script.gs` — the SECOND Apps Script (own Google Sheet, "GrowthKit Client Briefs"). Same hardening pattern as the waitlist script: validation, `fax` honeypot, 20s min fill time, dedupe by email+company, rate limit (10/10 min), confirmation email. Repo copy is source only — deploy via Apps Script editor.
- `404.html` — minimalist error page, `noindex, follow`. Links back to home + waitlist.
- `logo.html` — **internal** logo design reference page (five logo variants explored). Not linked from public nav. Not in sitemap.
- `theme.css`, `theme.js` — shared theme system.
- `vercel.json` — clean-URL rewrites + redirects + cache headers (**images/fonts: 1 year immutable; css/js: 1 hour + `stale-while-revalidate` 1 day** — `theme.css`/`theme.js` are not fingerprinted, so never restore the old blanket 1-year rule for them) + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html`.
- `waitlist-apps-script.gs` — the Google Apps Script deployed as a Web App. Setup instructions are in the file header. **The repo copy is source, not the deployment** — after editing it, paste the contents into the Apps Script editor (Extensions → Apps Script in the Sheet) and redeploy via "Manage deployments → pencil → New version".
- `scripts/check-site.mjs` — zero-dependency Node consistency checker (see Guard rails).
- `scripts/make-deliverable.mjs` — zero-dependency deliverable generator (see Deliverable pipeline).
- `deliverables/template.html` — the master client-deliverable template (self-contained, light + neon-dark + print stylesheet, `noindex`). Slots marked `<!--GK:F:…-->` / `<!--GK:S:…-->` are filled by the generator — don't hand-edit client copies.
- `clients/` — client data JSONs (the generator's input). **Gitignored except `clients/demo.json`** (fictional "Acme Analytics" demo).
- `d/` — generated deliverables at unguessable token URLs. **Gitignored except `d/demo/`.** Robots-disallowed + `X-Robots-Tag: noindex` via vercel.json; never in the sitemap.
- `.github/workflows/site-checks.yml` — GitHub Action: runs the checker + a lychee external-link check on every push/PR, weekly cron, and manual dispatch.
- Logo assets: `logo-lockup-cream.png`, `logo-lockup-dark.png`, `logo-mark-{64,128,256,512,1024}.png`, `logo-mark-cream-512.png`, `logo-mark-dark-512.png`, `logo.png`. Social card: **`og-card.png`** (1200×630, cream lockup composite) — every page's `og:image`/`twitter:image` points at it, so overwriting that one file restyles link previews site-wide.
- **`.env.local`** (currently holds `VERCEL_OIDC_TOKEN`) and **`.vercel/`** are gitignored — don't commit either.

## Waitlist plumbing

- `waitlist.html` POSTs FormData (`name`, `email`, `updates`) to a Google Apps Script Web App via the `SCRIPT_URL` constant in the page's inline `<script>`. The current deployed URL is already set in the file.
- The Apps Script (`waitlist-apps-script.gs`) appends rows to **a Google Sheet that Avi owns personally** (under his Google account — *not* a service account, not a shared workspace). The script's `doPost` appends `[Timestamp, Name, Email, Wants updates]` and writes the header row on first signup. `doGet` returns the live signup count as JSON.
- **All waitlist data lives in that Google Sheet — it is the system of record.** No copy is stored on Vercel, in git, or anywhere else.
- **Failure modes to know:** (a) if `SCRIPT_URL` is empty the page shows "Form is not configured yet"; (b) **re-deploying as "New deployment" in Apps Script issues a new URL and breaks the page** until `SCRIPT_URL` is updated — always use "Manage deployments → pencil → New version" instead.
- **`SCRIPT_URL` now lives in TWO files:** `waitlist.html` (POST, form submit) and `status.html` (GET, live health check). If the deployment URL ever changes, update both.
- **Hardening (2026-06-10):** `doPost` now validates name/email server-side, silently drops honeypot hits (hidden `company` field) and sub-2.5-second submissions, **dedupes by email** (case-insensitive — re-signup updates the row, consent only ever upgrades No → Yes), applies a soft rate limit (60 accepted signups / 10 min, then a visible "try again in a few minutes" error rather than silent loss), and sends a short **confirmation email** to brand-new signups via MailApp (wrapped so mail failure never blocks the signup; consumer Gmail quota is ~100/day). The form sends two extra fields: `company` (honeypot) and `t` (ms between page load and submit).

## Deliverable pipeline (Phase 4 — first product code)

- **Flow:** client brief arrives via `/onboarding` (own Apps Script + Sheet) → operator builds `clients/<client>.json` → `node scripts/make-deliverable.mjs clients/<client>.json` validates the JSON (all errors at once, dotted paths), HTML-escapes everything, renders the four deliverable sections into `deliverables/template.html`, and writes `d/<token>/<slug>-<period>.html`. The 22-char base58 token is minted once (crypto-random) and written back into the JSON so the client's URL stays stable; a monthly refresh = bump `period`/`periodLabel`/`refreshNumber`/`nextRefresh` and re-run (`--force` to overwrite).
- **The generator owns all row markup** — template slots are empty by design so the two can't drift. The committed demo (`clients/demo.json` → `d/demo/acme-analytics-2026-06.html`) is the living example; regenerate it after any template/generator change.
- **PDF export** = the template's print stylesheet; "Save as PDF" from the browser (or the masthead's print button).
- **⚠ THE REPO IS PUBLIC.** Unguessable URLs protect against URL guessing, not repo browsing — anything committed under `d/` or `clients/` is readable by anyone on GitHub. Both are gitignored except the demo. **Before committing a real client file, make the repo private:** `gh repo edit growthkitsai-coder/GrowthKit-AI --visibility private --accept-visibility-change-consequences` (Vercel keeps deploying fine).
- **Step 3 (client portal in Next.js) is deliberately deferred** to a separate private repo, only when tokenized URLs stop scaling (>10–15 active clients).

## Conventions

- **Each HTML page is self-contained.** Per-page CSS is inlined; only `theme.css` is shared. Don't extract CSS into shared files without a real reason — the inline pattern is deliberate (no bundler, fastest first paint).
- **Dark mode.** Driven by `data-theme="dark"` on `<html>`, persisted in `localStorage` under key `gk-theme`. Every `<head>` starts with a pre-paint inline script that sets the attribute before first paint to avoid a flash. Don't remove it. Dark-mode `body` background uses radial-gradient glows with `!important` because per-page inline `body { background: var(--bg); }` would otherwise win.
- **Clean URLs.** `vercel.json` rewrites `/privacy` → `/privacy.html` etc. and 301-redirects the `.html` form to the clean form. **When you add a new page, update both `vercel.json` (rewrites + redirects) and `sitemap.xml`.** The cleanURL list currently is: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status /specimen /pricing` + `/onboarding` (noindex — has a clean URL but is excluded from the sitemap on purpose; the checker's `NO_SITEMAP` list knows).
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
- **Footer.** Three-column (Product / Company / Legal). As of 2026-06-10: Product = The engine / How it works / **Specimen / Pricing** / FAQ / Join waitlist, Company = Manifesto / Methodology / Careers / Contact, Legal = Privacy / Terms / Security / Status — all real pages, no placeholders. Footers are still duplicated across every page — keep them in sync (the checker enforces identical link grids).
- **Dark mode = "neon console", site-wide (since 2026-06-10).** Dark mode is a deliberately different aesthetic from light mode: electric spring-green neon (`--neon: #3EF59F`, `--neon-2: #8FFFC9`) on deep-forest panels (`--deep-1: #06140D`, `--deep-2: #0A1F15`, `--deep-3: #143524`), glowing em-italics, neon mono labels/LEDs, a fixed faint grid floor (`.dk-grid`) and a scanline sweep (`.dk-scan`). The **shared layer lives in `theme.css`** (tokens, decor layers + keyframes `dkScan`/`dkPulse`/`dkBlink` (blinking terminal cursor — attach to a pseudo-element), em glow, `.eyebrow .num`, buttons, **topbar console chrome** (deep-green glass resting bar + neon-ringed scrolled pill, brand logo ring + blinking wordmark cursor, deep-green/neon nav-CTA — since 2026-06-11), neon page-chrome hovers (nav links + underline, `.nav-back`, footer links, theme toggle — since 2026-06-11), spec-plate, closing CTA, selection/scrollbar/focus); each page adds a page-specific `:root[data-theme="dark"]` block at the end of its inline `<style>` for its own components, plus the two decor divs right after `<body>` and `main, footer { position: relative; z-index: 1; }`. Decor is `display:none` in light mode — **light mode stays classic cream + forest everywhere, untouched.** The old mint (`--accent-pale`) treatment is retired. When adding a page: copy the decor divs + z-index rule, then style dark components with the neon tokens (deep-green gradient panels, neon borders/glows on hover). Dark mode may also carry subtle **"live instrument" motion** — e.g. `index.html`'s hero spec-plate has a CRT scanline sweep + a blinking terminal caret, and the engine schematic nodes breathe their glow once lit. Keep any such motion **dark-only** (`:root[data-theme="dark"]`) and **reduced-motion-guarded**; index's keyframes (`dkScanDown`/`dkCaret`/`dkNodeBreathe`) are page-local — promote them to `theme.css` only if a second page needs them.
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
