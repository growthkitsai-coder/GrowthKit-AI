'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const advise = require('../api/advise');

test('market opportunity contract accepts sizing, segments, trend, and indexed demand', function () {
  const output = {
    market_opportunity: {
      tam: { value: '£1.2bn' },
      sam: { value: '£240m' },
      som: { value: '£12m' },
      target_segments: [
        { name: 'Segment A' },
        { name: 'Segment B' },
        { name: 'Segment C' }
      ],
      market_trend: { available: true, points: [{ label: '2022', value: 40 }, { label: '2026', value: 76 }] },
      search_demand: { available: false, points: [] }
    },
    opportunity_sources: []
  };
  assert.equal(advise.validStage('opportunity', output), true);
  output.market_opportunity.search_demand = { available: true, points: [] };
  assert.equal(advise.validStage('opportunity', output), false);
});

test('GTM timing contract requires three measurable plays and an opportunity window', function () {
  const play = { segment: 'Seed SaaS', channel: 'Founder communities', first_test: 'Run 10 interviews', metric: 'Booked calls' };
  const output = {
    gtm_strategy: [Object.assign({ priority: 1 }, play), Object.assign({ priority: 2 }, play), Object.assign({ priority: 3 }, play)],
    window_of_opportunity: { status: 'open', score: 78, next_move: 'Launch the first test this week' }
  };
  assert.equal(advise.validStage('strategy_timing', output), true);
  output.gtm_strategy.pop();
  assert.equal(advise.validStage('strategy_timing', output), false);
});

test('capital contract supports unavailable evidence without invented funding rows', function () {
  const output = {
    funding_landscape: {
      available: false,
      radar_axes: [],
      radar_entities: [],
      comparable_companies: [],
      active_investors: [],
      recent_rounds: []
    },
    funding_sources: []
  };
  assert.equal(advise.validStage('capital_metrics', output), true);
  output.funding_landscape.available = true;
  assert.equal(advise.validStage('capital_metrics', output), false);
});

test('legacy completed reports mark expansion stages not applicable', function () {
  const state = advise.publicState({
    id: 'report-1',
    status: 'completed',
    company_name: 'Legacy Co',
    full_report: { subject: { name: 'Legacy Co' }, plan: [] }
  }, []);
  assert.equal(state.stages.opportunity.status, 'not_applicable');
  assert.equal(state.stages.strategy_timing.status, 'not_applicable');
  assert.equal(state.stages.capital_metrics.status, 'not_applicable');
});

test('new reports expose all three expansion stages and merge their output', function () {
  const rows = [
    { section: 'opportunity', status: 'completed', output: { market_opportunity: { tam: { value: '£1bn' } } } },
    { section: 'strategy_timing', status: 'completed', output: { gtm_strategy: [] } },
    { section: 'capital_metrics', status: 'completed', output: { funding_landscape: { available: false }, weekly_metrics: {} } }
  ];
  const state = advise.publicState({ id: 'report-2', status: 'generating', company_name: 'New Co' }, rows);
  assert.equal(state.stages.opportunity.status, 'completed');
  assert.equal(state.stages.strategy_timing.status, 'completed');
  assert.equal(state.stages.capital_metrics.status, 'completed');
  assert.equal(state.deliverable.market_opportunity.tam.value, '£1bn');
});
