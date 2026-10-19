import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, Info, Landmark, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/I18nContext';
import { Explain, Labelled, type TermId } from '@/components/workspace/Explain';
import { MoreDetails } from '@/components/workspace/MoreDetails';
import { cn } from '@/lib/utils';
import type { FinancialSummary } from '@/lib/finance';
import { formatINRCompact, formatNumber } from '@/lib/format';
import {
  DEFAULT_LOAN_TERMS,
  LOAN_SOURCES,
  MAX_BANK_LOAN_SHARE_PCT,
  computeLoanPlan,
  type LoanTerms,
  type RepaymentFrequency,
} from '@/lib/loan';

interface LoanPanelProps {
  summary: FinancialSummary;
  terms: LoanTerms;
  onTermsChange: (next: LoanTerms) => void;
}

const FREQUENCIES: RepaymentFrequency[] = ['monthly', 'quarterly', 'half-yearly'];

function TermField({
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
  max: number;
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

/** Bank term loan: margin, instalments, the back-ended subsidy and the yearly debt cover. */
export function LoanPanel({ summary, terms, onTermsChange }: LoanPanelProps) {
  const { t } = useI18n();
  const plan = useMemo(
    () => computeLoanPlan(summary.capitalCost, summary.subsidyAmount, summary, terms),
    [summary, terms]
  );
  const update = (patch: Partial<LoanTerms>) => onTermsChange({ ...terms, ...patch });
  const per = t(`loan.per.${plan.terms.frequency}`);
  const dscrLow = plan.minDscr !== null && plan.minDscr < 1;

  const figures: Array<{ key: string; label: ReactNode; value: string; tone?: string }> = [
    { key: 'loan', label: t('loan.amount'), value: formatINRCompact(plan.loanAmount) },
    { key: 'margin', label: <Labelled term="margin" label={t('loan.margin')} />, value: formatINRCompact(plan.margin) },
    { key: 'emi', label: <Labelled term="emi" label={t('loan.installment')} />, value: `${formatINRCompact(plan.installment)} ${per}` },
    {
      key: 'dscr',
      label: <Labelled term="dscr" label={t('loan.minDscr')} />,
      value: plan.minDscr === null ? '—' : formatNumber(plan.minDscr),
      tone: dscrLow ? 'text-destructive' : 'text-foreground',
    },
  ];

  return (
    <section className="space-y-5" aria-label={t('loan.title')} data-testid="loan-panel">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Landmark className="h-4 w-4 text-primary" />
          {t('loan.title')}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('loan.hint')}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.key} className="rounded-xl border border-border bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{figure.label}</dt>
            <dd className={cn('mt-1 text-base font-semibold tabular-nums', figure.tone ?? 'text-foreground')}>{figure.value}</dd>
          </div>
        ))}
      </dl>

      <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground">
        {plan.subsidyInReserve > 0 && plan.closedByReserveAtMonth !== null
          ? t('loan.reserveCloses', { subsidy: formatINRCompact(plan.subsidyInReserve), month: plan.closedByReserveAtMonth })
          : plan.subsidyInReserve > 0
            ? t('loan.reserveReleased', { subsidy: formatINRCompact(plan.subsidyInReserve) })
            : t('loan.reserveNone')}
      </p>

      {dscrLow ? (
        <p className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-snug text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('loan.dscrLow')}
        </p>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">{t('ws.loanTerms')}</h4>
          <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={() => onTermsChange(DEFAULT_LOAN_TERMS)}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('returns.reset')}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TermField id="loan-share" label={t('loan.share')} value={terms.loanSharePct} step={5} max={100} onChange={(loanSharePct) => update({ loanSharePct })} />
          <TermField id="loan-interest" label={t('loan.interest')} value={terms.interestPct} step={0.25} max={30} onChange={(interestPct) => update({ interestPct })} />
          <TermField id="loan-tenure" label={t('loan.tenure')} value={terms.tenureYears} step={1} max={15} onChange={(tenureYears) => update({ tenureYears })} />
          <TermField
            id="loan-moratorium"
            label={t('loan.moratorium')}
            term="moratorium"
            value={terms.moratoriumMonths}
            step={3}
            max={36}
            onChange={(moratoriumMonths) => update({ moratoriumMonths })}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground" id="loan-frequency-label">
            {t('loan.frequency')}
          </span>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-labelledby="loan-frequency-label">
            {FREQUENCIES.map((frequency) => (
              <Button
                key={frequency}
                type="button"
                size="sm"
                role="radio"
                aria-checked={terms.frequency === frequency}
                variant={terms.frequency === frequency ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => update({ frequency })}
              >
                {t(`loan.freq.${frequency}`)}
              </Button>
            ))}
          </div>
        </div>
        {terms.loanSharePct > MAX_BANK_LOAN_SHARE_PCT ? (
          <p className="flex gap-1.5 text-xs leading-snug text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {t('loan.shareAboveBank', { max: MAX_BANK_LOAN_SHARE_PCT })}
          </p>
        ) : null}
      </div>

      <MoreDetails>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {plan.moratoriumPeriods > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t('loan.moratoriumPayment')}</dt>
              <dd className="font-semibold text-foreground">{`${formatINRCompact(plan.moratoriumPayment)} ${per}`}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">{t('loan.totalInterest')}</dt>
            <dd className="font-semibold text-foreground">{formatINRCompact(plan.totalInterest)}</dd>
          </div>
        </dl>

        {plan.years.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="loan-years">
              <caption className="sr-only">{t('loan.tableCaption')}</caption>
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="py-1.5 text-left font-medium">{t('loan.table.year')}</th>
                  <th scope="col" className="py-1.5 text-right font-medium">{t('loan.table.farmCash')}</th>
                  <th scope="col" className="py-1.5 text-right font-medium">{t('loan.table.payments')}</th>
                  <th scope="col" className="py-1.5 text-right font-medium">{t('loan.table.net')}</th>
                  <th scope="col" className="py-1.5 text-right font-medium">{t('loan.table.dscr')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.years.map((row) => (
                  <tr key={row.year} className="border-b border-border/50 last:border-0">
                    <th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">{t('returns.year', { year: row.year })}</th>
                    <td className="py-1.5 text-right">{formatINRCompact(row.farmCash)}</td>
                    <td className="py-1.5 text-right">{formatINRCompact(row.debtService)}</td>
                    <td className={`py-1.5 text-right ${row.netCash < 0 ? 'text-destructive' : ''}`}>{formatINRCompact(row.netCash)}</td>
                    <td className={`py-1.5 text-right ${row.dscr !== null && row.dscr < 1 ? 'text-destructive' : ''}`}>
                      {row.dscr === null ? '—' : formatNumber(row.dscr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <ul className="space-y-1 text-xs leading-snug text-muted-foreground">
          <li className="flex gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t('loan.dscrHint')}
          </li>
          {LOAN_SOURCES.map((source) => (
            <li key={source.text} className="flex gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {source.text}
                {source.verified ? '' : ` (${t('returns.assumption')})`}
                {source.url ? (
                  <>
                    {' '}
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {t('loan.link')}
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </MoreDetails>
    </section>
  );
}
