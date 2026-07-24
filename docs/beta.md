# Beta access — applications, approvals, and the 7-day grant

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for **who may use the beta and how they get in**. Update it whenever the grant rules, the approval flow, or the admin surface change.

**Status: built 2026-07-24 (Phase 1).** Replaces the `GK_BETA_EMAILS` env-var allowlist. **Not live until Avi completes the two deployment steps below.**

## The model, in one paragraph

Anyone may create a Free account and **apply**. Applying grants **nothing** — it writes a `pending` row. **Avi approves by hand** in `/admin.html`. Approval starts a window that ends after **7 days or 7 full reports, whichever comes first**. When it ends, the account drops back to Free and must pay for Pro. Nobody gets beta access any other way: there is no env allowlist and no open-beta flag any more.

## Why this replaced the env var

Approving someone used to mean editing `GK_BETA_EMAILS` in Vercel and redeploying. That made approval slow, unauditable, impossible to revoke quickly, and impossible to meter — there was nowhere to count reports. It was also a **second door**: anyone whose email landed in that string was in, regardless of whether they had ever applied. The requirement (Avi, 2026-07-24) is that *only* explicitly approved people can use the beta, so the env allowlist and the `GK_BETA_OPEN` everyone-gets-in flag were both **deleted**, not merely bypassed.

## The pieces

| File | Role |
|---|---|
| `supabase/migrations/202607240001_beta_applications.sql` | The `beta_applications` table + RLS |
| `lib/beta.js` | Grant rules, approval/revocation, admin check. The brain. |
| `lib/subscriptions.js` → `checkAccess()` | Subscription first, then beta grant. The gate. |
| `api/beta.js` | `GET` own status · `POST` apply |
| `api/admin-beta.js` | `GET` list · `POST` approve/revoke — admin only |
| `admin.html` | Internal approvals console (not public, not in sitemap) |
| `product.js` → `renderBeta()` + `four.html` `[data-beta]` | The applicant's card on `/four` |

## Grant states

`evaluateGrant()` in `lib/beta.js` recomputes the decision on **every request** rather than trusting the stored `status` column. Nothing sweeps the table on a timer, so a row can read `approved` while actually being expired — the stored status is a hint, the computed grant is the truth.

| Reason | Allowed | Meaning |
|---|---|---|
| `beta-not-applied` | ✗ | No row. Show the apply form. |
| `beta-pending` | ✗ | Applied, waiting on Avi. |
| `beta-approved` | ✓ | Inside the window, reports remaining. Reports as plan `pro`, status `beta`. |
| `beta-expired` | ✗ | Past `expires_at`, or the global `GK_BETA_EXPIRES_AT` cutoff passed. |
| `beta-reports-spent` | ✗ | `reports_used >= reports_limit`. |
| `beta-revoked` | ✗ | Avi revoked it. Takes effect on the next request — nothing is cached. |
| `beta-disabled` | ✗ | `GK_BETA_ENABLED=0` — the global kill switch. |
| `beta-unavailable` | ✗ | Supabase unreachable or table missing. **Fails closed.** |

**A paid subscription is checked first and always wins.** A paying customer can never be locked out by a beta grant expiring, being revoked, or the beta being switched off entirely.

## Security decisions worth keeping

- **Admin authorisation is by Supabase user id**, matched against `GK_ADMIN_USER_IDS` — never by email (emails change, and anyone who can set an email must not be able to become an admin) and never by a URL secret (which leaks through history, screenshots, and shared links). It **fails closed**: unset env var means nobody is an admin.
- **`api/admin-beta.js` answers non-admins with `404`, not `403`.** A 403 confirms the endpoint exists and is worth attacking.
- **`admin.html` being unlisted is not the security model.** Anyone may open it; without an admin account the API returns nothing. Hiding it only keeps it out of search results.
- **RLS lets a user read only their own row and write nothing.** Applying and approving both go through the service_role key server-side — if users could write, they could approve themselves.
- **Re-applying never resets a row**, so nobody can re-apply their way out of an expired or revoked grant.

## ⚠ Deployment steps — the feature is inert until these are done

1. **Run the migration.** Supabase → SQL Editor → paste `supabase/migrations/202607240001_beta_applications.sql`. Until this exists, `checkAccess` returns `beta-unavailable` and **nobody has beta access** (paid subscribers are unaffected).
2. **Set `GK_ADMIN_USER_IDS`** on the Vercel project that serves growthkitai.com — your Supabase user UUID (Supabase → Authentication → Users → your row → copy the id). Comma-separated for several. **Then redeploy** — Vercel does not apply env changes to existing deployments. Until it is set, `/admin.html` shows "This account is not an admin" for everyone, including you.
3. Optionally remove the now-unused `GK_BETA_EMAILS` and `GK_BETA_OPEN` env vars. Nothing reads them any more.

## Env vars

| Var | Where | Meaning |
|---|---|---|
| `GK_ADMIN_USER_IDS` | Prod | Supabase user UUIDs allowed to approve. Unset = nobody. **Required for the admin page.** |
| `GK_BETA_ENABLED` | Prod | `0` instantly disables all beta access regardless of approvals. |
| `GK_BETA_EXPIRES_AT` | Prod | Optional ISO-8601 cutoff ending every grant at once. Invalid or past values fail closed. |
| ~~`GK_BETA_EMAILS`~~ | — | **Removed 2026-07-24.** No longer read. |
| ~~`GK_BETA_OPEN`~~ | — | **Removed 2026-07-24.** No longer read. |

## Not yet built (Phase 2)

The grant counts **7 reports**, but `lib/beta.js` `consumeReport()` is **not yet called by the engine** — `api/advise.js` still enforces the old one-company-one-report contract, so in practice the 7-day limit binds first and the report counter stays at 0. Wiring `consumeReport()` into report generation, and moving from one-locked-company to **one report a day on any company**, is the next phase (Avi's decision, 2026-07-24). See [`daily-intelligence.md`](daily-intelligence.md) for the contract that has to change.

## The public waitlist is a different thing

`/waitlist` is an unauthenticated marketing page that writes to **Avi's Google Sheet** (see [`forms-and-data.md`](forms-and-data.md)). It is not this table, the server cannot read it, and being on it grants nothing. In-app applications from signed-in accounts are the only input to approvals. The Agentic "coming soon" card also points at `/waitlist`, so that list now mixes Agentic interest with general signups.
