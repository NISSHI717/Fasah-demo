// Simulation (Phase 1 result) and the What-if planner.
import { store } from './store.js';
import { CONFIG, WARDS, ROLES } from '../core/hospital.js';
import { runSimulation, POLICIES, defaultStaff } from '../core/simulate.js';
import { calcPanel, ENSIAB } from './calc.js';

let comparison = null;   // default 3-policy run
let running = false;
const form = { staff: defaultStaff(), policy: 'fasah', days: 200 };
let whatIf = null;       // { result, baseline }

const ROLE_LABEL = { housekeeper: 'Housekeepers', pharmacist: 'Pharmacists', transporter: 'Transporters' };
const later = fn => setTimeout(() => { fn(); store.notify(); }, 30);

function ensureComparison() {
  if (comparison || running) return;
  running = true;
  later(() => {
    comparison = Object.keys(POLICIES).map(p => runSimulation({ policy: p }));
    running = false;
  });
}

const signed = (v, unit, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}${unit}`;

function comparisonCard() {
  if (!comparison) return `<div class="card" id="sim-results"><p class="empty">Running ${CONFIG.sim.days} simulated days × 3 policies…</p></div>`;
  const [normal, fasah] = comparison;
  const maxH = Math.max(...comparison.map(r => r.avgBoardingH));
  const dMin = (fasah.avgBoardingH - normal.avgBoardingH) * 60;
  return `<div class="card" id="sim-results">
    <p class="headline">FASAH ordering: ${signed(dMin, ' min', 0)} average ED boarding, ${signed(fasah.pctWithin6h - normal.pctWithin6h, ' points')} placed within 6 h</p>
    <p class="muted small">${normal.days} simulated days · ${normal.patients} ED admissions per policy · the same days, patients and step times for every policy · seed ${normal.seed}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Policy</th><th class="num">Avg ED boarding</th><th>&nbsp;</th><th class="num">Placed within 6 h</th><th class="num">Approval → patient leaves</th><th class="num">Not placed by 07:00</th></tr></thead>
      <tbody>${comparison.map(r => `<tr>
        <td><b>${POLICIES[r.policy].label}</b></td>
        <td class="num mono">${r.avgBoardingH.toFixed(2)} h</td>
        <td style="min-width:120px"><div class="bar${r.policy === 'normal' ? ' alt' : ''}"><span style="width:${(100 * r.avgBoardingH) / maxH}%"></span></div></td>
        <td class="num mono">${r.pctWithin6h.toFixed(1)}%</td>
        <td class="num mono">${r.avgTimeToLeaveMin} min</td>
        <td class="num mono">${r.unplaced}</td></tr>`).join('')}</tbody>
    </table></div>
    <h3>What this shows, and what it doesn't</h3>
    <ul class="small">
      <li>The gain comes only from <b>order</b>: FASAH serves first the beds that waiting ED patients can use. Same staff, same discharge decisions.</li>
      <li>Borrowing never triggers at full staffing (${comparison[2].borrowsPerDay} per day), because the cleaning queue never reaches 3. In this hospital the bottleneck is <b>pharmacy</b> (see the Delay Analyzer).</li>
      <li>Patients “not placed by 07:00”: in the normal run, 194 of 203 (96%) need an isolation bed or arrive after 18:00, when no matching bed is freed that day. They count with their full wait.</li>
      <li>This is a simulated result on synthetic data. It does not prove an effect in a real hospital; that needs the Phase 2 pilot.</li>
    </ul>
  </div>`;
}

function staffSelect(ward, role) {
  const v = form.staff[ward][role];
  return `<label class="small">${ROLE_LABEL[role]}<br><select data-change="staff" data-ward="${ward}" data-role="${role}">
    ${[0, 1, 2, 3, 4].map(n => `<option${n === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
}

function whatIfCard() {
  const res = whatIf;
  let out = '';
  if (running && !comparison) out = '';
  else if (res === 'running') out = '<p class="empty">Running…</p>';
  else if (res) {
    const { result: r, baseline: b } = res;
    const dH = (r.avgBoardingH - b.avgBoardingH) * 60;
    out = `<div class="compare">
      <div class="box"><span class="muted small">Baseline (normal order, current staff)</span><b>${b.avgBoardingH.toFixed(2)} h · ${b.pctWithin6h.toFixed(1)}%</b></div>
      <span class="muted">→</span>
      <div class="box"><span class="muted small">Your scenario</span><b>${r.avgBoardingH.toFixed(2)} h · ${r.pctWithin6h.toFixed(1)}%</b></div></div>
      <p class="headline">${signed(dH, ' min', 0)} average ED boarding · ${signed(r.pctWithin6h - b.pctWithin6h, ' points')} within 6 h</p>
      <p class="muted small">Average ED boarding · % placed within 6 h · ${r.days} days · approval → leave ${b.avgTimeToLeaveMin} → ${r.avgTimeToLeaveMin} min${r.borrowsPerDay ? ` · ${r.borrowsPerDay} borrows/day` : ''}</p>`;
  }
  return `<div class="card" id="whatif">
    <h2>What-if planner</h2>
    <p class="muted">Test a hiring decision before you pay for it. Change the staff, choose how FASAH orders the queues, and run the same simulated days again.</p>
    <div class="grid cols-2">
      ${WARDS.map(w => `<div><h3>Ward ${w}</h3><div class="actions">${ROLES.map(r => staffSelect(w, r)).join('')}</div></div>`).join('')}
    </div>
    <div class="actions" style="align-items:end">
      <label class="small">Ordering<br><select data-change="policy">${Object.entries(POLICIES).map(([k, p]) => `<option value="${k}"${k === form.policy ? ' selected' : ''}>${p.label}</option>`).join('')}</select></label>
      <label class="small">Days<br><select data-change="days">${[50, 200, 500].map(d => `<option${d === form.days ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
      <button class="btn primary" data-action="run">Run scenario</button>
    </div>
    <div class="actions"><span class="muted small">Quick scenarios:</span>
      <button class="btn small" data-action="preset" data-p="pharm">+1 pharmacist per ward</button>
      <button class="btn small" data-action="preset" data-p="short">Ward B one housekeeper short</button>
      <button class="btn small" data-action="preset" data-p="reset">Reset</button>
    </div>
    ${out}
  </div>`;
}

export function renderSim(el) {
  ensureComparison();
  el.innerHTML = `
    <span class="step-tag">PHASE 1 · SIMULATE</span>
    <h1>Simulation: does FASAH reduce ED boarding?</h1>
    <p class="lead">The same ${CONFIG.sim.days} synthetic hospital days, run three ways. Only the order of the queues (and, in the third run, borrowing a spare housekeeper) differs.</p>
    ${comparisonCard()}
    <div style="margin-top:16px">${whatIfCard()}</div>
    ${calcPanel('the simulation', `
      <p><b>One day</b> runs from 07:00 to 07:00. Each ward has ${CONFIG.sim.approvalsPerWard} discharge approvals between 08:00 and 14:00 (made by doctors, never by FASAH). ${CONFIG.sim.arrivals} ED patients need admission between 07:00 and 21:00: ${CONFIG.sim.pMale * 100}% male, ${CONFIG.sim.pIsolation * 100}% need isolation. Each patient needs pharmacy with probability ${CONFIG.pNeedsPharmacy} and transport with probability ${CONFIG.pNeedsTransport}. Step times are drawn from the fast / typical / slow ranges.</p>
      <p><b>ED boarding</b> = time a bed is assigned − time the patient was ready for admission. A ready bed goes at once to the longest-waiting patient it suits (same sex and isolation need). Patients still waiting at 07:00 count with their full wait.</p>
      <p><b>Policies.</b> Normal: every queue first-come. FASAH: each queue serves first the bed that the longest-waiting ED patient type can use, then the bed closest to ready. FASAH + borrow: also borrows 1 spare housekeeper for 2 h when a ward's cleaning queue reaches 3.</p>
      <p><b>Fairness:</b> every policy sees exactly the same generated days, including each step's duration (seed ${CONFIG.sim.seed}).</p>
      <p><b>Calibration:</b> pharmacy and transport times are set so the normal run reproduces the 265-minute “time till discharge” measured before the Ensiab project in six Saudi hospitals. Our run gives ${comparison ? comparison[0].avgTimeToLeaveMin : '…'} min. The 6-hour placement target also comes from that project: ${ENSIAB}.</p>
      <p><b>Not calibrated:</b> overall ED demand. Our hospital is calmer than the Ensiab hospitals were (they averaged 16.6 h of boarding before their project), so compare the policies with each other, not with Ensiab's numbers.</p>`)}`;
}

export function simAction(action, target) {
  if (action === 'staff') { form.staff[target.dataset.ward][target.dataset.role] = Number(target.value); return; }
  if (action === 'policy') { form.policy = target.value; return; }
  if (action === 'days') { form.days = Number(target.value); return; }
  if (action === 'preset') {
    const p = target.dataset.p;
    form.staff = defaultStaff();
    if (p === 'pharm') { form.staff.A.pharmacist = 2; form.staff.B.pharmacist = 2; form.policy = 'normal'; }
    if (p === 'short') { form.staff.B.housekeeper = 1; form.policy = 'fasah_borrow'; }
    if (p === 'reset') form.policy = 'fasah';
    whatIf = null;
    return store.notify();
  }
  if (action === 'run') {
    whatIf = 'running';
    store.notify();
    later(() => {
      const days = form.days;
      whatIf = {
        result: runSimulation({ days, policy: form.policy, staff: structuredClone(form.staff) }),
        baseline: runSimulation({ days, policy: 'normal' }),
      };
    });
  }
}
