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
