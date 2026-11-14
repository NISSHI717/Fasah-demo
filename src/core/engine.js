// Minimum Intervention Engine (spec §7).
// Given a target ("N beds of a type ready by T"), find the smallest set of changes
// that meets it without breaking safety rules:
//   0 changes -> prioritize 1, 2, 3 beds -> borrow 1 housekeeper (+0–3 priorities)
//   -> "not possible" + the smallest single extra staff member that would make it work.

import { CONFIG, WARDS, ROLES, STEPS, bedById, suits, poolAt, approverFor, fmtTime, typeLabel } from './hospital.js';
import { cloneState, frontIndex } from './flow.js';
import { predict } from './predict.js';

const MAX_CHANGES = 3;

export function autoTarget(s, horizon = CONFIG.targetHorizon) {
  const groups = new Map();
  for (const p of s.ed) {
    const key = `${p.isolation ? 0 : 1}${p.sex}`;
    if (!groups.has(key)) groups.set(key, { sex: p.sex, isolation: p.isolation, count: 0 });
    groups.get(key).count++;
  }
  const needs = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  return { by: s.now + horizon, needs };
}

/** Does the current plan meet the target? Uses typical predicted ready times. */
export function evaluateTarget(s, target, preds = predict(s)) {
  const used = new Set();
  let achievedAt = s.now;
  const perNeed = [...target.needs]
    .sort((a, b) => Number(b.isolation) - Number(a.isolation))
    .map(need => {
      const times = Object.entries(preds)
        .filter(([id]) => !used.has(id) && suits(bedById(id), need))
        .sort((a, b) => a[1].typical - b[1].typical);
      const chosen = times.slice(0, need.count);
      chosen.forEach(([id]) => used.add(id));
      const nth = chosen.length < need.count ? Infinity : (chosen.at(-1)?.[1].typical ?? s.now);
      achievedAt = Math.max(achievedAt, nth);
      const ready = chosen.filter(([, p]) => p.typical <= target.by).length;
      return { ...need, ready, beds: chosen.map(([id, p]) => ({ id, at: p.typical })) };
    });
  const met = perNeed.every(n => n.ready >= n.count);
  return { met, achievedAt: target.needs.length ? achievedAt : null, perNeed };
}

const activeBorrows = s => s.borrowed.filter(b => b.from <= s.now && s.now < b.until).length;

function queuedSteps(s, bedId) {
  const ward = bedById(bedId).ward;
  return STEPS
    .map(step => ({ step, pos: s.queues[ward][step].findIndex(t => t.bedId === bedId) }))
    .filter(x => x.pos >= 0);
}

function prioritize(s, bedId) {
  if (!s.priority.includes(bedId)) s.priority.push(bedId);
  const ward = bedById(bedId).ward;
  for (const step of STEPS) {
    const q = s.queues[ward][step];
    const i = q.findIndex(t => t.bedId === bedId);
    if (i < 0) continue;
    const [task] = q.splice(i, 1);
    q.splice(frontIndex(s, q), 0, task);
  }
}

function applyChange(s, c) {
  if (c.type === 'prioritize') prioritize(s, c.bedId);
  else if (c.type === 'borrow') s.borrowed.push({ ward: c.ward, role: c.role, from: c.from, until: c.until });
  else if (c.type === 'extra') s.staff[c.ward][c.role] += 1;
}

/** Apply an approved plan to the live state (mutates s). */
export function applyPlan(s, plan) {
  for (const c of plan.changes) applyChange(s, c);
  return s;
}

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i < arr.length; i++) yield* combos(arr, k, i + 1, [...acc, arr[i]]);
}

function describePrioritize(s, bedId) {
  const ward = bedById(bedId).ward;
  const queued = queuedSteps(s, bedId);
  const parts = queued.map(({ step, pos }) =>
    pos === 0 ? `already first in Ward ${ward} ${step}` : `jumps from position ${pos + 1} to 1 in Ward ${ward} ${step}`);
  const cleaningAhead = !queued.some(q => q.step === 'cleaning') && s.beds[bedId].status === 'discharge_pending';
  if (cleaningAhead) parts.push(`goes first for cleaning when the patient leaves`);
  const steps = [...new Set([...queued.map(q => q.step), ...(cleaningAhead ? ['cleaning'] : [])])];
  return {
    type: 'prioritize', bedId, ward, steps,
    approver: steps.map(approverFor).join(' + '),
    reason: `Prioritize ${bedId}: ${parts.join('; ')}.`,
  };
}

function trySet(s, target, changes) {
  const c = cloneState(s);
  changes.forEach(ch => applyChange(c, ch));
  return { changes, ev: evaluateTarget(c, target) };
}

function bestOf(results) {
  const ok = results.filter(r => r.ev.met);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.ev.achievedAt < a.ev.achievedAt ? b : a));
}

function searchPriorities(s, target, base, candidates) {
  for (let k = 0; k <= MAX_CHANGES; k++) {
    const results = [];
    for (const set of combos(candidates, k)) results.push(trySet(s, target, [...base, ...set]));
    const best = bestOf(results);
    if (best) return best;
  }
  return null;
}

function notesFor(s, target, changes) {
  const notes = [];
  const wanted = id => target.needs.some(n => suits(bedById(id), n));
  for (const c of changes.filter(c => c.type === 'prioritize')) {
    for (const { step, pos } of queuedSteps(s, c.bedId)) {
      const jumped = s.queues[c.ward][step].slice(0, pos).map(t => t.bedId).filter(id => !wanted(id));
      for (const id of jumped) {
        const b = bedById(id);
        notes.push(`${id} (${typeLabel(b)}) is ${step === 'cleaning' ? 'cleaned' : 'served'} after — no ${typeLabel(b)} patient is waiting.`);
      }
    }
  }
  return [...new Set(notes)];
}

/** Find the smallest set of changes that meets the target. Does not modify s. */
export function findPlan(s, target) {
  const before = evaluateTarget(s, target);
  const base = { target, before, changes: [], notes: [] };
  if (!target.needs.length) return { ...base, status: 'no_demand', after: before };
  if (before.met) return { ...base, status: 'on_track', after: before };

  const candidates = Object.keys(s.beds)
    .filter(id => ['discharge_pending', 'awaiting_cleaning'].includes(s.beds[id].status))
    .filter(id => !s.priority.includes(id))
    .filter(id => target.needs.some(n => suits(bedById(id), n)))
    .sort()
    .map(id => describePrioritize(s, id));

  let found = searchPriorities(s, target, [], candidates);

  if (!found && poolAt(s.now) - activeBorrows(s) >= 1) {
    for (const ward of WARDS) {
      const borrow = {
        type: 'borrow', ward, role: 'housekeeper', from: s.now, until: s.now + CONFIG.borrowLength,
        approver: approverFor('borrow'),
        reason: `Borrow 1 housekeeper from another ward for Ward ${ward} until ${fmtTime(s.now + CONFIG.borrowLength)}.`,
      };
      found = searchPriorities(s, target, [borrow], candidates);
      if (found) break;
    }
  }

  if (found) {
    return { ...base, status: 'plan', changes: found.changes, after: found.ev, notes: notesFor(s, target, found.changes) };
  }

  let suggestion = 'more_than_one';
  outer: for (const role of ROLES) {
    for (const ward of WARDS) {
      const extra = { type: 'extra', ward, role };
      if (searchPriorities(s, target, [extra], candidates)) { suggestion = { ward, role }; break outer; }
    }
  }
  return { ...base, status: 'not_possible', after: before, suggestion };
}
