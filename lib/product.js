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
