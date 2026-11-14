import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDelays } from '../src/core/analyzer.js';

const log = [
  { bedId: 'B30', step: 'cleaning', ward: 'B', requestedAt: 780, startedAt: 840, doneAt: 870 },
  { bedId: 'B02', step: 'pharmacy', ward: 'A', requestedAt: 500, startedAt: 520, doneAt: 560 },
  { bedId: 'B31', step: 'transport', ward: 'B', requestedAt: 1000, startedAt: 1020, doneAt: 1045 },
];

test('waiting time is split by step, ward and time band', () => {
  const a = analyzeDelays(log);
  assert.equal(a.totalWait, 100);
  assert.deepEqual(a.byStep, { pharmacy: 20, transport: 20, cleaning: 60 });
  assert.deepEqual(a.share, { pharmacy: 20, transport: 20, cleaning: 60 });
  assert.deepEqual(a.byWard, { A: 20, B: 80 });
  assert.deepEqual(a.byBand, { '08–12': 20, '12–16': 60, '16–22': 20, other: 0 });
  assert.deepEqual(a.top, { step: 'cleaning', share: 60, ward: 'B', band: '12–16' });
  assert.equal(a.headline, 'Cleaning caused 60% of waiting time, mostly Ward B, 12–16.');
});

test('an empty log says so', () => {
  const a = analyzeDelays([]);
  assert.equal(a.totalWait, 0);
  assert.equal(a.top, null);
  assert.equal(a.headline, 'No completed steps yet.');
});
