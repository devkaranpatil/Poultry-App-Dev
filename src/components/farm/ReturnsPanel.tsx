import { Info, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/I18nContext';
import { Explain, Labelled, type TermId } from '@/components/workspace/Explain';
import { MoreDetails } from '@/components/workspace/MoreDetails';
import {
  PROJECTION_YEARS,
  defaultPoultryAssumptions,
  type BatchDates,
  type PoultryAssumptions,
  type PoultryReturns,
} from '@/lib/poultryFinance';
import { assumptionSource } from '@/lib/poultrySources';
import { formatINRCompact, formatNumber } from '@/lib/format';
import type { BirdType, FarmingModel } from '@/types/farm';

interface ReturnsPanelProps {
  birdType: BirdType;
  farmingModel: FarmingModel;
  /** The project's state: its own sale and egg prices apply. */
  state?: string;
  assumptions: PoultryAssumptions;
  onAssumptionsChange: (next: PoultryAssumptions) => void;
  summary: PoultryReturns;
  calendar: BatchDates[];
}

interface FieldSpec {
  field: string;
  step: number;
  max?: number;
  term?: TermId;
}

/** The assumptions a farmer is most likely to know better than the planner, by the kind of farm. */
const FIELDS: Record<'meat' | 'contract' | 'eggs', FieldSpec[]> = {
  meat: [
    { field: 'saleInrPerKg', step: 1, term: 'breakEven' },
    { field: 'chickInr', step: 1 },
    { field: 'feedInrPerKg', step: 0.5 },
    { field: 'vaccineInrPerBird', step: 1 },
    { field: 'mortalityPct', step: 0.5, max: 100, term: 'mortality' },
    { field: 'saleWeightKg', step: 0.05 },
    { field: 'fcr', step: 0.05, term: 'fcr' },
    { field: 'rearingDays', step: 1, term: 'batch' },
    { field: 'subsidyInr', step: 10000, term: 'subsidy' },
  ],
  contract: [
    { field: 'growingChargeInrPerKg', step: 0.25, term: 'growingCharge' },
    { field: 'mortalityPct', step: 0.5, max: 100, term: 'mortality' },
    { field: 'saleWeightKg', step: 0.05 },
    { field: 'fcr', step: 0.05, term: 'fcr' },
    { field: 'labourInrPerBird', step: 0.5 },
    { field: 'otherCostInrPerBird', step: 0.5 },
    { field: 'rearingDays', step: 1, term: 'batch' },
    { field: 'subsidyInr', step: 10000, term: 'subsidy' },
  ],
  eggs: [
    { field: 'eggInr', step: 0.1, term: 'breakEven' },
    { field: 'chickInr', step: 1 },
    { field: 'feedInrPerKg', step: 0.5 },
    { field: 'vaccineInrPerBird', step: 1 },
    { field: 'layingMortalityPct', step: 0.5, max: 100, term: 'mortality' },
    { field: 'eggsPerHen', step: 5 },
    { field: 'layingFeedKgPerBird', step: 0.5 },
    { field: 'culledBirdInr', step: 5 },
    { field: 'subsidyInr', step: 10000, term: 'subsidy' },
  ],
};

function AssumptionField({
  id,
  label,
  term,
  value,
  step,
  max,
  onChange,
}: {
  id: string;
  label: string;
  term?: TermId;
  value: number;
  step: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {term ? <Explain term={term} label={label} /> : null}
      </div>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const next = parseFloat(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className="h-9"
      />
    </div>
  );
}

/** Cumulative cash position per year as a zero-baseline bar chart. */
function CashflowChart({ values, yearLabel }: { values: number[]; yearLabel: (year: number) => string }) {
  const width = 280;
  const height = 120;
  const padTop = 8;
  const padBottom = 18;
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const hasPositive = values.some((value) => value > 0);
  const hasNegative = values.some((value) => value < 0);
  // Put the zero line where it leaves room for whichever signs are present.
  const plotHeight = height - padTop - padBottom;
  const zeroY = padTop + (hasPositive && hasNegative ? plotHeight / 2 : hasNegative ? 0 : plotHeight);
  const scale = (hasPositive && hasNegative ? plotHeight / 2 : plotHeight) / maxAbs;
  const slot = width / values.length;
  const barWidth = Math.min(28, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" role="img" aria-label="Cumulative cash position by year">
      <line x1={0} x2={width} y1={zeroY} y2={zeroY} className="stroke-border" strokeWidth={1} />
      {values.map((value, year) => {
        const barHeight = Math.max(1, Math.abs(value) * scale);
        const x = slot * year + (slot - barWidth) / 2;
        const y = value >= 0 ? zeroY - barHeight : zeroY;
        return (
          <g key={year}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} className={value >= 0 ? 'fill-primary' : 'fill-destructive/70'}>
              <title>{`${yearLabel(year)}: ${formatINRCompact(value)}`}</title>
            </rect>
            <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {yearLabel(year)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The year's batches on one line: growing time, then cleaning, from the first placement. */
function BatchCalendar({ calendar, layer }: { calendar: BatchDates[]; layer: boolean }) {
  const { t } = useI18n();
  const span = Math.max(365, ...calendar.map((batch) => batch.readyDay));
  return (
    <div className="space-y-2" data-testid="batch-calendar">
      <div className="relative h-7 overflow-hidden rounded-md bg-muted" role="img" aria-label={t('returns.calendarLabel', { batches: calendar.length })}>
        {calendar.map((batch) => (
          <div key={batch.batch} className="absolute inset-y-0 flex" style={{ left: `${(batch.placeDay / span) * 100}%`, width: `${((batch.readyDay - batch.placeDay) / span) * 100}%` }}>
            {layer && batch.pointOfLayDay !== null ? (
              <>
                <div className="h-full bg-primary/40" style={{ width: `${((batch.pointOfLayDay - batch.placeDay) / (batch.readyDay - batch.placeDay)) * 100}%` }} />
                <div className="h-full flex-1 bg-primary" />
              </>
            ) : (
              <div className="h-full flex-1 bg-primary" />
            )}
            <div className="h-full bg-straw/80" style={{ width: `${((batch.readyDay - batch.saleDay) / (batch.readyDay - batch.placeDay)) * 100}%` }} />
          </div>
        ))}
        <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/40" style={{ left: `${(365 / span) * 100}%` }} aria-hidden />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {layer ? (
          <li className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-primary/40" /> {t('returns.calendarGrowing')}
          </li>
        ) : null}
        <li className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-primary" /> {t(layer ? 'returns.calendarLaying' : 'returns.calendarRearing')}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-straw/80" /> {t('returns.calendarCleaning')}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="h-2 w-0 border-l-2 border-dashed border-foreground/40" /> {t('returns.calendarYearEnd')}
        </li>
      </ul>
      <ol className="grid gap-1 text-xs text-foreground sm:grid-cols-2">
        {calendar.map((batch) => (
          <li key={batch.batch} className="tabular-nums">
            {t(layer ? 'returns.calendarFlockRow' : 'returns.calendarBatchRow', {
              n: batch.batch,
              place: batch.placeDay,
              lay: batch.pointOfLayDay ?? 0,
              sale: batch.saleDay,
              ready: batch.readyDay,
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReturnsPanel({ birdType, farmingModel, state, assumptions, onAssumptionsChange, summary, calendar }: ReturnsPanelProps) {
  const { t } = useI18n();
  const layer = summary.product === 'eggs';
  const kind = layer ? 'eggs' : farmingModel === 'contract' ? 'contract' : 'meat';
  const values = assumptions as unknown as Record<string, number>;
  const update = (field: string, value: number) => onAssumptionsChange({ ...assumptions, [field]: value } as PoultryAssumptions);
  const unverified = FIELDS[kind]
    .map(({ field }) => ({ field, source: assumptionSource(birdType, farmingModel, field, state) }))
    .filter(({ source }) => source && !source.verified);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <h3 className="text-base font-semibold text-foreground">{t('returns.production')}</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              <Labelled term="batch" label={t(layer ? 'returns.flocksYear' : 'returns.batchesYear')} />
            </dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatNumber(summary.cyclesPerYear)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t(layer ? 'returns.eggsYear' : 'returns.kgYear')}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatNumber(layer ? summary.eggsPerYear : summary.kgSoldPerYear)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('returns.feedYear')}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatNumber(summary.feedKgPerYear)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              <Labelled term="breakEven" label={t('returns.breakEven')} />
            </dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {summary.breakEvenPrice === null
                ? '—'
                : t(layer ? 'returns.perEgg' : farmingModel === 'contract' ? 'returns.perKgCharge' : 'returns.perKg', { price: formatNumber(summary.breakEvenPrice) })}
            </dd>
          </div>
        </dl>
        <BatchCalendar calendar={calendar} layer={layer} />
      </section>

      <section className="space-y-2 rounded-card border border-border bg-card p-4">
        <h3 className="text-base font-semibold text-foreground">{t('returns.cashflow')}</h3>
        <p className="text-sm text-muted-foreground">{t('returns.cashflowHint')}</p>
        <CashflowChart values={summary.cumulativeCashflow} yearLabel={(year) => t('returns.year', { year })} />
      </section>

      <section className="space-y-4 rounded-card border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('returns.assumptions')}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{t(`returns.assumptionsHint.${kind}`)}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={() => onAssumptionsChange({ ...defaultPoultryAssumptions(birdType, farmingModel, state), subsidyInr: assumptions.subsidyInr })}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('returns.reset')}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS[kind].map(({ field, step, max, term }) => (
            <AssumptionField
              key={field}
              id={`returns-${field}`}
              label={t(`assumption.${field}`)}
              term={term}
              value={values[field]}
              step={step}
              max={max}
              onChange={(value) => update(field, value)}
            />
          ))}
        </div>
        {unverified.length > 0 ? (
          <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground" data-testid="unverified-assumptions">
            {t('returns.verifyThese', { items: unverified.map(({ field }) => t(`assumption.${field}`)).join(', ') })}
          </p>
        ) : null}
      </section>

      <MoreDetails>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">
              <Labelled term="roi" label={t('returns.roi', { years: PROJECTION_YEARS })} />
            </dt>
            <dd className={`font-semibold ${summary.roi !== null && summary.roi >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              {summary.roi === null ? '—' : `${formatNumber(summary.roi * 100)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('returns.marginPerBird')}</dt>
            <dd className="font-semibold text-foreground">{formatINRCompact(summary.marginPerBird)}</dd>
          </div>
        </dl>
        <ul className="space-y-1 text-xs leading-snug text-muted-foreground">
          {FIELDS[kind].map(({ field }) => {
            const source = assumptionSource(birdType, farmingModel, field, state);
            if (!source) return null;
            return (
              <li key={field} className="flex gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {t(`assumption.${field}`)}: {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {source.document}
                    </a>
                  ) : (
                    source.document
                  )}
                  {source.verified ? '' : ` (${t('returns.assumption')})`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t('returns.disclaimer')}</p>
      </MoreDetails>
    </div>
  );
}
