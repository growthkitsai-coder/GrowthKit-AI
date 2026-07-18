'use strict';

/**
 * GrowthKit AI — server-side subscription + access helpers.
 *
 * Shared by the billing serverless functions (api/checkout, api/portal,
 * api/stripe-webhook) and the engine (api/advise). Lives OUTSIDE api/ so Vercel
 * does not turn it into its own HTTP route — the functions require() it and
 * Vercel bundles it in. Zero npm dependencies here (raw fetch against Supabase
 * PostgREST + Auth); the Stripe SDK is required directly by the api/ functions.
 *
 * ── Secrets (Vercel env vars — NEVER in git; the repo is public) ──
 *   SUPABASE_URL              also used by api/advise for token verification
 *   SUPABASE_ANON_KEY         public anon key — verifies user access tokens
 *   SUPABASE_SERVICE_ROLE_KEY server-only; BYPASSES Row-Level Security. Only ever
 *                             read inside these serverless functions, never sent
 *                             to the browser and never in auth-config.js.
 *
 * ── The `subscriptions` table (create it in Supabase — SQL in docs/billing.md) ──
 *   user_id (uuid, PK → auth.users), stripe_customer_id, stripe_subscription_id,
 *   plan, status, current_period_end, updated_at. Written ONLY here via the
 *   service_role key (the Stripe webhook is the source of truth); users can read
 *   their own row via RLS. Access is decided server-side — never trust the client.
 */

// Subscription statuses that unlock the product. Stripe reports many more
// (incomplete, unpaid, canceled…) — only these grant access.
const ACTIVE_STATUSES = ['active', 'trialing'];

function sbBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') : '';
}

/**
 * Verify a Supabase access token by asking Supabase who it belongs to.
 * Returns the user object ({ id, email, ... }) or null. Mirrors the check
 * already inlined in api/advise.js so both share one definition of "signed in".
 */
async function verifyUserToken(token) {
  const base = sbBase();
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon || !token) return null;
  try {
    const r = await fetch(base + '/auth/v1/user', {
      headers: { authorization: 'Bearer ' + token, apikey: anon }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (_) {
    return null;
  }
}

// Extract a Bearer token from a request's Authorization header.
function bearer(req) {
  const authz = (req.headers && req.headers['authorization']) || '';
  return authz.indexOf('Bearer ') === 0 ? authz.slice(7).trim() : '';
}

function adminHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    authorization: 'Bearer ' + key,
    'content-type': 'application/json'
  };
}

/** Read a user's subscription row via the service_role key (bypasses RLS). */
async function getSubscription(userId) {
  const base = sbBase();
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY || !userId) return null;
  try {
    const r = await fetch(
      base + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(userId) + '&select=*',
      { headers: adminHeaders() }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Upsert a subscription row (service_role → bypasses RLS). Keyed on user_id
 * (its primary key), so merge-duplicates makes this idempotent — safe to call
 * from every webhook event. `row` must include user_id.
 */
async function upsertSubscription(row) {
  const base = sbBase();
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY || !row || !row.user_id) return false;
  const payload = Object.assign({ updated_at: new Date().toISOString() }, row);
  try {
    const r = await fetch(base + '/rest/v1/subscriptions', {
      method: 'POST',
      headers: Object.assign({ prefer: 'resolution=merge-duplicates,return=minimal' }, adminHeaders()),
      body: JSON.stringify([payload])
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Decide whether a signed-in user may run the engine. Server-side only.
 *
 * Order:
 *   1. Free beta open to EVERYONE  — GK_BETA_OPEN is anything but "0" (the
 *      default while unset), so during the launch beta every signed-in user has
 *      Pro-equivalent access without paying.
 *   2. Beta allowlist              — once GK_BETA_OPEN=0, only the emails in
 *      GK_BETA_EMAILS (comma-separated) keep beta access.
 *   3. Paid Pro subscription       — an active/trialing row in `subscriptions`.
 *
 * Returns { allowed, plan, status, reason }.
 */
async function checkAccess(user) {
  const email = (user && user.email ? String(user.email) : '').toLowerCase();
  const userId = user && user.id;

  const betaOpen = process.env.GK_BETA_OPEN !== '0';
  if (betaOpen) {
    return { allowed: true, plan: 'beta', status: 'beta_open', reason: 'beta-open' };
  }

  const allowlist = (process.env.GK_BETA_EMAILS || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (email && allowlist.indexOf(email) !== -1) {
    return { allowed: true, plan: 'beta', status: 'beta_allowlist', reason: 'beta-allowlist' };
  }

  const sub = await getSubscription(userId);
  if (sub && ACTIVE_STATUSES.indexOf(sub.status) !== -1) {
    return { allowed: true, plan: sub.plan || 'pro', status: sub.status, reason: 'subscription' };
  }

  return {
    allowed: false,
    plan: sub ? (sub.plan || 'pro') : null,
    status: sub ? sub.status : 'none',
    reason: 'no-subscription'
  };
}

module.exports = {
  ACTIVE_STATUSES,
  verifyUserToken,
  bearer,
  getSubscription,
  upsertSubscription,
  checkAccess
};
