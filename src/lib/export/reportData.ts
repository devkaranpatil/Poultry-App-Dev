import { translate } from '@/context/I18nContext';
import { computeLoanPlan, poultryLoanTerms, type LoanPlan, type LoanTerms } from '@/lib/loan';
import type { PoultryAssumptions, PoultryReturns } from '@/lib/poultryFinance';
import { assumptionSource } from '@/lib/poultrySources';
import type { AdvisorReport } from '@/services/ai.service';
import { optionKey, type CalculationResult, type FarmConfig } from '@/types/farm';

/** Exports are always English: the PDF fonts cannot render Devanagari. */
const en = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars);

/** The biosecurity measures the report lists (DAHD guidelines and NABARD's lending terms). */
export const BIOSECURITY_KEYS = ['bio.footbath', 'bio.anteroom', 'bio.allInAllOut', 'bio.visitors', 'bio.quarantine', 'bio.disposal', 'bio.pests', 'bio.disinfect', 'bio.vaccination'];

export interface ReportAssumptionRow {
  field: string;
  label: string;
  value: number;
  source: string | null;
  verified: boolean;
}

export interface ReportSitingRow {
  description: string;
  distanceM: number | null;
  ticked: boolean;
  source: string;
}

export interface ReportData {
  generatedAt: Date;
  title: string;
  location: string;
  config: FarmConfig;
  labels: Record<'housing' | 'roof' | 'frame' | 'roofSheet' | 'sideWalls' | 'entry' | 'bird' | 'feeding' | 'farmingModel' | 'category', string>;
  result: CalculationResult;
  /** The assumptions the figures were worked out with. */
  assumptions: PoultryAssumptions;
  financials: PoultryReturns;
  /** Bank loan, repayment schedule and debt cover for the project. */
  loan: LoanPlan;
  costItems: Array<{ label: string; amount: number; share: number }>;
  workingItems: Array<{ label: string; amount: number }>;
  assumptionRows: ReportAssumptionRow[];
  siting: ReportSitingRow[];
  biosecurity: string[];
  advisor: AdvisorReport | null;
  snapshot: string | null;
}

export interface BuildReportInput {
  config: FarmConfig;
  result: CalculationResult;
  /** Kept for the caller's convenience; the report uses the assumptions the result was worked out with. */
  assumptions?: PoultryAssumptions;
  /** Loan terms from the Loan step; NABARD's model-project terms for the bird when omitted. */
  loanTerms?: LoanTerms;
  /** Siting rules the farmer confirmed on the Site step. */
  sitingTicks?: Record<string, boolean>;
  advisor?: AdvisorReport | null;
  snapshot?: string | null;
  generatedAt?: Date;
}

const MEAT_FIELDS = ['saleInrPerKg', 'chickInr', 'feedInrPerKg', 'vaccineInrPerBird', 'mortalityPct', 'saleWeightKg', 'fcr', 'rearingDays', 'cleaningDays', 'labourInrPerBird', 'otherCostInrPerBird'];
const CONTRACT_FIELDS = ['growingChargeInrPerKg', 'mortalityPct', 'saleWeightKg', 'fcr', 'rearingDays', 'cleaningDays', 'labourInrPerBird', 'otherCostInrPerBird'];
const LAYER_FIELDS = ['eggInr', 'chickInr', 'feedInrPerKg', 'vaccineInrPerBird', 'layingMortalityPct', 'eggsPerHen', 'growerWeeks', 'layingWeeks', 'growerFeedKgPerBird', 'layingFeedKgPerBird', 'culledBirdInr', 'labourInrPerMonth'];

export function buildReportData(input: BuildReportInput): ReportData {
  const { config, result } = input;
  const cost = result.cost;
  const assumptions = result.assumptions;
  const financials = result.returns;
  const items = [
    { label: en('cost.civil'), amount: cost.civilCost },
    { label: en('cost.roofSheet'), amount: cost.roofSheetCost },
    { label: en('cost.sideWalls'), amount: cost.sideWallCost },
    { label: en('cost.entry'), amount: cost.entryCost },
    { label: en('cost.equipment'), amount: cost.equipmentCost },
    { label: en('cost.feedStore'), amount: cost.feedStoreCost },
    { label: en('cost.fencing'), amount: cost.fencingCost },
    { label: en('cost.water'), amount: cost.waterSupplyCost },
    { label: en('cost.electrical'), amount: cost.electricalCost },
  ].filter((item) => item.amount !== 0);
  const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0) || 1;
  const wc = cost.workingCapital;
  const fields = financials.product === 'eggs' ? LAYER_FIELDS : config.farmingModel === 'contract' ? CONTRACT_FIELDS : MEAT_FIELDS;
  const values = assumptions as unknown as Record<string, number>;
  const ticks = input.sitingTicks ?? {};

  return {
    generatedAt: input.generatedAt ?? new Date(),
    title: en('report.title'),
    location: [config.district, config.state].filter(Boolean).join(', '),
    config,
    labels: {
      housing: en(optionKey('housing', config.housingSystem)),
      roof: en(optionKey('roof', config.roofType)),
      frame: en(optionKey('frame', config.frameMaterial)),
      roofSheet: en(optionKey('roofSheet', config.roofSheet)),
      sideWalls: en(optionKey('sideWalls', config.sideWalls)),
      entry: en(optionKey('entry', config.entry)),
      bird: en(optionKey('bird', config.birdType)),
      feeding: en(optionKey('feeding', config.feedingSystem)),
      farmingModel: en(optionKey('farming', config.farmingModel)),
      category: en(optionKey('category', config.beneficiaryCategory)),
    },
    result,
    assumptions,
    financials,
    loan: computeLoanPlan(financials.capitalCost, financials.subsidyAmount, financials, input.loanTerms ?? poultryLoanTerms(config.birdType)),
    costItems: items.map((item) => ({ ...item, share: item.amount / itemsTotal })),
    workingItems: [
      { label: en('cost.chicks', { chicks: wc.chicks.toLocaleString('en-IN') }), amount: wc.chickCost },
      { label: en('cost.feed'), amount: wc.feedCost },
      { label: en('cost.insurance'), amount: wc.insuranceCost },
      { label: en('cost.vaccines'), amount: wc.vaccineCost },
      { label: en('cost.labour'), amount: wc.labourCost },
    ].filter((item) => item.amount > 0),
    assumptionRows: fields.map((field) => {
      const source = assumptionSource(config.birdType, config.farmingModel, field, config.state);
      return { field, label: en(`assumption.${field}`), value: values[field], source: source?.document ?? null, verified: source?.verified ?? false };
    }),
    siting: result.siting.map((rule) => ({ description: rule.description, distanceM: rule.distanceM, ticked: Boolean(ticks[rule.id]), source: rule.source.document })),
    biosecurity: BIOSECURITY_KEYS.map((key) => en(key)),
    advisor: input.advisor ?? null,
    snapshot: input.snapshot ?? null,
  };
}

export function reportFileName(data: ReportData, extension: 'pdf' | 'xlsx'): string {
  const place = (data.config.district || data.config.state || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = data.generatedAt.toISOString().slice(0, 10);
  return `farm-${place}-${date}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
