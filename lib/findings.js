'use strict';

const crypto = require('crypto');
const { adminRequest, getWorkspace, getDailyBrief } = require('./product');

const MAX_CUSTOM_TASKS = 12;

function plain(value) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractFindings(scope, report) {
  if (scope === 'full_report') {
    return (report && Array.isArray(report.gaps) ? report.gaps : []).map(function (gap, index) {
      return {
        key: 'gap-' + String(index + 1).padStart(2, '0'),
        title: plain(gap && gap.title),
        tasks: gap && Array.isArray(gap.checklist) ? gap.checklist.map(plain).filter(Boolean).slice(0, 3) : []
      };
    }).filter(function (finding) { return finding.title && finding.tasks.length === 3; });
  }
  if (scope === 'daily_brief') {
    return (report && Array.isArray(report.next_moves) ? report.next_moves : []).map(function (move, index) {
      return {
        key: 'move-' + String(index + 1).padStart(2, '0'),
        title: plain(move && (move.finding || move.action)),
        tasks: move && Array.isArray(move.checklist) ? move.checklist.map(plain).filter(Boolean).slice(0, 3) : []
      };
    }).filter(function (finding) { return finding.title && finding.tasks.length === 3; });
  }
  return [];
}

async function resolveSource(userId, scope, date) {
  if (scope === 'full_report') {
    const result = await getWorkspace(userId);
    const workspace = result.ok && result.workspace;
    if (!workspace || workspace.full_report_status !== 'completed' || !workspace.full_report) return null;
    return {
      source_type: 'full_report',
      source_id: String(workspace.full_report_completed_at || workspace.company_key),
      findings: extractFindings('full_report', workspace.full_report)
    };
  }
  if (scope === 'daily_brief' && /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    const row = await getDailyBrief(userId, date);
    if (!row || row.status !== 'completed' || !row.brief) return null;
    return {
      source_type: 'daily_brief',
      source_id: String(date),
      findings: extractFindings('daily_brief', row.brief)
    };
  }
  return null;
}

async function taskRows(userId, source) {
  const path = '/rest/v1/finding_tasks?user_id=eq.' + encodeURIComponent(userId) +
    '&source_type=eq.' + encodeURIComponent(source.source_type) +
    '&source_id=eq.' + encodeURIComponent(source.source_id) +
    '&select=id,finding_key,task_key,label,origin,completed,sort_order,created_at&order=sort_order.asc,created_at.asc';
  const result = await adminRequest(path);
  return result.ok && Array.isArray(result.data) ? result.data : null;
}

async function syncGenerated(userId, source) {
  const existing = await taskRows(userId, source);
  if (existing === null) return null;
  const known = new Set(existing.map(function (row) { return row.finding_key + ':' + row.task_key; }));
  const inserts = [];
  source.findings.forEach(function (finding) {
    finding.tasks.forEach(function (label, index) {
      const taskKey = 'generated-' + String(index + 1).padStart(2, '0');
      if (known.has(finding.key + ':' + taskKey)) return;
      inserts.push({
        user_id: userId,
        source_type: source.source_type,
        source_id: source.source_id,
        finding_key: finding.key,
        task_key: taskKey,
        label: label,
        origin: 'generated',
        completed: false,
        sort_order: index + 1
      });
    });
  });
  if (inserts.length) {
    const created = await adminRequest('/rest/v1/finding_tasks', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(inserts)
    });
    if (!created.ok && created.status !== 409) return null;
  }
  return taskRows(userId, source);
}

async function loadTasks(userId, scope, date) {
  const source = await resolveSource(userId, scope, date);
  if (!source) return { ok: false, code: 'source_not_found' };
  const rows = await syncGenerated(userId, source);
  if (rows === null) return { ok: false, code: 'storage_unavailable' };
  return { ok: true, source: source, tasks: rows };
}

async function createCustomTask(userId, scope, date, findingKey, rawLabel) {
  const source = await resolveSource(userId, scope, date);
  const label = plain(rawLabel).slice(0, 180);
  if (!source || !label || !source.findings.some(function (finding) { return finding.key === findingKey; })) {
    return { ok: false, code: 'invalid_task' };
  }
  const rows = await syncGenerated(userId, source);
  if (rows === null) return { ok: false, code: 'storage_unavailable' };
  const customCount = rows.filter(function (row) { return row.finding_key === findingKey && row.origin === 'custom'; }).length;
  if (customCount >= MAX_CUSTOM_TASKS) return { ok: false, code: 'task_limit' };
  const result = await adminRequest('/rest/v1/finding_tasks', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify([{
      user_id: userId,
      source_type: source.source_type,
      source_id: source.source_id,
      finding_key: findingKey,
      task_key: 'custom-' + crypto.randomUUID(),
      label: label,
      origin: 'custom',
      completed: false,
      sort_order: 1000 + customCount
    }])
  });
  return result.ok && result.data && result.data[0]
    ? { ok: true, task: result.data[0] }
    : { ok: false, code: 'storage_unavailable' };
}

async function setTaskCompleted(userId, id, completed) {
  if (!id || typeof completed !== 'boolean') return { ok: false, code: 'invalid_task' };
  const result = await adminRequest('/rest/v1/finding_tasks?id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ completed: completed, updated_at: new Date().toISOString() })
  });
  return result.ok && result.data && result.data[0]
    ? { ok: true, task: result.data[0] }
    : { ok: false, code: 'task_not_found' };
}

async function deleteCustomTask(userId, id) {
  if (!id) return { ok: false, code: 'invalid_task' };
  const result = await adminRequest('/rest/v1/finding_tasks?id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(userId) + '&origin=eq.custom', {
    method: 'DELETE',
    headers: { prefer: 'return=representation' }
  });
  return result.ok && result.data && result.data[0]
    ? { ok: true }
    : { ok: false, code: 'task_not_found' };
}

module.exports = {
  extractFindings,
  resolveSource,
  loadTasks,
  createCustomTask,
  setTaskCompleted,
  deleteCustomTask
};
