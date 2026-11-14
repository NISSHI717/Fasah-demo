# FASAH Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only website that runs FASAH's See → Coordinate → Predict → Optimize loop on synthetic data, plus a 200-day simulation and What-if planner, published from GitHub.

**Architecture:** One discrete-event engine (`flow.js`) moves beds through the discharge chain. Live screens, predictions, the Minimum Intervention Engine and the simulation all call it with different duration and queue-choice functions. Pure logic lives in `src/core/` (tested with `node:test`); screens in `src/ui/` only render and call core.

**Tech Stack:** HTML, CSS, JavaScript ES modules; Node 22 `node:test`; headless Chrome for screenshot checks; GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-14-fasah-demo-design.md`

## Global Constraints

- No npm packages, no build step, no backend. Times are integer minutes since 00:00 of day 1 (11:00 = 660; next-day 07:00 = 1860).
- Every screen shows "Synthetic data — simulated, not measured".
- No "AI" / "machine learning" wording in the site; the analyzer is "timestamp analysis".
- Beds B01–B18 Ward A male (isolation B17, B18); B19–B36 Ward B female (isolation B35, B36).
- Staff per ward: housekeeper 2, pharmacist 1, transporter 1. Pool spare housekeepers: [480,720)→1, [720,960)→0, [960,1320)→1, else 0.
- Durations [fast, typical, slow]: pharmacy [20,40,90], transport [10,25,60], cleaning [20,30,45], isolation cleaning [45,60,90].
- Pharmacy needed p=0.70, transport p=0.40. Confidence: width ≤30 High, ≤60 Moderate, else Low.
- Auto target T = now + 120. Engine search: 0 moves; 1, 2, 3 moves; borrow 1 housekeeper + 0–3 moves; else "not possible" + smallest single extra staff.
- Simulation: day 420→1860; 10 approvals/ward uniform [480,840]; 16 ED arrivals uniform [420,1260], male 0.5, isolation 0.10; seed 2026; 200 days; target 360 min.
- Bed suits a patient only if sex matches AND isolation flag matches exactly.

## Review Focus

1. Staff count set to 0 in What-if → tasks never start; simulation must still finish and report (censored boarding), not hang. → test in Task 6.
2. Engine with empty ED queue → auto target has no needs; engine returns `on_track` with "no ED demand", not an error. → test in Task 5.
3. Target impossible even with extra staff → `suggestion: 'more_than_one'`. → test in Task 5.
4. Nurse completes a step that is queued (not started) → it leaves the queue and does not get started again by `advance`. → test in Task 2.
5. Prediction must not mutate live state (engine calls it hundreds of times). → test in Task 4.

---

## File structure

```
index.html, styles.css
src/core/random.js     createRng
src/core/hospital.js   CONFIG, BEDS, bedById, suits, roleFor, approverFor, poolAt, typicalOf
src/core/flow.js       createState, cloneState, approve, advance, completeStep, assignBed, staffAvailable
src/core/live.js       createLiveState
src/core/predict.js    predict, confidenceOf
src/core/engine.js     autoTarget, evaluateTarget, findPlan, applyPlan
src/core/simulate.js   generateDay, simulateDay, runSimulation, POLICIES
src/core/analyzer.js   analyzeDelays
src/ui/*.js            app, store, board, predictView, engineView, managerView, simView, builtView, tour, calc
tests/*.test.js
README.md
```

### Shared data shapes (all tasks)

```js
// Bed (static):   { id:'B01', ward:'A', sex:'M', isolation:false }
// Patient need:   { sex:'M'|'F', isolation:boolean }
// BedState:       { status:'occupied'|'discharge_pending'|'awaiting_cleaning'|'cleaning'|'ready',
//                   discharge: null | { needsPharmacy, needsTransport, durations?:{pharmacy,transport,cleaning} },
//                   steps: { [step]: { requestedAt, startedAt, doneAt, updatedBy } } }
// Task:           { bedId, step:'pharmacy'|'transport'|'cleaning', ward, requestedAt }
// State: { now, beds:{[id]:BedState}, queues:{A:{pharmacy:[],transport:[],cleaning:[]},B:{...}},
//          active:[{...Task, startedAt, doneAt}], staff:{A:{housekeeper,pharmacist,transporter},B:{...}},
//          borrowed:[{ward, role, from, until}], ed:[{id, arrivedAt, sex, isolation}],
//          scheduled:[{at, type:'approve'|'arrive', bedId?, discharge?, patient?}],
//          log:[{bedId, step, ward, requestedAt, startedAt, doneAt, updatedBy}],
//          placed:[{patientId, arrivedAt, assignedAt, bedId}] }
// FlowOpts: { duration(task, bed, state)->minutes, pickNext(queue, state, ward, step)->index,
//             autoAssign:boolean, borrowRule?(state)->void }
```

---

### Task 1: Scaffold, random, hospital config

**Files:** Create `package.json` (`{"type":"module","scripts":{"test":"node --test tests/"}}`), `.gitignore` (`.superpowers/`), `src/core/random.js`, `src/core/hospital.js`, `tests/random.test.js`, `tests/hospital.test.js`

**Interfaces — Produces:**
- `createRng(seed:number) -> { next():number∈[0,1), int(lo,hi):int inclusive, bernoulli(p):bool, triangular(a,m,b):number, uniform(a,b):number }` (mulberry32)
- `CONFIG` (all Global Constraints values), `BEDS: Bed[36]`, `bedById(id)`, `suits(bed, need):bool`, `roleFor(step)` (pharmacy→'pharmacist', transport→'transporter', cleaning→'housekeeper'), `approverFor(step|'borrow')` ('Pharmacist' / 'Transport supervisor' / 'Housekeeping lead' / 'Charge nurse, lending ward'), `poolAt(minute):int` (uses minute mod 1440), `durationRange(step, bed):[f,t,s]`, `typicalOf(step, bed):number`

- [ ] Step 1: tests — same seed gives same 5 numbers; different seeds differ; `triangular(20,40,90)` 1000 draws all within [20,90] with mean in [45,52]; BEDS length 36, B17/B18/B35/B36 isolation, B19 sex 'F'; `suits(B17,{sex:'M',isolation:true})` true, `suits(B17,{sex:'M',isolation:false})` false, `suits(B20,{sex:'M',isolation:false})` false; `poolAt(600)=1, poolAt(800)=0, poolAt(1000)=1, poolAt(1400)=0`; `durationRange('cleaning', B35)` = [45,60,90].
- [ ] Step 2: `npm test` → FAIL (modules missing). Step 3: implement. Step 4: `npm test` → PASS. Step 5: commit `feat: rng and hospital config`.

### Task 2: Flow engine

**Files:** Create `src/core/flow.js`, `tests/flow.test.js`

**Interfaces — Consumes:** Task 1. **Produces:**
- `createState({now, staff?}) -> State` (all beds `occupied`, empty queues, default staff from CONFIG, deep-copied)
- `cloneState(state) -> State` (structuredClone)
- `approve(state, bedId, {needsPharmacy, needsTransport, durations?}, by='nurse')` → status `discharge_pending`, logs `approval` step done at now, enqueues needed pharmacy/transport tasks; if neither needed → patient leaves immediately (enqueue cleaning, status `awaiting_cleaning`).
- `staffAvailable(state, ward, role) -> int` = staff + active borrows (from ≤ now < until) − active tasks of that role in that ward.
- `advance(state, toTime, opts:FlowOpts)` — loop: process scheduled events with `at ≤ t`, complete active tasks with `doneAt ≤ t` (log them; when both pharmacy & transport done → enqueue cleaning, status `awaiting_cleaning`; cleaning done → `ready`), call `opts.borrowRule?.(state)`, start tasks while `staffAvailable>0` choosing `opts.pickNext` (status `cleaning` when cleaning starts), auto-assign if `opts.autoAssign`; then jump `t` to next event (min of active doneAt, scheduled at, borrow until, toTime). Ends with `state.now = toTime`.
- `completeStep(state, bedId, step, by)` → removes task from queue or active list, logs it with `startedAt=startedAt??now, doneAt=now, updatedBy=by`, applies the same transitions.
- `assignBed(state, bedId, patientId)` → bed `occupied` (discharge null, steps {}), removes patient from `ed`, pushes to `placed`.
- `FIFO = () => 0` exported pickNext; `defaultDuration = (task, bed) => typicalOf(task.step, bed)`.

- [ ] Step 1: tests — (a) approve B20 needing both at 600; advance to 700 with typical durations and FIFO: pharmacy done 640, transport done 625, cleaning starts 640 and done 670, status `ready` at 700, log has 3 entries with those times. (b) two cleaning tasks + 1 housekeeper (staff override) → second starts when first ends. (c) Review Focus 4: queued cleaning task completed by `completeStep(..., 'nurse for housekeeping')` is not in queue, bed `ready`, and `advance` does not start it again. (d) staffAvailable counts a borrow only inside [from, until). (e) autoAssign assigns a ready female bed to the longest-waiting female non-isolation patient, not to a male one. (f) staff 0 → advance to 2000 terminates, task stays queued.
- [ ] Steps 2–5: run fail → implement → pass → commit `feat: discharge-chain flow engine`.

### Task 3: Live demo state

**Files:** Create `src/core/live.js`, `tests/live.test.js`

**Interfaces — Consumes:** Task 2. **Produces:** `createLiveState() -> State` at now=660:
- occupied: B01–B09, B19–B27. ready: B14–B18, B36.
- discharge_pending: B10, B11, B28–B32 (approved between 540 and 640; mix of needs; some pharmacy/transport active).
- cleaning stage: B12 (cleaning active), B13 (queued), B33 (active, started 650), B35 (active isolation, started 640), B34 (queued).
- ED: 3 female non-isolation patients arrived 580, 620, 655.
- Tuned so that with FIFO + typical durations the 3rd female non-isolation bed is ready after 780 (13:00), and one queue move makes it ≤ 780. (Pins the guided-demo story.)

- [ ] Step 1: tests — counts occupied 18, discharge_pending 7, awaiting_cleaning+cleaning 5, ready 6; ED length 3 all `{sex:'F',isolation:false}`; deterministic (two calls deep-equal).
- [ ] Steps 2–5: fail → implement → pass → commit `feat: live demo state`. (Story tuning is asserted in Task 5.)

### Task 4: Predict

**Files:** Create `src/core/predict.js`, `tests/predict.test.js`

**Interfaces — Consumes:** Tasks 1–3. **Produces:**
- `confidenceOf(widthMin) -> 'High'|'Moderate'|'Low'`
- `predict(state) -> { [bedId]: { fast, typical, slow, confidence, stage } }` for every bed not `occupied`; `ready` beds → all = now, confidence `'Confirmed'`. Runs three clones with `advance` to now+1440, `autoAssign:false`, `pickNext = FIFO` (queue array order is the plan), duration = range index 0/1/2; an active task's doneAt is recomputed as `max(now, startedAt + duration)`. `stage` = human text of the bed's current step ("Pharmacy pending", "Transport requested", "Cleaning in progress", "Waiting for cleaning", "Ready for assignment").

- [ ] Step 1: tests — `confidenceOf(30)='High', (31)='Moderate', (60)='Moderate', (61)='Low'`; on live state every non-occupied bed has fast ≤ typical ≤ slow; B14 → 'Confirmed'; Review Focus 5: `JSON.stringify(state)` unchanged after `predict(state)`; moving B34 ahead of nothing changes nothing, but reversing Ward B cleaning queue changes B34.typical.
- [ ] Steps 2–5 → commit `feat: queue-aware readiness prediction`.

### Task 5: Minimum Intervention Engine

**Files:** Create `src/core/engine.js`, `tests/engine.test.js`

**Interfaces — Consumes:** Tasks 1–4. **Produces:**
- `autoTarget(state, horizon=120) -> { by, needs:[{sex, isolation, count}] }` grouped from `state.ed`.
- `evaluateTarget(state, target, preds?) -> { met:boolean, achievedAt:number|null, perNeed:[{...need, ready:int}] }` using typical times; each bed counted once; needs filled most-restrictive first (isolation first).
- `findPlan(state, target) -> { status:'no_demand'|'on_track'|'plan'|'not_possible', changes:Change[], result, suggestion? }`
  - `Change = {type:'move', ward, step, bedId, from:int, to:0, approver, reason} | {type:'borrow', ward, role:'housekeeper', from:now, until:now+120, approver, reason}`
  - Candidate moves: tasks at position >0 in any queue whose bed suits some need. Combos of size k apply moves in ascending original position. Among feasible plans of the smallest size, pick lowest `achievedAt`, then fewest distinct queues.
  - Borrow candidates: each ward, only if `poolAt(now) - activeBorrows ≥ 1`.
  - `not_possible`: try +1 of each role in each ward (6 options, with up to 3 moves); first feasible in order housekeeper, pharmacist, transporter, ward A then B → `suggestion:{ward, role}`; none → `'more_than_one'`.
  - Reason text: `Move B31 from position 3 to 1 in Ward B pharmacy — a female bed is ready by 12:55 instead of 13:20.`
- `applyPlan(state, plan)` → mutates queues/borrowed, returns state.
- `fmtTime(min) -> 'HH:MM'` (exported from `hospital.js`, added here).

- [ ] Step 1: tests — empty ED → `no_demand`; live state auto target = 3 female non-isolation by 780; live state FIFO not met; `findPlan` → `plan` with exactly 1 move, every change has approver; after `applyPlan`, `evaluateTarget` met; target with by=now+10 and 3 beds → `not_possible`; impossible target (10 female isolation beds) → `suggestion:'more_than_one'`; target already met → `on_track`, 0 changes.
- [ ] Steps 2–5 → commit `feat: minimum intervention engine`. If the live story assertions fail, tune `live.js` (Task 3 says so), not the engine.

### Task 6: Simulation

**Files:** Create `src/core/simulate.js`, `tests/simulate.test.js`

**Interfaces — Consumes:** Tasks 1, 2. **Produces:**
- `generateDay(rng) -> { approvals:[{at, bedId, discharge:{needsPharmacy, needsTransport, durations:{pharmacy, transport, cleaning}}}], arrivals:[{id, arrivedAt, sex, isolation}] }` — durations pre-drawn so all policies see the same day.
- `POLICIES = { normal, fasah, fasah_borrow }`, each `{ label, pickNext, borrowRule? }`. fasah pickNext: demand types ordered by oldest waiting ED patient; rank task by first matching type (none = ∞); tie → smallest typical remaining chain time; tie → queue order. borrowRule: if ward cleaning queue length ≥ 3, no active borrow for that ward, and `poolAt(now) − active borrows ≥ 1` → borrow housekeeper [now, now+120).
- `simulateDay(day, policyKey, staff) -> { boarding:[minutes], log }` — starts at 420, advances to 1860 with autoAssign, unplaced patients get `1860 − arrivedAt`.
- `runSimulation({days=200, seed=2026, policy='normal', staff}) -> { policy, days, patients, avgBoardingH, pctWithin6h, avgBoardingHByDay? }` — day i uses `createRng(seed*1000+i)`.

- [ ] Step 1: tests — same args → identical results; three policies on 20 days all return numbers with 0 ≤ pct ≤ 100; patients = 16×days; Review Focus 1: housekeeper 0 in both wards, 5 days → finishes, pctWithin6h < normal's; extra staff (+2 housekeepers each) avg boarding ≤ default.
- [ ] Steps 2–5 → commit `feat: 200-day simulation and policies`. Record the 200-day numbers in the ledger.

### Task 7: Delay Analyzer

**Files:** Create `src/core/analyzer.js`, `tests/analyzer.test.js`

**Interfaces — Produces:** `analyzeDelays(log) -> { totalWait, byStep:{pharmacy,transport,cleaning}, share:{...}(0–100, rounded), byWard:{A,B}, byBand:{'08–12','12–16','16–22','other'}, top:{step, share, ward, band}, headline:string }` where wait = startedAt − requestedAt, band by `requestedAt mod 1440`, approval entries ignored. Headline: `Cleaning caused 46% of waiting time, mostly Ward B, 12–16.` Empty log → headline `No completed steps yet.`

- [ ] Step 1: tests — hand-built 3-entry log gives exact shares/top/headline; empty log case.
- [ ] Steps 2–5 → commit `feat: delay analyzer`.

### Task 8: App shell, roles, board, clock

**Files:** Create `index.html`, `styles.css`, `src/ui/store.js`, `src/ui/app.js`, `src/ui/board.js`

**Interfaces — Produces:** `store = { state, role, subscribe(fn), set(mutator), reset() }`; roles `judge` (default, all tabs), `reception` (Board), `nurse` (Board, Predict), `charge` (Board, Predict, Engine), `manager` (Manager, Simulation, Built vs next). Tabs by hash: `#board #predict #engine #manager #sim #built`. Board: 4 counters, ED queue list, 36 bed tiles by ward with status color + isolation marker, click → detail panel with chain steps, timestamps, `updatedBy`, actions by role (nurse: record approval with two checkboxes, mark step done with "on behalf of" label; reception: assign ready bed to a matching ED patient). Clock: time display, "+15 min", Play/Pause (1 demo min per 250 ms), Reset. Banner "Synthetic data — simulated, not measured" in header.

- [ ] Step 1: `python3 -m http.server` + headless Chrome `--dump-dom` shows 36 `.bed` elements and no console errors; screenshot reviewed.
- [ ] Step 2: commit `feat: app shell, roles and live bed board`.

### Task 9: Predict and Engine screens

**Files:** Create `src/ui/predictView.js`, `src/ui/engineView.js`, `src/ui/calc.js`

`calc.js`: `calcPanel(title, rowsHtml) -> html` collapsible "How this is calculated". Predict: table bed / stage / expected (HH:MM) / range / confidence, sorted by expected. Engine: auto target with editable counts and time, "Find smallest change", plan card (changes, reasons, approvers, before→after), Approve / Reject; not-possible card with suggestion. Calc panels show durations, queue positions, staff and the search order.

- [ ] Verify by headless screenshot after clicking via a `#engine?autorun` hash param that runs findPlan on load; commit `feat: predict and engine screens`.

### Task 10: Manager, Simulation/What-if, Built vs next

**Files:** Create `src/ui/managerView.js`, `src/ui/simView.js`, `src/ui/builtView.js`

Manager: counts, average step durations and waits from a synthetic "today" (`simulateDay` day 0, normal), analyzer headline + bar per step + ward/band split, phase-3 label. Simulation: default comparison (3 policies, 200 days) computed on open with a progress note, table + bars, Ensiab citation; What-if: 6 staff selects (0–4), policy select, days 50/200/500, Run → result vs baseline; caption "Test a hiring decision before you pay for it." Built vs next: four phases, built items checked.

- [ ] Verify by headless screenshots; commit `feat: manager, simulation and roadmap screens`.

### Task 11: Guided demo

**Files:** Create `src/ui/tour.js`; modify `src/ui/app.js` (button)

7 steps from spec §10; each `{hash, selector, text, before?()}`; overlay highlight + caption + Next/Back/Exit; step 5 runs findPlan and applyPlan on the live state.

- [ ] Verify with `#tour=5` hash screenshot; commit `feat: guided demo`.

### Task 12: README

**Files:** Create `README.md` following spec §11a headings with real test count and 200-day results from Task 6; how to open locally and run tests; live link placeholder filled after deploy.

- [ ] `npm test` all pass; commit `docs: README in Filter 2 template order`.
