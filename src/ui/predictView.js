// Screen 03 — PREDICT: when will each bed be ready?
import { store } from './store.js';
import { CONFIG, WARDS, STEPS, bedById, fmtTime, typeLabel } from '../core/hospital.js';
import { predict } from '../core/predict.js';
import { calcPanel, durationsTable } from './calc.js';

const CONF_TAG = { Confirmed: 'ok', High: 'ok', Moderate: 'warn', Low: 'bad' };

export function renderPredict(el) {
  const s = store.state;
  const p = predict(s);
  const rows = Object.entries(p).sort((a, b) => a[1].typical - b[1].typical || a[0].localeCompare(b[0]));
  const queues = WARDS.flatMap(w => STEPS.map(step => {
    const q = s.queues[w][step];
    return q.length ? `<li><code>Ward ${w} ${step}</code>: ${q.map((t, i) => `${i + 1}. ${t.bedId}${s.priority.includes(t.bedId) ? '★' : ''}`).join(' · ')}</li>` : '';
  })).join('');

  el.innerHTML = `
    <span class="step-tag">03 PREDICT</span>
    <h1>Expected bed-readiness</h1>
    <p class="lead">Explainable estimates, not automatic clinical decisions. Each estimate follows the bed's place in every queue and the staff on duty, so when the queue order changes, the forecast changes with it.</p>
    <div class="card table-wrap" id="predict-table">
      <table>
        <thead><tr><th>Bed</th><th>Now</th><th class="num">Expected ready</th><th class="num">Range</th><th>Confidence</th><th>Queue position</th></tr></thead>
        <tbody>${rows.map(([id, r]) => {
          const bed = bedById(id);
          const ready = r.confidence === 'Confirmed';
          return `<tr>
            <td><b>${id}</b>${s.priority.includes(id) ? ' ★' : ''}<div class="muted small">Ward ${bed.ward} · ${typeLabel(bed)}</div></td>
            <td>${r.stage}</td>
            <td class="num mono"><b>${ready ? 'Now' : fmtTime(r.typical)}</b></td>
            <td class="num mono muted">${ready ? '—' : `${fmtTime(r.fast)}–${Number.isFinite(r.slow) ? fmtTime(r.slow) : '?'}`}</td>
            <td><span class="tag ${CONF_TAG[r.confidence]}">${r.confidence}</span></td>
            <td class="small">${r.waits.map(w => `${w.step} #${w.position}`).join(', ') || '<span class="muted">—</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    ${calcPanel('readiness estimates', `
      <p><b>Expected ready</b> = time spent waiting in each queue (depends on position and on how many staff are working) + how long each remaining step usually takes. FASAH replays the current queues forward three times — every step fast, typical, then slow — and reads when each bed becomes ready.</p>
      <p><b>Confidence</b> comes from the width of the range: ≤ ${CONFIG.confidence.high} min → High, ≤ ${CONFIG.confidence.moderate} min → Moderate, wider → Low.</p>
      <p><b>Chain:</b> clinical approval → pharmacy and transport at the same time (each only if needed) → patient leaves → cleaning → ready.</p>
      ${durationsTable()}
      <p><b>Current queue order</b> (★ = prioritized by the charge nurse):</p><ul>${queues || '<li>All queues empty.</li>'}</ul>
      <p>These times are synthetic. In Phase 3 a production version would learn them from the hospital's own timestamps and be checked against real outcomes before anyone relies on it.</p>`)}`;
}
