'use strict';

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const { configured, getWorkspace } = require('../lib/product');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: 'Account access is not configured.' });
    return;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }
  const access = await checkAccess(user);
  const workspaceResult = await getWorkspace(user.id);
  if (!workspaceResult.ok) {
    res.status(503).json({ error: 'Your workspace is not available yet.' });
    return;
  }
  const w = workspaceResult.workspace;
  res.status(200).json({
    access: {
      allowed: access.allowed,
      plan: access.plan,
      status: access.status,
      reason: access.reason,
      expires_at: access.expires_at || null
    },
    workspace: w ? {
      company_name: w.company_name,
      website: w.website,
      full_report_status: w.full_report_status,
      full_report_completed_at: w.full_report_completed_at,
      daily_briefs_started_at: w.daily_briefs_started_at
    } : null,
    can_generate_full_report: Boolean(access.allowed && (!w || w.full_report_status === 'failed'))
  });
};
