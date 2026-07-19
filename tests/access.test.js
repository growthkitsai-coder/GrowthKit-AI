'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAccess } = require('../lib/subscriptions');

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GK_BETA_ENABLED',
  'GK_BETA_OPEN',
  'GK_BETA_EMAILS'
];

function resetEnv() {
  KEYS.forEach(function (key) { delete process.env[key]; });
  delete global.fetch;
}

test.afterEach(resetEnv);

test('beta access fails closed when no mode or allowlist is configured', async function () {
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'no-subscription');
});

test('allowlist matching trims and lowercases both configured and user email', async function () {
  process.env.GK_BETA_EMAILS = ' FIRST@example.com , second@example.com ';
  const access = await checkAccess({ id: 'user-1', email: '  First@Example.COM ' });
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'beta-allowlist');
});

test('beta kill switch overrides open beta and allowlist', async function () {
  process.env.GK_BETA_ENABLED = '0';
  process.env.GK_BETA_OPEN = '1';
  process.env.GK_BETA_EMAILS = 'founder@example.com';
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
});

test('open beta requires an explicit value of one', async function () {
  process.env.GK_BETA_OPEN = '1';
  const openAccess = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(openAccess.allowed, true);
  assert.equal(openAccess.reason, 'beta-open');

  process.env.GK_BETA_OPEN = 'true';
  const closedAccess = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(closedAccess.allowed, false);
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
