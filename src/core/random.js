// Seeded random numbers (mulberry32). Same seed -> same results, every run.
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    bernoulli: p => next() < p,
    // Triangular distribution: fast (a), typical (m), slow (b).
    triangular(a, m, b) {
      const u = next();
      const c = (m - a) / (b - a);
      return u < c
        ? a + Math.sqrt(u * (b - a) * (m - a))
        : b - Math.sqrt((1 - u) * (b - a) * (b - m));
    },
  };
}
