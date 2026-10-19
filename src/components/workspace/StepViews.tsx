import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CloudRain, Droplets, FolderOpen, Loader2, Share2, Sparkles, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import type { CalculationResult, FarmConfig } from '@/types/farm';
import { latestMandiPrice } from '@/lib/mandi';
import type { FinanceAssumptions, FinancialSummary } from '@/lib/finance';
import { computeLoanPlan, type LoanTerms } from '@/lib/loan';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReturnsPanel } from '@/components/farm/ReturnsPanel';
import { LoanPanel } from '@/components/farm/LoanPanel';
import { SubsidyChecklist } from '@/components/farm/SubsidyChecklist';
import { RiskPanel } from '@/components/farm/RiskPanel';
import { paybackChance, useRiskSimulation } from '@/hooks/useRiskSimulation';
import { ExportPanel } from '@/components/farm/ExportPanel';
import { DistrictClimateCard, GovernmentNormCard, MarketPricesCard } from '@/components/farm/ReferenceCards';
import { Block, Figures, FinishDesignFirst, StepError, StepPage } from './StepPage';
import { Labelled } from './Explain';
import { MoreDetails } from './MoreDetails';
import { SummaryStep } from './SummaryStep';
import { aiSummaryState } from '@/components/advisor/summaryState';
import type { StepId } from './steps';

export type ResultStepId = Exclude<StepId, 'design'>;

export interface StepViewsProps {
  step: ResultStepId;
  onNavigate: (step: StepId) => void;
  config: FarmConfig;
  result: CalculationResult | null;
  isLoading: boolean;
  calculationError: string | null;
  onRetry: () => void;
  /** The design is complete enough to calculate. */
  ready: boolean;
  missingItems: string[];
  assumptions: FinanceAssumptions;
  onAssumptionsChange: (next: FinanceAssumptions) => void;
  financials: FinancialSummary | null;
  loanTerms: LoanTerms;
  onLoanTermsChange: (next: LoanTerms) => void;
  ai?: AiAssistant;
  /** Whether the AI summary goes into the report; one setting shared by the summary step and the export options. */
  includeAiSummary: boolean;
  onIncludeAiSummaryChange: (next: boolean) => void;
  onShare: () => void;
  onOpenSaved?: () => void;
}

const SUITABILITY_STYLES: Record<string, string> = {
  excellent: 'bg-primary text-primary-foreground',
  good: 'bg-accent text-accent-foreground',
  moderate: 'bg-muted text-muted-foreground',
  poor: 'bg-destructive/10 text-destructive',
};

const IRRIGATION_KEYS: Record<FarmConfig['irrigationSystem'], string> = {
  drip: 'options.irrigation.drip',
  sprinkler: 'options.irrigation.sprinkler',
  fogger: 'options.irrigation.fogger',
  'hydroponic-nft': 'options.irrigation.hydroponicNft',
};

/** Picks the step's page; every money step waits for a complete design. */
export function StepViews(props: StepViewsProps) {
  const { step, onNavigate, result, financials, ready, missingItems, calculationError, onRetry, isLoading } = props;
  const Page = PAGES[step];

  if (calculationError) {
    return (
      <StepPage step={step} onNavigate={onNavigate}>
        <StepError message={calculationError} onRetry={onRetry} />
      </StepPage>
    );
  }
  if (step !== 'report' && (!ready || !result || !financials)) {
    return (
      <StepPage step={step} onNavigate={onNavigate} inShort={ready && isLoading ? <Waiting /> : undefined}>
        {ready ? <LoadingBlocks /> : <FinishDesignFirst missing={missingItems} onGoDesign={() => onNavigate('design')} />}
      </StepPage>
    );
  }
  return <Page {...props} result={result as CalculationResult} financials={financials as FinancialSummary} />;
}

type ReadyProps = StepViewsProps & { result: CalculationResult; financials: FinancialSummary };

function Waiting() {
  const { t } = useI18n();
  return <p className="text-muted-foreground">{t('right.calculating')}</p>;
}

function LoadingBlocks() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function SitePage({ step, onNavigate, config, result, isLoading, ai }: ReadyProps) {
  const { t } = useI18n();
  const selected = result.crops.find((crop) => crop.isSelected);
  const shortVars = {
    district: config.district,
    zone: result.climate.climateZone,
    temp: result.climate.avgTemperature,
    humidity: result.climate.humidity,
  };
  const inShort = selected ? (
    <p>
      {t('ws.short.site', {
        ...shortVars,
        crop: t(`options.crop.${config.selectedCrop}`),
        suitability: t(`ai.suitability.${selected.suitability}`),
      })}
    </p>
  ) : (
    <p>{t('ws.short.siteNoCrop', shortVars)}</p>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={isLoading}>
      <Block title={t('right.climateZone')} action={<span className="badge-info">{result.climate.climateZone}</span>}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Thermometer, value: `${result.climate.avgTemperature}°C`, label: t('right.avgTemp') },
            { icon: Droplets, value: `${result.climate.humidity}%`, label: t('right.humidity') },
            { icon: CloudRain, value: `${formatNumber(result.climate.rainfall)}`, label: t('right.rainfall') },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
              <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {result.climate.advisories.length > 0 ? (
          <ul className="space-y-2">
            {result.climate.advisories.map((advisory) => (
              <li key={advisory} className="flex gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                {advisory}
              </li>
            ))}
          </ul>
        ) : null}
        {result.reference?.districtClimate ? <DistrictClimateCard reference={result.reference} /> : null}
      </Block>

      <Block title={t('right.cropsReference')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.crops.map((crop) => (
            <div key={crop.name} className={cn('rounded-xl border bg-card p-4', crop.isSelected ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {crop.name}
                  {crop.isSelected ? <span className="ml-2 text-xs font-medium text-primary">{t('right.selectedCrop')}</span> : null}
                </p>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', SUITABILITY_STYLES[crop.suitability])}>
                  {t(`ai.suitability.${crop.suitability}`)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{crop.notes}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {crop.expectedYield} · {crop.season} ·{' '}
                {crop.yieldSource ? (
                  <a
                    href={crop.yieldSource.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${crop.yieldSource.basis}. ${crop.yieldSource.note}`}
                    className="text-primary hover:underline"
                  >
                    {t('right.yieldMeasured')}
                  </a>
                ) : (
                  <span>{t('right.yieldUnverified')}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </Block>

      {ai && ai.status?.enabled !== false ? (
        <section className="rounded-2xl border border-primary/20 bg-accent/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('ai.cropsTitle')}
              </p>
              <p className="text-xs text-muted-foreground">{t('ai.cropsDesc')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void ai.generateCrops()} disabled={ai.cropsLoading} className="shrink-0 bg-card">
              {ai.cropsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ai.crops ? t('ai.regenerate') : t('ai.generate')}
            </Button>
          </div>
          {ai.cropsError ? <p className="mt-2 text-xs text-destructive">{t(ai.cropsError)}</p> : null}
          {ai.cropsStale ? <p className="mt-2 text-xs text-muted-foreground">{t('ai.stale')}</p> : null}
          {ai.crops ? (
            <div className="mt-3 space-y-2">
              {ai.crops.note ? <p className="text-xs text-muted-foreground">{ai.crops.note}</p> : null}
              {ai.crops.crops.map((crop) => (
                <div key={crop.name} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{crop.name}</p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', SUITABILITY_STYLES[crop.suitability])}>
                      {t(`ai.suitability.${crop.suitability}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{crop.reason}</p>
                  {crop.marketNote ? <p className="mt-1 text-xs text-foreground">{crop.marketNote}</p> : null}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {crop.expectedYield} · {crop.season}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {result.reference ? (
        <MoreDetails>
          <MarketPricesCard reference={result.reference} stateName={config.state} />
        </MoreDetails>
      ) : null}
    </StepPage>
  );
}

function CostPage({ step, onNavigate, config, result, financials, isLoading }: ReadyProps) {
  const { t } = useI18n();
  const breakdown = [
    { label: t('right.structure'), value: result.cost.structureCost },
    { label: t('right.coverMaterial'), value: result.cost.coverCost },
    { label: t('right.ventilation'), value: result.cost.ventilationCost },
    { label: t('right.foundation'), value: result.cost.foundationCost },
    { label: `${t('right.irrigation')} (${t(IRRIGATION_KEYS[config.irrigationSystem])})`, value: result.cost.irrigationCost },
    { label: t('right.electrical'), value: result.cost.electricalCost },
    { label: t('right.labor'), value: result.cost.laborCost },
    { label: t('right.misc'), value: result.cost.miscCost },
  ].map((item) => ({ ...item, value: item.value ?? 0 }));
  const total = breakdown.reduce((sum, item) => sum + item.value, 0) || 1;
  const biggest = breakdown.reduce((top, item) => (item.value > top.value ? item : top), breakdown[0]);
  const climateAdjustment = result.cost.climateAdjustment ?? 0;

  const inShort = (
    <>
      <p>
        {t('ws.short.cost', {
          area: formatNumber(result.area),
          total: formatINRCompact(result.cost.totalCost),
          biggest: biggest.label.toLowerCase(),
          share: Math.round((biggest.value / total) * 100),
        })}
      </p>
      {financials.subsidyAmount > 0 ? (
        <p>{t('ws.short.costSubsidy', { subsidy: formatINRCompact(financials.subsidyAmount), net: formatINRCompact(financials.netInvestment) })}</p>
      ) : null}
    </>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={isLoading}>
      <Figures
        items={[
          { key: 'total', label: t('right.kpiTotal'), value: formatINRCompact(result.cost.totalCost), tone: 'primary' },
          { key: 'subsidy', label: <Labelled term="subsidy" label={t('returns.subsidyAmount')} />, value: formatINRCompact(financials.subsidyAmount) },
          { key: 'net', label: <Labelled term="netInvestment" label={t('ws.youPay')} />, value: formatINRCompact(financials.netInvestment) },
          { key: 'sqm', label: t('right.kpiPerSqm'), value: formatINR(result.cost.costPerSqm) },
        ]}
      />

      <Block
        title={t('right.costBreakdown')}
        action={<span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(result.cost.totalCost)}</span>}
      >
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {breakdown.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums text-foreground">{formatINR(item.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / total) * 100}%` }} />
              </div>
            </div>
          ))}
          {climateAdjustment !== 0 ? (
            <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <span className="text-foreground">{t('right.climateAdjustment')}</span>
              <span className="font-medium tabular-nums">
                {climateAdjustment > 0 ? '+' : ''}
                {(climateAdjustment * 100).toFixed(1)}%
                {result.cost.climateAdjustmentAmount !== undefined
                  ? ` (${result.cost.climateAdjustmentAmount > 0 ? '+' : ''}${formatINR(result.cost.climateAdjustmentAmount)})`
                  : ''}
              </span>
            </div>
          ) : null}
          {result.diagnostics?.unsourcedRates?.length ? (
            <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground" data-testid="unsourced-rates">
              {t('right.unsourcedRates', {
                items: result.diagnostics.unsourcedRates
                  .map((item) => t(item === 'aluminium' ? 'options.structure.aluminium' : 'options.cover.glass'))
                  .join(', '),
              })}
            </p>
          ) : null}
        </div>
      </Block>

      {result.reference ? <GovernmentNormCard reference={result.reference} /> : null}

      <MoreDetails>
        {result.cost.costRange ? (
          <p className="text-sm text-foreground">
            {t('right.costRange')}: {formatINR(result.cost.costRange.low)} - {formatINR(result.cost.costRange.high)}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t('right.perSqm', { value: formatINR(result.cost.costPerSqm) })} · {formatNumber(result.area)} m²
        </p>
        <p className="text-xs text-muted-foreground">{t('right.notPriced')}</p>
      </MoreDetails>
    </StepPage>
  );
}

function EarningsPage({ step, onNavigate, config, result, financials, assumptions, onAssumptionsChange, isLoading }: ReadyProps) {
  const { t } = useI18n();
  const cropLabel = t(`options.crop.${config.selectedCrop}`);
  const profitable = financials.annualProfit > 0;
  const inShort = profitable ? (
    <>
      <p>
        {t('ws.short.earningsProfit', {
          crop: cropLabel,
          revenue: formatINRCompact(financials.annualRevenue),
          profit: formatINRCompact(financials.annualProfit),
        })}
      </p>
      <p>
        {financials.paybackYears === null
          ? t('ws.short.earningsNoPayback')
          : t('ws.short.earningsPayback', { net: formatINRCompact(financials.netInvestment), years: formatNumber(financials.paybackYears) })}
      </p>
    </>
  ) : (
    <p>{t('ws.short.earningsLoss')}</p>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={isLoading}>
      <Figures
        items={[
          { key: 'net', label: <Labelled term="netInvestment" label={t('ws.youPay')} />, value: formatINRCompact(financials.netInvestment) },
          { key: 'sales', label: t('ws.salesYear'), value: formatINRCompact(financials.annualRevenue) },
          { key: 'profit', label: t('ws.profitYear'), value: formatINRCompact(financials.annualProfit), tone: profitable ? 'good' : 'bad' },
          {
            key: 'payback',
            label: <Labelled term="payback" label={t('returns.payback')} />,
            value: financials.paybackYears === null ? t('returns.noPayback') : t('returns.paybackYears', { years: formatNumber(financials.paybackYears) }),
            tone: 'primary',
          },
        ]}
      />
      <ReturnsPanel
        crop={config.selectedCrop}
        cropLabel={cropLabel}
        assumptions={assumptions}
        onAssumptionsChange={onAssumptionsChange}
        summary={financials}
        marketPrice={latestMandiPrice(result.reference?.marketPrices, config.selectedCrop)}
      />
    </StepPage>
  );
}

function LoanPage({ step, onNavigate, config, result, financials, loanTerms, onLoanTermsChange, isLoading }: ReadyProps) {
  const { t } = useI18n();
  const plan = useMemo(
    () => computeLoanPlan(financials.capitalCost, financials.subsidyAmount, financials, loanTerms),
    [financials, loanTerms]
  );
  const per = t(`loan.per.${plan.terms.frequency}`);
  const coverKey =
    plan.minDscr === null ? null : plan.minDscr >= 1.3 ? 'ws.short.loanGood' : plan.minDscr >= 1 ? 'ws.short.loanTight' : 'ws.short.loanWeak';
  const vars = {
    loan: formatINRCompact(plan.loanAmount),
    margin: formatINRCompact(plan.margin),
    months: plan.terms.moratoriumMonths,
    emi: formatINRCompact(plan.installment),
    per,
  };
  const inShort = (
    <>
      <p>{plan.terms.moratoriumMonths > 0 ? t('ws.short.loan', vars) : t('ws.short.loanNoMoratorium', vars)}</p>
      {coverKey ? <p>{t(coverKey)}</p> : null}
    </>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={isLoading}>
      <LoanPanel summary={financials} terms={loanTerms} onTermsChange={onLoanTermsChange} />
      {result.subsidy ? <SubsidyChecklist scheme={result.subsidy.scheme} projectCost={result.cost.totalCost} state={config.state} /> : null}
    </StepPage>
  );
}

function RiskPage({ step, onNavigate, config, assumptions }: ReadyProps) {
  const { t } = useI18n();
  const [years, setYears] = useState(10);
  const risk = useRiskSimulation(config, assumptions, years);
  const simulation = risk.result?.simulation;
  const inShort = simulation ? (
    <p>
      {t('ws.short.risk', {
        trials: formatNumber(simulation.trials),
        chance: `${Math.round(paybackChance(simulation) * 100)}%`,
        years: simulation.years,
      })}
    </p>
  ) : (
    <p className="text-muted-foreground">{t('ws.short.riskWait')}</p>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={risk.stale}>
      <RiskPanel risk={risk} years={years} onYearsChange={setYears} />
    </StepPage>
  );
}

function SummaryPage({ step, onNavigate, ai, includeAiSummary, onIncludeAiSummaryChange }: ReadyProps) {
  return (
    <SummaryStep
      step={step}
      onNavigate={onNavigate}
      ai={ai}
      includeAiSummary={includeAiSummary}
      onIncludeAiSummaryChange={onIncludeAiSummaryChange}
    />
  );
}

const REPORT_SUMMARY_KEYS = {
  included: 'summary.reportIncluded',
  excluded: 'summary.reportExcluded',
  stale: 'summary.reportStale',
  none: 'summary.reportNone',
} as const;

function ReportPage(props: StepViewsProps) {
  const { step, onNavigate, config, result, assumptions, loanTerms, ai, isLoading, onShare, onOpenSaved, ready } = props;
  const { t } = useI18n();
  const summaryState = aiSummaryState(ai, props.includeAiSummary);
  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={ready && result ? <p>{t('ws.short.report')}</p> : undefined}>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/30 px-4 py-3"
        data-testid="report-summary-status"
      >
        <Sparkles className={cn('h-4 w-4 shrink-0', summaryState === 'included' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground">{t(REPORT_SUMMARY_KEYS[summaryState])}</p>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onNavigate('summary')}>
          {t('summary.reportEdit')}
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <ExportPanel
          config={config}
          result={isLoading ? null : result}
          assumptions={assumptions}
          loanTerms={loanTerms}
          ai={ai}
          includeAdvisor={props.includeAiSummary}
          onIncludeAdvisorChange={props.onIncludeAiSummaryChange}
        />
      </section>
      <Block title={t('ws.reportSave')} description={t('ws.reportSaveDesc')}>
        <div className="flex flex-wrap gap-2">
          {onOpenSaved ? (
            <Button variant="outline" onClick={onOpenSaved}>
              <FolderOpen className="mr-1.5 h-4 w-4" />
              {t('ws.saveProject')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onShare} disabled={!ready}>
            <Share2 className="mr-1.5 h-4 w-4" />
            {t('ws.shareLink')}
          </Button>
        </div>
      </Block>
    </StepPage>
  );
}

const PAGES: Record<ResultStepId, (props: ReadyProps) => JSX.Element> = {
  site: SitePage,
  cost: CostPage,
  earnings: EarningsPage,
  loan: LoanPage,
  risk: RiskPage,
  summary: SummaryPage,
  report: ReportPage,
};
