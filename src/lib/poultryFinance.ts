import norms from '../../shared/poultry-norms.json';
import type { BirdType, FarmingModel } from '@/types/poultry';

/**
 * A poultry farm's year: batches, birds and eggs sold, feed eaten, revenue, running cost and payback. The same
 * arithmetic as backend/services/poultry/production.js (a test keeps the two equal), so the screens match the AI.
 *
 * Meat birds (broiler, desi) run all-in all-out batches. Independent farmers buy chicks, feed and medicines and sell
 * live weight; contract farmers are paid a growing charge per kg by the integrator, who supplies the inputs. Layers
 * are one flock at a time: grown to point of lay and kept for the laying weeks in the same shed, then cleaned.
 */

export const PROJECTION_YEARS = 5;
const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = 365 / 12;
/** The per-bird running costs of the broiler study are for a 56-day cycle; layers pay them per day of the cycle. */
export const RUNNING_COST_CYCLE_DAYS = 56;

type Valued = { value: number; source: string };
interface Norms {
  birdTypes: Record<string, Record<string, unknown> & { product: 'meat' | 'eggs'; manureKgPerBirdPerWeek?: { grower: number; layer: number } }>;
  costs: Record<string, Valued>;
  prices: Record<string, Valued[]>;
  planningDefaults: { meat: Record<'broiler' | 'desi', Record<string, Valued>>; layer: Record<string, Valued> };
}
const N = norms as unknown as Norms;

export interface MeatAssumptions {
  farmingModel: FarmingModel;
  rearingDays: number;
  cleaningDays: number;
  mortalityPct: number;
  saleWeightKg: number;
  fcr: number;
  labourInrPerBird: number;
  otherCostInrPerBird: number;
  manureInrPerBird: number;
  gunnyBagsInrPerBird: number;
  insurancePctOfChickCost: number;
  chickInr: number;
  feedInrPerKg: number;
  vaccineInrPerBird: number;
  saleInrPerKg: number;
  growingChargeInrPerKg: number;
  /** The grant the user counts on, in ₹ (0 until a scheme is confirmed). */
  subsidyInr: number;
}

export interface LayerAssumptions {
  farmingModel: 'independent';
  growerWeeks: number;
  layingWeeks: number;
  cleaningDays: number;
  chicksPerLayerHoused: number;
  layingMortalityPct: number;
  eggsPerHen: number;
  growerFeedKgPerBird: number;
  layingFeedKgPerBird: number;
  growerManureKgPerWeek: number;
  layerManureKgPerWeek: number;
  labourInrPerMonth: number;
  labourBirdsPerWorker: number;
  otherCostInrPerBird: number;
  insurancePctOfChickCost: number;
  chickInr: number;
  feedInrPerKg: number;
  vaccineInrPerBird: number;
  eggInr: number;
  culledBirdInr: number;
  manureInrPerTonne: number;
  subsidyInr: number;
}

export type PoultryAssumptions = MeatAssumptions | LayerAssumptions;

export interface PoultryReturns {
  product: 'meat' | 'eggs';
  cycleDays: number;
  cyclesPerYear: number;
  birdsSoldPerYear: number;
  kgSoldPerYear: number;
  eggsPerYear: number;
  feedKgPerYear: number;
  revenuePerCycle: number;
  costPerCycle: number;
  marginPerBird: number;
  /** What the product must sell for to cover the running cost: ₹ per kg (the growing charge under contract) or per egg. */
  breakEvenPrice: number | null;
  capitalCost: number;
  subsidyAmount: number;
  netInvestment: number;
  annualRevenue: number;
  annualOperatingCost: number;
  annualProfit: number;
  paybackYears: number | null;
  roi: number | null;
  cumulativeCashflow: number[];
}

const nonNegative = (value: number) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const clampPct = (value: number) => Math.min(100, nonNegative(value));
export const isLayerBird = (birdType: BirdType) => N.birdTypes[birdType]?.product === 'eggs';
const pick = (entries: Record<string, Valued>) => Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.value]));

/** Every editable assumption for a bird, starting from the norms and the planner's starting prices. */
export function defaultPoultryAssumptions(birdType: BirdType, farmingModel: FarmingModel = 'independent'): PoultryAssumptions {
  const bird = N.birdTypes[birdType] as Record<string, number> & { product: string; manureKgPerBirdPerWeek: { grower: number; layer: number } };
  const costs = N.costs;
  if (bird.product === 'eggs') {
    return {
      farmingModel: 'independent',
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
      labourInrPerMonth: costs.labourInrPerMonth.value,
      labourBirdsPerWorker: costs.labourBirdsPerWorker.value,
      otherCostInrPerBird: costs.otherCostInrPerBird.value,
      insurancePctOfChickCost: costs.birdInsurancePctOfChickCost.value,
      ...(pick(N.planningDefaults.layer) as Pick<LayerAssumptions, 'chickInr' | 'feedInrPerKg' | 'vaccineInrPerBird' | 'eggInr' | 'culledBirdInr' | 'manureInrPerTonne'>),
      subsidyInr: 0,
    };
  }
  return {
    farmingModel: farmingModel === 'contract' ? 'contract' : 'independent',
    rearingDays: bird.rearingDays,
    cleaningDays: bird.cleaningDays,
    mortalityPct: bird.mortalityPct,
    saleWeightKg: bird.saleWeightKg,
    fcr: bird.fcr,
    labourInrPerBird: costs.labourInrPerBird.value,
    otherCostInrPerBird: costs.otherCostInrPerBird.value,
    manureInrPerBird: N.prices.manureInrPerBird[0].value,
    gunnyBagsInrPerBird: N.prices.gunnyBagsInrPerBird[0].value,
    insurancePctOfChickCost: costs.birdInsurancePctOfChickCost.value,
    ...(pick(N.planningDefaults.meat[birdType === 'desi' ? 'desi' : 'broiler']) as Pick<
      MeatAssumptions,
      'chickInr' | 'feedInrPerKg' | 'vaccineInrPerBird' | 'saleInrPerKg' | 'growingChargeInrPerKg'
    >),
    subsidyInr: 0,
  };
}

interface Cycle {
  sold: number;
  kgSold: number;
  feedKg: number;
  eggs: number;
  revenue: number;
  cost: number;
}

/** One batch of meat birds: what is sold, what is eaten and what it all costs. */
function meatBatch(flock: number, a: MeatAssumptions): Cycle {
  const placed = nonNegative(flock);
  const sold = placed * (1 - clampPct(a.mortalityPct) / 100);
  const kgSold = sold * nonNegative(a.saleWeightKg);
  const feedKg = kgSold * nonNegative(a.fcr);
  const byProducts = placed * (nonNegative(a.manureInrPerBird) + nonNegative(a.gunnyBagsInrPerBird));
  const farmCosts = placed * (nonNegative(a.labourInrPerBird) + nonNegative(a.otherCostInrPerBird));
  if (a.farmingModel === 'contract') {
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
function layerCycle(flock: number, a: LayerAssumptions, cycleDays: number): Cycle {
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
export function cycleDaysFor(birdType: BirdType, a: PoultryAssumptions): number {
  if (isLayerBird(birdType)) {
    const layer = a as LayerAssumptions;
    return (nonNegative(layer.growerWeeks) + nonNegative(layer.layingWeeks)) * 7 + nonNegative(layer.cleaningDays);
  }
  const meat = a as MeatAssumptions;
  return nonNegative(meat.rearingDays) + nonNegative(meat.cleaningDays);
}

export function computePoultryReturns(input: {
  birdType: BirdType;
  /** Birds housed. */
  flockSize: number;
  /** Capital plus the first batch's working capital. */
  projectCost: number;
  assumptions: PoultryAssumptions;
}): PoultryReturns {
  const { birdType, flockSize, projectCost, assumptions: a } = input;
  const layer = isLayerBird(birdType);
  const cycleDays = cycleDaysFor(birdType, a);
  const cyclesPerYear = cycleDays > 0 ? DAYS_PER_YEAR / cycleDays : 0;
  const cycle = layer ? layerCycle(flockSize, a as LayerAssumptions, cycleDays) : meatBatch(flockSize, a as MeatAssumptions);

  const cost = nonNegative(projectCost);
  const subsidyAmount = Math.min(nonNegative(a.subsidyInr), cost);
  const netInvestment = cost - subsidyAmount;
  const annualRevenue = cycle.revenue * cyclesPerYear;
  const annualOperatingCost = cycle.cost * cyclesPerYear;
  const annualProfit = annualRevenue - annualOperatingCost;
  const birds = nonNegative(flockSize);

  const unitPrice = layer
    ? (a as LayerAssumptions).eggInr
    : a.farmingModel === 'contract'
      ? (a as MeatAssumptions).growingChargeInrPerKg
      : (a as MeatAssumptions).saleInrPerKg;
  const units = layer ? cycle.eggs : cycle.kgSold;
  const otherRevenue = cycle.revenue - units * nonNegative(unitPrice);
  const breakEvenPrice = units > 0 ? (cycle.cost - otherRevenue) / units : null;

  return {
    product: layer ? 'eggs' : 'meat',
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

export interface BatchDates {
  batch: number;
  placeDay: number;
  /** Layers only: the day the flock starts laying. */
  pointOfLayDay: number | null;
  saleDay: number;
  readyDay: number;
}

/** The first year's batch calendar: placement, sale and clean-out, as days from the first placement. */
export function batchCalendar(birdType: BirdType, assumptions: PoultryAssumptions, days = DAYS_PER_YEAR): BatchDates[] {
  const cycleDays = cycleDaysFor(birdType, assumptions);
  if (!(cycleDays > 0)) return [];
  const layer = isLayerBird(birdType);
  const growDays = cycleDays - nonNegative(assumptions.cleaningDays);
  const batches: BatchDates[] = [];
  for (let start = 0, n = 1; start < days; start += cycleDays, n += 1) {
    batches.push({
      batch: n,
      placeDay: start,
      pointOfLayDay: layer ? start + nonNegative((assumptions as LayerAssumptions).growerWeeks) * 7 : null,
      saleDay: start + growDays,
      readyDay: start + cycleDays,
    });
  }
  return batches;
}
