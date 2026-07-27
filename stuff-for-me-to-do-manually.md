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

## 3. `GK_BETA_EMAILS` — optional

Only needed if you want a **fixed invited cohort** to get Pro-equivalent access
without applying at all. Everyone else goes through `/beta` and your approval.

- [ ] Vercel → same project → add `GK_BETA_EMAILS` (Production), then redeploy.
- [ ] Format: comma-, semicolon-, or newline-separated, or a JSON string array.
      - Matching is exact on the **verified** email, lowercased and trimmed.
- [ ] **Never put this list in git.** This repo is public — it lives only in Vercel.

---

## 4. Verify it actually works, end to end

Use a **second, non-admin account** for the applicant half — your admin account
cannot meaningfully test the applicant view.

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
| `/beta` says "Applications are paused" | Step 1 not done — the table is missing |
| `/admin` says "This account is not an admin" | Step 2 not done, or not redeployed after |
| `/beta` or `/admin` 404s entirely | Step 0 not done — never pushed |
| Step 2 done but still "not an admin" | You set it on the empty duplicate Vercel project |
| Ditto, and the project is right | You pasted your email instead of your user id |

---

## 5. Supabase redirect allowlist — optional, only if it bothers you

Email/password sign-in started from `/beta` already returns to `/beta`, via the
`?next=` support added to `auth.js` this session. **Google/GitHub sign-in does
not** — it deliberately lands on `/four` instead.

That is not an oversight. OAuth `redirectTo` URLs must be registered in Supabase
→ Authentication → URL Configuration → Redirect URLs. Routing OAuth through an
arbitrary `?next=` path would break sign-in the moment that path is not listed,
so it stays pinned to a URL known to be allowlisted.

- [ ] *Only if you want OAuth to return to `/beta`:* add `https://growthkitai.com/beta`
      to that Redirect URLs list, then tell an agent to unpin `redirectTo`.
- [ ] Otherwise **ignore this whole section** — `/four` has a beta card that links
      straight back to `/beta`, so the round trip is one click either way.

---

## 6. Small things I mentioned in passing

- [ ] **Hard-refresh (Ctrl+Shift+R)** when checking the hero and problem-morph
      changes. That CSS is inline in `index.html`, so it only arrives with a
      fresh copy of the HTML — a soft reload can show you the old spacing.
- [ ] **Run one agent session at a time.** A parallel session (Codex, most likely)
      ran `git add -A` three separate times during this session and swept my
      half-finished files into its own commits (`8e92b85 "lol"` is one of them).
      Every file survived intact this time, but that is luck, not design — it is
      the exact collision `CLAUDE.md` warns about. Commit between tool switches.

---

## 7. Not yours — hand this to an agent

Listed here only so it does not get lost. This is a code fix, not a dashboard one.

- [ ] **The "Upgrade to Pro" button on `/four` does nothing when clicked.**
