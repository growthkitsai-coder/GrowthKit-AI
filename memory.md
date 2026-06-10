# GrowthKit AI — Memory

A persistent knowledge file for Claude (Cowork + Code) to read before starting any task on this project. Complements `CLAUDE.md`. Update this file whenever something durable changes (new pages, new decisions, broken assumptions, vendor changes, new conventions).

Always read `CLAUDE.md` AND this file before doing any work.

---

## TL;DR — what this project is

GrowthKit AI is a marketing site (plain static HTML, no build step) for a market-intelligence product aimed at seed → Series A founders. Four deliverables: market map, competitor teardown, gap analysis, 90-day plan (~14 plays), refreshed monthly. Tagline: *"Markets, dissected — not guessed."* Standard plans from $25/month. UK-based, London, founded 2026. Status: v0.4 private beta. Contact: `info@growthkitai.com`. Hosted on Vercel at `growthkitai.com`. Auto-deploys from `main` on GitHub.

Owner: Avi Aggarwal (Co-Founder). LinkedIn: https://www.linkedin.com/in/avi-aggarwal-build-ready/

---

## The whole repo at a glance

Everything lives at the repo root. No `src/`, no `public/`, no framework, no `package.json`, no lint, no tests.

Pages (all public except `logo.html`):

- `index.html` (~2400 lines, ~100KB) — landing page. Hero with "Specimen №01" plate, pinned editorial problem morph, engine schematic, three-step process, FAQ, closing CTA, footer. Loads GSAP 3.13 + ScrollTrigger + Lenis from jsDelivr.
- `waitlist.html` — single-card signup form (Name, Work email, "wants updates" checkbox). POSTs to a Google Apps Script Web App; morphs into "You're on the list" success state.
- `methodology.html` — long-form pitch (Hero → Mission → Marquee → 4 Pillars → 3 Steps → 5 tenets → CTA).
- `careers.html` — Why now → 4 perks → 2 Intern role cards (Growth → "Head of Growth" track, Marketing → "CMO" track) → 3 application channels.
- `contact.html` — two channel cards (email + LinkedIn).
- `privacy.html` — UK/EEA-aware policy. GrowthKit AI is the data controller.
- `terms.html` — numbered ToS sections.
- `manifesto.html` — founding-document page ("The market is knowable."). Preamble with drop cap → 7 numbered articles (5 Believe / 2 Reject — expanded from methodology's 5 tenets, reworded so the two pages don't read copy-pasted) → "Specimen №00" signature plate with blinking cursor → CTA to waitlist/methodology.
- `security.html` — security-posture page ("Security by subtraction."). 4 posture cards → architecture section with a mono terminal readout of the **actual** response headers from `vercel.json` (keep them in sync if headers change) → itemised data inventory → responsible disclosure (info@growthkitai.com, subject "Security — GrowthKit AI", 2-business-day ack, credit but no paid bounty) → "What we don't claim" block (explicitly NOT SOC 2 / ISO 27001 certified — never add badge claims without Avi's sign-off).
- `status.html` — live status page. **Checks run client-side in the visitor's browser**: (1) website/CDN via cache-busted fetch of `/logo-mark-64.png`, (2) waitlist intake via GET to the Apps Script `doGet` (expects `{ok:true,…}`), both with 9s timeouts and latency readouts; (3) engine row is a static "private beta" chip. Master banner aggregates: all ok → "All systems operational", any failure → amber "Something's not answering" (copy explains it may be the visitor's network). Incident log is an honest empty state ("history begins June 2026"). Has a "run checks again" button.
- `404.html` — minimalist, `noindex, follow`. Links to home + waitlist. No footer.
- `logo.html` — **internal** logo variant reference page. Not linked from nav. Not in sitemap. Do not link from public pages.

Shared:

- `theme.css` — dark-mode tokens, topbar pill morph, a few cross-page overrides. **The only shared CSS file.** Per-page CSS is inlined in `<head>` `<style>` blocks. Don't extract more CSS into shared files without a real reason.
- `theme.js` — theme toggle wiring. Reads/writes `localStorage` key `gk-theme`. Pre-paint inline script in every `<head>` sets `data-theme` before first paint to avoid FOUC — don't remove it.

Infrastructure:

- `vercel.json` — clean-URL rewrites + 301 redirects + cache headers + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Current clean-URL list: `/privacy /waitlist /contact /careers /methodology /terms /manifesto /security /status`. Note: `security.html`'s terminal readout quotes these headers verbatim — update it if the headers change.
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html` (Google Search Console verification).
- `waitlist-apps-script.gs` — Apps Script source. Header has setup instructions.
- `scripts/check-site.mjs` — zero-dependency Node consistency checker; run before every commit that touches HTML / sitemap / vercel.json. Details under "Workflow conventions".
- `.github/workflows/site-checks.yml` — GitHub Action: checker + lychee external-link check (push/PR + weekly cron + manual dispatch).

Logo assets at root: `logo-lockup-{cream,dark}.png`, `logo-mark-{64,128,256,512,1024}.png`, `logo-mark-{cream,dark}-512.png`, `logo.png`.

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

**Dark-mode "neon console" layer (manifesto / security / status only, added 2026-06-10).** These three pages deliberately push dark mode further than the rest of the site — a techy, neon, terminal aesthetic for the dev-leaning audience — while their light mode stays identical to site DNA. The treatment lives entirely in each page's inline CSS under `:root[data-theme="dark"]`:

- Tokens: `--neon: #3EF59F` (electric spring green), `--neon-2: #8FFFC9`, deep-forest panels `--deep-1: #06140D`, `--deep-2: #0A1F15`, `--deep-3: #143524`.
- Decor layers: `.dk-grid` (fixed faint neon grid, masked to fade toward the bottom) and `.dk-scan` (slow scanline sweep). Both are `display:none` by default and only activate in dark mode; `.dk-scan` is disabled under `prefers-reduced-motion`.
- Patterns: heading `<em>`s glow neon, mono labels/tags get neon text-shadows, cards become deep-green gradient panels with glowing borders on hover, status LEDs/chips pulse, the manifesto signature plate has a blinking cursor, primary buttons go neon-on-near-black.
- Light mode on these pages = classic cream + forest, unchanged. Older pages keep the softer mint (`--accent-pale`) dark treatment from `theme.css`. To extend the neon look to another page, copy the dark-mode block from one of these three.

**Fonts (Google Fonts):**

- Instrument Serif — display/headings (with frequent `<em>` italics for emphasis)
- Inter — body
- JetBrains Mono — eyebrows, small caps labels

**Copy voice.** Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings is *the* signature pattern — e.g. "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form". Avoid corporate-speak. "A founder, not a form, will reply" recurs.

**Topbar.** Morphs into a floating pill on scroll. `theme.css` handles the transition; each page's inline JS adds `.scrolled` to `.topbar` when `window.scrollY > 24`.

**Theme toggle.** `data-theme="dark"` on `<html>`, persisted in `localStorage` under `gk-theme`. Pre-paint inline script in every `<head>` sets the attribute before first paint. Don't remove it.

**Reduced motion.** All animations have `@media (prefers-reduced-motion: reduce)` fallbacks. Maintain this when adding new animations.

**SEO.** Every public page has canonical, OpenGraph, Twitter card, JSON-LD structured data, and is in `sitemap.xml`. `index.html` includes Organization + WebSite + WebPage + FAQPage schema. Match existing pattern when adding pages.

**Footer.** Three-column (Product / Company / Legal), duplicated across every page (no templating). As of 2026-06-10 there are **no placeholder links left** — Company: Manifesto (`/manifesto`) / Methodology / Careers / Contact; Legal: Privacy / Terms / Security (`/security`) / Status (`/status`). Pages with footers: index, methodology, careers, contact, privacy, terms + the three new pages. `waitlist.html` and `404.html` have no footer (intentional).

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
- Next steps agreed in planning (2026-06-10 session): ① email the waitlist (44 signups as of 2026-06-10) and invite a first pilot cohort — Cowork task; ② build a public "specimen" page (example market map / teardown excerpt) — Cowork drafts content, Code builds the page; ③ add a conversion event on waitlist submit; ④ start LinkedIn distribution once the specimen exists; ⑤ verify `info@growthkitai.com` actually receives mail (every page + careers route through it).

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
