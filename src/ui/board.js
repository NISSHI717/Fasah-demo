// Screen 01 — SEE + COORDINATE: live bed board, ED queue, bed details and role actions.
import { store } from './store.js';
import { BEDS, WARDS, bedById, fmtTime, suits, typeLabel } from '../core/hospital.js';
import { approve, completeStep, assignBed } from '../core/flow.js';
import { predict } from '../core/predict.js';
import { esc } from './util.js';

const STATUS_TEXT = {
  occupied: 'Occupied',
  discharge_pending: 'Discharge pending',
  awaiting_cleaning: 'Awaiting cleaning',
  cleaning: 'Cleaning',
  ready: 'Ready',
};
const STEP_NAME = { approval: 'Clinical approval', pharmacy: 'Pharmacy', transport: 'Transport', cleaning: 'Cleaning' };
const DEPT = { pharmacy: 'pharmacy', transport: 'transport', cleaning: 'housekeeping' };

const can = {
  approve: r => ['judge', 'nurse', 'charge'].includes(r),
  complete: r => ['judge', 'nurse', 'charge'].includes(r),
  assign: r => ['judge', 'reception', 'charge'].includes(r),
};

function counts(s) {
  const c = { occupied: 0, discharge_pending: 0, cleaning: 0, ready: 0 };
  for (const b of Object.values(s.beds)) {
    if (b.status === 'awaiting_cleaning' || b.status === 'cleaning') c.cleaning++;
    else c[b.status]++;
  }
  return c;
}

function bedTile(s, bed) {
  const st = s.beds[bed.id];
  const pri = s.priority.includes(bed.id);
  return `<button class="bed s-${st.status}${store.selected === bed.id ? ' sel' : ''}" data-bed="${bed.id}"
      aria-label="${bed.id}, ${STATUS_TEXT[st.status]}${bed.isolation ? ', isolation room' : ''}${pri ? ', prioritized' : ''}">
    <div class="id">${bed.id}</div>
    <div class="st">${STATUS_TEXT[st.status]}</div>
    ${bed.isolation ? '<span class="iso" title="Isolation room">ISO</span>' : ''}
    ${pri ? '<span class="pri" title="Prioritized by charge nurse">★</span>' : ''}
  </button>`;
}

function staffLine(s, ward) {
  const st = s.staff[ward];
  const borrowed = s.borrowed.filter(b => b.ward === ward && b.from <= s.now && s.now < b.until).length;
  return `Housekeepers ${st.housekeeper}${borrowed ? ` +${borrowed} borrowed` : ''} · Pharmacist ${st.pharmacist} · Transporter ${st.transporter}`;
}

function edPanel(s) {
  if (!s.ed.length) return '<p class="empty">No patients waiting for a bed.</p>';
  return `<ul class="ed-list">${[...s.ed].sort((a, b) => a.arrivedAt - b.arrivedAt).map(p => {
    const waited = s.now - p.arrivedAt;
    return `<li><span><b>${p.id}</b> · ${typeLabel(p)} bed</span><span class="muted">waiting ${Math.floor(waited / 60)}h ${String(waited % 60).padStart(2, '0')}m</span></li>`;
  }).join('')}</ul>`;
}

function stepRows(st) {
  const rows = Object.entries(st.steps).map(([step, r]) => {
    const state = r.doneAt != null ? `<span class="tag ok">done ${fmtTime(r.doneAt)}</span>`
      : r.startedAt != null ? `<span class="tag info">in progress since ${fmtTime(r.startedAt)}</span>`
      : `<span class="tag warn">waiting since ${fmtTime(r.requestedAt)}</span>`;
    const by = r.updatedBy ? `<div class="muted small">by ${esc(r.updatedBy)}</div>` : '';
    return `<tr><td>${STEP_NAME[step]}</td><td>${state}${by}</td></tr>`;
  });
  return rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : '';
}

function detailPanel(s) {
  const id = store.selected;
  if (!id) return `<div class="card"><h2>Bed details</h2><p class="empty">Click a bed to see its discharge chain and actions.</p></div>`;
  const bed = bedById(id);
  const st = s.beds[id];
  const role = store.role;
  const pred = st.status !== 'occupied' ? predict(s)[id] : null;
  let actions = '';

  if (st.status === 'occupied' && can.approve(role)) {
    actions += `<h3>Record discharge approval</h3>
      <p class="muted small">Entered by the nurse for the doctor. FASAH never makes this decision.</p>
      <label class="check"><input type="checkbox" id="need-ph" checked> Needs discharge medication (pharmacy)</label>
      <label class="check"><input type="checkbox" id="need-tr"> Needs hospital transport</label>
      <div class="actions"><button class="btn primary small" data-action="approve">Record approval</button></div>`;
  }
  if (can.complete(role)) {
    const open = ['pharmacy', 'transport', 'cleaning'].filter(step => st.steps[step] && st.steps[step].doneAt == null);
    if (open.length) {
      actions += `<h3>Update a step</h3><p class="muted small">If a department cannot update FASAH directly, the nurse records it for them.</p>
        <div class="actions">${open.map(step => `<button class="btn small" data-action="complete" data-step="${step}">Mark ${step} done (for ${DEPT[step]})</button>`).join('')}</div>`;
    }
  }
  if (st.status === 'ready' && can.assign(role)) {
    const fits = s.ed.filter(p => suits(bed, p)).sort((a, b) => a.arrivedAt - b.arrivedAt);
    actions += `<h3>Assign to ED patient</h3>` + (fits.length
      ? `<div class="actions"><select id="assign-to">${fits.map(p => `<option value="${p.id}">${p.id} · waiting since ${fmtTime(p.arrivedAt)}</option>`).join('')}</select>
         <button class="btn primary small" data-action="assign">Assign bed</button></div>`
      : `<p class="muted small">No waiting patient fits this bed (${typeLabel(bed)}). Suitability is checked before any assignment.</p>`);
  }

  return `<div class="card" id="detail">
    <h2>${id} <span class="muted small">· Ward ${bed.ward} · ${typeLabel(bed)}${s.priority.includes(id) ? ' · ★ prioritized' : ''}</span></h2>
    <p><span class="tag">${STATUS_TEXT[st.status]}</span>
      ${pred && st.status !== 'ready' ? ` Expected ready <b class="mono">${fmtTime(pred.typical)}</b> <span class="muted small">(${fmtTime(pred.fast)}–${Number.isFinite(pred.slow) ? fmtTime(pred.slow) : '?'}, ${pred.confidence})</span>` : ''}</p>
    ${stepRows(st)}
    ${actions}
  </div>`;
}

export function renderBoard(el) {
  const s = store.state;
  const c = counts(s);
  el.innerHTML = `
    <span class="step-tag">01 SEE · 02 COORDINATE</span>
    <h1>Live bed board</h1>
    <p class="lead">Every bed's status in one place. Reception and nurses update it; each step of the discharge chain is timestamped with who updated it.</p>
    <div class="grid cols-4" id="counters">
      <div class="counter c-occupied"><div class="num">${c.occupied}</div><div class="lbl">Occupied</div></div>
      <div class="counter c-pending"><div class="num">${c.discharge_pending}</div><div class="lbl">Discharge pending</div></div>
      <div class="counter c-cleaning"><div class="num">${c.cleaning}</div><div class="lbl">Awaiting / in cleaning</div></div>
      <div class="counter c-ready"><div class="num">${c.ready}</div><div class="lbl">Ready</div></div>
    </div>
    <div class="clockbar" id="clockbar">
      <span class="clock" aria-live="polite">${fmtTime(s.now)}</span>
      <button class="btn small" data-action="tick">+15 min</button>
      <button class="btn small" data-action="${store.playing ? 'pause' : 'play'}">${store.playing ? '⏸ Pause' : '▶ Play'}</button>
      <button class="btn small" data-action="reset">Reset to 11:00</button>
      ${s.staffNote ? `<span class="staffnote">⚠ ${esc(s.staffNote)}</span>` : ''}
    </div>
    <div class="layout">
      <div>
        <div class="legend">
          <span style="--c:var(--occupied)"><i></i>Occupied</span>
          <span style="--c:var(--pending)"><i></i>Discharge pending</span>
          <span style="--c:var(--cleaning)"><i></i>Awaiting / in cleaning</span>
          <span style="--c:var(--ready)"><i></i>Ready</span>
          <span><span class="tag bad">ISO</span> isolation room</span>
          <span>★ prioritized</span>
        </div>
        ${WARDS.map(w => `<section class="ward" id="ward-${w}">
          <div class="ward-head"><h2>Ward ${w} · ${w === 'A' ? 'Male' : 'Female'}</h2><span class="staff">${staffLine(s, w)}</span></div>
          <div class="beds">${BEDS.filter(b => b.ward === w).map(b => bedTile(s, b)).join('')}</div>
        </section>`).join('')}
      </div>
      <aside class="grid">
        <div class="card" id="ed-queue"><h2>ED patients waiting for a bed (${s.ed.length})</h2>${edPanel(s)}</div>
        ${detailPanel(s)}
      </aside>
    </div>`;
}

export function boardAction(action, target) {
  const s = store.state;
  const id = store.selected;
  if (action === 'tick') return store.tick(15);
  if (action === 'play') return store.play();
  if (action === 'pause') { store.stop(); return store.notify(); }
  if (action === 'reset') return store.reset();
  if (action === 'approve') {
    const needsPharmacy = document.getElementById('need-ph').checked;
    const needsTransport = document.getElementById('need-tr').checked;
    return store.set(st => { approve(s, id, { needsPharmacy, needsTransport }, 'nurse (for doctor)'); st.plan = null; });
  }
  if (action === 'complete') {
    const step = target.dataset.step;
    return store.set(st => { completeStep(s, id, step, `nurse for ${DEPT[step]}`); st.plan = null; });
  }
  if (action === 'assign') {
    const pid = document.getElementById('assign-to').value;
    return store.set(st => { assignBed(s, id, pid); st.plan = null; });
  }
}
