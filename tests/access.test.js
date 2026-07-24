'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAccess } = require('../lib/subscriptions');
const stripeWebhook = require('../api/stripe-webhook');

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GK_BETA_ENABLED',
  'GK_BETA_EXPIRES_AT',
  'GK_ADMIN_USER_IDS',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_AGENTIC'
];

function resetEnv() {
  KEYS.forEach(function (key) { delete process.env[key]; });
  delete global.fetch;
}

test.afterEach(resetEnv);

// ── DB-backed beta (2026-07-24) ─────────────────────────────────────────────
// checkAccess now reads `beta_applications` instead of the GK_BETA_EMAILS env
// var. These helpers stand in for Supabase PostgREST, routing by table name
// because checkAccess makes two reads: subscriptions, then beta_applications.

function jsonRes(rows) {
  return { ok: true, status: 200, json: async function () { return rows; } };
}

function mockDb(options) {
  const opts = options || {};
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  global.fetch = async function (url) {
    const u = String(url);
    if (u.indexOf('beta_applications') !== -1) {
      if (opts.betaUnreachable) return { ok: false, status: 500, json: async function () { return null; } };
      return jsonRes(opts.application ? [opts.application] : []);
    }
    if (u.indexOf('subscriptions') !== -1) {
      return jsonRes(opts.subscription ? [opts.subscription] : []);
    }
    return jsonRes([]);
  };
}

// An approved grant, mid-window, with reports left.
function approvedRow(overrides) {
  return Object.assign({
    user_id: 'user-1',
    email: 'founder@example.com',
    status: 'approved',
    approved_at: '2026-07-24T00:00:00.000Z',
    expires_at: '2999-01-01T00:00:00.000Z',
    reports_used: 0,
    reports_limit: 7
  }, overrides || {});
}

test('an account that never applied gets no beta access', async function () {
  mockDb({});
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-not-applied');
  assert.equal(access.plan, 'free');
});

test('applying alone grants nothing until Avi approves', async function () {
  mockDb({ application: approvedRow({ status: 'pending', approved_at: null, expires_at: null }) });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-pending');
});

test('an approved grant inside its window unlocks Pro-equivalent access', async function () {
  mockDb({ application: approvedRow() });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, true);
  assert.equal(access.plan, 'pro');
  assert.equal(access.status, 'beta');
  assert.equal(access.reason, 'beta-approved');
  assert.equal(access.beta.reports_remaining, 7);
});

test('a grant past its 7-day expiry is refused even though the row still says approved', async function () {
  mockDb({ application: approvedRow({ expires_at: '2000-01-01T00:00:00.000Z' }) });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-expired');
});

test('a grant with all 7 reports spent is refused before its date expires', async function () {
  mockDb({ application: approvedRow({ reports_used: 7 }) });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-reports-spent');
  assert.equal(access.beta.reports_remaining, 0);
});

test('a revoked grant is refused immediately', async function () {
  mockDb({ application: approvedRow({ status: 'revoked' }) });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-revoked');
});

test('the kill switch overrides an otherwise valid approval', async function () {
  mockDb({ application: approvedRow() });
  process.env.GK_BETA_ENABLED = '0';
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-disabled');
});

test('the global cutoff ends every grant at once, and an invalid cutoff fails closed', async function () {
  mockDb({ application: approvedRow() });
  process.env.GK_BETA_EXPIRES_AT = '2000-01-01T00:00:00.000Z';
  const expired = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(expired.allowed, false);
  assert.equal(expired.reason, 'beta-expired');

  process.env.GK_BETA_EXPIRES_AT = 'not-a-date';
  const invalid = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.reason, 'beta-expired');
});

test('an unreachable beta table denies access rather than falling open', async function () {
  mockDb({ betaUnreachable: true });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-unavailable');
});

test('unconfigured Supabase denies beta access', async function () {
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-unavailable');
});

test('a paying subscriber keeps access even when their beta grant is revoked', async function () {
  mockDb({
    subscription: { user_id: 'user-1', plan: 'pro', status: 'active' },
    application: approvedRow({ status: 'revoked' })
  });
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'subscription');
});


test('active paid subscription takes priority even when beta is disabled', async function () {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.GK_BETA_ENABLED = '0';
  global.fetch = async function () {
    return {
      ok: true,
      json: async function () {
        return [{ user_id: 'user-1', plan: 'pro', status: 'active' }];
      }
    };
  };
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'subscription');
});

test('active Agentic subscription is preserved as the Agentic tier', async function () {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  global.fetch = async function () {
    return {
      ok: true,
      json: async function () {
        return [{ user_id: 'user-1', plan: 'agentic', status: 'trialing' }];
      }
    };
  };
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, true);
  assert.equal(access.plan, 'agentic');
  assert.equal(access.reason, 'subscription');
});

test('webhook plan follows the current Stripe price after a portal switch', function () {
  process.env.STRIPE_PRICE_PRO = 'price_pro';
  process.env.STRIPE_PRICE_AGENTIC = 'price_agentic';
  const subscription = {
    metadata: { plan: 'pro' },
    items: { data: [{ price: { id: 'price_agentic' } }] }
  };
  assert.equal(stripeWebhook.planFor(subscription), 'agentic');
  subscription.items.data[0].price.id = 'price_pro';
  subscription.metadata.plan = 'agentic';
  assert.equal(stripeWebhook.planFor(subscription), 'pro');
});
