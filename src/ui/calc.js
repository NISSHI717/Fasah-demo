// "How this is calculated" — every number on screen can be traced (spec §11).
import { CONFIG } from '../core/hospital.js';

export const calcPanel = (title, body, open = false) =>
  `<details class="calc"${open ? ' open' : ''}><summary>How this is calculated — ${title}</summary>${body}</details>`;

export const ENSIAB = `Alotaibi Y, Alnowaiser N, Alamry A. <i>Improving hospital flow 'Ensiab Project'.</i> BMJ Open Quality 2021;10:e001505.
  <a href="https://doi.org/10.1136/bmjoq-2021-001505" target="_blank" rel="noopener">doi:10.1136/bmjoq-2021-001505</a>`;

export function durationsTable() {
  const d = CONFIG.durations;
  const row = (name, [f, t, s]) => `<tr><td>${name}</td><td class="num">${f}</td><td class="num">${t}</td><td class="num">${s}</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr><th>Step (minutes)</th><th class="num">Fast</th><th class="num">Typical</th><th class="num">Slow</th></tr></thead><tbody>
    ${row('Pharmacy', d.pharmacy)}${row('Transport', d.transport)}${row('Cleaning', d.cleaning)}${row('Cleaning, isolation room', d.cleaningIsolation)}
  </tbody></table></div>
  <p>Pharmacy and transport times are calibrated so the normal simulation reproduces the 265-minute "time till discharge" measured in six Saudi hospitals (${ENSIAB}).</p>`;
}
