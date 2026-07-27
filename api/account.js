'use strict';

// Drives the /four workspace. Two independently metered loops:
//   • the FULL report  — the main deliverable, 2 per rolling 7 days
//   • the DAILY update — a short market delta, 1 per UTC day
// The workspace follows the founder's most recent completed report; generating
// on a new company simply moves it. See docs/daily-intelligence.md.

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const {
  configured,
  listReportsInWindow,
  allowanceFrom,
  getLatestCompletedReport,
  listReports,
  getDailyBrief,
  utcDate
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

  const windowRows = await listReportsInWindow(user.id);
  const allowance = allowanceFrom(windowRows);
  const active = windowRows.find(function (r) { return r.status === 'generating'; }) || null;
  const latest = await getLatestCompletedReport(user.id);
  const history = await listReports(user.id, 30);
  const todaysUpdate = latest ? await getDailyBrief(user.id, utcDate()) : null;

  // An unfinished report is always resumable — it has not been charged against
  // the window yet — so the affordance stays open while one is generating.
  const canGenerateReport = Boolean(access.allowed && (active || allowance.remaining > 0));
  const updateStatus = todaysUpdate ? todaysUpdate.status : 'none';

  res.status(200).json({
    access: {
      allowed: access.allowed,
      plan: access.plan,
      status: access.status,
      reason: access.reason,
      expires_at: access.expires_at || null
    },
    beta: access.beta || null,

    // The company the workspace is following: the most recent completed report.
    company: latest ? {
      report_id: latest.id,
      company_name: latest.company_name,
      website: latest.website || null,
      report_date: latest.report_date,
      completed_at: latest.completed_at
    } : null,

    // The main deliverable: 2 per rolling 7 days.
    full_report: {
      allowance: allowance,
      can_generate: canGenerateReport,
      // 'generating' → resume the pipeline; 'ready' → a slot is open;
      // 'spent' → the window is used up (next_available_at says when).
      status: active ? 'generating' : (allowance.remaining > 0 ? 'ready' : 'spent'),
      active_report_id: active ? active.id : null
    },

    // The side loop: one short update a day, never charged to a beta grant.
    daily: {
      // 'locked' until a full report exists — the update is a delta against it.
      status: latest ? updateStatus : 'locked',
      can_generate: Boolean(access.allowed && latest && updateStatus !== 'completed' && updateStatus !== 'generating'),
      date: utcDate(),
      brief_id: todaysUpdate ? todaysUpdate.id : null
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
