'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAccess } = require('../lib/subscriptions');
const stripeWebhook = require('../api/stripe-webhook');

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GK_BETA_ENABLED',
  'GK_BETA_OPEN',
  'GK_BETA_EMAILS',
  'GK_BETA_EXPIRES_AT',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_AGENTIC'
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
  assert.equal(access.plan, 'pro');
});

test('allowlist accepts newline, semicolon, and JSON-array Vercel paste formats', async function () {
  process.env.GK_BETA_EMAILS = 'first@example.com\nsecond@example.com; third@example.com';
  const newlineAccess = await checkAccess({ id: 'user-1', email: 'second@example.com' });
  assert.equal(newlineAccess.allowed, true);
  assert.equal(newlineAccess.reason, 'beta-allowlist');

  process.env.GK_BETA_EMAILS = '["fourth@example.com", "fifth@example.com"]';
  const jsonAccess = await checkAccess({ id: 'user-2', email: 'fifth@example.com' });
  assert.equal(jsonAccess.allowed, true);
  assert.equal(jsonAccess.reason, 'beta-allowlist');
});

test('allowlist can match a Supabase OAuth identity metadata email', async function () {
  process.env.GK_BETA_EMAILS = 'oauth-founder@example.com';
  const access = await checkAccess({
    id: 'user-1',
    email: '',
    user_metadata: {},
    identities: [{ identity_data: { email: ' OAuth-Founder@Example.com ' } }]
  });
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'beta-allowlist');
});

test('user-editable Supabase metadata cannot grant beta access', async function () {
  process.env.GK_BETA_EMAILS = 'invited@example.com';
  const access = await checkAccess({
    id: 'user-1',
    email: 'other@example.com',
    user_metadata: { email: 'invited@example.com' }
  });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-email-mismatch');
});

test('configured allowlist reports an email mismatch without exposing its values', async function () {
  process.env.GK_BETA_EMAILS = 'invited@example.com';
  const access = await checkAccess({ id: 'user-1', email: 'other@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-email-mismatch');
});

test('beta kill switch overrides open beta and allowlist', async function () {
  process.env.GK_BETA_ENABLED = '0';
  process.env.GK_BETA_OPEN = '1';
  process.env.GK_BETA_EMAILS = 'founder@example.com';
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-disabled');
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

test('beta access stops at the configured expiry', async function () {
  process.env.GK_BETA_EMAILS = 'founder@example.com';
  process.env.GK_BETA_EXPIRES_AT = '2000-01-01T00:00:00.000Z';
  const expired = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(expired.allowed, false);
  assert.equal(expired.plan, 'free');
  assert.equal(expired.reason, 'beta-expired');

  process.env.GK_BETA_EXPIRES_AT = '2999-01-01T00:00:00.000Z';
  const current = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(current.allowed, true);
  assert.equal(current.plan, 'pro');
  assert.equal(current.expires_at, '2999-01-01T00:00:00.000Z');
});

test('an invalid configured beta expiry fails closed', async function () {
  process.env.GK_BETA_OPEN = '1';
  process.env.GK_BETA_EXPIRES_AT = 'not-a-date';
  const access = await checkAccess({ id: 'user-1', email: 'founder@example.com' });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'beta-expired');
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
