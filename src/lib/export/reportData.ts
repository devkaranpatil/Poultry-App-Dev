import { translate } from '@/context/I18nContext';
import { CROP_ECONOMICS, computeFinancials, type FinanceAssumptions, type FinancialSummary } from '@/lib/finance';
import { DEFAULT_LOAN_TERMS, computeLoanPlan, type LoanPlan, type LoanTerms } from '@/lib/loan';
import type { AdvisorReport, AiCropsResult } from '@/services/ai.service';
import type { CalculationResult, GreenhouseConfig } from '@/types/greenhouse';

/** Exports are always English: the PDF fonts cannot render Devanagari. */
const en = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars);
const optionKey = (value: string) => value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

export interface ReportCrop {
  name: string;
  suitability: string;
  detail: string;
  expectedYield: string;
  season: string;
}

export interface ReportData {
  generatedAt: Date;
  title: string;
  location: string;
  config: GreenhouseConfig;
  labels: Record<
    'type' | 'roof' | 'structure' | 'cover' | 'sideVentilation' | 'door' | 'crop' | 'irrigation',
    string
  >;
  result: CalculationResult;
  assumptions: FinanceAssumptions;
  financials: FinancialSummary;
  /** Bank loan, repayment schedule and debt cover for the project. */
  loan: LoanPlan;
  unit: 'kg' | 'stems';
  costItems: Array<{ label: string; amount: number; share: number }>;
  crops: ReportCrop[];
  cropsSource: 'ai' | 'rules';
  advisor: AdvisorReport | null;
  snapshot: string | null;
}

export interface BuildReportInput {
  config: GreenhouseConfig;
  result: CalculationResult;
  assumptions: FinanceAssumptions;
  /** Loan terms from the Returns tab; the published defaults when omitted. */
  loanTerms?: LoanTerms;
  advisor?: AdvisorReport | null;
  aiCrops?: AiCropsResult | null;
  snapshot?: string | null;
  generatedAt?: Date;
}

export function buildReportData(input: BuildReportInput): ReportData {
  const { config, result, assumptions } = input;
  const cost = result.cost;
  const items = [
    { label: en('right.structure'), amount: cost.structureCost },
    { label: en('right.coverMaterial'), amount: cost.coverCost },
    { label: en('right.ventilation'), amount: cost.ventilationCost },
    { label: en('right.foundation'), amount: cost.foundationCost },
    { label: en('right.irrigation'), amount: cost.irrigationCost },
    { label: en('right.electrical'), amount: cost.electricalCost },
    { label: en('right.labor'), amount: cost.laborCost },
    { label: en('right.misc'), amount: cost.miscCost },
  ].map((item) => ({ ...item, amount: item.amount ?? 0 }));
  const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0) || 1;

  const location = [config.district, config.state].filter(Boolean).join(', ');
  const aiCrops = input.aiCrops?.crops?.length ? input.aiCrops.crops : null;
  const financials = computeFinancials(cost.totalCost, result.area, assumptions, result.subsidy);

  return {
    generatedAt: input.generatedAt ?? new Date(),
    title: en('report.title'),
    location,
    config,
    labels: {
      type: en(`options.greenhouse.${optionKey(config.greenhouseType)}`),
      roof: en(`options.roof.${config.roofType}`),
      structure: en(`options.structure.${optionKey(config.structureMaterial)}`),
      cover: en(`options.cover.${optionKey(config.coverMaterial)}`),
      sideVentilation: en(`options.sideVent.${optionKey(config.sideVentilation)}`),
      door: en(`options.door.${optionKey(config.doorEntry)}`),
      crop: en(`options.crop.${config.selectedCrop}`),
      irrigation: en(`options.irrigation.${optionKey(config.irrigationSystem)}`),
    },
    result,
    assumptions,
    financials,
    loan: computeLoanPlan(cost.totalCost, financials.subsidyAmount, financials, input.loanTerms ?? DEFAULT_LOAN_TERMS),
    unit: CROP_ECONOMICS[config.selectedCrop].unit,
    costItems: items.map((item) => ({ ...item, share: item.amount / itemsTotal })),
    crops: aiCrops
      ? aiCrops.map((crop) => ({
          name: crop.name,
          suitability: crop.suitability,
          detail: [crop.reason, crop.marketNote].filter(Boolean).join(' '),
          expectedYield: crop.expectedYield,
          season: crop.season,
        }))
      : result.crops.map((crop) => ({
          name: crop.name,
          suitability: crop.suitability,
          detail: crop.notes,
          expectedYield: crop.expectedYield,
          season: crop.season,
        })),
    cropsSource: aiCrops ? 'ai' : 'rules',
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
  return `greenhouse-${place}-${date}.${extension}`;
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
