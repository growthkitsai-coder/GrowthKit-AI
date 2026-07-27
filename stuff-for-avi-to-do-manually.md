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
