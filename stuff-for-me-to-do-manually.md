# Stuff for me to do manually

> Everything in this file needs a dashboard or a terminal that only Avi has — a
> Supabase project, the Vercel project settings, or a `git push`. None of it can
> be done from inside the repo, which is why it is all still outstanding.

**Written 2026-07-27**, at the end of the Claude Code session that built the
`/beta` application page and rebuilt the `/admin` approvals console.

**Section order matters** — do 0 before 1, and 1 before 2. Sections 3 and 5 are
optional; 4 is how you confirm the whole thing actually works.

---

## 0. Push — nothing below is live until you do

- [ ] **`git push`**
      - As of writing there are **42 commits sitting unpushed** on `main`.
      - Pushing to `main` auto-deploys to growthkitai.com.
      - Until you do, `/beta` and `/admin` do not exist in production at all,
        and steps 1 and 2 below have nothing to act on.
      - This was left undone deliberately: pushing is opt-in in this repo, so
