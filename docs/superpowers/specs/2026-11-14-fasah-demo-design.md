# FASAH Demo — Design Spec

**Date:** 2026-11-14 · **Team:** FASAH (Medathon 2026) · **Status:** approved design, awaiting spec review

## 1. Purpose

A clickable website that *is* Phase 1 (Simulate) of the FASAH roadmap. It shows the four-step loop — See, Coordinate, Predict, Optimize — running on synthetic data, and produces the team's first tested result: a simulated comparison of ED boarding time with and without FASAH.

**Success:** a judge can open one link, press "Guided demo", and understand the problem, the engine, and the simulated result in under 3 minutes, without anyone explaining it.

## 2. Global rules

- English only. Runs entirely in the browser. No backend, no login, no install.
- Plain HTML, CSS and JavaScript (ES modules). Tests use Node's built-in `node:test` (Node 22). No npm packages.
- Every screen shows the label **"Synthetic data — simulated, not measured"**.
- All randomness uses one seeded generator. Same seed → same results, every time.
- Calculation code (`src/core/`) never touches the page. Screen code (`src/ui/`) never does calculations.
- Clinical discharge approval is never made or changed by FASAH. Suggestions always need a named human approver.
- No claim of "AI" or "machine learning" anywhere in the site. The analyzer is described as "timestamp analysis".

## 3. The simulated hospital

| Item | Value |
|---|---|
| Beds | 36, IDs `B01`–`B36` |
| Ward A (male) | `B01`–`B18`; isolation rooms `B17`, `B18` |
| Ward B (female) | `B19`–`B36`; isolation rooms `B35`, `B36` |
| Staff per ward | 2 housekeepers, 1 discharge pharmacist, 1 transporter |
| Other wards (borrowing pool) | spare housekeepers by hour: 08–12 → 1, 12–16 → 0, 16–22 → 1. No spare pharmacists or transporters. |

**Live demo state.** The board opens at a demo clock of 11:00 with counts matching deck slide 8: 18 occupied, 7 discharge pending, 5 awaiting or in cleaning (the top counter groups both), 6 ready, and 3 patients waiting in the ED. A clock control offers "+15 min" and "Play / Pause" (1 demo minute per 0.25 s); when time moves, steps in progress finish on their typical duration.

**Bed statuses (colors match deck slide 8):** `occupied` (white), `discharge_pending` (orange), `awaiting_cleaning` (blue), `cleaning` (blue, striped), `ready` (green).

## 4. Coordinate — the discharge chain

1. **Clinical approval** (by a doctor; FASAH only records it) → bed becomes `discharge_pending`.
2. **Pharmacy** and **transport** run at the same time. Each patient needs pharmacy with probability 0.70 and transport with probability 0.40; unneeded steps are skipped.
3. **Patient leaves** when both are done → `awaiting_cleaning`.
4. **Cleaning** → `ready`.

Step durations in minutes (triangular: fast / typical / slow):

| Step | Fast | Typical | Slow |
|---|---|---|---|
| Pharmacy | 20 | 40 | 90 |
| Transport | 10 | 25 | 60 |
| Cleaning (standard) | 20 | 30 | 45 |
| Cleaning (isolation) | 45 | 60 | 90 |

Each queue is first-come-first-served unless the engine reorders it. Every step records `requestedAt`, `startedAt`, `doneAt`, and `updatedBy` (role). A nurse updating a step for another department is stored and shown as *"updated by nurse for housekeeping"* (or pharmacy / transport).

## 5. Roles (picked from a menu)

| Role | Sees | Can do |
|---|---|---|
| Reception | Bed board | Mark a `ready` bed as assigned to an ED patient |
| Nurse | Bed board, bed details | Advance any step; record clinical approval entered by the doctor |
| Charge nurse | Bed board, ED queue, engine | Edit the auto target; approve or reject engine plans |
| Executive doctor / manager | Summary, Delay Analyzer, What-if planner | Read reports; run what-if scenarios |

## 6. Predict

For each not-ready bed, FASAH replays the current queues forward (by position and staff count) three times: with all fast durations, all typical, all slow. That gives **expected ready time (typical)** and a **range (fast–slow)**.

**Confidence** from the range width: ≤ 30 min → High, ≤ 60 min → Moderate, > 60 min → Low.

Because waiting depends on queue position, reordering a queue changes the prediction — this is what lets the engine work.

## 7. Optimize — the Minimum Intervention Engine

**Auto target.** From the ED queue, FASAH groups waiting patients by bed type (sex × isolation) and builds one target: *"N male / N female / N isolation beds ready by T"*, where T = now + 2 hours. The charge nurse can edit N or T.

**A bed counts toward the target** only if its sex and isolation type match, and its *typical* predicted ready time ≤ T.

**Search, smallest change first:**
1. 0 changes (already on track → say so).
2. Move 1 task to the front of its queue; then 2; then 3. Only tasks on suitable beds are candidates.
3. Borrow 1 housekeeper from the pool (only if the pool has one at that hour), combined with 0–3 moves.
4. If still not met → **"Not possible with current staff"** plus what it would take: the smallest single extra staff member (housekeeper, pharmacist or transporter, per ward) that makes the target feasible, or "more than 1 extra staff needed."

**Ties** at the same size are broken by the earliest time the last target bed becomes ready.

**Output:** the list of changes, a one-line reason each, the predicted result vs. target, and the approver for each change (housekeeping lead, pharmacist, transport supervisor, or the lending ward's charge nurse). Nothing changes until the charge nurse approves.

## 8. Delay Analyzer (manager screen)

From step timestamps in the synthetic log:
- **Waiting time per step** = `startedAt − requestedAt`.
- Share of total waiting by step (pharmacy / transport / cleaning), split by ward and by time band (08–12, 12–16, 16–22).
- A headline sentence naming the largest contributor, e.g. *"Cleaning caused 46% of waiting time, mostly Ward B, 12–16."*
- Pitch label: *"Timestamp analysis today; with real hospital data in Phase 3 this becomes a learning model."*

## 9. Simulate and What-if planner

**One simulated day:** 07:00 to 07:00 next day (24 h of activity; unfinished patients measured up to the end).
- Morning: 10 beds per ward start occupied with a discharge approved between 08:00 and 14:00 (uniform); the rest start occupied with no discharge that day.
- ED admission requests: 16 per day, arrival times uniform 07:00–21:00. Each needs male/female 50/50, isolation 10%.
- A bed is assigned to the longest-waiting matching ED patient the moment it becomes ready.
- **Boarding time** = assignment time − ED arrival time.

**Policies:**
- **Normal:** all queues first-come-first-served.
- **FASAH (reorder):** each queue picks next the task whose bed type matches the most-waited-for ED demand; ties → task closest to finishing its chain.
- **FASAH (reorder + borrow):** as above, and when a ward's cleaning queue has ≥ 3 tasks and the pool has a spare housekeeper, borrow one for 2 hours.

**Default comparison:** 200 days, seed 2026, all three policies on identical generated days. Reported per policy: **average boarding time (h)**, **% placed within 6 h** (the Ensiab study's target), plus the change vs. Normal.

**What-if planner:** the manager changes staff counts per ward (0–4 for each role), the policy, and the number of days (50 / 200 / 500), and runs. Results show next to the Normal baseline with the default staff. The screen says: *"Test a hiring decision before you pay for it."*

## 10. Guided demo

A button on every screen starts a 7-step walkthrough with a highlighted area and a short caption per step:
1. The board: 36 beds, colors. 2. A bottleneck: Ward B cleaning queue builds up. 3. Predict: readiness ranges and confidence. 4. Auto target from the ED queue. 5. Engine plan + approvers; charge nurse approves; predictions update. 6. Delay Analyzer headline. 7. Simulation results.

## 11. Transparency (from the competition's prototype criteria)

The competition ranks interactive prototypes highest and rewards "clear calculations or scientific standards", plus a clear statement of what was built and what remains.

- **"How this is calculated" panel** on Predict, Engine, Delay Analyzer and Simulate screens: a collapsible box showing the formula in plain words and the actual numbers used for the item on screen (durations, queue positions, staff counts, seed, number of days). The 6-hour placement target cites: Alotaibi et al., *Improving hospital flow 'Ensiab Project'*, BMJ Open Quality 2021, doi:10.1136/bmjoq-2021-001505.
- **"Built vs. next" screen:** what works today (Phase 1 Simulate, every feature in this spec) and what each later phase adds (Pilot: real ward, manual updates with audit trail, usability testing; Integrate: hospital-system interfaces, durations learned from real data; Scale: multi-ward, safety review). It states that all numbers are synthetic and that real outcomes require a pilot.

## 12. Out of scope

Real authentication, a database, hospital system integration, machine learning, Arabic language, mobile-first layout (it must still be usable on a laptop and readable on a phone).

## 13. Repository layout

```
index.html            app shell + tab navigation
styles.css
src/core/             random, hospital, predict, engine, analyzer, simulate (pure JS)
src/ui/               one file per screen + guided demo
tests/                node:test files for src/core
README.md             what it is, how to open, how to run tests, "synthetic data" note
```
