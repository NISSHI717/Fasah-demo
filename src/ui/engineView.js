// Screen 04 — OPTIMIZE: the Minimum Intervention Engine, used by the charge nurse.
import { store } from './store.js';
import { CONFIG, fmtTime, typeLabel, poolAt } from '../core/hospital.js';
import { autoTarget, findPlan, applyPlan } from '../core/engine.js';
import { calcPanel } from './calc.js';
import { esc } from './util.js';

const ROLE_NAME = { housekeeper: 'housekeeper', pharmacist: 'pharmacist', transporter: 'transporter' };
const canDecide = () => ['judge', 'charge'].includes(store.role);

const currentTarget = () => store.target ?? autoTarget(store.state);
const needText = n => `${n.count} ${typeLabel(n)} bed${n.count === 1 ? '' : 's'}`;
const targetText = t => `${t.needs.map(needText).join(' + ')} ready by ${fmtTime(t.by)}`;

function targetCard(t) {
  const auto = !store.target;
  return `<div class="card" id="target-card">
    <h2>Target ${auto ? '<span class="tag ok">auto</span>' : '<span class="tag warn">edited by charge nurse</span>'}</h2>
    <p class="muted small">Built automatically from the ED queue: one bed for each waiting patient, of the type they need, within ${CONFIG.targetHorizon / 60} hours. Doctors do not need to set anything.</p>
    ${t.needs.length ? t.needs.map((n, i) => `<div class="need-row">
        <input type="number" min="0" max="18" value="${n.count}" data-change="count" data-i="${i}" aria-label="Number of ${typeLabel(n)} beds">
        <span>${typeLabel(n)} bed${n.count === 1 ? '' : 's'}</span></div>`).join('')
      : '<p class="empty">No ED patients are waiting.</p>'}
    <div class="need-row"><span>ready by</span>
      <input type="time" value="${fmtTime(t.by)}" data-change="by" aria-label="Target time"></div>
    <div class="actions">
      <button class="btn primary" data-action="find" ${t.needs.length ? '' : 'disabled'}>Find smallest change</button>
      ${auto ? '' : '<button class="btn" data-action="auto">Back to auto target</button>'}
    </div>
  </div>`;
}

function changeList(plan) {
  return plan.changes.map(c => `<div class="change">${esc(c.reason)}
    <div class="who">Needs approval from: <b>${esc(c.approver)}</b></div></div>`).join('');
}

function planCard(plan) {
  if (!plan) return `<div class="card" id="plan-card"><h2>Suggestion</h2><p class="empty">Press “Find smallest change”.</p></div>`;
  const t = plan.target;
  const before = plan.before.achievedAt, after = plan.after.achievedAt;
  const fmt = v => (v == null ? '—' : Number.isFinite(v) ? fmtTime(v) : 'not today');
  const compare = `<div class="compare">
      <div class="box"><span class="muted small">Normal order</span><b>${fmt(before)}</b></div>
      <span class="muted">→</span>
      <div class="box"><span class="muted small">With this plan</span><b>${fmt(after)}</b></div>
      <span class="muted small">time the last target bed is ready · target ${fmtTime(t.by)}</span></div>`;
  let body;
  if (plan.status === 'no_demand') body = `<p class="big-status ok">No ED patients waiting — nothing to optimize.</p>`;
  else if (plan.status === 'on_track') body = `<p class="big-status ok">On track — no change needed.</p>${compare}`;
  else if (plan.status === 'plan') {
    const n = plan.changes.length;
    body = `<p class="big-status warn">Smallest safe change: ${n} change${n === 1 ? '' : 's'}</p>
      <p class="muted small">Target: ${targetText(t)}. With normal first-come order it is missed.</p>
      ${compare}
      ${changeList(plan)}
      ${plan.notes.map(x => `<p class="small muted">• ${esc(x)}</p>`).join('')}
      <p class="small">✓ Discharge decisions unchanged · ✓ beds only for patients of the matching sex and isolation need · ✓ no staff beyond those on duty${plan.changes.some(c => c.type === 'borrow') ? ' and the lending ward\'s spare' : ''}</p>
      ${plan.decided ? `<p class="tag ${plan.decided === 'approved' ? 'ok' : 'bad'}">${plan.decided} at ${fmtTime(plan.decidedAt)}</p>`
        : canDecide() ? `<div class="actions"><button class="btn primary" data-action="approve">Approve plan</button><button class="btn danger" data-action="reject">Reject</button></div>`
        : '<p class="muted small">Only the charge nurse can approve.</p>'}`;
  } else {
    const sug = plan.suggestion === 'more_than_one'
      ? 'Even one extra staff member plus re-prioritizing would not be enough. The target time is too close, or there are not enough suitable beds coming free.'
      : `It would take <b>1 more ${ROLE_NAME[plan.suggestion.role]} in Ward ${plan.suggestion.ward}</b> (plus re-prioritizing).`;
    body = `<p class="big-status bad">Not possible with current staff</p>
      <p class="muted small">Target: ${targetText(t)}.</p>${compare}<p>${sug}</p>
      <p class="muted small">FASAH never adds staff or changes discharge decisions by itself. This tells the manager what would be needed.</p>`;
  }
  return `<div class="card" id="plan-card"><h2>Suggestion</h2>${body}</div>`;
}

export function renderEngine(el, params) {
  const t = currentTarget();
  if (params?.has('autorun') && !store.plan && t.needs.length) store.plan = findPlan(store.state, t);
  const plan = store.plan;
  el.innerHTML = `
    <span class="step-tag">04 OPTIMIZE</span>
    <h1>Minimum Intervention Engine</h1>
    <p class="lead">From “where is the delay?” to “what is the smallest safe change?”. FASAH tries the fewest changes first and explains each one. Nothing happens until the charge nurse approves.</p>
    <div class="grid cols-2">
      ${targetCard(t)}
      ${planCard(plan)}
    </div>
    ${store.decisions.length ? `<div class="card" style="margin-top:16px"><h2>Decisions today</h2>${store.decisions.map(d =>
      `<div class="decision"><span class="mono">${fmtTime(d.at)}</span> · <b>${d.status}</b> · ${esc(d.summary)}</div>`).join('')}</div>` : ''}
    ${calcPanel('the engine', `
      <p><b>What counts:</b> a bed counts toward the target only if its sex and isolation type match the patient's need, and its expected ready time (see Predict) is at or before the target time. Each bed counts once.</p>
      <p><b>Search order, smallest change first:</b></p>
      <ol>
        <li>No change. If the target is already met, FASAH says “on track”.</li>
        <li>Prioritize 1, then 2, then 3 beds. A prioritized bed jumps to the front of every queue it is in now, and goes first for cleaning when its patient leaves.</li>
        <li>Borrow 1 housekeeper from another ward for ${CONFIG.borrowLength / 60} hours, only if one is spare at this hour (spare now: ${poolAt(store.state.now)}), plus up to 3 priorities.</li>
        <li>Otherwise: “not possible”, and the smallest single extra staff member that would make it possible.</li>
      </ol>
      <p>Among plans of the same size, FASAH picks the one where the last target bed is ready earliest.</p>
      ${plan?.tried ? `<p><b>This run:</b> ${plan.candidates} candidate beds, ${plan.tried} combinations checked, each by replaying the queues forward.</p>` : ''}
      <p><b>Hard rules</b> the engine cannot break: it never approves or delays a discharge, never assigns an unsuitable bed, and never uses staff who are not on duty or spare.</p>`)}`;
}

export function engineAction(action, target) {
  const s = store.state;
  if (action === 'find') return store.set(st => { st.plan = findPlan(s, currentTarget()); });
  if (action === 'auto') return store.set(st => { st.target = null; st.plan = null; });
  if (action === 'count' || action === 'by') {
    return store.set(st => {
      const t = structuredClone(currentTarget());
      if (action === 'count') t.needs[Number(target.dataset.i)].count = Math.max(0, Number(target.value) || 0);
      else {
        const [h, m] = target.value.split(':').map(Number);
        if (Number.isFinite(h)) {
          let by = Math.floor(s.now / 1440) * 1440 + h * 60 + (m || 0);
          if (by < s.now) by += 1440; // a time earlier than now means tomorrow
          t.by = by;
        }
      }
      t.needs = t.needs.filter(n => n.count > 0);
      st.target = t;
      st.plan = null;
    });
  }
  if (action === 'approve' || action === 'reject') {
    return store.set(st => {
      const plan = st.plan;
      if (action === 'approve') applyPlan(s, plan);
      plan.decided = action === 'approve' ? 'approved' : 'rejected';
      plan.decidedAt = s.now;
      st.decisions.unshift({ at: s.now, status: plan.decided, summary: plan.changes.map(c => c.reason).join(' ') });
    });
  }
}
