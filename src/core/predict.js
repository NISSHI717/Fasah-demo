// Queue-aware readiness prediction (spec §6).
// Replays the current queues forward three times — all fast, all typical, all slow
// step durations — and reads when each bed becomes ready.

import { CONFIG, STEPS, bedById, durationRange } from './hospital.js';
import { advance, cloneState, FIFO } from './flow.js';

const SCENARIOS = [0, 1, 2]; // fast, typical, slow
const HORIZON = 1440;

export function confidenceOf(width) {
  if (width <= CONFIG.confidence.high) return 'High';
  if (width <= CONFIG.confidence.moderate) return 'Moderate';
  return 'Low';
}

const NAMES = { pharmacy: 'Pharmacy', transport: 'Transport', cleaning: 'Cleaning' };

function describe(s, id) {
  const bed = s.beds[id];
  if (bed.status === 'ready') return { stage: 'Ready for assignment', waits: [] };
  if (bed.status === 'cleaning') return { stage: 'Cleaning in progress', waits: [] };
  const ward = bedById(id).ward;
  const waits = [];
  const parts = [];
  for (const step of STEPS) {
    const rec = bed.steps[step];
    if (!rec || rec.doneAt != null) continue;
    const pos = s.queues[ward][step].findIndex(t => t.bedId === id);
    if (pos >= 0) { waits.push({ step, position: pos + 1 }); parts.push(`${NAMES[step]} waiting`); }
    else parts.push(`${NAMES[step]} in progress`);
  }
  if (bed.status === 'awaiting_cleaning') return { stage: 'Waiting for cleaning', waits };
  return { stage: parts.join(' · ') || 'Discharge pending', waits };
}

/** Readiness estimate for every bed that is not plain occupied. Does not modify s. */
export function predict(s) {
  const ids = Object.keys(s.beds).filter(id => s.beds[id].status !== 'occupied');
  const runs = SCENARIOS.map(i => {
    const c = cloneState(s);
    for (const t of c.active) {
      t.doneAt = Math.max(c.now, t.startedAt + durationRange(t.step, bedById(t.bedId))[i]);
    }
    c.ed = []; c.scheduled = [];
    advance(c, c.now + HORIZON, {
      duration: (task, bed) => durationRange(task.step, bed)[i],
      pickNext: FIFO,
      autoAssign: false,
    });
    return c;
  });
  const out = {};
  for (const id of ids) {
    const { stage, waits } = describe(s, id);
    if (s.beds[id].status === 'ready') {
      out[id] = { fast: s.now, typical: s.now, slow: s.now, confidence: 'Confirmed', stage, waits };
      continue;
    }
    const [f, t, sl] = runs.map(c => c.beds[id].readyAt ?? Infinity);
    // A faster day can reshuffle a shared queue; keep the range around the typical estimate.
    const fast = Math.min(f, t), slow = Math.max(sl, t);
    out[id] = { fast, typical: t, slow, confidence: Number.isFinite(slow) ? confidenceOf(slow - fast) : 'Low', stage, waits };
  }
  return out;
}
