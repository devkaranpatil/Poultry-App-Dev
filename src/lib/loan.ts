import type { FinancialSummary } from '@/lib/finance';
import type { BirdType } from '@/types/poultry';

// Bank term loan for the polyhouse, the way banks and NHB set it up:
//  - the bank lends a share of the project cost; the farmer brings the rest (the margin);
//  - interest only during the moratorium, then equal instalments (EMI) to the end of the tenure;
//  - the subsidy is credit-linked and back-ended: it is held in a Subsidy Reserve Fund Account (SRFA) and
//    adjusted against the last instalments, capped at the loan sanctioned (NHB Scheme guidelines, sections 9
//    and 11.xii). Until then the farmer pays interest on the whole loan.

export type RepaymentFrequency = 'monthly' | 'quarterly' | 'half-yearly';

export interface LoanTerms {
  /** Bank loan as a percentage of the project cost (0-100). */
  loanSharePct: number;
  /** Annual interest rate in percent. */
  interestPct: number;
  /** Whole repayment period in years, moratorium included. */
  tenureYears: number;
  /** Months of interest-only payments at the start (construction and the first crop). */
  moratoriumMonths: number;
  frequency: RepaymentFrequency;
}

export const PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2 };

/** Highest loan share the bank scheme below allows for protected cultivation. */
export const MAX_BANK_LOAN_SHARE_PCT = 80;

export const DEFAULT_LOAN_TERMS: LoanTerms = {
  loanSharePct: 80,
  interestPct: 11.05,
  tenureYears: 7,
  moratoriumMonths: 12,
  frequency: 'monthly',
};

/** Where each default comes from; `verified` is false for the app's own assumptions. */
export const LOAN_SOURCES: Array<{ text: string; verified: boolean; url?: string }> = [
  {
    text: 'Loan up to 80% of project cost (margin 20% above Rs 1 lakh); repayment up to 7 years including a 3-12 month moratorium: Central Bank of India, Cent Poly House / Green House / Shade Net scheme',
    verified: true,
    url: 'https://www.centralbank.bank.in/en/cent-poly-house-green-house-shade-net',
  },
  {
    text: 'Interest 11.05%: Canara Bank agriculture term loans of Rs 3 lakh to Rs 1 crore at one-year MCLR + 2.30% (rates of 18.08.2026); one-year MCLR 8.75% from 12.05.2026',
    verified: true,
    url: 'https://www.canarabank.bank.in/documents/d/guest/roi-18-08-2026',
  },
  {
    text: 'Subsidy held in a Subsidy Reserve Fund Account and adjusted against the last instalments, capped at the term loan sanctioned: NHB Scheme guidelines',
    verified: true,
  },
  {
    text: "Monthly instalments, and farm income starting when the moratorium ends: the app's assumptions; your bank sets the schedule to match the crop",
    verified: false,
  },
];

/** Highest loan share for a poultry unit: NABARD's model projects ask for a margin of 10% (desi birds) to 25%. */
export const MAX_POULTRY_LOAN_SHARE_PCT = 90;

/**
 * Starting loan terms for a poultry farm, by the kind of bird, from NABARD's model bank projects (the poultry
 * versions of the polyhouse defaults above). Bird type keys match src/types/poultry.ts.
 */
export function poultryLoanTerms(birdType: BirdType): LoanTerms {
  if (birdType === 'desi') return { loanSharePct: 90, interestPct: 12, tenureYears: 5, moratoriumMonths: 0, frequency: 'monthly' };
  if (birdType === 'layer-cage' || birdType === 'layer-floor') {
    // A layer flock earns nothing until it lays at about 20 weeks: one year of grace.
    return { loanSharePct: 75, interestPct: 12.5, tenureYears: 8, moratoriumMonths: 12, frequency: 'monthly' };
  }
  // Broilers sell their first batch within two months, so repayment starts at once.
  return { loanSharePct: 75, interestPct: 12.5, tenureYears: 7, moratoriumMonths: 0, frequency: 'monthly' };
}

/** Where each poultry default comes from; `verified` is false for the app's own assumptions. */
export const POULTRY_LOAN_SOURCES: Array<{ text: string; verified: boolean; url?: string }> = [
  {
    text: 'Broiler: margin 25%, interest 12.5%, 6 to 8 years: NABARD model bank project, poultry broiler farming (old prices)',
    verified: true,
    url: 'https://agritech.tnau.ac.in/banking/nabard_pdf/Animal%20husbandry/3.Poultry_Broiler_Farming.pdf',
  },
  {
    text: 'Layer: margin 25%, interest 12.5%, 7 to 9 years with a 1-year grace: NABARD model bank project, poultry layer',
    verified: true,
    url: 'https://agritech.tnau.ac.in/banking/nabard_pdf/Animal%20husbandry/4.Poultry_Layer.pdf',
  },
  {
    text: 'Improved desi birds: margin 10%, interest 12%, 5 years, no moratorium: NABARD model bank project on indigenous poultry',
    verified: true,
    url: 'https://www.nabard.org/auth/writereaddata/ModelBankProject/0604183125Model-_Indigenous_Poultry_Farming_English.pdf',
  },
  {
    text: 'NLM subsidy is back-ended: paid through SIDBI in two instalments after the bank releases the loan, so it is adjusted against the last instalments here: NLM-EDP guideline 2021-26',
    verified: true,
    url: 'https://livestock.kerala.gov.in/wp-content/uploads/2024/07/KLDB-NLM-GUIDELINE.pdf',
  },
  {
    text: "Middle of each published range (7 years for broilers, 8 for layers) and monthly instalments: the app's choices; your bank sets the schedule",
    verified: false,
  },
];

export interface LoanPeriod {
  /** 1-based instalment number. */
  period: number;
  /** Months since the first disbursement at the end of this period. */
  month: number;
  opening: number;
  interest: number;
  principal: number;
  /** What the farmer pays this period (interest + principal). */
  payment: number;
  /** Loan balance closed from the Subsidy Reserve Fund Account this period. */
  subsidyAdjusted: number;
  closing: number;
}

export interface LoanYear {
  year: number;
  /** Profit from the farm before loan payments (revenue minus running cost), for the months that produce. */
  farmCash: number;
  /** Interest and principal the farmer pays this year. */
  debtService: number;
  /** Subsidy left over after the reserve closes the loan, released to the farmer. */
  subsidyReleased: number;
  /** farmCash - debtService + subsidyReleased. */
  netCash: number;
  /** Cash position since the start, beginning with minus the margin. */
  cumulative: number;
  /** Debt service coverage ratio: farm cash / loan payments; null in a year without payments. */
  dscr: number | null;
}

export interface LoanPlan {
  terms: LoanTerms;
  projectCost: number;
  loanAmount: number;
  /** The farmer's own contribution (project cost - loan). */
  margin: number;
  /** Subsidy that goes to the reserve account: the scheme subsidy, capped at the loan. */
  subsidyInReserve: number;
  periodsPerYear: number;
  moratoriumPeriods: number;
  /** Interest-only payment during the moratorium. */
  moratoriumPayment: number;
  /** Equal instalment after the moratorium. */
  installment: number;
  schedule: LoanPeriod[];
  /** Months after the first disbursement when the reserve closes the loan, or null when it does not. */
  closedByReserveAtMonth: number | null;
  totalInterest: number;
  /** Everything the farmer pays the bank (interest + principal, excluding what the subsidy covers). */
  totalPaidByFarmer: number;
  years: LoanYear[];
  /** Lowest and average DSCR over the years that both earn and pay. */
  minDscr: number | null;
  avgDscr: number | null;
}

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, finite(value, min)));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Clamps terms to values a bank could set. */
export function normalizeLoanTerms(terms: LoanTerms): LoanTerms {
  const tenureYears = Math.round(clamp(terms.tenureYears, 1, 15));
  const frequency: RepaymentFrequency = terms.frequency in PERIODS_PER_YEAR ? terms.frequency : 'monthly';
  const monthsPerPeriod = 12 / PERIODS_PER_YEAR[frequency];
  return {
    loanSharePct: clamp(terms.loanSharePct, 0, 100),
    interestPct: clamp(terms.interestPct, 0, 30),
    tenureYears,
    // At least one repayment period must remain after the moratorium.
    moratoriumMonths: Math.round(clamp(terms.moratoriumMonths, 0, tenureYears * 12 - monthsPerPeriod)),
    frequency,
  };
}

/** Equal instalment that repays `principal` over `periods` at `rate` per period. */
export function installmentFor(principal: number, rate: number, periods: number): number {
  if (principal <= 0 || periods <= 0) return 0;
  if (rate <= 0) return principal / periods;
  return (principal * rate) / (1 - Math.pow(1 + rate, -periods));
}

/**
 * Builds the loan schedule and the yearly cash flow for a project.
 *
 * @param projectCost    build cost the bank finances (the calculator's total cost)
 * @param subsidyAmount  scheme subsidy (FinancialSummary.subsidyAmount)
 * @param financials     annual revenue and running cost; income starts when the moratorium ends
 */
export function computeLoanPlan(
  projectCost: number,
  subsidyAmount: number,
  financials: Pick<FinancialSummary, 'annualRevenue' | 'annualOperatingCost'>,
  rawTerms: LoanTerms
): LoanPlan {
  const terms = normalizeLoanTerms(rawTerms);
  const cost = Math.max(0, finite(projectCost));
  const loanAmount = cost * (terms.loanSharePct / 100);
  const margin = cost - loanAmount;
  const subsidyInReserve = Math.min(Math.max(0, finite(subsidyAmount)), loanAmount);

  const periodsPerYear = PERIODS_PER_YEAR[terms.frequency];
  const monthsPerPeriod = 12 / periodsPerYear;
  const totalPeriods = terms.tenureYears * periodsPerYear;
  const moratoriumPeriods = Math.min(totalPeriods - 1, Math.round(terms.moratoriumMonths / monthsPerPeriod));
  const rate = terms.interestPct / 100 / periodsPerYear;
  const installment = installmentFor(loanAmount, rate, totalPeriods - moratoriumPeriods);

  const schedule: LoanPeriod[] = [];
  let balance = loanAmount;
  let closedByReserveAtMonth: number | null = null;
  let released: { month: number; amount: number } | null = null;
  for (let period = 1; period <= totalPeriods && balance > 0.005; period++) {
    const opening = balance;
    const interest = opening * rate;
    const principal = period <= moratoriumPeriods ? 0 : Math.min(opening, installment - interest);
    let closing = opening - principal;
    let subsidyAdjusted = 0;
    // Back-ended subsidy: once the balance is within the reserve, the reserve repays the rest.
    if (period > moratoriumPeriods && subsidyInReserve > 0 && closing > 0.005 && closing <= subsidyInReserve) {
      subsidyAdjusted = closing;
      closedByReserveAtMonth = period * monthsPerPeriod;
      released = { month: period * monthsPerPeriod, amount: subsidyInReserve - closing };
      closing = 0;
    }
    schedule.push({
      period,
      month: period * monthsPerPeriod,
      opening,
      interest,
      principal,
      payment: interest + principal,
      subsidyAdjusted,
      closing,
    });
    balance = closing;
  }
  // The instalments closed the loan before the balance fell inside the reserve: the reserve is released at the end.
  if (subsidyInReserve > 0 && !released && schedule.length) {
    released = { month: schedule[schedule.length - 1].month, amount: subsidyInReserve };
  }

  const annualFarmCash = finite(financials.annualRevenue) - finite(financials.annualOperatingCost);
  const years: LoanYear[] = [];
  let cumulative = -margin;
  for (let year = 1; year <= terms.tenureYears; year++) {
    const fromMonth = (year - 1) * 12;
    const toMonth = year * 12;
    const producingMonths = Math.max(0, Math.min(12, toMonth - Math.max(fromMonth, terms.moratoriumMonths)));
    const farmCash = annualFarmCash * (producingMonths / 12);
    const debtService = schedule
      .filter((row) => row.month > fromMonth && row.month <= toMonth)
      .reduce((sum, row) => sum + row.payment, 0);
    const subsidyReleased = released && released.month > fromMonth && released.month <= toMonth ? released.amount : 0;
    const netCash = farmCash - debtService + subsidyReleased;
    cumulative += netCash;
    years.push({
      year,
      farmCash,
      debtService,
      subsidyReleased,
      netCash,
      cumulative,
      dscr: debtService > 0.005 ? farmCash / debtService : null,
    });
  }

  // Coverage only means something in years that both earn and pay.
  const covered = years.filter((row) => row.dscr !== null && row.farmCash !== 0).map((row) => row.dscr as number);

  return {
    terms,
    projectCost: cost,
    loanAmount,
    margin,
    subsidyInReserve,
    periodsPerYear,
    moratoriumPeriods,
    moratoriumPayment: moratoriumPeriods > 0 ? loanAmount * rate : 0,
    installment,
    schedule,
    closedByReserveAtMonth,
    totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
    totalPaidByFarmer: schedule.reduce((sum, row) => sum + row.payment, 0),
    years,
    minDscr: covered.length ? round2(Math.min(...covered)) : null,
    avgDscr: covered.length ? round2(covered.reduce((sum, value) => sum + value, 0) / covered.length) : null,
  };
}
