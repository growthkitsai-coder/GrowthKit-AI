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

// ── reserveReport: the one-report-per-UTC-day gate ──────────────────────────

test('a completed report today blocks a second one (daily_limit)', async function () {
  reset();
  global.fetch = async function (url) {
    if (String(url).indexOf('/reports?') !== -1) {
      return ok([{ id: 'r1', status: 'completed', report_date: todayUtc(), company_name: 'Acme' }]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Beta Co' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'daily_limit');
});

test('a recent in-progress report is resumed, not duplicated', async function () {
  reset();
  let posted = false;
  global.fetch = async function (url, opts) {
    if ((opts && opts.method) === 'POST') posted = true;
    if (String(url).indexOf('/reports?') !== -1) {
      return ok([{ id: 'r1', status: 'generating', started_at: new Date().toISOString(), report_date: todayUtc(), company_name: 'Acme' }]);
    }
    return ok([]);
  };
  const r = await product.reserveReport('user-1', { company: 'Acme' });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'resumed');
  assert.equal(r.report.id, 'r1');
  assert.equal(posted, false); // no new row created
});

test('no report today creates a fresh one for the chosen company', async function () {
  reset();
  global.fetch = async function (url, opts) {
    const u = String(url);
    if (u.indexOf('/reports?') !== -1) return ok([]); // none today
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
