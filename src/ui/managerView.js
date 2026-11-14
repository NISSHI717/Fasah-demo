// Manager screen — Delay Analyzer: where does the waiting actually happen?
import { CONFIG, STEPS } from '../core/hospital.js';
import { createRng } from '../core/random.js';
import { generateDay, simulateDay } from '../core/simulate.js';
import { analyzeDelays, BANDS } from '../core/analyzer.js';
import { calcPanel } from './calc.js';
import { hours } from './util.js';

const NAME = { pharmacy: 'Pharmacy', transport: 'Transport', cleaning: 'Cleaning' };
let today = null; // one synthetic full day, computed once

function getToday() {
  if (!today) {
    const day = generateDay(createRng(CONFIG.sim.seed * 1000));
    const r = simulateDay(day, 'normal');
    today = { log: r.log, analysis: analyzeDelays(r.log), boarding: r.boarding };
  }
  return today;
}

const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function renderManager(el) {
  const { log, analysis: a, boarding } = getToday();
  const perStep = STEPS.map(step => {
    const es = log.filter(e => e.step === step);
    return { step, n: es.length, wait: avg(es.map(e => e.startedAt - e.requestedAt)), work: avg(es.map(e => e.doneAt - e.startedAt)) };
  });
  const maxWard = Math.max(1, ...Object.values(a.byWard));
  const maxBand = Math.max(1, ...Object.values(a.byBand));

  el.innerHTML = `
    <span class="step-tag">MANAGER · DELAY ANALYZER</span>
    <h1>Where is the delay happening?</h1>
    <p class="lead">For the executive doctor or flow manager: one synthetic full day (07:00 to 07:00) of discharge-chain timestamps, analyzed automatically. No one has to enter targets. The reports come from the updates staff already make.</p>
    <div class="card" id="analyzer-headline">
      <p class="headline">${a.headline}</p>
      <p class="muted small">${log.length} completed steps · ${boarding.length} ED admissions · average ED boarding ${hours(avg(boarding))}</p>
      <h3>Share of all waiting time</h3>
      ${STEPS.map(s => `<div class="bar-row"><span>${NAME[s]}</span><div class="bar"><span style="width:${a.share[s]}%"></span></div><b class="mono">${a.share[s]}%</b></div>`).join('')}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>Average per step</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Step</th><th class="num">Done</th><th class="num">Avg wait in queue</th><th class="num">Avg work time</th></tr></thead>
          <tbody>${perStep.map(r => `<tr><td>${NAME[r.step]}</td><td class="num">${r.n}</td><td class="num mono">${hours(r.wait)}</td><td class="num mono">${hours(r.work)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Waiting by ward and time of day</h2>
        ${Object.entries(a.byWard).map(([w, v]) => `<div class="bar-row"><span>Ward ${w}</span><div class="bar alt"><span style="width:${(100 * v) / maxWard}%"></span></div><b class="mono">${hours(v)}</b></div>`).join('')}
        ${BANDS.map(([b]) => `<div class="bar-row"><span>${b}</span><div class="bar"><span style="width:${(100 * a.byBand[b]) / maxBand}%"></span></div><b class="mono">${hours(a.byBand[b])}</b></div>`).join('')}
        <p class="small muted">Total waiting across all steps: ${hours(a.totalWait)}.</p>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>What to do with it</h2>
      <p>Before hiring anyone, test the change in the <a href="#sim">What-if planner</a>. For example, add one pharmacist and see whether ED boarding actually drops.</p>
      <p class="muted small">Today this is timestamp analysis. With real hospital data in Phase 3 it can become a learning model that spots delay patterns earlier.</p>
    </div>
    ${calcPanel('the delay analyzer', `
      <p><b>Waiting time</b> for each completed step = time it started − time it was requested. Work time = time done − time started.</p>
      <p>Waiting is added up by step, by ward, and by the time of day the step was requested (${BANDS.map(b => b[0]).join(', ')}). The headline names the step with the most waiting, and the ward and time band where most of it happened.</p>
      <p>Data: synthetic day 1 of the simulation (seed ${CONFIG.sim.seed}), normal first-come order, full staffing.</p>`)}`;
}
