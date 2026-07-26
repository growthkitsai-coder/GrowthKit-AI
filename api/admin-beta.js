'use strict';

/**
 * GrowthKit AI — beta approvals (Avi's endpoint).
 *
 *   GET  /api/admin-beta?status=pending  → list applications, newest first
 *   POST /api/admin-beta                 → { user_id, action: 'approve' | 'revoke' }
 *
 * This endpoint hands out product access, so it is the most sensitive route in
 * the repo. Two deliberate choices:
 *
 *   1. Authorisation is by Supabase user id against GK_ADMIN_USER_IDS, checked
 *      server-side in lib/beta.js — never by email (emails change, and an
 *      attacker who can set an email must not be able to become an admin), and
 *      never by a secret in the URL (which leaks via history and screenshots).
 *
 *   2. A non-admin gets 404, not 403. A 403 confirms the endpoint exists and is
 *      worth attacking; 404 makes it indistinguishable from a typo. The same
 *      applies when GK_ADMIN_USER_IDS is unset — then nobody is an admin and
 *      every caller sees 404.
 *
 * Responses include applicant EMAIL ADDRESSES (PII). They go only to an
 * authenticated admin, are marked no-store, and must never be logged.
 */

const { verifyUserToken, bearer } = require('../lib/subscriptions');
const beta = require('../lib/beta');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!beta.configured()) {
    res.status(503).json({ error: 'Not configured.' });
    return;
  }

  const user = await verifyUserToken(bearer(req));
  // Unauthenticated and non-admin are answered identically — see note above.
  if (!user || !beta.isAdmin(user)) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  if (req.method === 'GET') {
    const status = typeof req.query?.status === 'string' ? req.query.status : '';
    const result = await beta.list(status, req.query?.limit);
    if (!result.ok) {
      res.status(503).json({ error: 'Could not read applications.' });
      return;
    }
    // Shape the rows for the admin UI, and fold in the live grant evaluation so
    // the page shows what access actually IS, not just what the column says.
    const applications = result.applications.map(function (row) {
      const grant = beta.evaluateGrant(row);
      return {
        user_id: row.user_id,
        email: row.email,
        status: row.status,
        note: row.note || '',
        applied_at: row.applied_at,
        approved_at: row.approved_at || null,
        expires_at: row.expires_at || null,
        reports_used: Number(row.reports_used) || 0,
        reports_limit: Number(row.reports_limit) || 0,
        active_now: grant.active,
        live_reason: grant.reason
      };
    });
    res.status(200).json({ applications: applications, count: applications.length });
    return;
  }

  // POST — approve or revoke.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (!targetId) {
    res.status(400).json({ error: 'Which application? Pass user_id.' });
    return;
  }
  if (action !== 'approve' && action !== 'revoke') {
    res.status(400).json({ error: 'action must be "approve" or "revoke".' });
    return;
  }

  const result = action === 'approve'
    ? await beta.approve(targetId, user.id)
    : await beta.revoke(targetId);

  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : 503;
    res.status(status).json({
      error: result.code === 'not_found' ? 'No application for that account.' : 'Could not update the application.'
    });
    return;
  }

  res.status(200).json({ ok: true, action: action, application: beta.publicView(result.application) });
};
