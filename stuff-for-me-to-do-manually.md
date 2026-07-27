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
        that you can bundle commits rather than have each one trigger a deploy.

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
