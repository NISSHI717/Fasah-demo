// Guided demo (spec §10): the whole story in 8 steps, for a live pitch or a judge alone.
import { store } from './store.js';
import { autoTarget, findPlan } from '../core/engine.js';
import { engineAction } from './engineView.js';

const STEPS = [
  {
    hash: 'board', spot: '#counters', title: 'See: one live board',
    text: '36 beds in two wards. Colors show each bed\'s status, the same as on our slides. Reception and nurses keep it current, and every update is timestamped with who made it.',
  },
  {
    hash: 'board', spot: '#ward-B', title: 'A bottleneck forms',
    text: 'It is 11:00. Three women are waiting in the ED for a bed. Ward B is one housekeeper short today, and isolation room B35 is ahead of B34 in the cleaning queue, but no isolation patient is waiting.',
    before: () => { store.selected = 'B34'; },
  },
  {
    hash: 'predict', spot: '#predict-table', title: 'Predict: when will beds be ready?',
    text: 'FASAH replays every queue forward. With first-come order, the third female bed (B28) is ready only at 13:20. Each estimate shows a range and a confidence level.',
  },
  {
    hash: 'engine', spot: '#target-card', title: 'An automatic target',
    text: 'No doctor has to type anything. FASAH builds the target from the ED queue: 3 female beds within 2 hours, by 13:00. The charge nurse can edit it.',
  },
  {
    hash: 'engine', spot: '#plan-card', title: 'Optimize: the smallest safe change',
    text: 'FASAH tries the fewest changes first. Answer: prioritize B34 and B28. No extra staff, no discharge decision touched, and the isolation room is cleaned after. Each change names who must approve it. Press Next to approve as the charge nurse.',
    before: () => { if (!store.plan) store.plan = findPlan(store.state, autoTarget(store.state)); },
    after: () => { if (store.plan?.status === 'plan' && !store.plan.decided) engineAction('approve'); },
  },
  {
    hash: 'predict', spot: '#predict-table', title: 'Forecast updated',
    text: 'After approval, B34 is ready at 11:50 and B28 at 12:20 (★ = prioritized). All three women can have a bed before the 13:00 target. That is one hour earlier for the third patient.',
  },
  {
    hash: 'manager', spot: '#analyzer-headline', title: 'For the manager: where is the delay?',
    text: 'The timestamps staff already record show where the waiting really happens. On a typical simulated day it is pharmacy, not cleaning.',
  },
  {
    hash: 'sim', spot: '#sim-results', title: 'Simulate: 200 days, three ways',
    text: 'Same days, same patients, same staff. FASAH\'s ordering alone lowers average ED boarding and places more patients within the 6-hour target used in Saudi hospitals. Then try the What-if planner: “+1 pharmacist per ward”. All results are synthetic.',
  },
];

const box = document.getElementById('tour');
let index = -1;

function show() {
  const step = STEPS[index];
  store.role = 'judge';
  const roleEl = document.getElementById('role');
  if (roleEl) roleEl.value = 'judge';
  step.before?.();
  if (location.hash.slice(1).split('?')[0] !== step.hash) location.hash = step.hash;
  else store.notify();
  box.hidden = false;
  box.innerHTML = `<div class="count">Guided demo · ${index + 1} / ${STEPS.length}</div>
    <h2>${step.title}</h2><p>${step.text}</p>
    <div class="actions">
      <button class="btn small" data-tour="exit">Exit</button>
      <span>
        <button class="btn small" data-tour="back" ${index === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn primary small" data-tour="next">${index === STEPS.length - 1 ? 'Finish' : step.after ? 'Approve & next' : 'Next'}</button>
      </span>
    </div>`;
  setTimeout(afterRender, 60);
}

export function afterRender() {
  document.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'));
  if (index < 0) return;
  const el = document.querySelector(STEPS[index].spot);
  if (el) {
    el.classList.add('spot');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function startTour(at = 0) {
  store.reset();
  index = at;
  show();
}

function exit() {
  index = -1;
  box.hidden = true;
  afterRender();
}

box.addEventListener('click', e => {
  const b = e.target.closest('[data-tour]');
  if (!b) return;
  const a = b.dataset.tour;
  if (a === 'exit') return exit();
  if (a === 'back' && index > 0) { index--; return show(); }
  if (a === 'next') {
    STEPS[index].after?.();
    if (index === STEPS.length - 1) return exit();
    index++;
    show();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && index >= 0) exit(); });

/** #board?tour=5 opens the tour at step 5 (1-based) — used for screenshots and sharing. */
export function tourFromHash() {
  const n = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('tour'));
  if (!n) return;
  store.reset();
  index = 0;
  for (let i = 0; i < n - 1; i++) { STEPS[i].before?.(); STEPS[i].after?.(); }
  index = Math.min(n, STEPS.length) - 1;
  show();
}
