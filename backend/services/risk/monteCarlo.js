// Monte Carlo risk model for a polyhouse project: instead of one payback figure, thousands of plausible years,
// each drawing yield, price, build cost and running cost from ranges that come from data. Pure arithmetic and a
// seeded random generator, so the same inputs always give the same answer. The AI assistant may explain the
// result but never computes it.
//
// Where each range comes from (and what is only an assumption) travels with the result in `assumptions`.

// Same share as src/lib/finance.ts, so the median here matches the returns panel (a test keeps them equal).
const CULTIVABLE_AREA_SHARE = 0.85;
// The cost model's own estimate band (services/costModel.js ESTIMATE_BAND): the build cost is +/- 10%.
const DEFAULT_COST_BAND = 0.1;
// No data on how running costs vary, so they move +/- 10 percentage points around the user's figure.
const OPEX_SPREAD_POINTS = 10;
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

/** "45-84 t/ha" or "132-396 stems/m2/year" -> { low, high }; null when the text has no range. */
function yieldRangeFrom(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return high > low && low > 0 ? { low, high } : null;
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

/**
 * @param {object} input
 * @param {number} input.areaSqm
 * @param {number} input.capitalCostInr          the cost model's total
 * @param {number} [input.costBand]               fraction either side of the total (default 0.1)
 * @param {number} input.subsidyOwnCostInr        the build cost the scheme compares with its norm (no irrigation)
 * @param {{ normCostInr: number, capInr: number|null } | null} input.scheme   null: no scheme result
 * @param {number} input.subsidyPct
 * @param {number} input.yieldPerSqm              the user's yield (kg or stems per cropped m2 per year)
 * @param {number} input.pricePerUnit
 * @param {number} input.operatingCostPct
 * @param {{ low: number, high: number }} input.yieldRange   published (or planner) range, any unit: only its shape is used
 * @param {number} input.priceSigmaLog            spread of log price
 * @param {number} [input.years]                  horizon (default 5, as the returns panel)
 * @param {number} [input.discountRatePct]
 * @param {number} [input.trials]
 * @param {number} [input.seed]
 */
function simulateRisk(input) {
  const years = input.years ?? 5;
  const trials = input.trials ?? 5000;
  const rate = (input.discountRatePct ?? 10) / 100;
  const band = input.costBand ?? DEFAULT_COST_BAND;
  const croppedArea = input.areaSqm * CULTIVABLE_AREA_SHARE;
  const random = createRandom(input.seed ?? 1);

  // Yield moves within the published range's shape, centred on the user's own figure.
  const mid = (input.yieldRange.low + input.yieldRange.high) / 2;
  const yieldLow = input.yieldRange.low / mid;
  const yieldHigh = input.yieldRange.high / mid;
  const opex = input.operatingCostPct;
  const opexLow = Math.max(0, opex - OPEX_SPREAD_POINTS);
  const opexHigh = Math.min(100, opex + OPEX_SPREAD_POINTS);
  const sigma = Math.max(0, input.priceSigmaLog);

  const subsidyFor = (capital, costMultiplier) => {
    const base = input.scheme
      ? Math.min(input.subsidyOwnCostInr * costMultiplier, input.scheme.normCostInr)
      : capital * (input.areaSqm > 0 ? Math.min(1, 4000 / input.areaSqm) : 0);
    return Math.min((base * input.subsidyPct) / 100, input.scheme?.capInr ?? Number.POSITIVE_INFINITY, capital);
  };

  /** One project: net present value, payback (Infinity if not within the horizon), average yearly profit. */
  const runProject = ({ costMultiplier, opexPct, yieldMultiplier, priceMultiplier }) => {
    const capital = input.capitalCostInr * costMultiplier;
    const net = capital - subsidyFor(capital, costMultiplier);
    let cash = -net;
    let npv = -net;
    let payback = net <= 0 ? 0 : Number.POSITIVE_INFINITY;
    let totalProfit = 0;
    for (let year = 1; year <= years; year += 1) {
      const revenue = croppedArea * input.yieldPerSqm * yieldMultiplier(year) * input.pricePerUnit * priceMultiplier(year);
      const profit = revenue * (1 - opexPct / 100);
      totalProfit += profit;
      if (payback === Number.POSITIVE_INFINITY && cash + profit >= 0 && profit > 0) payback = year - 1 + -cash / profit;
      cash += profit;
      npv += profit / (1 + rate) ** year;
    }
    return { npv, payback, averageProfit: totalProfit / years };
  };

  const npvs = [];
  const paybacks = [];
  const profits = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const costMultiplier = triangular(random(), 1 - band, 1, 1 + band);
    const opexPct = triangular(random(), opexLow, opex, opexHigh);
    // Yield and price change every year; the build cost and the running-cost share are fixed per project.
    const yields = Array.from({ length: years }, () => triangular(random(), yieldLow, 1, yieldHigh));
    const prices = Array.from({ length: years }, () => Math.exp(sigma * standardNormal(random)));
    const outcome = runProject({
      costMultiplier,
      opexPct,
      yieldMultiplier: (year) => yields[year - 1],
      priceMultiplier: (year) => prices[year - 1],
    });
    npvs.push(outcome.npv);
    paybacks.push(outcome.payback);
    profits.push(outcome.averageProfit);
  }
  npvs.sort((a, b) => a - b);
  paybacks.sort((a, b) => a - b);
  profits.sort((a, b) => a - b);

  // Which input matters most: each one at its 10th and 90th percentile, the others at their middle value.
  const middle = { costMultiplier: 1, opexPct: opex, yieldMultiplier: () => 1, priceMultiplier: () => 1 };
  const swing = (key, label, low, high) => {
    const atLow = runProject({ ...middle, [key]: low }).npv;
    const atHigh = runProject({ ...middle, [key]: high }).npv;
    return { driver: label, npvAtP10: round(atLow), npvAtP90: round(atHigh), range: round(Math.abs(atHigh - atLow)) };
  };
  const drivers = [
    swing("yieldMultiplier", "yield", () => triangular(0.1, yieldLow, 1, yieldHigh), () => triangular(0.9, yieldLow, 1, yieldHigh)),
    swing("priceMultiplier", "price", () => Math.exp(-Z90 * sigma), () => Math.exp(Z90 * sigma)),
    swing("costMultiplier", "buildCost", triangular(0.1, 1 - band, 1, 1 + band), triangular(0.9, 1 - band, 1, 1 + band)),
    swing("opexPct", "operatingCost", triangular(0.1, opexLow, opex, opexHigh), triangular(0.9, opexLow, opex, opexHigh)),
  ].sort((a, b) => b.range - a.range);

  const within = (limit) => share(paybacks.filter((value) => value <= limit).length, trials);
  const horizons = [...new Set([3, 5, years].filter((limit) => limit <= years))];

  return {
    trials,
    years,
    npv: { p10: round(quantile(npvs, 0.1)), p50: round(quantile(npvs, 0.5)), p90: round(quantile(npvs, 0.9)) },
    // A payback percentile beyond the horizon is null: "not within N years".
    paybackYears: { p10: round1(quantile(paybacks, 0.1)), p50: round1(quantile(paybacks, 0.5)), p90: round1(quantile(paybacks, 0.9)) },
    annualProfit: { p10: round(quantile(profits, 0.1)), p50: round(quantile(profits, 0.5)), p90: round(quantile(profits, 0.9)) },
    probabilities: {
      loss: share(npvs.filter((value) => value < 0).length, trials),
      paybackWithin: Object.fromEntries(horizons.map((limit) => [limit, within(limit)])),
    },
    histogram: histogram(npvs),
    drivers,
    assumptions: {
      yieldRange: { lowShare: Math.round(yieldLow * 100) / 100, highShare: Math.round(yieldHigh * 100) / 100 },
      priceSigmaLog: sigma,
      costBand: band,
      operatingCostPoints: OPEX_SPREAD_POINTS,
      discountRatePct: rate * 100,
      seed: input.seed ?? 1,
    },
  };
}

module.exports = { CULTIVABLE_AREA_SHARE, createRandom, simulateRisk, triangular, yieldRangeFrom };
