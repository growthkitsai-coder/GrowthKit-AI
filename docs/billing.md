# Billing — Stripe subscriptions

Single home for **paid subscriptions**: the three serverless functions, the Supabase `subscriptions` table, the server-side access gate, the frontend upgrade/manage buttons, and every Stripe/Vercel setup step. Added 2026-07-18.

> **Model in one line:** Stripe's *hosted* Checkout + Customer Portal collect the card (we never touch card data), a **webhook** is the source of truth, and it mirrors only the subscription *status* into Supabase. Access is decided **server-side** in `api/advise.js` — never trust the client.

## What paid access means today (the beta gate)

Access to the product APIs is decided by `checkAccess()` in [`lib/subscriptions.js`](../lib/subscriptions.js), in this order:

1. **Paid Pro subscription** — an `active` or `trialing` row in the `subscriptions` table.
2. **Explicit open beta** — only when `GK_BETA_ENABLED` is not `0` and `GK_BETA_OPEN=1` exactly.
3. **Private beta allowlist** — while beta is enabled, a normalized email in the private, comma-separated `GK_BETA_EMAILS` value receives Pro-equivalent access.

Everything else fails closed with **402** `{ code: "subscription_required" }`; users may still create an account and buy Pro. Email matching trims and lowercases both sides. **To halt all free beta access immediately:** set `GK_BETA_ENABLED=0` and redeploy. Paid subscriptions continue to work.

Beta and paid accounts share the same product limits: one company, one initial full report, then daily briefs. See [`daily-intelligence.md`](daily-intelligence.md).

## Plans

**One paid plan today: "Pro" monthly**, Stripe price `price_1TuYYfIVRk8akpLyNoKcatRw` (override with the `STRIPE_PRICE_PRO` env var). The free Pilot tier is **not** in Stripe (invite-only from the waitlist).

> ⚠ **Pricing-page mismatch (open decision).** `pricing.html` still markets **two** paid tiers — Basic $30 and Premium Agentic $200 — but Stripe has only the single Pro price, so **both** "Get started" buttons currently start the *same* Pro subscription. Reconcile before charging real customers: either create real Basic + Premium Stripe prices (and wire each button with `data-gk-price="price_…"`), or collapse `pricing.html` to one Pro plan. `pricing.html` is the documented source of truth for prices (Product JSON-LD in its head) — keep it, the index FAQ, and Stripe in sync.

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
| `SUPABASE_URL` | Prod | already set for auth; token verification + PostgREST base |
| `SUPABASE_ANON_KEY` | Prod | already set; verifies user access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod | **NEW** — server-only; lets the webhook write `subscriptions` |
| `SITE_URL` | Prod | optional canonical origin for redirects (else derived from Host) |
| `GK_BETA_ENABLED` | Prod | `0` immediately disables all free beta access; otherwise allowlist/open-beta checks may run |
| `GK_BETA_OPEN` | Prod | `1` explicitly opens free beta to every account; unset/other values fail closed |
| `GK_BETA_EMAILS` | Prod | private comma-separated beta emails; normalize, deduplicate, and never commit this value |

## Stripe dashboard setup (one-time)

1. **Product + Price:** create the **Pro** product with a **monthly recurring** price → that's `price_1TuYYfIVRk8akpLyNoKcatRw` (or set `STRIPE_PRICE_PRO`).
2. **Webhook endpoint:** Developers → Webhooks → Add endpoint → `https://growthkitai.com/api/stripe-webhook`. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
3. **Customer Portal:** Settings → Billing → Customer portal → activate (allow cancel/update payment method) so `/api/portal` works.
4. Set all env vars above, then **redeploy**.

## Flow

- **Subscribe:** `/pricing` or `/four` button (`data-gk-checkout`) → `POST /api/checkout` (with token) → Stripe Checkout → success returns to `/four?checkout=success`, cancel to `/pricing`. Signed-out users are sent to `/signup` first. On `/four` there are **two** checkout entry points: the compact `[data-gk-billing]` status pill ("Go Pro →") and a **prominent `.four-pro` upgrade card** (added 2026-07-18, lower on the page) — both carry `data-gk-checkout`, so `billing.js`'s `wire(document)` hooks them automatically. The card links to `/pricing` for plan comparison and shows no hardcoded price (the Stripe Checkout page is the source of truth — note the marketed Basic/Premium vs single Stripe "Pro" mismatch flagged below). An inline script on `four.html` **hides the `.four-pro` card for active subscribers** by watching for the `.is-pro` class `billing.js` sets on the status pill.
- **Manage/cancel:** `/four` "Manage billing" (`data-gk-portal`) → `POST /api/portal` → Stripe Customer Portal → returns to `/four`.
- **Truth sync:** every subscription change → Stripe webhook → `upsertSubscription()` → `subscriptions` row. `api/advise.js` reads that row on every run.

## Gotchas

- **Raw body for the webhook.** `api/stripe-webhook.js` exports `config = { api: { bodyParser: false } }` and reads the raw stream — Stripe signs the exact bytes, so JSON-parsing first breaks verification. This is the #1 Stripe-on-Vercel bug.
- **user_id mapping.** Checkout stamps `client_reference_id` **and** `subscription_data.metadata.user_id`, so subscription events carry the Supabase user id. `invoice.payment_failed` re-retrieves the subscription to read that metadata.
- **`current_period_end` moved** in newer Stripe API versions (subscription → first item). The webhook reads both locations defensively; don't "simplify" it to one.
- **`node_modules` is gitignored.** Vercel installs from `package-lock.json` on deploy. Commit the lockfile, never the folder.
- **Access is server-side only.** `billing.js` toggling Upgrade vs Manage is cosmetic; the real gate is `checkAccess()` in `api/advise.js`.
