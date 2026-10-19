import type { CropType, SchemeSubsidy } from '@/types/greenhouse';

export interface CropEconomics {
  /** Yield per cropped m² per year (all crops grown in a year), in `unit`. */
  yieldPerSqm: number;
  unit: 'kg' | 'stems';
  /** ₹ per kg or per stem. */
  pricePerUnit: number;
  /** Where each figure comes from; `verified` is false for the app's own assumptions. */
  yieldSource: { text: string; verified: boolean };
  priceSource: { text: string; verified: boolean };
}

// Mandi prices: Agmarknet (data.gov.in) national median of the modal price across all reporting markets on
// 2026-10-13 (tomato 160 markets, capsicum 68, cucumber 77). A one-day wholesale price: the farmer receives less
// after commission and transport, and prices move with the season, so the returns panel offers the latest one.
const MANDI_2026_10_13 = 'Agmarknet national median mandi price, 13 Oct 2026';

/**
 * Planning defaults per crop for protected cultivation in India, each with its source. Every figure is editable in
 * the UI because both vary widely by region, season and market.
 */
export const CROP_ECONOMICS: Record<CropType, CropEconomics> = {
  tomato: {
    yieldPerSqm: 8.75, // 87.5 t/ha: midpoint of 80-95 t/ha for hybrids, one crop a year
    unit: 'kg',
    pricePerUnit: 30, // Rs 3,000 per quintal
    yieldSource: { text: 'TNAU Agritech, protected cultivation of tomato: hybrids 80-95 t/ha (one crop a year)', verified: true },
    priceSource: { text: MANDI_2026_10_13, verified: true },
  },
  capsicum: {
    yieldPerSqm: 9, // 90 t/ha: midpoint of 80-100 t/ha over a 7-10 month greenhouse crop
    unit: 'kg',
    pricePerUnit: 65, // Rs 6,500 per quintal
    yieldSource: { text: 'Vikaspedia, protected cultivation of capsicum: 80-100 t/ha in a 7-10 month greenhouse crop', verified: true },
    priceSource: { text: MANDI_2026_10_13, verified: true },
  },
  cucumber: {
    yieldPerSqm: 12, // three crops a year at 40 t/ha, the low end of 40-50 t/ha per 3-3.5 month crop
    unit: 'kg',
    pricePerUnit: 40, // Rs 4,000 per quintal
    yieldSource: { text: 'ICAR Indian Farming 75(8), 2025: parthenocarpic cucumber 40-50 t/ha per 3-3.5 month crop (three crops a year)', verified: true },
    priceSource: { text: MANDI_2026_10_13, verified: true },
  },
  lettuce: {
    yieldPerSqm: 6.5, // three crops a year at the planner's 18-25 t/ha
    unit: 'kg',
    pricePerUnit: 60,
    yieldSource: { text: "Planner's own estimate (18-25 t/ha per crop, three crops a year); no official source found", verified: false },
    priceSource: { text: 'Assumption; lettuce is not on the mandi feed', verified: false },
  },
  strawberry: {
    yieldPerSqm: 2.25, // 225 q/ha: midpoint of 200-250 q/ha in one season
    unit: 'kg',
    pricePerUnit: 200,
    yieldSource: { text: 'Assam Agricultural University package of practices: 200-250 q/ha per season', verified: true },
    priceSource: { text: 'Assumption; strawberry is not on the mandi feed', verified: false },
  },
  gerbera: {
    yieldPerSqm: 226, // mean of 11 cultivars (range 132-396)
    unit: 'stems',
    pricePerUnit: 3,
    yieldSource: { text: 'Ahlawat et al. 2012, Indian Journal of Horticulture 69(4): mean of 11 cultivars in a naturally ventilated polyhouse', verified: true },
    priceSource: { text: 'Assumption; cut flowers are not on the mandi feed', verified: false },
  },
};

/** Area eligible for the subsidy rate when no scheme result is available (state-mission limit since 12.08.2025). */
export const SUBSIDY_AREA_CAP_SQM = 4000;

/** Share of floor area that is actually cropped (the rest is paths and service space). */
export const CULTIVABLE_AREA_SHARE = 0.85;

export const PROJECTION_YEARS = 5;

export interface FinanceAssumptions {
  /** Capital subsidy as a percentage of project cost (0-100). */
  subsidyPct: number;
  /** Annual yield per cultivated m², in kg or stems. */
  yieldPerSqm: number;
  /** Farm-gate price per kg or stem, in ₹. */
  pricePerUnit: number;
  /** Annual operating cost (labour, inputs, power) as a percentage of revenue (0-100). */
  operatingCostPct: number;
}

export interface FinancialSummary {
  capitalCost: number;
  subsidyAmount: number;
  netInvestment: number;
  annualProduction: number;
  annualRevenue: number;
  annualOperatingCost: number;
  annualProfit: number;
  /** Years to recover the net investment, or null if the project never pays back. */
  paybackYears: number | null;
  /** Return over PROJECTION_YEARS as a fraction (0.5 = 50%), or null without investment. */
  roi: number | null;
  /** Cumulative cash position at the end of each year, starting with year 0. */
  cumulativeCashflow: number[];
}

export function defaultFinanceAssumptions(crop: CropType): FinanceAssumptions {
  const economics = CROP_ECONOMICS[crop];
  return {
    subsidyPct: 50,
    yieldPerSqm: economics.yieldPerSqm,
    pricePerUnit: economics.pricePerUnit,
    operatingCostPct: 40,
  };
}

const clampPct = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

/** The part of a scheme result the returns need: the cost it recognises and its per-project limit. */
export type SchemeBasis = Pick<SchemeSubsidy, 'eligibleCostInr' | 'capInr'>;

/** The cost a subsidy percentage applies to: the scheme's recognised cost, or (without one) the area-capped cost. */
export function subsidyBase(capitalCost: number, areaSqm: number, scheme?: SchemeBasis | null): number {
  if (scheme) return nonNegative(scheme.eligibleCostInr);
  const area = nonNegative(areaSqm);
  return nonNegative(capitalCost) * (area > 0 ? Math.min(1, SUBSIDY_AREA_CAP_SQM / area) : 0);
}

/**
 * @param scheme  the calculation's scheme subsidy (result.subsidy). With it, the subsidy percentage applies to the
 *   cost the scheme recognises (your build cost without irrigation, limited to the government norm) and the
 *   scheme's per-project limit holds. Without it (an older saved result), the whole cost of the first 4,000 m².
 */
export function computeFinancials(
  capitalCost: number,
  areaSqm: number,
  assumptions: FinanceAssumptions,
  scheme?: SchemeBasis | null
): FinancialSummary {
  const cost = nonNegative(capitalCost);
  const area = nonNegative(areaSqm);

  const uncapped = subsidyBase(cost, area, scheme) * (clampPct(assumptions.subsidyPct) / 100);
  const subsidyAmount = Math.min(uncapped, scheme?.capInr ?? Number.POSITIVE_INFINITY, cost);
  const netInvestment = cost - subsidyAmount;

  const annualProduction = area * CULTIVABLE_AREA_SHARE * nonNegative(assumptions.yieldPerSqm);
  const annualRevenue = annualProduction * nonNegative(assumptions.pricePerUnit);
  const annualOperatingCost = annualRevenue * (clampPct(assumptions.operatingCostPct) / 100);
  const annualProfit = annualRevenue - annualOperatingCost;

  const paybackYears = annualProfit > 0 ? netInvestment / annualProfit : null;
  const roi = netInvestment > 0 ? (annualProfit * PROJECTION_YEARS - netInvestment) / netInvestment : null;
  const cumulativeCashflow = Array.from(
    { length: PROJECTION_YEARS + 1 },
    (_, year) => -netInvestment + annualProfit * year
  );

  return {
    capitalCost: cost,
    subsidyAmount,
    netInvestment,
    annualProduction,
    annualRevenue,
    annualOperatingCost,
    annualProfit,
    paybackYears,
    roi,
    cumulativeCashflow,
  };
}
