// App shell: role picker, tabs, routing and event delegation.
import { store } from './store.js';
import { renderBoard, boardAction } from './board.js';
import { renderPredict } from './predictView.js';
import { renderEngine, engineAction } from './engineView.js';
import { renderManager } from './managerView.js';
import { renderSim, simAction } from './simView.js';
import { renderBuilt } from './builtView.js';
import { startTour, tourFromHash } from './tour.js';

const ALL = ['judge', 'reception', 'nurse', 'charge', 'manager'];
export const TABS = [
  { id: 'board', n: '01·02', label: 'Bed board', roles: ['judge', 'reception', 'nurse', 'charge'], render: renderBoard, action: boardAction },
  { id: 'predict', n: '03', label: 'Predict', roles: ['judge', 'nurse', 'charge'], render: renderPredict },
  { id: 'engine', n: '04', label: 'Optimize', roles: ['judge', 'charge'], render: renderEngine, action: engineAction },
  { id: 'manager', n: '', label: 'Delay analyzer', roles: ['judge', 'manager'], render: renderManager },
  { id: 'sim', n: '', label: 'Simulation & What-if', roles: ['judge', 'manager'], render: renderSim, action: simAction },
  { id: 'built', n: '', label: 'Built vs. next', roles: ALL, render: renderBuilt },
];

const view = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const roleEl = document.getElementById('role');

export function route() {
  const [id, query = ''] = location.hash.slice(1).split('?');
  const allowed = TABS.filter(t => t.roles.includes(store.role));
  const tab = allowed.find(t => t.id === id) ?? allowed[0];
  return { tab, params: new URLSearchParams(query) };
}

function render() {
  const { tab, params } = route();
  tabsEl.innerHTML = TABS.filter(t => t.roles.includes(store.role))
    .map(t => `<a href="#${t.id}"${t === tab ? ' aria-current="page"' : ''}>${t.n ? `<span class="n">${t.n}</span>` : ''}${t.label}</a>`)
    .join('');
  tab.render(view, params);
}

store.subscribe(render);
window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); });

roleEl.addEventListener('change', () => {
  store.role = roleEl.value;
  const { tab } = route();
  if (location.hash.slice(1).split('?')[0] !== tab.id) location.hash = tab.id;
  else render();
});

document.getElementById('tour-btn').addEventListener('click', () => startTour());

view.addEventListener('click', e => {
  const bed = e.target.closest('[data-bed]');
  if (bed) return store.set(st => { st.selected = bed.dataset.bed; });
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const { tab } = route();
    tab.action?.(btn.dataset.action, btn);
  }
});
view.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el) route().tab.action?.(el.dataset.change, el);
});

const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
if (params.get('role')) { store.role = params.get('role'); roleEl.value = store.role; }
if (params.get('bed')) store.selected = params.get('bed');
render();
tourFromHash();
