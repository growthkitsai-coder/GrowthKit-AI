# Billing — Stripe subscriptions

Single home for **paid subscriptions**: the three serverless functions, the Supabase `subscriptions` table, the server-side access gate, the frontend upgrade/manage buttons, and every Stripe/Vercel setup step. Added 2026-07-18.

> **Model in one line:** Stripe's *hosted* Checkout + Customer Portal collect the card (we never touch card data), a **webhook** is the source of truth, and it mirrors only the subscription *status* into Supabase. Access is decided **server-side** in `api/advise.js` — never trust the client.

## What paid access means today (the beta gate)

Access to paid product capabilities is decided by `checkAccess()` in [`lib/subscriptions.js`](../lib/subscriptions.js), in this order:

1. **Paid Pro or Agentic subscription** — an `active` or `trialing` row in the `subscriptions` table.
2. **Explicit open beta** — only when `GK_BETA_ENABLED` is not `0` and `GK_BETA_OPEN=1` exactly.
3. **Private beta allowlist** — while beta is enabled, a normalized email in the private `GK_BETA_EMAILS` value receives Pro-equivalent access. The parser accepts comma-, semicolon-, or newline-separated values plus a JSON string array, matching the ways a list is commonly pasted into Vercel. It checks the top-level Supabase user email and verified OAuth identity email locations, then trims and lowercases before exact matching. User-editable `user_metadata` is deliberately not trusted for entitlements. It never normalizes `+` aliases or performs partial matching.

Everything else is the **Free** tier and fails closed with **402** `{ code: "subscription_required" }` on generation, daily-intelligence, and integration endpoints. Free users may save onboarding and see the locked dashboard preview/specimen. Email matching trims and lowercases both sides. `GK_BETA_EXPIRES_AT` optionally sets a global ISO-8601 beta cutoff; invalid or elapsed configured values fail closed. **To halt all beta access immediately:** set `GK_BETA_ENABLED=0` and redeploy. Paid subscriptions continue to work.

Beta grants report as plan `pro` with a beta reason; beta is not a fourth tier. Pro, Agentic, and beta accounts share the same current product limits: one company, one initial full report, then daily briefs. When access ends, the completed full report remains readable through authenticated GET/report history, but report generation/retries, daily briefs, and integrations stop. See [`daily-intelligence.md`](daily-intelligence.md).

Authenticated `/api/account` responses distinguish `beta-disabled`, `beta-expired`, and `beta-email-mismatch` without returning any allowlist value. `/four` renders those reasons in its product-status line so an invitation/configuration problem is not hidden behind a generic Free-account message.

## Plans

Exactly three public tiers: **Free $0**, **Pro $30/month**, and **Agentic $200/month**. Free is not in Stripe. Pro defaults to Stripe price `price_1TuYYfIVRk8akpLyNoKcatRw` (override with `STRIPE_PRICE_PRO`); Agentic requires `STRIPE_PRICE_AGENTIC`. Checkout accepts only the server-side plan keys `pro|agentic` and maps them to those env-controlled prices—arbitrary client price IDs are rejected. Stripe subscription metadata and the webhook preserve the selected plan. Existing active subscribers are sent to the Customer Portal instead of creating a duplicate subscription.

## Files

```
package.json / package-lock.json   the repo's FIRST npm dependency: stripe ^18.5.0
                                    (static site otherwise stays build-free; Vercel installs on deploy)
lib/subscriptions.js               shared server helpers (outside api/ so it's not its own route):
                                     verifyUserToken · bearer · getSubscription · upsertSubscription · checkAccess
api/checkout.js    POST → creates a Stripe Checkout Session, returns { url }
api/portal.js      POST → creates a Stripe Billing Portal session, returns { url }
api/stripe-webhook.js  POST ← Stripe. Verifies signature (RAW body), mirrors status into Supabase. SOURCE OF TRUTH.
api/advise.js      now calls checkAccess() after verifying the user (server-side gate); kill switch re-enabled.
api/account.js     server-authoritative account/access/workspace summary for /four
billing.js         client glue on /pricing + /four: [data-gk-checkout], [data-gk-portal], [data-gk-billing]
```

`api/checkout.js` and `api/portal.js` verify the caller's Supabase access token, so the browser must send `Authorization: Bearer <token>` (billing.js pulls it from `window.GKAuth.client.auth.getSession()`).

## The `subscriptions` table — RUN THIS in Supabase

Supabase → **SQL Editor** → run. Written ONLY by the webhook via the `service_role` key; users may read their own row (RLS) but never write it.

```sql
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);
alter table public.subscriptions enable row level security;
-- Users can read their OWN subscription (for the /four billing UI). No client writes.
create policy "own subscription - select" on public.subscriptions
  for select using (auth.uid() = user_id);
```

The `service_role` key bypasses RLS, so the webhook can upsert any user's row without a policy. **Never** expose `service_role` to the browser or put it in `auth-config.js`.

## Env vars — set in the Vercel dashboard (NEVER in git; the repo is public)

| Var | Where | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Prod (+ Preview) | Stripe API calls (`sk_live_…` / `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Prod (+ Preview) | `whsec_…` signing secret from the webhook endpoint |
| `STRIPE_PRICE_PRO` | Prod (+ Preview) | Pro price id (optional — defaults to the known id) |
| `STRIPE_PRICE_AGENTIC` | Prod (+ Preview) | Agentic $200/month price id; required before Agentic checkout works |
| `SUPABASE_URL` | Prod | already set for auth; token verification + PostgREST base |
| `SUPABASE_ANON_KEY` | Prod | already set; verifies user access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod | **NEW** — server-only; lets the webhook write `subscriptions` |
| `SITE_URL` | Prod | optional canonical origin for redirects (else derived from Host) |
| `GK_BETA_ENABLED` | Prod | `0` immediately disables all free beta access; otherwise allowlist/open-beta checks may run |
| `GK_BETA_OPEN` | Prod | `1` explicitly opens free beta to every account; unset/other values fail closed |
| `GK_BETA_EMAILS` | Prod | private beta emails; comma/newline/semicolon lists or a JSON string array are accepted; normalize, deduplicate, and never commit this value |
| `GK_BETA_EXPIRES_AT` | Prod | optional ISO-8601 cutoff for all beta grants; invalid/past values fail closed |

## Stripe dashboard setup (one-time)

1. **Products + Prices:** keep the Pro monthly price (`price_1TuYYfIVRk8akpLyNoKcatRw`, or `STRIPE_PRICE_PRO`); create Agentic at $200/month and set `STRIPE_PRICE_AGENTIC`.
2. **Webhook endpoint:** Developers → Webhooks → Add endpoint → `https://growthkitai.com/api/stripe-webhook`. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
3. **Customer Portal:** activate cancel/update payment method **and plan switching between Pro and Agentic** so existing customers can change tiers without a duplicate subscription.
4. Set all env vars above, then **redeploy**.

## Flow

- **Subscribe:** `/pricing` or `/four` button (`data-gk-checkout data-gk-plan="pro|agentic"`) → `POST /api/checkout {plan}` (with token) → Stripe Checkout → success returns to `/four?checkout=success`, cancel to `/pricing`. Signed-out users are sent to `/signup`; the selected plan is preserved in session storage and resumed on `/four`.
- **Subscribe:** `/pricing` or `/four` button (`data-gk-checkout`) → `POST /api/checkout` (with token) → Stripe Checkout → success returns to `/four?checkout=success`, cancel to `/pricing`. Signed-out users are sent to `/signup` first. On `/four` there are **two** checkout entry points: the compact `[data-gk-billing]` status pill ("Go Pro →") and a **prominent `.four-pro` upgrade card** (added 2026-07-18, lower on the page) — both carry `data-gk-checkout`, so `billing.js`'s `wire(document)` hooks them automatically. The card links to `/pricing` for plan comparison and shows no hardcoded price (the Stripe Checkout page is the source of truth — note the marketed Basic/Premium vs single Stripe "Pro" mismatch flagged below). An inline script on `four.html` **hides the `.four-pro` card for active subscribers** by watching for the `.is-pro` class `billing.js` sets on the status pill.
- **Manage/cancel:** `/four` "Manage billing" (`data-gk-portal`) → `POST /api/portal` → Stripe Customer Portal → returns to `/four`.
- **Truth sync:** every subscription change → Stripe webhook → `upsertSubscription()` → `subscriptions` row. `api/advise.js` reads that row on every run.

## Gotchas

- **Raw body for the webhook.** `api/stripe-webhook.js` exports `config = { api: { bodyParser: false } }` and reads the raw stream — Stripe signs the exact bytes, so JSON-parsing first breaks verification. This is the #1 Stripe-on-Vercel bug.
- **user_id mapping.** Checkout stamps `client_reference_id` **and** `subscription_data.metadata.user_id`, so subscription events carry the Supabase user id. `invoice.payment_failed` re-retrieves the subscription to read that metadata.
- **`current_period_end` moved** in newer Stripe API versions (subscription → first item). The webhook reads both locations defensively; don't "simplify" it to one.
- **`node_modules` is gitignored.** Vercel installs from `package-lock.json` on deploy. Commit the lockfile, never the folder.
- **Access is server-side only.** `billing.js` toggling Upgrade vs Manage is cosmetic; the real gate is `checkAccess()` in `api/advise.js`.
