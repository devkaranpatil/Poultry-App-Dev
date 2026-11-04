import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CloudRain, Droplets, FolderOpen, Share2, Sparkles, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import type { CalculationResult, FarmConfig } from '@/types/farm';
import type { PoultryAssumptions, PoultryReturns } from '@/lib/poultryFinance';
import { computeLoanPlan, type LoanTerms } from '@/lib/loan';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { optionKey } from '@/types/farm';
import { ReturnsPanel } from '@/components/farm/ReturnsPanel';
import { LoanPanel } from '@/components/farm/LoanPanel';
import { RiskPanel } from '@/components/farm/RiskPanel';
import { paybackChance, useRiskSimulation } from '@/hooks/useRiskSimulation';
import { ExportPanel } from '@/components/farm/ExportPanel';
import { DistrictClimateCard, HeatStressCard, NabardCard, SchemesCard, SitingChecklist } from '@/components/farm/ReferenceCards';
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
  assumptions: PoultryAssumptions;
  onAssumptionsChange: (next: PoultryAssumptions) => void;
  /** The year's figures, from the server's calculation (result.returns). */
  financials: PoultryReturns | null;
  /** Which siting rules the farmer has confirmed; the rest become warnings in the report. */
  sitingTicks: Record<string, boolean>;
  onSitingTicksChange: (next: Record<string, boolean>) => void;
  loanTerms: LoanTerms;
  onLoanTermsChange: (next: LoanTerms) => void;
  ai?: AiAssistant;
  /** Whether the AI summary goes into the report; one setting shared by the summary step and the export options. */
  includeAiSummary: boolean;
  onIncludeAiSummaryChange: (next: boolean) => void;
  onShare: () => void;
  onOpenSaved?: () => void;
}

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
  return <Page {...props} result={result as CalculationResult} financials={financials as PoultryReturns} />;
}

type ReadyProps = StepViewsProps & { result: CalculationResult; financials: PoultryReturns };

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

function SitePage({ step, onNavigate, config, result, isLoading, sitingTicks, onSitingTicksChange }: ReadyProps) {
  const { t } = useI18n();
  const heat = result.climate.heatStress;
  const open = result.siting.filter((rule) => !sitingTicks[rule.id]).length;
  const inShort = (
    <>
      <p>
        {t('ws.short.site', {
          district: config.district,
          zone: result.climate.climateZone,
          temp: result.climate.avgTemperature,
          humidity: result.climate.humidity,
        })}
      </p>
      <p>{heat && heat.severeMonths.length > 0 ? t('ws.short.siteHeat', { count: heat.severeMonths.length }) : t('ws.short.siteNoHeat')}</p>
      <p>{t('ws.short.siteRules', { rules: result.siting.length, open, birds: formatNumber(result.flock.birds) })}</p>
    </>
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
        {heat ? <HeatStressCard heatStress={heat} /> : null}
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

      <Block title={t('siting.title')} description={t('siting.hint', { birds: formatNumber(result.flock.birds) })}>
        <SitingChecklist rules={result.siting} ticked={sitingTicks} onTickedChange={onSitingTicksChange} />
      </Block>
    </StepPage>
  );
}

function CostPage({ step, onNavigate, result, financials, isLoading }: ReadyProps) {
  const { t } = useI18n();
  const cost = result.cost;
  const breakdown = [
    { label: t('cost.civil'), value: cost.civilCost },
    { label: t('cost.roofSheet'), value: cost.roofSheetCost },
    { label: t('cost.sideWalls'), value: cost.sideWallCost },
    { label: t('cost.entry'), value: cost.entryCost },
    { label: t('cost.equipment'), value: cost.equipmentCost },
    { label: t('cost.feedStore'), value: cost.feedStoreCost },
    { label: t('cost.fencing'), value: cost.fencingCost },
    { label: t('cost.water'), value: cost.waterSupplyCost },
    { label: t('cost.electrical'), value: cost.electricalCost },
  ].filter((item) => item.value !== 0);
  const total = breakdown.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  const biggest = breakdown.reduce((top, item) => (item.value > top.value ? item : top), breakdown[0]);
  const wc = cost.workingCapital;
  const workingLines = [
    { label: t('cost.chicks', { chicks: formatNumber(wc.chicks) }), value: wc.chickCost },
    { label: t('cost.feed'), value: wc.feedCost },
    { label: t('cost.insurance'), value: wc.insuranceCost },
    { label: t('cost.vaccines'), value: wc.vaccineCost },
    { label: t('cost.labour'), value: wc.labourCost },
  ].filter((item) => item.value > 0);
  const contract = result.financedCost === cost.capitalCost && wc.total > 0;

  const inShort = (
    <>
      <p>
        {t('ws.short.cost', {
          birds: formatNumber(result.flock.birds),
          total: formatINRCompact(cost.capitalCost),
          perBird: formatINR(cost.costPerBird),
          biggest: biggest.label.toLowerCase(),
          share: Math.round((biggest.value / total) * 100),
        })}
      </p>
      <p>{contract ? t('ws.short.costContract', { wc: formatINRCompact(wc.total) }) : t('ws.short.costWorking', { wc: formatINRCompact(wc.total), project: formatINRCompact(cost.projectCost) })}</p>
      <p>{result.schemes.noneApplies ? t('ws.short.costNoScheme') : t('ws.short.costSchemes', { amount: formatINRCompact(result.schemes.bestAmountInr) })}</p>
    </>
  );

  return (
    <StepPage step={step} onNavigate={onNavigate} inShort={inShort} refreshing={isLoading}>
      <Figures
        items={[
          { key: 'capital', label: t('cost.kpiCapital'), value: formatINRCompact(cost.capitalCost), tone: 'primary' },
          { key: 'working', label: <Labelled term="workingCapital" label={t('cost.kpiWorking')} />, value: formatINRCompact(wc.total) },
          { key: 'net', label: <Labelled term="netInvestment" label={t('ws.youPay')} />, value: formatINRCompact(financials.netInvestment) },
          { key: 'bird', label: t('cost.kpiPerBird'), value: formatINR(cost.costPerBird) },
        ]}
      />

      <Block title={t('right.costBreakdown')} action={<span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(cost.capitalCost)}</span>}>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {breakdown.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums text-foreground">{formatINR(item.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(Math.max(0, item.value) / total) * 100}%` }} />
              </div>
            </div>
          ))}
          {result.diagnostics.unsourcedRates.length ? (
            <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground" data-testid="unsourced-rates">
              {t('right.unsourcedRates', { items: result.diagnostics.unsourcedRates.join(', ') })}
            </p>
          ) : null}
        </div>
      </Block>

      <Block title={t('cost.workingTitle')} description={contract ? t('cost.workingContract') : t('cost.workingHint')}>
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          {workingLines.map((item) => (
            <div key={item.label} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums text-foreground">{formatINR(item.value)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2 text-sm font-semibold">
            <span>{t('cost.projectTotal')}</span>
            <span className="tabular-nums">{formatINR(cost.projectCost)}</span>
          </div>
        </div>
      </Block>

      {result.nabard ? <NabardCard nabard={result.nabard} /> : null}

      <Block title={t('schemes.title')} description={t('schemes.hint')}>
        <SchemesCard schemes={result.schemes} />
      </Block>

      <MoreDetails>
        <p className="text-sm text-foreground">
          {t('right.costRange')}: {formatINR(cost.costRange.low)} - {formatINR(cost.costRange.high)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('cost.perSqft', { value: formatINR(cost.costPerSqft) })} · {formatNumber(result.areaSqft)} ft² · {formatNumber(result.area)} m²
        </p>
        <p className="text-xs text-muted-foreground">{t('right.notPriced')}</p>
      </MoreDetails>
    </StepPage>
  );
}

function EarningsPage({ step, onNavigate, config, result, financials, assumptions, onAssumptionsChange, isLoading }: ReadyProps) {
  const { t } = useI18n();
  const birdLabel = t(optionKey('bird', config.birdType));
  const profitable = financials.annualProfit > 0;
  const inShort = profitable ? (
    <>
      <p>
        {t('ws.short.earningsProfit', {
          bird: birdLabel,
          batches: formatNumber(financials.cyclesPerYear),
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
    <p>
      {financials.breakEvenPrice === null
        ? t('ws.short.earningsLoss')
        : t(financials.product === 'eggs' ? 'ws.short.earningsLossEgg' : 'ws.short.earningsLossKg', { price: formatNumber(financials.breakEvenPrice) })}
    </p>
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
        birdType={config.birdType}
        farmingModel={config.farmingModel}
        state={config.state}
        assumptions={assumptions}
        onAssumptionsChange={onAssumptionsChange}
        summary={financials}
        calendar={result.calendar}
      />
    </StepPage>
  );
}

function LoanPage({ step, onNavigate, config, financials, loanTerms, onLoanTermsChange, isLoading }: ReadyProps) {
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
      <LoanPanel summary={financials} birdType={config.birdType} terms={loanTerms} onTermsChange={onLoanTermsChange} />
    </StepPage>
  );
}

function RiskPage({ step, onNavigate, config, assumptions }: ReadyProps) {
  const { t } = useI18n();
  const [years, setYears] = useState(10);
  const [outbreakChancePct, setOutbreakChancePct] = useState(2);
  const risk = useRiskSimulation(config, assumptions, years, outbreakChancePct);
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
      <RiskPanel risk={risk} years={years} onYearsChange={setYears} outbreakChancePct={outbreakChancePct} onOutbreakChange={setOutbreakChancePct} />
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
  const { step, onNavigate, config, result, assumptions, loanTerms, ai, isLoading, onShare, onOpenSaved, ready, sitingTicks } = props;
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
          sitingTicks={sitingTicks}
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
