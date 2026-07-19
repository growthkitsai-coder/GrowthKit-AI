# Product integrations — Stripe, Google Analytics, LinkedIn

> Single home for the read-only data connections shown inside `/four`: OAuth, encrypted credential storage, provider configuration, metric collection, and dashboard/deployment setup. Daily consumption lives in [`daily-intelligence.md`](daily-intelligence.md).

## Security model

- OAuth begins with an authenticated `POST /api/integrations {action:"connect"}`; the API returns the provider consent URL.
- OAuth state is HMAC-signed, contains the Supabase user id/provider/10-minute expiry, and is verified by `/api/integration-callback`.
- Access and refresh tokens are encrypted with **AES-256-GCM** using `GK_INTEGRATION_ENCRYPTION_KEY` before storage in `integration_connections`.
- The table has RLS enabled and **no browser policies**. `/api/integrations` returns only sanitized provider/config/status fields, never ciphertext or tokens.
- Connections are read-only. Disconnect deletes the server-side credential row.

## Stripe Connect

Purpose: yesterday's new customers (signup proxy), net paid-charge revenue, deleted-subscription churn, and daily averages over the preceding seven complete days (excluding yesterday).

- OAuth: Stripe Connect Standard-account OAuth with `read_only` scope.
- Required: enable Connect on the GrowthKit Stripe platform, set the callback URL below, copy the Connect client id.
- API calls use the GrowthKit platform secret plus the connected `stripe_user_id` account context. Lists are capped at 300 objects per metric window; this is suitable for beta-scale companies, not high-volume enterprise accounting.
- Official reference: https://docs.stripe.com/connect/oauth-reference

Env: `STRIPE_CONNECT_CLIENT_ID`; existing `STRIPE_SECRET_KEY` is also required.

## Google Analytics 4

Purpose: yesterday's active users, sessions, new users, total revenue, and seven-day daily averages.

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

## Shared setup

Provider callback URL for all three integrations:

`https://growthkitai.com/api/integration-callback`

Also set:

- `GK_INTEGRATION_ENCRYPTION_KEY`: a long random secret; changing it invalidates every stored connection.
- `GK_OAUTH_STATE_SECRET`: a separate random secret recommended for OAuth state signing (falls back to the encryption secret if omitted).
- `SITE_URL=https://growthkitai.com` so callbacks/redirects never inherit the wrong `www` host.

After setting credentials, redeploy. Existing saved connections must be disconnected/reconnected if provider scopes, OAuth client mode, or the encryption key changes.
