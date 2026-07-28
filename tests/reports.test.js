'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const product = require('../lib/product');
const beta = require('../lib/beta');

// These modules talk to Supabase PostgREST over fetch. We stub global.fetch and
// route by table name + method, so the daily-limit and beta-counter logic can be
// exercised without a database.

function reset() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
}
function cleanup() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete global.fetch;
}
test.afterEach(cleanup);

function ok(rows) {
  return { ok: true, status: 200, json: async function () { return rows; } };
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}
function completedRow(id, company, completedAt) {
  return { id, status: 'completed', company_name: company, company_key: company.toLowerCase(), completed_at: completedAt, created_at: completedAt };
}

// ── allowanceFrom: the rolling 2-per-7-days window ──────────────────────────

test('allowance counts completed reports and reports the next unlock', function () {
  const rows = [completedRow('r2', 'Acme', daysAgo(1)), completedRow('r1', 'Acme', daysAgo(5))];
  const a = product.allowanceFrom(rows);
  assert.equal(a.used, 2);
  assert.equal(a.limit, 2);
  assert.equal(a.remaining, 0);
  assert.equal(a.window_days, 7);
  // The OLDER of the two leaves the window first: 5 days ago + 7 days.
  const expected = new Date(new Date(daysAgo(5)).getTime() + 7 * 24 * 3600 * 1000).getTime();
  assert.ok(Math.abs(new Date(a.next_available_at).getTime() - expected) < 2000);
});

test('a failed or generating report does not consume an allowance slot', function () {
  const a = product.allowanceFrom([
    completedRow('r1', 'Acme', daysAgo(2)),
    { id: 'r2', status: 'failed', created_at: daysAgo(1) },
    { id: 'r3', status: 'generating', created_at: daysAgo(0) }
  ]);
  assert.equal(a.used, 1);
  assert.equal(a.remaining, 1);
  assert.equal(a.next_available_at, null);
});

// ── reserveReport: the rolling-window gate ─────────────────────────────────

test('two completed reports in the window block a third (weekly_limit)', async function () {
  reset();
  global.fetch = async function (url) {
    if (String(url).indexOf('/reports?') !== -1) {
      return ok([completedRow('r2', 'Acme', daysAgo(1)), completedRow('r1', 'Acme', daysAgo(4))]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Beta Co' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'weekly_limit');
  assert.equal(r.allowance.remaining, 0);
  assert.ok(r.allowance.next_available_at);
});

test('one completed report in the window still allows a second, on any company', async function () {
  reset();
  global.fetch = async function (url, opts) {
    const u = String(url);
    if (u.indexOf('/reports?') !== -1 && !(opts && opts.method)) {
      return ok([completedRow('r1', 'Acme', daysAgo(2))]);
    }
    if (u.indexOf('/rest/v1/reports') !== -1 && (opts && opts.method) === 'POST') {
      return ok([Object.assign({ id: 'r-new' }, JSON.parse(opts.body)[0])]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Different Co' });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'reserved');
  assert.equal(r.report.company_name, 'Different Co');
});

test('a recent in-progress report is resumed, not duplicated', async function () {
  reset();
  let posted = false;
  global.fetch = async function (url, opts) {
    if ((opts && opts.method) === 'POST') posted = true;
    if (String(url).indexOf('/reports?') !== -1) {
      return ok([{ id: 'r1', status: 'generating', started_at: new Date().toISOString(), report_date: todayUtc(), company_name: 'Acme', company_key: 'acme' }]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Acme' });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'resumed');
  assert.equal(r.report.id, 'r1');
  assert.equal(posted, false); // no new row created
});

test('resuming is allowed even with the window spent, it was never charged', async function () {
  reset();
  global.fetch = async function (url) {
    if (String(url).indexOf('/reports?') !== -1) {
      return ok([
        { id: 'r3', status: 'generating', started_at: new Date().toISOString(), company_name: 'Acme', company_key: 'acme' },
        completedRow('r2', 'Acme', daysAgo(1)),
        completedRow('r1', 'Acme', daysAgo(3))
      ]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Acme' });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'resumed');
  assert.equal(r.report.id, 'r3');
});

test('a stale report for a different company is abandoned, not reused', async function () {
  reset();
  let failedStale = false;
  let insertedCompany = null;
  global.fetch = async function (url, opts) {
    const u = String(url);
    const method = opts && opts.method;
    if (method === 'PATCH' && u.indexOf('status=eq.generating') !== -1) { failedStale = true; return ok([]); }
    if (u.indexOf('/reports?') !== -1 && !method) {
      // Stale: started 20 minutes ago, well past the 10-minute resume window.
      return ok([{ id: 'r1', status: 'generating', started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), company_name: 'Old Co', company_key: 'old co' }]);
    }
    if (u.indexOf('/rest/v1/reports') !== -1 && method === 'POST') {
      const body = JSON.parse(opts.body)[0];
      insertedCompany = body.company_name;
      return ok([Object.assign({ id: 'r-new' }, body)]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'New Co' });
  assert.equal(failedStale, true);          // the old row was failed, freeing its sections
  assert.equal(r.ok, true);
  assert.equal(r.code, 'reserved');
  assert.equal(insertedCompany, 'New Co');  // a fresh report_id, not the stale one
});

test('a fresh account creates a report for the chosen company', async function () {
  reset();
  global.fetch = async function (url, opts) {
    const u = String(url);
    if (u.indexOf('/reports?') !== -1 && !(opts && opts.method)) return ok([]);
    if (u.indexOf('/rest/v1/reports') !== -1 && (opts && opts.method) === 'POST') {
      const body = JSON.parse(opts.body)[0];
      return ok([Object.assign({ id: 'r-new' }, body)]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'New Market Co' });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'reserved');
  assert.equal(r.report.company_name, 'New Market Co');
  assert.equal(r.report.report_date, todayUtc());
  assert.equal(r.report.status, 'generating');
});

test('starting a report with no company is rejected', async function () {
  reset();
  global.fetch = async function () { return ok([]); };
  const r = await product.reserveReport('user-1', {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_company');
});

// ── beta.consumeReport: charges the 7-report grant, expires at the limit ────

test('consumeReport increments usage and leaves the grant active below the limit', async function () {
  reset();
  let patched = null;
  global.fetch = async function (url, opts) {
    if ((opts && opts.method) === 'PATCH') {
      patched = JSON.parse(opts.body);
      return ok([Object.assign({ user_id: 'user-1', reports_limit: 7 }, patched)]);
    }
    return ok([{ user_id: 'user-1', status: 'approved', reports_used: 2, reports_limit: 7 }]);
  };
  const r = await beta.consumeReport('user-1');
  assert.equal(r.ok, true);
  assert.equal(patched.reports_used, 3);
  assert.equal(patched.status, undefined); // not expired yet
});

test('consuming the 7th report expires the grant', async function () {
  reset();
  let patched = null;
  global.fetch = async function (url, opts) {
    if ((opts && opts.method) === 'PATCH') {
      patched = JSON.parse(opts.body);
      return ok([Object.assign({ user_id: 'user-1', reports_limit: 7 }, patched)]);
    }
    return ok([{ user_id: 'user-1', status: 'approved', reports_used: 6, reports_limit: 7 }]);
  };
  const r = await beta.consumeReport('user-1');
  assert.equal(r.ok, true);
  assert.equal(patched.reports_used, 7);
  assert.equal(patched.status, 'expired'); // window closes at the limit
});

// ── completeReport: guarded transition (drives the beta charge) ─────────────

test('completeReport reports true only when it made the generating→completed move', async function () {
  reset();
  global.fetch = async function () { return ok([{ id: 'r1', status: 'completed' }]); };
  const did = await product.completeReport('r1', { subject: {} });
  assert.equal(did, true);

  global.fetch = async function () { return ok([]); }; // guard matched nothing (already completed)
  const again = await product.completeReport('r1', { subject: {} });
  assert.equal(again, false);
});
