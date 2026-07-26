'use strict';

/**
 * GrowthKit AI — beta applications + approvals.
 *
 * Source of truth for who may use the beta. Replaces the hand-pasted
 * GK_BETA_EMAILS Vercel env var (which needed a redeploy per approval) with the
 * `beta_applications` table — see supabase/migrations/202607240001_beta_applications.sql.
 *
 * The shape of a grant (decided by Avi, 2026-07-24):
 *   • Anyone may create a Free account and APPLY. Applying grants nothing.
 *   • Avi approves. Approval starts the window.
 *   • The window ends after 7 DAYS **or** 7 FULL REPORTS, whichever comes first.
 *   • After that they pay for Pro. Nothing here ever grants Pro itself —
 *     paid subscriptions are checked before beta in checkAccess().
 *
 * Lives OUTSIDE api/ so Vercel does not turn it into an HTTP route. Zero npm
 * dependencies (raw fetch against Supabase PostgREST), CommonJS, no build step.
 *
 * ── Secrets (Vercel env vars — NEVER in git; the repo is public) ──
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   service_role BYPASSES RLS; server-only.
 *   GK_ADMIN_USER_IDS                         comma/space/newline list of Supabase
 *                                             user UUIDs allowed to approve. Empty
 *                                             = nobody is an admin (fails closed).
 *
 * ⚠ This module handles PII (applicant email addresses). Never log a row, never
 *   write one into a .md file, never return another user's row to the browser.
 */

// The window. Changing these changes only NEW grants — existing rows carry their
// own expires_at / reports_limit, so people keep the deal they were given.
const BETA_DAYS = 7;
const BETA_REPORTS = 7;

const STATUSES = ['pending', 'approved', 'expired', 'revoked'];

function base() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') : '';
}

function configured() {
  return Boolean(base() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return Object.assign({
    apikey: key,
    authorization: 'Bearer ' + key,
    'content-type': 'application/json'
  }, extra || {});
}

async function adminRequest(path, options) {
  if (!configured()) return { ok: false, status: 503, data: null };
  try {
    const r = await fetch(base() + path, Object.assign({}, options || {}, {
      headers: headers(options && options.headers)
    }));
    let data = null;
    if (r.status !== 204) {
      try { data = await r.json(); } catch (_) {}
    }
    return { ok: r.ok, status: r.status, data };
  } catch (_) {
    return { ok: false, status: 502, data: null };
  }
}

/**
 * Is this user allowed to approve others? Matches the Supabase user UUID against
 * GK_ADMIN_USER_IDS. Deliberately fails CLOSED: an unset or empty env var means
 * nobody is an admin, so a misconfigured deploy cannot expose the approval API.
 * Matching is on the immutable user id, never on an email (emails can change).
 */
function isAdmin(user) {
  const id = user && user.id;
  if (!id) return false;
  const raw = String(process.env.GK_ADMIN_USER_IDS || '').trim();
  if (!raw) return false;
  const ids = raw.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  return ids.indexOf(String(id)) !== -1;
}

/**
 * Evaluate a stored application row into a live decision.
 *
 * Time and report count are checked here rather than trusted from `status`,
 * because a row goes stale the moment its expiry passes — nothing sweeps the
 * table on a timer, so a row can read 'approved' while actually being expired.
 *
 * Returns { active, reason, expires_at, reports_remaining, reports_used }.
 */
function evaluateGrant(row, now) {
  const at = now instanceof Date ? now.getTime() : Date.now();
  if (!row) return { active: false, reason: 'beta-not-applied', expires_at: null, reports_remaining: 0, reports_used: 0 };

  const used = Number(row.reports_used) || 0;
  const limit = Number(row.reports_limit) || 0;
  const remaining = Math.max(0, limit - used);
  const expiresAt = row.expires_at || null;

  if (row.status === 'revoked') {
    return { active: false, reason: 'beta-revoked', expires_at: expiresAt, reports_remaining: 0, reports_used: used };
  }
  if (row.status === 'pending') {
    return { active: false, reason: 'beta-pending', expires_at: null, reports_remaining: remaining, reports_used: used };
  }
  if (row.status !== 'approved') {
    // 'expired', or anything a future migration adds that we don't understand.
    return { active: false, reason: 'beta-expired', expires_at: expiresAt, reports_remaining: remaining, reports_used: used };
  }

  // Approved — now check both ends of the window.
  const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
  if (expiresAt && !isNaN(expiryMs) && at >= expiryMs) {
    return { active: false, reason: 'beta-expired', expires_at: expiresAt, reports_remaining: remaining, reports_used: used };
  }
  if (remaining <= 0) {
    return { active: false, reason: 'beta-reports-spent', expires_at: expiresAt, reports_remaining: 0, reports_used: used };
  }

  return { active: true, reason: 'beta-approved', expires_at: expiresAt, reports_remaining: remaining, reports_used: used };
}

/** Read one user's application row (service_role → bypasses RLS). */
async function getApplication(userId) {
  if (!userId) return { ok: true, application: null };
  const r = await adminRequest(
    '/rest/v1/beta_applications?user_id=eq.' + encodeURIComponent(userId) + '&select=*'
  );
  if (!r.ok) return { ok: false, application: null };
  return { ok: true, application: Array.isArray(r.data) && r.data.length ? r.data[0] : null };
}

/**
 * Record an application. Idempotent: re-applying does NOT reset an existing row,
 * so someone cannot re-apply their way out of an expired or revoked grant.
 * Returns { ok, application, code }.
 */
async function apply(userId, email, note) {
  if (!userId || !email) return { ok: false, code: 'invalid' };

  const existing = await getApplication(userId);
  if (!existing.ok) return { ok: false, code: 'unavailable' };
  if (existing.application) {
    return { ok: true, application: existing.application, code: 'already_applied' };
  }

  const payload = {
    user_id: userId,
    email: String(email).trim().toLowerCase(),
    status: 'pending',
    note: note ? String(note).slice(0, 1000) : null,
    applied_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reports_limit: BETA_REPORTS
  };
  const r = await adminRequest('/rest/v1/beta_applications', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([payload])
  });
  if (!r.ok) return { ok: false, code: 'unavailable' };
  return { ok: true, application: Array.isArray(r.data) && r.data.length ? r.data[0] : payload, code: 'applied' };
}

/**
 * Approve an applicant. Starts the clock NOW (not at apply time) and stamps an
 * explicit expires_at so the boundary survives a later change to BETA_DAYS.
 * Re-approving someone already approved restarts their window — that is the
 * intended way to hand out a second run.
 */
async function approve(userId, adminUserId) {
  if (!userId) return { ok: false, code: 'invalid' };
  const now = new Date();
  const expires = new Date(now.getTime() + BETA_DAYS * 24 * 60 * 60 * 1000);
  const patch = {
    status: 'approved',
    approved_at: now.toISOString(),
    approved_by: adminUserId || null,
    expires_at: expires.toISOString(),
    reports_used: 0,
    reports_limit: BETA_REPORTS,
    revoked_at: null,
    updated_at: now.toISOString()
  };
  const r = await adminRequest(
    '/rest/v1/beta_applications?user_id=eq.' + encodeURIComponent(userId),
    { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(patch) }
  );
  if (!r.ok) return { ok: false, code: 'unavailable' };
  if (!Array.isArray(r.data) || !r.data.length) return { ok: false, code: 'not_found' };
  return { ok: true, application: r.data[0] };
}

/** Revoke immediately. Access stops on the next request — nothing is cached. */
async function revoke(userId) {
  if (!userId) return { ok: false, code: 'invalid' };
  const now = new Date().toISOString();
  const r = await adminRequest(
    '/rest/v1/beta_applications?user_id=eq.' + encodeURIComponent(userId),
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ status: 'revoked', revoked_at: now, updated_at: now })
    }
  );
  if (!r.ok) return { ok: false, code: 'unavailable' };
  if (!Array.isArray(r.data) || !r.data.length) return { ok: false, code: 'not_found' };
  return { ok: true, application: r.data[0] };
}

/**
 * List applications for the admin page, newest first.
 * `status` optionally filters to one of STATUSES.
 */
async function list(status, limit) {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  let path = '/rest/v1/beta_applications?select=*&order=applied_at.desc&limit=' + capped;
  if (status && STATUSES.indexOf(status) !== -1) {
    path += '&status=eq.' + encodeURIComponent(status);
  }
  const r = await adminRequest(path);
  if (!r.ok) return { ok: false, applications: [] };
  return { ok: true, applications: Array.isArray(r.data) ? r.data : [] };
}

/**
 * Count one full report against a beta grant. Called by the engine when a report
 * is actually started, so a spent grant closes the window immediately.
 *
 * Deliberately increments from the value we just read rather than using a
 * database-side expression: PostgREST cannot express `reports_used + 1` in a
 * PATCH body. That leaves a narrow race if the same user starts two reports in
 * the same instant — acceptable here because the engine already serialises a
 * user's report through the workspace reservation, and the worst case is one
 * extra report on a 7-report grant.
 */
async function consumeReport(userId) {
  const existing = await getApplication(userId);
  if (!existing.ok || !existing.application) return { ok: false, code: 'not_found' };
  const row = existing.application;
  const used = (Number(row.reports_used) || 0) + 1;
  const limit = Number(row.reports_limit) || 0;
  const patch = {
    reports_used: used,
    updated_at: new Date().toISOString()
  };
  // Mark the grant spent so the admin list reflects reality without recomputing.
  if (used >= limit) patch.status = 'expired';

  const r = await adminRequest(
    '/rest/v1/beta_applications?user_id=eq.' + encodeURIComponent(userId),
    { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(patch) }
  );
  if (!r.ok) return { ok: false, code: 'unavailable' };
  return { ok: true, application: Array.isArray(r.data) && r.data.length ? r.data[0] : null };
}

/**
 * The public-safe view of an application — what the browser is allowed to see
 * about ITSELF. Never includes another user's row, and never the admin id.
 */
function publicView(row, now) {
  const grant = evaluateGrant(row, now);
  return {
    applied: Boolean(row),
    status: row ? row.status : 'none',
    active: grant.active,
    reason: grant.reason,
    expires_at: grant.expires_at,
    reports_used: grant.reports_used,
    reports_remaining: grant.reports_remaining,
    reports_limit: row ? (Number(row.reports_limit) || 0) : BETA_REPORTS
  };
}

module.exports = {
  BETA_DAYS,
  BETA_REPORTS,
  STATUSES,
  configured,
  isAdmin,
  evaluateGrant,
  getApplication,
  apply,
  approve,
  revoke,
  list,
  consumeReport,
  publicView
};
