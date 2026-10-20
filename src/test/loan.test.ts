import { describe, expect, it } from 'vitest';
import { computeLoanPlan, installmentFor, normalizeLoanTerms, type LoanTerms } from '@/lib/loan';

// Fixed terms for the arithmetic below (an 80% loan over 7 years with a 12-month moratorium).
const BASE_TERMS: LoanTerms = { loanSharePct: 80, interestPct: 11.05, tenureYears: 7, moratoriumMonths: 12, frequency: 'monthly' };

const noIncome = { annualRevenue: 0, annualOperatingCost: 0 };
const terms = (patch: Partial<LoanTerms> = {}): LoanTerms => ({ ...BASE_TERMS, ...patch });

describe('installmentFor', () => {
  it('matches the textbook EMI', () => {
    // Rs 4 lakh at 12% a year over 60 months: Rs 8,897.78 a month.
    expect(installmentFor(400_000, 0.01, 60)).toBeCloseTo(8897.78, 2);
  });

  it('spreads the principal evenly without interest, and is zero without a loan', () => {
    expect(installmentFor(120_000, 0, 12)).toBe(10_000);
    expect(installmentFor(0, 0.01, 12)).toBe(0);
  });
});

describe('normalizeLoanTerms', () => {
  it('keeps at least one repayment after the moratorium and clamps out-of-range values', () => {
    const t = normalizeLoanTerms({ loanSharePct: 140, interestPct: -3, tenureYears: 1, moratoriumMonths: 30, frequency: 'quarterly' });
    expect(t).toEqual({ loanSharePct: 100, interestPct: 0, tenureYears: 1, moratoriumMonths: 9, frequency: 'quarterly' });
  });
});

describe('computeLoanPlan', () => {
  it('splits the cost into loan and margin and repays the loan in full without subsidy', () => {
    const plan = computeLoanPlan(1_000_000, 0, noIncome, terms({ moratoriumMonths: 0, tenureYears: 5, interestPct: 12 }));
    expect(plan.loanAmount).toBe(800_000);
    expect(plan.margin).toBe(200_000);
    expect(plan.schedule).toHaveLength(60);
    expect(plan.installment).toBeCloseTo(installmentFor(800_000, 0.01, 60), 6);
    const repaid = plan.schedule.reduce((sum, row) => sum + row.principal, 0);
    expect(repaid).toBeCloseTo(800_000, 2);
    expect(plan.schedule.at(-1)!.closing).toBeCloseTo(0, 2);
    expect(plan.totalPaidByFarmer).toBeCloseTo(800_000 + plan.totalInterest, 2);
    expect(plan.closedByReserveAtMonth).toBeNull();
  });

  it('charges interest only during the moratorium, then equal instalments over the rest of the tenure', () => {
    const plan = computeLoanPlan(1_000_000, 0, noIncome, terms({ interestPct: 12, tenureYears: 7, moratoriumMonths: 12 }));
    expect(plan.moratoriumPeriods).toBe(12);
    expect(plan.moratoriumPayment).toBeCloseTo(8_000, 6);
    expect(plan.schedule.slice(0, 12).every((row) => row.principal === 0 && Math.abs(row.payment - 8_000) < 1e-6)).toBe(true);
    expect(plan.installment).toBeCloseTo(installmentFor(800_000, 0.01, 72), 6);
    expect(plan.schedule).toHaveLength(84);
  });

  it('uses the back-ended subsidy to close the last instalments, so the farmer still pays interest on the whole loan', () => {
    const cost = 1_000_000;
    const withSubsidy = computeLoanPlan(cost, 250_000, noIncome, terms());
    const without = computeLoanPlan(cost, 0, noIncome, terms());
    expect(withSubsidy.subsidyInReserve).toBe(250_000);
    expect(withSubsidy.closedByReserveAtMonth).not.toBeNull();
    expect(withSubsidy.closedByReserveAtMonth!).toBeLessThan(84);
    const adjusted = withSubsidy.schedule.reduce((sum, row) => sum + row.subsidyAdjusted, 0);
    expect(adjusted).toBeLessThanOrEqual(250_000);
    // Same instalment until the reserve steps in: the subsidy does not lower the EMI.
    expect(withSubsidy.installment).toBeCloseTo(without.installment, 6);
    expect(withSubsidy.totalPaidByFarmer).toBeLessThan(without.totalPaidByFarmer);
    // Whatever the reserve does not need comes back to the farmer.
    const released = withSubsidy.years.reduce((sum, row) => sum + row.subsidyReleased, 0);
    expect(adjusted + released).toBeCloseTo(250_000, 2);
  });

  it('caps the subsidy at the loan sanctioned', () => {
    const plan = computeLoanPlan(1_000_000, 500_000, noIncome, terms({ loanSharePct: 30 }));
    expect(plan.subsidyInReserve).toBe(300_000);
  });

  it('starts farm income when the moratorium ends and reports the debt cover', () => {
    const plan = computeLoanPlan(1_000_000, 0, { annualRevenue: 600_000, annualOperatingCost: 240_000 }, terms({ moratoriumMonths: 6 }));
    expect(plan.years[0].farmCash).toBeCloseTo(180_000, 6); // half a year of 3.6 lakh
    expect(plan.years[1].farmCash).toBeCloseTo(360_000, 6);
    const year2 = plan.years[1];
    expect(year2.dscr).toBeCloseTo(year2.farmCash / year2.debtService, 6);
    expect(plan.years[0].cumulative).toBeCloseTo(-200_000 + plan.years[0].netCash, 6);
    expect(plan.minDscr).not.toBeNull();
    expect(plan.minDscr!).toBeLessThanOrEqual(plan.avgDscr!);
  });

  it('leaves a moratorium year without income out of the debt cover summary', () => {
    const plan = computeLoanPlan(1_000_000, 0, { annualRevenue: 600_000, annualOperatingCost: 240_000 }, terms({ moratoriumMonths: 12 }));
    expect(plan.years[0].farmCash).toBe(0);
    expect(plan.years[0].dscr).toBe(0);
    expect(plan.minDscr).toBeGreaterThan(0);
  });

  it('supports quarterly and half-yearly repayments', () => {
    const quarterly = computeLoanPlan(1_000_000, 0, noIncome, terms({ frequency: 'quarterly', moratoriumMonths: 12 }));
    expect(quarterly.schedule).toHaveLength(28);
    expect(quarterly.moratoriumPeriods).toBe(4);
    const halfYearly = computeLoanPlan(1_000_000, 0, noIncome, terms({ frequency: 'half-yearly', moratoriumMonths: 6 }));
    expect(halfYearly.schedule).toHaveLength(14);
    expect(halfYearly.schedule[0].month).toBe(6);
  });

  it('handles a project without a loan', () => {
    const plan = computeLoanPlan(1_000_000, 200_000, { annualRevenue: 500_000, annualOperatingCost: 200_000 }, terms({ loanSharePct: 0 }));
    expect(plan.loanAmount).toBe(0);
    expect(plan.margin).toBe(1_000_000);
    expect(plan.schedule).toHaveLength(0);
    expect(plan.minDscr).toBeNull();
  });
});
