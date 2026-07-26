'use strict';

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const {
  configured,
  getActiveReport,
  listReportsToday,
  listReports
} = require('../lib/product');

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

  // Today's state drives the "generate" affordance: one COMPLETED report per UTC
  // day. A still-generating report means resume; a completed one means the day
  // is used; a failed-only day still allows a fresh attempt.
  const todays = await listReportsToday(user.id);
  const completedToday = todays.find(function (r) { return r.status === 'completed'; }) || null;
  const active = await getActiveReport(user.id);
  const history = await listReports(user.id, 30);

  const canGenerateToday = Boolean(access.allowed && !completedToday);

  res.status(200).json({
    access: {
      allowed: access.allowed,
      plan: access.plan,
      status: access.status,
      reason: access.reason,
      expires_at: access.expires_at || null
    },
    beta: access.beta || null,
    can_generate_today: canGenerateToday,
    today: {
      // 'completed' (day used) | 'generating' (resume) | 'none' (ready) —
      // a failed-only day reports 'none' so the founder can try again.
      status: completedToday ? 'completed' : (active ? 'generating' : 'none'),
      report_id: (completedToday && completedToday.id) || (active && active.id) || null,
      company_name: (completedToday && completedToday.company_name) || (active && active.company_name) || null
    },
    reports: history.map(function (r) {
      return {
        id: r.id,
        company_name: r.company_name,
        website: r.website || null,
        report_date: r.report_date,
        completed_at: r.completed_at
      };
    })
  });
};
