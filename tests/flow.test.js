import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, approve, advance, completeStep, assignBed, staffAvailable, cloneState } from '../src/core/flow.js';

const staffWith = over => ({
  A: { housekeeper: 2, pharmacist: 1, transporter: 1, ...over },
  B: { housekeeper: 2, pharmacist: 1, transporter: 1, ...over },
});

test('a bed needing pharmacy and transport goes through the whole chain', () => {
  const s = createState({ now: 600 });
  approve(s, 'B20', { needsPharmacy: true, needsTransport: true });
  assert.equal(s.beds.B20.status, 'discharge_pending');
  advance(s, 700);
  assert.equal(s.now, 700);
  assert.equal(s.beds.B20.status, 'ready');
  const byStep = Object.fromEntries(s.log.map(e => [e.step, e]));
  assert.equal(s.log.length, 3);
  assert.equal(byStep.pharmacy.doneAt, 640);
  assert.equal(byStep.transport.doneAt, 625);
  assert.equal(byStep.cleaning.requestedAt, 640);
  assert.equal(byStep.cleaning.startedAt, 640);
  assert.equal(byStep.cleaning.doneAt, 670);
});

test('with one housekeeper the second cleaning waits for the first', () => {
  const s = createState({ now: 600, staff: staffWith({ housekeeper: 1 }) });
  approve(s, 'B01', { needsPharmacy: false, needsTransport: false });
  approve(s, 'B02', { needsPharmacy: false, needsTransport: false });
  advance(s, 700);
  const c = s.log.filter(e => e.step === 'cleaning').sort((x, y) => x.startedAt - y.startedAt);
  assert.deepEqual(c.map(e => [e.bedId, e.startedAt, e.doneAt]), [['B01', 600, 630], ['B02', 630, 660]]);
});

test('a nurse can complete a queued step for housekeeping and it is not redone', () => {
  const s = createState({ now: 600, staff: staffWith({ housekeeper: 1 }) });
  approve(s, 'B01', { needsPharmacy: false, needsTransport: false });
  approve(s, 'B02', { needsPharmacy: false, needsTransport: false });
  advance(s, 610);
  assert.equal(s.queues.A.cleaning.length, 1);
  assert.equal(completeStep(s, 'B02', 'cleaning', 'nurse for housekeeping'), true);
  assert.equal(s.queues.A.cleaning.length, 0);
  assert.equal(s.beds.B02.status, 'ready');
  advance(s, 700);
  const b2 = s.log.filter(e => e.bedId === 'B02');
  assert.equal(b2.length, 1);
  assert.equal(b2[0].updatedBy, 'nurse for housekeeping');
});

test('borrowed staff count only inside their time window', () => {
  const s = createState({ now: 590 });
  s.borrowed.push({ ward: 'A', role: 'housekeeper', from: 600, until: 720 });
  assert.equal(staffAvailable(s, 'A', 'housekeeper'), 2);
  s.now = 600; assert.equal(staffAvailable(s, 'A', 'housekeeper'), 3);
  s.now = 720; assert.equal(staffAvailable(s, 'A', 'housekeeper'), 2);
  assert.equal(staffAvailable(s, 'B', 'housekeeper'), 2);
});

test('auto-assign gives a ready female bed to the longest-waiting female patient only', () => {
  const s = createState({ now: 600 });
  s.ed.push({ id: 'P1', arrivedAt: 500, sex: 'M', isolation: false });
  s.ed.push({ id: 'P2', arrivedAt: 550, sex: 'F', isolation: false });
  s.ed.push({ id: 'P3', arrivedAt: 560, sex: 'F', isolation: false });
  approve(s, 'B20', { needsPharmacy: false, needsTransport: false });
  advance(s, 700, { autoAssign: true });
  assert.deepEqual(s.placed.map(p => [p.patientId, p.bedId, p.assignedAt]), [['P2', 'B20', 630]]);
  assert.deepEqual(s.ed.map(p => p.id), ['P1', 'P3']);
  assert.equal(s.beds.B20.status, 'occupied');
});

test('assignBed by reception places the patient and re-occupies the bed', () => {
  const s = createState({ now: 600 });
  s.ed.push({ id: 'P9', arrivedAt: 590, sex: 'F', isolation: false });
  approve(s, 'B20', { needsPharmacy: false, needsTransport: false });
  advance(s, 640);
  assignBed(s, 'B20', 'P9');
  assert.equal(s.beds.B20.status, 'occupied');
  assert.equal(s.ed.length, 0);
  assert.deepEqual(s.placed[0], { patientId: 'P9', arrivedAt: 590, assignedAt: 640, bedId: 'B20' });
});

test('with zero housekeepers advance still finishes and the task stays queued', () => {
  const s = createState({ now: 600, staff: staffWith({ housekeeper: 0 }) });
  approve(s, 'B01', { needsPharmacy: false, needsTransport: false });
  advance(s, 2000);
  assert.equal(s.now, 2000);
  assert.equal(s.queues.A.cleaning.length, 1);
  assert.equal(s.beds.B01.status, 'awaiting_cleaning');
});

test('scheduled approvals and arrivals happen at their time', () => {
  const s = createState({ now: 420 });
  s.scheduled.push({ at: 500, type: 'approve', bedId: 'B03', discharge: { needsPharmacy: false, needsTransport: false } });
  s.scheduled.push({ at: 450, type: 'arrive', patient: { id: 'X', arrivedAt: 450, sex: 'M', isolation: false } });
  advance(s, 600, { autoAssign: true });
  assert.deepEqual(s.placed.map(p => [p.patientId, p.bedId, p.assignedAt]), [['X', 'B03', 530]]);
});

test('cloneState is independent', () => {
  const s = createState({ now: 600 });
  const c = cloneState(s);
  approve(c, 'B01', { needsPharmacy: true, needsTransport: false });
  assert.equal(s.beds.B01.status, 'occupied');
});
