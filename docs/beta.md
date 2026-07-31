# Beta access — private allowlist plus applications and approvals

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for **who may use the beta and how they get in**. Update it whenever the grant rules, the approval flow, or the admin surface change.

**Status: updated 2026-07-27.** The private `GK_BETA_EMAILS` compatibility path works without the application-table migration; the application/approval path needs the deployment steps below.

## The model, in one paragraph

An exact normalized verified email in the private `GK_BETA_EMAILS` Vercel value receives unrestricted Pro-equivalent beta access. Everyone else may create a Free account and **apply at [`/beta`](../beta.html)**. Applying grants **nothing** — it writes a `pending` row. **Avi approves by hand** at **`/admin`**; approval starts a window that ends after **7 days or 7 full reports, whichever comes first**. Since 2026-07-27 the full-report cadence is **2 per rolling 7 days**, so in practice a beta week yields **2 full reports** — the 7-report ceiling is now the looser of the two bounds. **Short daily updates never charge the grant** (see [`daily-intelligence.md`](daily-intelligence.md)), so a beta tester also gets one a day. When it ends, the account drops back to Free and must pay for Pro. There is no open-beta flag.

## Why both paths exist

The database workflow is the auditable, revocable, metered path for new applicants. The private env allowlist remains a founder-controlled compatibility path for a fixed invited cohort that must receive Pro-equivalent access without applying or consuming the seven-report grant. It is checked server-side, never returned or logged, and must never be committed.

## The pieces

| File | Role |
|---|---|
| `supabase/migrations/202607240001_beta_applications.sql` | The `beta_applications` table + RLS |
| `lib/beta.js` | Grant rules, approval/revocation, admin check. The brain. |
| `lib/subscriptions.js` → `checkAccess()` | Subscription first, then private allowlist, then database grant. The gate. |
| `api/beta.js` | `GET` own status · `POST` apply |
| `api/admin-beta.js` | `GET` list · `POST` approve/revoke — admin only |
| **`beta.html`** (`/beta`) | **The public application page — the only place anyone applies** |
| `admin.html` (`/admin`) | Internal approvals console (not public, not in sitemap) |
| `product.js` → `renderBeta()` + `four.html` `[data-beta]` | The applicant's status card on `/four` — **links to `/beta`, no longer contains a form** |

## Where people apply (rewritten 2026-07-27)

**`/beta` is the single application surface.** It is a fully public marketing page (indexed, in the sitemap, linked from every topbar and footer plus the homepage closing CTA); only its `#apply` card is account-aware, because `api/beta.js` requires a bearer token — an application is tied to a Supabase user id, which is the only reason approving one can grant anything.

The card renders whatever `GET /api/beta` reports, never a browser-side guess:

| Server reason | Card shows |
|---|---|
| *(no session)* | "First, a free account" → `/signup?next=%2Fbeta`, `/login?next=%2Fbeta` |
| `beta-not-applied` *(or unrecognised)* | The form |
| `beta-pending` | "Your application is in", and that re-applying does nothing |
| `beta-approved` | Live grant readout — reports left, days left, end date |
| `beta-expired` · `beta-reports-spent` · `beta-revoked` | "That's the beta" → upgrade to Pro |
| `beta-disabled` · `beta-unavailable` · HTTP 503 | "Applications are paused" → `/waitlist` |
| `subscription` · `beta-allowlist` | "You already have the product" → `/four` |

**The form's structured fields are packed into the existing `note` column.** `/beta` asks Company / Website / Stage / Goal and joins them as `Company: …\nWebsite: …\nStage: …\nGoal: …`; `admin.html` parses them back apart for display. This deliberately needs **no migration** — and because the parse falls through to the raw note when it doesn't match, every pre-2026-07-27 free-text application still renders.

**There used to be a second copy of the form inside `/four`.** It was removed (2026-07-27) — two copies drifted, and only one asked for the structured fields the approval console displays. `renderBeta()` now shows status plus a link to `/beta`.

**`?next=` support:** `auth.js` honours a `?next=/path` query on `/login` and `/signup` so an applicant returns to `/beta` after signing in. Only same-origin root-relative paths pass `safeNext()` — `//evil.com` and `/\evil.com` are rejected. **OAuth `redirectTo` and the email-confirmation `emailRedirectTo` deliberately ignore it** and stay pinned to `REDIRECT_AFTER_LOGIN`, because those URLs must appear in Supabase's allowed-redirect list; a Google sign-in from `/beta` therefore lands on `/four`, where the beta card links back.

## Grant states

`evaluateGrant()` in `lib/beta.js` recomputes the decision on **every request** rather than trusting the stored `status` column. Nothing sweeps the table on a timer, so a row can read `approved` while actually being expired — the stored status is a hint, the computed grant is the truth.

| Reason | Allowed | Meaning |
|---|---|---|
| `beta-allowlist` | ✓ | Exact verified email is privately allowlisted. Reports as plan `pro`, status `beta_allowlist`; no seven-report counter. |
| `beta-open` | ✓ | **`GK_BETA_OPEN=1` — any signed-in account, no application, no approval.** See the env-var table below; this bypasses the whole approval flow. |
| `beta-not-applied` | ✗ | No row. Show the apply form. |
| `beta-pending` | ✗ | Applied, waiting on Avi. |
| `beta-approved` | ✓ | Inside the window, reports remaining. Reports as plan `pro`, status `beta`. |
| `beta-expired` | ✗ | Past `expires_at`, or the global `GK_BETA_EXPIRES_AT` cutoff passed. |
| `beta-reports-spent` | ✗ | `reports_used >= reports_limit`. |
| `beta-revoked` | ✗ | Avi revoked it. Takes effect on the next request — nothing is cached. |
| `beta-disabled` | ✗ | `GK_BETA_ENABLED=0` — the global kill switch. |
| `beta-unavailable` | ✗ | Supabase unreachable or table missing. **Fails closed.** |

**A paid subscription is checked first and always wins.** The kill switch and global cutoff apply to both beta paths.

## Security decisions worth keeping

- **Admin authorisation is by Supabase user id**, matched against `GK_ADMIN_USER_IDS` — never by email (emails change, and anyone who can set an email must not be able to become an admin) and never by a URL secret (which leaks through history, screenshots, and shared links). It **fails closed**: unset env var means nobody is an admin.
- **`api/admin-beta.js` answers non-admins with `404`, not `403`.** A 403 confirms the endpoint exists and is worth attacking.
- **`admin.html` being unlisted is not the security model.** Anyone may open it; without an admin account the API returns nothing. Hiding it only keeps it out of search results. It was given the clean URL `/admin` on 2026-07-27 for exactly this reason — the path was never the secret. The `X-Robots-Tag` header on `/admin(.*)` in `vercel.json` covers the clean URL, which the page's own `<meta name="robots">` does not.
- **Applicant-supplied text is untrusted in the console.** Everything is escaped, and a `Website` value is only turned into a link when it parses as http(s) or a bare domain — `javascript:` and `data:` values render as inert text. Outbound links carry `rel="noopener noreferrer nofollow"`.
- **Bulk approve always confirms with a count.** It hands out product access, and re-approving an already-active grant silently restarts its window.
- **RLS lets a user read only their own row and write nothing.** Applying and approving both go through the service_role key server-side — if users could write, they could approve themselves.
- **Re-applying never resets a row**, so nobody can re-apply their way out of an expired or revoked grant.

## The approvals console (`/admin`, rebuilt 2026-07-27)

It fetches **every** application once (`GET /api/admin-beta?limit=500`) and does all filtering client-side, so the tab counts are honest rather than "however many the current filter returned", and switching tabs costs no request.

- **Five status tabs with live counts** — Pending · Active · Approved · Finished · All. **"Active" is the computed `active_now`**, not the stored `status` column; a row can read `approved` while actually being expired (nothing sweeps the table on a timer), and this tab shows who genuinely has access right now.
- **Search** over email and note (so company names are searchable), and **five sort orders**: newest applied, oldest applied, expiring soonest, most reports used, email A–Z.
- **A per-grant readout** on approved rows — a reports-used bar and a "Xd left" / "Xh left" window figure, ambering under 48 hours or with ≤2 reports remaining.
- **Structured fields**, parsed back out of the packed `note`: Company / Site / Stage on one line, the goal below as a quote. Unparseable (pre-2026-07-27) notes render verbatim.
- **Bulk approve** — row checkboxes, "select all shown", and a counted confirm. Approvals are issued sequentially with live progress, and the button reports how many failed.

## ⚠ Deployment steps

**Neither `/beta` nor `/admin` works until steps 1 and 2 are done.** Both are already deployed as pages; without the table `/beta` shows "Applications are paused" and `/admin` shows "This account is not an admin".

1. **Run the migration.** Supabase → SQL Editor → paste `supabase/migrations/202607240001_beta_applications.sql` → Run. Until this exists, `checkAccess` returns `beta-unavailable`, `POST /api/beta` answers 503, and **nobody has beta access** (paid subscribers are unaffected).
2. **Set `GK_ADMIN_USER_IDS`** on the Vercel project that serves growthkitai.com — your Supabase user UUID (Supabase → Authentication → Users → your row → copy the id, **not** the email). Comma-separated for several. **Then redeploy** — Vercel does not apply env changes to existing deployments. Until it is set, `/admin` shows "This account is not an admin" for everyone, including you.
3. Set `GK_BETA_EMAILS` in Production for the fixed invited cohort and redeploy. Comma-, semicolon-, or newline-separated text and a JSON string array are supported. Never put the list in git.

**How to verify it worked**, in order: open `/beta` signed out → the card should offer "Create free account". Sign in with a non-admin test account → the form should render. Submit it → the card should flip to "Your application is in". Open `/admin` as your admin account → that application should appear under **Pending** with its Company / Site / Stage parsed out. Approve it → the row moves to **Active** with a `7 / 7 reports` and `7d left` readout, and `/beta` on the test account now reads "You're in".

## Env vars

| Var | Where | Meaning |
|---|---|---|
| `GK_ADMIN_USER_IDS` | Prod | Supabase user UUIDs allowed to approve. Unset = nobody. **Required for the admin page.** |
| `GK_BETA_ENABLED` | Prod | `0` instantly disables all beta access regardless of approvals. |
| `GK_BETA_EXPIRES_AT` | Prod | Optional ISO-8601 cutoff ending every grant at once. Invalid or past values fail closed. |
| `GK_BETA_EMAILS` | Prod | Private fixed-cohort allowlist; exact normalized verified-email matching. Grants unrestricted Pro-equivalent beta access. |
| `GK_BETA_OPEN` | Prod | **⚠ LIVE AGAIN — this doc was wrong.** `=1` grants **every signed-in account** Pro-equivalent access with **no application and no approval** (`reason: 'beta-open'`). Removed 2026-07-24, **restored 2026-07-26** per Avi, and read today at `lib/subscriptions.js:242`. Three doc entries still claimed "no longer read" until 2026-07-27. **If it is set, `/beta` is decorative** — nobody needs to apply. Unset it to return to approval-gated beta. It is checked *after* the allowlist and *before* the database grant, and `GK_BETA_ENABLED=0` still overrides it. **Not covered by any test.** |

## Phase 2 — BUILT 2026-07-25

The database grant's **7-report counter is live**. `api/advise.js` calls `lib/beta.js` `consumeReport()` when a report completes only when `access.reason === 'beta-approved'`, so an allowlisted or paid generation never consumes that grant. A database-approved beta account is capped at **7 reports across 7 days** — one per UTC day, whichever limit hits first. The one-company lock is gone: each daily report can be a different company, and every past report is browsable. Full model: [`daily-intelligence.md`](daily-intelligence.md). The engine schema for it is `supabase/migrations/202607250001_daily_reports.sql` — **that migration must be run** for generation to work.

## The public waitlist is a different thing

`/waitlist` is an unauthenticated marketing page that writes to **Avi's Google Sheet** (see [`forms-and-data.md`](forms-and-data.md)). It is not this table, the server cannot read it, and being on it grants nothing. Applications from signed-in accounts at `/beta` are the only input to approvals. The Agentic "coming soon" card also points at `/waitlist`, so that list now mixes Agentic interest with general signups.

**Both links now sit in the same footer column**, so keep the distinction sharp in copy: "Join waitlist" = hear about launches; "Apply for beta" = ask for product access. `/beta`'s FAQ answers this explicitly — don't let the two pages start describing each other's job.
