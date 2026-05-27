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
- `404.html` — minimalist, `noindex, follow`. Links to home + waitlist.
- `logo.html` — **internal** logo variant reference page. Not linked from nav. Not in sitemap. Do not link from public pages.

Shared:

- `theme.css` — dark-mode tokens, topbar pill morph, a few cross-page overrides. **The only shared CSS file.** Per-page CSS is inlined in `<head>` `<style>` blocks. Don't extract more CSS into shared files without a real reason.
- `theme.js` — theme toggle wiring. Reads/writes `localStorage` key `gk-theme`. Pre-paint inline script in every `<head>` sets `data-theme` before first paint to avoid FOUC — don't remove it.

Infrastructure:

- `vercel.json` — clean-URL rewrites + 301 redirects + cache headers + security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Current clean-URL list: `/privacy /waitlist /contact /careers /methodology /terms`.
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, `googlea9dc9b0133a60f51.html` (Google Search Console verification).
- `waitlist-apps-script.gs` — Apps Script source. Header has setup instructions.

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

**Fonts (Google Fonts):**

- Instrument Serif — display/headings (with frequent `<em>` italics for emphasis)
- Inter — body
- JetBrains Mono — eyebrows, small caps labels

**Copy voice.** Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings is *the* signature pattern — e.g. "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form". Avoid corporate-speak. "A founder, not a form, will reply" recurs.

**Topbar.** Morphs into a floating pill on scroll. `theme.css` handles the transition; each page's inline JS adds `.scrolled` to `.topbar` when `window.scrollY > 24`.

**Theme toggle.** `data-theme="dark"` on `<html>`, persisted in `localStorage` under `gk-theme`. Pre-paint inline script in every `<head>` sets the attribute before first paint. Don't remove it.

**Reduced motion.** All animations have `@media (prefers-reduced-motion: reduce)` fallbacks. Maintain this when adding new animations.

**SEO.** Every public page has canonical, OpenGraph, Twitter card, JSON-LD structured data, and is in `sitemap.xml`. `index.html` includes Organization + WebSite + WebPage + FAQPage schema. Match existing pattern when adding pages.

**Footer.** Three-column (Product / Company / Legal), duplicated across every page (no templating). Known placeholders pointing to `#`: `Manifesto`, `Security`, `Status`. If creating any of these pages, also update sitemap, vercel.json, and every footer.

---

## Waitlist plumbing (read carefully — easy to break)

1. `waitlist.html` POSTs FormData (`name`, `email`, `updates`) to a Google Apps Script Web App via the `SCRIPT_URL` constant near the top of the page's inline `<script>` block.
2. The Apps Script (`waitlist-apps-script.gs`) `doPost` appends `[Timestamp, Name, Email, Wants updates]` to Avi's Google Sheet and writes the header row on first signup. `doGet` returns the live signup count as JSON.
3. **Failure modes:**
   - Empty `SCRIPT_URL` → page shows "Form is not configured yet".
   - Re-deploying as "New deployment" in Apps Script issues a **new URL** and breaks the page. **Always use "Manage deployments → pencil → New version"** instead — that keeps the URL stable.

---

## Workflow conventions

- Edits go directly to HTML files. No lint, no tests, no build.
- Local preview: open the file in a browser, or `vercel dev` from the project root if you need to test clean-URL rewrites.
- `git push origin main` → Vercel auto-deploys to growthkitai.com.
- Never commit `.env.local`, `.vercel/`, or anything containing credentials.
- Topbar / footer / `<head>` blocks are **duplicated across every page**. When changing nav links, footer columns, the topbar morph behavior, or the pre-paint theme script, update **every** HTML file.

**When adding a new public page, four things must be updated:**

1. `vercel.json` — add to both `rewrites` AND `redirects`.
2. `sitemap.xml` — add the new URL block.
3. Every existing page's footer/nav (if linked).
4. This file (`memory.md`) — note the new page in the file list above.

---

## Known sharp edges / gotchas

- **CLAUDE.md is committed to git.** Do not put secrets, credentials, or PII into it. Same for this memory.md file — treat it as public.
- **No templating.** Footer/topbar/`<head>` duplication is intentional but means changes must be replicated by hand across every HTML file. A grep + multi-file edit is the right pattern.
- **`logo.html` is internal.** Don't add it to nav, sitemap, or any public link.
- **Dark-mode body background uses `!important`.** This is deliberate (cascade conflict with per-page inline styles). Don't "clean it up".
- **Pre-paint theme script.** Every `<head>` starts with an inline script that sets `data-theme` before first paint. Removing it causes a flash of incorrect theme.
- **Apps Script deployment.** "New deployment" = new URL = broken waitlist. Always "Manage deployments → New version".
- **GSAP/ScrollTrigger/Lenis are only loaded on `index.html`.** Don't assume they're available on other pages.

---

## Open / placeholder items

- Footer links `Manifesto`, `Security`, `Status` all point to `#` — pages don't exist yet.
- Hiring pipeline: two open Intern roles on `careers.html` (Growth, Marketing). Applications go to `info@growthkitai.com` with subject `Internship — GrowthKit AI`.

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
