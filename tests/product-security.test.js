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

// ── Daily update: failures must name themselves ─────────────────────────────
// One opaque "Could not prepare today's update" for three different causes made
// this undiagnosable in production (2026-07-27). Each mode now reports a code
// and a detail.

const { generateDailyBrief } = require('../lib/daily');

const DAILY_REPORT = {
  id: 'rep-1', company_name: 'Northwind Labs', website: 'https://northwindlabs.com',
  competitors: 'a, b', profile_text: 'seed b2b', report_date: '2026-07-26',
  full_report: { subject: { name: 'Northwind Labs' } }
};

function dailyFetch(options) {
  const state = {};
  return async function (url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.indexOf('anthropic.com') !== -1) {
      if (options.modelStatus) {
        return { ok: false, status: options.modelStatus, json: async () => ({ error: { message: options.modelMessage } }) };
      }
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(options.brief) }] }) };
    }
    if (u.indexOf('/integration_connections') !== -1) return { ok: true, status: 200, json: async () => [] };
    if (u.indexOf('/daily_briefs') !== -1) {
      if (method === 'GET') return { ok: true, status: 200, json: async () => (state.row ? [state.row] : []) };
      if (method === 'POST') {
        if (options.missingColumns) {
          return { ok: false, status: 400, json: async () => ({ code: '42703', message: 'column "report_id" of relation "daily_briefs" does not exist' }) };
        }
        state.row = Object.assign({ id: 'b1' }, JSON.parse(init.body)[0]);
        return { ok: true, status: 201, json: async () => [state.row] };
      }
      if (method === 'PATCH') {
        state.row = Object.assign({}, state.row, JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => [state.row] };
      }
    }
    return { ok: true, status: 200, json: async () => [] };
  };
}

function dailyEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.ANTHROPIC_API_KEY = 'sk-test';
}
test.afterEach(function () {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete global.fetch;
});

const GOOD_BRIEF = {
  no_material_change: false,
  lead: { headline: 'Rival cut prices', detail: 'd', why_it_matters: 'w' },
  market_competitor_movement: [], own_metrics: [], market_signals: [],
  next_moves: [1, 2, 3].map(function (p) {
    return { priority: p, finding: 'f' + p, action: 'a', because: 'b', checklist: ['x', 'y', 'z'] };
  }),
  founder_to_talk_to: { name: 'n', company: 'c', why_today: 'w', public_url: null },
  tool_prompt: { tool: 't', reason: 'r', prompt: 'p' },
  sources: [{ title: 's', url: 'https://example.com' }]
};

test('a daily update is stamped with the report and company it was cut against', async function () {
  dailyEnv();
  global.fetch = dailyFetch({ brief: GOOD_BRIEF });
  const result = await generateDailyBrief({ id: 'user-1' }, DAILY_REPORT);
  assert.equal(result.ok, true);
  assert.equal(result.row.status, 'completed');
  assert.equal(result.row.report_id, 'rep-1');
  assert.equal(result.row.company_name, 'Northwind Labs');
  assert.equal(result.row.company_key, 'northwind labs');
});

test('an unrun migration reports the missing column, not a generic failure', async function () {
  dailyEnv();
  global.fetch = dailyFetch({ brief: GOOD_BRIEF, missingColumns: true });
  const result = await generateDailyBrief({ id: 'user-1' }, DAILY_REPORT);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable');
  assert.match(result.detail, /42703/);
  assert.match(result.detail, /report_id/);
});

test('a provider error carries the provider reason (an empty balance reads as 400)', async function () {
  dailyEnv();
  global.fetch = dailyFetch({ brief: GOOD_BRIEF, modelStatus: 400, modelMessage: 'credit balance is too low' });
  const result = await generateDailyBrief({ id: 'user-1' }, DAILY_REPORT);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'generation_failed');
  assert.match(result.detail, /credit balance is too low/);
});

// ── normalizeBrief: repair a near-miss instead of losing the whole call ──────
// A strict all-or-nothing contract meant one missing optional block threw away a
// paid model call and showed "response was incomplete" (2026-07-27).

const { normalizeBrief } = require('../lib/daily');

test('a brief missing the optional founder and tool blocks is still accepted', function () {
  const result = normalizeBrief({
    lead: { headline: 'Rival cut prices', detail: 'd', why_it_matters: 'w' },
    market_competitor_movement: [], own_metrics: [], market_signals: [],
    next_moves: [1, 2, 3].map(function (p) {
      return { priority: p, finding: 'f' + p, action: 'a', because: 'b', checklist: ['x', 'y', 'z'] };
    }),
    sources: []
  });
  assert.equal(result.ok, true);
  assert.equal(result.brief.founder_to_talk_to, null);
  assert.equal(result.brief.tool_prompt, null);
  assert.deepEqual(result.missing, ['founder_to_talk_to', 'tool_prompt']);
});

test('two good moves are kept rather than rejected for not being three', function () {
  const result = normalizeBrief({
    lead: { headline: 'Signal' },
    next_moves: [
      { priority: 1, finding: 'f1', action: 'a', because: 'b', checklist: ['x', 'y', 'z'] },
      { priority: 2, finding: 'f2', action: 'a', because: 'b' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.brief.next_moves.length, 2);
  assert.deepEqual(result.brief.next_moves[0].checklist, ['x', 'y', 'z']);
  assert.deepEqual(result.brief.next_moves[1].checklist, []); // short list dropped, move kept
  assert.ok(result.missing.indexOf('next_moves(2/3)') !== -1);
});

test('a brief with no headline or no usable move is still rejected', function () {
  assert.equal(normalizeBrief({ next_moves: [{ finding: 'f', action: 'a' }] }).ok, false);
  assert.deepEqual(normalizeBrief({ lead: { headline: 'h' }, next_moves: [] }).missing, ['next_moves']);
  assert.equal(normalizeBrief(null).ok, false);
});

test('normalizeBrief never lets a non-array section reach the renderer', function () {
  const result = normalizeBrief({
    lead: { headline: 'h' },
    market_competitor_movement: 'not an array',
    next_moves: [{ finding: 'f', action: 'a', because: 'b', checklist: ['x', 'y', 'z'] }]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.brief.market_competitor_movement, []);
  assert.deepEqual(result.brief.own_metrics, []);
  assert.deepEqual(result.brief.sources, []);
});
