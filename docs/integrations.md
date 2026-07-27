# Product integrations — Stripe, Google Analytics, LinkedIn

> Single home for the read-only data connections shown inside `/four`: OAuth, encrypted credential storage, provider configuration, metric collection, and dashboard/deployment setup. Daily consumption lives in [`daily-intelligence.md`](daily-intelligence.md).

## Security model

- Every list/connect/configure/disconnect request requires Pro, Agentic, or current beta-Pro access. The OAuth callback re-checks access before exchanging or saving a token, so an access lapse during provider consent fails closed.
- OAuth begins with an authenticated `POST /api/integrations {action:"connect"}`; the API returns the provider consent URL.
- OAuth state is HMAC-signed, contains the Supabase user id/provider/10-minute expiry, and is verified by `/api/integration-callback`.
- Access and refresh tokens are encrypted with **AES-256-GCM** using `GK_INTEGRATION_ENCRYPTION_KEY` before storage in `integration_connections`.
- The table has RLS enabled and **no browser policies**. `/api/integrations` returns only sanitized provider/config/status fields, never ciphertext or tokens.
- Connections are read-only. Disconnect deletes the server-side credential row.

## Stripe Connect

Purpose: yesterday's new customers (signup proxy), net paid-charge revenue, deleted-subscription churn, daily averages over the preceding seven complete days, and report-time seven-day totals for new customers, revenue, and subscription churn.

- OAuth: Stripe Connect Standard-account OAuth with `read_only` scope.
- Required: enable Connect on the GrowthKit Stripe platform, set the callback URL below, copy the Connect client id.
- API calls use the GrowthKit platform secret plus the connected `stripe_user_id` account context. Lists are capped at 300 objects per metric window; this is suitable for beta-scale companies, not high-volume enterprise accounting.
- Official reference: https://docs.stripe.com/connect/oauth-reference

Env: `STRIPE_CONNECT_CLIENT_ID`; existing `STRIPE_SECRET_KEY` is also required.

## Google Analytics 4

Purpose: yesterday's active users, sessions, new users, total revenue, seven-day daily averages, and report-time seven-day totals for active users, sessions, and new users.

- OAuth scope: `https://www.googleapis.com/auth/analytics.readonly`, offline access + refresh token.
- On callback, the Analytics Admin API lists available GA4 properties. The first is selected initially; `/four` offers a property selector.
- Reports use GA Data API `properties.runReport` for `yesterday` and `8daysAgo..2daysAgo`.
- Official references: https://developers.google.com/identity/protocols/oauth2/web-server · https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport · https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/accountSummaries/list

Env: `GOOGLE_ANALYTICS_CLIENT_ID`, `GOOGLE_ANALYTICS_CLIENT_SECRET`. Enable both Google Analytics Admin API and Google Analytics Data API in the owning Google Cloud project.

## LinkedIn

Purpose: organization follower growth, aggregate organic post impressions/clicks/likes/comments/shares, and the strongest recent post over the latest available seven-day window.

- OAuth: LinkedIn three-legged authorization-code flow.
- Default scopes: `rw_organization_admin r_organization_social`; override with `LINKEDIN_SCOPES` if LinkedIn exposes different approved scope names in the app.
- `/four` lists administrator Pages when the API returns them, and also permits an explicit numeric Page ID.
- Calls use versioned REST headers (`Linkedin-Version`, default `202606`; update via `LINKEDIN_VERSION`) and Rest.li protocol 2.0.
- **Approval blocker:** organization reporting and social-feed scopes are restricted. The OAuth code can ship, but real customers cannot grant those scopes until LinkedIn approves the app for the relevant Community Management access tier.
- Follower data can lag by roughly two days; the brief must not describe it as real-time.
- Recent posts are fetched with the Posts author finder; per-post organization statistics select the best performer using clicks + likes + weighted comments/shares. This is a ranking heuristic, not LinkedIn's own label.
- Official references: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow · https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api · https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics · https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics

Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`; optional `LINKEDIN_SCOPES`, `LINKEDIN_VERSION`.

## Report-time weekly snapshot

When a newly generated report reaches `capital_metrics`, `api/advise.js` calls `collectMetrics(user_id)` for **all configured connections** while the funding-landscape model call runs. This adds no fourth expansion model call: provider APIs are direct reads, and their values are attached to `weekly_metrics` only after Claude returns. The model never sees or rewrites first-party metrics.

The snapshot is bounded to 20 seconds so one slow provider cannot hold the serverless request open. Per-provider errors render as “Needs attention”; a whole-snapshot timeout renders a retry/reconnect message; only an actual empty configuration renders “No data connections were configured.” Historical reports retain the values captured at generation time and are not refreshed on view.

## Unconfigured providers are hidden

`publicConnections()` marks each provider `configured` from `providerConfigured()` — whether this deployment actually holds its OAuth credentials. `/four` renders only configured providers, so nobody clicks **Connect** and hits a 503; the connections nudge counts only those too. An **already connected** provider always reports `configured: true`, so an existing connection stays manageable and disconnectable even if a credential is later removed. This is what lets LinkedIn's code ship while its scopes await approval.

## Shared setup

**The apex host is canonical and `vercel.json` redirects `www` → `growthkitai.com` (added 2026-07-27).** OAuth callbacks must match the registered `redirect_uri` byte-for-byte, and `siteUrl()` falls back to the apex when `SITE_URL` is unset — so a consent flow started on `www` could never return. Keep that redirect first in the list, and keep `SITE_URL` on the apex.

Provider callback URL for all three integrations:

`https://growthkitai.com/api/integration-callback`

Also set:

- `GK_INTEGRATION_ENCRYPTION_KEY`: a long random secret; changing it invalidates every stored connection.
- `GK_OAUTH_STATE_SECRET`: a separate random secret recommended for OAuth state signing (falls back to the encryption secret if omitted).
- `SITE_URL=https://growthkitai.com` so callbacks/redirects never inherit the wrong `www` host.

After setting credentials, redeploy. Existing saved connections must be disconnected/reconnected if provider scopes, OAuth client mode, or the encryption key changes.
