import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predict, confidenceOf } from '../src/core/predict.js';
import { createLiveState } from '../src/core/live.js';

test('confidence comes from the width of the range', () => {
  assert.equal(confidenceOf(30), 'High');
  assert.equal(confidenceOf(31), 'Moderate');
  assert.equal(confidenceOf(60), 'Moderate');
  assert.equal(confidenceOf(61), 'Low');
});

test('every non-occupied bed gets fast <= typical <= slow', () => {
  const s = createLiveState();
  const p = predict(s);
  const ids = Object.keys(s.beds).filter(id => s.beds[id].status !== 'occupied');
  assert.deepEqual(Object.keys(p).sort(), ids.sort());
  for (const id of ids) {
    const r = p[id];
    assert.ok(r.fast <= r.typical && r.typical <= r.slow, `${id} ${r.fast} ${r.typical} ${r.slow}`);
    assert.ok(r.fast >= s.now);
  }
});

test('ready beds are confirmed now; others carry a stage and queue positions', () => {
  const s = createLiveState();
  const p = predict(s);
  assert.deepEqual(p.B14, { fast: 660, typical: 660, slow: 660, confidence: 'Confirmed', stage: 'Ready for assignment', waits: [] });
  assert.equal(p.B33.stage, 'Cleaning in progress');
  assert.equal(p.B34.stage, 'Waiting for cleaning');
  assert.deepEqual(p.B34.waits, [{ step: 'cleaning', position: 2 }]);
  assert.equal(p.B33.typical, 680);
  assert.equal(p.B34.typical, 770);
  assert.equal(p.B28.typical, 800);
});

test('predict does not change the state it reads', () => {
  const s = createLiveState();
  const before = JSON.stringify(s);
  predict(s);
  assert.equal(JSON.stringify(s), before);
});

test('queue order changes the prediction', () => {
  const s = createLiveState();
  const base = predict(s).B34.typical;
  s.queues.B.cleaning.reverse(); // B34 now ahead of isolation room B35
  assert.ok(predict(s).B34.typical < base);
});
