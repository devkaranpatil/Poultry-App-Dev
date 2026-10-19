import { RotateCcw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/I18nContext';
import { Explain, Labelled, type TermId } from '@/components/workspace/Explain';
import { MoreDetails } from '@/components/workspace/MoreDetails';
import {
  CROP_ECONOMICS,
  PROJECTION_YEARS,
  defaultFinanceAssumptions,
  type FinanceAssumptions,
  type FinancialSummary,
} from '@/lib/finance';
import { formatINRCompact, formatNumber } from '@/lib/format';
import type { CropType } from '@/types/greenhouse';

/** The latest mandi price for the crop, already in ₹ per kg (from the calculation's reference data). */
export interface LatestMandiPrice {
  perUnit: number;
  date: string;
  scope: 'state' | 'india';
}

interface ReturnsPanelProps {
  crop: CropType;
  cropLabel: string;
  assumptions: FinanceAssumptions;
  onAssumptionsChange: (next: FinanceAssumptions) => void;
  summary: FinancialSummary;
  marketPrice?: LatestMandiPrice | null;
}

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
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              className={value >= 0 ? 'fill-primary' : 'fill-destructive/70'}
            >
              <title>{`${yearLabel(year)}: ${formatINRCompact(value)}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {yearLabel(year)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReturnsPanel({ crop, cropLabel, assumptions, onAssumptionsChange, summary, marketPrice }: ReturnsPanelProps) {
  const { t } = useI18n();
  const economics = CROP_ECONOMICS[crop];
  const unit = t(`units.${economics.unit}`);
  const sourceLine = (label: string, source: { text: string; verified: boolean }) =>
    `${label}: ${source.text}${source.verified ? '' : ` (${t('returns.assumption')})`}`;
  const update = (patch: Partial<FinanceAssumptions>) => onAssumptionsChange({ ...assumptions, ...patch });

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h3 className="text-base font-semibold text-foreground">{t('returns.cashflow')}</h3>
        <p className="text-sm text-muted-foreground">{t('returns.cashflowHint')}</p>
        <CashflowChart values={summary.cumulativeCashflow} yearLabel={(year) => t('returns.year', { year })} />
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('returns.assumptions')}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('returns.assumptionsHint', { crop: cropLabel })}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={() => onAssumptionsChange(defaultFinanceAssumptions(crop))}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('returns.reset')}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AssumptionField
            id="returns-yield"
            label={t('returns.yield', { unit })}
            term="yield"
            value={assumptions.yieldPerSqm}
            step={0.5}
            onChange={(yieldPerSqm) => update({ yieldPerSqm })}
          />
          <AssumptionField
            id="returns-price"
            label={t('returns.price', { unit })}
            term="mandi"
            value={assumptions.pricePerUnit}
            step={1}
            onChange={(pricePerUnit) => update({ pricePerUnit })}
          />
          <AssumptionField
            id="returns-opex"
            label={t('returns.opex')}
            term="opex"
            value={assumptions.operatingCostPct}
            step={5}
            max={100}
            onChange={(operatingCostPct) => update({ operatingCostPct })}
          />
          <AssumptionField
            id="returns-subsidy"
            label={t('returns.subsidy')}
            term="subsidy"
            value={assumptions.subsidyPct}
            step={5}
            max={100}
            onChange={(subsidyPct) => update({ subsidyPct })}
          />
        </div>
        {marketPrice && Math.abs(marketPrice.perUnit - assumptions.pricePerUnit) >= 0.5 ? (
          <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-auto min-h-8 w-full whitespace-normal py-1.5 text-xs"
              onClick={() => update({ pricePerUnit: Math.round(marketPrice.perUnit * 100) / 100 })}
            >
              {t('returns.useMandiPrice', {
                price: formatNumber(marketPrice.perUnit),
                unit,
                scope: t(marketPrice.scope === 'state' ? 'returns.scopeState' : 'returns.scopeIndia'),
                date: marketPrice.date,
              })}
            </Button>
            <p className="text-xs leading-snug text-muted-foreground">{t('returns.mandiNote')}</p>
          </div>
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
            <dt className="text-xs text-muted-foreground">
              <Labelled term="subsidy" label={t('returns.subsidyAmount')} />
            </dt>
            <dd className="font-semibold text-foreground">{formatINRCompact(summary.subsidyAmount)}</dd>
          </div>
        </dl>
        <ul className="space-y-1 text-xs leading-snug text-muted-foreground">
          <li className="flex gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {sourceLine(t('returns.yieldSource'), economics.yieldSource)}
          </li>
          <li className="flex gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {sourceLine(t('returns.priceSource'), economics.priceSource)}
          </li>
          <li className="flex gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t('returns.subsidyHint')}
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">{t('returns.disclaimer')}</p>
      </MoreDetails>
    </div>
  );
}
