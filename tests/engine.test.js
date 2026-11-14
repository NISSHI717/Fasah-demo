import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoTarget, evaluateTarget, findPlan, applyPlan } from '../src/core/engine.js';
import { createLiveState } from '../src/core/live.js';
import { createState } from '../src/core/flow.js';

const F3 = by => ({ by, needs: [{ sex: 'F', isolation: false, count: 3 }] });

test('no ED patients means no demand', () => {
  const s = createState({ now: 660 });
  const t = autoTarget(s);
  assert.deepEqual(t.needs, []);
  assert.equal(findPlan(s, t).status, 'no_demand');
});

test('auto target groups the ED queue by bed type, due in 2 hours', () => {
  const t = autoTarget(createLiveState());
  assert.deepEqual(t, F3(780));
});

test('live state misses the target with normal order', () => {
  const s = createLiveState();
  const e = evaluateTarget(s, autoTarget(s));
  assert.equal(e.met, false);
  assert.equal(e.achievedAt, 800);
});

test('engine finds the smallest change: prioritize B34 and B28, no extra staff', () => {
  const s = createLiveState();
  const plan = findPlan(s, autoTarget(s));
  assert.equal(plan.status, 'plan');
  assert.deepEqual(plan.changes.map(c => [c.type, c.bedId]), [['prioritize', 'B28'], ['prioritize', 'B34']]);
  plan.changes.forEach(c => { assert.ok(c.approver); assert.ok(c.reason); });
  assert.equal(plan.after.achievedAt, 740);
  assert.equal(plan.before.achievedAt, 800);
  assert.match(plan.notes.join(' '), /B35/);
  assert.ok(plan.tried > 1, `tried ${plan.tried}`);
  assert.equal(plan.candidates, 6); // isolation room goes after, no isolation patient waiting
});

test('approving the plan makes the target met', () => {
  const s = createLiveState();
  const t = autoTarget(s);
  applyPlan(s, findPlan(s, t));
  const e = evaluateTarget(s, t);
  assert.equal(e.met, true);
  assert.equal(e.achievedAt, 740);
});

test('when reordering is not enough the engine borrows a housekeeper', () => {
  const s = createLiveState();
  const plan = findPlan(s, { by: 700, needs: [{ sex: 'F', isolation: false, count: 2 }] });
  assert.equal(plan.status, 'plan');
  const borrow = plan.changes.find(c => c.type === 'borrow');
  assert.ok(borrow);
  assert.equal(borrow.ward, 'B');
  assert.equal(borrow.approver, 'Charge nurse, lending ward');
  assert.ok(plan.after.achievedAt <= 700);
});

test('an already-met target is on track with no changes', () => {
  const s = createLiveState();
  const plan = findPlan(s, { by: 780, needs: [{ sex: 'F', isolation: false, count: 1 }] });
  assert.equal(plan.status, 'on_track');
  assert.deepEqual(plan.changes, []);
});

test('a target nobody can meet says it is not possible and what it would take', () => {
  const s = createLiveState();
  const p1 = findPlan(s, F3(670));
  assert.equal(p1.status, 'not_possible');
  assert.equal(p1.suggestion, 'more_than_one');
  const p2 = findPlan(s, { by: 780, needs: [{ sex: 'F', isolation: true, count: 10 }] });
  assert.equal(p2.status, 'not_possible');
  assert.equal(p2.suggestion, 'more_than_one');
});
