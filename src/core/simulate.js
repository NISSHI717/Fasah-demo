// 200-day simulation and What-if planner (spec §9).
// Every policy runs on the same generated days (same approvals, arrivals and step
// durations), so any difference comes from the order FASAH chooses, nothing else.

import { CONFIG, WARDS, BEDS, bedById, suits, typicalOf, poolAt } from './hospital.js';
import { createRng } from './random.js';
import { createState, advance, FIFO } from './flow.js';

export const defaultStaff = () => ({ A: { ...CONFIG.staff }, B: { ...CONFIG.staff } });

const sim = CONFIG.sim;
const round = n => Math.round(n);

export function generateDay(rng) {
  const approvals = [];
  for (const ward of WARDS) {
    const beds = BEDS.filter(b => b.ward === ward).map(b => b.id);
    for (let i = beds.length - 1; i > 0; i--) { // shuffle
      const j = rng.int(0, i);
      [beds[i], beds[j]] = [beds[j], beds[i]];
    }
    for (const bedId of beds.slice(0, sim.approvalsPerWard)) {
      const bed = bedById(bedId);
      const at = rng.int(...sim.approvalWindow);
      const needsPharmacy = rng.bernoulli(CONFIG.pNeedsPharmacy);
      const needsTransport = rng.bernoulli(CONFIG.pNeedsTransport);
      const draw = range => round(rng.triangular(...range));
      const durations = {
        pharmacy: draw(CONFIG.durations.pharmacy),
        transport: draw(CONFIG.durations.transport),
        cleaning: draw(bed.isolation ? CONFIG.durations.cleaningIsolation : CONFIG.durations.cleaning),
      };
      approvals.push({ at, bedId, discharge: { needsPharmacy, needsTransport, durations } });
    }
  }
  const arrivals = Array.from({ length: sim.arrivals }, (_, i) => ({
    id: `P${String(i + 1).padStart(2, '0')}`,
    arrivedAt: rng.int(...sim.arrivalWindow),
    sex: rng.bernoulli(sim.pMale) ? 'M' : 'F',
    isolation: rng.bernoulli(sim.pIsolation),
  }));
  approvals.sort((a, b) => a.at - b.at);
  arrivals.sort((a, b) => a.arrivedAt - b.arrivedAt);
  return { approvals, arrivals };
}

// ---- FASAH ordering: serve the bed the ED is waiting longest for; then the one closest to ready.
function remainingTypical(s, bedId) {
  const bed = bedById(bedId);
  const st = s.beds[bedId];
  const pending = step => st.steps[step] && st.steps[step].doneAt == null;
  const before = Math.max(pending('pharmacy') ? typicalOf('pharmacy', bed) : 0, pending('transport') ? typicalOf('transport', bed) : 0);
  return before + typicalOf('cleaning', bed);
}

function fasahPick(queue, s) {
  const demand = [];
  for (const p of [...s.ed].sort((a, b) => a.arrivedAt - b.arrivedAt)) {
    if (!demand.some(d => d.sex === p.sex && d.isolation === p.isolation)) demand.push(p);
  }
  let best = 0, bestKey = null;
  queue.forEach((task, i) => {
    const bed = bedById(task.bedId);
    const r = demand.findIndex(d => suits(bed, d));
    const key = [r < 0 ? Infinity : r, remainingTypical(s, task.bedId), i];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = i; bestKey = key;
    }
  });
  return best;
}

function borrowRule(s) {
  const active = s.borrowed.filter(b => b.from <= s.now && s.now < b.until);
  for (const ward of WARDS) {
    if (s.queues[ward].cleaning.length < 3) continue;
    if (active.some(b => b.ward === ward)) continue;
    if (poolAt(s.now) - active.length < 1) continue;
    const b = { ward, role: 'housekeeper', from: s.now, until: s.now + CONFIG.borrowLength };
    s.borrowed.push(b);
    active.push(b);
  }
}

export const POLICIES = {
  normal: { label: 'Normal (first-come)', pickNext: FIFO },
  fasah: { label: 'FASAH — reorder only', pickNext: fasahPick },
  fasah_borrow: { label: 'FASAH — reorder + borrow', pickNext: fasahPick, borrowRule },
};

export function simulateDay(day, policyKey, staff = defaultStaff()) {
  const policy = POLICIES[policyKey];
  const s = createState({ now: sim.start, staff });
  s.scheduled = [
    ...day.approvals.map(a => ({ at: a.at, type: 'approve', bedId: a.bedId, discharge: a.discharge })),
    ...day.arrivals.map(p => ({ at: p.arrivedAt, type: 'arrive', patient: p })),
  ];
  advance(s, sim.end, {
    duration: task => s.beds[task.bedId].discharge.durations[task.step],
    pickNext: policy.pickNext,
    borrowRule: policy.borrowRule,
    autoAssign: true,
  });
  const boarding = [
    ...s.placed.map(p => p.assignedAt - p.arrivedAt),
    ...s.ed.map(p => sim.end - p.arrivedAt),
  ];
  // Time from discharge approval to the patient leaving (= cleaning requested).
  const approvedAt = Object.fromEntries(day.approvals.map(a => [a.bedId, a.at]));
  const leaveBeds = [
    ...s.log.filter(e => e.step === 'cleaning'),
    ...Object.values(s.queues).flatMap(w => w.cleaning),
    ...s.active.filter(t => t.step === 'cleaning'),
  ];
  // Patients still waiting to leave at the end count with their full wait (censored).
  const stuck = Object.keys(approvedAt).filter(id => s.beds[id].status === 'discharge_pending');
  const timeToLeave = [
    ...leaveBeds.map(t => t.requestedAt - approvedAt[t.bedId]),
    ...stuck.map(id => sim.end - approvedAt[id]),
  ];
  const leftBeforeNoon = leaveBeds.filter(t => t.requestedAt < 720).length;
  const unplacedIsolation = s.ed.filter(p => p.isolation).length;
  const unplacedAfter18 = s.ed.filter(p => !p.isolation && p.arrivedAt >= 1080).length;
  return {
    boarding, unplaced: s.ed.length, log: s.log, borrowed: s.borrowed.length, timeToLeave, leftBeforeNoon,
    neverLeft: stuck.length, unplacedIsolation, unplacedAfter18,
  };
}

export function runSimulation({ days = sim.days, seed = sim.seed, policy = 'normal', staff = defaultStaff() } = {}) {
  const all = [], leave = [];
  let unplaced = 0, borrows = 0, beforeNoon = 0, neverLeft = 0, unplacedIsolation = 0, unplacedAfter18 = 0;
  for (let i = 0; i < days; i++) {
    const r = simulateDay(generateDay(createRng(seed * 1000 + i)), policy, staff);
    all.push(...r.boarding);
    unplaced += r.unplaced;
    borrows += r.borrowed;
    leave.push(...r.timeToLeave);
    beforeNoon += r.leftBeforeNoon;
    neverLeft += r.neverLeft;
    unplacedIsolation += r.unplacedIsolation;
    unplacedAfter18 += r.unplacedAfter18;
  }
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  return {
    policy, days, seed,
    patients: all.length,
    avgBoardingH: Math.round((mean / 60) * 100) / 100,
    pctWithin6h: Math.round((all.filter(b => b <= sim.targetMinutes).length / all.length) * 1000) / 10,
    unplaced, unplacedIsolation, unplacedAfter18, unplacedOther: unplaced - unplacedIsolation - unplacedAfter18,
    neverLeft,
    borrowsPerDay: Math.round((borrows / days) * 100) / 100,
    avgTimeToLeaveMin: Math.round(leave.reduce((a, b) => a + b, 0) / Math.max(1, leave.length)),
    pctLeftBeforeNoon: Math.round((beforeNoon / Math.max(1, leave.length)) * 1000) / 10,
  };
}
