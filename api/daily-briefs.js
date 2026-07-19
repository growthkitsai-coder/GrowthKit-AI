'use strict';

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const { getWorkspace, listDailyBriefs } = require('../lib/product');
const { generateDailyBrief } = require('../lib/daily');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }
  const access = await checkAccess(user);
  if (!access.allowed) {
    res.status(402).json({ error: 'Upgrade to Pro to receive daily briefs.', code: 'subscription_required' });
    return;
  }
  const workspaceResult = await getWorkspace(user.id);
  const workspace = workspaceResult.workspace;
  if (!workspace || workspace.full_report_status !== 'completed') {
    res.status(409).json({ error: 'Generate your first full report before daily briefs begin.', code: 'full_report_required' });
    return;
  }
  if (req.method === 'GET') {
    res.status(200).json({ briefs: await listDailyBriefs(user.id, 14) });
    return;
  }
  const result = await generateDailyBrief(user, workspace);
  if (!result.ok) {
    const status = result.code === 'generating' ? 202 : 502;
    res.status(status).json({ error: result.code === 'generating' ? 'Today\'s brief is already being prepared.' : 'Could not prepare today\'s brief.', code: result.code });
    return;
  }
  res.status(200).json({ brief: result.row, existing: result.existing });
};
