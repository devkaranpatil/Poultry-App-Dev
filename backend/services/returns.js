// Yearly returns for a setup, the same arithmetic as src/lib/finance.ts computeFinancials (a test keeps the two
// equal), so the AI's "what if" figures match the returns panel to the rupee.

/** Share of floor area that is actually cropped (the rest is paths and service space). */
const CULTIVABLE_AREA_SHARE = 0.85;
/** Area eligible for the subsidy when no scheme result is available (state-mission limit since 12.08.2025). */
const SUBSIDY_AREA_CAP_SQM = 4000;

const clampPct = (value) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
const nonNegative = (value) => Math.max(0, Number.isFinite(value) ? value : 0);

/**
 * @param {object} input
 * @param {number} input.capitalCost
 * @param {number} input.areaSqm
 * @param {{ eligibleCostInr: number, capInr: number|null } | null} [input.scheme]  result.subsidy
 * @param {number} input.subsidyPct
 * @param {number} input.yieldPerSqm       per cropped m2 per year
 * @param {number} input.pricePerUnit
 * @param {number} input.operatingCostPct  share of revenue
 */
function computeReturns({ capitalCost, areaSqm, scheme, subsidyPct, yieldPerSqm, pricePerUnit, operatingCostPct }) {
  const cost = nonNegative(capitalCost);
  const area = nonNegative(areaSqm);
  const base = scheme ? nonNegative(scheme.eligibleCostInr) : cost * (area > 0 ? Math.min(1, SUBSIDY_AREA_CAP_SQM / area) : 0);
  const subsidyAmount = Math.min(base * (clampPct(subsidyPct) / 100), scheme?.capInr ?? Number.POSITIVE_INFINITY, cost);
  const netInvestment = cost - subsidyAmount;
  const annualRevenue = area * CULTIVABLE_AREA_SHARE * nonNegative(yieldPerSqm) * nonNegative(pricePerUnit);
  const annualProfit = annualRevenue - annualRevenue * (clampPct(operatingCostPct) / 100);
  return {
    subsidyAmount,
    netInvestment,
    annualRevenue,
    annualProfit,
    paybackYears: annualProfit > 0 ? netInvestment / annualProfit : null,
  };
}

module.exports = { CULTIVABLE_AREA_SHARE, SUBSIDY_AREA_CAP_SQM, computeReturns };
