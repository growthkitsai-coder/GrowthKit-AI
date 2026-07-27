'use strict';

// The DAILY UPDATE — the short, one-click market delta shown in the /four Daily
// pane. One per UTC day, cut against the founder's most recent completed full
// report (the company the workspace is following). Same access gate as the full
// report, but deliberately metered on its own: it NEVER charges the beta report
// grant, which only full reports consume. See docs/daily-intelligence.md.

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const { configured, getLatestCompletedReport, listDailyBriefs } = require('../lib/product');
const { generateDailyBrief } = require('../lib/daily');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: 'Daily updates are not configured.' });
    return;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }

  // Reading past updates survives access ending, like completed reports do.
  if (req.method === 'GET') {
    res.status(200).json({ briefs: await listDailyBriefs(user.id, 14) });
    return;
  }

  const access = await checkAccess(user);
  if (!access.allowed) {
    res.status(402).json({ error: 'Upgrade to Pro to generate daily updates.', code: 'subscription_required', reason: access.reason });
    return;
  }
  const report = await getLatestCompletedReport(user.id);
  if (!report) {
    res.status(409).json({ error: 'Generate your full report first — the daily update is a delta against it.', code: 'full_report_required' });
    return;
  }

  const result = await generateDailyBrief(user, report);
  if (!result.ok) {
    // One opaque message for three very different failures made this
    // undiagnosable in production. Say which one it is.
    if (result.code === 'generating') {
      res.status(202).json({ error: 'Today\'s update is already being prepared.', code: 'generating' });
      return;
    }
    console.error('[daily-briefs] %s: %s', result.code, result.detail || '(no detail)');
    if (result.code === 'not_configured') {
      res.status(503).json({ error: 'The daily-update engine is not configured yet.', code: result.code });
      return;
    }
    if (result.code === 'unavailable') {
      res.status(503).json({
        error: 'Daily-update storage rejected the write. If this is a fresh deploy, run migration 202607270001_workspace_daily_updates.sql.',
        code: result.code,
        detail: result.detail || null
      });
      return;
    }
    res.status(502).json({
      error: result.detail || 'Could not prepare today\'s update.',
      code: result.code
    });
    return;
  }
  res.status(200).json({ brief: result.row, existing: result.existing });
};
