// Built vs. next — what works today and what each later phase adds (spec §11).

const PHASES = [
  {
    name: 'Phase 1 · Simulate', done: true, note: 'This website. Built and tested.',
    items: [
      'Live bed board for 36 beds in 2 wards, with role-based updates (reception, nurse, charge nurse)',
      'Discharge chain: approval → pharmacy + transport in parallel → patient leaves → cleaning, every step timestamped with who updated it',
      'Queue-aware readiness predictions with a range and a confidence level',
      'Minimum Intervention Engine: auto target from the ED queue, smallest change first (prioritize beds → borrow a spare housekeeper → “not possible” + what it would take), human approval',
      'Hard safety rules: no discharge decisions, bed must match sex and isolation need, no staff beyond those on duty or spare',
      'Delay Analyzer for the manager',
      '200-day simulation, calibrated to a published Saudi time till discharge, with a What-if planner',
      'Automated tests for all calculation code (run: npm test)',
    ],
  },
  {
    name: 'Phase 2 · Pilot', note: 'One ED + two wards.',
    items: [
      'Manual status updates by reception and nurses, with the audit trail already built here',
      'Usability testing with nurses and charge nurses: is updating fast enough to keep the board current?',
      'Record real step times and compare FASAH’s predictions with what actually happened',
      'Measure ED boarding before and during the pilot',
    ],
  },
  {
    name: 'Phase 3 · Integrate', note: 'Approved interfaces to hospital information systems.',
    items: [
      'Admission, discharge and transfer events from the hospital record system instead of manual entry',
      'Pharmacy, transport and housekeeping systems update their own steps',
      'Step times learned from the hospital’s own data, then validated before use',
      'Secure hosting, real accounts and role-based access, privacy by design',
    ],
  },
  {
    name: 'Phase 4 · Scale', note: 'After safety and usability review.',
    items: ['Multi-ward and multi-hospital deployment', 'Hospital clusters share spare-staff pools', 'Arabic interface'],
  },
];

export function renderBuilt(el) {
  el.innerHTML = `
    <span class="step-tag">ROADMAP</span>
    <h1>What is built, and what comes next</h1>
    <p class="lead">Phase 1 (Simulate) is complete and running in this website. Everything here uses synthetic data. Real outcomes need a pilot.</p>
    <div class="grid cols-2">
      ${PHASES.map(p => `<div class="card phase${p.done ? ' done' : ''}">
        <h2>${p.name} ${p.done ? '<span class="tag ok">built</span>' : '<span class="tag">next</span>'}</h2>
        <p class="muted small">${p.note}</p>
        <ul>${p.items.map(i => `<li class="${p.done ? 'ok' : ''}">${i}</li>`).join('')}</ul>
      </div>`).join('')}
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Not tested yet</h2>
      <ul class="small">
        <li>Real users: whether staff keep statuses current, and whether charge nurses accept the engine’s suggestions.</li>
        <li>Real data: step times, ED demand and the size of the effect on boarding.</li>
        <li>Clinical safety review of the prioritization rules.</li>
      </ul>
    </div>`;
}
