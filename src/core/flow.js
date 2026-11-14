// Discharge-chain flow engine (spec §4). One event loop shared by the live board,
// predictions, the Minimum Intervention Engine and the simulation.
//
// Chain: approval -> pharmacy + transport (in parallel, each optional)
//        -> patient leaves -> cleaning -> ready.

import { BEDS, CONFIG, WARDS, STEPS, bedById, roleFor, suits, typicalOf } from './hospital.js';

export const FIFO = () => 0;
export const defaultDuration = (task, bed) => typicalOf(task.step, bed);

const emptyQueues = () => Object.fromEntries(WARDS.map(w => [w, { pharmacy: [], transport: [], cleaning: [] }]));

export function createState({ now = 0, staff } = {}) {
  const base = staff ?? { A: CONFIG.staff, B: CONFIG.staff };
  return {
    now,
    beds: Object.fromEntries(BEDS.map(b => [b.id, { status: 'occupied', discharge: null, steps: {}, readyAt: null }])),
    queues: emptyQueues(),
    active: [],
    staff: { A: { ...base.A }, B: { ...base.B } },
    borrowed: [],
    ed: [],
    scheduled: [],
    log: [],
    placed: [],
    priority: [], // bed IDs a charge nurse approved to go first in their queues
  };
}

export const cloneState = s => structuredClone(s);

function enqueue(s, bedId, step) {
  const ward = bedById(bedId).ward;
  s.beds[bedId].steps[step] = { requestedAt: s.now, startedAt: null, doneAt: null, updatedBy: null };
  const q = s.queues[ward][step];
  const task = { bedId, step, ward, requestedAt: s.now };
  if (s.priority.includes(bedId)) q.splice(frontIndex(s, q), 0, task);
  else q.push(task);
}

/** Position right after the prioritized tasks already at the front of a queue. */
export function frontIndex(s, q) {
  let i = 0;
  while (i < q.length && s.priority.includes(q[i].bedId)) i++;
  return i;
}

function leave(s, bedId) {
  s.beds[bedId].status = 'awaiting_cleaning';
  enqueue(s, bedId, 'cleaning');
}

export function approve(s, bedId, discharge, by = 'nurse') {
  const bed = s.beds[bedId];
  bed.status = 'discharge_pending';
  bed.discharge = { ...discharge };
  bed.readyAt = null;
  bed.steps = { approval: { requestedAt: s.now, startedAt: s.now, doneAt: s.now, updatedBy: by } };
  if (discharge.needsPharmacy) enqueue(s, bedId, 'pharmacy');
  if (discharge.needsTransport) enqueue(s, bedId, 'transport');
  if (!discharge.needsPharmacy && !discharge.needsTransport) leave(s, bedId);
}

const isDone = (bed, step) => bed.steps[step]?.doneAt != null;

function finish(s, task, at, by) {
  const bed = s.beds[task.bedId];
  const startedAt = task.startedAt ?? at;
  Object.assign(bed.steps[task.step], { startedAt, doneAt: at, updatedBy: by });
  s.log.push({ bedId: task.bedId, step: task.step, ward: task.ward, requestedAt: task.requestedAt, startedAt, doneAt: at, updatedBy: by });
  if (task.step === 'cleaning') {
    bed.status = 'ready';
    bed.readyAt = at;
    s.priority = s.priority.filter(id => id !== task.bedId);
  } else {
    const d = bed.discharge;
    const pharmacyOk = !d.needsPharmacy || isDone(bed, 'pharmacy');
    const transportOk = !d.needsTransport || isDone(bed, 'transport');
    if (pharmacyOk && transportOk) leave(s, task.bedId);
  }
}

export function staffAvailable(s, ward, role) {
  const borrowed = s.borrowed.filter(b => b.ward === ward && b.role === role && b.from <= s.now && s.now < b.until).length;
  const busy = s.active.filter(t => t.ward === ward && roleFor(t.step) === role).length;
  return s.staff[ward][role] + borrowed - busy;
}

function startTasks(s, o) {
  let changed = false;
  for (const ward of WARDS) {
    for (const step of STEPS) {
      const q = s.queues[ward][step];
      while (q.length && staffAvailable(s, ward, roleFor(step)) > 0) {
        const idx = o.pickNext(q, s, ward, step);
        const task = q.splice(idx, 1)[0];
        const bed = bedById(task.bedId);
        task.startedAt = s.now;
        task.doneAt = s.now + o.duration(task, bed, s);
        s.active.push(task);
        s.beds[task.bedId].steps[step].startedAt = s.now;
        if (step === 'cleaning') s.beds[task.bedId].status = 'cleaning';
        changed = true;
      }
    }
  }
  return changed;
}

export function assignBed(s, bedId, patientId) {
  const i = s.ed.findIndex(p => p.id === patientId);
  const p = s.ed.splice(i, 1)[0];
  Object.assign(s.beds[bedId], { status: 'occupied', discharge: null, steps: {}, readyAt: null });
  s.placed.push({ patientId: p.id, arrivedAt: p.arrivedAt, assignedAt: s.now, bedId });
}

function autoAssign(s) {
  let changed = false;
  for (const p of [...s.ed].sort((a, b) => a.arrivedAt - b.arrivedAt)) {
    const bed = BEDS
      .filter(b => s.beds[b.id].status === 'ready' && suits(b, p))
      .sort((a, b) => s.beds[a.id].readyAt - s.beds[b.id].readyAt)[0];
    if (bed) { assignBed(s, bed.id, p.id); changed = true; }
  }
  return changed;
}

function settle(s, o) {
  for (let guard = 0; guard < 10000; guard++) {
    let changed = false;
    const due = s.scheduled.filter(e => e.at <= s.now).sort((a, b) => a.at - b.at);
    if (due.length) {
      s.scheduled = s.scheduled.filter(e => e.at > s.now);
      for (const e of due) {
        if (e.type === 'approve') approve(s, e.bedId, e.discharge, 'doctor');
        else if (e.type === 'arrive') s.ed.push({ ...e.patient });
      }
      changed = true;
    }
    const done = s.active.filter(t => t.doneAt <= s.now).sort((a, b) => a.doneAt - b.doneAt);
    if (done.length) {
      s.active = s.active.filter(t => t.doneAt > s.now);
      for (const t of done) finish(s, t, t.doneAt, roleFor(t.step));
      changed = true;
    }
    if (o.borrowRule) o.borrowRule(s);
    if (startTasks(s, o)) changed = true;
    if (o.autoAssign && autoAssign(s)) changed = true;
    if (!changed) return;
  }
  throw new Error('flow did not settle');
}

/** Run the hospital forward from s.now to toTime (mutates s). */
export function advance(s, toTime, opts = {}) {
  const o = { duration: defaultDuration, pickNext: FIFO, autoAssign: false, ...opts };
  for (;;) {
    settle(s, o);
    if (s.now >= toTime) break;
    const times = [
      ...s.active.map(t => t.doneAt),
      ...s.scheduled.map(e => e.at),
      ...s.borrowed.flatMap(b => [b.from, b.until]),
    ].filter(t => t > s.now);
    s.now = Math.min(toTime, ...times);
  }
  s.now = toTime;
  return s;
}

/** A nurse (or a department) marks a step done now. Returns false if there is nothing to complete. */
export function completeStep(s, bedId, step, by) {
  const ward = bedById(bedId).ward;
  const q = s.queues[ward][step];
  let i = q.findIndex(t => t.bedId === bedId);
  let task;
  if (i >= 0) task = q.splice(i, 1)[0];
  else {
    i = s.active.findIndex(t => t.bedId === bedId && t.step === step);
    if (i < 0) return false;
    task = s.active.splice(i, 1)[0];
  }
  if (task.startedAt == null) s.beds[bedId].steps[step].startedAt = s.now;
  finish(s, task, s.now, by);
  return true;
}
