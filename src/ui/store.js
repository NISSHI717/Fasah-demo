// Shared UI state: the live hospital, the current role, and what the charge nurse decided.
import { createLiveState } from '../core/live.js';
import { advance } from '../core/flow.js';

const listeners = new Set();

export const store = {
  state: createLiveState(),
  role: 'judge',
  selected: null,       // bed ID shown in the detail panel
  plan: null,           // last engine result shown on the Engine screen
  target: null,         // the target the charge nurse is editing (null = auto)
  targetError: null,
  decisions: [],        // approved / rejected plans, newest first
  playing: null,        // interval id while the clock runs

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  notify() { listeners.forEach(fn => fn()); },
  set(mutator) { mutator(this); this.notify(); },

  tick(minutes) {
    advance(this.state, this.state.now + minutes);
    this.plan = null; // the world moved; the old suggestion may no longer fit
    this.notify();
  },
  reset() {
    this.stop();
    Object.assign(this, { state: createLiveState(), selected: null, plan: null, target: null, targetError: null, decisions: [] });
    this.notify();
  },
  play() {
    if (this.playing) return;
    this.playing = setInterval(() => this.tick(1), 250);
    this.notify();
  },
  stop() {
    if (this.playing) clearInterval(this.playing);
    this.playing = null;
  },
};
