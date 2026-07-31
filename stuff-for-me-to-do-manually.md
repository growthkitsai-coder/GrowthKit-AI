# Stuff for me to do manually

> Everything in this file needs a human. Either it lives outside the repo — a
> Supabase project, the Vercel dashboard, GitHub settings — or it needs a pair of
> eyes on a real browser, or it is a call only Avi can make.
>
> **Nothing here is confirmed done.**

**Merged 2026-07-27** from two files written by two parallel Claude Code sessions
(`stuff-for-me-to-do-manually.md` and `stuff-for-avi-to-do-manually.md`). One
session built the `/beta` application page and rebuilt the `/admin` console; the
other did the specimen positioning-map fix, the `/four` specimen overlay, and the
`/four` top-bar nav. Both lists are preserved below, in urgency order.

**Start at §1.** Sections 1 and 2 are about five minutes of dashboard work
between them, and the entire beta flow is dead until both are finished.

**All code is already deployed.** `origin/main` is fully pushed and Vercel ships
on push, so everything described here is live on growthkitai.com right now.
Section 5 is therefore a check on production, not a pre-flight check.

---

## 1. Run the Supabase migration — 🔴 BLOCKING

Without this the `beta_applications` table does not exist, so `checkAccess()`
returns `beta-unavailable`, `POST /api/beta` answers 503, and **nobody can apply
or be approved**. Paid Pro subscribers are unaffected by this one.

- [ ] Open **Supabase → your project → SQL Editor**.
- [ ] Paste the entire contents of `supabase/migrations/202607240001_beta_applications.sql`.
- [ ] Run it. It is idempotent (`create table if not exists`), so re-running is safe.
- [ ] Confirm: **Table Editor** should now list `beta_applications`.

⚠️ Separate but related: `202607250001_daily_reports.sql` is a **different**
outstanding migration (it powers report generation, not beta access). If report
generation is also failing, check `memory.md` — that one has its own open item.

---

## 2. Set `GK_ADMIN_USER_IDS` in Vercel — 🔴 BLOCKING

The admin check **fails closed**: an unset variable means nobody is an admin. So
until this is set, `/admin` shows "This account is not an admin" to everyone —
including you — and `GET /api/admin-beta` answers 404 to every caller.

- [ ] **Supabase → Authentication → Users → your row → copy the `id`** (a UUID).
      - **Not the email.** The check is by user id on purpose: emails can be
        changed, and anyone who can set an email must not be able to become an
        admin. Pasting an email here silently grants nobody anything.
- [ ] **Vercel → the project serving growthkitai.com → Settings → Environment Variables.**
- [ ] Add `GK_ADMIN_USER_IDS` = that UUID, scoped to **Production**.
      - Comma-separated if you ever want more than one admin.
- [ ] **Redeploy.** Vercel does not apply env changes to deployments that already exist.

⚠️ **The two-projects trap.** This account has a second, empty Vercel project
with no domains attached. `ANTHROPIC_API_KEY` was once added to that one instead
of the live one, and the engine 503'd for days before anyone spotted it. Confirm
the project you are editing has **growthkitai.com attached** before saving.
See `docs/infrastructure.md` for the full write-up of that incident.

---

## 2b. Check whether `GK_BETA_OPEN` is set — it makes `/beta` pointless

**This is why your test run walked straight into the product with no application.**

`GK_BETA_OPEN=1` grants **every signed-in account** Pro-equivalent access, with no
application and no approval (`lib/subscriptions.js:242`). If it is set, the whole
`/beta` → apply → approve flow is decoration.

Three doc entries claimed this variable had been "removed, no longer read" — they
were wrong and are now corrected. It was removed 2026-07-24 and **restored
2026-07-26**, apparently at your request.

- [ ] **Vercel → Settings → Environment Variables → look for `GK_BETA_OPEN`.**
- [ ] Decide which beta you actually want:
      - **Open beta** — leave it at `1`. Anyone who signs up gets in. `/beta` will
        now correctly tell them they already have access rather than showing a
        form. §1 and §2 stop being urgent.
      - **Approval-gated beta** — **delete the variable (or set it to anything
        other than `1`) and redeploy.** Then §1–§3 matter and the flow works as
        designed.
- [ ] Either way, also check whether your own email sits in `GK_BETA_EMAILS` —
      that grants *you specifically* access and would mask the difference while
      testing.

**How to tell them apart without opening Vercel:** sign up with a brand-new email
that is definitely not on the allowlist. If it walks straight in → `GK_BETA_OPEN=1`.
If it is blocked → the allowlist was letting *your* account through.

---

## 3. Verify the beta works, end to end

Do this straight after §1 and §2. Use a **second, non-admin account** for the
applicant half — your admin account cannot meaningfully test the applicant view.

- [ ] Open `/beta` **signed out** → the card should offer "Create free account".
- [ ] Sign in on the test account → the **form** should render (Company / Website / Stage / Goal).
- [ ] Submit it → the card should flip to "Your application is in".
- [ ] Open `/admin` as your **admin** account → the application appears under **Pending**.
      - Its Company / Site / Stage should be **parsed out onto their own line**,
        with the goal underneath as a quote. If you see one raw blob of text
        instead, the note packing and the parser have drifted apart.
- [ ] Approve it → the row moves to **Active** with a `0 / 7` reports bar and `7d left`.
- [ ] Back on the test account, `/beta` should now read "You're in".
- [ ] `/four` on that account should agree — the beta card shows the live grant.

**If something is wrong, the symptom tells you which step you missed:**

| What you see | What it means |
|---|---|
| `/beta` says "Applications are paused" | §1 not done — the table is missing |
| `/admin` says "This account is not an admin" | §2 not done, or not redeployed after |
| §2 done but still "not an admin" | You set it on the empty duplicate Vercel project |
| Ditto, and the project is right | You pasted your email instead of your user id |

---

## 4. Verify your commit email on GitHub

Commits are now authored as `avi-aggarwal14`. For GitHub to *link* them to your
profile — avatar, contribution graph — the address in `git config user.email`
must be added and **verified** under Settings → Emails on that account.

This could not be checked for you: the `gh` token lacks the `user` scope, and no
commit in this repo's history had used that address before today.

- [ ] Open <https://github.com/settings/emails> and confirm it's listed and verified.
- [ ] If it isn't, verify it — or switch to the noreply form instead:
      `git config --global user.email "<id>+avi-aggarwal14@users.noreply.github.com"`
- [ ] Open any commit from today on github.com and check your avatar appears.

**If it's wrong:** commits show a plain name with no avatar and never reach your
contribution graph. The history itself is fine — only the link to you is missing.

---

## 5. Eyeball the UI changes on the live site

All of these were verified statically — geometry, selectors, syntax, the site
checker — but **nobody opened a browser**. Below is only what static checks
genuinely cannot see. Everything here is already in production.

- [ ] **Hard-refresh (Ctrl+Shift+R) first.** All this CSS is inline in the page's
      `<head>`, so it only arrives with a fresh copy of the HTML — a soft reload
      can show you the old version and send you chasing a fixed bug.

### 5a · Positioning map on `/specimen` (section 03)

Four labels were moved off neighbouring dots, with every bounding box computed to
confirm zero overlaps. That model assumes **JetBrains Mono actually loaded** — on
a fallback mono the advance width changes and the labels can collide again.

- [ ] Scroll to "Competitor positioning" — no text sitting on a dot, light **and** dark.
- [ ] The gap-box caption sits inside the dashed rectangle, not spilling past it.

### 5b · Specimen overlay on `/four`

- [ ] "Preview the deliverable" opens the overlay.
- [ ] It closes three ways: the ✕, clicking the backdrop, and Escape.
- [ ] Escape works with the cursor **inside** the specimen — that path is wired
      separately, because key events don't bubble out of an iframe.
- [ ] The page behind it doesn't scroll while it's open.
- [ ] Dark mode: the overlay chrome and backdrop look right.

### 5c · The `/four` top-bar nav

- [ ] The five links sit sensibly beside your email and Sign out.
- [ ] Drag the window through ~900px → 720px; that bar now carries more than it
      was originally built for.
- [ ] Under 720px the nav disappears and the account controls stay.
- [ ] The Beta link keeps its accent colour and live dot — a CSS specificity tie
      can strip it.

### 5d · The homepage hero and the problem morph

Both were re-sized to cap on viewport **height**, not just width, so they fit on
a short laptop screen. The fit was calculated at six viewport sizes, not observed.

- [ ] The hero fits without scrolling — you can see the Sign up / Log in row.
- [ ] Scroll into "01 The problem" — the intro lede is **fully visible**, not cut
      off mid-sentence. That was the original bug.
- [ ] All four numbered problem cards show their body text and the `↳` line.
- [ ] On a tall monitor it should look unchanged from before.

---

## 6. The "Become a client" form is dead on the live site

`onboarding.html` has `var SCRIPT_URL = '';` — empty. So the form renders, a
founder fills it in, hits submit, and gets **"Form is not configured yet"**.
It is linked as **"Become a client"** from the footer of all 13 marketing pages.

- [ ] Deploy `onboarding-apps-script.gs` as a Google Apps Script **web app**
      (Deploy → New deployment → Web app → execute as you, access "Anyone").
- [ ] Paste the resulting `/exec` URL into `SCRIPT_URL` in `onboarding.html`.
      - Note this is a **separate** script from the waitlist one, which does work.
      - Gotcha: this form's honeypot field is `fax`, not `company`. See
        `docs/forms-and-data.md` before touching the script.

---

## 7. Run one agent session at a time

A second agent session committed repeatedly throughout the day and **three times
swept another session's half-finished files into its own commits** with
`git add -A`: `25c41bf "my voice"` took `specimen.html`, `8e92b85 "lol"` took
`auth.css` and `auth.js`, and a later collision cost a commit to a `.git/index.lock`
clash.

Everything landed intact — but that was luck, not safety. `CLAUDE.md` already
says one agent session at a time, and this is the exact collision that rule
exists for. It also produced the duplicate file this one was merged from.

- [ ] Close the other session before starting the next piece of work.
- [ ] Commit before switching between Claude Code and Cowork.

---

## 8. Optional — `GK_BETA_EMAILS`

Only needed if you want a **fixed invited cohort** to get Pro-equivalent access
without applying at all. Everyone else goes through `/beta` and your approval.

- [ ] Vercel → same project → add `GK_BETA_EMAILS` (Production), then redeploy.
- [ ] Format: comma-, semicolon-, or newline-separated, or a JSON string array.
      - Matching is exact on the **verified** email, lowercased and trimmed.
- [ ] **Never put this list in git.** This repo is public — it lives only in Vercel.

---

## 9. Optional — Supabase redirect allowlist

Email/password sign-in started from `/beta` already returns to `/beta`, via the
`?next=` support added to `auth.js`. **Google/GitHub sign-in does not** — it
deliberately lands on `/four` instead.

That is not an oversight. OAuth `redirectTo` URLs must be registered in Supabase
→ Authentication → URL Configuration → Redirect URLs. Routing OAuth through an
arbitrary `?next=` path would break sign-in the moment that path is not listed,
so it stays pinned to a URL known to be allowlisted.

- [ ] *Only if you want OAuth to return to `/beta`:* add `https://growthkitai.com/beta`
      to that Redirect URLs list, then tell an agent to unpin `redirectTo`.
- [ ] Otherwise **ignore this** — `/four` has a beta card that links straight back
      to `/beta`, so the round trip is one click either way.

---

## 10. A decision for you — topbar parity in the checker

`scripts/check-site.mjs` enforces **footer** grids but not **topbars**, so nav
drift across the 13 subpages is invisible to CI. That is how the dead
"Customers → `/#proof`" link survived on four pages for weeks.

The risk is live again: a `/beta` link was just added to all 13 topbars by hand.

- [ ] Decide whether to add a topbar-parity check. The comparison logic is already
      written and just needs porting in — say the word.

---

## Already done — no action needed

Listed so you don't go chasing them.

- **Push.** Everything is on `origin/main` and deployed. Both original files said
  "nothing has been pushed"; that stopped being true mid-session without either
  session noticing. Verified: `git log --oneline origin/main..main` is empty.
- **Your git identity.** Switched off `growthkitsai-coder` and onto
  `avi-aggarwal14`; the stale `gh` login is logged out and pushes authenticate
  correctly. **Only the email verification in §4 is still outstanding.**
- **The dead "Upgrade to Pro" button on `/four`.** `product.js` called
  `window.GKBilling.wire(...)`, which `billing.js` never exported, so an `&&`
  guard swallowed it and the button did nothing. **Fixed** — `wire` is now
  exported. Worth including in the §3 walkthrough if you get a grant to expire.
- **`beta.html` footer/sitemap divergence.** The checker went red mid-session over
  a missing `/beta` sitemap entry and a footer mismatch. Both fixed; green at 19
  pages.
- **CI wasn't running the tests.** 54 tests over access control and beta grants
  existed and nothing enforced them on push. Now wired into `site-checks.yml`.
  Note CI still does **not** gate deploys — a red ✗ is a notification, not a barrier.
