import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveState } from '../src/core/live.js';

const count = (s, ...st) => Object.values(s.beds).filter(b => st.includes(b.status)).length;

test('live board opens at 11:00 with the slide-8 counts', () => {
  const s = createLiveState();
  assert.equal(s.now, 660);
  assert.equal(count(s, 'occupied'), 18);
  assert.equal(count(s, 'discharge_pending'), 7);
  assert.equal(count(s, 'awaiting_cleaning', 'cleaning'), 5);
  assert.equal(count(s, 'ready'), 6);
});

test('three female non-isolation patients wait in the ED', () => {
  const s = createLiveState();
  assert.equal(s.ed.length, 3);
  s.ed.forEach(p => assert.deepEqual([p.sex, p.isolation], ['F', false]));
});

test('Ward B is short one housekeeper today and says so', () => {
  const s = createLiveState();
  assert.equal(s.staff.B.housekeeper, 1);
  assert.equal(s.staff.A.housekeeper, 2);
  assert.match(s.staffNote, /Ward B/);
});

test('every queued or active task matches its bed record', () => {
  const s = createLiveState();
  const tasks = [...s.active, ...Object.values(s.queues).flatMap(w => Object.values(w).flat())];
  for (const t of tasks) {
    const st = s.beds[t.bedId].steps[t.step];
    assert.ok(st, `${t.bedId} ${t.step}`);
    assert.equal(st.requestedAt, t.requestedAt);
    assert.equal(st.doneAt, null);
  }
});

test('live state is deterministic', () => {
  assert.deepEqual(createLiveState(), createLiveState());
});
