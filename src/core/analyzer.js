// Delay Analyzer (spec §8): where does the waiting happen?
// Timestamp analysis of completed steps: wait = startedAt − requestedAt.

import { STEPS, WARDS } from './hospital.js';

export const BANDS = [['08–12', 480, 720], ['12–16', 720, 960], ['16–22', 960, 1320]];
const bandOf = min => {
  const m = ((min % 1440) + 1440) % 1440;
  return BANDS.find(([, a, b]) => m >= a && m < b)?.[0] ?? 'other';
};
const NAME = { pharmacy: 'Pharmacy', transport: 'Transport', cleaning: 'Cleaning' };
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const argmax = obj => Object.entries(obj).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

export function analyzeDelays(log) {
  const entries = log.filter(e => STEPS.includes(e.step));
  const bandKeys = [...BANDS.map(b => b[0]), 'other'];
  const byStep = zero(STEPS), byWard = zero(WARDS), byBand = zero(bandKeys);
  const detail = Object.fromEntries(STEPS.map(s => [s, { ward: zero(WARDS), band: zero(bandKeys) }]));
  let totalWait = 0;
  for (const e of entries) {
    const w = Math.max(0, e.startedAt - e.requestedAt);
    const band = bandOf(e.requestedAt);
    totalWait += w;
    byStep[e.step] += w; byWard[e.ward] += w; byBand[band] += w;
    detail[e.step].ward[e.ward] += w; detail[e.step].band[band] += w;
  }
  const share = Object.fromEntries(STEPS.map(s => [s, totalWait ? Math.round((byStep[s] / totalWait) * 100) : 0]));
  if (!totalWait) {
    return { totalWait, byStep, share, byWard, byBand, top: null, headline: 'No completed steps yet.' };
  }
  const step = argmax(byStep);
  const top = { step, share: share[step], ward: argmax(detail[step].ward), band: argmax(detail[step].band) };
  const headline = `${NAME[step]} caused ${top.share}% of waiting time, mostly Ward ${top.ward}, ${top.band}.`;
  return { totalWait, byStep, share, byWard, byBand, top, headline, detail };
}
