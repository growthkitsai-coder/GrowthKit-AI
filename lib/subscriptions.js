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

const beta = require('./beta');

// Subscription statuses that unlock the product. Stripe reports many more
// (incomplete, unpaid, canceled…) — only these grant access.
const ACTIVE_STATUSES = ['active', 'trialing'];
const PAID_PLANS = ['pro', 'agentic'];

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[\s"'[<]+|[\s"'\]>]+$/g, '');
}

/**
 * Supabase normally exposes `user.email`, but some OAuth identities keep the
 * usable address in provider metadata. Used when recording an application, so
 * the admin list shows something readable. Deliberately ignores user-editable
 * `user_metadata` — that was never trusted as an entitlement source, and now
 * entitlement keys off the user id anyway.
 */
function primaryEmail(user) {
  const direct = normalizeEmail(user && user.email);
  if (direct) return direct;
  const identities = user && Array.isArray(user.identities) ? user.identities : [];
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    const email = normalizeEmail(id && id.identity_data && id.identity_data.email);
    if (email) return email;
  }
  return '';
}

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
 *   1. Paid Pro/Agentic subscription — an active/trialing row in `subscriptions`.
 *      Checked FIRST so a paying customer can never be locked out by a beta
 *      grant expiring, being revoked, or the beta system being switched off.
 *   2. Approved beta grant           — a row in `beta_applications` that Avi has
 *      approved and that is still inside its 7-day / 7-report window.
 *
 * Rewritten 2026-07-24 (Avi's decision): approval now lives in the database, not
 * in the GK_BETA_EMAILS env var. The env allowlist and the GK_BETA_OPEN
 * everyone-gets-in flag were REMOVED on purpose — the requirement is that only
 * people Avi has explicitly approved can use the beta, and a second door in an
 * env var (or a flag that opens the door to the whole internet) contradicts
 * that. GK_BETA_ENABLED=0 survives as a global kill switch, and
 * GK_BETA_EXPIRES_AT as a global cutoff for every grant at once.
 *
 * Fails CLOSED at every step: if Supabase is unreachable or the table is missing,
 * nobody gets beta access.
 *
 * Returns { allowed, plan, status, reason, expires_at, beta }.
 */
async function checkAccess(user) {
  const userId = user && user.id;

  const sub = await getSubscription(userId);
  if (sub && ACTIVE_STATUSES.indexOf(sub.status) !== -1) {
    const paidPlan = PAID_PLANS.indexOf(sub.plan) !== -1 ? sub.plan : 'pro';
    return {
      allowed: true,
      plan: paidPlan,
      status: sub.status,
      reason: 'subscription',
      expires_at: sub.current_period_end || null,
      beta: null
    };
  }

  const denied = function (reason, betaInfo) {
    return {
      allowed: false,
      plan: 'free',
      status: sub ? sub.status : 'none',
      reason: reason,
      expires_at: null,
      beta: betaInfo || null
    };
  };

  if (process.env.GK_BETA_ENABLED === '0') return denied('beta-disabled');

  // Optional global cutoff — ends every grant at once regardless of its own row.
  const betaExpiry = process.env.GK_BETA_EXPIRES_AT || '';
  if (betaExpiry) {
    const cutoffMs = Date.parse(betaExpiry);
    if (isNaN(cutoffMs) || Date.now() >= cutoffMs) return denied('beta-expired');
  }

  if (!userId || !beta.configured()) return denied('beta-unavailable');

  const found = await beta.getApplication(userId);
  if (!found.ok) return denied('beta-unavailable');

  const grant = beta.evaluateGrant(found.application);
  const info = beta.publicView(found.application);
  if (grant.active) {
    return {
      allowed: true,
      plan: 'pro',
      status: 'beta',
      reason: 'beta-approved',
      expires_at: grant.expires_at,
      beta: info
    };
  }

  return denied(grant.reason, info);
}

module.exports = {
  ACTIVE_STATUSES,
  PAID_PLANS,
  normalizeEmail,
  primaryEmail,
  verifyUserToken,
  bearer,
  getSubscription,
  upsertSubscription,
  checkAccess
};
