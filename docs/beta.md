# Beta access — private allowlist plus applications and approvals

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for **who may use the beta and how they get in**. Update it whenever the grant rules, the approval flow, or the admin surface change.

**Status: updated 2026-07-26.** The private `GK_BETA_EMAILS` compatibility path works without the application-table migration; the application/approval path needs the deployment steps below.

## The model, in one paragraph

An exact normalized verified email in the private `GK_BETA_EMAILS` Vercel value receives unrestricted Pro-equivalent beta access. Everyone else may create a Free account and **apply**. Applying grants **nothing** — it writes a `pending` row. **Avi approves by hand** in `/admin.html`; approval starts a window that ends after **7 days or 7 full reports, whichever comes first**. When it ends, the account drops back to Free and must pay for Pro. There is no open-beta flag.

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
| `admin.html` | Internal approvals console (not public, not in sitemap) |
| `product.js` → `renderBeta()` + `four.html` `[data-beta]` | The applicant's card on `/four` |

## Grant states

`evaluateGrant()` in `lib/beta.js` recomputes the decision on **every request** rather than trusting the stored `status` column. Nothing sweeps the table on a timer, so a row can read `approved` while actually being expired — the stored status is a hint, the computed grant is the truth.

| Reason | Allowed | Meaning |
|---|---|---|
| `beta-allowlist` | ✓ | Exact verified email is privately allowlisted. Reports as plan `pro`, status `beta_allowlist`; no seven-report counter. |
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
- **`admin.html` being unlisted is not the security model.** Anyone may open it; without an admin account the API returns nothing. Hiding it only keeps it out of search results.
- **RLS lets a user read only their own row and write nothing.** Applying and approving both go through the service_role key server-side — if users could write, they could approve themselves.
- **Re-applying never resets a row**, so nobody can re-apply their way out of an expired or revoked grant.

## ⚠ Deployment steps

1. **Run the migration.** Supabase → SQL Editor → paste `supabase/migrations/202607240001_beta_applications.sql`. Until this exists, `checkAccess` returns `beta-unavailable` and **nobody has beta access** (paid subscribers are unaffected).
2. **Set `GK_ADMIN_USER_IDS`** on the Vercel project that serves growthkitai.com — your Supabase user UUID (Supabase → Authentication → Users → your row → copy the id). Comma-separated for several. **Then redeploy** — Vercel does not apply env changes to existing deployments. Until it is set, `/admin.html` shows "This account is not an admin" for everyone, including you.
3. Set `GK_BETA_EMAILS` in Production for the fixed invited cohort and redeploy. Comma-, semicolon-, or newline-separated text and a JSON string array are supported. Never put the list in git.

## Env vars

| Var | Where | Meaning |
|---|---|---|
| `GK_ADMIN_USER_IDS` | Prod | Supabase user UUIDs allowed to approve. Unset = nobody. **Required for the admin page.** |
| `GK_BETA_ENABLED` | Prod | `0` instantly disables all beta access regardless of approvals. |
| `GK_BETA_EXPIRES_AT` | Prod | Optional ISO-8601 cutoff ending every grant at once. Invalid or past values fail closed. |
| `GK_BETA_EMAILS` | Prod | Private fixed-cohort allowlist; exact normalized verified-email matching. Grants unrestricted Pro-equivalent beta access. |
| ~~`GK_BETA_OPEN`~~ | — | **Removed 2026-07-24.** No longer read. |

## Phase 2 — BUILT 2026-07-25

The database grant's **7-report counter is live**. `api/advise.js` calls `lib/beta.js` `consumeReport()` when a report completes only when `access.reason === 'beta-approved'`, so an allowlisted or paid generation never consumes that grant. A database-approved beta account is capped at **7 reports across 7 days** — one per UTC day, whichever limit hits first. The one-company lock is gone: each daily report can be a different company, and every past report is browsable. Full model: [`daily-intelligence.md`](daily-intelligence.md). The engine schema for it is `supabase/migrations/202607250001_daily_reports.sql` — **that migration must be run** for generation to work.

## The public waitlist is a different thing

`/waitlist` is an unauthenticated marketing page that writes to **Avi's Google Sheet** (see [`forms-and-data.md`](forms-and-data.md)). It is not this table, the server cannot read it, and being on it grants nothing. In-app applications from signed-in accounts are the only input to approvals. The Agentic "coming soon" card also points at `/waitlist`, so that list now mixes Agentic interest with general signups.
