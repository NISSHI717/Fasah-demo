import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDay, simulateDay, runSimulation, POLICIES, defaultStaff } from '../src/core/simulate.js';
import { createRng } from '../src/core/random.js';
import { bedById, durationRange } from '../src/core/hospital.js';

test('a generated day has 10 approvals per ward and 16 ED arrivals inside their windows', () => {
  const d = generateDay(createRng(1));
  assert.equal(d.approvals.length, 20);
  assert.equal(d.approvals.filter(a => bedById(a.bedId).ward === 'A').length, 10);
  assert.equal(new Set(d.approvals.map(a => a.bedId)).size, 20);
  d.approvals.forEach(a => {
    assert.ok(a.at >= 480 && a.at <= 840);
    for (const step of ['pharmacy', 'transport', 'cleaning']) {
      const [f, , sl] = durationRange(step, bedById(a.bedId));
      assert.ok(a.discharge.durations[step] >= f && a.discharge.durations[step] <= sl);
    }
  });
  assert.equal(d.arrivals.length, 16);
  d.arrivals.forEach(p => assert.ok(p.arrivedAt >= 420 && p.arrivedAt <= 1260));
});

test('same inputs give identical results', () => {
  assert.deepEqual(runSimulation({ days: 5 }), runSimulation({ days: 5 }));
});

test('all three policies run and report sensible numbers', () => {
  assert.deepEqual(Object.keys(POLICIES), ['normal', 'fasah', 'fasah_borrow']);
  for (const policy of Object.keys(POLICIES)) {
    const r = runSimulation({ days: 20, policy });
    assert.equal(r.patients, 320);
    assert.ok(r.pctWithin6h >= 0 && r.pctWithin6h <= 100);
    assert.ok(r.avgBoardingH > 0);
  }
});

test('one day measures every patient once', () => {
  const day = generateDay(createRng(5));
  const r = simulateDay(day, 'normal', defaultStaff());
  assert.equal(r.boarding.length, 16);
  r.boarding.forEach(b => assert.ok(b >= 0));
});

test('zero housekeepers still finishes and is worse than normal', () => {
  const staff = defaultStaff();
  staff.A.housekeeper = 0; staff.B.housekeeper = 0;
  const none = runSimulation({ days: 5, staff });
  const normal = runSimulation({ days: 5 });
  assert.ok(none.pctWithin6h < normal.pctWithin6h);
  assert.equal(none.unplaced, none.patients);
});

test('two extra housekeepers per ward do not make boarding worse', () => {
  const staff = defaultStaff();
  staff.A.housekeeper = 4; staff.B.housekeeper = 4;
  assert.ok(runSimulation({ days: 20, staff }).avgBoardingH <= runSimulation({ days: 20 }).avgBoardingH);
});

test('normal run is calibrated to the Ensiab baseline time till discharge (265 min)', () => {
  const r = runSimulation({ days: 200, policy: 'normal' });
  assert.ok(r.avgTimeToLeaveMin >= 235 && r.avgTimeToLeaveMin <= 295, `got ${r.avgTimeToLeaveMin}`);
  assert.ok(r.pctLeftBeforeNoon >= 0 && r.pctLeftBeforeNoon <= 100);
});
