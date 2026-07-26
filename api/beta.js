'use strict';

/**
 * GrowthKit AI — beta applications (the applicant's own endpoint).
 *
 *   GET  /api/beta   → this user's own application status (never anyone else's)
 *   POST /api/beta   → apply to be a beta tester { note?: string }
 *
 * Applying grants NOTHING. It records a row in `beta_applications` with status
 * 'pending'; only Avi approving it (api/admin-beta.js) starts the 7-day /
 * 7-report window. See lib/beta.js for the grant rules.
 *
 * Both methods require a valid Supabase bearer token — this endpoint is for
 * signed-in accounts. The public `/waitlist` page is a separate, unauthenticated
 * marketing list that writes to Avi's Google Sheet; it is NOT this table and
 * does not grant anything either.
 */

const { verifyUserToken, bearer, primaryEmail, checkAccess } = require('../lib/subscriptions');
const beta = require('../lib/beta');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!beta.configured()) {
    res.status(503).json({ error: 'Beta applications are not configured yet.' });
    return;
  }

  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }

  if (req.method === 'GET') {
    const found = await beta.getApplication(user.id);
    if (!found.ok) {
      res.status(503).json({ error: 'Beta status is unavailable right now.' });
      return;
    }
    res.status(200).json({ beta: beta.publicView(found.application) });
    return;
  }

  // POST — apply.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';

  const email = primaryEmail(user);
  if (!email) {
    res.status(400).json({ error: 'Your account has no email address we can use.' });
    return;
  }

  // A paying subscriber has no reason to apply, and approving one would be
  // meaningless — checkAccess prefers the subscription anyway.
  const access = await checkAccess(user);
  if (access.allowed && access.reason === 'subscription') {
    res.status(409).json({ error: 'You already have a paid subscription — the beta is for accounts without one.' });
    return;
  }

  const result = await beta.apply(user.id, email, note);
  if (!result.ok) {
    res.status(503).json({ error: 'We could not record your application. Try again shortly.' });
    return;
  }

  // 'already_applied' is deliberately a success, not an error: re-applying is
  // harmless and must not reset an expired or revoked grant (see lib/beta.js).
  res.status(200).json({
    ok: true,
    code: result.code,
    beta: beta.publicView(result.application)
  });
};
