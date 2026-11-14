// The live demo hospital at 11:00 (spec §3 "Live demo state").
// Counts match deck slide 8: 18 occupied, 7 discharge pending, 5 in cleaning, 6 ready.
// Story: Ward B is one housekeeper short today, three women wait in the ED,
// and the isolation room B35 sits ahead of a normal room in the cleaning queue.

import { bedById, typicalOf } from './hospital.js';
import { createState } from './flow.js';

export function createLiveState() {
  const s = createState({ now: 660 });
  s.staff.B.housekeeper = 1;
  s.staffNote = 'Ward B: 1 of 2 housekeepers called in sick today';

  const stepRec = at => ({ requestedAt: at, startedAt: null, doneAt: null, updatedBy: null });
  const ward = id => bedById(id).ward;

  const pending = (id, at, needsPharmacy, needsTransport) => {
    const b = s.beds[id];
    b.status = 'discharge_pending';
    b.discharge = { needsPharmacy, needsTransport };
    b.steps = { approval: { requestedAt: at, startedAt: at, doneAt: at, updatedBy: 'doctor' } };
    if (needsPharmacy) b.steps.pharmacy = stepRec(at);
    if (needsTransport) b.steps.transport = stepRec(at);
  };
  const dirty = (id, approvedAt, cleanRequestedAt) => {
    const b = s.beds[id];
    b.status = 'awaiting_cleaning';
    b.discharge = { needsPharmacy: false, needsTransport: false };
    b.steps = {
      approval: { requestedAt: approvedAt, startedAt: approvedAt, doneAt: approvedAt, updatedBy: 'doctor' },
      cleaning: stepRec(cleanRequestedAt),
    };
  };
  const queue = (id, step) =>
    s.queues[ward(id)][step].push({ bedId: id, step, ward: ward(id), requestedAt: s.beds[id].steps[step].requestedAt });
  const active = (id, step, startedAt) => {
    const rec = s.beds[id].steps[step];
    rec.startedAt = startedAt;
    s.active.push({ bedId: id, step, ward: ward(id), requestedAt: rec.requestedAt, startedAt, doneAt: startedAt + typicalOf(step, bedById(id)) });
    if (step === 'cleaning') s.beds[id].status = 'cleaning';
  };
  const done = (id, step, startedAt, doneAt, by) => {
    const rec = s.beds[id].steps[step];
    Object.assign(rec, { startedAt, doneAt, updatedBy: by });
    s.log.push({ bedId: id, step, ward: ward(id), requestedAt: rec.requestedAt, startedAt, doneAt, updatedBy: by });
  };
  const ready = (id, at) => Object.assign(s.beds[id], { status: 'ready', readyAt: at });

  // Ward A (male) — calm
  pending('B10', 620, true, false); active('B10', 'pharmacy', 640);
  pending('B11', 630, true, true); queue('B11', 'pharmacy'); active('B11', 'transport', 650);
  dirty('B12', 600, 640); active('B12', 'cleaning', 645);
  dirty('B13', 610, 650); active('B13', 'cleaning', 655);
  [['B14', 560], ['B15', 590], ['B16', 610], ['B17', 630], ['B18', 650]].forEach(([id, at]) => ready(id, at));

  // Ward B (female) — the bottleneck
  pending('B28', 590, true, true); done('B28', 'transport', 605, 630, 'transporter'); active('B28', 'pharmacy', 650);
  pending('B29', 600, true, true); queue('B29', 'pharmacy'); active('B29', 'transport', 650);
  pending('B30', 610, true, false); queue('B30', 'pharmacy');
  pending('B31', 620, true, true); queue('B31', 'pharmacy'); queue('B31', 'transport');
  pending('B32', 640, false, true); queue('B32', 'transport');
  dirty('B33', 590, 630); active('B33', 'cleaning', 650);
  dirty('B35', 600, 640); queue('B35', 'cleaning'); // isolation room, 60 min clean
  dirty('B34', 615, 655); queue('B34', 'cleaning');
  ready('B36', 620);

  s.ed = [
    { id: 'ED-01', arrivedAt: 580, sex: 'F', isolation: false },
    { id: 'ED-02', arrivedAt: 620, sex: 'F', isolation: false },
    { id: 'ED-03', arrivedAt: 655, sex: 'F', isolation: false },
  ];
  return s;
}
