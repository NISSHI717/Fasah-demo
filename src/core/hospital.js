// The simulated hospital: every synthetic number lives here (spec §3–4).

export const CONFIG = {
  staff: { housekeeper: 2, pharmacist: 1, transporter: 1 }, // per ward
  // Spare housekeepers other wards can lend, by time of day: [startMin, endMin, count]
  pool: [[480, 720, 1], [720, 960, 0], [960, 1320, 1]],
  // minutes: [fast, typical, slow]. Pharmacy and transport are calibrated so the
  // Normal simulation reproduces the Ensiab baseline "time till discharge" of
  // 265 min (Alotaibi et al., BMJ Open Quality 2021) — see tests/simulate.test.js.
  durations: {
    pharmacy: [45, 90, 240],
    transport: [20, 45, 120],
    cleaning: [20, 30, 45],
    cleaningIsolation: [45, 60, 90],
  },
  pNeedsPharmacy: 0.70,
  pNeedsTransport: 0.40,
  confidence: { high: 30, moderate: 60 }, // range width in minutes
  targetHorizon: 120,
  borrowLength: 120,
  sim: {
    start: 420, end: 1860, approvalsPerWard: 10, approvalWindow: [480, 840],
    arrivals: 16, arrivalWindow: [420, 1260], pMale: 0.5, pIsolation: 0.10,
    seed: 2026, days: 200, targetMinutes: 360,
  },
};

export const WARDS = ['A', 'B'];
export const STEPS = ['pharmacy', 'transport', 'cleaning'];
export const ROLES = ['housekeeper', 'pharmacist', 'transporter'];

export const BEDS = Array.from({ length: 36 }, (_, i) => {
  const n = i + 1;
  const ward = n <= 18 ? 'A' : 'B';
  return {
    id: 'B' + String(n).padStart(2, '0'),
    ward,
    sex: ward === 'A' ? 'M' : 'F',
    isolation: [17, 18, 35, 36].includes(n),
  };
});

const byId = Object.fromEntries(BEDS.map(b => [b.id, b]));
export const bedById = id => byId[id];

// Safety rule: sex must match and the isolation flag must match exactly.
export const suits = (bed, need) => bed.sex === need.sex && bed.isolation === need.isolation;

const ROLE = { pharmacy: 'pharmacist', transport: 'transporter', cleaning: 'housekeeper' };
export const roleFor = step => ROLE[step];

const APPROVER = {
  pharmacy: 'Pharmacist',
  transport: 'Transport supervisor',
  cleaning: 'Housekeeping lead',
  borrow: 'Charge nurse, lending ward',
};
export const approverFor = kind => APPROVER[kind];

export function poolAt(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  const slot = CONFIG.pool.find(([a, b]) => m >= a && m < b);
  return slot ? slot[2] : 0;
}

export function durationRange(step, bed) {
  if (step === 'cleaning' && bed.isolation) return CONFIG.durations.cleaningIsolation;
  return CONFIG.durations[step];
}
export const typicalOf = (step, bed) => durationRange(step, bed)[1];

export function fmtTime(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export const typeLabel = need =>
  `${need.sex === 'M' ? 'male' : 'female'}${need.isolation ? ' isolation' : ''}`;
