'use strict';

const { checkAccess } = require('../lib/subscriptions');
const { listCompletedWorkspaces, getAuthUser } = require('../lib/product');
const { generateDailyBrief } = require('../lib/daily');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = process.env.CRON_SECRET;
  const auth = req.headers && req.headers.authorization;
  if (!expected || auth !== 'Bearer ' + expected) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  const workspaces = await listCompletedWorkspaces(100);
  const results = await Promise.allSettled(workspaces.map(async function (workspace) {
    const user = await getAuthUser(workspace.user_id);
    if (!user) return { skipped: 'missing-user' };
    const access = await checkAccess(user);
    if (!access.allowed) return { skipped: 'no-access' };
    return generateDailyBrief(user, workspace);
  }));
  const summary = { checked: workspaces.length, generated: 0, existing: 0, skipped_or_failed: 0 };
  results.forEach(function (result) {
    const value = result.status === 'fulfilled' && result.value;
    if (value && value.ok && value.existing) summary.existing++;
    else if (value && value.ok) summary.generated++;
    else summary.skipped_or_failed++;
  });
  res.status(200).json(summary);
};
