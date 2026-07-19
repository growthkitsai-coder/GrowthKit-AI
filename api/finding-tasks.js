'use strict';

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const { configured } = require('../lib/product');
const { loadTasks, createCustomTask, setTaskCompleted, deleteCustomTask } = require('../lib/findings');

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function statusFor(code) {
  if (code === 'source_not_found' || code === 'task_not_found') return 404;
  if (code === 'invalid_task') return 400;
  if (code === 'task_limit') return 409;
  return 503;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST', 'PATCH', 'DELETE'].indexOf(req.method) === -1) {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: 'Finding tasks are not configured.' });
    return;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }
  const access = await checkAccess(user);
  if (!access.allowed) {
    res.status(402).json({ error: 'Upgrade to Pro to use finding checklists.', code: 'subscription_required' });
    return;
  }

  const payload = body(req);
  let result;
  if (req.method === 'GET') {
    result = await loadTasks(user.id, req.query && req.query.scope, req.query && req.query.date);
  } else if (req.method === 'POST') {
    result = await createCustomTask(user.id, payload.scope, payload.date, payload.finding_key, payload.label);
  } else if (req.method === 'PATCH') {
    result = await setTaskCompleted(user.id, payload.id, payload.completed);
  } else {
    result = await deleteCustomTask(user.id, payload.id);
  }

  if (!result.ok) {
    const messages = {
      source_not_found: 'This report or brief is not available.',
      task_not_found: 'That task could not be found.',
      invalid_task: 'Enter a valid task for this finding.',
      task_limit: 'This finding already has the maximum number of custom tasks.',
      storage_unavailable: 'Task progress is temporarily unavailable.'
    };
    res.status(statusFor(result.code)).json({ error: messages[result.code] || 'Task progress is unavailable.', code: result.code });
    return;
  }
  res.status(200).json(result);
};
