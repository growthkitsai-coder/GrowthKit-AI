'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../lib/product');
const { createState, readState, siteUrl, authorizationUrl } = require('../lib/integrations');
const { extractJson, validBrief } = require('../lib/daily');

test.afterEach(function () {
  delete process.env.GK_INTEGRATION_ENCRYPTION_KEY;
  delete process.env.GK_OAUTH_STATE_SECRET;
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_SCOPES;
  delete process.env.SITE_URL;
});

test('integration credentials encrypt with authenticated round-trip storage', function () {
  process.env.GK_INTEGRATION_ENCRYPTION_KEY = 'test-key-one';
  const ciphertext = encrypt('refresh-token-value');
  assert.notEqual(ciphertext, 'refresh-token-value');
  assert.equal(decrypt(ciphertext), 'refresh-token-value');

  process.env.GK_INTEGRATION_ENCRYPTION_KEY = 'test-key-two';
  assert.throws(function () { decrypt(ciphertext); });
});

test('OAuth state is signed and rejects tampering', function () {
  process.env.GK_OAUTH_STATE_SECRET = 'state-test-secret';
  const state = createState('user-1', 'google_analytics');
  assert.equal(readState(state).user_id, 'user-1');
  assert.equal(readState(state).provider, 'google_analytics');
  const parts = state.split('.');
  parts[1] = (parts[1][0] === 'a' ? 'b' : 'a') + parts[1].slice(1);
  assert.equal(readState(parts.join('.')), null);
});

test('OAuth redirects fall back to the canonical site and LinkedIn read scope', function () {
  process.env.GK_OAUTH_STATE_SECRET = 'state-test-secret';
  process.env.LINKEDIN_CLIENT_ID = 'linkedin-client';
  assert.equal(siteUrl({ headers: { host: 'attacker.example' } }), 'https://growthkitai.com');
  const url = new URL(authorizationUrl('linkedin', 'user-1', { headers: { host: 'attacker.example' } }));
  assert.equal(url.searchParams.get('redirect_uri'), 'https://growthkitai.com/api/integration-callback');
  assert.equal(url.searchParams.get('scope'), 'rw_organization_admin r_organization_social');
});

test('daily JSON extraction handles surrounding prose and braces in strings', function () {
  const parsed = extractJson('Result: {"lead":{"headline":"Watch {this}"},"next_moves":[]} trailing');
  assert.equal(parsed.lead.headline, 'Watch {this}');
});

test('daily contract requires all sections and exactly three moves', function () {
  const brief = {
    lead: { headline: 'Signal' },
    market_competitor_movement: [],
    own_metrics: [],
    market_signals: [],
    next_moves: [1, 2, 3].map(function (priority) {
      return {
        priority: priority,
        finding: 'Specific finding ' + priority,
        action: 'Run test ' + priority,
        because: 'Evidence supports it',
        checklist: ['Define the test', 'Launch the test', 'Review the result']
      };
    }),
    founder_to_talk_to: {},
    tool_prompt: {},
    sources: []
  };
  assert.equal(validBrief(brief), true);
  brief.next_moves.pop();
  assert.equal(validBrief(brief), false);
});

test('daily contract rejects a move without a three-step checklist', function () {
  const brief = {
    lead: { headline: 'Signal' },
    market_competitor_movement: [],
    own_metrics: [],
    market_signals: [],
    next_moves: [1, 2, 3].map(function (priority) {
      return { priority: priority, finding: 'Finding', action: 'Act', because: 'Why', checklist: ['One', 'Two', 'Three'] };
    }),
    founder_to_talk_to: {},
    tool_prompt: {},
    sources: []
  };
  brief.next_moves[1].checklist = ['Only one'];
  assert.equal(validBrief(brief), false);
});
