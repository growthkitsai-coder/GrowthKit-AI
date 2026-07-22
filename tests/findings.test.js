'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFindings } = require('../lib/findings');
const advise = require('../api/advise');

test('full report gap stage requires concrete moves and three generated tasks', function () {
  const report = {
    subject: { name: 'Acme' },
    gaps: [1, 2, 3].map(function (n) {
      return { title: 'Gap <em>' + n + '</em>', next_move: 'Test ' + n, checklist: ['Define', 'Launch', 'Review'] };
    })
  };
  assert.equal(advise.validStage('gap_analysis', report), true);
  assert.deepEqual(extractFindings('full_report', report)[0], {
    key: 'gap-01',
    title: 'Gap 1',
    tasks: ['Define', 'Launch', 'Review']
  });
  report.gaps[2].checklist.pop();
  assert.equal(advise.validStage('gap_analysis', report), false);
});

test('daily findings use stable move keys and ignore legacy briefs', function () {
  const brief = {
    next_moves: [{ finding: 'Competitor cut price', action: 'Run a pricing test', checklist: ['Draft', 'Ship', 'Measure'] }]
  };
  assert.deepEqual(extractFindings('daily_brief', brief), [{
    key: 'move-01',
    title: 'Competitor cut price',
    tasks: ['Draft', 'Ship', 'Measure']
  }]);
  assert.deepEqual(extractFindings('daily_brief', { next_moves: [{ action: 'Legacy move' }] }), []);
});
