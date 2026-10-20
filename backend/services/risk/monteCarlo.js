// The building blocks of the Monte Carlo risk model (risk/poultryRisk.js): a seeded random generator, triangular
// and normal draws, quantiles and a histogram. Pure arithmetic, so the same seed gives the same answer anywhere.

const HISTOGRAM_BINS = 20;
const Z90 = 1.2815515655446004; // standard normal 90th percentile

/** Small, fast, seedable generator (mulberry32): same seed, same sequence, on every machine. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inverse of the triangular distribution's CDF: u in [0, 1) to a value between low and high, most likely `mode`. */
function triangular(u, low, mode, high) {
  if (!(high > low)) return mode;
  const split = (mode - low) / (high - low);
  return u < split
    ? low + Math.sqrt(u * (high - low) * (mode - low))
    : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

function standardNormal(random) {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const value = sorted[below] + (sorted[above] - sorted[below]) * (position - below);
  return Number.isFinite(value) ? value : null;
}

const round = (value) => (value === null ? null : Math.round(value));
const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);
const share = (count, total) => Math.round((count / total) * 1000) / 1000;

function histogram(sorted) {
  const low = quantile(sorted, 0.01);
  const high = quantile(sorted, 0.99);
  if (low === null || high === null || high <= low) return [];
  const width = (high - low) / HISTOGRAM_BINS;
  const counts = new Array(HISTOGRAM_BINS).fill(0);
  for (const value of sorted) {
    const index = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor((value - low) / width)));
    counts[index] += 1;
  }
  return counts.map((count, index) => ({ from: round(low + index * width), to: round(low + (index + 1) * width), count }));
}

module.exports = { Z90, createRandom, histogram, quantile, standardNormal, triangular };
