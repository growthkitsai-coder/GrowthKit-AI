# GrowthKit AI — Memory

> ## 🚨 NON-NEGOTIABLE — UPDATE THIS FILE AFTER **EVERY** PIECE OF WORK 🚨
>
> **Every agent, every tool (Claude Code, Claude Cowork, Codex, anything else), every task, every time.** The moment ANY work of ANY kind in this folder/codebase is done — before the task is considered finished — you MUST:
>
> 1. **Append a dated entry to the "Change log" at the bottom of this file** outlining exactly what you did.
> 2. **Fix any descriptions above that your work made stale** (page list, infrastructure notes, sharp edges).
> 3. **Update `CLAUDE.md` too** if the work changed any fact, convention, or workflow it records.
>
> **No exceptions. Nothing is "too small to document."** Multiple agents share this repo and these .md files are their only shared memory — undocumented work gets overwritten, repeated, or contradicted. **A task is NOT complete until the .md files describe what was done.**

> ## 🚨 NON-NEGOTIABLE — ASK AVI INPUT QUESTIONS **BEFORE** STARTING ANY TASK 🚨
>
> **Before doing the work, ask Avi as many clarifying input questions as you want/need** so the task comes out to his standard, not your assumption of it. **For any important or large-scale work** (new pages, redesigns, multi-file refactors, infrastructure/plumbing changes): **minimum ~5 meaningful questions, answered BEFORE you start** — meaningful means the answers would genuinely change what you build, not filler to hit the count. Small/mechanical tasks are exempt from the minimum, but still ask about anything genuinely ambiguous. Batch questions up front rather than mid-task.

A persistent knowledge file for Claude (Cowork + Code) to read before starting any task on this project. Complements `CLAUDE.md`. Update this file whenever something durable changes (new pages, new decisions, broken assumptions, vendor changes, new conventions).

Always read `CLAUDE.md` AND this file before doing any work.

---

## TL;DR — what this project is

GrowthKit AI is a marketing site (plain static HTML, no build step) for a market-intelligence product aimed at seed → Series A founders. Four deliverables: market map, competitor teardown, gap analysis, 90-day plan (~14 plays), refreshed monthly. Tagline: *"Markets, dissected — not guessed."* Pricing (2026-06-10): free pilot (invite-only) · Basic $30/month · Premium Agentic $200/month; `/pricing` is the public source of truth, the index FAQ repeats it. UK-based, London, founded 2026. Status: v0.4 private beta. Contact: `info@growthkitai.com`. Hosted on Vercel at `growthkitai.com`. Auto-deploys from `main` on GitHub.

Owner: Avi Aggarwal (Co-Founder). LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/

---

## The whole repo at a glance

Everything lives at the repo root. No `src/`, no `public/`, no framework, no `package.json`, no lint, no tests.

Pages (all public except `logo.html`):

- `index.html` (~2400 lines, ~100KB) — landing page. Hero with "Specimen №01" plate, pinned editorial problem morph, engine schematic, three-step process, FAQ, closing CTA, footer. Loads GSAP 3.13 + ScrollTrigger + Lenis from jsDelivr.
- `waitlist.html` — single-card signup form (Name, Work email, "wants updates" checkbox). POSTs to a Google Apps Script Web App; morphs into "You're on the list" success state. Anti-spam (2026-06-10): hidden `company` honeypot field (`.hp-field`, parked off-screen — not `display:none` on purpose) and a `t` field (ms since page load; server drops < 2.5s). Emits `waitlist_signup` / `waitlist_error` analytics events.
- `methodology.html` — long-form pitch (Hero → Mission → Marquee → 4 Pillars → 3 Steps → 5 tenets → CTA).
- `careers.html` — Why now → 4 perks → 2 Intern role cards (Growth → "Head of Growth" track, Marketing → "CMO" track) → 3 application channels. Second JSON-LD block carries JobPosting schema for both roles (remote, GB/US, `validThrough` 2026-12-31 — keep fresh or remove when roles close).
- `contact.html` — hero with `hero-meta` LED row ("Channels open · London · Remote · Reply — one business day") → two channel cards (email + LinkedIn) with ghost numerals 01/02 → meta strip. Dark mode = full manifesto grade (channel-online LEDs offset so they don't blink in sync, blinking terminal cursor on `.target` lines, neon wireframe ghosts, scan-wash hovers, meta-strip `/` ticks).
- `privacy.html` — UK/EEA-aware policy. GrowthKit AI is the data controller. Dark mode = full manifesto grade via dark-only pseudo-elements (hero document register with pulsing LED + blinking version cursor, neon eyebrow dashes, per-section log-entry scan-wash with negative-margin padding offset, terminal-card TOC with hover-lit index numbers).
- `terms.html` — numbered ToS sections. Dark mode = full manifesto grade (2026-06-11): neon-wireframe `§` ghost behind the hero (dark-only `aria-hidden` span, `display:none` in light), `dkCaret` on the version stamp + TOC label, `dkScanDown` CRT sweep over the terminal-card TOC, scan-wash section hovers.
- `manifesto.html` — founding-document page ("The market is knowable."). Preamble with drop cap → 7 numbered articles (5 Believe / 2 Reject — expanded from methodology's 5 tenets, reworded so the two pages don't read copy-pasted) → "Specimen №00" signature plate with blinking cursor → CTA to waitlist/methodology.
- `security.html` — security-posture page ("Security by subtraction."). 4 posture cards → architecture section with a mono terminal readout of the **actual** response headers from `vercel.json` (keep them in sync if headers change) → itemised data inventory → responsible disclosure (info@growthkitai.com, subject "Security — GrowthKit AI", 2-business-day ack, credit but no paid bounty) → "What we don't claim" block (explicitly NOT SOC 2 / ISO 27001 certified — never add badge claims without Avi's sign-off).
- `status.html` — live status page. **Checks run client-side in the visitor's browser**: (1) website/CDN via cache-busted fetch of `/logo-mark-64.png`, (2) waitlist intake via GET to the Apps Script `doGet` (expects `{ok:true,…}`), both with 9s timeouts and latency readouts; (3) engine row is a static "private beta" chip. Master banner aggregates: all ok → "All systems operational", any failure → amber "Something's not answering" (copy explains it may be the visitor's network). Incident log is an honest empty state ("history begins June 2026"). Has a "run checks again" button.
- `specimen.html` — **the sample deliverable** ("Specimen №02"), added 2026-06-10. A full teardown of **Crewline — a fictional company** (field-service software for independent HVAC contractors): subject-brief plate with an explicit honesty note (fictional subject, real method, illustrative numbers; competitors are invented composites) → hand-built SVG market map (11 vendors, axes = workflow depth × price/seat, dashed gap zone, SVG re-inks via CSS classes in dark mode) → teardown table (3 of 6 rows visible) → gap analysis (2 of 4 cards) → 90-day plan (plays 01–03 visible, 04–14 redacted). Redaction = blurred placeholder content (`filter: blur(7px)` + `aria-hidden` + `user-select:none` + `pointer-events:none`) under an overlay card with waitlist/pricing CTAs. **Analysis copy is placeholder-grade — content refinement is a Cowork job.**
- `pricing.html` — added 2026-06-10. Three plan cards: Pilot $0 (invite-only) / Basic $30/mo / **Premium Agentic $200/mo (featured)** — plus a dashed "1-to-1 partner work, direct contact" strip and plain-language small print (beta, cancel anytime, USD). Head carries **Product JSON-LD with three Offers** (`UnitPriceSpecification`, P1M) — update the schema whenever prices change, not just the visible cards.
- `404.html` — minimalist, `noindex, follow`. Links to home + waitlist. No footer.
- `logo.html` — **internal** logo variant reference page. Not linked from nav. Not in sitemap. Do not link from public pages.

Shared:

- `theme.css` — dark-mode tokens, topbar pill morph, a few cross-page overrides. **The only shared CSS file.** Per-page CSS is inlined in `<head>` `<style>` blocks. Don't extract more CSS into shared files without a real reason.
- `theme.js` — theme toggle wiring. Reads/writes `localStorage` key `gk-theme`. Pre-paint inline script in every `<head>` sets `data-theme` before first paint to avoid FOUC — don't remove it.

Infrastructure:

- `vercel.json` — clean-URL rewrites + 301 redirects + cache headers (images/fonts 1y immutable; **css/js 1h + stale-while-revalidate 1d**, because `theme.css`/`theme.js` aren't fingerprinted — don't restore the old blanket 1y rule) + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Current clean-URL list: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status /specimen /pricing`. Note: `security.html`'s terminal readout quotes these headers verbatim — update it if the headers change.
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html` (Google Search Console verification).
- `waitlist-apps-script.gs` — Apps Script source. Header has setup instructions. **The repo copy is source only** — after editing, paste into the Apps Script editor and redeploy via "Manage deployments → pencil → New version". Hardened 2026-06-10: server-side validation, honeypot + min-time drops (silent `{ok:true}`), email dedupe (consent only upgrades), soft rate limit (60/10 min, visible failure), confirmation email to new signups via MailApp (never blocks the signup).
- `scripts/check-site.mjs` — zero-dependency Node consistency checker; run before every commit that touches HTML / sitemap / vercel.json. Details under "Workflow conventions".
- `.github/workflows/site-checks.yml` — GitHub Action: checker + lychee external-link check (push/PR + weekly cron + manual dispatch).

Logo assets at root: `logo-lockup-{cream,dark}.png`, `logo-mark-{64,128,256,512,1024}.png`, `logo-mark-{cream,dark}-512.png`, `logo.png`. Social card: `og-card.png` (1200×630, generated from the cream lockup) — every page's `og:image`/`twitter:image` points at it; overwrite that one file to restyle link previews site-wide.

Gitignored: `.env.local`, `.vercel/`.

---

## Hosting, accounts, secrets

- **Domain:** growthkitai.com (canonical on every page).
- **Vercel project:** `growthkit-ai` (id `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ`, org `team_wbjFESk88zLTz0UjMUI3SlRz`). Push to `main` → auto-deploy.
- **GitHub repo:** https://github.com/growthkitsai-coder/GrowthKit-AI (account `growthkitsai-coder`).
- **Credentials:** GitHub password is NOT in this repo or in CLAUDE.md (which is committed). Ask Avi when needed. Use a Personal Access Token — never write secrets to tracked files.
- **Analytics:** Vercel Web Analytics injected via `/_vercel/insights/script.js` on every page.
- **Search Console:** verified via meta tag (`google-site-verification` in `index.html`) and the file `googlea9dc9b0133a60f51.html`.
- **Waitlist data:** lives in a Google Sheet owned by Avi personally (his Google account — *not* a service account). The Sheet is the **system of record**. No copy in Vercel or git.

---

## Design system, copy voice, conventions

**Color tokens** (light defaults; dark overrides live in `theme.css`):

- `--bg: #FAF8F4` cream · `--bg-2: #F2EFE8`
- `--ink: #14130F` · `--ink-2: #2A2823` · `--muted: #6B6760`
- `--accent: #1F4732` deep forest · `--accent-soft: #2E6249` · `--accent-pale: #B7E4CC` (used in dark closing CTA)
- `--line: #E2DDD3` · `--line-2: #D4CEC1`
- `--maxw: 1180px`

Dark mode swaps to matte black `#050708` with radial-gradient forest-green glows (asymmetric right-side bias — mirrors weld.studio aesthetic). The dark body background uses `!important` because per-page inline `body { background: var(--bg); }` would otherwise win the cascade.

**Dark-mode "neon console" layer — SITE-WIDE (born on manifesto.html 2026-06-10, rolled out everywhere later that day).** Dark mode is intentionally a different aesthetic from light mode: techy, neon, terminal — for the dev-leaning audience. Light mode stays classic cream + forest on every page, untouched.

- Tokens (defined in `theme.css` dark block): `--neon: #3EF59F` (electric spring green), `--neon-2: #8FFFC9`, deep-forest panels `--deep-1: #06140D`, `--deep-2: #0A1F15`, `--deep-3: #143524`.
- **Architecture:** the shared layer lives in `theme.css` — tokens, `.dk-grid`/`.dk-scan` decor + `dkScan`/`dkPulse`/`dkBlink` keyframes, neon em glow on `h1–h4 em` + `.serif em`, `.eyebrow .num`, `.btn-primary`/`.btn-secondary`/`.nav-cta`/`.submit`, dark topbar console chrome (deep-green glass + neon scrolled pill + brand cursor), neon page-chrome hovers (`.nav-links a` + underline, `.nav-back`, `.foot-grid ul a`, `.theme-toggle`), `.spec-plate`, `.closing` CTA, selection/scrollbar/focus rings. Each page then carries a page-specific `:root[data-theme="dark"]` block at the END of its inline `<style>` for its own components, plus two decor divs right after `<body>` (`<div class="dk-grid">` + `<div class="dk-scan">`, both `aria-hidden`) and `main, footer { position: relative; z-index: 1; }` so content stacks above the fixed decor.
- Decor layers: `.dk-grid` (fixed faint neon grid, masked to fade toward the bottom) and `.dk-scan` (slow scanline sweep). Both `display:none` outside dark mode; `.dk-scan` disabled under `prefers-reduced-motion`.
- Patterns: heading `<em>`s glow neon, mono labels/tags get neon text-shadows, cards/plates become deep-green gradient panels (`linear-gradient(180deg, var(--deep-2), var(--deep-1))`, border `--deep-3`) with neon ring glow on hover, status LEDs/dots pulse via `dkPulse`, ghost numerals render as neon outlines (`-webkit-text-stroke`), row hovers use a left-to-right neon scan gradient, primary buttons go neon-on-near-black (`#04110A` text).
- The three pages that pioneered the look (manifesto/security/status) still carry their own inline copies of the tokens + decor CSS — duplicates of theme.css with identical values, harmless. Don't let them drift: if the neon tokens ever change, change theme.css AND those three pages.
- `404.html` previously loaded no `theme.css` at all (dark mode silently did nothing there) — fixed 2026-06-10; it now links theme.css and has the decor + a small neon block.
- The old mint (`--accent-pale`) dark treatment is retired; `--accent-pale` remains defined for legacy but nothing should use it for new accents.

**Fonts (Google Fonts):**

- Instrument Serif — display/headings (with frequent `<em>` italics for emphasis)
- Inter — body
- JetBrains Mono — eyebrows, small caps labels

**Copy voice.** Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings is *the* signature pattern — e.g. "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form". Avoid corporate-speak. "A founder, not a form, will reply" recurs.

**Topbar.** Morphs into a floating pill on scroll. `theme.css` handles the transition; each page's inline JS adds `.scrolled` to `.topbar` when `window.scrollY > 24`.

**Theme toggle.** `data-theme="dark"` on `<html>`, persisted in `localStorage` under `gk-theme`. Pre-paint inline script in every `<head>` sets the attribute before first paint. Don't remove it.

**Reduced motion.** All animations have `@media (prefers-reduced-motion: reduce)` fallbacks. Maintain this when adding new animations.

**SEO.** Every public page has canonical, OpenGraph, Twitter card, JSON-LD structured data, and is in `sitemap.xml`. `index.html` includes Organization + WebSite + WebPage + FAQPage schema. Match existing pattern when adding pages.

**Footer.** Three-column (Product / Company / Legal), duplicated across every page (no templating). As of 2026-06-11 — Product: The engine / How it works / **Specimen (`/specimen`) / Pricing (`/pricing`) / Become a client (`/onboarding`)** / FAQ / Join waitlist; Company: Manifesto / Methodology / Careers / Contact; Legal: Privacy / Terms / Security / Status. No placeholder links. The onboarding link is deliberate even though the page is noindex/not-in-sitemap — the footer is its public entry point for prospective clients. Pages with footers: index, methodology, careers, contact, privacy, terms, manifesto, security, status, specimen, pricing, onboarding. `waitlist.html` and `404.html` have no footer (intentional). The checker enforces identical link grids.

---

## Waitlist plumbing (read carefully — easy to break)

1. `waitlist.html` POSTs FormData (`name`, `email`, `updates`) to a Google Apps Script Web App via the `SCRIPT_URL` constant near the top of the page's inline `<script>` block.
2. The Apps Script (`waitlist-apps-script.gs`) `doPost` appends `[Timestamp, Name, Email, Wants updates]` to Avi's Google Sheet and writes the header row on first signup. `doGet` returns the live signup count as JSON.
3. **`SCRIPT_URL` is now duplicated in `status.html`** (added 2026-06-10), which GETs the same endpoint as a live health check. If the deployment URL ever changes, update it in **both** `waitlist.html` and `status.html`.
4. **Failure modes:**
   - Empty `SCRIPT_URL` → page shows "Form is not configured yet".
   - Re-deploying as "New deployment" in Apps Script issues a **new URL** and breaks the page. **Always use "Manage deployments → pencil → New version"** instead — that keeps the URL stable.
   - If the Apps Script deployment is deleted or its access changes from "Anyone", the status page's waitlist row will show amber "unreachable" — that's the check working, not a bug in the page.

---

## Workflow conventions

- Edits go directly to HTML files. No lint, no tests, no build — but there **is** a consistency checker now (added 2026-06-10): run `node scripts/check-site.mjs` after any change to HTML / `sitemap.xml` / `vercel.json`, before committing. Zero dependencies, needs Node ≥18.
- The same checker runs in CI (`.github/workflows/site-checks.yml`) on every push/PR plus a weekly Monday cron, alongside a **lychee** job that checks external URLs only (jsDelivr, Google Fonts, LinkedIn — `999`/`429` accepted as alive; `growthkitai.com` self-references and the `fonts.gstatic.com` preconnect root excluded). CI does **not** gate Vercel deploys — a red ✗ means the live site shipped with a problem.
- What the checker enforces: no placeholder `href="#"`/`href="/#"`; sitemap ↔ vercel.json rewrite/redirect parity (and that target files exist); canonical with correct URL + og:title/description/url/image + twitter:card + JSON-LD on every public page (404.html must stay noindex); identical footer link grids across pages; `logo.html` stays out of sitemap and public links; every internal href/src resolves (file, clean URL, or real `id` anchor — index `#x` and subpage `/#x` treated as equal); `SCRIPT_URL` non-empty and identical in `waitlist.html` + `status.html`.
- Local preview: open the file in a browser, or `vercel dev` from the project root if you need to test clean-URL rewrites.
- `git push origin main` → Vercel auto-deploys to growthkitai.com.
- Never commit `.env.local`, `.vercel/`, or anything containing credentials.
- Topbar / footer / `<head>` blocks are **duplicated across every page**. When changing nav links, footer columns, the topbar morph behavior, or the pre-paint theme script, update **every** HTML file.
- **Keep the .md files current** (rule added to CLAUDE.md 2026-06-10): after any durable change, update CLAUDE.md (rulebook), this file (knowledge + change log entry), and leave AGENTS.md alone unless its pointer goes stale — it was deliberately cut down to "read CLAUDE.md + memory.md, run the checker".

**When adding a new public page, update (the checker enforces 1–3):**

1. `vercel.json` — add to both `rewrites` AND `redirects`.
2. `sitemap.xml` — add the new URL block.
3. Every existing page's footer/nav (if linked).
4. `scripts/check-site.mjs` — only if the page is an exception (no footer / not in sitemap / internal): add it to `NO_FOOTER`, `NO_SITEMAP`, or `INTERNAL_PAGES` at the top.
5. CLAUDE.md (file layout) + this file (`memory.md`) — note the new page.
6. Run `node scripts/check-site.mjs` — it should pass before you commit.

---

## Known sharp edges / gotchas

- **CLAUDE.md is committed to git.** Do not put secrets, credentials, or PII into it. Same for this memory.md file — treat it as public.
- **`security.html` makes factual claims** (MFA on founder accounts, named vendor list, no payment data, honest "no SOC 2" disclosure). If infrastructure or vendors change, update that page — a wrong security page is worse than none.
- **No templating.** Footer/topbar/`<head>` duplication is intentional but means changes must be replicated by hand across every HTML file. A grep + multi-file edit is the right pattern.
- **`logo.html` is internal.** Don't add it to nav, sitemap, or any public link.
- **Dark-mode body background uses `!important`.** This is deliberate (cascade conflict with per-page inline styles). Don't "clean it up".
- **Pre-paint theme script.** Every `<head>` starts with an inline script that sets `data-theme` before first paint. Removing it causes a flash of incorrect theme.
- **Apps Script deployment.** "New deployment" = new URL = broken waitlist. Always "Manage deployments → New version".
- **GSAP/ScrollTrigger/Lenis are only loaded on `index.html`.** Don't assume they're available on other pages.
- **Subpage topbar nav is standardized** (2026-06-10): Product (`/#engine`) / How it works (`/#process`) / Methodology / Contact. Four older pages carried a dead "Customers → `/#proof`" link for weeks (no such id on index.html) — exactly the silent drift the checker now catches.
- **LinkedIn returns HTTP 999 to bots** — that's why the lychee config accepts 999; don't "fix" it by removing the accept list or LinkedIn links will fail CI forever.

---

## Open / placeholder items

- ~~Footer links `Manifesto`, `Security`, `Status` point to `#`~~ — **resolved 2026-06-10**: all three pages now exist and every footer links to them.
- Hiring pipeline: two open Intern roles on `careers.html` (Growth, Marketing). Applications go to `info@growthkitai.com` with subject `Internship — GrowthKit AI`.
- `security.html` promises a named thank-you on the page for valid vulnerability reports — if one ever arrives, add the credit there.
- `status.html` promises public postmortems in its incident log — if an incident happens, write it up there (what happened, why, what changed).
- Next steps agreed in planning (2026-06-10 session): ① email the waitlist (44 signups as of 2026-06-10) and invite a first pilot cohort — Cowork task; ② ~~build a public "specimen" page~~ — **built 2026-06-10** (`specimen.html`), but the analysis copy is Claude-Code placeholder grade — **Cowork should rewrite the Crewline content** (market choice, teardown copy, play details) in brand voice; ③ ~~add a conversion event on waitlist submit~~ — done in Phase 2 (`waitlist_signup` event); ④ start LinkedIn distribution now that the specimen exists; ⑤ verify `info@growthkitai.com` actually receives mail (every page + careers route through it).

---

## Using Claude Cowork + Claude Code together on this project

You (Avi) are running both Claude Cowork (desktop app, where this memory is being written) and Claude Code (CLI inside VS Code). Both can read CLAUDE.md and this memory.md because they live in the repo. Here is how to use them so they complement each other instead of stepping on each other.

### Commit policy (both tools must follow)

- **Claude Code auto-commits any change.** After any successful edit, Code runs `git add -A && git commit -m "<concise message>"` without being asked. Code does **not** push automatically — Avi may want to bundle commits — unless he explicitly says push.
- **Cowork prompts to commit.** Cowork doesn't run git on its own; after any meaningful file change in Cowork, remind Avi to commit (or hop to Claude Code to run the commit) before he switches tools.
- Never commit `.env.local`, `.vercel/`, secrets, the auto-memory directory, or anything containing credentials.
- If a commit fails (pre-commit hook, nothing staged, etc.), surface the reason and stop — don't paper over it.

The reason this rule exists: both tools write directly to disk. If one edits a file and Avi switches tools without committing, the second tool can blow away the first tool's work because git won't know what was there.

### What each tool is good at (and when to redirect Avi to the other one)

Either tool should recognize when a task fits the *other* tool better and tell Avi so — briefly, with one specific reason. Don't refuse; do what you can, then suggest the better tool. Phrasing like: *"I can do this here, but Claude Code will be faster for a multi-file footer edit — want me to draft the copy and you run the edit there?"*

**Claude Cowork (desktop app)** — best for:

- Open-ended planning, research, and copywriting sessions where the conversation matters more than the diff.
- Browsing the web and pulling competitor positioning, market data, or design references.
- Generating images, PDFs, decks, or any non-code deliverable (marketing assets, investor docs, founder updates).
- Working with connectors (Gmail, Calendar, Notion, HubSpot, etc.) for non-code tasks like drafting outreach or scheduling.
- Visually previewing the deployed site via Claude in Chrome — open the URL, screenshot, critique.
- Scheduled recurring tasks (e.g. "every Monday, summarize new waitlist signups").
- Rich plugins: marketing, SEO, design, brand-guidelines, canvas-design, theme-factory, pptx, docx, pdf.

**Claude Code (CLI in VS Code)** — best for:

- Actual HTML/CSS/JS edits, especially multi-file ones (e.g. updating the footer/topbar/nav across every page).
- Git operations: branches, commits, push, diffs, rebases, fixing bad commits.
- Running `vercel dev` locally and iterating on layout in the browser next to the editor.
- Faster file-level iteration because it's right inside the editor with full shell access.
- Deployment troubleshooting via shell (`vercel`, `gh`, `curl`).
- Anything where the diff matters more than the conversation.

**Redirection examples:**

- Avi asks Cowork to "rename all instances of X across every HTML file" → Cowork should say: this is a multi-file edit, faster in Claude Code; offer to write the sed command or describe the change for him to paste.
- Avi asks Cowork to "debug why the topbar doesn't morph on `/methodology`" → Cowork should say: shell-based iteration with live preview is faster in Claude Code; offer to suggest hypotheses he can test there.
- Avi asks Claude Code to "write three variations of the hero subhead" → Code should say: open-ended copy exploration is what Cowork's good at; offer to apply whichever variation he picks.
- Avi asks Claude Code to "research what Crunchbase's competitors say about pricing" → Code should say: web research belongs in Cowork; offer to wire the findings into copy once they exist.
- Avi asks Claude Code to "generate a brand-aligned PDF investor one-pager" → Code should say: asset generation lives in Cowork (canvas-design, pdf, brand-guidelines skills); offer to commit the finished file once it's in the repo.

### A workflow that won't fight itself

1. **CLAUDE.md and memory.md are the shared brain.** Both tools read them. When either tool learns something durable, update memory.md and commit. The other tool picks it up next session.
2. **Commit between sessions.** (See commit policy above.)
3. **Split work by strength.** Use Cowork for "what should the new pricing section say?" and Code for "now apply that copy to index.html and update the FAQ schema". The hand-off is verbal in Cowork, then a pasted brief into Code.
4. **One owner per task at a time.** Don't run Cowork and Code editing the same file in parallel — pick one for the duration of a task. They each have their own undo/redo stacks and can both write to disk.
5. **Use Cowork for previewing.** After Code pushes, ask Cowork to open growthkitai.com in Chrome and screenshot it, then critique. This is the cheapest review loop.
6. **Use Code for "git surgery"** — rebases, fixing bad commits, branch management.
7. **Memory updates are the unlock.** Treat memory.md like a notebook both tools share. After resolving any non-obvious problem, jot a one-line note under "Known sharp edges". Future sessions of either tool benefit.

### Quick reference: where each thing lives

- Project files: `D:\GrowthKit AI\` (both tools see this).
- Cowork-only outputs/scratchpad: temporary, cleared between sessions. Final deliverables get copied into `D:\GrowthKit AI\`.
- Code's working dir: `D:\GrowthKit AI\` directly.

If you ever feel the two tools have diverged in understanding, run `git status` and `git diff` (in Code) and re-read CLAUDE.md + memory.md (in Cowork). That resets both to the same page.

---

## Change log for this memory file

- **2026-05-26** — Initial creation. Captured everything in CLAUDE.md plus observations from the repo (theme.css, vercel.json, sitemap.xml, waitlist-apps-script.gs, theme.js). Added Cowork + Code collaboration playbook.
- **2026-05-26** — Added explicit commit policy (Claude Code auto-commits, Cowork prompts the user). Expanded the Cowork + Code section with a redirection rule: either tool should suggest the other when a task fits it better, with concrete examples. Mirrored these rules into CLAUDE.md.
- **2026-06-10** — (Claude Code session) Shipped the three missing footer pages and killed the last placeholder links:
  - **New pages:** `manifesto.html` (7-article founding document), `security.html` (honest posture page — explicitly no SOC 2 claim), `status.html` (live client-side checks of CDN + waitlist endpoint). All three follow the standard head/SEO/topbar/footer pattern, and all three carry a new dark-mode **"neon console"** layer (electric `#3EF59F` neon + deep-forest panels + grid/scanline decor) per Avi's direction that dark mode should feel distinctly techy/neon while light mode stays classic cream + forest. Documented under "Design system" above.
  - **Footers normalized on every page** (index, methodology, careers, contact, privacy, terms + new pages): Manifesto → `/manifesto`, Security → `/security`, Status → `/status`. methodology.html's footer was missing the Manifesto entry entirely — added.
  - **methodology.html** was missing the Vercel Web Analytics snippet — added, so analytics is now genuinely on every page.
  - **vercel.json** — rewrites + 301 redirects for the three new clean URLs. **sitemap.xml** — three new URL entries (lastmod 2026-06-10).
  - **`SCRIPT_URL` now exists in two files** (waitlist.html + status.html) — update both if the Apps Script deployment URL changes.
  - Waitlist stood at **44 signups** when checked this session.
- **2026-06-10** — (Claude Code session, "Phase 1 guard rails") Shipped the consistency checker + CI:
  - **New:** `scripts/check-site.mjs` (zero-dep Node) + `.github/workflows/site-checks.yml` (checker job + lychee external-link job; push/PR + weekly cron). Full check list documented under "Workflow conventions". CI doesn't gate Vercel deploys — red ✗ = live site has a problem.
  - **Bugs the checker caught on its first run, now fixed:** ① `methodology.html` had **no** OpenGraph / Twitter card / JSON-LD at all (despite docs claiming every page did) — full block added; ② four older pages (careers, contact, privacy, terms) had a dead topbar link "Customers → `/#proof`" (no such anchor on index.html) — their navs were aligned to the newer standard (Product / How it works / Methodology / Contact) used by manifesto/security/status/methodology.
  - **Docs:** CLAUDE.md gained "Guard rails" + "Documentation upkeep" sections (keep all .md files updated with every change; AGENTS.md is now deliberately a thin pointer — don't re-expand it); this file updated to match.
  - Ran concurrently with another session doing Phase 0 (og-card.png OG images, sitemap lastmod, AGENTS.md slim-down) and dark-mode console work on index.html/theme.css — commits were interleaved; checker passed on the merged tree.
- **2026-06-10** — (Claude Code session) **Neon console dark mode rolled out site-wide**, per Avi's direction ("apply that exact same dark mode design across all the pages… light mode remains the same"):
  - **`theme.css` is now the home of the shared neon layer:** neon/deep tokens, `.dk-grid`/`.dk-scan` decor + `dkScan`/`dkPulse` keyframes, neon em glow (color promoted to `--neon`, no longer mint), `.eyebrow .num`, buttons (`.btn-primary`/`.btn-secondary`/`.nav-cta`/`.submit`), `.spec-plate` (deep-green terminal plate), `.closing` CTA (deep-green gradient slab), selection/scrollbar/focus rings, FAQ hover scan. All previous mint (`--accent-pale`) accents converted to neon.
  - **Per-page dark blocks appended to inline `<style>`** + decor divs added after `<body>` on: `index.html` (hero glow, problem-morph ghosts/tags/HUD, marquee, engine spine/nodes/specimen panels, process wave/nodes, FAQ toggle), `waitlist.html` (terminal application card, phosphor inputs, neon submit/checkbox/success stamp), `methodology.html` (hero-stats plate, mission, marquee, pillars + ghost outlines, process badges/line, beliefs, stats), `careers.html` (role cards as armored panels, points, grow-into, channels), `contact.html` (channel cards, meta strip), `privacy.html` + `terms.html` (TOC, sec-eyebrows, inline links, markers, callouts).
  - **`404.html` bug fixed:** it never linked `theme.css`, so dark mode silently did nothing there. Now linked + neon block added (no theme toggle on that page — by design, the pre-paint script still applies the saved theme).
  - Light mode untouched on every page. All reduced-motion guards preserved (scanline + pulses disabled).
  - Known pre-existing oddity left alone (flagged to Avi): `index.html` `<body>` carries an injected inline style `background-color: rgb(239,233,222); font-family: Inter` + a duplicate `gfont-Inter` font link — looks like a visual-editor artifact from an earlier session; harmless in dark mode (theme.css `!important` wins) but overrides the cream token in light mode. — **resolved 2026-06-11**: both removed (see change log below).
  - `node scripts/check-site.mjs` passed after the rollout.
- **2026-06-10** — (Claude Code session, "Phase 2 conversion hardening") The waitlist path got teeth, and the funnel got eyes:
  - **`waitlist-apps-script.gs` rewritten** (must be re-pasted into the Apps Script editor + redeployed "New version" to take effect — the repo copy is source only): server-side name/email validation; honeypot (`company`) and min-fill-time (`t` < 2.5s) drops that return `{ok:true}` so bots don't learn; **email dedupe** (case-insensitive; re-signup refreshes the row, consent only upgrades No → Yes); `LockService` around sheet writes; soft rate limit (60 accepted/10 min, then a *visible* "try again in a few minutes" — launch-day spikes are never silently dropped); **confirmation email** to brand-new signups via `MailApp` (brand voice, reply-to `info@`, quota-guarded, never blocks the signup).
  - **`waitlist.html`**: off-screen `.hp-field` honeypot (deliberately not `display:none`), `loadedAt` timestamp → sends `company` + `t` with the POST; fires `waitlist_signup` / `waitlist_error` analytics events.
  - **Analytics custom events on all 10 public pages:** a `window.va` queue shim + click listener (before the insights script) emits `cta_click` (any `/waitlist` link or `.nav-cta`/`.btn-primary`, with page/section/href); `status.html` fires `status_check_failed` (with which target failed) when the master banner goes amber. **Caveat: Vercel records custom events on Pro/Enterprise only** — on Hobby they're silently ignored; pageviews unaffected.
  - **`careers.html`**: second JSON-LD block with **JobPosting** schema for both intern roles (TELECOMMUTE, GB/US, email apply, `validThrough` 2026-12-31 — bump or remove when roles close). All JSON-LD on all pages re-validated with a parse pass.
  - **Checker caught another live regression:** the index FAQ pricing answer (new $30 Basic / $200 Premium agentic copy) linked to a non-existent `/pricing` page — dead link removed, FAQ copy + FAQPage schema confirmed in sync. Pricing facts in CLAUDE.md + this file updated to match the FAQ ($25 figure was stale). If `/pricing` gets built later (Phase 3 candidate), follow the new-page checklist and re-link the FAQ.
  - `node scripts/check-site.mjs` green; JSON-LD parse check green.
- **2026-06-10** — (Claude Code session, "Phase 3 — specimen + pricing") The site finally shows the work, and the new pricing is live everywhere:
  - **New page `specimen.html`** ("Specimen №02 — this is the specimen"): full sample teardown of fictional **Crewline** (field-service software for independent HVAC contractors). Hand-built SVG market map (11 fictional-composite vendors, gap zone), teardown table (3/6 visible), gap analysis (2/4 visible), 90-day plan (3/14 visible) — the rest blurred behind "join the waitlist" overlay cards. Honesty note up front: fictional subject, real method, illustrative numbers. **Copy is placeholder grade — Cowork should rewrite the analysis content.**
  - **New page `pricing.html`**: Pilot $0 (invite-only) / Basic $30/mo / Premium Agentic $200/mo (featured card), partner strip, plain-language small print, Product JSON-LD with three Offers.
  - **Pricing changed site-wide $25 → $30 Basic + $200 Premium Agentic:** index hero-meta pill ("Starts at $30 / month · basic plan"), index FAQ answer + FAQPage JSON-LD (both re-linked to `/pricing` now that it exists), CLAUDE.md company facts, this file's TL;DR. The premium tier copy: continuous agentic monitoring, mid-cycle alerts, plan re-cuts, operator review on every refresh.
  - **Wiring:** vercel.json rewrites + redirects for `/specimen` + `/pricing`; sitemap entries (0.9 / 0.8, lastmod 2026-06-10); **footer Product column on all 11 footer pages** gained Specimen + Pricing (between How it works and FAQ). Subpage topbar nav unchanged (standard four links) — specimen/pricing are reachable from every footer + index FAQ + each other.
  - Both new pages follow the full house pattern: standard head/SEO/canonical/OG/JSON-LD, pre-paint theme script, theme toggle, dk-grid/dk-scan decor divs, page-specific neon dark block at the end of inline CSS, reveal-on-scroll, reduced-motion guards, Vercel analytics.
  - `node scripts/check-site.mjs` green (13 public pages).
- **2026-06-11** — (Claude Code session) Dark-mode parity + "live console" motion on `index.html` (light mode untouched throughout):
  - **Parity fixes vs methodology/manifesto:** the hero **"Specimen №01" spec-plate** now gets the neon phosphor halo the manifesto's instrument panel has (theme.css only gave `.spec-plate` a flat dark box-shadow) — added as a box-shadow scoped to `.hero .spec-plate` so spec-plates elsewhere keep the flat shadow. The plate's "system online" **status LED** now pulses neon via the shared `dkPulse` (it was still running the light-mode forest `pulseDot` keyframes in dark).
  - **Removed the visual-editor cruft** previously flagged under the 2026-06-10 neon-rollout entry: the injected `<body style="background-color: rgb(239,233,222); font-family: Inter">` and the duplicate `gfont-Inter` link are gone, so light mode renders on the real cream `--bg` again.
  - **New live-console motion (dark only), per Avi "make it a lil more techy":** a CRT **scanline sweep** glides down the hero spec-plate (`@keyframes dkScanDown`) plus a fainter/slower sweep down each of the four **engine specimen** panels; a blinking **terminal caret** (`▋`, `@keyframes dkCaret`) sits after the spec-plate subtitle; the **engine spine nodes breathe** their glow once lit (`@keyframes dkNodeBreathe`). All three keyframes + rules live in `index.html`'s inline `<style>` (index-only) and are killed under `prefers-reduced-motion` (scanlines `display:none`, caret/nodes `animation:none`). To take this site-wide later, promote the keyframes + rules into `theme.css`.
  - `node scripts/check-site.mjs` green.
- **2026-06-11** — (Claude Code session) **Dark-mode topbar restyled as neon console chrome, site-wide** — all in `theme.css`, zero per-page edits; light mode untouched:
  - **Root cause of the old "washed-out silver strip":** every page's inline `.topbar` hard-codes cream glass (`rgba(250,248,244,.55)`), and theme.css only overrode the **scrolled** state in dark mode — the resting bar was cream rgba blending over the dark canvas.
  - **Resting bar (dark):** deep-green glass gradient + faint vertical phosphor ticks at 44px (same pitch as the `.dk-grid` floor), neon hairline bottom border, soft neon backlight bleeding onto the page. Background deliberately split into longhands: the gradient/tick **image layers are identical in both states** and only `background-color` changes — gradients can't interpolate, so this keeps the scroll morph smooth instead of snapping.
  - **Scrolled pill (dark):** sealed console capsule — neon inset ring (`0 0 0 1px` at 0.22) + mint top-light + faint phosphor halo + deeper drop shadow, blur bumped to 26px. Replaces the old white-inset gray glass.
  - **Brand:** logo-mark gets a powered-on neon ring + glow; the wordmark gets a blinking `_` terminal cursor via the shared `dkBlink` keyframes. Both scoped to `.topbar .brand` so footer brands stay quiet. Cursor disabled under reduced motion.
  - **Nav CTA ("Join waitlist") is no longer the white token-flip pill:** idle = sealed deep-green key (solid `--deep-2`) with neon inset ring, neon-2 text + text glow, soft outer glow; hover = solid neon fill with near-black text. Both states use solid background-colors so the hover fill interpolates. The old standalone dark `.nav-cta:hover` rule was folded into this block. **Theme toggle** border deepened to `--deep-3` + 4% neon fill so it reads as chrome, not a gray ghost.
  - **Checker not run this session: `node` is not on PATH on this machine** (prior sessions logged it green, so Node may have been uninstalled or this is a different clone — `winget install OpenJS.NodeJS.LTS` would restore it). Change is CSS-only, which is outside the checker's stated scope (HTML/sitemap/vercel.json); CI runs it on push regardless.
- **2026-06-11** — (Claude Code session, ran concurrently with the topbar-chrome session above; Avi's manual "lol" commits interleaved both) **Dark mode deepened to manifesto grade on every page that lagged it**, per Avi ("make it as clean, techy, and just as much like the manifesto page's neon green dark mode as possible"). Light mode untouched throughout; all new animation reduced-motion-guarded. CSS-only except one `aria-hidden` div on 404:
  - **`theme.css` shared layer grew:** `@keyframes dkBlink` (the manifesto signature-plate blinking cursor, now shared — the concurrent topbar work's brand cursor uses it too) + neon page-chrome hovers: `.nav-links a` (+ neon underline w/ glow), `.nav-back`, `.foot-grid ul a`, `.theme-toggle` — these previously hovered to the muddy dark-token `--accent` #3D7C5C on every page including the manifesto itself.
  - **`pricing.html`:** plan prices ($0/$30/$200) get the full neon em glow (the page's "Markets, *dissected*" equivalent), unit labels phosphor; plans respond to hover with a neon ring/bloom (border+shadow only, no transform; featured plan gets a stronger ring); partner-strip dashed border goes phosphor; small-print h4 tinted.
  - **`privacy.html` + `terms.html`:** sticky TOC becomes a sealed deep-green terminal file-index panel (dark-only padding/border — light keeps the bare list), TOC hover glow, doc-body h3 subheads tinted `--neon-2`.
  - **`contact.html`:** email/LinkedIn mono targets render as phosphor terminal output with a neon `> ` prompt (via `content: "> " / ""` — alt-text syntax so screen readers skip it; older engines drop the prompt gracefully); meta-strip rules go green-tinted with phosphor keys.
  - **`careers.html`:** why-us `.points .pt` cells become deep-green gradient panels (segmented instrument cluster); role taglines + h5 labels phosphor; application targets get the same `> ` prompt as contact.
  - **`404.html`:** giant neon-outline ghost "404" numeral behind the card (`-webkit-text-stroke`, dark-only `display:block`, new `aria-hidden` div) + blinking `dkBlink` cursor after "Error · 404".
  - **`waitlist.html` + `onboarding.html`:** field labels read as phosphor prompts; card-foot gets a blinking cursor (`span:last-child::after`); waitlist success note tinted.
  - **`methodology.html`:** stat keys + hero-stats row numbers/metas phosphor; pillar spec-row rules green-tinted.
  - **`specimen.html`:** teardown rows + 90-day-plan rows get the manifesto article scan-on-hover sweep; play meta values + gap-meter labels phosphor.
  - **Untouched on purpose:** `index.html` (already deepest, plus the concurrent live-console motion work), `security.html`/`status.html` (pioneer pages, complete, own inline token copies), `manifesto.html` (the reference), `logo.html` (internal), `deliverables/template.html` + `d/demo/` (self-contained by design, already neon-console).
  - **Repo files not yet in the docs' file layout** (added by Avi's earlier "l"/"lol" commits, noted here until properly documented): `onboarding.html` (noindex client-briefing form, waitlist-card DNA), `deliverables/template.html` (master client-deliverable template + `scripts/make-deliverable.mjs` generator flow), `d/demo/acme-analytics-2026-06.html` (filled demo deliverable).
  - Checker: `node` unavailable on this machine (see entry above) — ran structural sanity checks instead (style-block integrity, dkBlink/theme.css reference pairing, ghost-div placement); changes are CSS + one inert div, outside the checker's invariants. CI re-checks on push.
- **2026-06-11** — (Claude Code session) **index.html dark-mode: final manifesto-grade deepening** + finished the stranded Phase 4 wiring:
  - **index.html** (the components that still lagged): marquee strip → solid deep-green console rail with matching edge fades; engine spine → powered neon gradient rail; engine rows → dashed neon separators + the manifesto left-to-right hover scan; engine module tags + process step tags → neon glow (article-tag analog); process node labels light `--neon-2` when lit; hero-meta figures ($30 / ~90 sec / 5+ / 2026) → glowing `--neon-2` instrument readouts; `problem-pin` section background transparent in dark so the grid floor + scanline stay visible through the whole pinned morph; ghost numerals brighten on card hover; FAQ open `qnum` neon; scatter-gap dot breathes (`dkNodeBreathe`); card-aside/stage-foot border tints. All dark-only, all reduced-motion-guarded.
  - **Phase 4 wiring (was stranded mid-session, CI was red):** `/onboarding` rewrite + redirect in vercel.json; `onboarding.html` registered in the checker's `NO_SITEMAP` (and the rewrite↔sitemap parity check is now NO_SITEMAP-aware); onboarding footer updated with Specimen/Pricing; `X-Robots-Tag: noindex, nofollow` headers for `/d/(.*)` and `/deliverables/(.*)`; robots.txt `Disallow: /d/` + `/deliverables/`; .gitignore now excludes `clients/*` and `d/*` except the demo. Checker green again (14 public pages).
  - **Open action items:** ① `onboarding.html`'s `SCRIPT_URL` is EMPTY — deploy `onboarding-apps-script.gs` (instructions in its header) and paste the URL in, or the form shows "not configured yet"; ② the repo is still PUBLIC — make it private before committing any real client file under `clients/`/`d/` (`gh repo edit growthkitsai-coder/GrowthKit-AI --visibility private --accept-visibility-change-consequences`); ③ CLAUDE.md now carries a "Deliverable pipeline (Phase 4)" section — the previous changelog note about undocumented repo files is resolved.
- **2026-06-11** — (Claude Code session) **`specimen.html` full visual upscale + redaction box-glitch fix**, both modes (page-local rewrite of its inline CSS + small HTML restructuring; no other pages touched):
  - **Glitch fixed:** the blurred `.redacted` layers kept their card drop-shadows and weren't clipped, so `filter: blur(7px)` smeared grey (light) / neon (dark) shadow rectangles past the container edges — the "weird boxes." Now `.redacted-block { overflow: hidden }`, `.redacted * { box-shadow: none !important }`, and a radial veil (`.redact-overlay::before` — cream in light, near-black in dark) sits between the blur and the overlay card so the transition reads as a soft seal, not a glitch.
  - **Hero:** giant ghost "№02" watermark (forest @5% light / neon outline dark) + rotated double-border "sample copy · partially redacted" stamp (hidden ≤860px); hero-meta upgraded to bordered instrument chips (paper in light, deep-green panels in dark).
  - **Structure:** section heads now the manifesto 2-col editorial grid with huge ghost section numerals per section; map + teardown share new `.panel` chrome (teardown gained its own panel-head: "6 vendors dissected · 3 shown · 3 redacted"); brief plate gained a `plate-foot` with LED ("compiled by the growthkit engine · operator-reviewed · rev 03") — LED pulses `dkPulse` in dark.
  - **Market map:** dots **plot themselves** on reveal (staggered scale-in via `transform-box: fill-box`, labels fade in after, gap zone last); axis arrow caps; quadrant annotations ("enterprise territory", "shallow & expensive — the dead zone"); dots get paper/deep halo strokes for separation; mobile = horizontal scroll with `min-width: 700px` (labels stay legible); dark-only `spYouBreathe` glow on the Crewline dot.
  - **Gap cards:** ghost numerals, hover lift (border→accent/neon ring, no transform), score chip ("92 / 100") in a new top row, meters animate 0 → `--w` on reveal (inline styles now set `--w`, not `width`). **Plays:** vertical timeline rail through badge-styled play numbers (neon gradient rail in dark), `p-meta` is now a bordered key-value card with a dashed-rule kill-criterion row. **Redact cards:** redaction-bars motif (3 ink bars — neon shimmer `spBarShimmer` in dark), dashed inner seal border.
  - **Closing:** light mode = inverted forest slab (accent bg + pale-mint radial glows, cream type, cream/pale buttons); dark = deep-green console panel with neon em + neon buttons.
  - All new motion reduced-motion-guarded (map plots instantly, meters jump to value, LED/breathe/shimmer off). Checker green (14 public pages). Copy unchanged — the Cowork content-rewrite flag stands.
- **2026-06-11** — (Claude Code session, continued) **methodology.html final deepening to index parity**: marquee → solid deep-green console rail with matching edge fades; hero-stats plate runs live (CRT `dkScanDown` sweep + `dkCaret` terminal caret after "v0.4 · beta", `position:relative` added dark-only so the ::after clips); process badges breathe (`dkNodeBreathe`); stats-ribbon count-up figures → glowing `--neon-2` instrument readouts with green-tinted rules. **Keyframes `dkScanDown`/`dkCaret`/`dkNodeBreathe` promoted from index-local to `theme.css`** (index now carries a pointer comment instead of definitions — don't redefine them per page). All dark-only + reduced-motion-guarded; checker green.
- **2026-06-11** — (Claude Code session) **contact.html + privacy.html deepened to full manifesto grade**, per Avi ("most techy, visually interesting… exactly like the manifesto page"):
  - **contact.html** — HTML gained two manifesto patterns that exist in both modes (light = classic cream, exactly like manifesto's light): a `hero-meta` LED row under the lede ("Channels open · London · Remote · Reply — one business day") and `ghost` numerals (01/02) on the channel cards (cards now `position:relative; overflow:hidden`, content z-indexed above). Dark-only additions: hero LED pulses (`dkPulse`); each channel label gets a live "channel online" LED (second card's pulse offset 1.3s so they don't blink in sync); the phosphor address lines (`.target`, which already had the `>` prefix) end in a **blinking terminal cursor** (`dkBlink` ::after); ghosts render as neon wireframes (`-webkit-text-stroke`) that brighten on hover; card hover layers the manifesto scan-wash over the deep-green panel; meta-strip cells scan on hover and their mono keys get a neon `/` tick.
  - **privacy.html** — dark-only pseudo-elements, zero HTML/light changes: the hero meta-row reads as a **live document register** (pulsing LED before "Effective", blinking cursor after "Version: 1.0"); section eyebrows get the manifesto article-tag neon dash; all 19 numbered sections take the log-entry scan-wash on hover (padding offset by negative margins so the text column doesn't shift vs light); TOC index numbers light neon on hover.
  - Both pages define local `dkPulse`/`dkBlink` copies (same pattern as manifesto — identical bodies also live in theme.css, harmless). All animation reduced-motion-guarded. Checker green (14 pages) after each page; committed separately (`bd03057`, `8542356`).
- **2026-06-11** — (Claude Code session, continued) **terms.html final deepening to index/methodology parity**: giant neon-wireframe `§` ghost behind the page hero (one dark-only `aria-hidden` span — `display:none` in light, so light HTML output is visually unchanged); blinking `dkCaret` after the meta-row version stamp and after the TOC "/ Contents" label; CRT `dkScanDown` sweep over the terminal-card TOC (TOC gains `overflow:hidden` dark-only to clip it); doc sections take the manifesto scan-wash on hover. All dark-only + reduced-motion-guarded; checker green. Ran alongside a parallel session doing the same depth on privacy.html (hero document register, LED, version cursor) and contact.html — every public page is now at manifesto-grade dark-mode depth.
- **2026-06-11** — (Claude Code session) **Footer gained "Become a client" → `/onboarding`** in the Product column (between Pricing and FAQ), on all 12 footer pages (the 11 public + onboarding.html itself), per Avi — prospective clients needed a visible path to the onboarding form. The page stays noindex/out-of-sitemap; the footer link is its intended public entry point. Footer descriptions updated in CLAUDE.md + this file. Checker green (14 pages).
- **2026-06-11** — (Claude Code session) **Closing CTA + footer → console-deck treatment, site-wide via theme.css** (Avi flagged the dark-mode bottom-of-page as the last flat zone): `.closing` is now a sealed deep-green console deck — phosphor grid etched into the panel (44px pitch, matching the .dk-grid floor), inner neon bloom, and a `dkScanDown` CRT readout line sweeping it (`position:relative + overflow:hidden` added dark-only; `.wrap` z-lifted). `footer` goes transparent over the body glows with a deep-green top fade + `--deep-3` rule; `.foot-grid h4` column headers phosphor; `.foot-bar` reads as a terminal status line — pulsing LED before "© 2026", blinking `dkCaret` after the build tag, phosphor text. Both reduced-motion-guarded. Affects index + methodology `.closing` and every page footer; manifesto's `.closing-cta` (different class) untouched. **Diagnosis note:** Avi's screenshots showing a gray topbar / white closing slab / mint ems were his browser serving a STALE cached theme.css (css is cached 1h + stale-while-revalidate 1d) — the rules were already correct in the repo; hard-refresh (Ctrl+Shift+R) after deploys that touch theme.css.
