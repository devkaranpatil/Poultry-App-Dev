import { Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nContext';
import { formatINRCompact, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RiskSimulation } from '@/services/risk.service';
import { RISK_HORIZONS, paybackChance, verdictFor, type RiskState } from '@/hooks/useRiskSimulation';
import { Labelled } from '@/components/workspace/Explain';
import { MoreDetails } from '@/components/workspace/MoreDetails';

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** How often each outcome came up, as bars; red below zero. */
function OutcomeHistogram({ bins, label }: { bins: RiskSimulation['histogram']; label: string }) {
  const width = 280;
  const height = 90;
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const slot = width / Math.max(1, bins.length);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label={label}>
      {bins.map((bin, index) => {
        const barHeight = Math.max(1, (bin.count / max) * (height - 4));
        const middle = (bin.from + bin.to) / 2;
        return (
          <rect
            key={index}
            x={index * slot + 1}
            y={height - barHeight}
            width={Math.max(1, slot - 2)}
            height={barHeight}
            rx={2}
            className={middle >= 0 ? 'fill-primary/80' : 'fill-destructive/60'}
          >
            <title>{`${formatINRCompact(bin.from)} to ${formatINRCompact(bin.to)}: ${bin.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Each input's swing between its bad and good case, largest first. */
function DriverBars({ drivers, nameOf }: { drivers: RiskSimulation['drivers']; nameOf: (driver: string) => string }) {
  const widest = Math.max(1, ...drivers.map((driver) => driver.range));
  return (
    <ul className="space-y-2">
      {drivers.map((driver, index) => (
        <li key={driver.driver} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 text-sm">
          <span className={index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{nameOf(driver.driver)}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full rounded-full', index === 0 ? 'bg-primary' : 'bg-primary/50')}
              style={{ width: `${(driver.range / widest) * 100}%` }}
            />
          </span>
          <span className="text-right text-xs tabular-nums text-muted-foreground">±{formatINRCompact(driver.range / 2)}</span>
        </li>
      ))}
    </ul>
  );
}

const VERDICT_STYLE = {
  good: 'bg-primary text-primary-foreground',
  mixed: 'bg-warning/15 text-warning',
  poor: 'bg-destructive/10 text-destructive',
};

interface RiskPanelProps {
  risk: RiskState;
  years: number;
  onYearsChange: (years: number) => void;
}

/** The simulation, told as odds and plain outcomes; the statistics sit under "Show details". */
export function RiskPanel({ risk, years, onYearsChange }: RiskPanelProps) {
  const { t } = useI18n();
  const { result, status, stale } = risk;
  const simulation = result?.simulation;
  const sources = result?.sources;
  const priceNote = sources
    ? sources.price.basis === 'history'
      ? t('risk.sourcePriceHistory', { days: sources.price.days, from: sources.price.from ?? '', to: sources.price.to ?? '' })
      : sources.price.basis === 'markets'
        ? t('risk.sourcePriceMarkets', { markets: sources.price.markets, date: sources.price.to ?? '' })
        : t('risk.sourcePriceAssumption')
    : '';

  return (
    <section className="space-y-6" aria-label={t('risk.title')} data-testid="risk-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('risk.lookAhead')}</span>
        <div className="inline-flex rounded-lg bg-muted p-1" role="radiogroup" aria-label={t('risk.lookAhead')}>
          {RISK_HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === years}
              onClick={() => onYearsChange(option)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                option === years ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('risk.yearsOption', { years: option })}
            </button>
          ))}
        </div>
        {status === 'running' ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('risk.running')}
          </span>
        ) : null}
      </div>

      {status === 'error' ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t('risk.error')}
          <Button size="sm" variant="outline" onClick={risk.rerun}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t('risk.rerun')}
          </Button>
        </div>
      ) : null}

      {!simulation && status !== 'error' ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      ) : null}

      {simulation && sources ? (
        <div className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}>
          <ChanceCard chance={paybackChance(simulation)} years={simulation.years} />

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">
              <Labelled term="worth" label={t('risk.outcomesTitle', { years: simulation.years })} />
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['p10', 'risk.outcomeBad', 'risk.outcomeBadHint'],
                  ['p50', 'risk.outcomeTypical', 'risk.outcomeTypicalHint'],
                  ['p90', 'risk.outcomeGood', 'risk.outcomeGoodHint'],
                ] as const
              ).map(([key, label, hint]) => {
                const value = simulation.npv[key];
                return (
                  <div key={key} className={cn('rounded-xl border p-4', key === 'p50' ? 'border-primary/30 bg-accent/40' : 'border-border bg-card')}>
                    <p className="text-sm font-medium text-foreground">{t(label)}</p>
                    <p className={cn('kpi-value mt-1 text-xl', value !== null && value < 0 ? 'text-destructive' : 'text-foreground')}>
                      {value === null ? '—' : `${value < 0 ? '−' : '+'}${formatINRCompact(Math.abs(value))}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t(hint)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {simulation.drivers.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">{t('risk.driversTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t(`risk.driverTip.${simulation.drivers[0].driver}`)}</p>
              <DriverBars drivers={simulation.drivers} nameOf={(driver) => t(`risk.driver.${driver}`)} />
            </div>
          ) : null}

          <MoreDetails>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('risk.lossChance', { years: simulation.years })}</dt>
                <dd className="font-semibold text-foreground">{percent(simulation.probabilities.loss)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('risk.paybackMedian')}</dt>
                <dd className="font-semibold text-foreground">
                  {simulation.paybackYears.p50 === null
                    ? t('risk.paybackNotWithin', { years: simulation.years })
                    : t('returns.paybackYears', { years: simulation.paybackYears.p50 })}
                </dd>
              </div>
              {Object.entries(simulation.probabilities.paybackWithin).map(([limit, share]) => (
                <div key={limit}>
                  <dt className="text-xs text-muted-foreground">{t('risk.paybackWithin', { years: limit })}</dt>
                  <dd className="font-semibold text-foreground">{percent(share)}</dd>
                </div>
              ))}
            </dl>
            {simulation.histogram.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-foreground">{t('risk.distribution')}</p>
                <OutcomeHistogram bins={simulation.histogram} label={t('risk.distribution')} />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t('risk.npv')} (P10 / P50 / P90). {t('risk.npvHint', { rate: simulation.assumptions.discountRatePct })}
            </p>
            <ul className="space-y-1 text-xs leading-snug text-muted-foreground">
              <li className="flex gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {sources.yield.published
                  ? t('risk.sourceYieldPublished', { range: sources.yield.range })
                  : t('risk.sourceYieldPlanner', { range: sources.yield.range })}
              </li>
              <li className="flex gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {priceNote}
              </li>
              <li className="flex gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {t('risk.sourceCost', { low: formatINR(sources.buildCost.low), high: formatINR(sources.buildCost.high) })}
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">{t('risk.disclaimer', { trials: simulation.trials })}</p>
          </MoreDetails>
        </div>
      ) : null}
    </section>
  );
}

/** The headline: one big percentage, a verdict word and a two-colour bar anyone can read. */
function ChanceCard({ chance, years }: { chance: number; years: number }) {
  const { t } = useI18n();
  const verdict = verdictFor(chance);
  const share = Math.round(chance * 100);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="risk-chance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          <Labelled term="riskSim" label={t('risk.chanceTitle', { years })} />
        </p>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', VERDICT_STYLE[verdict])}>{t(`risk.verdict.${verdict}`)}</span>
      </div>
      <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-foreground">{share}%</p>
      <div
        className="mt-3 flex h-3 overflow-hidden rounded-full bg-destructive/25"
        role="img"
        aria-label={t('risk.chanceBar', { chance: `${share}%`, rest: `${100 - share}%` })}
      >
        <div className="h-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          {t('risk.paysBack')} {share}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive/50" aria-hidden="true" />
          {t('risk.doesNot')} {100 - share}%
        </span>
      </div>
    </div>
  );
}
