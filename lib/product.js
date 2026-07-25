'use strict';

const crypto = require('crypto');

function base() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') : '';
}

function configured() {
  return Boolean(base() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return Object.assign({
    apikey: key,
    authorization: 'Bearer ' + key,
    'content-type': 'application/json'
  }, extra || {});
}

async function adminRequest(path, options) {
  if (!configured()) return { ok: false, status: 503, data: null };
  try {
    const r = await fetch(base() + path, Object.assign({}, options || {}, {
      headers: headers(options && options.headers)
    }));
    let data = null;
    if (r.status !== 204) {
      try { data = await r.json(); } catch (_) {}
    }
    return { ok: r.ok, status: r.status, data };
  } catch (_) {
    return { ok: false, status: 502, data: null };
  }
}

async function getWorkspace(userId) {
  const r = await adminRequest('/rest/v1/product_workspaces?user_id=eq.' + encodeURIComponent(userId) + '&select=*');
  if (!r.ok) return { ok: false, status: r.status, workspace: null };
  return { ok: true, status: 200, workspace: Array.isArray(r.data) && r.data.length ? r.data[0] : null };
}

async function reserveWorkspace(userId, input) {
  const now = new Date();
  const current = await getWorkspace(userId);
  if (!current.ok) return { ok: false, code: 'workspace_unavailable' };

  const company = String(input.company || '').trim();
  const normalized = company.toLowerCase().replace(/\s+/g, ' ');
  const existing = current.workspace;
  if (existing) {
    if (existing.company_key !== normalized) {
      return { ok: false, code: 'company_locked', company: existing.company_name };
    }
    if (existing.full_report_status === 'completed') {
      return { ok: false, code: 'full_report_complete', company: existing.company_name };
    }
    const started = existing.full_report_started_at ? new Date(existing.full_report_started_at).getTime() : 0;
    if (existing.full_report_status === 'generating' && Date.now() - started < 10 * 60 * 1000) {
      return { ok: false, code: 'report_in_progress', company: existing.company_name };
    }
    const expectedUpdate = existing.updated_at || existing.full_report_started_at;
    const lock = '&updated_at=eq.' + encodeURIComponent(expectedUpdate);
    const patch = await adminRequest('/rest/v1/product_workspaces?user_id=eq.' + encodeURIComponent(userId) + lock, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        website: input.website || existing.website || null,
        competitors: input.competitors || existing.competitors || null,
        profile_text: input.profile || existing.profile_text || null,
        full_report_status: 'generating',
        full_report_started_at: now.toISOString(),
        updated_at: now.toISOString()
      })
    });
    if (patch.ok && patch.data && patch.data[0]) return { ok: true, code: 'reserved', workspace: patch.data[0] };
    const raced = await getWorkspace(userId);
    if (raced.ok && raced.workspace && raced.workspace.full_report_status === 'completed') {
      return { ok: false, code: 'full_report_complete', company: raced.workspace.company_name };
    }
    if (raced.ok && raced.workspace && raced.workspace.full_report_status === 'generating') {
      return { ok: false, code: 'report_in_progress', company: raced.workspace.company_name };
    }
    return { ok: false, code: 'workspace_unavailable' };
  }

  const insert = await adminRequest('/rest/v1/product_workspaces', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify([{
      user_id: userId,
      company_name: company,
      company_key: normalized,
      website: input.website || null,
      competitors: input.competitors || null,
      profile_text: input.profile || null,
      full_report_status: 'generating',
      full_report_started_at: now.toISOString(),
      timezone: 'UTC'
    }])
  });
  if (insert.ok) return { ok: true, code: 'reserved', workspace: insert.data && insert.data[0] };
  if (insert.status === 409) return reserveWorkspace(userId, input);
  return { ok: false, code: 'workspace_unavailable' };
}

async function ensureWorkspace(userId, input) {
  const current = await getWorkspace(userId);
  if (!current.ok) return { ok: false, code: 'workspace_unavailable' };
  if (!current.workspace) return reserveWorkspace(userId, input);

  const existing = current.workspace;
  const company = String(input.company || existing.company_name || '').trim();
  const normalized = company.toLowerCase().replace(/\s+/g, ' ');
  if (normalized && existing.company_key !== normalized) {
    return { ok: false, code: 'company_locked', company: existing.company_name };
  }
  if (existing.full_report_status === 'completed') {
    return { ok: false, code: 'full_report_complete', company: existing.company_name };
  }

  const now = new Date().toISOString();
  const r = await adminRequest('/rest/v1/product_workspaces?user_id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      website: input.website || existing.website || null,
      competitors: input.competitors || existing.competitors || null,
      profile_text: input.profile || existing.profile_text || null,
      full_report_status: 'generating',
      full_report_started_at: existing.full_report_started_at || now,
      updated_at: now
    })
  });
  return r.ok && r.data && r.data[0]
    ? { ok: true, code: 'resumed', workspace: r.data[0] }
    : { ok: false, code: 'workspace_unavailable' };
}

// ── Daily reports (Phase 2, 2026-07-25) ─────────────────────────────────────
// A report is one row in `reports`; its seven pipeline sections live in
// `report_sections` keyed by report_id. One COMPLETED report per user per UTC
// day. See docs/daily-intelligence.md.

function normalizeCompany(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function listReportsToday(userId) {
  const today = utcDate();
  const r = await adminRequest('/rest/v1/reports?user_id=eq.' + encodeURIComponent(userId) +
    '&report_date=eq.' + encodeURIComponent(today) + '&select=*&order=created_at.desc');
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/** Today's still-generating report, if one exists (for stage resume). */
async function getActiveReport(userId) {
  const rows = await listReportsToday(userId);
  return rows.find(function (row) { return row.status === 'generating'; }) || null;
}

async function getReportById(userId, reportId) {
  const r = await adminRequest('/rest/v1/reports?id=eq.' + encodeURIComponent(reportId) +
    '&user_id=eq.' + encodeURIComponent(userId) + '&select=*');
  return r.ok && Array.isArray(r.data) && r.data.length ? r.data[0] : null;
}

/** History for the dashboard: completed reports, newest first. */
async function listReports(userId, limit) {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const r = await adminRequest('/rest/v1/reports?user_id=eq.' + encodeURIComponent(userId) +
    '&status=eq.completed&select=id,company_name,website,report_date,completed_at&order=completed_at.desc&limit=' + capped);
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/**
 * Reserve today's report before spending model credits. Enforces the one-a-day
 * limit and resumes an in-progress report rather than starting a duplicate.
 *
 *   completed today            → { ok:false, code:'daily_limit' }
 *   generating & recent        → { ok:true,  code:'resumed'  } (same report)
 *   generating & stale (>10m)  → reset that row and reuse it   ('reserved')
 *   failed today / none        → new report row                ('reserved')
 *
 * A failed attempt does NOT consume the day — retries are always allowed until
 * one completes. The beta report counter is charged only on completion.
 */
async function reserveReport(userId, input) {
  const rows = await listReportsToday(userId);
  const completed = rows.find(function (r) { return r.status === 'completed'; });
  if (completed) return { ok: false, code: 'daily_limit', report: completed };

  const generating = rows.find(function (r) { return r.status === 'generating'; });
  if (generating) {
    const age = Date.now() - new Date(generating.started_at || generating.updated_at).getTime();
    if (age < 10 * 60 * 1000) return { ok: true, code: 'resumed', report: generating };
    // Stale — reset the same row so its sections (report_id) stay valid.
    const now = new Date().toISOString();
    const reset = await adminRequest('/rest/v1/reports?id=eq.' + encodeURIComponent(generating.id) +
      '&updated_at=eq.' + encodeURIComponent(generating.updated_at || generating.started_at), {
      method: 'PATCH', headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        website: input.website || generating.website || null,
        competitors: input.competitors || generating.competitors || null,
        profile_text: input.profile || generating.profile_text || null,
        started_at: now, updated_at: now
      })
    });
    if (reset.ok && reset.data && reset.data[0]) return { ok: true, code: 'reserved', report: reset.data[0] };
    return { ok: true, code: 'resumed', report: generating };
  }

  const company = String(input.company || '').trim();
  if (!company) return { ok: false, code: 'no_company' };
  const now = new Date().toISOString();
  const insert = await adminRequest('/rest/v1/reports', {
    method: 'POST', headers: { prefer: 'return=representation' },
    body: JSON.stringify([{
      user_id: userId,
      report_date: utcDate(),
      company_name: company,
      company_key: normalizeCompany(company),
      website: input.website || null,
      competitors: input.competitors || null,
      profile_text: input.profile || null,
      status: 'generating',
      started_at: now,
      updated_at: now
    }])
  });
  if (insert.ok && insert.data && insert.data[0]) return { ok: true, code: 'reserved', report: insert.data[0] };
  return { ok: false, code: 'unavailable' };
}

async function listReportSections(reportId) {
  const r = await adminRequest('/rest/v1/report_sections?report_id=eq.' + encodeURIComponent(reportId) + '&select=section,status,output,error,started_at,completed_at,updated_at');
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

async function reserveReportSection(reportId, section) {
  const path = '/rest/v1/report_sections?report_id=eq.' + encodeURIComponent(reportId) + '&section=eq.' + encodeURIComponent(section) + '&select=*';
  const existingResult = await adminRequest(path);
  const existing = existingResult.ok && Array.isArray(existingResult.data) ? existingResult.data[0] : null;
  if (existing && existing.status === 'completed') return { ok: false, code: 'completed', row: existing };
  if (existing && existing.status === 'generating') {
    const age = Date.now() - new Date(existing.started_at || existing.updated_at).getTime();
    if (age < 60 * 1000) return { ok: false, code: 'in_progress', row: existing };
  }
  const now = new Date().toISOString();
  if (existing) {
    const r = await adminRequest('/rest/v1/report_sections?report_id=eq.' + encodeURIComponent(reportId) + '&section=eq.' + encodeURIComponent(section), {
      method: 'PATCH', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ status: 'generating', output: null, error: null, started_at: now, completed_at: null, updated_at: now })
    });
    return r.ok && r.data && r.data[0] ? { ok: true, row: r.data[0] } : { ok: false, code: 'unavailable' };
  }
  const r = await adminRequest('/rest/v1/report_sections', {
    method: 'POST', headers: { prefer: 'return=representation' },
    body: JSON.stringify([{ report_id: reportId, section, status: 'generating', started_at: now, updated_at: now }])
  });
  if (r.ok && r.data && r.data[0]) return { ok: true, row: r.data[0] };
  if (r.status === 409) return reserveReportSection(reportId, section);
  return { ok: false, code: 'unavailable' };
}

async function completeReportSection(reportId, section, output) {
  const now = new Date().toISOString();
  const r = await adminRequest('/rest/v1/report_sections?report_id=eq.' + encodeURIComponent(reportId) + '&section=eq.' + encodeURIComponent(section) + '&status=eq.generating', {
    method: 'PATCH', headers: { prefer: 'return=representation' },
    body: JSON.stringify({ status: 'completed', output, error: null, completed_at: now, updated_at: now })
  });
  return r.ok && r.data && r.data[0] ? r.data[0] : null;
}

async function failReportSection(reportId, section, message) {
  const r = await adminRequest('/rest/v1/report_sections?report_id=eq.' + encodeURIComponent(reportId) + '&section=eq.' + encodeURIComponent(section), {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'failed', error: String(message || '').slice(0, 300), updated_at: new Date().toISOString() })
  });
  return r.ok;
}

/**
 * Mark a report complete. Guarded on status=generating so it transitions exactly
 * once even under a race — the caller uses the boolean return to fire the beta
 * report counter only on the transition that actually happened.
 */
async function completeReport(reportId, deliverable) {
  const now = new Date().toISOString();
  const r = await adminRequest('/rest/v1/reports?id=eq.' + encodeURIComponent(reportId) + '&status=eq.generating', {
    method: 'PATCH', headers: { prefer: 'return=representation' },
    body: JSON.stringify({ status: 'completed', full_report: deliverable, completed_at: now, updated_at: now })
  });
  return Boolean(r.ok && r.data && r.data[0]);
}

async function failReport(reportId) {
  const r = await adminRequest('/rest/v1/reports?id=eq.' + encodeURIComponent(reportId) + '&status=eq.generating', {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() })
  });
  return r.ok;
}

async function completeWorkspace(userId, deliverable) {
  const now = new Date().toISOString();
  const r = await adminRequest('/rest/v1/product_workspaces?user_id=eq.' + encodeURIComponent(userId) + '&full_report_status=eq.generating', {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      full_report_status: 'completed',
      full_report: deliverable,
      full_report_completed_at: now,
      daily_briefs_started_at: now,
      updated_at: now
    })
  });
  return Boolean(r.ok && r.data && r.data[0]);
}

async function failWorkspace(userId) {
  const now = new Date().toISOString();
  const r = await adminRequest('/rest/v1/product_workspaces?user_id=eq.' + encodeURIComponent(userId) + '&full_report_status=eq.generating', {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ full_report_status: 'failed', updated_at: now })
  });
  return r.ok;
}

async function listCompletedWorkspaces(limit) {
  const r = await adminRequest('/rest/v1/product_workspaces?full_report_status=eq.completed&select=*&order=full_report_completed_at.asc&limit=' + String(limit || 100));
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

async function getAuthUser(userId) {
  const r = await adminRequest('/auth/v1/admin/users/' + encodeURIComponent(userId));
  return r.ok && r.data && r.data.id ? r.data : null;
}

function utcDate(value) {
  const d = value ? new Date(value) : new Date();
  return d.toISOString().slice(0, 10);
}

async function getDailyBrief(userId, date) {
  const r = await adminRequest('/rest/v1/daily_briefs?user_id=eq.' + encodeURIComponent(userId) + '&brief_date=eq.' + encodeURIComponent(date) + '&select=*');
  return r.ok && Array.isArray(r.data) && r.data.length ? r.data[0] : null;
}

async function listDailyBriefs(userId, limit) {
  const r = await adminRequest('/rest/v1/daily_briefs?user_id=eq.' + encodeURIComponent(userId) + '&select=id,brief_date,status,brief,created_at&order=brief_date.desc&limit=' + String(limit || 14));
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

async function reserveDailyBrief(userId, date) {
  const existing = await getDailyBrief(userId, date);
  if (existing && existing.status === 'completed') return { ok: false, code: 'exists', brief: existing };
  if (existing && existing.status === 'generating') {
    const age = Date.now() - new Date(existing.updated_at || existing.created_at).getTime();
    if (age < 10 * 60 * 1000) return { ok: false, code: 'generating', brief: existing };
  }
  const now = new Date().toISOString();
  if (existing) {
    const r = await adminRequest('/rest/v1/daily_briefs?id=eq.' + encodeURIComponent(existing.id) + '&updated_at=eq.' + encodeURIComponent(existing.updated_at || existing.created_at), {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ status: 'generating', error: null, updated_at: now })
    });
    if (r.ok && r.data && r.data[0]) return { ok: true, code: 'reserved', brief: r.data[0] };
    return { ok: false, code: 'generating' };
  }
  const r = await adminRequest('/rest/v1/daily_briefs', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify([{ user_id: userId, brief_date: date, status: 'generating', updated_at: now }])
  });
  if (r.ok && r.data && r.data[0]) return { ok: true, code: 'reserved', brief: r.data[0] };
  return { ok: false, code: r.status === 409 ? 'generating' : 'unavailable' };
}

async function completeDailyBrief(userId, date, brief) {
  const r = await adminRequest('/rest/v1/daily_briefs?user_id=eq.' + encodeURIComponent(userId) + '&brief_date=eq.' + encodeURIComponent(date) + '&status=eq.generating', {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ status: 'completed', brief: brief, updated_at: new Date().toISOString() })
  });
  return r.ok && r.data && r.data[0] ? r.data[0] : null;
}

async function failDailyBrief(userId, date, message) {
  return adminRequest('/rest/v1/daily_briefs?user_id=eq.' + encodeURIComponent(userId) + '&brief_date=eq.' + encodeURIComponent(date), {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'failed', error: String(message || '').slice(0, 300), updated_at: new Date().toISOString() })
  });
}

function encryptionKey() {
  const secret = process.env.GK_INTEGRATION_ENCRYPTION_KEY || '';
  return secret ? crypto.createHash('sha256').update(secret).digest() : null;
}

function encrypt(value) {
  if (!value) return null;
  const key = encryptionKey();
  if (!key) throw new Error('integration encryption is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

function decrypt(value) {
  if (!value) return null;
  const key = encryptionKey();
  if (!key) throw new Error('integration encryption is not configured');
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('unsupported token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
}

async function getIntegration(userId, provider) {
  const r = await adminRequest('/rest/v1/integration_connections?user_id=eq.' + encodeURIComponent(userId) + '&provider=eq.' + encodeURIComponent(provider) + '&select=*');
  return r.ok && Array.isArray(r.data) && r.data.length ? r.data[0] : null;
}

async function listIntegrations(userId) {
  const r = await adminRequest('/rest/v1/integration_connections?user_id=eq.' + encodeURIComponent(userId) + '&select=provider,provider_account_id,config,token_expires_at,updated_at&order=provider.asc');
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

async function upsertIntegration(row) {
  const payload = Object.assign({ updated_at: new Date().toISOString() }, row);
  const r = await adminRequest('/rest/v1/integration_connections?on_conflict=user_id%2Cprovider', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([payload])
  });
  return r.ok && r.data && r.data[0] ? r.data[0] : null;
}

async function deleteIntegration(userId, provider) {
  const r = await adminRequest('/rest/v1/integration_connections?user_id=eq.' + encodeURIComponent(userId) + '&provider=eq.' + encodeURIComponent(provider), {
    method: 'DELETE', headers: { prefer: 'return=minimal' }
  });
  return r.ok;
}

module.exports = {
  adminRequest,
  configured,
  getWorkspace,
  reserveWorkspace,
  ensureWorkspace,
  normalizeCompany,
  listReportsToday,
  getActiveReport,
  getReportById,
  listReports,
  reserveReport,
  completeReport,
  failReport,
  listReportSections,
  reserveReportSection,
  completeReportSection,
  failReportSection,
  completeWorkspace,
  failWorkspace,
  listCompletedWorkspaces,
  getAuthUser,
  utcDate,
  getDailyBrief,
  listDailyBriefs,
  reserveDailyBrief,
  completeDailyBrief,
  failDailyBrief,
  encrypt,
  decrypt,
  getIntegration,
  listIntegrations,
  upsertIntegration,
  deleteIntegration
};
