// Monte Carlo risk for a poultry farm: thousands of plausible years, each drawing mortality, feed conversion, the
// sale price, the feed price and the build cost from ranges, with a small chance of an outbreak that loses a batch.
// Every simulated year goes through production.js, the same arithmetic as the Earnings step, so the median here
// matches the screens. Seeded, so the same inputs always give the same answer; the AI may explain it, never compute it.
//
// None of the ranges has an official source yet, so each is a labelled assumption that travels with the result.

const { Z90, createRandom, histogram, quantile, standardNormal, triangular } = require("./monteCarlo");
const { computePoultryReturns } = require("../poultry/production");
const { isLayer } = require("../poultry/costModel");

// Shares of the user's mortality: 5% becomes 3% at best and 12% at worst (docs/migration/feature-changes.md, 6).
const MORTALITY_LOW_SHARE = 0.6;
const MORTALITY_HIGH_SHARE = 2.4;
// Feed conversion 0.15 better to 0.2 worse than planned (1.55 / 1.7 / 1.9 in the plan).
const FCR_BETTER = 0.15;
const FCR_WORSE = 0.2;
// Layers: feed eaten per bird within +/- 10%.
const LAYER_FEED_BAND = 0.1;
const DEFAULT_COST_BAND = 0.1;
// Assumed spreads of the log price until price history is stored: live broilers swing more than eggs.
const ASSUMED_SIGMA_LOG = { meat: 0.2, eggs: 0.15 };
const DEFAULT_FEED_PRICE_BAND_PCT = 10;
// No official rate of outbreaks or culling orders was found, so the yearly chance is the user's to set.
const DEFAULT_OUTBREAK_CHANCE_PCT = 2;
// An outbreak loses one batch of meat birds; a layer flock is culled half-way through its cycle on average.
const LAYER_OUTBREAK_YEAR_SHARE = 0.5;

const round = (value) => (value === null ? null : Math.round(value));
const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);
const share = (count, total) => Math.round((count / total) * 1000) / 1000;

/**
 * @param {object} input
 * @param {string} input.birdType
 * @param {number} input.flockSize
 * @param {number} input.projectCost          what the farmer finances (production.js projectCost)
 * @param {object} input.assumptions          production.js assumptions as planned
 * @param {number} [input.outbreakChancePct]  yearly chance of losing a batch (default 2)
 * @param {number} [input.salePriceSigmaLog]  spread of the log sale price (default by product)
 * @param {number} [input.feedPriceBandPct]   +/- band of the feed price (default 10)
 * @param {number} [input.costBand]           +/- share of the build cost (default 0.1)
 * @param {number} [input.years]
 * @param {number} [input.discountRatePct]
 * @param {number} [input.trials]
 * @param {number} [input.seed]
 */
function simulatePoultryRisk(input) {
  const years = input.years ?? 5;
  const trials = input.trials ?? 5000;
  const rate = (input.discountRatePct ?? 10) / 100;
  const band = input.costBand ?? DEFAULT_COST_BAND;
  const random = createRandom(input.seed ?? 1);
  const layer = isLayer(input.birdType);
  const product = layer ? "eggs" : "meat";
  const planned = input.assumptions;
  const contract = planned.farmingModel === "contract";
  // Under contract the integrator buys the feed and sets the growing charge, so neither moves for the farmer.
  const sigma = contract ? 0 : Math.max(0, input.salePriceSigmaLog ?? ASSUMED_SIGMA_LOG[product]);
  const feedBand = contract ? 0 : Math.max(0, input.feedPriceBandPct ?? DEFAULT_FEED_PRICE_BAND_PCT) / 100;
  const outbreakChance = Math.min(1, Math.max(0, (input.outbreakChancePct ?? DEFAULT_OUTBREAK_CHANCE_PCT) / 100));

  const mortalityKey = layer ? "layingMortalityPct" : "mortalityPct";
  const mortality = planned[mortalityKey];
  const mortalityRange = [mortality * MORTALITY_LOW_SHARE, mortality, Math.min(100, mortality * MORTALITY_HIGH_SHARE)];
  const priceKey = layer ? "eggInr" : contract ? "growingChargeInrPerKg" : "saleInrPerKg";

  /** A year with these draws: the assumptions as planned, moved by each multiplier. */
  const yearAssumptions = ({ mortalityPct, conversion, priceMultiplier, feedPriceMultiplier }) => {
    const a = { ...planned, [mortalityKey]: mortalityPct, [priceKey]: planned[priceKey] * priceMultiplier };
    a.feedInrPerKg = planned.feedInrPerKg * feedPriceMultiplier;
    if (layer) {
      a.growerFeedKgPerBird = planned.growerFeedKgPerBird * conversion;
      a.layingFeedKgPerBird = planned.layingFeedKgPerBird * conversion;
    } else {
      a.fcr = conversion;
    }
    return a;
  };
  const conversionRange = layer ? [1 - LAYER_FEED_BAND, 1, 1 + LAYER_FEED_BAND] : [planned.fcr - FCR_BETTER, planned.fcr, planned.fcr + FCR_WORSE];

  const yearProfit = (draws, outbreak) => {
    const r = computePoultryReturns({ birdType: input.birdType, flockSize: input.flockSize, projectCost: 0, assumptions: yearAssumptions(draws) });
    const lostShare = outbreak ? (layer ? LAYER_OUTBREAK_YEAR_SHARE : r.cyclesPerYear > 0 ? Math.min(1, 1 / r.cyclesPerYear) : 0) : 0;
    // The birds are lost after their costs are paid: the revenue goes, the cost stays.
    return r.annualRevenue * (1 - lostShare) - r.annualOperatingCost;
  };

  /** One project: NPV, payback (Infinity if not within the horizon) and the average yearly profit. */
  const runProject = (costMultiplier, yearDraws) => {
    const capital = input.projectCost * costMultiplier;
    const net = Math.max(0, capital - Math.min(planned.subsidyInr || 0, capital));
    let cash = -net;
    let npv = -net;
    let payback = net <= 0 ? 0 : Number.POSITIVE_INFINITY;
    let total = 0;
    for (let year = 1; year <= years; year += 1) {
      const { draws, outbreak } = yearDraws(year);
      const profit = yearProfit(draws, outbreak);
      total += profit;
      if (payback === Number.POSITIVE_INFINITY && cash + profit >= 0 && profit > 0) payback = year - 1 + -cash / profit;
      cash += profit;
      npv += profit / (1 + rate) ** year;
    }
    return { npv, payback, averageProfit: total / years };
  };

  const middleDraws = { mortalityPct: mortality, conversion: conversionRange[1], priceMultiplier: 1, feedPriceMultiplier: 1 };
  const npvs = [];
  const paybacks = [];
  const profits = [];
  let outbreakYears = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const costMultiplier = triangular(random(), 1 - band, 1, 1 + band);
    const perYear = Array.from({ length: years }, () => {
      const outbreak = random() < outbreakChance;
      if (outbreak) outbreakYears += 1;
      return {
        outbreak,
        draws: {
          mortalityPct: triangular(random(), ...mortalityRange),
          conversion: triangular(random(), ...conversionRange),
          priceMultiplier: Math.exp(sigma * standardNormal(random)),
          feedPriceMultiplier: triangular(random(), 1 - feedBand, 1, 1 + feedBand),
        },
      };
    });
    const outcome = runProject(costMultiplier, (year) => perYear[year - 1]);
    npvs.push(outcome.npv);
    paybacks.push(outcome.payback);
    profits.push(outcome.averageProfit);
  }
  npvs.sort((a, b) => a - b);
  paybacks.sort((a, b) => a - b);
  profits.sort((a, b) => a - b);

  // Which input matters most: each at its 10th and 90th percentile, the others at their planned value.
  // The outbreak driver compares no outbreak with one outbreak in the first year.
  const steady = (draws, outbreak = false) => (year) => ({ draws: { ...middleDraws, ...draws }, outbreak: outbreak && year === 1 });
  const swing = (driver, low, high) => {
    const atLow = runProject(low.cost ?? 1, steady(low.draws, low.outbreak)).npv;
    const atHigh = runProject(high.cost ?? 1, steady(high.draws, high.outbreak)).npv;
    return { driver, npvAtP10: round(atLow), npvAtP90: round(atHigh), range: round(Math.abs(atHigh - atLow)) };
  };
  const p = (q, range) => triangular(q, ...range);
  const drivers = [
    swing("mortality", { draws: { mortalityPct: p(0.1, mortalityRange) } }, { draws: { mortalityPct: p(0.9, mortalityRange) } }),
    swing(layer ? "feedEaten" : "fcr", { draws: { conversion: p(0.1, conversionRange) } }, { draws: { conversion: p(0.9, conversionRange) } }),
    swing("salePrice", { draws: { priceMultiplier: Math.exp(-Z90 * sigma) } }, { draws: { priceMultiplier: Math.exp(Z90 * sigma) } }),
    swing("feedPrice", { draws: { feedPriceMultiplier: 1 - 0.8 * feedBand } }, { draws: { feedPriceMultiplier: 1 + 0.8 * feedBand } }),
    swing("buildCost", { cost: p(0.1, [1 - band, 1, 1 + band]) }, { cost: p(0.9, [1 - band, 1, 1 + band]) }),
    swing("outbreak", { outbreak: false }, { outbreak: true }),
  ].sort((a, b) => b.range - a.range);

  const within = (limit) => share(paybacks.filter((value) => value <= limit).length, trials);
  const horizons = [...new Set([3, 5, years].filter((limit) => limit <= years))];

  return {
    trials,
    years,
    npv: { p10: round(quantile(npvs, 0.1)), p50: round(quantile(npvs, 0.5)), p90: round(quantile(npvs, 0.9)) },
    paybackYears: { p10: round1(quantile(paybacks, 0.1)), p50: round1(quantile(paybacks, 0.5)), p90: round1(quantile(paybacks, 0.9)) },
    annualProfit: { p10: round(quantile(profits, 0.1)), p50: round(quantile(profits, 0.5)), p90: round(quantile(profits, 0.9)) },
    probabilities: {
      loss: share(npvs.filter((value) => value < 0).length, trials),
      paybackWithin: Object.fromEntries(horizons.map((limit) => [limit, within(limit)])),
      outbreakYear: share(outbreakYears, trials * years),
    },
    histogram: histogram(npvs),
    drivers,
    assumptions: {
      mortalityRangePct: mortalityRange.map(round1),
      conversionRange: conversionRange.map((value) => Math.round(value * 100) / 100),
      salePriceSigmaLog: sigma,
      feedPriceBandPct: feedBand * 100,
      outbreakChancePct: outbreakChance * 100,
      costBand: band,
      discountRatePct: rate * 100,
      seed: input.seed ?? 1,
      // Every range above is the planner's assumption until price and disease data are stored.
      basis: "assumption",
    },
  };
}

module.exports = { ASSUMED_SIGMA_LOG, DEFAULT_OUTBREAK_CHANCE_PCT, simulatePoultryRisk };
