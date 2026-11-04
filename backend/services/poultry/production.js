// A poultry farm's year: batches, birds and eggs sold, feed eaten, revenue, running cost and payback. The same
// arithmetic as src/lib/poultryFinance.ts (a test keeps the two equal), so the AI's figures match the screens.
//
// Meat birds (broiler, desi) run all-in all-out batches: rearing days plus cleaning days. Independent farmers buy
// chicks, feed and medicines and sell live weight; contract farmers are paid a growing charge per kg by the
// integrator, who supplies the inputs. Layers are one flock at a time: grown to point of lay and kept for the laying
// weeks in the same shed, then the shed is cleaned. See docs/migration/feature-changes.md, section 5.

const { NORMS } = require("../../data/poultry/norms");

const PROJECTION_YEARS = 5;
const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = 365 / 12;
// The per-bird running costs of the broiler study are for a 56-day cycle; layers pay them per day of the cycle.
const RUNNING_COST_CYCLE_DAYS = 56;

const COSTS = NORMS.costs;
const nonNegative = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const clampPct = (value) => Math.min(100, nonNegative(value));
const isLayer = (birdType) => NORMS.birdTypes[birdType]?.product === "eggs";

/** Every editable assumption for a bird, starting from the norms and the planner's starting prices. */
/** A planning default, using the state's own rate when the norms have one (sale price and egg price vary by state). */
const priceIn = (entry, stateName) => entry.byState?.[String(stateName || "").trim()] ?? entry.value;

function defaultAssumptions(birdType, farmingModel = "independent", stateName = "") {
  const bird = NORMS.birdTypes[birdType];
  if (!bird) return null;
  const pick = (entries) => Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, priceIn(entry, stateName)]));
  if (bird.product === "eggs") {
    return {
      farmingModel: "independent",
      growerWeeks: bird.growerWeeks,
      layingWeeks: bird.layingWeeks,
      cleaningDays: bird.cleaningDays,
      chicksPerLayerHoused: bird.chicksPerLayerHoused,
      layingMortalityPct: bird.layingMortalityPct,
      eggsPerHen: bird.eggsPerHen,
      growerFeedKgPerBird: bird.growerFeedKgPerBird,
      layingFeedKgPerBird: bird.layingFeedKgPerBird,
      growerManureKgPerWeek: bird.manureKgPerBirdPerWeek.grower,
      layerManureKgPerWeek: bird.manureKgPerBirdPerWeek.layer,
      labourInrPerMonth: COSTS.labourInrPerMonth.value,
      labourBirdsPerWorker: COSTS.labourBirdsPerWorker.value,
      otherCostInrPerBird: COSTS.otherCostInrPerBird.value,
      insurancePctOfChickCost: COSTS.birdInsurancePctOfChickCost.value,
      ...pick(NORMS.planningDefaults.layer),
      subsidyInr: 0,
    };
  }
  return {
    farmingModel: farmingModel === "contract" ? "contract" : "independent",
    rearingDays: bird.rearingDays,
    cleaningDays: bird.cleaningDays,
    mortalityPct: bird.mortalityPct,
    saleWeightKg: bird.saleWeightKg,
    fcr: bird.fcr,
    labourInrPerBird: COSTS.labourInrPerBird.value,
    otherCostInrPerBird: COSTS.otherCostInrPerBird.value,
    manureInrPerBird: NORMS.prices.manureInrPerBird[0].value,
    gunnyBagsInrPerBird: NORMS.prices.gunnyBagsInrPerBird[0].value,
    insurancePctOfChickCost: COSTS.birdInsurancePctOfChickCost.value,
    ...pick(NORMS.planningDefaults.meat[birdType === "desi" ? "desi" : "broiler"]),
    subsidyInr: 0,
  };
}

/** One batch of meat birds: what is sold, what is eaten and what it all costs. */
function meatBatch(flock, a) {
  const placed = nonNegative(flock);
  const sold = placed * (1 - clampPct(a.mortalityPct) / 100);
  const kgSold = sold * nonNegative(a.saleWeightKg);
  const feedKg = kgSold * nonNegative(a.fcr);
  const byProducts = placed * (nonNegative(a.manureInrPerBird) + nonNegative(a.gunnyBagsInrPerBird));
  const farmCosts = placed * (nonNegative(a.labourInrPerBird) + nonNegative(a.otherCostInrPerBird));
  if (a.farmingModel === "contract") {
    // The integrator supplies chicks, feed and medicines; the farmer earns a growing charge on the live weight.
    return { sold, kgSold, feedKg, eggs: 0, revenue: kgSold * nonNegative(a.growingChargeInrPerKg) + byProducts, cost: farmCosts };
  }
  const chickCost = placed * nonNegative(a.chickInr);
  const cost =
    chickCost +
    feedKg * nonNegative(a.feedInrPerKg) +
    placed * nonNegative(a.vaccineInrPerBird) +
    (chickCost * clampPct(a.insurancePctOfChickCost)) / 100 +
    farmCosts;
  return { sold, kgSold, feedKg, eggs: 0, revenue: kgSold * nonNegative(a.saleInrPerKg) + byProducts, cost };
}

/** One layer flock from chick to cull: eggs over the laying weeks (half the mortality on average), culls and manure. */
function layerCycle(flock, a, cycleDays) {
  const housed = nonNegative(flock);
  const chicks = housed * nonNegative(a.chicksPerLayerHoused);
  const mortality = clampPct(a.layingMortalityPct) / 100;
  const eggs = housed * (1 - mortality / 2) * nonNegative(a.eggsPerHen);
  const culled = housed * (1 - mortality);
  const feedKg = chicks * nonNegative(a.growerFeedKgPerBird) + housed * nonNegative(a.layingFeedKgPerBird);
  const manureKg =
    chicks * nonNegative(a.growerManureKgPerWeek) * nonNegative(a.growerWeeks) +
    housed * nonNegative(a.layerManureKgPerWeek) * nonNegative(a.layingWeeks);
  const revenue = eggs * nonNegative(a.eggInr) + culled * nonNegative(a.culledBirdInr) + (manureKg / 1000) * nonNegative(a.manureInrPerTonne);
  const chickCost = chicks * nonNegative(a.chickInr);
  const workers = a.labourBirdsPerWorker > 0 ? housed / a.labourBirdsPerWorker : 0;
  const cost =
    chickCost +
    feedKg * nonNegative(a.feedInrPerKg) +
    housed * nonNegative(a.vaccineInrPerBird) +
    (chickCost * clampPct(a.insurancePctOfChickCost)) / 100 +
    workers * nonNegative(a.labourInrPerMonth) * (cycleDays / DAYS_PER_MONTH) +
    housed * nonNegative(a.otherCostInrPerBird) * (cycleDays / RUNNING_COST_CYCLE_DAYS);
  return { sold: culled, kgSold: 0, feedKg, eggs, revenue, cost };
}

/** Days from placing the chicks to the shed being ready again. */
function cycleDaysFor(birdType, a) {
  return isLayer(birdType)
    ? (nonNegative(a.growerWeeks) + nonNegative(a.layingWeeks)) * 7 + nonNegative(a.cleaningDays)
    : nonNegative(a.rearingDays) + nonNegative(a.cleaningDays);
}

/**
 * @param {object} input
 * @param {string} input.birdType
 * @param {number} input.flockSize      birds housed
 * @param {number} input.projectCost    capital plus the first batch's working capital
 * @param {object} input.assumptions    defaultAssumptions(), possibly edited (subsidyInr: the grant the user counts on)
 */
function computePoultryReturns({ birdType, flockSize, projectCost, assumptions }) {
  const a = assumptions;
  const layer = isLayer(birdType);
  const cycleDays = cycleDaysFor(birdType, a);
  const cyclesPerYear = cycleDays > 0 ? DAYS_PER_YEAR / cycleDays : 0;
  const cycle = layer ? layerCycle(flockSize, a, cycleDays) : meatBatch(flockSize, a);

  const cost = nonNegative(projectCost);
  const subsidyAmount = Math.min(nonNegative(a.subsidyInr), cost);
  const netInvestment = cost - subsidyAmount;
  const annualRevenue = cycle.revenue * cyclesPerYear;
  const annualOperatingCost = cycle.cost * cyclesPerYear;
  const annualProfit = annualRevenue - annualOperatingCost;
  const birds = nonNegative(flockSize);

  // What the product must sell for to cover the running cost: per kg for meat (the growing charge under contract),
  // per egg for layers.
  const unitPrice = layer ? a.eggInr : a.farmingModel === "contract" ? a.growingChargeInrPerKg : a.saleInrPerKg;
  const units = layer ? cycle.eggs : cycle.kgSold;
  const otherRevenue = cycle.revenue - units * nonNegative(unitPrice);
  const breakEvenPrice = units > 0 ? (cycle.cost - otherRevenue) / units : null;

  return {
    product: layer ? "eggs" : "meat",
    cycleDays,
    cyclesPerYear,
    birdsSoldPerYear: cycle.sold * cyclesPerYear,
    kgSoldPerYear: cycle.kgSold * cyclesPerYear,
    eggsPerYear: cycle.eggs * cyclesPerYear,
    feedKgPerYear: cycle.feedKg * cyclesPerYear,
    revenuePerCycle: cycle.revenue,
    costPerCycle: cycle.cost,
    marginPerBird: birds > 0 ? (cycle.revenue - cycle.cost) / birds : 0,
    breakEvenPrice,
    capitalCost: cost,
    subsidyAmount,
    netInvestment,
    annualRevenue,
    annualOperatingCost,
    annualProfit,
    paybackYears: annualProfit > 0 ? netInvestment / annualProfit : null,
    roi: netInvestment > 0 ? (annualProfit * PROJECTION_YEARS - netInvestment) / netInvestment : null,
    cumulativeCashflow: Array.from({ length: PROJECTION_YEARS + 1 }, (_, year) => -netInvestment + annualProfit * year),
  };
}

/** The first year's batch calendar: placement, sale and clean-out, as days from the first placement. */
function batchCalendar({ birdType, assumptions, days = DAYS_PER_YEAR }) {
  const a = assumptions;
  const layer = isLayer(birdType);
  const cycleDays = cycleDaysFor(birdType, a);
  if (!(cycleDays > 0)) return [];
  const growDays = cycleDays - nonNegative(a.cleaningDays);
  const batches = [];
  for (let start = 0, n = 1; start < days; start += cycleDays, n += 1) {
    batches.push({
      batch: n,
      placeDay: start,
      pointOfLayDay: layer ? start + nonNegative(a.growerWeeks) * 7 : null,
      saleDay: start + growDays,
      readyDay: start + cycleDays,
    });
  }
  return batches;
}

module.exports = { PROJECTION_YEARS, RUNNING_COST_CYCLE_DAYS, defaultAssumptions, cycleDaysFor, computePoultryReturns, batchCalendar };
