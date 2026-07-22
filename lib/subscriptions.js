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
const PAID_PLANS = ['pro', 'agentic'];

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
 *   1. Paid Pro subscription       — an active/trialing row in `subscriptions`.
 *   2. Explicit open beta          — only when GK_BETA_OPEN=1.
 *   3. Beta allowlist              — while GK_BETA_ENABLED is not 0, emails in
 *      GK_BETA_EMAILS (comma-separated) receive Pro-equivalent access.
 *
 * Returns { allowed, plan, status, reason }.
 */
async function checkAccess(user) {
  const email = (user && user.email ? String(user.email) : '').trim().toLowerCase();
  const userId = user && user.id;

  const sub = await getSubscription(userId);
  if (sub && ACTIVE_STATUSES.indexOf(sub.status) !== -1) {
    const paidPlan = PAID_PLANS.indexOf(sub.plan) !== -1 ? sub.plan : 'pro';
    return { allowed: true, plan: paidPlan, status: sub.status, reason: 'subscription', expires_at: sub.current_period_end || null };
  }

  const betaEnabled = process.env.GK_BETA_ENABLED !== '0';
  const betaExpiry = process.env.GK_BETA_EXPIRES_AT || '';
  const betaExpiryMs = betaExpiry ? Date.parse(betaExpiry) : NaN;
  const betaCurrent = betaEnabled && (!betaExpiry || (!isNaN(betaExpiryMs) && Date.now() < betaExpiryMs));
  if (betaCurrent && process.env.GK_BETA_OPEN === '1') {
    return { allowed: true, plan: 'pro', status: 'beta_open', reason: 'beta-open', expires_at: betaExpiry || null };
  }
  const allowlist = (process.env.GK_BETA_EMAILS || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (betaCurrent && email && allowlist.indexOf(email) !== -1) {
    return { allowed: true, plan: 'pro', status: 'beta_allowlist', reason: 'beta-allowlist', expires_at: betaExpiry || null };
  }

  return {
    allowed: false,
    plan: 'free',
    status: sub ? sub.status : 'none',
    reason: betaEnabled && !betaCurrent ? 'beta-expired' : 'no-subscription',
    expires_at: null
  };
}

module.exports = {
  ACTIVE_STATUSES,
  PAID_PLANS,
  verifyUserToken,
  bearer,
  getSubscription,
  upsertSubscription,
  checkAccess
};
