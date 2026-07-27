# Stuff for Avi to do manually

> Written 2026-07-27 by Claude Code, from one session's worth of loose ends.
> Everything here needs a human: I either couldn't do it, it's your call, or it
> lives outside this repo. **None of it is confirmed done.**

---

## 1 · Verify your commit email on GitHub

Commits are now authored as `avi-aggarwal14`. For GitHub to *link* them to your
profile — avatar, contribution graph — the address now in `git config user.email`
must be added and **verified** under Settings → Emails on that account.

I could not check this for you: the `gh` token lacks the `user` scope, and no
commit in this repo's history had used that address before today.

- [ ] Open <https://github.com/settings/emails> and confirm it's listed and verified
- [ ] If it isn't, verify it — or switch to the noreply form instead:
      `git config --global user.email "<id>+avi-aggarwal14@users.noreply.github.com"`
- [ ] Open any commit from today on github.com and check your avatar appears

**If it's wrong:** commits show a plain name with no avatar and never reach your
contribution graph. The history itself is fine — only the link to you is missing.

---

## 2 · Eyeball this session's three UI changes in a browser

I verified all three statically — geometry, selectors, syntax, the site checker —
but never opened a browser. Below is only what static checks genuinely cannot see.

### 2a · Positioning map on `/specimen` (section 03)

I moved four labels off neighbouring dots and computed every bounding box to
confirm zero overlaps. That model assumes **JetBrains Mono actually loaded** — on
a fallback mono the advance width changes and the labels can collide again.

- [ ] Scroll to "Competitor positioning" — no text sitting on a dot, light **and** dark
- [ ] The gap-box caption sits inside the dashed rectangle, not spilling past it

### 2b · Specimen overlay on `/four`

- [ ] "Preview the deliverable" opens the overlay
- [ ] It closes three ways: the ✕, clicking the backdrop, and Escape
- [ ] Escape works with the cursor **inside** the specimen — that path is wired separately,
      because key events don't bubble out of an iframe
- [ ] The page behind it doesn't scroll while it's open
- [ ] Dark mode: the overlay chrome and backdrop look right

### 2c · The new `/four` top-bar nav

- [ ] The five links sit sensibly beside your email and Sign out
- [ ] Drag the window through ~900px → 720px; that bar now carries more than it was built for
- [ ] Under 720px the nav disappears and the account controls stay
- [ ] The Beta link keeps its accent colour and live dot — a CSS specificity tie can strip it

---

## 3 · Shut down the parallel agent session

A second agent committed repeatedly throughout this session and **twice swept my
half-finished files into its own commits** with `git add -A`: `25c41bf "my voice"`
took `specimen.html`, and `8e92b85 "lol"` took `auth.css`.

Both landed intact — but that was luck, not safety. `CLAUDE.md` already says one
agent session at a time, and this is the exact collision that rule exists for.

- [ ] Close the other session before starting the next piece of work

---

## 4 · Push — mostly done already, and not by me

**Correction to what I told you during the session.** The parallel session pushed
`main` partway through, which swept my work along with it. **Every code change
from this session is already live on growthkitai.com** — the specimen label fix,
the `/four` specimen overlay, and the new top-bar nav. I said "nothing has been
pushed" more than once; that stopped being true without my noticing.

That reframes section 2: those are checks on the **live site**, not pre-flight
checks. Anything wrong up there is wrong in production right now.

13 commits remain unpushed and they are **documentation only** — `memory.md`,
`docs/*`, and this file. No code.

- [ ] Confirm it yourself: `git log --oneline origin/main..main`
- [ ] `git push` to land the docs

---

## 5 · A question you never answered

`scripts/check-site.mjs` enforces **footer** grids but not **topbars**, so nav
drift across the 13 subpages is invisible to CI. That's how the dead
"Customers → `/#proof`" link survived on four pages for weeks.

- [ ] Decide whether to add a topbar-parity check to the checker. I wrote the
      comparison logic already; it just needs porting in. Say the word.

---

## Raised during the session, already resolved — no action needed

Listed so you don't go chasing them: I flagged both and never heard back, but
they sorted themselves out.

- **`beta.html` footer divergence.** The checker went red mid-session over a
  missing `/beta` sitemap entry and a footer mismatch, both from the parallel
  session's new page. That session fixed them itself. Green at 19 pages now.
- **Your git identity.** Switched off `growthkitsai-coder` and onto
  `avi-aggarwal14`; the stale gh login is logged out and pushes authenticate
  correctly. **Only the email-verification bit in §1 is still outstanding.**
